import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import crypto from 'node:crypto';
import {
    isWalletMasterAdmin,
    normalizeKaspaBase32Strict,
    normalizeKaspaAddressStrict
} from '$lib/server/kms';
import {
    computeReservoirHmac,
    verifyWalletLedgerInvariantOrQuarantine
} from '$lib/server/l1Dispatcher';

const LUA_ATOMIC_DEBIT_P2P_ESCROW = `
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

async function ensureP2pOrdersTable() {
    await dbPool.query(`
        CREATE TABLE IF NOT EXISTS p2p_orders (
            order_id VARCHAR(80) PRIMARY KEY,
            maker_wallet VARCHAR(255) NOT NULL,
            taker_wallet VARCHAR(255),
            offer_asset VARCHAR(32) NOT NULL,
            offer_amount DOUBLE PRECISION NOT NULL,
            ask_asset VARCHAR(32) NOT NULL,
            ask_amount DOUBLE PRECISION NOT NULL,
            sighash_single_psbt TEXT,
            escrow_source VARCHAR(32) NOT NULL DEFAULT 'LEDGER_ESCROW',
            tx_hash VARCHAR(255),
            status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

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

async function syncReservoirAfterUnassignedDebit(
    prefixedWallet: string,
    cleanWallet: string,
    fromUnassignedKas: number
) {
    if (fromUnassignedKas <= 1e-9) return;
    const resRow = await dbPool.query(
        `SELECT streaming_balance_kas, total_yield_kas, COALESCE(lp_tokens, '{}'::jsonb) AS lp_tokens
         FROM yield_reservoirs
         WHERE wallet_address = $1 OR wallet_address = $2
         LIMIT 1`,
        [prefixedWallet, cleanWallet]
    );
    if (resRow.rows.length > 0) {
        const r = resRow.rows[0];
        const nextStream = Math.max(
            0,
            Number(r.streaming_balance_kas || 0) - fromUnassignedKas
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
            [prefixedWallet, cleanWallet, nextStream, newHmac]
        );
    }
}

export const GET: RequestHandler = async ({ url }: RequestEvent) => {
    try {
        await ensureP2pOrdersTable();
        const statusFilter = String(url.searchParams.get('status') || 'OPEN')
            .trim()
            .toUpperCase();

        const queryText =
            statusFilter === 'ALL'
                ? `SELECT * FROM p2p_orders ORDER BY created_at DESC LIMIT 100`
                : `SELECT * FROM p2p_orders WHERE status = $1 ORDER BY created_at DESC LIMIT 100`;
        const queryParams = statusFilter === 'ALL' ? [] : [statusFilter];

        const res = await dbPool.query(queryText, queryParams);
        return json({
            success: true,
            orders: res.rows
        });
    } catch (err: any) {
        console.error('P2P Orderbook Fetch Error:', err);
        return json(
            {
                success: false,
                orders: [],
                error: err?.message || 'Failed to load P2P atomic orderbook.'
            },
            { status: 500 }
        );
    }
};

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

    const cleanSession = normalizeKaspaBase32Strict(sessionWallet);
    const prefixedSession = normalizeKaspaAddressStrict(cleanSession);
    const isDirector = isWalletMasterAdmin(sessionWallet);

    try {
        await ensureP2pOrdersTable();
        const body = await request.json().catch(() => ({}));
        const action = String(body.action || 'CREATE_ORDER')
            .trim()
            .toUpperCase();

        if (action === 'CREATE_ORDER') {
            const requestedMaker = String(
                body.makerWallet || body.wallet || sessionWallet
            ).trim();
            const cleanMaker = normalizeKaspaBase32Strict(requestedMaker);

            if (cleanMaker !== cleanSession && !isDirector) {
                return json(
                    {
                        error: 'FORBIDDEN: Cannot create a P2P order on behalf of another wallet.'
                    },
                    { status: 403 }
                );
            }

            const prefixedMaker = normalizeKaspaAddressStrict(cleanMaker);
            const offerAsset = String(body.offerAsset || 'KAS')
                .trim()
                .toUpperCase();
            const askAsset = String(body.askAsset || 'USDC')
                .trim()
                .toUpperCase();
            const offerAmount = Number(body.offerAmount || 0);
            const askAmount = Number(body.askAmount || 0);
            const sighashSinglePsbt = body.sighashSinglePsbt
                ? String(body.sighashSinglePsbt).trim()
                : null;

            if (!offerAsset || !askAsset || offerAsset === askAsset) {
                return json(
                    {
                        error: 'INVALID_P2P_PAIR: Offer asset and Ask asset must differ.'
                    },
                    { status: 400 }
                );
            }

            if (
                !Number.isFinite(offerAmount) ||
                offerAmount <= 0 ||
                !Number.isFinite(askAmount) ||
                askAmount <= 0
            ) {
                return json(
                    {
                        error: 'INVALID_P2P_AMOUNTS: Both offerAmount and askAmount must be greater than 0.'
                    },
                    { status: 400 }
                );
            }

            await verifyWalletLedgerInvariantOrQuarantine(
                prefixedMaker,
                offerAsset
            );

            let escrowSource = 'SIGHASH_SINGLE_PSBT';
            if (!sighashSinglePsbt) {
                escrowSource = 'LEDGER_ESCROW';
                const makerLedgerKey = `dev:sor:treasury:balances:${cleanMaker}`;
                const debitRes = (await redis.eval(
                    LUA_ATOMIC_DEBIT_P2P_ESCROW,
                    1,
                    makerLedgerKey,
                    offerAsset,
                    offerAmount.toString()
                )) as [number, string];

                if (!debitRes || Number(debitRes[0]) !== 1) {
                    return json(
                        {
                            error: `INSUFFICIENT_LEDGER_BALANCE: Insufficient ${offerAsset} in Batch Settlement Queue to escrow ${offerAmount.toFixed(4)} ${offerAsset}.`
                        },
                        { status: 400 }
                    );
                }

                const fromUnassigned = parseFloat(debitRes[1] || '0') || 0;
                if (fromUnassigned > 1e-9 && offerAsset === 'KAS') {
                    await syncReservoirAfterUnassignedDebit(
                        prefixedMaker,
                        cleanMaker,
                        fromUnassigned
                    );
                }
            }

            const orderId = `PER-P2P-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
            await dbPool.query(
                `INSERT INTO p2p_orders
                 (order_id, maker_wallet, offer_asset, offer_amount, ask_asset, ask_amount, sighash_single_psbt, escrow_source, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN')`,
                [
                    orderId,
                    prefixedMaker,
                    offerAsset,
                    offerAmount,
                    askAsset,
                    askAmount,
                    sighashSinglePsbt,
                    escrowSource
                ]
            );

            await redis
                .publish(
                    'telemetry:updates',
                    JSON.stringify({
                        fiat_event: true,
                        eventType: 'P2P_ORDER_CREATED',
                        orderId,
                        makerWallet: cleanMaker,
                        offerAsset,
                        offerAmount,
                        askAsset,
                        askAmount
                    })
                )
                .catch(() => {});

            return json({
                success: true,
                orderId,
                makerWallet: prefixedMaker,
                offerAsset,
                offerAmount,
                askAsset,
                askAmount,
                escrowSource,
                status: 'OPEN'
            });
        }

        if (action === 'CANCEL_ORDER') {
            const orderId = String(body.orderId || '').trim();
            if (!orderId) {
                return json({ error: 'Missing orderId.' }, { status: 400 });
            }

            const existingRes = await dbPool.query(
                `SELECT * FROM p2p_orders WHERE order_id = $1 LIMIT 1`,
                [orderId]
            );
            if (existingRes.rows.length === 0) {
                return json(
                    { error: `P2P order ${orderId} not found.` },
                    { status: 404 }
                );
            }

            const row = existingRes.rows[0];
            if (row.status !== 'OPEN') {
                return json(
                    {
                        error: `P2P order ${orderId} cannot be cancelled from status ${row.status}.`
                    },
                    { status: 400 }
                );
            }

            const cleanMaker = normalizeKaspaBase32Strict(
                String(row.maker_wallet || '')
            );
            if (cleanMaker !== cleanSession && !isDirector) {
                return json(
                    {
                        error: 'FORBIDDEN: Only the order maker or Master Director may cancel this P2P order.'
                    },
                    { status: 403 }
                );
            }

            const updated = await dbPool.query(
                `UPDATE p2p_orders
                 SET status = 'CANCELLED',
                     updated_at = CURRENT_TIMESTAMP
                 WHERE order_id = $1 AND status = 'OPEN'
                 RETURNING offer_asset, offer_amount, escrow_source`,
                [orderId]
            );

            if (updated.rows.length === 0) {
                return json(
                    { error: `P2P order ${orderId} is no longer OPEN.` },
                    { status: 400 }
                );
            }

            const u = updated.rows[0];
            if (String(u.escrow_source || '') === 'LEDGER_ESCROW') {
                const makerLedgerKey = `dev:sor:treasury:balances:${cleanMaker}`;
                await redis.hincrbyfloat(
                    makerLedgerKey,
                    String(u.offer_asset || 'KAS').toUpperCase(),
                    Number(u.offer_amount || 0)
                );
            }

            return json({
                success: true,
                orderId,
                status: 'CANCELLED'
            });
        }

        if (action === 'FILL_ORDER') {
            const orderId = String(body.orderId || '').trim();
            if (!orderId) {
                return json({ error: 'Missing orderId.' }, { status: 400 });
            }

            const existingRes = await dbPool.query(
                `SELECT * FROM p2p_orders WHERE order_id = $1 LIMIT 1`,
                [orderId]
            );
            if (existingRes.rows.length === 0) {
                return json(
                    { error: `P2P order ${orderId} not found.` },
                    { status: 404 }
                );
            }

            const row = existingRes.rows[0];
            if (row.status !== 'OPEN') {
                return json(
                    { error: `P2P order ${orderId} is already ${row.status}.` },
                    { status: 400 }
                );
            }

            const cleanMaker = normalizeKaspaBase32Strict(
                String(row.maker_wallet || '')
            );
            const prefixedMaker = normalizeKaspaAddressStrict(cleanMaker);
            const offerAsset = String(row.offer_asset || 'KAS').toUpperCase();
            const offerAmount = Number(row.offer_amount || 0);
            const askAsset = String(row.ask_asset || 'USDC').toUpperCase();
            const askAmount = Number(row.ask_amount || 0);

            await verifyWalletLedgerInvariantOrQuarantine(
                prefixedSession,
                askAsset
            );

            const [offerSpotUsd, askSpotUsd] = await Promise.all([
                resolveStrictSpotPriceUsd(offerAsset),
                resolveStrictSpotPriceUsd(askAsset)
            ]);

            if (offerSpotUsd <= 0 || askSpotUsd <= 0) {
                return json(
                    {
                        error: `ORACLE_HALT: Live oracle spot price for ${offerSpotUsd <= 0 ? offerAsset : askAsset} is offline. Failing closed (503).`,
                        circuitBreakerTripped: true
                    },
                    { status: 503 }
                );
            }

            const takerLedgerKey = `dev:sor:treasury:balances:${cleanSession}`;
            const debitRes = (await redis.eval(
                LUA_ATOMIC_DEBIT_P2P_ESCROW,
                1,
                takerLedgerKey,
                askAsset,
                askAmount.toString()
            )) as [number, string];

            if (!debitRes || Number(debitRes[0]) !== 1) {
                return json(
                    {
                        error: `INSUFFICIENT_LEDGER_BALANCE: Insufficient ${askAsset} in Batch Settlement Queue to fill order (${askAmount.toFixed(4)} ${askAsset} required).`
                    },
                    { status: 400 }
                );
            }

            const fromUnassigned = parseFloat(debitRes[1] || '0') || 0;
            if (fromUnassigned > 1e-9 && askAsset === 'KAS') {
                await syncReservoirAfterUnassignedDebit(
                    prefixedSession,
                    cleanSession,
                    fromUnassigned
                );
            }

            const makerLedgerKey = `dev:sor:treasury:balances:${cleanMaker}`;
            await Promise.all([
                redis.hincrbyfloat(makerLedgerKey, askAsset, askAmount),
                redis.hincrbyfloat(takerLedgerKey, offerAsset, offerAmount)
            ]);

            const txHash =
                String(body.txHash || '').trim() ||
                `P2P-SETTLED-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

            await dbPool.query(
                `UPDATE p2p_orders
                 SET taker_wallet = $2,
                     tx_hash = $3,
                     status = 'FILLED',
                     updated_at = CURRENT_TIMESTAMP
                 WHERE order_id = $1`,
                [orderId, prefixedSession, txHash]
            );

            const grossUsd = Number((askAmount * askSpotUsd).toFixed(2));
            await Promise.all([
                dbPool
                    .query(
                        `INSERT INTO tax_ledger_events
                         (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash)
                         VALUES ($1, $2, 'P2P_ATOMIC_FILL', $3, $4, $5, $6)`,
                        [
                            cleanMaker,
                            offerAsset,
                            grossUsd,
                            offerAmount,
                            offerSpotUsd,
                            txHash
                        ]
                    )
                    .catch(() => {}),
                dbPool
                    .query(
                        `INSERT INTO tax_ledger_events
                         (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash)
                         VALUES ($1, $2, 'P2P_ATOMIC_FILL', $3, $4, $5, $6)`,
                        [
                            cleanSession,
                            askAsset,
                            grossUsd,
                            askAmount,
                            askSpotUsd,
                            txHash
                        ]
                    )
                    .catch(() => {})
            ]);

            await redis
                .publish(
                    'telemetry:updates',
                    JSON.stringify({
                        fiat_event: true,
                        eventType: 'P2P_ORDER_FILLED',
                        orderId,
                        makerWallet: cleanMaker,
                        takerWallet: cleanSession,
                        offerAsset,
                        offerAmount,
                        askAsset,
                        askAmount,
                        txHash
                    })
                )
                .catch(() => {});

            return json({
                success: true,
                orderId,
                makerWallet: prefixedMaker,
                takerWallet: prefixedSession,
                offerAsset,
                offerAmount,
                askAsset,
                askAmount,
                txHash,
                status: 'FILLED'
            });
        }

        return json(
            { error: `Unsupported P2P action: ${action}` },
            { status: 400 }
        );
    } catch (err: any) {
        console.error('🚨 [P2P ORDERBOOK FAULT]:', err);
        const msg = err?.message || 'P2P orderbook execution failed.';
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