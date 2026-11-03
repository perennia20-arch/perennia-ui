import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import crypto from 'node:crypto';
import {
    isWalletMasterAdmin,
    normalizeKaspaBase32Strict,
    normalizeKaspaAddressStrict
} from '$lib/server/kms';
import {
    executeOrQueueL1Dispatch,
    computeReservoirHmac,
    verifyWalletLedgerInvariantOrQuarantine
} from '$lib/server/l1Dispatcher';

const LUA_ATOMIC_DEBIT_SWAP_LEDGER = `
local asset = ARGV[1]
local req = tonumber(ARGV[2])
local primary = tonumber(redis.call('HGET', KEYS[1], asset) or '0')
if primary >= req then
    redis.call('HINCRBYFLOAT', KEYS[1], asset, -req)
    return {1, tostring(0)}
end
if asset == 'KAS' then
    local unassigned = tonumber(redis.call('HGET', KEYS[1], 'Unassigned KAS') or '0')
    if (primary + unassigned) >= req then
        local from_unassigned = req - primary
        if primary > 0 then
            redis.call('HSET', KEYS[1], 'KAS', '0')
        end
        redis.call('HINCRBYFLOAT', KEYS[1], 'Unassigned KAS', -from_unassigned)
        return {1, tostring(from_unassigned)}
    end
end
return {0, tostring(0)}
`;

async function resolveStrictSpotPriceUsd(rawTicker: string): Promise<number> {
    const ticker = String(rawTicker || '').trim().toUpperCase();
    if (!ticker) return 0;
    if (ticker === 'USDC' || ticker === 'USDT' || ticker === 'USD') return 1.0;

    const cachedStr = await redis
        .get(`oracle:spot:${ticker}_USDC`)
        .catch(() => null);
    if (cachedStr) {
        const parsed = parseFloat(cachedStr);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }

    try {
        const dbRes = await dbPool.query(
            `SELECT price_usd
             FROM rwa_oracle_feeds
             WHERE ticker = $1
               AND price_usd > 0
               AND updated_at >= CURRENT_TIMESTAMP - INTERVAL '15 minutes'
             ORDER BY updated_at DESC
             LIMIT 1`,
            [ticker]
        );
        if (dbRes.rows.length > 0) {
            const dbPrice = Number(dbRes.rows[0].price_usd || 0);
            if (Number.isFinite(dbPrice) && dbPrice > 0) {
                await redis
                    .set(`oracle:spot:${ticker}_USDC`, String(dbPrice), 'EX', 30)
                    .catch(() => {});
                return dbPrice;
            }
        }
    } catch {
        // Continue to live exchange fallback
    }

    if (ticker === 'SILO') {
        const kasSpot = await resolveStrictSpotPriceUsd('KAS');
        if (kasSpot > 0) {
            return Number((kasSpot / 23.809524).toFixed(6));
        }
        return 0;
    }

    try {
        const mexcRes = await fetch(
            `https://api.mexc.com/api/v3/ticker/price?symbol=${encodeURIComponent(ticker)}USDT`,
            { signal: AbortSignal.timeout(3000) }
        );
        if (mexcRes.ok) {
            const mexcData = await mexcRes.json();
            const p = parseFloat(String(mexcData?.price || '0'));
            if (Number.isFinite(p) && p > 0) {
                await redis
                    .set(`oracle:spot:${ticker}_USDC`, String(p), 'EX', 30)
                    .catch(() => {});
                return p;
            }
        }
    } catch {
        // Fail closed
    }

    return 0;
}

async function resolveFeePctForWallet(
    cleanWallet: string,
    prefixedWallet: string,
    executionMode: string
): Promise<number> {
    let stakedSilo = 0;
    try {
        const res = await dbPool.query(
            `SELECT COALESCE(SUM(amount_staked), 0.0) AS total_silo
             FROM silo_staking_positions
             WHERE (wallet_address = $1 OR wallet_address = $2)
               AND status = 'ACTIVE'`,
            [prefixedWallet, cleanWallet]
        );
        stakedSilo = Number(res.rows[0]?.total_silo || 0);
    } catch {
        stakedSilo = 0;
    }

    const isBatch =
        String(executionMode || 'BATCH_2200_UTC').toUpperCase() ===
        'BATCH_2200_UTC';

    if (isBatch) {
        if (stakedSilo >= 25_000) return 0.15;
        if (stakedSilo >= 5_000) return 0.25;
        return 0.35;
    }

    if (stakedSilo >= 25_000) return 0.25;
    if (stakedSilo >= 5_000) return 0.5;
    return 0.75;
}

async function consumeHifoTaxLotsAndRecordDisposal(params: {
    cleanWallet: string;
    payAsset: string;
    payAmount: number;
    grossProceedsUsd: number;
    paySpotUsd: number;
    txHash: string;
}): Promise<{ costBasisUsd: number; realizedGainLossUsd: number; holdingPeriod: string }> {
    let remainingToMatch = params.payAmount;
    let accumulatedCostBasisUsd = 0;
    let holdingPeriod = 'SHORT_TERM';

    try {
        const lotsRes = await dbPool.query(
            `SELECT lot_id, remaining_tokens, fmv_usd_per_token, acquired_at
             FROM hifo_tax_lots
             WHERE wallet_address = $1
               AND asset_ticker = $2
               AND status = 'OPEN'
               AND remaining_tokens > 0
             ORDER BY fmv_usd_per_token DESC, acquired_at ASC`,
            [params.cleanWallet, params.payAsset]
        );

        for (const lot of lotsRes.rows) {
            if (remainingToMatch <= 1e-8) break;
            const lotRem = Number(lot.remaining_tokens || 0);
            const lotFmv = Number(lot.fmv_usd_per_token || params.paySpotUsd);
            const matchedTokens = Math.min(remainingToMatch, lotRem);
            const nextRem = Math.max(0, lotRem - matchedTokens);
            const nextStatus = nextRem <= 1e-8 ? 'DEPLETED' : 'OPEN';

            accumulatedCostBasisUsd += matchedTokens * lotFmv;
            remainingToMatch -= matchedTokens;

            if (lot.acquired_at) {
                const ageDays =
                    (Date.now() - new Date(lot.acquired_at).getTime()) /
                    (1000 * 60 * 60 * 24);
                if (ageDays >= 365) {
                    holdingPeriod = 'LONG_TERM';
                }
            }

            await dbPool
                .query(
                    `UPDATE hifo_tax_lots
                     SET remaining_tokens = $2,
                         remaining_sompi = $3,
                         status = $4
                     WHERE lot_id = $1`,
                    [
                        lot.lot_id,
                        nextRem,
                        Math.round(nextRem * 1e8),
                        nextStatus
                    ]
                )
                .catch(() => {});
        }
    } catch {
        // Fallback if hifo_tax_lots table is not yet populated
    }

    if (remainingToMatch > 1e-8) {
        accumulatedCostBasisUsd += remainingToMatch * params.paySpotUsd;
    }

    const costBasisUsd = Number(accumulatedCostBasisUsd.toFixed(2));
    const realizedGainLossUsd = Number(
        (params.grossProceedsUsd - costBasisUsd).toFixed(2)
    );

    await dbPool
        .query(
            `INSERT INTO tax_ledger_events
             (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash, cost_basis_usd, realized_gain_loss_usd, holding_period)
             VALUES ($1, $2, 'DEX_SWAP', $3, $4, $5, $6, $7, $8, $9)`,
            [
                params.cleanWallet,
                params.payAsset,
                Number(params.grossProceedsUsd.toFixed(2)),
                params.payAmount,
                params.paySpotUsd,
                params.txHash,
                costBasisUsd,
                realizedGainLossUsd,
                holdingPeriod
            ]
        )
        .catch(() => {});

    return { costBasisUsd, realizedGainLossUsd, holdingPeriod };
}

export const POST: RequestHandler = async ({ request, cookies }: RequestEvent) => {
    const sessionId = cookies.get('perennia_session');
    if (!sessionId) {
        return json(
            { error: 'UNAUTHORIZED: Active Sovereign session required.' },
            { status: 401 }
        );
    }

    const sessionWallet = await redis.get(`session:${sessionId}`);
    if (!sessionWallet) {
        return json({ error: 'SESSION_EXPIRED' }, { status: 401 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const requestedWallet = String(body.wallet || sessionWallet).trim();
        const cleanSession = normalizeKaspaBase32Strict(sessionWallet);
        const cleanRequested = normalizeKaspaBase32Strict(requestedWallet);

        const isDirector = isWalletMasterAdmin(sessionWallet);
        if (cleanRequested !== cleanSession && !isDirector) {
            return json(
                { error: 'FORBIDDEN: Cannot execute SOR swap for another wallet.' },
                { status: 403 }
            );
        }

        const prefixedWallet = normalizeKaspaAddressStrict(cleanRequested);
        const payAsset = String(body.payAsset || body.fromAsset || 'KAS')
            .trim()
            .toUpperCase();
        const receiveAsset = String(
            body.receiveAsset || body.toAsset || 'USDC'
        )
            .trim()
            .toUpperCase();
        const payAmount = Number(body.payAmount ?? body.amount ?? 0);
        const executionMode = String(
            body.executionMode || 'BATCH_2200_UTC'
        )
            .trim()
            .toUpperCase();
        const destinationL1Address = String(
            body.destinationL1Address || ''
        ).trim();

        if (!payAsset || !receiveAsset || payAsset === receiveAsset) {
            return json(
                { error: 'INVALID_SWAP_PAIR: Pay and Receive assets must differ.' },
                { status: 400 }
            );
        }

        if (!Number.isFinite(payAmount) || payAmount <= 0) {
            return json(
                { error: 'INVALID_SWAP_AMOUNT: Swap amount must be positive.' },
                { status: 400 }
            );
        }

        await verifyWalletLedgerInvariantOrQuarantine(prefixedWallet, payAsset);

        const [paySpotUsd, receiveSpotUsd] = await Promise.all([
            resolveStrictSpotPriceUsd(payAsset),
            resolveStrictSpotPriceUsd(receiveAsset)
        ]);

        if (paySpotUsd <= 0 || receiveSpotUsd <= 0) {
            const offlineTicker = paySpotUsd <= 0 ? payAsset : receiveAsset;
            return json(
                {
                    error: `ORACLE_HALT: Live oracle spot price for ${offlineTicker} is offline. Failing closed (503).`,
                    circuitBreakerTripped: true
                },
                { status: 503 }
            );
        }

        const rustBackendUrl =
            env.RUST_BACKEND_URL ||
            `http://${env.UBUNTU_NODE_IP || '127.0.0.1'}:8002`;
        const internalToken =
            env.INTERNAL_ADMIN_TOKEN || env.PERENNIA_ADMIN_KEY || '';

        try {
            const rustRes = await fetch(`${rustBackendUrl}/v1/sor/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${internalToken}`
                },
                body: JSON.stringify({
                    wallet: prefixedWallet,
                    pay_asset: payAsset,
                    receive_asset: receiveAsset,
                    pay_amount: payAmount,
                    execution_mode: executionMode,
                    destination_l1_address: destinationL1Address || null
                }),
                signal: AbortSignal.timeout(5500)
            });

            if (rustRes.ok) {
                const rustData = await rustRes.json();
                if (rustData && !rustData.error) {
                    return json(rustData, { status: 200 });
                }
            }
        } catch {
            // Fall through to atomic TypeScript + PostgreSQL + Redis execution
        }

        const feePct = await resolveFeePctForWallet(
            cleanRequested,
            prefixedWallet,
            executionMode
        );
        const grossUsd = payAmount * paySpotUsd;
        const feeUsd = Number(((grossUsd * feePct) / 100).toFixed(4));
        const feeInPayAsset = paySpotUsd > 0 ? feeUsd / paySpotUsd : 0;
        const netUsd = Math.max(0, grossUsd - feeUsd);
        const receivedAmount = Number((netUsd / receiveSpotUsd).toFixed(8));

        const userLedgerKey = `dev:sor:treasury:balances:${cleanRequested}`;
        const debitRes = (await redis.eval(
            LUA_ATOMIC_DEBIT_SWAP_LEDGER,
            1,
            userLedgerKey,
            payAsset,
            payAmount.toString()
        )) as [number, string];

        if (!debitRes || Number(debitRes[0]) !== 1) {
            return json(
                {
                    error: `INSUFFICIENT_BATCH_QUEUE_BALANCE: Insufficient ${payAsset} in Batch Settlement Queue to swap ${payAmount.toFixed(4)} ${payAsset}.`
                },
                { status: 400 }
            );
        }

        const fromUnassigned = parseFloat(debitRes[1] || '0') || 0;
        if (fromUnassigned > 1e-9 && payAsset === 'KAS') {
            const resRow = await dbPool.query(
                `SELECT streaming_balance_kas, total_yield_kas, COALESCE(lp_tokens, '{}'::jsonb) AS lp_tokens
                 FROM yield_reservoirs
                 WHERE wallet_address = $1 OR wallet_address = $2
                 LIMIT 1`,
                [prefixedWallet, cleanRequested]
            );
            if (resRow.rows.length > 0) {
                const r = resRow.rows[0];
                const nextStream = Math.max(
                    0,
                    Number(r.streaming_balance_kas || 0) - fromUnassigned
                );
                const totalY = Number(r.total_yield_kas || 0);
                const newHmac = computeReservoirHmac(
                    prefixedWallet,
                    nextStream,
                    totalY,
                    r.lp_tokens
                );
                await dbPool.query(
                    `UPDATE yield_reservoirs
                     SET streaming_balance_kas = $3,
                         row_hmac_sig = $4,
                         last_updated = CURRENT_TIMESTAMP
                     WHERE wallet_address = $1 OR wallet_address = $2`,
                    [prefixedWallet, cleanRequested, nextStream, newHmac]
                );
            }
        }

        let orderId = `PER-SOR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        let explorerUrl: string | undefined = undefined;

        if (executionMode === 'INSTANT_SOR' && destinationL1Address) {
            const dispatchRes = await executeOrQueueL1Dispatch({
                wallet: prefixedWallet,
                destinationAddress: destinationL1Address,
                asset: receiveAsset,
                amount: receivedAmount,
                sourceType: 'sor_instant_swap',
                spotPrice: receiveSpotUsd
            });
            orderId = dispatchRes.txHash;
            explorerUrl = dispatchRes.explorerUrl;
        } else {
            await redis.hincrbyfloat(userLedgerKey, receiveAsset, receivedAmount);
        }

        if (feeInPayAsset > 0) {
            await redis
                .incrbyfloat(
                    `perennia:fees:batch_accumulated:${payAsset}`,
                    feeInPayAsset
                )
                .catch(() => {});
        }
        if (feeUsd > 0) {
            await redis
                .incrbyfloat('perennia:treasury:netting_profit_usd', feeUsd)
                .catch(() => {});
        }

        if (executionMode === 'BATCH_2200_UTC') {
            await redis
                .rpush(
                    'perennia:sor:netting_queue',
                    JSON.stringify({
                        order_id: orderId,
                        wallet: prefixedWallet,
                        direction:
                            payAsset === 'KAS'
                                ? `SELL_KAS_FOR_${receiveAsset}`
                                : `SWAP_${payAsset}_TO_${receiveAsset}`,
                        pay_asset: payAsset,
                        target_asset: receiveAsset,
                        amount_kas:
                            payAsset === 'KAS'
                                ? payAmount
                                : grossUsd /
                                  (await resolveStrictSpotPriceUsd('KAS').catch(
                                      () => paySpotUsd
                                  )),
                        spot_price: paySpotUsd,
                        target_spot_price: receiveSpotUsd,
                        estimated_output: receivedAmount,
                        fee_captured_usd: feeUsd,
                        created_at: new Date().toISOString()
                    })
                )
                .catch(() => {});
        }

        const taxSummary = await consumeHifoTaxLotsAndRecordDisposal({
            cleanWallet: cleanRequested,
            payAsset,
            payAmount,
            grossProceedsUsd: grossUsd,
            paySpotUsd,
            txHash: orderId
        });

        await dbPool
            .query(
                `INSERT INTO hifo_tax_lots
                 (wallet_address, asset_ticker, kas_sompi, initial_tokens, remaining_sompi, remaining_tokens, fmv_usd_per_token, total_cost_basis_usd, source_event_type, source_tx_hash, status)
                 VALUES ($1, $2, $3, $4, $3, $4, $5, $6, 'DEX_SWAP', $7, 'OPEN')`,
                [
                    cleanRequested,
                    receiveAsset,
                    Math.round(receivedAmount * 1e8),
                    receivedAmount,
                    receiveSpotUsd,
                    netUsd,
                    orderId
                ]
            )
            .catch(() => {});

        await redis
            .publish(
                'telemetry:updates',
                JSON.stringify({
                    fiat_event: true,
                    eventType: 'SOR_SWAP_SETTLED',
                    wallet: cleanRequested,
                    orderId,
                    payAsset,
                    payAmount,
                    receiveAsset,
                    receivedAmount,
                    feeUsd
                })
            )
            .catch(() => {});

        return json({
            success: true,
            orderId,
            txHash: orderId,
            explorerUrl,
            executionMode,
            payAsset,
            payAmount,
            paySpotUsd,
            receiveAsset,
            receivedAmount,
            estimatedOutput: receivedAmount,
            receiveSpotUsd,
            feePct,
            feeUsd,
            taxSummary
        });
    } catch (err: any) {
        console.error('🚨 [SOR SWAP FAULT]:', err);
        const msg = err?.message || 'Smart Order Router execution failed.';
        const status =
            msg.includes('ORACLE_HALT') ||
            msg.includes('CIRCUIT_BREAKER_TRIPPED') ||
            msg.includes('CRITICAL_SECURITY_LOCKDOWN')
                ? 503
                : msg.includes('WALLET_QUARANTINED') ||
                    msg.includes('SOLVENCY_INVARIANT_VIOLATION') ||
                    msg.includes('LEDGER_HMAC_VIOLATION')
                  ? 403
                  : 500;
        return json({ error: msg }, { status });
    }
};