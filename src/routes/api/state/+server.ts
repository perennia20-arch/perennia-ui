import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dbPool } from '$lib/server/db';

export const GET: RequestHandler = async ({ cookies }) => {
    // 1. Absolute Zero-Trust: Extract Identity from Cryptographic Cookie
    const address = cookies.get('perennia_session');
    
    if (!address) {
        return json({ error: 'Unauthorized matrix access' }, { status: 401 });
    }

    let client;
    try {
        client = await dbPool.connect();
        const res = await client.query(
            `SELECT layout_state FROM user_command_centers WHERE wallet_address = $1`,
            [address.toLowerCase()]
        );

        if (res.rows.length > 0 && res.rows[0].layout_state) {
            return json(res.rows[0].layout_state);
        }
        
        // Return default base state if no layout exists yet
        return json({ workers: [], silos: [], plants: [], systemMode: 'base' });
    } catch (e) {
        console.error("State Hydration Fault:", e);
        return json({ error: 'Failed to load command center state' }, { status: 500 });
    } finally {
        if (client) client.release();
    }
};

export const POST: RequestHandler = async ({ request, cookies }) => {
    // 1. Absolute Zero-Trust: Extract Identity from Cryptographic Cookie
    const address = cookies.get('perennia_session');
    
    if (!address) {
        return json({ error: 'Unauthorized matrix write attempt' }, { status: 401 });
    }

    let client;
    try {
        const body = await request.json();
        
        // 🛡️ ZERO-TRUST PROTOCOL: Prevent frontend hashRate spoofing for Capital workers.
        if (body.workers && Array.isArray(body.workers)) {
            body.workers = body.workers.map((w: any) => {
                if (w.type === 'capital') {
                    const claimedTokens = parseFloat(w.capitalTokens) || 0;
                    const expectedHashRate = (claimedTokens / 1000) * 0.05;
                    // Prevent arbitrarily high spoofed hashRates. 
                    // Let Chronos daemon strictly slash capitalTokens down to actual KRC-20 holdings on next tick.
                    if ((parseFloat(w.hashRate) || 0) > expectedHashRate) {
                        w.hashRate = expectedHashRate;
                    }
                }
                return w;
            });
        }
        
        client = await dbPool.connect();
        
        // 2. High-Performance Upsert to JSONB Column
        await client.query(
            `INSERT INTO user_command_centers (wallet_address, layout_state, last_updated)
             VALUES ($1, $2, CURRENT_TIMESTAMP)
             ON CONFLICT (wallet_address) 
             DO UPDATE SET 
                layout_state = EXCLUDED.layout_state,
                last_updated = CURRENT_TIMESTAMP`,
            [address.toLowerCase(), body]
        );

        return json({ success: true });
    } catch (e) {
        console.error("State Persistence Fault:", e);
        return json({ error: 'Failed to save command center state' }, { status: 500 });
    } finally {
        if (client) client.release();
    }
};