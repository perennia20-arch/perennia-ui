// src/routes/api/agent/mandates/+server.ts
import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';

const MAX_U128 = (1n << 128n) - 1n;
const KASPA_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

const FORBIDDEN_AIRLOCK_KEYS = new Set([
    'colddestinationaddress',
    'coldkaspaaddress',
    'cold_destination_address',
    'cold_kaspa_address',
    'cold_kas_address',
    'cold_btc_address',
    'cold_eth_address',
    'cold_sol_address',
    'coldvaultaddress',
    'cold_vault_address',
    'autosweepenabled',
    'auto_sweep_enabled',
    'overflowceiling',
    'overflow_ceiling',
    'overflowthresholdkas',
    'overflow_threshold_kas',
    'sweepdestination',
    'withdrawaddress',
    'externaldestination',
    'payoutaddress',
    'payout_address',
    'destinationaddress',
    'destination_address'
]);

const NO_STORE_HEADERS: Record<string, string> = {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    'X-Content-Type-Options': 'nosniff'
};

function kaspaPolymod(values: number[]): bigint {
    let c = 1n;
    for (const v of values) {
        const c0 = c >> 35n;
        c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(v);
        if ((c0 & 1n) !== 0n) c ^= 0x98f2bc8e61n;
        if ((c0 & 2n) !== 0n) c ^= 0x79b76d99e2n;
        if ((c0 & 4n) !== 0n) c ^= 0xf33e5fb3c4n;
        if ((c0 & 8n) !== 0n) c ^= 0xae2eabe2a8n;
        if ((c0 & 16n) !== 0n) c ^= 0x1e4f43e470n;
    }
    return c ^ 1n;
}

function validateAndNormalizeKaspaWallet(raw: string): {
    cleanWallet: string;
    prefixedWallet: string;
} {
    const trimmed = raw.trim().toLowerCase();
    const clean = trimmed.startsWith('kaspa:') ? trimmed.slice(6).trim() : trimmed;
    if (clean.length < 58 || clean.length > 72) {
        throw new Error('INVALID_KASPA_ADDRESS_LENGTH');
    }

    const dataPart = clean.slice(0, -8);
    const checksumPart = clean.slice(-8);
    const payload5: number[] = [];

    for (let i = 0; i < dataPart.length; i++) {
        const idx = KASPA_CHARSET.indexOf(dataPart[i]);
        if (idx === -1) {
            throw new Error('INVALID_KASPA_BECH32M_CHAR');
        }
        payload5.push(idx);
    }

    const prefixValues = [11, 1, 19, 16, 1, 0]; // "kaspa" & 31 + [0]
    const modInput = [...prefixValues, ...payload5, 0, 0, 0, 0, 0, 0, 0, 0];
    const poly = kaspaPolymod(modInput);

    let expectedChecksum = '';
    for (let i = 0; i < 8; i++) {
        const idx = Number((poly >> BigInt(5 * (7 - i))) & 31n);
        expectedChecksum += KASPA_CHARSET[idx];
    }

    if (expectedChecksum !== checksumPart) {
        throw new Error('INVALID_KASPA_BECH32M_CHECKSUM');
    }

    return {
        cleanWallet: clean,
        prefixedWallet: `kaspa:${clean}`
    };
}

function containsForbiddenAirlockField(val: unknown): boolean {
    if (!val || typeof val !== 'object') return false;
    if (Array.isArray(val)) {
        return val.some(containsForbiddenAirlockField);
    }
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (FORBIDDEN_AIRLOCK_KEYS.has(k.trim().toLowerCase())) {
            return true;
        }
        if (containsForbiddenAirlockField(v)) {
            return true;
        }
    }
    return false;
}

function validateU128PositiveString(raw: unknown, fieldName: string): string {
    const str = typeof raw === 'bigint' ? raw.toString() : String(raw ?? '').trim();
    if (!/^[0-9]{1,39}$/.test(str)) {
        throw new Error(`${fieldName} must be an exact base-10 unsigned u128 integer string.`);
    }
    const parsed = BigInt(str);
    if (parsed <= 0n || parsed > MAX_U128) {
        throw new Error(`${fieldName} must be > 0 and within u128 bounds.`);
    }
    return parsed.toString();
}

function resolveRustGatewayConfig(): { rustBaseUrl: string; internalBearer: string } {
    const rawUrl = (env.RUST_BACKEND_URL || '').trim().replace(/\/+$/, '');
    if (!rawUrl) {
        throw new Error(
            'CRITICAL_CONFIG_HALT: RUST_BACKEND_URL is missing. Failing closed.'
        );
    }
    const token = (env.INTERNAL_ADMIN_TOKEN || env.PERENNIA_ADMIN_KEY || '').trim();
    if (!token) {
        throw new Error(
            'CRITICAL_SECURITY_LOCKDOWN: INTERNAL_ADMIN_TOKEN or PERENNIA_ADMIN_KEY is missing. Failing closed.'
        );
    }
    return {
        rustBaseUrl: rawUrl,
        internalBearer: `Bearer ${token}`
    };
}

async function resolveVerifiedSessionWallet(
    cookies: RequestEvent['cookies']
): Promise<
    | { ok: true; cleanWallet: string; prefixedWallet: string }
    | { ok: false; status: number; error: string; message: string }
> {
    const sessionId = cookies.get('perennia_session');
    if (!sessionId) {
        return {
            ok: false,
            status: 401,
            error: 'UNAUTHORIZED_SOVEREIGN_SESSION',
            message: 'Unlock and authenticate your Sovereign Wallet session to manage Agent Mandates.'
        };
    }

    let rawSessionWallet: string | null = null;
    try {
        rawSessionWallet = await redis.get(`session:${sessionId}`);
    } catch {
        return {
            ok: false,
            status: 503,
            error: 'REDIS_UNAVAILABLE',
            message: 'Deterministic fail-closed halt: session Redis cluster unreachable.'
        };
    }

    if (!rawSessionWallet) {
        return {
            ok: false,
            status: 401,
            error: 'SESSION_EXPIRED',
            message: 'Sovereign Wallet session expired. Re-unlock your vault to continue.'
        };
    }

    let cleanWallet: string;
    let prefixedWallet: string;
    try {
        const validated = validateAndNormalizeKaspaWallet(rawSessionWallet);
        cleanWallet = validated.cleanWallet;
        prefixedWallet = validated.prefixedWallet;
    } catch {
        return {
            ok: false,
            status: 401,
            error: 'INVALID_SESSION_WALLET',
            message: 'Authenticated session wallet failed Bech32m integrity check.'
        };
    }

    try {
        const [blkClean, blkPrefixed] = await Promise.all([
            redis.sismember('perennia:firewall:blacklisted_wallets', cleanWallet),
            redis.sismember('perennia:firewall:blacklisted_wallets', prefixedWallet)
        ]);
        if (blkClean === 1 || blkPrefixed === 1) {
            return {
                ok: false,
                status: 403,
                error: 'FIREWALL_BLACKLISTED_WALLET',
                message: 'Wallet is blocked by the Perennia Security Firewall.'
            };
        }
    } catch {
        return {
            ok: false,
            status: 503,
            error: 'REDIS_UNAVAILABLE',
            message: 'Deterministic fail-closed halt: unable to verify firewall state in Redis.'
        };
    }

    return { ok: true, cleanWallet, prefixedWallet };
}

export const GET: RequestHandler = async ({ cookies }) => {
    const authRes = await resolveVerifiedSessionWallet(cookies);
    if (!authRes.ok) {
        return json(
            { ok: false, error: authRes.error, message: authRes.message },
            { status: authRes.status, headers: NO_STORE_HEADERS }
        );
    }

    let rustCfg: { rustBaseUrl: string; internalBearer: string };
    try {
        rustCfg = resolveRustGatewayConfig();
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Backend configuration missing.';
        return json(
            { ok: false, error: 'GATEWAY_CONFIG_HALT', message: msg },
            { status: 503, headers: NO_STORE_HEADERS }
        );
    }

    try {
        const upstream = await fetch(
            `${rustCfg.rustBaseUrl}/v1/internal/agent/mandates?wallet=${encodeURIComponent(
                authRes.prefixedWallet
            )}`,
            {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                    Authorization: rustCfg.internalBearer
                },
                signal: AbortSignal.timeout(6000)
            }
        );

        const payload = await upstream.json().catch(() => null);
        if (!upstream.ok || !payload) {
            return json(
                {
                    ok: false,
                    error: payload?.error || 'UPSTREAM_AGENT_GATEWAY_FAULT',
                    message:
                        payload?.message ||
                        `Rust Agent Gateway returned HTTP ${upstream.status}.`
                },
                { status: upstream.status || 503, headers: NO_STORE_HEADERS }
            );
        }

        return json(payload, { status: 200, headers: NO_STORE_HEADERS });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Connection refused';
        return json(
            {
                ok: false,
                error: 'AGENT_GATEWAY_UNREACHABLE',
                message: `Deterministic fail-closed halt: Rust Agent Gateway unreachable (${msg}).`
            },
            { status: 503, headers: NO_STORE_HEADERS }
        );
    }
};

export const POST: RequestHandler = async ({ request, cookies }) => {
    const authRes = await resolveVerifiedSessionWallet(cookies);
    if (!authRes.ok) {
        return json(
            { ok: false, error: authRes.error, message: authRes.message },
            { status: authRes.status, headers: NO_STORE_HEADERS }
        );
    }

    let rawBody: Record<string, unknown>;
    try {
        const parsed = await request.json();
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Request body must be a JSON object.');
        }
        rawBody = parsed as Record<string, unknown>;
    } catch {
        return json(
            {
                ok: false,
                error: 'INVALID_JSON_PAYLOAD',
                message: 'Malformed JSON body in Mandate creation request.'
            },
            { status: 400, headers: NO_STORE_HEADERS }
        );
    }

    if (containsForbiddenAirlockField(rawBody)) {
        return json(
            {
                ok: false,
                error: 'SECURITY_AIRLOCK_BLOCK',
                message:
                    'Cold-vault rules and external withdrawal addresses are strictly off-limits to Agent Mandates.'
            },
            { status: 403, headers: NO_STORE_HEADERS }
        );
    }

    let rustCfg: { rustBaseUrl: string; internalBearer: string };
    try {
        rustCfg = resolveRustGatewayConfig();
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Backend configuration missing.';
        return json(
            { ok: false, error: 'GATEWAY_CONFIG_HALT', message: msg },
            { status: 503, headers: NO_STORE_HEADERS }
        );
    }

    try {
        const rawLabel = String(rawBody.label ?? 'Personal Mandate').trim();
        const label =
            rawLabel.replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 64).trim() ||
            'Personal Mandate';

        const rawAssets = Array.isArray(rawBody.whitelistedAssets)
            ? rawBody.whitelistedAssets
            : [];
        if (rawAssets.length === 0 || rawAssets.length > 24) {
            return json(
                {
                    ok: false,
                    error: 'INVALID_ASSET_WHITELIST',
                    message: 'Select between 1 and 24 whitelisted asset tickers.'
                },
                { status: 400, headers: NO_STORE_HEADERS }
            );
        }

        const whitelistedAssets: string[] = [];
        for (const item of rawAssets) {
            const tick = String(item ?? '')
                .trim()
                .toUpperCase();
            if (!/^[A-Z0-9]{2,10}$/.test(tick)) {
                return json(
                    {
                        ok: false,
                        error: 'INVALID_ASSET_TICKER',
                        message: `Ticker "${tick}" must match sterile pattern ^[A-Z0-9]{2,10}$.`
                    },
                    { status: 400, headers: NO_STORE_HEADERS }
                );
            }
            if (!whitelistedAssets.includes(tick)) {
                whitelistedAssets.push(tick);
            }
        }

        const allowSwaps = Boolean(rawBody.allowSwaps);
        const allowBucketUpdates = Boolean(rawBody.allowBucketUpdates);
        if (!allowSwaps && !allowBucketUpdates) {
            return json(
                {
                    ok: false,
                    error: 'NO_CAPABILITIES_SELECTED',
                    message:
                        'Enable at least one capability (Swaps or 22:00 UTC Director Buckets).'
                },
                { status: 400, headers: NO_STORE_HEADERS }
            );
        }

        const maxSlippageBps = Number.parseInt(String(rawBody.maxSlippageBps ?? ''), 10);
        if (!Number.isInteger(maxSlippageBps) || maxSlippageBps < 1 || maxSlippageBps > 500) {
            return json(
                {
                    ok: false,
                    error: 'INVALID_SLIPPAGE_BPS',
                    message: 'maxSlippageBps must be an integer between 1 and 500 bps.'
                },
                { status: 400, headers: NO_STORE_HEADERS }
            );
        }

        const cap24hSompi = validateU128PositiveString(rawBody.cap24hSompi, 'cap24hSompi');
        const cap24hUsdMicros = validateU128PositiveString(
            rawBody.cap24hUsdMicros,
            'cap24hUsdMicros'
        );

        let pubkeyHex: string | undefined;
        if (typeof rawBody.pubkeyHex === 'string' && rawBody.pubkeyHex.trim().length > 0) {
            const cleanPk = rawBody.pubkeyHex.trim().replace(/^0x/i, '').toLowerCase();
            if (!/^[0-9a-f]{64}$/.test(cleanPk)) {
                return json(
                    {
                        ok: false,
                        error: 'INVALID_PUBKEY_HEX',
                        message: 'pubkeyHex must be a 64-character hex x-only Schnorr public key.'
                    },
                    { status: 400, headers: NO_STORE_HEADERS }
                );
            }
            pubkeyHex = cleanPk;
        }

        let expiresInHours: number | undefined;
        if (rawBody.expiresInHours !== undefined && rawBody.expiresInHours !== null && rawBody.expiresInHours !== '') {
            const parsedHours = Number.parseInt(String(rawBody.expiresInHours), 10);
            if (!Number.isInteger(parsedHours) || parsedHours < 0 || parsedHours > 8760) {
                return json(
                    {
                        ok: false,
                        error: 'INVALID_EXPIRATION_HOURS',
                        message: 'expiresInHours must be between 0 (no expiry) and 8760 hours.'
                    },
                    { status: 400, headers: NO_STORE_HEADERS }
                );
            }
            if (parsedHours > 0) {
                expiresInHours = parsedHours;
            }
        }

        const forwardBody = {
            walletAddress: authRes.prefixedWallet,
            pubkeyHex,
            label,
            whitelistedAssets,
            allowSwaps,
            allowBucketUpdates,
            maxSlippageBps,
            cap24hSompi,
            cap24hUsdMicros,
            expiresInHours
        };

        const upstream = await fetch(`${rustCfg.rustBaseUrl}/v1/internal/agent/mandates`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: rustCfg.internalBearer
            },
            body: JSON.stringify(forwardBody),
            signal: AbortSignal.timeout(6000)
        });

        const payload = await upstream.json().catch(() => null);
        if (!upstream.ok || !payload) {
            return json(
                {
                    ok: false,
                    error: payload?.error || 'MANDATE_CREATION_REJECTED',
                    message:
                        payload?.message ||
                        `Rust Agent Gateway rejected Mandate creation (${upstream.status}).`
                },
                { status: upstream.status || 503, headers: NO_STORE_HEADERS }
            );
        }

        return json(payload, { status: 201, headers: NO_STORE_HEADERS });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Mandate creation failed.';
        const isValidation = msg.includes('u128');
        return json(
            {
                ok: false,
                error: isValidation ? 'INVALID_MANDATE_CAP' : 'AGENT_GATEWAY_UNREACHABLE',
                message: msg
            },
            { status: isValidation ? 400 : 503, headers: NO_STORE_HEADERS }
        );
    }
};

export const DELETE: RequestHandler = async ({ request, cookies }) => {
    const authRes = await resolveVerifiedSessionWallet(cookies);
    if (!authRes.ok) {
        return json(
            { ok: false, error: authRes.error, message: authRes.message },
            { status: authRes.status, headers: NO_STORE_HEADERS }
        );
    }

    let rawBody: Record<string, unknown> = {};
    try {
        const parsed = await request.json();
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            rawBody = parsed as Record<string, unknown>;
        }
    } catch {
        return json(
            {
                ok: false,
                error: 'INVALID_JSON_PAYLOAD',
                message: 'Malformed JSON body in Kill Switch revocation request.'
            },
            { status: 400, headers: NO_STORE_HEADERS }
        );
    }

    const revokeAllForWallet = Boolean(rawBody.revokeAllForWallet);
    const keyId = typeof rawBody.keyId === 'string' ? rawBody.keyId.trim() : '';

    if (!revokeAllForWallet && (!keyId || !/^[A-Za-z0-9_]{4,64}$/.test(keyId))) {
        return json(
            {
                ok: false,
                error: 'INVALID_KEY_ID',
                message: 'Provide a valid Mandate keyId or set revokeAllForWallet: true.'
            },
            { status: 400, headers: NO_STORE_HEADERS }
        );
    }

    let rustCfg: { rustBaseUrl: string; internalBearer: string };
    try {
        rustCfg = resolveRustGatewayConfig();
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Backend configuration missing.';
        return json(
            { ok: false, error: 'GATEWAY_CONFIG_HALT', message: msg },
            { status: 503, headers: NO_STORE_HEADERS }
        );
    }

    try {
        const upstream = await fetch(`${rustCfg.rustBaseUrl}/v1/internal/agent/mandates`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Authorization: rustCfg.internalBearer
            },
            body: JSON.stringify({
                walletAddress: authRes.prefixedWallet,
                keyId: revokeAllForWallet ? undefined : keyId,
                revokeAllForWallet
            }),
            signal: AbortSignal.timeout(6000)
        });

        const payload = await upstream.json().catch(() => null);
        if (!upstream.ok || !payload) {
            return json(
                {
                    ok: false,
                    error: payload?.error || 'KILL_SWITCH_REJECTED',
                    message:
                        payload?.message ||
                        `Kill Switch revocation failed with HTTP ${upstream.status}.`
                },
                { status: upstream.status || 503, headers: NO_STORE_HEADERS }
            );
        }

        return json(payload, { status: 200, headers: NO_STORE_HEADERS });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Connection refused';
        return json(
            {
                ok: false,
                error: 'AGENT_GATEWAY_UNREACHABLE',
                message: `Deterministic fail-closed halt: Kill Switch could not reach Rust Agent Gateway (${msg}).`
            },
            { status: 503, headers: NO_STORE_HEADERS }
        );
    }
};