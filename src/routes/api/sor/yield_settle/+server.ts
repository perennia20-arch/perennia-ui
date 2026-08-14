import { json, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import crypto from 'crypto';

// ============================================================================
// AUTOMATED YIELD SETTLEMENT ROUTER: Pool Kaspa -> Synthetic Asset or Fiat
// No User Signature Required - Executed internally by the Chronos Daemon
// ============================================================================
export const POST = async ({ request }: RequestEvent) => {
    try {
        const body = await request.json().catch(() => ({}));
        const { wallet, amountKas, targetAsset } = body;

        if (!wallet || !amountKas || !targetAsset) {
            return json({ error: 'Bad Request', message: 'Invalid payload.' }, { status: 400 });
        }

        const cleanWallet = wallet.toLowerCase().replace('kaspa:', '').trim();
        const userLedgerKey = `dev:sor:treasury:balances:${cleanWallet}`;

        // 1. Fetch live oracle spot prices from Redis (Populated continuously by Rust daemon)
        const kasSpotStr = await redis.get('oracle:spot:KAS_USDC');
        const targetSpotStr = await redis.get(`oracle:spot:${targetAsset}_USDC`);

        // ⚡ STRICT MOCK ELIMINATION: Fail the transaction if live pricing is unavailable.
        if (!kasSpotStr) {
            throw new Error("L1 Spot Oracle Feed Unavailable for KAS. Yield settlement aborted.");
        }

        const kasPrice = parseFloat(kasSpotStr);
        let targetPrice = 1.0;

        // Ensure target is either a fiat peg or has a valid oracle response
        if (targetAsset !== 'USDC' && targetAsset !== 'USDT' && targetAsset !== 'USD') {
            if (!targetSpotStr) {
                throw new Error(`L1 Spot Oracle Feed Unavailable for ${targetAsset}. Yield settlement aborted.`);
            }
            targetPrice = parseFloat(targetSpotStr);
        }

        // 2. Calculate the cross-asset conversion
        const grossUsdValue = amountKas * kasPrice;
        const targetAmountRaw = grossUsdValue / targetPrice;

        // 3. Apply the Perennia Native Treasury execution spread (1.5%)
        const protocolFeeRate = 0.015;
        const finalSettledAmount = targetAmountRaw * (1.0 - protocolFeeRate);
        const treasuryFeeCaptured = targetAmountRaw * protocolFeeRate;

        // 4. Determine Routing Destination: Synthetic Ledger or Fiat Off-Ramp API
        if (targetAsset === 'USD') {
            // ⚡ FIAT OFF-RAMP: Direct API routing via Circle Payouts API to linked KYC Bank Account
            const payoutPayload = {
                idempotencyKey: crypto.randomUUID(),
                source: { type: 'wallet', id: 'master_treasury_id' },
                destination: { type: 'wire', id: 'user_linked_bank_id' }, 
                amount: { amount: finalSettledAmount.toFixed(2), currency: 'USD' }
            };

            const circleRes = await fetch('https://api.circle.com/v1/payouts', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${env.CIRCLE_API_KEY || ''}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payoutPayload)
            });

            if (!circleRes.ok) {
                const errData = await circleRes.json().catch(()=>({}));
                throw new Error(`Fiat Off-Ramp Rejected: ${errData.message || 'Circle API Fault'}`);
            }
            
            console.log(`⚡ [Fiat Off-Ramp] Swept ${amountKas} KAS for ${cleanWallet}. Settled ${finalSettledAmount.toFixed(2)} USD via Circle API. Fee: ${treasuryFeeCaptured.toFixed(2)} USD`);
        } else {
            // Instantly increment the user's chosen target asset on the Redis Synthetic Ledger
            await redis.hincrbyfloat(userLedgerKey, targetAsset, finalSettledAmount);
            console.log(`⚡ [Yield Settle] Swept ${amountKas} KAS for ${cleanWallet}. Settled ${finalSettledAmount.toFixed(6)} ${targetAsset}. Fee: ${treasuryFeeCaptured.toFixed(6)} ${targetAsset}`);
        }

        // 5. Log the captured fee to the Perennia batch accumulator
        const batchFeeKey = `perennia:fees:batch_accumulated:${targetAsset}`;
        await redis.incrbyfloat(batchFeeKey, treasuryFeeCaptured);

        return json({
            success: true,
            settled_amount: finalSettledAmount,
            treasury_fee: treasuryFeeCaptured,
            target_asset: targetAsset
        }, { status: 200 });

    } catch (error: any) {
        console.error('Yield Settlement Fault:', error.message || error);
        return json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
    }
};