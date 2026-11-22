import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const PASSTHROUGH_REQ_HEADERS = [
    'authorization',
    'x-agent-key',
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

async function proxyAgentGateway(event: RequestEvent): Promise<Response> {
    const baseUrl = (env.RUST_BACKEND_URL || 'http://127.0.0.1:8002')
        .trim()
        .replace(/\/+$/, '');
    const subPath = (event.params.path ?? '').replace(/^\/+/, '');
    const targetUrl = `${baseUrl}/api/v1/agent/${subPath}${event.url.search}`;

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

    const method = event.request.method.toUpperCase();
    const isStream = subPath === 'stream';
    const body =
        method === 'GET' || method === 'HEAD'
            ? undefined
            : await event.request.arrayBuffer();

    try {
        const upstream = await fetch(targetUrl, {
            method,
            headers: outHeaders,
            body,
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
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Upstream connection refused';
        return json(
            {
                ok: false,
                isError: true,
                error: 'AGENT_GATEWAY_UNREACHABLE',
                message: `Rust Agent Gateway unreachable: ${msg}`
            },
            {
                status: 503,
                headers: { 'Cache-Control': 'no-store' }
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