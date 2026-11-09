import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { dbPool } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import {
    normalizeKaspaAddressStrict,
    normalizeKaspaBase32Strict
} from '$lib/server/kms';
import { computeReservoirHmac } from '$lib/server/l1Dispatcher';
import crypto from 'node:crypto';

const HARD_PROFIT_FLOOR_RATE = 0.001;
const WHOLESALE_LOYAL_MINER_FEE_RATE = 0.0025;
const SHIELD_STAKER_FEE_RATE = 0.0075;
const PUBLIC_MAX_SWAP_FEE_RATE = 0.015;

const LP_BASE_HURDLE_MIN_APR_PCT = 14.2;
const LP_BASE_HURDLE_TARGET_APR_PCT = 14.6;
const COMPETITOR_STANDARD_AMM_APR_PCT = 9.1;

const DEFAULT_RESERVE_WHITELIST = new Set([
    'KAS',
    'BTC',
    'ETH',
    'SOL',
    'USDC',
    'USDT',
    'SILO'
]);

export type TokenSteeringState =
    | 'AUTO_BALANCE'
    | 'ACCUMULATE'
    | 'FREEZE'
    | 'PASS_THROUGH'
    | 'BLACKLISTED';

function roundCents(val: number): number {
    return Math.round(val * 100) / 100;
}

function resolveRustBackendUrl(): string {
    const raw = String(env.RUST_BACKEND_URL || 'http://127.0.0.1:8002').trim();
    return raw.replace(/\/+$/, '');
}

function buildInternalAuthHeaders(): Record<string, string> {
    const token = String(
        env.INTERNAL_ADMIN_TOKEN || env.PERENNIA_ADMIN_KEY || ''
    ).trim();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json'
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
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
        case 'XAU':
            return { currency: 'paxg', network: 'eth' };
        default:
            return { currency: clean.toLowerCase(), network: 'eth' };
    }
}

function estimateOnChainGasAndRoutingSlippageUsd(
    payAsset: string,
    receiveAsset: string,
    grossUsd: number,
    isExternalPassThrough: boolean
): {
    networkGasUsd: number;
    externalRoutingSlippageUsd: number;
    totalHardRoutingCostUsd: number;
} {
    const payClean = payAsset.trim().toUpperCase();
    const recClean = receiveAsset.trim().toUpperCase();
    const gasForAsset = (ticker: string): number => {
        if (
            ticker === 'KAS' ||
            ticker === 'SILO' ||
            ticker === 'NACHO' ||
            ticker === 'BEDRCK' ||
            ticker === 'PERX'
        ) {
            return 0.002;
        }
        if (ticker === 'BTC') return 0.65;
        if (
            ticker === 'ETH' ||
            ticker === 'USDC' ||
            ticker === 'USDT' ||
            ticker === 'XAU'
        ) {
            return 0.25;
        }
        if (
            ticker === 'SOL' ||
            ticker === 'ARB' ||
            ticker === 'BASE' ||
            ticker === 'POL' ||
            ticker === 'AVAX' ||
            ticker === 'SUI'
        ) {
            return 0.02;
        }
        return 0.08;
    };
    const networkGasUsd = Number(
        (gasForAsset(payClean) + gasForAsset(recClean)).toFixed(4)
    );
    const externalRoutingSlippageUsd = isExternalPassThrough
        ? Number((grossUsd * 0.0015).toFixed(4))
        : 0;
    return {
        networkGasUsd,
        externalRoutingSlippageUsd,
        totalHardRoutingCostUsd: Number(
            (networkGasUsd + externalRoutingSlippageUsd).toFixed(4)
        )
    };
}

async function resolveSubsystemKillSwitches(): Promise<{
    darkPoolPaused: boolean;
    externalDexPaused: boolean;
    bucketPayoutsPaused: boolean;
}> {
    try {
        const [dpRaw, extRaw, bktRaw] = await Promise.all([
            redis.get('perennia:killswitch:dark_pool'),
            redis.get('perennia:killswitch:external_dex'),
            redis.get('perennia:killswitch:bucket_payouts')
        ]);
        const isTrue = (v: string | null) =>
            v === '1' || String(v || '').toLowerCase() === 'true';
        return {
            darkPoolPaused: isTrue(dpRaw),
            externalDexPaused: isTrue(extRaw),
            bucketPayoutsPaused: isTrue(bktRaw)
        };
    } catch {
        return {
            darkPoolPaused: false,
            externalDexPaused: false,
            bucketPayoutsPaused: false
        };
    }
}

async function resolveTokenSteeringDecision(
    payAsset: string,
    receiveAsset: string,
    cleanWallet: string,
    prefixedWallet: string
): Promise<{
    allowed: boolean;
    rejectReason?: string;
    payState: TokenSteeringState;
    receiveState: TokenSteeringState;
    payWhitelisted: boolean;
    receiveWhitelisted: boolean;
    allowDarkPoolInternalClearing: boolean;
    requiresHopViaKasOrUsdc: boolean;
    feeLegs: Array<{ asset: string; shareRatio: number }>;
    steeringExplanation: string;
}> {
    const pTick = payAsset.trim().toUpperCase();
    const rTick = receiveAsset.trim().toUpperCase();

    try {
        const [
            blkWalletClean,
            blkWalletPref,
            blkPayTok,
            blkRecTok,
            rawStates,
            rawWhitelist,
            rawTargetWeights,
            rawActualWeights
        ] = await Promise.all([
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
            redis.sismember('perennia:firewall:blacklisted_tokens', pTick),
            redis.sismember('perennia:firewall:blacklisted_tokens', rTick),
            redis.hgetall('perennia:steering:token_states'),
            redis.smembers('perennia:steering:whitelist'),
            redis.hgetall('perennia:steering:target_weights'),
            redis.hgetall('perennia:steering:actual_weights')
        ]);

        if (blkWalletClean === 1 || blkWalletPref === 1) {
            return {
                allowed: false,
                rejectReason:
                    'FIREWALL_BLACKLISTED_WALLET: Wallet address is blocked by the Perennia Security Firewall.',
                payState: 'BLACKLISTED',
                receiveState: 'BLACKLISTED',
                payWhitelisted: false,
                receiveWhitelisted: false,
                allowDarkPoolInternalClearing: false,
                requiresHopViaKasOrUsdc: false,
                feeLegs: [],
                steeringExplanation: 'Rejected at API edge by Security Firewall'
            };
        }

        const whitelistSet =
            Array.isArray(rawWhitelist) && rawWhitelist.length > 0
                ? new Set(rawWhitelist.map((s) => s.trim().toUpperCase()))
                : new Set(DEFAULT_RESERVE_WHITELIST);

        const resolveState = (
            ticker: string,
            isBlacklistedSet: number
        ): TokenSteeringState => {
            if (isBlacklistedSet === 1) return 'BLACKLISTED';
            const explicit = String(rawStates?.[ticker] || '')
                .trim()
                .toUpperCase();
            if (
                explicit === 'AUTO_BALANCE' ||
                explicit === 'ACCUMULATE' ||
                explicit === 'FREEZE' ||
                explicit === 'PASS_THROUGH' ||
                explicit === 'BLACKLISTED'
            ) {
                return explicit as TokenSteeringState;
            }
            return whitelistSet.has(ticker) ? 'AUTO_BALANCE' : 'PASS_THROUGH';
        };

        const payState = resolveState(pTick, blkPayTok);
        const receiveState = resolveState(rTick, blkRecTok);

        if (payState === 'BLACKLISTED' || receiveState === 'BLACKLISTED') {
            const badTicker = payState === 'BLACKLISTED' ? pTick : rTick;
            return {
                allowed: false,
                rejectReason: `FIREWALL_BLACKLISTED_TOKEN: ${badTicker} is flagged as a blacklisted scam/honeypot contract and rejected at the API edge.`,
                payState,
                receiveState,
                payWhitelisted: false,
                receiveWhitelisted: false,
                allowDarkPoolInternalClearing: false,
                requiresHopViaKasOrUsdc: false,
                feeLegs: [],
                steeringExplanation: `Rejected blacklisted asset ${badTicker}`
            };
        }

        const payWhitelisted =
            whitelistSet.has(pTick) && payState !== 'PASS_THROUGH';
        const receiveWhitelisted =
            whitelistSet.has(rTick) && receiveState !== 'PASS_THROUGH';

        const allowDarkPoolInternalClearing =
            payState !== 'PASS_THROUGH' && receiveState !== 'PASS_THROUGH';
        const requiresHopViaKasOrUsdc = !payWhitelisted && !receiveWhitelisted;

        // 1. Check Manual Director Override: ACCUMULATE
        if (payState === 'ACCUMULATE' && payWhitelisted) {
            return {
                allowed: true,
                payState,
                receiveState,
                payWhitelisted,
                receiveWhitelisted,
                allowDarkPoolInternalClearing,
                requiresHopViaKasOrUsdc,
                feeLegs: [{ asset: pTick, shareRatio: 1.0 }],
                steeringExplanation: `ACCUMULATE override: 100% fee skimmed in ${pTick}`
            };
        }
        if (receiveState === 'ACCUMULATE' && receiveWhitelisted) {
            return {
                allowed: true,
                payState,
                receiveState,
                payWhitelisted,
                receiveWhitelisted,
                allowDarkPoolInternalClearing,
                requiresHopViaKasOrUsdc,
                feeLegs: [{ asset: rTick, shareRatio: 1.0 }],
                steeringExplanation: `ACCUMULATE override: 100% fee skimmed in ${rTick}`
            };
        }

        // 2. Check FREEZE state (pause treasury fee accumulation in frozen asset while keeping Dark Pool active)
        const payEligibleForFee = payWhitelisted && payState !== 'FREEZE';
        const recEligibleForFee =
            receiveWhitelisted && receiveState !== 'FREEZE';

        if (payEligibleForFee && recEligibleForFee) {
            const pTarget = parseFloat(rawTargetWeights?.[pTick] || '15');
            const pActual = parseFloat(rawActualWeights?.[pTick] || '15');
            const rTarget = parseFloat(rawTargetWeights?.[rTick] || '15');
            const rActual = parseFloat(rawActualWeights?.[rTick] || '15');
            const pDeficit = pTarget - pActual;
            const rDeficit = rTarget - rActual;

            if (Math.abs(pDeficit - rDeficit) <= 0.5) {
                return {
                    allowed: true,
                    payState,
                    receiveState,
                    payWhitelisted,
                    receiveWhitelisted,
                    allowDarkPoolInternalClearing,
                    requiresHopViaKasOrUsdc,
                    feeLegs: [
                        { asset: pTick, shareRatio: 0.5 },
                        { asset: rTick, shareRatio: 0.5 }
                    ],
                    steeringExplanation: `AUTO_BALANCE (Balanced Master Buckets): 50/50 fee split in ${pTick} & ${rTick}`
                };
            }
            const underweightAsset = pDeficit > rDeficit ? pTick : rTick;
            return {
                allowed: true,
                payState,
                receiveState,
                payWhitelisted,
                receiveWhitelisted,
                allowDarkPoolInternalClearing,
                requiresHopViaKasOrUsdc,
                feeLegs: [{ asset: underweightAsset, shareRatio: 1.0 }],
                steeringExplanation: `AUTO_BALANCE (Underweight Bucket): 100% fee skimmed in ${underweightAsset}`
            };
        }

        if (payEligibleForFee && !recEligibleForFee) {
            return {
                allowed: true,
                payState,
                receiveState,
                payWhitelisted,
                receiveWhitelisted,
                allowDarkPoolInternalClearing,
                requiresHopViaKasOrUsdc,
                feeLegs: [{ asset: pTick, shareRatio: 1.0 }],
                steeringExplanation: `Reserve Whitelist Firewall: 100% fee skimmed in verified ${pTick}`
            };
        }

        if (!payEligibleForFee && recEligibleForFee) {
            return {
                allowed: true,
                payState,
                receiveState,
                payWhitelisted,
                receiveWhitelisted,
                allowDarkPoolInternalClearing,
                requiresHopViaKasOrUsdc,
                feeLegs: [{ asset: rTick, shareRatio: 1.0 }],
                steeringExplanation: `Reserve Whitelist Firewall: 100% fee skimmed in verified ${rTick}`
            };
        }

        // Neither side is an active whitelisted fee asset (both PASS_THROUGH or FREEZE) -> hop & skim 100% in KAS or USDC
        const fallbackHopAsset =
            pTick === 'KAS' || rTick === 'KAS' ? 'KAS' : 'USDC';
        return {
            allowed: true,
            payState,
            receiveState,
            payWhitelisted,
            receiveWhitelisted,
            allowDarkPoolInternalClearing,
            requiresHopViaKasOrUsdc: true,
            feeLegs: [{ asset: fallbackHopAsset, shareRatio: 1.0 }],
            steeringExplanation: `PASS_THROUGH / Anti-Poisoning Hop: 100% fee skimmed in ${fallbackHopAsset}`
        };
    } catch {
        const payWhitelisted = DEFAULT_RESERVE_WHITELIST.has(pTick);
        const receiveWhitelisted = DEFAULT_RESERVE_WHITELIST.has(rTick);
        const feeAsset = payWhitelisted
            ? pTick
            : receiveWhitelisted
              ? rTick
              : 'USDC';
        return {
            allowed: true,
            payState: payWhitelisted ? 'AUTO_BALANCE' : 'PASS_THROUGH',
            receiveState: receiveWhitelisted ? 'AUTO_BALANCE' : 'PASS_THROUGH',
            payWhitelisted,
            receiveWhitelisted,
            allowDarkPoolInternalClearing: payWhitelisted && receiveWhitelisted,
            requiresHopViaKasOrUsdc: !payWhitelisted && !receiveWhitelisted,
            feeLegs: [{ asset: feeAsset, shareRatio: 1.0 }],
            steeringExplanation: `Default Reserve Whitelist: 100% fee skimmed in ${feeAsset}`
        };
    }
}

async function computeDynamicHurdleWaterfallSplit(params: {
    poolPair: string;
    grossUsd: number;
    totalProtocolFeeUsd: number;
    kasSpotUsd: number;
}): Promise<{
    hardFloorPerenniaUsd: number;
    lpAllocatedFeeUsd: number;
    perenniaTotalCutUsd: number;
    perenniaLpCompound60Usd: number;
    perenniaLiquidReserve40Usd: number;
    projectedBaseLpAprPct: number;
    projectedMaxMultiplierAprPct: number;
    surplusVolumeSweepActive: boolean;
}> {
    const safeGross = Math.max(0, params.grossUsd);
    const totalFee = Math.max(0, params.totalProtocolFeeUsd);

    // Step 1: Lock in Perennia's 0.10% hard cost-plus protocol floor above gas first on every transaction
    const hardFloorPerenniaUsd = Math.min(
        totalFee,
        Math.max(0.01, safeGross * HARD_PROFIT_FLOOR_RATE)
    );
    const remainingDistributableFeeUsd = Math.max(
        0,
        totalFee - hardFloorPerenniaUsd
    );

    // Query pair TVL & rolling 24h LP fees to evaluate the 14.2% - 14.6% base APR hurdle
    let pairTvlUsd = 25_000;
    let rolling24hLpFeesUsd = 0;
    try {
        const [lpRes, distRes] = await Promise.all([
            dbPool.query(
                `SELECT COALESCE(SUM(staked_asset_a), 0.0) AS total_kas
                 FROM liquidity_providers
                 WHERE pool_pair = $1 OR pool_pair LIKE '%' || $2 || '%'`,
                [params.poolPair, params.poolPair.split('/')[1] || 'USDC']
            ),
            dbPool.query(
                `SELECT COALESCE(SUM(total_fees_distributed_usd), 0.0) AS fees_24h
                 FROM yield_distributions
                 WHERE pool_pair = $1
                   AND distributed_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'`,
                [params.poolPair]
            )
        ]);
        const stakedKas = Number(lpRes.rows[0]?.total_kas || 0);
        if (stakedKas > 0 && params.kasSpotUsd > 0) {
            // 50% KAS anchor implies total pair TVL = 2 * KAS_value
            pairTvlUsd = Math.max(1_000, stakedKas * params.kasSpotUsd * 2.0);
        }
        rolling24hLpFeesUsd = Number(distRes.rows[0]?.fees_24h || 0);
    } catch {
        // Use conservative baseline TVL
    }

    // Daily LP fee target required to hit 14.6% base APR hurdle: TVL * 0.146 / 365
    const dailyHurdleTargetUsd =
        (pairTvlUsd * (LP_BASE_HURDLE_TARGET_APR_PCT / 100.0)) / 365.0;
    const dailyHurdleMinUsd =
        (pairTvlUsd * (LP_BASE_HURDLE_MIN_APR_PCT / 100.0)) / 365.0;

    // Step 2 & Step 3: Route primary share (~40% of a 1.00% fee = ~44.4% of remaining after 0.10% floor) to LPs until 14.6% hurdle is met, then sweep surplus into Perennia treasury
    let lpShareOfRemaining = 0.4444;
    let surplusVolumeSweepActive = false;

    if (rolling24hLpFeesUsd >= dailyHurdleTargetUsd) {
        // Step 3 (Surplus Volume Sweep): Rolling 24h volume already pushes LP yields above 14.6% base hurdle
        lpShareOfRemaining = 0.20;
        surplusVolumeSweepActive = true;
    } else if (rolling24hLpFeesUsd < dailyHurdleMinUsd) {
        // Boost LP allocation on normal volume to reach the 14.2% - 14.6% hurdle while Perennia keeps its 0.10% floor + spread
        lpShareOfRemaining = 0.45;
    }

    const lpAllocatedFeeUsd = Number(
        (remainingDistributableFeeUsd * lpShareOfRemaining).toFixed(6)
    );
    const perenniaTotalCutUsd = Number(
        Math.max(
            hardFloorPerenniaUsd,
            totalFee - lpAllocatedFeeUsd
        ).toFixed(6)
    );

    // Internal Treasury 60/40 Reserve Split:
    // 60% into Perennia-owned LP positions to compound, 40% in liquid USD/stablecoin clearing reserve
    const perenniaLpCompound60Usd = Number(
        (perenniaTotalCutUsd * 0.6).toFixed(6)
    );
    const perenniaLiquidReserve40Usd = Number(
        Math.max(0, perenniaTotalCutUsd - perenniaLpCompound60Usd).toFixed(6)
    );

    const newRolling24hLpUsd = rolling24hLpFeesUsd + lpAllocatedFeeUsd;
    const rawProjectedApr =
        pairTvlUsd > 0 ? ((newRolling24hLpUsd * 365.0) / pairTvlUsd) * 100.0 : 14.4;
    const projectedBaseLpAprPct = Number(
        Math.max(
            LP_BASE_HURDLE_MIN_APR_PCT,
            Math.min(24.0, rawProjectedApr)
        ).toFixed(2)
    );
    const projectedMaxMultiplierAprPct = Number(
        (projectedBaseLpAprPct * 2.5).toFixed(2)
    );

    return {
        hardFloorPerenniaUsd,
        lpAllocatedFeeUsd,
        perenniaTotalCutUsd,
        perenniaLpCompound60Usd,
        perenniaLiquidReserve40Usd,
        projectedBaseLpAprPct,
        projectedMaxMultiplierAprPct,
        surplusVolumeSweepActive
    };
}

async function resolveStrictSpotPriceUsd(ticker: string): Promise<number> {
    const clean = String(ticker || '').trim().toUpperCase();
    if (!clean) return 0;
    if (clean === 'USD' || clean === 'USDC' || clean === 'USDT') return 1.0;
    const cached = await redis
        .get(`oracle:spot:${clean}_USDC`)
        .catch(() => null);
    if (cached) {
        const parsed = parseFloat(cached);
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
            [clean]
        );
        if (dbRes.rows.length > 0) {
            const price = Number(dbRes.rows[0].price_usd || 0);
            if (Number.isFinite(price) && price > 0) {
                await redis
                    .set(`oracle:spot:${clean}_USDC`, String(price), 'EX', 30)
                    .catch(() => {});
                return price;
            }
        }
    } catch {
        // Fallback below
    }
    if (clean === 'SILO') {
        const kasSpot = await resolveStrictSpotPriceUsd('KAS');
        if (kasSpot > 0) {
            return Number((kasSpot / 23.809524).toFixed(6));
        }
    }
    return 0;
}

async function fetchChangeNowMinAmountKas(
    targetTicker: string,
    kasSpotUsd: number
): Promise<{ minProfitableKas: number; minProfitableUsd: number }> {
    const clean = targetTicker.trim().toUpperCase();
    const safeKasSpot = kasSpotUsd > 0 ? kasSpotUsd : 0.15;
    if (clean === 'USD') {
        const minUsd = 25.28;
        const minKas = Math.ceil((minUsd / safeKasSpot) * 10) / 10;
        return {
            minProfitableKas: minKas,
            minProfitableUsd: Number((minKas * safeKasSpot).toFixed(2))
        };
    }
    if (
        clean === 'SILO' ||
        clean === 'NACHO' ||
        clean === 'BEDRCK' ||
        clean === 'PERX'
    ) {
        const minUsd = 3.5;
        const minKas = Math.ceil((minUsd / safeKasSpot) * 10) / 10;
        return {
            minProfitableKas: minKas,
            minProfitableUsd: Number((minKas * safeKasSpot).toFixed(2))
        };
    }
    const cacheKey = `perennia:changenow:min_kas:${clean}`;
    const cachedMinStr = await redis.get(cacheKey).catch(() => null);
    if (cachedMinStr) {
        const parsed = parseFloat(cachedMinStr);
        if (Number.isFinite(parsed) && parsed > 0) {
            return {
                minProfitableKas: parsed,
                minProfitableUsd: Number((parsed * safeKasSpot).toFixed(2))
            };
        }
    }
    let baseBridgeMinKas = 0;
    const apiKey = String(env.CHANGENOW_API_KEY || '').trim();
    if (apiKey) {
        try {
            const toSpec = resolveChangeNowCurrencyAndNetwork(clean);
            const url = `https://api.changenow.io/v2/exchange/min-amount?fromCurrency=kas&toCurrency=${encodeURIComponent(toSpec.currency)}&fromNetwork=kas&toNetwork=${encodeURIComponent(toSpec.network)}&flow=standard`;
            const res = await fetch(url, {
                headers: {
                    'x-changenow-api-key': apiKey,
                    accept: 'application/json'
                },
                signal: AbortSignal.timeout(4500)
            });
            if (res.ok) {
                const data = await res.json();
                const minVal = Number(data?.minAmount ?? 0);
                if (Number.isFinite(minVal) && minVal > 0) {
                    baseBridgeMinKas = minVal;
                }
            }
        } catch {
            // Fallback below
        }
    }
    if (baseBridgeMinKas <= 0) {
        const minBridgeUsd =
            clean === 'BTC'
                ? 22.0
                : clean === 'ETH' ||
                    clean === 'XAU' ||
                    clean === 'XAG' ||
                    clean === 'USTB' ||
                    clean === 'USDT'
                  ? 14.0
                  : clean === 'USDC' ||
                      clean === 'SOL' ||
                      clean === 'ARB' ||
                      clean === 'BASE' ||
                      clean === 'POL' ||
                      clean === 'AVAX'
                    ? 6.5
                    : 8.5;
        baseBridgeMinKas = minBridgeUsd / safeKasSpot;
    }
    const marginKas = 0.5 / safeKasSpot;
    const profitableMinKas =
        Math.ceil((baseBridgeMinKas * 1.015 + marginKas) * 10) / 10;
    const profitableMinUsd = Number(
        (profitableMinKas * safeKasSpot).toFixed(2)
    );
    await redis
        .set(cacheKey, profitableMinKas.toFixed(4), 'EX', 180)
        .catch(() => {});
    return {
        minProfitableKas: profitableMinKas,
        minProfitableUsd: profitableMinUsd
    };
}

async function resolveUserSwapFeeTier(
    cleanWallet: string,
    prefixedWallet: string,
    grossUsd: number
): Promise<{
    feeRate: number;
    feeTierLabel: string;
    wholesaleFloorActive: boolean;
}> {
    if (cleanWallet) {
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
            try {
                const parsed = JSON.parse(loyaltyRaw);
                const weeks = Number(parsed.consecutiveWeeks || 0);
                const dynamicWholesaleRate =
                    weeks >= 10
                        ? HARD_PROFIT_FLOOR_RATE
                        : Math.max(
                              HARD_PROFIT_FLOOR_RATE,
                              WHOLESALE_LOYAL_MINER_FEE_RATE - weeks * 0.00015
                          );
                return {
                    feeRate: Number(dynamicWholesaleRate.toFixed(5)),
                    feeTierLabel: `${(dynamicWholesaleRate * 100).toFixed(2)}% Active Stratum Miner Wholesale Tier (${weeks}w Streak)`,
                    wholesaleFloorActive: true
                };
            } catch {
                return {
                    feeRate: HARD_PROFIT_FLOOR_RATE,
                    feeTierLabel:
                        '0.10% Active Stratum Miner Wholesale Floor',
                    wholesaleFloorActive: true
                };
            }
        }
        if (passRaw) {
            return {
                feeRate: HARD_PROFIT_FLOOR_RATE,
                feeTierLabel: '0.10% Monthly Routing Pass Wholesale Floor',
                wholesaleFloorActive: true
            };
        }
        try {
            const graceShieldActive =
                graceShieldRaw === '1' ||
                String(graceShieldRaw || '').toLowerCase() === 'true';
            const nowMs = Date.now();
            const graceWindowMs = graceShieldActive ? 86_400_000 : 7_200_000;
            const graceCutoffMs = nowMs - graceWindowMs;
            const graceCutoffSecs =
                Math.floor(nowMs / 1000) - Math.floor(graceWindowMs / 1000);
            const workerRes = await dbPool.query(
                `SELECT streak_started_ts
                 FROM worker_profiles
                 WHERE (LOWER(REPLACE(TRIM(wallet_address), 'kaspa:', '')) = $1 OR wallet_address = $2)
                   AND (
                       status IN ('online', 'grace_period')
                       OR (last_share_ts > 10000000000 AND last_share_ts >= $3)
                       OR (last_share_ts > 0 AND last_share_ts <= 10000000000 AND last_share_ts >= $4)
                   )
                 ORDER BY effective_fee_rate ASC
                 LIMIT 1`,
                [cleanWallet, prefixedWallet, graceCutoffMs, graceCutoffSecs]
            );
            if (workerRes.rows.length > 0) {
                return {
                    feeRate: HARD_PROFIT_FLOOR_RATE,
                    feeTierLabel:
                        '0.10% Active Stratum Miner Wholesale Floor',
                    wholesaleFloorActive: true
                };
            }
        } catch {
            // Continue to SILO check
        }
        try {
            const siloRes = await dbPool.query(
                `SELECT COALESCE(SUM(amount_staked), 0.0) AS staked
                 FROM silo_staking_positions
                 WHERE (wallet_address = $1 OR wallet_address = $2)
                   AND status IN ('ACTIVE', 'COOLDOWN')`,
                [prefixedWallet, cleanWallet]
            );
            const stakedSilo = Number(siloRes.rows[0]?.staked || 0);
            if (stakedSilo >= 1_000_000) {
                return {
                    feeRate: HARD_PROFIT_FLOOR_RATE,
                    feeTierLabel: '0.10% SILO Whale Staker Wholesale Floor',
                    wholesaleFloorActive: true
                };
            }
            if (stakedSilo >= 100_000) {
                return {
                    feeRate: WHOLESALE_LOYAL_MINER_FEE_RATE,
                    feeTierLabel: '0.25% SILO Sovereign Staker Wholesale Tier',
                    wholesaleFloorActive: true
                };
            }
            if (stakedSilo >= 10_000) {
                return {
                    feeRate: SHIELD_STAKER_FEE_RATE,
                    feeTierLabel: '0.75% SILO Shield Staker Tier',
                    wholesaleFloorActive: true
                };
            }
        } catch {
            // Fall through
        }
    }
    if (grossUsd >= 10_000) {
        return {
            feeRate: WHOLESALE_LOYAL_MINER_FEE_RATE,
            feeTierLabel: '0.25% Institutional Volume Wholesale Tier',
            wholesaleFloorActive: true
        };
    }
    return {
        feeRate: PUBLIC_MAX_SWAP_FEE_RATE,
        feeTierLabel: '1.50% Standard Public Swap Tier',
        wholesaleFloorActive: false
    };
}

async function sweepLayeredBucketsOnAnchorSwap(params: {
    targetAsset: string;
    anchorKasVolume: number;
    kasSpotUsd: number;
    targetSpotUsd: number;
}): Promise<{
    targetAsset: string;
    layeredBucketsCleared: number;
    layeredKasSwept: number;
    layeredTokensDispatched: number;
    protocolFeesCapturedUsd: number;
    minProfitableKas: number;
}> {
    const cleanTarget = params.targetAsset.trim().toUpperCase();
    const killSwitches = await resolveSubsystemKillSwitches();
    if (
        killSwitches.bucketPayoutsPaused ||
        !cleanTarget ||
        cleanTarget === 'KAS' ||
        cleanTarget === 'USD' ||
        params.kasSpotUsd <= 0 ||
        params.targetSpotUsd <= 0
    ) {
        return {
            targetAsset: cleanTarget,
            layeredBucketsCleared: 0,
            layeredKasSwept: 0,
            layeredTokensDispatched: 0,
            protocolFeesCapturedUsd: 0,
            minProfitableKas: 0
        };
    }
    const { minProfitableKas, minProfitableUsd } =
        await fetchChangeNowMinAmountKas(cleanTarget, params.kasSpotUsd);
    const client = await dbPool.connect();
    try {
        const ccRes = await client.query(
            `SELECT wallet_address, layout_state FROM user_command_centers`
        );
        let totalPendingBucketKas = 0;
        for (const r of ccRes.rows) {
            const sectors: any[] = Array.isArray(r.layout_state?.sectors)
                ? r.layout_state.sectors
                : [];
            for (const sec of sectors) {
                const pending = Math.max(0, Number(sec?.pendingKaspa || 0));
                if (pending <= 0) continue;
                const routeMode = String(
                    sec?.routeMode || 'hold'
                ).toLowerCase();
                if (routeMode === 'auto-lp') continue;
                const secTicker = String(
                    sec?.settlementConfig?.targetAsset?.ticker || ''
                )
                    .trim()
                    .toUpperCase();
                if (secTicker === cleanTarget) {
                    totalPendingBucketKas += pending;
                }
            }
        }
        if (
            totalPendingBucketKas <= 1e-6 ||
            params.anchorKasVolume + totalPendingBucketKas + 1e-6 <
                minProfitableKas
        ) {
            return {
                targetAsset: cleanTarget,
                layeredBucketsCleared: 0,
                layeredKasSwept: 0,
                layeredTokensDispatched: 0,
                protocolFeesCapturedUsd: 0,
                minProfitableKas
            };
        }
        let clearedCount = 0;
        let sweptKasTotal = 0;
        let dispatchedTokensTotal = 0;
        let totalProtocolFeesUsd = 0;
        for (const r of ccRes.rows) {
            const rawWallet = String(r.wallet_address || '');
            const cleanWallet = normalizeKaspaBase32Strict(rawWallet);
            if (!cleanWallet) continue;
            const prefixedWallet = `kaspa:${cleanWallet}`;
            const layout = r.layout_state || { workers: [], sectors: [] };
            const sectors: any[] = Array.isArray(layout.sectors)
                ? layout.sectors
                : [];
            let userSweptKas = 0;
            let mutated = false;
            for (const sec of sectors) {
                const pending = Math.max(0, Number(sec?.pendingKaspa || 0));
                if (pending <= 0) continue;
                const routeMode = String(
                    sec?.routeMode || 'hold'
                ).toLowerCase();
                if (routeMode === 'auto-lp') continue;
                const secTicker = String(
                    sec?.settlementConfig?.targetAsset?.ticker || ''
                )
                    .trim()
                    .toUpperCase();
                if (secTicker === cleanTarget) {
                    userSweptKas += pending;
                    sec.pendingKaspa = 0;
                    mutated = true;
                    clearedCount += 1;
                }
            }
            if (mutated && userSweptKas > 0) {
                const grossUsd = userSweptKas * params.kasSpotUsd;
                const userTier = await resolveUserSwapFeeTier(
                    cleanWallet,
                    prefixedWallet,
                    grossUsd
                );
                const gasAndSlip = estimateOnChainGasAndRoutingSlippageUsd(
                    'KAS',
                    cleanTarget,
                    grossUsd,
                    false
                );
                const feeUsd = Math.max(
                    gasAndSlip.totalHardRoutingCostUsd +
                        grossUsd * HARD_PROFIT_FLOOR_RATE,
                    grossUsd * Math.max(HARD_PROFIT_FLOOR_RATE, userTier.feeRate)
                );
                const netUsd = Math.max(0, grossUsd - feeUsd);
                if (netUsd <= 0) continue;
                const outTokens = Number(
                    (netUsd / params.targetSpotUsd).toFixed(8)
                );
                if (outTokens <= 0) continue;
                await client.query(
                    `UPDATE user_command_centers
                     SET layout_state = $2,
                         last_updated = CURRENT_TIMESTAMP
                     WHERE wallet_address = $1`,
                    [rawWallet, JSON.stringify(layout)]
                );
                await redis
                    .hincrbyfloat(
                        `dev:sor:treasury:balances:${cleanWallet}`,
                        cleanTarget,
                        outTokens
                    )
                    .catch(() => {});
                const resRow = await client
                    .query(
                        `SELECT wallet_address, streaming_balance_kas, total_yield_kas, COALESCE(lp_tokens, '{}'::jsonb) AS lp_tokens
                         FROM yield_reservoirs
                         WHERE wallet_address = $1 OR wallet_address = $2
                         LIMIT 1`,
                        [prefixedWallet, cleanWallet]
                    )
                    .catch(() => ({ rows: [] as any[] }));
                const existingRow = resRow.rows[0];
                const targetPk = existingRow?.wallet_address || prefixedWallet;
                const streamKas = Number(
                    existingRow?.streaming_balance_kas || 0
                );
                const totalYieldKas = Number(
                    existingRow?.total_yield_kas || 0
                );
                const lpTokens: Record<string, number> = {
                    ...(existingRow?.lp_tokens || {})
                };
                lpTokens[cleanTarget] = Number(
                    ((Number(lpTokens[cleanTarget] || 0)) + outTokens).toFixed(
                        8
                    )
                );
                const newHmac = computeReservoirHmac(
                    prefixedWallet,
                    streamKas,
                    totalYieldKas,
                    lpTokens
                );
                await client
                    .query(
                        `INSERT INTO yield_reservoirs (
                            wallet_address, streaming_balance_kas, total_yield_kas,
                            lp_tokens, row_hmac_sig, last_updated
                        ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                        ON CONFLICT (wallet_address) DO UPDATE SET
                            lp_tokens = EXCLUDED.lp_tokens,
                            row_hmac_sig = EXCLUDED.row_hmac_sig,
                            last_updated = CURRENT_TIMESTAMP`,
                        [
                            targetPk,
                            streamKas,
                            totalYieldKas,
                            JSON.stringify(lpTokens),
                            newHmac
                        ]
                    )
                    .catch(() => {});
                const txRef = `ANCHOR-LAYER-${cleanTarget}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
                await client
                    .query(
                        `INSERT INTO hifo_tax_lots (
                            wallet_address, asset_ticker, kas_sompi, initial_tokens,
                            remaining_sompi, remaining_tokens, fmv_usd_per_token,
                            total_cost_basis_usd, source_event_type, source_tx_hash, status
                        ) VALUES ($1, $2, $3, $4, $3, $4, $5, $6, 'ANCHOR_LAYER_BUCKET_SWEEP', $7, 'OPEN')`,
                        [
                            cleanWallet,
                            cleanTarget,
                            Math.round(outTokens * 1e8),
                            outTokens,
                            params.targetSpotUsd,
                            netUsd,
                            txRef
                        ]
                    )
                    .catch(() => {});
                await client
                    .query(
                        `INSERT INTO tax_ledger_events (
                            wallet_address, asset_ticker, event_type, gross_proceeds_usd,
                            amount_tokens, spot_price_at_execution, tx_hash,
                            cost_basis_usd, realized_gain_loss_usd, holding_period
                        ) VALUES ($1, $2, 'ANCHOR_LAYER_BUCKET_SWEEP', $3, $4, $5, $6, $3, 0.0, 'SHORT_TERM')`,
                        [
                            cleanWallet,
                            cleanTarget,
                            netUsd,
                            outTokens,
                            params.targetSpotUsd,
                            txRef
                        ]
                    )
                    .catch(() => {});
                sweptKasTotal += userSweptKas;
                dispatchedTokensTotal += outTokens;
                totalProtocolFeesUsd += feeUsd;
                await redis
                    .publish(
                        'telemetry:updates',
                        JSON.stringify({
                            wallet: cleanWallet,
                            yield_update: true,
                            sectors: layout.sectors
                        })
                    )
                    .catch(() => {});
            }
        }
        if (totalProtocolFeesUsd > 0) {
            const lpCompound60 = roundCents(totalProtocolFeesUsd * 0.6);
            await redis
                .incrbyfloat(
                    'perennia:treasury:netting_profit_usd',
                    totalProtocolFeesUsd
                )
                .catch(() => {});
            await redis
                .incrbyfloat(
                    'perennia:fees:batch_accumulated:USDC',
                    lpCompound60
                )
                .catch(() => {});
        }
        const rawEpoch = await redis
            .get('perennia:settlement:epoch_telemetry')
            .catch(() => null);
        if (rawEpoch) {
            try {
                const parsedEpoch = JSON.parse(rawEpoch);
                if (parsedEpoch?.buckets?.[cleanTarget]) {
                    parsedEpoch.buckets[cleanTarget] = {
                        ...parsedEpoch.buckets[cleanTarget],
                        pendingKas: 0,
                        pendingUsd: 0,
                        minProfitableKas,
                        minProfitableUsd,
                        weightPct: 0,
                        status: 'IDLE',
                        lastClearedAt: Math.floor(Date.now() / 1000),
                        lastClearType: 'ANCHOR_OR_EPOCH'
                    };
                    await redis.set(
                        'perennia:settlement:epoch_telemetry',
                        JSON.stringify(parsedEpoch)
                    );
                    await redis.publish(
                        'telemetry:updates',
                        JSON.stringify({
                            epoch_telemetry_update: true,
                            epoch: parsedEpoch
                        })
                    );
                }
            } catch {
                // Ignore JSON parse notice
            }
        }
        return {
            targetAsset: cleanTarget,
            layeredBucketsCleared: clearedCount,
            layeredKasSwept: Number(sweptKasTotal.toFixed(4)),
            layeredTokensDispatched: Number(dispatchedTokensTotal.toFixed(8)),
            protocolFeesCapturedUsd: Number(totalProtocolFeesUsd.toFixed(4)),
            minProfitableKas
        };
    } finally {
        client.release();
    }
}

export const GET: RequestHandler = async ({
    url,
    cookies,
    locals
}: RequestEvent) => {
    const sessionId = cookies.get('perennia_session');
    let sessionWallet =
        (locals as any)?.user?.address || (locals as any).walletAddress || '';
    if (!sessionWallet && sessionId) {
        sessionWallet =
            (await redis.get(`session:${sessionId}`).catch(() => null)) || '';
    }
    const cleanWallet = normalizeKaspaBase32Strict(sessionWallet);
    const prefixedWallet = cleanWallet ? `kaspa:${cleanWallet}` : '';

    const payAsset = String(url.searchParams.get('payAsset') || 'KAS')
        .trim()
        .toUpperCase();
    const receiveAsset = String(url.searchParams.get('receiveAsset') || 'USDC')
        .trim()
        .toUpperCase();
    const amount = Math.max(0, Number(url.searchParams.get('amount') || 100));

    const steering = await resolveTokenSteeringDecision(
        payAsset,
        receiveAsset,
        cleanWallet,
        prefixedWallet
    );
    if (!steering.allowed) {
        return json(
            {
                success: false,
                error: steering.rejectReason
            },
            { status: 403 }
        );
    }

    const [paySpot, receiveSpot, kasSpot] = await Promise.all([
        resolveStrictSpotPriceUsd(payAsset),
        resolveStrictSpotPriceUsd(receiveAsset),
        resolveStrictSpotPriceUsd('KAS')
    ]);
    if (paySpot <= 0 || receiveSpot <= 0) {
        return json(
            {
                success: false,
                error: `ORACLE_HALT: Live oracle spot price for ${paySpot <= 0 ? payAsset : receiveAsset} is offline.`
            },
            { status: 503 }
        );
    }

    const grossUsd = amount * paySpot;
    const feeTier = await resolveUserSwapFeeTier(
        cleanWallet,
        prefixedWallet,
        grossUsd
    );
    const gasAndSlip = estimateOnChainGasAndRoutingSlippageUsd(
        payAsset,
        receiveAsset,
        grossUsd,
        !steering.allowDarkPoolInternalClearing
    );
    const hardFloorProtocolFeeUsd = Math.max(
        0.01,
        grossUsd * HARD_PROFIT_FLOOR_RATE
    );
    const protocolMarginUsd = Math.max(
        hardFloorProtocolFeeUsd,
        grossUsd * feeTier.feeRate
    );
    const totalFeeUsd = gasAndSlip.totalHardRoutingCostUsd + protocolMarginUsd;
    const netUsd = Math.max(0, grossUsd - totalFeeUsd);
    const estimatedOutput = receiveSpot > 0 ? netUsd / receiveSpot : 0;

    const pairLabel =
        payAsset === 'KAS'
            ? `KAS/${receiveAsset}`
            : receiveAsset === 'KAS'
              ? `KAS/${payAsset}`
              : `${payAsset}/${receiveAsset}`;

    const waterfall = await computeDynamicHurdleWaterfallSplit({
        poolPair: pairLabel,
        grossUsd,
        totalProtocolFeeUsd: protocolMarginUsd,
        kasSpotUsd: kasSpot > 0 ? kasSpot : 0.15
    });

    const bucketThreshold = await fetchChangeNowMinAmountKas(
        receiveAsset,
        kasSpot > 0 ? kasSpot : 0.15
    );

    return json({
        success: true,
        payAsset,
        receiveAsset,
        amount,
        paySpotUsd: paySpot,
        receiveSpotUsd: receiveSpot,
        grossUsd: Number(grossUsd.toFixed(2)),
        networkGasUsd: gasAndSlip.networkGasUsd,
        externalRoutingSlippageUsd: gasAndSlip.externalRoutingSlippageUsd,
        protocolMarginUsd: Number(protocolMarginUsd.toFixed(4)),
        feeRate: feeTier.feeRate,
        feeRatePct: Number((feeTier.feeRate * 100).toFixed(2)),
        feeTierLabel: feeTier.feeTierLabel,
        wholesaleFloorActive: feeTier.wholesaleFloorActive,
        feeUsd: Number(totalFeeUsd.toFixed(4)),
        netUsd: Number(netUsd.toFixed(4)),
        estimatedOutput: Number(estimatedOutput.toFixed(8)),
        tokenSteering: {
            payState: steering.payState,
            receiveState: steering.receiveState,
            allowDarkPoolInternalClearing:
                steering.allowDarkPoolInternalClearing,
            feeLegs: steering.feeLegs,
            explanation: steering.steeringExplanation
        },
        dynamicHurdleWaterfall: {
            ...waterfall,
            competitorAmmAprPct: COMPETITOR_STANDARD_AMM_APR_PCT
        },
        minProfitableKas: bucketThreshold.minProfitableKas,
        minProfitableUsd: bucketThreshold.minProfitableUsd
    });
};

export const POST: RequestHandler = async ({
    request,
    cookies,
    locals
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
        const body = await request.json().catch(() => ({}));
        const rawWallet = String(body.wallet || sessionWallet || '').trim();
        if (!rawWallet) {
            return json(
                {
                    error: 'Authentication required: Connect your Kaspa wallet.'
                },
                { status: 401 }
            );
        }
        const prefixedWallet = normalizeKaspaAddressStrict(rawWallet);
        const cleanWallet = normalizeKaspaBase32Strict(prefixedWallet);
        const payAsset = String(body.payAsset || body.pay_asset || 'KAS')
            .trim()
            .toUpperCase();
        const receiveAsset = String(
            body.receiveAsset || body.receive_asset || 'USDC'
        )
            .trim()
            .toUpperCase();
        const amount = Number(body.amount || 0);
        if (
            !cleanWallet ||
            !Number.isFinite(amount) ||
            amount <= 0 ||
            payAsset === receiveAsset
        ) {
            return json(
                {
                    error: 'Invalid swap parameters: amount must be > 0 and assets must differ.'
                },
                { status: 400 }
            );
        }

        // 1. Check 5-State Token Steering Matrix & Security Firewall Edge
        const steering = await resolveTokenSteeringDecision(
            payAsset,
            receiveAsset,
            cleanWallet,
            prefixedWallet
        );
        if (!steering.allowed) {
            return json({ error: steering.rejectReason }, { status: 403 });
        }

        // 2. Check Independent Subsystem Kill-Switches
        const killSwitches = await resolveSubsystemKillSwitches();
        if (
            !steering.allowDarkPoolInternalClearing &&
            killSwitches.externalDexPaused
        ) {
            return json(
                {
                    error: 'SUBSYSTEM_PAUSED: External DEX pass-through routing is currently paused by Director kill-switch.'
                },
                { status: 503 }
            );
        }
        if (
            steering.allowDarkPoolInternalClearing &&
            killSwitches.darkPoolPaused &&
            killSwitches.externalDexPaused
        ) {
            return json(
                {
                    error: 'SUBSYSTEM_PAUSED: Both Dark Pool Internal Clearing and External DEX Routing are paused by Director kill-switches.'
                },
                { status: 503 }
            );
        }

        // 3. Primary Execution via Bare-Metal Rust SOR Engine (/v1/sor/execute) when Dark Pool is active
        const rustBackendUrl = resolveRustBackendUrl();
        if (!killSwitches.darkPoolPaused) {
            try {
                const rustRes = await fetch(
                    `${rustBackendUrl}/v1/sor/execute`,
                    {
                        method: 'POST',
                        headers: buildInternalAuthHeaders(),
                        body: JSON.stringify({
                            wallet: prefixedWallet,
                            payAsset,
                            receiveAsset,
                            amount,
                            slippageTolerance:
                                body.slippageTolerance ??
                                body.slippage_tolerance ??
                                0.5,
                            utxos: Array.isArray(body.utxos)
                                ? body.utxos
                                : undefined,
                            systemMode:
                                body.systemMode ?? body.system_mode ?? 'base'
                        }),
                        signal: AbortSignal.timeout(9000)
                    }
                );
                const rustData = await rustRes.json().catch(() => ({}));
                if (rustRes.ok && rustData?.success) {
                    return json({
                        ...rustData,
                        tokenSteering: {
                            payState: steering.payState,
                            receiveState: steering.receiveState,
                            allowDarkPoolInternalClearing:
                                steering.allowDarkPoolInternalClearing,
                            feeLegs: steering.feeLegs,
                            explanation: steering.steeringExplanation
                        }
                    });
                }
                if (
                    rustRes.status === 400 ||
                    rustRes.status === 403 ||
                    rustRes.status === 422 ||
                    rustRes.status === 503
                ) {
                    return json(
                        {
                            error:
                                rustData.error ||
                                'Swap rejected by Smart Order Router.'
                        },
                        { status: rustRes.status }
                    );
                }
            } catch (rustBridgeErr) {
                console.warn(
                    '⚠️ [SOR BRIDGE NOTICE]: Rust /v1/sor/execute unreachable; executing verified database ledger fallback:',
                    rustBridgeErr
                );
            }
        }

        const [paySpot, receiveSpot, kasSpot] = await Promise.all([
            resolveStrictSpotPriceUsd(payAsset),
            resolveStrictSpotPriceUsd(receiveAsset),
            resolveStrictSpotPriceUsd('KAS')
        ]);
        if (paySpot <= 0 || receiveSpot <= 0) {
            return json(
                {
                    error: `ORACLE_HALT: Live oracle spot price for ${paySpot <= 0 ? payAsset : receiveAsset} is offline. Failing closed (503).`
                },
                { status: 503 }
            );
        }

        const grossUsd = amount * paySpot;
        if (grossUsd < 1.0) {
            return json(
                {
                    error: `ANTI_DUST_FLOOR: Minimum swap value is $1.00 USD (submitted $${grossUsd.toFixed(2)} USD).`
                },
                { status: 400 }
            );
        }

        const feeTier = await resolveUserSwapFeeTier(
            cleanWallet,
            prefixedWallet,
            grossUsd
        );
        const isExternalRoute =
            !steering.allowDarkPoolInternalClearing ||
            killSwitches.darkPoolPaused;
        const gasAndSlip = estimateOnChainGasAndRoutingSlippageUsd(
            payAsset,
            receiveAsset,
            grossUsd,
            isExternalRoute
        );
        const hardFloorProtocolUsd = Math.max(
            0.01,
            grossUsd * HARD_PROFIT_FLOOR_RATE
        );
        const protocolMarginUsd = Math.max(
            hardFloorProtocolUsd,
            grossUsd * feeTier.feeRate
        );
        const feeUsd = gasAndSlip.totalHardRoutingCostUsd + protocolMarginUsd;
        const netUsd = Math.max(0, grossUsd - feeUsd);

        if (netUsd <= 0) {
            return json(
                {
                    error: 'ZERO_LOSS_INVARIANT_VIOLATION: Net swap value after gas, slippage, and protocol fee must be > $0.00.'
                },
                { status: 422 }
            );
        }

        const estimatedOutput = Number((netUsd / receiveSpot).toFixed(8));
        const unifiedRate = amount > 0 ? estimatedOutput / amount : 0;
        const txUuid = `PER-SOR-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

        const pairLabel =
            payAsset === 'KAS'
                ? `KAS/${receiveAsset}`
                : receiveAsset === 'KAS'
                  ? `KAS/${payAsset}`
                  : `${payAsset}/${receiveAsset}`;

        const waterfall = await computeDynamicHurdleWaterfallSplit({
            poolPair: pairLabel,
            grossUsd,
            totalProtocolFeeUsd: protocolMarginUsd,
            kasSpotUsd: kasSpot > 0 ? kasSpot : 0.15
        });

        const client = await dbPool.connect();
        try {
            const resRow = await client.query(
                `SELECT wallet_address, streaming_balance_kas, total_yield_kas,
                        COALESCE(lp_tokens, '{}'::jsonb) AS lp_tokens,
                        COALESCE(quarantined, FALSE) AS quarantined
                 FROM yield_reservoirs
                 WHERE wallet_address = $1 OR wallet_address = $2
                 LIMIT 1`,
                [prefixedWallet, cleanWallet]
            );
            const row = resRow.rows[0];
            if (row?.quarantined) {
                return json(
                    { error: `Wallet ${prefixedWallet} is quarantined.` },
                    { status: 403 }
                );
            }
            const ledgerKey = `dev:sor:treasury:balances:${cleanWallet}`;
            const redisPayBalStr = await redis
                .hget(ledgerKey, payAsset)
                .catch(() => null);
            const redisPayBal = redisPayBalStr ? parseFloat(redisPayBalStr) : 0;
            let streamKas = Number(row?.streaming_balance_kas || 0);
            const totalYieldKas = Number(row?.total_yield_kas || 0);
            const lpTokens: Record<string, number> = {
                ...(row?.lp_tokens || {})
            };
            const dbPayBal =
                payAsset === 'KAS'
                    ? streamKas
                    : Number(lpTokens[payAsset] || 0);
            const availablePayBal = Math.max(redisPayBal, dbPayBal);
            if (availablePayBal + 1e-8 < amount) {
                return json(
                    {
                        error: `INSUFFICIENT_BALANCE: Requested ${amount.toFixed(4)} ${payAsset}, available ${availablePayBal.toFixed(4)} ${payAsset}.`
                    },
                    { status: 422 }
                );
            }
            if (payAsset === 'KAS') {
                streamKas = Math.max(0, streamKas - amount);
            } else {
                lpTokens[payAsset] = Math.max(
                    0,
                    Number(lpTokens[payAsset] || 0) - amount
                );
            }
            if (receiveAsset === 'KAS') {
                streamKas += estimatedOutput;
            } else {
                lpTokens[receiveAsset] =
                    Number(lpTokens[receiveAsset] || 0) + estimatedOutput;
            }
            const targetPk = row?.wallet_address || prefixedWallet;
            const newHmac = computeReservoirHmac(
                prefixedWallet,
                streamKas,
                totalYieldKas,
                lpTokens
            );
            await client.query(
                `INSERT INTO yield_reservoirs (
                    wallet_address, streaming_balance_kas, total_yield_kas,
                    lp_tokens, row_hmac_sig, last_updated
                ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                ON CONFLICT (wallet_address) DO UPDATE SET
                    streaming_balance_kas = EXCLUDED.streaming_balance_kas,
                    lp_tokens = EXCLUDED.lp_tokens,
                    row_hmac_sig = EXCLUDED.row_hmac_sig,
                    last_updated = CURRENT_TIMESTAMP`,
                [
                    targetPk,
                    streamKas,
                    totalYieldKas,
                    JSON.stringify(lpTokens),
                    newHmac
                ]
            );
            await redis
                .hset(
                    ledgerKey,
                    payAsset,
                    String(Math.max(0, availablePayBal - amount))
                )
                .catch(() => {});
            await redis
                .hincrbyfloat(ledgerKey, receiveAsset, estimatedOutput)
                .catch(() => {});
            await client
                .query(
                    `INSERT INTO hifo_tax_lots (
                        wallet_address, asset_ticker, kas_sompi, initial_tokens,
                        remaining_sompi, remaining_tokens, fmv_usd_per_token,
                        total_cost_basis_usd, source_event_type, source_tx_hash, status
                    ) VALUES ($1, $2, $3, $4, $3, $4, $5, $6, 'DEX_SWAP', $7, 'OPEN')`,
                    [
                        cleanWallet,
                        receiveAsset,
                        Math.round(estimatedOutput * 1e8),
                        estimatedOutput,
                        receiveSpot,
                        netUsd,
                        txUuid
                    ]
                )
                .catch(() => {});
            await client
                .query(
                    `INSERT INTO tax_ledger_events (
                        wallet_address, asset_ticker, event_type, gross_proceeds_usd,
                        amount_tokens, spot_price_at_execution, tx_hash,
                        cost_basis_usd, realized_gain_loss_usd, holding_period
                    ) VALUES ($1, $2, 'DEX_SWAP', $3, $4, $5, $6, $3, 0.0, 'SHORT_TERM')`,
                    [cleanWallet, payAsset, grossUsd, amount, paySpot, txUuid]
                )
                .catch(() => {});

            // Record LP fee distribution in yield_distributions
            await client
                .query(
                    `INSERT INTO yield_distributions (pool_pair, total_fees_distributed_usd)
                     VALUES ($1, $2)`,
                    [pairLabel, waterfall.lpAllocatedFeeUsd]
                )
                .catch(() => {});

            // Skim Perennia's treasury fee strictly in verified Reserve Whitelist asset(s) per 5-State Steering Matrix
            for (const leg of steering.feeLegs) {
                const legUsd = waterfall.perenniaTotalCutUsd * leg.shareRatio;
                const legSpot =
                    leg.asset === payAsset
                        ? paySpot
                        : leg.asset === receiveAsset
                          ? receiveSpot
                          : leg.asset === 'KAS'
                            ? kasSpot
                            : await resolveStrictSpotPriceUsd(leg.asset);
                const legTokens =
                    legSpot > 0 ? Number((legUsd / legSpot).toFixed(8)) : legUsd;
                await redis
                    .incrbyfloat(
                        `perennia:fees:batch_accumulated:${leg.asset}`,
                        legTokens
                    )
                    .catch(() => {});
            }

            // Internal Treasury 60/40 Reserve Split in fiat_float_ledger
            await client
                .query(
                    `UPDATE fiat_float_ledger
                     SET dark_pool_lp_vault_usd = dark_pool_lp_vault_usd + $1,
                         master_treasury_usdc_reserve = COALESCE(master_treasury_usdc_reserve, 0.0) + $2,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE ledger_id IN ('PRIMARY_FLOAT', 'BOOTSTRAP_PRIMARY')`,
                    [
                        waterfall.perenniaLpCompound60Usd,
                        waterfall.perenniaLiquidReserve40Usd
                    ]
                )
                .catch(() => {});

            await redis
                .incrbyfloat(
                    'perennia:treasury:netting_profit_usd',
                    waterfall.perenniaTotalCutUsd
                )
                .catch(() => {});
            await redis
                .incrbyfloat(
                    `perennia:lp:pending_yield_usd:${pairLabel}`,
                    waterfall.lpAllocatedFeeUsd
                )
                .catch(() => {});
        } finally {
            client.release();
        }

        const anchorKasVolume =
            payAsset === 'KAS'
                ? amount
                : kasSpot > 0
                  ? grossUsd / kasSpot
                  : 0;
        const anchorLayerSweep = await sweepLayeredBucketsOnAnchorSwap({
            targetAsset: receiveAsset,
            anchorKasVolume,
            kasSpotUsd: kasSpot > 0 ? kasSpot : 0.15,
            targetSpotUsd: receiveSpot
        });

        const providerLabel = isExternalRoute
            ? 'External Pass-Through Pool (Reserve Whitelist Fee Skim)'
            : 'Perennia 50%-KAS Liquidity Plant + Anchor Sweep';

        return json({
            success: true,
            transaction_uuid: txUuid,
            unifiedRate,
            unified_rate: unifiedRate,
            estimatedOutput,
            estimated_output: estimatedOutput,
            feeRate: feeTier.feeRate,
            fee_rate: feeTier.feeRate,
            feeTierLabel: feeTier.feeTierLabel,
            feeUsd,
            fee_usd: feeUsd,
            networkGasUsd: gasAndSlip.networkGasUsd,
            externalRoutingSlippageUsd: gasAndSlip.externalRoutingSlippageUsd,
            tokenSteering: {
                payState: steering.payState,
                receiveState: steering.receiveState,
                allowDarkPoolInternalClearing:
                    steering.allowDarkPoolInternalClearing,
                feeLegs: steering.feeLegs,
                explanation: steering.steeringExplanation
            },
            dynamicHurdleWaterfall: {
                ...waterfall,
                competitorAmmAprPct: COMPETITOR_STANDARD_AMM_APR_PCT
            },
            anchorLayerSweep,
            legs: [
                {
                    tier: 1,
                    provider: providerLabel,
                    filledAmount: amount,
                    executionRate: unifiedRate,
                    marginCaptured: feeUsd
                }
            ],
            psbt: null,
            formattedUtxos: []
        });
    } catch (err: any) {
        console.error('🚨 [SOR SWAP ROUTE ERROR]:', err);
        return json(
            { error: err?.message || 'Failed to execute SOR swap.' },
            { status: 500 }
        );
    }
};