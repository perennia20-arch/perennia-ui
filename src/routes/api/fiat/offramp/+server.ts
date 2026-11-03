import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import {
    getKycMasterKeyStrict,
    encryptBankRailRecordStrict,
    decryptBankRailRecordStrict,
    resolveMasterTreasuryKasAddress,
    isWalletMasterAdmin,
    normalizeKaspaAddressStrict,
    perenniaKMS,
    type DecryptedBankRailPayload
} from '$lib/server/kms';
import crypto from 'node:crypto';

const LUA_ATOMIC_DEBIT_FIAT_LEDGER = `
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

function roundCents(val: number): number {
    return Math.round(val * 100) / 100;
}

function resolveChangeNowCurrencyAndNetwork(ticker: string): {
    currency: string;
    network: string;
    confirmationsRequired: number;
} {
    switch (ticker.trim().toUpperCase()) {
        case 'KAS':
            return { currency: 'kas', network: 'kas', confirmationsRequired: 10 };
        case 'BTC':
            return { currency: 'btc', network: 'btc', confirmationsRequired: 2 };
        case 'ETH':
            return { currency: 'eth', network: 'eth', confirmationsRequired: 6 };
        case 'SOL':
            return { currency: 'sol', network: 'sol', confirmationsRequired: 12 };
        case 'USDC':
            return { currency: 'usdc', network: 'eth', confirmationsRequired: 6 };
        case 'USDT':
            return { currency: 'usdt', network: 'eth', confirmationsRequired: 6 };
        case 'XRP':
            return { currency: 'xrp', network: 'xrp', confirmationsRequired: 4 };
        case 'DOGE':
            return { currency: 'doge', network: 'doge', confirmationsRequired: 6 };
        case 'POL':
            return { currency: 'pol', network: 'matic', confirmationsRequired: 12 };
        case 'AVAX':
            return { currency: 'avax', network: 'cchain', confirmationsRequired: 12 };
        case 'SUI':
            return { currency: 'sui', network: 'sui', confirmationsRequired: 12 };
        case 'TRX':
            return { currency: 'trx', network: 'trx', confirmationsRequired: 12 };
        case 'ZEC':
            return { currency: 'zec', network: 'zec', confirmationsRequired: 6 };
        case 'ARB':
            return { currency: 'arb', network: 'arbitrum', confirmationsRequired: 12 };
        case 'BASE':
            return { currency: 'eth', network: 'base', confirmationsRequired: 12 };
        default:
            return { currency: 'usdc', network: 'eth', confirmationsRequired: 6 };
    }
}

async function resolveMasterTreasuryKasFromDbOrEnv(): Promise<string> {
    try {
        const dbRes = await dbPool.query(
            `SELECT cold_kas_address FROM system_treasury_config WHERE config_id = 'PRIMARY' LIMIT 1`
        );
        const candidate = String(dbRes.rows[0]?.cold_kas_address || '').trim();
        if (candidate && candidate.startsWith('kaspa:') && candidate.length >= 60) {
            return candidate.toLowerCase();
        }
    } catch {
        // Fall through to .env lookup
    }
    return resolveMasterTreasuryKasAddress();
}

async function createChangeNowOfframpDepositOrder(params: {
    sourceAsset: string;
    amountCrypto: number;
    refundWallet?: string;
}): Promise<{
    depositAddress: string;
    depositRouteType: string;
    confirmationsRequired: number;
    changenowExchangeId: string | null;
}> {
    const clean = params.sourceAsset.trim().toUpperCase();
    const masterKasAddress = await resolveMasterTreasuryKasFromDbOrEnv();

    if (clean === 'KAS' || clean === 'SILO') {
        return {
            depositAddress: masterKasAddress,
            depositRouteType: 'LOCAL_PERENNIA_NODE_MASTER_TREASURY',
            confirmationsRequired: 10,
            changenowExchangeId: null
        };
    }

    const apiKey = (env.CHANGENOW_API_KEY || '').trim();
    if (!apiKey) {
        throw new Error(
            'CHANGENOW_API_KEY_MISSING: Set CHANGENOW_API_KEY in .env to generate live ChangeNOW v2 deposit addresses. Failing closed (503).'
        );
    }

    const fromSpec = resolveChangeNowCurrencyAndNetwork(clean);
    const payload: Record<string, any> = {
        fromCurrency: fromSpec.currency,
        toCurrency: 'kas',
        fromNetwork: fromSpec.network,
        toNetwork: 'kas',
        fromAmount: params.amountCrypto.toFixed(8),
        address: masterKasAddress,
        flow: 'standard'
    };

    const res = await fetch('https://api.changenow.io/v2/exchange', {
        method: 'POST',
        headers: {
            'x-changenow-api-key': apiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(
            `CHANGENOW_DEPOSIT_REJECTED (${res.status}): ${errBody || 'ChangeNOW v2 failed to create off-ramp deposit address.'}`
        );
    }

    const data = await res.json();
    const exchangeId = String(data?.id || '').trim();
    const payinAddress = String(data?.payinAddress || '').trim();
    if (!exchangeId || !payinAddress) {
        throw new Error('ChangeNOW v2 response missing id or payinAddress.');
    }

    return {
        depositAddress: payinAddress,
        depositRouteType: `CHANGENOW_V2_LIVE_${clean}_PAYIN`,
        confirmationsRequired: fromSpec.confirmationsRequired,
        changenowExchangeId: exchangeId
    };
}

async function verifyOnchainKasTransaction(params: {
    txId: string;
    expectedTreasuryAddress: string;
    minAmountKas: number;
}): Promise<{ verified: boolean; reason?: string }> {
    const cleanTxId = params.txId.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(cleanTxId)) {
        return {
            verified: false,
            reason: 'INVALID_KASPA_TXID: Transaction ID must be a 64-character hexadecimal hash.'
        };
    }

    const kaspaRestUrl = (env.KASPA_REST_URL || 'https://api.kaspa.org').replace(
        /\/+$/,
        ''
    );

    const res = await fetch(
        `${kaspaRestUrl}/transactions/${encodeURIComponent(cleanTxId)}`,
        {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(7000)
        }
    );

    if (!res.ok) {
        return {
            verified: false,
            reason: `ONCHAIN_TX_NOT_FOUND: Kaspa indexer returned HTTP ${res.status} for transaction ${cleanTxId}.`
        };
    }

    const txData = await res.json();
    if (txData?.is_accepted === false) {
        return {
            verified: false,
            reason: `ONCHAIN_TX_UNCONFIRMED: Transaction ${cleanTxId} is not yet accepted by DAG consensus.`
        };
    }

    const expectedTreasuryClean = params.expectedTreasuryAddress
        .trim()
        .toLowerCase();
    const outputs = Array.isArray(txData?.outputs) ? txData.outputs : [];
    let treasuryPaidSompi = 0;

    for (const out of outputs) {
        const outAddr = String(
            out?.script_public_key_address || out?.address || ''
        )
            .trim()
            .toLowerCase();
        if (outAddr === expectedTreasuryClean) {
            treasuryPaidSompi += Number(out?.amount || 0);
        }
    }

    const requiredSompi = Math.floor(params.minAmountKas * 0.97 * 1e8);
    if (treasuryPaidSompi < requiredSompi) {
        return {
            verified: false,
            reason: `ONCHAIN_OUTPUT_MISMATCH: Transaction ${cleanTxId} paid ${(treasuryPaidSompi / 1e8).toFixed(4)} KAS to Master Treasury (${expectedTreasuryClean}), required at least ${(requiredSompi / 1e8).toFixed(4)} KAS.`
        };
    }

    return { verified: true };
}

function calculateOfframpCostPlusQuote(params: {
    assetTicker: string;
    grossUsd: number;
    spotPriceUsd: number;
    payoutMethod?: string;
}) {
    const ticker = String(params.assetTicker || 'KAS').trim().toUpperCase();
    const gross = Math.max(10, Number(params.grossUsd || 500));
    const isWhaleWire =
        gross >= 2500 ||
        String(params.payoutMethod || '').toUpperCase() === 'WIRE';

    let baseHardCost = 0.25;
    let baseProfit = 8.75;
    let competitorFee = 15.0;
    let routingTopology =
        'LOCAL_MASTER_TREASURY_VAULT_REFILL_0_PCT_EXCHANGE_FEE';

    if (isWhaleWire && gross >= 2500) {
        const scale = gross / 2500;
        baseHardCost = roundCents(6.0 * scale);
        baseProfit = roundCents(24.0 * scale);
        competitorFee = roundCents(63.0 * scale);
        routingTopology =
            ticker === 'KAS' || ticker === 'SILO'
                ? 'LOCAL_MASTER_TREASURY_VAULT_REFILL_PLUS_FEDWIRE'
                : 'CHANGENOW_V2_PAYIN_ADDRESS_PLUS_FEDWIRE';
    } else {
        switch (ticker) {
            case 'KAS':
            case 'SILO': {
                const scale = gross / 500;
                baseHardCost = roundCents(Math.max(0.25, 0.25 * scale));
                const targetTotalFee = roundCents(9.0 * scale);
                baseProfit = roundCents(Math.max(1.0, targetTotalFee - baseHardCost));
                competitorFee = roundCents(15.0 * scale);
                routingTopology =
                    'LOCAL_MASTER_TREASURY_VAULT_REFILL_0_PCT_EXCHANGE_FEE';
                break;
            }
            case 'BTC': {
                const scale = gross / 100;
                baseHardCost = roundCents(1.0 * scale);
                baseProfit = roundCents(2.0 * scale);
                competitorFee = roundCents(4.0 * scale);
                routingTopology = 'CHANGENOW_V2_BTC_PAYIN_ADDRESS';
                break;
            }
            case 'ETH':
            case 'SOL': {
                const scale = gross / 200;
                baseHardCost = roundCents(2.0 * scale);
                baseProfit = roundCents(3.0 * scale);
                competitorFee = roundCents(7.0 * scale);
                routingTopology = `CHANGENOW_V2_${ticker}_PAYIN_ADDRESS`;
                break;
            }
            case 'USDC':
            case 'USDT': {
                baseHardCost = roundCents(gross * 0.0005);
                baseProfit = roundCents(gross * 0.0045);
                competitorFee = roundCents(gross * 0.015);
                routingTopology = 'CHANGENOW_V2_USDC_PAYIN_ADDRESS';
                break;
            }
            default: {
                const scale = gross / 200;
                baseHardCost = roundCents(2.0 * scale);
                baseProfit = roundCents(3.0 * scale);
                competitorFee = roundCents(7.0 * scale);
                routingTopology = `CHANGENOW_V2_${ticker}_PAYIN_ADDRESS`;
                break;
            }
        }
    }

    const hardCostUsd = roundCents(baseHardCost);
    const feeUsd = roundCents(hardCostUsd + baseProfit);
    const effectiveFeePct = gross > 0 ? roundCents((feeUsd / gross) * 100) : 0;
    const netFiatPayout = roundCents(Math.max(0, gross - feeUsd));
    const competitorNetUsd = roundCents(Math.max(0, gross - competitorFee));
    const guestSavingsUsd = roundCents(Math.max(0, competitorFee - feeUsd));

    let circuitBreakerTripped = false;
    let circuitBreakerReason: string | undefined = undefined;
    if (!Number.isFinite(params.spotPriceUsd) || params.spotPriceUsd <= 0) {
        circuitBreakerTripped = true;
        circuitBreakerReason = `CIRCUIT_BREAKER_TRIPPED: Live oracle price feed for ${ticker} is offline; failing closed.`;
    } else if (feeUsd > competitorFee && competitorFee > 0) {
        circuitBreakerTripped = true;
        circuitBreakerReason = `CIRCUIT_BREAKER_TRIPPED: Off-ramp Quoted_Guest_Fee ($${feeUsd.toFixed(2)}) exceeded Competitor Ceiling ($${competitorFee.toFixed(2)}); failing closed.`;
    }

    const estimatedTokens =
        params.spotPriceUsd > 0
            ? Number((gross / params.spotPriceUsd).toFixed(6))
            : 0;

    return {
        direction: 'OFFRAMP' as const,
        assetTicker: ticker,
        grossUsd: roundCents(gross),
        hardCostUsd,
        guaranteedProfitUsd: baseProfit,
        feeUsd,
        effectiveFeePct,
        netFiatPayout,
        estimatedTokens,
        spotPriceUsd: params.spotPriceUsd,
        competitorFeeUsd: competitorFee,
        competitorNetUsd,
        guestSavingsUsd,
        routingTopology,
        payoutMethod: isWhaleWire && gross >= 2500 ? 'WIRE' : 'ACH',
        whaleWireFeeWaived: isWhaleWire && gross >= 2500,
        circuitBreakerTripped,
        circuitBreakerReason
    };
}

async function ensureFiatOfframpTables() {
    const client = await dbPool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS fiat_payout_queue (
                payout_id VARCHAR(80) PRIMARY KEY,
                wallet_address VARCHAR(255) NOT NULL,
                source_type VARCHAR(64) NOT NULL,
                source_asset VARCHAR(20) NOT NULL,
                amount_crypto DOUBLE PRECISION NOT NULL,
                gross_usd DOUBLE PRECISION NOT NULL,
                fee_usd DOUBLE PRECISION NOT NULL,
                hard_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                guaranteed_profit_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                competitor_fee_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                guest_savings_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                net_fiat_usd DOUBLE PRECISION NOT NULL,
                payout_method VARCHAR(20) NOT NULL,
                bank_last4 VARCHAR(10) NOT NULL,
                deposit_address VARCHAR(255),
                changenow_exchange_id VARCHAR(128),
                routing_topology VARCHAR(128),
                confirmations_required INTEGER NOT NULL DEFAULT 6,
                confirmations_current INTEGER NOT NULL DEFAULT 0,
                tx_id VARCHAR(255),
                trace_id VARCHAR(128),
                status VARCHAR(40) DEFAULT 'QUEUED_FOR_TREASURY_DISPATCH',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(
            `ALTER TABLE fiat_payout_queue ADD COLUMN IF NOT EXISTS changenow_exchange_id VARCHAR(128);`
        );
        await client.query(`
            CREATE TABLE IF NOT EXISTS fiat_bank_rails (
                wallet_address VARCHAR(255) PRIMARY KEY,
                bank_label VARCHAR(128) NOT NULL DEFAULT 'Primary Operating Account',
                account_type VARCHAR(32) NOT NULL DEFAULT 'CHECKING',
                payout_method VARCHAR(20) NOT NULL DEFAULT 'ACH',
                bank_last4 VARCHAR(10) NOT NULL,
                encrypted_rail_payload TEXT NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
    } finally {
        client.release();
    }
}

async function loadSavedBankRailForWallet(
    cleanWallet: string,
    prefixedWallet: string
): Promise<{
    decrypted: DecryptedBankRailPayload | null;
    meta: {
        bankLabel: string;
        accountType: 'CHECKING' | 'SAVINGS';
        payoutMethod: 'ACH' | 'WIRE';
        bankLast4: string;
        updatedAt: string;
    } | null;
}> {
    getKycMasterKeyStrict();
    await ensureFiatOfframpTables().catch(() => {});

    try {
        const dbRes = await dbPool.query(
            `SELECT bank_label, account_type, payout_method, bank_last4, encrypted_rail_payload, updated_at
             FROM fiat_bank_rails
             WHERE wallet_address = $1 OR wallet_address = $2
             ORDER BY updated_at DESC
             LIMIT 1`,
            [prefixedWallet, cleanWallet]
        );
        if (dbRes.rows.length > 0) {
            const row = dbRes.rows[0];
            const decrypted = decryptBankRailRecordStrict(
                String(row.encrypted_rail_payload || '')
            );
            const bankLabel = String(
                row.bank_label || decrypted?.bankLabel || 'Primary Operating Account'
            );
            const accountType: 'CHECKING' | 'SAVINGS' =
                String(
                    row.account_type || decrypted?.accountType || 'CHECKING'
                ).toUpperCase() === 'SAVINGS'
                    ? 'SAVINGS'
                    : 'CHECKING';
            const payoutMethod: 'ACH' | 'WIRE' =
                String(
                    row.payout_method || decrypted?.payoutMethod || 'ACH'
                ).toUpperCase() === 'WIRE'
                    ? 'WIRE'
                    : 'ACH';
            const bankLast4 = String(
                row.bank_last4 || decrypted?.accountNumber?.slice(-4) || ''
            );

            if (row.encrypted_rail_payload) {
                await redis
                    .set(
                        `perennia:fiat:bank_rail:${cleanWallet}`,
                        String(row.encrypted_rail_payload),
                        'EX',
                        60 * 60 * 24 * 30
                    )
                    .catch(() => {});
            }

            return {
                decrypted: decrypted
                    ? { ...decrypted, bankLabel, accountType, payoutMethod }
                    : null,
                meta: bankLast4
                    ? {
                          bankLabel,
                          accountType,
                          payoutMethod,
                          bankLast4,
                          updatedAt: row.updated_at
                              ? new Date(row.updated_at).toISOString()
                              : new Date().toISOString()
                      }
                    : null
            };
        }
    } catch {
        // Fall through to Redis cache
    }

    const cachedRail = await redis
        .get(`perennia:fiat:bank_rail:${cleanWallet}`)
        .catch(() => null);
    if (cachedRail) {
        const decrypted = decryptBankRailRecordStrict(cachedRail);
        if (decrypted?.accountNumber) {
            const bankLast4 = decrypted.accountNumber.slice(-4);
            return {
                decrypted,
                meta: {
                    bankLabel: decrypted.bankLabel,
                    accountType: decrypted.accountType,
                    payoutMethod: decrypted.payoutMethod,
                    bankLast4,
                    updatedAt: new Date().toISOString()
                }
            };
        }
    }

    return { decrypted: null, meta: null };
}

async function persistBankRailForWallet(
    cleanWallet: string,
    prefixedWallet: string,
    routingNumber: string,
    accountNumber: string,
    bankLabel: string,
    accountType: 'CHECKING' | 'SAVINGS',
    payoutMethod: 'ACH' | 'WIRE'
) {
    const encrypted = encryptBankRailRecordStrict({
        routingNumber,
        accountNumber,
        bankLabel,
        accountType,
        payoutMethod
    });
    const bankLast4 = accountNumber.slice(-4);
    await ensureFiatOfframpTables();
    await dbPool.query(
        `INSERT INTO fiat_bank_rails
         (wallet_address, bank_label, account_type, payout_method, bank_last4, encrypted_rail_payload, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
         ON CONFLICT (wallet_address) DO UPDATE SET
            bank_label = EXCLUDED.bank_label,
            account_type = EXCLUDED.account_type,
            payout_method = EXCLUDED.payout_method,
            bank_last4 = EXCLUDED.bank_last4,
            encrypted_rail_payload = EXCLUDED.encrypted_rail_payload,
            updated_at = CURRENT_TIMESTAMP`,
        [prefixedWallet, bankLabel, accountType, payoutMethod, bankLast4, encrypted]
    );
    await dbPool
        .query(`DELETE FROM fiat_bank_rails WHERE wallet_address = $1`, [cleanWallet])
        .catch(() => {});
    await redis
        .set(
            `perennia:fiat:bank_rail:${cleanWallet}`,
            encrypted,
            'EX',
            60 * 60 * 24 * 30
        )
        .catch(() => {});

    return {
        bankLabel,
        accountType,
        payoutMethod,
        bankLast4,
        updatedAt: new Date().toISOString()
    };
}

async function resolveAssetSpotPrice(ticker: string): Promise<number> {
    const clean = ticker.trim().toUpperCase();
    if (clean === 'USDC' || clean === 'USDT' || clean === 'USD') return 1.0;

    const spotStr = await redis.get(`oracle:spot:${clean}_USDC`).catch(() => null);
    if (spotStr) {
        const parsed = parseFloat(spotStr);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }

    try {
        const dbRes = await dbPool.query(
            `SELECT price_usd FROM rwa_oracle_feeds WHERE ticker = $1 AND price_usd > 0 AND updated_at >= CURRENT_TIMESTAMP - INTERVAL '15 minutes' ORDER BY updated_at DESC LIMIT 1`,
            [clean]
        );
        if (dbRes.rows.length > 0) {
            const dbPrice = Number(dbRes.rows[0].price_usd || 0);
            if (Number.isFinite(dbPrice) && dbPrice > 0) {
                await redis
                    .set(`oracle:spot:${clean}_USDC`, String(dbPrice), 'EX', 30)
                    .catch(() => {});
                return dbPrice;
            }
        }
    } catch {
        // Continue
    }

    if (clean === 'SILO') {
        const kasSpot = await resolveAssetSpotPrice('KAS');
        if (kasSpot > 0) {
            return Number((kasSpot / 23.809524).toFixed(6));
        }
    }

    try {
        const mexcRes = await fetch(
            `https://api.mexc.com/api/v3/ticker/price?symbol=${encodeURIComponent(clean)}USDT`,
            { signal: AbortSignal.timeout(3000) }
        );
        if (mexcRes.ok) {
            const mexcData = await mexcRes.json();
            const p = parseFloat(String(mexcData?.price || '0'));
            if (Number.isFinite(p) && p > 0) {
                await redis
                    .set(`oracle:spot:${clean}_USDC`, String(p), 'EX', 30)
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
    try {
        getKycMasterKeyStrict();
        const masterKas = await resolveMasterTreasuryKasFromDbOrEnv();

        const quoteAsset = url.searchParams.get('quoteAsset');
        if (quoteAsset) {
            const cleanTicker = quoteAsset.trim().toUpperCase();
            const spot = await resolveAssetSpotPrice(cleanTicker);
            const grossUsd = Number(url.searchParams.get('amountUsd') || 500);
            const quote = calculateOfframpCostPlusQuote({
                assetTicker: cleanTicker,
                grossUsd,
                spotPriceUsd: spot,
                payoutMethod: url.searchParams.get('payoutMethod') || 'ACH'
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

            const cnSpec = resolveChangeNowCurrencyAndNetwork(cleanTicker);
            const depositPreview =
                cleanTicker === 'KAS' || cleanTicker === 'SILO'
                    ? {
                          depositAddress: masterKas,
                          depositRouteType: 'LOCAL_PERENNIA_NODE_MASTER_TREASURY',
                          confirmationsRequired: 10
                      }
                    : {
                          depositAddress: '',
                          depositRouteType: `CHANGENOW_V2_LIVE_${cleanTicker}_PAYIN`,
                          confirmationsRequired: cnSpec.confirmationsRequired
                      };

            return json({
                success: true,
                quote,
                depositPreview
            });
        }

        const sessionId = cookies.get('perennia_session');
        let sessionWallet = (locals as any).walletAddress || '';
        if (!sessionWallet && sessionId) {
            sessionWallet =
                (await redis.get(`session:${sessionId}`).catch(() => null)) || '';
        }

        const circleConfigured = Boolean(
            env.CIRCLE_API_KEY && env.CIRCLE_API_KEY.trim() !== ''
        );
        const changenowConfigured = Boolean(
            env.CHANGENOW_API_KEY && env.CHANGENOW_API_KEY.trim() !== ''
        );
        const spotPrice = await resolveAssetSpotPrice('KAS');

        let savedBankRailLast4: string | null = null;
        let savedBankRail: any = null;
        let recentPayouts: any[] = [];

        if (sessionWallet) {
            const cleanWallet = sessionWallet
                .toLowerCase()
                .replace(/^kaspa:/i, '')
                .trim();
            const prefixedWallet = `kaspa:${cleanWallet}`;
            const loaded = await loadSavedBankRailForWallet(
                cleanWallet,
                prefixedWallet
            );
            if (loaded.meta) {
                savedBankRail = loaded.meta;
                savedBankRailLast4 = loaded.meta.bankLast4;
            }
            try {
                await ensureFiatOfframpTables();
                const res = await dbPool.query(
                    `SELECT payout_id, source_type, source_asset, amount_crypto, gross_usd, fee_usd,
                            hard_cost_usd, guaranteed_profit_usd, competitor_fee_usd, guest_savings_usd,
                            net_fiat_usd, payout_method, bank_last4, deposit_address, changenow_exchange_id,
                            routing_topology, confirmations_required, confirmations_current, tx_id, trace_id,
                            status, created_at, updated_at
                     FROM fiat_payout_queue
                     WHERE wallet_address = $1 OR wallet_address = $2
                     ORDER BY created_at DESC
                     LIMIT 25`,
                    [prefixedWallet, cleanWallet]
                );
                recentPayouts = res.rows;
            } catch {
                recentPayouts = [];
            }
        }

        return json({
            circleConfigured,
            changenowConfigured,
            sovereignQueueEnabled: true,
            oracleOnline: spotPrice > 0,
            spotPrice,
            masterTreasuryKasAddress: masterKas,
            savedBankRailReady: Boolean(savedBankRailLast4),
            savedBankRailLast4,
            savedBankRail,
            phase2GuardActive: false,
            recentPayouts
        });
    } catch (err: any) {
        const msg = err?.message || 'Fiat gateway configuration error.';
        return json(
            { error: msg },
            {
                status:
                    msg.includes('CONFIG_HALT') ||
                    msg.includes('CRITICAL_SECURITY_LOCKDOWN')
                        ? 503
                        : 500
            }
        );
    }
};

export const POST: RequestHandler = async ({ request, cookies, locals }: RequestEvent) => {
    try {
        getKycMasterKeyStrict();
        const masterTreasuryKas = await resolveMasterTreasuryKasFromDbOrEnv();

        const sessionId = cookies.get('perennia_session');
        let sessionWallet = (locals as any).walletAddress || '';
        if (!sessionWallet && sessionId) {
            sessionWallet =
                (await redis.get(`session:${sessionId}`).catch(() => null)) || '';
        }

        const body = await request.json().catch(() => ({}));
        const actionUpper = String(body.action || '').toUpperCase();

        if (
            actionUpper === 'MARK_PAYOUT_DISPATCHED' ||
            actionUpper === 'DEPOSIT_CONFIRMED'
        ) {
            const isDirector = await isAuthorizedDirectorRequest(request, sessionWallet);
            if (!isDirector) {
                return json(
                    {
                        error: 'FORBIDDEN: Only the Master Treasury Director may mark off-ramp payouts dispatched.'
                    },
                    { status: 403 }
                );
            }

            const payoutId = String(body.payoutId || '').trim();
            if (!payoutId) {
                return json({ error: 'Missing payoutId.' }, { status: 400 });
            }
            const traceId =
                String(body.traceId || '').trim() ||
                `FED-ACH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

            await ensureFiatOfframpTables();
            const updated = await dbPool.query(
                `UPDATE fiat_payout_queue
                 SET status = 'DISPATCHED_BY_DIRECTOR',
                     trace_id = $2,
                     confirmations_current = confirmations_required,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE payout_id = $1
                 RETURNING wallet_address, net_fiat_usd, source_asset, gross_usd`,
                [payoutId, traceId]
            );
            if (updated.rows.length === 0) {
                return json(
                    { error: `Payout ${payoutId} not found.` },
                    { status: 404 }
                );
            }
            const r = updated.rows[0];
            const cleanW = String(r.wallet_address || '')
                .toLowerCase()
                .replace(/^kaspa:/i, '')
                .trim();

            await redis
                .publish(
                    'telemetry:updates',
                    JSON.stringify({
                        fiat_event: true,
                        eventType: 'FIAT_DISPATCHED',
                        wallet: cleanW,
                        payoutId,
                        traceId,
                        netFiatUsd: Number(r.net_fiat_usd || 0)
                    })
                )
                .catch(() => {});

            return json({
                success: true,
                payoutId,
                traceId,
                stageIndex: 4,
                status: 'DISPATCHED_BY_DIRECTOR'
            });
        }

        if (!sessionWallet) {
            return json(
                {
                    error: 'UNAUTHORIZED: Active Sovereign session required for fiat off-ramp.'
                },
                { status: 401 }
            );
        }

        const {
            saveRailOnly,
            amountKas,
            kasAmount,
            amountAsset,
            grossUsd: requestedGrossUsd,
            sourceMode = 'onchain_kas',
            sourceAsset = 'KAS',
            txId: providedTxId,
            signedPsbt,
            payoutMethod = 'ach',
            bankLabel,
            accountType = 'CHECKING',
            routingNumber,
            accountNumber,
            preFlightOnly
        } = body;

        const prefixedWallet = normalizeKaspaAddressStrict(sessionWallet);
        const cleanWallet = prefixedWallet.replace(/^kaspa:/i, '');

        const normalizedAccountType: 'CHECKING' | 'SAVINGS' =
            String(accountType || 'CHECKING').toUpperCase() === 'SAVINGS'
                ? 'SAVINGS'
                : 'CHECKING';
        const normalizedPayoutMethod: 'ACH' | 'WIRE' =
            String(payoutMethod || 'ach').toUpperCase() === 'WIRE'
                ? 'WIRE'
                : 'ACH';
        const normalizedBankLabel =
            String(bankLabel || 'Primary Operating Account').trim() ||
            'Primary Operating Account';

        let resolvedRouting = routingNumber
            ? String(routingNumber).replace(/\D/g, '').trim()
            : '';
        let resolvedAccount = accountNumber
            ? String(accountNumber).replace(/\D/g, '').trim()
            : '';

        if (actionUpper === 'SAVE_BANK_RAIL' || Boolean(saveRailOnly)) {
            if (
                !resolvedRouting ||
                resolvedRouting.length !== 9 ||
                !resolvedAccount ||
                resolvedAccount.length < 4
            ) {
                return json(
                    {
                        error: 'BANK_ROUTING_REQUIRED: Please enter a valid 9-digit ABA Routing Number and Bank Account Number (minimum 4 digits).'
                    },
                    { status: 400 }
                );
            }
            const savedMeta = await persistBankRailForWallet(
                cleanWallet,
                prefixedWallet,
                resolvedRouting,
                resolvedAccount,
                normalizedBankLabel,
                normalizedAccountType,
                normalizedPayoutMethod
            );
            return json({
                success: true,
                savedBankRailReady: true,
                savedBankRailLast4: savedMeta.bankLast4,
                savedBankRail: savedMeta
            });
        }

        if (resolvedRouting && resolvedAccount) {
            if (resolvedRouting.length !== 9 || resolvedAccount.length < 4) {
                return json(
                    {
                        error: 'BANK_ROUTING_REQUIRED: Please enter a valid 9-digit ABA Routing Number and Bank Account Number to route USD settlement.'
                    },
                    { status: 400 }
                );
            }
            await persistBankRailForWallet(
                cleanWallet,
                prefixedWallet,
                resolvedRouting,
                resolvedAccount,
                normalizedBankLabel,
                normalizedAccountType,
                normalizedPayoutMethod
            );
        } else {
            const loaded = await loadSavedBankRailForWallet(
                cleanWallet,
                prefixedWallet
            );
            if (loaded.decrypted) {
                resolvedRouting = loaded.decrypted.routingNumber;
                resolvedAccount = loaded.decrypted.accountNumber;
            }
        }

        const resolvedAssetTicker = String(sourceAsset || 'KAS')
            .trim()
            .toUpperCase();
        const executionSpotPrice = await resolveAssetSpotPrice(
            resolvedAssetTicker
        );

        const parsedAmountCrypto =
            Number(amountAsset ?? amountKas ?? kasAmount) ||
            (requestedGrossUsd && executionSpotPrice > 0
                ? Number(requestedGrossUsd) / executionSpotPrice
                : 0);

        if (!parsedAmountCrypto || parsedAmountCrypto <= 0) {
            return json(
                { error: `Invalid ${resolvedAssetTicker} off-ramp amount specified.` },
                { status: 400 }
            );
        }

        if (
            !resolvedRouting ||
            resolvedRouting.length < 9 ||
            !resolvedAccount ||
            resolvedAccount.length < 4
        ) {
            return json(
                {
                    error: 'BANK_ROUTING_REQUIRED: Please link or enter a valid 9-digit ABA Routing Number and Bank Account Number to route USD settlement.'
                },
                { status: 400 }
            );
        }

        const grossUsd = roundCents(
            requestedGrossUsd
                ? Number(requestedGrossUsd)
                : parsedAmountCrypto * executionSpotPrice
        );

        const quote = calculateOfframpCostPlusQuote({
            assetTicker: resolvedAssetTicker,
            grossUsd,
            spotPriceUsd: executionSpotPrice,
            payoutMethod: normalizedPayoutMethod
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

        let wireReferenceId = `PER-ACH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
        const bankLast4 = resolvedAccount.slice(-4);
        const cleanSourceMode = String(sourceMode || 'onchain_kas').toLowerCase();
        const isInternalLedger =
            cleanSourceMode === 'ledger_kas' || cleanSourceMode === 'ledger_usdc';
        const userLedgerKey = `dev:sor:treasury:balances:${cleanWallet}`;

        if (isInternalLedger) {
            const rawLedger = await redis.hgetall(userLedgerKey);
            const primaryBal =
                parseFloat(rawLedger?.[resolvedAssetTicker] || '0') || 0;
            const unassignedBal =
                resolvedAssetTicker === 'KAS'
                    ? parseFloat(rawLedger?.['Unassigned KAS'] || '0') || 0
                    : 0;
            const totalAvailableLedger = primaryBal + unassignedBal;
            if (totalAvailableLedger + 1e-8 < parsedAmountCrypto) {
                return json(
                    {
                        error: `INSUFFICIENT_LEDGER_BALANCE: Requested ${parsedAmountCrypto.toFixed(4)} ${resolvedAssetTicker}, but Internal Treasury Ledger has ${totalAvailableLedger.toFixed(4)} ${resolvedAssetTicker}.`
                    },
                    { status: 400 }
                );
            }
        }

        if (preFlightOnly) {
            const cnSpec = resolveChangeNowCurrencyAndNetwork(resolvedAssetTicker);
            return json({
                success: true,
                preFlightVerified: true,
                sourceMode: cleanSourceMode,
                sourceAsset: resolvedAssetTicker,
                grossUsd: quote.grossUsd,
                feeUsd: quote.feeUsd,
                hardCostUsd: quote.hardCostUsd,
                guaranteedProfitUsd: quote.guaranteedProfitUsd,
                competitorFeeUsd: quote.competitorFeeUsd,
                guestSavingsUsd: quote.guestSavingsUsd,
                netFiatPayout: quote.netFiatPayout,
                spotPrice: executionSpotPrice,
                depositAddress:
                    resolvedAssetTicker === 'KAS' || resolvedAssetTicker === 'SILO'
                        ? masterTreasuryKas
                        : '',
                depositRouteType:
                    resolvedAssetTicker === 'KAS' || resolvedAssetTicker === 'SILO'
                        ? 'LOCAL_PERENNIA_NODE_MASTER_TREASURY'
                        : `CHANGENOW_V2_LIVE_${resolvedAssetTicker}_PAYIN`,
                confirmationsRequired: cnSpec.confirmationsRequired,
                routingTopology: quote.routingTopology,
                bankAccountLast4: bankLast4,
                bankLabel: normalizedBankLabel,
                accountType: normalizedAccountType
            });
        }

        let depositMeta: {
            depositAddress: string;
            depositRouteType: string;
            confirmationsRequired: number;
            changenowExchangeId: string | null;
        };

        try {
            depositMeta = await createChangeNowOfframpDepositOrder({
                sourceAsset: resolvedAssetTicker,
                amountCrypto: parsedAmountCrypto,
                refundWallet: prefixedWallet
            });
        } catch (depErr: any) {
            return json(
                {
                    error: depErr.message,
                    circuitBreakerTripped: true,
                    quote
                },
                { status: 503 }
            );
        }

        let settlementTxId = providedTxId ? String(providedTxId).trim() : '';

        if (isInternalLedger) {
            const debitRes = (await redis.eval(
                LUA_ATOMIC_DEBIT_FIAT_LEDGER,
                1,
                userLedgerKey,
                resolvedAssetTicker,
                parsedAmountCrypto.toString()
            )) as [number, string];
            if (!debitRes || Number(debitRes[0]) !== 1) {
                return json(
                    {
                        error: `Atomic ledger debit failed: Insufficient ${resolvedAssetTicker} in Internal Treasury Ledger.`
                    },
                    { status: 400 }
                );
            }
            const fromUnassigned = parseFloat(debitRes[1] || '0') || 0;
            if (fromUnassigned > 1e-9) {
                await dbPool
                    .query(
                        `UPDATE yield_reservoirs
                         SET streaming_balance_kas = GREATEST(0.0, streaming_balance_kas - $1),
                             last_updated = CURRENT_TIMESTAMP
                         WHERE LOWER(REPLACE(TRIM(wallet_address), 'kaspa:', '')) = $2 OR wallet_address = $3`,
                        [fromUnassigned, cleanWallet, prefixedWallet]
                    )
                    .catch(() => {});
            }
            settlementTxId = `LEDGER-FIAT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        } else if (cleanSourceMode === 'direct_wholesale_deposit') {
            settlementTxId =
                depositMeta.changenowExchangeId ||
                `DIRECT-DEPOSIT-${resolvedAssetTicker}-${wireReferenceId.slice(-6)}`;
        } else {
            if (!settlementTxId && signedPsbt) {
                const kaspaRestUrl = (
                    env.KASPA_REST_URL || 'https://api.kaspa.org'
                ).replace(/\/+$/, '');
                const broadcastRes = await fetch(`${kaspaRestUrl}/transactions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(
                        typeof signedPsbt === 'string'
                            ? JSON.parse(signedPsbt)
                            : signedPsbt
                    )
                });
                if (!broadcastRes.ok) {
                    const errText = await broadcastRes.text();
                    return json(
                        {
                            error: `L1 Node rejected off-ramp transaction: ${errText}`
                        },
                        { status: 502 }
                    );
                }
                const broadcastData = await broadcastRes.json();
                settlementTxId = broadcastData.transactionId || '';
            }
            if (!settlementTxId) {
                return json(
                    {
                        error: 'Missing L1 settlement transaction ID or signed PSBT payload.'
                    },
                    { status: 400 }
                );
            }

            if (resolvedAssetTicker === 'KAS') {
                const txVerification = await verifyOnchainKasTransaction({
                    txId: settlementTxId,
                    expectedTreasuryAddress: masterTreasuryKas,
                    minAmountKas: parsedAmountCrypto
                });
                if (!txVerification.verified) {
                    return json(
                        {
                            error:
                                txVerification.reason ||
                                'On-chain Kaspa transaction verification failed.'
                        },
                        { status: 422 }
                    );
                }
            }
        }

        const circleConfigured = Boolean(
            env.CIRCLE_API_KEY && env.CIRCLE_API_KEY.trim() !== ''
        );
        let dispatchStatus =
            cleanSourceMode === 'direct_wholesale_deposit'
                ? 'AWAITING_ONCHAIN_CONFIRMATIONS'
                : 'QUEUED_FOR_TREASURY_DISPATCH';
        let traceId: string | null = null;

        if (
            circleConfigured &&
            cleanSourceMode !== 'direct_wholesale_deposit'
        ) {
            const circleRes = await fetch('https://api.circle.com/v1/payouts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${env.CIRCLE_API_KEY!.trim()}`
                },
                body: JSON.stringify({
                    idempotencyKey: crypto.randomUUID(),
                    amount: {
                        amount: quote.netFiatPayout.toFixed(2),
                        currency: 'USD'
                    },
                    destination: {
                        type: normalizedPayoutMethod === 'ACH' ? 'ach' : 'wire',
                        name: prefixedWallet,
                        routingNumber: resolvedRouting,
                        accountNumber: resolvedAccount
                    }
                })
            });
            if (circleRes.ok) {
                const circleData = await circleRes.json();
                wireReferenceId = circleData?.data?.id || wireReferenceId;
                traceId = circleData?.data?.trackingRef || wireReferenceId;
                dispatchStatus = 'CIRCLE_DISPATCHED';
            }
        }

        const payoutRecord = {
            payout_id: wireReferenceId,
            payoutId: wireReferenceId,
            walletAddress: prefixedWallet,
            source_type: cleanSourceMode,
            sourceType: cleanSourceMode,
            source_asset: resolvedAssetTicker,
            sourceAsset: resolvedAssetTicker,
            amount_crypto: parsedAmountCrypto,
            amountCrypto: parsedAmountCrypto,
            gross_usd: quote.grossUsd,
            grossUsd: quote.grossUsd,
            fee_usd: quote.feeUsd,
            feeUsd: quote.feeUsd,
            hardCostUsd: quote.hardCostUsd,
            guaranteedProfitUsd: quote.guaranteedProfitUsd,
            competitorFeeUsd: quote.competitorFeeUsd,
            guestSavingsUsd: quote.guestSavingsUsd,
            net_fiat_usd: quote.netFiatPayout,
            netFiatUsd: quote.netFiatPayout,
            payout_method: quote.payoutMethod,
            payoutMethod: quote.payoutMethod,
            bank_last4: bankLast4,
            bankLast4,
            depositAddress: depositMeta.depositAddress,
            changenowExchangeId: depositMeta.changenowExchangeId,
            depositRouteType: depositMeta.depositRouteType,
            routingTopology: quote.routingTopology,
            confirmationsRequired: depositMeta.confirmationsRequired,
            confirmationsCurrent: isInternalLedger
                ? depositMeta.confirmationsRequired
                : cleanSourceMode === 'onchain_kas'
                  ? 1
                  : 0,
            tx_id: settlementTxId,
            txId: settlementTxId,
            trace_id: traceId,
            traceId,
            status: dispatchStatus,
            createdAt: new Date().toISOString()
        };

        await ensureFiatOfframpTables();
        await dbPool.query(
            `INSERT INTO fiat_payout_queue
             (payout_id, wallet_address, source_type, source_asset, amount_crypto, gross_usd, fee_usd,
              hard_cost_usd, guaranteed_profit_usd, competitor_fee_usd, guest_savings_usd, net_fiat_usd,
              payout_method, bank_last4, deposit_address, changenow_exchange_id, routing_topology,
              confirmations_required, confirmations_current, tx_id, trace_id, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
            [
                payoutRecord.payoutId,
                payoutRecord.walletAddress,
                payoutRecord.sourceType,
                payoutRecord.sourceAsset,
                payoutRecord.amountCrypto,
                payoutRecord.grossUsd,
                payoutRecord.feeUsd,
                payoutRecord.hardCostUsd,
                payoutRecord.guaranteedProfitUsd,
                payoutRecord.competitorFeeUsd,
                payoutRecord.guestSavingsUsd,
                payoutRecord.netFiatUsd,
                payoutRecord.payoutMethod,
                payoutRecord.bankLast4,
                payoutRecord.depositAddress,
                payoutRecord.changenowExchangeId,
                payoutRecord.routingTopology,
                payoutRecord.confirmationsRequired,
                payoutRecord.confirmationsCurrent,
                payoutRecord.txId,
                payoutRecord.traceId,
                payoutRecord.status
            ]
        );

        await redis.lpush(
            'perennia:fiat:payout_queue',
            JSON.stringify(payoutRecord)
        );
        await redis.ltrim('perennia:fiat:payout_queue', 0, 199);

        await dbPool
            .query(
                `INSERT INTO tax_ledger_events (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash)
                 VALUES ($1, $2, 'FIAT_OFFRAMP', $3, $4, $5, $6)`,
                [
                    cleanWallet,
                    resolvedAssetTicker,
                    quote.grossUsd,
                    parsedAmountCrypto,
                    executionSpotPrice,
                    settlementTxId
                ]
            )
            .catch(() => {});

        if (resolvedAssetTicker === 'KAS') {
            await redis.rpush(
                'perennia:sor:netting_queue',
                JSON.stringify({
                    wallet: prefixedWallet,
                    direction: 'SELL_KAS',
                    amount_kas: parsedAmountCrypto,
                    spot_price: executionSpotPrice,
                    fee_captured_usd: quote.feeUsd,
                    target_asset: 'USD',
                    estimated_output: quote.netFiatPayout
                })
            );
        } else {
            await redis.incrbyfloat(
                'perennia:treasury:netting_profit_usd',
                quote.feeUsd
            );
        }

        await redis.publish(
            'telemetry:updates',
            JSON.stringify({
                fiat_event: true,
                eventType: 'FIAT_OFFRAMP',
                wallet: cleanWallet,
                payout: payoutRecord
            })
        );

        return json({
            success: true,
            ...payoutRecord,
            wireReferenceId,
            netFiatPayout: quote.netFiatPayout,
            spotPrice: executionSpotPrice,
            bankAccountLast4: bankLast4
        });
    } catch (err: any) {
        console.error('🚨 [FIAT OFFRAMP ERROR]:', err);
        const msg =
            err?.message || 'Internal Fiat Off-Ramp execution failure.';
        return json(
            { error: msg },
            {
                status:
                    msg.includes('CONFIG_HALT') ||
                    msg.includes('CRITICAL_SECURITY_LOCKDOWN') ||
                    msg.includes('CHANGENOW') ||
                    msg.includes('ORACLE_HALT')
                        ? 503
                        : 500
            }
        );
    }
};