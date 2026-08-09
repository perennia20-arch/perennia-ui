import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
    const ticker = url.searchParams.get('ticker');
    if (!ticker) return json({ error: 'Missing ticker parameter' }, { status: 400 });

    try {
        // Server-to-server fetch ignores CORS entirely
        const res = await fetch(`https://api.kas.fyi/v1/tokens/krc20/${ticker}/market`, {
            headers: { 'accept': 'application/json' }
        });
        
        if (res.ok) {
            const data = await res.json();
            return json(data);
        }
        
        return json({ price: 0 }, { status: res.status });
    } catch (e) {
        return json({ price: 0 }, { status: 500 });
    }
};