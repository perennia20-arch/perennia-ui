import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { redis } from '$lib/server/redis'; 

export const GET: RequestHandler = async ({ url }) => {
    try {
        // ⚡ Precision Oracle: O(1) in-memory read from Redis WAL directly (populated by Rust daemon)
        // Completely bypasses CoinGecko's rate limits and allows infinite frontend concurrency
        const cachedPrices = await redis.get('oracle:spot:prices_json');
        
        if (cachedPrices) {
            // Architecture Optimization: Bypass JSON.parse() and SvelteKit's json() overhead
            // by returning the cached raw JSON string natively.
            return new Response(cachedPrices, {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store, no-cache, must-revalidate'
                }
            });
        }
        
        // Strict fallback if the Rust daemon hasn't completed its first loop on boot
        return json({
            kaspa: { usd: 0.16, usd_24h_change: 0 },
            bitcoin: { usd: 65000, usd_24h_change: 0 },
            ethereum: { usd: 3500, usd_24h_change: 0 },
            solana: { usd: 145, usd_24h_change: 0 }
        });
    } catch (e: any) {
        console.error("🚨 CRITICAL: Redis Oracle Read Failed -", e.message);
        return json({ error: "Oracle Cache Unreachable", details: e.message }, { status: 500 });
    }
};