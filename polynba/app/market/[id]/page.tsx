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
        setError('Market not found');
        setLoading(false);
        return;
      }

      setMarket(foundMarket);
      const teamAName = foundMarket.teamA?.name || '';
      const teamBName = foundMarket.teamB?.name || '';
      setTeamA(teamAName);
      setTeamB(teamBName);

      // 3. 在 loadData() 中设置 conditionId
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
      
      // 🛠️ FIX START: 过滤逻辑更新
      const uniqueGames = allGames
        .filter((game, index, self) =>
          index === self.findIndex((g) => g.date === game.date && g.home === game.home)
        )
        // ✨ 关键修复：过滤掉比分总和 <= 0 的比赛（即未开始或无数据）
        .filter((g) => (g.homeScore + g.awayScore) > 0)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      // 🛠️ FIX END

      setH2HGames(uniqueGames);

      let currentStats: H2HStats | null = null;
      if (uniqueGames.length > 0) {
        currentStats = calculateH2HStats(uniqueGames, teamAName, teamBName);
        setStats(currentStats);
      }

      // 3. ESPN Data (Injuries & Game Info)
      const { findEspnGame, getEspnTeamId } = await import('@/lib/utils/espn-mapping');
      // Use startTime to find correct game (scans +-3 day)
      const foundEventId = await findEspnGame(teamAName, teamBName, foundMarket.startTime);

      let currentEnhancedData: EnhancedGameData | null = null;
      let homeFlag: boolean | null = null; // NEW: 用于 loadData 内部传递

      if (foundEventId) {
        // 🆕 保存到 state，供 LiveGameTracker 使用
        setEventId(foundEventId);

        const gameDataRes = await fetch(`/api/game-data?eventId=${foundEventId}`);
        if (gameDataRes.ok) {
          currentEnhancedData = await gameDataRes.json();
          setEnhancedData(currentEnhancedData);

          // --- NEW: 解析主队信息 (修复版) ---
          // 正确：直接使用当前比赛的 competitors 数据
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
          
          // 如果当前比赛没找到，才尝试用 seasonSeries 兜底（可选，通常不需要）
          if (homeFlag === null) {
             const seasonEvent = currentEnhancedData?.seasonSeries?.[0]?.events?.[0];
             if (seasonEvent) {
                const competitorA = seasonEvent.competitors?.find((c:any) => c.team?.displayName === teamAName);
                if (competitorA?.homeAway === 'home') homeFlag = true;
                else if (competitorA?.homeAway === 'away') homeFlag = false;
             }
          }
          setIsTeamAHome(homeFlag); // NEW: 存入状态
        }
      } else {
        // 如果没找到 eventId，确保清空旧状态，避免显示旧比赛的实时数据
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
          homeFlag // NEW: 传递新的主队参数
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

  // Helper for rest days calculation
  const calculateRestDaysNum = (teamName: string, games: H2HGame[], marketStartTime?: string): number => {
    // 1. 筛选该队的比赛
    const teamGames = games.filter(g => g.home === teamName || g.away === teamName);
    if (teamGames.length === 0) return 3; 
    
    // 2. 按时间倒序排列
    const sortedGames = [...teamGames].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    
    // 3. 目标比赛时间
    const gameTime = marketStartTime ? new Date(marketStartTime) : new Date();
    
    // 4. 过滤出已经结束的比赛
    const pastGames = sortedGames.filter(
      g => new Date(g.date).getTime() < gameTime.getTime()
    );

    if (pastGames.length === 0) return 7; // 赛季首场

    // 5. 🔧 关键修复：只比较日期，不比较时间
    const lastGameDate = new Date(pastGames[0].date);
    const targetDate = new Date(gameTime);
    
    // 归零时分秒，只保留日期
    lastGameDate.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);

    // 6. 计算日期差
    const daysDiff = Math.floor(
      (targetDate.getTime() - lastGameDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // 7. 确保至少返回 1（背靠背）
    const restDays = Math.max(1, daysDiff);
    
    console.log(
      `📅 ${teamName}: 上场 ${pastGames[0].date}, 下场 ${
        targetDate.toISOString().split('T')[0]
      }, 休息 ${restDays} 天`
    );
    
    return restDays;
  };

  const getRestDaysText = (teamName: string) => {
    const days = calculateRestDaysNum(teamName, h2hGames, market?.startTime);
    return days > 30 ? '赛季首秀' : `${days} 天`;
  };

  // NEW: Badge generator（用 useCallback 包装，避免重复创建函数）
  const getHomeAwayBadge = useCallback(
    (isHome: boolean | null, labelTeam: 'A' | 'B') => {
      if (isHome === null) return null;

      // 如果当前徽章是给 Team B 渲染，则逻辑反转
      const isHOME = labelTeam === 'A' ? isHome : !isHome;

      return (
        <span
          className={`text-xs px-2 py-1 rounded-full ml-2 font-bold flex items-center gap-1 shrink-0
            ${
              isHOME
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                : 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
            }`}
        >
          {isHOME ? '🏠 Home' : '✈️ Away'}
        </span>
      );
    },
    []
  );
  // End of NEW: Badge generator

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4"></div>
        <div className="text-slate-400 text-sm">正在分析 ESPN 数据...</div>
      </div>
    );
  }
  
  if (error || !market) {
    return (
      <div className="min-h-screen bg-slate-950 flex justify-center items-center text-red-500">
        {error || '无数据'}
      </div>
    );
  }

  const probA = (prediction?.teamAProbability || 0.5) * 100;
  const probB = (prediction?.teamBProbability || 0.5) * 100;
  const diff = probA - (market.prices.yes * 100);

  // ✅ FIX START: 优化 Chart Data 逻辑
  const chartData = h2hGames
    .slice(0, 20) // 取更多数据以应对 null 造成的空缺
    .reverse()
    .map((g) => {
      // 严谨判断：如果 Team A 是主队取主队分，是客队取客队分，没参赛则为 null
      const scoreA = g.home === teamA ? g.homeScore : (g.away === teamA ? g.awayScore : null);
      
      // 严谨判断：同上
      const scoreB = g.home === teamB ? g.homeScore : (g.away === teamB ? g.awayScore : null);

      return {
        name: new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        [teamA]: scoreA,
        [teamB]: scoreB,
      };
    });
  // ✅ FIX END

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-20 font-sans selection:bg-blue-500/30">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 backdrop-blur-md bg-opacity-80">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="text-slate-400 hover:text-white flex items-center gap-2 text-sm font-medium transition-colors"
          >
            ← 返回列表
          </Link>
          <div className="text-xs text-slate-500 font-mono hidden md:block">
            {market.marketSlug}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        
        {/* 1. MAIN MATCHUP CARD */}
        <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl p-6 border border-slate-700 shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('/noise.png')] opacity-5 mix-blend-overlay pointer-events-none"></div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
            {/* Team A */}
            <div className="flex items-center gap-6 flex-1 justify-end">
              <div className="text-right hidden md:block">
                {/* NEW: Display Home/Away for Team A */}
                <h1 className="text-3xl font-bold text-white tracking-tight flex items-center justify-end">
                  {teamA}
                  {getHomeAwayBadge(isTeamAHome, 'A')}
                </h1>
                <div className="text-blue-400 font-mono text-sm mt-1 font-medium">
                  {getRestDaysText(teamA)} 休息
                </div>
              </div>
              <img
                src={getTeamLogoUrl(teamA)}
                className="w-20 h-20 object-contain drop-shadow-2xl"
                alt=""
              />
            </div>

            {/* Score/Odds Center */}
            <div className="flex flex-col items-center shrink-0 px-8">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
                Polymarket Odds
              </div>
              <div className="flex items-center gap-0 bg-slate-950 rounded-xl border border-slate-700 overflow-hidden">
                <div className="px-6 py-3 text-center border-r border-slate-800 hover:bg-slate-900 transition-colors cursor-default">
                  <div className="text-2xl font-bold text-blue-500">
                    {(market.prices.yes * 100).toFixed(0)}%
                  </div>
                  <div className="text-[10px] text-slate-600 font-bold uppercase mt-1">Yes</div>
                </div>
                <div className="px-6 py-3 text-center hover:bg-slate-900 transition-colors cursor-default">
                  <div className="text-2xl font-bold text-red-500">
                    {(market.prices.no * 100).toFixed(0)}%
                  </div>
                  <div className="text-[10px] text-slate-600 font-bold uppercase mt-1">No</div>
                </div>
              </div>
            </div>

            {/* Team B */}
            <div className="flex items-center gap-6 flex-1">
              <img
                src={getTeamLogoUrl(teamB)}
                className="w-20 h-20 object-contain drop-shadow-2xl"
                alt=""
              />
              <div className="hidden md:block">
                {/* NEW: Display Home/Away for Team B */}
                <h1 className="text-3xl font-bold text-white tracking-tight flex items-center">
                  {teamB}
                  {getHomeAwayBadge(isTeamAHome, 'B')}
                </h1>
                <div className="text-blue-400 font-mono text-sm mt-1 font-medium">
                  {getRestDaysText(teamB)} 休息
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

        {/* 🐋 4. WhaleHolders 组件 - 在实时比分下方新增 */}
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Prediction Model (Big Visuals) - 7 Cols */}
          <div className="lg:col-span-7 bg-slate-900 rounded-2xl border border-slate-800 shadow-xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none select-none">
              <span className="text-9xl text-white">🔮</span>
            </div>

            <div className="flex justify-between items-center mb-8 relative z-10">
              <h3 className="font-bold text-white flex items-center gap-3 text-lg">
                <span className="text-purple-400 text-2xl">🤖</span> AI 胜率预测模型
              </h3>
              <span className="bg-purple-500/10 text-purple-400 text-xs px-3 py-1.5 rounded-full border border-purple-500/20 font-mono font-bold">
                CONFIDENCE: {(prediction?.confidence || 0.5) * 100}%
              </span>
            </div>
            
            <div className="mb-10 relative z-10">
              <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                <span>{teamA} Win Probability</span>
                <span>{teamB} Win Probability</span>
              </div>
              <div className="h-10 bg-slate-950 rounded-xl overflow-hidden flex border border-slate-800">
                <div 
                  className="bg-blue-600 h-full transition-all duration-1000 flex items-center justify-start px-4 text-sm font-bold text-white relative overflow-hidden" 
                  style={{ width: `${probA}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/10"></div>
                  {probA.toFixed(1)}%
                </div>
                <div 
                  className="bg-red-600 h-full transition-all duration-1000 flex items-center justify-end px-4 text-sm font-bold text-white relative overflow-hidden" 
                  style={{ width: `${probB}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-l from-transparent to-white/10"></div>
                  {probB.toFixed(1)}%
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 relative z-10">
              {prediction?.factors.slice(0, 4).map((f, i) => (
                <div
                  key={i}
                  className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors"
                >
                  <div className="flex justify-between mb-2">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                      {f.name}
                    </span>
                    <span
                      className={`text-xs font-bold ${
                        f.score > 0 ? 'text-blue-400' : 'text-red-400'
                      }`}
                    >
                      {f.score > 0 ? teamA : teamB}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mb-2">
                    <div
                      className={`h-full rounded-full ${
                        f.score > 0 ? 'bg-blue-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(Math.abs(f.score), 100)}%` }}
                    ></div>
                  </div>
                  <div className="text-[10px] text-slate-500 truncate font-medium">
                    {f.description}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Market Value Analysis (Data Table Style) - 5 Cols */}
          <div className="lg:col-span-5 bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              <h3 className="font-bold text-white flex items-center gap-2">
                <span>💎</span> 市场价值分析
              </h3>
            </div>
            
            <div className="p-6 flex-1 flex flex-col justify-center space-y-6">
              {/* Row 1 */}
              <div className="flex justify-between items-center pb-4 border-b border-slate-800/50">
                <span className="text-sm text-slate-400 font-medium">Polymarket 赔率</span>
                <div className="font-mono text-sm font-bold">
                  <span className="text-blue-400 mr-2">
                    {(market.prices.yes * 100).toFixed(0)}%
                  </span>
                  <span className="text-slate-700">/</span>
                  <span className="text-red-400 ml-2">
                    {(market.prices.no * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Row 2 */}
              <div className="flex justify-between items-center pb-4 border-b border-slate-800/50">
                <span className="text-sm text-slate-400 font-medium">AI 模型计算</span>
                <div className="font-mono text-sm font-bold">
                  <span className="text-blue-500 mr-2">{probA.toFixed(0)}%</span>
                  <span className="text-slate-700">/</span>
                  <span className="text-red-500 ml-2">{probB.toFixed(0)}%</span>
                </div>
              </div>

              {/* Row 3 */}
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400 font-medium">EV (价值偏差)</span>
                <span
                  className={`text-xl font-mono font-black ${
                    diff > 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {diff > 0 ? '+' : ''}
                  {diff.toFixed(1)}%
                </span>
              </div>

              {/* Conclusion Box */}
              <div
                className={`mt-4 p-4 rounded-xl border text-center transition-all duration-500 ${
                  Math.abs(diff) > 5
                    ? 'bg-green-500/10 border-green-500/20 text-green-400 shadow-[0_0_20px_rgba(34,197,94,0.1)]'
                    : 'bg-slate-950 border-slate-800/50 text-slate-500'
                }`}
              >
                {diff > 5 ? (
                  <div>
                    <div className="text-2xl mb-1">💰</div>
                    <div className="font-bold text-sm tracking-wide">{teamA} 被低估</div>
                    <div className="text-xs opacity-70 mt-1 font-mono uppercase">
                      Strong Buy Signal
                    </div>
                  </div>
                ) : diff < -5 ? (
                  <div>
                    <div className="text-2xl mb-1">💰</div>
                    <div className="font-bold text-sm tracking-wide">{teamB} 被低估</div>
                    <div className="text-xs opacity-70 mt-1 font-mono uppercase">
                      Strong Buy Signal
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-2xl mb-1">🛡️</div>
                    <div className="font-bold text-sm tracking-wide">市场定价合理</div>
                    <div className="text-xs opacity-70 mt-1 font-mono uppercase">
                      No Clear Edge
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 3. SCHEDULE & FATIGUE (New Panel) */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-lg">
          <h3 className="font-bold text-white mb-6 flex items-center gap-2 text-lg">
            <span>📅</span> 赛程与疲劳度分析
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FatigueCard team={teamA} days={getRestDaysText(teamA)} />
            <FatigueCard team={teamB} days={getRestDaysText(teamB)} />
          </div>
        </div>

        {/* 4. ADVANCED STATS COMPARISON (New Panel) */}
        {advancedStatsA && advancedStatsB && (
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-lg">
            <h3 className="font-bold text-white mb-6 flex items-center gap-2 text-lg">
              <span>📈</span> 高级数据对比
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Offensive */}
              <div className="bg-slate-950 rounded-xl p-5 border border-slate-800 hover:border-slate-700 transition-colors">
                <div className="text-xs font-bold text-slate-500 uppercase mb-5 text-center tracking-widest">
                  进攻效率
                </div>
                <StatRow
                  label="3P%"
                  valA={advancedStatsA.threePointPct}
                  valB={advancedStatsB.threePointPct}
                  suffix="%"
                />
                <StatRow
                  label="eFG%"
                  valA={advancedStatsA.effectiveFGPct}
                  valB={advancedStatsB.effectiveFGPct}
                  suffix="%"
                />
                <StatRow
                  label="Assists"
                  valA={advancedStatsA.avgAssists}
                  valB={advancedStatsB.avgAssists}
                />
              </div>
              {/* Defensive */}
              <div className="bg-slate-950 rounded-xl p-5 border border-slate-800 hover:border-slate-700 transition-colors">
                <div className="text-xs font-bold text-slate-500 uppercase mb-5 text-center tracking-widest">
                  防守效率
                </div>
                <StatRow
                  label="Steals"
                  valA={advancedStatsA.avgSteals}
                  valB={advancedStatsB.avgSteals}
                />
                <StatRow
                  label="Blocks"
                  valA={advancedStatsA.avgBlocks}
                  valB={advancedStatsB.avgBlocks}
                />
                <StatRow
                  label="Def Reb"
                  valA={advancedStatsA.avgDefensiveRebounds}
                  valB={advancedStatsB.avgDefensiveRebounds}
                />
              </div>
              {/* Key Metrics */}
              <div className="bg-slate-950 rounded-xl p-5 border border-slate-800 hover:border-slate-700 transition-colors">
                <div className="text-xs font-bold text-slate-500 uppercase mb-5 text-center tracking-widest">
                  关键指标
                </div>
                <StatRow
                  label="TO Ratio"
                  valA={advancedStatsA.assistTurnoverRatio}
                  valB={advancedStatsB.assistTurnoverRatio}
                  inverse
                />
                <StatRow label="Net Rtg" valA={advancedStatsA.nbaRating} valB={advancedStatsB.nbaRating} />
              </div>
            </div>
          </div>
        )}

        {/* 5. RECENT FORM & H2H & INJURIES GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Performance (30 Days) */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-lg flex flex-col">
            <h3 className="font-bold text-white mb-6 text-lg">近期表现 (30天)</h3>
            
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="text-xs font-bold text-slate-500 mb-2">{teamA}</div>
                <div className="flex gap-1.5 flex-wrap">
                  {stats?.recentForm.teamA.split('').map((r, i) => (
                    <span
                      key={i}
                      className={`w-6 h-6 flex items-center justify-center text-[10px] font-black rounded ${
                        r === 'W'
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="text-xs font-bold text-slate-500 mb-2">{teamB}</div>
                <div className="flex gap-1.5 flex-wrap">
                  {stats?.recentForm.teamB.split('').map((r, i) => (
                    <span
                      key={i}
                      className={`w-6 h-6 flex items-center justify-center text-[10px] font-black rounded ${
                        r === 'W'
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
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
              <div className="h-64 w-full mt-auto">
                <div className="text-xs text-center text-slate-500 mb-2">历史胜率分布</div>
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
                      <Cell fill="#2563eb" />
                      <Cell fill="#dc2626" />
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#1e293b',
                        borderRadius: '8px',
                        color: '#fff'
                      }}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            
            {/* Scoring Trend Line */}
            <div className="h-48 w-full mt-8">
              <div className="text-xs text-center text-slate-500 mb-2">近期得分趋势</div>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis hide dataKey="name" />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#1e293b',
                      borderRadius: '8px',
                      color: '#fff'
                    }}
                  />
                  {/* ✅ FIX START: 添加 connectNulls={true} */}
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
                    stroke="#dc2626" 
                    strokeWidth={2} 
                    dot={false} 
                    connectNulls={true} 
                  />
                  {/* ✅ FIX END */}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Injury Tracker (Fixed Crash) */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-lg h-[700px] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-bold text-white flex items-center gap-2 text-lg">
                <span className="text-red-500">🚑</span> 伤病名单
              </h3>
              <span className="text-xs text-slate-500 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                Live Data
              </span>
            </div>

            {enhancedData?.injuries ? (
              <div className="space-y-8 overflow-y-auto custom-scrollbar flex-1 pr-2">
                {enhancedData.injuries.map((teamInj) => (
                  <div key={teamInj.teamId}>
                    <div className="flex items-center gap-2 mb-3 sticky top-0 bg-slate-900 py-2 z-10 border-b border-slate-800">
                      <img
                        src={getTeamLogoUrl(teamInj.teamName)}
                        className="w-5 h-5 object-contain"
                        alt=""
                      />
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        {teamInj.teamName}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {teamInj.injuries.length === 0 ? (
                        <div className="text-xs font-medium text-green-400 bg-green-500/10 p-3 rounded-lg border border-green-500/20 text-center">
                          全员健康 ✅
                        </div>
                      ) : (
                        teamInj.injuries.map((p) => {
                          // ---------------------------------------
                          // 🛠️ FIX: 安全地处理 status 字段
                          // ---------------------------------------
                          let statusStr = 'Unknown';
                          if (typeof p.status === 'string') {
                            statusStr = p.status;
                          } else if (p.status && typeof p.status === 'object') {
                            // 尝试获取对象中的文本描述
                            statusStr =
                              (p.status as any).type ||
                              (p.status as any).abbreviation ||
                              'Unknown';
                          }
                          
                          const isOut = statusStr.toLowerCase().includes('out');
                          
                          return (
                            <div
                              key={p.athleteId}
                              className="flex items-center gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors group"
                            >
                              <div className="w-10 h-10 bg-slate-900 rounded-full overflow-hidden border border-slate-800 shrink-0 group-hover:border-slate-600 transition-colors">
                                {p.headshot ? (
                                  <img
                                    src={p.headshot}
                                    className="w-full h-full object-cover"
                                    alt={p.athleteName}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs text-slate-600">
                                    ?
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-sm text-slate-200 truncate">
                                  {p.athleteName}
                                </div>
                                <div className="text-[10px] text-slate-500 truncate">
                                  {p.position}
                                  {typeof p.details === 'string' && p.details
                                    ? ` • ${p.details}`
                                    : ''}
                                </div>
                              </div>
                              <span
                                className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${
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
              <div className="flex flex-col items-center justify-center h-full text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
                <span className="text-2xl mb-2">🔍</span>
                <span>暂无伤病数据</span>
              </div>
            )}
          </div>
        </div>

        {/* 6. RESTORED: RECENT GAMES TABLE */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-lg">
          <h3 className="font-bold text-white mb-6 text-lg">全部近期比赛 (Last 30)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-400">
              <thead className="text-xs text-slate-500 uppercase bg-slate-950/50 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4 font-bold rounded-tl-xl">日期</th>
                  <th className="px-6 py-4 font-bold">主队</th>
                  <th className="px-6 py-4 font-bold text-center">比分</th>
                  <th className="px-6 py-4 font-bold rounded-tr-xl text-right">客队</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {h2hGames.map((game, index) => (
                  <tr key={index} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 font-mono text-slate-500">{game.date}</td>
                    <td className="px-6 py-4">
                      <div
                        className={`flex items-center gap-2 ${
                          game.home === game.winner ? 'font-bold text-white' : ''
                        }`}
                      >
                        {game.home === game.winner && (
                          <span className="text-yellow-500">👑</span>
                        )}
                        {game.home}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="bg-slate-950 border border-slate-800 px-3 py-1 rounded font-mono font-bold text-slate-300">
                        {game.homeScore} - {game.awayScore}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div
                        className={`flex items-center justify-end gap-2 ${
                          game.away === game.winner ? 'font-bold text-white' : ''
                        }`}
                      >
                        {game.away}
                        {game.away === game.winner && (
                          <span className="text-yellow-500">👑</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        
        {/* 7. ANALYSIS REASONING */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-lg">
          <h3 className="font-bold text-white mb-4 text-lg">分析结论</h3>
          <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
            {prediction?.reasoning.map((text, i) => (
              <div
                key={i}
                className="flex gap-3 p-2 hover:bg-slate-950/50 rounded-lg transition-colors"
              >
                <span className="text-purple-400 font-bold mt-0.5">•</span>
                <span>{text}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-500 flex justify-between items-center">
            <span>* 数据来源: Polymarket 实时赔率, ESPN 官方数据及历史统计。</span>
            <span className="font-mono opacity-50">V 2.5.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sub Components ---

function FatigueCard({ team, days }: { team: string; days: string }) {
  return (
    <div className="bg-slate-950 rounded-xl p-5 border border-slate-800 hover:border-slate-700 transition-all group">
      <div className="flex justify-between items-center mb-3">
        <span className="font-bold text-slate-200 group-hover:text-white transition-colors">
          {team}
        </span>
        <span
          className={`text-xs px-2 py-1 rounded border font-medium ${
            days.includes('1')
              ? 'bg-red-500/10 text-red-400 border-red-500/20'
              : 'bg-green-500/10 text-green-400 border-green-500/20'
          }`}
        >
          {days.includes('1') ? '⚠️ 背靠背' : '✅ 休息充足'}
        </span>
      </div>
      <div className="text-sm text-slate-400 flex items-baseline gap-2">
        <span className="text-slate-500 text-xs uppercase font-bold">Rest Days</span>
        <span className="font-mono text-white text-lg">{days.replace(' 天', '')}</span>
        <span className="text-xs text-slate-600">days</span>
      </div>
      <div className="mt-3 h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${
            days.includes('1') ? 'bg-red-500' : 'bg-green-500'
          }`}
          style={{ width: days.includes('1') ? '10%' : '100%' }}
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
  
  // 假设值越高越好，除非设置了 inverse
  const isABetter = inverse ? valA < valB : valA > valB;

  return (
    <div className="flex justify-between items-center mb-3 text-sm last:mb-0">
      <span
        className={`font-mono font-bold ${
          isABetter ? 'text-green-400' : 'text-slate-500'
        }`}
      >
        {valA.toFixed(1)}
        {suffix}
      </span>
      <span className="text-[10px] font-bold text-slate-600 uppercase bg-slate-900 px-2 py-0.5 rounded">
        {label}
      </span>
      <span
        className={`font-mono font-bold ${
          !isABetter ? 'text-green-400' : 'text-slate-500'
        }`}
      >
        {valB.toFixed(1)}
        {suffix}
      </span>
    </div>
  );
}