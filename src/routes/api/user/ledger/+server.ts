import { json, type RequestEvent } from '@sveltejs/kit';
import { redis } from '../../../../lib/server/redis';

export const GET = async ({ url, setHeaders }: RequestEvent) => {
    const wallet = url.searchParams.get('wallet');

    if (!wallet) {
        return json({ error: 'Bad Request', message: 'Missing wallet parameter.' }, { status: 400 });
    }

    setHeaders({
        'Cache-Control': 'no-store, no-cache, must-revalidate'
    });

    const defaultBalances: Record<string, number> = {
        KAS: 0.00,
        BTC: 0.00,
        ETH: 0.00,
        SOL: 0.00
    };

    try {
        // Strip kaspa: prefix to match yield_settle keying structure
        const cleanWallet = wallet.toLowerCase().replace('kaspa:', '').trim();
        const key = `dev:sor:treasury:balances:${cleanWallet}`;
        const rawData = await redis.hgetall(key);

        if (!rawData || Object.keys(rawData).length === 0) {
            return json(defaultBalances);
        }

        const balances = { ...defaultBalances };

        for (const [asset, value] of Object.entries(rawData)) {
            const parsed = parseFloat(value);
            if (!isNaN(parsed)) {
                balances[asset] = parsed;
            }
        }

        return json(balances);
    } catch (error) {
        console.error('Ledger API Redis Socket Error:', error);
        return json(defaultBalances, { status: 500 });
    }
};