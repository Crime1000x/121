'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// ============ 类型定义 ============

interface RealtimeCandle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface RealtimeTrade {
    id: string;
    datetime: string;
    symbol: string;
    displaySymbol: string;
    side: 'buy' | 'sell';
    price: number;
    amount: number;
}

interface UseRealtimeDataOptions {
    symbol: string;
    timeframe: string;
    enabled?: boolean;
}

interface UseRealtimeDataReturn {
    isConnected: boolean;
    isAuthenticated: boolean;
    lastCandle: RealtimeCandle | null;
    lastTrade: RealtimeTrade | null;
    recentTrades: RealtimeTrade[];
    error: string | null;
    reconnect: () => void;
    serverHasCredentials: boolean;
}

// BitMEX 时间周期映射
const TIMEFRAME_MAP: Record<string, string> = {
    '1m': 'tradeBin1m',
    '5m': 'tradeBin5m',
    '1h': 'tradeBin1h',
    '1d': 'tradeBin1d',
};

// ============ 服务端认证 Hook ============

function useServerAuth() {
    const [authData, setAuthData] = useState<{
        apiKey: string;
        expires: number;
        signature: string;
        wsUrl: string;
    } | null>(null);
    const [hasCredentials, setHasCredentials] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchAuth() {
            try {
                // 先检查服务端是否配置了 API 密钥
                const statusRes = await fetch('/api/auth?action=status');
                const status = await statusRes.json();

                setHasCredentials(status.hasCredentials);

                if (status.hasCredentials) {
                    // 获取 WebSocket 认证参数
                    const authRes = await fetch('/api/auth?action=ws-auth');
                    if (authRes.ok) {
                        const data = await authRes.json();
                        setAuthData(data);
                    }
                }
            } catch (err) {
                console.error('[Auth] Failed to fetch server auth:', err);
            } finally {
                setLoading(false);
            }
        }

        fetchAuth();
    }, []);

    // 刷新认证（在过期前调用）
    const refreshAuth = useCallback(async () => {
        if (!hasCredentials) return null;

        try {
            const authRes = await fetch('/api/auth?action=ws-auth');
            if (authRes.ok) {
                const data = await authRes.json();
                setAuthData(data);
                return data;
            }
        } catch (err) {
            console.error('[Auth] Failed to refresh auth:', err);
        }
        return null;
    }, [hasCredentials]);

    return { authData, hasCredentials, loading, refreshAuth };
}

// ============ WebSocket Hook ============

export function useRealtimeData({
    symbol,
    timeframe,
    enabled = true,
}: UseRealtimeDataOptions): UseRealtimeDataReturn {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const authRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const [isConnected, setIsConnected] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [lastCandle, setLastCandle] = useState<RealtimeCandle | null>(null);
    const [lastTrade, setLastTrade] = useState<RealtimeTrade | null>(null);
    const [recentTrades, setRecentTrades] = useState<RealtimeTrade[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Reset state when symbol or timeframe changes
    useEffect(() => {
        setLastCandle(null);
        setLastTrade(null);
        setRecentTrades([]);
        setError(null);
    }, [symbol, timeframe]);

    // 使用服务端认证
    const { authData, hasCredentials, loading: authLoading, refreshAuth } = useServerAuth();

    // 转换 symbol: BTCUSD -> XBTUSD
    const bitmexSymbol = symbol.replace('BTC', 'XBT');
    const binTopic = TIMEFRAME_MAP[timeframe] || 'tradeBin1d';

    // 连接 WebSocket
    const connect = useCallback(async () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            return;
        }

        // 等待认证数据加载
        if (authLoading) {
            console.log('[WS] Waiting for auth data...');
            return;
        }

        const wsUrl = authData?.wsUrl || 'wss://ws.bitmex.com/realtime';

        try {
            console.log('[WS] Connecting to BitMEX...', wsUrl);
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = async () => {
                console.log('[WS] Connected');
                setIsConnected(true);
                setError(null);

                // 订阅公开频道: K线数据
                const publicSubs = [
                    `${binTopic}:${bitmexSymbol}`,
                ];

                ws.send(JSON.stringify({
                    op: 'subscribe',
                    args: publicSubs,
                }));
                console.log('[WS] Subscribed to:', publicSubs);

                // 如果服务端配置了 API 密钥，进行认证
                if (authData) {
                    ws.send(JSON.stringify({
                        op: 'authKeyExpires',
                        args: [authData.apiKey, authData.expires, authData.signature],
                    }));
                    console.log('[WS] Sent auth message');

                    // 设置认证刷新（在过期前 5 分钟刷新）
                    const refreshTime = (authData.expires - Math.floor(Date.now() / 1000) - 300) * 1000;
                    if (refreshTime > 0) {
                        authRefreshIntervalRef.current = setTimeout(async () => {
                            const newAuth = await refreshAuth();
                            if (newAuth && ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify({
                                    op: 'authKeyExpires',
                                    args: [newAuth.apiKey, newAuth.expires, newAuth.signature],
                                }));
                                console.log('[WS] Refreshed auth');
                            }
                        }, refreshTime);
                    }
                }

                // 开始 ping 保活
                pingIntervalRef.current = setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send('ping');
                    }
                }, 30000);
            };

            ws.onmessage = (event) => {
                // 处理 pong
                if (event.data === 'pong') {
                    return;
                }

                try {
                    const message = JSON.parse(event.data);

                    // 认证成功
                    if (message.success && message.request?.op === 'authKeyExpires') {
                        console.log('[WS] Authenticated successfully');
                        setIsAuthenticated(true);

                        // 订阅私有频道: 用户执行记录
                        ws.send(JSON.stringify({
                            op: 'subscribe',
                            args: ['execution'],
                        }));
                        console.log('[WS] Subscribed to execution');
                    }

                    // 订阅确认
                    if (message.success && message.subscribe) {
                        console.log('[WS] Subscribed:', message.subscribe);
                    }

                    // 错误处理
                    if (message.error) {
                        console.error('[WS] Error:', message.error);
                        setError(message.error);
                    }

                    // K线数据更新
                    if (message.table?.startsWith('tradeBin') && message.data?.length > 0) {
                        const candle = message.data[message.data.length - 1];
                        if (candle.symbol === bitmexSymbol) {
                            const converted: RealtimeCandle = {
                                time: Math.floor(new Date(candle.timestamp).getTime() / 1000),
                                open: candle.open,
                                high: candle.high,
                                low: candle.low,
                                close: candle.close,
                                volume: candle.volume || 0,
                            };
                            setLastCandle(converted);
                            console.log('[WS] Candle update:', converted);
                        }
                    }

                    // 用户执行数据 (私有)
                    if (message.table === 'execution' && message.data?.length > 0) {
                        message.data.forEach((exec: any) => {
                            // 只处理实际成交
                            if (exec.execType === 'Trade' && exec.lastQty > 0) {
                                const trade: RealtimeTrade = {
                                    id: exec.execID,
                                    datetime: exec.timestamp,
                                    symbol: exec.symbol,
                                    displaySymbol: exec.symbol.replace('XBT', 'BTC'),
                                    side: exec.side.toLowerCase() as 'buy' | 'sell',
                                    price: exec.lastPx,
                                    amount: exec.lastQty,
                                };

                                setLastTrade(trade);
                                setRecentTrades(prev => [trade, ...prev].slice(0, 50));
                                console.log('[WS] New trade:', trade);
                            }
                        });
                    }

                } catch (e) {
                    // 非 JSON 消息
                }
            };

            ws.onerror = (event) => {
                console.error('[WS] Error:', event);
                setError('WebSocket connection error');
            };

            ws.onclose = (event) => {
                console.log('[WS] Disconnected:', event.code, event.reason);
                setIsConnected(false);
                setIsAuthenticated(false);

                // 清理定时器
                if (pingIntervalRef.current) {
                    clearInterval(pingIntervalRef.current);
                }
                if (authRefreshIntervalRef.current) {
                    clearTimeout(authRefreshIntervalRef.current);
                }

                // 自动重连 (如果是意外断开)
                if (enabled && event.code !== 1000) {
                    console.log('[WS] Scheduling reconnect...');
                    reconnectTimeoutRef.current = setTimeout(() => {
                        connect();
                    }, 5000);
                }
            };

        } catch (err) {
            console.error('[WS] Connection failed:', err);
            setError(err instanceof Error ? err.message : 'Connection failed');
        }
    }, [bitmexSymbol, binTopic, authData, authLoading, enabled, refreshAuth]);

    // 断开连接
    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
        }
        if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
        }
        if (authRefreshIntervalRef.current) {
            clearTimeout(authRefreshIntervalRef.current);
        }
        if (wsRef.current) {
            wsRef.current.close(1000, 'Manual disconnect');
            wsRef.current = null;
        }
        setIsConnected(false);
        setIsAuthenticated(false);
    }, []);

    // 重连
    const reconnect = useCallback(() => {
        disconnect();
        setTimeout(connect, 100);
    }, [connect, disconnect]);

    // Effect: 连接管理
    useEffect(() => {
        if (enabled && !authLoading) {
            connect();
        } else {
            disconnect();
        }

        return () => {
            disconnect();
        };
    }, [enabled, authLoading, connect, disconnect]);

    // Effect: Symbol/Timeframe 变化时重新订阅
    useEffect(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            const newSubs = [`${binTopic}:${bitmexSymbol}`];
            wsRef.current.send(JSON.stringify({
                op: 'subscribe',
                args: newSubs,
            }));
            console.log('[WS] Re-subscribed to:', newSubs);
        }
    }, [bitmexSymbol, binTopic]);

    return {
        isConnected,
        isAuthenticated,
        lastCandle,
        lastTrade,
        recentTrades,
        error,
        reconnect,
        serverHasCredentials: hasCredentials,
    };
}

// ============ 实时价格 Hook (简化版，只获取价格) ============

export function useRealtimePrice(symbol: string): {
    price: number | null;
    isConnected: boolean;
} {
    const wsRef = useRef<WebSocket | null>(null);
    const [price, setPrice] = useState<number | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    const bitmexSymbol = symbol.replace('BTC', 'XBT');

    useEffect(() => {
        const ws = new WebSocket('wss://ws.bitmex.com/realtime');
        wsRef.current = ws;

        ws.onopen = () => {
            setIsConnected(true);
            ws.send(JSON.stringify({
                op: 'subscribe',
                args: [`instrument:${bitmexSymbol}`],
            }));
        };

        ws.onmessage = (event) => {
            if (event.data === 'pong') return;

            try {
                const message = JSON.parse(event.data);
                if (message.table === 'instrument' && message.data?.length > 0) {
                    const instrument = message.data[0];
                    if (instrument.lastPrice) {
                        setPrice(instrument.lastPrice);
                    }
                }
            } catch (e) {
                // ignore
            }
        };

        ws.onclose = () => {
            setIsConnected(false);
        };

        const pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send('ping');
            }
        }, 30000);

        return () => {
            clearInterval(pingInterval);
            ws.close();
        };
    }, [bitmexSymbol]);

    return { price, isConnected };
}
