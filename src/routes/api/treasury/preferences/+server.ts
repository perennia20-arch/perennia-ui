import { json, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';

export const GET = async ({ url, cookies, setHeaders }: RequestEvent) => {
    // ⚡ ZERO-TRUST: Require and decode the encrypted HTTP-only session cookie
    const rawCookie = cookies.get('perennia_session');
    if (!rawCookie) {
        return json({ error: 'UNAUTHORIZED_MATRIX_ACCESS' }, { status: 401 });
    }

    const sessionWallet = decodeURIComponent(rawCookie).toLowerCase().replace('kaspa:', '').trim();
    const requestedWallet = url.searchParams.get('wallet')?.toLowerCase().replace('kaspa:', '').trim();

    // Prevent cross-wallet snooping
    if (sessionWallet !== requestedWallet) {
        return json({ error: 'FORBIDDEN_ADDRESS_QUERY' }, { status: 403 });
    }

    setHeaders({
        'Cache-Control': 'no-store, no-cache, must-revalidate'
    });

    try {
        const raw = await redis.get(`dev:treasury:preferences:${sessionWallet}`);
        if (raw) {
            return json({ preferences: JSON.parse(raw) });
        }
        return json({ preferences: null });
    } catch (e: any) {
        console.warn('Treasury preferences Redis read fault:', e.message);
        return json({ preferences: null });
    }
};

export const POST = async ({ request, cookies }: RequestEvent) => {
    // ⚡ ZERO-TRUST: Require the session cookie for writes
    const rawCookie = cookies.get('perennia_session');
    if (!rawCookie) {
        return json({ error: 'UNAUTHORIZED_STATE_MUTATION' }, { status: 401 });
    }

    const sessionWallet = decodeURIComponent(rawCookie).toLowerCase().replace('kaspa:', '').trim();

    try {
        const body = await request.json().catch(() => ({}));
        const { walletAddress, preferences } = body;

        if (!walletAddress || !preferences) {
            return json({ error: 'Missing walletAddress or preferences' }, { status: 400 });
        }

        const requestWallet = walletAddress.toLowerCase().replace('kaspa:', '').trim();

        // Prevent cross-wallet state corruption
        if (sessionWallet !== requestWallet) {
            return json({ error: 'FORBIDDEN_STATE_MUTATION' }, { status: 403 });
        }

        await redis.set(`dev:treasury:preferences:${sessionWallet}`, JSON.stringify(preferences));

        return json({ success: true });
    } catch (e: any) {
        console.error('Treasury preferences Redis write fault:', e.message);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};