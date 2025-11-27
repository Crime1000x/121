// SERVER-SIDE ONLY - Do not import this file in client components
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { 
    Trade, 
    Execution, 
    Order, 
    WalletTransaction, 
    AccountSummary, 
    TradingStats,
    PositionSession,
    formatSymbol,
    toInternalSymbol
} from './types';

// Re-export types and utilities for convenience
export * from './types';

// ============ Cache ============

let cachedExecutions: Execution[] | null = null;
let cachedTrades: Trade[] | null = null;
let cachedOrders: Order[] | null = null;
let cachedWallet: WalletTransaction[] | null = null;
let cachedAccountSummary: AccountSummary | null = null;
let cachedSessions: PositionSession[] | null = null;

// ============ Loaders ============

export function loadExecutionsFromCSV(): Execution[] {
    if (cachedExecutions) return cachedExecutions;

    const csvPath = path.join(process.cwd(), 'bitmex_executions.csv');
    if (!fs.existsSync(csvPath)) {
        throw new Error('bitmex_executions.csv not found');
    }

    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(fileContent, { columns: true, skip_empty_lines: true, relax_quotes: true });

    cachedExecutions = records.map((record: any) => ({
        execID: record.execID,
        orderID: record.orderID || '',
        symbol: record.symbol,
        displaySymbol: formatSymbol(record.symbol),
        side: record.side as 'Buy' | 'Sell',
        lastQty: parseFloat(record.lastQty) || 0,
        lastPx: parseFloat(record.lastPx) || 0,
        execType: record.execType,
        ordType: record.ordType,
        ordStatus: record.ordStatus,
        execCost: parseFloat(record.execCost) || 0,
        execComm: parseFloat(record.execComm) || 0,
        timestamp: record.timestamp,
        text: record.text || '',
    }));

    return cachedExecutions!;
}

// Load trades aggregated by OrderID (combine partial fills into single trades)
export function loadTradesFromCSV(): Trade[] {
    if (cachedTrades) return cachedTrades;

    const executions = loadExecutionsFromCSV();
    
    // Filter only actual trades
    const tradeExecutions = executions.filter(e => 
        e.execType === 'Trade' && e.side && e.lastQty > 0 && e.orderID
    );
    
    // Group by OrderID
    const orderGroups = new Map<string, Execution[]>();
    tradeExecutions.forEach(e => {
        const key = e.orderID;
        if (!orderGroups.has(key)) {
            orderGroups.set(key, []);
        }
        orderGroups.get(key)!.push(e);
    });
    
    // Aggregate each order's executions into a single trade
    cachedTrades = Array.from(orderGroups.entries()).map(([orderID, execs]) => {
        // Sort by timestamp to get the first execution time
        execs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        const firstExec = execs[0];
        const totalQty = execs.reduce((sum, e) => sum + e.lastQty, 0);
        const totalCost = execs.reduce((sum, e) => sum + Math.abs(e.execCost), 0);
        const totalFee = execs.reduce((sum, e) => sum + e.execComm, 0);
        
        // Weighted average price
        const weightedPriceSum = execs.reduce((sum, e) => sum + (e.lastPx * e.lastQty), 0);
        const avgPrice = totalQty > 0 ? weightedPriceSum / totalQty : firstExec.lastPx;
        
        return {
            id: orderID, // Use orderID as the trade ID
            datetime: firstExec.timestamp,
            symbol: firstExec.symbol,
            displaySymbol: firstExec.displaySymbol,
            side: firstExec.side.toLowerCase() as 'buy' | 'sell',
            price: avgPrice,
            amount: totalQty,
            cost: totalCost,
            fee: {
                cost: totalFee,
                currency: 'XBT',
            },
            orderID: orderID,
            execType: firstExec.execType,
            executionCount: execs.length, // Track how many fills this order had
        };
    });
    
    // Sort by datetime
    cachedTrades.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

    return cachedTrades!;
}

export function loadOrdersFromCSV(): Order[] {
    if (cachedOrders) return cachedOrders;

    const csvPath = path.join(process.cwd(), 'bitmex_orders.csv');
    if (!fs.existsSync(csvPath)) {
        console.warn('bitmex_orders.csv not found');
        return [];
    }

    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(fileContent, { columns: true, skip_empty_lines: true, relax_quotes: true });

    cachedOrders = records.map((record: any) => ({
        orderID: record.orderID,
        symbol: record.symbol,
        displaySymbol: formatSymbol(record.symbol),
        side: record.side as 'Buy' | 'Sell',
        ordType: record.ordType as Order['ordType'],
        orderQty: parseFloat(record.orderQty) || 0,
        price: record.price ? parseFloat(record.price) : null,
        stopPx: record.stopPx ? parseFloat(record.stopPx) : null,
        avgPx: record.avgPx ? parseFloat(record.avgPx) : null,
        cumQty: parseFloat(record.cumQty) || 0,
        ordStatus: record.ordStatus as Order['ordStatus'],
        timestamp: record.timestamp,
        text: record.text,
    }));

    return cachedOrders!;
}

export function loadWalletHistoryFromCSV(): WalletTransaction[] {
    if (cachedWallet) return cachedWallet;

    const csvPath = path.join(process.cwd(), 'bitmex_wallet_history.csv');
    if (!fs.existsSync(csvPath)) {
        console.warn('bitmex_wallet_history.csv not found');
        return [];
    }

    const fileContent = fs.readFileSync(csvPath, 'utf-8');
    const records = parse(fileContent, { columns: true, skip_empty_lines: true, relax_quotes: true });

    cachedWallet = records.map((record: any) => ({
        transactID: record.transactID,
        account: parseInt(record.account),
        currency: record.currency,
        transactType: record.transactType as WalletTransaction['transactType'],
        amount: parseFloat(record.amount) || 0,
        fee: parseFloat(record.fee) || 0,
        transactStatus: record.transactStatus,
        address: record.address || '',
        tx: record.tx || '',
        text: record.text || '',
        timestamp: record.timestamp,
        walletBalance: parseFloat(record.walletBalance) || 0,
        marginBalance: record.marginBalance ? parseFloat(record.marginBalance) : null,
    }));

    return cachedWallet!;
}

export function loadAccountSummary(): AccountSummary | null {
    if (cachedAccountSummary) return cachedAccountSummary;

    const jsonPath = path.join(process.cwd(), 'bitmex_account_summary.json');
    if (!fs.existsSync(jsonPath)) {
        console.warn('bitmex_account_summary.json not found');
        return null;
    }

    const fileContent = fs.readFileSync(jsonPath, 'utf-8');
    const data = JSON.parse(fileContent);
    
    cachedAccountSummary = {
        ...data,
        positions: data.positions.map((p: any) => ({
            ...p,
            displaySymbol: formatSymbol(p.symbol),
        })),
    };
    
    return cachedAccountSummary;
}

// ============ Position Session Calculator (Server-side) ============

import { calculatePositionSessionsFromExecutions } from './position_calculator';

export function getPositionSessions(): PositionSession[] {
    if (cachedSessions) return cachedSessions;
    
    // Use executions directly for more accurate position tracking
    const executions = loadExecutionsFromCSV();
    cachedSessions = calculatePositionSessionsFromExecutions(executions);
    
    console.log(`Calculated ${cachedSessions.length} position sessions from ${executions.length} executions`);
    
    return cachedSessions;
}

// ============ Analytics ============

export function calculateTradingStats(): TradingStats {
    const trades = loadTradesFromCSV();
    const orders = loadOrdersFromCSV();
    const wallet = loadWalletHistoryFromCSV();
    
    const filledOrders = orders.filter(o => o.ordStatus === 'Filled').length;
    const canceledOrders = orders.filter(o => o.ordStatus === 'Canceled').length;
    const rejectedOrders = orders.filter(o => o.ordStatus === 'Rejected').length;
    
    const limitOrders = orders.filter(o => o.ordType === 'Limit').length;
    const marketOrders = orders.filter(o => o.ordType === 'Market').length;
    const stopOrders = orders.filter(o => o.ordType === 'Stop' || o.ordType === 'StopLimit').length;
    
    const SAT_TO_BTC = 100000000;
    
    const realizedPnlTxs = wallet.filter(w => w.transactType === 'RealisedPNL' && w.transactStatus === 'Completed');
    const fundingTxs = wallet.filter(w => w.transactType === 'Funding' && w.transactStatus === 'Completed');
    
    const totalRealizedPnl = realizedPnlTxs.reduce((sum, w) => sum + w.amount, 0) / SAT_TO_BTC;
    const totalFees = realizedPnlTxs.reduce((sum, w) => sum + Math.abs(w.fee), 0) / SAT_TO_BTC;
    
    const totalFunding = fundingTxs.reduce((sum, w) => sum + w.amount, 0) / SAT_TO_BTC;
    const fundingPaid = fundingTxs.filter(w => w.amount < 0).reduce((sum, w) => sum + Math.abs(w.amount), 0) / SAT_TO_BTC;
    const fundingReceived = fundingTxs.filter(w => w.amount > 0).reduce((sum, w) => sum + w.amount, 0) / SAT_TO_BTC;
    
    const winningTxs = realizedPnlTxs.filter(w => w.amount > 0);
    const losingTxs = realizedPnlTxs.filter(w => w.amount < 0);
    
    const totalWins = winningTxs.reduce((sum, w) => sum + w.amount, 0) / SAT_TO_BTC;
    const totalLosses = Math.abs(losingTxs.reduce((sum, w) => sum + w.amount, 0)) / SAT_TO_BTC;
    
    const tradeDates = new Set(trades.map(t => t.datetime.split('T')[0]));
    const tradingDays = tradeDates.size;
    
    const monthlyData = new Map<string, { pnl: number; funding: number; trades: number }>();
    
    realizedPnlTxs.forEach(w => {
        const month = w.timestamp.substring(0, 7);
        if (!monthlyData.has(month)) {
            monthlyData.set(month, { pnl: 0, funding: 0, trades: 0 });
        }
        monthlyData.get(month)!.pnl += w.amount / SAT_TO_BTC;
    });
    
    fundingTxs.forEach(w => {
        const month = w.timestamp.substring(0, 7);
        if (!monthlyData.has(month)) {
            monthlyData.set(month, { pnl: 0, funding: 0, trades: 0 });
        }
        monthlyData.get(month)!.funding += w.amount / SAT_TO_BTC;
    });
    
    trades.forEach(t => {
        const month = t.datetime.substring(0, 7);
        if (monthlyData.has(month)) {
            monthlyData.get(month)!.trades += 1;
        }
    });
    
    const monthlyPnl = Array.from(monthlyData.entries())
        .map(([month, data]) => ({ month, ...data }))
        .sort((a, b) => a.month.localeCompare(b.month));

    return {
        totalTrades: trades.length,
        totalOrders: orders.length,
        filledOrders,
        canceledOrders,
        rejectedOrders,
        fillRate: orders.length > 0 ? (filledOrders / orders.length) * 100 : 0,
        cancelRate: orders.length > 0 ? (canceledOrders / orders.length) * 100 : 0,
        limitOrders,
        marketOrders,
        stopOrders,
        limitOrderPercent: orders.length > 0 ? (limitOrders / orders.length) * 100 : 0,
        totalRealizedPnl,
        totalFunding,
        totalFees,
        netPnl: totalRealizedPnl + totalFunding - totalFees,
        winningTrades: winningTxs.length,
        losingTrades: losingTxs.length,
        winRate: (winningTxs.length + losingTxs.length) > 0 
            ? (winningTxs.length / (winningTxs.length + losingTxs.length)) * 100 
            : 0,
        avgWin: winningTxs.length > 0 ? totalWins / winningTxs.length : 0,
        avgLoss: losingTxs.length > 0 ? totalLosses / losingTxs.length : 0,
        profitFactor: totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0,
        fundingPaid,
        fundingReceived,
        tradingDays,
        avgTradesPerDay: tradingDays > 0 ? trades.length / tradingDays : 0,
        monthlyPnl,
    };
}

export function getPaginatedTrades(page: number, limit: number, symbol?: string): { trades: Trade[], total: number } {
    const allTrades = loadTradesFromCSV();
    
    let filtered = allTrades;
    if (symbol) {
        const internalSymbol = toInternalSymbol(symbol);
        filtered = allTrades.filter(t => t.symbol === symbol || t.symbol === internalSymbol || t.displaySymbol === symbol);
    }

    filtered.sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());

    const start = (page - 1) * limit;
    const end = start + limit;

    return {
        trades: filtered.slice(start, end),
        total: filtered.length
    };
}

export function getOHLCData(symbol: string = 'BTCUSD', timeframe: '1h' | '4h' | '1d' | '1w' = '1d') {
    const allTrades = loadTradesFromCSV();
    
    const internalSymbol = toInternalSymbol(symbol);
    const filtered = allTrades.filter(t => 
        t.symbol === symbol || 
        t.symbol === internalSymbol || 
        t.displaySymbol === symbol
    );

    filtered.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());

    const candles = new Map<number, {
        time: number,
        open: number,
        high: number,
        low: number,
        close: number,
        volume: number,
        markers: any[]
    }>();

    const getBucketTime = (timestamp: number): number => {
        const date = new Date(timestamp);
        if (timeframe === '1h') {
            date.setMinutes(0, 0, 0);
            return date.getTime() / 1000;
        }
        if (timeframe === '4h') {
            const h = date.getHours();
            date.setHours(h - (h % 4), 0, 0, 0);
            return date.getTime() / 1000;
        }
        if (timeframe === '1w') {
            const day = date.getDay();
            const diff = date.getDate() - day + (day === 0 ? -6 : 1);
            date.setDate(diff);
            date.setHours(0, 0, 0, 0);
            return date.getTime() / 1000;
        }
        date.setHours(0, 0, 0, 0);
        return date.getTime() / 1000;
    };

    filtered.forEach(t => {
        const timestamp = new Date(t.datetime).getTime();
        const bucketTime = getBucketTime(timestamp);

        if (!candles.has(bucketTime)) {
            candles.set(bucketTime, {
                time: bucketTime,
                open: t.price,
                high: t.price,
                low: t.price,
                close: t.price,
                volume: 0,
                markers: []
            });
        }

        const candle = candles.get(bucketTime)!;
        candle.high = Math.max(candle.high, t.price);
        candle.low = Math.min(candle.low, t.price);
        candle.close = t.price;
        candle.volume += t.amount;

        if (t.side === 'buy' || t.side === 'sell') {
            candle.markers.push({
                time: bucketTime,
                position: t.side === 'buy' ? 'belowBar' : 'aboveBar',
                color: t.side === 'buy' ? '#10b981' : '#ef4444',
                shape: t.side === 'buy' ? 'arrowUp' : 'arrowDown',
                text: `${t.side.toUpperCase()} ${t.amount.toLocaleString()} @ $${t.price.toLocaleString()}`
            });
        }
    });

    const candleArray = Array.from(candles.values()).sort((a, b) => a.time - b.time);
    const markers: any[] = [];

    candleArray.forEach(c => {
        const buys = c.markers.filter((m: any) => m.shape === 'arrowUp');
        const sells = c.markers.filter((m: any) => m.shape === 'arrowDown');

        if (buys.length > 0) markers.push(buys[buys.length - 1]);
        if (sells.length > 0) markers.push(sells[sells.length - 1]);

        delete (c as any).markers;
    });

    return { candles: candleArray, markers };
}

export function getEquityCurve(): { time: number; balance: number }[] {
    const wallet = loadWalletHistoryFromCSV();
    
    const balanceHistory = wallet
        .filter(w => w.transactStatus === 'Completed' && w.walletBalance > 0)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        .map(w => ({
            time: Math.floor(new Date(w.timestamp).getTime() / 1000),
            balance: w.walletBalance / 100000000
        }));
    
    const dailyBalance = new Map<number, number>();
    balanceHistory.forEach(b => {
        const dayTime = Math.floor(b.time / 86400) * 86400;
        dailyBalance.set(dayTime, b.balance);
    });
    
    return Array.from(dailyBalance.entries())
        .map(([time, balance]) => ({ time, balance }))
        .sort((a, b) => a.time - b.time);
}

export function getFundingHistory(): { time: number; amount: number; cumulative: number }[] {
    const wallet = loadWalletHistoryFromCSV();
    const SAT_TO_BTC = 100000000;
    
    const fundingTxs = wallet
        .filter(w => w.transactType === 'Funding' && w.transactStatus === 'Completed')
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    let cumulative = 0;
    return fundingTxs.map(w => {
        cumulative += w.amount / SAT_TO_BTC;
        return {
            time: Math.floor(new Date(w.timestamp).getTime() / 1000),
            amount: w.amount / SAT_TO_BTC,
            cumulative
        };
    });
}
