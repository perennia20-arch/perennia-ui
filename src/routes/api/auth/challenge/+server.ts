import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { redis } from '$lib/server/redis';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { address } = await request.json();
        
        if (!address) {
            return json({ error: 'Address required' }, { status: 400 });
        }

        const cleanAddress = address.toLowerCase();

        // Generate a secure, randomized cryptographic nonce
        const nonce = crypto.randomUUID();
        const timestamp = Date.now();
        const message = `Perennia Sovereign Matrix Authorization\nAddress: ${cleanAddress}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;

        // Store the challenge in Redis with a strict 2-minute TTL
        await redis.set(`auth_challenge:${cleanAddress}`, message, 'EX', 120);

        return json({ message });
    } catch (error) {
        console.error("Challenge Generation Fault:", error);
        return json({ error: 'Failed to generate cryptographic challenge' }, { status: 500 });
    }
};