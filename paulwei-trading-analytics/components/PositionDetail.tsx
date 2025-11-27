'use client';

import React, { useState } from 'react';
import { PositionSession, formatDuration } from '@/lib/types';
import { TVChartReplay } from './TVChartReplay';
import {
    ArrowLeft,
    TrendingUp,
    TrendingDown,
    Clock,
    DollarSign,
    Target,
    Layers,
    Receipt,
    Activity,
    Sparkles,
    Bot,
    Zap,
    AlertTriangle,
    Shield,
    Loader2,
    BarChart2,
    PlayCircle
} from 'lucide-react';

interface PositionDetailProps {
    session: PositionSession;
    ohlcvData: any[]; // 需要传入 K 线数据以支持回放
    onBack: () => void;
}

export function PositionDetail({ session, ohlcvData, onBack }: PositionDetailProps) {
    const [showReplay, setShowReplay] = useState(false);
    const [aiAnalysis, setAiAnalysis] = useState<string>('');
    const [loading, setLoading] = useState(false);

    // --- 基础计算逻辑 ---
    const isProfit = session.netPnl >= 0;
    const pnlPercent = session.avgEntryPrice > 0 && session.avgExitPrice > 0
        ? ((session.avgExitPrice - session.avgEntryPrice) / session.avgEntryPrice * 100) * (session.side === 'long' ? 1 : -1)
        : 0;

    // 计算持仓变化流水
    let runningPosition = 0;
    const tradesWithPosition = session.trades.map(trade => {
        const positionBefore = runningPosition;
        if (trade.side === 'buy') {
            runningPosition += trade.amount;
        } else {
            runningPosition -= trade.amount;
        }
        return {
            ...trade,
            positionBefore,
            positionAfter: runningPosition
        };
    });

    // 计算进场评分颜色
    const score = session.efficiency ? Math.round(session.efficiency * 100) : 50;
    const getScoreColor = (s: number) => {
        if (s >= 80) return 'text-emerald-500';
        if (s >= 60) return 'text-blue-500';
        return 'text-amber-500';
    };

    // --- AI 分析调用 ---
    const handleAnalyze = async () => {
        if (aiAnalysis) return;
        setLoading(true);
        try {
            // 注意：这里传入的是 session，后端需要适配处理 PositionSession 类型
            const res = await fetch('/api/ai-analyze', {
                method: 'POST',
                body: JSON.stringify({ position: session }),
            });
            const data = await res.json();
            setAiAnalysis(data.analysis || '⚠️ AI 服务繁忙，请稍后再试');
        } catch (e) {
            setAiAnalysis('❌ 连接失败，请检查网络或 API Key');
        }
        setLoading(false);
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 pb-20">

            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-2.5 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors border border-border group"
                    >
                        <ArrowLeft className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </button>
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
                            {session.displaySymbol || session.symbol}
                            <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${session.side === 'long'
                                    ? 'bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20'
                                    : 'bg-rose-500/10 text-rose-500 ring-1 ring-rose-500/20'
                                }`}>
                                {session.side}
                            </span>
                        </h2>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium mt-0.5">
                            <Clock className="w-3.5 h-3.5" />
                            {new Date(session.openTime).toLocaleString()}
                            {session.closeTime && ` → ${new Date(session.closeTime).toLocaleString()}`}
                        </div>
                    </div>
                </div>

                {/* AI Button & Tags */}
                <div className="flex flex-col items-end gap-2">
                    {!aiAnalysis && !loading && (
                        <button
                            onClick={handleAnalyze}
                            className="group relative px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 hover:scale-105 transition-all overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                            <div className="flex items-center gap-2 relative z-10">
                                <Sparkles size={16} className="text-yellow-300 fill-yellow-300" />
                                Gemini 深度复盘
                            </div>
                        </button>
                    )}
                    <div className="flex gap-2">
                        {session.strategyTags?.map((tag, i) => (
                            <span key={i} className="px-2.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-xs font-medium text-blue-400 flex items-center gap-1.5">
                                <Zap size={10} className="text-yellow-400 fill-yellow-400" /> {tag}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* AI Analysis Result Panel */}
            {(loading || aiAnalysis) && (
                <div className="glass rounded-2xl p-1 animate-in fade-in zoom-in-95 duration-300">
                    <div className="bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-xl p-6 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-6 opacity-5"><Bot size={100} /></div>

                        <div className="flex items-center gap-3 mb-4 relative z-10">
                            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                                {loading ? <Loader2 className="animate-spin" size={20} /> : <Bot size={20} />}
                            </div>
                            <h3 className="text-lg font-bold text-indigo-100">Gemini 交易教练</h3>
                        </div>

                        <div className="prose prose-invert prose-sm max-w-none text-gray-300 whitespace-pre-wrap leading-relaxed relative z-10">
                            {loading ? (
                                <div className="space-y-3 opacity-50 animate-pulse">
                                    <div className="h-2 bg-indigo-400/20 rounded w-3/4"></div>
                                    <div className="h-2 bg-indigo-400/20 rounded w-1/2"></div>
                                    <div className="h-2 bg-indigo-400/20 rounded w-5/6"></div>
                                </div>
                            ) : aiAnalysis}
                        </div>
                    </div>
                </div>
            )}

            {/* 核心数据网格 (Row 1: 基础数据) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* PnL Card */}
                <div className={`glass rounded-2xl p-1 hover-card ${isProfit ? 'ring-1 ring-emerald-500/20' : 'ring-1 ring-rose-500/20'}`}>
                    <div className={`bg-card/40 rounded-xl p-5 h-full ${isProfit ? 'bg-emerald-500/5' : 'bg-rose-500/5'}`}>
                        <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2">
                            <DollarSign className="w-4 h-4" /> Net P&L
                        </div>
                        <div className={`text-2xl font-bold tracking-tight ${isProfit ? 'text-emerald-500 text-glow-green' : 'text-rose-500 text-glow-red'}`}>
                            {isProfit ? '+' : ''}{session.netPnl.toFixed(4)} <span className="text-lg opacity-70">BTC</span>
                        </div>
                        <div className={`text-sm font-medium mt-1 ${isProfit ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                        </div>
                    </div>
                </div>

                {/* Entry/Exit Card */}
                <div className="glass rounded-2xl p-1 hover-card">
                    <div className="bg-card/40 rounded-xl p-5 h-full">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2">
                            <Target className="w-4 h-4" /> Entry → Exit
                        </div>
                        <div className="text-xl font-bold font-mono">
                            ${session.avgEntryPrice.toLocaleString()}
                        </div>
                        <div className="text-sm text-muted-foreground font-medium mt-1 font-mono">
                            → ${session.avgExitPrice > 0 ? session.avgExitPrice.toLocaleString() : 'Open'}
                        </div>
                    </div>
                </div>

                {/* Size Card */}
                <div className="glass rounded-2xl p-1 hover-card">
                    <div className="bg-card/40 rounded-xl p-5 h-full">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2">
                            <Layers className="w-4 h-4" /> Max Size
                        </div>
                        <div className="text-xl font-bold font-mono">
                            {session.maxSize.toLocaleString()}
                        </div>
                        <div className="text-sm text-muted-foreground font-medium mt-1">
                            ~${(session.maxSize).toLocaleString()} USD
                        </div>
                    </div>
                </div>

                {/* Duration Card */}
                <div className="glass rounded-2xl p-1 hover-card">
                    <div className="bg-card/40 rounded-xl p-5 h-full">
                        <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2">
                            <Clock className="w-4 h-4" /> Duration
                        </div>
                        <div className="text-xl font-bold">
                            {formatDuration(session.durationMs)}
                        </div>
                        <div className="text-sm text-muted-foreground font-medium mt-1">
                            {session.tradeCount} trades
                        </div>
                    </div>
                </div>
            </div>

            {/* 风控指标网格 (Row 2: Risk Metrics) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* MAE */}
                <div className="glass rounded-2xl p-1 hover-card">
                    <div className="bg-card/40 rounded-xl p-4 h-full border border-white/5">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold uppercase text-muted-foreground">MAE (最大回撤)</span>
                            <AlertTriangle size={14} className="text-amber-500" />
                        </div>
                        <div className={`text-xl font-bold font-mono ${session.mae && session.mae > 1 ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {session.mae ? session.mae.toFixed(2) : '0.00'}%
                        </div>
                    </div>
                </div>

                {/* MFE */}
                <div className="glass rounded-2xl p-1 hover-card">
                    <div className="bg-card/40 rounded-xl p-4 h-full border border-white/5">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold uppercase text-muted-foreground">MFE (最大浮盈)</span>
                            <TrendingUp size={14} className="text-blue-500" />
                        </div>
                        <div className="text-xl font-bold font-mono text-blue-500">
                            {session.mfe ? session.mfe.toFixed(2) : '0.00'}%
                        </div>
                    </div>
                </div>

                {/* Efficiency Score */}
                <div className="glass rounded-2xl p-1 hover-card">
                    <div className="bg-card/40 rounded-xl p-4 h-full border border-white/5">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold uppercase text-muted-foreground">进场评分</span>
                            <Shield size={14} className="text-purple-500" />
                        </div>
                        <div className={`text-xl font-bold font-mono ${getScoreColor(score)}`}>
                            {score}/100
                        </div>
                    </div>
                </div>

                {/* Fee Summary */}
                <div className="glass rounded-2xl p-1 hover-card">
                    <div className="bg-amber-500/5 rounded-xl p-4 h-full border border-amber-500/10 flex flex-col justify-center">
                        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-1">
                            <Receipt className="w-3 h-3" />
                            <span className="text-xs font-bold uppercase tracking-wide">Fees Paid</span>
                        </div>
                        <span className="text-amber-600 dark:text-amber-400 font-mono font-bold text-lg">
                            {session.totalFees.toFixed(6)}
                        </span>
                    </div>
                </div>
            </div>

            {/* 图表与复盘区域 (Chart & Replay) */}
            <div className="glass rounded-2xl p-1 overflow-hidden">
                <div className="bg-card/40 rounded-xl border border-white/5">
                    {/* Toolbar */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
                        <div className="flex items-center gap-2">
                            <Activity className="text-primary w-5 h-5" />
                            <h3 className="font-bold text-lg">Price Action</h3>
                        </div>
                        <div className="flex bg-secondary/50 rounded-lg p-1 gap-1">
                            <button
                                onClick={() => setShowReplay(false)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${!showReplay ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                <BarChart2 size={16} /> 静态全景
                            </button>
                            <button
                                onClick={() => setShowReplay(true)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${showReplay ? 'bg-primary text-white shadow' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                <PlayCircle size={16} /> 沉浸回放
                            </button>
                        </div>
                    </div>

                    {/* Chart Area */}
                    <div className="h-[500px] w-full relative">
                        {showReplay ? (
                            <div className="absolute inset-0 p-4">
                                <TVChartReplay data={ohlcvData} trades={session.trades} />
                            </div>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                                {/* 这里可以放静态 TVChart，暂时用占位符，或者复用 TVChartReplay 但不自动播放 */}
                                <div className="text-center p-8 border-2 border-dashed border-border/50 rounded-xl">
                                    <BarChart2 size={48} className="mx-auto mb-4 opacity-20" />
                                    <p>静态图表模式</p>
                                    <p className="text-sm opacity-50 mt-2">点击右上角切换到「沉浸回放」</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Trade Timeline (User's Style) */}
            <div className="glass rounded-2xl overflow-hidden border border-border/50">
                <div className="px-6 py-4 border-b border-border/50 bg-secondary/30 backdrop-blur-sm">
                    <h3 className="font-bold flex items-center gap-2">
                        <Activity className="w-4 h-4 text-primary" />
                        Trade Timeline
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 ml-6">
                        All {session.tradeCount} trades in this position
                    </p>
                </div>

                <div className="divide-y divide-border/50 max-h-[500px] overflow-y-auto bg-card/30">
                    {tradesWithPosition.map((trade, idx) => (
                        <div key={trade.id} className="px-6 py-4 hover:bg-secondary/50 transition-colors relative group">
                            {/* Timeline Line */}
                            {idx !== tradesWithPosition.length - 1 && (
                                <div className="absolute left-[2.25rem] top-10 bottom-0 w-px bg-border/50 -z-10 group-hover:bg-primary/30 transition-colors"></div>
                            )}

                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ring-4 ring-background ${trade.side === 'buy' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                                        }`}>
                                        {trade.side === 'buy' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className={`font-bold text-sm uppercase tracking-wide ${trade.side === 'buy' ? 'text-emerald-500' : 'text-rose-500'
                                                }`}>
                                                {trade.side}
                                            </span>
                                            <span className="font-mono font-medium text-foreground">
                                                {trade.amount.toLocaleString()} @ ${trade.price.toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-0.5 font-medium">
                                            {new Date(trade.datetime).toLocaleString()}
                                        </div>
                                    </div>
                                </div>

                                <div className="text-right">
                                    <div className="text-sm font-medium text-foreground">
                                        Pos: {trade.positionAfter.toLocaleString()}
                                    </div>
                                    <div className={`text-xs font-medium ${(trade.positionAfter - trade.positionBefore) > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                        {trade.positionBefore >= 0 ? '+' : ''}{trade.positionAfter - trade.positionBefore} change
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

        </div>
    );
}