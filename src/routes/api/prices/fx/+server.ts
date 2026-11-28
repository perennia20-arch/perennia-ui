// WINDOWS (FRONTEND): C:\Users\send2\perennia-v5\perennia-frontend\src\routes\api\prices\fx\+server.ts
import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { safeDecimalToAtomic } from '$lib/crypto/atomicMath';

type SupportedCurrencyCode =
    | 'USD'
    | 'EUR'
    | 'GBP'
    | 'CAD'
    | 'AUD'
    | 'JPY'
    | 'BRL'
    | 'TRY'
    | 'NGN';

const SUPPORTED_CURRENCIES: readonly SupportedCurrencyCode[] = [
    'USD',
    'EUR',
    'GBP',
    'CAD',
    'AUD',
    'JPY',
    'BRL',
    'TRY',
    'NGN'
] as const;

const FX_CACHE_KEY = 'oracle:fx:usd_rates_json';
const FX_LAST_GOOD_KEY = 'oracle:fx:usd_rates_last_good';
const FX_CACHE_TTL_SECS = 900; // 15 minutes
const FX_LAST_GOOD_TTL_SECS = 86400; // 24 hours

function sanitizeRatesMap(
    rawRates: Record<string, unknown> | null | undefined
): Record<SupportedCurrencyCode, number> | null {
    if (!rawRates || typeof rawRates !== 'object') {
        return null;
    }
    const out: Partial<Record<SupportedCurrencyCode, number>> = { USD: 1.0 };
    for (const code of SUPPORTED_CURRENCIES) {
        if (code === 'USD') {
            out.USD = 1.0;
            continue;
        }
        const val = Number(rawRates[code]);
        if (Number.isFinite(val) && val > 0) {
            out[code] = Number(val.toFixed(6));
        }
    }
    if (Object.keys(out).length < 2) {
        return null;
    }
    return out as Record<SupportedCurrencyCode, number>;
}

function buildRatesE8(rates: Record<string, number>): Record<string, string> {
    const out: Record<string, string> = { USD: '100000000' };
    for (const code of SUPPORTED_CURRENCIES) {
        const val = rates[code];
        if (Number.isFinite(val) && val > 0) {
            out[code] = safeDecimalToAtomic(val, 8, 100_000_000n, 'floor').toString();
        }
    }
    return out;
}

async function fetchOpenErApiRates(): Promise<Record<string, unknown> | null> {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.rates || typeof data.rates !== 'object') return null;
    return data.rates as Record<string, unknown>;
}

async function fetchFrankfurterRates(): Promise<Record<string, unknown> | null> {
    const symbols = ['EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'BRL', 'TRY'].join(',');
    const res = await fetch(
        `https://api.frankfurter.app/latest?from=USD&to=${encodeURIComponent(symbols)}`,
        {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(4000)
        }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.rates || typeof data.rates !== 'object') return null;
    return data.rates as Record<string, unknown>;
}

export const GET: RequestHandler = async ({ url }: RequestEvent) => {
    const forceRefresh = url.searchParams.get('refresh') === 'true';

    if (!forceRefresh) {
        try {
            const cachedRaw = await redis.get(FX_CACHE_KEY);
            if (cachedRaw) {
                const parsed = JSON.parse(cachedRaw);
                const sanitized = sanitizeRatesMap(parsed?.rates);
                if (sanitized) {
                    return json(
                        {
                            success: true,
                            base: 'USD',
                            source: 'redis_cache',
                            rates: sanitized,
                            ratesE8: buildRatesE8(sanitized),
                            updatedAt: parsed.updatedAt || new Date().toISOString()
                        },
                        {
                            status: 200,
                            headers: {
                                'Cache-Control': 'no-store, no-cache, must-revalidate'
                            }
                        }
                    );
                }
            }
        } catch {
            // Fall through to live FX oracle resolution
        }
    }

    const [openErRaw, frankfurterRaw] = await Promise.all([
        fetchOpenErApiRates().catch(() => null),
        fetchFrankfurterRates().catch(() => null)
    ]);

    const mergedRaw: Record<string, unknown> = {
        ...(openErRaw || {}),
        ...(frankfurterRaw || {}),
        USD: 1.0
    };
    let resolvedRates = sanitizeRatesMap(mergedRaw);
    let source: 'live_fx_oracle' | 'redis_last_good' | 'usd_only_fail_closed' =
        'live_fx_oracle';

    if (!resolvedRates) {
        try {
            const lastGoodRaw = await redis.get(FX_LAST_GOOD_KEY);
            if (lastGoodRaw) {
                const parsed = JSON.parse(lastGoodRaw);
                const sanitized = sanitizeRatesMap(parsed?.rates);
                if (sanitized) {
                    resolvedRates = sanitized;
                    source = 'redis_last_good';
                }
            }
        } catch {
            // ignore
        }
    }

    if (!resolvedRates) {
        source = 'usd_only_fail_closed';
        const usdOnly = { USD: 1.0 } as Record<SupportedCurrencyCode, number>;
        return json(
            {
                success: false,
                base: 'USD',
                source,
                rates: usdOnly,
                ratesE8: { USD: '100000000' },
                livePricingUnavailable: true,
                updatedAt: new Date().toISOString()
            },
            {
                status: 503,
                headers: {
                    'Cache-Control': 'no-store, no-cache, must-revalidate'
                }
            }
        );
    }

    const updatedAt = new Date().toISOString();
    const ratesE8 = buildRatesE8(resolvedRates);

    try {
        const pipe = redis.pipeline();
        const payload = JSON.stringify({
            base: 'USD',
            source,
            rates: resolvedRates,
            ratesE8,
            updatedAt
        });
        pipe.set(FX_CACHE_KEY, payload, 'EX', FX_CACHE_TTL_SECS);
        pipe.set(FX_LAST_GOOD_KEY, payload, 'EX', FX_LAST_GOOD_TTL_SECS);
        for (const [code, rate] of Object.entries(resolvedRates)) {
            pipe.set(`oracle:fx:USD_${code}`, String(rate), 'EX', FX_CACHE_TTL_SECS);
        }
        await pipe.exec();
    } catch {
        // Non-blocking if Redis cache write fails
    }

    return json(
        {
            success: true,
            base: 'USD',
            source,
            rates: resolvedRates,
            ratesE8,
            updatedAt
        },
        {
            status: 200,
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate'
            }
        }
    );
};
