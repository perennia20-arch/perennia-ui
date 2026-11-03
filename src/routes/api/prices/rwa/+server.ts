import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';

const RWA_SPOT_TTL_SECS = 60;
const RWA_CHANGE_TTL_SECS = 300;

const RWA_FEED_IDS: Record<string, string> = {
    SPY: '0x19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5',
    QQQ: '0x9695e2b96ea7b38596fb62eefb1e5f2b670b6c0f8236d9b1b12c38f0a4b2a9d2',
    NVDA: '0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593',
    AAPL: '0x49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688',
    TSLA: '0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1',
    AMD: '0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f',
    TSM: '0x69145a36d62e91113b86b2e5b88f68f7f781c08d22d55848a0a0c4b113867223',
    AVGO: '0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419',
    XLE: '0x277b69923f8886d886c920d3616c2182f9d59c9c4397015a78529e3b5c4f1d2c',
    XAU: '0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2',
    XAG: '0xf2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e',
    USTB: '0xe393449f6aff8a4b6d3e1165a7c9ebec103685f3b41e60db4277b5b6d10e7326'
};

const ASSET_CLASSES: Record<string, string> = {
    SPY: 'EQUITY',
    QQQ: 'EQUITY',
    NVDA: 'EQUITY',
    AAPL: 'EQUITY',
    TSLA: 'EQUITY',
    AMD: 'EQUITY',
    TSM: 'EQUITY',
    AVGO: 'EQUITY',
    XLE: 'EQUITY',
    XAU: 'COMMODITY',
    XAG: 'COMMODITY',
    USTB: 'TREASURY'
};

let dynamicFeedIdCache: Record<string, string> | null = null;
let lastFeedDiscoveryMs = 0;
let schemaBootstrapped = false;

function normalizeHexId(id: string): string {
    return id.trim().toLowerCase().replace(/^0x/, '');
}

async function resolvePythHermesFeedMap(): Promise<Record<string, string>> {
    const now = Date.now();
    if (dynamicFeedIdCache && now - lastFeedDiscoveryMs < 3600_000) {
        return dynamicFeedIdCache;
    }
    const map: Record<string, string> = { ...RWA_FEED_IDS };
    try {
        const discoveryTickers = [
            'QQQ',
            'NVDA',
            'TSLA',
            'AMD',
            'TSM',
            'AVGO',
            'XLE',
            'USTB'
        ];
        await Promise.allSettled(
            discoveryTickers.map(async (ticker) => {
                const q = ticker === 'USTB' ? 'IB01' : ticker;
                const res = await fetch(
                    `https://hermes.pyth.network/v2/price_feeds?query=${encodeURIComponent(q)}`,
                    { signal: AbortSignal.timeout(3500) }
                );
                if (!res.ok) return;
                const list = await res.json();
                if (!Array.isArray(list)) return;
                for (const entry of list) {
                    const base = String(entry?.attributes?.base || '').toUpperCase();
                    const quote = String(
                        entry?.attributes?.quote_currency || ''
                    ).toUpperCase();
                    const idStr = String(entry?.id || '').trim();
                    if (
                        idStr &&
                        quote === 'USD' &&
                        (base === ticker ||
                            (ticker === 'USTB' &&
                                (base === 'USTB' || base === 'IB01' || base === 'SHY')))
                    ) {
                        map[ticker] = `0x${normalizeHexId(idStr)}`;
                        break;
                    }
                }
            })
        );
        dynamicFeedIdCache = map;
        lastFeedDiscoveryMs = now;
    } catch {
    }
    return map;
}

async function ensureRwaOracleTable() {
    if (schemaBootstrapped) return;
    const client = await dbPool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS rwa_oracle_feeds (
                id SERIAL PRIMARY KEY,
                ticker VARCHAR(32) NOT NULL,
                asset_class VARCHAR(40) NOT NULL DEFAULT 'RWA',
                price_usd DOUBLE PRECISION NOT NULL,
                change_24h_pct DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                oracle_source VARCHAR(40) NOT NULL DEFAULT 'PYTH_HERMES',
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`
            ALTER TABLE rwa_oracle_feeds ADD COLUMN IF NOT EXISTS change_24h_pct DOUBLE PRECISION NOT NULL DEFAULT 0.0;
        `);
        await client.query(`
            DELETE FROM rwa_oracle_feeds a
            USING rwa_oracle_feeds b
            WHERE a.id < b.id AND a.ticker = b.ticker;
        `);
        await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_rwa_oracle_feeds_ticker_unique ON rwa_oracle_feeds (ticker);
        `);
        schemaBootstrapped = true;
    } finally {
        client.release();
    }
}

export const GET: RequestHandler = async ({ url }: RequestEvent) => {
    try {
        const forceRefresh = url.searchParams.get('refresh') === 'true';
        if (!forceRefresh) {
            try {
                const cachedJson = await redis.get('oracle:spot:rwa_prices_json');
                if (cachedJson) {
                    const parsedCached = JSON.parse(cachedJson);
                    if (Array.isArray(parsedCached) && parsedCached.length > 0) {
                        return json({
                            success: true,
                            count: parsedCached.length,
                            source: 'redis_cache',
                            assets: parsedCached
                        });
                    }
                }
            } catch {
                // Fall through to live Pyth / DB resolution if cache parse fails
            }
        }

        await ensureRwaOracleTable().catch(() => {});
        const feedMap = await resolvePythHermesFeedMap();
        const params = new URLSearchParams();
        for (const feedId of Object.values(feedMap)) {
            params.append('ids[]', feedId);
        }
        params.append('ignore_invalid_price_ids', 'true');
        const hermesUrl = `https://hermes.pyth.network/v2/updates/price/latest?${params.toString()}`;
        const resolvedByTicker = new Map<
            string,
            {
                ticker: string;
                assetClass: string;
                price: string;
                spotPrice: number;
                change24h: number;
                publishTime: string;
                oracleSource: string;
            }
        >();
        try {
            const res = await fetch(hermesUrl, { signal: AbortSignal.timeout(8000) });
            if (res.ok) {
                const data = await res.json();
                const parsedArray = Array.isArray(data?.parsed) ? data.parsed : [];
                for (const feed of parsedArray) {
                    const feedIdNorm = normalizeHexId(String(feed?.id || ''));
                    const ticker = Object.keys(feedMap).find(
                        (key) => normalizeHexId(feedMap[key]) === feedIdNorm
                    );
                    if (!ticker) continue;
                    const rawSpot = Number(feed?.price?.price ?? 0);
                    const spotExpo = Number(feed?.price?.expo ?? 0);
                    const rawEma = Number(feed?.ema_price?.price ?? 0);
                    const emaExpo = Number(feed?.ema_price?.expo ?? 0);
                    const actualPrice =
                        rawSpot > 0
                            ? rawSpot * Math.pow(10, spotExpo)
                            : rawEma > 0
                              ? rawEma * Math.pow(10, emaExpo)
                              : 0;
                    const emaPrice =
                        rawEma > 0 ? rawEma * Math.pow(10, emaExpo) : actualPrice;
                    const change24h =
                        emaPrice > 0 && actualPrice > 0
                            ? Math.max(
                                  -25,
                                  Math.min(25, ((actualPrice - emaPrice) / emaPrice) * 100)
                              )
                            : 0;
                    const publishUnix = Number(
                        feed?.price?.publish_time ||
                            feed?.ema_price?.publish_time ||
                            Math.floor(Date.now() / 1000)
                    );
                    if (actualPrice > 0) {
                        resolvedByTicker.set(ticker, {
                            ticker,
                            assetClass: ASSET_CLASSES[ticker] || 'RWA',
                            price: actualPrice.toFixed(2),
                            spotPrice: Number(actualPrice.toFixed(4)),
                            change24h: Number(change24h.toFixed(2)),
                            publishTime: new Date(publishUnix * 1000).toISOString(),
                            oracleSource: 'PYTH_HERMES'
                        });
                    }
                }
            }
        } catch {
        }

        const pipe = redis.pipeline();
        for (const [ticker, item] of resolvedByTicker.entries()) {
            pipe.set(
                `oracle:spot:${ticker}_USDC`,
                String(item.spotPrice),
                'EX',
                RWA_SPOT_TTL_SECS
            );
            pipe.set(
                `oracle:change24h:${ticker}_USDC`,
                String(item.change24h),
                'EX',
                RWA_CHANGE_TTL_SECS
            );
            try {
                await dbPool.query(
                    `INSERT INTO rwa_oracle_feeds (ticker, asset_class, price_usd, change_24h_pct, oracle_source, updated_at)
                     VALUES ($1, $2, $3, $4, 'PYTH_HERMES', CURRENT_TIMESTAMP)
                     ON CONFLICT (ticker) DO UPDATE SET
                        asset_class = EXCLUDED.asset_class,
                        price_usd = EXCLUDED.price_usd,
                        change_24h_pct = EXCLUDED.change_24h_pct,
                        oracle_source = EXCLUDED.oracle_source,
                        updated_at = CURRENT_TIMESTAMP`,
                    [ticker, item.assetClass, item.spotPrice, item.change24h]
                );
            } catch {
            }
        }

        for (const ticker of Object.keys(RWA_FEED_IDS)) {
            if (!resolvedByTicker.has(ticker)) {
                const [redisSpotStr, redisDeltaStr] = await Promise.all([
                    redis.get(`oracle:spot:${ticker}_USDC`).catch(() => null),
                    redis.get(`oracle:change24h:${ticker}_USDC`).catch(() => null)
                ]);
                const redisSpot = redisSpotStr ? parseFloat(redisSpotStr) : 0;
                const redisDelta = redisDeltaStr ? parseFloat(redisDeltaStr) : 0;
                if (redisSpot > 0) {
                    resolvedByTicker.set(ticker, {
                        ticker,
                        assetClass: ASSET_CLASSES[ticker] || 'RWA',
                        price: redisSpot.toFixed(2),
                        spotPrice: redisSpot,
                        change24h: isFinite(redisDelta) ? Number(redisDelta.toFixed(2)) : 0,
                        publishTime: new Date().toISOString(),
                        oracleSource: 'REDIS_ORACLE_CACHE'
                    });
                    continue;
                }
                try {
                    const dbFallback = await dbPool.query(
                        `SELECT price_usd, change_24h_pct, updated_at
                         FROM rwa_oracle_feeds
                         WHERE ticker = $1
                           AND price_usd > 0
                           AND updated_at >= CURRENT_TIMESTAMP - INTERVAL '15 minutes'
                         ORDER BY updated_at DESC
                         LIMIT 1`,
                        [ticker]
                    );
                    if (dbFallback.rows.length > 0) {
                        const row = dbFallback.rows[0];
                        const p = Number(row.price_usd || 0);
                        const d = Number(row.change_24h_pct || 0);
                        if (p > 0) {
                            pipe.set(
                                `oracle:spot:${ticker}_USDC`,
                                String(p),
                                'EX',
                                RWA_SPOT_TTL_SECS
                            );
                            pipe.set(
                                `oracle:change24h:${ticker}_USDC`,
                                String(d),
                                'EX',
                                RWA_CHANGE_TTL_SECS
                            );
                            resolvedByTicker.set(ticker, {
                                ticker,
                                assetClass: ASSET_CLASSES[ticker] || 'RWA',
                                price: p.toFixed(2),
                                spotPrice: p,
                                change24h: Number(d.toFixed(2)),
                                publishTime: new Date(row.updated_at).toISOString(),
                                oracleSource: 'POSTGRES_WAL'
                            });
                        }
                    }
                } catch {
                }
            }
        }

        const parsedPrices = Array.from(resolvedByTicker.values());
        if (parsedPrices.length === 0) {
            return json(
                {
                    success: false,
                    error: 'ORACLE_HALT: Pyth Hermes RWA Oracle feeds are unreachable and no verified quotes exist within the 15-minute freshness window. Zero hardcoded prices permitted.'
                },
                { status: 503 }
            );
        }
        pipe.set(
            'oracle:spot:rwa_prices_json',
            JSON.stringify(parsedPrices),
            'EX',
            RWA_SPOT_TTL_SECS
        );
        await pipe.exec().catch(() => {});
        return json({
            success: true,
            count: parsedPrices.length,
            source: 'pyth_hermes_live',
            assets: parsedPrices
        });
    } catch (error: any) {
        return json(
            {
                success: false,
                error: error.message || 'Pyth Hermes Oracle synchronization failed.'
            },
            { status: 500 }
        );
    }
};