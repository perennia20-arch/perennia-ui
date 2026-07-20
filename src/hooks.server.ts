import Redis from 'ioredis';
import type { Handle } from '@sveltejs/kit';
import { chronos } from '$lib/server/chronos'; 

const redis = new Redis('redis://192.168.0.12:6379', { maxRetriesPerRequest: 3 });

redis.on('error', (err) => {
    console.warn('🔴 Redis Connection Pending (Linux Node Offline):', err.message);
});

const globalNode = globalThis as unknown as { __chronosStarted: boolean };
if (!globalNode.__chronosStarted) {
    console.log("⚙️ SvelteKit Enterprise Server Bootstrapping...");
    chronos.start();
    globalNode.__chronosStarted = true;
}

export const handle: Handle = async ({ event, resolve }) => {
    event.locals.redis = redis;

    if (event.url.pathname.startsWith('/api') && event.request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            }
        });
    }

    const response = await resolve(event);
    
    if (event.url.pathname.startsWith('/api')) {
        response.headers.set('Access-Control-Allow-Origin', '*');
    }

    return response;
};