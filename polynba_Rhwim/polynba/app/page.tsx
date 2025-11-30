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
  homeTeamName: string;
  lastUpdate: number;
}

export default function HomePage() {
  const [markets, setMarkets] = useState<ArenaMarket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [teamStatsMap, setTeamStatsMap] = useState<Map<string, TeamStats>>(new Map());
  
  // 🚀 优化：移除 preloading 状态，让页面尽可能早渲染
  // 但保留 loadingProgress 用于顶部细微的进度条展示
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [redisPredictions, setRedisPredictions] = useState<Record<string, number>>({});
  const [liveGames, setLiveGames] = useState<Map<string, LiveGameData>>(new Map());
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    Cache.checkVersion();
    loadMarkets();
  }, []);

  useEffect(() => {
    if (!autoRefresh || markets.length === 0) return;
    const interval = setInterval(() => refreshLiveGames(), 30000);
    refreshLiveGames();
    return () => clearInterval(interval);
  }, [markets, autoRefresh]);

  async function loadMarkets() {
    try {
      setLoadingProgress(10);

      // 1. 优先使用本地缓存秒开
      const cached = getCachedMarkets();
      if (cached && cached.length > 0) {
        console.log('✅ 秒开：使用本地缓存');
        processMarkets(cached, true);
        setLoadingProgress(30);
        
        // 后台静默刷新一次最新数据
        fetchFreshMarkets(); 
      } else {
        // 无缓存，请求 API
        await fetchFreshMarkets();
      }
    } catch (err) {
      setError('加载市场数据失败');
      console.error(err);
    }
  }

  async function fetchFreshMarkets() {
    try {
      const response = await fetch('/api/polymarket?limit=60');
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json();
      
      setCachedMarkets(data);
      processMarkets(data, false);
      setLoadingProgress(50);
    } catch (e) {
      console.error("后台刷新失败:", e);
      if (markets.length === 0) setError('无法连接到服务器');
    }
  }

  // 统一处理市场数据
  function processMarkets(data: ArenaMarket[], isCached: boolean) {
    const sorted = sortMarkets(data);
    const unique = deduplicateMarkets(sorted);
    const filtered = filterOldGames(unique);

    setMarkets(filtered);
    setFromCache(isCached);

    // 🚀 关键优化：异步非阻塞加载附加数据
    // 不使用 await，让这些任务在后台跑，不卡住界面
    setTimeout(() => {
      prefetchTeamStatsNonBlocking(filtered);
      fetchRedisPredictions(filtered);
    }, 100);
  }

  // 🚀 新增：非阻塞式加载球队数据 (分批次更新 UI)
  async function prefetchTeamStatsNonBlocking(markets: ArenaMarket[]) {
    const teamNames = new Set<string>();
    for (const market of markets) {
      if (market.teamA?.name) teamNames.add(market.teamA.name);
      if (market.teamB?.name) teamNames.add(market.teamB.name);
    }

    const teams = Array.from(teamNames);
    const { getOrFetchTeamStats } = await import('@/lib/api/team-stats');
    
    // 分批加载
    const BATCH_SIZE = 6;
    for (let i = 0; i < teams.length; i += BATCH_SIZE) {
      const batch = teams.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(name => getOrFetchTeamStats(name))
      );

      setTeamStatsMap(prev => {
        const newMap = new Map(prev);
        results.forEach(res => {
          if (res.status === 'fulfilled' && res.value) {
            newMap.set(res.value.teamName, res.value);
          }
        });
        return newMap;
      });
      
      // 更新进度条
      const progress = 50 + Math.floor(((i + BATCH_SIZE) / teams.length) * 50);
      setLoadingProgress(Math.min(progress, 100));
    }
  }

  // 🆕 刷新实时比赛数据
  async function refreshLiveGames() {
    try {
      const { findEspnGame } = await import('@/lib/utils/espn-mapping');
      const liveGamePromises = markets.map(async (market) => {
        if (!market.teamA?.name || !market.teamB?.name) return null;
        const eventId = await findEspnGame(market.teamA.name, market.teamB.name, market.startTime);
        if (!eventId) return null;
        const liveData = await fetchLiveGameData(eventId);
        return liveData ? { marketId: market.marketId, liveData } : null;
      });

      const results = await Promise.allSettled(liveGamePromises);
      const newLiveGames = new Map<string, LiveGameData>();
      
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          newLiveGames.set(result.value.marketId, result.value.liveData);
        }
      });

      setLiveGames(newLiveGames);
    } catch (error) { console.error(error); }
  }

  // 🆕 获取单场比赛的实时数据 (包含主队名，用于修复比分反向)
  async function fetchLiveGameData(eventId: string): Promise<LiveGameData | null> {
    try {
      const response = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${eventId}`);
      if (!response.ok) return null;
      const data = await response.json();
      const competition = data.header?.competitions?.[0];
      if (!competition) return null;

      const status = competition.status;
      const competitors = competition.competitors;
      let gameStatus: GameStatus = 'upcoming';
      if (status.type.state === 'in') gameStatus = 'live';
      else if (status.type.state === 'post') gameStatus = 'final';

      const homeTeam = competitors.find((c: any) => c.homeAway === 'home');
      const awayTeam = competitors.find((c: any) => c.homeAway === 'away');

      return {
        gameId: eventId,
        status: gameStatus,
        clock: status.displayClock || '',
        period: status.period || 0,
        homeScore: parseInt(homeTeam?.score || '0'),
        awayScore: parseInt(awayTeam?.score || '0'),
        homeTeamName: homeTeam?.team?.displayName || '', // 关键字段
        lastUpdate: Date.now(),
      };
    } catch { return null; }
  }

  async function fetchRedisPredictions(markets: ArenaMarket[]) {
      try {
          const marketIds = markets.map(m => m.marketId);
          const response = await fetch('/api/predictions/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ marketIds })
          });

          if (response.ok) {
              const data = await response.json();
              setRedisPredictions(data);
          }
      } catch (e) { console.warn('Redis fetch failed', e); }
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
    return [...markets].sort((a, b) => new Date(a.startTime || 0).getTime() - new Date(b.startTime || 0).getTime());
  }

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

  function getGroupedMarketsByStatus() {
    const now = Date.now();
    const liveMarkets: ArenaMarket[] = [];
    const upcomingMarkets: ArenaMarket[] = [];
    const finishedMarkets: ArenaMarket[] = [];

    markets.forEach(market => {
      const liveData = liveGames.get(market.marketId);
      if (liveData) {
        if (liveData.status === 'live') liveMarkets.push(market);
        else if (liveData.status === 'final') finishedMarkets.push(market);
        else upcomingMarkets.push(market);
      } else {
        const gameTime = new Date(market.startTime || 0).getTime();
        const hoursSinceStart = (now - gameTime) / (1000 * 60 * 60);
        if (hoursSinceStart > 0 && hoursSinceStart < 4) liveMarkets.push(market);
        else if (hoursSinceStart >= 4) finishedMarkets.push(market);
        else upcomingMarkets.push(market);
      }
    });
    return { liveMarkets, upcomingMarkets, finishedMarkets };
  }

  const calculateRestDays = (games: H2HGame[], marketStartTime: string): number => {
    if (!games || games.length === 0) return 3;
    const targetTime = new Date(marketStartTime).getTime();
    const pastGames = games
        .filter(g => new Date(g.date).getTime() < targetTime)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (pastGames.length === 0) return 3;
    const lastGameTime = new Date(pastGames[0].date).getTime();
    return Math.ceil(Math.abs(targetTime - lastGameTime) / (1000 * 60 * 60 * 24));
  };

  const calculateSimpleWinProbability = (statsA: TeamStats, statsB: TeamStats, marketStartTime: string): number => {
      const wrDiff = (statsA.winRate - statsB.winRate) * 100;
      const winsA = statsA.recentForm.split('W').length - 1;
      const winsB = statsB.recentForm.split('W').length - 1;
      const formDiff = (winsA - winsB) * 8;
      const restA = calculateRestDays(statsA.recentGames, marketStartTime);
      const restB = calculateRestDays(statsB.recentGames, marketStartTime);
      const getRestValue = (d: number) => d<=1?-15:d===2?0:d===3?5:8;
      const restDiff = (getRestValue(restA) - getRestValue(restB)) * 2;
      const scoreDiff = (statsA.avgScore - statsB.avgScore) * 2;
      const score = (wrDiff * 0.35) + (formDiff * 0.25) + (restDiff * 0.25) + (scoreDiff * 0.15);
      return 1 / (1 + Math.exp(-score / 35));
  };

  const renderMarketCard = (market: ArenaMarket) => {
    const teamAStats = market.teamA?.name ? teamStatsMap.get(market.teamA.name) : null;
    const teamBStats = market.teamB?.name ? teamStatsMap.get(market.teamB.name) : null;
    const liveData = liveGames.get(market.marketId);

    let aiWinRateA = 0.5;
    let isDeepAnalysis = false;
    let dataSourceLabel = '⚡ 基础分析';

    if (redisPredictions[market.marketId] !== undefined) {
        aiWinRateA = redisPredictions[market.marketId];
        isDeepAnalysis = true;
        dataSourceLabel = '✨ 深度模型';
    } else if (teamAStats && teamBStats && market.startTime) {
        aiWinRateA = calculateSimpleWinProbability(teamAStats, teamBStats, market.startTime);
    }
    
    const gameDate = new Date(market.startTime || '');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const gameDateOnly = new Date(gameDate);
    gameDateOnly.setHours(0, 0, 0, 0);

    let dateLabel = '';
    let dateClass = 'text-white/40';

    if (gameDateOnly.getTime() === today.getTime()) {
        dateLabel = 'Today';
        dateClass = 'text-blue-400 font-bold shadow-blue-500/50 drop-shadow-sm';
    } else if (gameDateOnly.getTime() === tomorrow.getTime()) {
        dateLabel = 'Tomorrow';
        dateClass = 'text-white/60';
    } else {
        dateLabel = gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    const timeString = gameDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

    const isLive = liveData?.status === 'live';
    const isFinal = liveData?.status === 'final';

    return (
      <div
        key={market.marketId}
        className={`group relative flex flex-col overflow-hidden rounded-[24px] border backdrop-blur-2xl transition-all duration-500
          ${isLive 
            ? 'bg-[#1a0b0b]/80 border-red-500/30 shadow-[0_0_50px_-15px_rgba(220,38,38,0.4)]' 
            : isFinal
            ? 'bg-[#050505]/60 border-white/5 opacity-60 grayscale hover:grayscale-0 hover:opacity-100'
            : 'bg-[#0a0a0a]/60 border-white/10 hover:border-white/20 hover:bg-[#111]/80 hover:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)]'
          }`}
      >
          {/* 装饰性背景光晕 */}
          {!isFinal && (
             <div className="absolute -top-[100px] -right-[100px] w-[200px] h-[200px] bg-gradient-to-br from-blue-600/10 to-purple-600/10 blur-[80px] pointer-events-none group-hover:opacity-100 transition-opacity opacity-50"></div>
          )}

          {/* 顶部栏：时间与状态 */}
          <div className="relative px-6 py-4 flex justify-between items-center z-10">
              <span className="text-[10px] font-black text-white/30 tracking-[0.2em] uppercase">{market.sport}</span>
              
              {isLive ? (
                  <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.4)]">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                      </span>
                      <span className="text-[10px] font-bold text-red-400 tracking-wider">LIVE</span>
                  </div>
              ) : isFinal ? (
                  <span className="px-3 py-1 bg-white/5 border border-white/5 rounded-full text-[10px] font-bold text-white/40">FINAL</span>
              ) : (
                  <div className="flex items-center gap-3">
                      <span className={`text-xs ${dateClass} tracking-wide`}>{dateLabel}</span>
                      <span className="w-px h-3 bg-white/10"></span>
                      <span className="text-xs font-mono text-white/60">{timeString}</span>
                  </div>
              )}
          </div>

          <div className="px-6 pb-6 flex-1 flex flex-col relative z-10">
            
            {/* 实时比分 - 仅 Live/Final 显示 (修复版: 正确分配分数) */}
            {(isLive || isFinal) && liveData && (() => {
              // 🧠 核心修复：判断 Team A 是不是主队
              const isTeamAHome = liveData.homeTeamName.includes(market.teamA?.name || '$$$');
              const scoreA = isTeamAHome ? liveData.homeScore : liveData.awayScore;
              const scoreB = isTeamAHome ? liveData.awayScore : liveData.homeScore;
              
              return (
                <div className="mb-6 relative overflow-hidden rounded-2xl bg-black/40 border border-white/5 p-4">
                   <div className="flex justify-between items-center">
                      <div className="text-center w-1/3">
                         <div className="text-3xl font-black text-white font-mono tracking-tighter drop-shadow-lg">{scoreA}</div>
                      </div>
                      <div className="flex flex-col items-center w-1/3">
                         <span className="text-[10px] font-bold text-red-500/80 mb-1 animate-pulse">
                             {isLive ? '●' : ''}
                         </span>
                         <span className="text-xs font-mono text-white/40">
                             {isFinal ? 'END' : `Q${liveData.period} · ${liveData.clock}`}
                         </span>
                      </div>
                      <div className="text-center w-1/3">
                         <div className="text-3xl font-black text-white font-mono tracking-tighter drop-shadow-lg">{scoreB}</div>
                      </div>
                   </div>
                </div>
              );
            })()}

            {/* 球队信息 */}
            <div className="space-y-6 mb-8">
                {/* Team A */}
                <div className="flex justify-between items-center group/team">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 p-2 border border-white/5 shadow-inner">
                            <img 
                                src={getTeamLogoUrl(market.teamA?.name || '')} 
                                alt={market.teamA?.name} 
                                className="w-full h-full object-contain drop-shadow-md group-hover/team:scale-110 transition-transform duration-300"
                            />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-bold text-lg text-white tracking-tight leading-none mb-2">{market.teamA?.name}</span>
                            {teamAStats && (
                                <div className="flex gap-1">
                                    {teamAStats.recentForm.split('').slice(0, 5).map((r, i) => (
                                        <div key={i} className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black border ${
                                            r === 'W' 
                                            ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' 
                                            : 'bg-white/5 border-white/10 text-white/30'
                                        }`}>
                                            {r}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                
                {/* VS Divider (only if not live) */}
                {!isLive && !isFinal && (
                    <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
                )}

                {/* Team B */}
                <div className="flex justify-between items-center group/team">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 p-2 border border-white/5 shadow-inner">
                            <img 
                                src={getTeamLogoUrl(market.teamB?.name || '')} 
                                alt={market.teamB?.name} 
                                className="w-full h-full object-contain drop-shadow-md group-hover/team:scale-110 transition-transform duration-300"
                            />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-bold text-lg text-white tracking-tight leading-none mb-2">{market.teamB?.name}</span>
                            {teamBStats && (
                                <div className="flex gap-1">
                                    {teamBStats.recentForm.split('').slice(0, 5).map((r, i) => (
                                        <div key={i} className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black border ${
                                            r === 'W' 
                                            ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' 
                                            : 'bg-white/5 border-white/10 text-white/30'
                                        }`}>
                                            {r}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 预测条 - Apple Style Glass Container */}
            {!isLive && !isFinal && (
              <div className="bg-white/[0.03] backdrop-blur-md rounded-2xl p-4 border border-white/5 mt-auto relative overflow-hidden group-hover:bg-white/[0.06] transition-colors">
                  <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${isDeepAnalysis ? 'bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]' : 'bg-blue-500'}`}></span>
                          <span className="text-[10px] font-bold text-white/50 tracking-wider uppercase">{dataSourceLabel}</span>
                      </div>
                      <div className="font-mono font-bold text-sm tracking-tight">
                          <span className="text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]">{(aiWinRateA * 100).toFixed(0)}%</span>
                          <span className="text-white/20 mx-1">/</span>
                          <span className="text-red-400 opacity-60">{((1 - aiWinRateA) * 100).toFixed(0)}%</span>
                      </div>
                  </div>
                  
                  {/* Neon Progress Bar */}
                  <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden mb-3 border border-white/5">
                      <div className="relative h-full flex">
                           <div 
                             className="bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-400 h-full shadow-[0_0_15px_rgba(59,130,246,0.6)]" 
                             style={{ width: `${aiWinRateA * 100}%` }}
                           ></div>
                      </div>
                  </div>
                  
                  <div className="flex justify-between items-center pt-2 border-t border-white/5">
                      <span className="text-[10px] font-mono text-white/40">Market: {(market.prices.yes * 100).toFixed(0)}%</span>
                      
                      {Math.abs(aiWinRateA - market.prices.yes) > 0.05 && (
                          <div className={`px-2 py-1 rounded-md text-[10px] font-bold border backdrop-blur-md flex items-center gap-1.5 ${
                              aiWinRateA > market.prices.yes 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          }`}>
                              {aiWinRateA > market.prices.yes ? '💎 被低估' : '⚠️ 被高估'} 
                              <span className="font-mono opacity-80">{(Math.abs(aiWinRateA - market.prices.yes)*100).toFixed(0)}%</span>
                          </div>
                      )}
                  </div>
              </div>
            )}

            {/* 底部按钮 */}
            <div className="mt-5 grid gap-3">
                <Link
                  href={`/market/${market.marketId}`}
                  className={`w-full text-center py-3.5 text-xs font-bold text-white rounded-2xl transition-all duration-300 active:scale-[0.98] border border-transparent
                    ${isLive 
                      ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:shadow-[0_0_30px_rgba(220,38,38,0.4)]' 
                      : 'bg-white/10 hover:bg-white/15 border-white/5 hover:border-white/20 backdrop-blur-md'
                    }`}
                >
                  {isLive ? '观看比赛直播数据' : '查看深度分析详情'}
                </Link>
                
                {market.eventSlug && (
                    <a
                      href={`https://polymarket.com/event/${market.eventSlug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-center text-[10px] font-medium text-white/30 hover:text-white/60 transition-colors"
                    >
                      Open on Polymarket ↗
                    </a>
                )}
            </div>

          </div>
      </div>
    );
  };

  // Loading 状态不用显示了，因为我们是渐进加载的，或者只显示一个极简的骨架
  if (markets.length === 0 && !error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black overflow-hidden relative">
         <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-black to-black"></div>
         <div className="z-10 text-center space-y-8 w-80">
             <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400 drop-shadow-[0_0_20px_rgba(59,130,246,0.5)]">
                 POLYNBA
             </h1>
             <div className="flex flex-col items-center gap-4">
                 <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                 <span className="text-xs text-blue-400/60 font-mono tracking-widest">INITIALIZING SYSTEM...</span>
             </div>
         </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="bg-red-950/30 border border-red-500/20 text-red-400 px-8 py-4 rounded-2xl backdrop-blur-xl">
          Error: {error}
        </div>
      </div>
    );
  }

  const { liveMarkets, upcomingMarkets, finishedMarkets } = getGroupedMarketsByStatus();

  return (
    <div className="min-h-screen bg-black text-slate-200 font-sans selection:bg-blue-500/30 pb-32 relative">
      
      {/* 全局背景光效 - Cyberpunk Style */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 rounded-full blur-[120px]"></div>
          {/* 网格背景 */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
      </div>

      {/* 顶部导航 */}
      <div className="sticky top-0 z-50 border-b border-white/5 bg-black/70 backdrop-blur-xl supports-[backdrop-filter]:bg-black/60">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="group flex items-center gap-3">
             <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.5)] group-hover:shadow-[0_0_30px_rgba(37,99,235,0.8)] transition-all">
                <span className="font-bold text-white text-sm">P</span>
             </div>
             <span className="font-bold text-xl tracking-tight text-white group-hover:text-blue-400 transition-colors">POLYNBA</span>
          </Link>
          
          <div className="flex items-center gap-4">
            {liveMarkets.length > 0 && (
                <div className="hidden md:flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 backdrop-blur-md animate-pulse-slow">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                    <span className="text-xs font-bold text-red-400">{liveMarkets.length} Live</span>
                </div>
            )}
            {/* 顶部微型进度条 (仅加载时显示) */}
            {loadingProgress > 0 && loadingProgress < 100 && (
                 <div className="w-20 h-1 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 transition-all duration-300" style={{width: `${loadingProgress}%`}}></div>
                 </div>
            )}
            
            <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold border transition-all ${
                    autoRefresh 
                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.2)]' 
                    : 'bg-white/5 border-white/10 text-white/40'
                }`}
            >
                {autoRefresh ? (
                    <>
                        <span className="animate-spin">⟳</span> Auto
                    </>
                ) : (
                    <>
                        <span>⏸</span> Paused
                    </>
                )}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-10 relative z-10">
        
        {/* Live Section */}
        {liveMarkets.length > 0 && (
          <div className="mb-16">
            <div className="flex items-center gap-3 mb-8">
                <span className="flex h-3 w-3 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600"></span>
                </span>
                <h2 className="text-xl font-bold text-white tracking-tight">正在直播</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {liveMarkets.map(renderMarketCard)}
            </div>
          </div>
        )}

        {/* Upcoming Section */}
        {upcomingMarkets.length > 0 && (
          <div className="mb-16">
            <div className="flex items-center gap-3 mb-8">
                <div className="w-1 h-6 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>
                <h2 className="text-xl font-bold text-white tracking-tight">即将开始</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {upcomingMarkets.map(renderMarketCard)}
            </div>
          </div>
        )}

        {/* Finished Section */}
        {finishedMarkets.length > 0 && (
          <div className="mb-12 opacity-80 hover:opacity-100 transition-opacity duration-500">
            <div className="flex items-center gap-3 mb-8">
                <div className="w-1 h-6 bg-white/20 rounded-full"></div>
                <h2 className="text-xl font-bold text-white/60 tracking-tight">已结束</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {finishedMarkets.map(renderMarketCard)}
            </div>
          </div>
        )}

        {/* Empty State */}
        {markets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-32 rounded-[32px] border border-dashed border-white/10 bg-white/[0.02]">
            <div className="text-6xl mb-6 opacity-20 grayscale filter">🏀</div>
            <div className="text-white/40 font-medium">暂无比赛数据</div>
            <button onClick={() => window.location.reload()} className="mt-6 px-6 py-2 bg-white/5 hover:bg-white/10 rounded-full text-xs font-bold text-white transition-all border border-white/5">
                刷新重试
            </button>
          </div>
        )}
      </div>
    </div>
  );
}