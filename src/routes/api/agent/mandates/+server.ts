// src/routes/api/agent/mandates/+server.ts
import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import {
    LIVE_PRICING_UNAVAILABLE_MESSAGE,
    ORACLE_E8_DECIMALS,
    ceilDivBigInt,
    parseDecimalToAtomic
} from '$lib/crypto/atomicMath';

const CANONICAL_SCOPES = ['READ', 'SPLIT', 'SWAP', 'PAIR', 'BOOST'] as const;
type AgentScope = (typeof CANONICAL_SCOPES)[number];

const CANONICAL_SCOPE_SET = new Set<string>(CANONICAL_SCOPES);
const MAX_U128 = (1n << 128n) - 1n;
const MIN_SPEND_USD_MICROS = 1_000_000n;
const MIN_SOMPI_CAP = 1_000_000_000n; // 10 KAS
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

interface StoredMandateMeta {
    keyId: string;
    cleanWallet: string;
    prefixedWallet: string;
    scopes: AgentScope[];
    effectiveCap24hUsdMicros: string;
    maxSlippageBps: number;
    whitelistedAssets: string[];
}

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

    const prefixValues = [11, 1, 19, 16, 1, 0];
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

function parseOptionalPositiveU128(raw: unknown): bigint | null {
    if (raw === undefined || raw === null || raw === '') return null;
    const str = typeof raw === 'bigint' ? raw.toString() : String(raw).trim();
    if (!/^[0-9]{1,39}$/.test(str)) return null;
    const parsed = BigInt(str);
    if (parsed <= 1n || parsed > MAX_U128) return null;
    return parsed;
}

function parseKasUsdE8FromRaw(raw: unknown): bigint | null {
    if (typeof raw === 'bigint') return raw > 0n ? raw : null;
    if (typeof raw === 'number') {
        if (!Number.isFinite(raw) || raw <= 0) return null;
        try {
            const parsed = parseDecimalToAtomic(raw, ORACLE_E8_DECIMALS, 'floor');
            return parsed > 0n ? parsed : null;
        } catch {
            return null;
        }
    }
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
        const parsed = parseDecimalToAtomic(trimmed, ORACLE_E8_DECIMALS, 'floor');
        return parsed > 0n ? parsed : null;
    } catch {
        return null;
    }
}

async function resolveLiveKasUsdE8(): Promise<bigint | null> {
    try {
        const [spotRaw, pricesJsonRaw, pulseRaw] = await Promise.all([
            redis.get('oracle:spot:KAS_USDC').catch(() => null),
            redis.get('oracle:spot:prices_json').catch(() => null),
            redis.get('perennia:agent:latest_market_pulse').catch(() => null)
        ]);

        const direct = parseKasUsdE8FromRaw(spotRaw);
        if (direct) return direct;

        if (pricesJsonRaw) {
            try {
                const parsed = JSON.parse(pricesJsonRaw) as Record<string, unknown>;
                const kasVal = parsed?.KAS ?? parsed?.kas;
                const fromJson = parseKasUsdE8FromRaw(kasVal);
                if (fromJson) return fromJson;
            } catch {
                // Ignore malformed prices_json
            }
        }

        if (pulseRaw) {
            try {
                const pulse = JSON.parse(pulseRaw) as Record<string, unknown>;
                const assets = Array.isArray(pulse?.assets) ? pulse.assets : [];
                const kasAsset = assets.find(
                    (a: unknown) =>
                        a &&
                        typeof a === 'object' &&
                        String((a as Record<string, unknown>).ticker || '').toUpperCase() === 'KAS'
                ) as Record<string, unknown> | undefined;
                if (kasAsset?.usdE8 && /^[0-9]{1,39}$/.test(String(kasAsset.usdE8))) {
                    const e8 = BigInt(String(kasAsset.usdE8));
                    if (e8 > 0n) return e8;
                }
            } catch {
                // Ignore malformed pulse snapshot
            }
        }
    } catch {
        // Fail closed below
    }
    return null;
}

function normalizeScopeList(rawScopes: unknown): {
    ok: true;
    scopes: AgentScope[];
} | {
    ok: false;
    status: number;
    error: string;
    message: string;
} {
    if (!Array.isArray(rawScopes)) {
        return {
            ok: false,
            status: 400,
            error: 'NO_CAPABILITIES_SELECTED',
            message: 'Select at least one capability scope.'
        };
    }

    const picked = new Set<AgentScope>();
    for (const entry of rawScopes) {
        const norm = String(entry ?? '').trim().toUpperCase();
        if (norm === 'SWEEP' || norm.includes('COLD') || norm.includes('VAULT') || norm.includes('WITHDRAW')) {
            return {
                ok: false,
                status: 403,
                error: 'SECURITY_AIRLOCK_BLOCK',
                message: 'Cold vault and sweep actions are strictly locked.'
            };
        }
        if (CANONICAL_SCOPE_SET.has(norm)) {
            picked.add(norm as AgentScope);
        }
    }

    const ordered = CANONICAL_SCOPES.filter((s) => picked.has(s));
    if (ordered.length === 0) {
        return {
            ok: false,
            status: 400,
            error: 'NO_CAPABILITIES_SELECTED',
            message: 'Select at least one capability scope.'
        };
    }

    return { ok: true, scopes: ordered };
}

function deriveLegacyScopes(m: Record<string, unknown>): AgentScope[] {
    const out: AgentScope[] = ['READ'];
    if (Boolean(m.allowBucketUpdates)) out.push('SPLIT');
    if (Boolean(m.allowSwaps) && String(m.cap24hUsdMicros ?? '0') !== '1') {
        out.push('SWAP');
    }
    return out;
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
            message: 'Unlock your wallet to manage agent keys.'
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
            message: 'Session store unreachable.'
        };
    }

    if (!rawSessionWallet) {
        return {
            ok: false,
            status: 401,
            error: 'SESSION_EXPIRED',
            message: 'Wallet session expired. Re-unlock to continue.'
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
            message: 'Authenticated session wallet failed integrity check.'
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
                message: 'Wallet is blocked by the security firewall.'
            };
        }
    } catch {
        return {
            ok: false,
            status: 503,
            error: 'REDIS_UNAVAILABLE',
            message: 'Unable to verify firewall state.'
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
        const [upstream, metaMap] = await Promise.all([
            fetch(
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
            ),
            redis
                .hgetall(`perennia:agent:wallet_mandates_meta:${authRes.cleanWallet}`)
                .catch(() => ({} as Record<string, string>))
        ]);

        const payload = await upstream.json().catch(() => null);
        if (!upstream.ok || !payload) {
            return json(
                {
                    ok: false,
                    error: payload?.error || 'UPSTREAM_AGENT_GATEWAY_FAULT',
                    message:
                        payload?.message ||
                        `Agent gateway returned HTTP ${upstream.status}.`
                },
                { status: upstream.status || 503, headers: NO_STORE_HEADERS }
            );
        }

        if (Array.isArray(payload.mandates)) {
            payload.mandates = payload.mandates.map((rawItem: Record<string, unknown>) => {
                const keyId = String(rawItem?.keyId ?? '');
                let storedMeta: StoredMandateMeta | null = null;
                if (keyId && metaMap && typeof metaMap[keyId] === 'string') {
                    try {
                        storedMeta = JSON.parse(metaMap[keyId]) as StoredMandateMeta;
                    } catch {
                        storedMeta = null;
                    }
                }
                const scopes =
                    storedMeta && Array.isArray(storedMeta.scopes) && storedMeta.scopes.length > 0
                        ? CANONICAL_SCOPES.filter((s) => storedMeta!.scopes.includes(s))
                        : deriveLegacyScopes(rawItem);
                const cap24hUsdMicros =
                    storedMeta?.effectiveCap24hUsdMicros ??
                    (String(rawItem.cap24hUsdMicros ?? '0') === '1'
                        ? '0'
                        : String(rawItem.cap24hUsdMicros ?? '0'));

                return {
                    ...rawItem,
                    scopes,
                    cap24hUsdMicros
                };
            });
        }

        return json(payload, { status: 200, headers: NO_STORE_HEADERS });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Connection refused';
        return json(
            {
                ok: false,
                error: 'AGENT_GATEWAY_UNREACHABLE',
                message: `Agent gateway unreachable (${msg}).`
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
                message: 'Malformed JSON body.'
            },
            { status: 400, headers: NO_STORE_HEADERS }
        );
    }

    if (containsForbiddenAirlockField(rawBody)) {
        return json(
            {
                ok: false,
                error: 'SECURITY_AIRLOCK_BLOCK',
                message: 'Cold vault and sweep actions are strictly locked.'
            },
            { status: 403, headers: NO_STORE_HEADERS }
        );
    }

    let scopes: AgentScope[];
    if (rawBody.scopes !== undefined) {
        const scopeRes = normalizeScopeList(rawBody.scopes);
        if (!scopeRes.ok) {
            return json(
                { ok: false, error: scopeRes.error, message: scopeRes.message },
                { status: scopeRes.status, headers: NO_STORE_HEADERS }
            );
        }
        scopes = scopeRes.scopes;
    } else {
        const legacyAllowSwaps = Boolean(rawBody.allowSwaps);
        const legacyAllowBuckets = Boolean(rawBody.allowBucketUpdates);
        if (!legacyAllowSwaps && !legacyAllowBuckets) {
            return json(
                {
                    ok: false,
                    error: 'NO_CAPABILITIES_SELECTED',
                    message: 'Select at least one capability scope.'
                },
                { status: 400, headers: NO_STORE_HEADERS }
            );
        }
        scopes = ['READ'];
        if (legacyAllowBuckets) scopes.push('SPLIT');
        if (legacyAllowSwaps) scopes.push('SWAP');
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
        const rawLabel = String(rawBody.label ?? 'Bot 1').trim();
        const label =
            rawLabel.replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 64).trim() || 'Bot 1';

        const rawAssets = Array.isArray(rawBody.whitelistedAssets)
            ? rawBody.whitelistedAssets
            : [];
        if (rawAssets.length === 0 || rawAssets.length > 24) {
            return json(
                {
                    ok: false,
                    error: 'INVALID_ASSET_WHITELIST',
                    message: 'Select between 1 and 24 asset tickers.'
                },
                { status: 400, headers: NO_STORE_HEADERS }
            );
        }

        const whitelistedAssets: string[] = [];
        for (const item of rawAssets) {
            const tick = String(item ?? '').trim().toUpperCase();
            if (!/^[A-Z0-9]{2,10}$/.test(tick)) {
                return json(
                    {
                        ok: false,
                        error: 'INVALID_ASSET_TICKER',
                        message: `Invalid ticker "${tick}".`
                    },
                    { status: 400, headers: NO_STORE_HEADERS }
                );
            }
            if (!whitelistedAssets.includes(tick)) {
                whitelistedAssets.push(tick);
            }
        }

        const maxSlippageBps = Number.parseInt(String(rawBody.maxSlippageBps ?? ''), 10);
        if (!Number.isInteger(maxSlippageBps) || maxSlippageBps < 1 || maxSlippageBps > 500) {
            return json(
                {
                    ok: false,
                    error: 'INVALID_SLIPPAGE_BPS',
                    message: 'Slippage must be between 1 and 500 bps.'
                },
                { status: 400, headers: NO_STORE_HEADERS }
            );
        }

        const hasSpendScope =
            scopes.includes('SWAP') ||
            scopes.includes('PAIR') ||
            scopes.includes('BOOST');

        let effectiveCap24hUsdMicros: string;
        let upstreamCap24hUsdMicros: string;
        let upstreamCap24hSompi: string;
        let upstreamAllowSwaps: boolean;
        let upstreamAllowBucketUpdates: boolean;

        if (hasSpendScope) {
            effectiveCap24hUsdMicros = validateU128PositiveString(
                rawBody.cap24hUsdMicros,
                'cap24hUsdMicros'
            );
            const usdMicrosBig = BigInt(effectiveCap24hUsdMicros);
            if (usdMicrosBig < MIN_SPEND_USD_MICROS) {
                return json(
                    {
                        ok: false,
                        error: 'INVALID_MANDATE_CAP',
                        message: 'Minimum daily limit is $1.'
                    },
                    { status: 400, headers: NO_STORE_HEADERS }
                );
            }

            const providedSompi = parseOptionalPositiveU128(rawBody.cap24hSompi);
            if (providedSompi !== null) {
                upstreamCap24hSompi = (
                    providedSompi < MIN_SOMPI_CAP ? MIN_SOMPI_CAP : providedSompi
                ).toString();
            } else {
                const kasUsdE8 = await resolveLiveKasUsdE8();
                if (!kasUsdE8 || kasUsdE8 <= 0n) {
                    return json(
                        {
                            ok: false,
                            error: 'ORACLE_UNAVAILABLE',
                            message: LIVE_PRICING_UNAVAILABLE_MESSAGE
                        },
                        { status: 503, headers: NO_STORE_HEADERS }
                    );
                }
                const computedSompi = ceilDivBigInt(
                    usdMicrosBig * 50_000_000_000n,
                    kasUsdE8 * 4n
                );
                upstreamCap24hSompi = (
                    computedSompi < MIN_SOMPI_CAP ? MIN_SOMPI_CAP : computedSompi
                ).toString();
            }

            upstreamCap24hUsdMicros = effectiveCap24hUsdMicros;
            upstreamAllowSwaps = true;
            upstreamAllowBucketUpdates = scopes.includes('SPLIT');
        } else {
            effectiveCap24hUsdMicros = '0';
            upstreamCap24hUsdMicros = '1';
            upstreamCap24hSompi = '1';
            if (scopes.includes('SPLIT')) {
                upstreamAllowSwaps = false;
                upstreamAllowBucketUpdates = true;
            } else {
                upstreamAllowSwaps = true;
                upstreamAllowBucketUpdates = false;
            }
        }

        let pubkeyHex: string | undefined;
        if (typeof rawBody.pubkeyHex === 'string' && rawBody.pubkeyHex.trim().length > 0) {
            const cleanPk = rawBody.pubkeyHex.trim().replace(/^0x/i, '').toLowerCase();
            if (!/^[0-9a-f]{64}$/.test(cleanPk)) {
                return json(
                    {
                        ok: false,
                        error: 'INVALID_PUBKEY_HEX',
                        message: 'Invalid pubkeyHex format.'
                    },
                    { status: 400, headers: NO_STORE_HEADERS }
                );
            }
            pubkeyHex = cleanPk;
        }

        let expiresInHours: number | undefined;
        if (
            rawBody.expiresInHours !== undefined &&
            rawBody.expiresInHours !== null &&
            rawBody.expiresInHours !== ''
        ) {
            const parsedHours = Number.parseInt(String(rawBody.expiresInHours), 10);
            if (!Number.isInteger(parsedHours) || parsedHours < 0 || parsedHours > 8760) {
                return json(
                    {
                        ok: false,
                        error: 'INVALID_EXPIRATION_HOURS',
                        message: 'expiresInHours must be between 0 and 8760.'
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
            allowSwaps: upstreamAllowSwaps,
            allowBucketUpdates: upstreamAllowBucketUpdates,
            maxSlippageBps,
            cap24hSompi: upstreamCap24hSompi,
            cap24hUsdMicros: upstreamCap24hUsdMicros,
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
                        `Agent gateway rejected creation (${upstream.status}).`
                },
                { status: upstream.status || 503, headers: NO_STORE_HEADERS }
            );
        }

        const createdKeyId = String(payload?.mandate?.keyId ?? '').trim();
        if (createdKeyId) {
            const meta: StoredMandateMeta = {
                keyId: createdKeyId,
                cleanWallet: authRes.cleanWallet,
                prefixedWallet: authRes.prefixedWallet,
                scopes,
                effectiveCap24hUsdMicros,
                maxSlippageBps,
                whitelistedAssets
            };
            const serializedMeta = JSON.stringify(meta);
            await Promise.all([
                redis
                    .set(`perennia:agent:mandate_meta:${createdKeyId}`, serializedMeta)
                    .catch(() => null),
                redis
                    .hset(
                        `perennia:agent:wallet_mandates_meta:${authRes.cleanWallet}`,
                        createdKeyId,
                        serializedMeta
                    )
                    .catch(() => null)
            ]);
        }

        if (payload.mandate && typeof payload.mandate === 'object') {
            payload.mandate = {
                ...payload.mandate,
                scopes,
                cap24hUsdMicros: effectiveCap24hUsdMicros
            };
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
                message: 'Malformed JSON body.'
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
                message: 'Provide a valid keyId or set revokeAllForWallet: true.'
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
                        `Revocation failed with HTTP ${upstream.status}.`
                },
                { status: upstream.status || 503, headers: NO_STORE_HEADERS }
            );
        }

        const revokedIds: string[] = Array.isArray(payload.revokedKeyIds)
            ? payload.revokedKeyIds.map((x: unknown) => String(x))
            : revokeAllForWallet
              ? []
              : [keyId];

        const cleanupTasks: Promise<unknown>[] = revokedIds.map((rid) =>
            Promise.all([
                redis.del(`perennia:agent:mandate_meta:${rid}`).catch(() => null),
                redis
                    .hdel(`perennia:agent:wallet_mandates_meta:${authRes.cleanWallet}`, rid)
                    .catch(() => null)
            ])
        );
        if (revokeAllForWallet) {
            cleanupTasks.push(
                redis
                    .del(`perennia:agent:wallet_mandates_meta:${authRes.cleanWallet}`)
                    .catch(() => null)
            );
        }
        await Promise.all(cleanupTasks);

        return json(payload, { status: 200, headers: NO_STORE_HEADERS });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Connection refused';
        return json(
            {
                ok: false,
                error: 'AGENT_GATEWAY_UNREACHABLE',
                message: `Revocation unreachable (${msg}).`
            },
            { status: 503, headers: NO_STORE_HEADERS }
        );
    }
};
