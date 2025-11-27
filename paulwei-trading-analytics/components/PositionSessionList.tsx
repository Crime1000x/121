'use client';

import React from 'react';
import { PositionSession, formatDuration } from '@/lib/types';
import { TrendingUp, TrendingDown, Clock, BarChart3, ArrowRight, Calendar } from 'lucide-react';

interface PositionSessionListProps {
    sessions: PositionSession[];
    onSelectSession: (session: PositionSession) => void;
}

export function PositionSessionList({ sessions, onSelectSession }: PositionSessionListProps) {
    if (!sessions || sessions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500 bg-white/5 rounded-2xl border border-white/10 border-dashed animate-fade-in">
                <BarChart3 className="w-12 h-12 mb-4 opacity-20" />
                <p>暂无历史仓位记录</p>
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-fade-in">
            {sessions.map((session) => {
                const isLong = session.side === 'long';
                const isProfit = session.netPnl >= 0;

                // 修正收益率计算逻辑：区分做多和做空
                let pnlPercent = 0;
                if (session.avgEntryPrice > 0 && session.avgExitPrice > 0) {
                    if (isLong) {
                        pnlPercent = ((session.avgExitPrice - session.avgEntryPrice) / session.avgEntryPrice) * 100;
                    } else {
                        pnlPercent = ((session.avgEntryPrice - session.avgExitPrice) / session.avgEntryPrice) * 100;
                    }
                }

                return (
                    <div
                        key={session.id}
                        onClick={() => onSelectSession(session)}
                        className="glass-panel rounded-xl p-1 cursor-pointer group hover:border-blue-500/30 transition-all duration-300"
                    >
                        <div className="bg-black/20 rounded-lg p-5 group-hover:bg-black/30 transition-colors">

                            {/* 顶部 Header: 标的、方向、盈亏 */}
                            <div className="flex justify-between items-start mb-5">
                                <div className="flex items-center gap-4">
                                    {/* 标的图标 */}
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ring-1 shadow-lg backdrop-blur-md ${isLong
                                            ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
                                            : 'bg-rose-500/10 text-rose-400 ring-rose-500/20'
                                        }`}>
                                        {isLong ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                                    </div>

                                    {/* 标的信息 */}
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-bold text-lg text-gray-100 tracking-wide">
                                                {session.displaySymbol || session.symbol}
                                            </span>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${isLong
                                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                                }`}>
                                                {session.side === 'long' ? '做多' : '做空'}
                                            </span>
                                            {session.status === 'open' && (
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-pulse">
                                                    持仓中
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-gray-500 font-mono">
                                            <span className="flex items-center gap-1.5">
                                                <Calendar size={12} /> {new Date(session.openTime).toLocaleDateString()}
                                            </span>
                                            {session.closeTime && (
                                                <span className="opacity-60">→ {new Date(session.closeTime).toLocaleDateString()}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* 盈亏大数字 */}
                                <div className="text-right">
                                    <div className={`text-2xl font-mono font-bold tracking-tight ${isProfit ? 'text-emerald-400 text-glow-green' : 'text-rose-400 text-glow-red'
                                        }`}>
                                        {isProfit ? '+' : ''}{session.netPnl.toFixed(4)} <span className="text-sm opacity-60 text-gray-400">BTC</span>
                                    </div>
                                    {session.status === 'closed' && (
                                        <div className={`text-xs font-medium mt-1 ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                                            {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 分割线 */}
                            <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-4" />

                            {/* 核心数据网格 */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-2">
                                <div>
                                    <div className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider font-semibold">开仓均价</div>
                                    <div className="text-sm font-mono font-bold text-gray-300">
                                        ${session.avgEntryPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider font-semibold">平仓均价</div>
                                    <div className="text-sm font-mono font-bold text-gray-300">
                                        {session.avgExitPrice > 0
                                            ? `$${session.avgExitPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
                                            : '-'}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider font-semibold">最大持仓</div>
                                    <div className="text-sm font-mono font-bold text-gray-300">
                                        {session.maxSize.toLocaleString()}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider font-semibold">持仓时长</div>
                                    <div className="text-sm font-bold text-gray-300 flex items-center gap-1.5">
                                        <Clock size={12} className="text-gray-600" />
                                        {formatDuration(session.durationMs)}
                                    </div>
                                </div>
                            </div>

                            {/* 底部操作栏 */}
                            <div className="flex justify-between items-center mt-5 pt-3 border-t border-white/5">
                                <div className="flex items-center gap-2 text-xs text-gray-500 bg-white/5 px-2 py-1 rounded border border-white/5">
                                    <BarChart3 size={12} />
                                    <span>共 {session.tradeCount} 笔交易执行</span>
                                </div>
                                <div className="flex items-center gap-1 text-xs font-bold text-blue-400 opacity-80 group-hover:opacity-100 transition-all group-hover:translate-x-1">
                                    查看详细复盘 <ArrowRight size={14} />
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}