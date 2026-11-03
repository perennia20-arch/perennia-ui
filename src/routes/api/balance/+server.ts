import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { redis } from '$lib/server/redis';

const BALANCE_CACHE_TTL_SECS = 15;

function normalizeKaspaAddress(raw: string): string {
    const clean = raw.trim().toLowerCase().replace(/^kaspa:/i, '').trim();
    return `kaspa:${clean}`;
}

export const GET: RequestHandler = async ({ url }: RequestEvent) => {
    const rawAddress = url.searchParams.get('address');
    if (!rawAddress || !rawAddress.trim()) {
        return json({ error: 'Address parameter missing' }, { status: 400 });
    }

    const formattedAddress = normalizeKaspaAddress(rawAddress);
    const cacheKey = `treasury:balance:${formattedAddress}`;

    try {
        const cached = await redis.get(cacheKey);
        if (cached !== null && cached !== undefined) {
            const parsed = parseFloat(cached);
            if (Number.isFinite(parsed) && parsed >= 0) {
                return json({
                    balance: parsed,
                    balanceKas: parsed,
                    source: 'redis_cache'
                });
            }
        }
    } catch {
        // Proceed to local Rust node if Redis read is bypassed
    }

    const rustBackendUrl = (
        env.RUST_BACKEND_URL || `http://${env.UBUNTU_NODE_IP || '127.0.0.1'}:8002`
    ).replace(/\/+$/, '');

    try {
        const localRes = await fetch(
            `${rustBackendUrl}/v1/balance?address=${encodeURIComponent(formattedAddress)}`,
            { signal: AbortSignal.timeout(3000) }
        );
        if (localRes.ok) {
            const localData = await localRes.json();
            const resolvedBalance = Number(
                localData.balanceKas ?? localData.balance ?? NaN
            );
            if (Number.isFinite(resolvedBalance) && resolvedBalance >= 0) {
                await redis
                    .set(
                        cacheKey,
                        resolvedBalance.toString(),
                        'EX',
                        BALANCE_CACHE_TTL_SECS
                    )
                    .catch(() => {});
                return json({
                    balance: resolvedBalance,
                    balanceKas: resolvedBalance,
                    source: localData.source || 'local_rust_node'
                });
            }
        }
    } catch {
        // Fall through to configured REST fallback only if local Rust gRPC node is unreachable
    }

    const kaspaRestUrl = (env.KASPA_REST_URL || 'https://api.kaspa.org').replace(
        /\/+$/,
        ''
    );

    try {
        const res = await fetch(
            `${kaspaRestUrl}/addresses/${encodeURIComponent(formattedAddress)}/balance`,
            { signal: AbortSignal.timeout(5000) }
        );
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(
                `Kaspa REST fallback returned HTTP ${res.status}${errText ? `: ${errText}` : ''}`
            );
        }
        const data = await res.json();
        const rawSompi = Number(data?.balance);
        if (!Number.isFinite(rawSompi) || rawSompi < 0) {
            throw new Error('Malformed balance payload from Kaspa REST fallback.');
        }
        const balanceKas = rawSompi / 100_000_000;
        await redis
            .set(cacheKey, balanceKas.toString(), 'EX', BALANCE_CACHE_TTL_SECS)
            .catch(() => {});
        return json({
            balance: balanceKas,
            balanceKas,
            source: 'rest_fallback'
        });
    } catch (e: any) {
        console.error('Balance Fetch Error:', e.message);
        return json(
            {
                error: 'L1_BALANCE_UNAVAILABLE',
                details:
                    e.message ||
                    'Both local kaspad gRPC and fallback REST endpoints failed.'
            },
            { status: 502 }
        );
    }
};