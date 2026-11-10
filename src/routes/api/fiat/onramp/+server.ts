import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import Stripe from 'stripe';
import { redis } from '$lib/server/redis';
import { dbPool } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import {
    getKycMasterKeyStrict,
    encryptBankRailRecordStrict,
    decryptBankRailRecordStrict,
    isWalletMasterAdmin,
    normalizeKaspaAddressStrict,
    normalizeKaspaBase32Strict,
    perenniaKMS,
    type DecryptedBankRailPayload
} from '$lib/server/kms';
import {
    executeOrQueueL1Dispatch,
    computeReservoirHmac
} from '$lib/server/l1Dispatcher';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const HARD_PROFIT_FLOOR_PCT = 0.001;
const RETAIL_TIER_BPS = 85;
const PRO_MINER_TIER_BPS = 35;
const INSTITUTIONAL_WIRE_TIER_BPS = 20;
const MIN_FEE_FLOOR_CENTS = 250;
const ACH_AUTO_DEFAULT_CENTS = 62_500;
const PRO_TIER_THRESHOLD_CENTS = 1_000_000;
const INSTITUTIONAL_WIRE_THRESHOLD_CENTS = 10_000_000;

const MERCURY_COLUMN_WIRE_COORDINATES = {
    beneficiaryName: 'Perennia, LLC',
    beneficiaryAddress: '2508 Buttercup Drive, Richardson, TX 75082',
    bankName: 'Column N.A. (Mercury)',
    accountDescriptor: 'COLUMN NA-MERCURY ending in 9901',
    routingNumber: '121145433',
    accountNumber: '580798008849901',
    accountLast4: '9901',
    bankAddress:
        '1 Letterman Drive, Building A, Suite A4-700, San Francisco, CA 94129',
    accountType: 'COMMERCIAL CHECKING'
} as const;

const CORE_STATIC_TICKERS = new Set([
    'KAS',
    'SILO',
    'USDC',
    'USDT',
    'USD',
    'BTC',
    'ETH',
    'SOL',
    'XRP',
    'DOGE',
    'POL',
    'AVAX',
    'SUI',
    'TRX',
    'ZEC',
    'ARB',
    'BASE',
    'SPY',
    'QQQ',
    'NVDA',
    'AAPL',
    'TSLA',
    'AMD',
    'TSM',
    'AVGO',
    'XLE',
    'XAU',
    'XAG',
    'USTB'
]);

const MIN_DISCOVERY_VOLUME_USD = 25_000;
const MAX_DISCOVERY_SPREAD_RATIO = 0.05;
const MAX_CANONICAL_DEVIATION_RATIO = 0.08;

function roundCents(val: number): number {
    return Math.round(val * 100) / 100;
}

function matchesConfiguredAdminBearer(authHeader: string): boolean {
    if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
    try {
        if (perenniaKMS.verifyMasterAdminKey(authHeader)) {
            return true;
        }
    } catch {
        // Fall through to explicit env check
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

function isUsableStripeSecretKey(rawKey: string | undefined): boolean {
    const key = String(rawKey || '').trim();
    if (!key) return false;
    if (
        !key.startsWith('sk_test_') &&
        !key.startsWith('sk_live_') &&
        !key.startsWith('rk_test_') &&
        !key.startsWith('rk_live_')
    ) {
        return false;
    }
    const lower = key.toLowerCase();
    if (
        lower.includes('your_') ||
        lower.includes('placeholder') ||
        lower.includes('example') ||
        lower.includes('*****') ||
        lower.endsWith('_key') ||
        key.length < 30
    ) {
        return false;
    }
    return true;
}

function isUsableBridgeApiKey(rawKey: string | undefined): boolean {
    const key = String(rawKey || '').trim();
    if (!key || key.length < 16) return false;
    const lower = key.toLowerCase();
    if (
        lower.includes('your_') ||
        lower.includes('placeholder') ||
        lower.includes('example') ||
        lower.includes('*****')
    ) {
        return false;
    }
    return true;
}

function areLiveProductionGatewaysActive(request: Request): boolean {
    if (request.headers.get('x-perennia-sandbox') === 'true') {
        return false;
    }
    if (String(env.SANDBOX_MODE || '').toLowerCase() === 'true') {
        return false;
    }
    const stripeKey = String(env.STRIPE_SECRET_KEY || '').trim();
    const isStripeLive =
        isUsableStripeSecretKey(stripeKey) &&
        (stripeKey.startsWith('sk_live_') || stripeKey.startsWith('rk_live_'));
    const isBridgeLive =
        isUsableBridgeApiKey(env.BRIDGE_API_KEY) &&
        process.env.NODE_ENV === 'production';
    return isStripeLive || isBridgeLive;
}

async function isFiatOnrampPausedByKillSwitch(): Promise<boolean> {
    try {
        const flag = await redis.get('perennia:killswitch:fiat_onramp');
        if (flag && (flag === '1' || flag.toLowerCase() === 'true')) {
            return true;
        }
    } catch {
        // Ignore transient Redis error
    }
    return false;
}

async function isWalletOrAssetBlacklisted(
    cleanWallet: string,
    prefixedWallet: string,
    targetAsset: string
): Promise<string | null> {
    try {
        const cleanAsset = targetAsset.trim().toUpperCase();
        const [wClean, wPrefixed, tokenState, blkToken] = await Promise.all([
            cleanWallet
                ? redis.sismember(
                      'perennia:firewall:blacklisted_wallets',
                      cleanWallet
                  )
                : Promise.resolve(0),
            prefixedWallet
                ? redis.sismember(
                      'perennia:firewall:blacklisted_wallets',
                      prefixedWallet
                  )
                : Promise.resolve(0),
            redis.hget('perennia:steering:token_states', cleanAsset),
            redis.sismember('perennia:firewall:blacklisted_tokens', cleanAsset)
        ]);
        if (wClean === 1 || wPrefixed === 1) {
            return 'FIREWALL_REJECTED: This wallet address is blacklisted by the Perennia Security Firewall.';
        }
        if (
            blkToken === 1 ||
            String(tokenState || '').toUpperCase() === 'BLACKLISTED'
        ) {
            return `FIREWALL_REJECTED: Asset ${cleanAsset} is blacklisted by the Perennia Reserve Firewall.`;
        }
    } catch {
        // Continue if Redis check fails transiently
    }
    return null;
}

async function resolveWalletWholesaleFloorEligibility(
    cleanWallet: string,
    prefixedWallet: string
): Promise<{
    wholesaleFloorActive: boolean;
    protocolFeeFloorPct: number;
    feeTierLabel: string;
}> {
    if (cleanWallet) {
        try {
            const [loyaltyRaw, passRaw, graceShieldRaw] = await Promise.all([
                redis
                    .get(`perennia:miner:loyalty:${cleanWallet}`)
                    .catch(() => null),
                redis
                    .get(`perennia:subscription:pass:${cleanWallet}`)
                    .catch(() => null),
                redis
                    .get('perennia:stratum:maintenance_grace_shield')
                    .catch(() => null)
            ]);
            if (loyaltyRaw) {
                return {
                    wholesaleFloorActive: true,
                    protocolFeeFloorPct: 0.35,
                    feeTierLabel: '0.35% Active Stratum Miner Loyalty Tier'
                };
            }
            if (passRaw) {
                return {
                    wholesaleFloorActive: true,
                    protocolFeeFloorPct: 0.35,
                    feeTierLabel: '0.35% Active Subscriber Loyalty Tier'
                };
            }
            const graceShieldActive =
                graceShieldRaw === '1' ||
                String(graceShieldRaw || '').toLowerCase() === 'true';
            const nowMs = Date.now();
            const graceWindowMs = graceShieldActive ? 86_400_000 : 7_200_000;
            const graceCutoffMs = nowMs - graceWindowMs;
            const graceCutoffSecs =
                Math.floor(nowMs / 1000) - Math.floor(graceWindowMs / 1000);
            const [workerRes, siloRes] = await Promise.all([
                dbPool
                    .query(
                        `SELECT 1
                         FROM worker_profiles
                         WHERE (LOWER(REPLACE(TRIM(wallet_address), 'kaspa:', '')) = $1 OR wallet_address = $2)
                           AND (
                               status IN ('online', 'grace_period')
                               OR (last_share_ts > 10000000000 AND last_share_ts >= $3)
                               OR (last_share_ts > 0 AND last_share_ts <= 10000000000 AND last_share_ts >= $4)
                           )
                         LIMIT 1`,
                        [
                            cleanWallet,
                            prefixedWallet,
                            graceCutoffMs,
                            graceCutoffSecs
                        ]
                    )
                    .catch(() => ({ rows: [] as any[] })),
                dbPool
                    .query(
                        `SELECT COALESCE(SUM(amount_staked), 0.0) AS staked
                         FROM silo_staking_positions
                         WHERE (wallet_address = $1 OR wallet_address = $2)
                           AND status IN ('ACTIVE', 'COOLDOWN')`,
                        [prefixedWallet, cleanWallet]
                    )
                    .catch(() => ({ rows: [{ staked: 0 }] }))
            ]);
            if (workerRes.rows.length > 0) {
                return {
                    wholesaleFloorActive: true,
                    protocolFeeFloorPct: 0.35,
                    feeTierLabel: '0.35% Active Stratum Miner Loyalty Tier'
                };
            }
            if (Number(siloRes.rows[0]?.staked || 0) >= 10_000) {
                return {
                    wholesaleFloorActive: true,
                    protocolFeeFloorPct: 0.35,
                    feeTierLabel: '0.35% SILO Staker Loyalty Tier'
                };
            }
        } catch {
            // Fall through to default retail tier
        }
    }
    return {
        wholesaleFloorActive: false,
        protocolFeeFloorPct: 0.85,
        feeTierLabel: '0.85% Retail On-Ramp Tier ($2.50 Floor)'
    };
}

function sanitizeCustomerFacingFiatError(err: any): {
    userMessage: string;
    httpStatus: number;
} {
    const rawMsg = String(err?.message || '');
    const stripeCode = String(err?.code || err?.raw?.code || '').toLowerCase();
    const stripeType = String(err?.type || err?.raw?.type || '');
    if (
        rawMsg.includes('CIRCUIT_BREAKER_TRIPPED') ||
        rawMsg.includes('FIREWALL_REJECTED') ||
        rawMsg.includes('SUBSYSTEM_PAUSED')
    ) {
        return {
            userMessage: rawMsg,
            httpStatus: rawMsg.includes('FIREWALL_REJECTED') ? 403 : 503
        };
    }
    if (
        stripeType === 'StripeAuthenticationError' ||
        rawMsg.includes('Invalid API Key') ||
        rawMsg.includes('api_key') ||
        rawMsg.includes('sk_test_') ||
        rawMsg.includes('sk_live_') ||
        rawMsg.includes('STRIPE_NOT_CONFIGURED')
    ) {
        return {
            userMessage:
                'Instant Stripe checkout is operating in sandbox mode while live gateway credentials are being updated. You can complete settlement immediately or use Same-Day Bank Wire.',
            httpStatus: 503
        };
    }
    if (
        stripeCode === 'routing_number_invalid' ||
        stripeCode === 'bank_account_unusable' ||
        rawMsg.toLowerCase().includes('routing number')
    ) {
        return {
            userMessage:
                'The 9-digit bank routing number could not be verified for ACH debit. Please check your routing number and try again.',
            httpStatus: 400
        };
    }
    if (
        stripeCode === 'account_number_invalid' ||
        rawMsg.toLowerCase().includes('account number')
    ) {
        return {
            userMessage:
                'The bank account number entered is invalid. Please double-check your checking or savings account number.',
            httpStatus: 400
        };
    }
    if (
        stripeCode === 'insufficient_funds' ||
        stripeCode === 'bank_account_declined' ||
        stripeCode === 'charge_declined'
    ) {
        return {
            userMessage:
                'Your bank declined the debit request. Please verify your available balance or try another bank account.',
            httpStatus: 402
        };
    }
    if (rawMsg.includes('ORACLE_HALT') || rawMsg.includes('CHANGENOW')) {
        return {
            userMessage:
                'Live market pricing for this asset is temporarily syncing. Please wait a few seconds and try again.',
            httpStatus: 503
        };
    }
    if (
        rawMsg.includes('UNAUTHORIZED') ||
        rawMsg.includes('FORBIDDEN') ||
        rawMsg.includes('INVALID_KASPA_ADDRESS')
    ) {
        return {
            userMessage: rawMsg,
            httpStatus: rawMsg.includes('FORBIDDEN') ? 403 : 401
        };
    }
    return {
        userMessage:
            'Unable to complete your purchase right now. Your bank account was not charged â€” please try again shortly.',
        httpStatus: 500
    };
}

function computePostTradeUsdAllocation(
    grossUsd: number,
    perenniaFeeUsd?: number
) {
    const safeGross = Math.max(0, grossUsd);
    const wholesaleApiFloatSweepUsd = roundCents(safeGross * 0.485);
    const chronosMinerSettlementUsd = roundCents(safeGross * 0.49);
    const llcTaxAndRailReserveUsd = roundCents(safeGross * 0.007);
    const netProfitAndRatchetUsd =
        perenniaFeeUsd !== undefined && perenniaFeeUsd > 0
            ? roundCents(perenniaFeeUsd)
            : roundCents(
                  Math.max(
                      2.5,
                      safeGross * HARD_PROFIT_FLOOR_PCT,
                      safeGross -
                          wholesaleApiFloatSweepUsd -
                          chronosMinerSettlementUsd -
                          llcTaxAndRailReserveUsd
                  )
              );
    const perenniaLpCompound60Usd = roundCents(netProfitAndRatchetUsd * 0.6);
    const liquidClearingReserve40Usd = roundCents(
        Math.max(0, netProfitAndRatchetUsd - perenniaLpCompound60Usd)
    );
    return {
        grossInboundUsd: roundCents(safeGross),
        wholesaleApiFloatSweepUsd,
        chronosMinerSettlementUsd,
        llcTaxAndRailReserveUsd,
        netProfitAndRatchetUsd,
        floatRatchetReinvestUsd: perenniaLpCompound60Usd,
        darkPoolLpAndOwnerDrawUsd: liquidClearingReserve40Usd,
        perenniaLpCompound60Usd,
        liquidClearingReserve40Usd
    };
}

function resolveChangeNowCurrencyAndNetwork(ticker: string): {
    currency: string;
    network: string;
} {
    const clean = ticker.trim().toUpperCase();
    switch (clean) {
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
        case 'TON':
            return { currency: 'ton', network: 'ton' };
        case 'ADA':
            return { currency: 'ada', network: 'ada' };
        case 'LINK':
            return { currency: 'link', network: 'eth' };
        case 'LTC':
            return { currency: 'ltc', network: 'ltc' };
        case 'HYPE':
            return { currency: 'hype', network: 'hyperliquid' };
        default:
            return { currency: clean.toLowerCase(), network: 'eth' };
    }
}

function estimateConservativeChangeNowFallbackOutput(
    toTicker: string,
    netUsdAfterPerenniaFee: number,
    targetSpotUsd: number
): number {
    if (netUsdAfterPerenniaFee <= 0 || targetSpotUsd <= 0) return 0;
    const clean = toTicker.trim().toUpperCase();
    if (clean === 'KAS' || clean === 'SILO' || clean === 'USDC') {
        return Number((netUsdAfterPerenniaFee / targetSpotUsd).toFixed(6));
    }
    const networkWithdrawalFeeUsd =
        clean === 'BTC'
            ? 1.25
            : clean === 'ETH' || clean === 'USDT'
              ? 0.5
              : 0.15;
    const externalSpreadFactor = 0.9965;
    const effectiveUsd = Math.max(
        netUsdAfterPerenniaFee * 0.92,
        netUsdAfterPerenniaFee * externalSpreadFactor - networkWithdrawalFeeUsd
    );
    return Number((effectiveUsd / targetSpotUsd).toFixed(6));
}

async function fetchChangeNowEstimatedAmount(
    fromTicker: string,
    toTicker: string,
    fromAmount: number,
    fallbackTargetSpotUsd = 0
): Promise<number> {
    const apiKey = (env.CHANGENOW_API_KEY || '').trim();
    const fromSpec = resolveChangeNowCurrencyAndNetwork(fromTicker);
    const toSpec = resolveChangeNowCurrencyAndNetwork(toTicker);
    if (
        fromSpec.currency === toSpec.currency &&
        fromSpec.network === toSpec.network
    ) {
        return fromAmount;
    }
    if (!apiKey) {
        if (fallbackTargetSpotUsd > 0) {
            return estimateConservativeChangeNowFallbackOutput(
                toTicker,
                fromAmount,
                fallbackTargetSpotUsd
            );
        }
        return 0;
    }
    try {
        const url = `https://api.changenow.io/v2/exchange/estimated-amount?fromCurrency=${encodeURIComponent(fromSpec.currency)}&toCurrency=${encodeURIComponent(toSpec.currency)}&fromAmount=${fromAmount.toFixed(8)}&fromNetwork=${encodeURIComponent(fromSpec.network)}&toNetwork=${encodeURIComponent(toSpec.network)}&flow=standard`;
        const res = await fetch(url, {
            headers: {
                'x-changenow-api-key': apiKey,
                accept: 'application/json'
            },
            signal: AbortSignal.timeout(6000)
        });
        if (res.ok) {
            const data = await res.json();
            const rawToAmount = Number(data?.toAmount ?? 0);
            const withdrawalFee = Math.max(0, Number(data?.withdrawalFee ?? 0));
            if (Number.isFinite(rawToAmount) && rawToAmount > 0) {
                const spotCap =
                    fallbackTargetSpotUsd > 0
                        ? fromAmount / fallbackTargetSpotUsd
                        : rawToAmount;
                const netAfterFee =
                    rawToAmount > spotCap && withdrawalFee > 0
                        ? Math.max(0, rawToAmount - withdrawalFee)
                        : rawToAmount;
                return Number(Math.min(netAfterFee, spotCap).toFixed(8));
            }
        }
    } catch {
        // Fallback below
    }
    if (fallbackTargetSpotUsd > 0) {
        return estimateConservativeChangeNowFallbackOutput(
            toTicker,
            fromAmount,
            fallbackTargetSpotUsd
        );
    }
    throw new Error(
        `ORACLE_HALT: Unable to compute conversion quote for ${toTicker}.`
    );
}

async function createChangeNowDropShipOrder(params: {
    fromTicker: string;
    toTicker: string;
    fromAmount: number;
    destinationAddress: string;
}): Promise<{
    exchangeId: string;
    payinAddress: string;
    expectedToAmount: number | null;
}> {
    const apiKey = (env.CHANGENOW_API_KEY || '').trim();
    if (!apiKey) {
        const corpHot = await perenniaKMS.getCorporateAddresses();
        return {
            exchangeId: `LOCAL-SOR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
            payinAddress: corpHot.ETH || corpHot.KAS,
            expectedToAmount: null
        };
    }
    const fromSpec = resolveChangeNowCurrencyAndNetwork(params.fromTicker);
    const toSpec = resolveChangeNowCurrencyAndNetwork(params.toTicker);
    try {
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
        if (res.ok) {
            const data = await res.json();
            const exchangeId = String(data?.id || '').trim();
            const payinAddress = String(data?.payinAddress || '').trim();
            const toAmountNum = Number(data?.toAmount ?? 0);
            if (exchangeId && payinAddress) {
                return {
                    exchangeId,
                    payinAddress,
                    expectedToAmount:
                        Number.isFinite(toAmountNum) && toAmountNum > 0
                            ? toAmountNum
                            : null
                };
            }
        }
    } catch {
        // Fall back to internal treasury routing
    }
    const corpHot = await perenniaKMS.getCorporateAddresses();
    return {
        exchangeId: `LOCAL-SOR-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
        payinAddress: corpHot.ETH || corpHot.KAS,
        expectedToAmount: null
    };
}

function calculateOnrampCostPlusQuote(params: {
    assetTicker: string;
    grossUsd: number;
    spotPriceUsd: number;
    paymentRail?: string;
    paymentMethod?: string;
    settlementTarget?: string;
    autoStakeSilo?: boolean;
    bundledKasOrSilo?: boolean;
    wholesaleFloorActive?: boolean;
    simulateGasSpikeUsd?: number;
}) {
    const ticker = String(params.assetTicker || 'KAS').trim().toUpperCase();
    const principalUsd = Math.max(10, Number(params.grossUsd || 250));
    const principalCents = Math.round(principalUsd * 100);
    const loyalMinerOrSubscriber = Boolean(params.wholesaleFloorActive);
    const railUpper = String(params.paymentRail || '').toUpperCase();
    const explicitMethod = String(params.paymentMethod || '').toLowerCase();

    const isInstitutionalWire =
        principalCents >= INSTITUTIONAL_WIRE_THRESHOLD_CENTS ||
        (railUpper !== 'SOVEREIGN_WIRE_ACH' && railUpper.includes('WIRE')) ||
        railUpper.includes('BRIDGE') ||
        explicitMethod === 'wire';

    const isProOrMiner =
        !isInstitutionalWire &&
        (principalCents >= PRO_TIER_THRESHOLD_CENTS || loyalMinerOrSubscriber);

    const tierName: 'RETAIL' | 'PRO_MINER' | 'INSTITUTIONAL_WIRE' =
        principalCents >= INSTITUTIONAL_WIRE_THRESHOLD_CENTS
            ? 'INSTITUTIONAL_WIRE'
            : isProOrMiner
              ? 'PRO_MINER'
              : 'RETAIL';

    const tierBps =
        tierName === 'INSTITUTIONAL_WIRE'
            ? INSTITUTIONAL_WIRE_TIER_BPS
            : tierName === 'PRO_MINER'
              ? PRO_MINER_TIER_BPS
              : RETAIL_TIER_BPS;

    const tierBadgeLabel =
        tierName === 'INSTITUTIONAL_WIRE'
            ? 'ðŸ›ï¸ Institutional Wire Tier (0.20% Net â€¢ $0 Gateway Fee)'
            : tierName === 'PRO_MINER'
              ? loyalMinerOrSubscriber
                  ? 'â›ï¸ Pro & Miner Loyalty Tier (0.35% Net â€¢ $2.50 Floor)'
                  : 'âš¡ Pro Volume Tier (0.35% Net â€¢ $2.50 Floor)'
              : 'ðŸ›¡ï¸ Retail Tier (0.85% Net â€¢ $2.50 Floor)';

    const perenniaFeeCents = Math.max(
        MIN_FEE_FLOOR_CENTS,
        Math.ceil((principalCents * tierBps) / 10_000)
    );
    const gasSpikeCents = Math.max(
        0,
        Math.round(Number(params.simulateGasSpikeUsd || 0) * 100)
    );
    const targetNetCents = principalCents + perenniaFeeCents + gasSpikeCents;

    let resolvedMethod: 'ach' | 'card' | 'wire' = 'ach';
    if (
        principalCents >= INSTITUTIONAL_WIRE_THRESHOLD_CENTS ||
        isInstitutionalWire
    ) {
        resolvedMethod = 'wire';
    } else if (explicitMethod === 'card' || railUpper === 'CARD_INSTANT') {
        resolvedMethod = 'card';
    } else {
        resolvedMethod = 'ach';
    }

    let grossChargeCents = targetNetCents;
    if (resolvedMethod === 'wire') {
        grossChargeCents = targetNetCents;
    } else if (resolvedMethod === 'card') {
        grossChargeCents = Math.ceil((targetNetCents + 30) / 0.971);
    } else {
        if (principalCents >= ACH_AUTO_DEFAULT_CENTS) {
            grossChargeCents = targetNetCents + 500;
        } else {
            const grossedBelowCap = Math.ceil(targetNetCents / 0.992);
            const impliedAchFee = grossedBelowCap - targetNetCents;
            grossChargeCents =
                impliedAchFee > 500 ? targetNetCents + 500 : grossedBelowCap;
        }
    }

    const stripeGatewayFeeCents = Math.max(
        0,
        grossChargeCents - targetNetCents
    );
    const totalFeeCents =
        perenniaFeeCents + stripeGatewayFeeCents + gasSpikeCents;

    const perenniaFeeUsd = roundCents(perenniaFeeCents / 100);
    const hardCostUsd = roundCents(
        (stripeGatewayFeeCents + gasSpikeCents) / 100
    );
    const feeUsd = roundCents(totalFeeCents / 100);
    const totalGrossChargeUsd = roundCents(grossChargeCents / 100);
    const effectiveFeePct =
        principalUsd > 0 ? roundCents((feeUsd / principalUsd) * 100) : 0;
    const protocolFeeFloorPct = Number((tierBps / 100).toFixed(2));

    // MoonPay charges $3.99 base/ecosystem fee + 4.5% card fee (or 3.5% ACH / 1.25% wire)
    const moonpayFeeUsd = roundCents(
        resolvedMethod === 'card'
            ? 3.99 + principalUsd * 0.045
            : Math.max(
                  3.99,
                  principalUsd * (resolvedMethod === 'wire' ? 0.0125 : 0.035)
              )
    );
    // Coinbase charges $2.99 base spread + 3.84% card fee (or 2.49% ACH / 1.0% wire)
    const coinbaseFeeUsd = roundCents(
        resolvedMethod === 'card'
            ? 2.99 + principalUsd * 0.0384
            : Math.max(
                  2.99,
                  principalUsd * (resolvedMethod === 'wire' ? 0.01 : 0.0249)
              )
    );
    const competitorFeeUsd = Math.max(moonpayFeeUsd, coinbaseFeeUsd);
    const savingsVsMoonpayUsd = roundCents(Math.max(0, moonpayFeeUsd - feeUsd));
    const savingsVsCoinbaseUsd = roundCents(
        Math.max(0, coinbaseFeeUsd - feeUsd)
    );
    const guestSavingsUsd = Math.max(savingsVsMoonpayUsd, savingsVsCoinbaseUsd);
    const competitorNetUsd = roundCents(
        Math.max(0, totalGrossChargeUsd - competitorFeeUsd)
    );

    const isSiloOrKasBundle =
        Boolean(params.autoStakeSilo) ||
        Boolean(params.bundledKasOrSilo) ||
        String(params.settlementTarget || '').toUpperCase() ===
            'AUTO_STAKE_SILO';

    const routingTopology =
        resolvedMethod === 'wire'
            ? `Direct Domestic Wire â†’ Column N.A. / Mercury (*${MERCURY_COLUMN_WIRE_COORDINATES.accountLast4}) â†’ ${ticker}`
            : resolvedMethod === 'card'
              ? `Stripe Card Gross-Up (2.9% + $0.30) â†’ Mercury (*${MERCURY_COLUMN_WIRE_COORDINATES.accountLast4}) â†’ ${ticker}`
              : `Stripe ACH Gross-Up (0.8% Capped @ $5.00) â†’ Mercury (*${MERCURY_COLUMN_WIRE_COORDINATES.accountLast4}) â†’ ${ticker}`;

    let circuitBreakerTripped = false;
    let circuitBreakerReason: string | undefined = undefined;
    if (!Number.isFinite(params.spotPriceUsd) || params.spotPriceUsd <= 0) {
        circuitBreakerTripped = true;
        circuitBreakerReason = `CIRCUIT_BREAKER_TRIPPED: Live oracle price feed for ${ticker} is syncing. Please try again in a moment.`;
    } else if (perenniaFeeCents < MIN_FEE_FLOOR_CENTS) {
        circuitBreakerTripped = true;
        circuitBreakerReason = `CIRCUIT_BREAKER_TRIPPED: Net protocol margin ($${perenniaFeeUsd.toFixed(2)}) fell below the $2.50 minimum floor; failing closed.`;
    } else if (feeUsd > competitorFeeUsd && competitorFeeUsd > 0) {
        circuitBreakerTripped = true;
        circuitBreakerReason = `CIRCUIT_BREAKER_TRIPPED: Quoted fee ($${feeUsd.toFixed(2)}) exceeded maximum competitor fee cap ($${competitorFeeUsd.toFixed(2)}); failing closed.`;
    }

    const estimatedTokens =
        params.spotPriceUsd > 0
            ? Number((principalUsd / params.spotPriceUsd).toFixed(6))
            : 0;

    return {
        direction: 'ONRAMP' as const,
        assetTicker: ticker,
        tierName,
        tierBps,
        tierBadgeLabel,
        paymentMethod: resolvedMethod,
        principalCents,
        perenniaFeeCents,
        targetNetCents,
        stripeGatewayFeeCents,
        grossChargeCents,
        principalUsd: roundCents(principalUsd),
        perenniaFeeUsd,
        stripeGatewayFeeUsd: roundCents(stripeGatewayFeeCents / 100),
        totalGrossChargeUsd,
        grossUsd: totalGrossChargeUsd,
        hardCostUsd,
        guaranteedProfitUsd: perenniaFeeUsd,
        feeUsd,
        effectiveFeePct,
        protocolFeeFloorPct,
        minerOrPassDiscountActive:
            loyalMinerOrSubscriber || tierName !== 'RETAIL',
        netUsdConverted: roundCents(principalUsd),
        estimatedTokens,
        spotPriceUsd: params.spotPriceUsd,
        competitorFeeUsd,
        competitorNetUsd,
        guestSavingsUsd,
        moonpayFeeUsd,
        coinbaseFeeUsd,
        savingsVsMoonpayUsd,
        savingsVsCoinbaseUsd,
        routingTopology,
        paymentRail:
            resolvedMethod === 'wire'
                ? 'MERCURY_INSTITUTIONAL_WIRE'
                : resolvedMethod === 'card'
                  ? 'STRIPE_CARD_GROSS_UP'
                  : 'STRIPE_ACH_DIRECT_DEBIT',
        whaleWireFeeWaived: resolvedMethod === 'wire',
        bundledUsdcFeeWaived: ticker === 'USDC' && isSiloOrKasBundle,
        requiresInstitutionalWire:
            principalCents >= INSTITUTIONAL_WIRE_THRESHOLD_CENTS,
        autoDefaultedToAch:
            principalCents >= ACH_AUTO_DEFAULT_CENTS &&
            resolvedMethod === 'ach',
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
        const alterCols = [
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(32) NOT NULL DEFAULT 'ach';`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS tier_name VARCHAR(32) NOT NULL DEFAULT 'RETAIL';`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS tier_bps INTEGER NOT NULL DEFAULT 85;`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS quoted_principal_cents BIGINT NOT NULL DEFAULT 0;`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS perennia_fee_cents BIGINT NOT NULL DEFAULT 250;`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS stripe_gateway_fee_cents BIGINT NOT NULL DEFAULT 0;`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS gross_charge_cents BIGINT NOT NULL DEFAULT 0;`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS settled_net_cents BIGINT;`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS fulfilled_principal_cents BIGINT;`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS quarantine_reason TEXT;`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS changenow_exchange_id VARCHAR(128);`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS payin_address VARCHAR(255);`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(128);`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS stripe_onramp_session_id VARCHAR(128);`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS bridge_virtual_account_id VARCHAR(128);`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS bridge_wire_routing VARCHAR(64);`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS bridge_wire_account VARCHAR(64);`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS bank_last4 VARCHAR(10);`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS master_treasury_fee_usdc DOUBLE PRECISION NOT NULL DEFAULT 0.0;`
        ];
        for (const stmt of alterCols) {
            await client.query(stmt).catch(() => {});
        }
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
        await client.query(
            `ALTER TABLE fiat_float_ledger ADD COLUMN IF NOT EXISTS master_treasury_usdc_reserve DOUBLE PRECISION NOT NULL DEFAULT 0.0;`
        );
        await client.query(
            `ALTER TABLE fiat_float_ledger ADD COLUMN IF NOT EXISTS phase2_ach_target_usd DOUBLE PRECISION NOT NULL DEFAULT 250000.0;`
        );
        await client.query(`
            INSERT INTO fiat_float_ledger (ledger_id)
            VALUES ('PRIMARY_FLOAT'), ('BOOTSTRAP_PRIMARY')
            ON CONFLICT (ledger_id) DO NOTHING;
        `);
    } finally {
        client.release();
    }
}

async function saveOrLoadUserBankRail(params: {
    cleanWallet: string;
    prefixedWallet: string;
    routingNumber?: string;
    accountNumber?: string;
    bankLabel?: string;
    accountType?: string;
}): Promise<{
    decrypted: DecryptedBankRailPayload | null;
    bankLast4: string | null;
    bankLabel: string;
    accountType: 'CHECKING' | 'SAVINGS';
}> {
    getKycMasterKeyStrict();
    const cleanRouting = String(params.routingNumber || '')
        .replace(/\D/g, '')
        .trim();
    const cleanAccount = String(params.accountNumber || '')
        .replace(/\D/g, '')
        .trim();
    const normalizedType: 'CHECKING' | 'SAVINGS' =
        String(params.accountType || 'CHECKING').toUpperCase() === 'SAVINGS'
            ? 'SAVINGS'
            : 'CHECKING';
    const normalizedLabel =
        String(params.bankLabel || 'Primary Operating Account').trim() ||
        'Primary Operating Account';
    if (cleanRouting.length === 9 && cleanAccount.length >= 4) {
        const encrypted = encryptBankRailRecordStrict({
            routingNumber: cleanRouting,
            accountNumber: cleanAccount,
            bankLabel: normalizedLabel,
            accountType: normalizedType,
            payoutMethod: 'ACH'
        });
        const bankLast4 = cleanAccount.slice(-4);
        await dbPool.query(
            `INSERT INTO fiat_bank_rails
             (wallet_address, bank_label, account_type, payout_method, bank_last4, encrypted_rail_payload, updated_at)
             VALUES ($1, $2, $3, 'ACH', $4, $5, CURRENT_TIMESTAMP)
             ON CONFLICT (wallet_address) DO UPDATE SET
                bank_label = EXCLUDED.bank_label,
                account_type = EXCLUDED.account_type,
                bank_last4 = EXCLUDED.bank_last4,
                encrypted_rail_payload = EXCLUDED.encrypted_rail_payload,
                updated_at = CURRENT_TIMESTAMP`,
            [
                params.prefixedWallet,
                normalizedLabel,
                normalizedType,
                bankLast4,
                encrypted
            ]
        );
        await redis
            .set(
                `perennia:fiat:bank_rail:${params.cleanWallet}`,
                encrypted,
                'EX',
                60 * 60 * 24 * 30
            )
            .catch(() => {});
        return {
            decrypted: {
                routingNumber: cleanRouting,
                accountNumber: cleanAccount,
                bankLabel: normalizedLabel,
                accountType: normalizedType,
                payoutMethod: 'ACH'
            },
            bankLast4,
            bankLabel: normalizedLabel,
            accountType: normalizedType
        };
    }
    try {
        const dbRes = await dbPool.query(
            `SELECT bank_label, account_type, payout_method, bank_last4, encrypted_rail_payload
             FROM fiat_bank_rails
             WHERE wallet_address = $1 OR wallet_address = $2
             ORDER BY updated_at DESC
             LIMIT 1`,
            [params.prefixedWallet, params.cleanWallet]
        );
        if (dbRes.rows.length > 0) {
            const row = dbRes.rows[0];
            const decrypted = decryptBankRailRecordStrict(
                String(row.encrypted_rail_payload || '')
            );
            if (decrypted) {
                return {
                    decrypted,
                    bankLast4: String(
                        row.bank_last4 || decrypted.accountNumber.slice(-4)
                    ),
                    bankLabel: String(row.bank_label || decrypted.bankLabel),
                    accountType:
                        String(row.account_type || 'CHECKING').toUpperCase() ===
                        'SAVINGS'
                            ? 'SAVINGS'
                            : 'CHECKING'
                };
            }
        }
    } catch {
        // Fallback to Redis
    }
    const cachedRail = await redis
        .get(`perennia:fiat:bank_rail:${params.cleanWallet}`)
        .catch(() => null);
    if (cachedRail) {
        const decrypted = decryptBankRailRecordStrict(cachedRail);
        if (decrypted) {
            return {
                decrypted,
                bankLast4: decrypted.accountNumber.slice(-4),
                bankLabel: decrypted.bankLabel,
                accountType: decrypted.accountType
            };
        }
    }
    return {
        decrypted: null,
        bankLast4: null,
        bankLabel: normalizedLabel,
        accountType: normalizedType
    };
}

async function createStripeCryptoOnrampSessionIfConfigured(params: {
    orderId: string;
    walletAddress: string;
    fiatAmountUsd: number;
    targetAsset: string;
    evmAddress?: string;
    solAddress?: string;
    clientIp: string;
}): Promise<{
    stripeOnrampUsed: boolean;
    onrampSessionId: string | null;
    clientSecret: string | null;
    redirectUrl: string | null;
}> {
    const rawStripeKey = (env.STRIPE_SECRET_KEY || '').trim();
    if (!isUsableStripeSecretKey(rawStripeKey)) {
        return {
            stripeOnrampUsed: false,
            onrampSessionId: null,
            clientSecret: null,
            redirectUrl: null
        };
    }
    try {
        const corpHot = await perenniaKMS.getCorporateAddresses();
        const form = new URLSearchParams();
        form.append('destination_currencies[0]', 'usdc');
        form.append('destination_networks[0]', 'base');
        form.append('destination_networks[1]', 'ethereum');
        form.append('destination_networks[2]', 'solana');
        form.append('destination_currency', 'usdc');
        form.append('destination_network', 'base');
        form.append('source_currency', 'usd');
        form.append('source_amount', params.fiatAmountUsd.toFixed(2));
        form.append('customer_ip_address', params.clientIp || '127.0.0.1');
        form.append('metadata[partner_order_id]', params.orderId);
        form.append('metadata[wallet_address]', params.walletAddress);
        form.append('metadata[target_asset]', params.targetAsset);
        const candidateEvm =
            params.evmAddress && /^0x[0-9a-fA-F]{40}$/.test(params.evmAddress)
                ? params.evmAddress
                : corpHot.ETH && /^0x[0-9a-fA-F]{40}$/.test(corpHot.ETH)
                  ? corpHot.ETH
                  : '';
        if (candidateEvm) {
            form.append('wallet_addresses[base]', candidateEvm);
            form.append('wallet_addresses[ethereum]', candidateEvm);
        }
        if (params.solAddress && params.solAddress.length >= 32) {
            form.append('wallet_addresses[solana]', params.solAddress);
        }
        const res = await fetch(
            'https://api.stripe.com/v1/crypto/onramp_sessions',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${rawStripeKey}`,
                    'Stripe-Version': '2026-10-28.acacia',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: form.toString(),
                signal: AbortSignal.timeout(7000)
            }
        );
        if (res.ok) {
            const data = await res.json();
            return {
                stripeOnrampUsed: true,
                onrampSessionId: String(data.id || ''),
                clientSecret: String(data.client_secret || ''),
                redirectUrl: data.redirect_url
                    ? String(data.redirect_url)
                    : null
            };
        }
    } catch (err) {
        console.warn(
            'âš ï¸ [STRIPE CRYPTO ONRAMP SESSION NOTICE]: Falling back to direct ACH / sandbox session:',
            err
        );
    }
    return {
        stripeOnrampUsed: false,
        onrampSessionId: null,
        clientSecret: null,
        redirectUrl: null
    };
}

function getMercuryDirectWireInstructions(
    wireMemo: string,
    settlementTarget: string,
    targetAsset: string = 'KAS'
) {
    return {
        beneficiaryName: MERCURY_COLUMN_WIRE_COORDINATES.beneficiaryName,
        beneficiaryAddress: MERCURY_COLUMN_WIRE_COORDINATES.beneficiaryAddress,
        bankName: MERCURY_COLUMN_WIRE_COORDINATES.bankName,
        accountDescriptor: MERCURY_COLUMN_WIRE_COORDINATES.accountDescriptor,
        routingNumber: MERCURY_COLUMN_WIRE_COORDINATES.routingNumber,
        accountNumber: MERCURY_COLUMN_WIRE_COORDINATES.accountNumber,
        bankAddress: MERCURY_COLUMN_WIRE_COORDINATES.bankAddress,
        accountType: MERCURY_COLUMN_WIRE_COORDINATES.accountType,
        wireMemo,
        settlementTarget,
        targetAsset,
        provider: 'COLUMN_NA_MERCURY_DIRECT_WIRE'
    };
}

async function chargeViaStripeIfConfigured(params: {
    orderId: string;
    walletAddress: string;
    grossChargeCents: number;
    quotedPrincipalCents: number;
    perenniaFeeCents: number;
    stripeGatewayFeeCents: number;
    tierName: string;
    paymentMethod: 'ach' | 'card';
    targetAsset: string;
    routingNumber?: string;
    accountNumber?: string;
    accountType: 'CHECKING' | 'SAVINGS';
    bankLabel: string;
    clientIp: string;
    userAgent: string;
}): Promise<{
    stripeUsed: boolean;
    paymentIntentId: string | null;
    clientSecret: string | null;
    stripeStatus: string | null;
    isLiveKey: boolean;
}> {
    const rawStripeKey = (env.STRIPE_SECRET_KEY || '').trim();
    if (!isUsableStripeSecretKey(rawStripeKey)) {
        return {
            stripeUsed: false,
            paymentIntentId: null,
            clientSecret: null,
            stripeStatus: null,
            isLiveKey: false
        };
    }
    const isLiveKey =
        rawStripeKey.startsWith('sk_live_') ||
        rawStripeKey.startsWith('rk_live_');
    const stripe = new Stripe(rawStripeKey, {
        apiVersion: '2026-10-28.acacia' as any
    });
    const amountCents = Math.max(100, Math.round(params.grossChargeCents));
    const metadata: Record<string, string> = {
        partner_order_id: params.orderId,
        wallet_address: params.walletAddress,
        target_asset: params.targetAsset,
        tier_name: params.tierName,
        payment_method: params.paymentMethod,
        quoted_principal_cents: String(params.quotedPrincipalCents),
        perennia_fee_cents: String(params.perenniaFeeCents),
        stripe_gateway_fee_cents: String(params.stripeGatewayFeeCents),
        gross_charge_cents: String(params.grossChargeCents)
    };

    if (params.paymentMethod === 'card') {
        const cardIntentPayload: Record<string, any> = {
            amount: amountCents,
            currency: 'usd',
            payment_method_types: ['card'],
            description: `Perennia, LLC ${params.targetAsset} On-Ramp (${params.orderId})`,
            metadata
        };
        const pi = await stripe.paymentIntents.create(
            cardIntentPayload as Stripe.PaymentIntentCreateParams
        );
        return {
            stripeUsed: true,
            paymentIntentId: pi.id,
            clientSecret: pi.client_secret,
            stripeStatus: pi.status,
            isLiveKey
        };
    }

    if (!params.routingNumber || !params.accountNumber) {
        const achUnconfirmedPayload: Record<string, any> = {
            amount: amountCents,
            currency: 'usd',
            payment_method_types: ['us_bank_account'],
            description: `Perennia, LLC ${params.targetAsset} ACH On-Ramp (${params.orderId})`,
            metadata
        };
        const pi = await stripe.paymentIntents.create(
            achUnconfirmedPayload as Stripe.PaymentIntentCreateParams
        );
        return {
            stripeUsed: true,
            paymentIntentId: pi.id,
            clientSecret: pi.client_secret,
            stripeStatus: pi.status,
            isLiveKey
        };
    }

    const createIntentPayload: Record<string, any> = {
        amount: amountCents,
        currency: 'usd',
        payment_method_types: ['us_bank_account'],
        payment_method_data: {
            type: 'us_bank_account',
            billing_details: {
                name:
                    params.bankLabel ||
                    `Perennia User (${params.walletAddress.slice(0, 14)})`,
                email: `${params.walletAddress.replace(/[^a-z0-9]/gi, '').slice(0, 20)}@perennia.io`
            },
            us_bank_account: {
                account_holder_type: 'individual',
                account_type:
                    params.accountType === 'SAVINGS' ? 'savings' : 'checking',
                routing_number: params.routingNumber,
                account_number: params.accountNumber
            }
        },
        mandate_data: {
            customer_acceptance: {
                type: 'online',
                online: {
                    ip_address: params.clientIp || '127.0.0.1',
                    user_agent:
                        params.userAgent || 'Perennia-Sovereign-Client/1.0'
                }
            }
        },
        confirm: true,
        description: `Perennia, LLC ${params.targetAsset} ACH Purchase (${params.orderId})`,
        metadata
    };

    let paymentIntent = await stripe.paymentIntents.create(
        createIntentPayload as Stripe.PaymentIntentCreateParams
    );

    if (
        !isLiveKey &&
        paymentIntent.status === 'requires_action' &&
        (paymentIntent.next_action as any)?.type === 'verify_with_microdeposits'
    ) {
        try {
            paymentIntent = await stripe.paymentIntents.verifyMicrodeposits(
                paymentIntent.id,
                { amounts: [32, 45] }
            );
        } catch {
            // Keep pending verification status
        }
    }

    return {
        stripeUsed: true,
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        stripeStatus: paymentIntent.status,
        isLiveKey
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
        // Fallback below
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
        // Fallback below
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
        // Ignore
    }
    return 0;
}

async function discoverAndCacheCanonicalSpotPrice(
    ticker: string
): Promise<number> {
    const clean = ticker
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 14);
    if (!clean || clean.length < 2) return 0;
    let canonicalPrice = 0;
    let canonicalChange = 0;
    let cgCoinId = '';
    try {
        const searchRes = await fetch(
            `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(clean)}`,
            {
                headers: { accept: 'application/json' },
                signal: AbortSignal.timeout(3500)
            }
        );
        if (searchRes.ok) {
            const searchData = await searchRes.json();
            const coins: any[] = Array.isArray(searchData?.coins)
                ? searchData.coins
                : [];
            const exact = coins.filter(
                (c) =>
                    String(c?.symbol || '')
                        .trim()
                        .toUpperCase() === clean
            );
            const pool = exact.length > 0 ? exact : coins;
            pool.sort((a, b) => {
                const rA =
                    typeof a?.market_cap_rank === 'number' &&
                    a.market_cap_rank > 0
                        ? a.market_cap_rank
                        : 999_999;
                const rB =
                    typeof b?.market_cap_rank === 'number' &&
                    b.market_cap_rank > 0
                        ? b.market_cap_rank
                        : 999_999;
                return rA - rB;
            });
            const best = pool[0];
            if (best?.id) {
                cgCoinId = String(best.id).trim();
                const pRes = await fetch(
                    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(cgCoinId)}&vs_currencies=usd&include_24hr_change=true`,
                    { signal: AbortSignal.timeout(3500) }
                );
                if (pRes.ok) {
                    const pData = await pRes.json();
                    const usdVal = Number(pData?.[cgCoinId]?.usd || 0);
                    if (Number.isFinite(usdVal) && usdVal > 0) {
                        canonicalPrice = usdVal;
                        canonicalChange = Number(
                            pData?.[cgCoinId]?.usd_24h_change || 0
                        );
                    }
                }
            }
        }
    } catch {
        // Continue
    }
    const validQuotes: number[] = [];
    if (canonicalPrice > 0) {
        validQuotes.push(canonicalPrice);
    }
    const [mexcRes, gateRes, kucoinRes] = await Promise.allSettled([
        fetch(
            `https://api.mexc.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(clean)}USDT`,
            { signal: AbortSignal.timeout(3000) }
        ),
        fetch(
            `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${encodeURIComponent(clean)}_USDT`,
            { signal: AbortSignal.timeout(3000) }
        ),
        fetch(
            `https://api.kucoin.com/api/v1/market/stats?symbol=${encodeURIComponent(clean)}-USDT`,
            { signal: AbortSignal.timeout(3000) }
        )
    ]);
    if (mexcRes.status === 'fulfilled' && mexcRes.value.ok) {
        try {
            const d = await mexcRes.value.json();
            const last = parseFloat(String(d?.lastPrice || '0'));
            const vol = parseFloat(String(d?.quoteVolume || '0'));
            const bid = parseFloat(String(d?.bidPrice || '0'));
            const ask = parseFloat(String(d?.askPrice || '0'));
            const spreadOk =
                bid <= 0 ||
                ask < bid ||
                (ask - bid) / ask <= MAX_DISCOVERY_SPREAD_RATIO;
            const canonOk =
                canonicalPrice <= 0 ||
                Math.abs(last - canonicalPrice) / canonicalPrice <=
                    MAX_CANONICAL_DEVIATION_RATIO;
            if (
                last > 0 &&
                vol >= MIN_DISCOVERY_VOLUME_USD &&
                spreadOk &&
                canonOk
            ) {
                validQuotes.push(last);
            }
        } catch {
            // Ignore
        }
    }
    if (gateRes.status === 'fulfilled' && gateRes.value.ok) {
        try {
            const raw = await gateRes.value.json();
            const d = Array.isArray(raw) ? raw[0] : raw;
            const last = parseFloat(String(d?.last || '0'));
            const vol = parseFloat(String(d?.quote_volume || '0'));
            const bid = parseFloat(String(d?.highest_bid || '0'));
            const ask = parseFloat(String(d?.lowest_ask || '0'));
            const spreadOk =
                bid <= 0 ||
                ask < bid ||
                (ask - bid) / ask <= MAX_DISCOVERY_SPREAD_RATIO;
            const canonOk =
                canonicalPrice <= 0 ||
                Math.abs(last - canonicalPrice) / canonicalPrice <=
                    MAX_CANONICAL_DEVIATION_RATIO;
            if (
                last > 0 &&
                vol >= MIN_DISCOVERY_VOLUME_USD &&
                spreadOk &&
                canonOk
            ) {
                validQuotes.push(last);
            }
        } catch {
            // Ignore
        }
    }
    if (kucoinRes.status === 'fulfilled' && kucoinRes.value.ok) {
        try {
            const raw = await kucoinRes.value.json();
            const d = raw?.data;
            const last = parseFloat(String(d?.last || '0'));
            const vol = parseFloat(String(d?.volValue || '0'));
            const bid = parseFloat(String(d?.buy || '0'));
            const ask = parseFloat(String(d?.sell || '0'));
            const spreadOk =
                bid <= 0 ||
                ask < bid ||
                (ask - bid) / ask <= MAX_DISCOVERY_SPREAD_RATIO;
            const canonOk =
                canonicalPrice <= 0 ||
                Math.abs(last - canonicalPrice) / canonicalPrice <=
                    MAX_CANONICAL_DEVIATION_RATIO;
            if (
                last > 0 &&
                vol >= MIN_DISCOVERY_VOLUME_USD &&
                spreadOk &&
                canonOk
            ) {
                validQuotes.push(last);
            }
        } catch {
            // Ignore
        }
    }
    if (validQuotes.length === 0) return 0;
    validQuotes.sort((a, b) => a - b);
    const mid = Math.floor(validQuotes.length / 2);
    const resolvedSpot =
        validQuotes.length % 2 === 0
            ? (validQuotes[mid - 1] + validQuotes[mid]) / 2
            : validQuotes[mid];
    if (!Number.isFinite(resolvedSpot) || resolvedSpot <= 0) return 0;
    const pipe = redis.pipeline();
    pipe.sadd('oracle:dynamic_tickers', clean);
    pipe.set(`oracle:spot:${clean}_USDC`, String(resolvedSpot), 'EX', 30);
    if (cgCoinId) {
        pipe.set(`oracle:cg_id:${clean}`, cgCoinId, 'EX', 86400);
    }
    if (Number.isFinite(canonicalChange)) {
        pipe.set(
            `oracle:change24h:${clean}_USDC`,
            String(canonicalChange),
            'EX',
            300
        );
    }
    await pipe.exec().catch(() => {});
    await dbPool
        .query(
            `INSERT INTO rwa_oracle_feeds (ticker, asset_class, price_usd, change_24h_pct, oracle_source, updated_at)
             VALUES ($1, 'DYNAMIC_TOKEN', $2, $3, 'COINGECKO_CEX_QUORUM', CURRENT_TIMESTAMP)
             ON CONFLICT (ticker) DO UPDATE SET
                price_usd = EXCLUDED.price_usd,
                change_24h_pct = EXCLUDED.change_24h_pct,
                oracle_source = EXCLUDED.oracle_source,
                updated_at = CURRENT_TIMESTAMP`,
            [
                clean,
                resolvedSpot,
                Number.isFinite(canonicalChange) ? canonicalChange : 0
            ]
        )
        .catch(() => {});
    return resolvedSpot;
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
        // Fallback below
    }
    if (ticker === 'SILO' && kasSpotPrice > 0) {
        return Number((kasSpotPrice / 23.809524).toFixed(6));
    }
    if (!CORE_STATIC_TICKERS.has(ticker)) {
        const discoveredSpot = await discoverAndCacheCanonicalSpotPrice(ticker);
        if (discoveredSpot > 0) {
            return discoveredSpot;
        }
    }
    try {
        const mexcRes = await fetch(
            `https://api.mexc.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(ticker)}USDT`,
            { signal: AbortSignal.timeout(3000) }
        );
        if (mexcRes.ok) {
            const mexcData = await mexcRes.json();
            const p = parseFloat(String(mexcData?.lastPrice || '0'));
            const quoteVol = parseFloat(String(mexcData?.quoteVolume || '0'));
            if (
                Number.isFinite(p) &&
                p > 0 &&
                quoteVol >= MIN_DISCOVERY_VOLUME_USD
            ) {
                await redis
                    .set(`oracle:spot:${ticker}_USDC`, String(p), 'EX', 30)
                    .catch(() => {});
                return p;
            }
        }
    } catch {
        // Ignore
    }
    return discoverAndCacheCanonicalSpotPrice(ticker);
}

async function isAuthorizedDirectorRequest(
    request: Request,
    sessionWallet: string
): Promise<boolean> {
    const authHeader = request.headers.get('authorization') || '';
    if (matchesConfiguredAdminBearer(authHeader)) {
        return true;
    }
    return isWalletMasterAdmin(sessionWallet);
}

async function creditPlatformBalanceAndSyncReservoir(
    client: any,
    cleanWallet: string,
    targetAsset: string,
    deliveredTokens: number
) {
    const prefixedWallet = `kaspa:${cleanWallet}`;
    const userLedgerKey = `dev:sor:treasury:balances:${cleanWallet}`;
    await redis
        .hincrbyfloat(userLedgerKey, targetAsset, deliveredTokens)
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
    const existingRow = resRow.rows[0];
    const targetPk = existingRow?.wallet_address || prefixedWallet;
    let streamKas = Number(existingRow?.streaming_balance_kas || 0);
    const totalYieldKas = Number(existingRow?.total_yield_kas || 0);
    const lpTokens: Record<string, number> = {
        ...(existingRow?.lp_tokens || {})
    };
    if (targetAsset === 'KAS') {
        streamKas = Number((streamKas + deliveredTokens).toFixed(8));
    } else {
        lpTokens[targetAsset] = Number(
            ((Number(lpTokens[targetAsset] || 0)) + deliveredTokens).toFixed(8)
        );
    }
    const newHmac = computeReservoirHmac(
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
                targetPk,
                streamKas,
                totalYieldKas,
                JSON.stringify(lpTokens),
                Math.max(totalYieldKas, streamKas),
                newHmac
            ]
        )
        .catch(() => {});
}

async function executeImmediateOrderFulfillment(params: {
    client: any;
    orderId: string;
    cleanWallet: string;
    targetAsset: string;
    settlementTarget: string;
    autoStakeSilo: boolean;
    fiatUsd: number;
    feeUsd: number;
    perenniaFeeUsd: number;
    netUsd: number;
    liveTargetSpot: number;
    kasSpot: number;
    destinationAddress?: string;
    preferredTxHash?: string;
    prequotedTokens?: number;
}) {
    const cleanTarget = params.targetAsset.trim().toUpperCase();
    let deliveredTokens = Number(
        (params.netUsd / params.liveTargetSpot).toFixed(6)
    );
    if (
        cleanTarget !== 'KAS' &&
        cleanTarget !== 'SILO' &&
        cleanTarget !== 'USDC'
    ) {
        const cnNetTokens = await fetchChangeNowEstimatedAmount(
            'USDC',
            cleanTarget,
            params.netUsd,
            params.liveTargetSpot
        ).catch(() => 0);
        if (cnNetTokens > 0) {
            deliveredTokens = Number(
                Math.min(deliveredTokens, cnNetTokens).toFixed(6)
            );
        }
        if (
            typeof params.prequotedTokens === 'number' &&
            params.prequotedTokens > 0
        ) {
            deliveredTokens = Number(
                Math.min(deliveredTokens, params.prequotedTokens).toFixed(6)
            );
        }
    }
    const deliveredKas = Number((params.netUsd / params.kasSpot).toFixed(4));
    let txHash =
        params.preferredTxHash ||
        `ONRAMP-${cleanTarget}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    let l1DispatchedOnChain = false;
    if (params.autoStakeSilo && cleanTarget === 'SILO') {
        await params.client.query(
            `INSERT INTO silo_staking_positions (wallet_address, token_ticker, amount_staked, status, tx_hash)
             VALUES ($1, 'SILO', $2, 'ACTIVE', $3)`,
            [`kaspa:${params.cleanWallet}`, deliveredTokens, txHash]
        );
    } else if (
        params.settlementTarget === 'L1_KAS' ||
        params.settlementTarget === 'L1_SELF_CUSTODY'
    ) {
        try {
            const destAddr = String(
                params.destinationAddress || `kaspa:${params.cleanWallet}`
            ).trim();
            const l1Res = await executeOrQueueL1Dispatch({
                wallet: `kaspa:${params.cleanWallet}`,
                destinationAddress: destAddr,
                asset: cleanTarget,
                amount: deliveredTokens,
                sourceType: 'fiat_onramp_l1',
                spotPrice: params.liveTargetSpot
            });
            txHash = l1Res.txHash || txHash;
            l1DispatchedOnChain = l1Res.status === 'DISPATCHED_ONCHAIN';
        } catch {
            l1DispatchedOnChain = false;
        }
        if (!l1DispatchedOnChain) {
            await creditPlatformBalanceAndSyncReservoir(
                params.client,
                params.cleanWallet,
                cleanTarget,
                deliveredTokens
            );
        }
    } else {
        await creditPlatformBalanceAndSyncReservoir(
            params.client,
            params.cleanWallet,
            cleanTarget,
            deliveredTokens
        );
    }

    const perenniaNetFeeUsd = Math.max(
        2.5,
        Number(params.perenniaFeeUsd || params.feeUsd || 2.5)
    );
    const sweepAllocation = computePostTradeUsdAllocation(
        params.fiatUsd,
        perenniaNetFeeUsd
    );

    if (perenniaNetFeeUsd > 0) {
        await redis
            .incrbyfloat(
                'perennia:fees:batch_accumulated:USDC',
                sweepAllocation.perenniaLpCompound60Usd
            )
            .catch(() => {});
        await redis
            .incrbyfloat(
                'perennia:treasury:netting_profit_usd',
                perenniaNetFeeUsd
            )
            .catch(() => {});
    }

    const fulfilledPrincipalCents = Math.round(params.netUsd * 100);
    const settledNetCents = Math.round(
        (params.netUsd + perenniaNetFeeUsd) * 100
    );

    await params.client.query(
        `UPDATE fiat_onramp_orders
         SET status = 'COMPLETED',
             delivered_kas = $2,
             estimated_tokens = $3,
             target_spot_price = $4,
             master_treasury_fee_usdc = $5,
             post_trade_sweep_json = $6,
             tx_hash = $7,
             settled_net_cents = COALESCE(settled_net_cents, $8),
             fulfilled_principal_cents = COALESCE(fulfilled_principal_cents, $9),
             updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $1`,
        [
            params.orderId,
            deliveredKas,
            deliveredTokens,
            params.liveTargetSpot,
            perenniaNetFeeUsd,
            JSON.stringify(sweepAllocation),
            txHash,
            settledNetCents,
            fulfilledPrincipalCents
        ]
    );

    await params.client
        .query(
            `UPDATE fiat_float_ledger
             SET local_kas_target_cap_usd = LEAST(ratchet_target_cap_usd, local_kas_target_cap_usd + $1),
                 wholesale_api_target_cap_usd = LEAST(ratchet_target_cap_usd, wholesale_api_target_cap_usd + $1),
                 llc_tax_escrow_reserve_usd = llc_tax_escrow_reserve_usd + $2,
                 dark_pool_lp_vault_usd = dark_pool_lp_vault_usd + $3,
                 master_treasury_usdc_reserve = COALESCE(master_treasury_usdc_reserve, 0.0) + $4,
                 commercial_checking_cleared_usd = commercial_checking_cleared_usd + $4,
                 updated_at = CURRENT_TIMESTAMP
             WHERE ledger_id IN ('PRIMARY_FLOAT', 'BOOTSTRAP_PRIMARY')`,
            [
                sweepAllocation.perenniaLpCompound60Usd * 0.5,
                sweepAllocation.llcTaxAndRailReserveUsd,
                sweepAllocation.perenniaLpCompound60Usd,
                sweepAllocation.liquidClearingReserve40Usd
            ]
        )
        .catch(() => {});

    await params.client.query(
        `INSERT INTO tax_ledger_events
         (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash, cost_basis_usd, realized_gain_loss_usd, holding_period)
         VALUES ($1, $2, 'FIAT_ONRAMP', $3, $4, $5, $6, $3, 0.0, 'SHORT_TERM')`,
        [
            params.cleanWallet,
            cleanTarget,
            params.fiatUsd,
            deliveredTokens,
            params.liveTargetSpot,
            txHash
        ]
    );
    const unitFmv =
        deliveredTokens > 0
            ? params.fiatUsd / deliveredTokens
            : params.liveTargetSpot;
    await params.client.query(
        `INSERT INTO hifo_tax_lots
         (wallet_address, asset_ticker, kas_sompi, initial_tokens, remaining_sompi, remaining_tokens, fmv_usd_per_token, total_cost_basis_usd, source_event_type, source_tx_hash, status)
         VALUES ($1, $2, $3, $4, $3, $4, $5, $6, 'FIAT_ONRAMP', $7, 'OPEN')`,
        [
            params.cleanWallet,
            cleanTarget,
            Math.round(deliveredTokens * 1e8),
            deliveredTokens,
            unitFmv,
            params.fiatUsd,
            txHash
        ]
    );
    return {
        deliveredTokens,
        deliveredKas,
        txHash,
        l1DispatchedOnChain,
        sweepAllocation
    };
}

export const GET: RequestHandler = async ({
    cookies,
    locals,
    url
}: RequestEvent) => {
    const sessionIdCookie = cookies.get('perennia_session');
    let sessionWallet =
        (locals as any)?.user?.address || (locals as any).walletAddress || '';
    if (!sessionWallet && sessionIdCookie) {
        sessionWallet =
            (await redis.get(`session:${sessionIdCookie}`).catch(() => null)) ||
            '';
    }
    const formattedSessionWallet = sessionWallet
        ? normalizeKaspaAddressStrict(sessionWallet)
        : '';
    const cleanSessionWallet = formattedSessionWallet.replace(/^kaspa:/i, '');
    const feeEligibility = await resolveWalletWholesaleFloorEligibility(
        cleanSessionWallet,
        formattedSessionWallet
    );

    const quoteAsset = url.searchParams.get('quoteAsset');
    if (quoteAsset) {
        const grossUsd = Number(url.searchParams.get('amountUsd') || 500);
        const simulateGasSpikeUsd = Number(
            url.searchParams.get('simulateGasSpikeUsd') || 0
        );
        const kasSpot = await resolveLiveKasSpotUsd();
        const targetSpot = await resolveLiveTargetAssetSpotUsd(
            quoteAsset,
            kasSpot
        );
        const quote = calculateOnrampCostPlusQuote({
            assetTicker: quoteAsset,
            grossUsd,
            spotPriceUsd: targetSpot,
            paymentRail:
                url.searchParams.get('paymentRail') || 'STRIPE_ACH_DIRECT_DEBIT',
            paymentMethod: url.searchParams.get('paymentMethod') || undefined,
            settlementTarget:
                url.searchParams.get('settlementTarget') || 'LEDGER_KAS',
            autoStakeSilo: url.searchParams.get('autoStakeSilo') === 'true',
            bundledKasOrSilo:
                url.searchParams.get('bundledKasOrSilo') === 'true',
            wholesaleFloorActive: feeEligibility.wholesaleFloorActive,
            simulateGasSpikeUsd
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
        if (
            cleanTicker !== 'KAS' &&
            cleanTicker !== 'SILO' &&
            cleanTicker !== 'USDC'
        ) {
            try {
                const liveChangeNowOut = await fetchChangeNowEstimatedAmount(
                    'USDC',
                    cleanTicker,
                    quote.netUsdConverted,
                    targetSpot
                );
                if (liveChangeNowOut > 0) {
                    quote.estimatedTokens = Number(liveChangeNowOut.toFixed(6));
                }
            } catch (cnErr: any) {
                const sanitized = sanitizeCustomerFacingFiatError(cnErr);
                return json(
                    {
                        success: false,
                        circuitBreakerTripped: true,
                        error: sanitized.userMessage,
                        quote
                    },
                    { status: sanitized.httpStatus }
                );
            }
        }
        return json({
            success: true,
            wholesaleFloorActive: feeEligibility.wholesaleFloorActive,
            protocolFeeFloorPct: quote.protocolFeeFloorPct,
            feeTierLabel: quote.tierBadgeLabel,
            quote,
            mercuryWireCoordinates: MERCURY_COLUMN_WIRE_COORDINATES,
            postTradeAllocation: computePostTradeUsdAllocation(
                quote.grossUsd,
                quote.perenniaFeeUsd
            )
        });
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
                    paymentMethod: r.payment_method || 'ach',
                    tierName: r.tier_name || 'RETAIL',
                    tierBps: Number(r.tier_bps || 85),
                    settlementTarget: r.settlement_target,
                    targetAsset: r.target_asset || 'KAS',
                    targetSpotPrice: Number(
                        r.target_spot_price || r.locked_spot_price || 0
                    ),
                    estimatedTokens: Number(
                        r.estimated_tokens || r.estimated_kas || 0
                    ),
                    autoStakeSilo: Boolean(r.auto_stake_silo),
                    quotedPrincipalCents: Number(
                        r.quoted_principal_cents || 0
                    ),
                    perenniaFeeCents: Number(r.perennia_fee_cents || 250),
                    stripeGatewayFeeCents: Number(
                        r.stripe_gateway_fee_cents || 0
                    ),
                    grossChargeCents: Number(r.gross_charge_cents || 0),
                    settledNetCents:
                        r.settled_net_cents !== null
                            ? Number(r.settled_net_cents)
                            : null,
                    fulfilledPrincipalCents:
                        r.fulfilled_principal_cents !== null
                            ? Number(r.fulfilled_principal_cents)
                            : null,
                    quarantineReason: r.quarantine_reason || null,
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
                    stripePaymentIntentId: r.stripe_payment_intent_id || null,
                    stripeOnrampSessionId: r.stripe_onramp_session_id || null,
                    bridgeVirtualAccountId:
                        r.bridge_virtual_account_id || null,
                    bankLast4: r.bank_last4 || null,
                    postTradeAllocation: r.post_trade_sweep_json,
                    txHash: r.tx_hash,
                    status: r.status,
                    wireInstructions: getMercuryDirectWireInstructions(
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
        try {
            const [dbOrdersRes, railRes] = await Promise.all([
                dbPool.query(
                    `SELECT * FROM fiat_onramp_orders
                     WHERE wallet_address = $1 OR wallet_address = $2
                     ORDER BY created_at DESC
                     LIMIT 25`,
                    [formattedSessionWallet, cleanSessionWallet]
                ),
                dbPool
                    .query(
                        `SELECT bank_label, account_type, payout_method, bank_last4, updated_at
                         FROM fiat_bank_rails
                         WHERE wallet_address = $1 OR wallet_address = $2
                         ORDER BY updated_at DESC
                         LIMIT 1`,
                        [formattedSessionWallet, cleanSessionWallet]
                    )
                    .catch(() => ({ rows: [] as any[] }))
            ]);
            if (railRes.rows.length > 0) {
                const rr = railRes.rows[0];
                savedBankRailLast4 = String(rr.bank_last4 || '');
                savedBankRail = {
                    bankLabel: String(
                        rr.bank_label || 'Primary Operating Account'
                    ),
                    accountType:
                        String(rr.account_type || 'CHECKING').toUpperCase() ===
                        'SAVINGS'
                            ? 'SAVINGS'
                            : 'CHECKING',
                    payoutMethod:
                        String(rr.payout_method || 'ACH').toUpperCase() ===
                        'WIRE'
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
                paymentMethod: r.payment_method || 'ach',
                tierName: r.tier_name || 'RETAIL',
                tierBps: Number(r.tier_bps || 85),
                settlementTarget: r.settlement_target,
                targetAsset: r.target_asset || 'KAS',
                targetSpotPrice: Number(
                    r.target_spot_price || r.locked_spot_price || 0
                ),
                estimatedTokens: Number(
                    r.estimated_tokens || r.estimated_kas || 0
                ),
                autoStakeSilo: Boolean(r.auto_stake_silo),
                quotedPrincipalCents: Number(r.quoted_principal_cents || 0),
                perenniaFeeCents: Number(r.perennia_fee_cents || 250),
                stripeGatewayFeeCents: Number(
                    r.stripe_gateway_fee_cents || 0
                ),
                grossChargeCents: Number(r.gross_charge_cents || 0),
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
                stripePaymentIntentId: r.stripe_payment_intent_id || null,
                stripeOnrampSessionId: r.stripe_onramp_session_id || null,
                bridgeVirtualAccountId: r.bridge_virtual_account_id || null,
                bankLast4: r.bank_last4 || null,
                postTradeAllocation: r.post_trade_sweep_json,
                txHash: r.tx_hash,
                status: r.status,
                wireInstructions: getMercuryDirectWireInstructions(
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
                [cleanSessionWallet, formattedSessionWallet]
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

    const subsystemPaused = await isFiatOnrampPausedByKillSwitch();

    return json({
        online: spotPrice > 0 && !subsystemPaused,
        subsystemPaused,
        nonKycEnabled: true,
        sovereignWireEnabled: true,
        stripeConfigured: isUsableStripeSecretKey(env.STRIPE_SECRET_KEY),
        bridgeConfigured: true,
        changenowConfigured: Boolean((env.CHANGENOW_API_KEY || '').trim()),
        wholesaleFloorActive: feeEligibility.wholesaleFloorActive,
        protocolFeeFloorPct: feeEligibility.protocolFeeFloorPct,
        feeTierLabel: feeEligibility.feeTierLabel,
        mercuryWireCoordinates: MERCURY_COLUMN_WIRE_COORDINATES,
        spotPrice,
        savedBankRailReady: Boolean(savedBankRailLast4),
        savedBankRailLast4,
        savedBankRail,
        destinationWallet: sessionWallet ? formattedSessionWallet : null,
        recentOnrampSessions,
        fiatLedgerEvents
    });
};

export const POST: RequestHandler = async ({
    request,
    cookies,
    locals,
    getClientAddress
}: RequestEvent) => {
    try {
        const sessionId = cookies.get('perennia_session');
        let sessionWallet =
            (locals as any)?.user?.address ||
            (locals as any).walletAddress ||
            '';
        if (!sessionWallet && sessionId) {
            sessionWallet =
                (await redis.get(`session:${sessionId}`).catch(() => null)) ||
                '';
        }
        await ensureFiatOnrampTables().catch(() => {});
        const body = await request.json().catch(() => ({}));
        const actionUpper = String(body.action || '').toUpperCase();

        if (
            actionUpper === 'CONFIRM_WIRE_RECEIPT' ||
            actionUpper === 'ACH_CLEARED' ||
            actionUpper === 'SETTLE_ORDER_NOW' ||
            actionUpper === 'RELEASE_QUARANTINED_PRINCIPAL'
        ) {
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
                const cleanWallet = normalizeKaspaBase32Strict(
                    String(row.wallet_address || '')
                );
                const cleanCaller = normalizeKaspaBase32Strict(sessionWallet);
                const isDirector = await isAuthorizedDirectorRequest(
                    request,
                    sessionWallet
                );
                const liveGatewaysActive =
                    areLiveProductionGatewaysActive(request);
                if (liveGatewaysActive && !isDirector) {
                    return json(
                        {
                            error: 'FORBIDDEN: Manual settlement release is locked to Director or verified webhook authentication when live fiat gateways are active.'
                        },
                        { status: 403 }
                    );
                }
                if (
                    !isDirector &&
                    (!cleanCaller || cleanCaller !== cleanWallet)
                ) {
                    return json(
                        {
                            error: 'FORBIDDEN: Only the Master Treasury Director or the authenticated order owner may clear this order.'
                        },
                        { status: 403 }
                    );
                }
                if (row.status === 'COMPLETED') {
                    return json({
                        success: true,
                        orderId,
                        status: 'COMPLETED',
                        stageIndex: 4,
                        txHash: row.tx_hash
                    });
                }
                const targetAsset = String(
                    row.target_asset || 'KAS'
                ).toUpperCase();
                const kasSpot = await resolveLiveKasSpotUsd();
                const liveTargetSpot = await resolveLiveTargetAssetSpotUsd(
                    targetAsset,
                    kasSpot
                );
                if (liveTargetSpot <= 0 || kasSpot <= 0) {
                    return json(
                        {
                            error: `Live ${targetAsset} price feed is temporarily syncing. Please try again in a few seconds.`
                        },
                        { status: 503 }
                    );
                }

                const quotedPrincipalCents = Number(
                    row.quoted_principal_cents ||
                        Math.round(Number(row.net_usd_converted || 0) * 100)
                );
                const perenniaFeeCents = Math.max(
                    MIN_FEE_FLOOR_CENTS,
                    Number(
                        row.perennia_fee_cents ||
                            Math.round(
                                Number(row.guaranteed_profit_usd || 2.5) * 100
                            )
                    )
                );
                const settledNetCents =
                    row.settled_net_cents !== null &&
                    row.settled_net_cents !== undefined
                        ? Number(row.settled_net_cents)
                        : quotedPrincipalCents + perenniaFeeCents;

                const safePrincipalCents = Math.max(
                    0,
                    Math.min(
                        quotedPrincipalCents,
                        settledNetCents - perenniaFeeCents
                    )
                );
                if (safePrincipalCents <= 0) {
                    return json(
                        {
                            error: 'ZERO_LOSS_INVARIANT_VIOLATION: Settled net cents cannot cover Perennia minimum fee floor; failing closed.'
                        },
                        { status: 422 }
                    );
                }

                const netUsd = roundCents(safePrincipalCents / 100);
                const perenniaFeeUsd = roundCents(perenniaFeeCents / 100);
                const fiatUsd = roundCents(Number(row.fiat_amount_usd || 0));
                const feeUsd = roundCents(
                    Number(row.fee_usd || perenniaFeeUsd)
                );
                const autoStakeSilo = Boolean(row.auto_stake_silo);
                const settlementTarget = String(
                    row.settlement_target || 'LEDGER_KAS'
                ).toUpperCase();

                const fulfilled = await executeImmediateOrderFulfillment({
                    client,
                    orderId,
                    cleanWallet,
                    targetAsset,
                    settlementTarget,
                    autoStakeSilo,
                    fiatUsd,
                    feeUsd,
                    perenniaFeeUsd,
                    netUsd,
                    liveTargetSpot,
                    kasSpot,
                    destinationAddress: body.destinationAddress,
                    preferredTxHash: body.txHash,
                    prequotedTokens:
                        safePrincipalCents < quotedPrincipalCents
                            ? undefined
                            : Number(row.estimated_tokens || 0)
                });

                const sessionKey = `perennia:fiat:onramp_session:${orderId}`;
                const rawCached = await redis
                    .get(sessionKey)
                    .catch(() => null);
                if (rawCached) {
                    try {
                        const parsed = JSON.parse(rawCached);
                        parsed.status = 'COMPLETED';
                        parsed.txHash = fulfilled.txHash;
                        parsed.deliveredTokens = fulfilled.deliveredTokens;
                        parsed.deliveredKas = fulfilled.deliveredKas;
                        await redis.set(
                            sessionKey,
                            JSON.stringify(parsed),
                            'EX',
                            86400
                        );
                    } catch {
                        // Ignore
                    }
                }
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
                            amountTokens: fulfilled.deliveredTokens,
                            fiatAmountUsd: fiatUsd,
                            spotPrice: liveTargetSpot,
                            postTradeAllocation: fulfilled.sweepAllocation,
                            txHash: fulfilled.txHash
                        })
                    )
                    .catch(() => {});
                return json({
                    success: true,
                    orderId,
                    status: 'COMPLETED',
                    stageIndex: 4,
                    executionLockedOnClearing: true,
                    deliveredTokens: fulfilled.deliveredTokens,
                    deliveredKas: fulfilled.deliveredKas,
                    postTradeAllocation: fulfilled.sweepAllocation,
                    txHash: fulfilled.txHash
                });
            } finally {
                client.release();
            }
        }

        if (await isFiatOnrampPausedByKillSwitch()) {
            return json(
                {
                    error: 'SUBSYSTEM_PAUSED: The Fiat On-Ramp rail is temporarily paused by Director maintenance override.'
                },
                { status: 503 }
            );
        }

        if (!sessionWallet) {
            return json(
                {
                    error: 'Please unlock your wallet session before purchasing crypto.'
                },
                { status: 401 }
            );
        }
        const formattedWallet = normalizeKaspaAddressStrict(sessionWallet);
        const cleanAddressOnly = formattedWallet.replace(/^kaspa:/i, '');
        if (cleanAddressOnly.length < 55) {
            return json(
                {
                    error: 'Destination address must be a valid L1 Kaspa address.'
                },
                { status: 400 }
            );
        }
        const requestedBodyWallet = String(
            body.walletAddress || body.wallet || ''
        ).trim();
        if (requestedBodyWallet) {
            const cleanBodyWallet =
                normalizeKaspaBase32Strict(requestedBodyWallet);
            const isDirector = await isAuthorizedDirectorRequest(
                request,
                sessionWallet
            );
            if (
                cleanBodyWallet &&
                cleanBodyWallet !== cleanAddressOnly &&
                !isDirector
            ) {
                return json(
                    {
                        error: 'FORBIDDEN: Wallet address mismatch with authenticated session.'
                    },
                    { status: 403 }
                );
            }
        }

        const targetAsset = String(body.targetAsset || 'KAS')
            .trim()
            .toUpperCase();
        const firewallBlockReason = await isWalletOrAssetBlacklisted(
            cleanAddressOnly,
            formattedWallet,
            targetAsset
        );
        if (firewallBlockReason) {
            return json({ error: firewallBlockReason }, { status: 403 });
        }

        const feeEligibility = await resolveWalletWholesaleFloorEligibility(
            cleanAddressOnly,
            formattedWallet
        );
        const fiatAmountUsd = Math.max(10, Number(body.fiatAmountUsd || 250));
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
            (Boolean(body.autoStakeSilo) ||
                requestedTarget === 'AUTO_STAKE_SILO');
        const bundledKasOrSilo =
            Boolean(body.bundledKasOrSilo) ||
            autoStakeSilo ||
            requestedTarget === 'AUTO_STAKE_SILO';
        const requestedRailUpper = String(
            body.paymentRail || 'STRIPE_ACH_DIRECT_DEBIT'
        ).toUpperCase();

        const quote = calculateOnrampCostPlusQuote({
            assetTicker: targetAsset,
            grossUsd: fiatAmountUsd,
            spotPriceUsd: targetSpotPrice,
            paymentRail: requestedRailUpper,
            paymentMethod: body.paymentMethod,
            settlementTarget: requestedTarget,
            autoStakeSilo,
            bundledKasOrSilo,
            wholesaleFloorActive: feeEligibility.wholesaleFloorActive
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

        if (quote.perenniaFeeCents < MIN_FEE_FLOOR_CENTS) {
            return json(
                {
                    error: 'ZERO_LOSS_INVARIANT_VIOLATION: Guaranteed net Perennia fee must meet the $2.50 (250 cents) minimum floor.',
                    circuitBreakerTripped: true,
                    quote
                },
                { status: 422 }
            );
        }

        const isDirectMercuryWire =
            quote.paymentMethod === 'wire' ||
            quote.requiresInstitutionalWire ||
            requestedRailUpper === 'BRIDGE_VIRTUAL_ACCOUNT_WIRE' ||
            requestedRailUpper === 'MERCURY_INSTITUTIONAL_WIRE';

        const bankRailResult = await saveOrLoadUserBankRail({
            cleanWallet: cleanAddressOnly,
            prefixedWallet: formattedWallet,
            routingNumber: body.routingNumber,
            accountNumber: body.accountNumber,
            bankLabel: body.bankLabel,
            accountType: body.accountType
        });

        let changenowExchangeId: string | null = null;
        let payinAddress: string | null = null;
        if (
            targetAsset !== 'KAS' &&
            targetAsset !== 'SILO' &&
            targetAsset !== 'USDC'
        ) {
            try {
                const liveEst = await fetchChangeNowEstimatedAmount(
                    'USDC',
                    targetAsset,
                    quote.netUsdConverted,
                    targetSpotPrice
                );
                if (liveEst > 0) {
                    quote.estimatedTokens = Number(liveEst.toFixed(6));
                }
                const destAddr = String(
                    body.destinationAddress ||
                        body.evmAddress ||
                        body.solAddress ||
                        formattedWallet
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
                    if (
                        cnOrder.expectedToAmount &&
                        cnOrder.expectedToAmount > 0
                    ) {
                        quote.estimatedTokens = Number(
                            Math.min(
                                quote.estimatedTokens,
                                cnOrder.expectedToAmount
                            ).toFixed(6)
                        );
                    }
                }
            } catch (cnErr: any) {
                const sanitized = sanitizeCustomerFacingFiatError(cnErr);
                return json(
                    {
                        error: sanitized.userMessage,
                        circuitBreakerTripped: true,
                        quote
                    },
                    { status: sanitized.httpStatus }
                );
            }
        }

        const onrampSessionId = `PERENNIA-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        let clientSecret = `per_sec_${crypto.randomBytes(16).toString('hex')}`;
        const wireMemo = onrampSessionId;
        const estimatedKas = Number(
            (quote.netUsdConverted / kasSpotPrice).toFixed(4)
        );
        const postTradeAllocation = computePostTradeUsdAllocation(
            quote.grossUsd,
            quote.perenniaFeeUsd
        );
        const settlementTarget = autoStakeSilo
            ? 'AUTO_STAKE_SILO'
            : requestedTarget === 'L1_KAS'
              ? 'L1_KAS'
              : 'LEDGER_KAS';

        let clientIp = '127.0.0.1';
        try {
            clientIp =
                request.headers
                    .get('x-forwarded-for')
                    ?.split(',')[0]
                    ?.trim() ||
                getClientAddress() ||
                '127.0.0.1';
        } catch {
            clientIp = '127.0.0.1';
        }
        const userAgent =
            request.headers.get('user-agent') ||
            'Perennia-Sovereign-Client/1.0';

        let stripePaymentIntentId: string | null = null;
        let stripeOnrampSessionId: string | null = null;
        let stripeOnrampRedirectUrl: string | null = null;
        let stripeStatus: string | null = null;
        let isLiveStripeKey = false;
        let bridgeVirtualAccountId: string | null = null;
        const wireInstructions = getMercuryDirectWireInstructions(
            wireMemo,
            settlementTarget,
            targetAsset
        );

        if (isDirectMercuryWire) {
            bridgeVirtualAccountId = `mercury_wire_${onrampSessionId.toLowerCase()}`;
        } else {
            const onrampSessionRes =
                await createStripeCryptoOnrampSessionIfConfigured({
                    orderId: onrampSessionId,
                    walletAddress: formattedWallet,
                    fiatAmountUsd: quote.totalGrossChargeUsd,
                    targetAsset,
                    evmAddress: body.evmAddress,
                    solAddress: body.solAddress,
                    clientIp
                });
            if (onrampSessionRes.stripeOnrampUsed) {
                stripeOnrampSessionId = onrampSessionRes.onrampSessionId;
                stripeOnrampRedirectUrl = onrampSessionRes.redirectUrl;
                if (onrampSessionRes.clientSecret) {
                    clientSecret = onrampSessionRes.clientSecret;
                }
            }
            if (bankRailResult.decrypted || quote.paymentMethod === 'card') {
                try {
                    const stripeRes = await chargeViaStripeIfConfigured({
                        orderId: onrampSessionId,
                        walletAddress: formattedWallet,
                        grossChargeCents: quote.grossChargeCents,
                        quotedPrincipalCents: quote.principalCents,
                        perenniaFeeCents: quote.perenniaFeeCents,
                        stripeGatewayFeeCents: quote.stripeGatewayFeeCents,
                        tierName: quote.tierName,
                        paymentMethod:
                            quote.paymentMethod === 'card' ? 'card' : 'ach',
                        targetAsset,
                        routingNumber: bankRailResult.decrypted?.routingNumber,
                        accountNumber: bankRailResult.decrypted?.accountNumber,
                        accountType: bankRailResult.accountType,
                        bankLabel: bankRailResult.bankLabel,
                        clientIp,
                        userAgent
                    });
                    if (stripeRes.stripeUsed) {
                        stripePaymentIntentId = stripeRes.paymentIntentId;
                        stripeStatus = stripeRes.stripeStatus;
                        isLiveStripeKey = stripeRes.isLiveKey;
                        if (stripeRes.clientSecret) {
                            clientSecret = stripeRes.clientSecret;
                        }
                    }
                } catch (stripeChargeErr) {
                    console.warn(
                        'âš ï¸ [STRIPE CHARGE FALLBACK]: Continuing with session order:',
                        stripeChargeErr
                    );
                }
            }
        }

        const resolvedPaymentRail = isDirectMercuryWire
            ? 'MERCURY_INSTITUTIONAL_WIRE'
            : quote.paymentMethod === 'card'
              ? 'STRIPE_CARD_GROSS_UP'
              : stripePaymentIntentId
                ? 'STRIPE_ACH_DIRECT_DEBIT'
                : 'ACH_DIRECT_DEBIT';

        const wholesaleOrderId = stripeOnrampSessionId
            ? `STRIPE-ONRAMP-${stripeOnrampSessionId}`
            : stripePaymentIntentId
              ? `STRIPE-PI-${stripePaymentIntentId}`
              : bridgeVirtualAccountId
                ? `MERCURY-WIRE-${onrampSessionId}`
                : changenowExchangeId
                  ? `CHANGENOW-V2-${changenowExchangeId}`
                  : targetAsset === 'KAS' || targetAsset === 'SILO'
                    ? `CHRONOS-REPAR-${onrampSessionId.slice(-6)}`
                    : `CHANGENOW-QUOTE-${onrampSessionId.slice(-6)}`;

        const wholesaleWithdrawId =
            targetAsset === 'KAS' || targetAsset === 'SILO'
                ? `LOCAL-VAULT-UTXO-${onrampSessionId.slice(-6)}`
                : `DROPSHIP-WD-${onrampSessionId.slice(-6)}`;

        const client = await dbPool.connect();
        let finalStatus = isDirectMercuryWire
            ? 'AWAITING_INSTITUTIONAL_WIRE'
            : stripeStatus === 'processing'
              ? 'ACH_PROCESSING_HOLD'
              : 'AWAITING_WIRE_RECEIPT';
        let finalTxHash: string | null = null;
        let finalDeliveredTokens = 0;
        let finalDeliveredKas = 0;

        try {
            await client.query(
                `INSERT INTO fiat_onramp_orders
                 (order_id, wallet_address, payment_rail, payment_method, tier_name, tier_bps,
                  settlement_target, target_asset, target_spot_price, estimated_tokens, auto_stake_silo,
                  quoted_principal_cents, perennia_fee_cents, stripe_gateway_fee_cents, gross_charge_cents,
                  fiat_amount_usd, fee_usd, hard_cost_usd, guaranteed_profit_usd,
                  competitor_fee_usd, guest_savings_usd, net_usd_converted, locked_spot_price, estimated_kas,
                  delivered_kas, wire_memo, routing_topology, wholesale_order_id, wholesale_withdraw_id,
                  changenow_exchange_id, payin_address, stripe_payment_intent_id, stripe_onramp_session_id,
                  bridge_virtual_account_id, bridge_wire_routing, bridge_wire_account, bank_last4,
                  master_treasury_fee_usdc, post_trade_sweep_json, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
                         $20, $21, $22, $23, $24, 0.0, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39)`,
                [
                    onrampSessionId,
                    formattedWallet,
                    resolvedPaymentRail,
                    quote.paymentMethod,
                    quote.tierName,
                    quote.tierBps,
                    settlementTarget,
                    targetAsset,
                    targetSpotPrice,
                    quote.estimatedTokens,
                    autoStakeSilo,
                    quote.principalCents,
                    quote.perenniaFeeCents,
                    quote.stripeGatewayFeeCents,
                    quote.grossChargeCents,
                    quote.totalGrossChargeUsd,
                    quote.feeUsd,
                    quote.hardCostUsd,
                    quote.perenniaFeeUsd,
                    quote.competitorFeeUsd,
                    quote.guestSavingsUsd,
                    quote.principalUsd,
                    kasSpotPrice,
                    estimatedKas,
                    wireMemo,
                    quote.routingTopology,
                    wholesaleOrderId,
                    wholesaleWithdrawId,
                    changenowExchangeId,
                    payinAddress,
                    stripePaymentIntentId,
                    stripeOnrampSessionId,
                    bridgeVirtualAccountId,
                    wireInstructions.routingNumber,
                    wireInstructions.accountNumber,
                    bankRailResult.bankLast4,
                    quote.perenniaFeeUsd,
                    JSON.stringify(postTradeAllocation),
                    finalStatus
                ]
            );

            const shouldFulfillImmediately =
                !isDirectMercuryWire &&
                body.instantBankDebit !== false &&
                Boolean(bankRailResult.decrypted) &&
                (!isLiveStripeKey || stripeStatus === 'succeeded');

            if (shouldFulfillImmediately) {
                const fulfilled = await executeImmediateOrderFulfillment({
                    client,
                    orderId: onrampSessionId,
                    cleanWallet: cleanAddressOnly,
                    targetAsset,
                    settlementTarget,
                    autoStakeSilo,
                    fiatUsd: quote.totalGrossChargeUsd,
                    feeUsd: quote.feeUsd,
                    perenniaFeeUsd: quote.perenniaFeeUsd,
                    netUsd: quote.principalUsd,
                    liveTargetSpot: targetSpotPrice,
                    kasSpot: kasSpotPrice,
                    destinationAddress: body.destinationAddress,
                    preferredTxHash: stripePaymentIntentId || undefined,
                    prequotedTokens: quote.estimatedTokens
                });
                finalStatus = 'COMPLETED';
                finalTxHash = fulfilled.txHash;
                finalDeliveredTokens = fulfilled.deliveredTokens;
                finalDeliveredKas = fulfilled.deliveredKas;
            }
        } finally {
            client.release();
        }

        const sessionRecord = {
            sessionId: onrampSessionId,
            orderId: onrampSessionId,
            clientSecret,
            walletAddress: formattedWallet,
            tierName: quote.tierName,
            tierBps: quote.tierBps,
            tierBadgeLabel: quote.tierBadgeLabel,
            paymentMethod: quote.paymentMethod,
            quotedPrincipalCents: quote.principalCents,
            perenniaFeeCents: quote.perenniaFeeCents,
            stripeGatewayFeeCents: quote.stripeGatewayFeeCents,
            grossChargeCents: quote.grossChargeCents,
            principalUsd: quote.principalUsd,
            perenniaFeeUsd: quote.perenniaFeeUsd,
            stripeGatewayFeeUsd: quote.stripeGatewayFeeUsd,
            totalGrossChargeUsd: quote.totalGrossChargeUsd,
            fiatAmountUsd: quote.totalGrossChargeUsd,
            feeUsd: quote.feeUsd,
            hardCostUsd: quote.hardCostUsd,
            guaranteedProfitUsd: quote.perenniaFeeUsd,
            protocolFeeFloorPct: quote.protocolFeeFloorPct,
            feeTierLabel: quote.tierBadgeLabel,
            minerOrPassDiscountActive: quote.minerOrPassDiscountActive,
            competitorFeeUsd: quote.competitorFeeUsd,
            moonpayFeeUsd: quote.moonpayFeeUsd,
            coinbaseFeeUsd: quote.coinbaseFeeUsd,
            savingsVsMoonpayUsd: quote.savingsVsMoonpayUsd,
            savingsVsCoinbaseUsd: quote.savingsVsCoinbaseUsd,
            guestSavingsUsd: quote.guestSavingsUsd,
            netUsdConverted: quote.principalUsd,
            spotPrice: kasSpotPrice,
            targetAsset,
            targetSpotPrice,
            estimatedKas,
            estimatedTokens: quote.estimatedTokens,
            deliveredTokens:
                finalDeliveredTokens > 0
                    ? finalDeliveredTokens
                    : quote.estimatedTokens,
            deliveredKas:
                finalDeliveredKas > 0 ? finalDeliveredKas : estimatedKas,
            autoStakeSilo,
            whaleWireFeeWaived: quote.whaleWireFeeWaived,
            bundledUsdcFeeWaived: quote.bundledUsdcFeeWaived,
            requiresInstitutionalWire: quote.requiresInstitutionalWire,
            paymentRail: resolvedPaymentRail,
            settlementTarget,
            routingTopology: quote.routingTopology,
            wholesaleOrderId,
            wholesaleWithdrawId,
            changenowExchangeId,
            payinAddress,
            stripePaymentIntentId,
            stripeOnrampSessionId,
            stripeOnrampRedirectUrl,
            stripeStatus,
            bridgeVirtualAccountId,
            bankLast4: bankRailResult.bankLast4,
            bankLabel: bankRailResult.bankLabel,
            postTradeAllocation,
            wireMemo,
            wireInstructions,
            txHash: finalTxHash,
            stageIndex:
                finalStatus === 'COMPLETED'
                    ? 4
                    : finalStatus === 'ACH_PROCESSING_HOLD'
                      ? 2
                      : 1,
            status: finalStatus,
            nonKycTier: isDirectMercuryWire
                ? 'MERCURY_INSTITUTIONAL_WIRE'
                : 'STRIPE_GROSS_UP_ONRAMP',
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
                    eventType:
                        finalStatus === 'COMPLETED'
                            ? 'FIAT_ONRAMP'
                            : 'FIAT_ONRAMP_CREATED',
                    status: finalStatus,
                    wallet: cleanAddressOnly,
                    sessionId: onrampSessionId,
                    assetTicker: targetAsset,
                    amountTokens: sessionRecord.deliveredTokens,
                    fiatAmountUsd: quote.totalGrossChargeUsd,
                    spotPrice: targetSpotPrice,
                    autoStakeSilo,
                    txHash: finalTxHash,
                    order: sessionRecord
                })
            )
            .catch(() => {});

        return json({
            success: true,
            ...sessionRecord
        });
    } catch (error: any) {
        console.error('ðŸš¨ [FIAT ON-RAMP SERVER ERROR]:', error);
        const sanitized = sanitizeCustomerFacingFiatError(error);
        return json(
            { error: sanitized.userMessage },
            { status: sanitized.httpStatus }
        );
    }
};