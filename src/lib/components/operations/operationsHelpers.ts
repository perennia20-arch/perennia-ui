import { identity } from '$lib/stores/identity.svelte';
import { operations } from '$lib/stores/operations.svelte';
import {
    atomicDecimalsForAsset,
    treasury,
    type UnifiedAsset
} from '$lib/stores/treasury.svelte';
import {
    getChainExplorerTxUrl,
    signAndBroadcastVaultCancelPskt,
    txState
} from '$lib/stores/transaction.svelte';
import { deriveHoneycombKeys } from '$lib/crypto/honeycomb';
import { decryptVault } from '$lib/utils/vaultCrypto';
import {
    BPS_SCALE,
    KAS_DECIMALS,
    LIVE_PRICING_UNAVAILABLE_MESSAGE,
    MAX_BPS,
    ORACLE_E8_DECIMALS,
    USD_MICROS_DECIMALS,
    atomicToUsdMicrosFloor,
    formatAtomicToDecimal,
    mulBpsCeil,
    mulBpsFloor,
    normalizeAllocationBps,
    parseDecimalToAtomic,
    parseKasDecimalToSompi,
    parseSompiU64,
    parseU128Str,
    type EpochPayoutOutboxItem,
    type MatureAccrualSnapshot,
    type RegisterVaultLockPayload,
    type SettlementReceiptRecord,
    type SolvencyProofSnapshot,
    type ThermostatValveRecord,
    type ThermostatValveType,
    type U128Str,
    type UpsertThermostatValveInput,
    type VaultCancelPsktResponse,
    type VaultKind,
    type VaultLockRecord
} from '$lib/crypto/atomicMath';
import type {
    Worker,
    Sector,
    PlantAssetTarget,
    PairFeeRateBps,
    PairReserveState,
    PairTermOption
} from '$lib/stores/type';

export type ViewSector = Sector & {
    width?: number;
    allocationBps?: number;
    vaultId?: string;
    pendingKaspa?: number;
};

export interface KaspaMinerSpec {
    id: string;
    model: string;
    manufacturer: 'IceRiver' | 'Bitmain' | 'Goldshell';
    hashrateTh: number;
    displayHashrate: string;
    powerWatts: number;
    port: 3332 | 3333 | 3334;
    tierLabel: 'LOW AUTO-DIFF' | 'MID AUTO-DIFF' | 'HIGH AUTO-DIFF';
}

export interface MineableKrc20VaultInfo {
    vaultId: string;
    tokenTicker: string;
    vaultLabel: string;
    totalFundedTokens: number;
    remainingVaultTokens: number;
    dailyEmissionTokens: number;
    distributedTokens: number;
    minHashrateThs: number;
    syndicateSectorEnabled: boolean;
    activeMinersCount: number;
    status: string;
}

export interface ThermostatValveDraft {
    priorityOrder: 1 | 2 | 3 | 4;
    valveType: ThermostatValveType;
    title: string;
    subtitle: string;
    targetAsset: string;
    targetNetwork: string;
    destinationAddress: string;
    targetCapKas: string;
    targetCapUsd: string;
    filledEpochSompi: U128Str;
    filledEpochUsdMicros: U128Str;
    externalRailRef: string;
    zktlsBillerCommitmentHex: string;
    isEnabled: boolean;
}

export interface SovereignOperationsBundle {
    accrual: MatureAccrualSnapshot | null;
    outbox: EpochPayoutOutboxItem[];
    vaults: VaultLockRecord[];
    valves: ThermostatValveRecord[];
    receipts: SettlementReceiptRecord[];
    solvency: SolvencyProofSnapshot | null;
    livePricingUnavailable: boolean;
}

export const STRATUM_HOST = 'pool.perennia.io';
export const DEFAULT_RESERVE_PAYOUT_KAS = 50.0;
export const DEFAULT_VAULT_THRESHOLD_KAS = '25';
export const KASPA_DIFF_CONSTANT = 4_294_967_296.0;
export const POOL_FEE_RATE = 0.01;

export const DEFAULT_PAIR_FEE_RATE_BPS: PairFeeRateBps = 100;
export const PAIR_FEE_RATE_PRESETS: ReadonlyArray<{ bps: PairFeeRateBps; label: string }> = [
    { bps: 30, label: '0.3%' },
    { bps: 100, label: '1.0%' },
    { bps: 250, label: '2.5%' }
];
export const DEFAULT_PAIR_TERM: PairTermOption = 'OPEN';
export const PAIR_TERM_PRESETS: ReadonlyArray<{
    id: PairTermOption;
    label: string;
    days: number | null;
}> = [
    { id: 'OPEN', label: 'OPEN', days: null },
    { id: '7D', label: '7D', days: 7 },
    { id: '30D', label: '30D', days: 30 },
    { id: '90D', label: '90D', days: 90 }
];

export const THERMOSTAT_VALVE_META: Record<
    1 | 2 | 3 | 4,
    { valveType: ThermostatValveType; title: string; subtitle: string; defaultAsset: string }
> = {
    1: {
        valveType: 'VALVE_1_ELECTRIC_BILL',
        title: 'Power & Utility Bill',
        subtitle: 'Pays verified utility invoices first each cycle',
        defaultAsset: 'USDC'
    },
    2: {
        valveType: 'VALVE_2_AGENT_X402_FLOOR',
        title: 'Automated Compute Budget',
        subtitle: 'Maintains operating floor for automated services',
        defaultAsset: 'USDC'
    },
    3: {
        valveType: 'VALVE_3_JIT_VISA_CEILING',
        title: 'Card Spending Buffer',
        subtitle: 'Tops up card spending balance up to your cap',
        defaultAsset: 'USD'
    },
    4: {
        valveType: 'VALVE_4_TANGEM_COLD_OR_PLANT',
        title: 'Cold Storage & Long-Term Reserve',
        subtitle: 'Routes remaining rewards to cold wallet or liquidity split',
        defaultAsset: 'KAS'
    }
};

export const KASPA_MINER_CATALOG: KaspaMinerSpec[] = [
    { id: 'ks0', model: 'IceRiver KS0', manufacturer: 'IceRiver', hashrateTh: 0.1, displayHashrate: '100 GH/s', powerWatts: 65, port: 3332, tierLabel: 'LOW AUTO-DIFF' },
    { id: 'ks0-pro', model: 'IceRiver KS0 Pro', manufacturer: 'IceRiver', hashrateTh: 0.2, displayHashrate: '200 GH/s', powerWatts: 100, port: 3332, tierLabel: 'LOW AUTO-DIFF' },
    { id: 'ks0-ultra', model: 'IceRiver KS0 Ultra', manufacturer: 'IceRiver', hashrateTh: 0.4, displayHashrate: '400 GH/s', powerWatts: 100, port: 3332, tierLabel: 'LOW AUTO-DIFF' },
    { id: 'ks1', model: 'IceRiver KS1', manufacturer: 'IceRiver', hashrateTh: 1.0, displayHashrate: '1.0 TH/s', powerWatts: 600, port: 3333, tierLabel: 'MID AUTO-DIFF' },
    { id: 'ka-box', model: 'Goldshell KA Box', manufacturer: 'Goldshell', hashrateTh: 1.18, displayHashrate: '1.18 TH/s', powerWatts: 400, port: 3333, tierLabel: 'MID AUTO-DIFF' },
    { id: 'ka-box-pro', model: 'Goldshell KA Box Pro', manufacturer: 'Goldshell', hashrateTh: 1.6, displayHashrate: '1.6 TH/s', powerWatts: 600, port: 3333, tierLabel: 'MID AUTO-DIFF' },
    { id: 'ks2-lite', model: 'IceRiver KS2 Lite', manufacturer: 'IceRiver', hashrateTh: 2.0, displayHashrate: '2.0 TH/s', powerWatts: 500, port: 3333, tierLabel: 'MID AUTO-DIFF' },
    { id: 'ks2', model: 'IceRiver KS2', manufacturer: 'IceRiver', hashrateTh: 2.0, displayHashrate: '2.0 TH/s', powerWatts: 1200, port: 3333, tierLabel: 'MID AUTO-DIFF' },
    { id: 'ks7-lite', model: 'IceRiver KS7 Lite', manufacturer: 'IceRiver', hashrateTh: 4.2, displayHashrate: '4.2 TH/s', powerWatts: 500, port: 3334, tierLabel: 'HIGH AUTO-DIFF' },
    { id: 'ks3l', model: 'IceRiver KS3L', manufacturer: 'IceRiver', hashrateTh: 5.0, displayHashrate: '5.0 TH/s', powerWatts: 3200, port: 3333, tierLabel: 'MID AUTO-DIFF' },
    { id: 'e-ka1m', model: 'Goldshell E-KA1M', manufacturer: 'Goldshell', hashrateTh: 5.5, displayHashrate: '5.5 TH/s', powerWatts: 1800, port: 3333, tierLabel: 'MID AUTO-DIFF' },
    { id: 'ks3m', model: 'IceRiver KS3M', manufacturer: 'IceRiver', hashrateTh: 6.0, displayHashrate: '6.0 TH/s', powerWatts: 3400, port: 3333, tierLabel: 'MID AUTO-DIFF' },
    { id: 'ks3', model: 'IceRiver KS3', manufacturer: 'IceRiver', hashrateTh: 8.0, displayHashrate: '8.0 TH/s', powerWatts: 3200, port: 3333, tierLabel: 'MID AUTO-DIFF' },
    { id: 'antminer-ks3', model: 'Antminer KS3', manufacturer: 'Bitmain', hashrateTh: 9.4, displayHashrate: '9.4 TH/s', powerWatts: 3500, port: 3333, tierLabel: 'MID AUTO-DIFF' },
    { id: 'ks5l', model: 'IceRiver KS5L', manufacturer: 'IceRiver', hashrateTh: 12.0, displayHashrate: '12.0 TH/s', powerWatts: 3400, port: 3334, tierLabel: 'HIGH AUTO-DIFF' },
    { id: 'ks5m', model: 'IceRiver KS5M', manufacturer: 'IceRiver', hashrateTh: 15.0, displayHashrate: '15.0 TH/s', powerWatts: 3400, port: 3334, tierLabel: 'HIGH AUTO-DIFF' },
    { id: 'antminer-ks5', model: 'Antminer KS5', manufacturer: 'Bitmain', hashrateTh: 20.0, displayHashrate: '20.0 TH/s', powerWatts: 3000, port: 3334, tierLabel: 'HIGH AUTO-DIFF' },
    { id: 'antminer-ks5-pro', model: 'Antminer KS5 Pro', manufacturer: 'Bitmain', hashrateTh: 21.0, displayHashrate: '21.0 TH/s', powerWatts: 3150, port: 3334, tierLabel: 'HIGH AUTO-DIFF' },
    { id: 'ks5', model: 'IceRiver KS5', manufacturer: 'IceRiver', hashrateTh: 24.0, displayHashrate: '24.0 TH/s', powerWatts: 3600, port: 3334, tierLabel: 'HIGH AUTO-DIFF' },
    { id: 'ks7', model: 'IceRiver KS7', manufacturer: 'IceRiver', hashrateTh: 30.0, displayHashrate: '30.0 TH/s', powerWatts: 3500, port: 3334, tierLabel: 'HIGH AUTO-DIFF' },
    { id: 'antminer-ks7-40t', model: 'Antminer KS7 (40T)', manufacturer: 'Bitmain', hashrateTh: 40.0, displayHashrate: '40.0 TH/s', powerWatts: 3080, port: 3334, tierLabel: 'HIGH AUTO-DIFF' },
    { id: 'antminer-ks7-45t', model: 'Antminer KS7 (45T)', manufacturer: 'Bitmain', hashrateTh: 45.0, displayHashrate: '45.0 TH/s', powerWatts: 3465, port: 3334, tierLabel: 'HIGH AUTO-DIFF' }
];

export const INITIAL_MINEABLE_KRC20_VAULTS: MineableKrc20VaultInfo[] = [
    {
        vaultId: 'vault-silo-genesis',
        tokenTicker: 'SILO',
        vaultLabel: 'Perennia SILO Proof-of-Hashrate Vault',
        totalFundedTokens: 5_000_000,
        remainingVaultTokens: 4_850_000,
        dailyEmissionTokens: 13_698,
        distributedTokens: 150_000,
        minHashrateThs: 0.1,
        syndicateSectorEnabled: true,
        activeMinersCount: 14,
        status: 'ACTIVE'
    },
    {
        vaultId: 'vault-bedrck-genesis',
        tokenTicker: 'BEDRCK',
        vaultLabel: 'Bedrock Sovereign Mining Vault',
        totalFundedTokens: 10_000_000,
        remainingVaultTokens: 9_800_000,
        dailyEmissionTokens: 27_397,
        distributedTokens: 200_000,
        minHashrateThs: 0.1,
        syndicateSectorEnabled: true,
        activeMinersCount: 9,
        status: 'ACTIVE'
    },
    {
        vaultId: 'vault-nacho-syndicate',
        tokenTicker: 'NACHO',
        vaultLabel: 'NACHO Community Hashrate Vault',
        totalFundedTokens: 25_000_000,
        remainingVaultTokens: 24_500_000,
        dailyEmissionTokens: 50_000,
        distributedTokens: 500_000,
        minHashrateThs: 0.1,
        syndicateSectorEnabled: true,
        activeMinersCount: 28,
        status: 'ACTIVE'
    }
];

/**
 * Reads sector allocation strictly as integer basis points (`0..=10_000`).
 */
export function readSectorAllocationBps(sector: {
    allocationBps?: unknown;
    allocationPercentage?: unknown;
}): number {
    try {
        const bps = normalizeAllocationBps({
            allocationBps: sector.allocationBps,
            allocationPercentage: sector.allocationPercentage
        });
        return Math.max(0, Math.min(MAX_BPS, Math.trunc(bps)));
    } catch {
        return 0;
    }
}

/**
 * Parses a decimal percentage input (`"0"`..`"100.00"`) into integer basis points (`0..=maxBps`) without JS float math.
 */
export function parsePctInputToBps(rawInput: string | number, maxBps: number = MAX_BPS): number {
    const cap = Math.max(0, Math.min(MAX_BPS, Math.trunc(maxBps)));
    const cleaned = String(rawInput ?? '').trim();
    if (!cleaned) return 0;
    try {
        const bps = Number(parseDecimalToAtomic(cleaned, 2, 'floor'));
        return Math.max(0, Math.min(cap, bps));
    } catch {
        return 0;
    }
}

/**
 * Formats integer basis points (`0..=10_000`) into a clean percentage display string (`0`..`100`).
 */
export function formatBpsToPctDisplay(
    bps: number,
    maxFractionDigits = 2,
    trimZeros = true
): string {
    const clamped = Math.max(0, Math.min(MAX_BPS, Math.trunc(Number(bps) || 0)));
    return formatAtomicToDecimal(BigInt(clamped), 2, maxFractionDigits, trimZeros);
}

/**
 * Converts integer basis points (0..=10_000) to a bounded numeric percentage at UI render boundaries.
 */
export function bpsToPctNumber(bps: number): number {
    const clamped = Math.max(0, Math.min(MAX_BPS, Math.trunc(Number(bps) || 0)));
    return Number(formatAtomicToDecimal(BigInt(clamped), 2, 2, true));
}

/**
 * Sums total allocated basis points across sectors (`0..=10_000`).
 */
export function computeTotalAllocatedBps(
    sectors: ReadonlyArray<{ allocationBps?: unknown; allocationPercentage?: unknown }>
): number {
    let sum = 0;
    for (const sec of sectors || []) {
        sum += readSectorAllocationBps(sec);
    }
    return Math.max(0, Math.min(MAX_BPS, sum));
}

/**
 * Computes remaining unallocated basis points (`10_000 - allocatedBps`).
 */
export function computeUnallocatedBps(
    sectors: ReadonlyArray<{ allocationBps?: unknown; allocationPercentage?: unknown }>
): number {
    return Math.max(0, MAX_BPS - computeTotalAllocatedBps(sectors));
}

/**
 * Builds an integer `allocationBps` update payload for `UPDATE_SECTOR_ALLOCATION`.
 */
export function buildUpdateSectorAllocationPayload(
    sectorId: string,
    allocationBps: number
): { id: string; sectorId: string; allocationBps: number } {
    const cleanId = String(sectorId || '').trim();
    if (!cleanId) {
        throw new Error('Sector ID is required.');
    }
    const cleanBps = normalizeAllocationBps({ allocationBps });
    return {
        id: cleanId,
        sectorId: cleanId,
        allocationBps: cleanBps
    };
}

/**
 * Formats an unsigned atomic `sompi` string/`bigint` into a KAS decimal string without float scaling.
 */
export function formatSompiToKasDisplay(
    sompi: U128Str | bigint | null | undefined,
    maxDecimals = 4,
    trimZeros = false
): string {
    if (sompi === null || sompi === undefined || sompi === '') {
        return formatAtomicToDecimal(0n, KAS_DECIMALS, maxDecimals, trimZeros);
    }
    try {
        const parsed = parseU128Str(sompi, 'sompi');
        return formatAtomicToDecimal(parsed, KAS_DECIMALS, maxDecimals, trimZeros);
    } catch {
        return formatAtomicToDecimal(0n, KAS_DECIMALS, maxDecimals, trimZeros);
    }
}

/**
 * Formats USD micros (`1e6`) into a USD decimal string without float scaling.
 */
export function formatUsdMicrosDisplay(
    usdMicros: U128Str | bigint | null | undefined,
    maxDecimals = 2,
    trimZeros = false
): string {
    if (usdMicros === null || usdMicros === undefined || usdMicros === '') {
        return formatAtomicToDecimal(0n, USD_MICROS_DECIMALS, maxDecimals, trimZeros);
    }
    try {
        const parsed = parseU128Str(usdMicros, 'usdMicros');
        return formatAtomicToDecimal(parsed, USD_MICROS_DECIMALS, maxDecimals, trimZeros);
    } catch {
        return formatAtomicToDecimal(0n, USD_MICROS_DECIMALS, maxDecimals, trimZeros);
    }
}

/**
 * Converts atomic KAS (`sompi`) to USD display using live E8 oracle price, returning empty string when offline.
 */
export function formatSompiToUsdOrUnavailable(
    sompi: U128Str | bigint | null | undefined,
    kasOracleUsdE8: U128Str | bigint | null | undefined
): string {
    if (kasOracleUsdE8 === null || kasOracleUsdE8 === undefined || kasOracleUsdE8 === '') {
        return '';
    }
    try {
        const priceE8 = parseU128Str(kasOracleUsdE8, 'kasOracleUsdE8');
        if (priceE8 <= 0n) return '';
        const amountSompi =
            sompi === null || sompi === undefined || sompi === ''
                ? 0n
                : parseU128Str(sompi, 'sompi');
        const usdMicros = atomicToUsdMicrosFloor(amountSompi, KAS_DECIMALS, priceE8);
        return `$${formatAtomicToDecimal(usdMicros, USD_MICROS_DECIMALS, 2, false)}`;
    } catch {
        return '';
    }
}

/**
 * Formats daily split output cleanly: `~X KAS/d` plus live `$USD/d` when online, or `~X KAS/d` alone if offline.
 */
export function formatSectorDailyYieldLabel(
    dailyKas: number,
    dailyUsd: number,
    livePricingUnavailable: boolean
): { kasLabel: string; usdLabel: string | null } {
    const safeKas = Number.isFinite(dailyKas) ? Math.max(0, dailyKas) : 0;
    const kasLabel = `~${safeKas.toFixed(1)} KAS/d`;
    if (livePricingUnavailable || !Number.isFinite(dailyUsd)) {
        return { kasLabel, usdLabel: null };
    }
    return {
        kasLabel,
        usdLabel: `$${Math.max(0, dailyUsd).toFixed(2)}/d`
    };
}

/**
 * Formats a settled atomic quantity according to the target asset's canonical decimals.
 */
export function formatSettledAssetAmount(
    settledAtomic: U128Str | bigint | null | undefined,
    targetAsset: string,
    maxDecimals = 6
): string {
    const decimals = atomicDecimalsForAsset(targetAsset);
    const shownDecimals = Math.min(decimals, maxDecimals);
    if (settledAtomic === null || settledAtomic === undefined || settledAtomic === '') {
        return formatAtomicToDecimal(0n, decimals, shownDecimals, true);
    }
    try {
        const parsed = parseU128Str(settledAtomic, 'settledAtomic');
        return formatAtomicToDecimal(parsed, decimals, shownDecimals, true);
    } catch {
        return formatAtomicToDecimal(0n, decimals, shownDecimals, true);
    }
}

/**
 * Computes payout threshold progress in integer basis points (`0..=10_000`) using pure `BigInt`.
 */
export function computeFlushProgressBps(
    unpaidMatureSompi: U128Str | bigint | null | undefined,
    stage1FlushFloorSompi: U128Str | bigint | null | undefined
): number {
    try {
        const unpaid = unpaidMatureSompi ? parseU128Str(unpaidMatureSompi, 'unpaidMatureSompi') : 0n;
        const floor = stage1FlushFloorSompi ? parseU128Str(stage1FlushFloorSompi, 'stage1FlushFloorSompi') : 0n;
        if (floor <= 0n) return unpaid > 0n ? MAX_BPS : 0;
        const bps = (unpaid * BPS_SCALE) / floor;
        if (bps >= BPS_SCALE) return MAX_BPS;
        return Number(bps);
    } catch {
        return 0;
    }
}

/**
 * Translates protocol/backend error strings into plain-English retail copy (zero protocol jargon).
 */
export function sanitizeRetailCopy(raw: string | null | undefined, status?: number): string {
    const text = String(raw || '').trim();
    if (
        status === 503 ||
        /ORACLE_HALT|SERVICE_UNAVAILABLE|live pricing unavailable|pricing.*offline/i.test(text)
    ) {
        return LIVE_PRICING_UNAVAILABLE_MESSAGE;
    }
    if (!text) return 'Request could not be completed.';
    return text
        .replace(/\bBUILD_VAULT_CANCEL_PSKT\b/gi, 'vault return transaction')
        .replace(/\bPSKT\b/gi, 'unsigned transaction')
        .replace(/\bKIP-?20\b/gi, 'vault policy')
        .replace(/\bKIP-?21\b/gi, 'network lane')
        .replace(/\bOpZkPrecompile\b/gi, 'verification proof')
        .replace(/\b0x20\b/gi, 'verified')
        .replace(/\bsompi\b/gi, 'base units')
        .replace(/\bDAA\b/gi, 'block height');
}

export function formatVaultKindLabel(kind: string): string {
    switch (String(kind || '').toUpperCase()) {
        case 'MINER_SILO':
            return 'Mining Split Vault';
        case 'STANDALONE_WALLET_SILO':
            return 'Personal Wallet Vault';
        case 'MAKER_PLANT':
            return 'Liquidity Pool Vault';
        default:
            return 'Self-Custody Vault';
    }
}

export function formatVaultStatusLabel(status: string): string {
    switch (String(status || '').toUpperCase()) {
        case 'ACTIVE':
        case 'LOCKED':
        case 'FUNDED':
            return 'Active';
        case 'CANCELLED':
        case 'CANCELED':
        case 'SPENT':
        case 'REFUNDED':
            return 'Returned to Wallet';
        case 'PENDING':
        case 'AWAITING_FUNDING':
            return 'Ready for Deposits';
        default:
            return sanitizeRetailCopy(status || 'Active');
    }
}

export function formatOutboxStateLabel(state: string): string {
    switch (String(state || '').toUpperCase()) {
        case 'CONFIRMED':
        case 'SETTLED':
            return 'Confirmed';
        case 'BROADCAST':
        case 'SENT':
            return 'Sent';
        case 'PENDING':
        case 'QUEUED':
            return 'Queued';
        case 'RETRYING':
            return 'Retrying';
        case 'FAILED':
            return 'Attention Needed';
        default:
            return sanitizeRetailCopy(state || 'Queued');
    }
}

export function formatSettlementTierLabel(tier: string): string {
    const clean = String(tier || '').trim().toUpperCase();
    if (clean === 'L1_COW_ATOMIC_PSKT' || clean.startsWith('TIER1') || clean.startsWith('TIER_1')) {
        return 'Direct Peer Match';
    }
    if (
        clean === 'CROSS_CHAIN_OPSHA256_HTLC' ||
        clean.startsWith('TIER2') ||
        clean.startsWith('TIER_2')
    ) {
        return 'Cross-Chain Atomic Fill';
    }
    if (
        clean === 'TIER3_CHANGENOW_SPLIT_PSKT' ||
        clean.startsWith('TIER3') ||
        clean.startsWith('TIER_3')
    ) {
        return 'Instant Liquidity Fill';
    }
    if (clean.includes('ZKTLS') || clean.includes('VALVE_1')) {
        return 'Verified Bill Payment';
    }
    if (clean === 'DIRECT_L1_KAS' || clean === 'L1_KAS') {
        return 'Direct Kaspa Payout';
    }
    return sanitizeRetailCopy(tier || 'Completed Settlement');
}

export function resolveTargetNetworkForAsset(ticker: string): string {
    const clean = String(ticker || 'KAS').trim().toUpperCase();
    switch (clean) {
        case 'KAS':
        case 'SILO':
        case 'BEDRCK':
        case 'NACHO':
        case 'PERX':
            return 'KAS';
        case 'USD':
            return 'USD';
        case 'BTC':
            return 'BTC';
        case 'SOL':
            return 'SOL';
        case 'ARB':
            return 'ARB';
        case 'BASE':
        case 'SPY':
        case 'QQQ':
        case 'NVDA':
        case 'AAPL':
        case 'TSLA':
        case 'AMD':
        case 'TSM':
        case 'AVGO':
        case 'XLE':
        case 'XAU':
        case 'XAG':
        case 'USTB':
            return 'BASE';
        case 'POL':
            return 'POL';
        case 'AVAX':
            return 'AVAX';
        case 'SUI':
            return 'SUI';
        case 'TRX':
            return 'TRX';
        case 'DOGE':
            return 'DOGE';
        case 'XRP':
            return 'XRP';
        case 'ZEC':
            return 'ZEC';
        case 'USDC':
        case 'USDT':
        case 'ETH':
        default:
            return 'ETH';
    }
}

/**
 * Builds a validated `REGISTER_VAULT_LOCK` request payload with strict `thresholdSompi: U128Str`.
 */
export function buildRegisterVaultLockPayload(input: {
    vaultKind?: VaultKind;
    targetAsset: string;
    targetNetwork?: string;
    destinationAddress: string;
    refundKaspaAddress: string;
    thresholdKasInput: string | number;
    feeBps?: number;
    makerSpreadBps?: number;
    kcc20TokenTicker?: string;
}): RegisterVaultLockPayload {
    const targetAsset = String(input.targetAsset || 'KAS').trim().toUpperCase();
    const targetNetwork = String(
        input.targetNetwork || resolveTargetNetworkForAsset(targetAsset)
    )
        .trim()
        .toUpperCase();
    const destinationAddress = String(input.destinationAddress || '').trim();
    const refundKaspaAddress = String(input.refundKaspaAddress || '').trim();
    if (!destinationAddress) {
        throw new Error('Destination address is required.');
    }
    if (!refundKaspaAddress.toLowerCase().startsWith('kaspa:')) {
        throw new Error('Valid Kaspa refund wallet address is required.');
    }
    const thresholdSompi = parseKasDecimalToSompi(
        String(input.thresholdKasInput ?? DEFAULT_VAULT_THRESHOLD_KAS),
        'ceil'
    );
    if (thresholdSompi <= 0n) {
        throw new Error('Minimum payout threshold must be greater than zero.');
    }
    const payload: RegisterVaultLockPayload = {
        vaultKind: input.vaultKind || 'MINER_SILO',
        targetAsset,
        targetNetwork,
        destinationAddress,
        refundKaspaAddress,
        thresholdSompi: thresholdSompi.toString()
    };
    if (input.feeBps !== undefined) payload.feeBps = Math.max(0, Math.min(1000, Math.trunc(input.feeBps)));
    if (input.makerSpreadBps !== undefined) {
        payload.makerSpreadBps = Math.max(0, Math.min(1000, Math.trunc(input.makerSpreadBps)));
    }
    if (input.kcc20TokenTicker && input.kcc20TokenTicker.trim()) {
        payload.kcc20TokenTicker = input.kcc20TokenTicker.trim().toUpperCase();
    }
    return payload;
}

/**
 * Dispatches a Sovereign L1 action to `/api/state/action` with fail-closed `503` oracle handling.
 */
export async function postSovereignStateAction<T = any>(
    action: string,
    payload: Record<string, unknown> = {},
    targetWallet?: string,
    fetchFn: typeof fetch = fetch
): Promise<{
    ok: boolean;
    status: number;
    data: T | null;
    error: string | null;
    livePricingUnavailable: boolean;
}> {
    try {
        const res = await fetchFn('/api/state/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action,
                payload,
                ...(targetWallet ? { targetWallet } : {})
            })
        });
        const body = (await res.json().catch(() => null)) as Record<string, any> | null;
        if (res.status === 503 || body?.livePricingUnavailable) {
            const hasLiveSpot =
                treasury.spotOracleOnline && treasury.getAsset('KAS').spotPriceE8 !== '0';
            if (!hasLiveSpot) {
                operations.oracleOnline = false;
                treasury.markOracleUnavailable(LIVE_PRICING_UNAVAILABLE_MESSAGE);
            }
            return {
                ok: false,
                status: 503,
                data: null,
                error: LIVE_PRICING_UNAVAILABLE_MESSAGE,
                livePricingUnavailable: true
            };
        }
        if (!res.ok || body?.success === false) {
            return {
                ok: false,
                status: res.status,
                data: null,
                error: sanitizeRetailCopy(body?.message || body?.error, res.status),
                livePricingUnavailable: false
            };
        }
        return {
            ok: true,
            status: res.status,
            data: (body?.data ?? null) as T | null,
            error: null,
            livePricingUnavailable: false
        };
    } catch {
        return {
            ok: false,
            status: 503,
            data: null,
            error: LIVE_PRICING_UNAVAILABLE_MESSAGE,
            livePricingUnavailable: true
        };
    }
}

/**
 * Fetches an unsigned Path A owner cancellation transaction from `BUILD_VAULT_CANCEL_PSKT`.
 */
export async function requestVaultCancelPreview(
    vaultId: string,
    targetWallet?: string,
    fetchFn: typeof fetch = fetch
): Promise<{
    ok: boolean;
    preview: VaultCancelPsktResponse | null;
    error: string | null;
}> {
    const cleanId = String(vaultId || '').trim();
    if (!cleanId) {
        return { ok: false, preview: null, error: 'Vault ID is required.' };
    }
    const res = await postSovereignStateAction<VaultCancelPsktResponse>(
        'BUILD_VAULT_CANCEL_PSKT',
        { vaultId: cleanId },
        targetWallet,
        fetchFn
    );
    if (!res.ok || !res.data) {
        return {
            ok: false,
            preview: null,
            error: res.error || 'Could not prepare vault return transaction.'
        };
    }
    return { ok: true, preview: res.data, error: null };
}

/**
 * Signs a `BUILD_VAULT_CANCEL_PSKT` payload locally in browser memory and broadcasts via `/api/broadcast`.
 */
export async function executeOwnerVaultCancelBroadcast(params: {
    cancelPreview: VaultCancelPsktResponse;
    redeemScriptHex?: string;
    privateKeyHex?: string;
    vaultPassword?: string;
    encryptedVaultB64?: string;
}): Promise<{ txId: string; explorerUrl: string }> {
    let transientPrivHex = String(params.privateKeyHex || txState.decryptedPrivateKeyHex || '').trim();
    if (!transientPrivHex) {
        const pwd = String(params.vaultPassword || '');
        if (!pwd) {
            throw new Error('Enter your wallet password to sign this return.');
        }
        let vaultCipher = String(params.encryptedVaultB64 || '').trim();
        if (!vaultCipher && typeof localStorage !== 'undefined') {
            const rawPayload = localStorage.getItem('perennia_sovereign_payload');
            if (rawPayload) {
                const parsed = JSON.parse(rawPayload);
                vaultCipher = String(parsed?.vault || '');
            }
        }
        if (!vaultCipher) {
            throw new Error('No unlocked wallet found on this device.');
        }
        const mnemonic = await decryptVault(pwd, vaultCipher);
        const derived = await deriveHoneycombKeys(mnemonic);
        transientPrivHex = derived.kaspa.privateKey.startsWith('0x')
            ? derived.kaspa.privateKey.slice(2)
            : derived.kaspa.privateKey;
    }

    txState.decryptedPrivateKeyHex = transientPrivHex;
    transientPrivHex = '0'.repeat(64);
    try {
        const txId = await signAndBroadcastVaultCancelPskt({
            pskt: params.cancelPreview.pskt,
            redeemScriptHex: params.redeemScriptHex,
            feeBreakdown: params.cancelPreview.feeBreakdown
        });
        return {
            txId,
            explorerUrl: getChainExplorerTxUrl('KAS', txId)
        };
    } finally {
        transientPrivHex = '';
        txState.decryptedPrivateKeyHex = '0'.repeat(64);
        txState.decryptedPrivateKeyHex = '';
    }
}

/**
 * Hydrates 4-priority Thermostat Valve editor drafts from live backend records.
 */
export function hydrateThermostatValveDrafts(
    records: ReadonlyArray<ThermostatValveRecord>,
    defaultDestination: string
): ThermostatValveDraft[] {
    const byPriority = new Map<number, ThermostatValveRecord>();
    for (const r of records || []) {
        byPriority.set(Number(r.priorityOrder), r);
    }
    return ([1, 2, 3, 4] as const).map((priorityOrder) => {
        const meta = THERMOSTAT_VALVE_META[priorityOrder];
        const existing = byPriority.get(priorityOrder);
        const targetAsset = String(existing?.targetAsset || meta.defaultAsset).toUpperCase();
        return {
            priorityOrder,
            valveType: existing?.valveType || meta.valveType,
            title: meta.title,
            subtitle: meta.subtitle,
            targetAsset,
            targetNetwork: String(
                existing?.targetNetwork || resolveTargetNetworkForAsset(targetAsset)
            ).toUpperCase(),
            destinationAddress: String(existing?.destinationAddress || defaultDestination || ''),
            targetCapKas: existing?.targetCapSompi
                ? formatAtomicToDecimal(
                      parseSompiU64(existing.targetCapSompi, 'targetCapSompi'),
                      KAS_DECIMALS,
                      4,
                      true
                  )
                : '0',
            targetCapUsd: existing?.targetCapUsdMicros
                ? formatAtomicToDecimal(
                      parseU128Str(existing.targetCapUsdMicros, 'targetCapUsdMicros'),
                      USD_MICROS_DECIMALS,
                      2,
                      true
                  )
                : '0',
            filledEpochSompi: existing?.filledEpochSompi || '0',
            filledEpochUsdMicros: existing?.filledEpochUsdMicros || '0',
            externalRailRef: String(existing?.externalRailRef || ''),
            zktlsBillerCommitmentHex: String(existing?.zktlsBillerCommitmentHex || ''),
            isEnabled: existing ? Boolean(existing.isEnabled) : priorityOrder === 4
        };
    });
}

/**
 * Converts Thermostat Valve UI drafts into strict `UPSERT_THERMOSTAT_VALVES` `U128Str` payloads.
 */
export function buildUpsertThermostatValvesPayload(
    drafts: ReadonlyArray<ThermostatValveDraft>
): { valves: UpsertThermostatValveInput[] } {
    const valves: UpsertThermostatValveInput[] = drafts.map((d) => {
        const destinationAddress = d.destinationAddress.trim();
        if (d.isEnabled && !destinationAddress) {
            throw new Error(`Destination address is required for ${d.title}.`);
        }
        const capSompi = d.targetCapKas.trim()
            ? parseKasDecimalToSompi(d.targetCapKas.trim(), 'ceil')
            : 0n;
        const capUsdMicros = d.targetCapUsd.trim()
            ? parseDecimalToAtomic(d.targetCapUsd.trim(), USD_MICROS_DECIMALS, 'ceil')
            : 0n;
        return {
            priorityOrder: d.priorityOrder,
            valveType: d.valveType,
            targetAsset: d.targetAsset.trim().toUpperCase(),
            targetNetwork: (
                d.targetNetwork.trim() || resolveTargetNetworkForAsset(d.targetAsset)
            ).toUpperCase(),
            destinationAddress: destinationAddress || 'unconfigured',
            targetCapSompi: capSompi.toString(),
            targetCapUsdMicros: capUsdMicros.toString(),
            ...(d.externalRailRef.trim() ? { externalRailRef: d.externalRailRef.trim() } : {}),
            ...(d.zktlsBillerCommitmentHex.trim()
                ? { zktlsBillerCommitmentHex: d.zktlsBillerCommitmentHex.trim() }
                : {}),
            isEnabled: d.isEnabled
        };
    });
    return { valves };
}

/**
 * Computes thermostat valve fill progress in integer basis points (`0..=10_000`).
 */
export function computeValveFillProgressBps(valve: {
    filledEpochSompi?: U128Str;
    targetCapSompi?: U128Str;
    filledEpochUsdMicros?: U128Str;
    targetCapUsdMicros?: U128Str;
}): number {
    try {
        const capUsd = valve.targetCapUsdMicros
            ? parseU128Str(valve.targetCapUsdMicros, 'targetCapUsdMicros')
            : 0n;
        if (capUsd > 0n) {
            const filledUsd = valve.filledEpochUsdMicros
                ? parseU128Str(valve.filledEpochUsdMicros, 'filledEpochUsdMicros')
                : 0n;
            const bps = (filledUsd * BPS_SCALE) / capUsd;
            return bps >= BPS_SCALE ? MAX_BPS : Number(bps);
        }
        const capKas = valve.targetCapSompi
            ? parseU128Str(valve.targetCapSompi, 'targetCapSompi')
            : 0n;
        if (capKas > 0n) {
            const filledKas = valve.filledEpochSompi
                ? parseU128Str(valve.filledEpochSompi, 'filledEpochSompi')
                : 0n;
            const bps = (filledKas * BPS_SCALE) / capKas;
            return bps >= BPS_SCALE ? MAX_BPS : Number(bps);
        }
        return 0;
    } catch {
        return 0;
    }
}

/**
 * Fetches all Sovereign L1 operational datasets in parallel and hydrates the reactive `operations` store.
 */
export async function fetchSovereignOperationsBundle(
    targetWallet?: string,
    fetchFn: typeof fetch = fetch
): Promise<SovereignOperationsBundle> {
    const [accrualRes, vaultsRes, valvesRes, receiptsRes, solvencyRes] = await Promise.all([
        postSovereignStateAction<{ accrual?: MatureAccrualSnapshot; outbox?: EpochPayoutOutboxItem[] }>(
            'GET_MATURE_ACCRUAL_AND_OUTBOX',
            {},
            targetWallet,
            fetchFn
        ),
        postSovereignStateAction<{ vaults?: VaultLockRecord[] }>(
            'GET_VAULT_LOCKS',
            {},
            targetWallet,
            fetchFn
        ),
        postSovereignStateAction<{ valves?: ThermostatValveRecord[] }>(
            'GET_THERMOSTAT_VALVES',
            {},
            targetWallet,
            fetchFn
        ),
        postSovereignStateAction<{ receipts?: SettlementReceiptRecord[] }>(
            'GET_SETTLEMENT_RECEIPTS',
            {},
            targetWallet,
            fetchFn
        ),
        postSovereignStateAction<SolvencyProofSnapshot>(
            'GET_SOLVENCY_PROOF',
            {},
            targetWallet,
            fetchFn
        )
    ]);

    const livePricingUnavailable =
        accrualRes.livePricingUnavailable ||
        vaultsRes.livePricingUnavailable ||
        valvesRes.livePricingUnavailable ||
        receiptsRes.livePricingUnavailable ||
        solvencyRes.livePricingUnavailable;

    const accrual = accrualRes.data?.accrual ?? null;
    const outbox = Array.isArray(accrualRes.data?.outbox) ? accrualRes.data.outbox : [];
    const vaults = Array.isArray(vaultsRes.data?.vaults) ? vaultsRes.data.vaults : [];
    const valves = Array.isArray(valvesRes.data?.valves) ? valvesRes.data.valves : [];
    const receipts = Array.isArray(receiptsRes.data?.receipts) ? receiptsRes.data.receipts : [];
    const solvency = solvencyRes.data ?? null;

    const hasLiveSpot =
        treasury.spotOracleOnline && treasury.getAsset('KAS').spotPriceE8 !== '0';

    operations.hydrateSovereignState({
        ...(accrualRes.ok ? { matureAccrual: accrual, payoutOutbox: outbox } : {}),
        ...(vaultsRes.ok ? { vaultLocks: vaults } : {}),
        ...(valvesRes.ok ? { thermostatValves: valves } : {}),
        ...(solvencyRes.ok ? { solvencyProof: solvency } : {}),
        ...(livePricingUnavailable && !hasLiveSpot ? { oracleOnline: false } : {})
    });

    return {
        accrual,
        outbox,
        vaults,
        valves,
        receipts,
        solvency,
        livePricingUnavailable
    };
}

export function formatPortTierLabel(
    port: 3332 | 3333 | 3334,
    rawTierLabel: string
): string {
    if (identity.isCorporateAdmin) {
        return rawTierLabel;
    }
    return `PORT :${port}`;
}

export function resolvePortByHashrateTh(hashrateTh: number): {
    port: 3332 | 3333 | 3334;
    tierLabel: 'LOW AUTO-DIFF' | 'MID AUTO-DIFF' | 'HIGH AUTO-DIFF';
} {
    if (hashrateTh > 10.0) {
        return { port: 3334, tierLabel: 'HIGH AUTO-DIFF' };
    }
    if (hashrateTh >= 1.0) {
        return { port: 3333, tierLabel: 'MID AUTO-DIFF' };
    }
    return { port: 3332, tierLabel: 'LOW AUTO-DIFF' };
}

export function matchCatalogSpecForWorker(worker: Worker): KaspaMinerSpec | null {
    const hw = (worker.hardwareType || '').toLowerCase();
    const name = (worker.name || '').toLowerCase();
    for (const spec of [...KASPA_MINER_CATALOG].sort(
        (a, b) => b.model.length - a.model.length
    )) {
        if (
            hw === spec.model.toLowerCase() ||
            hw.includes(spec.model.toLowerCase())
        ) {
            return spec;
        }
    }
    if (hw.includes('iceriverminer-v1.1') || name.includes('ultra')) {
        return KASPA_MINER_CATALOG.find((s) => s.id === 'ks0-ultra') || null;
    }
    if (
        hw.includes('iceriverminer-v7') ||
        name.includes('ks7lite') ||
        name.includes('ks7-lite')
    ) {
        return KASPA_MINER_CATALOG.find((s) => s.id === 'ks7-lite') || null;
    }
    if (name.includes('ks0pro') || name.includes('ks0-pro')) {
        return KASPA_MINER_CATALOG.find((s) => s.id === 'ks0-pro') || null;
    }
    if (name.includes('ks0')) {
        return KASPA_MINER_CATALOG.find((s) => s.id === 'ks0') || null;
    }
    if (name.includes('ks5pro') || name.includes('ks5-pro')) {
        return KASPA_MINER_CATALOG.find((s) => s.id === 'antminer-ks5-pro') || null;
    }
    if (name.includes('ks5m')) {
        return KASPA_MINER_CATALOG.find((s) => s.id === 'ks5m') || null;
    }
    if (name.includes('ks5l')) {
        return KASPA_MINER_CATALOG.find((s) => s.id === 'ks5l') || null;
    }
    return null;
}

export function getWorkerPortTelemetry(worker: Worker): {
    port: 3332 | 3333 | 3334;
    tierLabel: 'LOW AUTO-DIFF' | 'MID AUTO-DIFF' | 'HIGH AUTO-DIFF';
    matchedSpec: KaspaMinerSpec | null;
} {
    const matchedSpec = matchCatalogSpecForWorker(worker);
    if (matchedSpec) {
        return {
            port: matchedSpec.port,
            tierLabel: matchedSpec.tierLabel,
            matchedSpec
        };
    }
    if (worker.hashRate && worker.hashRate > 0) {
        const byLiveHash = resolvePortByHashrateTh(worker.hashRate);
        return { ...byLiveHash, matchedSpec: null };
    }
    const explicitPortMatch = (worker.stratumUrl || '').match(
        /:(3332|3333|3334)$/
    );
    if (explicitPortMatch) {
        const p = Number(explicitPortMatch[1]) as 3332 | 3333 | 3334;
        const tierLabel =
            p === 3334
                ? 'HIGH AUTO-DIFF'
                : p === 3333
                  ? 'MID AUTO-DIFF'
                  : 'LOW AUTO-DIFF';
        return { port: p, tierLabel, matchedSpec: null };
    }
    return { port: 3332, tierLabel: 'LOW AUTO-DIFF', matchedSpec: null };
}

export function getWorkerStratumUrl(worker: Worker): string {
    const { port } = getWorkerPortTelemetry(worker);
    return `stratum+tcp://${STRATUM_HOST}:${port}`;
}

export function formatHardwareName(worker: Worker): string {
    const matched = matchCatalogSpecForWorker(worker);
    if (matched) return matched.model;
    const rawType = worker.hardwareType;
    if (!rawType) return 'Select Miner';
    if (rawType.includes('IceRiverMiner-v1.1')) return 'IceRiver KS0 Ultra';
    if (rawType.includes('IceRiverMiner-v7')) return 'IceRiver KS7 Lite';
    if (rawType.includes('IceRiver'))
        return rawType.replace('IceRiverMiner-', 'IceRiver KS');
    if (rawType.includes('Goldshell'))
        return rawType.replace('GoldshellMiner-', 'Goldshell KS');
    if (
        rawType === 'Awaiting Connection' ||
        rawType === 'Select Miner Type'
    )
        return 'Select Miner';
    return rawType.replace('Miner-', ' ').substring(0, 22);
}

export function toPlantTargetSpec(
    asset: UnifiedAsset,
    weightPct: number
): PlantAssetTarget {
    return {
        ticker: asset.ticker,
        name: asset.name,
        assetClass: asset.assetClass,
        spotPrice: asset.spotPrice,
        theme: asset.theme,
        imgUrl: asset.imgUrl,
        weightPct
    };
}

/**
 * Computes a wallet quick-fill decimal string (25%, 50%, 75%, 100%) strictly from atomic `U128Str` via `BigInt`.
 */
export function computeWalletQuickFillDecimal(
    onChainAtomic: U128Str | bigint | null | undefined,
    decimals: number,
    pct: 25 | 50 | 75 | 100
): string {
    if (onChainAtomic === null || onChainAtomic === undefined || onChainAtomic === '') {
        return '0';
    }
    try {
        const bal = parseU128Str(onChainAtomic, 'onChainAtomic');
        if (bal <= 0n) return '0';
        const sliceAtomic = (bal * BigInt(pct * 100)) / 10_000n;
        if (sliceAtomic <= 0n) return '0';
        const shownDecimals = Math.min(Math.max(0, Math.trunc(decimals)), 8);
        return formatAtomicToDecimal(sliceAtomic, decimals, shownDecimals, true);
    } catch {
        return '0';
    }
}

/**
 * Computes a hashrate quick-fill percentage (25%, 50%, 75%, 100% of `maxPct`) using integer basis points.
 */
export function computeHashrateQuickFillPct(
    maxPct: number | string,
    pct: 25 | 50 | 75 | 100
): number {
    const maxBps = parsePctInputToBps(maxPct, MAX_BPS);
    const sliceBps = Math.floor((maxBps * pct) / 100);
    return bpsToPctNumber(sliceBps);
}

export function normalizePlantTargets(
    rawList: PlantAssetTarget[]
): PlantAssetTarget[] {
    if (rawList.length <= 1) {
        const first =
            rawList[0] || toPlantTargetSpec(treasury.getAsset('KAS'), 100.0);
        return [{ ...first, weightPct: 100.0 }];
    }

    const deduped: PlantAssetTarget[] = [];
    const seen = new Set<string>();
    for (const item of rawList) {
        const tick = String(item?.ticker || '').trim().toUpperCase();
        if (!tick || seen.has(tick)) continue;
        seen.add(tick);
        deduped.push(item);
    }

    if (deduped.length <= 1) {
        const slot0 = deduped[0] || toPlantTargetSpec(treasury.getAsset('KAS'), 50.0);
        const fallbackTicker = slot0.ticker.toUpperCase() === 'KAS' ? 'USDC' : 'KAS';
        const slot1 = toPlantTargetSpec(treasury.getAsset(fallbackTicker), 50.0);
        return [
            { ...slot0, weightPct: 50.0 },
            { ...slot1, weightPct: 50.0 }
        ];
    }

    if (deduped.length === 2) {
        return [
            { ...deduped[0], weightPct: 50.0 },
            { ...deduped[1], weightPct: 50.0 }
        ];
    }

    const kasAsset = treasury.getAsset('KAS');
    const hasKas = deduped.some((a) => a.ticker.toUpperCase() === 'KAS');
    if (!hasKas) {
        const capped = deduped.slice(0, 4);
        const n = capped.length;
        const rawSum = capped.reduce((s, a) => s + Math.max(0, Number(a.weightPct || 0)), 0);
        let allocated = 0;
        return capped.map((item, idx) => {
            let pct: number;
            if (idx === n - 1) {
                pct = Number(Math.max(0.01, 100.0 - allocated).toFixed(2));
            } else if (rawSum > 0) {
                pct = Number(((Math.max(0.1, item.weightPct) / rawSum) * 100.0).toFixed(2));
            } else {
                pct = Number((100.0 / n).toFixed(2));
            }
            allocated += pct;
            return { ...item, weightPct: pct };
        });
    }

    const secondary = deduped
        .filter((a) => a.ticker.toUpperCase() !== 'KAS')
        .slice(0, 4);
    if (secondary.length === 0) {
        const usdc = treasury.getAsset('USDC');
        return [
            toPlantTargetSpec(kasAsset, 50.0),
            toPlantTargetSpec(usdc, 50.0)
        ];
    }
    const nSec = secondary.length;
    const rawSecSum = secondary.reduce(
        (s, a) => s + Math.max(0, Number(a.weightPct || 0)),
        0
    );
    let allocatedSec = 0;
    const normalizedSecondary = secondary.map((item, idx) => {
        let pct: number;
        if (idx === nSec - 1) {
            pct = Number(Math.max(0.01, 50.0 - allocatedSec).toFixed(2));
        } else if (rawSecSum > 0) {
            pct = Number(
                ((Math.max(0.1, item.weightPct) / rawSecSum) * 50.0).toFixed(2)
            );
        } else {
            pct = Number((50.0 / nSec).toFixed(2));
        }
        allocatedSec += pct;
        return {
            ...item,
            weightPct: pct
        };
    });
    return [toPlantTargetSpec(kasAsset, 50.0), ...normalizedSecondary];
}

export function hydrateSectorTargetAssets(sector: Sector): PlantAssetTarget[] {
    const cfg = sector.settlementConfig;
    if (
        cfg?.targetAssets &&
        Array.isArray(cfg.targetAssets) &&
        cfg.targetAssets.length > 0
    ) {
        return normalizePlantTargets(cfg.targetAssets);
    }
    if (cfg?.plantWeights && Object.keys(cfg.plantWeights).length >= 2) {
        const list: PlantAssetTarget[] = [];
        for (const [tick, w] of Object.entries(cfg.plantWeights)) {
            const assetObj = treasury.getAsset(tick);
            list.push(toPlantTargetSpec(assetObj, Number(w || 0)));
        }
        return normalizePlantTargets(list);
    }
    if (sector.routeMode === 'auto-lp') {
        const secTicker = cfg?.targetAsset?.ticker || 'USDC';
        return normalizePlantTargets([
            toPlantTargetSpec(treasury.getAsset('KAS'), 50.0),
            toPlantTargetSpec(treasury.getAsset(secTicker), 50.0)
        ]);
    }
    const singleTicker = cfg?.targetAsset?.ticker || 'KAS';
    return [toPlantTargetSpec(treasury.getAsset(singleTicker), 100.0)];
}

export function formatSectorDisplayTitle(sector: Sector): string {
    const rawName = String(sector?.name || '').trim();
    const stripped = rawName.replace(/^PLANT[-\s_]*/i, '').trim();
    if (sector?.routeMode === 'auto-lp') {
        const targets = hydrateSectorTargetAssets(sector);
        const tickerTitle = targets.map((t) => t.ticker).join(' / ');
        if (!stripped || /^[A-F0-9]{4,6}$/i.test(stripped)) {
            return tickerTitle;
        }
        return stripped;
    }
    return stripped || sector?.settlementConfig?.targetAsset?.ticker || 'SPLIT';
}

export function buildSvgPath(
    data: number[],
    width: number,
    height: number,
    groundZero: boolean = true
): string {
    if (!data || data.length === 0) return '';
    const validData = data.filter((v) => v !== 0);
    const max = validData.length > 0 ? Math.max(...validData) * 1.2 : 1;
    const min = groundZero
        ? 0
        : validData.length > 0
          ? Math.min(...validData) * 0.95
          : 0;
    const range = max - min || 1;
    return data
        .map((d, i) => {
            const x = (i / Math.max(1, data.length - 1)) * width;
            const y =
                d === 0 ? height : height - ((d - min) / range) * height;
            return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
        })
        .join(' ');
}

export const KASPA_NATIVE_PAIR_ASSETS = [
    'KAS',
    'SILO',
    'NACHO',
    'KANGO',
    'KONAN',
    'BURT',
    'KASPY',
    'ZEAL',
    'GHOAD',
    'CHIMP'
] as const;

const LP_MAKER_FEE_SPLIT_BPS = 8000;
const TREASURY_PAIR_FEE_SPLIT_BPS = 2000;

export function isKaspaNativePairAsset(ticker: string): boolean {
    const clean = String(ticker || '').trim().toUpperCase();
    if (!clean) return false;
    if ((KASPA_NATIVE_PAIR_ASSETS as readonly string[]).includes(clean)) return true;
    const asset = treasury.getAsset(clean);
    if (!asset) return false;
    const net = String(asset.network || '').toUpperCase();
    return (
        asset.assetClass === 'Native L1' ||
        asset.assetClass === 'Ecosystem' ||
        net.includes('KAS') ||
        net.includes('KRC')
    );
}

export function resolveKaspaAssetOracleE8(ticker: string): bigint {
    const asset = treasury.getAsset(ticker);
    if (!asset) return 0n;
    try {
        return parseU128Str(asset.spotPriceE8 || '0', 'spotPriceE8');
    } catch {
        return 0n;
    }
}

export function convertAtomicByOracleFloor(
    amountAtomic: bigint,
    fromDecimals: number,
    fromOracleE8: bigint,
    toDecimals: number,
    toOracleE8: bigint
): bigint {
    if (amountAtomic <= 0n || fromOracleE8 <= 0n || toOracleE8 <= 0n) return 0n;
    const fromScale = 10n ** BigInt(Math.max(0, Math.trunc(fromDecimals)));
    const toScale = 10n ** BigInt(Math.max(0, Math.trunc(toDecimals)));
    return (amountAtomic * fromOracleE8 * toScale) / (toOracleE8 * fromScale);
}

export function computeLpMakerFeeUsdMicros(grossFeeUsdMicros: U128Str | bigint): U128Str {
    const gross =
        typeof grossFeeUsdMicros === 'bigint'
            ? grossFeeUsdMicros
            : parseU128Str(grossFeeUsdMicros || '0', 'grossFeeUsdMicros');
    return mulBpsFloor(gross, LP_MAKER_FEE_SPLIT_BPS).toString();
}

export function computeTreasuryPairFeeUsdMicros(grossFeeUsdMicros: U128Str | bigint): U128Str {
    const gross =
        typeof grossFeeUsdMicros === 'bigint'
            ? grossFeeUsdMicros
            : parseU128Str(grossFeeUsdMicros || '0', 'grossFeeUsdMicros');
    return mulBpsCeil(gross, TREASURY_PAIR_FEE_SPLIT_BPS).toString();
}

export interface WalletPairPlanResult {
    reserve: PairReserveState;
    needsQueueSplit: boolean;
    totalBaseAtomic: U128Str;
    requiredPartnerAtomic: U128Str;
}

export function planWalletFirstPairExecution(params: {
    baseTicker: string;
    partnerTicker: string;
    baseAmountInput: string;
    feeRateBps: PairFeeRateBps;
    nowMs?: number;
}): WalletPairPlanResult {
    const baseTicker = String(params.baseTicker || 'KAS').trim().toUpperCase();
    const partnerTicker = String(params.partnerTicker || 'SILO').trim().toUpperCase();
    if (!baseTicker || !partnerTicker || baseTicker === partnerTicker) {
        throw new Error('Select two distinct assets.');
    }
    if (!isKaspaNativePairAsset(baseTicker) || !isKaspaNativePairAsset(partnerTicker)) {
        throw new Error('Select Kaspa L1 assets.');
    }
    if (treasury.livePricingUnavailable) {
        throw new Error(LIVE_PRICING_UNAVAILABLE_MESSAGE);
    }

    const baseAsset = treasury.getAsset(baseTicker);
    const partnerAsset = treasury.getAsset(partnerTicker);
    const baseE8 = resolveKaspaAssetOracleE8(baseTicker);
    const partnerE8 = resolveKaspaAssetOracleE8(partnerTicker);
    if (baseE8 <= 0n || partnerE8 <= 0n) {
        throw new Error(LIVE_PRICING_UNAVAILABLE_MESSAGE);
    }

    const baseDec = atomicDecimalsForAsset(baseTicker);
    const partnerDec = atomicDecimalsForAsset(partnerTicker);
    const totalBaseAtomic = parseDecimalToAtomic(
        String(params.baseAmountInput || '').trim() || '0',
        baseDec,
        'floor'
    );
    if (totalBaseAtomic <= 0n) {
        throw new Error('Enter amount.');
    }

    const baseWalletAtomic = parseU128Str(baseAsset?.onChainAtomic || '0', 'baseWalletAtomic');
    if (totalBaseAtomic > baseWalletAtomic) {
        throw new Error('Insufficient balance.');
    }

    const halfBaseAtomic = totalBaseAtomic / 2n;
    const queuedOrMatchedBaseAtomic = totalBaseAtomic - halfBaseAtomic;
    if (halfBaseAtomic <= 0n || queuedOrMatchedBaseAtomic <= 0n) {
        throw new Error('Amount too small.');
    }

    const requiredPartnerAtomic = convertAtomicByOracleFloor(
        queuedOrMatchedBaseAtomic,
        baseDec,
        baseE8,
        partnerDec,
        partnerE8
    );
    if (requiredPartnerAtomic <= 0n) {
        throw new Error(LIVE_PRICING_UNAVAILABLE_MESSAGE);
    }

    const partnerWalletAtomic = parseU128Str(
        partnerAsset?.onChainAtomic || '0',
        'partnerWalletAtomic'
    );
    const hasPartnerBalance = partnerWalletAtomic >= requiredPartnerAtomic;
    const nowMs = params.nowMs ?? Date.now();

    if (hasPartnerBalance) {
        return {
            needsQueueSplit: false,
            totalBaseAtomic: halfBaseAtomic.toString(),
            requiredPartnerAtomic: requiredPartnerAtomic.toString(),
            reserve: {
                status: 'ACTIVE',
                baseTicker,
                partnerTicker,
                baseBalanceAtomic: halfBaseAtomic.toString(),
                partnerBalanceAtomic: requiredPartnerAtomic.toString(),
                heldBaseAtomic: halfBaseAtomic.toString(),
                queuedBaseAtomic: '0',
                targetPartnerAtomic: requiredPartnerAtomic.toString(),
                accruedFeesUsdMicros: '0',
                feeRateBps: params.feeRateBps,
                updatedAt: nowMs
            }
        };
    }

    return {
        needsQueueSplit: true,
        totalBaseAtomic: totalBaseAtomic.toString(),
        requiredPartnerAtomic: requiredPartnerAtomic.toString(),
        reserve: {
            status: 'QUEUED',
            baseTicker,
            partnerTicker,
            baseBalanceAtomic: halfBaseAtomic.toString(),
            partnerBalanceAtomic: '0',
            heldBaseAtomic: halfBaseAtomic.toString(),
            queuedBaseAtomic: queuedOrMatchedBaseAtomic.toString(),
            targetPartnerAtomic: requiredPartnerAtomic.toString(),
            accruedFeesUsdMicros: '0',
            feeRateBps: params.feeRateBps,
            updatedAt: nowMs
        }
    };
}

export interface FormattedPairReserveDisplay {
    baseFormatted: string;
    partnerFormatted: string;
    heldBaseFormatted: string;
    queuedBaseFormatted: string;
    totalUsdFormatted: string;
    accruedFeesUsdFormatted: string;
    livePricingUnavailable: boolean;
}

export function formatPairReserveDisplay(reserve: PairReserveState): FormattedPairReserveDisplay {
    const baseDec = atomicDecimalsForAsset(reserve.baseTicker);
    const partnerDec = atomicDecimalsForAsset(reserve.partnerTicker);
    const baseBalanceAtomic = parseU128Str(reserve.baseBalanceAtomic || '0', 'baseBalanceAtomic');
    const partnerBalanceAtomic = parseU128Str(
        reserve.partnerBalanceAtomic || '0',
        'partnerBalanceAtomic'
    );
    const heldBaseAtomic = parseU128Str(reserve.heldBaseAtomic || '0', 'heldBaseAtomic');
    const queuedBaseAtomic = parseU128Str(reserve.queuedBaseAtomic || '0', 'queuedBaseAtomic');
    const accruedFeesMicros = parseU128Str(
        reserve.accruedFeesUsdMicros || '0',
        'accruedFeesUsdMicros'
    );

    const baseE8 = resolveKaspaAssetOracleE8(reserve.baseTicker);
    const partnerE8 = resolveKaspaAssetOracleE8(reserve.partnerTicker);
    const pricingUnavailable = treasury.livePricingUnavailable || baseE8 <= 0n;

    let totalUsdMicros = 0n;
    if (!pricingUnavailable) {
        totalUsdMicros += atomicToUsdMicrosFloor(baseBalanceAtomic, baseDec, baseE8);
        if (partnerE8 > 0n) {
            totalUsdMicros += atomicToUsdMicrosFloor(partnerBalanceAtomic, partnerDec, partnerE8);
        }
        totalUsdMicros += accruedFeesMicros;
    }

    return {
        baseFormatted: formatAtomicToDecimal(baseBalanceAtomic, baseDec, 4, true),
        partnerFormatted: formatAtomicToDecimal(partnerBalanceAtomic, partnerDec, 4, true),
        heldBaseFormatted: formatAtomicToDecimal(heldBaseAtomic, baseDec, 4, true),
        queuedBaseFormatted: formatAtomicToDecimal(queuedBaseAtomic, baseDec, 4, true),
        totalUsdFormatted: `$${formatAtomicToDecimal(totalUsdMicros, USD_MICROS_DECIMALS, 2, false)}`,
        accruedFeesUsdFormatted: `+$${formatAtomicToDecimal(accruedFeesMicros, USD_MICROS_DECIMALS, 2, false)}`,
        livePricingUnavailable: pricingUnavailable
    };
}

export async function recordPairSettlementActivity(
    params: {
        sectorId: string;
        eventType: 'LP_PAIR_ACTIVE' | 'LP_PAIR_FILLED' | 'LP_PAIR_WITHDRAWN';
        ticker: string;
        partnerTicker: string;
        amountAtomic: U128Str;
        oracleUsdE8?: U128Str;
        feeUsdMicros?: U128Str;
        txHash?: string;
    },
    fetchFn: typeof fetch = fetch
): Promise<boolean> {
    try {
        const res = await fetchFn('/api/user/tax-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...params,
                lpFeeShareMicros: params.feeUsdMicros
                    ? computeLpMakerFeeUsdMicros(params.feeUsdMicros)
                    : '0',
                treasuryFeeShareMicros: params.feeUsdMicros
                    ? computeTreasuryPairFeeUsdMicros(params.feeUsdMicros)
                    : '0'
            })
        });
        return res.ok;
    } catch {
        return false;
    }
}

export async function executeSharedWalletPair(params: {
    baseTicker: string;
    partnerTicker: string;
    baseAmountInput: string;
    feeRateBps: PairFeeRateBps;
    allocationPct?: number;
    refundKaspaAddress?: string;
    targetWallet?: string;
    fetchFn?: typeof fetch;
}): Promise<{
    reserve: PairReserveState;
    vaultId: string | null;
    allocationBps: number;
    targetAssets: PlantAssetTarget[];
}> {
    const plan = planWalletFirstPairExecution({
        baseTicker: params.baseTicker,
        partnerTicker: params.partnerTicker,
        baseAmountInput: params.baseAmountInput,
        feeRateBps: params.feeRateBps
    });
    const fetchFn = params.fetchFn ?? fetch;
    const refundAddr = String(
        params.refundKaspaAddress || params.targetWallet || identity.walletAddress || ''
    ).trim();

    let vaultId: string | null = null;
    if (refundAddr.toLowerCase().startsWith('kaspa:')) {
        const baseDec = atomicDecimalsForAsset(plan.reserve.baseTicker);
        const thresholdInput = formatAtomicToDecimal(
            parseU128Str(plan.reserve.heldBaseAtomic, 'heldBaseAtomic'),
            baseDec,
            8,
            true
        );
        const lockPayload = buildRegisterVaultLockPayload({
            vaultKind: 'MAKER_PLANT',
            targetAsset: plan.reserve.partnerTicker,
            targetNetwork: 'KASPA',
            destinationAddress: refundAddr,
            refundKaspaAddress: refundAddr,
            thresholdKasInput: thresholdInput === '0' ? DEFAULT_VAULT_THRESHOLD_KAS : thresholdInput,
            feeBps: params.feeRateBps,
            makerSpreadBps: params.feeRateBps,
            kcc20TokenTicker:
                plan.reserve.partnerTicker !== 'KAS' ? plan.reserve.partnerTicker : undefined
        });
        const lockRes = await postSovereignStateAction<VaultLockRecord>(
            'REGISTER_VAULT_LOCK',
            lockPayload as unknown as Record<string, unknown>,
            params.targetWallet || refundAddr,
            fetchFn
        );
        if (lockRes.livePricingUnavailable) {
            throw new Error(LIVE_PRICING_UNAVAILABLE_MESSAGE);
        }
        vaultId = lockRes.data?.vaultId ?? null;
    }

    const baseAsset = treasury.getAsset(plan.reserve.baseTicker);
    const partnerAsset = treasury.getAsset(plan.reserve.partnerTicker);
    const targetAssets = normalizePlantTargets([
        toPlantTargetSpec(baseAsset, 50),
        toPlantTargetSpec(partnerAsset, 50)
    ]);

    const allocationBps = normalizeAllocationBps({
        allocationPercentage: Number(params.allocationPct || 0)
    });

    if (plan.reserve.status === 'ACTIVE') {
        const prevBase = parseU128Str(baseAsset?.onChainAtomic || '0', 'prevBase');
        const usedBase = parseU128Str(plan.reserve.baseBalanceAtomic, 'usedBase');
        const nextBase = prevBase >= usedBase ? prevBase - usedBase : 0n;
        treasury.updateAsset(plan.reserve.baseTicker, {
            onChainAtomic: nextBase.toString()
        });

        const prevPartner = parseU128Str(partnerAsset?.onChainAtomic || '0', 'prevPartner');
        const usedPartner = parseU128Str(plan.reserve.partnerBalanceAtomic, 'usedPartner');
        const nextPartner = prevPartner >= usedPartner ? prevPartner - usedPartner : 0n;
        treasury.updateAsset(plan.reserve.partnerTicker, {
            onChainAtomic: nextPartner.toString()
        });
    } else {
        const prevBase = parseU128Str(baseAsset?.onChainAtomic || '0', 'prevBase');
        const lockedTotal = parseU128Str(plan.totalBaseAtomic, 'lockedTotal');
        const nextBase = prevBase >= lockedTotal ? prevBase - lockedTotal : 0n;
        treasury.updateAsset(plan.reserve.baseTicker, {
            onChainAtomic: nextBase.toString()
        });
    }

    const reserve: PairReserveState = {
        ...plan.reserve,
        vaultId: vaultId ?? undefined
    };

    return { reserve, vaultId, allocationBps, targetAssets };
}

export async function cancelOrWithdrawPairSector(params: {
    sector: Sector;
    mode: 'cancel' | 'withdraw';
    targetWallet?: string;
    vaultPassword?: string;
    fetchFn?: typeof fetch;
}): Promise<{ txId: string | null }> {
    const reserve = params.sector.settlementConfig?.pairReserve;
    const fetchFn = params.fetchFn ?? fetch;
    let txId: string | null = null;

    if (reserve?.vaultId) {
        const previewRes = await requestVaultCancelPreview(
            reserve.vaultId,
            params.targetWallet || identity.walletAddress,
            fetchFn
        );
        if (previewRes.ok && previewRes.preview && (params.vaultPassword || txState.decryptedPrivateKeyHex)) {
            const broadcastRes = await executeOwnerVaultCancelBroadcast({
                cancelPreview: previewRes.preview,
                vaultPassword: params.vaultPassword
            });
            txId = broadcastRes.txId;
        }
    }

    if (reserve) {
        const baseAsset = treasury.getAsset(reserve.baseTicker);
        const returnBase =
            reserve.status === 'QUEUED'
                ? parseU128Str(reserve.heldBaseAtomic || '0', 'heldBaseAtomic') +
                  parseU128Str(reserve.queuedBaseAtomic || '0', 'queuedBaseAtomic')
                : parseU128Str(reserve.baseBalanceAtomic || '0', 'baseBalanceAtomic');
        const curBase = parseU128Str(baseAsset?.onChainAtomic || '0', 'curBase');
        treasury.updateAsset(reserve.baseTicker, {
            onChainAtomic: (curBase + returnBase).toString()
        });

        const returnPartner = parseU128Str(reserve.partnerBalanceAtomic || '0', 'partnerBalanceAtomic');
        if (returnPartner > 0n) {
            const partnerAsset = treasury.getAsset(reserve.partnerTicker);
            const curPartner = parseU128Str(partnerAsset?.onChainAtomic || '0', 'curPartner');
            treasury.updateAsset(reserve.partnerTicker, {
                onChainAtomic: (curPartner + returnPartner).toString()
            });
        }

        if (params.mode === 'withdraw') {
            await recordPairSettlementActivity(
                {
                    sectorId: params.sector.id,
                    eventType: 'LP_PAIR_WITHDRAWN',
                    ticker: reserve.baseTicker,
                    partnerTicker: reserve.partnerTicker,
                    amountAtomic: returnBase.toString(),
                    oracleUsdE8: resolveKaspaAssetOracleE8(reserve.baseTicker).toString(),
                    feeUsdMicros: reserve.accruedFeesUsdMicros || '0',
                    txHash: txId ?? undefined
                },
                fetchFn
            );
        }
    }

    return { txId };
}
