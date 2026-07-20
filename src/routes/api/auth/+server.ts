import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
    try {
        const { address, provider } = await request.json();

        if (!address) {
            return json({ error: 'Address required' }, { status: 400 });
        }

        // In production, you would mathematically verify a signed message here.
        // For now, we issue the secure session cookie tied to the wallet address.
        cookies.set('perennia_session', address, {
            path: '/',
            httpOnly: true, // Prevents XSS attacks
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24 * 7 // 1 Week
        });

        return json({ status: 'success', address });
    } catch (error) {
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};