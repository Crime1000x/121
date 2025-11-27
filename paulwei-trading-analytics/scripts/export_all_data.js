/**
 * BitMEX Complete Data Exporter
 * 
 * Exports:
 * 1. Trade History (Executions) - 成交記錄
 * 2. Order History - 訂單歷史（包括未成交、取消的訂單）
 * 3. Wallet History - 錢包歷史（資金費率 Funding、存取款）
 */

const ccxt = require('ccxt');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const API_KEY = 'ADU5yR0QPA6622twEtmPxVsW';
const API_SECRET = 'arodVpSl9kBFWSLkxK5gCZIFI6BV-GZ8PQWUbGS4ncI5GBhQ';

const START_DATE = new Date('2020-05-01');
const END_DATE = new Date('2025-11-24');

// Helper function to make signed BitMEX API requests
async function bitmexRequest(method, endpoint, params = {}) {
    return new Promise((resolve, reject) => {
        const expires = Math.floor(Date.now() / 1000) + 60;
        
        let query = '';
        let body = '';
        
        if (method === 'GET' && Object.keys(params).length > 0) {
            query = '?' + new URLSearchParams(params).toString();
        } else if (method === 'POST') {
            body = JSON.stringify(params);
        }
        
        const path = `/api/v1${endpoint}${query}`;
        const message = method + path + expires + body;
        const signature = crypto.createHmac('sha256', API_SECRET).update(message).digest('hex');
        
        const options = {
            hostname: 'www.bitmex.com',
            port: 443,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'api-expires': expires,
                'api-key': API_KEY,
                'api-signature': signature
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (res.statusCode >= 400) {
                        reject(new Error(`API Error ${res.statusCode}: ${JSON.stringify(json)}`));
                    } else {
                        resolve(json);
                    }
                } catch (e) {
                    reject(new Error(`Parse error: ${data}`));
                }
            });
        });
        
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

// 1. Export Trades (using ccxt - same as before but improved)
async function exportTrades() {
    console.log('\n📊 Exporting Trade History...');
    
    const bitmex = new ccxt.bitmex({
        apiKey: API_KEY,
        secret: API_SECRET,
        enableRateLimit: true,
        options: {
            'adjustForTimeDifference': false,
            'api-expires': 300
        },
    });

    try {
        await bitmex.loadMarkets();
    } catch (e) {
        console.warn("Warning: loadMarkets failed:", e.message);
    }

    const csvPath = path.join(__dirname, '..', 'bitmex_trades.csv');
    const headers = 'id,datetime,symbol,side,price,amount,cost,fee_cost,fee_currency,execID\n';
    fs.writeFileSync(csvPath, headers);

    let since = START_DATE.getTime();
    const end = END_DATE.getTime();
    const limit = 500;
    let totalCount = 0;

    try {
        while (true) {
            await new Promise(r => setTimeout(r, 1000));

            const trades = await bitmex.fetchMyTrades(undefined, since, limit, {
                'endTime': new Date(end).toISOString(),
            });

            if (trades.length === 0) break;

            const csvRows = trades.map(t => {
                const side = t.side || 'unknown';
                const feeCost = t.fee ? t.fee.cost : 0;
                const feeCurrency = t.fee ? t.fee.currency : 'XBT';
                return `${t.id},${t.datetime},${t.symbol},${side},${t.price},${t.amount},${t.cost},${feeCost},${feeCurrency},${t.info.execID}`;
            }).join('\n');

            fs.appendFileSync(csvPath, csvRows + '\n');
            totalCount += trades.length;

            process.stdout.write(`\r   Fetched ${totalCount} trades...`);

            const lastTradeTime = trades[trades.length - 1].timestamp;
            if (lastTradeTime >= end || trades.length < limit) break;
            since = lastTradeTime + 1;
        }

        console.log(`\n   ✅ Trades exported: ${totalCount} → ${csvPath}`);
        return totalCount;
    } catch (error) {
        console.error("\n   ❌ Trade export failed:", error.message);
        return 0;
    }
}

// 2. Export Order History
async function exportOrders() {
    console.log('\n📋 Exporting Order History...');
    
    const csvPath = path.join(__dirname, '..', 'bitmex_orders.csv');
    const headers = 'orderID,symbol,side,ordType,orderQty,price,stopPx,avgPx,cumQty,ordStatus,timestamp,text\n';
    fs.writeFileSync(csvPath, headers);

    let start = 0;
    const count = 500;
    let totalCount = 0;
    const allOrders = [];

    try {
        while (true) {
            await new Promise(r => setTimeout(r, 1000));

            const orders = await bitmexRequest('GET', '/order', {
                count: count,
                start: start,
                reverse: false,
                startTime: START_DATE.toISOString(),
                endTime: END_DATE.toISOString()
            });

            if (!orders || orders.length === 0) break;

            const csvRows = orders.map(o => {
                return [
                    o.orderID,
                    o.symbol,
                    o.side,
                    o.ordType,
                    o.orderQty,
                    o.price || '',
                    o.stopPx || '',
                    o.avgPx || '',
                    o.cumQty || 0,
                    o.ordStatus,
                    o.timestamp,
                    `"${(o.text || '').replace(/"/g, '""')}"`
                ].join(',');
            }).join('\n');

            fs.appendFileSync(csvPath, csvRows + '\n');
            totalCount += orders.length;
            allOrders.push(...orders);

            process.stdout.write(`\r   Fetched ${totalCount} orders...`);

            if (orders.length < count) break;
            start += count;
        }

        console.log(`\n   ✅ Orders exported: ${totalCount} → ${csvPath}`);
        
        // Generate order statistics
        const stats = {
            total: allOrders.length,
            filled: allOrders.filter(o => o.ordStatus === 'Filled').length,
            canceled: allOrders.filter(o => o.ordStatus === 'Canceled').length,
            rejected: allOrders.filter(o => o.ordStatus === 'Rejected').length,
            partiallyFilled: allOrders.filter(o => o.ordStatus === 'PartiallyFilled').length,
            byType: {}
        };
        
        allOrders.forEach(o => {
            stats.byType[o.ordType] = (stats.byType[o.ordType] || 0) + 1;
        });
        
        console.log(`   📈 Order Statistics:`);
        console.log(`      - Filled: ${stats.filled}`);
        console.log(`      - Canceled: ${stats.canceled}`);
        console.log(`      - Rejected: ${stats.rejected}`);
        console.log(`      - Order Types:`, stats.byType);

        return totalCount;
    } catch (error) {
        console.error("\n   ❌ Order export failed:", error.message);
        return 0;
    }
}

// 3. Export Wallet History (Funding, Deposits, Withdrawals)
async function exportWalletHistory() {
    console.log('\n💰 Exporting Wallet History (Funding, Deposits, Withdrawals)...');
    
    const csvPath = path.join(__dirname, '..', 'bitmex_wallet_history.csv');
    const headers = 'transactID,account,currency,transactType,amount,fee,transactStatus,address,tx,text,timestamp,walletBalance,marginBalance\n';
    fs.writeFileSync(csvPath, headers);

    let start = 0;
    const count = 500;
    let totalCount = 0;
    const allTransactions = [];

    try {
        while (true) {
            await new Promise(r => setTimeout(r, 1000));

            const transactions = await bitmexRequest('GET', '/user/walletHistory', {
                count: count,
                start: start,
                currency: 'XBt' // BitMEX uses XBt (satoshis)
            });

            if (!transactions || transactions.length === 0) break;

            const csvRows = transactions.map(t => {
                return [
                    t.transactID,
                    t.account,
                    t.currency,
                    t.transactType,
                    t.amount,
                    t.fee || 0,
                    t.transactStatus,
                    t.address || '',
                    t.tx || '',
                    `"${(t.text || '').replace(/"/g, '""')}"`,
                    t.timestamp,
                    t.walletBalance,
                    t.marginBalance || ''
                ].join(',');
            }).join('\n');

            fs.appendFileSync(csvPath, csvRows + '\n');
            totalCount += transactions.length;
            allTransactions.push(...transactions);

            process.stdout.write(`\r   Fetched ${totalCount} transactions...`);

            if (transactions.length < count) break;
            start += count;
        }

        console.log(`\n   ✅ Wallet history exported: ${totalCount} → ${csvPath}`);

        // Calculate funding statistics
        const funding = allTransactions.filter(t => t.transactType === 'RealisedPNL');
        const deposits = allTransactions.filter(t => t.transactType === 'Deposit');
        const withdrawals = allTransactions.filter(t => t.transactType === 'Withdrawal');
        const affiliatePayouts = allTransactions.filter(t => t.transactType === 'AffiliatePayout');

        // Sum funding (in satoshis, convert to BTC)
        const totalFunding = funding.reduce((sum, t) => sum + t.amount, 0) / 100000000;
        const totalDeposits = deposits.reduce((sum, t) => sum + t.amount, 0) / 100000000;
        const totalWithdrawals = withdrawals.reduce((sum, t) => sum + Math.abs(t.amount), 0) / 100000000;

        console.log(`   📈 Wallet Statistics:`);
        console.log(`      - Realized PnL entries: ${funding.length} (Total: ${totalFunding.toFixed(8)} BTC)`);
        console.log(`      - Deposits: ${deposits.length} (Total: ${totalDeposits.toFixed(8)} BTC)`);
        console.log(`      - Withdrawals: ${withdrawals.length} (Total: ${totalWithdrawals.toFixed(8)} BTC)`);
        console.log(`      - Affiliate Payouts: ${affiliatePayouts.length}`);

        return totalCount;
    } catch (error) {
        console.error("\n   ❌ Wallet history export failed:", error.message);
        return 0;
    }
}

// 4. Export Execution History (more detailed than trades)
async function exportExecutions() {
    console.log('\n⚡ Exporting Execution History (detailed)...');
    
    const csvPath = path.join(__dirname, '..', 'bitmex_executions.csv');
    const headers = 'execID,orderID,symbol,side,lastQty,lastPx,execType,ordType,ordStatus,execCost,execComm,timestamp,text\n';
    fs.writeFileSync(csvPath, headers);

    let start = 0;
    const count = 500;
    let totalCount = 0;

    try {
        while (true) {
            await new Promise(r => setTimeout(r, 1000));

            const executions = await bitmexRequest('GET', '/execution/tradeHistory', {
                count: count,
                start: start,
                reverse: false,
                startTime: START_DATE.toISOString(),
                endTime: END_DATE.toISOString()
            });

            if (!executions || executions.length === 0) break;

            const csvRows = executions.map(e => {
                return [
                    e.execID,
                    e.orderID,
                    e.symbol,
                    e.side,
                    e.lastQty,
                    e.lastPx,
                    e.execType,
                    e.ordType,
                    e.ordStatus,
                    e.execCost,
                    e.execComm,
                    e.timestamp,
                    `"${(e.text || '').replace(/"/g, '""')}"`
                ].join(',');
            }).join('\n');

            fs.appendFileSync(csvPath, csvRows + '\n');
            totalCount += executions.length;

            process.stdout.write(`\r   Fetched ${totalCount} executions...`);

            if (executions.length < count) break;
            start += count;
        }

        console.log(`\n   ✅ Executions exported: ${totalCount} → ${csvPath}`);
        return totalCount;
    } catch (error) {
        console.error("\n   ❌ Execution export failed:", error.message);
        return 0;
    }
}

// 5. Get Current Account Summary
async function getAccountSummary() {
    console.log('\n👤 Fetching Account Summary...');
    
    try {
        // Get user info
        const user = await bitmexRequest('GET', '/user');
        console.log(`   Account: ${user.username || user.id}`);
        
        // Get wallet
        const wallet = await bitmexRequest('GET', '/user/wallet');
        console.log(`   Wallet Balance: ${(wallet.walletBalance / 100000000).toFixed(8)} BTC`);
        
        // Get margin
        const margin = await bitmexRequest('GET', '/user/margin');
        console.log(`   Available Margin: ${(margin.availableMargin / 100000000).toFixed(8)} BTC`);
        console.log(`   Unrealized PnL: ${(margin.unrealisedPnl / 100000000).toFixed(8)} BTC`);
        
        // Get current positions
        const positions = await bitmexRequest('GET', '/position');
        const openPositions = positions.filter(p => p.isOpen);
        
        if (openPositions.length > 0) {
            console.log(`   Current Open Positions: ${openPositions.length}`);
            openPositions.forEach(p => {
                console.log(`      - ${p.symbol}: ${p.currentQty} @ avg ${p.avgEntryPrice}`);
            });
        } else {
            console.log(`   Current Open Positions: None`);
        }
        
        // Save summary to JSON
        const summaryPath = path.join(__dirname, '..', 'bitmex_account_summary.json');
        const summary = {
            exportDate: new Date().toISOString(),
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            },
            wallet: {
                walletBalance: wallet.walletBalance / 100000000,
                marginBalance: margin.marginBalance / 100000000,
                availableMargin: margin.availableMargin / 100000000,
                unrealisedPnl: margin.unrealisedPnl / 100000000,
                realisedPnl: margin.realisedPnl / 100000000
            },
            positions: openPositions.map(p => ({
                symbol: p.symbol,
                currentQty: p.currentQty,
                avgEntryPrice: p.avgEntryPrice,
                unrealisedPnl: p.unrealisedPnl / 100000000,
                liquidationPrice: p.liquidationPrice
            }))
        };
        
        fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
        console.log(`   ✅ Account summary saved → ${summaryPath}`);
        
    } catch (error) {
        console.error("   ❌ Account summary failed:", error.message);
    }
}

// Main Export Function
async function exportAll() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('           BitMEX Complete Data Export');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Date Range: ${START_DATE.toISOString().split('T')[0]} to ${END_DATE.toISOString().split('T')[0]}`);
    console.log('═══════════════════════════════════════════════════════════');

    const startTime = Date.now();

    // Run all exports
    await getAccountSummary();
    const trades = await exportTrades();
    const orders = await exportOrders();
    const wallet = await exportWalletHistory();
    const executions = await exportExecutions();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('                    Export Complete!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`   Trades:     ${trades}`);
    console.log(`   Orders:     ${orders}`);
    console.log(`   Wallet:     ${wallet}`);
    console.log(`   Executions: ${executions}`);
    console.log(`   Duration:   ${duration}s`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\n📁 Files created:');
    console.log('   - bitmex_trades.csv');
    console.log('   - bitmex_orders.csv');
    console.log('   - bitmex_wallet_history.csv');
    console.log('   - bitmex_executions.csv');
    console.log('   - bitmex_account_summary.json');
}

exportAll().catch(console.error);

