const ccxt = require('ccxt');

async function verify() {
    const id = 'ADU5yR0QPA6622twEtmPxVsW';
    const secret = 'arodVpSl9kBFWSLkxK5gCZIFI6BV-GZ8PQWUbGS4ncI5GBhQ';

    console.log("--- Testing BitMEX with Custom Expiration ---");
    try {
        const bitmex = new ccxt.bitmex({
            apiKey: id,
            secret: secret,
            enableRateLimit: true,
            options: {
                'adjustForTimeDifference': false, // We will handle it manually or use large window
                'api-expires': 300 // Try to set expiration to 5 minutes (default is usually 60)
            }
        });

        // Method 1: extended expiration window
        console.log("Attempt 1: Extended api-expires window (300s)...");
        try {
            const balance = await bitmex.fetchBalance();
            console.log("✅ Success with extended window!");
            console.log(`   Balance: ${balance.total['BTC']} XBT`);
            return;
        } catch (e) {
            console.log("   Failed: " + e.message);
        }

        // Method 2: Manual Time Sync
        console.log("\nAttempt 2: Manual Time Sync...");
        // Fetch server time (public)
        // BitMEX doesn't have a simple 'time' endpoint in ccxt public API mapped sometimes, 
        // but loadMarkets fetches it.

        // Let's manually get the time difference
        // We can use a public request to get the header 'Date' or similar, 
        // but let's just try to set a hardcoded offset if we can guess it from the error message.
        // The error said: "expires is in the past. Current time: 1763991044"
        // My local time (from previous logs) seemed to be around that?
        // Wait, the user's environment time is 2025-11-24. 
        // 1763991044 is indeed around Nov 2025.

        // Let's try to use ccxt's built-in manual offset
        bitmex.options['adjustForTimeDifference'] = false;
        // Force a shift. If "expires is in the past", my time is too early.
        // I need to add to my timestamp.
        // Let's try adding 60 seconds (60000ms) to the time difference.
        bitmex.options['timeDifference'] = 60000;

        try {
            const balance = await bitmex.fetchBalance();
            console.log("✅ Success with manual timeDifference +60s!");
            console.log(`   Balance: ${balance.total['BTC']} XBT`);
            return;
        } catch (e) {
            console.log("   Failed: " + e.message);
        }

    } catch (e) {
        console.log("❌ Setup Failed:", e);
    }
}

verify();
