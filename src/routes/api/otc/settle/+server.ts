// src/routes/api/otc/settle/+server.ts
import { json, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import { executeOrQueueL1Dispatch } from '$lib/server/l1Dispatcher';
import { LIVE_PRICING_UNAVAILABLE_MESSAGE } from '$lib/crypto/atomicMath';
import crypto from 'crypto';

// ============================================================================
// SOVEREIGN OTC DESK SETTLEMENT HOOK (Non-Custodial L1 Only)
// Executed by Corporate Admin upon receipt of traditional fiat wire transfers.
// ============================================================================
export const POST = async ({ request }: RequestEvent) => {
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
        const upperAsset = String(cryptoCurrency).trim().toUpperCase();

        const kasSpotStr = await redis.get(`oracle:spot:${upperAsset}_USDC`);
        const spotPrice =
            upperAsset === 'USDC' || upperAsset === 'USDT'
                ? 1.0
                : kasSpotStr
                  ? parseFloat(kasSpotStr) || 0
                  : 0;

        if (spotPrice <= 0) {
            return json(
                {
                    error: 'SERVICE_UNAVAILABLE',
                    livePricingUnavailable: true,
                    uiMessage: LIVE_PRICING_UNAVAILABLE_MESSAGE
                },
                { status: 503 }
            );
        }

        const fairValueUsd = cryptoAmount * spotPrice;
        const spreadProfitUsd = fiatAmount - fairValueUsd;

        if (spreadProfitUsd < 0) {
            return json({ error: 'OTC Trade underwater. Slippage bounds exceeded.' }, { status: 422 });
        }

        let l1Dispatch: any = null;
        let client;
        try {
            client = await dbPool.connect();

            await client.query(
                `INSERT INTO tax_ledger_events 
                (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution)
                VALUES ($1, $2, 'OTC_SETTLEMENT', $3, $4, $5)`,
                [formattedWallet.toLowerCase(), upperAsset, fiatAmount, cryptoAmount, spotPrice]
            );

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

            l1Dispatch = await executeOrQueueL1Dispatch({
                wallet: formattedWallet,
                destinationAddress: formattedWallet,
                asset: upperAsset,
                amount: Number(cryptoAmount),
                sourceType: 'otc_settlement_l1',
                spotPrice
            }).catch((e) => ({ status: 'QUEUED_FOR_L1_DISPATCH', error: String(e?.message || e) }));
        } finally {
            if (client) client.release();
        }

        return json({
            success: true,
            l1Dispatch,
            message: 'OTC Trade Settled & Queued for Non-Custodial L1 Delivery'
        });
    } catch (e: any) {
        console.error('OTC Settlement Fault:', e);
        return json({ error: 'Internal Server Error', details: e.message }, { status: 500 });
    }
};
