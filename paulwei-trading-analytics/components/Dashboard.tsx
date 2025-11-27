'use client';

import React, { useEffect, useState } from 'react';
import { Trade, PositionSession } from '@/lib/types';
import { TradeList } from './TradeList';
import { PositionSessionList } from './PositionSessionList';
import { PositionDetail } from './PositionDetail';
import { StatsOverview } from './StatsOverview';
import { MonthlyPnLChart } from './MonthlyPnLChart';
import { EquityCurve } from './EquityCurve';
import { TVChart } from './TVChart';
import {
    LayoutList,
    History,
    BarChart3,
    Wallet,
    Loader2,
    ChevronLeft,
    ChevronRight,
    TrendingUp,
    Activity
} from 'lucide-react';

type ViewMode = 'overview' | 'positions' | 'trades';

export function Dashboard() {
    // --- 状态管理 ---
    const [trades, setTrades] = useState<Trade[]>([]);
    const [sessions, setSessions] = useState<PositionSession[]>([]);
    const [chartData, setChartData] = useState<any[]>([]);
    const [chartLoading, setChartLoading] = useState(true);
    const [stats, setStats] = useState<any>(null);
    const [account, setAccount] = useState<any>(null);
    const [equityCurve, setEquityCurve] = useState<any[]>([]);

    // UI 状态
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('overview');
    const [selectedSession, setSelectedSession] = useState<PositionSession | null>(null);

    // 筛选与分页
    const [selectedSymbol, setSelectedSymbol] = useState('XBTUSD');
    const [timeframe, setTimeframe] = useState<string>('1h');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const limit = 20;

    // --- 数据加载逻辑 ---

    // 1. 初始化加载：概览数据 (Stats, Equity, MonthlyPnL)
    useEffect(() => {
        async function loadOverviewData() {
            try {
                // 并行加载基础数据
                const [tradesRes, syncRes] = await Promise.all([
                    fetch('/api/trades?type=stats'), // 获取统计数据
                    fetch('/api/sync', { method: 'POST' }) // 触发增量同步
                ]);

                if (tradesRes.ok) {
                    const data = await tradesRes.json();
                    setStats(data.stats);
                    setAccount(data.account);
                    // 如果API支持返回 equityCurve，这里设置
                    // 否则单独调用 equity 接口
                }

                // 单独加载权益曲线
                const equityRes = await fetch('/api/trades?type=equity');
                if (equityRes.ok) {
                    const equityData = await equityRes.json();
                    setEquityCurve(equityData.equityCurve);
                }

            } catch (err) {
                console.error("Failed to load overview data:", err);
            } finally {
                setLoading(false);
            }
        }
        loadOverviewData();
    }, []);

    // 2. 加载 K 线数据 (用于首页图表和复盘)
    useEffect(() => {
        async function loadOHLCV() {
            setChartLoading(true);
            try {
                // 注意：这里 symbol 需要根据实际情况传参，BitMEX 上 BTC 通常是 XBTUSD
                const symbolParam = selectedSymbol === 'BTCUSD' ? 'XBTUSD' : selectedSymbol;
                const res = await fetch(`/api/ohlcv?symbol=${symbolParam}&timeframe=${timeframe}`);
                if (res.ok) {
                    const data = await res.json();
                    // 转换数据格式
                    const candles = (data.candles || data.data || []).map((d: any) => ({
                        time: d.timestamp / 1000, // TVChart 需要秒级时间戳
                        open: d.open,
                        high: d.high,
                        low: d.low,
                        close: d.close,
                    }));
                    setChartData(candles);
                }
            } catch (err) {
                console.error("Failed to load OHLCV:", err);
            } finally {
                setChartLoading(false);
            }
        }
        loadOHLCV();
    }, [selectedSymbol, timeframe]);

    // 3. 加载分页列表数据 (仓位/交易)
    useEffect(() => {
        if (viewMode === 'overview') return;

        async function loadListData() {
            setLoading(true);
            try {
                const typeParam = viewMode === 'positions' ? '&type=sessions' : '';
                // 转换 symbol 格式以匹配后端
                const symbolParam = selectedSymbol === 'BTCUSD' ? 'XBTUSD' : selectedSymbol;
                const url = `/api/trades?page=${page}&limit=${limit}&symbol=${symbolParam}${typeParam}`;

                const res = await fetch(url);
                if (!res.ok) throw new Error('Failed to fetch list data');

                const data = await res.json();

                if (viewMode === 'positions') {
                    setSessions(data.sessions || []);
                    setTotalPages(Math.ceil((data.total || 0) / limit));
                } else {
                    setTrades(data.trades || []);
                    setTotalPages(Math.ceil((data.total || 0) / limit));
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : '加载数据失败');
            } finally {
                setLoading(false);
            }
        }
        loadListData();
    }, [viewMode, page, selectedSymbol]);

    // --- 事件处理 ---

    const handleSelectSession = async (session: PositionSession) => {
        // 如果 session 没有详细交易数据，可能需要单独拉取详情
        // 这里假设列表返回的数据已经足够，或者在这里 fetch 详情
        setSelectedSession(session);
    };

    // --- 渲染 ---

    // 1. 加载状态
    if (loading && !stats && viewMode === 'overview') {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-dark)]">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
                <p className="text-blue-400 font-medium animate-pulse">正在初始化量化分析终端...</p>
            </div>
        );
    }

    // 2. 详情页视图 (进入复盘模式)
    if (selectedSession) {
        return (
            <div className="min-h-screen bg-[var(--bg-dark)] p-4 md:p-8">
                <PositionDetail
                    session={selectedSession}
                    ohlcvData={chartData} // 将首页加载的 K 线数据传递进去
                    onBack={() => setSelectedSession(null)}
                />
            </div>
        );
    }

    // 3. 主仪表盘视图
    return (
        <div className="min-h-screen bg-[var(--bg-dark)] text-gray-100 p-4 md:p-8 pb-20 font-sans selection:bg-blue-500/30">
            <div className="max-w-[1600px] mx-auto space-y-8">

                {/* 顶部 Header */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 glass-panel p-6 rounded-2xl relative overflow-hidden">
                    {/* 背景光效 */}
                    <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>

                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-100 to-blue-400 bg-clip-text text-transparent">
                            实盘交易分析系统
                        </h1>
                        <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                            <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/5">
                                <Wallet size={14} />
                                账户余额: <span className="text-emerald-400 font-mono font-bold">{account?.wallet?.walletBalance ? (account.wallet.walletBalance / 100000000).toFixed(4) : '0.0000'} BTC</span>
                            </span>
                            <span>@paulwei • BitMEX Realtime</span>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                        {/* 视图切换 Tabs */}
                        <div className="flex bg-black/20 p-1 rounded-xl border border-white/5 backdrop-blur-md">
                            <TabButton
                                active={viewMode === 'overview'}
                                onClick={() => { setViewMode('overview'); setPage(1); }}
                                icon={<BarChart3 size={16} />}
                                label="数据概览"
                            />
                            <TabButton
                                active={viewMode === 'positions'}
                                onClick={() => { setViewMode('positions'); setPage(1); }}
                                icon={<LayoutList size={16} />}
                                label="仓位历史"
                            />
                            <TabButton
                                active={viewMode === 'trades'}
                                onClick={() => { setViewMode('trades'); setPage(1); }}
                                icon={<History size={16} />}
                                label="交易明细"
                            />
                        </div>

                        {/* 币种选择器 */}
                        <div className="relative">
                            <select
                                value={selectedSymbol}
                                onChange={(e) => { setSelectedSymbol(e.target.value); setPage(1); }}
                                className="appearance-none pl-4 pr-10 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm font-bold text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 hover:bg-white/10 transition-colors cursor-pointer"
                            >
                                <option value="XBTUSD">BTC/USD</option>
                                <option value="ETHUSD">ETH/USD</option>
                            </select>
                            <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                        </div>
                    </div>
                </header>

                {/* 错误提示 */}
                {error && (
                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl flex items-center gap-2">
                        <span className="font-bold">Error:</span> {error}
                    </div>
                )}

                {/* --- 概览视图 (Overview Mode) --- */}
                {viewMode === 'overview' && stats && (
                    <div className="space-y-6 animate-fade-in">
                        {/* 核心指标卡片 */}
                        <StatsOverview stats={stats} account={account} />

                        {/* 图表区域 Row 1 */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="glass-panel rounded-xl p-1 hover-card">
                                <div className="bg-card/40 rounded-lg p-5 h-full">
                                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-200">
                                        <TrendingUp className="w-5 h-5 text-blue-500" />
                                        账户权益曲线 (Equity Curve)
                                    </h3>
                                    <EquityCurve data={equityCurve} />
                                </div>
                            </div>
                            <div className="glass-panel rounded-xl p-1 hover-card">
                                <div className="bg-card/40 rounded-lg p-5 h-full">
                                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-200">
                                        <BarChart3 className="w-5 h-5 text-purple-500" />
                                        月度盈亏 (Monthly PnL)
                                    </h3>
                                    <MonthlyPnLChart data={stats.monthlyPnl || []} />
                                </div>
                            </div>
                        </div>

                        {/* K线图区域 */}
                        <div className="glass-panel rounded-xl p-1">
                            <div className="bg-card/40 rounded-lg p-5">
                                <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
                                    <h3 className="text-lg font-bold flex items-center gap-2 text-gray-200">
                                        <Activity className="w-5 h-5 text-emerald-500" />
                                        行情走势 <span className="text-xs font-normal text-gray-500 ml-2 bg-white/5 px-2 py-0.5 rounded">{selectedSymbol}</span>
                                    </h3>
                                    {/* 时间周期选择器 */}
                                    <div className="flex bg-black/20 rounded-lg p-1 border border-white/5">
                                        {(['1m', '5m', '1h', '4h', '1d'] as const).map((tf) => (
                                            <button
                                                key={tf}
                                                onClick={() => setTimeframe(tf)}
                                                className={`px-3 py-1 rounded text-xs font-medium transition-all ${timeframe === tf
                                                        ? 'bg-blue-600 text-white shadow'
                                                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                                                    }`}
                                            >
                                                {tf.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {chartLoading ? (
                                    <div className="h-[400px] flex items-center justify-center text-gray-500">
                                        <Loader2 className="animate-spin mr-2" /> 加载图表数据...
                                    </div>
                                ) : (
                                    <TVChart data={chartData} />
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- 列表视图 (Positions / Trades Mode) --- */}
                {viewMode !== 'overview' && (
                    <div className="space-y-6 animate-fade-in">
                        <section className="glass-panel rounded-xl p-6">
                            {/* 列表标题栏 & 分页器 */}
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                                    {viewMode === 'positions' ? <LayoutList className="text-blue-500" /> : <History className="text-purple-500" />}
                                    {viewMode === 'positions' ? '历史仓位记录' : '成交明细流水'}
                                </h2>

                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="p-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>
                                    <span className="text-sm font-mono text-gray-400">
                                        Page <span className="text-white font-bold">{page}</span> / {totalPages || 1}
                                    </span>
                                    <button
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages || totalPages === 0}
                                        className="p-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* 列表内容 */}
                            {loading ? (
                                <div className="py-20 flex justify-center">
                                    <Loader2 className="animate-spin text-blue-500 w-8 h-8" />
                                </div>
                            ) : (
                                <>
                                    {viewMode === 'trades' ? (
                                        <div className="rounded-xl overflow-hidden border border-white/5">
                                            <TradeList trades={trades} />
                                        </div>
                                    ) : (
                                        <PositionSessionList
                                            sessions={sessions}
                                            onSelectSession={handleSelectSession}
                                        />
                                    )}
                                </>
                            )}
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
}

// 子组件：Tab 按钮
const TabButton = ({ active, onClick, icon, label }: any) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${active
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
    >
        {icon}
        {label}
    </button>
);