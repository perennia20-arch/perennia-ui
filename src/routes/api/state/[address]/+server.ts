import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { redis } from '$lib/server/redis'; 

// ⚡ FIX: Removed 'locals'
export const GET: RequestHandler = async ({ params }) => {
    const { address } = params;
    
    try {
        const data = await redis.get(`user_state:${address}`);
        if (data) {
            return json(JSON.parse(data));
        }
        return json({ workers: [], silos: [], plants: [], systemMode: 'base' });
    } catch (e) {
        return json({ error: 'Failed to load state' }, { status: 500 });
    }
};

// ⚡ FIX: Removed 'locals'
export const POST: RequestHandler = async ({ params, request }) => {
    const { address } = params;
    
    try {
        const body = await request.json();
        await redis.set(`user_state:${address}`, JSON.stringify(body));
        return json({ success: true });
    } catch (e) {
        return json({ error: 'Failed to save state' }, { status: 500 });
    }
};