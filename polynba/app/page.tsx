'use client';

import { useEffect, useState } from 'react';
import { getCachedMarkets, setCachedMarkets, Cache } from '@/lib/utils/cache';
import type { ArenaMarket, H2HGame } from '@/types';
import type { TeamStats } from '@/lib/api/team-stats';
import { getTeamLogoUrl } from '@/lib/utils/espn-mapping';
import Link from 'next/link';

// 🆕 比赛状态类型定义
type GameStatus = 'upcoming' | 'live' | 'final';

interface LiveGameData {
  gameId: string;
  status: GameStatus;
  clock: string;
  period: number;
  homeScore: number;
  awayScore: number;
  lastUpdate: number;
}

export default function HomePage() {
  const [markets, setMarkets] = useState<ArenaMarket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [teamStatsMap, setTeamStatsMap] = useState<Map<string, TeamStats>>(new Map());
  const [preloading, setPreloading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState('Initializing...');
  const [redisPredictions, setRedisPredictions] = useState<Record<string, number>>({});
  
  // 🆕 实时比赛数据
  const [liveGames, setLiveGames] = useState<Map<string, LiveGameData>>(new Map());
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    Cache.checkVersion();
    loadMarkets();
  }, []);

  // 🆕 自动刷新实时数据（30秒一次）
  useEffect(() => {
    if (!autoRefresh || markets.length === 0) return;

    const interval = setInterval(() => {
      refreshLiveGames();
    }, 30000); // 30秒

    // 立即加载一次
    refreshLiveGames();

    return () => clearInterval(interval);
  }, [markets, autoRefresh]);

  async function loadMarkets() {
    try {
      setLoadingProgress(10);
      setLoadingMessage('检查缓存中...');

      const cached = getCachedMarkets();
      if (cached && cached.length > 0) {
        console.log('✅ Using cached markets data');
        const sorted = sortMarkets(cached);
        const unique = deduplicateMarkets(sorted);
        const filtered = filterOldGames(unique); // 🆕 过滤旧比赛
        
        setMarkets(filtered);
        setFromCache(true);
        setLoadingProgress(30);
        
        setLoadingMessage('正在同步深度分析数据...');
        await Promise.all([
            prefetchTeamStatsBlocking(filtered),
            fetchRedisPredictions(filtered)
        ]);

        setLoadingProgress(100);
        setLoadingMessage('加载完成！');
        setPreloading(false);
        return;
      }

      setLoadingProgress(20);
      setLoadingMessage('从 Polymarket 获取 NBA 市场数据...');
      const response = await fetch('/api/polymarket?limit=60');

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const sorted = sortMarkets(data);
      const unique = deduplicateMarkets(sorted);
      const filtered = filterOldGames(unique); // 🆕 过滤旧比赛

      setMarkets(filtered);
      setFromCache(false);
      setLoadingProgress(40);

      if (data && data.length > 0) {
        setCachedMarkets(data);
        setLoadingMessage('正在同步深度分析数据...');
        await Promise.all([
            prefetchTeamStatsBlocking(filtered),
            fetchRedisPredictions(filtered)
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

  // 🆕 刷新实时比赛数据
  async function refreshLiveGames() {
    try {
      console.log('🔄 刷新实时比赛数据...');
      
      // 批量获取所有比赛的 eventId
      const { findEspnGame } = await import('@/lib/utils/espn-mapping');
      const liveGamePromises = markets.map(async (market) => {
        if (!market.teamA?.name || !market.teamB?.name) return null;
        
        const eventId = await findEspnGame(
          market.teamA.name,
          market.teamB.name,
          market.startTime
        );
        
        if (!eventId) return null;
        
        // 获取实时比分
        const liveData = await fetchLiveGameData(eventId);
        if (liveData) {
          return { marketId: market.marketId, eventId, liveData };
        }
        
        return null;
      });

      const results = await Promise.allSettled(liveGamePromises);
      const newLiveGames = new Map<string, LiveGameData>();
      
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          const { marketId, liveData } = result.value;
          newLiveGames.set(marketId, liveData);
        }
      });

      setLiveGames(newLiveGames);
      console.log(`✅ 实时数据刷新完成，${newLiveGames.size} 场比赛有更新`);
      
    } catch (error) {
      console.error('❌ 实时数据刷新失败:', error);
    }
  }

  // 🆕 获取单场比赛的实时数据
  async function fetchLiveGameData(eventId: string): Promise<LiveGameData | null> {
    try {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${eventId}`
      );
      
      if (!response.ok) return null;
      
      const data = await response.json();
      const header = data.header;
      const competition = header?.competitions?.[0];
      
      if (!competition) return null;

      const status = competition.status;
      const competitors = competition.competitors;

      // 判断比赛状态
      let gameStatus: GameStatus = 'upcoming';
      if (status.type.state === 'in') {
        gameStatus = 'live';
      } else if (status.type.state === 'post') {
        gameStatus = 'final';
      }

      // 获取比分
      const homeTeam = competitors.find((c: any) => c.homeAway === 'home');
      const awayTeam = competitors.find((c: any) => c.homeAway === 'away');

      return {
        gameId: eventId,
        status: gameStatus,
        clock: status.displayClock || '',
        period: status.period || 0,
        homeScore: parseInt(homeTeam?.score || '0'),
        awayScore: parseInt(awayTeam?.score || '0'),
        lastUpdate: Date.now(),
      };
      
    } catch (error) {
      console.error(`Failed to fetch live data for ${eventId}:`, error);
      return null;
    }
  }

  async function fetchRedisPredictions(markets: ArenaMarket[]) {
      try {
          const marketIds = markets.map(m => m.marketId);
          
          console.log(`📡 正在从 Redis 批量获取 ${marketIds.length} 个市场的深度预测...`);
          
          const response = await fetch('/api/predictions/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ marketIds })
          });

          if (response.ok) {
              const data = await response.json();
              const successCount = Object.keys(data).length;
              console.log(`✅ 成功加载 ${successCount}/${marketIds.length} 个市场的 Redis 深度预测数据`);
              
              if (successCount > 0) {
                  const sampleKey = Object.keys(data)[0];
                  console.log(`📊 示例数据: marketId=${sampleKey}, winRate=${(data[sampleKey] * 100).toFixed(1)}%`);
              }
              
              setRedisPredictions(data);
          } else {
              console.warn('⚠️ Redis API 响应失败:', response.status);
          }
      } catch (e) {
          console.warn('⚠️ 获取 Redis 数据失败:', e);
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

  // 🆕 过滤旧比赛的函数
  const filterOldGames = (markets: ArenaMarket[]) => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    return markets.filter(market => {
      if (!market.startTime) return true;
      const gameDate = new Date(market.startTime);
      gameDate.setHours(0, 0, 0, 0);
      return gameDate >= yesterday;
    });
  };

  // 🆕 按状态分组市场
  function getGroupedMarketsByStatus() {
    const now = Date.now();
    const liveMarkets: ArenaMarket[] = [];
    const upcomingMarkets: ArenaMarket[] = [];
    const finishedMarkets: ArenaMarket[] = [];

    markets.forEach(market => {
      const liveData = liveGames.get(market.marketId);
      
      if (liveData) {
        if (liveData.status === 'live') {
          liveMarkets.push(market);
        } else if (liveData.status === 'final') {
          finishedMarkets.push(market);
        } else {
          upcomingMarkets.push(market);
        }
      } else {
        // 没有实时数据时，根据时间判断
        const gameTime = new Date(market.startTime || 0).getTime();
        const hoursSinceStart = (now - gameTime) / (1000 * 60 * 60);
        
        if (hoursSinceStart > 0 && hoursSinceStart < 4) {
          // 可能正在进行（比赛开始后4小时内）
          liveMarkets.push(market);
        } else if (hoursSinceStart >= 4) {
          // 已结束
          finishedMarkets.push(market);
        } else {
          // 未开始
          upcomingMarkets.push(market);
        }
      }
    });

    return { liveMarkets, upcomingMarkets, finishedMarkets };
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

  const calculateSimpleWinProbability = (
      statsA: TeamStats, 
      statsB: TeamStats, 
      marketStartTime: string
  ): number => {
      const wrDiff = (statsA.winRate - statsB.winRate) * 100;
      
      const winsA = statsA.recentForm.split('').filter(c => c === 'W').length;
      const winsB = statsB.recentForm.split('').filter(c => c === 'W').length;
      const formDiff = (winsA - winsB) * 8;
      
      const restA = calculateRestDays(statsA.recentGames, marketStartTime);
      const restB = calculateRestDays(statsB.recentGames, marketStartTime);
      
      const getRestValue = (days: number) => {
          if (days <= 1) return -15;
          if (days === 2) return 0;
          if (days === 3) return 5;
          return 8;
      };
      
      const restValA = getRestValue(restA);
      const restValB = getRestValue(restB);
      const restDiff = (restValA - restValB) * 2;
      
      const scoreDiff = (statsA.avgScore - statsB.avgScore) * 2;

      const score = 
        (wrDiff * 0.35) + 
        (formDiff * 0.25) + 
        (restDiff * 0.25) + 
        (scoreDiff * 0.15);

      const k = 35;
      return 1 / (1 + Math.exp(-score / k));
  };

  // 🆕 渲染比赛卡片
  const renderMarketCard = (market: ArenaMarket) => {
    const teamAStats = market.teamA?.name ? teamStatsMap.get(market.teamA.name) : null;
    const teamBStats = market.teamB?.name ? teamStatsMap.get(market.teamB.name) : null;
    const liveData = liveGames.get(market.marketId);

    let aiWinRateA = 0.5;
    let isDeepAnalysis = false;
    let dataSourceLabel = '⚡ 快速预测';

    if (redisPredictions[market.marketId] !== undefined) {
        aiWinRateA = redisPredictions[market.marketId];
        isDeepAnalysis = true;
        dataSourceLabel = '✨ 深度模型';
    } 
    else if (teamAStats && teamBStats && market.startTime) {
        aiWinRateA = calculateSimpleWinProbability(teamAStats, teamBStats, market.startTime);
        isDeepAnalysis = false;
        dataSourceLabel = '⚡ 快速预测';
    }
    
    // 🆕 格式化日期和时间
    const gameDate = new Date(market.startTime || '');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const gameDateOnly = new Date(gameDate);
    gameDateOnly.setHours(0, 0, 0, 0);

    // 判断是今天、明天还是具体日期
    let dateLabel = '';
    let dateStyle = 'text-slate-500';

    if (gameDateOnly.getTime() === today.getTime()) {
        dateLabel = '今天';
        dateStyle = 'text-blue-400'; // 高亮今天
    } else if (gameDateOnly.getTime() === tomorrow.getTime()) {
        dateLabel = '明天';
        dateStyle = 'text-slate-400';
    } else {
        // 显示月/日格式
        dateLabel = gameDate.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
        dateStyle = 'text-slate-500';
    }

    const timeString = gameDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    // 🆕 判断是否是实时比赛
    const isLive = liveData?.status === 'live';
    const isFinal = liveData?.status === 'final';

    return (
      <div
        key={market.marketId}
        className={`bg-slate-900 rounded-2xl border ${
          isLive 
            ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.3)]' 
            : isFinal
            ? 'border-slate-700 opacity-75'
            : 'border-slate-800'
        } hover:border-slate-700 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col relative group`}
      >
          {/* 🆕 实时状态标识 */}
          {isLive && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-600 via-red-500 to-red-600 animate-pulse"></div>
          )}

          {/* 比赛时间/状态角标 */}
          <div className="absolute top-4 right-4 z-10">
              {isLive ? (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-600/90 backdrop-blur text-white rounded-full border border-red-500 shadow-lg">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                  <span className="text-xs font-bold">LIVE</span>
                </div>
              ) : isFinal ? (
                <span className="px-3 py-1 bg-slate-800/90 backdrop-blur text-xs font-mono text-slate-500 rounded border border-slate-700">
                  FINAL
                </span>
              ) : (
                <div className="flex flex-col items-end gap-0.5">
                    <span className={`px-2 py-0.5 bg-slate-950/90 backdrop-blur text-[10px] font-mono ${dateStyle} font-semibold rounded-t border border-b-0 border-slate-800`}>
                        {dateLabel}
                    </span>
                    <span className="px-2 py-1 bg-slate-950/90 backdrop-blur text-xs font-mono text-slate-300 font-medium rounded-b border border-slate-800 shadow-sm">
                        {timeString}
                    </span>
                </div>
              )}
          </div>

          <div className="p-5 flex-1 flex flex-col">
            {/* 联赛标签 */}
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-5">{market.sport}</div>

            {/* 🆕 实时比分显示 */}
            {(isLive || isFinal) && liveData && (
              <div className="mb-4 bg-slate-950/60 rounded-xl p-3 border border-slate-800">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-slate-500 font-mono">
                    {liveData.period}Q {liveData.clock}
                  </span>
                  <span className="text-xs text-slate-500">实时比分</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex-1">
                    <div className="text-sm font-bold text-slate-300">{market.teamA?.name}</div>
                    <div className="text-2xl font-black text-white font-mono">{liveData.awayScore}</div>
                  </div>
                  <div className="text-slate-600 text-xl font-bold mx-4">-</div>
                  <div className="flex-1 text-right">
                    <div className="text-sm font-bold text-slate-300">{market.teamB?.name}</div>
                    <div className="text-2xl font-black text-white font-mono">{liveData.homeScore}</div>
                  </div>
                </div>
              </div>
            )}

            {/* 球队信息区域 */}
            <div className="space-y-5 mb-6">
                {/* Team A */}
                <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-3 mb-2">
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
            {!isLive && !isFinal && (
              <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 mt-auto relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-purple-500/20 text-purple-300 text-[9px] px-2 py-0.5 rounded-bl-lg font-bold border-l border-b border-purple-500/30 shadow-sm">
                      {dataSourceLabel}
                  </div>
                  
                  <div className="flex justify-between text-xs mb-2 mt-2">
                      <span className="text-slate-500 font-medium">AI 模型胜率</span>
                      <div className="font-mono font-bold">
                          <span className="text-blue-400">{(aiWinRateA * 100).toFixed(0)}%</span>
                          <span className="mx-1 text-slate-700">/</span>
                          <span className="text-red-400">{((1 - aiWinRateA) * 100).toFixed(0)}%</span>
                      </div>
                  </div>
                  
                  <div className="flex h-2 rounded-full overflow-hidden bg-slate-800 mb-3">
                      <div className="bg-blue-600 transition-all duration-500" style={{ width: `${aiWinRateA * 100}%` }}></div>
                      <div className="bg-red-600 transition-all duration-500" style={{ width: `${(1 - aiWinRateA) * 100}%` }}></div>
                  </div>
                  
                  <div className="flex justify-between items-end pt-2 border-t border-slate-800/50">
                      <div>
                          <div className="text-[10px] text-slate-500 uppercase font-bold">Polymarket</div>
                          <div className="font-mono text-sm font-bold text-white">
                              {(market.prices.yes * 100).toFixed(0)}% <span className="text-slate-600 text-xs font-normal">Yes</span>
                          </div>
                      </div>
                      
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
            )}

            {/* 操作按钮 */}
            <div className="mt-5 space-y-3">
                <Link
                  href={`/market/${market.marketId}`}
                  className="block w-full text-center py-3 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 rounded-xl transition-all shadow-lg shadow-blue-900/20 border border-blue-500/50 active:scale-[0.98]"
                >
                  {isLive ? '🔴 查看实时分析' : '查看深度分析'}
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
  };

  if (preloading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="max-w-md w-full px-8">
          <div className="bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 p-8 text-center">
            <h2 className="text-3xl font-extrabold text-white mb-2 tracking-tight">POLYNBA</h2>
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

  // 🆕 按状态分组
  const { liveMarkets, upcomingMarkets, finishedMarkets } = getGroupedMarketsByStatus();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30 pb-20">
      {/* 顶部导航栏 */}
      <div className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" aria-label="Home" className="group">
              <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-3">
                <span>POLYNBA</span>
                <span className="text-xs font-medium text-slate-400 px-2 py-1 bg-slate-800 rounded-md border border-slate-700 hidden sm:inline-block">
                  Beta 2.7
                </span>
              </h1>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            {/* 🆕 实时比赛数量 */}
            {liveMarkets.length > 0 && (
              <div className="text-xs text-red-400 bg-red-400/10 px-3 py-1 rounded-full border border-red-400/20 flex items-center gap-1 animate-pulse">
                <span className="w-1.5 h-1.5 bg-red-400 rounded-full"></span>
                {liveMarkets.length} 场直播中
              </div>
            )}
            {fromCache && (
              <div className="text-xs text-green-400 bg-green-400/10 px-3 py-1 rounded-full border border-green-400/20 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                Live Cache
              </div>
            )}
            {Object.keys(redisPredictions).length > 0 && (
              <div className="text-xs text-purple-400 bg-purple-400/10 px-3 py-1 rounded-full border border-purple-400/20 flex items-center gap-1">
                <span className="text-sm">✨</span>
                深度分析 ({Object.keys(redisPredictions).length})
              </div>
            )}
            {/* 🆕 自动刷新开关 */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`text-xs px-3 py-1 rounded-full border flex items-center gap-1 transition-colors ${
                autoRefresh
                  ? 'bg-blue-400/10 text-blue-400 border-blue-400/20'
                  : 'bg-slate-800 text-slate-500 border-slate-700'
              }`}
            >
              {autoRefresh ? '🔄 自动刷新' : '⏸️ 已暂停'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {/* 🆕 实时比赛区域 */}
        {liveMarkets.length > 0 && (
          <div className="mb-12">
            <div className="sticky top-20 z-30 mb-6 flex items-center">
               <div className="px-4 py-1.5 bg-red-600/90 backdrop-blur border border-red-500 rounded-full text-sm font-bold text-white shadow-lg flex items-center gap-2">
                 <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                 🔴 直播中 ({liveMarkets.length})
               </div>
               <div className="h-px bg-red-500/30 flex-1 ml-4"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {liveMarkets.map(renderMarketCard)}
            </div>
          </div>
        )}

        {/* 🆕 即将开始区域 */}
        {upcomingMarkets.length > 0 && (
          <div className="mb-12">
            <div className="sticky top-20 z-30 mb-6 flex items-center">
               <div className="px-4 py-1.5 bg-slate-800/90 backdrop-blur border border-slate-700 rounded-full text-sm font-bold text-slate-200 shadow-lg">
                 ⏱️ 即将开始 ({upcomingMarkets.length})
               </div>
               <div className="h-px bg-slate-800 flex-1 ml-4"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {upcomingMarkets.map(renderMarketCard)}
            </div>
          </div>
        )}

        {/* 🆕 已结束区域 */}
        {finishedMarkets.length > 0 && (
          <div className="mb-12">
            <div className="sticky top-20 z-30 mb-6 flex items-center">
               <div className="px-4 py-1.5 bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-full text-sm font-bold text-slate-400 shadow-lg">
                 ✅ 已结束 ({finishedMarkets.length})
               </div>
               <div className="h-px bg-slate-800/50 flex-1 ml-4"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {finishedMarkets.map(renderMarketCard)}
            </div>
          </div>
        )}

        {/* 空数据状态 */}
        {markets.length === 0 && !loadingProgress && (
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