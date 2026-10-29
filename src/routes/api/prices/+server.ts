import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';

const SPOT_ORACLE_TTL_SECS = 30;
const CHANGE_24H_TTL_SECS = 300;
const MAX_OUTLIER_DEVIATION_RATIO = 0.12;
const MIN_DISCOVERY_CEX_QUORUM = 2;

const KNOWN_KRC20_ECOSYSTEM_TICKERS = new Set([
    'SILO',
    'NACHO',
    'BEDRCK',
    'PERX',
    'KASPY',
    'KASPER',
    'KANGO',
    'GHOAD',
    'KEKE'
]);

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

interface ExchangeQuote {
    exchange: string;
    priceUsd: number;
    change24hPct: number;
}

export interface DiscoveredAssetPayload {
    ticker: string;
    name: string;
    assetClass: 'Ecosystem' | 'Native L1' | 'DeFi' | 'Tokenized Asset';
    network: string;
    spotPrice: number;
    change24h: number;
    sources: string[];
    quorumCount: number;
    isKrc20: boolean;
    contract?: string;
    maxSupply?: number;
    mintedSupply?: number;
    holders?: number;
    theme: {
        hex: string;
        pastel: string;
    };
    imgUrl: string;
}

function sanitizeTicker(raw: string): string {
    return String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 12);
}

function computeMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
}

function filterOutliersAndComputeMedian(quotes: ExchangeQuote[]): {
    spotPrice: number;
    change24h: number;
    sources: string[];
} {
    const valid = quotes.filter(
        (q) => Number.isFinite(q.priceUsd) && q.priceUsd > 0
    );
    if (valid.length === 0) {
        return { spotPrice: 0, change24h: 0, sources: [] };
    }
    const rawMedian = computeMedian(valid.map((q) => q.priceUsd));
    const filtered =
        rawMedian > 0
            ? valid.filter(
                  (q) =>
                      Math.abs(q.priceUsd - rawMedian) / rawMedian <=
                      MAX_OUTLIER_DEVIATION_RATIO
              )
            : valid;
    const activeSet = filtered.length > 0 ? filtered : valid;
    const spotPrice = computeMedian(activeSet.map((q) => q.priceUsd));
    const changeCandidates = activeSet
        .map((q) => q.change24hPct)
        .filter((c) => Number.isFinite(c) && Math.abs(c) > 0);
    const change24h =
        changeCandidates.length > 0 ? computeMedian(changeCandidates) : 0;
    return {
        spotPrice,
        change24h: Number(change24h.toFixed(2)),
        sources: activeSet.map((q) => q.exchange)
    };
}

async function queryMexcSpot(ticker: string): Promise<ExchangeQuote | null> {
    const symbol = `${ticker}USDT`;
    const res = await fetch(
        `https://api.mexc.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`,
        { signal: AbortSignal.timeout(3200) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const lastPrice = parseFloat(String(data?.lastPrice || '0'));
    if (!Number.isFinite(lastPrice) || lastPrice <= 0) return null;
    const rawChange = parseFloat(String(data?.priceChangePercent || '0'));
    const change24hPct = Number.isFinite(rawChange) ? rawChange * 100 : 0;
    return {
        exchange: 'MEXC',
        priceUsd: lastPrice,
        change24hPct
    };
}

async function queryGateSpot(ticker: string): Promise<ExchangeQuote | null> {
    const pair = `${ticker}_USDT`;
    const res = await fetch(
        `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${encodeURIComponent(pair)}`,
        { signal: AbortSignal.timeout(3200) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const item = Array.isArray(data) ? data[0] : data;
    const lastPrice = parseFloat(String(item?.last || '0'));
    if (!Number.isFinite(lastPrice) || lastPrice <= 0) return null;
    const change24hPct = parseFloat(String(item?.change_percentage || '0'));
    return {
        exchange: 'Gate.io',
        priceUsd: lastPrice,
        change24hPct: Number.isFinite(change24hPct) ? change24hPct : 0
    };
}

async function queryKucoinSpot(ticker: string): Promise<ExchangeQuote | null> {
    const symbol = `${ticker}-USDT`;
    const res = await fetch(
        `https://api.kucoin.com/api/v1/market/stats?symbol=${encodeURIComponent(symbol)}`,
        { signal: AbortSignal.timeout(3200) }
    );
    if (!res.ok) return null;
    const payload = await res.json();
    const data = payload?.data;
    const lastPrice = parseFloat(String(data?.last || '0'));
    if (!Number.isFinite(lastPrice) || lastPrice <= 0) return null;
    const changeRate = parseFloat(String(data?.changeRate || '0'));
    return {
        exchange: 'KuCoin',
        priceUsd: lastPrice,
        change24hPct: Number.isFinite(changeRate) ? changeRate * 100 : 0
    };
}

async function queryBitgetSpot(ticker: string): Promise<ExchangeQuote | null> {
    const symbol = `${ticker}USDT`;
    const res = await fetch(
        `https://api.bitget.com/api/v2/spot/market/tickers?symbol=${encodeURIComponent(symbol)}`,
        { signal: AbortSignal.timeout(3200) }
    );
    if (!res.ok) return null;
    const payload = await res.json();
    const item = Array.isArray(payload?.data) ? payload.data[0] : null;
    const lastPrice = parseFloat(String(item?.lastPr || '0'));
    if (!Number.isFinite(lastPrice) || lastPrice <= 0) return null;
    const change24h = parseFloat(String(item?.change24h || '0'));
    return {
        exchange: 'Bitget',
        priceUsd: lastPrice,
        change24hPct: Number.isFinite(change24h) ? change24h * 100 : 0
    };
}

async function queryCoinexSpot(ticker: string): Promise<ExchangeQuote | null> {
    const market = `${ticker}USDT`;
    const res = await fetch(
        `https://api.coinex.com/v2/spot/ticker?market=${encodeURIComponent(market)}`,
        { signal: AbortSignal.timeout(3200) }
    );
    if (!res.ok) return null;
    const payload = await res.json();
    const item = Array.isArray(payload?.data) ? payload.data[0] : null;
    const lastPrice = parseFloat(String(item?.last || '0'));
    if (!Number.isFinite(lastPrice) || lastPrice <= 0) return null;
    const openPrice = parseFloat(String(item?.open || '0'));
    const change24hPct =
        Number.isFinite(openPrice) && openPrice > 0
            ? ((lastPrice - openPrice) / openPrice) * 100
            : 0;
    return {
        exchange: 'CoinEx',
        priceUsd: lastPrice,
        change24hPct
    };
}

async function queryKrc20Indexer(
    ticker: string,
    kasUsdPrice: number
): Promise<{
    existsOnKasplex: boolean;
    spotPriceUsd: number;
    change24hPct: number;
    maxSupply: number;
    mintedSupply: number;
    holders: number;
    state: string;
} | null> {
    if (ticker.length < 4 || ticker.length > 6 || !/^[A-Z]+$/.test(ticker)) {
        return null;
    }
    const [kasplexRes, kasFyiRes] = await Promise.allSettled([
        fetch(
            `https://api.kasplex.org/v1/krc20/token/${encodeURIComponent(ticker)}`,
            {
                headers: { accept: 'application/json' },
                signal: AbortSignal.timeout(3500)
            }
        ),
        fetch(
            `https://api.kas.fyi/v1/tokens/krc20/${encodeURIComponent(ticker)}/market`,
            {
                headers: { accept: 'application/json' },
                signal: AbortSignal.timeout(3500)
            }
        )
    ]);

    let existsOnKasplex = false;
    let maxSupply = 0;
    let mintedSupply = 0;
    let holders = 0;
    let state = 'unused';

    if (kasplexRes.status === 'fulfilled' && kasplexRes.value.ok) {
        try {
            const kpData = await kasplexRes.value.json();
            const entry = Array.isArray(kpData?.result)
                ? kpData.result[0]
                : kpData?.result;
            const rawState = String(entry?.state || '').toLowerCase();
            if (
                entry &&
                entry.tick &&
                rawState !== 'unused' &&
                rawState !== 'not_found'
            ) {
                existsOnKasplex = true;
                const dec = Number(entry.dec ?? 8);
                maxSupply = Number(entry.max || 0) / Math.pow(10, dec);
                mintedSupply = Number(entry.minted || 0) / Math.pow(10, dec);
                holders = Number(entry.holderTotal ?? entry.holders ?? 0);
                state = String(entry.state || 'deployed');
            }
        } catch {
            existsOnKasplex = false;
        }
    }

    let spotPriceUsd = 0;
    let change24hPct = 0;
    if (kasFyiRes.status === 'fulfilled' && kasFyiRes.value.ok) {
        try {
            const mkt = await kasFyiRes.value.json();
            const usdVal = Number(
                mkt?.price?.usd ?? mkt?.priceUsd ?? mkt?.price ?? 0
            );
            const kasVal = Number(mkt?.price?.kas ?? mkt?.priceKas ?? 0);
            if (Number.isFinite(usdVal) && usdVal > 0) {
                spotPriceUsd = usdVal;
            } else if (
                Number.isFinite(kasVal) &&
                kasVal > 0 &&
                kasUsdPrice > 0
            ) {
                spotPriceUsd = kasVal * kasUsdPrice;
            }
            const chg = Number(
                mkt?.change24h ?? mkt?.priceChange24h ?? mkt?.change_24h ?? 0
            );
            if (Number.isFinite(chg)) {
                change24hPct = chg;
            }
        } catch {
            spotPriceUsd = 0;
        }
    }

    if (!existsOnKasplex && spotPriceUsd <= 0) {
        return null;
    }

    return {
        existsOnKasplex,
        spotPriceUsd,
        change24hPct,
        maxSupply,
        mintedSupply,
        holders,
        state
    };
}

async function discoverLiveAsset(
    rawTicker: string,
    persistInDynamicSet = false
): Promise<DiscoveredAssetPayload | null> {
    const ticker = sanitizeTicker(rawTicker);
    if (ticker.length < 2) return null;

    const [cachedSpotStr, cachedChangeStr, cachedMetaRaw, kasSpotStr] =
        await Promise.all([
            redis.get(`oracle:spot:${ticker}_USDC`).catch(() => null),
            redis.get(`oracle:change24h:${ticker}_USDC`).catch(() => null),
            redis.get(`oracle:dynamic_meta:${ticker}`).catch(() => null),
            redis.get('oracle:spot:KAS_USDC').catch(() => null)
        ]);

    const kasUsdPrice = kasSpotStr ? parseFloat(kasSpotStr) || 0 : 0;

    if (cachedSpotStr && cachedMetaRaw) {
        const cachedSpot = parseFloat(cachedSpotStr);
        if (Number.isFinite(cachedSpot) && cachedSpot > 0) {
            try {
                const meta = JSON.parse(cachedMetaRaw) as DiscoveredAssetPayload;
                meta.spotPrice = cachedSpot;
                if (cachedChangeStr) {
                    const chg = parseFloat(cachedChangeStr);
                    if (Number.isFinite(chg)) meta.change24h = chg;
                }
                if (persistInDynamicSet) {
                    await redis
                        .sadd('oracle:dynamic_tickers', ticker)
                        .catch(() => {});
                }
                return meta;
            } catch {
                // Re-discover on malformed cached meta
            }
        }
    }

    const [mexcRes, gateRes, kucoinRes, bitgetRes, coinexRes, krc20Res] =
        await Promise.allSettled([
            queryMexcSpot(ticker),
            queryGateSpot(ticker),
            queryKucoinSpot(ticker),
            queryBitgetSpot(ticker),
            queryCoinexSpot(ticker),
            queryKrc20Indexer(ticker, kasUsdPrice)
        ]);

    const exchangeQuotes: ExchangeQuote[] = [];
    for (const r of [mexcRes, gateRes, kucoinRes, bitgetRes, coinexRes]) {
        if (r.status === 'fulfilled' && r.value && r.value.priceUsd > 0) {
            exchangeQuotes.push(r.value);
        }
    }

    const krc20Info =
        krc20Res.status === 'fulfilled' ? krc20Res.value : null;

    const {
        spotPrice: cexMedianSpot,
        change24h: cexChange,
        sources: cexSources
    } = filterOutliersAndComputeMedian(exchangeQuotes);

    const hasValidCexQuorum =
        cexSources.length >= MIN_DISCOVERY_CEX_QUORUM && cexMedianSpot > 0;

    const isGenuineKrc20 = Boolean(
        krc20Info?.existsOnKasplex &&
            (KNOWN_KRC20_ECOSYSTEM_TICKERS.has(ticker) ||
                !hasValidCexQuorum ||
                (krc20Info.spotPriceUsd > 0 &&
                    Math.abs(krc20Info.spotPriceUsd - cexMedianSpot) /
                        cexMedianSpot <=
                        0.25))
    );

    let finalSpotPrice = hasValidCexQuorum ? cexMedianSpot : 0;
    let finalChange24h = hasValidCexQuorum ? cexChange : 0;
    const finalSources = hasValidCexQuorum ? [...cexSources] : [];

    if (isGenuineKrc20) {
        if (finalSpotPrice <= 0 && krc20Info && krc20Info.spotPriceUsd > 0) {
            finalSpotPrice = krc20Info.spotPriceUsd;
            finalChange24h = krc20Info.change24hPct;
            finalSources.push('Kasplex/kas.fyi');
        } else if (krc20Info?.existsOnKasplex) {
            finalSources.push('Kasplex L1');
        }
    }

    if (finalSpotPrice <= 0 && !isGenuineKrc20) {
        return null;
    }

    const network = isGenuineKrc20 ? 'KAS' : 'ETH';
    const assetClass: DiscoveredAssetPayload['assetClass'] = isGenuineKrc20
        ? 'Ecosystem'
        : 'DeFi';

    const discovered: DiscoveredAssetPayload = {
        ticker,
        name: isGenuineKrc20
            ? `${ticker} (KRC-20 L1)`
            : `${ticker} (${finalSources.slice(0, 3).join(' • ') || 'Spot Oracle'})`,
        assetClass,
        network,
        spotPrice: finalSpotPrice,
        change24h: finalChange24h,
        sources: finalSources,
        quorumCount: finalSources.length,
        isKrc20: isGenuineKrc20,
        contract: ticker,
        maxSupply: isGenuineKrc20 ? krc20Info?.maxSupply || undefined : undefined,
        mintedSupply: isGenuineKrc20
            ? krc20Info?.mintedSupply || undefined
            : undefined,
        holders: isGenuineKrc20 ? krc20Info?.holders || undefined : undefined,
        theme: isGenuineKrc20
            ? { hex: '#18C6A5', pastel: '#99f6e4' }
            : { hex: '#3B82F6', pastel: '#bfdbfe' },
        imgUrl: isGenuineKrc20
            ? `https://storage.googleapis.com/kasfyi/token-icons/${ticker.toLowerCase()}.png`
            : `https://cryptologos.cc/logos/${ticker.toLowerCase()}-${ticker.toLowerCase()}-logo.svg`
    };

    const pipe = redis.pipeline();
    if (persistInDynamicSet) {
        pipe.sadd('oracle:dynamic_tickers', ticker);
    }
    pipe.set(
        `oracle:dynamic_meta:${ticker}`,
        JSON.stringify(discovered),
        'EX',
        3600
    );
    if (finalSpotPrice > 0) {
        pipe.set(
            `oracle:spot:${ticker}_USDC`,
            String(finalSpotPrice),
            'EX',
            SPOT_ORACLE_TTL_SECS
        );
        pipe.set(
            `oracle:change24h:${ticker}_USDC`,
            String(finalChange24h),
            'EX',
            CHANGE_24H_TTL_SECS
        );
    }
    await pipe.exec().catch(() => {});

    return discovered;
}

export const GET: RequestHandler = async ({ url }: RequestEvent) => {
    try {
        const discoverQuery = url.searchParams.get('discover');
        if (discoverQuery && discoverQuery.trim().length > 0) {
            const cleanTicker = sanitizeTicker(discoverQuery);
            if (cleanTicker.length < 2) {
                return json(
                    {
                        success: false,
                        error: 'Enter at least 2 characters to discover a live ticker.'
                    },
                    { status: 400 }
                );
            }
            const shouldPersist = url.searchParams.get('register') === '1';
            const discovered = await discoverLiveAsset(
                cleanTicker,
                shouldPersist
            );
            if (!discovered) {
                return json(
                    {
                        success: false,
                        ticker: cleanTicker,
                        error: `No live 2-node exchange quorum (MEXC, Gate.io, KuCoin, Bitget, CoinEx) or Kasplex KRC-20 deployment found for "${cleanTicker}".`
                    },
                    { status: 404 }
                );
            }
            return json(
                {
                    success: true,
                    asset: discovered
                },
                {
                    status: 200,
                    headers: {
                        'Cache-Control': 'no-store, no-cache, must-revalidate'
                    }
                }
            );
        }

        let cachedPrices = await redis.get('oracle:spot:prices_json');
        let parsedPrices: Record<
            string,
            { usd: number; usd_24h_change?: number }
        > | null = null;
        if (cachedPrices) {
            try {
                parsedPrices = JSON.parse(cachedPrices);
            } catch {
                parsedPrices = null;
            }
        }

        const dynamicTickers = await redis
            .smembers('oracle:dynamic_tickers')
            .catch(() => [] as string[]);

        if (parsedPrices) {
            let needsChangeHydration = false;
            for (const [cgKey, entry] of Object.entries(parsedPrices)) {
                const ticker = ASSET_KEY_TO_TICKER[cgKey];
                if (
                    ticker &&
                    (!entry.usd_24h_change ||
                        Math.abs(entry.usd_24h_change) < 1e-9)
                ) {
                    const cachedChangeStr = await redis.get(
                        `oracle:change24h:${ticker}_USDC`
                    );
                    const cachedChange = cachedChangeStr
                        ? parseFloat(cachedChangeStr)
                        : 0;
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

            if (dynamicTickers.length > 0) {
                await Promise.all(
                    dynamicTickers.slice(0, 50).map(async (dynTicker) => {
                        const clean = sanitizeTicker(dynTicker);
                        if (!clean) return;
                        const [spotStr, chgStr] = await Promise.all([
                            redis
                                .get(`oracle:spot:${clean}_USDC`)
                                .catch(() => null),
                            redis
                                .get(`oracle:change24h:${clean}_USDC`)
                                .catch(() => null)
                        ]);
                        const spot = spotStr ? parseFloat(spotStr) : 0;
                        const chg = chgStr ? parseFloat(chgStr) : 0;
                        if (Number.isFinite(spot) && spot > 0 && parsedPrices) {
                            parsedPrices[clean.toLowerCase()] = {
                                usd: spot,
                                usd_24h_change: Number.isFinite(chg) ? chg : 0
                            };
                        }
                    })
                );
            }

            if (needsChangeHydration) {
                const recentCgSync = await redis.get(
                    'oracle:change24h:cg_hydrated_lock'
                );
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
                                const chg = Number(
                                    cgData?.[cgKey]?.usd_24h_change || 0
                                );
                                if (chg !== 0) {
                                    pipe.set(
                                        `oracle:change24h:${ticker}_USDC`,
                                        String(chg),
                                        'EX',
                                        CHANGE_24H_TTL_SECS
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
                                SPOT_ORACLE_TTL_SECS
                            );
                            await pipe.exec();
                        }
                    } catch {
                        // Ignore secondary 24h change hydration timeout
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
            pipe.set(
                'oracle:spot:prices_json',
                cachedPrices,
                'EX',
                SPOT_ORACLE_TTL_SECS
            );
            for (const [cgKey, ticker] of Object.entries(ASSET_KEY_TO_TICKER)) {
                const spotUsd = Number(data?.[cgKey]?.usd || 0);
                if (Number.isFinite(spotUsd) && spotUsd > 0) {
                    pipe.set(
                        `oracle:spot:${ticker}_USDC`,
                        String(spotUsd),
                        'EX',
                        SPOT_ORACLE_TTL_SECS
                    );
                }
                if (typeof data?.[cgKey]?.usd_24h_change === 'number') {
                    pipe.set(
                        `oracle:change24h:${ticker}_USDC`,
                        String(data[cgKey].usd_24h_change),
                        'EX',
                        CHANGE_24H_TTL_SECS
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