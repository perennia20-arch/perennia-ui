import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { dbPool } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import crypto from 'node:crypto';

function normalizeKaspaAddress(raw: string): string {
    const clean = raw.trim().toLowerCase().replace(/^kaspa:/i, '').trim();
    return `kaspa:${clean}`;
}

async function ensureFiatOnrampTable() {
    const client = await dbPool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS fiat_onramp_orders (
                order_id VARCHAR(80) PRIMARY KEY,
                wallet_address VARCHAR(255) NOT NULL,
                payment_rail VARCHAR(40) NOT NULL DEFAULT 'SOVEREIGN_WIRE_ACH',
                settlement_target VARCHAR(32) NOT NULL DEFAULT 'LEDGER_KAS',
                fiat_amount_usd DOUBLE PRECISION NOT NULL,
                fee_usd DOUBLE PRECISION NOT NULL,
                net_usd_converted DOUBLE PRECISION NOT NULL,
                locked_spot_price DOUBLE PRECISION NOT NULL,
                estimated_kas DOUBLE PRECISION NOT NULL,
                delivered_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                wire_memo VARCHAR(80) NOT NULL,
                tx_hash VARCHAR(255),
                status VARCHAR(40) NOT NULL DEFAULT 'AWAITING_WIRE_RECEIPT',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
    } finally {
        client.release();
    }
}

function getSovereignWireInstructions(wireMemo: string, settlementTarget: string) {
    return {
        beneficiaryName: env.PERENNIA_WIRE_BENEFICIARY || 'Perennia Holdings, LLC — Sovereign Treasury',
        bankName: env.PERENNIA_WIRE_BANK_NAME || 'Mercury / Column N.A. Commercial Vault',
        routingNumber: env.PERENNIA_WIRE_ROUTING || '021000021',
        accountNumber: env.PERENNIA_WIRE_ACCOUNT || '8804921044',
        accountType: 'COMMERCIAL CHECKING',
        wireMemo,
        settlementTarget
    };
}

export const GET: RequestHandler = async ({ cookies, locals, url }: RequestEvent) => {
    const sessionIdCookie = cookies.get('perennia_session');
    let sessionWallet = (locals as any).walletAddress || '';
    if (!sessionWallet && sessionIdCookie) {
        sessionWallet = (await redis.get(`session:${sessionIdCookie}`)) || '';
    }

    await ensureFiatOnrampTable().catch(() => {});

    const requestedSessionId = url.searchParams.get('sessionId');
    if (requestedSessionId) {
        const cleanId = requestedSessionId.trim();
        let dbOrder: any = null;
        try {
            const dbRes = await dbPool.query(
                `SELECT * FROM fiat_onramp_orders WHERE order_id = $1 LIMIT 1`,
                [cleanId]
            );
            if (dbRes.rows.length > 0) {
                const r = dbRes.rows[0];
                dbOrder = {
                    sessionId: r.order_id,
                    orderId: r.order_id,
                    walletAddress: r.wallet_address,
                    paymentRail: r.payment_rail,
                    settlementTarget: r.settlement_target,
                    fiatAmountUsd: Number(r.fiat_amount_usd || 0),
                    feeUsd: Number(r.fee_usd || 0),
                    netUsdConverted: Number(r.net_usd_converted || 0),
                    spotPrice: Number(r.locked_spot_price || 0),
                    estimatedKas: Number(r.estimated_kas || 0),
                    deliveredKas: Number(r.delivered_kas || 0),
                    wireMemo: r.wire_memo,
                    txHash: r.tx_hash,
                    status: r.status,
                    wireInstructions: getSovereignWireInstructions(
                        r.wire_memo,
                        r.settlement_target
                    ),
                    createdAt: r.created_at
                        ? new Date(r.created_at).toISOString()
                        : new Date().toISOString()
                };
            }
        } catch {
            dbOrder = null;
        }

        const rawSession = await redis.get(`perennia:fiat:onramp_session:${cleanId}`);
        if (!rawSession && !dbOrder) {
            return json(
                { error: 'ONRAMP_SESSION_NOT_FOUND_OR_EXPIRED' },
                { status: 404 }
            );
        }

        const redisSession = rawSession ? JSON.parse(rawSession) : {};
        const mergedSession = dbOrder
            ? { ...redisSession, ...dbOrder }
            : redisSession;

        return json({
            success: true,
            session: mergedSession
        });
    }

    const spotStr = await redis.get('oracle:spot:KAS_USDC');
    const spotPrice = spotStr ? parseFloat(spotStr) : 0;

    let recentOnrampSessions: any[] = [];
    let fiatLedgerEvents: any[] = [];

    if (sessionWallet) {
        const formattedWallet = normalizeKaspaAddress(sessionWallet);
        const cleanWallet = formattedWallet.replace(/^kaspa:/i, '');

        try {
            const dbOrdersRes = await dbPool.query(
                `SELECT * FROM fiat_onramp_orders
                 WHERE wallet_address = $1 OR wallet_address = $2
                 ORDER BY created_at DESC
                 LIMIT 25`,
                [formattedWallet, cleanWallet]
            );
            recentOnrampSessions = dbOrdersRes.rows.map((r) => ({
                sessionId: r.order_id,
                orderId: r.order_id,
                walletAddress: r.wallet_address,
                paymentRail: r.payment_rail,
                settlementTarget: r.settlement_target,
                fiatAmountUsd: Number(r.fiat_amount_usd || 0),
                feeUsd: Number(r.fee_usd || 0),
                netUsdConverted: Number(r.net_usd_converted || 0),
                spotPrice: Number(r.locked_spot_price || 0),
                estimatedKas: Number(r.estimated_kas || 0),
                deliveredKas: Number(r.delivered_kas || 0),
                wireMemo: r.wire_memo,
                txHash: r.tx_hash,
                status: r.status,
                wireInstructions: getSovereignWireInstructions(
                    r.wire_memo,
                    r.settlement_target
                ),
                createdAt: r.created_at
                    ? new Date(r.created_at).toISOString()
                    : new Date().toISOString()
            }));
        } catch {
            recentOnrampSessions = [];
        }

        if (recentOnrampSessions.length === 0) {
            try {
                const rawHistory = await redis.lrange(
                    `perennia:fiat:onramp_history:${cleanWallet}`,
                    0,
                    19
                );
                const parsedHistory = (rawHistory || [])
                    .map((item) => {
                        try {
                            return JSON.parse(item);
                        } catch {
                            return null;
                        }
                    })
                    .filter(Boolean);
                recentOnrampSessions = parsedHistory;
            } catch {
                recentOnrampSessions = [];
            }
        }

        try {
            const dbRes = await dbPool.query(
                `SELECT event_id, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, recorded_at
                 FROM tax_ledger_events
                 WHERE (wallet_address = $1 OR wallet_address = $2)
                   AND event_type IN ('FIAT_ONRAMP', 'FIAT_OFFRAMP', 'FIAT_REFUND')
                 ORDER BY recorded_at DESC
                 LIMIT 25`,
                [cleanWallet, formattedWallet]
            );
            fiatLedgerEvents = dbRes.rows.map((r) => ({
                id: r.event_id,
                assetTicker: r.asset_ticker,
                eventType: r.event_type,
                grossUsd: Number(r.gross_proceeds_usd || 0),
                amountTokens: Number(r.amount_tokens || 0),
                spotPrice: Number(r.spot_price_at_execution || 0),
                timestamp: new Date(r.recorded_at).toLocaleString()
            }));
        } catch {
            fiatLedgerEvents = [];
        }
    }

    return json({
        online: true,
        nonKycEnabled: true,
        sovereignWireEnabled: true,
        spotPrice,
        destinationWallet: sessionWallet ? normalizeKaspaAddress(sessionWallet) : null,
        recentOnrampSessions,
        fiatLedgerEvents
    });
};

export const POST: RequestHandler = async ({ request, cookies, locals }: RequestEvent) => {
    try {
        const sessionId = cookies.get('perennia_session');
        let sessionWallet = (locals as any).walletAddress || '';
        if (!sessionWallet && sessionId) {
            sessionWallet = (await redis.get(`session:${sessionId}`)) || '';
        }

        const body = await request.json().catch(() => ({}));
        const rawWallet = body.walletAddress || sessionWallet;
        if (!rawWallet || typeof rawWallet !== 'string') {
            return json(
                {
                    error: 'SOVEREIGN_WALLET_REQUIRED: Connect your Sovereign Kaspa wallet to initialize an On-Ramp session.'
                },
                { status: 400 }
            );
        }

        const formattedWallet = normalizeKaspaAddress(rawWallet);
        const cleanAddressOnly = formattedWallet.replace(/^kaspa:/i, '');
        if (cleanAddressOnly.length < 55) {
            return json(
                {
                    error: 'INVALID_KASPA_ADDRESS: Destination address must be a valid L1 Kaspa address.'
                },
                { status: 400 }
            );
        }

        const fiatAmountUsd = Math.max(25, Number(body.fiatAmountUsd || 250));
        const rawRail = String(body.paymentRail || 'CARD_INSTANT').toUpperCase();
        const isSovereignWire =
            rawRail === 'SOVEREIGN_WIRE_ACH' ||
            rawRail === 'ACH_BANK' ||
            rawRail === 'WIRE';
        const paymentRail = isSovereignWire ? 'SOVEREIGN_WIRE_ACH' : 'CARD_INSTANT';
        const settlementTarget =
            String(body.settlementTarget || 'LEDGER_KAS').toUpperCase() === 'L1_KAS'
                ? 'L1_KAS'
                : 'LEDGER_KAS';

        let spotPrice = 0;
        const spotStr = await redis.get('oracle:spot:KAS_USDC');
        if (spotStr) {
            spotPrice = parseFloat(spotStr);
        }
        if (!spotPrice || spotPrice <= 0) {
            try {
                const cgRes = await fetch(
                    'https://api.coingecko.com/api/v3/simple/price?ids=kaspa&vs_currencies=usd',
                    { signal: AbortSignal.timeout(4000) }
                );
                if (cgRes.ok) {
                    const cgData = await cgRes.json();
                    if (cgData?.kaspa?.usd) {
                        spotPrice = Number(cgData.kaspa.usd);
                        await redis.set('oracle:spot:KAS_USDC', String(spotPrice), 'EX', 30);
                    }
                }
            } catch {
                // Ignore fallback timeout
            }
        }
        if (!spotPrice || spotPrice <= 0) {
            return json(
                {
                    error: 'ORACLE_SYNC_PENDING: Live KAS/USD spot oracle is synchronizing. Please retry in a few seconds.'
                },
                { status: 503 }
            );
        }

        const isWhale = fiatAmountUsd >= 2000.0;
        const gatewayFeeRate = isSovereignWire
            ? isWhale
                ? 0.005
                : 0.0075
            : 0.0125;
        const feeUsd = Number((fiatAmountUsd * gatewayFeeRate).toFixed(2));
        const netUsdConverted = Number(Math.max(0, fiatAmountUsd - feeUsd).toFixed(2));
        const estimatedKas = Number((netUsdConverted / spotPrice).toFixed(4));

        const onrampSessionId = `PER-ONRAMP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const clientSecret = `per_sec_${crypto.randomBytes(16).toString('hex')}`;
        const wireMemo = onrampSessionId;

        const transakApiKey = env.TRANSAK_API_KEY || '';
        const widgetParams = new URLSearchParams({
            cryptoCurrencyCode: 'KAS',
            network: 'kaspa',
            walletAddress: formattedWallet,
            fiatCurrency: 'USD',
            fiatAmount: fiatAmountUsd.toString(),
            disableWalletAddressForm: 'true',
            themeColor: '18C6A5',
            partnerOrderId: onrampSessionId
        });
        if (transakApiKey) {
            widgetParams.set('apiKey', transakApiKey);
        }
        const widgetUrl = `https://global.transak.com/?${widgetParams.toString()}`;
        const initialStatus = isSovereignWire
            ? 'AWAITING_WIRE_RECEIPT'
            : 'ARMED_NON_KYC';
        const wireInstructions = getSovereignWireInstructions(
            wireMemo,
            settlementTarget
        );

        await ensureFiatOnrampTable();
        await dbPool.query(
            `INSERT INTO fiat_onramp_orders
             (order_id, wallet_address, payment_rail, settlement_target, fiat_amount_usd, fee_usd, net_usd_converted, locked_spot_price, estimated_kas, delivered_kas, wire_memo, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0.0, $10, $11)`,
            [
                onrampSessionId,
                formattedWallet,
                paymentRail,
                settlementTarget,
                fiatAmountUsd,
                feeUsd,
                netUsdConverted,
                spotPrice,
                estimatedKas,
                wireMemo,
                initialStatus
            ]
        );

        const sessionRecord = {
            sessionId: onrampSessionId,
            orderId: onrampSessionId,
            clientSecret,
            walletAddress: formattedWallet,
            fiatAmountUsd,
            feeUsd,
            netUsdConverted,
            spotPrice,
            estimatedKas,
            paymentRail,
            settlementTarget,
            wireMemo,
            wireInstructions,
            nonKycLimitUsd: 1000,
            widgetUrl,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            status: initialStatus
        };

        await redis.set(
            `perennia:fiat:onramp_session:${onrampSessionId}`,
            JSON.stringify(sessionRecord),
            'EX',
            86400
        );
        await redis.lpush(
            `perennia:fiat:onramp_history:${cleanAddressOnly}`,
            JSON.stringify(sessionRecord)
        );
        await redis.ltrim(`perennia:fiat:onramp_history:${cleanAddressOnly}`, 0, 24);

        await redis.publish(
            'telemetry:updates',
            JSON.stringify({
                fiat_event: true,
                eventType: 'FIAT_ONRAMP_CREATED',
                wallet: cleanAddressOnly,
                order: sessionRecord
            })
        );

        return json({
            success: true,
            sessionId: onrampSessionId,
            orderId: onrampSessionId,
            clientSecret,
            walletAddress: formattedWallet,
            fiatAmountUsd,
            feeUsd,
            netUsdConverted,
            spotPrice,
            estimatedKas,
            paymentRail,
            settlementTarget,
            wireMemo,
            wireInstructions,
            status: sessionRecord.status,
            nonKycTier: isSovereignWire
                ? 'SOVEREIGN_WIRE_ACH'
                : fiatAmountUsd <= 1000
                  ? 'INSTANT_NON_KYC'
                  : 'STANDARD_LIMIT',
            widgetUrl,
            expiresAt: sessionRecord.expiresAt
        });
    } catch (error: any) {
        console.error('Sovereign Fiat On-Ramp Session Error:', error);
        return json(
            { error: error.message || 'Failed to initialize Sovereign Fiat On-Ramp session.' },
            { status: 500 }
        );
    }
};