/**
 * 实时比分组件 - 霓虹/玻璃拟态重构版 (中文适配)
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface LiveScore {
  homeScore: number;
  awayScore: number;
  period: number;
  clock: string;
  isHalftime: boolean;
  isFinal: boolean;
  isInProgress: boolean;
  homeTeamName?: string;
}

interface OddsSnapshot {
  timestamp: number;
  teamAOdds: number;
  teamBOdds: number;
}

interface LiveGameTrackerProps {
  eventId: string;
  marketId: string;
  teamA: string;
  teamB: string;
  isTeamAHome: boolean | null;
}

export default function LiveGameTracker({
  eventId,
  marketId,
  teamA,
  teamB,
  isTeamAHome,
}: LiveGameTrackerProps) {
  const [liveScore, setLiveScore] = useState<LiveScore | null>(null);
  const [currentOdds, setCurrentOdds] = useState<{ yes: number; no: number } | null>(null);
  const [oddsHistory, setOddsHistory] = useState<OddsSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchLiveScore = useCallback(async () => {
    try {
      const res = await fetch(`/api/live-score?eventId=${eventId}`);
      if (res.ok) {
        const data = await res.json();
        setLiveScore(data);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch live score:', error);
    }
  }, [eventId]);

  const fetchLiveOdds = useCallback(async () => {
    try {
      const res = await fetch(`/api/polymarket?marketId=${marketId}`);
      if (res.ok) {
        const markets = await res.json();
        const market = markets.find((m: any) => m.marketId === marketId);
        if (market) {
          setCurrentOdds(market.prices);
          
          const snapshot: OddsSnapshot = {
            timestamp: Date.now(),
            teamAOdds: market.prices.yes * 100,
            teamBOdds: market.prices.no * 100,
          };
          
          setOddsHistory(prev => {
            const updated = [...prev, snapshot];
            return updated.slice(-100);
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch live odds:', error);
    } finally {
      setIsLoading(false);
    }
  }, [marketId]);

  useEffect(() => {
    fetchLiveScore();
    fetchLiveOdds();
  }, [fetchLiveScore, fetchLiveOdds]);

  useEffect(() => {
    if (!liveScore?.isInProgress) return;
    const interval = setInterval(() => {
      fetchLiveScore();
      fetchLiveOdds();
    }, 30000);
    return () => clearInterval(interval);
  }, [liveScore?.isInProgress, fetchLiveScore, fetchLiveOdds]);

  if (isLoading) {
    return (
      <div className="bg-[#0a0a0a]/60 rounded-2xl border border-white/5 p-6 h-32 flex items-center justify-center">
        <div className="flex items-center gap-3 text-white/30 text-xs font-mono animate-pulse">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            正在连接实时数据...
        </div>
      </div>
    );
  }

  if (!liveScore?.isInProgress && !liveScore?.isFinal) {
    return null;
  }

  const scoreA = isTeamAHome ? liveScore.homeScore : liveScore.awayScore;
  const scoreB = isTeamAHome ? liveScore.awayScore : liveScore.homeScore;

  const iconA = isTeamAHome ? '🏠' : '✈️';
  const iconB = isTeamAHome ? '✈️' : '🏠';

  const oddsA = currentOdds ? (currentOdds.yes * 100).toFixed(1) : '0.0';
  const oddsB = currentOdds ? (currentOdds.no * 100).toFixed(1) : '0.0';

  const oddsChange = oddsHistory.length > 1
    ? currentOdds!.yes * 100 - oddsHistory[0].teamAOdds
    : 0;

  const chartData = oddsHistory.map(snap => ({
    time: new Date(snap.timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }),
    [teamA]: snap.teamAOdds,
    [teamB]: snap.teamBOdds,
  }));

  return (
    <div className="bg-[#0a0a0a]/60 backdrop-blur-xl rounded-[24px] border border-white/5 p-8 shadow-2xl relative overflow-hidden group">
      
      {/* 状态栏 */}
      <div className="flex items-center justify-between mb-8">
        <h3 className="font-bold text-white text-sm uppercase tracking-widest flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            {liveScore.isInProgress && (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-600 shadow-[0_0_10px_#ef4444]"></span>
              </>
            )}
            {liveScore.isFinal && <span className="inline-flex rounded-full h-3 w-3 bg-emerald-500 shadow-[0_0_10px_#10b981]"></span>}
          </span>
          {liveScore.isFinal ? '比赛结束' : '实时赛况'}
        </h3>
        
        {lastUpdate && (
          <span className="text-[10px] font-mono text-white/30">
            更新时间: {lastUpdate.toLocaleTimeString('zh-CN')}
          </span>
        )}
      </div>

      {/* 比分板 */}
      <div className="grid grid-cols-3 gap-6 mb-8 items-center">
        {/* Team A */}
        <div className={`relative p-6 rounded-2xl border transition-all duration-500 ${
          scoreA > scoreB && !liveScore.isHalftime
            ? 'bg-blue-600/10 border-blue-500/30 shadow-[0_0_30px_-10px_rgba(37,99,235,0.3)]'
            : 'bg-white/[0.02] border-white/5'
        }`}>
          <div className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3 flex items-center justify-center gap-2">
            {iconA} {teamA}
          </div>
          <div className="text-6xl font-black text-white text-center tracking-tighter drop-shadow-lg mb-2">
            {scoreA}
          </div>
          <div className="text-center">
             <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
               胜率 {oddsA}%
             </span>
          </div>
        </div>

        {/* 比赛时间 */}
        <div className="flex flex-col items-center justify-center text-center">
          {liveScore.isHalftime ? (
            <>
              <div className="text-2xl font-black text-orange-400 mb-1 tracking-tight">HT</div>
              <div className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">中场休息</div>
            </>
          ) : liveScore.isFinal ? (
            <>
              <div className="text-2xl font-black text-emerald-400 mb-1 tracking-tight">END</div>
              <div className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">最终比分</div>
            </>
          ) : (
            <>
              <div className="text-4xl font-black text-white mb-2 tracking-tighter font-mono">
                第{liveScore.period}节
              </div>
              <div className="text-lg font-mono text-red-500 font-bold animate-pulse">
                {liveScore.clock}
              </div>
            </>
          )}
        </div>

        {/* Team B */}
        <div className={`relative p-6 rounded-2xl border transition-all duration-500 ${
          scoreB > scoreA && !liveScore.isHalftime
            ? 'bg-red-600/10 border-red-500/30 shadow-[0_0_30px_-10px_rgba(220,38,38,0.3)]'
            : 'bg-white/[0.02] border-white/5'
        }`}>
          <div className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3 flex items-center justify-center gap-2">
            {iconB} {teamB}
          </div>
          <div className="text-6xl font-black text-white text-center tracking-tighter drop-shadow-lg mb-2">
            {scoreB}
          </div>
          <div className="text-center">
             <span className="text-[10px] font-mono text-red-400 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
               胜率 {oddsB}%
             </span>
          </div>
        </div>
      </div>

      {/* 赔率趋势图 */}
      {chartData.length > 2 && (
        <div className="mt-8 pt-8 border-t border-white/5">
          <div className="flex items-center justify-between mb-6">
            <h4 className="text-xs font-black text-white/40 uppercase tracking-widest">实时胜率走势</h4>
            <div className={`px-2 py-1 rounded-md border text-[10px] font-mono font-bold flex items-center gap-1 ${
                oddsChange > 0
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : oddsChange < 0
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  : 'bg-white/5 text-white/40 border-white/10'
              }`}>
                {oddsChange > 0 ? '↑' : oddsChange < 0 ? '↓' : '→'} 
                {Math.abs(oddsChange).toFixed(1)}%
            </div>
          </div>
          
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
              <XAxis 
                dataKey="time" 
                stroke="#666" 
                tick={{ fontSize: 9, fontFamily: 'monospace' }}
                axisLine={false}
                tickLine={false}
                minTickGap={30}
              />
              <YAxis 
                stroke="#666" 
                domain={[0, 100]}
                tick={{ fontSize: 9, fontFamily: 'monospace' }}
                axisLine={false}
                tickLine={false}
                hide
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#000',
                  border: '1px solid #333',
                  borderRadius: '8px',
                  fontSize: '11px',
                }}
                formatter={(value: number) => `${value.toFixed(1)}%`}
                labelStyle={{ color: '#888', marginBottom: '4px' }}
              />
              <Line
                type="monotone"
                dataKey={teamA}
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                name={teamA}
              />
              <Line
                type="monotone"
                dataKey={teamB}
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                name={teamB}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}