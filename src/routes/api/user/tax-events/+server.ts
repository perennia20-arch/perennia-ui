import { json, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';

export const GET = async ({ cookies }: RequestEvent) => {
    const rawCookie = cookies.get('perennia_session');
    
    if (!rawCookie) {
        return json([]);
    }

    const sessionWallet = decodeURIComponent(rawCookie);
    const cleanWallet = sessionWallet.toLowerCase().replace('kaspa:', '').trim();

    let client;
    try {
        client = await dbPool.connect();
        
        // Query the newest 200 execution events locked securely to this wallet
        const res = await client.query(
            `SELECT * FROM tax_ledger_events 
             WHERE wallet_address = $1 
             ORDER BY recorded_at DESC 
             LIMIT 200`,
            [cleanWallet]
        );

        // Map the raw SQL rows natively into the exact format expected by TaxFortressView
        const events = res.rows.map(row => {
            let color = '#18C6A5'; 
            if (row.asset_ticker === 'BTC') color = '#F7931A';
            else if (row.asset_ticker === 'ETH') color = '#627EEA';
            else if (row.asset_ticker === 'SOL') color = '#14F195';
            else if (row.asset_ticker === 'USDC' || row.asset_ticker === 'USDT') color = '#3B82F6';
            
            // Format Event Type for the UI
            let displayType = row.event_type;
            if (row.event_type === 'YIELD') displayType = 'Stream';
            else if (row.event_type === 'FIAT_ONRAMP') displayType = 'Fiat On-Ramp';
            
            return {
                timestamp: new Date(row.recorded_at).toLocaleString(),
                type: displayType,
                asset: {
                    ticker: row.asset_ticker,
                    color: color
                },
                amount: row.amount_tokens,
                usdValueAtTime: row.gross_proceeds_usd,
                txHash: row.event_id.split('-')[0].toUpperCase() // Safely truncating the UUID to mimic a tx hash
            };
        });

        return json(events);
    } catch (error) {
        console.error('Tax Events API Fault:', error);
        return json([]);
    } finally {
        if (client) client.release();
    }
};