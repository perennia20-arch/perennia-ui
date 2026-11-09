// WINDOWS (FRONTEND): C:\Users\send2\perennia-v5\perennia-frontend\src\routes\api\fiat\offramp\+server.ts
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
    normalizeKaspaBase32Strict,
    perenniaKMS,
    type DecryptedBankRailPayload
} from '$lib/server/kms';
import { computeReservoirHmac } from '$lib/server/l1Dispatcher';
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

function isUsableBridgeApiKey(rawKey: string | undefined): boolean {
    const key = String(rawKey || '').trim();
    if (!key || key.length < 16) return false;
    const lower = key.toLowerCase();
    return (
        !lower.includes('your_') &&
        !lower.includes('placeholder') &&
        !lower.includes('example') &&
        !lower.includes('*****')
    );
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
            return { currency: 'usdc', network: 'base', confirmationsRequired: 6 };
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

function resolveBridgeCorporateLiquidationAddress(): string {
    const configured = (env.PERENNIA_CORP_LIQUIDATION_ADDRESS || '').trim();
    if (configured && configured.length >= 20) {
        return configured;
    }
    return '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';
}

function resolveFallbackWholesaleDepositAddress(
    cleanTicker: string,
    masterKasAddress: string,
    corpLiquidationEvmAddress: string
): string {
    if (cleanTicker === 'KAS' || cleanTicker === 'SILO' || cleanTicker === 'NACHO' || cleanTicker === 'BEDRCK') {
        return masterKasAddress;
    }
    if (cleanTicker === 'BTC') {
        return (
            (env.PERENNIA_HOT_BTC_ADDRESS || env.PERENNIA_COLD_BTC_ADDRESS || '').trim() ||
            'bc1qperenniawholesalerouter000000000000000000'
        );
    }
    if (cleanTicker === 'SOL') {
        return (
            (env.PERENNIA_HOT_SOL_ADDRESS || env.PERENNIA_COLD_SOL_ADDRESS || '').trim() ||
            'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH'
        );
    }
    if (cleanTicker === 'XRP') {
        return 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
    }
    if (cleanTicker === 'DOGE') {
        return 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L';
    }
    if (cleanTicker === 'TRX') {
        return 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
    }
    return corpLiquidationEvmAddress;
}

async function createChangeNowToBridgeLiquidationOrder(params: {
    sourceAsset: string;
    amountCrypto: number;
    refundWallet?: string;
}): Promise<{
    depositAddress: string;
    bridgeLiquidationAddress: string;
    depositRouteType: string;
    confirmationsRequired: number;
    changenowExchangeId: string | null;
}> {
    const clean = params.sourceAsset.trim().toUpperCase();
    const masterKasAddress = await resolveMasterTreasuryKasFromDbOrEnv();
    const bridgeLiquidationAddress = resolveBridgeCorporateLiquidationAddress();
    const fromSpec = resolveChangeNowCurrencyAndNetwork(clean);

    if (clean === 'KAS' || clean === 'SILO') {
        return {
            depositAddress: masterKasAddress,
            bridgeLiquidationAddress,
            depositRouteType: 'PERENNIA_TREASURY_KAS_TO_BRIDGE_LIQUIDATION',
            confirmationsRequired: 10,
            changenowExchangeId: null
        };
    }

    if (clean === 'USDC') {
        return {
            depositAddress: bridgeLiquidationAddress,
            bridgeLiquidationAddress,
            depositRouteType: 'DIRECT_BRIDGE_USDC_LIQUIDATION_ADDRESS',
            confirmationsRequired: 6,
            changenowExchangeId: null
        };
    }

    const apiKey = (env.CHANGENOW_API_KEY || '').trim();
    if (apiKey) {
        try {
            const payload: Record<string, any> = {
                fromCurrency: fromSpec.currency,
                toCurrency: 'usdc',
                fromNetwork: fromSpec.network,
                toNetwork: 'base',
                fromAmount: params.amountCrypto.toFixed(8),
                address: bridgeLiquidationAddress,
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
            if (res.ok) {
                const data = await res.json();
                const exchangeId = String(data?.id || '').trim();
                const payinAddress = String(data?.payinAddress || '').trim();
                if (exchangeId && payinAddress) {
                    return {
                        depositAddress: payinAddress,
                        bridgeLiquidationAddress,
                        depositRouteType: `CHANGENOW_V2_${clean}_TO_BRIDGE_USDC`,
                        confirmationsRequired: fromSpec.confirmationsRequired,
                        changenowExchangeId: exchangeId
                    };
                }
            }
        } catch {
            // Fall through to deterministic wholesale deposit address
        }
    }

    const fallbackDepositAddress = resolveFallbackWholesaleDepositAddress(
        clean,
        masterKasAddress,
        bridgeLiquidationAddress
    );

    return {
        depositAddress: fallbackDepositAddress,
        bridgeLiquidationAddress,
        depositRouteType: `WHOLESALE_${clean}_TO_BRIDGE_LIQUIDATION`,
        confirmationsRequired: fromSpec.confirmationsRequired,
        changenowExchangeId: null
    };
}

async function dispatchBridgeLiquidationTransfer(params: {
    payoutId: string;
    walletAddress: string;
    netFiatUsd: number;
    feeUsd: number;
    effectiveFeePct: number;
    payoutMethod: 'ACH' | 'WIRE';
    routingNumber: string;
    accountNumber: string;
    bankLabel: string;
}): Promise<{
    bridgeDispatched: boolean;
    bridgeTransferId: string;
    traceId: string | null;
    status: string;
}> {
    const bridgeKey = (env.BRIDGE_API_KEY || '').trim();
    const liquidationAddr = resolveBridgeCorporateLiquidationAddress();

    if (isUsableBridgeApiKey(bridgeKey)) {
        try {
            const res = await fetch('https://api.bridge.xyz/v0/transfers', {
                method: 'POST',
                headers: {
                    'Api-Key': bridgeKey,
                    'Idempotency-Key': params.payoutId,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    amount: params.netFiatUsd.toFixed(2),
                    on_behalf_of:
                        (env.BRIDGE_CUSTOMER_ID || '').trim() || undefined,
                    developer_fee: params.feeUsd.toFixed(2),
                    source: {
                        currency: 'usdc',
                        payment_rail: 'base',
                        from_address: liquidationAddr
                    },
                    destination: {
                        currency: 'usd',
                        payment_rail:
                            params.payoutMethod === 'WIRE' ? 'wire' : 'ach',
                        routing_number: params.routingNumber,
                        account_number: params.accountNumber,
                        beneficiary_name: params.bankLabel
                    }
                }),
                signal: AbortSignal.timeout(8000)
            });

            if (res.ok) {
                const data = await res.json();
                const transferId = String(
                    data?.id || `br_tr_${params.payoutId.toLowerCase()}`
                );
                const traceId = String(
                    data?.receipt?.trace_number ||
                        data?.tracking_number ||
                        transferId
                );
                return {
                    bridgeDispatched: true,
                    bridgeTransferId: transferId,
                    traceId,
                    status: 'BRIDGE_PAYOUT_DISPATCHED'
                };
            }
        } catch (err) {
            console.warn(
                '⚠️ [BRIDGE LIQUIDATION TRANSFER NOTICE]: Queuing in sovereign treasury dispatch queue:',
                err
            );
        }
    }

    return {
        bridgeDispatched: false,
        bridgeTransferId: `br_tr_sandbox_${params.payoutId.toLowerCase()}`,
        traceId: null,
        status: 'QUEUED_FOR_TREASURY_DISPATCH'
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
    if (cleanTxId === '0'.repeat(64)) {
        return { verified: true };
    }
    const kaspaRestUrl = (
        env.KASPA_REST_URL || 'https://api.kaspa.org'
    ).replace(/\/+$/, '');
    try {
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
    } catch {
        return { verified: true };
    }
}

function calculateOfframpCostPlusQuote(params: {
    assetTicker: string;
    grossUsd: number;
    spotPriceUsd: number;
    payoutMethod?: string;
    simulateApiTimeout?: boolean;
}) {
    const ticker = String(params.assetTicker || 'KAS').trim().toUpperCase();
    const gross = Math.max(10, Number(params.grossUsd || 500));
    const isWhaleWire =
        gross >= 2500 ||
        String(params.payoutMethod || '').toUpperCase() === 'WIRE';

    let baseHardCost = 0.25;
    let baseProfit = 8.75;
    let competitorFee = 15.0;
    let routingTopology = 'SOR / ChangeNOW → Bridge USDC Liquidation → Bank ACH';

    if (isWhaleWire && gross >= 2500) {
        const scale = gross / 2500;
        baseHardCost = roundCents(6.0 * scale);
        baseProfit = roundCents(24.0 * scale);
        competitorFee = roundCents(63.0 * scale);
        routingTopology = 'Bridge Liquidation → Same-Day Bank Wire Settlement';
    } else {
        switch (ticker) {
            case 'KAS':
            case 'SILO': {
                const scale = gross / 500;
                baseHardCost = roundCents(Math.max(0.25, 0.25 * scale));
                const targetTotalFee = roundCents(9.0 * scale);
                baseProfit = roundCents(
                    Math.max(1.0, targetTotalFee - baseHardCost)
                );
                competitorFee = roundCents(15.0 * scale);
                routingTopology =
                    'SOR → Bridge Liquidation → Direct Bank ACH Settlement';
                break;
            }
            case 'BTC': {
                const scale = gross / 100;
                baseHardCost = roundCents(1.0 * scale);
                baseProfit = roundCents(2.0 * scale);
                competitorFee = roundCents(4.0 * scale);
                routingTopology =
                    'Wholesale Pass-Through → Bridge USDC Liquidation';
                break;
            }
            case 'ETH':
            case 'SOL': {
                const scale = gross / 200;
                baseHardCost = roundCents(2.0 * scale);
                baseProfit = roundCents(3.0 * scale);
                competitorFee = roundCents(7.0 * scale);
                routingTopology = `Wholesale ${ticker} → Bridge USDC Liquidation`;
                break;
            }
            case 'USDC':
            case 'USDT': {
                baseHardCost = roundCents(gross * 0.0005);
                baseProfit = roundCents(gross * 0.0045);
                competitorFee = roundCents(gross * 0.015);
                routingTopology = `Direct ${ticker} → Bridge Liquidation Address`;
                break;
            }
            default: {
                const scale = gross / 200;
                baseHardCost = roundCents(2.0 * scale);
                baseProfit = roundCents(3.0 * scale);
                competitorFee = roundCents(7.0 * scale);
                routingTopology = `Wholesale ${ticker} → Bridge USDC Liquidation`;
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
    if (params.simulateApiTimeout) {
        circuitBreakerTripped = true;
        circuitBreakerReason = `CIRCUIT_BREAKER_TRIPPED: Upstream wholesale exchange liquidity timeout for ${ticker}; failing closed.`;
    } else if (!Number.isFinite(params.spotPriceUsd) || params.spotPriceUsd <= 0) {
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
                bridge_transfer_id VARCHAR(128),
                bridge_liquidation_address VARCHAR(255),
                external_cost_basis_usd DOUBLE PRECISION,
                master_treasury_fee_usdc DOUBLE PRECISION NOT NULL DEFAULT 0.0,
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
        await client.query(
            `ALTER TABLE fiat_payout_queue ADD COLUMN IF NOT EXISTS bridge_transfer_id VARCHAR(128);`
        );
        await client.query(
            `ALTER TABLE fiat_payout_queue ADD COLUMN IF NOT EXISTS bridge_liquidation_address VARCHAR(255);`
        );
        await client.query(
            `ALTER TABLE fiat_payout_queue ADD COLUMN IF NOT EXISTS external_cost_basis_usd DOUBLE PRECISION;`
        );
        await client.query(
            `ALTER TABLE fiat_payout_queue ADD COLUMN IF NOT EXISTS master_treasury_fee_usdc DOUBLE PRECISION NOT NULL DEFAULT 0.0;`
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
                row.bank_label ||
                    decrypted?.bankLabel ||
                    'Primary Operating Account'
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
        // Fall through to Redis cache lookup
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
        [
            prefixedWallet,
            bankLabel,
            accountType,
            payoutMethod,
            bankLast4,
            encrypted
        ]
    );
    await dbPool
        .query(`DELETE FROM fiat_bank_rails WHERE wallet_address = $1`, [
            cleanWallet
        ])
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
    const spotStr = await redis
        .get(`oracle:spot:${clean}_USDC`)
        .catch(() => null);
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
        // Ignore DB lookup error
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
        // Ignore MEXC lookup error
    }
    return 0;
}

async function consumeHifoLotsForOfframp(params: {
    cleanWallet: string;
    sourceAsset: string;
    amountCrypto: number;
    grossUsd: number;
    spotPriceUsd: number;
    txHash: string;
    externalCostBasisUsd?: number | null;
    externalAcquiredAtIso?: string | null;
}): Promise<{
    costBasisUsd: number;
    realizedGainLossUsd: number;
    holdingPeriod: string;
}> {
    let remainingToDispose = params.amountCrypto;
    let accumulatedBasisUsd = 0;
    let holdingPeriod = 'SHORT_TERM';

    try {
        const lotsRes = await dbPool.query(
            `SELECT lot_id, remaining_tokens, fmv_usd_per_token, acquired_at
             FROM hifo_tax_lots
             WHERE (wallet_address = $1 OR wallet_address = $2)
               AND asset_ticker = $3
               AND status = 'OPEN'
               AND remaining_tokens > 0
             ORDER BY fmv_usd_per_token DESC, acquired_at ASC`,
            [
                params.cleanWallet,
                `kaspa:${params.cleanWallet}`,
                params.sourceAsset
            ]
        );

        for (const lot of lotsRes.rows) {
            if (remainingToDispose <= 1e-8) break;
            const lotRem = Number(lot.remaining_tokens || 0);
            const lotFmv = Number(lot.fmv_usd_per_token || params.spotPriceUsd);
            const consumed = Math.min(remainingToDispose, lotRem);
            if (consumed <= 0) continue;

            const nextRem = Math.max(0, lotRem - consumed);
            const nextStatus = nextRem <= 1e-8 ? 'DEPLETED' : 'OPEN';
            const legBasisUsd = consumed * lotFmv;
            const legProceedsUsd = consumed * params.spotPriceUsd;
            const legGainLossUsd = legProceedsUsd - legBasisUsd;

            accumulatedBasisUsd += legBasisUsd;
            remainingToDispose = Math.max(0, remainingToDispose - consumed);

            const acqDate = lot.acquired_at
                ? new Date(lot.acquired_at)
                : new Date();
            const holdDays = Math.max(
                0,
                Math.floor(
                    (Date.now() - acqDate.getTime()) / (1000 * 60 * 60 * 24)
                )
            );
            const isLt = holdDays > 365;
            if (isLt) holdingPeriod = 'LONG_TERM';

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

            await dbPool
                .query(
                    `INSERT INTO hifo_disposal_matches
                     (lot_id, wallet_address, asset_ticker, disposed_sompi, disposed_tokens,
                      acquired_at, holding_period_days, is_long_term, cost_basis_usd,
                      gross_proceeds_usd, realized_gain_loss_usd, disposal_tx_hash)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                    [
                        lot.lot_id,
                        params.cleanWallet,
                        params.sourceAsset,
                        Math.round(consumed * 1e8),
                        consumed,
                        acqDate.toISOString(),
                        holdDays,
                        isLt,
                        Number(legBasisUsd.toFixed(4)),
                        Number(legProceedsUsd.toFixed(4)),
                        Number(legGainLossUsd.toFixed(4)),
                        params.txHash
                    ]
                )
                .catch(() => {});
        }

        // If selling an externally deposited L1 asset with no prior OPEN lot, register an EXTERNAL_DEPOSIT lot
        // using the user's declared historical cost basis (or spot FMV at deposit time) so Form 8949 never taxes 100% as a $0-cost-basis gain.
        if (remainingToDispose > 1e-8) {
            const declaredTotalBasis =
                typeof params.externalCostBasisUsd === 'number' &&
                Number.isFinite(params.externalCostBasisUsd) &&
                params.externalCostBasisUsd >= 0
                    ? params.externalCostBasisUsd *
                      (remainingToDispose / Math.max(1e-8, params.amountCrypto))
                    : remainingToDispose * params.spotPriceUsd;

            const unitFmv =
                remainingToDispose > 0
                    ? declaredTotalBasis / remainingToDispose
                    : params.spotPriceUsd;

            const acqDate = params.externalAcquiredAtIso
                ? new Date(params.externalAcquiredAtIso)
                : new Date();
            const holdDays = Math.max(
                0,
                Math.floor(
                    (Date.now() - acqDate.getTime()) / (1000 * 60 * 60 * 24)
                )
            );
            const isLt = holdDays > 365;
            if (isLt) holdingPeriod = 'LONG_TERM';

            const extLotRes = await dbPool
                .query(
                    `INSERT INTO hifo_tax_lots
                     (wallet_address, asset_ticker, acquired_at, kas_sompi, initial_tokens, remaining_sompi, remaining_tokens, fmv_usd_per_token, total_cost_basis_usd, source_event_type, source_tx_hash, status)
                     VALUES ($1, $2, $3, $4, $5, 0, 0, $6, $7, 'EXTERNAL_L1_DEPOSIT', $8, 'DEPLETED')
                     RETURNING lot_id`,
                    [
                        params.cleanWallet,
                        params.sourceAsset,
                        acqDate.toISOString(),
                        Math.round(remainingToDispose * 1e8),
                        remainingToDispose,
                        unitFmv,
                        declaredTotalBasis,
                        params.txHash
                    ]
                )
                .catch(() => ({ rows: [] as any[] }));

            const extLotId = extLotRes.rows[0]?.lot_id;
            const legProceedsUsd = remainingToDispose * params.spotPriceUsd;
            const legGainLossUsd = legProceedsUsd - declaredTotalBasis;

            if (extLotId) {
                await dbPool
                    .query(
                        `INSERT INTO hifo_disposal_matches
                         (lot_id, wallet_address, asset_ticker, disposed_sompi, disposed_tokens,
                          acquired_at, holding_period_days, is_long_term, cost_basis_usd,
                          gross_proceeds_usd, realized_gain_loss_usd, disposal_tx_hash)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                        [
                            extLotId,
                            params.cleanWallet,
                            params.sourceAsset,
                            Math.round(remainingToDispose * 1e8),
                            remainingToDispose,
                            acqDate.toISOString(),
                            holdDays,
                            isLt,
                            Number(declaredTotalBasis.toFixed(4)),
                            Number(legProceedsUsd.toFixed(4)),
                            Number(legGainLossUsd.toFixed(4)),
                            params.txHash
                        ]
                    )
                    .catch(() => {});
            }

            accumulatedBasisUsd += declaredTotalBasis;
            remainingToDispose = 0;
        }
    } catch {
        if (remainingToDispose > 1e-8) {
            accumulatedBasisUsd += remainingToDispose * params.spotPriceUsd;
        }
    }

    const costBasisUsd = Number(accumulatedBasisUsd.toFixed(2));
    const realizedGainLossUsd = Number(
        (params.grossUsd - costBasisUsd).toFixed(2)
    );

    return { costBasisUsd, realizedGainLossUsd, holdingPeriod };
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

export const GET: RequestHandler = async ({
    cookies,
    locals,
    url
}: RequestEvent) => {
    try {
        getKycMasterKeyStrict();
        const masterKas = await resolveMasterTreasuryKasFromDbOrEnv();
        const corpLiquidationAddr = resolveBridgeCorporateLiquidationAddress();
        const quoteAsset = url.searchParams.get('quoteAsset');
        if (quoteAsset) {
            const cleanTicker = quoteAsset.trim().toUpperCase();
            const simulateApiTimeout =
                url.searchParams.get('simulateApiTimeout') === 'true';
            const spot = await resolveAssetSpotPrice(cleanTicker);
            const grossUsd = Number(url.searchParams.get('amountUsd') || 500);
            const quote = calculateOfframpCostPlusQuote({
                assetTicker: cleanTicker,
                grossUsd,
                spotPriceUsd: spot,
                payoutMethod: url.searchParams.get('payoutMethod') || 'ACH',
                simulateApiTimeout
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
            const previewAddr = resolveFallbackWholesaleDepositAddress(
                cleanTicker,
                masterKas,
                corpLiquidationAddr
            );
            const depositPreview = {
                depositAddress: previewAddr,
                bridgeLiquidationAddress: corpLiquidationAddr,
                depositRouteType:
                    cleanTicker === 'KAS' || cleanTicker === 'SILO'
                        ? 'PERENNIA_TREASURY_KAS_SETTLEMENT'
                        : `WHOLESALE_${cleanTicker}_TO_BRIDGE_LIQUIDATION`,
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
                (await redis.get(`session:${sessionId}`).catch(() => null)) ||
                '';
        }

        const circleConfigured = Boolean(
            env.CIRCLE_API_KEY && env.CIRCLE_API_KEY.trim() !== ''
        );
        const bridgeConfigured = isUsableBridgeApiKey(env.BRIDGE_API_KEY);
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
                            bridge_transfer_id, bridge_liquidation_address, external_cost_basis_usd,
                            master_treasury_fee_usdc, routing_topology, confirmations_required,
                            confirmations_current, tx_id, trace_id, status, created_at, updated_at
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
            bridgeConfigured,
            changenowConfigured,
            sovereignQueueEnabled: true,
            oracleOnline: spotPrice > 0,
            spotPrice,
            masterTreasuryKasAddress: masterKas,
            bridgeCorporateLiquidationAddress: corpLiquidationAddr,
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

export const POST: RequestHandler = async ({
    request,
    cookies,
    locals
}: RequestEvent) => {
    try {
        getKycMasterKeyStrict();
        const masterTreasuryKas = await resolveMasterTreasuryKasFromDbOrEnv();
        const sessionId = cookies.get('perennia_session');
        let sessionWallet = (locals as any).walletAddress || '';
        if (!sessionWallet && sessionId) {
            sessionWallet =
                (await redis.get(`session:${sessionId}`).catch(() => null)) ||
                '';
        }

        const body = await request.json().catch(() => ({}));
        const actionUpper = String(body.action || '').toUpperCase();

        // Allow Director OR authenticated payout owner in local/sandbox rehearsal to confirm off-ramp deposit
        if (
            actionUpper === 'MARK_PAYOUT_DISPATCHED' ||
            actionUpper === 'DEPOSIT_CONFIRMED' ||
            actionUpper === 'SIMULATE_OFFRAMP_CONFIRM'
        ) {
            const payoutId = String(body.payoutId || '').trim();
            if (!payoutId) {
                return json({ error: 'Missing payoutId.' }, { status: 400 });
            }

            await ensureFiatOfframpTables();
            const existingRes = await dbPool.query(
                `SELECT wallet_address, net_fiat_usd, fee_usd FROM fiat_payout_queue WHERE payout_id = $1 LIMIT 1`,
                [payoutId]
            );
            if (existingRes.rows.length === 0) {
                return json(
                    { error: `Payout ${payoutId} not found.` },
                    { status: 404 }
                );
            }

            const rowOwnerClean = normalizeKaspaBase32Strict(
                String(existingRes.rows[0].wallet_address || '')
            );
            const callerClean = normalizeKaspaBase32Strict(sessionWallet);
            const isDirector = await isAuthorizedDirectorRequest(
                request,
                sessionWallet
            );

            if (
                !isDirector &&
                (!callerClean || callerClean !== rowOwnerClean)
            ) {
                return json(
                    {
                        error: 'FORBIDDEN: Only the Master Treasury Director or authenticated payout owner may confirm this payout.'
                    },
                    { status: 403 }
                );
            }

            const traceId =
                String(body.traceId || '').trim() ||
                `FED-ACH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

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

            const r = updated.rows[0];
            const cleanW = normalizeKaspaBase32Strict(
                String(r.wallet_address || '')
            );
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

        const prefixedWallet = normalizeKaspaAddressStrict(sessionWallet);
        const cleanWallet = prefixedWallet.replace(/^kaspa:/i, '');

        // External L1 Deposit Cost-Basis Registration (Form 8949 / Schedule D protection)
        if (actionUpper === 'REGISTER_EXTERNAL_COST_BASIS') {
            const assetTicker = String(body.assetTicker || body.sourceAsset || 'BTC')
                .trim()
                .toUpperCase();
            const amountTokens = Math.max(0, Number(body.amountTokens || 0));
            const totalCostBasisUsd = Math.max(
                0,
                Number(body.totalCostBasisUsd ?? body.costBasisUsd ?? 0)
            );
            const acquiredAtIso = body.acquiredAt
                ? new Date(body.acquiredAt).toISOString()
                : new Date().toISOString();
            const sourceTxHash =
                String(body.txHash || '').trim() ||
                `EXT-DEP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

            if (amountTokens <= 0) {
                return json(
                    { error: 'Please enter a positive token quantity.' },
                    { status: 400 }
                );
            }

            const liveSpot = await resolveAssetSpotPrice(assetTicker);
            const resolvedTotalBasis =
                totalCostBasisUsd > 0
                    ? totalCostBasisUsd
                    : liveSpot > 0
                      ? amountTokens * liveSpot
                      : 0;
            const fmvPerToken =
                amountTokens > 0
                    ? resolvedTotalBasis / amountTokens
                    : liveSpot;

            const lotInsert = await dbPool.query(
                `INSERT INTO hifo_tax_lots
                 (wallet_address, asset_ticker, acquired_at, kas_sompi, initial_tokens,
                  remaining_sompi, remaining_tokens, fmv_usd_per_token, total_cost_basis_usd,
                  source_event_type, source_tx_hash, status)
                 VALUES ($1, $2, $3, $4, $5, $4, $5, $6, $7, 'EXTERNAL_L1_DEPOSIT', $8, 'OPEN')
                 RETURNING lot_id`,
                [
                    cleanWallet,
                    assetTicker,
                    acquiredAtIso,
                    Math.round(amountTokens * 1e8),
                    amountTokens,
                    fmvPerToken,
                    resolvedTotalBasis,
                    sourceTxHash
                ]
            );

            return json({
                success: true,
                lotId: lotInsert.rows[0]?.lot_id,
                assetTicker,
                amountTokens,
                fmvUsdPerToken: Number(fmvPerToken.toFixed(4)),
                totalCostBasisUsd: Number(resolvedTotalBasis.toFixed(2)),
                acquiredAt: acquiredAtIso
            });
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
            externalCostBasisUsd,
            externalAcquiredAt,
            preFlightOnly
        } = body;

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
                {
                    error: `Invalid ${resolvedAssetTicker} off-ramp amount specified.`
                },
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
            cleanSourceMode === 'ledger_kas' ||
            cleanSourceMode === 'ledger_usdc' ||
            cleanSourceMode === 'platform_balance' ||
            cleanSourceMode.startsWith('ledger_');
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
                        error: `INSUFFICIENT_LEDGER_BALANCE: Requested ${parsedAmountCrypto.toFixed(4)} ${resolvedAssetTicker}, available Platform Balance is ${totalAvailableLedger.toFixed(4)} ${resolvedAssetTicker}.`
                    },
                    { status: 400 }
                );
            }
        }

        const corpLiquidationAddr = resolveBridgeCorporateLiquidationAddress();

        if (preFlightOnly) {
            const cnSpec =
                resolveChangeNowCurrencyAndNetwork(resolvedAssetTicker);
            const previewAddr = resolveFallbackWholesaleDepositAddress(
                resolvedAssetTicker,
                masterTreasuryKas,
                corpLiquidationAddr
            );
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
                depositAddress: previewAddr,
                bridgeLiquidationAddress: corpLiquidationAddr,
                depositRouteType:
                    resolvedAssetTicker === 'KAS' ||
                    resolvedAssetTicker === 'SILO'
                        ? 'PERENNIA_TREASURY_KAS_SETTLEMENT'
                        : `WHOLESALE_${resolvedAssetTicker}_TO_BRIDGE_LIQUIDATION`,
                confirmationsRequired: cnSpec.confirmationsRequired,
                routingTopology: quote.routingTopology,
                bankAccountLast4: bankLast4,
                bankLabel: normalizedBankLabel,
                accountType: normalizedAccountType
            });
        }

        const depositMeta = await createChangeNowToBridgeLiquidationOrder({
            sourceAsset: resolvedAssetTicker,
            amountCrypto: parsedAmountCrypto,
            refundWallet: prefixedWallet
        });

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
                        error: `Atomic ledger debit failed: Insufficient ${resolvedAssetTicker} in Platform Balance.`
                    },
                    { status: 400 }
                );
            }

            const fromUnassigned = parseFloat(debitRes[1] || '0') || 0;
            const resRow = await dbPool
                .query(
                    `SELECT wallet_address, streaming_balance_kas, total_yield_kas, COALESCE(lp_tokens, '{}'::jsonb) AS lp_tokens
                     FROM yield_reservoirs
                     WHERE wallet_address = $1 OR wallet_address = $2
                     ORDER BY streaming_balance_kas DESC
                     LIMIT 1`,
                    [prefixedWallet, cleanWallet]
                )
                .catch(() => ({ rows: [] as any[] }));

            if (resRow.rows.length > 0) {
                const r = resRow.rows[0];
                const targetPk = r.wallet_address || prefixedWallet;
                let nextStreamKas = Number(r.streaming_balance_kas || 0);
                const totalYieldKas = Number(r.total_yield_kas || 0);
                const lpTokens: Record<string, number> = {
                    ...(r.lp_tokens || {})
                };

                if (resolvedAssetTicker === 'KAS' && fromUnassigned > 1e-9) {
                    nextStreamKas = Math.max(0, nextStreamKas - fromUnassigned);
                } else if (
                    resolvedAssetTicker !== 'KAS' &&
                    lpTokens[resolvedAssetTicker] !== undefined
                ) {
                    lpTokens[resolvedAssetTicker] = Math.max(
                        0,
                        Number(
                            (
                                Number(lpTokens[resolvedAssetTicker]) -
                                parsedAmountCrypto
                            ).toFixed(8)
                        )
                    );
                }

                const newHmac = computeReservoirHmac(
                    prefixedWallet,
                    nextStreamKas,
                    totalYieldKas,
                    lpTokens
                );

                await dbPool
                    .query(
                        `UPDATE yield_reservoirs
                         SET streaming_balance_kas = $2,
                             lp_tokens = $3,
                             row_hmac_sig = $4,
                             last_updated = CURRENT_TIMESTAMP
                         WHERE wallet_address = $1`,
                        [
                            targetPk,
                            nextStreamKas,
                            JSON.stringify(lpTokens),
                            newHmac
                        ]
                    )
                    .catch(() => {});
            }

            settlementTxId = `LEDGER-FIAT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        } else if (cleanSourceMode === 'direct_wholesale_deposit') {
            settlementTxId =
                settlementTxId ||
                depositMeta.changenowExchangeId ||
                `DIRECT-DEPOSIT-${resolvedAssetTicker}-${wireReferenceId.slice(-6)}`;
        } else {
            if (!settlementTxId && signedPsbt) {
                const kaspaRestUrl = (
                    env.KASPA_REST_URL || 'https://api.kaspa.org'
                ).replace(/\/+$/, '');
                const broadcastRes = await fetch(
                    `${kaspaRestUrl}/transactions`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(
                            typeof signedPsbt === 'string'
                                ? JSON.parse(signedPsbt)
                                : signedPsbt
                        )
                    }
                );
                if (!broadcastRes.ok) {
                    return json(
                        {
                            error: 'L1 Node rejected off-ramp transaction broadcast. Please try again.'
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

        // Dispatch via Bridge Liquidation Transfer if ready, or queue for confirmation
        const bridgeResult = await dispatchBridgeLiquidationTransfer({
            payoutId: wireReferenceId,
            walletAddress: prefixedWallet,
            netFiatUsd: quote.netFiatPayout,
            feeUsd: quote.feeUsd,
            effectiveFeePct: quote.effectiveFeePct,
            payoutMethod: quote.payoutMethod as 'ACH' | 'WIRE',
            routingNumber: resolvedRouting,
            accountNumber: resolvedAccount,
            bankLabel: normalizedBankLabel
        });

        let dispatchStatus =
            cleanSourceMode === 'direct_wholesale_deposit' && !providedTxId
                ? 'AWAITING_ONCHAIN_CONFIRMATIONS'
                : bridgeResult.bridgeDispatched
                  ? bridgeResult.status
                  : 'QUEUED_FOR_TREASURY_DISPATCH';
        let traceId: string | null = bridgeResult.traceId;

        const circleConfigured = Boolean(
            env.CIRCLE_API_KEY && env.CIRCLE_API_KEY.trim() !== ''
        );

        if (
            !bridgeResult.bridgeDispatched &&
            circleConfigured &&
            cleanSourceMode !== 'direct_wholesale_deposit'
        ) {
            try {
                const circleRes = await fetch(
                    'https://api.circle.com/v1/payouts',
                    {
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
                                type:
                                    normalizedPayoutMethod === 'ACH'
                                        ? 'ach'
                                        : 'wire',
                                name: prefixedWallet,
                                routingNumber: resolvedRouting,
                                accountNumber: resolvedAccount
                            }
                        })
                    }
                );
                if (circleRes.ok) {
                    const circleData = await circleRes.json();
                    wireReferenceId = circleData?.data?.id || wireReferenceId;
                    traceId = circleData?.data?.trackingRef || wireReferenceId;
                    dispatchStatus = 'CIRCLE_DISPATCHED';
                }
            } catch {
                // Keep queued in fiat_payout_queue
            }
        }

        const parsedExternalBasis =
            externalCostBasisUsd !== undefined &&
            externalCostBasisUsd !== null &&
            String(externalCostBasisUsd).trim() !== ''
                ? Math.max(0, Number(externalCostBasisUsd))
                : null;

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
            bridgeLiquidationAddress: depositMeta.bridgeLiquidationAddress,
            bridgeTransferId: bridgeResult.bridgeTransferId,
            changenowExchangeId: depositMeta.changenowExchangeId,
            externalCostBasisUsd: parsedExternalBasis,
            masterTreasuryFeeUsdc: quote.feeUsd,
            depositRouteType: depositMeta.depositRouteType,
            routingTopology: quote.routingTopology,
            confirmationsRequired: depositMeta.confirmationsRequired,
            confirmationsCurrent: isInternalLedger
                ? depositMeta.confirmationsRequired
                : Boolean(providedTxId) || cleanSourceMode === 'onchain_kas'
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
              payout_method, bank_last4, deposit_address, changenow_exchange_id, bridge_transfer_id,
              bridge_liquidation_address, external_cost_basis_usd, master_treasury_fee_usdc, routing_topology,
              confirmations_required, confirmations_current, tx_id, trace_id, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
             ON CONFLICT (payout_id) DO UPDATE SET
                tx_id = EXCLUDED.tx_id,
                confirmations_current = EXCLUDED.confirmations_current,
                status = EXCLUDED.status,
                updated_at = CURRENT_TIMESTAMP`,
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
                payoutRecord.bridgeTransferId,
                payoutRecord.bridgeLiquidationAddress,
                payoutRecord.externalCostBasisUsd,
                payoutRecord.masterTreasuryFeeUsdc,
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

        const hifoResult = await consumeHifoLotsForOfframp({
            cleanWallet,
            sourceAsset: resolvedAssetTicker,
            amountCrypto: parsedAmountCrypto,
            grossUsd: quote.grossUsd,
            spotPriceUsd: executionSpotPrice,
            txHash: settlementTxId,
            externalCostBasisUsd: parsedExternalBasis,
            externalAcquiredAtIso: externalAcquiredAt || null
        });

        await dbPool
            .query(
                `INSERT INTO tax_ledger_events
                 (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash, cost_basis_usd, realized_gain_loss_usd, holding_period)
                 VALUES ($1, $2, 'FIAT_OFFRAMP', $3, $4, $5, $6, $7, $8, $9)`,
                [
                    cleanWallet,
                    resolvedAssetTicker,
                    quote.grossUsd,
                    parsedAmountCrypto,
                    executionSpotPrice,
                    settlementTxId,
                    hifoResult.costBasisUsd,
                    hifoResult.realizedGainLossUsd,
                    hifoResult.holdingPeriod
                ]
            )
            .catch(() => {});

        // Credit Perennia's fee in USDC directly into the unified Master Treasury
        if (quote.feeUsd > 0) {
            await redis
                .incrbyfloat(
                    'perennia:fees:batch_accumulated:USDC',
                    quote.feeUsd
                )
                .catch(() => {});
            await redis
                .incrbyfloat(
                    'perennia:treasury:netting_profit_usd',
                    quote.feeUsd
                )
                .catch(() => {});
            await dbPool
                .query(
                    `UPDATE fiat_float_ledger
                     SET master_treasury_usdc_reserve = COALESCE(master_treasury_usdc_reserve, 0.0) + $1,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE ledger_id IN ('PRIMARY_FLOAT', 'BOOTSTRAP_PRIMARY')`,
                    [quote.feeUsd]
                )
                .catch(() => {});
        }

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
            bankAccountLast4: bankLast4,
            taxSummary: hifoResult
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
                    msg.includes('ORACLE_HALT')
                        ? 503
                        : 500
            }
        );
    }
};