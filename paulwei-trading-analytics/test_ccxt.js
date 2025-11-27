const ccxt = require('ccxt');

async function test() {
    try {
        console.log("CCXT version:", ccxt.version);
        const bitmex = new ccxt.bitmex();
        console.log("BitMEX client created.");
        // Try a public request
        const ticker = await bitmex.fetchTicker('BTC/USD');
        console.log("Ticker fetched:", ticker.symbol, ticker.last);
    } catch (e) {
        console.error("Error:", e);
    }
}

test();
