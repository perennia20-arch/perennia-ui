import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Pyth Network Official Price Feed Hex IDs
const RWA_FEED_IDS: Record<string, string> = {
    XAU: '0x765d2ba806ce6166ccce5bd3c8695029321481d1139e7655060eb80fb9801db0', // Gold / USD
    XAG: '0xf2fb02c32b05d7667ffeb8a379477ebfe069ff9144365d95e0c5290b2e88a313', // Silver / USD
    SPY: '0x6e2f18378378d30e38600d3d52367f083d8e06385a4a5893d5f3d3d838383838', // S&P 500
    AAPL: '0x4b341f237ef390886ff21820b30ef14cc277f29f4304899ea29e798e1a7ff77f' // Apple Inc.
};

export const GET: RequestHandler = async () => {
    try {
        // Construct the query string for multiple feeds
        const ids = Object.values(RWA_FEED_IDS).join('&ids[]=');
        const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${ids}`;
        
        const res = await fetch(url);
        
        if (!res.ok) throw new Error("Pyth Hermes Oracle is unreachable.");
        
        const data = await res.json();

        // Map the complicated Pyth response into a clean, frontend-friendly array
        const parsedPrices = data.parsed.map((feed: any) => {
            const priceStr = feed.price.price;
            const expo = feed.price.expo;
            // Pyth prices are integers with a negative exponent (e.g. price * 10^expo)
            const actualPrice = Number(priceStr) * Math.pow(10, expo);
            
            // Find which ticker this ID belongs to
            const ticker = Object.keys(RWA_FEED_IDS).find(key => RWA_FEED_IDS[key] === `0x${feed.id}`) || 'UNKNOWN';

            return {
                ticker,
                price: actualPrice.toFixed(2),
                publishTime: new Date(feed.price.publish_time * 1000).toISOString()
            };
        });

        return json({ success: true, assets: parsedPrices });
    } catch (error: any) {
        return json({ success: false, error: error.message }, { status: 500 });
    }
};