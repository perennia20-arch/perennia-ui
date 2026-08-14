import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { redis } from '$lib/server/redis'; 

export const GET: RequestHandler = async () => {
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
        
        // ⚡ ZERO MOCK ENFORCEMENT: If Redis is empty, the Oracle is literally offline.
        // Returning a 503 prevents the frontend from rendering false portfolio values.
        return json(
            { error: "Oracle Sync Pending", message: "Rust Daemon has not published initial spot prices yet." }, 
            { status: 503 }
        );
        
    } catch (e: any) {
        console.error("🚨 CRITICAL: Redis Oracle Read Failed -", e.message);
        return json({ error: "Oracle Cache Unreachable", details: e.message }, { status: 500 });
    }
};