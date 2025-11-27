// ============ BitMEX WebSocket 实时数据服务 ============
// 用于连接 BitMEX WebSocket API 获取实时 K线和交易数据

import crypto from 'crypto';

// BitMEX WebSocket URL
export const BITMEX_WS_URL = 'wss://ws.bitmex.com/realtime';

// WebSocket 消息类型
export interface WSMessage {
    table?: string;
    action?: 'partial' | 'insert' | 'update' | 'delete';
    data?: any[];
    subscribe?: string;
    success?: boolean;
    error?: string;
}

// 实时 K线数据
export interface RealtimeCandle {
    timestamp: string;
    symbol: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    trades: number;
}

// 实时交易数据
export interface RealtimeTrade {
    timestamp: string;
    symbol: string;
    side: 'Buy' | 'Sell';
    size: number;
    price: number;
    tickDirection: string;
    trdMatchID: string;
}

// 实时执行数据 (私有 - 需要认证)
export interface RealtimeExecution {
    execID: string;
    orderID: string;
    symbol: string;
    side: 'Buy' | 'Sell';
    lastQty: number;
    lastPx: number;
    execType: string;
    execCost: number;
    execComm: number;
    timestamp: string;
}

// 生成 WebSocket 认证签名
export function generateWSAuthSignature(apiKey: string, apiSecret: string): {
    signature: string;
    expires: number;
} {
    const expires = Math.floor(Date.now() / 1000) + 3600; // 1 hour expiry
    const message = `GET/realtime${expires}`;
    const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(message)
        .digest('hex');
    
    return { signature, expires };
}

// BitMEX 时间周期映射
export const BITMEX_TIMEFRAMES: Record<string, string> = {
    '1m': 'tradeBin1m',
    '5m': 'tradeBin5m',
    '1h': 'tradeBin1h',
    '1d': 'tradeBin1d',
};

// 订阅消息生成
export function createSubscribeMessage(channels: string[]): string {
    return JSON.stringify({
        op: 'subscribe',
        args: channels,
    });
}

// 认证消息生成
export function createAuthMessage(apiKey: string, apiSecret: string): string {
    const { signature, expires } = generateWSAuthSignature(apiKey, apiSecret);
    return JSON.stringify({
        op: 'authKeyExpires',
        args: [apiKey, expires, signature],
    });
}

// 将 BitMEX K线数据转换为前端格式
export function convertBitmexCandle(candle: RealtimeCandle): {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
} {
    return {
        time: Math.floor(new Date(candle.timestamp).getTime() / 1000),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
    };
}

// 将 BitMEX 执行数据转换为前端 Trade 格式
export function convertBitmexExecution(exec: RealtimeExecution): {
    id: string;
    datetime: string;
    symbol: string;
    displaySymbol: string;
    side: 'buy' | 'sell';
    price: number;
    amount: number;
    cost: number;
    fee: { cost: number; currency: string };
} {
    const displaySymbol = exec.symbol.replace('XBT', 'BTC');
    return {
        id: exec.execID,
        datetime: exec.timestamp,
        symbol: exec.symbol,
        displaySymbol,
        side: exec.side.toLowerCase() as 'buy' | 'sell',
        price: exec.lastPx,
        amount: exec.lastQty,
        cost: Math.abs(exec.execCost),
        fee: {
            cost: exec.execComm,
            currency: 'XBT',
        },
    };
}

// 客户端 WebSocket 管理器类型
export interface WSManagerConfig {
    apiKey?: string;
    apiSecret?: string;
    symbols: string[];
    timeframe: string;
    onCandle?: (candle: ReturnType<typeof convertBitmexCandle>) => void;
    onTrade?: (trade: ReturnType<typeof convertBitmexExecution>) => void;
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (error: Error) => void;
}
