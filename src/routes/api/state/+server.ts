import { json, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';

export async function GET({ cookies }: RequestEvent) {
    const rawCookie = cookies.get('perennia_session');
    
    if (!rawCookie) {
        return json({ workers: [], silos: [], plants: [], systemMode: 'base' }, { status: 200 });
    }

    // ⚡ FIX: Decode and normalize state keys
    const sessionWallet = decodeURIComponent(rawCookie);
    const cleanWallet = sessionWallet.toLowerCase().replace('kaspa:', '').trim();
    const stateKey = `state:${cleanWallet}`;

    try {
        const rawState = await redis.get(stateKey);
        if (rawState) {
            return json(JSON.parse(rawState), { status: 200 });
        }
    } catch (e) {
        console.error("🔴 State Fetch Fault:", e);
    }

    return json({ workers: [], silos: [], plants: [], systemMode: 'base' }, { status: 200 });
}

export async function POST({ request, cookies }: RequestEvent) {
    const rawCookie = cookies.get('perennia_session');
    
    if (!rawCookie) {
        return json({ error: 'UNAUTHORIZED_STATE_WRITE' }, { status: 401 });
    }

    try {
        const payload = await request.json();
        
        // ⚡ FIX: Decode and normalize state keys
        const sessionWallet = decodeURIComponent(rawCookie);
        const cleanWallet = sessionWallet.toLowerCase().replace('kaspa:', '').trim();
        const stateKey = `state:${cleanWallet}`;

        await redis.set(stateKey, JSON.stringify(payload));
        return json({ success: true }, { status: 200 });
    } catch (e) {
        console.error("🔴 State Save Fault:", e);
        return json({ error: 'Failed to persist state' }, { status: 500 });
    }
}