/**
 * Verify Position Session Calculation
 * This script traces through executions to verify position tracking is correct
 */

const fs = require('fs');
const path = require('path');

// Load and parse executions CSV
function loadExecutions() {
    const csvPath = path.join(__dirname, '..', 'bitmex_executions.csv');
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',');
    
    return lines.slice(1).map(line => {
        // Handle quoted fields (text field might contain commas)
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current);
        
        return {
            execID: values[0],
            orderID: values[1],
            symbol: values[2],
            side: values[3],
            lastQty: parseFloat(values[4]) || 0,
            lastPx: parseFloat(values[5]) || 0,
            execType: values[6],
            ordType: values[7],
            ordStatus: values[8],
            execCost: parseFloat(values[9]) || 0,
            execComm: parseFloat(values[10]) || 0,
            timestamp: values[11],
            text: values[12] || '',
        };
    }).filter(e => e.execType === 'Trade' && e.side && e.lastQty > 0);
}

// Main verification
function verifyPositions(symbol = 'XBTUSD', limit = 100) {
    const executions = loadExecutions();
    const symbolExecs = executions
        .filter(e => e.symbol === symbol)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Position Tracking Verification for ${symbol}`);
    console.log(`Total executions: ${symbolExecs.length}`);
    console.log(`${'='.repeat(80)}\n`);
    
    let runningPosition = 0;
    let sessionCount = 0;
    let sessionStart = null;
    
    const sessions = [];
    let currentSession = null;
    
    for (let i = 0; i < Math.min(symbolExecs.length, limit); i++) {
        const exec = symbolExecs[i];
        const positionBefore = runningPosition;
        
        if (exec.side === 'Buy') {
            runningPosition += exec.lastQty;
        } else {
            runningPosition -= exec.lastQty;
        }
        
        // Session start
        if (positionBefore === 0 && runningPosition !== 0) {
            sessionCount++;
            sessionStart = exec.timestamp;
            currentSession = {
                id: sessionCount,
                startTime: exec.timestamp,
                startPrice: exec.lastPx,
                side: runningPosition > 0 ? 'LONG' : 'SHORT',
                trades: [],
            };
        }
        
        // Track trade
        if (currentSession) {
            currentSession.trades.push({
                time: exec.timestamp,
                side: exec.side,
                qty: exec.lastQty,
                price: exec.lastPx,
                positionAfter: runningPosition,
            });
        }
        
        // Session end
        if (positionBefore !== 0 && runningPosition === 0) {
            currentSession.endTime = exec.timestamp;
            currentSession.endPrice = exec.lastPx;
            sessions.push(currentSession);
            
            console.log(`\n📊 Session #${currentSession.id} (${currentSession.side})`);
            console.log(`   Open:  ${new Date(currentSession.startTime).toLocaleString()} @ $${currentSession.startPrice}`);
            console.log(`   Close: ${new Date(currentSession.endTime).toLocaleString()} @ $${currentSession.endPrice}`);
            console.log(`   Trades: ${currentSession.trades.length}`);
            
            // Show trade summary
            const buys = currentSession.trades.filter(t => t.side === 'Buy');
            const sells = currentSession.trades.filter(t => t.side === 'Sell');
            const totalBuy = buys.reduce((sum, t) => sum + t.qty, 0);
            const totalSell = sells.reduce((sum, t) => sum + t.qty, 0);
            console.log(`   Total Buy:  ${totalBuy.toLocaleString()}`);
            console.log(`   Total Sell: ${totalSell.toLocaleString()}`);
            
            currentSession = null;
        }
        
        // Position flip
        if ((positionBefore > 0 && runningPosition < 0) || 
            (positionBefore < 0 && runningPosition > 0)) {
            console.log(`\n⚠️  Position FLIP at ${exec.timestamp}`);
            console.log(`   ${positionBefore} → ${runningPosition}`);
        }
        
        // Print first few executions for debugging
        if (i < 20) {
            const arrow = exec.side === 'Buy' ? '🟢' : '🔴';
            console.log(`${arrow} ${exec.timestamp.substring(0, 19)} | ${exec.side.padEnd(4)} ${exec.lastQty.toString().padStart(8)} @ $${exec.lastPx.toString().padStart(10)} | Position: ${runningPosition.toString().padStart(10)}`);
        } else if (i === 20) {
            console.log(`\n... showing only first 20 executions ...\n`);
        }
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`SUMMARY`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Total closed sessions: ${sessions.length}`);
    console.log(`Current position: ${runningPosition}`);
    
    if (runningPosition !== 0) {
        console.log(`\n⚠️  Open position detected: ${runningPosition} (${runningPosition > 0 ? 'LONG' : 'SHORT'})`);
    }
}

// Run verification
const symbol = process.argv[2] || 'XBTUSD';
const limit = parseInt(process.argv[3]) || 200;

verifyPositions(symbol, limit);

