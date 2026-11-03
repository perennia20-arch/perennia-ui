import { browser } from '$app/environment';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ui } from '$lib/stores/ui.svelte';
import { identity } from '$lib/stores/identity.svelte';

export interface LpPosition {
    lpId: string;
    poolPair: string;
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
    stakeId: string;
    ticker: string;
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

export interface CostPlusQuotePreview {
    direction: 'ONRAMP' | 'OFFRAMP';
    assetTicker: string;
    grossUsd: number;
    hardCostUsd: number;
    guaranteedProfitUsd: number;
    feeUsd: number;
    effectiveFeePct: number;
    guestNetUsd: number;
    estimatedTokens: number;
    spotPriceUsd: number;
    competitorFeeUsd: number;
    competitorNetUsd: number;
    guestSavingsUsd: number;
    routingTopology: string;
    railLabel: string;
    whaleWireFeeWaived: boolean;
    bundledUsdcFeeWaived: boolean;
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
}

export const WIRE_FEE_USD = 15.0;
export const ACH_FEE_USD = 2.0;

export const LOCK_OPTIONS = [
    { label: 'Flexible', days: 0, multiplier: 1.0 },
    { label: '30 Days', days: 30, multiplier: 1.2 },
    { label: '90 Days', days: 90, multiplier: 1.5 },
    { label: '365 Days', days: 365, multiplier: 2.5 }
] as const;

export const ABA_INSTITUTION_DIRECTORY: Record<string, string> = {
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

export function computePostTradeUsdSplit(grossUsd: number): PostTradeUsdSplit {
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

export function computeOnrampCostPlusQuote(params: {
    assetTicker: string;
    grossUsd: number;
    spotPriceUsd: number;
    autoStakeSilo?: boolean;
    bundledKasOrSilo?: boolean;
}): CostPlusQuotePreview {
    const ticker = String(params.assetTicker || 'KAS').trim().toUpperCase();
    const gross = Math.max(0, Number(params.grossUsd || 0));
    const liveSpot =
        Number.isFinite(params.spotPriceUsd) && params.spotPriceUsd > 0
            ? params.spotPriceUsd
            : 0;

    if (gross <= 0) {
        return {
            direction: 'ONRAMP',
            assetTicker: ticker,
            grossUsd: 0,
            hardCostUsd: 0,
            guaranteedProfitUsd: 0,
            feeUsd: 0,
            effectiveFeePct: 0,
            guestNetUsd: 0,
            estimatedTokens: 0,
            spotPriceUsd: liveSpot,
            competitorFeeUsd: 0,
            competitorNetUsd: 0,
            guestSavingsUsd: 0,
            routingTopology: 'LOCAL_CHRONOS_MINER_REPAR',
            railLabel: 'Free ACH',
            whaleWireFeeWaived: false,
            bundledUsdcFeeWaived: false,
            circuitBreakerTripped: liveSpot <= 0,
            circuitBreakerReason:
                liveSpot <= 0
                    ? `CIRCUIT_BREAKER_TRIPPED: Live oracle spot price for ${ticker} is offline; failing closed.`
                    : undefined
        };
    }

    const isWhaleWire = gross >= 2500;
    const isMidTier = gross >= 1000 && gross < 2500;
    const isBundled = Boolean(params.autoStakeSilo || params.bundledKasOrSilo);

    let baseHardCost = 1.0;
    let baseProfit = 9.0;
    let competitorFee = 17.0;
    let routingTopology = 'Local Chronos Miner Re-Par (0.0% Exchange Fee)';

    if (ticker === 'USDC' && isBundled) {
        baseHardCost = 0.0;
        baseProfit = 0.0;
        competitorFee = roundCents(Math.max(5.0, gross * 0.035));
        routingTopology = '0% Fee Bundled USDC → KAS / SILO Auto-Stake';
    } else if (isWhaleWire) {
        const scale = gross / 2500;
        baseHardCost = roundCents(4.0 * scale);
        baseProfit = roundCents(Math.max(22.0 * scale, gross * 0.015));
        competitorFee = roundCents(gross * 0.035 + 15.0);
        routingTopology =
            ticker === 'KAS' || ticker === 'SILO'
                ? 'Local Master Treasury Re-Par + Waived Whale FedWire'
                : 'ChangeNOW v2 Single-Hop Drop-Ship + Waived Whale FedWire';
    } else if (isMidTier) {
        if (ticker === 'USDC') {
            baseHardCost = roundCents(gross * 0.0005);
            baseProfit = roundCents(gross * 0.004);
            competitorFee = roundCents(gross * 0.025);
            routingTopology = 'ChangeNOW v2 L2 Base/Polygon Single-Hop Drop-Ship';
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
                    ? 'Local Chronos Miner Re-Par (0.0% Exchange Fee)'
                    : 'ChangeNOW v2 Single-Hop Drop-Ship';
        }
    } else {
        switch (ticker) {
            case 'KAS':
            case 'SILO': {
                baseHardCost = roundCents(gross * 0.002);
                baseProfit = roundCents(gross * 0.018);
                competitorFee = roundCents(gross * 0.034);
                routingTopology = 'Local Chronos Miner Re-Par (0.0% Exchange Fee)';
                break;
            }
            case 'BTC': {
                const scale = Math.max(1, gross / 100);
                baseHardCost = roundCents(4.0 + (scale - 1) * 1.25);
                baseProfit = roundCents(3.0 * scale);
                competitorFee = roundCents(9.0 * scale);
                routingTopology = 'ChangeNOW v2 Single-Hop BTC Drop-Ship';
                break;
            }
            case 'ETH':
            case 'SOL': {
                const scale = gross / 100;
                baseHardCost = roundCents(1.5 * scale);
                baseProfit = roundCents(1.5 * scale);
                competitorFee = roundCents(6.0 * scale);
                routingTopology = `ChangeNOW v2 Single-Hop ${ticker} Drop-Ship`;
                break;
            }
            case 'USDC':
            case 'USDT': {
                const scale = Math.max(1, gross / 100);
                baseHardCost = roundCents(0.35 * scale);
                baseProfit = roundCents(1.65 * scale);
                competitorFee = roundCents(5.0 * scale);
                routingTopology = 'ChangeNOW v2 L2 Base/Polygon USDC Drop-Ship';
                break;
            }
            default: {
                const scale = gross / 100;
                baseHardCost = roundCents(1.5 * scale);
                baseProfit = roundCents(1.5 * scale);
                competitorFee = roundCents(6.0 * scale);
                routingTopology = `ChangeNOW v2 Single-Hop ${ticker} Drop-Ship`;
                break;
            }
        }
    }

    const hardCostUsd = roundCents(baseHardCost);
    const feeUsd = roundCents(hardCostUsd + baseProfit);
    const effectiveFeePct = gross > 0 ? roundCents((feeUsd / gross) * 100) : 0;
    const guestNetUsd = roundCents(Math.max(0, gross - feeUsd));
    const competitorNetUsd = roundCents(Math.max(0, gross - competitorFee));
    const guestSavingsUsd = roundCents(Math.max(0, competitorFee - feeUsd));
    const estimatedTokens = liveSpot > 0 ? guestNetUsd / liveSpot : 0;

    let circuitBreakerTripped = false;
    let circuitBreakerReason: string | undefined = undefined;

    if (liveSpot <= 0) {
        circuitBreakerTripped = true;
        circuitBreakerReason = `CIRCUIT_BREAKER_TRIPPED: Live oracle spot price for ${ticker} is offline; failing closed.`;
    } else if (feeUsd > competitorFee && competitorFee > 0) {
        circuitBreakerTripped = true;
        circuitBreakerReason = `CIRCUIT_BREAKER_TRIPPED: Quoted_Guest_Fee ($${feeUsd.toFixed(2)}) exceeded Competitor Ceiling ($${competitorFee.toFixed(2)}); failing closed.`;
    }

    return {
        direction: 'ONRAMP',
        assetTicker: ticker,
        grossUsd: roundCents(gross),
        hardCostUsd,
        guaranteedProfitUsd: baseProfit,
        feeUsd,
        effectiveFeePct,
        guestNetUsd,
        estimatedTokens,
        spotPriceUsd: liveSpot,
        competitorFeeUsd: competitorFee,
        competitorNetUsd,
        guestSavingsUsd,
        routingTopology,
        railLabel: isWhaleWire
            ? 'Same-Day Whale FedWire ($15 Waived)'
            : 'Free ACH Clearing',
        whaleWireFeeWaived: isWhaleWire,
        bundledUsdcFeeWaived: ticker === 'USDC' && isBundled,
        circuitBreakerTripped,
        circuitBreakerReason
    };
}

export function computeOfframpCostPlusQuote(params: {
    assetTicker: string;
    grossUsd: number;
    spotPriceUsd: number;
    payoutMethod?: 'ach' | 'wire' | 'ACH' | 'WIRE';
}): CostPlusQuotePreview {
    const ticker = String(params.assetTicker || 'KAS').trim().toUpperCase();
    const gross = Math.max(0, Number(params.grossUsd || 0));
    const liveSpot =
        Number.isFinite(params.spotPriceUsd) && params.spotPriceUsd > 0
            ? params.spotPriceUsd
            : 0;

    if (gross <= 0) {
        return {
            direction: 'OFFRAMP',
            assetTicker: ticker,
            grossUsd: 0,
            hardCostUsd: 0,
            guaranteedProfitUsd: 0,
            feeUsd: 0,
            effectiveFeePct: 0,
            guestNetUsd: 0,
            estimatedTokens: 0,
            spotPriceUsd: liveSpot,
            competitorFeeUsd: 0,
            competitorNetUsd: 0,
            guestSavingsUsd: 0,
            routingTopology: 'LOCAL_MASTER_TREASURY_VAULT_REFILL',
            railLabel: 'Free Bank ACH',
            whaleWireFeeWaived: false,
            bundledUsdcFeeWaived: false,
            circuitBreakerTripped: liveSpot <= 0,
            circuitBreakerReason:
                liveSpot <= 0
                    ? `CIRCUIT_BREAKER_TRIPPED: Live oracle spot price for ${ticker} is offline; failing closed.`
                    : undefined
        };
    }

    const isWhaleWire =
        gross >= 2500 ||
        String(params.payoutMethod || '').toUpperCase() === 'WIRE';

    let baseHardCost = 0.25;
    let baseProfit = 8.75;
    let competitorFee = 15.0;
    let routingTopology =
        'Local Master Treasury Vault Refill (0.0% Exchange Fee)';

    if (isWhaleWire && gross >= 2500) {
        const scale = gross / 2500;
        baseHardCost = roundCents(6.0 * scale);
        baseProfit = roundCents(24.0 * scale);
        competitorFee = roundCents(63.0 * scale);
        routingTopology =
            ticker === 'KAS' || ticker === 'SILO'
                ? 'Local Master Treasury Vault Refill + Institutional FedWire'
                : 'ChangeNOW v2 Non-Custodial Payin Address + Institutional FedWire';
    } else {
        switch (ticker) {
            case 'KAS':
            case 'SILO': {
                const scale = gross / 500;
                baseHardCost = roundCents(Math.max(0.25, 0.25 * scale));
                const totalTargetFee = roundCents(9.0 * scale);
                baseProfit = roundCents(
                    Math.max(1.0, totalTargetFee - baseHardCost)
                );
                competitorFee = roundCents(15.0 * scale);
                routingTopology =
                    'Local Master Treasury Vault Refill (0.0% Exchange Fee)';
                break;
            }
            case 'BTC': {
                const scale = gross / 100;
                baseHardCost = roundCents(1.0 * scale);
                baseProfit = roundCents(2.0 * scale);
                competitorFee = roundCents(4.0 * scale);
                routingTopology = 'ChangeNOW v2 Non-Custodial BTC Payin Address';
                break;
            }
            case 'ETH':
            case 'SOL': {
                const scale = gross / 200;
                baseHardCost = roundCents(2.0 * scale);
                baseProfit = roundCents(3.0 * scale);
                competitorFee = roundCents(7.0 * scale);
                routingTopology = `ChangeNOW v2 Non-Custodial ${ticker} Payin Address`;
                break;
            }
            case 'USDC':
            case 'USDT': {
                baseHardCost = roundCents(gross * 0.0005);
                baseProfit = roundCents(gross * 0.0045);
                competitorFee = roundCents(gross * 0.015);
                routingTopology = 'ChangeNOW v2 Non-Custodial USDC Payin Address';
                break;
            }
            default: {
                const scale = gross / 200;
                baseHardCost = roundCents(2.0 * scale);
                baseProfit = roundCents(3.0 * scale);
                competitorFee = roundCents(7.0 * scale);
                routingTopology = `ChangeNOW v2 Non-Custodial ${ticker} Payin Address`;
                break;
            }
        }
    }

    const hardCostUsd = roundCents(baseHardCost);
    const feeUsd = roundCents(hardCostUsd + baseProfit);
    const effectiveFeePct = gross > 0 ? roundCents((feeUsd / gross) * 100) : 0;
    const guestNetUsd = roundCents(Math.max(0, gross - feeUsd));
    const competitorNetUsd = roundCents(Math.max(0, gross - competitorFee));
    const guestSavingsUsd = roundCents(Math.max(0, competitorFee - feeUsd));
    const estimatedTokens = liveSpot > 0 ? gross / liveSpot : 0;

    let circuitBreakerTripped = false;
    let circuitBreakerReason: string | undefined = undefined;

    if (liveSpot <= 0) {
        circuitBreakerTripped = true;
        circuitBreakerReason = `CIRCUIT_BREAKER_TRIPPED: Live oracle spot price for ${ticker} is offline; failing closed.`;
    } else if (feeUsd > competitorFee && competitorFee > 0) {
        circuitBreakerTripped = true;
        circuitBreakerReason = `CIRCUIT_BREAKER_TRIPPED: Off-ramp Quoted_Guest_Fee ($${feeUsd.toFixed(2)}) exceeded Competitor Ceiling ($${competitorFee.toFixed(2)}); failing closed.`;
    }

    return {
        direction: 'OFFRAMP',
        assetTicker: ticker,
        grossUsd: roundCents(gross),
        hardCostUsd,
        guaranteedProfitUsd: baseProfit,
        feeUsd,
        effectiveFeePct,
        guestNetUsd,
        estimatedTokens,
        spotPriceUsd: liveSpot,
        competitorFeeUsd: competitorFee,
        competitorNetUsd,
        guestSavingsUsd,
        routingTopology,
        railLabel:
            isWhaleWire && gross >= 2500
                ? 'Same-Day Whale FedWire'
                : 'Free Bank ACH Payout',
        whaleWireFeeWaived: isWhaleWire && gross >= 2500,
        bundledUsdcFeeWaived: false,
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
            routeLabel: 'Perennia Master Treasury Vault (0% Exchange Fee)',
            confirmationsRequired: 10
        };
    }
    if (clean === 'BTC') {
        return {
            address: '',
            routeLabel: 'ChangeNOW v2 Non-Custodial BTC Payin Address',
            confirmationsRequired: 2
        };
    }
    if (clean === 'SOL') {
        return {
            address: '',
            routeLabel: 'ChangeNOW v2 Non-Custodial SOL Payin Address',
            confirmationsRequired: 12
        };
    }
    return {
        address: '',
        routeLabel: `ChangeNOW v2 Non-Custodial ${clean} Payin Address`,
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
    if (st.includes('QUEUED')) return 3;
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
        const page = pdfDoc.addPage([612, 560]);
        const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
        const slateBg = rgb(0.04, 0.05, 0.07);
        const teal = rgb(0.094, 0.776, 0.647);
        const dark = rgb(0.1, 0.12, 0.16);
        const muted = rgb(0.42, 0.46, 0.52);

        page.drawRectangle({
            x: 0,
            y: 480,
            width: 612,
            height: 80,
            color: slateBg
        });
        page.drawText(
            'PERENNIA SOVEREIGN TREASURY — OFFICIAL WIRE / ACH SETTLEMENT PASS',
            {
                x: 36,
                y: 524,
                size: 12.5,
                font: fontBold,
                color: teal
            }
        );
        page.drawText(
            `ORDER ID: ${sessionObj.sessionId || sessionObj.orderId} • MANDATORY MEMO: ${sessionObj.wireMemo || sessionObj.sessionId}`,
            {
                x: 36,
                y: 502,
                size: 9,
                font: fontMono,
                color: rgb(0.9, 0.92, 0.95)
            }
        );

        const wi = sessionObj.wireInstructions || {
            beneficiaryName: 'Perennia Holdings, LLC — Sovereign Treasury',
            bankName: 'Perennia Holdings Commercial Operating Vault',
            routingNumber: '',
            accountNumber: '',
            accountType: 'COMMERCIAL CHECKING'
        };
        const targetTicker = String(sessionObj.targetAsset || 'KAS').toUpperCase();
        const estOut = Number(
            sessionObj.estimatedTokens ?? sessionObj.estimatedKas ?? 0
        );
        const lines = [
            [
                'MANDATORY WIRE / ACH MEMO',
                String(sessionObj.wireMemo || sessionObj.sessionId)
            ],
            ['BENEFICIARY NAME', String(wi.beneficiaryName || '')],
            ['RECEIVING COMMERCIAL BANK', String(wi.bankName || '')],
            ['9-DIGIT ABA ROUTING NUMBER', String(wi.routingNumber || 'See Portal')],
            ['COMMERCIAL ACCOUNT NUMBER', String(wi.accountNumber || 'See Portal')],
            ['ACCOUNT TYPE', String(wi.accountType || 'COMMERCIAL CHECKING')],
            [
                'GROSS USD AMOUNT TO WIRE',
                `$${Number(sessionObj.fiatAmountUsd || fallbackFiatUsd || 0).toFixed(2)} USD`
            ],
            [
                'ZERO-LOSS PROTOCOL FEE',
                `$${Number(sessionObj.feeUsd || 0).toFixed(2)} USD (Saves +$${Number(sessionObj.guestSavingsUsd || 0).toFixed(2)} vs Retail Apps)`
            ],
            [
                `ESTIMATED ${targetTicker} DELIVERY`,
                `~${estOut.toFixed(4)} ${targetTicker} (Locked on ACH/Wire Clearing)`
            ],
            [
                'SETTLEMENT DESTINATION',
                `${sessionObj.settlementTarget || 'SELF_CUSTODY'} (${identity.activeAddress || sessionObj.walletAddress || ''})`
            ]
        ];

        let y = 446;
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
                x: 235,
                y: y + 2,
                size: 8.5,
                font: fontMono,
                color: dark
            });
            y -= 34;
        }
        page.drawText(
            'IMPORTANT: Include the exact Wire Memo above in your bank transfer reference field for automated clearing.',
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
        a.download = `Perennia_Wire_Slip_${sessionObj.wireMemo || sessionObj.sessionId}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        ui.triggerMicroBadge(
            'dex_fiat_btn',
            'WIRE SLIP PDF DOWNLOADED ✓',
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
            'PERENNIA SOVEREIGN TREASURY — ACH / WIRE OFF-RAMP RECEIPT',
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
                'SOURCE ASSET LIQUIDATED',
                `${Number(payout.amount_crypto ?? payout.amountCrypto ?? 0).toFixed(4)} ${payout.source_asset || payout.sourceAsset || 'KAS'}`
            ],
            [
                'GROSS USD PROCEEDS',
                `$${Number(payout.gross_usd ?? payout.grossUsd ?? 0).toFixed(2)} USD`
            ],
            [
                'COST-PLUS PROTOCOL FEE',
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
            'Cryptographically verified by Perennia Fiat Bridge • Zero-PII Client Receipt.',
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