import { blake2b } from '@noble/hashes/blake2.js';
import {
    KASPA_ADDR_VERSION_P2PK_SCHNORR,
    bytesToHex,
    writeBigUint64LE,
    concatBytes,
    encodeKaspaAddressFromPubkeyBytes,
    encodeKaspaP2shAddressFromScriptHash,
    validateKaspaBech32mAddress,
    decodeAddressToVersionAndHash
} from './kaspaAddress';

export type ForgeTokenStandard = 'KRC-20' | 'KCC-20';

export interface KCC20StateSpec {
    amount: bigint;
    ownerHex: string;
    ownerScheme: number;
    borrowScheme: number;
    borrowGuardHex: string;
    extensionCommitmentHex: string;
    packedStateHex: string;
    stateRootHex: string;
    covenantIdHex: string;
}

export interface SilverScriptVaultCompilation {
    contractName: string;
    ticker: string;
    tokenStandard: ForgeTokenStandard;
    label: string;
    beneficiaryAddress: string;
    beneficiaryPubkeyHex: string;
    cliffDays: number;
    cliffTimestamp: number;
    linearDays: number;
    totalAllocation: number;
    silverscriptSource: string;
    redeemScriptHex: string;
    scriptHashHex: string;
    covenantAddress: string;
    covenantSpkHex: string;
    kcc20State: KCC20StateSpec;
}

export interface CapTableEntry {
    id: string;
    label: string;
    address: string;
    amount: number;
    pctOfSupply: number;
    cliffDays: number;
    linearDays: number;
    checksumValid: boolean;
    checksumError?: string;
    txHash?: string;
    vprogStateRoot?: string;
    covenantAddress?: string;
    silverscriptSource?: string;
    redeemScriptHex?: string;
    kcc20StateCommitment?: string;
    tokenStandard?: ForgeTokenStandard;
}

export interface CapTableFanoutReceipt {
    label: string;
    recipientAddress: string;
    covenantAddress?: string;
    amountTokens: number;
    cliffDays: number;
    linearDays: number;
    txId: string;
    explorerUrl: string;
    isTimelockedCovenant: boolean;
    tokenStandard?: ForgeTokenStandard;
    kcc20StateCommitment?: string;
}

export interface CapTableCsvParseResult {
    entries: CapTableEntry[];
    validCount: number;
    invalidCount: number;
    totalAllocatedTokens: number;
    errors: string[];
}

const CANONICAL_GENESIS_ANCHOR_EPOCH_SEC = 1_767_225_600;

export function encodeKcc20StateCommitment(params: {
    ticker: string;
    amountBaseUnits: bigint;
    ownerBytes32: Uint8Array;
    ownerScheme: number;
    borrowScheme: number;
    borrowGuardBytes32: Uint8Array;
    charterSha256Hex?: string;
}): KCC20StateSpec {
    const cleanTicker = params.ticker.trim().toUpperCase() || 'SILO';
    const amountBytes = writeBigUint64LE(
        params.amountBaseUnits >= 0n ? params.amountBaseUnits : 0n
    );
    const owner32 = new Uint8Array(32);
    owner32.set(params.ownerBytes32.slice(0, 32));
    const borrowGuard32 = new Uint8Array(32);
    borrowGuard32.set(params.borrowGuardBytes32.slice(0, 32));
    const extSeed = `${cleanTicker}:${params.charterSha256Hex || 'PERENNIA_KCC20_CHARTER_V1'}`;
    const extension32 = new Uint8Array(
        blake2b(new TextEncoder().encode(extSeed), { dkLen: 32 })
    );
    const packed = concatBytes(
        amountBytes,
        owner32,
        new Uint8Array([params.ownerScheme & 0xff]),
        new Uint8Array([params.borrowScheme & 0xff]),
        borrowGuard32,
        extension32
    );
    const stateRootBytes = new Uint8Array(
        blake2b(packed, {
            dkLen: 32,
            key: new TextEncoder().encode('KCC20StateCommitment')
        })
    );
    const covenantIdBytes = new Uint8Array(
        blake2b(
            concatBytes(new TextEncoder().encode(`KCC-20:${cleanTicker}:`), stateRootBytes),
            { dkLen: 32 }
        )
    );
    return {
        amount: params.amountBaseUnits,
        ownerHex: bytesToHex(owner32),
        ownerScheme: params.ownerScheme & 0xff,
        borrowScheme: params.borrowScheme & 0xff,
        borrowGuardHex: bytesToHex(borrowGuard32),
        extensionCommitmentHex: bytesToHex(extension32),
        packedStateHex: bytesToHex(packed),
        stateRootHex: bytesToHex(stateRootBytes),
        covenantIdHex: bytesToHex(covenantIdBytes)
    };
}

export function compileSilverScriptProofOfLockVault(params: {
    ticker: string;
    tokenStandard?: ForgeTokenStandard;
    label?: string;
    beneficiaryAddress: string;
    totalAllocation: number;
    decimals?: number;
    cliffDays: number;
    linearDays: number;
    anchorTimestampSec?: number;
    charterSha256Hex?: string;
}): SilverScriptVaultCompilation {
    const cleanTicker = String(params.ticker || 'SILO').trim().toUpperCase();
    const tokenStandard: ForgeTokenStandard =
        params.tokenStandard === 'KCC-20' ? 'KCC-20' : 'KRC-20';
    const label = String(params.label || 'Genesis Tranche').trim() || 'Genesis Tranche';
    const cliffDays = Math.max(0, Math.floor(Number(params.cliffDays || 0)));
    const linearDays = Math.max(0, Math.floor(Number(params.linearDays || 0)));
    const totalAllocation = Math.max(0, Math.floor(Number(params.totalAllocation || 0)));
    const decimals = Math.max(0, Math.min(18, Math.floor(Number(params.decimals ?? 8))));
    const baseAnchorSec =
        params.anchorTimestampSec && params.anchorTimestampSec > 0
            ? Math.floor(params.anchorTimestampSec)
            : CANONICAL_GENESIS_ANCHOR_EPOCH_SEC;
    const cliffTimestamp = baseAnchorSec + cliffDays * 86_400;
    let beneficiaryPubkeyBytes: Uint8Array = new Uint8Array(32);
    let ownerScheme = KASPA_ADDR_VERSION_P2PK_SCHNORR;
    let normalizedBeneficiary = String(params.beneficiaryAddress || '').trim().toLowerCase();
    try {
        const decoded = decodeAddressToVersionAndHash(normalizedBeneficiary);
        if (decoded.hash32.length === 32) {
            beneficiaryPubkeyBytes = new Uint8Array(decoded.hash32);
        } else {
            beneficiaryPubkeyBytes.set(decoded.hash32.slice(0, 32));
        }
        ownerScheme = decoded.version;
        if (!normalizedBeneficiary.startsWith('kaspa:')) {
            normalizedBeneficiary = `kaspa:${normalizedBeneficiary}`;
        }
    } catch {
        beneficiaryPubkeyBytes = new Uint8Array(
            blake2b(
                new TextEncoder().encode(`PERENNIA_BENEFICIARY:${normalizedBeneficiary}`),
                { dkLen: 32 }
            )
        );
        normalizedBeneficiary = encodeKaspaAddressFromPubkeyBytes(beneficiaryPubkeyBytes);
    }
    const beneficiaryPubkeyHex = bytesToHex(beneficiaryPubkeyBytes);
    const totalBaseUnits = BigInt(totalAllocation) * 10n ** BigInt(decimals);
    const silverscriptSource = [
        `pragma silverscript ^1.0.0;`,
        ``,
        `// Perennia Sovereign Forge — L1 UTXO Proof-of-Lock & ${tokenStandard} Covenant`,
        `// Ticker: ${cleanTicker} | Tranche: ${label} | 22:00 UTC Daily Release`,
        `contract ProofOfLockVault(`,
        `    pubkey beneficiary,`,
        `    int cliffTimestamp,`,
        `    int linearDays,`,
        `    int totalAllocation`,
        `) {`,
        `    // Constructor Bindings:`,
        `    // beneficiary     = 0x${beneficiaryPubkeyHex}`,
        `    // cliffTimestamp  = ${cliffTimestamp} (${cliffDays}d cliff)`,
        `    // linearDays      = ${linearDays} (${linearDays}d linear vesting)`,
        `    // totalAllocation = ${totalAllocation} ${cleanTicker}`,
        `    entrypoint function unlockTranche(sig beneficiarySig, int currentEpochTs, int claimAmount) {`,
        `        require(checkSig(beneficiarySig, beneficiary));`,
        `        require(tx.time >= cliffTimestamp);`,
        `        require(currentEpochTs >= cliffTimestamp);`,
        ``,
        `        int elapsedSeconds = currentEpochTs - cliffTimestamp;`,
        `        int linearDurationSeconds = linearDays * 86400;`,
        `        int maxVested = totalAllocation;`,
        `        if (linearDurationSeconds > 0 && elapsedSeconds < linearDurationSeconds) {`,
        `            maxVested = (totalAllocation * elapsedSeconds) / linearDurationSeconds;`,
        `        }`,
        `        require(claimAmount > 0 && claimAmount <= maxVested);`,
        ``,
        `        bytes32 expectedSpk = new ScriptPublicKeyP2PK(beneficiary);`,
        `        require(tx.outputs[0].scriptPublicKey == expectedSpk);`,
        `    }`,
        `}`
    ].join('\n');
    const silAstDigest = new Uint8Array(
        blake2b(new TextEncoder().encode(silverscriptSource), {
            dkLen: 32
        })
    );
    const redeemScriptBytes = concatBytes(
        new Uint8Array([0x20]),
        beneficiaryPubkeyBytes,
        new Uint8Array([0xac, 0x08]),
        writeBigUint64LE(BigInt(cliffTimestamp)),
        new Uint8Array([0xb1, 0x75, 0x08]),
        writeBigUint64LE(BigInt(linearDays)),
        new Uint8Array([0x75, 0x08]),
        writeBigUint64LE(BigInt(totalAllocation)),
        new Uint8Array([0x75, 0x20]),
        silAstDigest,
        new Uint8Array([0x75, 0x51])
    );
    const scriptHashBytes = new Uint8Array(blake2b(redeemScriptBytes, { dkLen: 32 }));
    const scriptHashHex = bytesToHex(scriptHashBytes);
    const covenantAddress = encodeKaspaP2shAddressFromScriptHash(scriptHashBytes);
    const covenantSpkHex = `a9${scriptHashHex}87`;
    const isTimelocked = cliffDays > 0 || linearDays > 0;
    const kcc20State = encodeKcc20StateCommitment({
        ticker: cleanTicker,
        amountBaseUnits: totalBaseUnits,
        ownerBytes32: beneficiaryPubkeyBytes,
        ownerScheme,
        borrowScheme: isTimelocked ? 0x01 : 0x00,
        borrowGuardBytes32: scriptHashBytes,
        charterSha256Hex: params.charterSha256Hex
    });
    return {
        contractName: 'ProofOfLockVault',
        ticker: cleanTicker,
        tokenStandard,
        label,
        beneficiaryAddress: normalizedBeneficiary,
        beneficiaryPubkeyHex,
        cliffDays,
        cliffTimestamp,
        linearDays,
        totalAllocation,
        silverscriptSource,
        redeemScriptHex: bytesToHex(redeemScriptBytes),
        scriptHashHex,
        covenantAddress,
        covenantSpkHex,
        kcc20State
    };
}

export function parseCapTableCsv(
    csvText: string,
    maxSupply = 21_000_000,
    ticker = 'SILO',
    tokenStandard: ForgeTokenStandard = 'KRC-20'
): CapTableCsvParseResult {
    const lines = String(csvText || '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'));
    const entries: CapTableEntry[] = [];
    const errors: string[] = [];
    let validCount = 0;
    let invalidCount = 0;
    let totalAllocatedTokens = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (
            i === 0 &&
            line.toLowerCase().includes('address') &&
            line.toLowerCase().includes('amount')
        ) {
            continue;
        }
        const cols = line.split(',').map((c) => c.trim());
        if (cols.length < 2) {
            errors.push(`Row ${i + 1}: Expected at least address,amount`);
            invalidCount++;
            continue;
        }
        const [rawAddr, rawAmt, rawLabel, rawCliff, rawLinear] = cols;
        const amount = Math.max(0, parseFloat(rawAmt) || 0);
        const label = rawLabel || `Tranche #${entries.length + 1}`;
        const cliffDays = Math.max(0, parseInt(rawCliff || '0', 10) || 0);
        const linearDays = Math.max(0, parseInt(rawLinear || '0', 10) || 0);
        const check = validateKaspaBech32mAddress(rawAddr);
        const pctOfSupply =
            maxSupply > 0 ? Number(((amount / maxSupply) * 100).toFixed(4)) : 0;
        let covenantAddress: string | undefined = undefined;
        let silverscriptSource: string | undefined = undefined;
        let redeemScriptHex: string | undefined = undefined;
        let kcc20StateCommitment: string | undefined = undefined;
        if (check.valid && amount > 0) {
            validCount++;
            totalAllocatedTokens += amount;
            if (cliffDays > 0 || linearDays > 0 || tokenStandard === 'KCC-20') {
                const compiled = compileSilverScriptProofOfLockVault({
                    ticker,
                    tokenStandard,
                    label,
                    beneficiaryAddress: check.normalized,
                    totalAllocation: amount,
                    cliffDays,
                    linearDays
                });
                covenantAddress = compiled.covenantAddress;
                silverscriptSource = compiled.silverscriptSource;
                redeemScriptHex = compiled.redeemScriptHex;
                kcc20StateCommitment = compiled.kcc20State.stateRootHex;
            }
        } else {
            invalidCount++;
            errors.push(
                `Row ${i + 1} (${label}): ${check.error || 'Amount must be > 0'}`
            );
        }
        entries.push({
            id: `cap_${Date.now()}_${i}`,
            label,
            address: check.normalized || rawAddr,
            amount,
            pctOfSupply,
            cliffDays,
            linearDays,
            checksumValid: check.valid && amount > 0,
            checksumError: check.valid
                ? amount > 0
                    ? undefined
                    : 'Amount must be greater than 0'
                : check.error,
            covenantAddress,
            silverscriptSource,
            redeemScriptHex,
            kcc20StateCommitment,
            vprogStateRoot: kcc20StateCommitment,
            tokenStandard
        });
    }
    return {
        entries,
        validCount,
        invalidCount,
        totalAllocatedTokens,
        errors
    };
}