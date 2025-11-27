'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Trade, PositionSession } from '@/lib/types';
import { TradeList } from './TradeList';
import { PositionSessionList } from './PositionSessionList';
import { PositionDetail } from './PositionDetail';
import { StatsOverview } from './StatsOverview';
import { MonthlyPnLChart } from './MonthlyPnLChart';
import { EquityCurve } from './EquityCurve';
import { TVChartRealtime } from './TVChartRealtime';
import { RealtimeStatus, RealtimeTradeFeed } from './RealtimeStatus';
import { useRealtimeData, useRealtimePrice } from '@/hooks/useRealtimeDataServer';
import {
    Loader2,
    ChevronLeft,
    ChevronRight,
    LayoutList,
    History,
    BarChart3,
    TrendingUp,
    Activity,
    Radio,
    Shield,
    ShieldOff,
} from 'lucide-react';

type ViewMode = 'overview' | 'positions' | 'trades' | 'live';

export function Dashboard() {
    const [trades, setTrades] = useState<Trade[]>([]);
    const [sessions, setSessions] = useState<PositionSession[]>([]);
    const [chartData, setChartData] = useState<{ candles: any[], markers: any[] }>({ candles: [], markers: [] });
    const [chartLoading, setChartLoading] = useState(true);
    const [stats, setStats] = useState<any>(null);
    const [account, setAccount] = useState<any>(null);
    const [equityCurve, setEquityCurve] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedSymbol, setSelectedSymbol] = useState('BTCUSD');
    const [timeframe, setTimeframe] = useState<string>('1d');
    const [viewMode, setViewMode] = useState<ViewMode>('overview');
    const [allTrades, setAllTrades] = useState<Trade[]>([]);
    const [selectedSession, setSelectedSession] = useState<PositionSession | null>(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [realtimeEnabled, setRealtimeEnabled] = useState(false);
    const limit = 20;

    // 实时数据 Hook (使用服务端认证)
    const {
        isConnected,
        isAuthenticated,
        lastCandle,
        lastTrade,
        recentTrades,
        error: wsError,
        reconnect,
        serverHasCredentials,
    } = useRealtimeData({
        symbol: selectedSymbol,
        timeframe,
        enabled: realtimeEnabled,
    });

    // 实时价格
    const { price: realtimePrice } = useRealtimePrice(selectedSymbol);

    // 转换实时 K 线为图表格式
    const realtimeCandleForChart = useMemo(() => {
        if (!lastCandle) return null;
        return lastCandle;
    }, [lastCandle]);

    // 转换实时交易为图表标记格式
    const realtimeTradeForChart = useMemo(() => {
        if (!lastTrade) return null;
        return {
            time: Math.floor(new Date(lastTrade.datetime).getTime() / 1000),
            side: lastTrade.side,
            price: lastTrade.price,
            amount: lastTrade.amount,
        };
    }, [lastTrade]);

    // Helper function to align time to timeframe bucket
    const alignToTimeframe = (timestamp: number, tf: string): number => {
        const date = new Date(timestamp * 1000);

        switch (tf) {
            case '1m':
                date.setSeconds(0, 0);
                break;
            case '5m':
                date.setMinutes(Math.floor(date.getMinutes() / 5) * 5, 0, 0);
                break;
            case '15m':
                date.setMinutes(Math.floor(date.getMinutes() / 15) * 15, 0, 0);
                break;
            case '30m':
                date.setMinutes(Math.floor(date.getMinutes() / 30) * 30, 0, 0);
                break;
            case '1h':
                date.setMinutes(0, 0, 0);
                break;
            case '4h':
                date.setHours(Math.floor(date.getHours() / 4) * 4, 0, 0, 0);
                break;
            case '1d':
                date.setHours(0, 0, 0, 0);
                break;
            case '1w':
                const day = date.getDay();
                const diff = date.getDate() - day + (day === 0 ? -6 : 1);
                date.setDate(diff);
                date.setHours(0, 0, 0, 0);
                break;
        }

        return Math.floor(date.getTime() / 1000);
    };

    // Generate chart markers from trades or selected session
    const chartMarkers = useMemo(() => {
        const tradesToMark = selectedSession ? selectedSession.trades : allTrades;

        if (!tradesToMark || tradesToMark.length === 0 || chartData.candles.length === 0) {
            return [];
        }

        let minTime = Infinity;
        let maxTime = -Infinity;
        for (const candle of chartData.candles) {
            if (candle.time < minTime) minTime = candle.time;
            if (candle.time > maxTime) maxTime = candle.time;
        }

        const bucketMap = new Map<string, { buys: number; sells: number; buyQty: number; sellQty: number; avgBuyPrice: number; avgSellPrice: number }>();

        tradesToMark.forEach(trade => {
            const tradeTime = Math.floor(new Date(trade.datetime).getTime() / 1000);

            if (tradeTime < minTime || tradeTime > maxTime) {
                return;
            }

            const bucketTime = alignToTimeframe(tradeTime, timeframe);
            const key = `${bucketTime}-${trade.side}`;

            if (!bucketMap.has(key)) {
                bucketMap.set(key, { buys: 0, sells: 0, buyQty: 0, sellQty: 0, avgBuyPrice: 0, avgSellPrice: 0 });
            }

            const bucket = bucketMap.get(key)!;
            if (trade.side === 'buy') {
                bucket.buyQty += trade.amount;
                bucket.avgBuyPrice = (bucket.avgBuyPrice * bucket.buys + trade.price) / (bucket.buys + 1);
                bucket.buys++;
            } else {
                bucket.sellQty += trade.amount;
                bucket.avgSellPrice = (bucket.avgSellPrice * bucket.sells + trade.price) / (bucket.sells + 1);
                bucket.sells++;
            }
        });

        const sortedCandleTimes = chartData.candles.map(c => c.time).sort((a, b) => a - b);
        const candleTimeSet = new Set(sortedCandleTimes);

        const findClosestCandleTime = (time: number): number | null => {
            if (candleTimeSet.has(time)) return time;
            if (sortedCandleTimes.length === 0) return null;

            let left = 0;
            let right = sortedCandleTimes.length - 1;

            while (left < right) {
                const mid = Math.floor((left + right) / 2);
                if (sortedCandleTimes[mid] < time) {
                    left = mid + 1;
                } else {
                    right = mid;
                }
            }

            const timeframeSeconds: Record<string, number> = {
                '1m': 60, '5m': 300, '15m': 900, '30m': 1800,
                '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800,
            };
            const window = timeframeSeconds[timeframe] || 3600;

            let closest: number | null = null;
            let minDiff = Infinity;

            for (const idx of [left - 1, left, left + 1]) {
                if (idx >= 0 && idx < sortedCandleTimes.length) {
                    const diff = Math.abs(sortedCandleTimes[idx] - time);
                    if (diff < minDiff && diff <= window) {
                        minDiff = diff;
                        closest = sortedCandleTimes[idx];
                    }
                }
            }

            return closest;
        };

        const markers: any[] = [];
        bucketMap.forEach((bucket, key) => {
            const [timeStr, side] = key.split('-');
            const rawTime = parseInt(timeStr);

            const time = findClosestCandleTime(rawTime);
            if (time === null) return;

            if (side === 'buy' && bucket.buys > 0) {
                markers.push({
                    time,
                    position: 'belowBar',
                    color: '#10b981',
                    shape: 'arrowUp',
                    text: `BUY ${bucket.buyQty.toLocaleString()} @ $${bucket.avgBuyPrice.toLocaleString(undefined, { maximumFractionDigits: 1 })}`
                });
            }
            if (side === 'sell' && bucket.sells > 0) {
                markers.push({
                    time,
                    position: 'aboveBar',
                    color: '#ef4444',
                    shape: 'arrowDown',
                    text: `SELL ${bucket.sellQty.toLocaleString()} @ $${bucket.avgSellPrice.toLocaleString(undefined, { maximumFractionDigits: 1 })}`
                });
            }
        });

        return markers.sort((a, b) => a.time - b.time);
    }, [selectedSession, allTrades, timeframe, chartData.candles]);

    // Load Stats and Account Data
    useEffect(() => {
        async function loadStats() {
            try {
                const res = await fetch('/api/trades?type=stats');
                if (!res.ok) throw new Error('Failed to fetch stats');
                const data = await res.json();
                setStats(data.stats);
                setAccount(data.account);
            } catch (err) {
                console.error('Error loading stats:', err);
            }
        }
        loadStats();
    }, []);

    // Load Equity Curve
    useEffect(() => {
        async function loadEquity() {
            try {
                const res = await fetch('/api/trades?type=equity');
                if (!res.ok) throw new Error('Failed to fetch equity');
                const data = await res.json();
                setEquityCurve(data.equityCurve);
            } catch (err) {
                console.error('Error loading equity:', err);
            }
        }
        loadEquity();
    }, []);

    // Load all trades for markers
    useEffect(() => {
        async function loadAllTrades() {
            try {
                const res = await fetch(`/api/trades?symbol=${encodeURIComponent(selectedSymbol)}&limit=10000`);
                if (!res.ok) throw new Error('Failed to fetch trades');
                const data = await res.json();
                setAllTrades(data.trades || []);
            } catch (err) {
                console.error('Error loading trades for markers:', err);
            }
        }
        loadAllTrades();
    }, [selectedSymbol]);

    // Calculate visible range for chart when a session is selected
    const selectedSessionRange = useMemo(() => {
        if (!selectedSession) return null;

        const sessionStart = Math.floor(new Date(selectedSession.openTime).getTime() / 1000);
        const sessionEnd = selectedSession.closeTime
            ? Math.floor(new Date(selectedSession.closeTime).getTime() / 1000)
            : Math.floor(Date.now() / 1000);
        const sessionDuration = sessionEnd - sessionStart;

        const paddingMultiplier: Record<string, number> = {
            '1m': 0.3, '5m': 0.5, '15m': 1, '30m': 2,
            '1h': 3, '4h': 5, '1d': 10, '1w': 20,
        };
        const padding = Math.max(sessionDuration * (paddingMultiplier[timeframe] || 1), 3600 * 6);

        return {
            from: sessionStart - padding,
            to: sessionEnd + padding,
        };
    }, [selectedSession, timeframe]);

    // Load OHLCV Chart Data
    useEffect(() => {
        async function loadChartData() {
            setChartLoading(true);
            try {
                const url = `/api/ohlcv?symbol=${encodeURIComponent(selectedSymbol)}&timeframe=${timeframe}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error('Failed to fetch OHLCV data');
                const data = await res.json();
                console.log(`Loaded ${data.candles?.length || 0} candles for ${selectedSymbol} ${timeframe}`);
                setChartData({ candles: data.candles || [], markers: [] });
            } catch (err) {
                console.error('Error loading OHLCV:', err);
                setChartData({ candles: [], markers: [] });
            } finally {
                setChartLoading(false);
            }
        }
        loadChartData();
    }, [selectedSymbol, timeframe]);

    // Load Table Data
    useEffect(() => {
        async function loadData() {
            if (viewMode === 'overview' || viewMode === 'live') {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                const typeParam = viewMode === 'positions' ? '&type=sessions' : '';
                const res = await fetch(`/api/trades?page=${page}&limit=${limit}&symbol=${encodeURIComponent(selectedSymbol)}${typeParam}`);
                if (!res.ok) throw new Error('Failed to fetch data');
                const data = await res.json();

                if (viewMode === 'positions') {
                    setSessions(data.sessions);
                    setTotalPages(Math.ceil(data.total / limit));
                } else {
                    setTrades(data.trades);
                    setTotalPages(Math.ceil(data.total / limit));
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [page, selectedSymbol, viewMode]);

    // Reset selected session when switching views
    useEffect(() => {
        setSelectedSession(null);
    }, [viewMode, selectedSymbol]);

    // Handler to select a session
    const handleSelectSession = async (session: PositionSession) => {
        try {
            const res = await fetch(`/api/trades?sessionId=${encodeURIComponent(session.id)}`);
            if (!res.ok) throw new Error('Failed to fetch session details');
            const data = await res.json();
            setSelectedSession(data.session);
        } catch (err) {
            console.error('Error fetching session:', err);
            setSelectedSession(session);
        }
    };

    if (loading && !stats) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background">
                <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Loading analytics...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen text-destructive">
                Error: {error}
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground p-4 md:p-8 font-sans selection:bg-primary/20">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-border">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
                            BitMEX Analytics
                        </h1>
                        <p className="text-muted-foreground mt-1 font-medium">
                            {account?.user?.username ? `@${account.user.username}` : 'Portfolio'} • 2020-05-01 to Present
                        </p>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                        {/* View Mode Tabs */}
                        <div className="flex bg-secondary/30 backdrop-blur-sm rounded-xl p-1 border border-white/5">
                            <button
                                onClick={() => { setViewMode('overview'); setPage(1); }}
                                className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${viewMode === 'overview'
                                    ? 'bg-primary/10 text-primary shadow-[0_0_10px_rgba(59,130,246,0.2)] ring-1 ring-primary/20'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                                    }`}
                            >
                                <BarChart3 size={16} className="mr-2" /> Overview
                            </button>
                            <button
                                onClick={() => { setViewMode('live'); setRealtimeEnabled(true); }}
                                className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${viewMode === 'live'
                                    ? 'bg-emerald-500/10 text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)] ring-1 ring-emerald-500/20'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                                    }`}
                            >
                                <Radio size={16} className="mr-2" /> Live
                            </button>
                            <button
                                onClick={() => { setViewMode('positions'); setPage(1); }}
                                className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${viewMode === 'positions'
                                    ? 'bg-primary/10 text-primary shadow-[0_0_10px_rgba(59,130,246,0.2)] ring-1 ring-primary/20'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                                    }`}
                            >
                                <History size={16} className="mr-2" /> Positions
                            </button>
                            <button
                                onClick={() => { setViewMode('trades'); setPage(1); }}
                                className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${viewMode === 'trades'
                                    ? 'bg-primary/10 text-primary shadow-[0_0_10px_rgba(59,130,246,0.2)] ring-1 ring-primary/20'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                                    }`}
                            >
                                <LayoutList size={16} className="mr-2" /> Trades
                            </button>
                        </div>

                        {/* Symbol Selector */}
                        <div className="relative">
                            <select
                                value={selectedSymbol}
                                onChange={(e) => {
                                    setSelectedSymbol(e.target.value);
                                    setPage(1);
                                }}
                                className="appearance-none pl-4 pr-10 py-2.5 bg-secondary/30 border border-white/5 rounded-xl text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all hover:bg-secondary/50 cursor-pointer"
                            >
                                <option value="BTCUSD">BTCUSD</option>
                                <option value="ETHUSD">ETHUSD</option>
                            </select>
                            <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-muted-foreground">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                        </div>

                        {/* Server API Status Indicator */}
                        <div
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${serverHasCredentials
                                    ? 'bg-emerald-500/10 border-emerald-500/20'
                                    : 'bg-secondary/30 border-white/5'
                                }`}
                            title={serverHasCredentials ? 'API 已配置在服务器' : 'API 未配置'}
                        >
                            {serverHasCredentials ? (
                                <>
                                    <Shield size={16} className="text-emerald-500" />
                                    <span className="text-xs font-medium text-emerald-500">API Ready</span>
                                </>
                            ) : (
                                <>
                                    <ShieldOff size={16} className="text-muted-foreground" />
                                    <span className="text-xs font-medium text-muted-foreground">Public Only</span>
                                </>
                            )}
                        </div>
                    </div>
                </header>

                {/* Live Mode */}
                {viewMode === 'live' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Realtime Status Bar */}
                        <RealtimeStatus
                            isConnected={isConnected}
                            isAuthenticated={isAuthenticated}
                            currentPrice={realtimePrice}
                            symbol={selectedSymbol}
                            onReconnect={reconnect}
                            error={wsError}
                        />

                        {/* Live Chart */}
                        <div className="glass rounded-xl p-6 hover-card">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-semibold flex items-center gap-2 text-foreground">
                                    <Activity className="w-5 h-5 text-emerald-500" />
                                    Live Chart
                                    <span className="text-muted-foreground text-sm font-normal ml-2">{selectedSymbol}</span>
                                    {isConnected && (
                                        <span className="relative flex h-2 w-2 ml-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                        </span>
                                    )}
                                </h3>
                                <div className="flex bg-secondary/30 rounded-lg p-1 border border-white/5 overflow-x-auto">
                                    {(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'] as const).map((tf) => (
                                        <button
                                            key={tf}
                                            onClick={() => setTimeframe(tf)}
                                            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${timeframe === tf
                                                ? 'bg-emerald-500/10 text-emerald-500 shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                                                }`}
                                        >
                                            {tf.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <TVChartRealtime
                                data={chartData.candles}
                                markers={chartMarkers}
                                loading={chartLoading}
                                visibleRange={null}
                                realtimeCandle={realtimeCandleForChart}
                                realtimeTrade={realtimeTradeForChart}
                            />
                        </div>

                        {/* Live Trade Feed */}
                        {isAuthenticated && (
                            <div className="glass rounded-xl p-6 hover-card">
                                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-foreground">
                                    <Radio className="w-5 h-5 text-emerald-500" />
                                    Live Trade Feed
                                </h3>
                                <RealtimeTradeFeed trades={recentTrades} maxItems={15} />
                            </div>
                        )}

                        {!isAuthenticated && isConnected && !serverHasCredentials && (
                            <div className="glass rounded-xl p-6 text-center">
                                <ShieldOff className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                                <h4 className="text-lg font-semibold mb-2">API 未配置</h4>
                                <p className="text-muted-foreground text-sm mb-4">
                                    在服务器的 <code className="bg-secondary/50 px-2 py-0.5 rounded">.env.local</code> 文件中配置 API 密钥以启用实时交易追踪。
                                </p>
                                <div className="bg-secondary/30 rounded-lg p-4 text-left text-sm font-mono">
                                    <p className="text-muted-foreground"># .env.local</p>
                                    <p>BITMEX_API_KEY=your_key</p>
                                    <p>BITMEX_API_SECRET=your_secret</p>
                                </div>
                            </div>
                        )}

                        {!isAuthenticated && isConnected && serverHasCredentials && (
                            <div className="glass rounded-xl p-6 text-center">
                                <Loader2 className="w-8 h-8 text-primary mx-auto mb-4 animate-spin" />
                                <p className="text-muted-foreground">正在连接认证...</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Overview Mode */}
                {viewMode === 'overview' && stats && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <StatsOverview stats={stats} account={account} />

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="glass rounded-xl p-6 hover-card">
                                <h3 className="text-lg font-semibold mb-6 flex items-center gap-2 text-foreground">
                                    <TrendingUp className="w-5 h-5 text-primary" />
                                    Equity Curve
                                </h3>
                                <EquityCurve data={equityCurve} />
                            </div>
                            <div className="glass rounded-xl p-6 hover-card">
                                <h3 className="text-lg font-semibold mb-6 flex items-center gap-2 text-foreground">
                                    <BarChart3 className="w-5 h-5 text-primary" />
                                    Monthly PnL
                                </h3>
                                <MonthlyPnLChart data={stats.monthlyPnl} />
                            </div>
                        </div>

                        {/* Price Chart */}
                        <div className="glass rounded-xl p-6 hover-card">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-semibold flex items-center gap-2 text-foreground">
                                    <Activity className="w-5 h-5 text-primary" />
                                    Price Action <span className="text-muted-foreground text-sm font-normal ml-2">{selectedSymbol}</span>
                                </h3>
                                <div className="flex bg-secondary/30 rounded-lg p-1 border border-white/5 overflow-x-auto">
                                    {(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'] as const).map((tf) => (
                                        <button
                                            key={tf}
                                            onClick={() => setTimeframe(tf)}
                                            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${timeframe === tf
                                                ? 'bg-primary/10 text-primary shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                                                }`}
                                        >
                                            {tf.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <TVChartRealtime
                                data={chartData.candles}
                                markers={chartMarkers}
                                loading={chartLoading}
                                visibleRange={null}
                            />
                        </div>
                    </div>
                )}

                {/* Positions/Trades Mode */}
                {(viewMode === 'positions' || viewMode === 'trades') && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Chart Section */}
                        <section className="glass rounded-xl p-6">
                            <div className="flex justify-between items-center mb-6">
                                {selectedSession ? (
                                    <div className="flex items-center gap-3 px-4 py-2 bg-primary/10 rounded-xl border border-primary/20">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                                        </span>
                                        <span className="text-sm font-medium text-primary">
                                            Viewing Position: {selectedSession.side.toUpperCase()} {selectedSession.maxSize.toLocaleString()}
                                        </span>
                                    </div>
                                ) : (
                                    <h3 className="text-lg font-semibold flex items-center gap-2 text-foreground">
                                        <Activity className="w-5 h-5 text-primary" />
                                        {selectedSymbol} Chart
                                    </h3>
                                )}
                                <div className="flex bg-secondary/30 rounded-lg p-1 border border-white/5 overflow-x-auto">
                                    {(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'] as const).map((tf) => (
                                        <button
                                            key={tf}
                                            onClick={() => setTimeframe(tf)}
                                            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${timeframe === tf
                                                ? 'bg-primary/10 text-primary shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                                                }`}
                                        >
                                            {tf.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <TVChartRealtime
                                data={chartData.candles}
                                markers={chartMarkers}
                                loading={chartLoading}
                                visibleRange={selectedSessionRange}
                            />
                        </section>

                        {/* Data Section */}
                        <section>
                            {selectedSession ? (
                                <PositionDetail
                                    session={selectedSession}
                                    ohlcvData={chartData.candles}
                                    onBack={() => setSelectedSession(null)}
                                />
                            ) : (
                                <>
                                    <div className="flex justify-between items-center mb-6">
                                        <h2 className="text-xl font-bold tracking-tight text-foreground">
                                            {viewMode === 'trades' ? 'Trade Log' : 'Position History'}
                                        </h2>

                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                                disabled={page === 1}
                                                className="p-2 rounded-lg border border-white/10 hover:bg-secondary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <ChevronLeft size={20} />
                                            </button>
                                            <span className="text-sm font-medium px-2 text-muted-foreground">
                                                Page {page} of {totalPages}
                                            </span>
                                            <button
                                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                                disabled={page === totalPages}
                                                className="p-2 rounded-lg border border-white/10 hover:bg-secondary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <ChevronRight size={20} />
                                            </button>
                                        </div>
                                    </div>

                                    {viewMode === 'trades' ? (
                                        <div className="glass rounded-xl overflow-hidden border border-white/5">
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
