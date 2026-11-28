import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { redis } from '$lib/server/redis';

type AgentScope = 'READ' | 'SPLIT' | 'SWAP' | 'PAIR' | 'BOOST';

const PASSTHROUGH_REQ_HEADERS = [
    'authorization',
    'x-agent-key',
    'x-agent-nonce',
    'x-idempotency-key',
    'last-event-id',
    'content-type',
    'accept'
] as const;

const PASSTHROUGH_RES_HEADERS = [
    'content-type',
    'cache-control',
    'www-authenticate',
    'retry-after',
    'x-content-type-options'
] as const;

const AGENT_NONCE_RE = /^[A-Za-z0-9_-]{16,128}$/;

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

const NO_STORE_HEADERS = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
};

interface UnverifiedModeBClaims {
    keyId: string;
    allowSwaps?: boolean;
    allowBucketUpdates?: boolean;
    cap24hUsdMicros?: string;
}

function resolveAgentUpstreamBase(): string {
    const raw =
        env.AGENT_BACKEND_URL ||
        env.RUST_BACKEND_URL ||
        (env.UBUNTU_NODE_IP ? `http://${env.UBUNTU_NODE_IP}:8002` : 'http://127.0.0.1:8002');
    return raw.trim().replace(/\/+$/, '');
}

function resolveInternalBearer(): string | null {
    const tok = (env.INTERNAL_ADMIN_TOKEN || env.PERENNIA_ADMIN_KEY || '').trim();
    return tok ? `Bearer ${tok}` : null;
}

function extractRawAgentToken(headers: Headers): string | null {
    const auth = headers.get('authorization');
    if (auth) {
        const trimmed = auth.trim();
        if (trimmed.toLowerCase().startsWith('bearer ')) {
            const clean = trimmed.slice(7).trim();
            if (clean) return clean;
        }
    }
    const keyHdr = headers.get('x-agent-key');
    if (keyHdr && keyHdr.trim()) {
        return keyHdr.trim();
    }
    return null;
}

function decodeModeBUnverifiedClaims(token: string): UnverifiedModeBClaims | null {
    if (!token.startsWith('per_md_v1.')) return null;
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    try {
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
        const decoded = Buffer.from(padded, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded) as Record<string, unknown>;
        if (!parsed || typeof parsed.keyId !== 'string' || !parsed.keyId.trim()) {
            return null;
        }
        return {
            keyId: parsed.keyId.trim(),
            allowSwaps: Boolean(parsed.allowSwaps),
            allowBucketUpdates: Boolean(parsed.allowBucketUpdates),
            cap24hUsdMicros:
                parsed.cap24hUsdMicros !== undefined ? String(parsed.cap24hUsdMicros) : undefined
        };
    } catch {
        return null;
    }
}

async function resolveModeBScopes(token: string): Promise<AgentScope[] | null> {
    const claims = decodeModeBUnverifiedClaims(token);
    if (!claims) return null;

    try {
        const rawMeta = await redis.get(`perennia:agent:mandate_meta:${claims.keyId}`);
        if (rawMeta) {
            const parsed = JSON.parse(rawMeta) as { scopes?: unknown };
            if (Array.isArray(parsed.scopes) && parsed.scopes.length > 0) {
                return parsed.scopes.map((s) => String(s).toUpperCase()) as AgentScope[];
            }
        }
    } catch {
        // Fall back to claims derivation
    }

    const derived: AgentScope[] = ['READ'];
    if (claims.allowBucketUpdates) derived.push('SPLIT');
    if (claims.allowSwaps && claims.cap24hUsdMicros !== '1') {
        derived.push('SWAP');
    }
    return derived;
}

function containsForbiddenAirlockField(val: unknown): boolean {
    if (!val || typeof val !== 'object') return false;
    if (Array.isArray(val)) return val.some(containsForbiddenAirlockField);
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

function mandateViolation(message: string): Response {
    return json(
        {
            ok: false,
            isError: true,
            error: 'MANDATE_VIOLATION',
            message
        },
        { status: 403, headers: NO_STORE_HEADERS }
    );
}

function resolveRequiredScopes(
    method: string,
    subPath: string,
    parsedBody: Record<string, unknown> | null
): AgentScope[] {
    if (method === 'GET') {
        if (subPath === 'me/lp' || subPath === 'lp') return ['READ'];
        if (subPath === 'me/boost' || subPath === 'chronos/rfq') return ['BOOST'];
        if (
            subPath === 'alpha' ||
            subPath === 'me/telemetry' ||
            subPath === 'me/buckets' ||
            subPath === 'me/taxes' ||
            subPath === 'markets' ||
            subPath === 'stream'
        ) {
            return ['READ'];
        }
        return [];
    }

    if (method === 'POST') {
        if (subPath === 'me/buckets') {
            const reqs: AgentScope[] = ['SPLIT'];
            const allocs = Array.isArray(parsedBody?.allocations)
                ? parsedBody.allocations
                : [];
            const usesAutoLp = allocs.some(
                (a) =>
                    a &&
                    typeof a === 'object' &&
                    String((a as Record<string, unknown>).routeMode || '').toLowerCase() ===
                        'auto-lp'
            );
            if (usesAutoLp) reqs.push('PAIR');
            return reqs;
        }
        if (subPath === 'quote' || subPath === 'execute') {
            const purpose = String(parsedBody?.purpose ?? '').trim().toLowerCase();
            if (purpose === 'pair') return ['PAIR'];
            if (purpose === 'boost') return ['BOOST'];
            return ['SWAP'];
        }
        if (subPath === 'me/lp' || subPath === 'lp') return ['PAIR'];
        if (subPath === 'me/boost') return ['BOOST'];
        if (subPath === 'mcp') {
            const rpcMethod = String(parsedBody?.method ?? '').trim();
            if (rpcMethod !== 'tools/call') return [];
            const params =
                parsedBody?.params && typeof parsedBody.params === 'object'
                    ? (parsedBody.params as Record<string, unknown>)
                    : null;
            const toolName = String(params?.name ?? '').trim();
            const args =
                params?.arguments && typeof params.arguments === 'object'
                    ? (params.arguments as Record<string, unknown>)
                    : null;
            if (toolName === 'perennia_get_markets') return ['READ'];
            if (toolName === 'perennia_quote_swap' || toolName === 'perennia_execute_swap') {
                return ['SWAP'];
            }
            if (toolName === 'perennia_me_telemetry_and_buckets') {
                const op = String(args?.operation ?? '').trim();
                if (op === 'update_buckets') {
                    const reqs: AgentScope[] = ['SPLIT'];
                    const allocs = Array.isArray(args?.allocations) ? args.allocations : [];
                    const usesAutoLp = allocs.some(
                        (a) =>
                            a &&
                            typeof a === 'object' &&
                            String((a as Record<string, unknown>).routeMode || '').toLowerCase() ===
                                'auto-lp'
                    );
                    if (usesAutoLp) reqs.push('PAIR');
                    return reqs;
                }
                return ['READ'];
            }
        }
    }

    return [];
}

async function authenticateViaTelemetry(
    baseUrl: string,
    outHeaders: Headers
): Promise<{ ok: true; walletAddress: string } | { ok: false; response: Response }> {
    try {
        const authRes = await fetch(`${baseUrl}/api/v1/agent/me/telemetry`, {
            method: 'GET',
            headers: outHeaders,
            signal: AbortSignal.timeout(8_000)
        });
        if (!authRes.ok) {
            return {
                ok: false,
                response: new Response(authRes.body, {
                    status: authRes.status,
                    headers: NO_STORE_HEADERS
                })
            };
        }
        const telJson = (await authRes.json().catch(() => null)) as Record<string, unknown> | null;
        const walletAddress = String(telJson?.walletAddress ?? '').trim();
        if (!walletAddress) {
            return {
                ok: false,
                response: json(
                    {
                        ok: false,
                        isError: true,
                        error: 'UNAUTHORIZED',
                        message: 'Unable to resolve mandate wallet.'
                    },
                    { status: 401, headers: NO_STORE_HEADERS }
                )
            };
        }
        return { ok: true, walletAddress };
    } catch {
        return {
            ok: false,
            response: json(
                {
                    ok: false,
                    isError: true,
                    error: 'NODE_UNAVAILABLE',
                    message: 'Agent gateway is temporarily unavailable.'
                },
                { status: 503, headers: NO_STORE_HEADERS }
            )
        };
    }
}

async function callInternalStateAction(
    baseUrl: string,
    internalBearer: string,
    wallet: string,
    action: string,
    payload: Record<string, unknown> = {}
): Promise<Response> {
    const res = await fetch(`${baseUrl}/v1/state/action`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: internalBearer
        },
        body: JSON.stringify({ wallet, action, payload }),
        signal: AbortSignal.timeout(8_000)
    });
    return res;
}

async function proxyAgentGateway(event: RequestEvent): Promise<Response> {
    const baseUrl = resolveAgentUpstreamBase();
    const subPath = (event.params.path ?? '').replace(/^\/+/, '').replace(/\/+$/, '');
    const lowerSub = subPath.toLowerCase();

    if (lowerSub.includes('sweep') || lowerSub.includes('cold-vault') || lowerSub.includes('cold_vault')) {
        return mandateViolation('Cold vault and sweep actions are strictly locked.');
    }

    const method = event.request.method.toUpperCase();
    const nonceHeader = event.request.headers.get('x-agent-nonce');
    if (
        method === 'POST' &&
        (subPath === 'chronos/bid' || subPath === 'chronos/zktls-unlock') &&
        nonceHeader !== null &&
        !AGENT_NONCE_RE.test(nonceHeader.trim())
    ) {
        return json(
            {
                ok: false,
                isError: true,
                error: 'INVALID_INPUT',
                message:
                    'Invalid X-Agent-Nonce format (expected 16..128 alphanumeric, underscore, or hyphen characters).'
            },
            {
                status: 400,
                headers: NO_STORE_HEADERS
            }
        );
    }

    const outHeaders = new Headers();
    for (const h of PASSTHROUGH_REQ_HEADERS) {
        const val = event.request.headers.get(h);
        if (val) outHeaders.set(h, val);
    }

    const fwd = event.request.headers.get('x-forwarded-for');
    if (fwd) {
        outHeaders.set('x-forwarded-for', fwd);
    } else {
        try {
            outHeaders.set('x-forwarded-for', event.getClientAddress());
        } catch {
            // Ignore when client address is unavailable in local dev
        }
    }

    const realIp = event.request.headers.get('x-real-ip');
    if (realIp) outHeaders.set('x-real-ip', realIp);

    const isStream = subPath === 'stream';
    const rawBodyBuf =
        method === 'GET' || method === 'HEAD'
            ? undefined
            : await event.request.arrayBuffer();

    let parsedBody: Record<string, unknown> | null = null;
    if (rawBodyBuf && rawBodyBuf.byteLength > 0) {
        try {
            const text = Buffer.from(rawBodyBuf).toString('utf8');
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                parsedBody = parsed as Record<string, unknown>;
            }
        } catch {
            parsedBody = null;
        }
    }

    if (parsedBody && containsForbiddenAirlockField(parsedBody)) {
        return mandateViolation('Cold vault and sweep actions are strictly locked.');
    }

    const rawToken = extractRawAgentToken(event.request.headers);
    if (subPath === 'alpha') {
        if (!rawToken || (!rawToken.startsWith('per_ag_v1.') && !rawToken.startsWith('per_md_v1.'))) {
            return json(
                {
                    ok: false,
                    isError: true,
                    error: 'UNAUTHORIZED',
                    message: 'Authenticated Mode A (per_ag_v1.*) or Mode B (per_md_v1.*) Agent Key required for /api/v1/agent/alpha.'
                },
                { status: 401, headers: NO_STORE_HEADERS }
            );
        }
    }
    if (rawToken && rawToken.startsWith('per_md_v1.')) {
        const activeScopes = await resolveModeBScopes(rawToken);
        if (activeScopes) {
            const required = resolveRequiredScopes(method, subPath, parsedBody);
            for (const reqScope of required) {
                if (!activeScopes.includes(reqScope)) {
                    return mandateViolation(
                        `Mandate does not include required ${reqScope} capability.`
                    );
                }
            }
        }
    }

    // Serve READ/PAIR/BOOST composite Mode B endpoints backed by :8002 verified auth
    if (method === 'GET' && (subPath === 'me/taxes' || subPath === 'me/lp' || subPath === 'me/boost')) {
        const authCheck = await authenticateViaTelemetry(baseUrl, outHeaders);
        if (!authCheck.ok) return authCheck.response;

        if (subPath === 'me/boost') {
            try {
                const [rfqRes, bucketsRes] = await Promise.all([
                    fetch(`${baseUrl}/api/v1/agent/chronos/rfq`, {
                        method: 'GET',
                        headers: outHeaders,
                        signal: AbortSignal.timeout(8_000)
                    }),
                    fetch(`${baseUrl}/api/v1/agent/me/buckets`, {
                        method: 'GET',
                        headers: outHeaders,
                        signal: AbortSignal.timeout(8_000)
                    })
                ]);
                const rfqJson = await rfqRes.json().catch(() => null);
                const bucketsJson = await bucketsRes.json().catch(() => null);
                return json(
                    {
                        ok: true,
                        walletAddress: authCheck.walletAddress,
                        batches: Array.isArray(rfqJson?.batches) ? rfqJson.batches : [],
                        buckets: Array.isArray(bucketsJson?.buckets) ? bucketsJson.buckets : []
                    },
                    { status: 200, headers: NO_STORE_HEADERS }
                );
            } catch {
                return json(
                    {
                        ok: false,
                        isError: true,
                        error: 'NODE_UNAVAILABLE',
                        message: 'Agent gateway is temporarily unavailable.'
                    },
                    { status: 503, headers: NO_STORE_HEADERS }
                );
            }
        }

        const internalBearer = resolveInternalBearer();
        if (!internalBearer) {
            return json(
                {
                    ok: false,
                    isError: true,
                    error: 'GATEWAY_CONFIG_HALT',
                    message: 'Internal gateway bearer is not configured.'
                },
                { status: 503, headers: NO_STORE_HEADERS }
            );
        }

        const actionName = subPath === 'me/taxes' ? 'GET_HIFO_TAX_LOTS' : 'GET_LP_POSITIONS';
        try {
            const stateRes = await callInternalStateAction(
                baseUrl,
                internalBearer,
                authCheck.walletAddress,
                actionName
            );
            const stateJson = await stateRes.json().catch(() => null);
            if (!stateRes.ok || !stateJson) {
                return json(
                    {
                        ok: false,
                        isError: true,
                        error: stateJson?.error || 'STATE_UNAVAILABLE',
                        message: stateJson?.message || 'Unable to load wallet telemetry.'
                    },
                    { status: stateRes.status || 503, headers: NO_STORE_HEADERS }
                );
            }
            const payloadKey = subPath === 'me/taxes' ? 'taxLots' : 'positions';
            return json(
                {
                    ok: true,
                    walletAddress: authCheck.walletAddress,
                    [payloadKey]: stateJson?.data ?? stateJson
                },
                { status: 200, headers: NO_STORE_HEADERS }
            );
        } catch {
            return json(
                {
                    ok: false,
                    isError: true,
                    error: 'NODE_UNAVAILABLE',
                    message: 'Agent gateway is temporarily unavailable.'
                },
                { status: 503, headers: NO_STORE_HEADERS }
            );
        }
    }

    const targetUrl = `${baseUrl}/api/v1/agent/${subPath}${event.url.search}`;

    try {
        const upstream = await fetch(targetUrl, {
            method,
            headers: outHeaders,
            body: rawBodyBuf,
            signal: isStream ? event.request.signal : AbortSignal.timeout(10_000)
        });

        const resHeaders = new Headers();
        for (const h of PASSTHROUGH_RES_HEADERS) {
            const val = upstream.headers.get(h);
            if (val) resHeaders.set(h, val);
        }
        if (!resHeaders.has('cache-control')) {
            resHeaders.set('cache-control', 'no-store');
        }

        return new Response(upstream.body, {
            status: upstream.status,
            headers: resHeaders
        });
    } catch {
        return json(
            {
                ok: false,
                isError: true,
                error: 'NODE_UNAVAILABLE',
                message: 'Agent gateway is temporarily unavailable.'
            },
            {
                status: 503,
                headers: NO_STORE_HEADERS
            }
        );
    }
}

export const GET: RequestHandler = (event) => proxyAgentGateway(event);
export const POST: RequestHandler = (event) => proxyAgentGateway(event);
export const DELETE: RequestHandler = (event) => proxyAgentGateway(event);
export const OPTIONS: RequestHandler = async () =>
    new Response(null, {
        status: 204,
        headers: {
            Allow: 'GET, POST, DELETE, OPTIONS',
            'Cache-Control': 'no-store'
        }
    });
