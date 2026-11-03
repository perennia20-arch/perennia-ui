import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { dbPool } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import {
    isWalletMasterAdmin,
    normalizeKaspaAddressStrict,
    perenniaKMS
} from '$lib/server/kms';
import crypto from 'node:crypto';

function roundCents(val: number): number {
    return Math.round(val * 100) / 100;
}

function computePostTradeUsdAllocation(grossUsd: number) {
    const safeGross = Math.max(0, grossUsd);
    const wholesaleApiFloatSweepUsd = roundCents(safeGross * 0.485);
    const chronosMinerSettlementUsd = roundCents(safeGross * 0.49);
    const llcTaxAndRailReserveUsd = roundCents(safeGross * 0.007);
    const netProfitAndRatchetUsd = roundCents(
        Math.max(
            safeGross * 0.018,
            safeGross -
                wholesaleApiFloatSweepUsd -
                chronosMinerSettlementUsd -
                llcTaxAndRailReserveUsd
        )
    );
    const floatRatchetReinvestUsd = roundCents(netProfitAndRatchetUsd * 0.6);
    const darkPoolLpAndOwnerDrawUsd = roundCents(
        Math.max(0, netProfitAndRatchetUsd - floatRatchetReinvestUsd)
    );
    return {
        grossInboundUsd: roundCents(safeGross),
        wholesaleApiFloatSweepUsd,
        chronosMinerSettlementUsd,
        llcTaxAndRailReserveUsd,
        netProfitAndRatchetUsd,
        floatRatchetReinvestUsd,
        darkPoolLpAndOwnerDrawUsd
    };
}

function resolveChangeNowCurrencyAndNetwork(ticker: string): {
    currency: string;
    network: string;
} {
    switch (ticker.trim().toUpperCase()) {
        case 'KAS':
            return { currency: 'kas', network: 'kas' };
        case 'BTC':
            return { currency: 'btc', network: 'btc' };
        case 'ETH':
            return { currency: 'eth', network: 'eth' };
        case 'SOL':
            return { currency: 'sol', network: 'sol' };
        case 'USDC':
            return { currency: 'usdc', network: 'eth' };
        case 'USDT':
            return { currency: 'usdt', network: 'eth' };
        case 'XRP':
            return { currency: 'xrp', network: 'xrp' };
        case 'DOGE':
            return { currency: 'doge', network: 'doge' };
        case 'POL':
            return { currency: 'pol', network: 'matic' };
        case 'AVAX':
            return { currency: 'avax', network: 'cchain' };
        case 'SUI':
            return { currency: 'sui', network: 'sui' };
        case 'TRX':
            return { currency: 'trx', network: 'trx' };
        case 'ZEC':
            return { currency: 'zec', network: 'zec' };
        case 'ARB':
            return { currency: 'arb', network: 'arbitrum' };
        case 'BASE':
            return { currency: 'eth', network: 'base' };
        default:
            return { currency: 'usdc', network: 'eth' };
    }
}

async function fetchChangeNowEstimatedAmount(
    fromTicker: string,
    toTicker: string,
    fromAmount: number
): Promise<number> {
    const apiKey = (env.CHANGENOW_API_KEY || '').trim();
    if (!apiKey) {
        throw new Error(
            'CHANGENOW_API_KEY_MISSING: Set CHANGENOW_API_KEY in .env for live exchange quotes. Failing closed (503).'
        );
    }
    const fromSpec = resolveChangeNowCurrencyAndNetwork(fromTicker);
    const toSpec = resolveChangeNowCurrencyAndNetwork(toTicker);
    if (
        fromSpec.currency === toSpec.currency &&
        fromSpec.network === toSpec.network
    ) {
        return fromAmount;
    }
    const url = `https://api.changenow.io/v2/exchange/estimated-amount?fromCurrency=${encodeURIComponent(fromSpec.currency)}&toCurrency=${encodeURIComponent(toSpec.currency)}&fromAmount=${fromAmount.toFixed(8)}&fromNetwork=${encodeURIComponent(fromSpec.network)}&toNetwork=${encodeURIComponent(toSpec.network)}&flow=standard`;
    const res = await fetch(url, {
        headers: {
            'x-changenow-api-key': apiKey,
            accept: 'application/json'
        },
        signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(
            `CHANGENOW_QUOTE_REJECTED (${res.status}): ${errBody || 'ChangeNOW v2 estimated-amount failed.'}`
        );
    }
    const data = await res.json();
    const toAmount = Number(data?.toAmount ?? 0);
    if (!Number.isFinite(toAmount) || toAmount <= 0) {
        throw new Error('ChangeNOW v2 returned an invalid toAmount quote.');
    }
    return toAmount;
}

async function createChangeNowDropShipOrder(params: {
    fromTicker: string;
    toTicker: string;
    fromAmount: number;
    destinationAddress: string;
}): Promise<{ exchangeId: string; payinAddress: string }> {
    const apiKey = (env.CHANGENOW_API_KEY || '').trim();
    if (!apiKey) {
        throw new Error(
            'CHANGENOW_API_KEY_MISSING: Set CHANGENOW_API_KEY in .env for live drop-ship orders. Failing closed (503).'
        );
    }
    const fromSpec = resolveChangeNowCurrencyAndNetwork(params.fromTicker);
    const toSpec = resolveChangeNowCurrencyAndNetwork(params.toTicker);
    const res = await fetch('https://api.changenow.io/v2/exchange', {
        method: 'POST',
        headers: {
            'x-changenow-api-key': apiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            fromCurrency: fromSpec.currency,
            toCurrency: toSpec.currency,
            fromNetwork: fromSpec.network,
            toNetwork: toSpec.network,
            fromAmount: params.fromAmount.toFixed(8),
            address: params.destinationAddress.trim(),
            flow: 'standard'
        }),
        signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(
            `CHANGENOW_EXCHANGE_REJECTED (${res.status}): ${errBody || 'Unable to create ChangeNOW v2 exchange.'}`
        );
    }
    const data = await res.json();
    const exchangeId = String(data?.id || '').trim();
    const payinAddress = String(data?.payinAddress || '').trim();
    if (!exchangeId || !payinAddress) {
        throw new Error(
            'ChangeNOW v2 response missing id or payinAddress.'
        );
    }
    return { exchangeId, payinAddress };
}

function calculateOnrampCostPlusQuote(params: {
    assetTicker: string;
    grossUsd: number;
    spotPriceUsd: number;
    paymentRail?: string;
    settlementTarget?: string;
    autoStakeSilo?: boolean;
    bundledKasOrSilo?: boolean;
}) {
    const ticker = String(params.assetTicker || 'KAS').trim().toUpperCase();
    const gross = Math.max(10, Number(params.grossUsd || 250));
    const isWhaleWire = gross >= 2500;
    const isMidTier = gross >= 1000 && gross < 2500;
    const isSiloOrKasBundle =
        Boolean(params.autoStakeSilo) ||
        Boolean(params.bundledKasOrSilo) ||
        String(params.settlementTarget || '').toUpperCase() === 'AUTO_STAKE_SILO';

    let baseHardCost = 1.0;
    let baseProfit = 9.0;
    let competitorFee = 17.0;
    let routingTopology = 'LOCAL_CHRONOS_MINER_REPAR_0_PCT_EXCHANGE_FEE';

    if (ticker === 'USDC' && isSiloOrKasBundle) {
        baseHardCost = 0.0;
        baseProfit = 0.0;
        competitorFee = roundCents(Math.max(5.0, gross * 0.035));
        routingTopology = 'ZERO_FEE_USDC_BUNDLE_TO_KAS_SILO_VAULT';
    } else if (isWhaleWire) {
        const scale = gross / 2500;
        baseHardCost = roundCents(4.0 * scale);
        baseProfit = roundCents(Math.max(22.0 * scale, gross * 0.015));
        competitorFee = roundCents(gross * 0.035 + 15.0);
        routingTopology =
            ticker === 'KAS' || ticker === 'SILO'
                ? 'LOCAL_CHRONOS_MINER_REPAR_WHALE_WIRE'
                : 'CHANGENOW_V2_SINGLE_HOP_DROPSHIP';
    } else if (isMidTier) {
        if (ticker === 'USDC') {
            baseHardCost = roundCents(gross * 0.0005);
            baseProfit = roundCents(gross * 0.004);
            competitorFee = roundCents(gross * 0.025);
            routingTopology = 'CHANGENOW_V2_L2_BASE_USDC_DROPSHIP';
        } else {
            baseHardCost =
                ticker === 'KAS' || ticker === 'SILO'
                    ? roundCents(gross * 0.002)
                    : ticker === 'BTC'
                      ? roundCents(4.0 * Math.max(1, gross / 1000))
                      : roundCents(3.0 * Math.max(1, gross / 1000));
            baseProfit = roundCents(gross * 0.015);
            competitorFee = roundCents(gross * 0.034);
            routingTopology =
                ticker === 'KAS' || ticker === 'SILO'
                    ? 'LOCAL_CHRONOS_MINER_REPAR_NETTING'
                    : 'CHANGENOW_V2_SINGLE_HOP_DROPSHIP';
        }
    } else {
        switch (ticker) {
            case 'KAS':
            case 'SILO': {
                baseHardCost = roundCents(gross * 0.002);
                baseProfit = roundCents(gross * 0.018);
                competitorFee = roundCents(gross * 0.034);
                routingTopology = 'LOCAL_CHRONOS_MINER_REPAR_0_PCT_EXCHANGE_FEE';
                break;
            }
            case 'BTC': {
                const scale = Math.max(1, gross / 100);
                baseHardCost = roundCents(4.0 + (scale - 1) * 1.25);
                baseProfit = roundCents(3.0 * scale);
                competitorFee = roundCents(9.0 * scale);
                routingTopology = 'CHANGENOW_V2_SINGLE_HOP_BTC_DROPSHIP';
                break;
            }
            case 'ETH':
            case 'SOL': {
                const scale = gross / 100;
                baseHardCost = roundCents(1.5 * scale);
                baseProfit = roundCents(1.5 * scale);
                competitorFee = roundCents(6.0 * scale);
                routingTopology = `CHANGENOW_V2_SINGLE_HOP_${ticker}_DROPSHIP`;
                break;
            }
            case 'USDC':
            case 'USDT': {
                const scale = Math.max(1, gross / 100);
                baseHardCost = roundCents(0.35 * scale);
                baseProfit = roundCents(1.65 * scale);
                competitorFee = roundCents(5.0 * scale);
                routingTopology = 'CHANGENOW_V2_L2_BASE_POLYGON_USDC_DROPSHIP';
                break;
            }
            default: {
                const scale = gross / 100;
                baseHardCost = roundCents(1.5 * scale);
                baseProfit = roundCents(1.5 * scale);
                competitorFee = roundCents(6.0 * scale);
                routingTopology = `CHANGENOW_V2_SINGLE_HOP_${ticker}_DROPSHIP`;
                break;
            }
        }
    }

    const hardCostUsd = roundCents(baseHardCost);
    const feeUsd = roundCents(hardCostUsd + baseProfit);
    const effectiveFeePct = gross > 0 ? roundCents((feeUsd / gross) * 100) : 0;
    const netUsdConverted = roundCents(Math.max(0, gross - feeUsd));
    const competitorNetUsd = roundCents(Math.max(0, gross - competitorFee));
    const guestSavingsUsd = roundCents(Math.max(0, competitorFee - feeUsd));

    let circuitBreakerTripped = false;
    let circuitBreakerReason: string | undefined = undefined;

    if (!Number.isFinite(params.spotPriceUsd) || params.spotPriceUsd <= 0) {
        circuitBreakerTripped = true;
        circuitBreakerReason = `CIRCUIT_BREAKER_TRIPPED: Live oracle price feed for ${ticker} is offline; failing closed.`;
    } else if (feeUsd > competitorFee && competitorFee > 0) {
        circuitBreakerTripped = true;
        circuitBreakerReason = `CIRCUIT_BREAKER_TRIPPED: Quoted_Guest_Fee ($${feeUsd.toFixed(2)}) exceeded Competitor Ceiling ($${competitorFee.toFixed(2)}); failing closed.`;
    }

    const estimatedTokens =
        params.spotPriceUsd > 0
            ? Number((netUsdConverted / params.spotPriceUsd).toFixed(6))
            : 0;

    return {
        direction: 'ONRAMP' as const,
        assetTicker: ticker,
        grossUsd: roundCents(gross),
        hardCostUsd,
        guaranteedProfitUsd: baseProfit,
        feeUsd,
        effectiveFeePct,
        netUsdConverted,
        estimatedTokens,
        spotPriceUsd: params.spotPriceUsd,
        competitorFeeUsd: competitorFee,
        competitorNetUsd,
        guestSavingsUsd,
        routingTopology,
        paymentRail: isWhaleWire
            ? 'SOVEREIGN_WHALE_FEDWIRE_WAIVED'
            : String(params.paymentRail || 'SOVEREIGN_WIRE_ACH').toUpperCase(),
        whaleWireFeeWaived: isWhaleWire,
        bundledUsdcFeeWaived: ticker === 'USDC' && isSiloOrKasBundle,
        circuitBreakerTripped,
        circuitBreakerReason
    };
}

async function ensureFiatOnrampTables() {
    const client = await dbPool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS fiat_onramp_orders (
                order_id VARCHAR(80) PRIMARY KEY,
                wallet_address VARCHAR(255) NOT NULL,
                payment_rail VARCHAR(64) NOT NULL DEFAULT 'SOVEREIGN_WIRE_ACH',
                settlement_target VARCHAR(64) NOT NULL DEFAULT 'LEDGER_KAS',
                target_asset VARCHAR(32) NOT NULL DEFAULT 'KAS',
                target_spot_price DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                estimated_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                auto_stake_silo BOOLEAN NOT NULL DEFAULT FALSE,
                fiat_amount_usd DOUBLE PRECISION NOT NULL,
                fee_usd DOUBLE PRECISION NOT NULL,
                hard_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                guaranteed_profit_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                competitor_fee_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                guest_savings_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                net_usd_converted DOUBLE PRECISION NOT NULL,
                locked_spot_price DOUBLE PRECISION NOT NULL,
                estimated_kas DOUBLE PRECISION NOT NULL,
                delivered_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                wire_memo VARCHAR(80) NOT NULL,
                routing_topology VARCHAR(128),
                wholesale_order_id VARCHAR(96),
                wholesale_withdraw_id VARCHAR(96),
                changenow_exchange_id VARCHAR(128),
                payin_address VARCHAR(255),
                post_trade_sweep_json JSONB DEFAULT '{}'::jsonb,
                tx_hash VARCHAR(255),
                status VARCHAR(64) NOT NULL DEFAULT 'AWAITING_WIRE_RECEIPT',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS changenow_exchange_id VARCHAR(128);`
        );
        await client.query(
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS payin_address VARCHAR(255);`
        );
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

function getSovereignWireInstructions(
    wireMemo: string,
    settlementTarget: string,
    targetAsset: string = 'KAS'
) {
    return {
        beneficiaryName:
            (env.PERENNIA_WIRE_BENEFICIARY || '').trim() ||
            'Perennia Holdings, LLC — Sovereign Treasury',
        bankName:
            (env.PERENNIA_WIRE_BANK_NAME || '').trim() ||
            'Perennia Holdings Commercial Operating Vault',
        routingNumber: (env.PERENNIA_WIRE_ROUTING || '').trim(),
        accountNumber: (env.PERENNIA_WIRE_ACCOUNT || '').trim(),
        accountType: 'COMMERCIAL CHECKING',
        wireMemo,
        settlementTarget,
        targetAsset
    };
}

async function resolveLiveKasSpotUsd(): Promise<number> {
    const spotStr = await redis.get('oracle:spot:KAS_USDC').catch(() => null);
    if (spotStr) {
        const parsed = parseFloat(spotStr);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    try {
        const dbRes = await dbPool.query(
            `SELECT price_usd FROM rwa_oracle_feeds WHERE ticker = 'KAS' AND price_usd > 0 AND updated_at >= CURRENT_TIMESTAMP - INTERVAL '15 minutes' ORDER BY updated_at DESC LIMIT 1`
        );
        if (dbRes.rows.length > 0) {
            const dbPrice = Number(dbRes.rows[0].price_usd);
            if (Number.isFinite(dbPrice) && dbPrice > 0) {
                await redis
                    .set('oracle:spot:KAS_USDC', String(dbPrice), 'EX', 30)
                    .catch(() => {});
                return dbPrice;
            }
        }
    } catch {
        // Continue to live exchange fallback
    }
    try {
        const mexcRes = await fetch(
            'https://api.mexc.com/api/v3/ticker/price?symbol=KASUSDT',
            { signal: AbortSignal.timeout(3000) }
        );
        if (mexcRes.ok) {
            const mexcData = await mexcRes.json();
            const p = parseFloat(String(mexcData?.price || '0'));
            if (Number.isFinite(p) && p > 0) {
                await redis
                    .set('oracle:spot:KAS_USDC', String(p), 'EX', 30)
                    .catch(() => {});
                return p;
            }
        }
    } catch {
        // Continue
    }
    try {
        const cgRes = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=kaspa&vs_currencies=usd',
            { signal: AbortSignal.timeout(3000) }
        );
        if (cgRes.ok) {
            const cgData = await cgRes.json();
            const p = Number(cgData?.kaspa?.usd || 0);
            if (Number.isFinite(p) && p > 0) {
                await redis
                    .set('oracle:spot:KAS_USDC', String(p), 'EX', 30)
                    .catch(() => {});
                return p;
            }
        }
    } catch {
        // Fail closed
    }
    return 0;
}

async function resolveLiveTargetAssetSpotUsd(
    rawTicker: string,
    kasSpotPrice: number
): Promise<number> {
    const ticker = String(rawTicker || 'KAS').trim().toUpperCase();
    if (ticker === 'KAS') return kasSpotPrice;
    if (ticker === 'USDC' || ticker === 'USDT' || ticker === 'USD') return 1.0;

    const cachedSpotStr = await redis
        .get(`oracle:spot:${ticker}_USDC`)
        .catch(() => null);
    if (cachedSpotStr) {
        const parsed = parseFloat(cachedSpotStr);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }

    try {
        const rwaRes = await dbPool.query(
            `SELECT price_usd FROM rwa_oracle_feeds WHERE ticker = $1 AND price_usd > 0 AND updated_at >= CURRENT_TIMESTAMP - INTERVAL '15 minutes' ORDER BY updated_at DESC LIMIT 1`,
            [ticker]
        );
        if (rwaRes.rows.length > 0) {
            const dbPrice = Number(rwaRes.rows[0].price_usd || 0);
            if (Number.isFinite(dbPrice) && dbPrice > 0) {
                await redis
                    .set(`oracle:spot:${ticker}_USDC`, String(dbPrice), 'EX', 30)
                    .catch(() => {});
                return dbPrice;
            }
        }
    } catch {
        // Continue
    }

    if (ticker === 'SILO' && kasSpotPrice > 0) {
        return Number((kasSpotPrice / 23.809524).toFixed(6));
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

async function isAuthorizedDirectorRequest(
    request: Request,
    sessionWallet: string
): Promise<boolean> {
    const authHeader = request.headers.get('authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
        try {
            if (perenniaKMS.verifyMasterAdminKey(authHeader)) {
                return true;
            }
        } catch {
            // Fall through to session check
        }
    }
    return isWalletMasterAdmin(sessionWallet);
}

export const GET: RequestHandler = async ({ cookies, locals, url }: RequestEvent) => {
    const quoteAsset = url.searchParams.get('quoteAsset');
    if (quoteAsset) {
        const grossUsd = Number(url.searchParams.get('amountUsd') || 500);
        const kasSpot = await resolveLiveKasSpotUsd();
        const targetSpot = await resolveLiveTargetAssetSpotUsd(quoteAsset, kasSpot);
        const quote = calculateOnrampCostPlusQuote({
            assetTicker: quoteAsset,
            grossUsd,
            spotPriceUsd: targetSpot,
            paymentRail: url.searchParams.get('paymentRail') || 'SOVEREIGN_WIRE_ACH',
            settlementTarget: url.searchParams.get('settlementTarget') || 'LEDGER_KAS',
            autoStakeSilo: url.searchParams.get('autoStakeSilo') === 'true',
            bundledKasOrSilo: url.searchParams.get('bundledKasOrSilo') === 'true'
        });

        if (quote.circuitBreakerTripped) {
            return json(
                {
                    success: false,
                    circuitBreakerTripped: true,
                    error: quote.circuitBreakerReason,
                    quote
                },
                { status: 503 }
            );
        }

        const cleanTicker = quoteAsset.trim().toUpperCase();
        if (cleanTicker !== 'KAS' && cleanTicker !== 'SILO' && cleanTicker !== 'USDC') {
            try {
                const liveChangeNowOut = await fetchChangeNowEstimatedAmount(
                    'USDC',
                    cleanTicker,
                    quote.netUsdConverted
                );
                if (liveChangeNowOut > 0) {
                    quote.estimatedTokens = Number(liveChangeNowOut.toFixed(6));
                }
            } catch (cnErr: any) {
                return json(
                    {
                        success: false,
                        circuitBreakerTripped: true,
                        error: cnErr.message,
                        quote
                    },
                    { status: 503 }
                );
            }
        }

        return json({
            success: true,
            quote,
            postTradeAllocation: computePostTradeUsdAllocation(quote.grossUsd)
        });
    }

    const sessionIdCookie = cookies.get('perennia_session');
    let sessionWallet = (locals as any).walletAddress || '';
    if (!sessionWallet && sessionIdCookie) {
        sessionWallet =
            (await redis.get(`session:${sessionIdCookie}`).catch(() => null)) || '';
    }

    await ensureFiatOnrampTables().catch(() => {});

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
                    targetAsset: r.target_asset || 'KAS',
                    targetSpotPrice: Number(
                        r.target_spot_price || r.locked_spot_price || 0
                    ),
                    estimatedTokens: Number(
                        r.estimated_tokens || r.estimated_kas || 0
                    ),
                    autoStakeSilo: Boolean(r.auto_stake_silo),
                    fiatAmountUsd: Number(r.fiat_amount_usd || 0),
                    feeUsd: Number(r.fee_usd || 0),
                    hardCostUsd: Number(r.hard_cost_usd || 0),
                    guaranteedProfitUsd: Number(r.guaranteed_profit_usd || 0),
                    competitorFeeUsd: Number(r.competitor_fee_usd || 0),
                    guestSavingsUsd: Number(r.guest_savings_usd || 0),
                    netUsdConverted: Number(r.net_usd_converted || 0),
                    spotPrice: Number(r.locked_spot_price || 0),
                    estimatedKas: Number(r.estimated_kas || 0),
                    deliveredKas: Number(r.delivered_kas || 0),
                    wireMemo: r.wire_memo,
                    routingTopology: r.routing_topology,
                    wholesaleOrderId: r.wholesale_order_id,
                    wholesaleWithdrawId: r.wholesale_withdraw_id,
                    changenowExchangeId: r.changenow_exchange_id || null,
                    payinAddress: r.payin_address || null,
                    postTradeAllocation: r.post_trade_sweep_json,
                    txHash: r.tx_hash,
                    status: r.status,
                    wireInstructions: getSovereignWireInstructions(
                        r.wire_memo,
                        r.settlement_target,
                        r.target_asset || 'KAS'
                    ),
                    createdAt: r.created_at
                        ? new Date(r.created_at).toISOString()
                        : new Date().toISOString()
                };
            }
        } catch {
            dbOrder = null;
        }
        const rawSession = await redis
            .get(`perennia:fiat:onramp_session:${cleanId}`)
            .catch(() => null);
        if (!rawSession && !dbOrder) {
            return json(
                { error: 'ONRAMP_SESSION_NOT_FOUND_OR_EXPIRED' },
                { status: 404 }
            );
        }
        const redisSession = rawSession ? JSON.parse(rawSession) : {};
        return json({
            success: true,
            session: dbOrder ? { ...redisSession, ...dbOrder } : redisSession
        });
    }

    const spotPrice = await resolveLiveKasSpotUsd();
    let recentOnrampSessions: any[] = [];
    let fiatLedgerEvents: any[] = [];
    let savedBankRailLast4: string | null = null;
    let savedBankRail: any = null;

    if (sessionWallet) {
        const formattedWallet = normalizeKaspaAddressStrict(sessionWallet);
        const cleanWallet = formattedWallet.replace(/^kaspa:/i, '');
        try {
            const [dbOrdersRes, railRes] = await Promise.all([
                dbPool.query(
                    `SELECT * FROM fiat_onramp_orders
                     WHERE wallet_address = $1 OR wallet_address = $2
                     ORDER BY created_at DESC
                     LIMIT 25`,
                    [formattedWallet, cleanWallet]
                ),
                dbPool
                    .query(
                        `SELECT bank_label, account_type, payout_method, bank_last4, updated_at
                         FROM fiat_bank_rails
                         WHERE wallet_address = $1 OR wallet_address = $2
                         ORDER BY updated_at DESC
                         LIMIT 1`,
                        [formattedWallet, cleanWallet]
                    )
                    .catch(() => ({ rows: [] as any[] }))
            ]);

            if (railRes.rows.length > 0) {
                const rr = railRes.rows[0];
                savedBankRailLast4 = String(rr.bank_last4 || '');
                savedBankRail = {
                    bankLabel: String(rr.bank_label || 'Primary Operating Account'),
                    accountType:
                        String(rr.account_type || 'CHECKING').toUpperCase() ===
                        'SAVINGS'
                            ? 'SAVINGS'
                            : 'CHECKING',
                    payoutMethod:
                        String(rr.payout_method || 'ACH').toUpperCase() === 'WIRE'
                            ? 'WIRE'
                            : 'ACH',
                    bankLast4: savedBankRailLast4,
                    updatedAt: rr.updated_at
                        ? new Date(rr.updated_at).toISOString()
                        : new Date().toISOString()
                };
            }

            recentOnrampSessions = dbOrdersRes.rows.map((r) => ({
                sessionId: r.order_id,
                orderId: r.order_id,
                walletAddress: r.wallet_address,
                paymentRail: r.payment_rail,
                settlementTarget: r.settlement_target,
                targetAsset: r.target_asset || 'KAS',
                targetSpotPrice: Number(
                    r.target_spot_price || r.locked_spot_price || 0
                ),
                estimatedTokens: Number(
                    r.estimated_tokens || r.estimated_kas || 0
                ),
                autoStakeSilo: Boolean(r.auto_stake_silo),
                fiatAmountUsd: Number(r.fiat_amount_usd || 0),
                feeUsd: Number(r.fee_usd || 0),
                hardCostUsd: Number(r.hard_cost_usd || 0),
                guaranteedProfitUsd: Number(r.guaranteed_profit_usd || 0),
                competitorFeeUsd: Number(r.competitor_fee_usd || 0),
                guestSavingsUsd: Number(r.guest_savings_usd || 0),
                netUsdConverted: Number(r.net_usd_converted || 0),
                spotPrice: Number(r.locked_spot_price || 0),
                estimatedKas: Number(r.estimated_kas || 0),
                deliveredKas: Number(r.delivered_kas || 0),
                wireMemo: r.wire_memo,
                routingTopology: r.routing_topology,
                wholesaleOrderId: r.wholesale_order_id,
                wholesaleWithdrawId: r.wholesale_withdraw_id,
                changenowExchangeId: r.changenow_exchange_id || null,
                payinAddress: r.payin_address || null,
                postTradeAllocation: r.post_trade_sweep_json,
                txHash: r.tx_hash,
                status: r.status,
                wireInstructions: getSovereignWireInstructions(
                    r.wire_memo,
                    r.settlement_target,
                    r.target_asset || 'KAS'
                ),
                createdAt: r.created_at
                    ? new Date(r.created_at).toISOString()
                    : new Date().toISOString()
            }));
        } catch {
            recentOnrampSessions = [];
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
        online: spotPrice > 0,
        nonKycEnabled: true,
        sovereignWireEnabled: true,
        changenowConfigured: Boolean((env.CHANGENOW_API_KEY || '').trim()),
        spotPrice,
        savedBankRailReady: Boolean(savedBankRailLast4),
        savedBankRailLast4,
        savedBankRail,
        destinationWallet: sessionWallet
            ? normalizeKaspaAddressStrict(sessionWallet)
            : null,
        recentOnrampSessions,
        fiatLedgerEvents
    });
};

export const POST: RequestHandler = async ({ request, cookies, locals }: RequestEvent) => {
    try {
        const sessionId = cookies.get('perennia_session');
        let sessionWallet = (locals as any).walletAddress || '';
        if (!sessionWallet && sessionId) {
            sessionWallet =
                (await redis.get(`session:${sessionId}`).catch(() => null)) || '';
        }

        await ensureFiatOnrampTables().catch(() => {});
        const body = await request.json().catch(() => ({}));
        const actionUpper = String(body.action || '').toUpperCase();

        if (actionUpper === 'CONFIRM_WIRE_RECEIPT' || actionUpper === 'ACH_CLEARED') {
            const isDirector = await isAuthorizedDirectorRequest(request, sessionWallet);
            if (!isDirector) {
                return json(
                    {
                        error: 'FORBIDDEN: Only the Master Treasury Director or authenticated banking webhook may clear inbound wire/ACH receipts.'
                    },
                    { status: 403 }
                );
            }

            const orderId = String(body.orderId || body.sessionId || '').trim();
            if (!orderId) {
                return json({ error: 'Missing orderId.' }, { status: 400 });
            }

            const client = await dbPool.connect();
            try {
                const existing = await client.query(
                    `SELECT * FROM fiat_onramp_orders WHERE order_id = $1 LIMIT 1`,
                    [orderId]
                );
                if (existing.rows.length === 0) {
                    return json(
                        { error: `On-ramp order ${orderId} not found.` },
                        { status: 404 }
                    );
                }
                const row = existing.rows[0];
                if (row.status === 'COMPLETED') {
                    return json({
                        success: true,
                        orderId,
                        status: 'COMPLETED',
                        stageIndex: 4
                    });
                }

                const cleanWallet = String(row.wallet_address || '')
                    .toLowerCase()
                    .replace(/^kaspa:/i, '')
                    .trim();
                const targetAsset = String(row.target_asset || 'KAS').toUpperCase();
                const kasSpot = await resolveLiveKasSpotUsd();
                const liveTargetSpot = await resolveLiveTargetAssetSpotUsd(
                    targetAsset,
                    kasSpot
                );
                if (liveTargetSpot <= 0 || kasSpot <= 0) {
                    return json(
                        {
                            error: `ORACLE_HALT: Cannot clear ${orderId} while live ${targetAsset} spot oracle is offline.`
                        },
                        { status: 503 }
                    );
                }

                const netUsd = Number(row.net_usd_converted || 0);
                const deliveredTokens = Number((netUsd / liveTargetSpot).toFixed(6));
                const deliveredKas = Number((netUsd / kasSpot).toFixed(4));
                const fiatUsd = Number(row.fiat_amount_usd || 0);
                const autoStakeSilo = Boolean(row.auto_stake_silo);
                const txHash =
                    body.txHash ||
                    `DROPSHIP-${targetAsset}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

                if (autoStakeSilo && targetAsset === 'SILO') {
                    await client.query(
                        `INSERT INTO silo_staking_positions (wallet_address, token_ticker, amount_staked, status, tx_hash)
                         VALUES ($1, 'SILO', $2, 'ACTIVE', $3)`,
                        [`kaspa:${cleanWallet}`, deliveredTokens, txHash]
                    );
                } else {
                    const userLedgerKey = `dev:sor:treasury:balances:${cleanWallet}`;
                    await redis
                        .hincrbyfloat(userLedgerKey, targetAsset, deliveredTokens)
                        .catch(() => {});
                }

                const sweepAllocation = computePostTradeUsdAllocation(fiatUsd);

                await client.query(
                    `UPDATE fiat_onramp_orders
                     SET status = 'COMPLETED',
                         delivered_kas = $2,
                         estimated_tokens = $3,
                         target_spot_price = $4,
                         post_trade_sweep_json = $5,
                         tx_hash = $6,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE order_id = $1`,
                    [
                        orderId,
                        deliveredKas,
                        deliveredTokens,
                        liveTargetSpot,
                        JSON.stringify(sweepAllocation),
                        txHash
                    ]
                );

                await client
                    .query(
                        `UPDATE fiat_float_ledger
                         SET local_kas_target_cap_usd = LEAST(ratchet_target_cap_usd, local_kas_target_cap_usd + $1),
                             wholesale_api_target_cap_usd = LEAST(ratchet_target_cap_usd, wholesale_api_target_cap_usd + $1),
                             llc_tax_escrow_reserve_usd = llc_tax_escrow_reserve_usd + $2,
                             dark_pool_lp_vault_usd = dark_pool_lp_vault_usd + $3,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE ledger_id IN ('PRIMARY_FLOAT', 'BOOTSTRAP_PRIMARY')`,
                        [
                            sweepAllocation.floatRatchetReinvestUsd * 0.5,
                            sweepAllocation.llcTaxAndRailReserveUsd,
                            sweepAllocation.darkPoolLpAndOwnerDrawUsd
                        ]
                    )
                    .catch(() => {});

                await client.query(
                    `INSERT INTO tax_ledger_events
                     (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash, cost_basis_usd, realized_gain_loss_usd, holding_period)
                     VALUES ($1, $2, 'FIAT_ONRAMP', $3, $4, $5, $6, $3, 0.0, 'SHORT_TERM')`,
                    [
                        cleanWallet,
                        targetAsset,
                        fiatUsd,
                        deliveredTokens,
                        liveTargetSpot,
                        txHash
                    ]
                );

                const unitFmv =
                    deliveredTokens > 0 ? fiatUsd / deliveredTokens : liveTargetSpot;
                await client.query(
                    `INSERT INTO hifo_tax_lots
                     (wallet_address, asset_ticker, kas_sompi, initial_tokens, remaining_sompi, remaining_tokens, fmv_usd_per_token, total_cost_basis_usd, source_event_type, source_tx_hash, status)
                     VALUES ($1, $2, $3, $4, $3, $4, $5, $6, 'FIAT_ONRAMP', $7, 'OPEN')`,
                    [
                        cleanWallet,
                        targetAsset,
                        Math.round(deliveredTokens * 1e8),
                        deliveredTokens,
                        unitFmv,
                        fiatUsd,
                        txHash
                    ]
                );

                await redis
                    .publish(
                        'telemetry:updates',
                        JSON.stringify({
                            fiat_event: true,
                            eventType: 'FIAT_ONRAMP',
                            status: 'COMPLETED',
                            wallet: cleanWallet,
                            sessionId: orderId,
                            assetTicker: targetAsset,
                            amountTokens: deliveredTokens,
                            fiatAmountUsd: fiatUsd,
                            spotPrice: liveTargetSpot,
                            postTradeAllocation: sweepAllocation,
                            txHash
                        })
                    )
                    .catch(() => {});

                return json({
                    success: true,
                    orderId,
                    status: 'COMPLETED',
                    stageIndex: 4,
                    executionLockedOnClearing: true,
                    deliveredTokens,
                    deliveredKas,
                    postTradeAllocation: sweepAllocation,
                    txHash
                });
            } finally {
                client.release();
            }
        }

        if (!sessionWallet) {
            return json(
                {
                    error: 'UNAUTHORIZED: Active Sovereign session required to initialize an On-Ramp order.'
                },
                { status: 401 }
            );
        }

        const formattedWallet = normalizeKaspaAddressStrict(sessionWallet);
        const cleanAddressOnly = formattedWallet.replace(/^kaspa:/i, '');
        if (cleanAddressOnly.length < 55) {
            return json(
                {
                    error: 'INVALID_KASPA_ADDRESS: Destination address must be a valid L1 Kaspa address.'
                },
                { status: 400 }
            );
        }

        const fiatAmountUsd = Math.max(10, Number(body.fiatAmountUsd || 250));
        const targetAsset = String(body.targetAsset || 'KAS').trim().toUpperCase();
        const kasSpotPrice = await resolveLiveKasSpotUsd();
        const targetSpotPrice = await resolveLiveTargetAssetSpotUsd(
            targetAsset,
            kasSpotPrice
        );

        const requestedTarget = String(
            body.settlementTarget || 'LEDGER_KAS'
        ).toUpperCase();
        const autoStakeSilo =
            targetAsset === 'SILO' &&
            (Boolean(body.autoStakeSilo) || requestedTarget === 'AUTO_STAKE_SILO');
        const bundledKasOrSilo =
            Boolean(body.bundledKasOrSilo) ||
            autoStakeSilo ||
            requestedTarget === 'AUTO_STAKE_SILO';

        const quote = calculateOnrampCostPlusQuote({
            assetTicker: targetAsset,
            grossUsd: fiatAmountUsd,
            spotPriceUsd: targetSpotPrice,
            paymentRail: body.paymentRail,
            settlementTarget: requestedTarget,
            autoStakeSilo,
            bundledKasOrSilo
        });

        if (quote.circuitBreakerTripped) {
            return json(
                {
                    error: quote.circuitBreakerReason,
                    circuitBreakerTripped: true,
                    quote
                },
                { status: 503 }
            );
        }

        let changenowExchangeId: string | null = null;
        let payinAddress: string | null = null;

        if (targetAsset !== 'KAS' && targetAsset !== 'SILO' && targetAsset !== 'USDC') {
            try {
                const liveEst = await fetchChangeNowEstimatedAmount(
                    'USDC',
                    targetAsset,
                    quote.netUsdConverted
                );
                if (liveEst > 0) {
                    quote.estimatedTokens = Number(liveEst.toFixed(6));
                }
                const destAddr = String(
                    body.destinationAddress || formattedWallet
                ).trim();
                if (destAddr && !destAddr.startsWith('kaspa:')) {
                    const cnOrder = await createChangeNowDropShipOrder({
                        fromTicker: 'USDC',
                        toTicker: targetAsset,
                        fromAmount: quote.netUsdConverted,
                        destinationAddress: destAddr
                    });
                    changenowExchangeId = cnOrder.exchangeId;
                    payinAddress = cnOrder.payinAddress;
                }
            } catch (cnErr: any) {
                return json(
                    {
                        error: cnErr.message,
                        circuitBreakerTripped: true,
                        quote
                    },
                    { status: 503 }
                );
            }
        }

        const onrampSessionId = `PER-ONRAMP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const clientSecret = `per_sec_${crypto.randomBytes(16).toString('hex')}`;
        const wireMemo = onrampSessionId;
        const estimatedKas = Number((quote.netUsdConverted / kasSpotPrice).toFixed(4));
        const postTradeAllocation = computePostTradeUsdAllocation(quote.grossUsd);
        const initialStatus = 'AWAITING_WIRE_RECEIPT';
        const settlementTarget = autoStakeSilo
            ? 'AUTO_STAKE_SILO'
            : requestedTarget === 'L1_KAS'
              ? 'L1_KAS'
              : 'LEDGER_KAS';

        const wholesaleOrderId = changenowExchangeId
            ? `CHANGENOW-V2-${changenowExchangeId}`
            : targetAsset === 'KAS' || targetAsset === 'SILO'
              ? `CHRONOS-REPAR-${onrampSessionId.slice(-6)}`
              : `CHANGENOW-QUOTE-${onrampSessionId.slice(-6)}`;
        const wholesaleWithdrawId =
            targetAsset === 'KAS' || targetAsset === 'SILO'
                ? `LOCAL-VAULT-UTXO-${onrampSessionId.slice(-6)}`
                : `DROPSHIP-WD-${onrampSessionId.slice(-6)}`;

        const wireInstructions = getSovereignWireInstructions(
            wireMemo,
            settlementTarget,
            targetAsset
        );

        await dbPool.query(
            `INSERT INTO fiat_onramp_orders
             (order_id, wallet_address, payment_rail, settlement_target, target_asset, target_spot_price,
              estimated_tokens, auto_stake_silo, fiat_amount_usd, fee_usd, hard_cost_usd, guaranteed_profit_usd,
              competitor_fee_usd, guest_savings_usd, net_usd_converted, locked_spot_price, estimated_kas,
              delivered_kas, wire_memo, routing_topology, wholesale_order_id, wholesale_withdraw_id,
              changenow_exchange_id, payin_address, post_trade_sweep_json, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 0.0, $18, $19, $20, $21, $22, $23, $24, $25)`,
            [
                onrampSessionId,
                formattedWallet,
                quote.paymentRail,
                settlementTarget,
                targetAsset,
                targetSpotPrice,
                quote.estimatedTokens,
                autoStakeSilo,
                quote.grossUsd,
                quote.feeUsd,
                quote.hardCostUsd,
                quote.guaranteedProfitUsd,
                quote.competitorFeeUsd,
                quote.guestSavingsUsd,
                quote.netUsdConverted,
                kasSpotPrice,
                estimatedKas,
                wireMemo,
                quote.routingTopology,
                wholesaleOrderId,
                wholesaleWithdrawId,
                changenowExchangeId,
                payinAddress,
                JSON.stringify(postTradeAllocation),
                initialStatus
            ]
        );

        const sessionRecord = {
            sessionId: onrampSessionId,
            orderId: onrampSessionId,
            clientSecret,
            walletAddress: formattedWallet,
            fiatAmountUsd: quote.grossUsd,
            feeUsd: quote.feeUsd,
            hardCostUsd: quote.hardCostUsd,
            guaranteedProfitUsd: quote.guaranteedProfitUsd,
            competitorFeeUsd: quote.competitorFeeUsd,
            guestSavingsUsd: quote.guestSavingsUsd,
            netUsdConverted: quote.netUsdConverted,
            spotPrice: kasSpotPrice,
            targetAsset,
            targetSpotPrice,
            estimatedKas,
            estimatedTokens: quote.estimatedTokens,
            autoStakeSilo,
            whaleWireFeeWaived: quote.whaleWireFeeWaived,
            bundledUsdcFeeWaived: quote.bundledUsdcFeeWaived,
            paymentRail: quote.paymentRail,
            settlementTarget,
            routingTopology: quote.routingTopology,
            wholesaleOrderId,
            wholesaleWithdrawId,
            changenowExchangeId,
            payinAddress,
            postTradeAllocation,
            wireMemo,
            wireInstructions,
            txHash: null,
            stageIndex: 1,
            status: initialStatus,
            nonKycTier: quote.whaleWireFeeWaived
                ? 'WHALE_FEDWIRE_WAIVED'
                : 'SOVEREIGN_WIRE_ACH',
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        };

        await redis
            .set(
                `perennia:fiat:onramp_session:${onrampSessionId}`,
                JSON.stringify(sessionRecord),
                'EX',
                86400
            )
            .catch(() => {});

        await redis
            .publish(
                'telemetry:updates',
                JSON.stringify({
                    fiat_event: true,
                    eventType: 'FIAT_ONRAMP_CREATED',
                    status: initialStatus,
                    wallet: cleanAddressOnly,
                    sessionId: onrampSessionId,
                    assetTicker: targetAsset,
                    amountTokens: quote.estimatedTokens,
                    fiatAmountUsd: quote.grossUsd,
                    spotPrice: targetSpotPrice,
                    autoStakeSilo,
                    order: sessionRecord
                })
            )
            .catch(() => {});

        return json({
            success: true,
            ...sessionRecord
        });
    } catch (error: any) {
        console.error('Sovereign Fiat On-Ramp Session Error:', error);
        const msg =
            error?.message ||
            'Failed to initialize Sovereign Fiat On-Ramp session.';
        return json(
            { error: msg },
            {
                status:
                    msg.includes('ORACLE_HALT') ||
                    msg.includes('CHANGENOW') ||
                    msg.includes('CIRCUIT_BREAKER')
                        ? 503
                        : 500
            }
        );
    }
};