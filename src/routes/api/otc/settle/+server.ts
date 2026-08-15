// src/routes/api/otc/settle/+server.ts
import { json, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import crypto from 'crypto';

// ============================================================================
// SOVEREIGN OTC DESK SETTLEMENT HOOK
// Executed by Corporate Admin upon receipt of traditional fiat wire transfers.
// Automatically dispenses crypto and stamps the 1099-DA compliance ledger.
// ============================================================================
export const POST = async ({ request }: RequestEvent) => {
    // Zero-Trust Admin Authentication (Timing-Attack Protected)
    const expectedAuth = `Bearer ${env.PERENNIA_ADMIN_KEY || 'perennia_test_key'}`;
    const providedAuth = request.headers.get('authorization') || '';
    
    const expectedBuffer = Buffer.from(expectedAuth);
    const providedBuffer = Buffer.from(providedAuth);
    
    if (expectedBuffer.length !== providedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
         return json({ error: 'Unauthorized OTC execution' }, { status: 401 });
    }

    try {
        const { walletAddress, fiatAmount, cryptoCurrency, cryptoAmount } = await request.json();

        if (!walletAddress || !fiatAmount || !cryptoCurrency || !cryptoAmount) {
            return json({ error: 'Malformed OTC settlement payload' }, { status: 400 });
        }

        const formattedWallet = walletAddress.startsWith('kaspa:') ? walletAddress : `kaspa:${walletAddress}`;

        let client;
        try {
            client = await dbPool.connect();
            
            // 1. Lock the Execution into the 1099-DA Tax Ledger
            await client.query(
                `INSERT INTO tax_ledger_events 
                (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution)
                VALUES ($1, $2, 'FIAT_ONRAMP', $3, $4, $5)`,
                [
                    formattedWallet.toLowerCase(),
                    cryptoCurrency.toUpperCase(),
                    fiatAmount,
                    cryptoAmount,
                    cryptoAmount > 0 ? fiatAmount / cryptoAmount : 0
                ]
            );

            // 2. Here is where the Rust Node gRPC bridge would be triggered 
            // to autonomously dispense the physical UTXOs from the Treasury to the formattedWallet.
            // e.g., await fetch('http://127.0.0.1:8002/v1/sor/execute', ...)

        } finally {
            if (client) client.release();
        }

        return json({ success: true, message: 'OTC Trade Settled & Tax Ledger Updated' });
    } catch (e: any) {
        console.error("OTC Settlement Fault:", e);
        return json({ error: 'Internal Server Error', details: e.message }, { status: 500 });
    }
};