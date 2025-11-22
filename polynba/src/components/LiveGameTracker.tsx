/**
 * 实时比分和赔率组件
 * 
 * 功能：
 * 1. 显示实时比分
 * 2. 显示 Polymarket 实时赔率
 * 3. 赔率历史趋势图
 * 4. 自动刷新（比赛进行中）
 * 
 * 使用方式：
 * 在详情页添加 <LiveGameTracker /> 组件
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface LiveScore {
  homeScore: number;
  awayScore: number;
  period: number; // 1-4 节，5+ 表示加时
  clock: string; // 剩余时间，如 "5:23"
  isHalftime: boolean;
  isFinal: boolean;
  isInProgress: boolean;
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

  // 获取实时比分
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

  // 获取实时赔率
  const fetchLiveOdds = useCallback(async () => {
    try {
      const res = await fetch(`/api/polymarket?marketId=${marketId}`);
      if (res.ok) {
        const markets = await res.json();
        const market = markets.find((m: any) => m.marketId === marketId);
        if (market) {
          setCurrentOdds(market.prices);
          
          // 添加到历史记录
          const snapshot: OddsSnapshot = {
            timestamp: Date.now(),
            teamAOdds: market.prices.yes * 100,
            teamBOdds: market.prices.no * 100,
          };
          
          setOddsHistory(prev => {
            const updated = [...prev, snapshot];
            // 只保留最近 100 个数据点
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

  // 初始加载
  useEffect(() => {
    fetchLiveScore();
    fetchLiveOdds();
  }, [fetchLiveScore, fetchLiveOdds]);

  // 自动刷新（比赛进行中时每30秒更新）
  useEffect(() => {
    if (!liveScore?.isInProgress) return;

    const interval = setInterval(() => {
      fetchLiveScore();
      fetchLiveOdds();
    }, 30000); // 30秒

    return () => clearInterval(interval);
  }, [liveScore?.isInProgress, fetchLiveScore, fetchLiveOdds]);

  // 如果没有比赛数据或比赛未开始，不显示
  if (isLoading) {
    return (
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-lg">
        <div className="flex items-center justify-center h-32">
          <div className="animate-pulse text-slate-500">加载实时数据...</div>
        </div>
      </div>
    );
  }

  if (!liveScore?.isInProgress && !liveScore?.isFinal) {
    return null; // 比赛未开始，不显示
  }

  // 确定主客队
  const homeTeam = isTeamAHome === true ? teamA : isTeamAHome === false ? teamB : teamA;
  const awayTeam = isTeamAHome === true ? teamB : isTeamAHome === false ? teamA : teamB;
  const homeScore = isTeamAHome === true ? liveScore.homeScore : liveScore.awayScore;
  const awayScore = isTeamAHome === true ? liveScore.awayScore : liveScore.homeScore;

  // 计算赔率变化
  const oddsChange = oddsHistory.length > 1
    ? currentOdds!.yes * 100 - oddsHistory[0].teamAOdds
    : 0;

  // 准备图表数据
  const chartData = oddsHistory.map(snap => ({
    time: new Date(snap.timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    [teamA]: snap.teamAOdds,
    [teamB]: snap.teamBOdds,
  }));

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 rounded-2xl border border-slate-800 p-6 shadow-2xl">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-bold text-white text-lg flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            {liveScore.isInProgress && (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </>
            )}
            {liveScore.isFinal && <span className="inline-flex rounded-full h-3 w-3 bg-green-500"></span>}
          </span>
          {liveScore.isFinal ? '🏁 比赛结束' : '🔴 比赛直播'}
        </h3>
        
        {lastUpdate && (
          <span className="text-xs text-slate-500">
            更新于 {lastUpdate.toLocaleTimeString('zh-CN')}
          </span>
        )}
      </div>

      {/* 比分板 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* 主队 */}
        <div className={`text-center p-6 rounded-xl border-2 transition-all ${
          homeScore > awayScore && !liveScore.isHalftime
            ? 'bg-purple-500/10 border-purple-500/50'
            : 'bg-slate-950 border-slate-800'
        }`}>
          <div className="text-sm text-slate-400 mb-2 flex items-center justify-center gap-1">
            🏠 {homeTeam}
          </div>
          <div className="text-5xl font-black text-white mb-1">
            {homeScore}
          </div>
          {currentOdds && (
            <div className="text-xs text-slate-500">
              赔率: {isTeamAHome === true 
                ? (currentOdds.yes * 100).toFixed(1) 
                : (currentOdds.no * 100).toFixed(1)}%
            </div>
          )}
        </div>

        {/* 比赛状态 */}
        <div className="flex flex-col items-center justify-center text-center">
          {liveScore.isHalftime ? (
            <>
              <div className="text-2xl font-bold text-orange-400 mb-2">中场休息</div>
              <div className="text-sm text-slate-500">HALFTIME</div>
            </>
          ) : liveScore.isFinal ? (
            <>
              <div className="text-2xl font-bold text-green-400 mb-2">终场</div>
              <div className="text-sm text-slate-500">FINAL</div>
            </>
          ) : (
            <>
              <div className="text-3xl font-bold text-red-400 mb-2">
                Q{liveScore.period}
              </div>
              <div className="text-xl font-mono text-white mb-1">
                {liveScore.clock}
              </div>
              <div className="text-xs text-slate-500">剩余时间</div>
            </>
          )}
        </div>

        {/* 客队 */}
        <div className={`text-center p-6 rounded-xl border-2 transition-all ${
          awayScore > homeScore && !liveScore.isHalftime
            ? 'bg-sky-500/10 border-sky-500/50'
            : 'bg-slate-950 border-slate-800'
        }`}>
          <div className="text-sm text-slate-400 mb-2 flex items-center justify-center gap-1">
            ✈️ {awayTeam}
          </div>
          <div className="text-5xl font-black text-white mb-1">
            {awayScore}
          </div>
          {currentOdds && (
            <div className="text-xs text-slate-500">
              赔率: {isTeamAHome === false
                ? (currentOdds.yes * 100).toFixed(1)
                : (currentOdds.no * 100).toFixed(1)}%
            </div>
          )}
        </div>
      </div>

      {/* 赔率变化趋势 */}
      {chartData.length > 2 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-slate-300">实时赔率走势</h4>
            <div className="flex items-center gap-2 text-xs">
              <span className={`px-2 py-1 rounded ${
                oddsChange > 0
                  ? 'bg-green-500/20 text-green-400'
                  : oddsChange < 0
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-slate-800 text-slate-400'
              }`}>
                {oddsChange > 0 ? '↑' : oddsChange < 0 ? '↓' : '→'} 
                {Math.abs(oddsChange).toFixed(1)}%
              </span>
            </div>
          </div>
          
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="time" 
                stroke="#94a3b8" 
                tick={{ fontSize: 10 }}
              />
              <YAxis 
                stroke="#94a3b8" 
                domain={[0, 100]}
                tick={{ fontSize: 10 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                }}
                formatter={(value: number) => `${value.toFixed(1)}%`}
              />
              <Line
                type="monotone"
                dataKey={teamA}
                stroke="#8b5cf6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey={teamB}
                stroke="#0ea5e9"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 市场情绪指标 */}
      {currentOdds && (
        <div className="mt-6 grid grid-cols-2 gap-4">
          <div className="bg-slate-950 rounded-lg p-4 border border-slate-800">
            <div className="text-xs text-slate-500 mb-2">市场预期</div>
            <div className="text-2xl font-bold text-purple-400">
              {(currentOdds.yes * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-slate-600">{teamA} 胜</div>
          </div>
          
          <div className="bg-slate-950 rounded-lg p-4 border border-slate-800">
            <div className="text-xs text-slate-500 mb-2">市场预期</div>
            <div className="text-2xl font-bold text-sky-400">
              {(currentOdds.no * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-slate-600">{teamB} 胜</div>
          </div>
        </div>
      )}
    </div>
  );
}