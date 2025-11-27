'use client';

import React from 'react';
import { PositionSession, formatDuration } from '@/lib/types';
import { TrendingUp, TrendingDown, Clock, Calendar } from 'lucide-react';

interface PositionHistoryProps {
    sessions: PositionSession[];
}

export function PositionHistory({ sessions }: PositionHistoryProps) {
    if (!sessions || sessions.length === 0) {
        return (
            <div className="text-center py-12 text-muted-foreground bg-white/5 rounded-xl border border-white/10 border-dashed">
                暂无历史仓位数据
            </div>
        );
    }

    return (
        <div className="overflow-x-auto rounded-xl border border-white/5">
            <table className="min-w-full text-left border-collapse">
                <thead>
                    <tr className="bg-black/20 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-white/5">
                        <th className="px-6 py-4">标的 (Symbol)</th>
                        <th className="px-6 py-4">方向 (Side)</th>
                        <th className="px-6 py-4">开仓时间 (Open)</th>
                        <th className="px-6 py-4">持仓时长 (Duration)</th>
                        <th className="px-6 py-4 text-right">最大仓位 (Max Size)</th>
                        <th className="px-6 py-4 text-right">开仓均价 (Entry)</th>
                        <th className="px-6 py-4 text-right">平仓均价 (Exit)</th>
                        <th className="px-6 py-4 text-right">净收益 (Net PnL)</th>
                        <th className="px-6 py-4 text-center">状态 (Status)</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                    {sessions.map((session) => {
                        const isLong = session.side === 'long';
                        const isProfit = session.netPnl >= 0;
                        const isOpen = session.status === 'open';

                        return (
                            <tr key={session.id} className="hover:bg-white/5 transition-colors group">
                                {/* Symbol */}
                                <td className="px-6 py-4 font-bold text-gray-200">
                                    {session.symbol}
                                </td>

                                {/* Side */}
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold uppercase ${isLong
                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                        }`}>
                                        {isLong ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                        {session.side === 'long' ? '做多' : '做空'}
                                    </span>
                                </td>

                                {/* Open Time */}
                                <td className="px-6 py-4 text-gray-400 whitespace-nowrap font-mono text-xs">
                                    <div className="flex items-center gap-2">
                                        <Calendar size={12} className="opacity-50" />
                                        {new Date(session.openTime).toLocaleString()}
                                    </div>
                                </td>

                                {/* Duration / Close Time */}
                                <td className="px-6 py-4 text-gray-400 whitespace-nowrap font-mono text-xs">
                                    <div className="flex items-center gap-2">
                                        <Clock size={12} className="opacity-50" />
                                        {isOpen ? '持仓中' : formatDuration(session.durationMs)}
                                    </div>
                                </td>

                                {/* Max Size */}
                                <td className="px-6 py-4 text-right font-mono text-gray-300">
                                    {session.maxSize.toLocaleString()}
                                </td>

                                {/* Entry Price */}
                                <td className="px-6 py-4 text-right font-mono text-gray-300">
                                    ${session.avgEntryPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                </td>

                                {/* Exit Price */}
                                <td className="px-6 py-4 text-right font-mono text-gray-400">
                                    {session.avgExitPrice > 0
                                        ? `$${session.avgExitPrice.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
                                        : '-'
                                    }
                                </td>

                                {/* Net PnL */}
                                <td className={`px-6 py-4 text-right font-mono font-bold ${isProfit ? 'text-emerald-400 text-glow-green' : 'text-rose-400 text-glow-red'}`}>
                                    {isProfit ? '+' : ''}{session.netPnl.toFixed(6)} <span className="text-xs font-normal opacity-50">BTC</span>
                                </td>

                                {/* Status */}
                                <td className="px-6 py-4 text-center">
                                    <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-bold rounded-full uppercase tracking-wide ${isOpen
                                            ? 'bg-blue-500/20 text-blue-400 animate-pulse'
                                            : 'bg-gray-500/20 text-gray-400'
                                        }`}>
                                        {isOpen ? '持仓中' : '已平仓'}
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}