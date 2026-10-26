// src/routes/api/otc/settle/+server.ts
import { json, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import crypto from 'crypto';

// ============================================================================
// SOVEREIGN OTC DESK SETTLEMENT HOOK
// Executed by Corporate Admin upon receipt of traditional fiat wire transfers.
// Automatically dispenses crypto and stamps the compliance ledger.
// ============================================================================
export const POST = async ({ request }: RequestEvent) => {
    // Zero-Trust Admin Authentication (Timing-Attack Protected)
    if (!env.PERENNIA_ADMIN_KEY) {
        return json({ error: 'CRITICAL: PERENNIA_ADMIN_KEY not configured.' }, { status: 500 });
    }
    const expectedAuth = `Bearer ${env.PERENNIA_ADMIN_KEY}`;
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

        // 1. Calculate OTC Spread for Protocol Fee Weaponization
        const kasSpotStr = await redis.get(`oracle:spot:${cryptoCurrency.toUpperCase()}_USDC`);
        const spotPrice = kasSpotStr ? parseFloat(kasSpotStr) : 0;
        
        if (spotPrice <= 0) {
            return json({ error: 'Oracle unavailable. Cannot calculate OTC spread safety margins.' }, { status: 500 });
        }

        const fairValueUsd = cryptoAmount * spotPrice;
        const spreadProfitUsd = fiatAmount - fairValueUsd; // Difference between what they paid in fiat and the market value

        if (spreadProfitUsd < 0) {
            return json({ error: 'OTC Trade underwater. Slippage bounds exceeded.' }, { status: 422 });
        }

        let client;
        try {
            client = await dbPool.connect();

            // Lock the Execution into the Ledger (Removed IRS 1099-DA explicit mapping, purely DeFi tracking)
            await client.query(
                `INSERT INTO tax_ledger_events 
                (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution)
                VALUES ($1, $2, 'OTC_SETTLEMENT', $3, $4, $5)`,
                [
                    formattedWallet.toLowerCase(),
                    cryptoCurrency.toUpperCase(),
                    fiatAmount,
                    cryptoAmount,
                    spotPrice
                ]
            );

            // 2. Weaponize the OTC Spread: Route profit to the Netting Queue for LP distribution
            if (spreadProfitUsd > 0) {
                const nettingOrder = {
                    wallet: formattedWallet,
                    direction: 'OTC_SPREAD_CAPTURE',
                    amount_kas: cryptoAmount,
                    spot_price: spotPrice,
                    fee_captured_usd: spreadProfitUsd,
                    target_asset: 'USDC',
                    estimated_output: fiatAmount
                };
                await redis.rpush('perennia:sor:netting_queue', JSON.stringify(nettingOrder));
            }

            // 3. Dispatch physical UTXOs via Rust gRPC (Fire and Forget)
            const rustBackendUrl = env.RUST_BACKEND_URL || 'http://127.0.0.1:8002';
            await fetch(`${rustBackendUrl}/v1/state/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': expectedAuth },
                body: JSON.stringify({
                    wallet: 'kaspa:treasury_master',
                    action: 'DISPATCH_OTC_UTXOS',
                    payload: {
                        destination: formattedWallet,
                        amount: cryptoAmount,
                        asset: cryptoCurrency
                    }
                })
            }).catch(e => console.error("Rust dispatch failed:", e));

        } finally {
            if (client) client.release();
        }

        return json({ success: true, message: 'OTC Trade Settled & Protocol Fees Weaponized' });
    } catch (e: any) {
        console.error("OTC Settlement Fault:", e);
        return json({ error: 'Internal Server Error', details: e.message }, { status: 500 });
    }
};