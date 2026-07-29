import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
    const address = url.searchParams.get('address');

    if (!address) {
        return json({ error: 'Address parameter missing' }, { status: 400 });
    }

    try {
        // Query the live Kaspa REST API for the balance
        const res = await fetch(`https://api.kaspa.org/addresses/${address}/balance`, {
            signal: AbortSignal.timeout(5000)
        });

        if (!res.ok) {
            throw new Error(`Kaspa API returned ${res.status}`);
        }

        const data = await res.json();
        
        // Return the converted Kaspa (Sompi / 100,000,000)
        return json({ balance: (data.balance || 0) / 100000000 });
    } catch (e: any) {
        console.error("Balance Fetch Error:", e.message);
        // Fail safely to 0 rather than crashing the wallet loop
        return json({ balance: 0 });
    }
};