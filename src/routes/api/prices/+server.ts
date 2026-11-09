// WINDOWS (FRONTEND): C:\Users\send2\perennia-v5\perennia-frontend\src\routes\api\prices\+server.ts
import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { dbPool } from '$lib/server/db';

const SPOT_ORACLE_TTL_SECS = 30;
const CHANGE_24H_TTL_SECS = 300;
const RWA_ORACLE_TTL_SECS = 120;
const MAX_OUTLIER_DEVIATION_RATIO = 0.12;
const MAX_CANONICAL_DEVIATION_RATIO = 0.08;
const MIN_DISCOVERY_CEX_QUORUM = 2;
const MIN_CEX_24H_VOLUME_USD = 25_000;
const MAX_CEX_SPREAD_RATIO = 0.05;

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

const RWA_DEFAULT_FEEDS: Array<{
    ticker: string;
    yahooSymbol: string;
    assetClass: 'EQUITY' | 'COMMODITY' | 'TREASURY';
    name: string;
}> = [
    { ticker: 'SPY', yahooSymbol: 'SPY', assetClass: 'EQUITY', name: 'S&P 500 ETF' },
    { ticker: 'QQQ', yahooSymbol: 'QQQ', assetClass: 'EQUITY', name: 'Nasdaq 100 Index' },
    { ticker: 'NVDA', yahooSymbol: 'NVDA', assetClass: 'EQUITY', name: 'NVIDIA Corp.' },
    { ticker: 'AAPL', yahooSymbol: 'AAPL', assetClass: 'EQUITY', name: 'Apple Inc.' },
    { ticker: 'TSLA', yahooSymbol: 'TSLA', assetClass: 'EQUITY', name: 'Tesla Inc.' },
    { ticker: 'AMD', yahooSymbol: 'AMD', assetClass: 'EQUITY', name: 'Advanced Micro Devices' },
    { ticker: 'TSM', yahooSymbol: 'TSM', assetClass: 'EQUITY', name: 'Taiwan Semiconductor' },
    { ticker: 'AVGO', yahooSymbol: 'AVGO', assetClass: 'EQUITY', name: 'Broadcom Inc.' },
    { ticker: 'XLE', yahooSymbol: 'XLE', assetClass: 'EQUITY', name: 'Energy Select Sector' },
    { ticker: 'XAU', yahooSymbol: 'GC=F', assetClass: 'COMMODITY', name: 'Gold Troy Ounce' },
    { ticker: 'XAG', yahooSymbol: 'SI=F', assetClass: 'COMMODITY', name: 'Silver Troy Ounce' },
    { ticker: 'USTB', yahooSymbol: 'SGOV', assetClass: 'TREASURY', name: 'US T-Bill 0-3M ETF' }
];

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

const DEXSCREENER_CHAIN_MAP: Record<string, { network: string; hex: string; pastel: string }> = {
    ethereum: { network: 'ETH', hex: '#627EEA', pastel: '#c7d2fe' },
    base: { network: 'BASE', hex: '#0052FF', pastel: '#bfdbfe' },
    arbitrum: { network: 'ARB', hex: '#28A0F0', pastel: '#bfdbfe' },
    solana: { network: 'SOL', hex: '#14F195', pastel: '#a7f3d0' },
    polygon: { network: 'POL', hex: '#8247E5', pastel: '#d8b4fe' },
    avalanche: { network: 'AVAX', hex: '#E84142', pastel: '#fca5a5' },
    sui: { network: 'SUI', hex: '#4CA2FF', pastel: '#bfdbfe' },
    bsc: { network: 'ETH', hex: '#F3BA2F', pastel: '#fde047' },
    optimism: { network: 'ETH', hex: '#FF0420', pastel: '#fca5a5' },
    tron: { network: 'TRX', hex: '#FF0013', pastel: '#fca5a5' },
    hyperliquid: { network: 'ETH', hex: '#18C6A5', pastel: '#99f6e4' }
};

interface ExchangeQuote {
    exchange: string;
    priceUsd: number;
    change24hPct: number;
    volume24hUsd?: number;
    spreadRatio?: number;
}

interface CanonicalCoinGeckoAnchor {
    coinId: string;
    symbol: string;
    name: string;
    marketCapRank: number | null;
    priceUsd: number;
    change24hPct: number;
    volume24hUsd: number;
    thumbUrl?: string;
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
    coingeckoId?: string;
    marketCapRank?: number | null;
    liquidityUsd?: number;
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
        .slice(0, 14);
}

function isContractOrMintAddress(rawQuery: string): boolean {
    const trimmed = String(rawQuery || '').trim();
    if (/^0x[0-9a-fA-F]{40,64}$/.test(trimmed)) return true;
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) return true;
    if (trimmed.includes('::')) return true;
    return false;
}

function computeMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
}

function filterOutliersAndComputeMedian(
    quotes: ExchangeQuote[],
    canonicalAnchorPriceUsd = 0
): {
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

    const anchorFiltered =
        canonicalAnchorPriceUsd > 0
            ? valid.filter(
                  (q) =>
                      Math.abs(q.priceUsd - canonicalAnchorPriceUsd) /
                          canonicalAnchorPriceUsd <=
                      MAX_CANONICAL_DEVIATION_RATIO
              )
            : valid;

    const baseSet = anchorFiltered.length > 0 ? anchorFiltered : valid;
    const rawMedian =
        canonicalAnchorPriceUsd > 0
            ? canonicalAnchorPriceUsd
            : computeMedian(baseSet.map((q) => q.priceUsd));

    const filtered =
        rawMedian > 0
            ? baseSet.filter(
                  (q) =>
                      Math.abs(q.priceUsd - rawMedian) / rawMedian <=
                      (canonicalAnchorPriceUsd > 0
                          ? MAX_CANONICAL_DEVIATION_RATIO
                          : MAX_OUTLIER_DEVIATION_RATIO)
              )
            : baseSet;

    const activeSet = filtered.length > 0 ? filtered : baseSet;
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

async function queryYahooFinanceQuote(
    tickerOrSymbol: string
): Promise<{
    priceUsd: number;
    change24hPct: number;
    shortName: string;
    points: number[];
} | null> {
    const clean = String(tickerOrSymbol || '').trim().toUpperCase();
    const rwaSpec = RWA_DEFAULT_FEEDS.find((r) => r.ticker === clean);
    const yahooSymbol = rwaSpec ? rwaSpec.yahooSymbol : clean;

    try {
        const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=15m&range=5d`,
            {
                headers: {
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Perennia-RWA-Oracle/5.0',
                    accept: 'application/json'
                },
                signal: AbortSignal.timeout(3500)
            }
        );
        if (!res.ok) return null;
        const data = await res.json();
        const result = data?.chart?.result?.[0];
        const meta = result?.meta;
        if (!meta) return null;

        const priceUsd = Number(meta.regularMarketPrice || 0);
        if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;

        const prevClose = Number(
            meta.chartPreviousClose ?? meta.previousClose ?? priceUsd
        );
        const change24hPct =
            prevClose > 0 && Math.abs(priceUsd - prevClose) > 1e-9
                ? Number((((priceUsd - prevClose) / prevClose) * 100).toFixed(2))
                : 0;

        const rawCloses: any[] =
            result?.indicators?.quote?.[0]?.close || [];
        const points = rawCloses
            .map((v) => Number(v))
            .filter((v) => Number.isFinite(v) && v > 0)
            .slice(-96);

        return {
            priceUsd,
            change24hPct,
            shortName: String(
                rwaSpec?.name || meta.shortName || meta.longName || clean
            ).trim(),
            points
        };
    } catch {
        return null;
    }
}

async function hydrateRwaAndEquitiesPrices(
    targetMap: Record<string, { usd: number; usd_24h_change?: number }>
): Promise<void> {
    // 1. Check cached oracle:spot:rwa_prices_json from Rust Pyth/Yahoo daemon
    try {
        const rwaJsonRaw = await redis.get('oracle:spot:rwa_prices_json');
        if (rwaJsonRaw) {
            const rwaArr = JSON.parse(rwaJsonRaw);
            if (Array.isArray(rwaArr) && rwaArr.length >= 6) {
                let validCount = 0;
                for (const item of rwaArr) {
                    const tick = sanitizeTicker(item?.ticker || '');
                    const spot = Number(item?.spotPrice ?? item?.price ?? 0);
                    const chg = Number(item?.change24h ?? 0);
                    if (tick && Number.isFinite(spot) && spot > 0) {
                        targetMap[tick.toLowerCase()] = {
                            usd: spot,
                            usd_24h_change: Number.isFinite(chg) ? chg : 0
                        };
                        targetMap[tick] = {
                            usd: spot,
                            usd_24h_change: Number.isFinite(chg) ? chg : 0
                        };
                        validCount++;
                    }
                }
                if (validCount >= 8) {
                    return;
                }
            }
        }
    } catch {
        // Continue to DB & Yahoo Finance hydration
    }

    // 2. Check PostgreSQL rwa_oracle_feeds table
    try {
        const dbRes = await dbPool.query(
            `SELECT ticker, asset_class, price_usd, change_24h_pct
             FROM rwa_oracle_feeds
             WHERE price_usd > 0`
        );
        for (const r of dbRes.rows) {
            const tick = sanitizeTicker(r.ticker || '');
            const spot = Number(r.price_usd || 0);
            const chg = Number(r.change_24h_pct || 0);
            if (tick && Number.isFinite(spot) && spot > 0) {
                targetMap[tick.toLowerCase()] = {
                    usd: spot,
                    usd_24h_change: Number.isFinite(chg) ? chg : 0
                };
                targetMap[tick] = {
                    usd: spot,
                    usd_24h_change: Number.isFinite(chg) ? chg : 0
                };
            }
        }
    } catch {
        // Ignore DB read error
    }

    // 3. Hydrate any missing RWA / Public Equity feeds directly via Yahoo Finance v8 and persist to Redis & Postgres
    const missingFeeds = RWA_DEFAULT_FEEDS.filter(
        (f) =>
            !targetMap[f.ticker.toLowerCase()]?.usd ||
            targetMap[f.ticker.toLowerCase()].usd <= 0
    );

    if (missingFeeds.length > 0) {
        const pipe = redis.pipeline();
        const rwaListForRedis: any[] = [];

        await Promise.allSettled(
            RWA_DEFAULT_FEEDS.map(async (feed) => {
                const existing = targetMap[feed.ticker.toLowerCase()];
                if (existing && existing.usd > 0) {
                    rwaListForRedis.push({
                        ticker: feed.ticker,
                        assetClass: feed.assetClass,
                        price: existing.usd.toFixed(2),
                        spotPrice: existing.usd,
                        change24h: existing.usd_24h_change || 0,
                        publishTime: new Date().toISOString()
                    });
                    return;
                }

                const yf = await queryYahooFinanceQuote(feed.ticker);
                if (!yf || yf.priceUsd <= 0) return;

                targetMap[feed.ticker.toLowerCase()] = {
                    usd: yf.priceUsd,
                    usd_24h_change: yf.change24hPct
                };
                targetMap[feed.ticker] = {
                    usd: yf.priceUsd,
                    usd_24h_change: yf.change24hPct
                };

                pipe.set(
                    `oracle:spot:${feed.ticker}_USDC`,
                    String(yf.priceUsd),
                    'EX',
                    RWA_ORACLE_TTL_SECS
                );
                pipe.set(
                    `oracle:change24h:${feed.ticker}_USDC`,
                    String(yf.change24hPct),
                    'EX',
                    CHANGE_24H_TTL_SECS
                );

                rwaListForRedis.push({
                    ticker: feed.ticker,
                    assetClass: feed.assetClass,
                    price: yf.priceUsd.toFixed(2),
                    spotPrice: yf.priceUsd,
                    change24h: yf.change24hPct,
                    publishTime: new Date().toISOString()
                });

                await dbPool
                    .query(
                        `INSERT INTO rwa_oracle_feeds (ticker, asset_class, price_usd, change_24h_pct, oracle_source, updated_at)
                         VALUES ($1, $2, $3, $4, 'YAHOO_FINANCE_V8', CURRENT_TIMESTAMP)
                         ON CONFLICT (ticker) DO UPDATE SET
                            asset_class = EXCLUDED.asset_class,
                            price_usd = EXCLUDED.price_usd,
                            change_24h_pct = EXCLUDED.change_24h_pct,
                            oracle_source = EXCLUDED.oracle_source,
                            updated_at = CURRENT_TIMESTAMP`,
                        [
                            feed.ticker,
                            feed.assetClass,
                            yf.priceUsd,
                            yf.change24hPct
                        ]
                    )
                    .catch(() => {});
            })
        );

        if (rwaListForRedis.length > 0) {
            pipe.set(
                'oracle:spot:rwa_prices_json',
                JSON.stringify(rwaListForRedis),
                'EX',
                RWA_ORACLE_TTL_SECS
            );
        }
        await pipe.exec().catch(() => {});
    }
}

async function queryCoinGeckoCanonicalAnchor(
    rawQuery: string,
    targetTicker: string
): Promise<CanonicalCoinGeckoAnchor | null> {
    const trimmed = String(rawQuery || '').trim();
    if (trimmed.length < 2) return null;

    try {
        const searchRes = await fetch(
            `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(trimmed)}`,
            {
                headers: { accept: 'application/json' },
                signal: AbortSignal.timeout(3500)
            }
        );
        if (!searchRes.ok) return null;
        const searchData = await searchRes.json();
        const coins: any[] = Array.isArray(searchData?.coins)
            ? searchData.coins
            : [];
        if (coins.length === 0) return null;

        const cleanTarget = sanitizeTicker(targetTicker || trimmed);
        const exactMatches = coins.filter(
            (c) => sanitizeTicker(c?.symbol || '') === cleanTarget
        );
        const candidatePool = exactMatches.length > 0 ? exactMatches : coins;

        candidatePool.sort((a, b) => {
            const rankA =
                typeof a?.market_cap_rank === 'number' && a.market_cap_rank > 0
                    ? a.market_cap_rank
                    : 999_999;
            const rankB =
                typeof b?.market_cap_rank === 'number' && b.market_cap_rank > 0
                    ? b.market_cap_rank
                    : 999_999;
            return rankA - rankB;
        });

        const bestCoin = candidatePool[0];
        const coinId = String(bestCoin?.id || '').trim();
        if (!coinId) return null;

        const priceRes = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`,
            {
                headers: { accept: 'application/json' },
                signal: AbortSignal.timeout(3500)
            }
        );
        if (!priceRes.ok) return null;
        const priceData = await priceRes.json();
        const quoteObj = priceData?.[coinId];
        const priceUsd = Number(quoteObj?.usd || 0);
        if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;

        const change24hPct = Number(quoteObj?.usd_24h_change || 0);
        const volume24hUsd = Number(quoteObj?.usd_24h_vol || 0);
        const marketCapRank =
            typeof bestCoin?.market_cap_rank === 'number' &&
            bestCoin.market_cap_rank > 0
                ? bestCoin.market_cap_rank
                : null;

        return {
            coinId,
            symbol: sanitizeTicker(bestCoin?.symbol || cleanTarget),
            name: String(bestCoin?.name || cleanTarget).trim(),
            marketCapRank,
            priceUsd,
            change24hPct: Number.isFinite(change24hPct) ? change24hPct : 0,
            volume24hUsd: Number.isFinite(volume24hUsd) ? volume24hUsd : 0,
            thumbUrl: String(bestCoin?.large || bestCoin?.thumb || '').trim()
        };
    } catch {
        return null;
    }
}

async function fetchHistoricalPriceSeries(
    rawTicker: string,
    rawTimeframe: string
): Promise<{
    success: boolean;
    ticker: string;
    timeframe: string;
    points: number[];
    deltaPct: number;
}> {
    const cleanTick = sanitizeTicker(rawTicker) || 'KAS';
    const tf = String(rawTimeframe || '24H')
        .trim()
        .toUpperCase();
    const cacheKey = `oracle:history:${cleanTick}:${tf}`;
    try {
        const cached = await redis.get(cacheKey);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed?.points) && parsed.points.length > 1) {
                return parsed;
            }
        }
    } catch {
        // Ignore Redis cache read error
    }

    const spec =
        tf === '1H'
            ? { mexcInterval: '1m', gateInterval: '1m', limit: 60, ttl: 25 }
            : tf === '7D'
              ? { mexcInterval: '60m', gateInterval: '1h', limit: 168, ttl: 180 }
              : tf === '30D'
                ? { mexcInterval: '1d', gateInterval: '1d', limit: 30, ttl: 300 }
                : { mexcInterval: '15m', gateInterval: '15m', limit: 96, ttl: 60 };

    let points: number[] = [];

    if (!RWA_DEFAULT_FEEDS.some((f) => f.ticker === cleanTick)) {
        try {
            const mexcUrl = `https://api.mexc.com/api/v3/klines?symbol=${encodeURIComponent(cleanTick)}USDT&interval=${spec.mexcInterval}&limit=${spec.limit}`;
            const mexcRes = await fetch(mexcUrl, {
                signal: AbortSignal.timeout(4000)
            });
            if (mexcRes.ok) {
                const klines = await mexcRes.json();
                if (Array.isArray(klines)) {
                    points = klines
                        .map((k: any) => parseFloat(String(k?.[4] ?? '0')))
                        .filter((v: number) => Number.isFinite(v) && v > 0);
                }
            }
        } catch {
            points = [];
        }

        if (points.length < 2) {
            try {
                const gateUrl = `https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=${encodeURIComponent(cleanTick)}_USDT&interval=${spec.gateInterval}&limit=${spec.limit}`;
                const gateRes = await fetch(gateUrl, {
                    signal: AbortSignal.timeout(4000)
                });
                if (gateRes.ok) {
                    const candles = await gateRes.json();
                    if (Array.isArray(candles)) {
                        points = candles
                            .map((c: any) => parseFloat(String(c?.[2] ?? '0')))
                            .filter((v: number) => Number.isFinite(v) && v > 0);
                    }
                }
            } catch {
                points = [];
            }
        }
    }

    if (points.length < 2) {
        const yf = await queryYahooFinanceQuote(cleanTick);
        if (yf && yf.points.length >= 2) {
            points = yf.points;
        }
    }

    if (points.length < 2) {
        const cachedSpotStr = await redis
            .get(`oracle:spot:${cleanTick}_USDC`)
            .catch(() => null);
        const liveSpot = cachedSpotStr ? parseFloat(cachedSpotStr) || 0 : 0;
        if (liveSpot > 0) {
            points = Array.from({ length: 24 }, () => liveSpot);
        }
    }

    const first = points[0] || 0;
    const last = points[points.length - 1] || 0;
    const deltaPct =
        first > 0 && last > 0
            ? Number((((last - first) / first) * 100).toFixed(2))
            : 0;

    const payload = {
        success: points.length > 0,
        ticker: cleanTick,
        timeframe: tf,
        points,
        deltaPct
    };

    if (points.length > 1) {
        await redis
            .set(cacheKey, JSON.stringify(payload), 'EX', spec.ttl)
            .catch(() => {});
    }

    return payload;
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

    const quoteVolume = parseFloat(String(data?.quoteVolume || '0'));
    if (Number.isFinite(quoteVolume) && quoteVolume < MIN_CEX_24H_VOLUME_USD) {
        return null;
    }

    const bidPrice = parseFloat(String(data?.bidPrice || '0'));
    const askPrice = parseFloat(String(data?.askPrice || '0'));
    let spreadRatio = 0;
    if (bidPrice > 0 && askPrice >= bidPrice) {
        spreadRatio = (askPrice - bidPrice) / askPrice;
        if (spreadRatio > MAX_CEX_SPREAD_RATIO) return null;
    }

    const rawChange = parseFloat(String(data?.priceChangePercent || '0'));
    const change24hPct = Number.isFinite(rawChange)
        ? Math.abs(rawChange) <= 1.5
            ? rawChange * 100
            : rawChange
        : 0;
    return {
        exchange: 'MEXC',
        priceUsd: lastPrice,
        change24hPct,
        volume24hUsd: Number.isFinite(quoteVolume) ? quoteVolume : undefined,
        spreadRatio
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

    const quoteVolume = parseFloat(String(item?.quote_volume || '0'));
    if (!Number.isFinite(quoteVolume) || quoteVolume < MIN_CEX_24H_VOLUME_USD) {
        return null;
    }

    const highestBid = parseFloat(String(item?.highest_bid || '0'));
    const lowestAsk = parseFloat(String(item?.lowest_ask || '0'));
    let spreadRatio = 0;
    if (highestBid > 0 && lowestAsk >= highestBid) {
        spreadRatio = (lowestAsk - highestBid) / lowestAsk;
        if (spreadRatio > MAX_CEX_SPREAD_RATIO) return null;
    }

    const change24hPct = parseFloat(String(item?.change_percentage || '0'));
    return {
        exchange: 'Gate.io',
        priceUsd: lastPrice,
        change24hPct: Number.isFinite(change24hPct) ? change24hPct : 0,
        volume24hUsd: quoteVolume,
        spreadRatio
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

    const volValue = parseFloat(String(data?.volValue || '0'));
    if (!Number.isFinite(volValue) || volValue < MIN_CEX_24H_VOLUME_USD) {
        return null;
    }

    const buyBid = parseFloat(String(data?.buy || '0'));
    const sellAsk = parseFloat(String(data?.sell || '0'));
    let spreadRatio = 0;
    if (buyBid > 0 && sellAsk >= buyBid) {
        spreadRatio = (sellAsk - buyBid) / sellAsk;
        if (spreadRatio > MAX_CEX_SPREAD_RATIO) return null;
    }

    const changeRate = parseFloat(String(data?.changeRate || '0'));
    return {
        exchange: 'KuCoin',
        priceUsd: lastPrice,
        change24hPct: Number.isFinite(changeRate) ? changeRate * 100 : 0,
        volume24hUsd: volValue,
        spreadRatio
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

    const usdtVolume = parseFloat(
        String(item?.usdtVolume || item?.quoteVolume || '0')
    );
    if (!Number.isFinite(usdtVolume) || usdtVolume < MIN_CEX_24H_VOLUME_USD) {
        return null;
    }

    const bidPr = parseFloat(String(item?.bidPr || '0'));
    const askPr = parseFloat(String(item?.askPr || '0'));
    let spreadRatio = 0;
    if (bidPr > 0 && askPr >= bidPr) {
        spreadRatio = (askPr - bidPr) / askPr;
        if (spreadRatio > MAX_CEX_SPREAD_RATIO) return null;
    }

    const change24h = parseFloat(String(item?.change24h || '0'));
    return {
        exchange: 'Bitget',
        priceUsd: lastPrice,
        change24hPct: Number.isFinite(change24h) ? change24h * 100 : 0,
        volume24hUsd: usdtVolume,
        spreadRatio
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

    const quoteVal = parseFloat(String(item?.value || '0'));
    if (!Number.isFinite(quoteVal) || quoteVal < MIN_CEX_24H_VOLUME_USD) {
        return null;
    }

    const openPrice = parseFloat(String(item?.open || '0'));
    const change24hPct =
        Number.isFinite(openPrice) && openPrice > 0
            ? ((lastPrice - openPrice) / openPrice) * 100
            : 0;
    return {
        exchange: 'CoinEx',
        priceUsd: lastPrice,
        change24hPct,
        volume24hUsd: quoteVal
    };
}

async function queryDexScreenerUniversal(
    rawQuery: string,
    canonicalAnchorPriceUsd = 0
): Promise<DiscoveredAssetPayload[]> {
    const trimmed = String(rawQuery || '').trim();
    if (trimmed.length < 2) return [];

    const isAddress = isContractOrMintAddress(trimmed);
    const endpoint = isAddress
        ? `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(trimmed)}`
        : `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(trimmed)}`;

    try {
        const res = await fetch(endpoint, {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(4000)
        });
        if (!res.ok) return [];
        const data = await res.json();
        const rawPairs = Array.isArray(data?.pairs) ? data.pairs : [];
        if (rawPairs.length === 0) return [];

        const upperQuery = trimmed.toUpperCase();
        const sortedPairs = [...rawPairs]
            .filter((p: any) => {
                const priceUsd = parseFloat(String(p?.priceUsd || '0'));
                const liqUsd = parseFloat(String(p?.liquidity?.usd || '0'));
                const vol24h = parseFloat(String(p?.volume?.h24 || '0'));
                if (!Number.isFinite(priceUsd) || priceUsd <= 0) return false;
                if (!isAddress && liqUsd < 2_500 && vol24h < 5_000) return false;
                if (
                    !isAddress &&
                    canonicalAnchorPriceUsd > 0 &&
                    String(p?.baseToken?.symbol || '').toUpperCase() ===
                        upperQuery &&
                    Math.abs(priceUsd - canonicalAnchorPriceUsd) /
                        canonicalAnchorPriceUsd >
                        MAX_CANONICAL_DEVIATION_RATIO
                ) {
                    return false;
                }
                return true;
            })
            .sort((a: any, b: any) => {
                const aExact =
                    String(a?.baseToken?.symbol || '').toUpperCase() === upperQuery
                        ? 1
                        : 0;
                const bExact =
                    String(b?.baseToken?.symbol || '').toUpperCase() === upperQuery
                        ? 1
                        : 0;
                if (aExact !== bExact) return bExact - aExact;
                const scoreA =
                    (parseFloat(String(a?.liquidity?.usd || '0')) || 0) +
                    (parseFloat(String(a?.volume?.h24 || '0')) || 0);
                const scoreB =
                    (parseFloat(String(b?.liquidity?.usd || '0')) || 0) +
                    (parseFloat(String(b?.volume?.h24 || '0')) || 0);
                return scoreB - scoreA;
            });

        const seenBySymbolChain = new Map<string, DiscoveredAssetPayload>();
        for (const pair of sortedPairs) {
            const chainId = String(pair?.chainId || '').toLowerCase();
            const chainSpec = DEXSCREENER_CHAIN_MAP[chainId] || {
                network: 'ETH',
                hex: '#18C6A5',
                pastel: '#99f6e4'
            };
            const sym = sanitizeTicker(pair?.baseToken?.symbol || '');
            if (!sym) continue;
            const dedupeKey = `${sym}:${chainSpec.network}`;
            if (seenBySymbolChain.has(dedupeKey)) continue;

            const priceUsd = parseFloat(String(pair?.priceUsd || '0'));
            const change24h = parseFloat(String(pair?.priceChange?.h24 || '0'));
            const liquidityUsd = parseFloat(String(pair?.liquidity?.usd || '0'));
            const contractAddr = String(pair?.baseToken?.address || sym).trim();
            const tokenName = String(pair?.baseToken?.name || sym).trim();
            const imageUrl =
                String(pair?.info?.imageUrl || '').trim() ||
                `https://cryptologos.cc/logos/${sym.toLowerCase()}-${sym.toLowerCase()}-logo.svg`;

            seenBySymbolChain.set(dedupeKey, {
                ticker: sym,
                name: `${tokenName} (${chainSpec.network})`,
                assetClass: 'DeFi',
                network: chainSpec.network,
                spotPrice: priceUsd,
                change24h: Number.isFinite(change24h)
                    ? Number(change24h.toFixed(2))
                    : 0,
                sources: [`DexScreener (${chainId.toUpperCase()})`],
                quorumCount: 1,
                isKrc20: false,
                contract: contractAddr,
                liquidityUsd: Number.isFinite(liquidityUsd)
                    ? Math.round(liquidityUsd)
                    : undefined,
                theme: {
                    hex: chainSpec.hex,
                    pastel: chainSpec.pastel
                },
                imgUrl: imageUrl
            });

            if (seenBySymbolChain.size >= 8) break;
        }

        return Array.from(seenBySymbolChain.values());
    } catch {
        return [];
    }
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
    if (ticker === 'SILO' && spotPriceUsd <= 0 && kasUsdPrice > 0) {
        existsOnKasplex = true;
        spotPriceUsd = Number((kasUsdPrice / 23.809524).toFixed(6));
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

async function persistDiscoveredAssetInRedisAndPostgres(
    discovered: DiscoveredAssetPayload,
    persistInDynamicSet = true
) {
    const cleanTicker = sanitizeTicker(discovered.ticker);
    if (!cleanTicker) return;
    const pipe = redis.pipeline();
    if (persistInDynamicSet) {
        pipe.sadd('oracle:dynamic_tickers', cleanTicker);
    }
    if (discovered.coingeckoId) {
        pipe.set(
            `oracle:cg_id:${cleanTicker}`,
            discovered.coingeckoId,
            'EX',
            86400
        );
    }
    pipe.set(
        `oracle:dynamic_meta:${cleanTicker}`,
        JSON.stringify(discovered),
        'EX',
        3600
    );
    if (discovered.spotPrice > 0) {
        pipe.set(
            `oracle:spot:${cleanTicker}_USDC`,
            String(discovered.spotPrice),
            'EX',
            SPOT_ORACLE_TTL_SECS
        );
        pipe.set(
            `oracle:change24h:${cleanTicker}_USDC`,
            String(discovered.change24h || 0),
            'EX',
            CHANGE_24H_TTL_SECS
        );
    }
    await pipe.exec().catch(() => {});

    if (discovered.spotPrice > 0) {
        await dbPool
            .query(
                `INSERT INTO rwa_oracle_feeds (ticker, asset_class, price_usd, change_24h_pct, oracle_source, updated_at)
                 VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                 ON CONFLICT (ticker) DO UPDATE SET
                    asset_class = EXCLUDED.asset_class,
                    price_usd = EXCLUDED.price_usd,
                    change_24h_pct = EXCLUDED.change_24h_pct,
                    oracle_source = EXCLUDED.oracle_source,
                    updated_at = CURRENT_TIMESTAMP`,
                [
                    cleanTicker,
                    discovered.assetClass || 'DeFi',
                    discovered.spotPrice,
                    discovered.change24h || 0,
                    discovered.coingeckoId
                        ? `COINGECKO_RANK_${discovered.marketCapRank || 'VERIFIED'}`
                        : 'DYNAMIC_QUORUM'
                ]
            )
            .catch(() => {});
    }
}

async function discoverUniversalAssets(
    rawQuery: string,
    persistInDynamicSet = true
): Promise<{
    primary: DiscoveredAssetPayload | null;
    matches: DiscoveredAssetPayload[];
}> {
    const trimmed = String(rawQuery || '').trim();
    if (trimmed.length < 2) {
        return { primary: null, matches: [] };
    }

    if (isContractOrMintAddress(trimmed)) {
        const dexMatches = await queryDexScreenerUniversal(trimmed);
        if (dexMatches.length > 0) {
            await persistDiscoveredAssetInRedisAndPostgres(
                dexMatches[0],
                persistInDynamicSet
            );
            return { primary: dexMatches[0], matches: dexMatches };
        }
    }

    const ticker = sanitizeTicker(trimmed);
    if (ticker.length < 2) {
        return { primary: null, matches: [] };
    }

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
                if (meta.coingeckoId || meta.isKrc20 || meta.quorumCount >= 2) {
                    meta.spotPrice = cachedSpot;
                    if (cachedChangeStr) {
                        const chg = parseFloat(cachedChangeStr);
                        if (Number.isFinite(chg)) meta.change24h = chg;
                    }
                    if (persistInDynamicSet) {
                        await persistDiscoveredAssetInRedisAndPostgres(
                            meta,
                            true
                        );
                    }
                    return { primary: meta, matches: [meta] };
                }
            } catch {
                // Fall through to live multi-source discovery
            }
        }
    }

    const [
        cgAnchorRes,
        mexcRes,
        gateRes,
        kucoinRes,
        bitgetRes,
        coinexRes,
        krc20Res,
        yahooRes
    ] = await Promise.allSettled([
        queryCoinGeckoCanonicalAnchor(trimmed, ticker),
        queryMexcSpot(ticker),
        queryGateSpot(ticker),
        queryKucoinSpot(ticker),
        queryBitgetSpot(ticker),
        queryCoinexSpot(ticker),
        queryKrc20Indexer(ticker, kasUsdPrice),
        queryYahooFinanceQuote(ticker)
    ]);

    const cgAnchor =
        cgAnchorRes.status === 'fulfilled' ? cgAnchorRes.value : null;
    const canonicalPriceUsd =
        cgAnchor && cgAnchor.priceUsd > 0 ? cgAnchor.priceUsd : 0;

    const dexScreenerMatches = await queryDexScreenerUniversal(
        trimmed,
        canonicalPriceUsd
    );

    const exchangeQuotes: ExchangeQuote[] = [];
    if (cgAnchor && cgAnchor.priceUsd > 0) {
        exchangeQuotes.push({
            exchange: cgAnchor.marketCapRank
                ? `CoinGecko (#${cgAnchor.marketCapRank})`
                : 'CoinGecko',
            priceUsd: cgAnchor.priceUsd,
            change24hPct: cgAnchor.change24hPct,
            volume24hUsd: cgAnchor.volume24hUsd
        });
    }

    for (const r of [mexcRes, gateRes, kucoinRes, bitgetRes, coinexRes]) {
        if (r.status === 'fulfilled' && r.value && r.value.priceUsd > 0) {
            if (
                canonicalPriceUsd > 0 &&
                Math.abs(r.value.priceUsd - canonicalPriceUsd) /
                    canonicalPriceUsd >
                    MAX_CANONICAL_DEVIATION_RATIO
            ) {
                continue;
            }
            exchangeQuotes.push(r.value);
        }
    }

    const krc20Info =
        krc20Res.status === 'fulfilled' ? krc20Res.value : null;
    const yahooQuote =
        yahooRes.status === 'fulfilled' ? yahooRes.value : null;

    const {
        spotPrice: cexMedianSpot,
        change24h: cexChange,
        sources: cexSources
    } = filterOutliersAndComputeMedian(exchangeQuotes, canonicalPriceUsd);

    const hasCanonicalRankLeader = Boolean(
        cgAnchor &&
            cgAnchor.priceUsd > 0 &&
            cgAnchor.marketCapRank !== null &&
            cgAnchor.marketCapRank <= 500
    );
    const hasValidCexQuorum =
        cexSources.length >= MIN_DISCOVERY_CEX_QUORUM && cexMedianSpot > 0;
    const hasSingleVerifiedQuote =
        cexSources.length === 1 && cexMedianSpot > 0;

    const isGenuineKrc20 = Boolean(
        krc20Info?.existsOnKasplex &&
            !hasCanonicalRankLeader &&
            (KNOWN_KRC20_ECOSYSTEM_TICKERS.has(ticker) ||
                (!hasValidCexQuorum && krc20Info.spotPriceUsd > 0))
    );

    const discoveredList: DiscoveredAssetPayload[] = [];

    if (isGenuineKrc20 && krc20Info) {
        const krcSpot =
            krc20Info.spotPriceUsd > 0
                ? krc20Info.spotPriceUsd
                : hasValidCexQuorum
                  ? cexMedianSpot
                  : 0;
        if (krcSpot > 0) {
            const krcChange =
                krc20Info.change24hPct !== 0
                    ? krc20Info.change24hPct
                    : cexChange;
            const krcSources = [
                ...(krc20Info.existsOnKasplex ? ['Kasplex L1'] : []),
                ...cexSources
            ];
            discoveredList.push({
                ticker,
                name: `${ticker} (KRC-20 L1)`,
                assetClass: 'Ecosystem',
                network: 'KAS',
                spotPrice: krcSpot,
                change24h: Number(krcChange.toFixed(2)),
                sources: krcSources.length > 0 ? krcSources : ['Kasplex L1'],
                quorumCount: Math.max(1, krcSources.length),
                isKrc20: true,
                contract: ticker,
                maxSupply: krc20Info.maxSupply || undefined,
                mintedSupply: krc20Info.mintedSupply || undefined,
                holders: krc20Info.holders || undefined,
                theme: { hex: '#18C6A5', pastel: '#99f6e4' },
                imgUrl: `https://storage.googleapis.com/kasfyi/token-icons/${ticker.toLowerCase()}.png`
            });
        }
    }

    if (hasCanonicalRankLeader || hasValidCexQuorum || hasSingleVerifiedQuote) {
        const resolvedTicker = cgAnchor?.symbol || ticker;
        const matchingDex = dexScreenerMatches.find(
            (d) => d.ticker.toUpperCase() === resolvedTicker
        );
        const resolvedNetwork = matchingDex?.network || 'ETH';
        const resolvedContract = matchingDex?.contract || resolvedTicker;
        const resolvedImg =
            cgAnchor?.thumbUrl ||
            matchingDex?.imgUrl ||
            `https://cryptologos.cc/logos/${resolvedTicker.toLowerCase()}-${resolvedTicker.toLowerCase()}-logo.svg`;
        const displayName = cgAnchor?.name
            ? `${cgAnchor.name} (${cexSources.slice(0, 3).join(' • ')})`
            : `${resolvedTicker} (${cexSources.slice(0, 3).join(' • ')})`;

        if (!isGenuineKrc20) {
            discoveredList.push({
                ticker: resolvedTicker,
                name: displayName,
                assetClass: 'DeFi',
                network: resolvedNetwork,
                spotPrice: cexMedianSpot,
                change24h: cexChange,
                sources: cexSources,
                quorumCount: cexSources.length,
                isKrc20: false,
                contract: resolvedContract,
                coingeckoId: cgAnchor?.coinId,
                marketCapRank: cgAnchor?.marketCapRank ?? null,
                theme: matchingDex?.theme || {
                    hex: '#18C6A5',
                    pastel: '#99f6e4'
                },
                imgUrl: resolvedImg
            });
        }
    }

    if (yahooQuote && yahooQuote.priceUsd > 0 && discoveredList.length === 0) {
        discoveredList.push({
            ticker,
            name: `${yahooQuote.shortName} (PUBLIC EQUITY)`,
            assetClass: 'Tokenized Asset',
            network: 'BASE',
            spotPrice: yahooQuote.priceUsd,
            change24h: yahooQuote.change24hPct,
            sources: ['Yahoo Finance / Pyth RWA'],
            quorumCount: 1,
            isKrc20: false,
            contract: ticker,
            theme: { hex: '#38BDF8', pastel: '#bae6fd' },
            imgUrl: `https://assets.parqet.com/logos/symbol/${ticker}?format=png`
        });
    }

    for (const dexItem of dexScreenerMatches) {
        const alreadyIncluded = discoveredList.some(
            (d) =>
                d.ticker === dexItem.ticker && d.network === dexItem.network
        );
        if (!alreadyIncluded) {
            discoveredList.push(dexItem);
        }
    }

    if (discoveredList.length === 0) {
        return { primary: null, matches: [] };
    }

    const primary = discoveredList[0];
    await persistDiscoveredAssetInRedisAndPostgres(
        primary,
        persistInDynamicSet
    );

    return {
        primary,
        matches: discoveredList
    };
}

export const GET: RequestHandler = async ({ url }: RequestEvent) => {
    try {
        const historyQuery = url.searchParams.get('history');
        if (historyQuery && historyQuery.trim().length > 0) {
            const tf = url.searchParams.get('timeframe') || '24H';
            const series = await fetchHistoricalPriceSeries(historyQuery, tf);
            return json(series, {
                status: 200,
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate'
                }
            });
        }

        const discoverQuery = url.searchParams.get('discover');
        if (discoverQuery && discoverQuery.trim().length > 0) {
            const rawTrimmed = discoverQuery.trim();
            if (rawTrimmed.length < 2) {
                return json(
                    {
                        success: false,
                        error: 'Enter at least 2 characters or a contract address to discover a live token.'
                    },
                    { status: 400 }
                );
            }
            const shouldPersist = url.searchParams.get('register') !== '0';
            const { primary, matches } = await discoverUniversalAssets(
                rawTrimmed,
                shouldPersist
            );
            if (!primary) {
                return json(
                    {
                        success: false,
                        ticker: sanitizeTicker(rawTrimmed),
                        error: `No live market feed (CoinGecko, DexScreener, Kasplex KRC-20, or CEX Quorum) found for "${rawTrimmed}".`
                    },
                    { status: 404 }
                );
            }
            return json(
                {
                    success: true,
                    asset: primary,
                    assets: matches,
                    matches
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
                    dynamicTickers.slice(0, 60).map(async (dynTicker) => {
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
                            parsedPrices[clean] = {
                                usd: spot,
                                usd_24h_change: Number.isFinite(chg) ? chg : 0
                            };
                        }
                    })
                );
            }

            // Always hydrate RWA & Public Equities (SPY, QQQ, NVDA, AAPL, TSLA, AMD, TSM, AVGO, XLE, XAU, XAG, USTB)
            await hydrateRwaAndEquitiesPrices(parsedPrices);

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
                        // Ignore CoinGecko rate limit
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
            await hydrateRwaAndEquitiesPrices(data);
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