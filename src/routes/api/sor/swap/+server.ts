import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { dbPool } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import {
    normalizeKaspaAddressStrict,
    normalizeKaspaBase32Strict
} from '$lib/server/kms';
import {
    atomicDecimalsForSorAsset,
    resolveDefaultTargetNetworkForAsset
} from '$lib/server/sor';
import {
    isSyntheticRwaAsset,
    prepareAnyToAnyInboundLeg,
    prewarmSorSpotCache,
    resolveOffHoursAwareSpotUsd
} from '$lib/server/anyToAnyRouter';
import {
    BPS_SCALE,
    KAS_DECIMALS,
    LIVE_PRICING_UNAVAILABLE_MESSAGE,
    ORACLE_E8_DECIMALS,
    ORACLE_USD_E8_SCALE,
    USD_MICROS_DECIMALS,
    USD_MICROS_SCALE,
    atomicToUsdMicrosCeil,
    atomicToUsdMicrosFloor,
    ceilDivBigInt,
    formatAtomicToDecimal,
    mulBpsCeil,
    parseDecimalToAtomic,
    parseU128Str,
    toU128Str,
    type PsktPayload,
    type SorExecuteResponseV1,
    type SorRouteType,
    type U128Str
} from '$lib/crypto/atomicMath';

const ALLOWED_LP_FEE_TIERS_BPS = new Set<bigint>([30n, 100n, 250n]);
const VALID_ROUTE_TYPES = new Set<SorRouteType>([
    'L1_COW_ATOMIC_PSKT',
    'CROSS_CHAIN_OPSHA256_HTLC',
    'TIER3_CHANGENOW_SPLIT_PSKT',
    'CROSS_CHAIN_DEPOSIT_INTENT'
]);

interface LpPairAtomicSplit {
    amountInAtomic: bigint;
    feeTierBps: bigint;
    totalFeeAtomic: bigint;
    lpFeeAtomic: bigint;
    treasuryFeeAtomic: bigint;
    netOutAtomic: bigint;
}

interface ProtocolAtomicSplit {
    amountInAtomic: bigint;
    feeBps: bigint;
    treasuryFeeAtomic: bigint;
    netOutAtomic: bigint;
}

function computeLpPairAtomicSplit(
    amountInAtomic: bigint,
    feeTierBps: bigint
): LpPairAtomicSplit {
    if (!ALLOWED_LP_FEE_TIERS_BPS.has(feeTierBps)) {
        throw new Error(`INVALID_LP_FEE_TIER: Expected 30, 100, or 250 bps; got ${feeTierBps}.`);
    }
    if (amountInAtomic <= 0n) {
        throw new Error('ZERO_LOSS_INVARIANT_VIOLATION: amountInAtomic must be > 0.');
    }
    const totalFeeAtomic = ceilDivBigInt(amountInAtomic * feeTierBps, BPS_SCALE);
    const netOutAtomic = amountInAtomic - totalFeeAtomic;
    if (netOutAtomic <= 0n) {
        throw new Error('ZERO_LOSS_INVARIANT_VIOLATION: netOutAtomic after fee is <= 0.');
    }
    const lpFeeAtomic = (totalFeeAtomic * 80n) / 100n;
    const treasuryFeeAtomic = totalFeeAtomic - lpFeeAtomic;
    if (netOutAtomic + lpFeeAtomic + treasuryFeeAtomic !== amountInAtomic) {
        throw new Error('ZERO_LOSS_INVARIANT_VIOLATION: LP pair atomic split conservation failed.');
    }
    return {
        amountInAtomic,
        feeTierBps,
        totalFeeAtomic,
        lpFeeAtomic,
        treasuryFeeAtomic,
        netOutAtomic
    };
}

function computeProtocolAtomicSplit(
    amountInAtomic: bigint,
    feeBps: bigint
): ProtocolAtomicSplit {
    if (amountInAtomic <= 0n) {
        throw new Error('ZERO_LOSS_INVARIANT_VIOLATION: amountInAtomic must be > 0.');
    }
    const treasuryFeeAtomic = ceilDivBigInt(amountInAtomic * feeBps, BPS_SCALE);
    const netOutAtomic = amountInAtomic - treasuryFeeAtomic;
    if (netOutAtomic <= 0n) {
        throw new Error('ZERO_LOSS_INVARIANT_VIOLATION: netOutAtomic after fee is <= 0.');
    }
    if (netOutAtomic + treasuryFeeAtomic !== amountInAtomic) {
        throw new Error('ZERO_LOSS_INVARIANT_VIOLATION: Protocol atomic split conservation failed.');
    }
    return {
        amountInAtomic,
        feeBps,
        treasuryFeeAtomic,
        netOutAtomic
    };
}

function resolveValidatedMasterTreasuryAddress():
    | { ok: true; address: string }
    | { ok: false; error: string } {
    const raw = String(
        env.MASTER_TREASURY_ADDRESS ||
            env.PERENNIA_MASTER_TREASURY_KAS ||
            env.MASTER_ADMIN_ADDRESS ||
            ''
    )
        .trim()
        .toLowerCase();
    if (!raw) {
        if (String(env.REQUIRE_MASTER_TREASURY_ADDRESS || '').toLowerCase() === 'true') {
            return {
                ok: false,
                error: 'CONFIG_HALT: MASTER_TREASURY_ADDRESS is not configured for sovereign revenue routing (503).'
            };
        }
        return { ok: true, address: '' };
    }
    const prefixed = raw.startsWith('kaspa:') ? raw : `kaspa:${raw}`;
    if (prefixed.length < 61) {
        return {
            ok: false,
            error: 'CONFIG_HALT: MASTER_TREASURY_ADDRESS is invalid for sovereign revenue routing (503).'
        };
    }
    const hot = String(env.PERENNIA_HOT_KAS_ADDRESS || '').trim().toLowerCase();
    if (hot && prefixed === (hot.startsWith('kaspa:') ? hot : `kaspa:${hot}`)) {
        return {
            ok: false,
            error: 'TREASURY_ISOLATION_HALT: MASTER_TREASURY_ADDRESS collides with Stratum hot payout wallet.'
        };
    }
    return { ok: true, address: prefixed };
}

function resolveSorBackendBaseUrl(): string {
    const explicit = String(env.RUST_BACKEND_URL || '').trim();
    if (explicit) return explicit.replace(/\/+$/, '');
    const nodeIp = String(env.UBUNTU_NODE_IP || '').trim();
    if (nodeIp) return `http://${nodeIp}:8002`;
    return '';
}

function resolveSorInternalBearerToken(): string {
    return String(env.INTERNAL_ADMIN_TOKEN || env.PERENNIA_ADMIN_KEY || '')
        .trim()
        .replace(/^['"]|['"]$/g, '');
}

const HARD_PROFIT_FLOOR_BPS = 10;
const BUY_KAS_INBOUND_FEE_BPS = 20;
const WHOLESALE_LOYAL_MINER_FEE_BPS = 25;
const SHIELD_STAKER_FEE_BPS = 35;
const DARK_POOL_MAJOR_SWAP_FEE_BPS = 50;
const PUBLIC_MAX_SWAP_FEE_BPS = 85;
const EXTERNAL_ROUTING_SLIPPAGE_BPS = 15;
const MINIMUM_SWAP_USD_MICROS = 1_000_000n;
const MIN_HARD_PROFIT_FLOOR_USD_MICROS = 10_000n;
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

function livePricingUnavailableResponse(status = 503) {
    return json(
        {
            success: false,
            livePricingUnavailable: true,
            uiMessage: LIVE_PRICING_UNAVAILABLE_MESSAGE,
            error: LIVE_PRICING_UNAVAILABLE_MESSAGE,
            message: LIVE_PRICING_UNAVAILABLE_MESSAGE
        },
        { status }
    );
}

function estimateOnChainGasAndRoutingSlippageMicros(
    payAsset: string,
    receiveAsset: string,
    grossUsdMicros: bigint,
    isExternalPassThrough: boolean
): {
    networkGasUsdMicros: bigint;
    externalRoutingSlippageUsdMicros: bigint;
    totalHardRoutingCostUsdMicros: bigint;
} {
    const payClean = payAsset.trim().toUpperCase();
    const recClean = receiveAsset.trim().toUpperCase();
    const gasMicrosForAsset = (ticker: string): bigint => {
        if (
            ticker === 'KAS' ||
            ticker === 'SILO' ||
            ticker === 'NACHO' ||
            ticker === 'BEDRCK' ||
            ticker === 'PERX'
        ) {
            return 2_000n;
        }
        if (ticker === 'BTC') return 650_000n;
        if (ticker === 'ETH' || ticker === 'USDC' || ticker === 'USDT' || ticker === 'XAU') {
            return 250_000n;
        }
        if (
            ticker === 'SOL' ||
            ticker === 'ARB' ||
            ticker === 'BASE' ||
            ticker === 'POL' ||
            ticker === 'AVAX' ||
            ticker === 'SUI'
        ) {
            return 20_000n;
        }
        return 80_000n;
    };
    const rawModeledGasMicros = gasMicrosForAsset(payClean) + gasMicrosForAsset(recClean);
    let networkGasUsdMicros = rawModeledGasMicros;
    if (!isExternalPassThrough && grossUsdMicros > 0n && grossUsdMicros < 25_000_000n) {
        const capped = mulBpsCeil(grossUsdMicros, 100);
        const clamped = capped > 2_000n ? capped : 2_000n;
        networkGasUsdMicros = rawModeledGasMicros < clamped ? rawModeledGasMicros : clamped;
    }
    const externalRoutingSlippageUsdMicros = isExternalPassThrough
        ? mulBpsCeil(grossUsdMicros, EXTERNAL_ROUTING_SLIPPAGE_BPS)
        : 0n;
    return {
        networkGasUsdMicros,
        externalRoutingSlippageUsdMicros,
        totalHardRoutingCostUsdMicros: networkGasUsdMicros + externalRoutingSlippageUsdMicros
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
                ? redis.sismember('perennia:firewall:blacklisted_wallets', cleanWallet)
                : Promise.resolve(0),
            prefixedWallet
                ? redis.sismember('perennia:firewall:blacklisted_wallets', prefixedWallet)
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
                rejectReason: `FIREWALL_BLACKLISTED_TOKEN: ${badTicker} is flagged as a blacklisted token and rejected at the API edge.`,
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

        const payWhitelisted = whitelistSet.has(pTick) && payState !== 'PASS_THROUGH';
        const receiveWhitelisted = whitelistSet.has(rTick) && receiveState !== 'PASS_THROUGH';
        const allowDarkPoolInternalClearing =
            payState !== 'PASS_THROUGH' && receiveState !== 'PASS_THROUGH';
        const requiresHopViaKasOrUsdc = !payWhitelisted && !receiveWhitelisted;

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

        const payEligibleForFee = payWhitelisted && payState !== 'FREEZE';
        const recEligibleForFee = receiveWhitelisted && receiveState !== 'FREEZE';

        if (payEligibleForFee && recEligibleForFee) {
            const pTarget = parseDecimalToAtomic(rawTargetWeights?.[pTick] || '15', 2, 'floor');
            const pActual = parseDecimalToAtomic(rawActualWeights?.[pTick] || '15', 2, 'floor');
            const rTarget = parseDecimalToAtomic(rawTargetWeights?.[rTick] || '15', 2, 'floor');
            const rActual = parseDecimalToAtomic(rawActualWeights?.[rTick] || '15', 2, 'floor');
            const pDeficit = pTarget - pActual;
            const rDeficit = rTarget - rActual;
            const diff = pDeficit > rDeficit ? pDeficit - rDeficit : rDeficit - pDeficit;

            if (diff <= 50n) {
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
                    steeringExplanation: `AUTO_BALANCE: 50/50 fee split in ${pTick} & ${rTick}`
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
                steeringExplanation: `AUTO_BALANCE: 100% fee skimmed in ${underweightAsset}`
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

        const fallbackHopAsset = pTick === 'KAS' || rTick === 'KAS' ? 'KAS' : 'USDC';
        return {
            allowed: true,
            payState,
            receiveState,
            payWhitelisted,
            receiveWhitelisted,
            allowDarkPoolInternalClearing,
            requiresHopViaKasOrUsdc: true,
            feeLegs: [{ asset: fallbackHopAsset, shareRatio: 1.0 }],
            steeringExplanation: `PASS_THROUGH hop: 100% fee skimmed in ${fallbackHopAsset}`
        };
    } catch {
        const payWhitelisted = DEFAULT_RESERVE_WHITELIST.has(pTick);
        const receiveWhitelisted = DEFAULT_RESERVE_WHITELIST.has(rTick);
        const feeAsset = payWhitelisted ? pTick : receiveWhitelisted ? rTick : 'USDC';
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

async function resolveStrictSpotPriceE8(ticker: string): Promise<bigint> {
    const clean = String(ticker || '').trim().toUpperCase();
    if (!clean) return 0n;
    if (clean === 'USD') return ORACLE_USD_E8_SCALE;

    if (clean === 'KAS') {
        const cachedKas = await redis.get('oracle:spot:KAS_USDC').catch(() => null);
        const hasPttl =
            typeof (redis as unknown as Record<string, unknown>).pttl === 'function';
        const kasPttl = hasPttl
            ? await (redis as unknown as { pttl: (k: string) => Promise<number> })
                  .pttl('oracle:spot:KAS_USDC')
                  .catch(() => -2)
            : cachedKas
              ? 1
              : -2;
        if (cachedKas && Number(kasPttl) > 0) {
            try {
                const e8 = parseDecimalToAtomic(cachedKas.trim(), ORACLE_E8_DECIMALS, 'floor');
                if (e8 > 0n) return e8;
            } catch {
                return 0n;
            }
        }
        return 0n;
    }

    const cached = await redis.get(`oracle:spot:${clean}_USDC`).catch(() => null);
    if (cached) {
        try {
            const e8 = parseDecimalToAtomic(cached.trim(), ORACLE_E8_DECIMALS, 'floor');
            if (e8 > 0n) return e8;
        } catch {
            // Fall through to DB check
        }
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
        if (dbRes.rows.length > 0 && dbRes.rows[0].price_usd !== null) {
            const e8 = parseDecimalToAtomic(
                String(dbRes.rows[0].price_usd),
                ORACLE_E8_DECIMALS,
                'floor'
            );
            if (e8 > 0n) {
                const display = formatAtomicToDecimal(e8, ORACLE_E8_DECIMALS);
                await redis.set(`oracle:spot:${clean}_USDC`, display, 'EX', 30).catch(() => {});
                return e8;
            }
        }
    } catch {
        // Fall through
    }

    if (clean === 'USDC' || clean === 'USDT') {
        const depegBreaker = await redis.get('oracle:depeg_breaker').catch(() => null);
        if (depegBreaker !== '1' && String(depegBreaker || '').toLowerCase() !== 'true') {
            return ORACLE_USD_E8_SCALE;
        }
        return 0n;
    }

    const extendedSpot = await resolveOffHoursAwareSpotUsd(clean).catch(() => 0);
    if (Number.isFinite(extendedSpot) && extendedSpot > 0) {
        try {
            return parseDecimalToAtomic(extendedSpot, ORACLE_E8_DECIMALS, 'floor');
        } catch {
            return 0n;
        }
    }
    return 0n;
}

async function fetchChangeNowMinAmountSompi(
    targetTicker: string,
    kasSpotE8: bigint
): Promise<{
    minProfitableSompi: bigint;
    minProfitableUsdMicros: bigint;
    minProfitableKas: number;
    minProfitableUsd: number;
}> {
    if (kasSpotE8 <= 0n) {
        return {
            minProfitableSompi: 0n,
            minProfitableUsdMicros: 0n,
            minProfitableKas: 0,
            minProfitableUsd: 0
        };
    }

    const clean = targetTicker.trim().toUpperCase();
    const roundUpTenthKas = (usdMicrosTarget: bigint): bigint => {
        const rawTenthKas = ceilDivBigInt(
            usdMicrosTarget * 10n * ORACLE_USD_E8_SCALE,
            kasSpotE8 * USD_MICROS_SCALE
        );
        return rawTenthKas * 10_000_000n;
    };

    if (clean === 'USD') {
        const minSompi = roundUpTenthKas(25_280_000n);
        const minUsdMicros = atomicToUsdMicrosCeil(minSompi, KAS_DECIMALS, kasSpotE8);
        return {
            minProfitableSompi: minSompi,
            minProfitableUsdMicros: minUsdMicros,
            minProfitableKas: Number(formatAtomicToDecimal(minSompi, KAS_DECIMALS, 1, false)),
            minProfitableUsd: Number(formatAtomicToDecimal(minUsdMicros, USD_MICROS_DECIMALS, 2, false))
        };
    }

    if (clean === 'SILO' || clean === 'NACHO' || clean === 'BEDRCK' || clean === 'PERX') {
        const minSompi = roundUpTenthKas(3_500_000n);
        const minUsdMicros = atomicToUsdMicrosCeil(minSompi, KAS_DECIMALS, kasSpotE8);
        return {
            minProfitableSompi: minSompi,
            minProfitableUsdMicros: minUsdMicros,
            minProfitableKas: Number(formatAtomicToDecimal(minSompi, KAS_DECIMALS, 1, false)),
            minProfitableUsd: Number(formatAtomicToDecimal(minUsdMicros, USD_MICROS_DECIMALS, 2, false))
        };
    }

    const cacheKey = `perennia:changenow:min_sompi:${clean}`;
    const cachedMinSompi = await redis.get(cacheKey).catch(() => null);
    if (cachedMinSompi) {
        try {
            const minSompi = parseU128Str(cachedMinSompi.trim(), 'minSompi');
            if (minSompi > 0n) {
                const minUsdMicros = atomicToUsdMicrosCeil(minSompi, KAS_DECIMALS, kasSpotE8);
                return {
                    minProfitableSompi: minSompi,
                    minProfitableUsdMicros: minUsdMicros,
                    minProfitableKas: Number(formatAtomicToDecimal(minSompi, KAS_DECIMALS, 1, false)),
                    minProfitableUsd: Number(
                        formatAtomicToDecimal(minUsdMicros, USD_MICROS_DECIMALS, 2, false)
                    )
                };
            }
        } catch {
            // Recompute below
        }
    }

    const minBridgeUsdMicros =
        clean === 'BTC'
            ? 22_000_000n
            : clean === 'ETH' ||
                clean === 'XAU' ||
                clean === 'XAG' ||
                clean === 'USTB' ||
                clean === 'USDT'
              ? 14_000_000n
              : clean === 'USDC' ||
                  clean === 'SOL' ||
                  clean === 'ARB' ||
                  clean === 'BASE' ||
                  clean === 'POL' ||
                  clean === 'AVAX'
                ? 6_500_000n
                : 8_500_000n;

    const totalFloorUsdMicros = ceilDivBigInt(minBridgeUsdMicros * 10_150n, BPS_SCALE) + 500_000n;
    const minSompi = roundUpTenthKas(totalFloorUsdMicros);
    const minUsdMicros = atomicToUsdMicrosCeil(minSompi, KAS_DECIMALS, kasSpotE8);
    await redis.set(cacheKey, minSompi.toString(), 'EX', 180).catch(() => {});

    return {
        minProfitableSompi: minSompi,
        minProfitableUsdMicros: minUsdMicros,
        minProfitableKas: Number(formatAtomicToDecimal(minSompi, KAS_DECIMALS, 1, false)),
        minProfitableUsd: Number(formatAtomicToDecimal(minUsdMicros, USD_MICROS_DECIMALS, 2, false))
    };
}

async function resolveUserSwapFeeTierBps(
    cleanWallet: string,
    prefixedWallet: string,
    grossUsdMicros: bigint,
    payAsset = 'KAS',
    receiveAsset = 'USDC'
): Promise<{
    feeBps: number;
    feeTierLabel: string;
    wholesaleFloorActive: boolean;
}> {
    if (cleanWallet) {
        const [loyaltyRaw, passRaw, graceShieldRaw] = await Promise.all([
            redis.get(`perennia:miner:loyalty:${cleanWallet}`).catch(() => null),
            redis.get(`perennia:subscription:pass:${cleanWallet}`).catch(() => null),
            redis.get('perennia:stratum:maintenance_grace_shield').catch(() => null)
        ]);
        if (loyaltyRaw) {
            try {
                const parsed = JSON.parse(loyaltyRaw);
                const weeks = Math.max(0, Math.floor(Number(parsed.consecutiveWeeks || 0)));
                const loyaltyBps =
                    weeks >= 10
                        ? HARD_PROFIT_FLOOR_BPS
                        : Math.max(
                              HARD_PROFIT_FLOOR_BPS,
                              WHOLESALE_LOYAL_MINER_FEE_BPS - Math.floor((weeks * 3) / 2)
                          );
                return {
                    feeBps: loyaltyBps,
                    feeTierLabel: `${(loyaltyBps / 100).toFixed(2)}% Active Stratum Miner Wholesale Tier (${weeks}w Streak)`,
                    wholesaleFloorActive: true
                };
            } catch {
                return {
                    feeBps: HARD_PROFIT_FLOOR_BPS,
                    feeTierLabel: '0.10% Active Stratum Miner Wholesale Floor',
                    wholesaleFloorActive: true
                };
            }
        }
        if (passRaw) {
            return {
                feeBps: HARD_PROFIT_FLOOR_BPS,
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
                    feeBps: HARD_PROFIT_FLOOR_BPS,
                    feeTierLabel: '0.10% Active Stratum Miner Wholesale Floor',
                    wholesaleFloorActive: true
                };
            }
        } catch {
            // Continue
        }
    }

    const payUp = String(payAsset || 'KAS').trim().toUpperCase();
    const recUp = String(receiveAsset || 'USDC').trim().toUpperCase();

    if (recUp === 'KAS' && payUp !== 'USD') {
        return {
            feeBps: BUY_KAS_INBOUND_FEE_BPS,
            feeTierLabel: '0.20% Buy-KAS Inbound Tier',
            wholesaleFloorActive: true
        };
    }

    if (grossUsdMicros >= 2_500_000_000n) {
        return {
            feeBps: WHOLESALE_LOYAL_MINER_FEE_BPS,
            feeTierLabel: '0.25% Volume Wholesale Tier ($2,500+)',
            wholesaleFloorActive: true
        };
    }

    let isDarkPoolMajor =
        DEFAULT_RESERVE_WHITELIST.has(payUp) && DEFAULT_RESERVE_WHITELIST.has(recUp);
    if (isDarkPoolMajor) {
        try {
            const stRes = await dbPool.query(
                `SELECT steering_state, is_whitelisted FROM token_steering_matrix WHERE ticker = ANY($1::text[])`,
                [[payUp, recUp]]
            );
            for (const row of stRes.rows) {
                if (
                    !row.is_whitelisted ||
                    row.steering_state === 'PASS_THROUGH' ||
                    row.steering_state === 'BLACKLISTED'
                ) {
                    isDarkPoolMajor = false;
                }
            }
        } catch {
            // Retain default major check
        }
    }

    if (isDarkPoolMajor) {
        return {
            feeBps: DARK_POOL_MAJOR_SWAP_FEE_BPS,
            feeTierLabel: '0.50% Dark Pool Major Swap Tier',
            wholesaleFloorActive: false
        };
    }

    return {
        feeBps: PUBLIC_MAX_SWAP_FEE_BPS,
        feeTierLabel: '0.85% External Pass-Through Swap Tier',
        wholesaleFloorActive: false
    };
}

async function computeDynamicHurdleWaterfallMicros(params: {
    poolPair: string;
    grossUsdMicros: bigint;
    totalProtocolFeeUsdMicros: bigint;
    kasSpotE8: bigint;
}) {
    const safeGross = params.grossUsdMicros > 0n ? params.grossUsdMicros : 0n;
    const totalFee =
        params.totalProtocolFeeUsdMicros > 0n ? params.totalProtocolFeeUsdMicros : 0n;

    const floorFromGross = mulBpsCeil(safeGross, HARD_PROFIT_FLOOR_BPS);
    const desiredFloor =
        floorFromGross > MIN_HARD_PROFIT_FLOOR_USD_MICROS
            ? floorFromGross
            : MIN_HARD_PROFIT_FLOOR_USD_MICROS;
    const hardFloorPerenniaMicros = desiredFloor < totalFee ? desiredFloor : totalFee;
    const remainingMicros =
        totalFee > hardFloorPerenniaMicros ? totalFee - hardFloorPerenniaMicros : 0n;

    let pairTvlMicros = 0n;
    let rolling24hLpFeesMicros = 0n;
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
        const stakedKasRaw = String(lpRes.rows[0]?.total_kas || '0');
        const stakedSompi = parseDecimalToAtomic(stakedKasRaw, KAS_DECIMALS, 'floor');
        if (stakedSompi > 0n && params.kasSpotE8 > 0n) {
            const tvlMicros = atomicToUsdMicrosFloor(stakedSompi, KAS_DECIMALS, params.kasSpotE8) * 2n;
            pairTvlMicros = tvlMicros > 1_000_000_000n ? tvlMicros : 1_000_000_000n;
        }
        const feesRaw = String(distRes.rows[0]?.fees_24h || '0');
        rolling24hLpFeesMicros = parseDecimalToAtomic(feesRaw, USD_MICROS_DECIMALS, 'floor');
    } catch {
        // Retain conservative baseline TVL
    }

    const dailyHurdleTargetMicros = (pairTvlMicros * 1460n) / (BPS_SCALE * 365n);
    const dailyHurdleMinMicros = (pairTvlMicros * 1420n) / (BPS_SCALE * 365n);

    let lpShareBps = 4444n;
    let surplusVolumeSweepActive = false;
    if (rolling24hLpFeesMicros >= dailyHurdleTargetMicros) {
        lpShareBps = 2000n;
        surplusVolumeSweepActive = true;
    } else if (rolling24hLpFeesMicros < dailyHurdleMinMicros) {
        lpShareBps = 4500n;
    }

    const lpAllocatedFeeMicros = (remainingMicros * lpShareBps) / BPS_SCALE;
    const diffAfterLp = totalFee > lpAllocatedFeeMicros ? totalFee - lpAllocatedFeeMicros : 0n;
    const perenniaTotalCutMicros =
        hardFloorPerenniaMicros > diffAfterLp ? hardFloorPerenniaMicros : diffAfterLp;
    const perenniaLpCompound60Micros = (perenniaTotalCutMicros * 6000n) / BPS_SCALE;
    const perenniaLiquidReserve40Micros =
        perenniaTotalCutMicros > perenniaLpCompound60Micros
            ? perenniaTotalCutMicros - perenniaLpCompound60Micros
            : 0n;

    const projectedBaseAprBps =
        pairTvlMicros > 0n
            ? ((rolling24hLpFeesMicros + lpAllocatedFeeMicros) * 365n * BPS_SCALE) / pairTvlMicros
            : 1440n;
    const clampedAprBps =
        projectedBaseAprBps < 1420n
            ? 1420n
            : projectedBaseAprBps > 2400n
              ? 2400n
              : projectedBaseAprBps;

    return {
        hardFloorPerenniaUsdMicros: hardFloorPerenniaMicros.toString(),
        lpAllocatedFeeUsdMicros: lpAllocatedFeeMicros.toString(),
        perenniaTotalCutUsdMicros: perenniaTotalCutMicros.toString(),
        perenniaLpCompound60UsdMicros: perenniaLpCompound60Micros.toString(),
        perenniaLiquidReserve40UsdMicros: perenniaLiquidReserve40Micros.toString(),
        hardFloorPerenniaUsd: Number(formatAtomicToDecimal(hardFloorPerenniaMicros, USD_MICROS_DECIMALS)),
        lpAllocatedFeeUsd: Number(formatAtomicToDecimal(lpAllocatedFeeMicros, USD_MICROS_DECIMALS)),
        perenniaTotalCutUsd: Number(formatAtomicToDecimal(perenniaTotalCutMicros, USD_MICROS_DECIMALS)),
        perenniaLpCompound60Usd: Number(
            formatAtomicToDecimal(perenniaLpCompound60Micros, USD_MICROS_DECIMALS)
        ),
        perenniaLiquidReserve40Usd: Number(
            formatAtomicToDecimal(perenniaLiquidReserve40Micros, USD_MICROS_DECIMALS)
        ),
        projectedBaseLpAprPct: Number(clampedAprBps) / 100,
        projectedMaxMultiplierAprPct: Number((clampedAprBps * 25n) / 10n) / 100,
        surplusVolumeSweepActive
    };
}

function parseIncomingAmountToAtomic(
    rawAmountAtomic: unknown,
    rawDecimalAmount: unknown,
    decimals: number
): bigint {
    if (rawAmountAtomic !== undefined && rawAmountAtomic !== null && rawAmountAtomic !== '') {
        return parseU128Str(rawAmountAtomic, 'amountAtomic');
    }
    if (typeof rawDecimalAmount === 'string' || typeof rawDecimalAmount === 'number') {
        return parseDecimalToAtomic(rawDecimalAmount, decimals, 'floor');
    }
    return 0n;
}

function parseSlippageBps(body: Record<string, unknown>): number {
    if (body.slippageBps !== undefined && body.slippageBps !== null) {
        const parsed = parseU128Str(body.slippageBps, 'slippageBps');
        if (parsed > 5000n) throw new RangeError('slippageBps must be <= 5000.');
        return Number(parsed);
    }
    const rawPct = body.slippagePct ?? body.slippageTolerance ?? body.slippage_tolerance;
    if (typeof rawPct === 'string' || typeof rawPct === 'number') {
        const bps = parseDecimalToAtomic(rawPct, 2, 'ceil');
        return Number(bps > 5000n ? 5000n : bps);
    }
    return 50;
}

export const GET: RequestHandler = async ({ url, cookies, locals }: RequestEvent) => {
    const sessionId = cookies.get('perennia_session');
    let sessionWallet =
        (locals as Record<string, any>)?.user?.address ||
        (locals as Record<string, any>).walletAddress ||
        '';
    if (!sessionWallet && sessionId) {
        sessionWallet = (await redis.get(`session:${sessionId}`).catch(() => null)) || '';
    }
    const cleanWallet = sessionWallet ? normalizeKaspaBase32Strict(sessionWallet) : '';
    const prefixedWallet = cleanWallet ? `kaspa:${cleanWallet}` : '';

    const payAsset = String(url.searchParams.get('payAsset') || 'KAS').trim().toUpperCase();
    const receiveAsset = String(url.searchParams.get('receiveAsset') || 'USDC').trim().toUpperCase();
    const payDecimals = atomicDecimalsForSorAsset(payAsset);
    const receiveDecimals = atomicDecimalsForSorAsset(receiveAsset);

    let amountInAtomic = 0n;
    try {
        amountInAtomic = parseIncomingAmountToAtomic(
            url.searchParams.get('amountAtomic'),
            url.searchParams.get('amount') ?? '100',
            payDecimals
        );
    } catch {
        return json({ success: false, error: 'Invalid quote amount.' }, { status: 400 });
    }

    const steering = await resolveTokenSteeringDecision(
        payAsset,
        receiveAsset,
        cleanWallet,
        prefixedWallet
    );
    if (!steering.allowed) {
        return json({ success: false, error: steering.rejectReason }, { status: 403 });
    }

    const [paySpotE8, receiveSpotE8, kasSpotE8] = await Promise.all([
        resolveStrictSpotPriceE8(payAsset),
        resolveStrictSpotPriceE8(receiveAsset),
        resolveStrictSpotPriceE8('KAS')
    ]);
    if (paySpotE8 <= 0n || receiveSpotE8 <= 0n || kasSpotE8 <= 0n) {
        return livePricingUnavailableResponse(503);
    }

    const grossUsdMicros = atomicToUsdMicrosFloor(amountInAtomic, payDecimals, paySpotE8);
    const feeTier = await resolveUserSwapFeeTierBps(
        cleanWallet,
        prefixedWallet,
        grossUsdMicros,
        payAsset,
        receiveAsset
    );
    const gasAndSlip = estimateOnChainGasAndRoutingSlippageMicros(
        payAsset,
        receiveAsset,
        grossUsdMicros,
        !steering.allowDarkPoolInternalClearing
    );

    const floorFromGrossMicros = mulBpsCeil(grossUsdMicros, HARD_PROFIT_FLOOR_BPS);
    const hardFloorProtocolMicros =
        floorFromGrossMicros > MIN_HARD_PROFIT_FLOOR_USD_MICROS
            ? floorFromGrossMicros
            : MIN_HARD_PROFIT_FLOOR_USD_MICROS;
    const tierFeeMicros = mulBpsCeil(grossUsdMicros, feeTier.feeBps);
    const protocolMarginUsdMicros =
        tierFeeMicros > hardFloorProtocolMicros ? tierFeeMicros : hardFloorProtocolMicros;
    const protocolFeeAtomic = mulBpsCeil(amountInAtomic, feeTier.feeBps);

    const totalFeeUsdMicros = gasAndSlip.totalHardRoutingCostUsdMicros + protocolMarginUsdMicros;
    const netUsdMicros = grossUsdMicros > totalFeeUsdMicros ? grossUsdMicros - totalFeeUsdMicros : 0n;
    const estimatedOutputAtomic =
        (netUsdMicros * (10n ** BigInt(receiveDecimals)) * ORACLE_USD_E8_SCALE) /
        (receiveSpotE8 * USD_MICROS_SCALE);

    const pairLabel =
        payAsset === 'KAS'
            ? `KAS/${receiveAsset}`
            : receiveAsset === 'KAS'
              ? `KAS/${payAsset}`
              : `${payAsset}/${receiveAsset}`;

    const waterfall = await computeDynamicHurdleWaterfallMicros({
        poolPair: pairLabel,
        grossUsdMicros,
        totalProtocolFeeUsdMicros: protocolMarginUsdMicros,
        kasSpotE8
    });
    const bucketThreshold = await fetchChangeNowMinAmountSompi(receiveAsset, kasSpotE8);

    return json({
        success: true,
        payAsset,
        receiveAsset,
        amountInAtomic: amountInAtomic.toString(),
        protocolFeeAtomic: protocolFeeAtomic.toString(),
        estimatedOutputAtomic: estimatedOutputAtomic.toString(),
        grossUsdMicros: grossUsdMicros.toString(),
        netUsdMicros: netUsdMicros.toString(),
        feeUsdMicros: totalFeeUsdMicros.toString(),
        payOracleUsdE8: paySpotE8.toString(),
        receiveOracleUsdE8: receiveSpotE8.toString(),
        kasOracleUsdE8: kasSpotE8.toString(),
        feeBps: feeTier.feeBps,
        feeTierLabel: feeTier.feeTierLabel,
        wholesaleFloorActive: feeTier.wholesaleFloorActive,
        minProfitableSompi: bucketThreshold.minProfitableSompi.toString(),
        minProfitableUsdMicros: bucketThreshold.minProfitableUsdMicros.toString(),
        tokenSteering: {
            payState: steering.payState,
            receiveState: steering.receiveState,
            allowDarkPoolInternalClearing: steering.allowDarkPoolInternalClearing,
            feeLegs: steering.feeLegs,
            explanation: steering.steeringExplanation
        },
        dynamicHurdleWaterfall: {
            ...waterfall,
            competitorAmmAprPct: COMPETITOR_STANDARD_AMM_APR_PCT
        },
        /* Render-boundary numeric projections derived from atomic fields above. */
        amount: Number(formatAtomicToDecimal(amountInAtomic, payDecimals)),
        paySpotUsd: Number(formatAtomicToDecimal(paySpotE8, ORACLE_E8_DECIMALS)),
        receiveSpotUsd: Number(formatAtomicToDecimal(receiveSpotE8, ORACLE_E8_DECIMALS)),
        grossUsd: Number(formatAtomicToDecimal(grossUsdMicros, USD_MICROS_DECIMALS, 2)),
        networkGasUsd: Number(
            formatAtomicToDecimal(gasAndSlip.networkGasUsdMicros, USD_MICROS_DECIMALS, 4)
        ),
        externalRoutingSlippageUsd: Number(
            formatAtomicToDecimal(
                gasAndSlip.externalRoutingSlippageUsdMicros,
                USD_MICROS_DECIMALS,
                4
            )
        ),
        protocolMarginUsd: Number(
            formatAtomicToDecimal(protocolMarginUsdMicros, USD_MICROS_DECIMALS, 4)
        ),
        feeRate: feeTier.feeBps / 10_000,
        feeRatePct: feeTier.feeBps / 100,
        feeUsd: Number(formatAtomicToDecimal(totalFeeUsdMicros, USD_MICROS_DECIMALS, 4)),
        netUsd: Number(formatAtomicToDecimal(netUsdMicros, USD_MICROS_DECIMALS, 4)),
        estimatedOutput: Number(
            formatAtomicToDecimal(estimatedOutputAtomic, receiveDecimals, Math.min(8, receiveDecimals))
        ),
        minProfitableKas: bucketThreshold.minProfitableKas,
        minProfitableUsd: bucketThreshold.minProfitableUsd
    });
};

export const POST: RequestHandler = async ({ request, cookies, locals }: RequestEvent) => {
    try {
        const sessionId = cookies.get('perennia_session');
        let sessionWallet =
            (locals as Record<string, any>)?.user?.address ||
            (locals as Record<string, any>).walletAddress ||
            '';
        if (!sessionWallet && sessionId) {
            sessionWallet = (await redis.get(`session:${sessionId}`).catch(() => null)) || '';
        }
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const rawWallet = String(body.wallet || sessionWallet || '').trim();
        if (!rawWallet) {
            return json(
                { error: 'Authentication required: Connect your Kaspa wallet.' },
                { status: 401 }
            );
        }
        const prefixedWallet = normalizeKaspaAddressStrict(rawWallet);
        const cleanWallet = normalizeKaspaBase32Strict(prefixedWallet);
        const payAsset = String(body.payAsset || body.pay_asset || 'KAS').trim().toUpperCase();
        const receiveAsset = String(body.receiveAsset || body.receive_asset || 'USDC')
            .trim()
            .toUpperCase();

        if (!cleanWallet || !payAsset || !receiveAsset || payAsset === receiveAsset) {
            return json(
                { error: 'Invalid swap parameters: wallet must be valid and assets must differ.' },
                { status: 400 }
            );
        }

        const payDecimals = atomicDecimalsForSorAsset(payAsset);
        let amountAtomic = 0n;
        let slippageBps = 50;
        try {
            amountAtomic = parseIncomingAmountToAtomic(
                body.amountAtomic,
                body.amount ?? body.payAmount,
                payDecimals
            );
            slippageBps = parseSlippageBps(body);
        } catch (parseErr: unknown) {
            return json(
                {
                    error:
                        parseErr instanceof Error ? parseErr.message : 'Invalid swap amount or slippage.'
                },
                { status: 400 }
            );
        }

        if (amountAtomic <= 0n) {
            return json(
                { error: 'Invalid swap parameters: amount must be greater than zero.' },
                { status: 400 }
            );
        }

        const steering = await resolveTokenSteeringDecision(
            payAsset,
            receiveAsset,
            cleanWallet,
            prefixedWallet
        );
        if (!steering.allowed) {
            return json({ error: steering.rejectReason }, { status: 403 });
        }

        const killSwitches = await resolveSubsystemKillSwitches();
        if (!steering.allowDarkPoolInternalClearing && killSwitches.externalDexPaused) {
            return livePricingUnavailableResponse(503);
        }
        if (
            steering.allowDarkPoolInternalClearing &&
            killSwitches.darkPoolPaused &&
            killSwitches.externalDexPaused
        ) {
            return livePricingUnavailableResponse(503);
        }

        const actionMode = String(body.action || '').trim().toUpperCase();
        const targetNetwork = String(
            body.targetNetwork || resolveDefaultTargetNetworkForAsset(receiveAsset)
        )
            .trim()
            .toUpperCase();
        const requestedDestinationAddress = String(
            body.destinationAddress || body.destination_address || ''
        ).trim();
        const refundKaspaAddress = String(
            body.refundKaspaAddress || body.refund_kaspa_address || prefixedWallet
        ).trim();

        if (actionMode === 'PREPARE_INBOUND' || body.prepareInbound === true) {
            await prewarmSorSpotCache([payAsset, receiveAsset, 'KAS'], async (t) => {
                const e8 = await resolveStrictSpotPriceE8(t);
                return e8 > 0n ? Number(formatAtomicToDecimal(e8, ORACLE_E8_DECIMALS)) : 0;
            });
            const [paySpotE8, receiveSpotE8] = await Promise.all([
                resolveStrictSpotPriceE8(payAsset),
                resolveStrictSpotPriceE8(receiveAsset)
            ]);
            if (paySpotE8 <= 0n || receiveSpotE8 <= 0n) {
                return livePricingUnavailableResponse(503);
            }
            const amountNum = Number(formatAtomicToDecimal(amountAtomic, payDecimals));
            const prep = await prepareAnyToAnyInboundLeg({
                cleanWallet,
                prefixedWallet,
                payAsset,
                receiveAsset,
                amount: amountNum,
                resolveSpotUsd: async (t) => {
                    const e8 = await resolveStrictSpotPriceE8(t);
                    return e8 > 0n ? Number(formatAtomicToDecimal(e8, ORACLE_E8_DECIMALS)) : 0;
                },
                deliveryMode: 'ONCHAIN_L1',
                destinationAddress: requestedDestinationAddress
            });
            return json(prep.payload, { status: prep.status });
        }

        const [paySpotE8, receiveSpotE8, kasSpotE8] = await Promise.all([
            resolveStrictSpotPriceE8(payAsset),
            resolveStrictSpotPriceE8(receiveAsset),
            resolveStrictSpotPriceE8('KAS')
        ]);
        if (paySpotE8 <= 0n || receiveSpotE8 <= 0n || kasSpotE8 <= 0n) {
            return livePricingUnavailableResponse(503);
        }
        const grossUsdMicros = atomicToUsdMicrosFloor(amountAtomic, payDecimals, paySpotE8);
        if (grossUsdMicros < MINIMUM_SWAP_USD_MICROS) {
            return json(
                {
                    error: `Minimum swap value is $1.00 USD (submitted $${formatAtomicToDecimal(grossUsdMicros, USD_MICROS_DECIMALS, 2)} USD).`
                },
                { status: 400 }
            );
        }

        const treasuryCheck = resolveValidatedMasterTreasuryAddress();
        if (!treasuryCheck.ok) {
            return json(
                {
                    success: false,
                    livePricingUnavailable: true,
                    uiMessage: LIVE_PRICING_UNAVAILABLE_MESSAGE,
                    error: treasuryCheck.error
                },
                { status: 503 }
            );
        }

        const rawRouteMode = body.routeMode ?? body.route_mode;
        const rawLpFeeTier = body.lpFeeTierBps ?? body.lp_fee_tier_bps;
        const isLpPairRoute =
            String(rawRouteMode ?? '').trim().toUpperCase() === 'LP_PAIR' ||
            (rawLpFeeTier !== undefined && rawLpFeeTier !== null && rawLpFeeTier !== '');

        let lpSplit: LpPairAtomicSplit | null = null;
        let protoSplit: ProtocolAtomicSplit | null = null;
        let fallbackFeeBps = 50;

        if (isLpPairRoute) {
            const rawTierNum = Number(rawLpFeeTier ?? 30);
            if (!Number.isFinite(rawTierNum) || !Number.isInteger(rawTierNum)) {
                return json(
                    {
                        success: false,
                        error: 'INVALID_LP_FEE_TIER: Expected 30, 100, or 250 bps.'
                    },
                    { status: 400 }
                );
            }
            try {
                lpSplit = computeLpPairAtomicSplit(amountAtomic, BigInt(rawTierNum));
                fallbackFeeBps = Number(lpSplit.feeTierBps);
            } catch (lpErr: unknown) {
                return json(
                    {
                        success: false,
                        error: lpErr instanceof Error ? lpErr.message : 'INVALID_LP_FEE_TIER'
                    },
                    { status: 400 }
                );
            }
        } else {
            const feeTier = await resolveUserSwapFeeTierBps(
                cleanWallet,
                prefixedWallet,
                grossUsdMicros,
                payAsset,
                receiveAsset
            );
            fallbackFeeBps = feeTier.feeBps;
            try {
                protoSplit = computeProtocolAtomicSplit(amountAtomic, BigInt(feeTier.feeBps));
            } catch (protoErr: unknown) {
                return json(
                    {
                        success: false,
                        error:
                            protoErr instanceof Error
                                ? protoErr.message
                                : 'ZERO_LOSS_INVARIANT_VIOLATION'
                    },
                    { status: 400 }
                );
            }
        }

        const minOutputAtomic =
            body.minOutputAtomic !== undefined && body.minOutputAtomic !== null
                ? parseU128Str(body.minOutputAtomic, 'minOutputAtomic').toString()
                : undefined;

        const rustBase = resolveSorBackendBaseUrl();
        if (!rustBase) {
            return livePricingUnavailableResponse(503);
        }
        const internalToken = resolveSorInternalBearerToken();
        const enforceAuth =
            String(env.ENFORCE_INTERNAL_AUTH || 'true').trim().toLowerCase() !== 'false';
        if (enforceAuth && !internalToken) {
            return livePricingUnavailableResponse(503);
        }

        const destinationAddress =
            requestedDestinationAddress ||
            (isSyntheticRwaAsset(receiveAsset) ? prefixedWallet : undefined);

        const upstreamBody: Record<string, unknown> = {
            wallet: prefixedWallet,
            payAsset,
            receiveAsset,
            targetNetwork,
            amountAtomic: amountAtomic.toString(),
            slippageBps,
            refundKaspaAddress
        };
        if (minOutputAtomic !== undefined) upstreamBody.minOutputAtomic = minOutputAtomic;
        if (destinationAddress) upstreamBody.destinationAddress = destinationAddress;
        if (Array.isArray(body.utxos) && body.utxos.length > 0) upstreamBody.utxos = body.utxos;
        if (typeof body.htlcSha256HashlockHex === 'string' && body.htlcSha256HashlockHex.trim()) {
            upstreamBody.htlcSha256HashlockHex = body.htlcSha256HashlockHex.trim();
        }
        if (typeof body.counterpartyPubkeyHex === 'string' && body.counterpartyPubkeyHex.trim()) {
            upstreamBody.counterpartyPubkeyHex = body.counterpartyPubkeyHex.trim();
        }
        if (isLpPairRoute) {
            upstreamBody.routeMode = 'LP_PAIR';
            upstreamBody.lpFeeTierBps = Number(lpSplit!.feeTierBps);
        } else if (typeof rawRouteMode === 'string' && rawRouteMode.trim()) {
            upstreamBody.routeMode = rawRouteMode.trim();
            if (rawRouteMode.trim().toUpperCase() === 'BATCH_BOOST') {
                upstreamBody.boostBucketAsset =
                    typeof body.boostBucketAsset === 'string' && body.boostBucketAsset.trim()
                        ? body.boostBucketAsset.trim().toUpperCase()
                        : receiveAsset;
            }
        }

        const upstreamHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'application/json'
        };
        if (internalToken) {
            upstreamHeaders.Authorization = `Bearer ${internalToken}`;
        }

        let upstreamRes: Response;
        try {
            upstreamRes = await fetch(`${rustBase}/v1/sor/execute`, {
                method: 'POST',
                headers: upstreamHeaders,
                body: JSON.stringify(upstreamBody),
                signal: AbortSignal.timeout(9000)
            });
        } catch {
            return livePricingUnavailableResponse(503);
        }

        const upstreamData = (await upstreamRes.json().catch(() => null)) as Record<
            string,
            unknown
        > | null;
        if (!upstreamRes.ok || !upstreamData || upstreamData.success !== true) {
            const rawErr = String(upstreamData?.error || upstreamData?.message || '');
            const status =
                upstreamRes.status === 503 ||
                upstreamRes.status >= 500 ||
                /ORACLE_HALT|SERVICE_UNAVAILABLE|oracle/i.test(rawErr)
                    ? 503
                    : upstreamRes.status;
            if (status === 503) {
                return livePricingUnavailableResponse(503);
            }
            return json(
                {
                    success: false,
                    error: rawErr.trim() || 'Smart Order Router rejected request.'
                },
                { status }
            );
        }

        const routeTypeRaw = String(upstreamData.routeType || 'CROSS_CHAIN_DEPOSIT_INTENT');
        const routeType: SorRouteType = VALID_ROUTE_TYPES.has(routeTypeRaw as SorRouteType)
            ? (routeTypeRaw as SorRouteType)
            : 'CROSS_CHAIN_DEPOSIT_INTENT';
        const tokenSteeringRaw =
            upstreamData.tokenSteering && typeof upstreamData.tokenSteering === 'object'
                ? (upstreamData.tokenSteering as Record<string, unknown>)
                : {};

        const sorResult: SorExecuteResponseV1 = {
            success: true,
            transactionUuid: String(upstreamData.transactionUuid || ''),
            routeType,
            payAsset: String(upstreamData.payAsset || payAsset).toUpperCase(),
            receiveAsset: String(upstreamData.receiveAsset || receiveAsset).toUpperCase(),
            targetNetwork: String(upstreamData.targetNetwork || targetNetwork).toUpperCase(),
            amountInAtomic: toU128Str(upstreamData.amountInAtomic ?? amountAtomic, 'amountInAtomic'),
            protocolFeeAtomic: toU128Str(
                upstreamData.protocolFeeAtomic ??
                    (lpSplit ? lpSplit.totalFeeAtomic : protoSplit!.treasuryFeeAtomic),
                'protocolFeeAtomic'
            ),
            networkFeeSompi: toU128Str(upstreamData.networkFeeSompi ?? '0', 'networkFeeSompi'),
            estimatedOutputAtomic: toU128Str(
                upstreamData.estimatedOutputAtomic ?? '0',
                'estimatedOutputAtomic'
            ),
            minOutputAtomic: toU128Str(upstreamData.minOutputAtomic ?? '0', 'minOutputAtomic'),
            feeBps: Number(upstreamData.feeBps ?? fallbackFeeBps),
            feeTierLabel: String(upstreamData.feeTierLabel || ''),
            grossUsdMicros: toU128Str(
                upstreamData.grossUsdMicros ?? grossUsdMicros,
                'grossUsdMicros'
            ),
            netUsdMicros: toU128Str(upstreamData.netUsdMicros ?? '0', 'netUsdMicros'),
            payOracleUsdE8: toU128Str(upstreamData.payOracleUsdE8 ?? paySpotE8, 'payOracleUsdE8'),
            receiveOracleUsdE8: toU128Str(
                upstreamData.receiveOracleUsdE8 ?? receiveSpotE8,
                'receiveOracleUsdE8'
            ),
            kasOracleUsdE8: toU128Str(upstreamData.kasOracleUsdE8 ?? kasSpotE8, 'kasOracleUsdE8'),
            refundKaspaAddress: String(upstreamData.refundKaspaAddress || refundKaspaAddress),
            tokenSteering: {
                allowed: Boolean(tokenSteeringRaw.allowed ?? true),
                rejectReason:
                    tokenSteeringRaw.rejectReason !== undefined &&
                    tokenSteeringRaw.rejectReason !== null
                        ? String(tokenSteeringRaw.rejectReason)
                        : null,
                payState: String(tokenSteeringRaw.payState || steering.payState),
                receiveState: String(tokenSteeringRaw.receiveState || steering.receiveState),
                allowDarkPoolInternalClearing: Boolean(
                    tokenSteeringRaw.allowDarkPoolInternalClearing ??
                        steering.allowDarkPoolInternalClearing
                ),
                feeLegs: Array.isArray(tokenSteeringRaw.feeLegs)
                    ? (tokenSteeringRaw.feeLegs as Array<{ asset: string; shareRatio: number }>)
                    : steering.feeLegs,
                explanation: String(
                    tokenSteeringRaw.explanation || steering.steeringExplanation
                )
            },
            pskt: (upstreamData.pskt ?? null) as PsktPayload | null,
            htlcCovenant:
                upstreamData.htlcCovenant && typeof upstreamData.htlcCovenant === 'object'
                    ? (upstreamData.htlcCovenant as Record<string, unknown>)
                    : null,
            formattedUtxos: Array.isArray(upstreamData.formattedUtxos)
                ? upstreamData.formattedUtxos
                : []
        };

        const resolvedLpFeeAtomic: U128Str = toU128Str(
            upstreamData.lpFeeAtomic ?? (lpSplit ? lpSplit.lpFeeAtomic : 0n),
            'lpFeeAtomic'
        );
        const resolvedTreasuryFeeAtomic: U128Str = toU128Str(
            upstreamData.treasuryFeeAtomic ??
                (lpSplit ? lpSplit.treasuryFeeAtomic : protoSplit!.treasuryFeeAtomic),
            'treasuryFeeAtomic'
        );
        const resolvedMasterTreasury =
            typeof upstreamData.masterTreasuryAddress === 'string' &&
            upstreamData.masterTreasuryAddress.trim()
                ? upstreamData.masterTreasuryAddress.trim().toLowerCase()
                : treasuryCheck.address;
        const resolvedNetOutAtomic: U128Str = (
            lpSplit ? lpSplit.netOutAtomic : protoSplit!.netOutAtomic
        ).toString();

        const resolvedGrossUsdMicros = parseU128Str(sorResult.grossUsdMicros, 'grossUsdMicros');
        const resolvedProtocolFeeUsdMicros = mulBpsCeil(
            resolvedGrossUsdMicros,
            sorResult.feeBps > 0 ? sorResult.feeBps : fallbackFeeBps
        );
        const pairLabel =
            payAsset === 'KAS'
                ? `KAS/${receiveAsset}`
                : receiveAsset === 'KAS'
                  ? `KAS/${payAsset}`
                  : `${payAsset}/${receiveAsset}`;

        let waterfall: Record<string, unknown>;
        if (lpSplit) {
            const lpAllocMicros = (resolvedProtocolFeeUsdMicros * 8000n) / BPS_SCALE;
            const treasuryCutMicros =
                resolvedProtocolFeeUsdMicros > lpAllocMicros
                    ? resolvedProtocolFeeUsdMicros - lpAllocMicros
                    : 0n;
            const compound60Micros = (treasuryCutMicros * 6000n) / BPS_SCALE;
            const reserve40Micros =
                treasuryCutMicros > compound60Micros ? treasuryCutMicros - compound60Micros : 0n;
            waterfall = {
                hardFloorPerenniaUsdMicros: treasuryCutMicros.toString(),
                lpAllocatedFeeUsdMicros: lpAllocMicros.toString(),
                perenniaTotalCutUsdMicros: treasuryCutMicros.toString(),
                perenniaLpCompound60UsdMicros: compound60Micros.toString(),
                perenniaLiquidReserve40UsdMicros: reserve40Micros.toString(),
                hardFloorPerenniaUsd: Number(
                    formatAtomicToDecimal(treasuryCutMicros, USD_MICROS_DECIMALS)
                ),
                lpAllocatedFeeUsd: Number(
                    formatAtomicToDecimal(lpAllocMicros, USD_MICROS_DECIMALS)
                ),
                perenniaTotalCutUsd: Number(
                    formatAtomicToDecimal(treasuryCutMicros, USD_MICROS_DECIMALS)
                ),
                perenniaLpCompound60Usd: Number(
                    formatAtomicToDecimal(compound60Micros, USD_MICROS_DECIMALS)
                ),
                perenniaLiquidReserve40Usd: Number(
                    formatAtomicToDecimal(reserve40Micros, USD_MICROS_DECIMALS)
                ),
                projectedBaseLpAprPct: 14.4,
                projectedMaxMultiplierAprPct: 36.0,
                surplusVolumeSweepActive: false
            };
        } else {
            waterfall = await computeDynamicHurdleWaterfallMicros({
                poolPair: pairLabel,
                grossUsdMicros: resolvedGrossUsdMicros,
                totalProtocolFeeUsdMicros: resolvedProtocolFeeUsdMicros,
                kasSpotE8: parseU128Str(sorResult.kasOracleUsdE8, 'kasOracleUsdE8')
            });
        }

        const receiveDecimals = atomicDecimalsForSorAsset(sorResult.receiveAsset);
        const estimatedOutputDisplay = Number(
            formatAtomicToDecimal(
                sorResult.estimatedOutputAtomic,
                receiveDecimals,
                Math.min(8, receiveDecimals)
            )
        );

        return json({
            ...sorResult,
            batchBoostTriggered: Boolean(upstreamData.batchBoostTriggered),
            batchBoostAsset: upstreamData.batchBoostAsset ?? (typeof body.boostBucketAsset === 'string' ? body.boostBucketAsset.trim().toUpperCase() : undefined),
            lpFeeAtomic: resolvedLpFeeAtomic,
            treasuryFeeAtomic: resolvedTreasuryFeeAtomic,
            masterTreasuryAddress: resolvedMasterTreasury,
            zeroLossInvariantVerified: Boolean(upstreamData.zeroLossInvariantVerified ?? true),
            deliveryMode: 'ONCHAIN_L1',
            dynamicHurdleWaterfall: {
                ...waterfall,
                competitorAmmAprPct: COMPETITOR_STANDARD_AMM_APR_PCT
            },
            sompiAccounting: {
                routeMode: isLpPairRoute ? 'LP_PAIR' : 'DIRECT_SWAP',
                amountInSompi: sorResult.amountInAtomic,
                netOutSompi: resolvedNetOutAtomic,
                lpFeeSompi: resolvedLpFeeAtomic,
                treasuryFeeSompi: resolvedTreasuryFeeAtomic,
                masterTreasuryAddress: resolvedMasterTreasury,
                zeroLossInvariantVerified: Boolean(upstreamData.zeroLossInvariantVerified ?? true)
            },
            /* Render-boundary numeric projections derived from SorExecuteResponseV1 fields above. */
            transaction_uuid: sorResult.transactionUuid,
            estimatedOutput: estimatedOutputDisplay,
            estimated_output: estimatedOutputDisplay,
            feeRate: sorResult.feeBps / 10_000,
            fee_rate: sorResult.feeBps / 10_000,
            feeUsd: Number(formatAtomicToDecimal(sorResult.grossUsdMicros, USD_MICROS_DECIMALS, 2)) -
                Number(formatAtomicToDecimal(sorResult.netUsdMicros, USD_MICROS_DECIMALS, 2))
        });
    } catch (err: unknown) {
        console.error('🚨 [SOR SWAP ROUTE ERROR]:', err);
        return json(
            {
                success: false,
                error: err instanceof Error ? err.message : 'Failed to execute swap.'
            },
            { status: 500 }
        );
    }
};
