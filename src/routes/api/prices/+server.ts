import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';

const ASSET_KEY_TO_TICKER: Record<string, string> = {
    kaspa: 'KAS',
    bitcoin: 'BTC',
    ethereum: 'ETH',
    solana: 'SOL',
    ripple: 'XRP',
    dogecoin: 'DOGE',
    'the-open-network': 'TON',
    sui: 'SUI',
    cardano: 'ADA',
    'avalanche-2': 'AVAX',
    chainlink: 'LINK',
    litecoin: 'LTC',
    'polygon-ecosystem-token': 'POL',
    tron: 'TRX',
    zcash: 'ZEC',
    arbitrum: 'ARB'
};

export const GET: RequestHandler = async ({ url }: RequestEvent) => {
    try {
        let cachedPrices = await redis.get('oracle:spot:prices_json');
        let parsedPrices: Record<string, { usd: number; usd_24h_change?: number }> | null =
            null;

        if (cachedPrices) {
            try {
                parsedPrices = JSON.parse(cachedPrices);
            } catch {
                parsedPrices = null;
            }
        }

        if (parsedPrices) {
            let needsChangeHydration = false;
            for (const [cgKey, entry] of Object.entries(parsedPrices)) {
                const ticker = ASSET_KEY_TO_TICKER[cgKey];
                if (
                    ticker &&
                    (!entry.usd_24h_change || Math.abs(entry.usd_24h_change) < 1e-9)
                ) {
                    const cachedChangeStr = await redis.get(
                        `oracle:change24h:${ticker}_USDC`
                    );
                    const cachedChange = cachedChangeStr ? parseFloat(cachedChangeStr) : 0;
                    if (cachedChange && Math.abs(cachedChange) > 1e-9) {
                        entry.usd_24h_change = cachedChange;
                    } else if (
                        ticker === 'KAS' ||
                        ticker === 'BTC' ||
                        ticker === 'ETH' ||
                        ticker === 'SOL'
                    ) {
                        needsChangeHydration = true;
                    }
                }
            }

            if (needsChangeHydration) {
                const recentCgSync = await redis.get('oracle:change24h:cg_hydrated_lock');
                if (!recentCgSync) {
                    try {
                        await redis.set(
                            'oracle:change24h:cg_hydrated_lock',
                            '1',
                            'EX',
                            45
                        );
                        const ids = Object.keys(ASSET_KEY_TO_TICKER).join(',');
                        const cgRes = await fetch(
                            `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
                            { signal: AbortSignal.timeout(4000) }
                        );
                        if (cgRes.ok) {
                            const cgData = await cgRes.json();
                            const pipe = redis.pipeline();
                            for (const [cgKey, ticker] of Object.entries(
                                ASSET_KEY_TO_TICKER
                            )) {
                                const chg = Number(cgData?.[cgKey]?.usd_24h_change || 0);
                                if (chg !== 0) {
                                    pipe.set(
                                        `oracle:change24h:${ticker}_USDC`,
                                        String(chg),
                                        'EX',
                                        300
                                    );
                                    if (parsedPrices[cgKey]) {
                                        parsedPrices[cgKey].usd_24h_change = chg;
                                    }
                                }
                            }
                            pipe.set(
                                'oracle:spot:prices_json',
                                JSON.stringify(parsedPrices),
                                'EX',
                                15
                            );
                            await pipe.exec();
                        }
                    } catch {
                        // Ignore CoinGecko rate-limit or timeout if exchange WS feeds are still warming up
                    }
                }
            }

            return new Response(JSON.stringify(parsedPrices), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store, no-cache, must-revalidate'
                }
            });
        }

        const ids =
            url.searchParams.get('ids') ||
            'kaspa,bitcoin,ethereum,solana,dogecoin,ripple';
        const cgRes = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
            { signal: AbortSignal.timeout(5000) }
        );
        if (cgRes.ok) {
            const data = await cgRes.json();
            cachedPrices = JSON.stringify(data);
            const pipe = redis.pipeline();
            pipe.set('oracle:spot:prices_json', cachedPrices, 'EX', 15);
            for (const [cgKey, ticker] of Object.entries(ASSET_KEY_TO_TICKER)) {
                if (data?.[cgKey]?.usd) {
                    pipe.set(`oracle:spot:${ticker}_USDC`, String(data[cgKey].usd));
                }
                if (typeof data?.[cgKey]?.usd_24h_change === 'number') {
                    pipe.set(
                        `oracle:change24h:${ticker}_USDC`,
                        String(data[cgKey].usd_24h_change),
                        'EX',
                        300
                    );
                }
            }
            await pipe.exec();

            return new Response(cachedPrices, {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store, no-cache, must-revalidate'
                }
            });
        }

        return json(
            {
                error: 'Oracle Sync Pending',
                message: 'Rust Daemon has not published initial spot prices yet.'
            },
            { status: 503 }
        );
    } catch (e: any) {
        console.error('🚨 CRITICAL: Redis Oracle Read Failed -', e.message);
        return json(
            { error: 'Oracle Cache Unreachable', details: e.message },
            { status: 500 }
        );
    }
};