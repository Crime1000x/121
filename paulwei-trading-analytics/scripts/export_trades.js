const ccxt = require('ccxt');
const fs = require('fs');
const path = require('path');

const API_KEY = 'ADU5yR0QPA6622twEtmPxVsW';
const API_SECRET = 'arodVpSl9kBFWSLkxK5gCZIFI6BV-GZ8PQWUbGS4ncI5GBhQ';

async function exportTrades() {
    console.log("Initializing BitMEX client...");
    const bitmex = new ccxt.bitmex({
        apiKey: API_KEY,
        secret: API_SECRET,
        enableRateLimit: true,
        options: {
            'adjustForTimeDifference': false,
            'api-expires': 300
        },
    });

    // Sync time
    try {
        await bitmex.loadMarkets();
        console.log("Markets loaded and time synced.");
    } catch (e) {
        console.warn("Warning: loadMarkets failed:", e.message);
    }

    const start = new Date('2020-05-01').getTime();
    const end = new Date('2025-11-23').getTime();
    let since = start;
    const limit = 500;
    let allTrades = [];

    const csvPath = path.join(__dirname, '..', 'bitmex_trades.csv');
    const headers = 'id,datetime,symbol,side,price,amount,cost,fee_cost,fee_currency,execID\n';
    fs.writeFileSync(csvPath, headers); // Write headers

    console.log(`Starting export from ${new Date(start).toISOString()} to ${new Date(end).toISOString()}...`);

    try {
        while (true) {
            console.log(`Fetching batch from ${new Date(since).toISOString()}...`);

            // Add delay to be safe
            await new Promise(r => setTimeout(r, 1000));

            const trades = await bitmex.fetchMyTrades(undefined, since, limit, {
                'endTime': new Date(end).toISOString(),
            });

            if (trades.length === 0) {
                console.log("No more trades found.");
                break;
            }

            console.log(`Fetched ${trades.length} trades.`);

            // Append to CSV immediately to save memory and progress
            const csvRows = trades.map(t => {
                const side = t.side || 'unknown';
                const feeCost = t.fee ? t.fee.cost : 0;
                const feeCurrency = t.fee ? t.fee.currency : 'XBT';
                return `${t.id},${t.datetime},${t.symbol},${side},${t.price},${t.amount},${t.cost},${feeCost},${feeCurrency},${t.info.execID}`;
            }).join('\n');

            fs.appendFileSync(csvPath, csvRows + '\n');

            allTrades = allTrades.concat(trades);

            const lastTradeTime = trades[trades.length - 1].timestamp;

            if (lastTradeTime >= end || trades.length < limit) {
                console.log("Reached end time or incomplete batch.");
                break;
            }

            since = lastTradeTime + 1;
        }

        console.log(`\n✅ Export Complete!`);
        console.log(`Total Trades: ${allTrades.length}`);
        console.log(`Saved to: ${csvPath}`);

    } catch (error) {
        console.error("❌ Export Failed:", error);
    }
}

exportTrades();
