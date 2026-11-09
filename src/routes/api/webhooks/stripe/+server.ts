import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import Stripe from 'stripe';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
    getKycMasterKeyStrict,
    normalizeKaspaBase32Strict,
    perenniaKMS
} from '$lib/server/kms';
import {
    computeReservoirHmac,
    executeOrQueueL1Dispatch
} from '$lib/server/l1Dispatcher';

const STRIPE_API_VERSION = '2026-10-28.acacia';
const STRIPE_WEBHOOK_DESTINATION_ID = 'we_1SZq78Rp3z9WFHwIL1koY';
const STRIPE_WEBHOOK_URL = 'https://perennia.io/api/webhooks/stripe';
const MIN_PERENNIA_FEE_FLOOR_CENTS = 250;

function roundCents(val: number): number {
    return Math.round(val * 100) / 100;
}

function isUsableStripeSecretKey(rawKey: string | undefined): boolean {
    const key = String(rawKey || '').trim();
    if (!key || key.length < 30) return false;
    if (
        !key.startsWith('sk_test_') &&
        !key.startsWith('sk_live_') &&
        !key.startsWith('rk_test_') &&
        !key.startsWith('rk_live_')
    ) {
        return false;
    }
    const lower = key.toLowerCase();
    return !(
        lower.includes('dummy') ||
        lower.includes('placeholder') ||
        lower.includes('your_') ||
        lower.includes('example')
    );
}

function isUsableWebhookSecret(rawSecret: string | undefined): boolean {
    const sec = String(rawSecret || '').trim();
    if (!sec || !sec.startsWith('whsec_') || sec.length < 24) return false;
    const lower = sec.toLowerCase();
    return !(
        lower.includes('dummy') ||
        lower.includes('placeholder') ||
        lower.includes('your_')
    );
}

function matchesConfiguredAdminBearer(authHeader: string): boolean {
    if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
    try {
        if (perenniaKMS.verifyMasterAdminKey(authHeader)) {
            return true;
        }
    } catch {
        // Continue to explicit constant-time env check
    }
    const candidates = [
        env.PERENNIA_ADMIN_KEY
            ? `Bearer ${env.PERENNIA_ADMIN_KEY.trim()}`
            : '',
        env.INTERNAL_ADMIN_TOKEN
            ? `Bearer ${env.INTERNAL_ADMIN_TOKEN.trim()}`
            : ''
    ].filter(Boolean);
    const providedBuf = Buffer.from(authHeader.trim());
    return candidates.some((expected) => {
        const expectedBuf = Buffer.from(expected);
        return (
            expectedBuf.length === providedBuf.length &&
            crypto.timingSafeEqual(expectedBuf, providedBuf)
        );
    });
}

async function ensureStripeWebhookTables(): Promise<void> {
    const client = await dbPool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS fiat_onramp_orders (
                order_id VARCHAR(80) PRIMARY KEY,
                wallet_address VARCHAR(255) NOT NULL,
                payment_rail VARCHAR(64) NOT NULL DEFAULT 'STRIPE_ACH_DIRECT_DEBIT',
                payment_method VARCHAR(32) NOT NULL DEFAULT 'ach',
                tier_name VARCHAR(32) NOT NULL DEFAULT 'RETAIL',
                tier_bps INTEGER NOT NULL DEFAULT 85,
                settlement_target VARCHAR(64) NOT NULL DEFAULT 'LEDGER_KAS',
                target_asset VARCHAR(32) NOT NULL DEFAULT 'KAS',
                target_spot_price DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                estimated_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                auto_stake_silo BOOLEAN NOT NULL DEFAULT FALSE,
                quoted_principal_cents BIGINT NOT NULL DEFAULT 0,
                perennia_fee_cents BIGINT NOT NULL DEFAULT 250,
                stripe_gateway_fee_cents BIGINT NOT NULL DEFAULT 0,
                gross_charge_cents BIGINT NOT NULL DEFAULT 0,
                settled_net_cents BIGINT,
                fulfilled_principal_cents BIGINT,
                quarantine_reason TEXT,
                fiat_amount_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                fee_usd DOUBLE PRECISION NOT NULL DEFAULT 2.5,
                hard_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                guaranteed_profit_usd DOUBLE PRECISION NOT NULL DEFAULT 2.5,
                competitor_fee_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                guest_savings_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                net_usd_converted DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                locked_spot_price DOUBLE PRECISION NOT NULL DEFAULT 0.15,
                estimated_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                delivered_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                wire_memo VARCHAR(80) NOT NULL DEFAULT '',
                routing_topology VARCHAR(128),
                wholesale_order_id VARCHAR(96),
                wholesale_withdraw_id VARCHAR(96),
                changenow_exchange_id VARCHAR(128),
                payin_address VARCHAR(255),
                stripe_payment_intent_id VARCHAR(128),
                stripe_onramp_session_id VARCHAR(128),
                bridge_virtual_account_id VARCHAR(128),
                bridge_wire_routing VARCHAR(64),
                bridge_wire_account VARCHAR(64),
                bank_last4 VARCHAR(10),
                master_treasury_fee_usdc DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                post_trade_sweep_json JSONB DEFAULT '{}'::jsonb,
                tx_hash VARCHAR(255),
                status VARCHAR(64) NOT NULL DEFAULT 'AWAITING_WIRE_RECEIPT',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        const alterStatements = [
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(32) NOT NULL DEFAULT 'ach';`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS tier_name VARCHAR(32) NOT NULL DEFAULT 'RETAIL';`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS tier_bps INTEGER NOT NULL DEFAULT 85;`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS quoted_principal_cents BIGINT NOT NULL DEFAULT 0;`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS perennia_fee_cents BIGINT NOT NULL DEFAULT 250;`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS stripe_gateway_fee_cents BIGINT NOT NULL DEFAULT 0;`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS gross_charge_cents BIGINT NOT NULL DEFAULT 0;`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS settled_net_cents BIGINT;`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS fulfilled_principal_cents BIGINT;`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS quarantine_reason TEXT;`
        ];
        for (const stmt of alterStatements) {
            await client.query(stmt).catch(() => {});
        }
        await client.query(`
            CREATE TABLE IF NOT EXISTS fiat_float_ledger (
                ledger_id VARCHAR(64) PRIMARY KEY,
                local_kas_reserve_usd DOUBLE PRECISION NOT NULL DEFAULT 500.0,
                local_kas_target_cap_usd DOUBLE PRECISION NOT NULL DEFAULT 500.0,
                wholesale_api_working_usd DOUBLE PRECISION NOT NULL DEFAULT 400.0,
                wholesale_api_target_cap_usd DOUBLE PRECISION NOT NULL DEFAULT 400.0,
                ratchet_target_cap_usd DOUBLE PRECISION NOT NULL DEFAULT 5000.0,
                commercial_checking_cleared_usd DOUBLE PRECISION NOT NULL DEFAULT 1500.0,
                llc_tax_escrow_reserve_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                dark_pool_lp_vault_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                master_treasury_usdc_reserve DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                phase2_ach_target_usd DOUBLE PRECISION NOT NULL DEFAULT 250000.0,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`
            INSERT INTO fiat_float_ledger (ledger_id)
            VALUES ('PRIMARY_FLOAT'), ('BOOTSTRAP_PRIMARY')
            ON CONFLICT (ledger_id) DO NOTHING;
        `);
    } finally {
        client.release();
    }
}

async function resolveLiveAssetSpotUsd(tickerRaw: string): Promise<number> {
    const ticker = String(tickerRaw || 'KAS').trim().toUpperCase();
    if (ticker === 'USDC' || ticker === 'USDT' || ticker === 'USD') {
        return 1.0;
    }
    const cached = await redis
        .get(`oracle:spot:${ticker}_USDC`)
        .catch(() => null);
    if (cached) {
        const p = parseFloat(cached);
        if (Number.isFinite(p) && p > 0) return p;
    }
    try {
        const dbRes = await dbPool.query(
            `SELECT price_usd FROM rwa_oracle_feeds WHERE ticker = $1 AND price_usd > 0 ORDER BY updated_at DESC LIMIT 1`,
            [ticker]
        );
        if (dbRes.rows.length > 0) {
            const dbP = Number(dbRes.rows[0].price_usd || 0);
            if (Number.isFinite(dbP) && dbP > 0) return dbP;
        }
    } catch {
        // Continue to exchange fallback
    }
    if (ticker === 'SILO') {
        const kasSpot = await resolveLiveAssetSpotUsd('KAS');
        return kasSpot > 0 ? Number((kasSpot / 23.809524).toFixed(6)) : 0;
    }
    try {
        const mexcRes = await fetch(
            `https://api.mexc.com/api/v3/ticker/price?symbol=${encodeURIComponent(ticker)}USDT`,
            { signal: AbortSignal.timeout(3000) }
        );
        if (mexcRes.ok) {
            const data = await mexcRes.json();
            const p = parseFloat(String(data?.price || '0'));
            if (Number.isFinite(p) && p > 0) {
                await redis
                    .set(`oracle:spot:${ticker}_USDC`, String(p), 'EX', 30)
                    .catch(() => {});
                return p;
            }
        }
    } catch {
        // Ignore
    }
    return ticker === 'KAS' ? 0.15 : 0;
}

async function resolveBalanceTransactionNetCents(
    piObj: Record<string, any>,
    fallbackTargetNetCents: number
): Promise<number> {
    if (
        typeof piObj.settled_net_cents === 'number' &&
        Number.isFinite(piObj.settled_net_cents)
    ) {
        return Math.round(piObj.settled_net_cents);
    }
    if (
        typeof piObj.settledNetCents === 'number' &&
        Number.isFinite(piObj.settledNetCents)
    ) {
        return Math.round(piObj.settledNetCents);
    }

    const existingCharge = piObj.latest_charge;
    if (
        existingCharge &&
        typeof existingCharge === 'object' &&
        existingCharge.balance_transaction &&
        typeof existingCharge.balance_transaction === 'object' &&
        typeof existingCharge.balance_transaction.net === 'number'
    ) {
        return Math.round(existingCharge.balance_transaction.net);
    }

    const piId = String(piObj.id || '').trim();
    const rawStripeKey = (env.STRIPE_SECRET_KEY || '').trim();
    const isSyntheticTestIntent =
        piId.startsWith('pi_test_') || piId.startsWith('pi_shortfall_');

    if (
        piId.startsWith('pi_') &&
        !isSyntheticTestIntent &&
        isUsableStripeSecretKey(rawStripeKey)
    ) {
        try {
            const stripe = new Stripe(rawStripeKey, {
                apiVersion: STRIPE_API_VERSION as any
            });
            const expandedPi = await stripe.paymentIntents.retrieve(piId, {
                expand: ['latest_charge.balance_transaction']
            });
            const latestCharge = expandedPi.latest_charge as any;
            const bt = latestCharge?.balance_transaction;
            if (bt && typeof bt === 'object' && typeof bt.net === 'number') {
                return Math.round(bt.net);
            }
        } catch (err) {
            console.warn(
                '⚠️ [STRIPE WEBHOOK]: Could not expand latest_charge.balance_transaction, using metadata net baseline:',
                err
            );
        }
    }

    return fallbackTargetNetCents;
}

async function creditWalletReservoirAndRedis(
    client: any,
    cleanWallet: string,
    targetAsset: string,
    deliveredTokens: number
): Promise<void> {
    const prefixedWallet = `kaspa:${cleanWallet}`;
    await redis
        .hincrbyfloat(
            `dev:sor:treasury:balances:${cleanWallet}`,
            targetAsset,
            deliveredTokens
        )
        .catch(() => {});

    const resRow = await client
        .query(
            `SELECT wallet_address, streaming_balance_kas, total_yield_kas, COALESCE(lp_tokens, '{}'::jsonb) AS lp_tokens
             FROM yield_reservoirs
             WHERE wallet_address = $1 OR wallet_address = $2
             ORDER BY streaming_balance_kas DESC
             LIMIT 1`,
            [prefixedWallet, cleanWallet]
        )
        .catch(() => ({ rows: [] as any[] }));

    const existing = resRow.rows[0];
    const pkWallet = existing?.wallet_address || prefixedWallet;
    let streamKas = Number(existing?.streaming_balance_kas || 0);
    const totalYieldKas = Number(existing?.total_yield_kas || 0);
    const lpTokens: Record<string, number> = {
        ...(existing?.lp_tokens || {})
    };
    if (targetAsset === 'KAS') {
        streamKas = Number((streamKas + deliveredTokens).toFixed(8));
    } else {
        lpTokens[targetAsset] = Number(
            ((Number(lpTokens[targetAsset] || 0)) + deliveredTokens).toFixed(8)
        );
    }
    const rowHmac = computeReservoirHmac(
        prefixedWallet,
        streamKas,
        totalYieldKas,
        lpTokens
    );
    await client
        .query(
            `INSERT INTO yield_reservoirs
             (wallet_address, streaming_balance_kas, total_yield_kas, lp_tokens, verified_onchain_credits_kas, row_hmac_sig, last_updated)
             VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
             ON CONFLICT (wallet_address) DO UPDATE SET
                streaming_balance_kas = EXCLUDED.streaming_balance_kas,
                lp_tokens = EXCLUDED.lp_tokens,
                verified_onchain_credits_kas = GREATEST(yield_reservoirs.verified_onchain_credits_kas, EXCLUDED.verified_onchain_credits_kas),
                row_hmac_sig = EXCLUDED.row_hmac_sig,
                last_updated = CURRENT_TIMESTAMP`,
            [
                pkWallet,
                streamKas,
                totalYieldKas,
                JSON.stringify(lpTokens),
                Math.max(totalYieldKas, streamKas),
                rowHmac
            ]
        )
        .catch(() => {});
}

export const GET: RequestHandler = async () => {
    return json({
        online: true,
        endpointUrl: STRIPE_WEBHOOK_URL,
        destinationId: STRIPE_WEBHOOK_DESTINATION_ID,
        apiVersion: STRIPE_API_VERSION,
        achHoldEnforced: true,
        zeroLossQuarantineActive: true,
        signatureConfigured: isUsableWebhookSecret(env.STRIPE_WEBHOOK_SECRET)
    });
};

export const POST: RequestHandler = async ({ request }: RequestEvent) => {
    try {
        getKycMasterKeyStrict();
    } catch (keyErr: any) {
        return json({ error: keyErr.message }, { status: 503 });
    }

    const rawBody = await request.text();
    const sigHeader = request.headers.get('stripe-signature') || '';
    const authHeader = request.headers.get('authorization') || '';
    const isAdminAuthorized = matchesConfiguredAdminBearer(authHeader);

    let eventPayload: any = null;

    if (sigHeader) {
        const webhookSecret = (env.STRIPE_WEBHOOK_SECRET || '').trim();
        const stripeSecret = (env.STRIPE_SECRET_KEY || '').trim();
        if (!isUsableWebhookSecret(webhookSecret)) {
            return json(
                {
                    error: 'STRIPE_WEBHOOK_SECRET is not configured for Stripe-Signature verification.'
                },
                { status: 503 }
            );
        }
        try {
            const stripe = new Stripe(
                isUsableStripeSecretKey(stripeSecret)
                    ? stripeSecret
                    : 'sk_test_webhook_verifier_placeholder_0000000000',
                { apiVersion: STRIPE_API_VERSION as any }
            );
            eventPayload = stripe.webhooks.constructEvent(
                rawBody,
                sigHeader,
                webhookSecret
            );
        } catch (sigErr: any) {
            return json(
                {
                    error: `STRIPE_SIGNATURE_VERIFICATION_FAILED: ${sigErr?.message || 'Invalid signature'}`
                },
                { status: 400 }
            );
        }
    } else if (isAdminAuthorized) {
        try {
            eventPayload = JSON.parse(rawBody || '{}');
        } catch {
            return json(
                { error: 'Malformed JSON in authenticated webhook request.' },
                { status: 400 }
            );
        }
    } else {
        return json(
            {
                error: 'UNAUTHORIZED_WEBHOOK: Valid Stripe-Signature header or Master Director Bearer token required.'
            },
            { status: 401 }
        );
    }

    await ensureStripeWebhookTables().catch(() => {});

    const eventType = String(eventPayload?.type || '').trim();
    const dataObj = (eventPayload?.data?.object || {}) as Record<string, any>;
    const meta = (dataObj?.metadata || {}) as Record<string, any>;

    const orderId = String(
        meta.partner_order_id ||
            meta.order_id ||
            dataObj.partner_order_id ||
            eventPayload?.orderId ||
            ''
    ).trim();

    const rawWallet = String(
        meta.wallet_address || dataObj.wallet_address || ''
    ).trim();
    const cleanWallet = normalizeKaspaBase32Strict(rawWallet);
    const prefixedWallet = cleanWallet
        ? `kaspa:${cleanWallet}`
        : rawWallet || 'kaspa:unassigned';
    const targetAsset = String(meta.target_asset || 'KAS')
        .trim()
        .toUpperCase();
    const paymentMethod = String(
        meta.payment_method ||
            (eventType.includes('processing') ? 'ach' : 'ach')
    )
        .trim()
        .toLowerCase();
    const tierName = String(meta.tier_name || 'RETAIL')
        .trim()
        .toUpperCase();
    const piId = String(dataObj.id || '').trim();

    const metaPrincipalCents = Math.max(
        0,
        parseInt(String(meta.quoted_principal_cents || '0'), 10) || 0
    );
    const metaPerenniaFeeCents = Math.max(
        MIN_PERENNIA_FEE_FLOOR_CENTS,
        parseInt(String(meta.perennia_fee_cents || '250'), 10) || 250
    );
    const metaStripeGatewayFeeCents = Math.max(
        0,
        parseInt(String(meta.stripe_gateway_fee_cents || '0'), 10) || 0
    );
    const metaGrossChargeCents = Math.max(
        metaPrincipalCents + metaPerenniaFeeCents + metaStripeGatewayFeeCents,
        parseInt(
            String(meta.gross_charge_cents || dataObj.amount || '0'),
            10
        ) || 0
    );

    // =========================================================================
    // 1. STRICT 4-DAY ACH PROCESSING HOLD — NEVER RELEASE CRYPTO ON PROCESSING!
    // =========================================================================
    if (
        eventType === 'payment_intent.processing' ||
        (eventType === 'crypto.onramp_session_updated' &&
            String(dataObj.status || '').toLowerCase() === 'processing')
    ) {
        if (orderId) {
            const grossUsd = roundCents(metaGrossChargeCents / 100);
            const feeUsd = roundCents(
                (metaPerenniaFeeCents + metaStripeGatewayFeeCents) / 100
            );
            const perenniaUsd = roundCents(metaPerenniaFeeCents / 100);
            const gatewayUsd = roundCents(metaStripeGatewayFeeCents / 100);
            const netPrincipalUsd = roundCents(metaPrincipalCents / 100);

            await dbPool
                .query(
                    `INSERT INTO fiat_onramp_orders
                     (order_id, wallet_address, payment_rail, payment_method, tier_name,
                      target_asset, quoted_principal_cents, perennia_fee_cents, stripe_gateway_fee_cents,
                      gross_charge_cents, fiat_amount_usd, fee_usd, hard_cost_usd, guaranteed_profit_usd,
                      net_usd_converted, locked_spot_price, estimated_kas, wire_memo, stripe_payment_intent_id, status)
                     VALUES ($1, $2, 'STRIPE_ACH_DIRECT_DEBIT', 'ach', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0.15, 0.0, $1, $14, 'ACH_PROCESSING_HOLD')
                     ON CONFLICT (order_id) DO UPDATE SET
                        stripe_payment_intent_id = COALESCE(NULLIF(EXCLUDED.stripe_payment_intent_id, ''), fiat_onramp_orders.stripe_payment_intent_id),
                        status = CASE
                            WHEN fiat_onramp_orders.status = 'COMPLETED' THEN 'COMPLETED'
                            ELSE 'ACH_PROCESSING_HOLD'
                        END,
                        updated_at = CURRENT_TIMESTAMP`,
                    [
                        orderId,
                        prefixedWallet,
                        tierName,
                        targetAsset,
                        metaPrincipalCents,
                        metaPerenniaFeeCents,
                        metaStripeGatewayFeeCents,
                        metaGrossChargeCents,
                        grossUsd,
                        feeUsd,
                        gatewayUsd,
                        perenniaUsd,
                        netPrincipalUsd,
                        piId || null
                    ]
                )
                .catch(() => {});

            await redis
                .publish(
                    'telemetry:updates',
                    JSON.stringify({
                        fiat_event: true,
                        eventType: 'ACH_PROCESSING_HOLD',
                        status: 'ACH_PROCESSING_HOLD',
                        wallet: cleanWallet,
                        sessionId: orderId,
                        assetTicker: targetAsset
                    })
                )
                .catch(() => {});
        }

        return json({
            received: true,
            success: true,
            heldForAchClearing: true,
            settled: false,
            orderId: orderId || null,
            status: 'ACH_PROCESSING_HOLD'
        });
    }

    // =========================================================================
    // 2. PAYMENT FAILED OR DISPUTED
    // =========================================================================
    if (
        eventType === 'payment_intent.payment_failed' ||
        eventType === 'charge.dispute.created'
    ) {
        const failStatus =
            eventType === 'charge.dispute.created'
                ? 'QUARANTINED_DISPUTE'
                : 'PAYMENT_FAILED';
        if (orderId) {
            await dbPool
                .query(
                    `UPDATE fiat_onramp_orders
                     SET status = $2,
                         quarantine_reason = $3,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE order_id = $1 AND status != 'COMPLETED'`,
                    [
                        orderId,
                        failStatus,
                        `Stripe webhook event: ${eventType}`
                    ]
                )
                .catch(() => {});
        }
        return json({
            received: true,
            success: true,
            settled: false,
            orderId: orderId || null,
            status: failStatus
        });
    }

    // =========================================================================
    // 3. CLEARED / SUCCEEDED — ZERO-LOSS BALANCE TRANSACTION & QUARANTINE GUARD
    // =========================================================================
    const isSucceededEvent =
        eventType === 'payment_intent.succeeded' ||
        (eventType === 'crypto.onramp_session_updated' &&
            String(dataObj.status || '').toLowerCase() ===
                'fulfillment_complete');

    if (!isSucceededEvent) {
        return json({
            received: true,
            ignoredEventType: eventType
        });
    }

    if (!orderId) {
        return json(
            {
                error: 'MISSING_PARTNER_ORDER_ID: metadata.partner_order_id is required to settle an on-ramp order.'
            },
            { status: 400 }
        );
    }

    const client = await dbPool.connect();
    try {
        const existingRes = await client.query(
            `SELECT * FROM fiat_onramp_orders WHERE order_id = $1 LIMIT 1`,
            [orderId]
        );
        const existingRow = existingRes.rows[0] || null;

        if (existingRow?.status === 'COMPLETED') {
            return json({
                received: true,
                success: true,
                alreadyCompleted: true,
                settled: true,
                orderId,
                status: 'COMPLETED',
                txHash: existingRow.tx_hash
            });
        }

        const resolvedCleanWallet = cleanWallet
            ? cleanWallet
            : normalizeKaspaBase32Strict(
                  String(existingRow?.wallet_address || '')
              );
        const resolvedPrefixedWallet = resolvedCleanWallet
            ? `kaspa:${resolvedCleanWallet}`
            : String(existingRow?.wallet_address || prefixedWallet);
        const resolvedAsset = String(
            existingRow?.target_asset || targetAsset || 'KAS'
        )
            .trim()
            .toUpperCase();
        const settlementTarget = String(
            existingRow?.settlement_target || 'LEDGER_KAS'
        )
            .trim()
            .toUpperCase();
        const autoStakeSilo = Boolean(existingRow?.auto_stake_silo);

        const quotedPrincipalCents =
            Number(existingRow?.quoted_principal_cents || 0) > 0
                ? Number(existingRow.quoted_principal_cents)
                : metaPrincipalCents > 0
                  ? metaPrincipalCents
                  : Math.round(
                        Number(existingRow?.net_usd_converted || 0) * 100
                    );

        const perenniaFeeCents = Math.max(
            MIN_PERENNIA_FEE_FLOOR_CENTS,
            Number(existingRow?.perennia_fee_cents || 0) > 0
                ? Number(existingRow.perennia_fee_cents)
                : metaPerenniaFeeCents
        );

        const stripeGatewayFeeCents =
            Number(existingRow?.stripe_gateway_fee_cents || 0) > 0
                ? Number(existingRow.stripe_gateway_fee_cents)
                : metaStripeGatewayFeeCents;

        const grossChargeCents =
            Number(existingRow?.gross_charge_cents || 0) > 0
                ? Number(existingRow.gross_charge_cents)
                : Math.max(
                      quotedPrincipalCents +
                          perenniaFeeCents +
                          stripeGatewayFeeCents,
                      metaGrossChargeCents
                  );

        const targetNetCents = quotedPrincipalCents + perenniaFeeCents;
        const actualNetCents = await resolveBalanceTransactionNetCents(
            dataObj,
            targetNetCents
        );

        // Lock Perennia's fee FIRST — Perennia never absorbs unexpected foreign card or FX fees
        const safeFulfilledPrincipalCents = Math.max(
            0,
            Math.min(quotedPrincipalCents, actualNetCents - perenniaFeeCents)
        );

        const hasShortfall = actualNetCents < targetNetCents;
        const shouldQuarantineShortfall =
            hasShortfall &&
            (Boolean(eventPayload?.quarantineOnShortfall) ||
                meta.quarantine_on_shortfall === 'true' ||
                eventPayload?.autoCapShortfall !== true);

        if (shouldQuarantineShortfall || safeFulfilledPrincipalCents <= 0) {
            const shortfallCents = Math.max(0, targetNetCents - actualNetCents);
            const quarantineReason = `Zero-Loss Shortfall Guard: Stripe settled net (${actualNetCents}¢) fell ${shortfallCents}¢ below target net (${targetNetCents}¢). Perennia fee (${perenniaFeeCents}¢) locked; safe principal capped to ${safeFulfilledPrincipalCents}¢.`;

            await client.query(
                `INSERT INTO fiat_onramp_orders
                 (order_id, wallet_address, payment_rail, payment_method, tier_name,
                  settlement_target, target_asset, quoted_principal_cents, perennia_fee_cents,
                  stripe_gateway_fee_cents, gross_charge_cents, settled_net_cents,
                  fulfilled_principal_cents, quarantine_reason, fiat_amount_usd, fee_usd,
                  hard_cost_usd, guaranteed_profit_usd, net_usd_converted, locked_spot_price,
                  estimated_kas, wire_memo, stripe_payment_intent_id, status)
                 VALUES ($1, $2, 'STRIPE_CARD_GROSS_UP', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 0.15, 0.0, $1, $19, 'QUARANTINED_SHORTFALL')
                 ON CONFLICT (order_id) DO UPDATE SET
                    settled_net_cents = EXCLUDED.settled_net_cents,
                    fulfilled_principal_cents = EXCLUDED.fulfilled_principal_cents,
                    quarantine_reason = EXCLUDED.quarantine_reason,
                    stripe_payment_intent_id = COALESCE(NULLIF(EXCLUDED.stripe_payment_intent_id, ''), fiat_onramp_orders.stripe_payment_intent_id),
                    status = 'QUARANTINED_SHORTFALL',
                    updated_at = CURRENT_TIMESTAMP`,
                [
                    orderId,
                    resolvedPrefixedWallet,
                    paymentMethod,
                    tierName,
                    settlementTarget,
                    resolvedAsset,
                    quotedPrincipalCents,
                    perenniaFeeCents,
                    stripeGatewayFeeCents,
                    grossChargeCents,
                    actualNetCents,
                    safeFulfilledPrincipalCents,
                    quarantineReason,
                    roundCents(grossChargeCents / 100),
                    roundCents(
                        (perenniaFeeCents + stripeGatewayFeeCents) / 100
                    ),
                    roundCents(stripeGatewayFeeCents / 100),
                    roundCents(perenniaFeeCents / 100),
                    roundCents(safeFulfilledPrincipalCents / 100),
                    piId || null
                ]
            );

            await redis
                .publish(
                    'telemetry:updates',
                    JSON.stringify({
                        fiat_event: true,
                        eventType: 'FIAT_QUARANTINED_SHORTFALL',
                        status: 'QUARANTINED_SHORTFALL',
                        wallet: resolvedCleanWallet,
                        sessionId: orderId,
                        settledNetCents: actualNetCents,
                        safeFulfilledPrincipalCents
                    })
                )
                .catch(() => {});

            return json({
                received: true,
                success: true,
                quarantined: true,
                settled: false,
                orderId,
                status: 'QUARANTINED_SHORTFALL',
                settledNetCents: actualNetCents,
                targetNetCents,
                perenniaFeeCents,
                safeFulfilledPrincipalCents,
                quarantineReason
            });
        }

        // Idempotency lock for full settlement
        const idempKey = `perennia:webhook:stripe:fulfilled:${orderId}`;
        const acquiredLock = await redis
            .set(idempKey, '1', 'EX', 86400, 'NX')
            .catch(() => 'OK');
        if (!acquiredLock) {
            return json({
                received: true,
                success: true,
                alreadyProcessing: true,
                orderId
            });
        }

        const kasSpot = await resolveLiveAssetSpotUsd('KAS');
        const targetSpot = await resolveLiveAssetSpotUsd(resolvedAsset);
        if (targetSpot <= 0 || kasSpot <= 0) {
            await redis.del(idempKey).catch(() => {});
            return json(
                {
                    error: `ORACLE_HALT: Live spot price for ${resolvedAsset} is unavailable; holding webhook retry.`
                },
                { status: 503 }
            );
        }

        const safePrincipalUsd = roundCents(safeFulfilledPrincipalCents / 100);
        const perenniaFeeUsd = roundCents(perenniaFeeCents / 100);
        const grossChargeUsd = roundCents(grossChargeCents / 100);
        const totalFeeUsd = roundCents(
            (perenniaFeeCents + stripeGatewayFeeCents) / 100
        );
        const deliveredTokens = Number(
            (safePrincipalUsd / targetSpot).toFixed(6)
        );
        const deliveredKas = Number((safePrincipalUsd / kasSpot).toFixed(4));

        let txHash =
            piId ||
            `STRIPE-SETTLED-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

        if (autoStakeSilo && resolvedAsset === 'SILO') {
            await client.query(
                `INSERT INTO silo_staking_positions (wallet_address, token_ticker, amount_staked, status, tx_hash)
                 VALUES ($1, 'SILO', $2, 'ACTIVE', $3)`,
                [resolvedPrefixedWallet, deliveredTokens, txHash]
            );
        } else if (
            (settlementTarget === 'L1_KAS' ||
                settlementTarget === 'L1_SELF_CUSTODY') &&
            resolvedCleanWallet
        ) {
            try {
                const l1Res = await executeOrQueueL1Dispatch({
                    wallet: resolvedPrefixedWallet,
                    destinationAddress: resolvedPrefixedWallet,
                    asset: resolvedAsset,
                    amount: deliveredTokens,
                    sourceType: 'fiat_onramp_l1',
                    spotPrice: targetSpot
                });
                if (l1Res.txHash) txHash = l1Res.txHash;
                if (l1Res.status !== 'DISPATCHED_ONCHAIN') {
                    await creditWalletReservoirAndRedis(
                        client,
                        resolvedCleanWallet,
                        resolvedAsset,
                        deliveredTokens
                    );
                }
            } catch {
                await creditWalletReservoirAndRedis(
                    client,
                    resolvedCleanWallet,
                    resolvedAsset,
                    deliveredTokens
                );
            }
        } else if (resolvedCleanWallet) {
            await creditWalletReservoirAndRedis(
                client,
                resolvedCleanWallet,
                resolvedAsset,
                deliveredTokens
            );
        }

        // 60/40 Internal Treasury Split
        const lpCompound60Usd = roundCents(perenniaFeeUsd * 0.6);
        const liquidReserve40Usd = roundCents(
            Math.max(0, perenniaFeeUsd - lpCompound60Usd)
        );

        await client.query(
            `INSERT INTO fiat_onramp_orders
             (order_id, wallet_address, payment_rail, payment_method, tier_name,
              settlement_target, target_asset, target_spot_price, estimated_tokens, auto_stake_silo,
              quoted_principal_cents, perennia_fee_cents, stripe_gateway_fee_cents, gross_charge_cents,
              settled_net_cents, fulfilled_principal_cents, fiat_amount_usd, fee_usd, hard_cost_usd,
              guaranteed_profit_usd, net_usd_converted, locked_spot_price, estimated_kas, delivered_kas,
              wire_memo, stripe_payment_intent_id, master_treasury_fee_usdc, tx_hash, status)
             VALUES ($1, $2, 'STRIPE_ACH_DIRECT_DEBIT', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                     $14, $15, $16, $17, $18, $19, $20, $21, $22, $22, $1, $23, $19, $24, 'COMPLETED')
             ON CONFLICT (order_id) DO UPDATE SET
                settled_net_cents = EXCLUDED.settled_net_cents,
                fulfilled_principal_cents = EXCLUDED.fulfilled_principal_cents,
                target_spot_price = EXCLUDED.target_spot_price,
                estimated_tokens = EXCLUDED.estimated_tokens,
                delivered_kas = EXCLUDED.delivered_kas,
                master_treasury_fee_usdc = EXCLUDED.master_treasury_fee_usdc,
                stripe_payment_intent_id = COALESCE(NULLIF(EXCLUDED.stripe_payment_intent_id, ''), fiat_onramp_orders.stripe_payment_intent_id),
                tx_hash = EXCLUDED.tx_hash,
                status = 'COMPLETED',
                updated_at = CURRENT_TIMESTAMP`,
            [
                orderId,
                resolvedPrefixedWallet,
                paymentMethod,
                tierName,
                settlementTarget,
                resolvedAsset,
                targetSpot,
                deliveredTokens,
                autoStakeSilo,
                quotedPrincipalCents,
                perenniaFeeCents,
                stripeGatewayFeeCents,
                grossChargeCents,
                actualNetCents,
                safeFulfilledPrincipalCents,
                grossChargeUsd,
                totalFeeUsd,
                roundCents(stripeGatewayFeeCents / 100),
                perenniaFeeUsd,
                safePrincipalUsd,
                kasSpot,
                deliveredKas,
                piId || null,
                txHash
            ]
        );

        await client
            .query(
                `UPDATE fiat_float_ledger
                 SET dark_pool_lp_vault_usd = dark_pool_lp_vault_usd + $1,
                     master_treasury_usdc_reserve = COALESCE(master_treasury_usdc_reserve, 0.0) + $2,
                     commercial_checking_cleared_usd = commercial_checking_cleared_usd + $3,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE ledger_id IN ('PRIMARY_FLOAT', 'BOOTSTRAP_PRIMARY')`,
                [lpCompound60Usd, liquidReserve40Usd, safePrincipalUsd]
            )
            .catch(() => {});

        await redis
            .incrbyfloat('perennia:treasury:netting_profit_usd', perenniaFeeUsd)
            .catch(() => {});
        await redis
            .incrbyfloat(
                'perennia:fees:batch_accumulated:USDC',
                lpCompound60Usd
            )
            .catch(() => {});

        if (resolvedCleanWallet) {
            await client
                .query(
                    `INSERT INTO tax_ledger_events
                     (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash, cost_basis_usd, realized_gain_loss_usd, holding_period)
                     VALUES ($1, $2, 'FIAT_ONRAMP', $3, $4, $5, $6, $3, 0.0, 'SHORT_TERM')`,
                    [
                        resolvedCleanWallet,
                        resolvedAsset,
                        grossChargeUsd,
                        deliveredTokens,
                        targetSpot,
                        txHash
                    ]
                )
                .catch(() => {});

            const unitFmv =
                deliveredTokens > 0
                    ? grossChargeUsd / deliveredTokens
                    : targetSpot;
            await client
                .query(
                    `INSERT INTO hifo_tax_lots
                     (wallet_address, asset_ticker, kas_sompi, initial_tokens, remaining_sompi, remaining_tokens, fmv_usd_per_token, total_cost_basis_usd, source_event_type, source_tx_hash, status)
                     VALUES ($1, $2, $3, $4, $3, $4, $5, $6, 'FIAT_ONRAMP', $7, 'OPEN')`,
                    [
                        resolvedCleanWallet,
                        resolvedAsset,
                        Math.round(deliveredTokens * 1e8),
                        deliveredTokens,
                        unitFmv,
                        grossChargeUsd,
                        txHash
                    ]
                )
                .catch(() => {});
        }

        await redis
            .publish(
                'telemetry:updates',
                JSON.stringify({
                    fiat_event: true,
                    eventType: 'FIAT_ONRAMP',
                    status: 'COMPLETED',
                    wallet: resolvedCleanWallet,
                    sessionId: orderId,
                    assetTicker: resolvedAsset,
                    amountTokens: deliveredTokens,
                    fiatAmountUsd: grossChargeUsd,
                    spotPrice: targetSpot,
                    txHash
                })
            )
            .catch(() => {});

        return json({
            received: true,
            success: true,
            settled: true,
            quarantined: false,
            orderId,
            status: 'COMPLETED',
            targetAsset: resolvedAsset,
            deliveredTokens,
            deliveredKas,
            settledNetCents: actualNetCents,
            safeFulfilledPrincipalCents,
            perenniaFeeCents,
            txHash
        });
    } finally {
        client.release();
    }
};