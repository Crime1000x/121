'use client';

import React from 'react';
import { Wifi, WifiOff, Shield, ShieldOff, RefreshCw } from 'lucide-react';

interface RealtimeStatusProps {
    isConnected: boolean;
    isAuthenticated?: boolean;
    currentPrice?: number | null;
    symbol?: string;
    onReconnect?: () => void;
    error?: string | null;
}

export function RealtimeStatus({
    isConnected,
    isAuthenticated = false,
    currentPrice,
    symbol = 'BTCUSD',
    onReconnect,
    error,
}: RealtimeStatusProps) {
    return (
        <div className="flex items-center gap-4 px-4 py-2 bg-secondary/30 rounded-xl border border-white/5">
            {/* 连接状态 */}
            <div className="flex items-center gap-2">
                {isConnected ? (
                    <>
                        <div className="relative">
                            <Wifi className="w-4 h-4 text-emerald-500" />
                            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        </div>
                        <span className="text-xs font-medium text-emerald-500">LIVE</span>
                    </>
                ) : (
                    <>
                        <WifiOff className="w-4 h-4 text-rose-500" />
                        <span className="text-xs font-medium text-rose-500">OFFLINE</span>
                    </>
                )}
            </div>

            {/* 认证状态 */}
            {isAuthenticated !== undefined && (
                <div className="flex items-center gap-1.5 pl-3 border-l border-white/10">
                    {isAuthenticated ? (
                        <>
                            <Shield className="w-3.5 h-3.5 text-blue-400" />
                            <span className="text-xs text-blue-400">Auth</span>
                        </>
                    ) : (
                        <>
                            <ShieldOff className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Public</span>
                        </>
                    )}
                </div>
            )}

            {/* 实时价格 */}
            {currentPrice !== undefined && (
                <div className="flex items-center gap-2 pl-3 border-l border-white/10">
                    <span className="text-xs text-muted-foreground">{symbol}</span>
                    <span className="text-sm font-bold font-mono text-foreground">
                        ${currentPrice?.toLocaleString(undefined, { 
                            minimumFractionDigits: 1, 
                            maximumFractionDigits: 1 
                        }) || '---'}
                    </span>
                </div>
            )}

            {/* 错误信息 */}
            {error && (
                <div className="flex items-center gap-2 pl-3 border-l border-white/10">
                    <span className="text-xs text-rose-400 truncate max-w-[150px]">{error}</span>
                </div>
            )}

            {/* 重连按钮 */}
            {onReconnect && !isConnected && (
                <button
                    onClick={onReconnect}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors ml-auto"
                >
                    <RefreshCw className="w-3 h-3" />
                    Reconnect
                </button>
            )}
        </div>
    );
}

// 简化版：只显示连接点
export function ConnectionDot({ isConnected }: { isConnected: boolean }) {
    return (
        <div className="relative inline-flex">
            <span
                className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
            />
            {isConnected && (
                <span className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-75" />
            )}
        </div>
    );
}

// 实时交易 Feed
interface RealtimeTradeFeedProps {
    trades: Array<{
        id: string;
        datetime: string;
        symbol: string;
        displaySymbol: string;
        side: 'buy' | 'sell';
        price: number;
        amount: number;
    }>;
    maxItems?: number;
}

export function RealtimeTradeFeed({ trades, maxItems = 10 }: RealtimeTradeFeedProps) {
    const displayTrades = trades.slice(0, maxItems);

    if (displayTrades.length === 0) {
        return (
            <div className="text-center py-8 text-muted-foreground text-sm">
                Waiting for new trades...
            </div>
        );
    }

    return (
        <div className="space-y-1">
            {displayTrades.map((trade, idx) => (
                <div
                    key={trade.id}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg transition-all duration-300 ${
                        idx === 0 ? 'bg-primary/10 ring-1 ring-primary/20 animate-pulse' : 'bg-secondary/30'
                    }`}
                >
                    <div className="flex items-center gap-3">
                        <span
                            className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                                trade.side === 'buy'
                                    ? 'bg-emerald-500/10 text-emerald-500'
                                    : 'bg-rose-500/10 text-rose-500'
                            }`}
                        >
                            {trade.side}
                        </span>
                        <span className="text-sm font-medium">{trade.displaySymbol}</span>
                    </div>
                    <div className="text-right">
                        <div className="text-sm font-mono font-bold">
                            {trade.amount.toLocaleString()} @ ${trade.price.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {new Date(trade.datetime).toLocaleTimeString()}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
