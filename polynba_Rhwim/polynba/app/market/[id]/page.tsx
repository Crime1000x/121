'use client';

import { useEffect, useState, useCallback } from 'react';
import { getOrFetchTeamStats } from '@/lib/api/team-stats';
import { calculateH2HStats } from '@/lib/utils/h2h';
import WhaleHolders from '@/components/WhaleHolders';
import { getTeamLogoUrl } from '@/lib/utils/espn-mapping';
import type {
  H2HGame,
  H2HStats,
  ArenaMarket,
  EnhancedGameData,
  AdvancedTeamStats,
  PredictionResult,
} from '@/types';
import { generatePrediction } from '@/lib/utils/prediction-engine-v3';
import Link from 'next/link';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

// 🆕 实时比分组件
import LiveGameTracker from '@/components/LiveGameTracker';
// 🤖 Grok 预测组件
import GrokPrediction from '@/components/GrokPrediction';

export default function MarketDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [market, setMarket] = useState<ArenaMarket | null>(null);
  const [h2hGames, setH2HGames] = useState<H2HGame[]>([]);
  const [stats, setStats] = useState<H2HStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conditionId, setConditionId] = useState<string | null>(null);
  const [teamA, setTeamA] = useState<string>('');
  const [teamB, setTeamB] = useState<string>('');

  // Data states
  const [enhancedData, setEnhancedData] = useState<EnhancedGameData | null>(null);
  const [advancedStatsA, setAdvancedStatsA] = useState<AdvancedTeamStats | null>(null);
  const [advancedStatsB, setAdvancedStatsB] = useState<AdvancedTeamStats | null>(null);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  
  // NEW: Team A home/away flag
  const [isTeamAHome, setIsTeamAHome] = useState<boolean | null>(null); 

  // 🆕 保存 ESPN eventId，用于实时比分组件
  const [eventId, setEventId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      // 1. Market Data
      const response = await fetch('/api/polymarket?limit=100');
      if (!response.ok) throw new Error('API Error');
      const markets = await response.json();
      const foundMarket = markets.find((m: ArenaMarket) => m.marketId === id);

      if (!foundMarket) {
        setError('未找到该市场数据');
        setLoading(false);
        return;
      }

      setMarket(foundMarket);
      const teamAName = foundMarket.teamA?.name || '';
      const teamBName = foundMarket.teamB?.name || '';
      setTeamA(teamAName);
      setTeamB(teamBName);

      if (foundMarket.conditionId) {
        setConditionId(foundMarket.conditionId);
      }

      // 2. Stats & H2H
      const [teamAStats, teamBStats] = await Promise.all([
        getOrFetchTeamStats(teamAName),
        getOrFetchTeamStats(teamBName),
      ]);

      const allGames: H2HGame[] = [];
      if (teamAStats) allGames.push(...teamAStats.recentGames);
      if (teamBStats) allGames.push(...teamBStats.recentGames);
      
      const uniqueGames = allGames
        .filter((game, index, self) =>
          index === self.findIndex((g) => g.date === game.date && g.home === game.home)
        )
        .filter((g) => (g.homeScore + g.awayScore) > 0)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setH2HGames(uniqueGames);

      let currentStats: H2HStats | null = null;
      if (uniqueGames.length > 0) {
        currentStats = calculateH2HStats(uniqueGames, teamAName, teamBName);
        setStats(currentStats);
      }

      // 3. ESPN Data
      const { findEspnGame, getEspnTeamId } = await import('@/lib/utils/espn-mapping');
      const foundEventId = await findEspnGame(teamAName, teamBName, foundMarket.startTime);

      let currentEnhancedData: EnhancedGameData | null = null;
      let homeFlag: boolean | null = null;

      if (foundEventId) {
        setEventId(foundEventId);

        const gameDataRes = await fetch(`/api/game-data?eventId=${foundEventId}`);
        if (gameDataRes.ok) {
          currentEnhancedData = await gameDataRes.json();
          setEnhancedData(currentEnhancedData);

          const competitors = currentEnhancedData?.competitors;

          if (competitors && Array.isArray(competitors)) {
            const competitorA = competitors.find(
              (c: any) => c.team?.displayName === teamAName
            );

            if (competitorA?.homeAway === 'home') {
              homeFlag = true;
            } else if (competitorA?.homeAway === 'away') {
              homeFlag = false;
            }
          }
          
          if (homeFlag === null) {
             const seasonEvent = currentEnhancedData?.seasonSeries?.[0]?.events?.[0];
             if (seasonEvent) {
                const competitorA = seasonEvent.competitors?.find((c:any) => c.team?.displayName === teamAName);
                if (competitorA?.homeAway === 'home') homeFlag = true;
                else if (competitorA?.homeAway === 'away') homeFlag = false;
             }
          }
          setIsTeamAHome(homeFlag);
        }
      } else {
        setEventId(null);
      }

      // 4. Advanced Stats
      const teamAId = getEspnTeamId(teamAName);
      const teamBId = getEspnTeamId(teamBName);
      let statsA: AdvancedTeamStats | null = null;
      let statsB: AdvancedTeamStats | null = null;
      
      if (teamAId && teamBId) {
        const [resA, resB] = await Promise.all([
          fetch(`/api/team-advanced-stats?teamId=${teamAId}`),
          fetch(`/api/team-advanced-stats?teamId=${teamBId}`),
        ]);
        if (resA.ok) statsA = await resA.json();
        if (resB.ok) statsB = await resB.json();
        setAdvancedStatsA(statsA);
        setAdvancedStatsB(statsB);
      }

      // 5. Prediction
      if (currentStats) {
        const injA = currentEnhancedData?.injuries?.find(
          (i: any) =>
            i.teamName.includes(teamAName.split(' ')[1]) || i.teamName === teamAName
        );
        const injB = currentEnhancedData?.injuries?.find(
          (i: any) =>
            i.teamName.includes(teamBName.split(' ')[1]) || i.teamName === teamBName
        );

        const restA = calculateRestDaysNum(teamAName, uniqueGames, foundMarket.startTime);
        const restB = calculateRestDaysNum(teamBName, uniqueGames, foundMarket.startTime);

        const pred = generatePrediction(
          teamAName,
          teamBName,
          currentStats,
          statsA,
          statsB,
          injA || null,
          injB || null,
          foundMarket.prices,
          restA,
          restB,
          homeFlag 
        );
        setPrediction(pred);
      }

      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
      setError('加载数据失败');
    }
  }

  const calculateRestDaysNum = (teamName: string, games: H2HGame[], marketStartTime?: string): number => {
    const teamGames = games.filter(g => g.home === teamName || g.away === teamName);
    if (teamGames.length === 0) return 3; 
    
    const sortedGames = [...teamGames].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    
    const gameTime = marketStartTime ? new Date(marketStartTime) : new Date();
    
    const pastGames = sortedGames.filter(
      g => new Date(g.date).getTime() < gameTime.getTime()
    );

    if (pastGames.length === 0) return 7; 

    const lastGameDate = new Date(pastGames[0].date);
    const targetDate = new Date(gameTime);
    
    lastGameDate.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);

    const daysDiff = Math.floor(
      (targetDate.getTime() - lastGameDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    const restDays = Math.max(1, daysDiff);
    return restDays;
  };

  const getRestDaysText = (teamName: string) => {
    const days = calculateRestDaysNum(teamName, h2hGames, market?.startTime);
    return days > 30 ? '赛季首秀' : `${days} 天`;
  };

  const getHomeAwayBadge = useCallback(
    (isHome: boolean | null, labelTeam: 'A' | 'B') => {
      if (isHome === null) return null;

      const isHOME = labelTeam === 'A' ? isHome : !isHome;

      return (
        <span
          className={`text-[9px] px-2 py-0.5 rounded-full ml-2 font-black tracking-wider uppercase border flex items-center gap-1 shrink-0
            ${
              isHOME
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.1)]'
                : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
            }`}
        >
          {isHOME ? '🏠 主场' : '✈️ 客场'}
        </span>
      );
    },
    []
  );

  const buildAiContext = useCallback(() => {
    if (!market || !stats) return '';

    return `
      比赛：${teamA} vs ${teamB}
      时间：${market.startTime || '未知'}
      
      【市场赔率】
      ${teamA} (Yes): ${(market.prices.yes * 100).toFixed(1)}%
      ${teamB} (No): ${(market.prices.no * 100).toFixed(1)}%
      
      【${teamA} 数据】
      - 胜率: ${(stats.teamAWinRate * 100).toFixed(1)}%
      - 近期走势: ${stats.recentForm.teamA}
      ${advancedStatsA ? `- 进攻效率: ${advancedStatsA.nbaRating || 'N/A'}` : ''}
      ${advancedStatsA ? `- eFG%: ${advancedStatsA.effectiveFGPct}%` : ''}
      
      【${teamB} 数据】
      - 胜率: ${((1 - stats.teamAWinRate) * 100).toFixed(1)}%
      - 近期走势: ${stats.recentForm.teamB}
      ${advancedStatsB ? `- 进攻效率: ${advancedStatsB.nbaRating || 'N/A'}` : ''}
      ${advancedStatsB ? `- eFG%: ${advancedStatsB.effectiveFGPct}%` : ''}
      
      【伤病情况】
      ${enhancedData?.injuries?.map(t => 
        `${t.teamName}: ${t.injuries.map(p => `${p.athleteName} (${p.status})`).join(', ')}`
      ).join('\n') || '无重大伤病数据'}
    `;
  }, [market, stats, advancedStatsA, advancedStatsB, enhancedData, teamA, teamB]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-transparent">
         <div className="relative">
            <div className="w-16 h-16 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center text-[8px] font-mono text-blue-500 font-bold">LOADING</div>
         </div>
      </div>
    );
  }
  
  if (error || !market) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-6 py-4 rounded-xl backdrop-blur-md">
           ⚠️ {error || '无数据'}
        </div>
      </div>
    );
  }

  const probA = (prediction?.teamAProbability || 0.5) * 100;
  const probB = (prediction?.teamBProbability || 0.5) * 100;
  const diff = probA - (market.prices.yes * 100);

  const chartData = h2hGames
    .slice(0, 20) 
    .reverse()
    .map((g) => {
      const scoreA = g.home === teamA ? g.homeScore : (g.away === teamA ? g.awayScore : null);
      const scoreB = g.home === teamB ? g.homeScore : (g.away === teamB ? g.awayScore : null);

      return {
        name: new Date(g.date).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
        [teamA]: scoreA,
        [teamB]: scoreB,
      };
    });

  return (
    <div className="min-h-screen text-slate-200 pb-20 font-sans">
      
      {/* 顶部导航 */}
      <div className="sticky top-0 z-40 bg-black/60 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="group flex items-center gap-2 text-xs font-bold text-white/50 hover:text-white transition-colors uppercase tracking-wider"
          >
            <span className="group-hover:-translate-x-1 transition-transform">←</span>
            返回市场列表
          </Link>
          <div className="text-[10px] font-mono text-white/20 uppercase tracking-widest hidden md:block">
            {market.marketSlug}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8 relative z-10">
        
        {/* 1. MAIN MATCHUP CARD */}
        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#0a0a0a]/60 backdrop-blur-2xl shadow-2xl">
          {/* 背景光效 */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full overflow-hidden pointer-events-none opacity-30">
             <div className="absolute top-[-50%] left-[-20%] w-[80%] h-[80%] bg-blue-600/20 rounded-full blur-[100px]"></div>
             <div className="absolute bottom-[-50%] right-[-20%] w-[80%] h-[80%] bg-purple-600/20 rounded-full blur-[100px]"></div>
          </div>

          <div className="relative z-10 p-8 md:p-12">
            <div className="flex flex-col md:flex-row items-center justify-between gap-10">
              {/* Team A */}
              <div className="flex items-center gap-8 flex-1 justify-end w-full md:w-auto">
                <div className="text-right hidden md:block">
                  <div className="flex items-center justify-end gap-2 mb-1">
                      {getHomeAwayBadge(isTeamAHome, 'A')}
                      <h1 className="text-4xl font-black text-white tracking-tighter uppercase">{teamA}</h1>
                  </div>
                  <div className="text-blue-400 font-mono text-xs font-bold tracking-widest uppercase opacity-80">
                    休息: {getRestDaysText(teamA)}
                  </div>
                </div>
                <div className="relative group">
                    <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <img
                        src={getTeamLogoUrl(teamA)}
                        className="w-24 h-24 object-contain drop-shadow-2xl relative z-10 transform group-hover:scale-110 transition-transform duration-500"
                        alt=""
                    />
                </div>
                {/* Mobile Team Name */}
                <div className="md:hidden text-center">
                    <h1 className="text-2xl font-black text-white">{teamA}</h1>
                </div>
              </div>

              {/* Score/Odds Center */}
              <div className="flex flex-col items-center shrink-0 px-8 py-4 bg-black/40 rounded-2xl border border-white/5 backdrop-blur-md shadow-inner">
                <div className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-4">
                  市场赔率 (Odds)
                </div>
                <div className="flex items-center gap-8">
                  <div className="text-center group cursor-default">
                    <div className="text-3xl font-black text-white font-mono tracking-tighter tabular-nums group-hover:text-blue-400 transition-colors drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]">
                      {(market.prices.yes * 100).toFixed(0)}%
                    </div>
                    <div className="text-[9px] text-white/40 font-bold uppercase mt-1 tracking-wider">Yes (胜)</div>
                  </div>
                  <div className="w-px h-12 bg-gradient-to-b from-transparent via-white/10 to-transparent"></div>
                  <div className="text-center group cursor-default">
                    <div className="text-3xl font-black text-white font-mono tracking-tighter tabular-nums group-hover:text-red-400 transition-colors drop-shadow-[0_0_10px_rgba(248,113,113,0.5)]">
                      {(market.prices.no * 100).toFixed(0)}%
                    </div>
                    <div className="text-[9px] text-white/40 font-bold uppercase mt-1 tracking-wider">No (负)</div>
                  </div>
                </div>
              </div>

              {/* Team B */}
              <div className="flex items-center gap-8 flex-1 w-full md:w-auto">
                <div className="relative group">
                    <div className="absolute inset-0 bg-purple-500/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    <img
                        src={getTeamLogoUrl(teamB)}
                        className="w-24 h-24 object-contain drop-shadow-2xl relative z-10 transform group-hover:scale-110 transition-transform duration-500"
                        alt=""
                    />
                </div>
                <div className="hidden md:block">
                  <div className="flex items-center gap-2 mb-1">
                      <h1 className="text-4xl font-black text-white tracking-tighter uppercase">{teamB}</h1>
                      {getHomeAwayBadge(isTeamAHome, 'B')}
                  </div>
                  <div className="text-purple-400 font-mono text-xs font-bold tracking-widest uppercase opacity-80">
                    休息: {getRestDaysText(teamB)}
                  </div>
                </div>
                 {/* Mobile Team Name */}
                 <div className="md:hidden text-center">
                    <h1 className="text-2xl font-black text-white">{teamB}</h1>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 🆕 1.5 实时比分 & 赔率追踪模块 */}
        {eventId && enhancedData && (
          <LiveGameTracker
            eventId={eventId}
            marketId={market.marketId}
            teamA={teamA}
            teamB={teamB}
            isTeamAHome={isTeamAHome}
          />
        )}

        {/* 🐋 4. WhaleHolders 组件 */}
        {conditionId && (
          <WhaleHolders
            conditionId={conditionId}
            teamA={teamA}
            teamB={teamB}
            currentPrice={market.prices}
            aiPrediction={prediction?.teamAProbability}
          />
        )}

        {/* 2. PREDICTION & VALUE DASHBOARD */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Prediction Model */}
          <div className="lg:col-span-7 bg-[#0a0a0a]/60 backdrop-blur-xl rounded-[24px] border border-white/5 p-8 relative overflow-hidden group hover:border-white/10 transition-colors shadow-lg">
            
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                    <span className="text-xl">🤖</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-lg tracking-tight">AI 模型分析</h3>
                    <p className="text-[10px] text-white/40 font-mono uppercase tracking-wider">神经网络 v3.0</p>
                  </div>
              </div>
              <div className="flex flex-col items-end">
                 <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1">置信度 (Confidence)</span>
                 <div className="h-1 w-24 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${(prediction?.confidence || 0.5) * 100}%` }}></div>
                 </div>
              </div>
            </div>
            
            <div className="mb-10">
              <div className="flex justify-between text-[10px] font-bold text-white/40 uppercase tracking-widest mb-4">
                <span>{teamA} 胜率</span>
                <span>{teamB} 胜率</span>
              </div>
              
              {/* Neon Progress Bar */}
              <div className="h-12 w-full bg-black/50 rounded-2xl overflow-hidden flex border border-white/10 relative p-1">
                <div 
                  className="bg-gradient-to-r from-blue-700 to-blue-500 h-full rounded-l-xl transition-all duration-1000 flex items-center justify-start px-4 text-sm font-black text-white relative shadow-[0_0_20px_rgba(59,130,246,0.3)] z-10" 
                  style={{ width: `${probA}%` }}
                >
                  <span className="drop-shadow-md">{probA.toFixed(1)}%</span>
                </div>
                <div 
                  className="bg-gradient-to-l from-red-700 to-red-500 h-full rounded-r-xl transition-all duration-1000 flex items-center justify-end px-4 text-sm font-black text-white relative shadow-[0_0_20px_rgba(239,68,68,0.3)] ml-auto" 
                  style={{ width: `${probB}%` }}
                >
                  <span className="drop-shadow-md">{probB.toFixed(1)}%</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {prediction?.factors.slice(0, 4).map((f, i) => (
                <div
                  key={i}
                  className="bg-white/[0.03] p-4 rounded-2xl border border-white/5 hover:bg-white/[0.06] transition-colors"
                >
                  <div className="flex justify-between mb-3">
                    <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">
                      {f.name}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                        f.score > 0 
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                        : 'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}
                    >
                      {f.score > 0 ? teamA : teamB}
                    </span>
                  </div>
                  <div className="w-full bg-black/50 h-1 rounded-full overflow-hidden mb-2">
                    <div
                      className={`h-full rounded-full ${
                        f.score > 0 ? 'bg-blue-500 shadow-[0_0_5px_rgba(59,130,246,0.8)]' : 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.8)]'
                      }`}
                      style={{ width: `${Math.min(Math.abs(f.score), 100)}%` }}
                    ></div>
                  </div>
                  <div className="text-[10px] text-white/50 font-medium leading-relaxed">
                    {f.description}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Market Value Analysis */}
          <div className="lg:col-span-5 bg-[#0a0a0a]/60 backdrop-blur-xl rounded-[24px] border border-white/5 shadow-lg overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-white/5 bg-white/[0.02] flex items-center gap-3">
              <span className="text-xl">📊</span> 
              <h3 className="font-bold text-white text-sm uppercase tracking-wide">价值分析 (Value Analysis)</h3>
            </div>
            
            <div className="p-8 flex-1 flex flex-col justify-center gap-6">
              {/* Row 1 */}
              <div className="flex justify-between items-center pb-4 border-b border-white/5 border-dashed">
                <span className="text-xs text-white/40 font-bold uppercase tracking-wider">Polymarket 赔率</span>
                <div className="font-mono text-sm font-bold">
                  <span className="text-blue-400 mr-2">
                    {(market.prices.yes * 100).toFixed(0)}%
                  </span>
                  <span className="text-white/20">/</span>
                  <span className="text-red-400 ml-2">
                    {(market.prices.no * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Row 2 */}
              <div className="flex justify-between items-center pb-4 border-b border-white/5 border-dashed">
                <span className="text-xs text-white/40 font-bold uppercase tracking-wider">AI 计算概率</span>
                <div className="font-mono text-sm font-bold">
                  <span className="text-blue-500 mr-2 drop-shadow-sm">{probA.toFixed(0)}%</span>
                  <span className="text-white/20">/</span>
                  <span className="text-red-500 ml-2 drop-shadow-sm">{probB.toFixed(0)}%</span>
                </div>
              </div>

              {/* Row 3 */}
              <div className="flex justify-between items-center">
                <span className="text-xs text-white/40 font-bold uppercase tracking-wider">价值偏差 (EV)</span>
                <span
                  className={`text-2xl font-mono font-black tracking-tight ${
                    diff > 0 ? 'text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.4)]' : 'text-rose-400 drop-shadow-[0_0_10px_rgba(251,113,133,0.4)]'
                  }`}
                >
                  {diff > 0 ? '+' : ''}
                  {diff.toFixed(1)}%
                </span>
              </div>

              {/* Conclusion Box */}
              <div
                className={`mt-4 p-5 rounded-2xl border flex items-center gap-4 transition-all duration-500 ${
                  Math.abs(diff) > 5
                    ? 'bg-emerald-500/5 border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]'
                    : 'bg-white/[0.02] border-white/5'
                }`}
              >
                <div className="text-2xl">
                    {Math.abs(diff) > 5 ? '💎' : '⚖️'}
                </div>
                <div>
                    <div className={`font-bold text-sm ${Math.abs(diff) > 5 ? 'text-emerald-400' : 'text-white/60'}`}>
                        {Math.abs(diff) > 5 
                            ? (diff > 5 ? `${teamA} 被低估 (Undervalued)` : `${teamB} 被低估 (Undervalued)`)
                            : '市场定价合理 (Fair Value)'}
                    </div>
                    <div className="text-[10px] opacity-50 font-mono uppercase tracking-widest mt-0.5">
                      {Math.abs(diff) > 5 ? '存在高价值机会' : '无明显优势'}
                    </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. SCHEDULE & FATIGUE */}
        <div className="bg-[#0a0a0a]/60 backdrop-blur-xl rounded-[24px] border border-white/5 p-8 shadow-lg">
          <h3 className="font-bold text-white mb-8 text-sm uppercase tracking-widest flex items-center gap-3">
             <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
             疲劳度分析 (Fatigue Analysis)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FatigueCard team={teamA} days={getRestDaysText(teamA)} />
            <FatigueCard team={teamB} days={getRestDaysText(teamB)} />
          </div>
        </div>

        {/* 4. ADVANCED STATS COMPARISON */}
        {advancedStatsA && advancedStatsB && (
          <div className="bg-[#0a0a0a]/60 backdrop-blur-xl rounded-[24px] border border-white/5 p-8 shadow-lg">
            <h3 className="font-bold text-white mb-8 text-sm uppercase tracking-widest flex items-center gap-3">
                <span className="w-1 h-4 bg-purple-500 rounded-full"></span>
                高阶数据对比 (Advanced Metrics)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Offensive */}
              <div className="bg-white/[0.02] rounded-2xl p-6 border border-white/5">
                <div className="text-[10px] font-black text-white/30 uppercase mb-6 text-center tracking-[0.2em]">
                  进攻 (Offense)
                </div>
                <StatRow
                  label="3P% (三分)"
                  valA={advancedStatsA.threePointPct}
                  valB={advancedStatsB.threePointPct}
                  suffix="%"
                />
                <StatRow
                  label="eFG% (有效命中)"
                  valA={advancedStatsA.effectiveFGPct}
                  valB={advancedStatsB.effectiveFGPct}
                  suffix="%"
                />
                <StatRow
                  label="AST (助攻)"
                  valA={advancedStatsA.avgAssists}
                  valB={advancedStatsB.avgAssists}
                />
              </div>
              {/* Defensive */}
              <div className="bg-white/[0.02] rounded-2xl p-6 border border-white/5">
                <div className="text-[10px] font-black text-white/30 uppercase mb-6 text-center tracking-[0.2em]">
                  防守 (Defense)
                </div>
                <StatRow
                  label="STL (抢断)"
                  valA={advancedStatsA.avgSteals}
                  valB={advancedStatsB.avgSteals}
                />
                <StatRow
                  label="BLK (盖帽)"
                  valA={advancedStatsA.avgBlocks}
                  valB={advancedStatsB.avgBlocks}
                />
                <StatRow
                  label="D-REB (防守篮板)"
                  valA={advancedStatsA.avgDefensiveRebounds}
                  valB={advancedStatsB.avgDefensiveRebounds}
                />
              </div>
              {/* Key Metrics */}
              <div className="bg-white/[0.02] rounded-2xl p-6 border border-white/5">
                <div className="text-[10px] font-black text-white/30 uppercase mb-6 text-center tracking-[0.2em]">
                  效率 (Efficiency)
                </div>
                <StatRow
                  label="TO Ratio (失误率)"
                  valA={advancedStatsA.assistTurnoverRatio}
                  valB={advancedStatsB.assistTurnoverRatio}
                  inverse
                />
                <StatRow label="Net RTG (净效率)" valA={advancedStatsA.nbaRating} valB={advancedStatsB.nbaRating} />
              </div>
            </div>
          </div>
        )}

        {/* 5. RECENT FORM & H2H & INJURIES GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Performance */}
          <div className="bg-[#0a0a0a]/60 backdrop-blur-xl rounded-[24px] border border-white/5 p-8 shadow-lg flex flex-col">
            <h3 className="font-bold text-white mb-8 text-sm uppercase tracking-widest flex items-center gap-3">
                <span className="w-1 h-4 bg-orange-500 rounded-full"></span>
                近期状态 & 趋势
            </h3>
            
            <div className="grid grid-cols-2 gap-6 mb-8">
              <div className="bg-white/[0.02] p-5 rounded-2xl border border-white/5">
                <div className="text-xs font-bold text-white/50 mb-3 uppercase tracking-wider">{teamA}</div>
                <div className="flex gap-1.5 flex-wrap">
                  {stats?.recentForm.teamA.split('').map((r, i) => (
                    <span
                      key={i}
                      className={`w-6 h-6 flex items-center justify-center text-[9px] font-black rounded-md border ${
                        r === 'W'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
              <div className="bg-white/[0.02] p-5 rounded-2xl border border-white/5">
                <div className="text-xs font-bold text-white/50 mb-3 uppercase tracking-wider">{teamB}</div>
                <div className="flex gap-1.5 flex-wrap">
                  {stats?.recentForm.teamB.split('').map((r, i) => (
                    <span
                      key={i}
                      className={`w-6 h-6 flex items-center justify-center text-[9px] font-black rounded-md border ${
                        r === 'W'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Win Distribution Pie */}
            {stats && (
              <div className="h-64 w-full mt-auto mb-8">
                <div className="text-[10px] text-center text-white/30 mb-2 uppercase tracking-widest">历史交锋胜率 (Head to Head)</div>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={[
                        { name: teamA, value: stats.teamAWins },
                        { name: teamB, value: stats.teamBWins }
                      ]}
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      <Cell fill="#3b82f6" style={{filter: 'drop-shadow(0px 0px 10px rgba(59,130,246,0.3))'}} />
                      <Cell fill="#ef4444" style={{filter: 'drop-shadow(0px 0px 10px rgba(239,68,68,0.3))'}} />
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#000',
                        borderColor: '#333',
                        borderRadius: '12px',
                        color: '#fff',
                        fontSize: '12px'
                      }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            
            {/* Scoring Trend Line */}
            <div className="h-48 w-full">
              <div className="text-[10px] text-center text-white/30 mb-2 uppercase tracking-widest">近期得分趋势 (Scoring Trend)</div>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis hide dataKey="name" />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 10, fill: '#666' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#000',
                      borderColor: '#333',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey={teamA} 
                    stroke="#3b82f6" 
                    strokeWidth={2} 
                    dot={false} 
                    connectNulls={true} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey={teamB} 
                    stroke="#ef4444" 
                    strokeWidth={2} 
                    dot={false} 
                    connectNulls={true} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Injury Tracker */}
          <div className="bg-[#0a0a0a]/60 backdrop-blur-xl rounded-[24px] border border-white/5 p-8 shadow-lg h-[800px] flex flex-col">
            <div className="flex justify-between items-center mb-8">
              <h3 className="font-bold text-white text-sm uppercase tracking-widest flex items-center gap-3">
                 <span className="w-1 h-4 bg-red-500 rounded-full"></span>
                 伤病报告 (Injury Report)
              </h3>
              <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-1 rounded border border-red-500/20 animate-pulse">
                ● 实时更新
              </span>
            </div>

            {enhancedData?.injuries ? (
              <div className="space-y-8 overflow-y-auto custom-scrollbar flex-1 pr-2">
                {enhancedData.injuries.map((teamInj) => (
                  <div key={teamInj.teamId}>
                    <div className="flex items-center gap-3 mb-4 sticky top-0 bg-[#0a0a0a] py-3 z-10 border-b border-white/5">
                      <img
                        src={getTeamLogoUrl(teamInj.teamName)}
                        className="w-6 h-6 object-contain grayscale opacity-80"
                        alt=""
                      />
                      <span className="text-xs font-black text-white/40 uppercase tracking-widest">
                        {teamInj.teamName}
                      </span>
                    </div>
                    <div className="grid gap-3">
                      {teamInj.injuries.length === 0 ? (
                        <div className="text-xs font-bold text-emerald-400 bg-emerald-500/5 p-4 rounded-xl border border-emerald-500/10 text-center">
                          全员健康 ✅ (Full Strength)
                        </div>
                      ) : (
                        teamInj.injuries.map((p) => {
                          let statusStr = 'Unknown';
                          if (typeof p.status === 'string') {
                            statusStr = p.status;
                          } else if (p.status && typeof p.status === 'object') {
                            statusStr = (p.status as any).type || (p.status as any).abbreviation || 'Unknown';
                          }
                          
                          const isOut = statusStr.toLowerCase().includes('out');
                          
                          return (
                            <div
                              key={p.athleteId}
                              className="flex items-center gap-4 p-3 bg-white/[0.03] rounded-xl border border-white/5 hover:bg-white/[0.05] transition-colors group"
                            >
                              <div className="w-10 h-10 bg-black rounded-full overflow-hidden border border-white/10 shrink-0">
                                {p.headshot ? (
                                  <img
                                    src={p.headshot}
                                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                    alt={p.athleteName}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs text-white/20 font-bold">
                                    ?
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-sm text-slate-200 truncate">
                                  {p.athleteName}
                                </div>
                                <div className="text-[10px] text-white/40 truncate mt-0.5">
                                  {p.position}
                                  {typeof p.details === 'string' && p.details
                                    ? ` · ${p.details}`
                                    : ''}
                                </div>
                              </div>
                              <span
                                className={`text-[9px] font-black uppercase px-2 py-1 rounded border shrink-0 ${
                                  isOut
                                    ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                    : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
                                }`}
                              >
                                {statusStr}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-white/20 border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
                <span className="text-3xl mb-3 grayscale opacity-30">🏥</span>
                <span className="text-xs font-mono uppercase tracking-widest">暂无伤病数据</span>
              </div>
            )}
          </div>
        </div>

        {/* 6. RECENT GAMES TABLE */}
        <div className="bg-[#0a0a0a]/60 backdrop-blur-xl rounded-[24px] border border-white/5 p-8 shadow-lg">
          <h3 className="font-bold text-white mb-8 text-sm uppercase tracking-widest flex items-center gap-3">
             <span className="w-1 h-4 bg-white/20 rounded-full"></span>
             历史战绩 (近30场)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-400">
              <thead className="text-[10px] font-black text-white/30 uppercase tracking-wider border-b border-white/5 bg-white/[0.02]">
                <tr>
                  <th className="px-6 py-4 rounded-tl-xl">日期 (Date)</th>
                  <th className="px-6 py-4">主队 (Home)</th>
                  <th className="px-6 py-4 text-center">比分 (Score)</th>
                  <th className="px-6 py-4 rounded-tr-xl text-right">客队 (Away)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {h2hGames.map((game, index) => (
                  <tr key={index} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-mono text-white/40 text-xs">{game.date}</td>
                    <td className="px-6 py-4">
                      <div
                        className={`flex items-center gap-2 ${
                          game.home === game.winner ? 'font-bold text-white' : 'text-white/60'
                        }`}
                      >
                        {game.home === game.winner && (
                          <span className="text-[10px] text-yellow-500">👑</span>
                        )}
                        {game.home}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-black/40 border border-white/10 px-3 py-1 rounded font-mono font-bold text-xs text-white/80">
                        {game.homeScore} - {game.awayScore}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div
                        className={`flex items-center justify-end gap-2 ${
                          game.away === game.winner ? 'font-bold text-white' : 'text-white/60'
                        }`}
                      >
                        {game.away}
                        {game.away === game.winner && (
                          <span className="text-[10px] text-yellow-500">👑</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* 🤖 6.5. AI PREDICTION */}
        {market && advancedStatsA && advancedStatsB && (
          <div className="mb-6">
            <GrokPrediction 
              teamA={teamA} 
              teamB={teamB} 
              contextData={buildAiContext()} 
            />
          </div>
        )}

        {/* 7. ANALYSIS REASONING */}
        <div className="bg-[#0a0a0a]/60 backdrop-blur-xl rounded-[24px] border border-white/5 p-8 shadow-lg">
          <h3 className="font-bold text-white mb-6 text-sm uppercase tracking-widest flex items-center gap-3">
             <span className="text-xl">💡</span> 关键洞察 (Key Insights)
          </h3>
          <div className="space-y-4 text-sm text-slate-300 leading-relaxed font-light">
            {prediction?.reasoning.map((text, i) => (
              <div
                key={i}
                className="flex gap-4 p-4 bg-white/[0.02] rounded-xl border border-white/5 hover:border-white/10 transition-colors"
              >
                <span className="text-blue-500 font-bold mt-0.5 text-lg">•</span>
                <span>{text}</span>
              </div>
            ))}
          </div>
          <div className="mt-8 pt-6 border-t border-white/5 text-[10px] text-white/20 flex justify-between items-center font-mono uppercase tracking-widest">
            <span>数据来源: Polymarket / ESPN / NBA 官方数据</span>
            <span>Engine v3.0.1</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sub Components ---

function FatigueCard({ team, days }: { team: string; days: string }) {
  const isB2B = days.includes('1');
  return (
    <div className="bg-white/[0.02] rounded-2xl p-6 border border-white/5 hover:bg-white/[0.04] transition-all group">
      <div className="flex justify-between items-center mb-4">
        <span className="font-bold text-slate-200 text-lg group-hover:text-white transition-colors">
          {team}
        </span>
        <span
          className={`text-[9px] font-black px-2 py-1 rounded border uppercase tracking-wider ${
            isB2B
              ? 'bg-red-500/10 text-red-400 border-red-500/20'
              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          }`}
        >
          {isB2B ? '⚠️ 背靠背' : '✅ 休息充足'}
        </span>
      </div>
      <div className="flex items-end gap-2 mb-4">
        <span className="font-mono text-3xl font-light text-white">{days.replace(' 天', '')}</span>
        <span className="text-xs text-white/40 font-bold uppercase mb-1.5">休息天数</span>
      </div>
      <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${
            isB2B ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
          }`}
          style={{ width: isB2B ? '10%' : '100%' }}
        ></div>
      </div>
    </div>
  );
}

function StatRow({
  label,
  valA,
  valB,
  suffix = '',
  inverse = false
}: {
  label: string;
  valA?: number;
  valB?: number;
  suffix?: string;
  inverse?: boolean;
}) {
  if (valA === undefined || valB === undefined) return null;
  
  const isABetter = inverse ? valA < valB : valA > valB;

  return (
    <div className="flex justify-between items-center mb-4 last:mb-0 group">
      <span
        className={`font-mono font-bold text-sm transition-colors ${
          isABetter ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]' : 'text-white/30'
        }`}
      >
        {valA.toFixed(1)}{suffix}
      </span>
      
      <div className="relative">
          <span className="text-[9px] font-black text-white/20 uppercase tracking-widest z-10 relative group-hover:text-white/50 transition-colors">
            {label}
          </span>
          <div className="absolute inset-x-[-10px] top-1/2 h-px bg-white/5 -z-0"></div>
      </div>

      <span
        className={`font-mono font-bold text-sm transition-colors ${
          !isABetter ? 'text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.3)]' : 'text-white/30'
        }`}
      >
        {valB.toFixed(1)}{suffix}
      </span>
    </div>
  );
}