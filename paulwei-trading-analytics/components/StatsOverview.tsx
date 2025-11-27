'use client';

import React from 'react';
import { TradingStats, AccountSummary } from '@/lib/types';
import {
    Wallet,
    TrendingUp,
    TrendingDown,
    BarChart3,
    Target,
    Percent,
    Clock,
    DollarSign,
    Activity,
    Zap,
    PieChart,
    ArrowUpRight,
    ArrowDownRight
} from 'lucide-react';

interface StatsOverviewProps {
    stats: TradingStats;
    account: AccountSummary | null;
}

function StatCard({
    icon: Icon,
    label,
    value,
    subValue,
    color = 'blue',
    trend
}: {
    icon: React.ElementType;
    label: string;
    value: string;
    subValue?: string;
    color?: 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'emerald' | 'rose';
    trend?: 'up' | 'down';
}) {
    const colorStyles = {
        blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        red: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        rose: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    };

    return (
        <div className="glass-panel rounded-xl p-5 hover-card group h-full transition-all duration-300">
            <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl border ${colorStyles[color]} backdrop-blur-md`}>
                    <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{label}</p>
                    <div className="flex items-end gap-2">
                        <p className="text-xl font-bold tracking-tight text-gray-100 leading-none">{value}</p>
                        {trend && (
                            <div className={`flex items-center text-xs font-bold mb-0.5 ${trend === 'up' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {trend === 'up'
                                    ? <ArrowUpRight className="w-3.5 h-3.5" />
                                    : <ArrowDownRight className="w-3.5 h-3.5" />
                                }
                            </div>
                        )}
                    </div>
                    {subValue && (
                        <p className="text-[10px] text-gray-500 mt-2 font-medium truncate opacity-80">{subValue}</p>
                    )}
                </div>
            </div>
        </div>
    );
}

export function StatsOverview({ stats, account }: StatsOverviewProps) {
    const currentPosition = account?.positions?.[0];

    // 计算账户净值 (余额 + 未实现盈亏)
    // bitmex_account_summary.json 中的数据已经是 BTC 单位
    const equity = account
        ? (account.wallet.marginBalance + account.wallet.unrealisedPnl)
        : 0;

    return (
        <div className="space-y-6 animate-fade-in">
            {/* 顶部账户状态卡片 */}
            {account && (
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-900/40 via-blue-900/30 to-black border border-white/10 shadow-2xl group">
                    {/* 动态光效背景 */}
                    <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl group-hover:bg-blue-500/30 transition-all duration-700"></div>
                    <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl group-hover:bg-purple-500/30 transition-all duration-700"></div>

                    <div className="relative p-6 md:p-8">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">

                            {/* 左侧：资金信息 */}
                            <div className="space-y-6 flex-1">
                                <div>
                                    <p className="text-blue-300/70 text-xs font-bold mb-2 flex items-center gap-2 uppercase tracking-widest">
                                        <Wallet className="w-4 h-4" /> 账户总权益 (Total Equity)
                                    </p>
                                    <div className="flex items-baseline gap-3">
                                        <p className="text-5xl font-mono font-bold tracking-tighter text-white text-glow-blue">
                                            {equity.toFixed(4)}
                                        </p>
                                        <span className="text-xl font-bold text-blue-400/60">BTC</span>
                                    </div>
                                </div>

                                <div className="flex gap-6">
                                    <div>
                                        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">可用保证金</p>
                                        <p className="text-lg font-mono font-medium text-gray-300">
                                            {account.wallet.availableMargin.toFixed(4)} <span className="text-xs text-gray-600">BTC</span>
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">未实现盈亏 (UPNL)</p>
                                        <p className={`text-lg font-mono font-medium flex items-center gap-1 ${account.wallet.unrealisedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                            }`}>
                                            {account.wallet.unrealisedPnl >= 0 ? '+' : ''}{account.wallet.unrealisedPnl.toFixed(4)}
                                            <span className="text-xs text-gray-600">BTC</span>
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* 右侧：当前持仓信息 (如果有) */}
                            {currentPosition && currentPosition.currentQty !== 0 && (
                                <div className="bg-white/5 backdrop-blur-md rounded-xl p-5 border border-white/10 min-w-[300px]">
                                    <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                            <p className="text-sm font-bold text-gray-200">
                                                {currentPosition.displaySymbol || currentPosition.symbol}
                                            </p>
                                        </div>
                                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide ${currentPosition.currentQty > 0
                                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                            }`}>
                                            {currentPosition.currentQty > 0 ? '做多 LONG' : '做空 SHORT'}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">仓位大小</p>
                                            <p className="text-base font-mono font-bold text-white">
                                                {Math.abs(currentPosition.currentQty).toLocaleString()} <span className="text-[10px] text-gray-500">USD</span>
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">开仓均价</p>
                                            <p className="text-base font-mono font-bold text-white">
                                                ${currentPosition.avgEntryPrice.toLocaleString()}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">强平价格</p>
                                            <p className="text-base font-mono font-bold text-rose-400">
                                                ${currentPosition.liquidationPrice.toLocaleString()}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">回报率 (ROE)</p>
                                            <p className={`text-base font-mono font-bold ${account.wallet.unrealisedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                {((account.wallet.unrealisedPnl / account.wallet.marginBalance) * 100).toFixed(2)}%
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* 核心绩效指标网格 */}
            <div>
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-200">
                    <Activity className="w-5 h-5 text-blue-500" />
                    核心绩效指标 (Key Metrics)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                        icon={DollarSign}
                        label="总已实现盈亏 (Realized PnL)"
                        value={`${stats.totalRealizedPnl >= 0 ? '+' : ''}${stats.totalRealizedPnl.toFixed(4)} BTC`}
                        color={stats.totalRealizedPnl >= 0 ? 'emerald' : 'rose'}
                        trend={stats.totalRealizedPnl >= 0 ? 'up' : 'down'}
                    />
                    <StatCard
                        icon={Zap}
                        label="净资金费 (Net Funding)"
                        value={`${stats.totalFunding >= 0 ? '+' : ''}${stats.totalFunding.toFixed(4)} BTC`}
                        subValue={`已付: ${stats.fundingPaid.toFixed(4)} | 已收: ${stats.fundingReceived.toFixed(4)}`}
                        color={stats.totalFunding >= 0 ? 'emerald' : 'amber'}
                    />
                    <StatCard
                        icon={Target}
                        label="胜率 (Win Rate)"
                        value={`${stats.winRate.toFixed(1)}%`}
                        subValue={`${stats.winningTrades} 胜 / ${stats.losingTrades} 负`}
                        color={stats.winRate >= 50 ? 'emerald' : 'rose'}
                    />
                    <StatCard
                        icon={BarChart3}
                        label="盈亏比 (Profit Factor)"
                        value={stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}
                        subValue={`均赢: ${stats.avgWin.toFixed(4)} | 均亏: ${stats.avgLoss.toFixed(4)}`}
                        color={stats.profitFactor >= 1.5 ? 'emerald' : stats.profitFactor >= 1 ? 'amber' : 'rose'}
                    />
                </div>
            </div>

            {/* 交易活跃度与订单分析 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 左侧：活跃度 */}
                <div>
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-200">
                        <Clock className="w-5 h-5 text-purple-500" />
                        交易活跃度 (Activity)
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <StatCard
                            icon={Activity}
                            label="总交易次数"
                            value={stats.totalTrades.toLocaleString()}
                            subValue={`跨越 ${stats.tradingDays} 个交易日`}
                            color="blue"
                        />
                        <StatCard
                            icon={Clock}
                            label="日均交易"
                            value={stats.avgTradesPerDay.toFixed(1)}
                            subValue="笔 / 天"
                            color="purple"
                        />
                        <StatCard
                            icon={Percent}
                            label="成交率 (Fill Rate)"
                            value={`${stats.fillRate.toFixed(1)}%`}
                            subValue={`${stats.filledOrders.toLocaleString()} 成交 / ${stats.totalOrders.toLocaleString()} 总单`}
                            color="emerald"
                        />
                        <StatCard
                            icon={Wallet}
                            label="总手续费支出"
                            value={`${stats.totalFees.toFixed(4)} BTC`}
                            color="amber"
                        />
                    </div>
                </div>

                {/* 右侧：订单分析 */}
                <div>
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-200">
                        <PieChart className="w-5 h-5 text-amber-500" />
                        订单分布分析 (Orders)
                    </h3>
                    <div className="glass-panel rounded-xl p-6 h-[calc(100%-2.5rem)] flex flex-col justify-center">
                        <div className="grid grid-cols-3 gap-4 mb-8">
                            <div className="text-center p-4 rounded-xl bg-white/5 border border-white/5">
                                <p className="text-2xl font-mono font-bold text-blue-400 mb-1">{stats.limitOrders.toLocaleString()}</p>
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">限价单 (Limit)</p>
                                <p className="text-xs text-blue-400/60 font-bold mt-1">{stats.limitOrderPercent.toFixed(1)}%</p>
                            </div>
                            <div className="text-center p-4 rounded-xl bg-white/5 border border-white/5">
                                <p className="text-2xl font-mono font-bold text-purple-400 mb-1">{stats.marketOrders.toLocaleString()}</p>
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">市价单 (Market)</p>
                                <p className="text-xs text-purple-400/60 font-bold mt-1">{(100 - stats.limitOrderPercent).toFixed(1)}%</p>
                            </div>
                            <div className="text-center p-4 rounded-xl bg-white/5 border border-white/5">
                                <p className="text-2xl font-mono font-bold text-amber-400 mb-1">{stats.canceledOrders.toLocaleString()}</p>
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">已撤单 (Canceled)</p>
                                <p className="text-xs text-amber-400/60 font-bold mt-1">{stats.cancelRate.toFixed(1)}%</p>
                            </div>
                        </div>

                        {/* 订单类型比例条 */}
                        <div className="space-y-3">
                            <div className="flex justify-between text-xs font-bold text-gray-400 uppercase tracking-wider">
                                <span className="text-blue-400">挂单 (Maker)</span>
                                <span className="text-purple-400">吃单 (Taker)</span>
                            </div>
                            <div className="h-3 rounded-full bg-gray-800 overflow-hidden flex ring-1 ring-white/10">
                                <div
                                    className="bg-blue-500 h-full shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-all duration-1000"
                                    style={{ width: `${stats.limitOrderPercent}%` }}
                                />
                                <div
                                    className="bg-purple-500 h-full shadow-[0_0_15px_rgba(168,85,247,0.5)] transition-all duration-1000"
                                    style={{ width: `${100 - stats.limitOrderPercent}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}