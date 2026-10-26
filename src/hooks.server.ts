import type { Handle } from '@sveltejs/kit';
import { chronos } from '$lib/server/chronos';
import { redis } from '$lib/server/redis';

const globalNode = globalThis as unknown as { __chronosStarted: boolean };
if (!globalNode.__chronosStarted) {
    console.log('⚙️ SvelteKit Enterprise Server Bootstrapping...');
    chronos.start();
    globalNode.__chronosStarted = true;
}

const TRUSTED_ORIGINS = new Set([
    'https://perennia.io',
    'https://www.perennia.io',
    'https://pool.perennia.io',
    'http://localhost:5173',
    'http://localhost:4173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173'
]);

function resolveAllowedOrigin(requestOrigin: string | null, currentOrigin: string): string {
    if (!requestOrigin) {
        return currentOrigin;
    }
    const clean = requestOrigin.trim().replace(/\/+$/, '');
    if (
        clean === currentOrigin ||
        TRUSTED_ORIGINS.has(clean) ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(clean)
    ) {
        return clean;
    }
    return 'https://perennia.io';
}

export const handle: Handle = async ({ event, resolve }) => {
    event.locals.redis = redis;

    const requestOrigin = event.request.headers.get('origin');
    const allowedOrigin = resolveAllowedOrigin(requestOrigin, event.url.origin);

    if (event.url.pathname.startsWith('/api') && event.request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': allowedOrigin,
                'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, Stripe-Signature',
                'Access-Control-Allow-Credentials': 'true',
                Vary: 'Origin'
            }
        });
    }

    const response = await resolve(event);

    if (event.url.pathname.startsWith('/api')) {
        response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
        response.headers.set('Access-Control-Allow-Credentials', 'true');
        response.headers.set('Vary', 'Origin');
    }

    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return response;
};