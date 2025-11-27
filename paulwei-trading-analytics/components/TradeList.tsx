'use client';

import React from 'react';
import { Trade } from '@/lib/types';
import { FileX, TrendingUp, TrendingDown } from 'lucide-react';

interface TradeListProps {
    trades: Trade[];
}

export function TradeList({ trades }: TradeListProps) {
    if (!trades || trades.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-white/5 rounded-xl border border-white/10 border-dashed">
                <FileX className="w-10 h-10 mb-3 opacity-20" />
                <p>暂无交易记录</p>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full text-left border-collapse">
                <thead>
                    <tr className="bg-black/20 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-white/5">
                        <th className="px-6 py-4">时间 (Date)</th>
                        <th className="px-6 py-4">标的 (Symbol)</th>
                        <th className="px-6 py-4">方向 (Side)</th>
                        <th className="px-6 py-4 text-right">价格 (Price)</th>
                        <th className="px-6 py-4 text-right">数量 (Size)</th>
                        <th className="px-6 py-4 text-right">价值 (Value)</th>
                        <th className="px-6 py-4 text-right">手续费 (Fee)</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                    {trades.map((trade) => {
                        // 计算价值和手续费 (假设 cost 是 satoshis)
                        const valueBTC = Math.abs(trade.cost) / 100000000;
                        const feeBTC = (trade.fee?.cost || 0) / 100000000;
                        const isBuy = trade.side === 'buy' || trade.side === 'Buy';

                        return (
                            <tr key={trade.id} className="hover:bg-white/5 transition-colors group">
                                {/* 时间 */}
                                <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-gray-400 group-hover:text-gray-300 transition-colors">
                                    {new Date(trade.datetime).toLocaleString()}
                                </td>

                                {/* 标的 */}
                                <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-200">
                                    {trade.displaySymbol || trade.symbol}
                                </td>

                                {/* 方向 */}
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${isBuy
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                        }`}>
                                        {isBuy ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                        {trade.side.toUpperCase()}
                                    </span>
                                    {trade.executionCount && trade.executionCount > 1 && (
                                        <span className="ml-2 text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
                                            {trade.executionCount} fills
                                        </span>
                                    )}
                                </td>

                                {/* 价格 */}
                                <td className="px-6 py-4 text-right font-mono font-medium text-gray-300">
                                    ${trade.price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                </td>

                                {/* 数量 */}
                                <td className="px-6 py-4 text-right font-mono font-medium text-blue-200">
                                    {trade.amount.toLocaleString()}
                                </td>

                                {/* 价值 */}
                                <td className="px-6 py-4 text-right font-mono text-gray-400">
                                    {valueBTC.toFixed(4)} <span className="text-[10px] opacity-50">BTC</span>
                                </td>

                                {/* 手续费 */}
                                <td className={`px-6 py-4 text-right font-mono font-bold ${feeBTC > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                    {feeBTC > 0 ? '' : '+'}{feeBTC.toFixed(6)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}