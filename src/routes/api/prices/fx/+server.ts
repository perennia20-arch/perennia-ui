// WINDOWS (FRONTEND): C:\Users\send2\perennia-v5\perennia-frontend\src\routes\api\prices\fx\+server.ts
import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';

type SupportedCurrencyCode =
    | 'USD'
    | 'EUR'
    | 'GBP'
    | 'CAD'
    | 'AUD'
    | 'CHF'
    | 'JPY'
    | 'MXN'
    | 'BRL';

const SUPPORTED_CURRENCIES: readonly SupportedCurrencyCode[] = [
    'USD',
    'EUR',
    'GBP',
    'CAD',
    'AUD',
    'CHF',
    'JPY',
    'MXN',
    'BRL'
] as const;

const FX_CACHE_KEY = 'oracle:fx:usd_rates_json';
const FX_CACHE_TTL_SECS = 900; // 15 minutes

const FALLBACK_FX_RATES: Record<SupportedCurrencyCode, number> = {
    USD: 1.0,
    EUR: 0.924,
    GBP: 0.788,
    CAD: 1.389,
    AUD: 1.524,
    CHF: 0.882,
    JPY: 153.45,
    MXN: 20.12,
    BRL: 5.76
};

function sanitizeRatesMap(
    rawRates: Record<string, unknown> | null | undefined
): Record<SupportedCurrencyCode, number> {
    const out: Record<SupportedCurrencyCode, number> = {
        ...FALLBACK_FX_RATES,
        USD: 1.0
    };
    if (!rawRates || typeof rawRates !== 'object') {
        return out;
    }
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
    return out;
}

async function fetchFrankfurterRates(): Promise<Record<
    SupportedCurrencyCode,
    number
> | null> {
    const symbols = SUPPORTED_CURRENCIES.filter((c) => c !== 'USD').join(',');
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
    return sanitizeRatesMap(data.rates);
}

async function fetchOpenErApiRates(): Promise<Record<
    SupportedCurrencyCode,
    number
> | null> {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.rates || typeof data.rates !== 'object') return null;
    return sanitizeRatesMap(data.rates);
}

export const GET: RequestHandler = async ({ url }: RequestEvent) => {
    const forceRefresh = url.searchParams.get('refresh') === 'true';

    if (!forceRefresh) {
        try {
            const cachedRaw = await redis.get(FX_CACHE_KEY);
            if (cachedRaw) {
                const parsed = JSON.parse(cachedRaw);
                if (parsed?.rates && typeof parsed.rates === 'object') {
                    return json(
                        {
                            success: true,
                            base: 'USD',
                            source: 'redis_cache',
                            rates: sanitizeRatesMap(parsed.rates),
                            updatedAt:
                                parsed.updatedAt || new Date().toISOString()
                        },
                        {
                            status: 200,
                            headers: {
                                'Cache-Control':
                                    'no-store, no-cache, must-revalidate'
                            }
                        }
                    );
                }
            }
        } catch {
            // Fall through to live FX oracle resolution
        }
    }

    let resolvedRates: Record<SupportedCurrencyCode, number> | null = null;
    let source: 'frankfurter_ecb' | 'open_er_api' | 'fallback_baseline' =
        'fallback_baseline';

    try {
        resolvedRates = await fetchFrankfurterRates();
        if (resolvedRates) {
            source = 'frankfurter_ecb';
        }
    } catch {
        resolvedRates = null;
    }

    if (!resolvedRates) {
        try {
            resolvedRates = await fetchOpenErApiRates();
            if (resolvedRates) {
                source = 'open_er_api';
            }
        } catch {
            resolvedRates = null;
        }
    }

    const finalRates = resolvedRates || { ...FALLBACK_FX_RATES };
    const updatedAt = new Date().toISOString();

    try {
        const pipe = redis.pipeline();
        pipe.set(
            FX_CACHE_KEY,
            JSON.stringify({
                base: 'USD',
                source,
                rates: finalRates,
                updatedAt
            }),
            'EX',
            FX_CACHE_TTL_SECS
        );
        for (const [code, rate] of Object.entries(finalRates)) {
            pipe.set(
                `oracle:fx:USD_${code}`,
                String(rate),
                'EX',
                FX_CACHE_TTL_SECS
            );
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
            rates: finalRates,
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