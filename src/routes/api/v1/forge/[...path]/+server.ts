import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

function resolveBackendBase(): string {
    const raw =
        env.RUST_BACKEND_URL ||
        (env.UBUNTU_NODE_IP ? `http://${env.UBUNTU_NODE_IP}:8002` : 'http://127.0.0.1:8002');
    return raw.trim().replace(/\/+$/, '');
}

async function proxyForge(event: RequestEvent): Promise<Response> {
    const subPath = (event.params.path ?? '').replace(/^\/+/, '').replace(/\/+$/, '');
    if (subPath !== 'challenge' && subPath !== 'overview' && subPath !== 'action') {
        return new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    if (event.request.method.toUpperCase() !== 'POST') {
        return new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }

    const outHeaders = new Headers();
    for (const h of ['content-type', 'x-forge-session', 'x-forge-pubkey', 'x-forge-challenge', 'x-forge-sig']) {
        const val = event.request.headers.get(h);
        if (val) outHeaders.set(h, val);
    }
    const cookieSession = event.cookies.get('perennia_forge_session');
    if (cookieSession && !outHeaders.has('x-forge-session')) {
        outHeaders.set('x-forge-session', cookieSession);
    }

    const rawBody = await event.request.arrayBuffer();
    try {
        const upstream = await fetch(`${resolveBackendBase()}/v1/forge/${subPath}`, {
            method: 'POST',
            headers: outHeaders,
            body: rawBody,
            signal: AbortSignal.timeout(10_000)
        });
        if (upstream.status === 404) {
            return new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
        }
        const text = await upstream.text();
        return new Response(text, {
            status: upstream.status,
            headers: {
                'Content-Type': upstream.headers.get('content-type') || 'application/json',
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff'
            }
        });
    } catch {
        return new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
}

export const GET: RequestHandler = () => new Response('Not Found', { status: 404 });
export const POST: RequestHandler = (event) => proxyForge(event);
