// src/routes/api/stratum/bind/+server.ts

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { redis } from '$lib/server/redis';

// ============================================================================
// STRATUM NODE BINDING API
// ============================================================================
export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const { kaspaAddress } = body;

        // 1. Strict Cryptographic Formatting Validation
        if (!kaspaAddress || typeof kaspaAddress !== 'string') {
            return json({ error: 'INVALID PAYLOAD: MISSING ADDRESS' }, { status: 400 });
        }

        const cleanAddress = kaspaAddress.trim().toLowerCase();

        if (!cleanAddress.startsWith('kaspa:')) {
            return json({ error: 'INVALID FORMAT: MISSING "kaspa:" PREFIX' }, { status: 400 });
        }

        if (cleanAddress.length < 60) {
            return json({ error: 'INVALID FORMAT: ADDRESS LENGTH INCORRECT' }, { status: 400 });
        }

        // 2. Interface with the local shared Redis cache (Dynamic Runtime Injection)
        try {
            await redis.set('perennia:stratum:mining_address', cleanAddress);
        } catch (redisErr) {
            console.warn('Redis unreachable for stratum bind', redisErr);
            return json({ error: 'STRATUM REDIS ERROR: CANNOT BIND MINING ADDRESS' }, { status: 500 });
        }

        return json({ success: true, message: 'STRATUM SUCCESSFULLY BOUND' }, { status: 200 });

    } catch (err: any) {
        console.error("Stratum Binding API Error:", err);
        return json({ error: 'CRITICAL BACKEND FAULT. STRATUM OFFLINE.' }, { status: 500 });
    }
};