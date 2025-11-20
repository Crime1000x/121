'use client';

import { useEffect, useState } from 'react';
import { getCachedMarkets, setCachedMarkets, Cache } from '@/lib/utils/cache';
import type { ArenaMarket, H2HGame } from '@/types';
import type { TeamStats } from '@/lib/api/team-stats';
import { getTeamLogoUrl } from '@/lib/utils/espn-mapping';
import Link from 'next/link';

export default function HomePage() {
  const [markets, setMarkets] = useState<ArenaMarket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [teamStatsMap, setTeamStatsMap] = useState<Map<string, TeamStats>>(new Map());
  const [preloading, setPreloading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('Initializing...');

  // 新增：存储来自 Redis 的深度预测结果 { marketId: winRateA }
  const [redisPredictions, setRedisPredictions] = useState<Record<string, number>>({});

  useEffect(() => {
    Cache.checkVersion();
    loadMarkets();
  }, []);

  async function loadMarkets() {
    try {
      setLoadingProgress(10);
      setLoadingMessage('检查缓存中...');

      const cached = getCachedMarkets();
      if (cached && cached.length > 0) {
        console.log('✅ Using cached markets data');
        const sorted = sortMarkets(cached);
        // 去重
        const unique = deduplicateMarkets(sorted);
        
        setMarkets(unique);
        setFromCache(true);
        setLoadingProgress(30);
        
        // 并行加载：球队基础数据 + Redis 深度预测数据
        setLoadingMessage('正在同步深度分析数据...');
        await Promise.all([
            prefetchTeamStatsBlocking(unique),
            fetchRedisPredictions(unique)
        ]);

        setLoadingProgress(100);
        setLoadingMessage('加载完成！');
        setPreloading(false);
        return;
      }

      setLoadingProgress(20);
      setLoadingMessage('从 Polymarket 获取 NBA 市场数据...');
      // 获取更多数据以应对去重损耗
      const response = await fetch('/api/polymarket?limit=60');

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const sorted = sortMarkets(data);
      const unique = deduplicateMarkets(sorted);

      setMarkets(unique);
      setFromCache(false);
      setLoadingProgress(40);

      if (data && data.length > 0) {
        setCachedMarkets(data);
        setLoadingMessage('正在同步深度分析数据...');
        // 并行加载
        await Promise.all([
            prefetchTeamStatsBlocking(unique),
            fetchRedisPredictions(unique)
        ]);
        
        setLoadingProgress(100);
        setLoadingMessage('加载完成！');
      }

      setPreloading(false);
    } catch (err) {
      setError('加载市场数据失败');
      console.error(err);
      setPreloading(false);
    }
  }

  // --- 核心修改：从 Redis 获取数据 ---
  async function fetchRedisPredictions(markets: ArenaMarket[]) {
      try {
          const marketIds = markets.map(m => m.marketId);
          
          // 调用后端 API 批量读取 Redis
          // 注意：你需要确保后端 app/api/predictions/batch/route.ts 已创建
          const response = await fetch('/api/predictions/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ marketIds })
          });

          if (response.ok) {
              const data = await response.json();
              setRedisPredictions(data); // data 格式应为 { "market_id": 0.65, ... }
              console.log('✅ 成功加载 Redis 深度预测数据');
          } else {
              console.warn('⚠️ Redis 数据未就绪，将使用前端模型兜底');
          }
      } catch (e) {
          console.warn('⚠️ 获取 Redis 数据失败', e);
      }
  }

  function deduplicateMarkets(markets: ArenaMarket[]): ArenaMarket[] {
    const seen = new Set<string>();
    return markets.filter(market => {
        if (!market.teamA?.name || !market.teamB?.name || !market.startTime) return false;
        const dateStr = market.startTime.split('T')[0];
        const teams = [market.teamA.name, market.teamB.name].sort().join('-');
        const uniqueKey = `${dateStr}-${teams}`;

        if (seen.has(uniqueKey)) return false; 
        seen.add(uniqueKey);
        return true; 
    });
  }

  function sortMarkets(markets: ArenaMarket[]) {
    return [...markets].sort((a, b) => 
      new Date(a.startTime || 0).getTime() - new Date(b.startTime || 0).getTime()
    );
  }

  function getGroupedMarkets() {
    const groups: Record<string, ArenaMarket[]> = {};
    markets.forEach(market => {
      const date = new Date(market.startTime || Date.now());
      const dateKey = date.toLocaleDateString('zh-CN', { 
        month: 'long', 
        day: 'numeric', 
        weekday: 'long' 
      });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(market);
    });
    return groups;
  }

  async function prefetchTeamStatsBlocking(markets: ArenaMarket[]) {
    const teamNames = new Set<string>();
    for (const market of markets) {
      if (market.teamA?.name) teamNames.add(market.teamA.name);
      if (market.teamB?.name) teamNames.add(market.teamB.name);
    }

    const teams = Array.from(teamNames);
    const totalTeams = teams.length;
    const { getOrFetchTeamStats } = await import('@/lib/api/team-stats');
    const statsMap = new Map<string, TeamStats>();

    let completed = 0;
    const BATCH_SIZE = 3;

    for (let i = 0; i < teams.length; i += BATCH_SIZE) {
      const batch = teams.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (teamName) => {
        try {
          const stats = await getOrFetchTeamStats(teamName);
          if (stats) {
            statsMap.set(teamName, stats);
          }
          completed++;
          const progress = 40 + Math.floor((completed / totalTeams) * 60);
          setLoadingProgress(progress);
          if (completed < totalTeams) {
             setLoadingMessage(`加载球队数据中... (${completed}/${totalTeams})`);
          }
        } catch (error) {
          completed++;
        }
      });
      await Promise.allSettled(batchPromises);
    }
    setTeamStatsMap(statsMap);
  }

  const calculateRestDays = (games: H2HGame[], marketStartTime: string): number => {
    if (!games || games.length === 0) return 3;
    const targetTime = new Date(marketStartTime).getTime();
    const pastGames = games
        .filter(g => new Date(g.date).getTime() < targetTime)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (pastGames.length === 0) return 3;
    
    const lastGameTime = new Date(pastGames[0].date).getTime();
    const diffTime = Math.abs(targetTime - lastGameTime);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // 兜底算法：前端轻量级计算（当 Redis 无数据时使用）
  const calculateSimpleWinProbability = (
      statsA: TeamStats, 
      statsB: TeamStats, 
      marketStartTime: string
  ): number => {
      const wrDiff = (statsA.winRate - statsB.winRate) * 100;
      const winsA = statsA.recentForm.split('').filter(c => c === 'W').length;
      const winsB = statsB.recentForm.split('').filter(c => c === 'W').length;
      const formDiff = (winsA - winsB) * 5;

      const restA = calculateRestDays(statsA.recentGames, marketStartTime);
      const restB = calculateRestDays(statsB.recentGames, marketStartTime);
      const rA = Math.min(3, restA);
      const rB = Math.min(3, restB);
      const restDiff = (rA - rB) * 12;

      const score = (wrDiff * 0.45) + (formDiff * 0.25) + (restDiff * 0.30);
      const k = 42; 
      return 1 / (1 + Math.exp(-score / k));
  };

  if (preloading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="max-w-md w-full px-8">
          <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 p-8 text-center">
            <h2 className="text-3xl font-extrabold text-white mb-2 lowercase tracking-tight">POLYNBA</h2>
            <p className="text-slate-400 mb-8 text-sm">正在初始化分析引擎...</p>
            <div className="mb-4">
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
            </div>
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-slate-500">{loadingMessage}</span>
              <span className="text-blue-400">{loadingProgress}%</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-xl text-red-500 font-bold bg-red-500/10 px-6 py-4 rounded-xl border border-red-500/20">
          Error: {error}
        </div>
      </div>
    );
  }

  const groupedMarkets = getGroupedMarkets();
  const sortedDates = Object.keys(groupedMarkets); 

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30 pb-20">
      {/* 顶部导航栏 */}
      <div className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" aria-label="Home" className="group">
              <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-3">
                <span className="lowercase">POLYNBA</span>
                <span className="text-xs font-medium text-slate-400 px-2 py-1 bg-slate-800 rounded-md border border-slate-700 hidden sm:inline-block">
                  Beta 2.2
                </span>
              </h1>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            {fromCache && (
              <div className="text-xs text-green-400 bg-green-400/10 px-3 py-1 rounded-full border border-green-400/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                Live Cache
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {sortedDates.map((dateKey) => (
          <div key={dateKey} className="mb-12">
            {/* Sticky 日期标题 */}
            <div className="sticky top-20 z-30 mb-6 flex items-center">
               <div className="px-4 py-1.5 bg-slate-800/90 backdrop-blur border border-slate-700 rounded-full text-sm font-bold text-slate-200 shadow-lg">
                 {dateKey}
               </div>
               <div className="h-px bg-slate-800 flex-1 ml-4"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {groupedMarkets[dateKey].map(market => {
                const teamAStats = market.teamA?.name ? teamStatsMap.get(market.teamA.name) : null;
                const teamBStats = market.teamB?.name ? teamStatsMap.get(market.teamB.name) : null;

                let aiWinRateA = 0.5;
                let isDeepAnalysis = false;

                // 1. 优先使用 Redis 中的深度分析胜率
                if (redisPredictions[market.marketId] !== undefined) {
                    aiWinRateA = redisPredictions[market.marketId];
                    isDeepAnalysis = true;
                } 
                // 2. 降级：使用前端轻量模型
                else if (teamAStats && teamBStats && market.startTime) {
                    aiWinRateA = calculateSimpleWinProbability(teamAStats, teamBStats, market.startTime);
                }
                
                // 格式化时间
                const timeString = new Date(market.startTime || '').toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });

                return (
                  <div
                    key={market.marketId}
                    className="bg-slate-900 rounded-2xl border border-slate-800 hover:border-slate-700 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col relative group"
                  >
                      {/* 比赛时间角标 */}
                      <div className="absolute top-4 right-4 z-10">
                          <span className="px-2 py-1 bg-slate-950/90 backdrop-blur text-xs font-mono text-slate-400 rounded border border-slate-800 shadow-sm">
                              {timeString}
                          </span>
                      </div>

                      <div className="p-5 flex-1 flex flex-col">
                        {/* 联赛标签 */}
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-5">{market.sport}</div>

                        {/* 球队信息区域 */}
                        <div className="space-y-5 mb-6">
                            {/* Team A */}
                            <div className="flex justify-between items-start">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-3 mb-2">
                                        {/* 球队 Logo */}
                                        <img 
                                            src={getTeamLogoUrl(market.teamA?.name || '')} 
                                            alt={market.teamA?.name} 
                                            className="w-8 h-8 object-contain drop-shadow-md"
                                            onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.5'; }}
                                        />
                                        <div className="font-bold text-lg text-white tracking-tight leading-none">{market.teamA?.name}</div>
                                    </div>
                                    {teamAStats && (
                                        <div className="flex gap-1 ml-1">
                                            {/* 战绩 W/L，L为红色 */}
                                            {teamAStats.recentForm.split('').slice(0, 5).map((r, i) => (
                                                <span key={i} className={`w-5 h-5 flex items-center justify-center text-[10px] font-black rounded-sm ${
                                                    r === 'W' 
                                                    ? 'bg-green-500 text-slate-900' 
                                                    : 'bg-red-600 text-white'
                                                }`}>
                                                    {r}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {teamAStats && <div className="text-xs font-mono text-slate-500 font-medium mt-1">{teamAStats.wins}-{teamAStats.losses}</div>}
                            </div>
                            
                            <div className="h-px bg-slate-800/50 w-full"></div>

                            {/* Team B */}
                            <div className="flex justify-between items-start">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-3 mb-2">
                                        {/* 球队 Logo */}
                                        <img 
                                            src={getTeamLogoUrl(market.teamB?.name || '')} 
                                            alt={market.teamB?.name} 
                                            className="w-8 h-8 object-contain drop-shadow-md"
                                            onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.5'; }}
                                        />
                                        <div className="font-bold text-lg text-white tracking-tight leading-none">{market.teamB?.name}</div>
                                    </div>
                                    {teamBStats && (
                                        <div className="flex gap-1 ml-1">
                                            {/* 战绩 W/L，L为红色 */}
                                            {teamBStats.recentForm.split('').slice(0, 5).map((r, i) => (
                                                <span key={i} className={`w-5 h-5 flex items-center justify-center text-[10px] font-black rounded-sm ${
                                                    r === 'W' 
                                                    ? 'bg-green-500 text-slate-900' 
                                                    : 'bg-red-600 text-white'
                                                }`}>
                                                    {r}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {teamBStats && <div className="text-xs font-mono text-slate-500 font-medium mt-1">{teamBStats.wins}-{teamBStats.losses}</div>}
                            </div>
                        </div>

                        {/* 胜率分析条 */}
                        <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 mt-auto relative overflow-hidden">
                            {isDeepAnalysis && (
                                <div className="absolute top-0 right-0 bg-purple-500/20 text-purple-300 text-[9px] px-2 py-0.5 rounded-bl-lg font-bold border-l border-b border-purple-500/30 shadow-sm">
                                    ✨ AI 深度模型
                                </div>
                            )}
                            <div className="flex justify-between text-xs mb-2">
                                <span className="text-slate-500 font-medium">AI 模型胜率</span>
                                <div className="font-mono font-bold">
                                    <span className="text-blue-400">{(aiWinRateA * 100).toFixed(0)}%</span>
                                    <span className="mx-1 text-slate-700">/</span>
                                    <span className="text-red-400">{((1 - aiWinRateA) * 100).toFixed(0)}%</span>
                                </div>
                            </div>
                            
                            <div className="flex h-2 rounded-full overflow-hidden bg-slate-800 mb-3">
                                <div className="bg-blue-600" style={{ width: `${aiWinRateA * 100}%` }}></div>
                                <div className="bg-red-600" style={{ width: `${(1 - aiWinRateA) * 100}%` }}></div>
                            </div>
                            
                            <div className="flex justify-between items-end pt-2 border-t border-slate-800/50">
                                <div>
                                    <div className="text-[10px] text-slate-500 uppercase font-bold">Polymarket</div>
                                    <div className="font-mono text-sm font-bold text-white">
                                        {(market.prices.yes * 100).toFixed(0)}% <span className="text-slate-600 text-xs font-normal">Yes</span>
                                    </div>
                                </div>
                                
                                {/* 价值偏差提示 */}
                                {Math.abs(aiWinRateA - market.prices.yes) > 0.05 && (
                                    <div className={`text-[10px] font-bold px-2 py-1 rounded border flex items-center gap-1 ${
                                        aiWinRateA > market.prices.yes 
                                        ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                        : 'bg-red-500/10 text-red-400 border-red-500/20'
                                    }`}>
                                        {aiWinRateA > market.prices.yes ? '💎 低估' : '⚠️ 高估'} 
                                        <span className="font-mono ml-1">{(Math.abs(aiWinRateA - market.prices.yes)*100).toFixed(0)}%</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 操作按钮 */}
                        <div className="mt-5 space-y-3">
                            <Link
                              href={`/market/${market.marketId}`}
                              className="block w-full text-center py-3 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 rounded-xl transition-all shadow-lg shadow-blue-900/20 border border-blue-500/50 active:scale-[0.98]"
                            >
                              查看深度分析
                            </Link>
                            {market.eventSlug && (
                                <a
                                  href={`https://polymarket.com/event/${market.eventSlug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block w-full text-center py-2 text-xs font-medium text-slate-500 hover:text-blue-400 transition-colors hover:bg-slate-900/50 rounded-lg"
                                >
                                  前往 Polymarket ↗
                                </a>
                            )}
                        </div>

                      </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* 空数据状态 */}
        {sortedDates.length === 0 && !loadingProgress && (
          <div className="text-center py-20 border border-dashed border-slate-800 rounded-2xl bg-slate-900/50">
            <div className="text-4xl mb-4">🏀</div>
            <div className="text-slate-500 font-medium">暂无比赛数据</div>
            <button onClick={() => window.location.reload()} className="mt-4 text-sm text-blue-400 hover:text-blue-300 underline">
                刷新重试
            </button>
          </div>
        )}
      </div>
    </div>
  );
}