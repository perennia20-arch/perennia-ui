import { browser } from '$app/environment';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ui } from '$lib/stores/ui.svelte';
import { identity } from '$lib/stores/identity.svelte';

export const HARD_PROFIT_FLOOR_RATE = 0.001;
export const STANDARD_PUBLIC_SWAP_FEE_RATE = 0.0015;
export const PUBLIC_MAX_SWAP_FEE_RATE = 0.015;

export const RETAIL_ONRAMP_FEE_BPS = 85;
export const PRO_MINER_ONRAMP_FEE_BPS = 35;
export const INSTITUTIONAL_WIRE_ONRAMP_FEE_BPS = 20;
export const ONRAMP_MIN_FEE_FLOOR_CENTS = 250;
export const ACH_AUTO_DEFAULT_THRESHOLD_CENTS = 62_500;
export const PRO_TIER_THRESHOLD_CENTS = 1_000_000;
export const INSTITUTIONAL_WIRE_THRESHOLD_CENTS = 10_000_000;

export const MERCURY_COLUMN_WIRE_INSTRUCTIONS = {
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

export interface LpPosition {
    id?: string;
    lpId: string;
    poolPair: string;
    amountA?: number;
    amountB?: number;
    usdValue?: number;
    isLocked?: boolean;
    stakedAssetA: number;
    stakedAssetB: number;
    weights?: Record<string, number>;
    reserves?: Record<string, number>;
    invariantK?: number;
    internalPairsCount?: number;
    isMultiAssetPlant?: boolean;
    lockDurationDays: number;
    unlockDate: string | null;
    createdAt: string | null;
    isUnlocked: boolean;
    multiplier: number;
    weightedTvl: number;
}

export interface SecondaryPlantLeg {
    ticker: string;
    weightPct: number;
    amount: string;
}

export interface SiloStakePosition {
    id?: string;
    stakeId: string;
    ticker: string;
    amount?: number;
    amountStaked: number;
    status: 'ACTIVE' | 'COOLDOWN';
    txHash?: string | null;
    cooldownInitiatedAt?: string | null;
    cooldownEndsAt?: string | null;
    createdAt?: string | null;
    isMatured: boolean;
}

export interface SavedBankRailMeta {
    bankLabel: string;
    accountType: 'CHECKING' | 'SAVINGS';
    payoutMethod: 'ACH' | 'WIRE';
    bankLast4: string;
    updatedAt: string;
}

export interface AbaValidationResult {
    cleanDigits: string;
    isComplete: boolean;
    checksumValid: boolean;
    institutionName: string | null;
    fedDistrict: string | null;
}

export interface DiscoveredOracleAsset {
    ticker: string;
    name: string;
    assetClass: 'Ecosystem' | 'Native L1' | 'DeFi' | 'Tokenized Asset';
    network: string;
    spotPrice: number;
    change24h: number;
    sources: string[];
    quorumCount: number;
    isKrc20: boolean;
    contract?: string;
    maxSupply?: number;
    mintedSupply?: number;
    holders?: number;
    theme: {
        hex: string;
        pastel: string;
    };
    imgUrl: string;
}

export type OnrampProfitTier = 'RETAIL' | 'PRO_MINER' | 'INSTITUTIONAL_WIRE';
export type OnrampGatewayMethod = 'ach' | 'card' | 'wire';

export interface CostPlusQuotePreview {
    direction: 'ONRAMP' | 'OFFRAMP';
    assetTicker: string;
    tierName: OnrampProfitTier;
    tierBadgeLabel: string;
    tierBps: number;
    paymentMethod: OnrampGatewayMethod;
    principalCents: number;
    perenniaFeeCents: number;
    targetNetCents: number;
    stripeGatewayFeeCents: number;
    grossChargeCents: number;
    principalUsd: number;
    perenniaFeeUsd: number;
    stripeGatewayFeeUsd: number;
    totalGrossChargeUsd: number;
    grossUsd: number;
    hardCostUsd: number;
    guaranteedProfitUsd: number;
    feeUsd: number;
    effectiveFeePct: number;
    protocolFeeFloorPct: number;
    minerOrPassDiscountActive: boolean;
    guestNetUsd: number;
    estimatedTokens: number;
    spotPriceUsd: number;
    competitorFeeUsd: number;
    competitorNetUsd: number;
    guestSavingsUsd: number;
    moonpayFeeUsd: number;
    coinbaseFeeUsd: number;
    savingsVsMoonpayUsd: number;
    savingsVsCoinbaseUsd: number;
    routingTopology: string;
    railLabel: string;
    whaleWireFeeWaived: boolean;
    bundledUsdcFeeWaived: boolean;
    requiresInstitutionalWire: boolean;
    autoDefaultedToAch: boolean;
    circuitBreakerTripped: boolean;
    circuitBreakerReason?: string;
}

export interface PostTradeUsdSplit {
    grossInboundUsd: number;
    wholesaleApiFloatSweepUsd: number;
    chronosMinerSettlementUsd: number;
    llcTaxAndRailReserveUsd: number;
    netProfitAndRatchetUsd: number;
    floatRatchetReinvestUsd: number;
    darkPoolLpAndOwnerDrawUsd: number;
    perenniaLpCompound60Usd: number;
    liquidClearingReserve40Usd: number;
}

export const WIRE_FEE_USD = 0.0;
export const ACH_FEE_USD = 0.0;

export const LOCK_OPTIONS = [
    { label: 'Flexible', days: 0, multiplier: 1.0 },
    { label: '30 Days', days: 30, multiplier: 1.2 },
    { label: '90 Days', days: 90, multiplier: 1.5 },
    { label: '365 Days', days: 365, multiplier: 2.5 }
] as const;

export const ABA_INSTITUTION_DIRECTORY: Record<string, string> = {
    '110000000': 'Stripe Test Bank (ACH Direct Debit)',
    '021000021': 'JPMorgan Chase Bank, N.A. (New York)',
    '111000614': 'JPMorgan Chase Bank, N.A. (Texas / Dallas)',
    '322271627': 'JPMorgan Chase Bank, N.A. (California)',
    '071000013': 'JPMorgan Chase Bank, N.A. (Illinois)',
    '111000025': 'Bank of America, N.A. (Texas / Dallas)',
    '026009593': 'Bank of America, N.A. (New York Wire)',
    '121000358': 'Bank of America, N.A. (California)',
    '053000196': 'Bank of America, N.A. (North Carolina)',
    '121145433': 'Column N.A. / Mercury Commercial Vault',
    '084106768': 'Thread Bank / Mercury Commercial Rail',
    '064209588': 'Relay Financial / Thread Bank',
    '121000248': 'Wells Fargo Bank, N.A. (National)',
    '111900659': 'Wells Fargo Bank, N.A. (Texas)',
    '021000089': 'Citibank, N.A. (New York)',
    '322271724': 'Citibank, N.A. (California)',
    '122105155': 'U.S. Bank, N.A. (Western)',
    '091000022': 'U.S. Bank, N.A. (Minnesota / Institutional)',
    '101205681': 'Fidelity Cash Management / UMB Bank',
    '121202211': 'Charles Schwab Bank, SSB',
    '031100209': 'Capital One, N.A.',
    '043000096': 'PNC Bank, N.A.'
};

function roundCents(val: number): number {
    return Math.round(val * 100) / 100;
}

export function calculateGatewayGrossUpCents(params: {
    principalCents: number;
    loyalMinerOrSubscriber?: boolean;
    paymentMethod?: OnrampGatewayMethod;
}): {
    tierName: OnrampProfitTier;
    tierBps: number;
    tierBadgeLabel: string;
    paymentMethod: OnrampGatewayMethod;
    principalCents: number;
    perenniaFeeCents: number;
    targetNetCents: number;
    stripeGatewayFeeCents: number;
    grossChargeCents: number;
    requiresInstitutionalWire: boolean;
    autoDefaultedToAch: boolean;
} {
    const safePrincipalCents = Math.max(
        0,
        Math.round(params.principalCents || 0)
    );
    const isLoyal = Boolean(params.loyalMinerOrSubscriber);

    if (safePrincipalCents >= INSTITUTIONAL_WIRE_THRESHOLD_CENTS) {
        const perenniaFeeCents = Math.max(
            ONRAMP_MIN_FEE_FLOOR_CENTS,
            Math.ceil(
                (safePrincipalCents * INSTITUTIONAL_WIRE_ONRAMP_FEE_BPS) /
                    10_000
            )
        );
        const targetNetCents = safePrincipalCents + perenniaFeeCents;
        return {
            tierName: 'INSTITUTIONAL_WIRE',
            tierBps: INSTITUTIONAL_WIRE_ONRAMP_FEE_BPS,
            tierBadgeLabel:
                '🏛️ Institutional Wire Tier (0.20% Net • $0 Gateway Fee)',
            paymentMethod: 'wire',
            principalCents: safePrincipalCents,
            perenniaFeeCents,
            targetNetCents,
            stripeGatewayFeeCents: 0,
            grossChargeCents: targetNetCents,
            requiresInstitutionalWire: true,
            autoDefaultedToAch: false
        };
    }

    const isProOrMiner =
        safePrincipalCents >= PRO_TIER_THRESHOLD_CENTS || isLoyal;
    const tierName: OnrampProfitTier = isProOrMiner ? 'PRO_MINER' : 'RETAIL';
    const tierBps = isProOrMiner
        ? PRO_MINER_ONRAMP_FEE_BPS
        : RETAIL_ONRAMP_FEE_BPS;
    const tierBadgeLabel = isProOrMiner
        ? isLoyal
            ? '⛏️ Pro & Miner Loyalty Tier (0.35% Net • $2.50 Floor)'
            : '⚡ Pro Volume Tier (0.35% Net • $2.50 Floor)'
        : '🛡️ Retail Tier (0.85% Net • $2.50 Floor)';

    const perenniaFeeCents =
        safePrincipalCents > 0
            ? Math.max(
                  ONRAMP_MIN_FEE_FLOOR_CENTS,
                  Math.ceil((safePrincipalCents * tierBps) / 10_000)
              )
            : 0;
    const targetNetCents = safePrincipalCents + perenniaFeeCents;

    const autoDefaultedToAch =
        safePrincipalCents >= ACH_AUTO_DEFAULT_THRESHOLD_CENTS &&
        params.paymentMethod !== 'card';
    const resolvedMethod: OnrampGatewayMethod =
        params.paymentMethod === 'card'
            ? 'card'
            : params.paymentMethod === 'wire'
              ? 'wire'
              : 'ach';

    if (safePrincipalCents <= 0) {
        return {
            tierName,
            tierBps,
            tierBadgeLabel,
            paymentMethod: resolvedMethod,
            principalCents: 0,
            perenniaFeeCents: 0,
            targetNetCents: 0,
            stripeGatewayFeeCents: 0,
            grossChargeCents: 0,
            requiresInstitutionalWire: false,
            autoDefaultedToAch
        };
    }

    let grossChargeCents = targetNetCents;
    if (resolvedMethod === 'card') {
        grossChargeCents = Math.ceil((targetNetCents + 30) / 0.971);
    } else if (resolvedMethod === 'ach') {
        if (safePrincipalCents >= ACH_AUTO_DEFAULT_THRESHOLD_CENTS) {
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

    return {
        tierName,
        tierBps,
        tierBadgeLabel,
        paymentMethod: resolvedMethod,
        principalCents: safePrincipalCents,
        perenniaFeeCents,
        targetNetCents,
        stripeGatewayFeeCents,
        grossChargeCents,
        requiresInstitutionalWire: false,
        autoDefaultedToAch
    };
}

export function computePostTradeUsdSplit(
    grossUsd: number,
    explicitPerenniaFeeUsd?: number
): PostTradeUsdSplit {
    const safeGross = Math.max(0, grossUsd);
    const wholesaleApiFloatSweepUsd = roundCents(safeGross * 0.485);
    const chronosMinerSettlementUsd = roundCents(safeGross * 0.49);
    const llcTaxAndRailReserveUsd = roundCents(safeGross * 0.007);
    const netProfitAndRatchetUsd =
        explicitPerenniaFeeUsd !== undefined && explicitPerenniaFeeUsd > 0
            ? roundCents(explicitPerenniaFeeUsd)
            : roundCents(
                  Math.max(
                      2.5,
                      safeGross * 0.0035,
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

export function computeOnrampCostPlusQuote(params: {
    assetTicker: string;
    grossUsd: number;
    spotPriceUsd: number;
    autoStakeSilo?: boolean;
    bundledKasOrSilo?: boolean;
    wholesaleFloorActive?: boolean;
    paymentMethod?: OnrampGatewayMethod;
}): CostPlusQuotePreview {
    const ticker = String(params.assetTicker || 'KAS').trim().toUpperCase();
    const principalUsdInput = Math.max(0, Number(params.grossUsd || 0));
    const principalCents = Math.round(principalUsdInput * 100);
    const liveSpot =
        Number.isFinite(params.spotPriceUsd) && params.spotPriceUsd > 0
            ? params.spotPriceUsd
            : 0;
    const loyalMinerOrSubscriber = Boolean(params.wholesaleFloorActive);

    const grossUp = calculateGatewayGrossUpCents({
        principalCents,
        loyalMinerOrSubscriber,
        paymentMethod: params.paymentMethod
    });

    const protocolFeeFloorPct = Number((grossUp.tierBps / 100).toFixed(2));

    if (principalCents <= 0) {
        return {
            direction: 'ONRAMP',
            assetTicker: ticker,
            tierName: grossUp.tierName,
            tierBadgeLabel: grossUp.tierBadgeLabel,
            tierBps: grossUp.tierBps,
            paymentMethod: grossUp.paymentMethod,
            principalCents: 0,
            perenniaFeeCents: 0,
            targetNetCents: 0,
            stripeGatewayFeeCents: 0,
            grossChargeCents: 0,
            principalUsd: 0,
            perenniaFeeUsd: 0,
            stripeGatewayFeeUsd: 0,
            totalGrossChargeUsd: 0,
            grossUsd: 0,
            hardCostUsd: 0,
            guaranteedProfitUsd: 0,
            feeUsd: 0,
            effectiveFeePct: 0,
            protocolFeeFloorPct,
            minerOrPassDiscountActive: loyalMinerOrSubscriber,
            guestNetUsd: 0,
            estimatedTokens: 0,
            spotPriceUsd: liveSpot,
            competitorFeeUsd: 0,
            competitorNetUsd: 0,
            guestSavingsUsd: 0,
            moonpayFeeUsd: 0,
            coinbaseFeeUsd: 0,
            savingsVsMoonpayUsd: 0,
            savingsVsCoinbaseUsd: 0,
            routingTopology: 'Direct Settlement',
            railLabel: 'ACH Direct Debit ($5.00 Cap)',
            whaleWireFeeWaived: false,
            bundledUsdcFeeWaived: false,
            requiresInstitutionalWire: false,
            autoDefaultedToAch: false,
            circuitBreakerTripped: liveSpot <= 0,
            circuitBreakerReason:
                liveSpot <= 0
                    ? `Live oracle spot price for ${ticker} is offline; failing closed.`
                    : undefined
        };
    }

    const principalUsd = roundCents(grossUp.principalCents / 100);
    const perenniaFeeUsd = roundCents(grossUp.perenniaFeeCents / 100);
    const stripeGatewayFeeUsd = roundCents(
        grossUp.stripeGatewayFeeCents / 100
    );
    const totalGrossChargeUsd = roundCents(grossUp.grossChargeCents / 100);
    const totalFeeUsd = roundCents(perenniaFeeUsd + stripeGatewayFeeUsd);
    const effectiveFeePct =
        principalUsd > 0 ? roundCents((totalFeeUsd / principalUsd) * 100) : 0;

    // MoonPay charges $3.99 ecosystem/base fee + 4.5% on cards (or 3.5% ACH / 1.25% wire)
    const moonpayFeeUsd = roundCents(
        grossUp.paymentMethod === 'card'
            ? 3.99 + principalUsd * 0.045
            : Math.max(
                  3.99,
                  principalUsd *
                      (grossUp.requiresInstitutionalWire ? 0.0125 : 0.035)
              )
    );
    // Coinbase charges $2.99 base spread fee + 3.84% card fee (or 2.49% ACH / 1.0% wire)
    const coinbaseFeeUsd = roundCents(
        grossUp.paymentMethod === 'card'
            ? 2.99 + principalUsd * 0.0384
            : Math.max(
                  2.99,
                  principalUsd *
                      (grossUp.requiresInstitutionalWire ? 0.01 : 0.0249)
              )
    );

    const competitorFeeUsd = Math.max(moonpayFeeUsd, coinbaseFeeUsd);
    const savingsVsMoonpayUsd = roundCents(
        Math.max(0, moonpayFeeUsd - totalFeeUsd)
    );
    const savingsVsCoinbaseUsd = roundCents(
        Math.max(0, coinbaseFeeUsd - totalFeeUsd)
    );
    const guestSavingsUsd = Math.max(savingsVsMoonpayUsd, savingsVsCoinbaseUsd);
    const competitorNetUsd = roundCents(
        Math.max(0, totalGrossChargeUsd - competitorFeeUsd)
    );
    const estimatedTokens = liveSpot > 0 ? principalUsd / liveSpot : 0;

    const isBundled = Boolean(params.autoStakeSilo || params.bundledKasOrSilo);
    const routingTopology = grossUp.requiresInstitutionalWire
        ? `Column N.A. / Mercury Direct Domestic Wire (${MERCURY_COLUMN_WIRE_INSTRUCTIONS.routingNumber} / *${MERCURY_COLUMN_WIRE_INSTRUCTIONS.accountLast4})`
        : grossUp.paymentMethod === 'card'
          ? `Stripe Card Gross-Up (2.9% + $0.30) → Mercury *${MERCURY_COLUMN_WIRE_INSTRUCTIONS.accountLast4} → ${ticker}`
          : `Stripe ACH Gross-Up (0.8% Capped @ $5.00) → Mercury *${MERCURY_COLUMN_WIRE_INSTRUCTIONS.accountLast4} → ${ticker}`;

    const railLabel = grossUp.requiresInstitutionalWire
        ? 'Institutional Domestic Wire ($0 Gateway Fee)'
        : grossUp.paymentMethod === 'card'
          ? 'Domestic Card (2.9% + $0.30 Gross-Up)'
          : principalCents >= ACH_AUTO_DEFAULT_THRESHOLD_CENTS
            ? 'ACH Direct Debit ($5.00 Flat Cap)'
            : 'ACH Direct Debit (0.8% Gross-Up)';

    let circuitBreakerTripped = false;
    let circuitBreakerReason: string | undefined = undefined;
    if (liveSpot <= 0) {
        circuitBreakerTripped = true;
        circuitBreakerReason = `Live oracle spot price for ${ticker} is offline; failing closed.`;
    } else if (grossUp.perenniaFeeCents < ONRAMP_MIN_FEE_FLOOR_CENTS) {
        circuitBreakerTripped = true;
        circuitBreakerReason = `Net Perennia fee ($${perenniaFeeUsd.toFixed(2)}) fell below the $2.50 minimum floor; failing closed.`;
    }

    return {
        direction: 'ONRAMP',
        assetTicker: ticker,
        tierName: grossUp.tierName,
        tierBadgeLabel: grossUp.tierBadgeLabel,
        tierBps: grossUp.tierBps,
        paymentMethod: grossUp.paymentMethod,
        principalCents: grossUp.principalCents,
        perenniaFeeCents: grossUp.perenniaFeeCents,
        targetNetCents: grossUp.targetNetCents,
        stripeGatewayFeeCents: grossUp.stripeGatewayFeeCents,
        grossChargeCents: grossUp.grossChargeCents,
        principalUsd,
        perenniaFeeUsd,
        stripeGatewayFeeUsd,
        totalGrossChargeUsd,
        grossUsd: totalGrossChargeUsd,
        hardCostUsd: stripeGatewayFeeUsd,
        guaranteedProfitUsd: perenniaFeeUsd,
        feeUsd: totalFeeUsd,
        effectiveFeePct,
        protocolFeeFloorPct,
        minerOrPassDiscountActive:
            loyalMinerOrSubscriber || grossUp.tierName !== 'RETAIL',
        guestNetUsd: principalUsd,
        estimatedTokens,
        spotPriceUsd: liveSpot,
        competitorFeeUsd,
        competitorNetUsd,
        guestSavingsUsd,
        moonpayFeeUsd,
        coinbaseFeeUsd,
        savingsVsMoonpayUsd,
        savingsVsCoinbaseUsd,
        routingTopology,
        railLabel,
        whaleWireFeeWaived: grossUp.requiresInstitutionalWire,
        bundledUsdcFeeWaived: ticker === 'USDC' && isBundled,
        requiresInstitutionalWire: grossUp.requiresInstitutionalWire,
        autoDefaultedToAch: grossUp.autoDefaultedToAch,
        circuitBreakerTripped,
        circuitBreakerReason
    };
}

export function computeOfframpCostPlusQuote(params: {
    assetTicker: string;
    grossUsd: number;
    spotPriceUsd: number;
    payoutMethod?: 'ach' | 'wire' | 'ACH' | 'WIRE';
    wholesaleFloorActive?: boolean;
}): CostPlusQuotePreview {
    const ticker = String(params.assetTicker || 'KAS').trim().toUpperCase();
    const gross = Math.max(0, Number(params.grossUsd || 0));
    const grossCents = Math.round(gross * 100);
    const liveSpot =
        Number.isFinite(params.spotPriceUsd) && params.spotPriceUsd > 0
            ? params.spotPriceUsd
            : 0;
    const wholesaleActive = Boolean(params.wholesaleFloorActive);
    const isInstitutionalWire = grossCents >= INSTITUTIONAL_WIRE_THRESHOLD_CENTS;
    const isProOrMiner =
        grossCents >= PRO_TIER_THRESHOLD_CENTS || wholesaleActive;
    const tierName: OnrampProfitTier = isInstitutionalWire
        ? 'INSTITUTIONAL_WIRE'
        : isProOrMiner
          ? 'PRO_MINER'
          : 'RETAIL';
    const tierBps = isInstitutionalWire
        ? INSTITUTIONAL_WIRE_ONRAMP_FEE_BPS
        : isProOrMiner
          ? PRO_MINER_ONRAMP_FEE_BPS
          : RETAIL_ONRAMP_FEE_BPS;
    const tierBadgeLabel = isInstitutionalWire
        ? '🏛️ Institutional Wire Tier (0.20% Net)'
        : isProOrMiner
          ? '⛏️ Pro & Miner Loyalty Tier (0.35% Net)'
          : '🛡️ Retail Tier (0.85% Net)';
    const protocolFeeFloorPct = Number((tierBps / 100).toFixed(2));

    if (gross <= 0) {
        return {
            direction: 'OFFRAMP',
            assetTicker: ticker,
            tierName,
            tierBadgeLabel,
            tierBps,
            paymentMethod: 'ach',
            principalCents: 0,
            perenniaFeeCents: 0,
            targetNetCents: 0,
            stripeGatewayFeeCents: 0,
            grossChargeCents: 0,
            principalUsd: 0,
            perenniaFeeUsd: 0,
            stripeGatewayFeeUsd: 0,
            totalGrossChargeUsd: 0,
            grossUsd: 0,
            hardCostUsd: 0,
            guaranteedProfitUsd: 0,
            feeUsd: 0,
            effectiveFeePct: 0,
            protocolFeeFloorPct,
            minerOrPassDiscountActive: wholesaleActive,
            guestNetUsd: 0,
            estimatedTokens: 0,
            spotPriceUsd: liveSpot,
            competitorFeeUsd: 0,
            competitorNetUsd: 0,
            guestSavingsUsd: 0,
            moonpayFeeUsd: 0,
            coinbaseFeeUsd: 0,
            savingsVsMoonpayUsd: 0,
            savingsVsCoinbaseUsd: 0,
            routingTopology: 'Direct Bank Payout',
            railLabel: 'Bank ACH Payout',
            whaleWireFeeWaived: false,
            bundledUsdcFeeWaived: false,
            requiresInstitutionalWire: false,
            autoDefaultedToAch: true,
            circuitBreakerTripped: liveSpot <= 0,
            circuitBreakerReason:
                liveSpot <= 0
                    ? `Live oracle spot price for ${ticker} is offline; failing closed.`
                    : undefined
        };
    }

    const isWhaleWire =
        gross >= 2500 ||
        String(params.payoutMethod || '').toUpperCase() === 'WIRE';
    const perenniaFeeCents = Math.max(
        ONRAMP_MIN_FEE_FLOOR_CENTS,
        Math.ceil((grossCents * tierBps) / 10_000)
    );
    const railCostCents = isWhaleWire && gross >= 2500 ? 0 : 25;
    const totalFeeCents = perenniaFeeCents + railCostCents;
    const guaranteedProfitUsd = roundCents(perenniaFeeCents / 100);
    const hardCostUsd = roundCents(railCostCents / 100);
    const feeUsd = roundCents(totalFeeCents / 100);
    const effectiveFeePct = gross > 0 ? roundCents((feeUsd / gross) * 100) : 0;
    const guestNetUsd = roundCents(Math.max(0, gross - feeUsd));

    const moonpayFeeUsd = roundCents(Math.max(3.99, gross * 0.035));
    const coinbaseFeeUsd = roundCents(Math.max(2.99, gross * 0.025));
    const competitorFeeUsd = Math.max(moonpayFeeUsd, coinbaseFeeUsd);
    const competitorNetUsd = roundCents(Math.max(0, gross - competitorFeeUsd));
    const savingsVsMoonpayUsd = roundCents(Math.max(0, moonpayFeeUsd - feeUsd));
    const savingsVsCoinbaseUsd = roundCents(
        Math.max(0, coinbaseFeeUsd - feeUsd)
    );
    const guestSavingsUsd = Math.max(savingsVsMoonpayUsd, savingsVsCoinbaseUsd);
    const estimatedTokens = liveSpot > 0 ? gross / liveSpot : 0;

    let circuitBreakerTripped = false;
    let circuitBreakerReason: string | undefined = undefined;
    if (liveSpot <= 0) {
        circuitBreakerTripped = true;
        circuitBreakerReason = `Live oracle spot price for ${ticker} is offline; failing closed.`;
    } else if (perenniaFeeCents < ONRAMP_MIN_FEE_FLOOR_CENTS) {
        circuitBreakerTripped = true;
        circuitBreakerReason = `Off-ramp profit ($${guaranteedProfitUsd.toFixed(2)}) fell below the $2.50 minimum floor; failing closed.`;
    }

    return {
        direction: 'OFFRAMP',
        assetTicker: ticker,
        tierName,
        tierBadgeLabel,
        tierBps,
        paymentMethod: isWhaleWire ? 'wire' : 'ach',
        principalCents: grossCents,
        perenniaFeeCents,
        targetNetCents: Math.max(0, grossCents - totalFeeCents),
        stripeGatewayFeeCents: railCostCents,
        grossChargeCents: grossCents,
        principalUsd: roundCents(gross),
        perenniaFeeUsd: guaranteedProfitUsd,
        stripeGatewayFeeUsd: hardCostUsd,
        totalGrossChargeUsd: roundCents(gross),
        grossUsd: roundCents(gross),
        hardCostUsd,
        guaranteedProfitUsd,
        feeUsd,
        effectiveFeePct,
        protocolFeeFloorPct,
        minerOrPassDiscountActive: wholesaleActive,
        guestNetUsd,
        estimatedTokens,
        spotPriceUsd: liveSpot,
        competitorFeeUsd,
        competitorNetUsd,
        guestSavingsUsd,
        moonpayFeeUsd,
        coinbaseFeeUsd,
        savingsVsMoonpayUsd,
        savingsVsCoinbaseUsd,
        routingTopology:
            isWhaleWire && gross >= 2500
                ? 'Column N.A. / Mercury Same-Day Wire Settlement'
                : 'Column N.A. / Mercury Direct Bank ACH Settlement',
        railLabel:
            isWhaleWire && gross >= 2500
                ? 'Same-Day Bank Wire'
                : 'Bank ACH Payout',
        whaleWireFeeWaived: isWhaleWire && gross >= 2500,
        bundledUsdcFeeWaived: false,
        requiresInstitutionalWire: isInstitutionalWire,
        autoDefaultedToAch: !isWhaleWire,
        circuitBreakerTripped,
        circuitBreakerReason
    };
}

export function resolveOfframpDepositAddressPreview(
    ticker: string,
    masterTreasuryKasAddress = ''
): {
    address: string;
    routeLabel: string;
    confirmationsRequired: number;
} {
    const clean = String(ticker || 'KAS').trim().toUpperCase();
    if (clean === 'KAS' || clean === 'SILO') {
        return {
            address: masterTreasuryKasAddress.trim(),
            routeLabel: 'Perennia Treasury Settlement Address',
            confirmationsRequired: 10
        };
    }
    if (clean === 'BTC') {
        return {
            address: '',
            routeLabel: 'BTC Settlement Deposit Address',
            confirmationsRequired: 2
        };
    }
    if (clean === 'SOL') {
        return {
            address: '',
            routeLabel: 'SOL Settlement Deposit Address',
            confirmationsRequired: 12
        };
    }
    return {
        address: '',
        routeLabel: `${clean} Settlement Deposit Address`,
        confirmationsRequired: 6
    };
}

export function formatRetailSafeCopy(
    rawText: string | null | undefined
): string {
    const text = String(rawText || '');
    if (!text || identity.isCorporateAdmin) return text;
    return text
        .replace(/Dark Pool/gi, 'Liquidity Pool')
        .replace(/SIGHASH_SINGLE/gi, 'Atomic P2P')
        .replace(/VarDiff/gi, 'Auto-Difficulty');
}

export function evaluateAbaRoutingNumber(raw: string): AbaValidationResult {
    const cleanDigits = String(raw || '').replace(/\D/g, '').slice(0, 9);
    if (cleanDigits.length < 9) {
        return {
            cleanDigits,
            isComplete: false,
            checksumValid: false,
            institutionName: null,
            fedDistrict: null
        };
    }
    const d = cleanDigits.split('').map((c) => parseInt(c, 10));
    const prefix2 = parseInt(cleanDigits.slice(0, 2), 10);
    const validFedPrefix =
        (prefix2 >= 1 && prefix2 <= 12) ||
        (prefix2 >= 21 && prefix2 <= 32) ||
        (prefix2 >= 61 && prefix2 <= 72) ||
        prefix2 === 80;
    const sum =
        3 * (d[0] + d[3] + d[6]) +
        7 * (d[1] + d[4] + d[7]) +
        1 * (d[2] + d[5] + d[8]);
    const checksumValid = validFedPrefix && sum > 0 && sum % 10 === 0;
    const knownBank = ABA_INSTITUTION_DIRECTORY[cleanDigits] || null;
    const districtMap: Record<string, string> = {
        '01': 'Boston Fed (01)',
        '02': 'New York Fed (02)',
        '03': 'Philadelphia Fed (03)',
        '04': 'Cleveland Fed (04)',
        '05': 'Richmond Fed (05)',
        '06': 'Atlanta Fed (06)',
        '07': 'Chicago Fed (07)',
        '08': 'St. Louis Fed (08)',
        '09': 'Minneapolis Fed (09)',
        '10': 'Kansas City Fed (10)',
        '11': 'Dallas Fed (11)',
        '12': 'San Francisco Fed (12)'
    };
    const fedDistrict =
        districtMap[cleanDigits.slice(0, 2)] || 'Federal Reserve ABA';
    return {
        cleanDigits,
        isComplete: true,
        checksumValid,
        institutionName:
            knownBank ||
            (checksumValid
                ? `Verified Commercial Bank (${fedDistrict})`
                : null),
        fedDistrict
    };
}

export function getPayoutStageIndex(statusRaw: string): number {
    const st = String(statusRaw || '').toUpperCase();
    if (st.includes('DISPATCHED') || st.includes('COMPLETED')) return 4;
    if (st.includes('QUEUED') || st.includes('PROCESSING')) return 3;
    if (st.includes('NETTED') || st.includes('CONFIRMING')) return 2;
    return 1;
}

export async function downloadWireSlipPdf(
    sessionObj: any,
    fallbackFiatUsd = '250'
) {
    if (!browser || !sessionObj) return;
    try {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([612, 580]);
        const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
        const slateBg = rgb(0.04, 0.05, 0.07);
        const teal = rgb(0.094, 0.776, 0.647);
        const dark = rgb(0.1, 0.12, 0.16);
        const muted = rgb(0.42, 0.46, 0.52);
        page.drawRectangle({
            x: 0,
            y: 500,
            width: 612,
            height: 80,
            color: slateBg
        });
        page.drawText(
            'PERENNIA, LLC TREASURY — OFFICIAL MERCURY / STRIPE SETTLEMENT RECEIPT',
            {
                x: 36,
                y: 544,
                size: 11.5,
                font: fontBold,
                color: teal
            }
        );
        page.drawText(
            `ORDER ID: ${sessionObj.sessionId || sessionObj.orderId} • STATUS: ${sessionObj.status || 'COMPLETED'}`,
            {
                x: 36,
                y: 522,
                size: 9,
                font: fontMono,
                color: rgb(0.9, 0.92, 0.95)
            }
        );
        const wi = sessionObj.wireInstructions || {
            beneficiaryName: MERCURY_COLUMN_WIRE_INSTRUCTIONS.beneficiaryName,
            bankName: MERCURY_COLUMN_WIRE_INSTRUCTIONS.bankName,
            routingNumber: MERCURY_COLUMN_WIRE_INSTRUCTIONS.routingNumber,
            accountNumber: MERCURY_COLUMN_WIRE_INSTRUCTIONS.accountNumber,
            bankAddress: MERCURY_COLUMN_WIRE_INSTRUCTIONS.bankAddress,
            accountType: MERCURY_COLUMN_WIRE_INSTRUCTIONS.accountType
        };
        const targetTicker = String(
            sessionObj.targetAsset || 'KAS'
        ).toUpperCase();
        const estOut = Number(
            sessionObj.deliveredTokens ??
                sessionObj.estimatedTokens ??
                sessionObj.estimatedKas ??
                0
        );
        const grossVal = Number(
            sessionObj.totalGrossChargeUsd ??
                sessionObj.fiatAmountUsd ??
                fallbackFiatUsd ??
                0
        );
        const feeVal = Number(sessionObj.feeUsd || 0);
        const netConvertedVal = Number(
            sessionObj.principalUsd ??
                sessionObj.netUsdConverted ??
                Math.max(0, grossVal - feeVal)
        );
        const lines = [
            [
                'REFERENCE MEMO (REQUIRED)',
                String(sessionObj.wireMemo || sessionObj.sessionId)
            ],
            [
                'BENEFICIARY & BANK',
                `${wi.beneficiaryName || 'Perennia, LLC'} • ${wi.bankName || 'Column N.A. (Mercury)'}`
            ],
            [
                'ABA ROUTING / ACCOUNT #',
                `Routing: ${wi.routingNumber || '121145433'} • Account: ${wi.accountNumber || '580798008849901'}`
            ],
            [
                'BANK ADDRESS',
                String(
                    wi.bankAddress ||
                        MERCURY_COLUMN_WIRE_INSTRUCTIONS.bankAddress
                )
            ],
            ['GROSS USD CHARGED / WIRED', `$${grossVal.toFixed(2)} USD`],
            [
                'FEES & PRINCIPAL CONVERTED',
                `Total Fee: $${feeVal.toFixed(2)} USD • Principal: $${netConvertedVal.toFixed(2)} USD`
            ],
            [
                `${targetTicker} DELIVERED`,
                `${estOut.toFixed(4)} ${targetTicker}`
            ],
            [
                'SETTLEMENT DESTINATION',
                `${sessionObj.settlementTarget || 'SELF_CUSTODY'} (${identity.activeAddress || sessionObj.walletAddress || ''})`
            ],
            [
                'SETTLEMENT TX / REF',
                String(sessionObj.txHash || sessionObj.orderId || 'CONFIRMED')
            ]
        ];
        let y = 466;
        for (const [label, val] of lines) {
            page.drawRectangle({
                x: 36,
                y: y - 8,
                width: 540,
                height: 28,
                borderColor: rgb(0.84, 0.87, 0.9),
                borderWidth: 1
            });
            page.drawText(label, {
                x: 46,
                y: y + 2,
                size: 8,
                font: fontBold,
                color: muted
            });
            page.drawText(val.slice(0, 62), {
                x: 225,
                y: y + 2,
                size: 8.2,
                font: fontMono,
                color: dark
            });
            y -= 34;
        }
        page.drawText(
            'Verified by Perennia, LLC Fiat Bridge • Column N.A. / Mercury Checking (*9901) • Zero-PII Client Receipt.',
            {
                x: 36,
                y: 36,
                size: 7.5,
                font: fontReg,
                color: muted
            }
        );
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Perennia_Purchase_Receipt_${sessionObj.wireMemo || sessionObj.sessionId}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        ui.triggerMicroBadge(
            'dex_fiat_btn',
            'RECEIPT PDF DOWNLOADED ✓',
            '#18C6A5'
        );
    } catch (err) {
        console.error('Failed to generate Wire Slip PDF:', err);
    }
}

export async function downloadAchPayoutReceiptPdf(payout: any) {
    if (!browser || !payout) return;
    try {
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([612, 480]);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
        const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const slateBg = rgb(0.04, 0.05, 0.07);
        const teal = rgb(0.094, 0.776, 0.647);
        const dark = rgb(0.1, 0.12, 0.16);
        const muted = rgb(0.42, 0.46, 0.52);
        page.drawRectangle({
            x: 0,
            y: 400,
            width: 612,
            height: 80,
            color: slateBg
        });
        page.drawText(
            'PERENNIA, LLC TREASURY — ACH / WIRE OFF-RAMP RECEIPT',
            {
                x: 36,
                y: 444,
                size: 12.5,
                font: fontBold,
                color: teal
            }
        );
        page.drawText(
            `PAYOUT ID: ${payout.payout_id || payout.payoutId} • STATUS: ${payout.status}`,
            {
                x: 36,
                y: 422,
                size: 9,
                font: fontMono,
                color: rgb(0.9, 0.92, 0.95)
            }
        );
        const rows = [
            [
                'PAYOUT REFERENCE ID',
                String(payout.payout_id || payout.payoutId)
            ],
            [
                'SETTLEMENT STATUS',
                String(payout.status || 'QUEUED_FOR_TREASURY_DISPATCH')
            ],
            [
                'ACH / WIRE TRACE NUMBER',
                String(
                    payout.trace_id ||
                        payout.traceId ||
                        'AWAITING_BATCH_TRACE'
                )
            ],
            [
                'DESTINATION BANK RAIL',
                `${payout.payout_method || payout.payoutMethod || 'ACH'} Account Ending *${payout.bank_last4 || payout.bankLast4 || '0000'}`
            ],
            [
                'SOURCE ASSET SOLD',
                `${Number(payout.amount_crypto ?? payout.amountCrypto ?? 0).toFixed(4)} ${payout.source_asset || payout.sourceAsset || 'KAS'}`
            ],
            [
                'GROSS USD VALUE',
                `$${Number(payout.gross_usd ?? payout.grossUsd ?? 0).toFixed(2)} USD`
            ],
            [
                'PLATFORM FEE',
                `-$${Number(payout.fee_usd ?? payout.feeUsd ?? 0).toFixed(2)} USD`
            ],
            [
                'NET USD DISPATCHED TO BANK',
                `$${Number(payout.net_fiat_usd ?? payout.netFiatUsd ?? 0).toFixed(2)} USD`
            ],
            [
                'CREATED TIMESTAMP',
                String(
                    payout.created_at || payout.createdAt
                        ? new Date(
                              payout.created_at || payout.createdAt
                          ).toISOString()
                        : new Date().toISOString()
                )
            ]
        ];
        let y = 364;
        for (const [label, val] of rows) {
            page.drawRectangle({
                x: 36,
                y: y - 8,
                width: 540,
                height: 28,
                borderColor: rgb(0.84, 0.87, 0.9),
                borderWidth: 1
            });
            page.drawText(label, {
                x: 46,
                y: y + 2,
                size: 8,
                font: fontBold,
                color: muted
            });
            page.drawText(val.slice(0, 62), {
                x: 240,
                y: y + 2,
                size: 8.5,
                font: fontMono,
                color: dark
            });
            y -= 34;
        }
        page.drawText(
            'Verified by Perennia, LLC Fiat Bridge • Zero-PII Client Receipt.',
            {
                x: 36,
                y: 32,
                size: 7.5,
                font: fontReg,
                color: muted
            }
        );
        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Perennia_ACH_Receipt_${payout.payout_id || payout.payoutId}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    } catch (err) {
        console.error('Failed to compile ACH receipt PDF:', err);
    }
}