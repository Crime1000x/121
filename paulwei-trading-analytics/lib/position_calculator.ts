// SERVER-SIDE ONLY - Position Session Calculator
// This calculates position sessions directly from executions data

import { Execution, Trade, PositionSession, formatSymbol } from './types';

interface ExecutionForCalc {
    execID: string;
    orderID: string;
    symbol: string;
    side: 'Buy' | 'Sell';
    lastQty: number;
    lastPx: number;
    execCost: number;
    execComm: number;
    timestamp: string;
    text: string;
}

/**
 * Calculate position sessions from raw executions
 * A position session is a complete trading cycle from opening to closing a position
 * 
 * Logic:
 * 1. Filter only Trade executions (ignore Funding, Settlement, etc.)
 * 2. Sort by timestamp
 * 3. Track running position for each symbol
 * 4. Session starts when position goes from 0 to non-zero
 * 5. Session ends when position returns to 0
 * 6. Handle position flips (long→short or short→long) as separate sessions
 */
export function calculatePositionSessionsFromExecutions(executions: Execution[]): PositionSession[] {
    // Filter only actual trade executions
    const tradeExecutions = executions.filter(e => 
        e.execType === 'Trade' && 
        e.side && 
        e.lastQty > 0
    );

    // Group by symbol
    const executionsBySymbol = new Map<string, ExecutionForCalc[]>();
    
    tradeExecutions.forEach(e => {
        const symbol = e.symbol;
        if (!executionsBySymbol.has(symbol)) {
            executionsBySymbol.set(symbol, []);
        }
        executionsBySymbol.get(symbol)!.push({
            execID: e.execID,
            orderID: e.orderID,
            symbol: e.symbol,
            side: e.side,
            lastQty: e.lastQty,
            lastPx: e.lastPx,
            execCost: e.execCost,
            execComm: e.execComm,
            timestamp: e.timestamp,
            text: e.text,
        });
    });

    const allSessions: PositionSession[] = [];
    let globalSessionId = 0;

    // Process each symbol
    executionsBySymbol.forEach((symbolExecutions, symbol) => {
        // Sort by timestamp
        symbolExecutions.sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        let runningPosition = 0;
        let sessionExecutions: ExecutionForCalc[] = [];
        let sessionStartTime: string | null = null;
        
        // Tracking for current session
        let totalBought = 0;
        let totalSold = 0;
        let totalBuyCost = 0;  // Sum of (qty * price) for buys
        let totalSellCost = 0; // Sum of (qty * price) for sells
        let totalCommission = 0;
        let maxPosition = 0;

        const closeSession = (endTime: string, endPosition: number) => {
            if (sessionExecutions.length === 0 || sessionStartTime === null) return;

            // Determine session side based on first non-zero position
            const side: 'long' | 'short' = totalBought > totalSold ? 'long' : 'short';
            
            // Calculate average prices
            const avgEntryPrice = side === 'long'
                ? (totalBought > 0 ? totalBuyCost / totalBought : 0)
                : (totalSold > 0 ? totalSellCost / totalSold : 0);
            
            const avgExitPrice = side === 'long'
                ? (totalSold > 0 ? totalSellCost / totalSold : 0)
                : (totalBought > 0 ? totalBuyCost / totalBought : 0);

            // Calculate realized PnL
            let realizedPnl = 0;
            const closedQty = Math.min(totalBought, totalSold);
            const isInverse = symbol.includes('XBT') || symbol.includes('BTC');
            
            if (closedQty > 0 && avgEntryPrice > 0 && avgExitPrice > 0) {
                if (isInverse) {
                    // Inverse contract: PnL = qty * (1/entry - 1/exit) for long
                    if (side === 'long') {
                        realizedPnl = closedQty * (1 / avgEntryPrice - 1 / avgExitPrice);
                    } else {
                        realizedPnl = closedQty * (1 / avgExitPrice - 1 / avgEntryPrice);
                    }
                } else {
                    // Linear/Quanto contract
                    const multiplier = symbol.includes('ETH') ? 0.000001 : 0.000001;
                    if (side === 'long') {
                        realizedPnl = (avgExitPrice - avgEntryPrice) * closedQty * multiplier;
                    } else {
                        realizedPnl = (avgEntryPrice - avgExitPrice) * closedQty * multiplier;
                    }
                }
            }

            // Convert commission from satoshis to BTC
            const totalFees = Math.abs(totalCommission) / 100000000;

            // Convert executions to trades for the session
            const trades: Trade[] = sessionExecutions.map(e => ({
                id: e.execID,
                datetime: e.timestamp,
                symbol: e.symbol,
                displaySymbol: formatSymbol(e.symbol),
                side: e.side.toLowerCase() as 'buy' | 'sell',
                price: e.lastPx,
                amount: e.lastQty,
                cost: Math.abs(e.execCost),
                fee: {
                    cost: e.execComm,
                    currency: 'XBT',
                },
                orderID: e.orderID,
                execType: 'Trade',
            }));

            const durationMs = new Date(endTime).getTime() - new Date(sessionStartTime).getTime();

            allSessions.push({
                id: `${symbol}-${globalSessionId++}`,
                symbol,
                displaySymbol: formatSymbol(symbol),
                side,
                openTime: sessionStartTime,
                closeTime: endPosition === 0 ? endTime : null,
                durationMs,
                maxSize: maxPosition,
                totalBought,
                totalSold,
                avgEntryPrice,
                avgExitPrice: endPosition === 0 ? avgExitPrice : 0,
                realizedPnl: endPosition === 0 ? realizedPnl : 0,
                totalFees,
                netPnl: endPosition === 0 ? realizedPnl - totalFees : -totalFees,
                tradeCount: sessionExecutions.length,
                trades,
                status: endPosition === 0 ? 'closed' : 'open',
            });
        };

        const resetSession = () => {
            sessionExecutions = [];
            sessionStartTime = null;
            totalBought = 0;
            totalSold = 0;
            totalBuyCost = 0;
            totalSellCost = 0;
            totalCommission = 0;
            maxPosition = 0;
        };

        // Process each execution
        for (const exec of symbolExecutions) {
            const positionBefore = runningPosition;
            const qty = exec.lastQty;
            const price = exec.lastPx;

            // Update running position
            if (exec.side === 'Buy') {
                runningPosition += qty;
                totalBought += qty;
                totalBuyCost += qty * price;
            } else {
                runningPosition -= qty;
                totalSold += qty;
                totalSellCost += qty * price;
            }
            
            totalCommission += exec.execComm;
            sessionExecutions.push(exec);
            maxPosition = Math.max(maxPosition, Math.abs(runningPosition));

            // Check for session start
            if (positionBefore === 0 && runningPosition !== 0) {
                sessionStartTime = exec.timestamp;
            }

            // Check for session end (position back to 0)
            if (positionBefore !== 0 && runningPosition === 0) {
                closeSession(exec.timestamp, 0);
                resetSession();
            }

            // Check for position flip (long to short or short to long)
            if ((positionBefore > 0 && runningPosition < 0) || 
                (positionBefore < 0 && runningPosition > 0)) {
                
                // Close the previous session at the flip point
                // We need to split this execution
                const flipQty = Math.abs(positionBefore);
                const overflowQty = Math.abs(runningPosition);
                
                // Adjust the last session's totals
                if (exec.side === 'Buy') {
                    totalBought -= overflowQty;
                    totalBuyCost -= overflowQty * price;
                } else {
                    totalSold -= overflowQty;
                    totalSellCost -= overflowQty * price;
                }
                
                closeSession(exec.timestamp, 0);
                resetSession();
                
                // Start new session with the overflow
                sessionStartTime = exec.timestamp;
                sessionExecutions = [exec];
                if (exec.side === 'Buy') {
                    totalBought = overflowQty;
                    totalBuyCost = overflowQty * price;
                } else {
                    totalSold = overflowQty;
                    totalSellCost = overflowQty * price;
                }
                totalCommission = exec.execComm; // Attribute to new session
                maxPosition = overflowQty;
            }
        }

        // Handle any remaining open position
        if (runningPosition !== 0 && sessionExecutions.length > 0) {
            closeSession(
                sessionExecutions[sessionExecutions.length - 1].timestamp,
                runningPosition
            );
        }
    });

    // Sort all sessions by close time (or open time for open positions), newest first
    allSessions.sort((a, b) => {
        const timeA = new Date(a.closeTime || a.openTime).getTime();
        const timeB = new Date(b.closeTime || b.openTime).getTime();
        return timeB - timeA;
    });

    return allSessions;
}

