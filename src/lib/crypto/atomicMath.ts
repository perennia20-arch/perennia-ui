import { blake2b } from '@noble/hashes/blake2.js';
import { schnorr } from '@noble/curves/secp256k1.js';
import {
    bytesToHex,
    concatBytes,
    hexToBytes,
    writeBigUint64LE,
    writeUint16LE,
    writeUint32LE
} from './kaspaAddress';

/**
 * Base-10 unsigned 128-bit integer string matching `/^[0-9]{1,39}$/`.
 */
export type U128Str = string;

export const KAS_DECIMALS = 8;
export const USD_MICROS_DECIMALS = 6;
export const ORACLE_E8_DECIMALS = 8;

export const SOMPI_PER_KAS = 100_000_000n;
export const USD_MICROS_SCALE = 1_000_000n;
export const ORACLE_USD_E8_SCALE = 100_000_000n;
export const BPS_SCALE = 10_000n;
export const MAX_BPS = 10_000;

export const U64_MAX = 18_446_744_073_709_551_615n;
export const U128_MAX = 340_282_366_920_938_463_463_374_607_431_768_211_455n;

export const POST_TOCCATA_TX_VERSION = 1;
export const NATIVE_SUBNETWORK_ID_HEX = '0000000000000000000000000000000000000000';

export const BASE_COMPUTE_MASS = 200n;
export const MASS_PER_INPUT = 1200n;
export const MASS_PER_OUTPUT = 450n;
export const STORAGE_MASS_PARAMETER = 1_000_000_000_000n;
export const CONSENSUS_FEE_PER_GRAM_SOMPI = 100n;
export const RELAY_FEE_PER_GRAM_SOMPI = 110n;
export const MIN_CHANGE_SOMPI = 10_000_000n;

export const SIGHASH_ALL = 0x01;
export const SIGHASH_SINGLE_ANYONECANPAY = 0x83;
export const LIVE_PRICING_UNAVAILABLE_MESSAGE = 'Live pricing unavailable';

const TX_SIGNING_KEY = new TextEncoder().encode('TransactionSigningHash');
const U128_STR_RE = /^[0-9]{1,39}$/;
const HEX_RE = /^[0-9a-fA-F]*$/;
const HEX_32_BYTES_RE = /^[0-9a-fA-F]{64}$/;

export interface Kip20CovenantBinding {
    authorizingInput: number;
    covenantId: string;
}

export interface PostToccataTxInput {
    previousOutpoint: {
        transactionId: string;
        index: number;
    };
    signatureScript: string;
    sequence: number;
    sigOpCount: number;
}

export interface PostToccataTxOutput {
    amount: U128Str;
    scriptPublicKey: {
        version: number;
        scriptPublicKey: string;
    };
    covenant?: Kip20CovenantBinding;
}

export interface PostToccataTransactionV1 {
    version: 1;
    inputs: PostToccataTxInput[];
    outputs: PostToccataTxOutput[];
    lockTime: number;
    subnetworkId: string;
    gas: number;
    payload: string;
    storageMass: U128Str;
}

export interface PsktInput {
    previousOutpoint: {
        transactionId: string;
        index: number;
    };
    utxoEntry?: {
        amount: U128Str | number;
        scriptPublicKey?: string | { version?: number; scriptPublicKey: string };
    };
    scriptPublicKey?: string | { version?: number; scriptPublicKey: string };
    amount?: U128Str | number;
    redeemScriptHex?: string;
    spendPath?: string;
    signatureScript?: string;
    sequence?: number;
    sigOpCount?: number;
}

export interface PsktOutput {
    amount?: U128Str | number;
    value?: U128Str | number;
    scriptPublicKey: string | { version?: number; scriptPublicKey: string };
    covenant?: Kip20CovenantBinding;
    destinationAddress?: string;
}

export interface PsktPayload {
    version?: number;
    subnetworkId?: string;
    lockTime?: number;
    gas?: number;
    payload?: string;
    storageMass?: U128Str | number;
    inputs: PsktInput[];
    outputs: PsktOutput[];
}

export type VaultKind = 'MINER_SILO' | 'STANDALONE_WALLET_SILO' | 'MAKER_PLANT';

export interface VaultLockRecord {
    vaultId: string;
    walletAddress: string;
    vaultKind: VaultKind;
    kip20CovenantId: string;
    kip21SubnetworkId: string;
    covenantAddress: string;
    covenantSpkHex: string;
    redeemScriptHex: string;
    ownerPubkeyHex: string;
    chronosTriggerPubkeyHex: string;
    targetAsset: string;
    targetNetwork: string;
    destinationAddress: string;
    refundKaspaAddress: string;
    thresholdSompi: U128Str;
    feeBps: number;
    makerSpreadBps: number;
    kcc20TokenTicker?: string | null;
    kcc20LineageRoot?: string | null;
    confirmedUtxoSompi: U128Str;
    liveUtxoSompi: U128Str;
    liveUtxoCount: number;
    liveUtxoError?: string | null;
    confirmedDaaScore: string | number;
    status: string;
    updatedAt: string;
}

export interface RegisterVaultLockPayload {
    vaultKind?: VaultKind;
    targetAsset?: string;
    targetNetwork?: string;
    destinationAddress?: string;
    refundKaspaAddress?: string;
    thresholdSompi?: U128Str;
    feeBps?: number;
    makerSpreadBps?: number;
    kcc20TokenTicker?: string;
    kcc20LineageRoot?: string;
}

export interface VaultCancelPsktResponse {
    vaultId: string;
    spendPath: 'PATH_A_24_7_USER_SOVEREIGNTY';
    pskt: PsktPayload;
    feeBreakdown: {
        totalInputSompi: U128Str;
        refundOutputSompi: U128Str;
        networkFeeSompi: U128Str;
        effectiveMass: number;
        storageMass: number;
        computeGrams: number;
    };
}

export type ThermostatValveType =
    | 'VALVE_1_ELECTRIC_BILL'
    | 'VALVE_2_AGENT_X402_FLOOR'
    | 'VALVE_3_JIT_VISA_CEILING'
    | 'VALVE_4_TANGEM_COLD_OR_PLANT';

export interface ThermostatValveRecord {
    valveId: string;
    priorityOrder: 1 | 2 | 3 | 4;
    valveType: ThermostatValveType;
    targetAsset: string;
    targetNetwork: string;
    destinationAddress: string;
    targetCapSompi: U128Str;
    targetCapUsdMicros: U128Str;
    filledEpochSompi: U128Str;
    filledEpochUsdMicros: U128Str;
    externalRailRef?: string | null;
    zktlsBillerCommitmentHex?: string | null;
    isEnabled: boolean;
    updatedAt: string;
}

export interface UpsertThermostatValveInput {
    priorityOrder: 1 | 2 | 3 | 4;
    valveType?: ThermostatValveType;
    targetAsset?: string;
    targetNetwork?: string;
    destinationAddress: string;
    targetCapSompi?: U128Str;
    targetCapUsdMicros?: U128Str;
    externalRailRef?: string;
    zktlsBillerCommitmentHex?: string;
    isEnabled?: boolean;
}

export interface MatureAccrualSnapshot {
    immatureSompi: U128Str;
    unpaidMatureSompi: U128Str;
    lifetimeFlushedSompi: U128Str;
    lifetimePoolFeeSompi: U128Str;
    poolFeeBps: number;
    activeVaultId?: string | null;
    lastMaturityDaa: string | number;
    stage1FlushFloorSompi: U128Str;
    updatedAt: string;
}

export interface EpochPayoutOutboxItem {
    outboxKey: string;
    epochId: string;
    vaultId?: string | null;
    destinationAddress: string;
    payoutSompi: U128Str;
    houseFeeSompi: U128Str;
    networkFeeSompi: U128Str;
    state: string;
    txid?: string | null;
    broadcastDaa?: string | number | null;
    confirmedDaa?: string | number | null;
    retryCount: number;
    lastError?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface MatureAccrualAndOutboxResponse {
    accrual: MatureAccrualSnapshot;
    outbox: EpochPayoutOutboxItem[];
}

export interface SettlementReceiptRecord {
    receiptId: string;
    outboxKey?: string | null;
    epochId: string;
    vaultId?: string | null;
    valvePriority?: number | null;
    settlementTier: string;
    sourceSompi: U128Str;
    houseFeeSompi: U128Str;
    networkFeeSompi: U128Str;
    targetAsset: string;
    targetNetwork: string;
    settledAtomic: U128Str;
    oracleKasUsdE8: U128Str;
    kaspaL1Txid?: string | null;
    destinationTxid?: string | null;
    htlcHashlockSha256?: string | null;
    groth160x20ProofHash?: string | null;
    changenowExchangeId?: string | null;
    confirmedDaaScore?: string | number | null;
    status: string;
    settledAt: string;
}

export interface SolvencyProofSnapshot {
    isSolvent?: boolean;
    status?: string;
    checkedAt?: string;
    poolBalanceSompi?: U128Str;
    totalLiabilitiesSompi?: U128Str;
    surplusSompi?: U128Str;
    [key: string]: unknown;
}

export type SorRouteType =
    | 'L1_COW_ATOMIC_PSKT'
    | 'CROSS_CHAIN_OPSHA256_HTLC'
    | 'TIER3_CHANGENOW_SPLIT_PSKT'
    | 'CROSS_CHAIN_DEPOSIT_INTENT';

export interface SorExecuteRequestV1 {
    wallet: string;
    payAsset: string;
    receiveAsset: string;
    targetNetwork?: string;
    amountAtomic: U128Str;
    minOutputAtomic?: U128Str;
    slippageBps?: number;
    destinationAddress?: string;
    refundKaspaAddress?: string;
    utxos?: unknown[];
    htlcSha256HashlockHex?: string;
    counterpartyPubkeyHex?: string;
}

export interface SorExecuteResponseV1 {
    success: boolean;
    transactionUuid: string;
    routeType: SorRouteType;
    payAsset: string;
    receiveAsset: string;
    targetNetwork: string;
    amountInAtomic: U128Str;
    protocolFeeAtomic: U128Str;
    networkFeeSompi: U128Str;
    estimatedOutputAtomic: U128Str;
    minOutputAtomic: U128Str;
    feeBps: number;
    feeTierLabel: string;
    grossUsdMicros: U128Str;
    netUsdMicros: U128Str;
    payOracleUsdE8: U128Str;
    receiveOracleUsdE8: U128Str;
    kasOracleUsdE8: U128Str;
    refundKaspaAddress: string;
    tokenSteering: {
        allowed: boolean;
        rejectReason: string | null;
        payState: string;
        receiveState: string;
        allowDarkPoolInternalClearing: boolean;
        feeLegs: Array<{ asset: string; shareRatio: number }>;
        explanation: string;
    };
    pskt: PsktPayload | null;
    htlcCovenant: Record<string, unknown> | null;
    formattedUtxos: unknown[];
}

export const SOVEREIGN_L1_STATE_ACTIONS = new Set<string>([
    'GET_VAULT_LOCKS',
    'REGISTER_VAULT_LOCK',
    'BUILD_VAULT_CANCEL_PSKT',
    'GET_THERMOSTAT_VALVES',
    'UPSERT_THERMOSTAT_VALVES',
    'GET_MATURE_ACCRUAL_AND_OUTBOX',
    'GET_SETTLEMENT_RECEIPTS',
    'GET_SOLVENCY_PROOF'
]);

export type SovereignL1ActionName =
    | 'GET_VAULT_LOCKS'
    | 'REGISTER_VAULT_LOCK'
    | 'BUILD_VAULT_CANCEL_PSKT'
    | 'GET_THERMOSTAT_VALVES'
    | 'UPSERT_THERMOSTAT_VALVES'
    | 'GET_MATURE_ACCRUAL_AND_OUTBOX'
    | 'GET_SETTLEMENT_RECEIPTS'
    | 'GET_SOLVENCY_PROOF';

export const RETIRED_CUSTODIAL_STATE_ACTIONS = new Set<string>([
    'CLAIM_PENDING_SECTOR_KAS',
    'STAKE_LP',
    'WITHDRAW_LP',
    'STAKE_SILO',
    'CLAIM_UNSTAKED_SILO',
    'SWEEP_TOKEN_TO_COLD_VAULT_NOW',
    'SWEEP_TO_COLD_VAULT_NOW',
    'WITHDRAW_SYNTHETIC_ASSET',
    'DISPATCH_L1_PAYOUT',
    'DISPATCH_OTC_UTXOS'
]);

export type RetiredCustodialActionName =
    | 'CLAIM_PENDING_SECTOR_KAS'
    | 'STAKE_LP'
    | 'WITHDRAW_LP'
    | 'STAKE_SILO'
    | 'CLAIM_UNSTAKED_SILO'
    | 'SWEEP_TOKEN_TO_COLD_VAULT_NOW'
    | 'SWEEP_TO_COLD_VAULT_NOW'
    | 'WITHDRAW_SYNTHETIC_ASSET'
    | 'DISPATCH_L1_PAYOUT'
    | 'DISPATCH_OTC_UTXOS';

export const ORACLE_DEPENDENT_STATE_ACTIONS = new Set<string>([
    'GET_LIVE_BUCKET_THRESHOLDS',
    'GET_SOLVENCY_PROOF',
    'TRIGGER_EPOCH_BELL',
    'FORCE_EPOCH_BELL'
]);

export class BroadcastValidationError extends Error {
    readonly code:
        | 'INVALID_PAYLOAD'
        | 'INVALID_TX_VERSION'
        | 'MISSING_OR_INVALID_STORAGE_MASS'
        | 'FLOAT_AMOUNT_FORBIDDEN'
        | 'INVALID_KIP20_COVENANT_BINDING'
        | 'MALFORMED_TRANSACTION';

    constructor(
        code: BroadcastValidationError['code'],
        message: string
    ) {
        super(message);
        this.name = 'BroadcastValidationError';
        this.code = code;
    }
}

/**
 * Checks whether a value is a canonical base-10 `U128Str` (`^[0-9]{1,39}$` and `<= U128_MAX`).
 */
export function isU128Str(val: unknown): val is U128Str {
    if (typeof val !== 'string') return false;
    const trimmed = val.trim();
    if (!U128_STR_RE.test(trimmed)) return false;
    return BigInt(trimmed) <= U128_MAX;
}

/**
 * Strictly parses an unsigned 128-bit integer value (`bigint`, safe integer `number`, or `/^[0-9]{1,39}$/` string).
 * Rejects floating-point numbers, decimal strings, scientific notation, negatives, and unsafe JS integers.
 */
export function parseU128Str(val: unknown, fieldName = 'value'): bigint {
    if (typeof val === 'bigint') {
        if (val < 0n || val > U128_MAX) {
            throw new RangeError(`${fieldName} is outside u128 bounds.`);
        }
        return val;
    }
    if (typeof val === 'number') {
        if (!Number.isFinite(val) || !Number.isInteger(val) || val < 0) {
            throw new TypeError(`${fieldName} must be a non-negative integer (floats rejected).`);
        }
        if (!Number.isSafeInteger(val)) {
            throw new RangeError(`${fieldName} exceeds Number.MAX_SAFE_INTEGER; pass a decimal string or BigInt.`);
        }
        return BigInt(val);
    }
    if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!U128_STR_RE.test(trimmed)) {
            throw new TypeError(`${fieldName} must be a base-10 unsigned integer string (^[0-9]{1,39}$).`);
        }
        const parsed = BigInt(trimmed);
        if (parsed > U128_MAX) {
            throw new RangeError(`${fieldName} exceeds u128 max.`);
        }
        return parsed;
    }
    throw new TypeError(`${fieldName} must be a u128 string, safe integer, or BigInt.`);
}

/**
 * Strictly parses an unsigned 64-bit sompi value (`0 <= sompi <= U64_MAX`).
 */
export function parseSompiU64(val: unknown, fieldName = 'sompi'): bigint {
    const parsed = parseU128Str(val, fieldName);
    if (parsed > U64_MAX) {
        throw new RangeError(`${fieldName} exceeds u64 max.`);
    }
    return parsed;
}

/**
 * Serializes a `bigint`, safe integer, or base-10 integer string into canonical `U128Str`.
 */
export function toU128Str(val: bigint | number | string, fieldName = 'value'): U128Str {
    return parseU128Str(val, fieldName).toString();
}

/**
 * Pure string-splitting fixed-point decimal parser into atomic `BigInt` units.
 * Avoids JS floating-point scaling math.
 */
export function parseDecimalToAtomic(
    input: string | number | bigint,
    decimals: number,
    mode: 'strict' | 'floor' | 'ceil' = 'strict'
): bigint {
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) {
        throw new RangeError(`Invalid decimals precision: ${decimals}`);
    }
    const scale = 10n ** BigInt(decimals);

    if (typeof input === 'bigint') {
        if (input < 0n) {
            throw new RangeError('Decimal input cannot be negative.');
        }
        return input * scale;
    }

    let raw: string;
    if (typeof input === 'number') {
        if (!Number.isFinite(input) || input < 0) {
            throw new TypeError('Numeric decimal input must be finite and non-negative.');
        }
        raw = input.toFixed(decimals);
    } else if (typeof input === 'string') {
        raw = input.trim();
        if (!raw) {
            throw new TypeError('Decimal string input cannot be empty.');
        }
        if (/^-/.test(raw)) {
            throw new RangeError('Decimal input cannot be negative.');
        }
    } else {
        throw new TypeError('Decimal input must be string, number, or bigint.');
    }

    const match = /^([0-9]+)(?:\.([0-9]+))?$/.exec(raw);
    if (!match) {
        throw new TypeError(`Invalid fixed-point decimal string: "${raw}"`);
    }

    const wholePart = BigInt(match[1]);
    const fracDigits = match[2] ?? '';

    if (decimals === 0) {
        if (fracDigits && /[1-9]/.test(fracDigits)) {
            if (mode === 'strict') {
                throw new RangeError(`Unexpected fractional digits for 0-decimal asset: "${raw}"`);
            }
            if (mode === 'ceil') {
                return wholePart + 1n;
            }
        }
        return wholePart;
    }

    const keptFrac = fracDigits.slice(0, decimals).padEnd(decimals, '0');
    const truncatedFrac = fracDigits.slice(decimals);
    let atomic = wholePart * scale + BigInt(keptFrac);

    if (truncatedFrac && /[1-9]/.test(truncatedFrac)) {
        if (mode === 'strict') {
            throw new RangeError(
                `Precision overflow: "${raw}" exceeds ${decimals} decimal places.`
            );
        }
        if (mode === 'ceil') {
            atomic += 1n;
        }
    }

    if (atomic > U128_MAX) {
        throw new RangeError('Atomic amount exceeds u128 max.');
    }
    return atomic;
}

/**
 * Converts a KAS decimal string (or finite number at UI boundary) into integer sompi (`1e8`).
 */
export function parseKasDecimalToSompi(
    kasInput: string | number,
    mode: 'strict' | 'floor' | 'ceil' = 'floor'
): bigint {
    return parseDecimalToAtomic(kasInput, KAS_DECIMALS, mode);
}

/**
 * Formats an atomic `BigInt` or `U128Str` into a human-readable fixed-point decimal string without JS floats.
 */
export function formatAtomicToDecimal(
    atomic: bigint | string,
    decimals: number,
    maxFractionDigits = decimals,
    trimTrailingZeros = true
): string {
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) {
        throw new RangeError(`Invalid decimals precision: ${decimals}`);
    }
    const val = parseU128Str(atomic, 'atomic');
    if (decimals === 0 || maxFractionDigits <= 0) {
        const scale = 10n ** BigInt(decimals);
        return (val / scale).toString();
    }

    const scale = 10n ** BigInt(decimals);
    const whole = val / scale;
    const rem = val % scale;
    const fullFrac = rem.toString().padStart(decimals, '0');
    const clampedFrac = fullFrac.slice(0, Math.min(decimals, maxFractionDigits));
    const displayFrac = trimTrailingZeros ? clampedFrac.replace(/0+$/, '') : clampedFrac;

    return displayFrac.length > 0 ? `${whole.toString()}.${displayFrac}` : whole.toString();
}

/**
 * Ceiling integer division (`ceil(numerator / denominator)`) using `BigInt`.
 */
export function ceilDivBigInt(numerator: bigint, denominator: bigint): bigint {
    if (denominator <= 0n) {
        throw new RangeError('ceilDivBigInt denominator must be > 0n.');
    }
    if (numerator < 0n) {
        throw new RangeError('ceilDivBigInt numerator cannot be negative.');
    }
    if (numerator === 0n) return 0n;
    return (numerator + denominator - 1n) / denominator;
}

/**
 * Multiplies an atomic amount by basis points (`0..=10_000`) and rounds strictly UP (`ceil`).
 */
export function mulBpsCeil(amount: bigint, bps: number | bigint): bigint {
    const cleanAmount = parseU128Str(amount, 'amount');
    const cleanBps = parseU128Str(bps, 'bps');
    if (cleanBps > BPS_SCALE) {
        throw new RangeError(`bps (${cleanBps}) cannot exceed ${MAX_BPS}.`);
    }
    return ceilDivBigInt(cleanAmount * cleanBps, BPS_SCALE);
}

/**
 * Multiplies an atomic amount by basis points (`0..=10_000`) and rounds down (`floor`).
 */
export function mulBpsFloor(amount: bigint, bps: number | bigint): bigint {
    const cleanAmount = parseU128Str(amount, 'amount');
    const cleanBps = parseU128Str(bps, 'bps');
    if (cleanBps > BPS_SCALE) {
        throw new RangeError(`bps (${cleanBps}) cannot exceed ${MAX_BPS}.`);
    }
    return (cleanAmount * cleanBps) / BPS_SCALE;
}

/**
 * Converts an atomic token quantity to USD micros (`1e6`) using E8 oracle price (`floor`).
 */
export function atomicToUsdMicrosFloor(
    amountAtomic: bigint,
    decimals: number,
    oracleUsdE8: bigint
): bigint {
    const amt = parseU128Str(amountAtomic, 'amountAtomic');
    const px = parseU128Str(oracleUsdE8, 'oracleUsdE8');
    const den = (10n ** BigInt(decimals)) * ORACLE_USD_E8_SCALE;
    return (amt * px * USD_MICROS_SCALE) / den;
}

/**
 * Converts an atomic token quantity to USD micros (`1e6`) using E8 oracle price (`ceil`).
 */
export function atomicToUsdMicrosCeil(
    amountAtomic: bigint,
    decimals: number,
    oracleUsdE8: bigint
): bigint {
    const amt = parseU128Str(amountAtomic, 'amountAtomic');
    const px = parseU128Str(oracleUsdE8, 'oracleUsdE8');
    const den = (10n ** BigInt(decimals)) * ORACLE_USD_E8_SCALE;
    return ceilDivBigInt(amt * px * USD_MICROS_SCALE, den);
}

/**
 * Normalizes sector allocation to integer basis points (`0..=10_000`).
 * Rejects floating-point percentages or out-of-range values.
 */
export function normalizeAllocationBps(input: {
    allocationBps?: unknown;
    allocationPercentage?: unknown;
}): number {
    if (input.allocationBps !== undefined && input.allocationBps !== null) {
        const bps = parseU128Str(input.allocationBps, 'allocationBps');
        if (bps > BPS_SCALE) {
            throw new RangeError(`allocationBps (${bps}) must be <= ${MAX_BPS}.`);
        }
        return Number(bps);
    }
    if (input.allocationPercentage !== undefined && input.allocationPercentage !== null) {
        const rawPct = input.allocationPercentage;
        if (typeof rawPct !== 'string' && typeof rawPct !== 'number') {
            throw new TypeError('allocationPercentage must be a number or decimal string.');
        }
        const bps = parseDecimalToAtomic(rawPct, 2, 'strict');
        if (bps > BPS_SCALE) {
            throw new RangeError(`allocationPercentage converts to ${bps} bps (> ${MAX_BPS}).`);
        }
        return Number(bps);
    }
    return 0;
}

/**
 * Computes Kaspa KIP-9 harmonic storage mass using pure `BigInt`.
 */
export function computePostToccataStorageMass(
    inputSompi: bigint[],
    outputSompi: bigint[]
): bigint {
    if (inputSompi.length === 0 || outputSompi.length === 0) {
        return 0n;
    }
    let harmonicOuts = 0n;
    for (const v of outputSompi) {
        harmonicOuts += v > 0n ? STORAGE_MASS_PARAMETER / v : STORAGE_MASS_PARAMETER;
    }

    if (outputSompi.length === 1 || inputSompi.length >= outputSompi.length) {
        let sumIns = 0n;
        for (const v of inputSompi) {
            sumIns += v;
        }
        const meanIns = sumIns / BigInt(inputSompi.length);
        if (meanIns <= 0n) {
            return harmonicOuts;
        }
        const arithmeticIns = BigInt(inputSompi.length) * (STORAGE_MASS_PARAMETER / meanIns);
        return harmonicOuts > arithmeticIns ? harmonicOuts - arithmeticIns : 0n;
    }

    let harmonicIns = 0n;
    for (const v of inputSompi) {
        if (v > 0n) {
            harmonicIns += STORAGE_MASS_PARAMETER / v;
        }
    }
    return harmonicOuts > harmonicIns ? harmonicOuts - harmonicIns : 0n;
}

/**
 * Computes Post-Toccata Transaction v1 compute, bandwidth, KIP-9 storage mass, and relay-safe fee (`ceil`).
 */
export function computePostToccataMassAndFee(params: {
    inputSompi: bigint[];
    outputSompi: bigint[];
    payloadByteLen?: number;
    extraSigScriptBytes?: number;
    feePerGramSompi?: bigint;
}): {
    computeGrams: bigint;
    bandwidthGrams: bigint;
    storageMass: bigint;
    effectiveMass: bigint;
    networkFeeSompi: bigint;
} {
    const nIn = BigInt(Math.max(1, params.inputSompi.length));
    const nOut = BigInt(Math.max(1, params.outputSompi.length));
    const extra = BigInt(
        Math.max(0, Math.trunc(params.payloadByteLen ?? 0)) +
            Math.max(0, Math.trunc(params.extraSigScriptBytes ?? 0))
    );
    const feePerGram = params.feePerGramSompi ?? RELAY_FEE_PER_GRAM_SOMPI;

    const computeGrams =
        BASE_COMPUTE_MASS +
        nIn * MASS_PER_INPUT +
        nOut * MASS_PER_OUTPUT +
        extra;
    const txBytes = 128n + nIn * 116n + nOut * 46n + extra;
    const bandwidthGrams = txBytes * 2n;
    const storageMass = computePostToccataStorageMass(params.inputSompi, params.outputSompi);

    let effectiveMass = computeGrams;
    if (bandwidthGrams > effectiveMass) effectiveMass = bandwidthGrams;
    if (storageMass > effectiveMass) effectiveMass = storageMass;

    const networkFeeSompi = effectiveMass * feePerGram;
    return {
        computeGrams,
        bandwidthGrams,
        storageMass,
        effectiveMass,
        networkFeeSompi
    };
}

/**
 * Encodes canonical minimal Kaspa `txscript` data push bytes.
 */
export function encodeTxScriptPushData(data: Uint8Array): Uint8Array {
    const len = data.length;
    if (len === 0) {
        return new Uint8Array([0x00]);
    }
    if (len <= 75) {
        return concatBytes(new Uint8Array([len]), data);
    }
    if (len <= 255) {
        return concatBytes(new Uint8Array([0x4c, len]), data);
    }
    if (len <= 65_535) {
        return concatBytes(new Uint8Array([0x4d]), writeUint16LE(len), data);
    }
    throw new RangeError(`txscript pushdata exceeds 65535 bytes (${len}).`);
}

/**
 * Counts signature operations inside a Kaspa P2SH redeemScript by skipping pushdata payloads accurately.
 */
export function countRedeemScriptSigOps(redeemScriptBytes: Uint8Array): number {
    let i = 0;
    let sigOps = 0;
    while (i < redeemScriptBytes.length) {
        const op = redeemScriptBytes[i];
        i += 1;
        if (op >= 0x01 && op <= 0x4b) {
            i += op;
        } else if (op === 0x4c) {
            if (i >= redeemScriptBytes.length) break;
            const len = redeemScriptBytes[i];
            i += 1 + len;
        } else if (op === 0x4d) {
            if (i + 1 >= redeemScriptBytes.length) break;
            const len = redeemScriptBytes[i] | (redeemScriptBytes[i + 1] << 8);
            i += 2 + len;
        } else if (op === 0x4e) {
            if (i + 3 >= redeemScriptBytes.length) break;
            const len =
                redeemScriptBytes[i] |
                (redeemScriptBytes[i + 1] << 8) |
                (redeemScriptBytes[i + 2] << 16) |
                (redeemScriptBytes[i + 3] << 24);
            i += 4 + Math.max(0, len);
        } else if (op === 0xac || op === 0xab || op === 0xad) {
            sigOps += 1;
        }
    }
    return Math.max(1, sigOps);
}

/**
 * Normalizes a Kaspa subnetworkId hex string to 40 lowercase hex chars.
 */
export function normalizeSubnetworkIdHex(subnetworkId: unknown): string {
    if (subnetworkId === undefined || subnetworkId === null || subnetworkId === '') {
        return NATIVE_SUBNETWORK_ID_HEX;
    }
    if (typeof subnetworkId !== 'string') {
        throw new BroadcastValidationError(
            'MALFORMED_TRANSACTION',
            'subnetworkId must be a 40-char hex string.'
        );
    }
    const clean = subnetworkId.trim().replace(/^0x/i, '').toLowerCase();
    if (!clean) return NATIVE_SUBNETWORK_ID_HEX;
    if (!HEX_RE.test(clean) || clean.length > 40) {
        throw new BroadcastValidationError(
            'MALFORMED_TRANSACTION',
            'subnetworkId contains invalid hex or exceeds 20 bytes.'
        );
    }
    return clean.padStart(40, '0');
}

function parseNonNegSafeIntStrict(
    raw: unknown,
    fieldName: string,
    defaultValue?: number
): number {
    if (raw === undefined || raw === null) {
        if (defaultValue !== undefined) return defaultValue;
        throw new BroadcastValidationError(
            'MALFORMED_TRANSACTION',
            `Missing required integer field: ${fieldName}.`
        );
    }
    if (typeof raw === 'number') {
        if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw < 0 || !Number.isSafeInteger(raw)) {
            throw new BroadcastValidationError(
                'MALFORMED_TRANSACTION',
                `${fieldName} must be a non-negative integer.`
            );
        }
        return raw;
    }
    if (typeof raw === 'string' && /^[0-9]+$/.test(raw.trim())) {
        const n = Number(raw.trim());
        if (!Number.isSafeInteger(n)) {
            throw new BroadcastValidationError(
                'MALFORMED_TRANSACTION',
                `${fieldName} exceeds safe integer bounds.`
            );
        }
        return n;
    }
    throw new BroadcastValidationError(
        'MALFORMED_TRANSACTION',
        `${fieldName} must be a non-negative integer.`
    );
}

function normalizeScriptPublicKey(
    rawSpk: unknown,
    outputIndex: number
): { version: number; scriptPublicKey: string } {
    if (typeof rawSpk === 'string') {
        const clean = rawSpk.trim().replace(/^0x/i, '').toLowerCase();
        if (!clean || clean.length % 2 !== 0 || !HEX_RE.test(clean)) {
            throw new BroadcastValidationError(
                'MALFORMED_TRANSACTION',
                `Output[${outputIndex}] scriptPublicKey hex is invalid.`
            );
        }
        return { version: 0, scriptPublicKey: clean };
    }
    if (rawSpk && typeof rawSpk === 'object') {
        const obj = rawSpk as Record<string, unknown>;
        const version = parseNonNegSafeIntStrict(
            obj.version ?? 0,
            `outputs[${outputIndex}].scriptPublicKey.version`,
            0
        );
        const hexRaw = obj.scriptPublicKey ?? obj.script_public_key;
        if (typeof hexRaw !== 'string') {
            throw new BroadcastValidationError(
                'MALFORMED_TRANSACTION',
                `Output[${outputIndex}] missing scriptPublicKey hex.`
            );
        }
        const clean = hexRaw.trim().replace(/^0x/i, '').toLowerCase();
        if (!clean || clean.length % 2 !== 0 || !HEX_RE.test(clean)) {
            throw new BroadcastValidationError(
                'MALFORMED_TRANSACTION',
                `Output[${outputIndex}] scriptPublicKey hex is invalid.`
            );
        }
        return { version, scriptPublicKey: clean };
    }
    throw new BroadcastValidationError(
        'MALFORMED_TRANSACTION',
        `Output[${outputIndex}] missing scriptPublicKey.`
    );
}

/**
 * Validates and normalizes an outbound `POST /api/broadcast` -> `:8002/v1/broadcast` transaction.
 * Enforces Post-Toccata `version: 1`, explicit `storageMass`, strict integer `sompi` amounts (rejects floats),
 * KIP-21 `subnetworkId`, and KIP-20 `covenant` output bindings.
 */
export function validateAndSanitizePostToccataBroadcastTx(rawPayload: unknown): {
    transaction: PostToccataTransactionV1;
    totalOutputSompi: bigint;
    firstOutputSompi: bigint;
} {
    if (!rawPayload || typeof rawPayload !== 'object') {
        throw new BroadcastValidationError('INVALID_PAYLOAD', 'Transaction payload must be an object.');
    }
    const envelope = rawPayload as Record<string, unknown>;
    const rawTx =
        envelope.transaction !== undefined && envelope.transaction !== null
            ? envelope.transaction
            : rawPayload;

    if (!rawTx || typeof rawTx !== 'object') {
        throw new BroadcastValidationError(
            'MALFORMED_TRANSACTION',
            'Transaction object is missing or malformed.'
        );
    }

    const tx = rawTx as Record<string, unknown>;

    if (tx.version !== POST_TOCCATA_TX_VERSION) {
        throw new BroadcastValidationError(
            'INVALID_TX_VERSION',
            `Post-Toccata Transaction v1 is required (expected version: 1, got ${String(tx.version)}).`
        );
    }

    const rawStorageMass = tx.storageMass ?? tx.storage_mass;
    if (rawStorageMass === undefined || rawStorageMass === null) {
        throw new BroadcastValidationError(
            'MISSING_OR_INVALID_STORAGE_MASS',
            'Post-Toccata Transaction v1 requires integer/string storageMass.'
        );
    }
    let storageMassBig: bigint;
    try {
        storageMassBig = parseSompiU64(rawStorageMass, 'storageMass');
    } catch (err: unknown) {
        throw new BroadcastValidationError(
            'MISSING_OR_INVALID_STORAGE_MASS',
            err instanceof Error ? err.message : 'Invalid storageMass.'
        );
    }

    if (!Array.isArray(tx.inputs) || tx.inputs.length === 0) {
        throw new BroadcastValidationError(
            'MALFORMED_TRANSACTION',
            'Transaction must contain at least one input.'
        );
    }
    if (!Array.isArray(tx.outputs) || tx.outputs.length === 0) {
        throw new BroadcastValidationError(
            'MALFORMED_TRANSACTION',
            'Transaction must contain at least one output.'
        );
    }

    const sanitizedInputs: PostToccataTxInput[] = tx.inputs.map((rawInp, idx) => {
        if (!rawInp || typeof rawInp !== 'object') {
            throw new BroadcastValidationError(
                'MALFORMED_TRANSACTION',
                `Input[${idx}] must be an object.`
            );
        }
        const inp = rawInp as Record<string, unknown>;
        const prev = (
            inp.previousOutpoint && typeof inp.previousOutpoint === 'object'
                ? inp.previousOutpoint
                : inp
        ) as Record<string, unknown>;
        const txId = String(prev.transactionId ?? prev.transaction_id ?? '')
            .trim()
            .toLowerCase();
        if (!HEX_32_BYTES_RE.test(txId)) {
            throw new BroadcastValidationError(
                'MALFORMED_TRANSACTION',
                `Input[${idx}] previousOutpoint.transactionId must be 64-char hex.`
            );
        }
        const index = parseNonNegSafeIntStrict(
            prev.index ?? 0,
            `inputs[${idx}].previousOutpoint.index`,
            0
        );
        const sequence = parseNonNegSafeIntStrict(
            inp.sequence ?? 0,
            `inputs[${idx}].sequence`,
            0
        );
        const sigOpCount = parseNonNegSafeIntStrict(
            inp.sigOpCount ?? inp.sig_op_count ?? 1,
            `inputs[${idx}].sigOpCount`,
            1
        );
        const sigScript = String(inp.signatureScript ?? inp.signature_script ?? '')
            .trim()
            .replace(/^0x/i, '')
            .toLowerCase();
        if (sigScript.length % 2 !== 0 || !HEX_RE.test(sigScript)) {
            throw new BroadcastValidationError(
                'MALFORMED_TRANSACTION',
                `Input[${idx}] signatureScript must be even-length hex.`
            );
        }
        return {
            previousOutpoint: {
                transactionId: txId,
                index
            },
            signatureScript: sigScript,
            sequence,
            sigOpCount: Math.max(1, sigOpCount)
        };
    });

    let totalOutputSompi = 0n;
    let firstOutputSompi = 0n;

    const sanitizedOutputs: PostToccataTxOutput[] = tx.outputs.map((rawOut, idx) => {
        if (!rawOut || typeof rawOut !== 'object') {
            throw new BroadcastValidationError(
                'MALFORMED_TRANSACTION',
                `Output[${idx}] must be an object.`
            );
        }
        const out = rawOut as Record<string, unknown>;
        const rawAmount = out.amount ?? out.value;
        if (rawAmount === undefined || rawAmount === null) {
            throw new BroadcastValidationError(
                'FLOAT_AMOUNT_FORBIDDEN',
                `Output[${idx}] is missing strict integer sompi amount.`
            );
        }
        if (typeof rawAmount === 'number') {
            if (!Number.isFinite(rawAmount) || !Number.isInteger(rawAmount) || rawAmount < 0 || !Number.isSafeInteger(rawAmount)) {
                throw new BroadcastValidationError(
                    'FLOAT_AMOUNT_FORBIDDEN',
                    `Output[${idx}] amount (${rawAmount}) rejected: floating-point or unsafe numeric sompi amounts are forbidden.`
                );
            }
        } else if (typeof rawAmount === 'string') {
            if (!/^[0-9]{1,20}$/.test(rawAmount.trim())) {
                throw new BroadcastValidationError(
                    'FLOAT_AMOUNT_FORBIDDEN',
                    `Output[${idx}] amount ("${rawAmount}") rejected: must be an unsigned integer sompi string.`
                );
            }
        } else if (typeof rawAmount !== 'bigint') {
            throw new BroadcastValidationError(
                'FLOAT_AMOUNT_FORBIDDEN',
                `Output[${idx}] amount must be an integer sompi string.`
            );
        }

        let sompi: bigint;
        try {
            sompi = parseSompiU64(rawAmount, `outputs[${idx}].amount`);
        } catch (err: unknown) {
            throw new BroadcastValidationError(
                'FLOAT_AMOUNT_FORBIDDEN',
                err instanceof Error ? err.message : `Output[${idx}] invalid sompi amount.`
            );
        }

        if (idx === 0) firstOutputSompi = sompi;
        totalOutputSompi += sompi;

        const spk = normalizeScriptPublicKey(
            out.scriptPublicKey ?? out.script_public_key,
            idx
        );

        const rawCov = out.covenant ?? out.covenantBinding ?? out.kip20Covenant;
        let covenant: Kip20CovenantBinding | undefined;
        if (rawCov !== undefined && rawCov !== null) {
            if (typeof rawCov !== 'object') {
                throw new BroadcastValidationError(
                    'INVALID_KIP20_COVENANT_BINDING',
                    `Output[${idx}] covenant must be an object.`
                );
            }
            const covObj = rawCov as Record<string, unknown>;
            const covId = String(covObj.covenantId ?? covObj.covenant_id ?? '')
                .trim()
                .replace(/^0x/i, '')
                .toLowerCase();
            if (!HEX_32_BYTES_RE.test(covId)) {
                throw new BroadcastValidationError(
                    'INVALID_KIP20_COVENANT_BINDING',
                    `Output[${idx}] covenant.covenantId must be a 64-char hex string.`
                );
            }
            const authInput = parseNonNegSafeIntStrict(
                covObj.authorizingInput ?? covObj.authorizing_input ?? 0,
                `outputs[${idx}].covenant.authorizingInput`,
                0
            );
            if (authInput >= sanitizedInputs.length) {
                throw new BroadcastValidationError(
                    'INVALID_KIP20_COVENANT_BINDING',
                    `Output[${idx}] covenant.authorizingInput (${authInput}) references out-of-range input.`
                );
            }
            covenant = {
                authorizingInput: authInput,
                covenantId: covId
            };
        }

        return {
            amount: sompi.toString(),
            scriptPublicKey: spk,
            ...(covenant ? { covenant } : {})
        };
    });

    const lockTime = parseNonNegSafeIntStrict(tx.lockTime ?? tx.lock_time ?? 0, 'lockTime', 0);
    const gas = parseNonNegSafeIntStrict(tx.gas ?? 0, 'gas', 0);
    const subnetworkId = normalizeSubnetworkIdHex(tx.subnetworkId ?? tx.subnetwork_id);
    const payload = String(tx.payload ?? '')
        .trim()
        .replace(/^0x/i, '')
        .toLowerCase();
    if (payload.length % 2 !== 0 || !HEX_RE.test(payload)) {
        throw new BroadcastValidationError(
            'MALFORMED_TRANSACTION',
            'Transaction payload must be even-length hex.'
        );
    }

    return {
        transaction: {
            version: POST_TOCCATA_TX_VERSION,
            inputs: sanitizedInputs,
            outputs: sanitizedOutputs,
            lockTime,
            subnetworkId,
            gas,
            payload,
            storageMass: storageMassBig.toString()
        },
        totalOutputSompi,
        firstOutputSompi
    };
}

/**
 * Computes Kaspa transaction payload hash with Blake2b-256 keyed by `TransactionSigningHash`.
 */
export function computePayloadHash(
    subnetworkId?: string,
    payloadHex?: string
): Uint8Array {
    const normalizedSubnet = normalizeSubnetworkIdHex(subnetworkId);
    const isNativeSubnetwork = normalizedSubnet === NATIVE_SUBNETWORK_ID_HEX;
    const cleanPayload = String(payloadHex ?? '').trim().replace(/^0x/i, '');
    const payloadBytes = cleanPayload ? hexToBytes(cleanPayload) : new Uint8Array(0);
    if (isNativeSubnetwork && payloadBytes.length === 0) {
        return new Uint8Array(32);
    }
    return new Uint8Array(
        blake2b(
            concatBytes(writeBigUint64LE(BigInt(payloadBytes.length)), payloadBytes),
            { dkLen: 32, key: TX_SIGNING_KEY }
        )
    );
}

/**
 * Computes Kaspa Transaction v1 input sighash using strict `BigInt` sompi amounts.
 */
export function computeKaspaTxV1InputSighash(
    tx: {
        version?: number;
        inputs: Array<{
            previousOutpoint: { transactionId: string; index: number };
            sequence?: number;
            sigOpCount?: number;
        }>;
        outputs: Array<{
            amount?: U128Str | number | bigint;
            value?: U128Str | number | bigint;
            scriptPublicKey: string | { version?: number; scriptPublicKey: string };
        }>;
        lockTime?: number;
        subnetworkId?: string;
        gas?: number;
        payload?: string;
    },
    inputIndex: number,
    utxoSpkHex: string,
    utxoAmountSompi: bigint,
    sighashType: number = SIGHASH_ALL,
    utxoSpkVersion = 0
): Uint8Array {
    const isAnyoneCanPay = (sighashType & 0x80) !== 0;
    const baseMask = sighashType & 0x7f;
    const isSingle = baseMask === 0x03 || baseMask === 0x04;
    const isNone = baseMask === 0x02;

    const prevOutsHash: Uint8Array = isAnyoneCanPay
        ? new Uint8Array(32)
        : new Uint8Array(
              blake2b(
                  concatBytes(
                      ...tx.inputs.map((i) =>
                          concatBytes(
                              hexToBytes(i.previousOutpoint.transactionId),
                              writeUint32LE(Number(i.previousOutpoint.index))
                          )
                      )
                  ),
                  { dkLen: 32, key: TX_SIGNING_KEY }
              )
          );

    const sequencesHash: Uint8Array =
        isAnyoneCanPay || isSingle || isNone
            ? new Uint8Array(32)
            : new Uint8Array(
                  blake2b(
                      concatBytes(
                          ...tx.inputs.map((i) => writeBigUint64LE(BigInt(i.sequence ?? 0)))
                      ),
                      { dkLen: 32, key: TX_SIGNING_KEY }
                  )
              );

    const sigOpCountsHash: Uint8Array = isAnyoneCanPay
        ? new Uint8Array(32)
        : new Uint8Array(
              blake2b(
                  concatBytes(
                      ...tx.inputs.map((i) => new Uint8Array([Number(i.sigOpCount ?? 1)]))
                  ),
                  { dkLen: 32, key: TX_SIGNING_KEY }
              )
          );

    const serializeOutputForHash = (o: (typeof tx.outputs)[number]): Uint8Array => {
        const spkStr =
            typeof o.scriptPublicKey === 'string'
                ? o.scriptPublicKey
                : o.scriptPublicKey?.scriptPublicKey || '';
        const spkVer =
            typeof o.scriptPublicKey === 'object' && o.scriptPublicKey !== null
                ? Number(o.scriptPublicKey.version ?? 0)
                : 0;
        const spkBytes = hexToBytes(spkStr);
        const amtSompi = parseSompiU64(o.amount ?? o.value ?? '0', 'output.amount');
        return concatBytes(
            writeBigUint64LE(amtSompi),
            writeUint16LE(spkVer),
            writeBigUint64LE(BigInt(spkBytes.length)),
            spkBytes
        );
    };

    let outputsHash: Uint8Array;
    if (isNone) {
        outputsHash = new Uint8Array(32);
    } else if (isSingle) {
        outputsHash =
            inputIndex >= tx.outputs.length
                ? new Uint8Array(32)
                : new Uint8Array(
                      blake2b(serializeOutputForHash(tx.outputs[inputIndex]), {
                          dkLen: 32,
                          key: TX_SIGNING_KEY
                      })
                  );
    } else {
        outputsHash = new Uint8Array(
            blake2b(concatBytes(...tx.outputs.map(serializeOutputForHash)), {
                dkLen: 32,
                key: TX_SIGNING_KEY
            })
        );
    }

    const input = tx.inputs[inputIndex];
    const utxoSpkBytes = hexToBytes(utxoSpkHex);
    const normalizedSubnet = normalizeSubnetworkIdHex(tx.subnetworkId);
    const subnetworkIdBytes =
        normalizedSubnet !== NATIVE_SUBNETWORK_ID_HEX
            ? hexToBytes(normalizedSubnet)
            : new Uint8Array(20);
    const payloadHash = computePayloadHash(normalizedSubnet, tx.payload);

    const sigHashData = concatBytes(
        writeUint16LE(Number(tx.version ?? POST_TOCCATA_TX_VERSION)),
        prevOutsHash,
        sequencesHash,
        sigOpCountsHash,
        hexToBytes(input.previousOutpoint.transactionId),
        writeUint32LE(Number(input.previousOutpoint.index)),
        writeUint16LE(utxoSpkVersion),
        writeBigUint64LE(BigInt(utxoSpkBytes.length)),
        utxoSpkBytes,
        writeBigUint64LE(utxoAmountSompi),
        writeBigUint64LE(BigInt(input.sequence ?? 0)),
        new Uint8Array([Number(input.sigOpCount ?? 1)]),
        outputsHash,
        writeBigUint64LE(BigInt(tx.lockTime ?? 0)),
        subnetworkIdBytes,
        writeBigUint64LE(BigInt(tx.gas ?? 0)),
        payloadHash,
        new Uint8Array([sighashType])
    );
    return new Uint8Array(blake2b(sigHashData, { dkLen: 32, key: TX_SIGNING_KEY }));
}

function resolvePsktSpk(
    rawSpk: string | { version?: number; scriptPublicKey: string } | undefined
): { version: number; scriptPublicKey: string } {
    if (typeof rawSpk === 'string') {
        return { version: 0, scriptPublicKey: rawSpk.trim().replace(/^0x/i, '').toLowerCase() };
    }
    if (rawSpk && typeof rawSpk === 'object') {
        return {
            version: Number(rawSpk.version ?? 0),
            scriptPublicKey: String(rawSpk.scriptPublicKey ?? '')
                .trim()
                .replace(/^0x/i, '')
                .toLowerCase()
        };
    }
    return { version: 0, scriptPublicKey: '' };
}

/**
 * Signs a `BUILD_VAULT_CANCEL_PSKT` Path A (`OP_TRUE` owner branch) P2SH transaction locally.
 * Zeroes private key bytes before returning.
 */
export function signVaultCancelPskt(params: {
    pskt: PsktPayload;
    privateKeyHex: string;
    redeemScriptHex?: string;
    storageMass?: bigint | string | number;
}): PostToccataTransactionV1 {
    const cleanPrivHex = params.privateKeyHex.trim().replace(/^0x/i, '');
    if (!HEX_32_BYTES_RE.test(cleanPrivHex)) {
        throw new Error('ERR_INVALID_SIGNER_PRIVATE_KEY');
    }
    const privKeyBytes = hexToBytes(cleanPrivHex);
    try {
        const pskt = params.pskt;
        if (!pskt || !Array.isArray(pskt.inputs) || pskt.inputs.length === 0) {
            throw new Error('ERR_EMPTY_VAULT_CANCEL_PSKT_INPUTS');
        }
        if (!Array.isArray(pskt.outputs) || pskt.outputs.length === 0) {
            throw new Error('ERR_EMPTY_VAULT_CANCEL_PSKT_OUTPUTS');
        }

        const inputSpks: Array<{ version: number; scriptPublicKey: string }> = [];
        const inputAmounts: bigint[] = [];
        const inputRedeemScripts: Uint8Array[] = [];
        const txInputs: PostToccataTxInput[] = pskt.inputs.map((inp, idx) => {
            const redeemHex = String(
                inp.redeemScriptHex ?? params.redeemScriptHex ?? ''
            )
                .trim()
                .replace(/^0x/i, '');
            if (!redeemHex) {
                throw new Error(`ERR_MISSING_REDEEM_SCRIPT_INPUT_${idx}`);
            }
            const redeemBytes = hexToBytes(redeemHex);
            inputRedeemScripts.push(redeemBytes);

            const utxoAmt = parseSompiU64(
                inp.utxoEntry?.amount ?? inp.amount,
                `pskt.inputs[${idx}].amount`
            );
            inputAmounts.push(utxoAmt);

            const spk = resolvePsktSpk(inp.utxoEntry?.scriptPublicKey ?? inp.scriptPublicKey);
            if (!spk.scriptPublicKey) {
                const scriptHashHex = bytesToHex(new Uint8Array(blake2b(redeemBytes, { dkLen: 32 })));
                spk.scriptPublicKey = `a9${scriptHashHex}87`;
            }
            inputSpks.push(spk);

            const sigOpCount =
                inp.sigOpCount !== undefined
                    ? Math.max(1, Number(inp.sigOpCount))
                    : countRedeemScriptSigOps(redeemBytes);

            return {
                previousOutpoint: {
                    transactionId: inp.previousOutpoint.transactionId,
                    index: Number(inp.previousOutpoint.index)
                },
                signatureScript: '',
                sequence: Number(inp.sequence ?? 0),
                sigOpCount
            };
        });

        const outputAmounts: bigint[] = [];
        const txOutputs: PostToccataTxOutput[] = pskt.outputs.map((out, idx) => {
            const amt = parseSompiU64(out.amount ?? out.value, `pskt.outputs[${idx}].value`);
            outputAmounts.push(amt);
            const spk = resolvePsktSpk(out.scriptPublicKey);
            return {
                amount: amt.toString(),
                scriptPublicKey: spk,
                ...(out.covenant ? { covenant: out.covenant } : {})
            };
        });

        const resolvedStorageMass =
            params.storageMass !== undefined
                ? parseSompiU64(params.storageMass, 'storageMass')
                : pskt.storageMass !== undefined
                  ? parseSompiU64(pskt.storageMass, 'pskt.storageMass')
                  : computePostToccataStorageMass(inputAmounts, outputAmounts);

        const tx: PostToccataTransactionV1 = {
            version: POST_TOCCATA_TX_VERSION,
            inputs: txInputs,
            outputs: txOutputs,
            lockTime: Number(pskt.lockTime ?? 0),
            subnetworkId: normalizeSubnetworkIdHex(pskt.subnetworkId),
            gas: Number(pskt.gas ?? 0),
            payload: String(pskt.payload ?? '').trim().replace(/^0x/i, ''),
            storageMass: resolvedStorageMass.toString()
        };

        for (let i = 0; i < tx.inputs.length; i += 1) {
            const sighash = computeKaspaTxV1InputSighash(
                tx,
                i,
                inputSpks[i].scriptPublicKey,
                inputAmounts[i],
                SIGHASH_ALL,
                inputSpks[i].version
            );
            const sig = schnorr.sign(sighash, privKeyBytes);
            const sigWithHashType = concatBytes(sig, new Uint8Array([SIGHASH_ALL]));
            const witnessBytes = concatBytes(
                encodeTxScriptPushData(sigWithHashType),
                new Uint8Array([0x51]), // OP_TRUE -> Path A 24/7 owner cancellation branch
                encodeTxScriptPushData(inputRedeemScripts[i])
            );
            tx.inputs[i].signatureScript = bytesToHex(witnessBytes);
        }

        return tx;
    } finally {
        privKeyBytes.fill(0);
    }
}

/**
 * Signs an unsigned `:8002` `POST /v1/sor/execute` PSKT locally in Post-Toccata Transaction v1 format.
 * Preserves KIP-20 `covenant` output bindings and `storageMass`. Zeroes private key bytes before returning.
 */
export function signSorPskt(params: {
    pskt: PsktPayload;
    privateKeyHex: string;
    formattedUtxos?: Array<{
        transactionId?: string;
        index?: number;
        amount?: U128Str | number;
        scriptPublicKey?: string | { version?: number; scriptPublicKey: string };
        outpoint?: { transactionId?: string; index?: number };
        utxoEntry?: {
            amount?: U128Str | number;
            scriptPublicKey?: string | { version?: number; scriptPublicKey: string };
        };
    }>;
}): PostToccataTransactionV1 {
    const cleanPrivHex = params.privateKeyHex.trim().replace(/^0x/i, '');
    if (!HEX_32_BYTES_RE.test(cleanPrivHex)) {
        throw new Error('ERR_INVALID_SIGNER_PRIVATE_KEY');
    }
    const privKeyBytes = hexToBytes(cleanPrivHex);
    try {
        const pskt = params.pskt;
        if (!pskt || !Array.isArray(pskt.inputs) || pskt.inputs.length === 0) {
            throw new Error('ERR_EMPTY_SOR_PSKT_INPUTS');
        }
        if (!Array.isArray(pskt.outputs) || pskt.outputs.length === 0) {
            throw new Error('ERR_EMPTY_SOR_PSKT_OUTPUTS');
        }

        const utxos = params.formattedUtxos ?? [];
        const inputAmounts: bigint[] = [];
        const inputSpks: Array<{ version: number; scriptPublicKey: string }> = [];

        const txInputs: PostToccataTxInput[] = pskt.inputs.map((inp, idx) => {
            const txId = inp.previousOutpoint.transactionId.toLowerCase();
            const outIdx = Number(inp.previousOutpoint.index);
            const matchedUtxo = utxos.find(
                (u) =>
                    String(u.transactionId ?? u.outpoint?.transactionId ?? '').toLowerCase() ===
                        txId && Number(u.index ?? u.outpoint?.index ?? 0) === outIdx
            );
            const rawAmt =
                inp.utxoEntry?.amount ??
                inp.amount ??
                matchedUtxo?.utxoEntry?.amount ??
                matchedUtxo?.amount;
            const amt = parseSompiU64(rawAmt, `sor.inputs[${idx}].amount`);
            inputAmounts.push(amt);

            const spk = resolvePsktSpk(
                inp.utxoEntry?.scriptPublicKey ??
                    inp.scriptPublicKey ??
                    matchedUtxo?.utxoEntry?.scriptPublicKey ??
                    matchedUtxo?.scriptPublicKey
            );
            if (!spk.scriptPublicKey) {
                throw new Error(`ERR_MISSING_UTXO_SPK_FOR_INPUT_${idx}`);
            }
            inputSpks.push(spk);

            return {
                previousOutpoint: { transactionId: txId, index: outIdx },
                signatureScript: '',
                sequence: Number(inp.sequence ?? 0),
                sigOpCount: Math.max(1, Number(inp.sigOpCount ?? 1))
            };
        });

        const outputAmounts: bigint[] = [];
        const txOutputs: PostToccataTxOutput[] = pskt.outputs.map((out, idx) => {
            const amt = parseSompiU64(out.amount ?? out.value, `sor.outputs[${idx}].amount`);
            outputAmounts.push(amt);
            return {
                amount: amt.toString(),
                scriptPublicKey: resolvePsktSpk(out.scriptPublicKey),
                ...(out.covenant ? { covenant: out.covenant } : {})
            };
        });

        const storageMass =
            pskt.storageMass !== undefined
                ? parseSompiU64(pskt.storageMass, 'pskt.storageMass')
                : computePostToccataStorageMass(inputAmounts, outputAmounts);

        const tx: PostToccataTransactionV1 = {
            version: POST_TOCCATA_TX_VERSION,
            inputs: txInputs,
            outputs: txOutputs,
            lockTime: Number(pskt.lockTime ?? 0),
            subnetworkId: normalizeSubnetworkIdHex(pskt.subnetworkId),
            gas: Number(pskt.gas ?? 0),
            payload: String(pskt.payload ?? '').trim().replace(/^0x/i, ''),
            storageMass: storageMass.toString()
        };

        for (let i = 0; i < tx.inputs.length; i += 1) {
            const sighash = computeKaspaTxV1InputSighash(
                tx,
                i,
                inputSpks[i].scriptPublicKey,
                inputAmounts[i],
                SIGHASH_ALL,
                inputSpks[i].version
            );
            const sig = schnorr.sign(sighash, privKeyBytes);
            tx.inputs[i].signatureScript = `41${bytesToHex(sig)}01`;
        }

        return tx;
    } finally {
        privKeyBytes.fill(0);
    }
}

export type NormalizedStateActionResult =
    | { ok: true; payload: Record<string, unknown> }
    | {
          ok: false;
          status: 400 | 422;
          body: { success: false; error: string; message: string };
      };

const VALID_VAULT_KINDS = new Set<string>([
    'MINER_SILO',
    'STANDALONE_WALLET_SILO',
    'MAKER_PLANT'
]);

const VALID_THERMOSTAT_VALVE_TYPES = new Set<string>([
    'VALVE_1_ELECTRIC_BILL',
    'VALVE_2_AGENT_X402_FLOOR',
    'VALVE_3_JIT_VISA_CEILING',
    'VALVE_4_TANGEM_COLD_OR_PLANT'
]);

function normalizeSingleThermostatValve(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== 'object') {
        throw new TypeError('Thermostat valve entry must be an object.');
    }
    const v = raw as Record<string, unknown>;
    const priority = Number(v.priorityOrder);
    if (!Number.isInteger(priority) || priority < 1 || priority > 4) {
        throw new RangeError('Thermostat valve priorityOrder must be an integer between 1 and 4.');
    }
    if (v.valveType !== undefined && !VALID_THERMOSTAT_VALVE_TYPES.has(String(v.valveType))) {
        throw new TypeError(`Unsupported thermostat valveType: ${String(v.valveType)}`);
    }
    const destinationAddress = String(v.destinationAddress ?? '').trim();
    if (!destinationAddress) {
        throw new TypeError('Thermostat valve destinationAddress is required.');
    }
    const normalized: Record<string, unknown> = {
        ...v,
        priorityOrder: priority,
        destinationAddress
    };
    if (v.targetCapSompi !== undefined && v.targetCapSompi !== null && v.targetCapSompi !== '') {
        normalized.targetCapSompi = toU128Str(
            parseSompiU64(v.targetCapSompi, 'targetCapSompi'),
            'targetCapSompi'
        );
    }
    if (
        v.targetCapUsdMicros !== undefined &&
        v.targetCapUsdMicros !== null &&
        v.targetCapUsdMicros !== ''
    ) {
        normalized.targetCapUsdMicros = toU128Str(
            parseU128Str(v.targetCapUsdMicros, 'targetCapUsdMicros'),
            'targetCapUsdMicros'
        );
    }
    return normalized;
}

/**
 * Validates and normalizes `POST /v1/state/action` payloads.
 * Fails closed with `422 NON_CUSTODIAL_L1_ONLY` for retired custodial claims/staking/sweeps,
 * and validates `allocationBps` + Sovereign L1 vault/thermostat parameters.
 */
export function normalizeStateActionPayload(
    actionRaw: string,
    rawPayload: unknown
): NormalizedStateActionResult {
    const action = String(actionRaw || '').trim().toUpperCase();
    if (RETIRED_CUSTODIAL_STATE_ACTIONS.has(action)) {
        return {
            ok: false,
            status: 422,
            body: {
                success: false,
                error: 'NON_CUSTODIAL_L1_ONLY',
                message:
                    'Custodial balance claims and legacy staking sweeps are retired. Manage self-custodial payouts directly from your wallet or Vault Lock.'
            }
        };
    }

    const payload =
        rawPayload && typeof rawPayload === 'object'
            ? { ...(rawPayload as Record<string, unknown>) }
            : {};

    try {
        if (action === 'UPDATE_SECTOR_ALLOCATION') {
            const allocationBps = normalizeAllocationBps({
                allocationBps: payload.allocationBps,
                allocationPercentage: payload.allocationPercentage
            });
            payload.allocationBps = allocationBps;
            payload.allocationPercentage = Math.round(allocationBps / 100);
        } else if (action === 'SYNC_LAYOUT' && Array.isArray(payload.sectors)) {
            payload.sectors = payload.sectors.map((sec) => {
                if (!sec || typeof sec !== 'object') return sec;
                const s = sec as Record<string, unknown>;
                const allocationBps = normalizeAllocationBps({
                    allocationBps: s.allocationBps,
                    allocationPercentage: s.allocationPercentage
                });
                return {
                    ...s,
                    allocationBps,
                    allocationPercentage: Math.round(allocationBps / 100)
                };
            });
        } else if (action === 'REGISTER_VAULT_LOCK') {
            if (payload.vaultKind !== undefined && !VALID_VAULT_KINDS.has(String(payload.vaultKind))) {
                throw new TypeError(`Invalid vaultKind: ${String(payload.vaultKind)}`);
            }
            if (
                payload.thresholdSompi !== undefined &&
                payload.thresholdSompi !== null &&
                payload.thresholdSompi !== ''
            ) {
                const sompi = parseSompiU64(payload.thresholdSompi, 'thresholdSompi');
                if (sompi <= 0n) {
                    throw new RangeError('thresholdSompi must be > 0.');
                }
                payload.thresholdSompi = sompi.toString();
            }
            if (payload.feeBps !== undefined && payload.feeBps !== null) {
                const feeBps = parseU128Str(payload.feeBps, 'feeBps');
                if (feeBps > 1000n) {
                    throw new RangeError('feeBps must be <= 1000.');
                }
                payload.feeBps = Number(feeBps);
            }
            if (payload.makerSpreadBps !== undefined && payload.makerSpreadBps !== null) {
                const spreadBps = parseU128Str(payload.makerSpreadBps, 'makerSpreadBps');
                if (spreadBps > 1000n) {
                    throw new RangeError('makerSpreadBps must be <= 1000.');
                }
                payload.makerSpreadBps = Number(spreadBps);
            }
        } else if (action === 'BUILD_VAULT_CANCEL_PSKT') {
            const vaultId = String(payload.vaultId ?? '').trim();
            if (!vaultId) {
                throw new TypeError('Missing vaultId for BUILD_VAULT_CANCEL_PSKT.');
            }
            payload.vaultId = vaultId;
        } else if (action === 'UPSERT_THERMOSTAT_VALVES') {
            if (Array.isArray(payload.valves)) {
                if (payload.valves.length === 0) {
                    throw new TypeError('valves array cannot be empty.');
                }
                payload.valves = payload.valves.map(normalizeSingleThermostatValve);
            } else {
                const normalizedValve = normalizeSingleThermostatValve(payload);
                return { ok: true, payload: normalizedValve };
            }
        }

        return { ok: true, payload };
    } catch (err: unknown) {
        return {
            ok: false,
            status: 400,
            body: {
                success: false,
                error: 'INVALID_STATE_ACTION_PAYLOAD',
                message: err instanceof Error ? err.message : 'Invalid action payload.'
            }
        };
    }
}
