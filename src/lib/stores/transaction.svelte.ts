import { blake2b } from '@noble/hashes/blake2.js';
import { schnorr, secp256k1 } from '@noble/curves/secp256k1.js';
import { ethers } from 'ethers';
import {
    Connection,
    Keypair as SolKeypair,
    PublicKey,
    SystemProgram,
    Transaction as SolTransaction
} from '@solana/web3.js';
import * as bitcoin from 'bitcoinjs-lib';
import { Client as XrplClient, Wallet as XrplWallet, xrpToDrops } from 'xrpl';
import { Buffer } from 'buffer';
import type { SovereignVaultKeys } from '$lib/crypto/honeycomb';

export const KASPA_UNSPENDABLE_BURN_ADDRESS =
    'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e';

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
}

export interface CapTableFanoutReceipt {
    label: string;
    recipientAddress: string;
    amountTokens: number;
    cliffDays: number;
    linearDays: number;
    txId: string;
    explorerUrl: string;
    isTimelockedCovenant: boolean;
}

export interface CapTableCsvParseResult {
    entries: CapTableEntry[];
    validCount: number;
    invalidCount: number;
    totalAllocatedTokens: number;
    errors: string[];
}

class TransactionEngineState {
    decryptedPrivateKeyHex = $state('');
    address = $state('');
    isBroadcasting = $state(false);
    lastTxId = $state('');
    lastExplorerUrl = $state('');
    lastFanoutReceipts = $state<CapTableFanoutReceipt[]>([]);
    error = $state('');

    get overlayClass() {
        return this.isBroadcasting
            ? 'fixed inset-0 z-[9999] flex items-center justify-center bg-[#0a0d12]/95 font-mono text-white font-bold tracking-widest uppercase transition-none'
            : 'hidden';
    }
}

export const txState = new TransactionEngineState();

const SIGHASH_ALL = 0x01;
const SIGHASH_SINGLE_ANYONECANPAY = 0x83;
const TX_SIGNING_KEY = new TextEncoder().encode('TransactionSigningHash');
const KASPA_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BASE_COMPUTE_MASS = 200n;
const MASS_PER_INPUT = 1200n;
const MASS_PER_OUTPUT = 450n;
const STORAGE_MASS_PARAMETER = 1_000_000_000_000n;
const FEE_PER_GRAM = 110n;
const MIN_CHANGE_SOMPI = 10_000_000n;

function kaspaPolymod(values: number[]): bigint {
    let c = 1n;
    for (const v of values) {
        const c0 = c >> 35n;
        c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(v);
        if (c0 & 1n) c ^= 0x98f2bc8e61n;
        if (c0 & 2n) c ^= 0x79b76d99e2n;
        if (c0 & 4n) c ^= 0xf33e5fb3c4n;
        if (c0 & 8n) c ^= 0xae2eabe2a8n;
        if (c0 & 16n) c ^= 0x1e4f43e470n;
    }
    return c ^ 1n;
}

export function encodeKaspaAddressFromPubkeyBytes(pubKeyX: Uint8Array): string {
    const prefix = 'kaspa';
    const prefixValues = prefix
        .split('')
        .map((c) => c.charCodeAt(0) & 31)
        .concat([0]);
    const payload = [0, ...pubKeyX.slice(0, 32)];
    let acc = 0;
    let bits = 0;
    const payload5: number[] = [];
    for (const byte of payload) {
        acc = (acc << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            payload5.push((acc >> bits) & 31);
        }
    }
    if (bits > 0) payload5.push((acc << (5 - bits)) & 31);
    const mod = kaspaPolymod([...prefixValues, ...payload5, 0, 0, 0, 0, 0, 0, 0, 0]);
    const checksum = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
        Number((mod >> BigInt(5 * (7 - i))) & 31n)
    );
    return (
        prefix +
        ':' +
        [...payload5, ...checksum].map((v) => KASPA_CHARSET[v]).join('')
    );
}

export function deriveDeterministicKaspaAddress(seedLabel: string): string {
    const digest = blake2b(new TextEncoder().encode(`PERENNIA_CAP_TABLE:${seedLabel}`), {
        dkLen: 32
    });
    return encodeKaspaAddressFromPubkeyBytes(digest);
}

export function validateKaspaBech32mAddress(rawAddress: string): {
    valid: boolean;
    normalized: string;
    error?: string;
} {
    const trimmed = String(rawAddress || '').trim().toLowerCase();
    if (!trimmed) {
        return { valid: false, normalized: '', error: 'Address is empty.' };
    }
    if (!trimmed.startsWith('kaspa:')) {
        return {
            valid: false,
            normalized: trimmed,
            error: 'Mainnet prefix "kaspa:" is required.'
        };
    }
    const parts = trimmed.split(':');
    if (parts.length !== 2) {
        return {
            valid: false,
            normalized: trimmed,
            error: 'Malformed Kaspa address separator.'
        };
    }
    const payloadStr = parts[1];
    if (payloadStr.length < 61 || payloadStr.length > 69) {
        return {
            valid: false,
            normalized: trimmed,
            error: `Invalid Bech32m payload length (${payloadStr.length}).`
        };
    }
    const payloadWords: number[] = [];
    for (let i = 0; i < payloadStr.length; i++) {
        const idx = KASPA_CHARSET.indexOf(payloadStr[i]);
        if (idx === -1) {
            return {
                valid: false,
                normalized: trimmed,
                error: `Invalid Bech32m character '${payloadStr[i]}' at index ${i}.`
            };
        }
        payloadWords.push(idx);
    }
    const prefixValues = 'kaspa'
        .split('')
        .map((c) => c.charCodeAt(0) & 31)
        .concat([0]);
    const remainder = kaspaPolymod([...prefixValues, ...payloadWords]);
    if (remainder !== 0n) {
        return {
            valid: false,
            normalized: trimmed,
            error: 'Bech32m polymod checksum verification failed.'
        };
    }
    return { valid: true, normalized: trimmed };
}

export function parseCapTableCsv(
    csvText: string,
    maxSupply = 21_000_000
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

        if (check.valid && amount > 0) {
            validCount++;
            totalAllocatedTokens += amount;
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
                : check.error
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

export interface KasplexProtocolInfo {
    online: boolean;
    feeAddress: string;
    opFeeDeploySompi: bigint;
    opFeeMintSompi: bigint;
    opFeeDeployKas: number;
    opFeeMintKas: number;
    syncedBlockScore?: string;
}

export async function resolveKasplexProtocolInfo(): Promise<KasplexProtocolInfo> {
    try {
        const res = await fetch('https://api.kasplex.org/v1/info', {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(4000)
        });
        if (res.ok) {
            const data = await res.json();
            const result = data?.result || data || {};
            const feeAddress = String(result.fee_address || result.feeAddress || '').trim();
            const deploySompiRaw = String(result.op_fee_deploy || '100000000000').replace(
                /\D/g,
                ''
            );
            const mintSompiRaw = String(result.op_fee_mint || '100000000').replace(/\D/g, '');
            const opFeeDeploySompi = deploySompiRaw ? BigInt(deploySompiRaw) : 100_000_000_000n;
            const opFeeMintSompi = mintSompiRaw ? BigInt(mintSompiRaw) : 100_000_000n;
            return {
                online: true,
                feeAddress,
                opFeeDeploySompi,
                opFeeMintSompi,
                opFeeDeployKas: Number(opFeeDeploySompi) / 1e8,
                opFeeMintKas: Number(opFeeMintSompi) / 1e8,
                syncedBlockScore: String(result.block_score || result.daa_score || '')
            };
        }
    } catch {
        // Fallback when public Kasplex info endpoint is unreachable
    }
    return {
        online: false,
        feeAddress: '',
        opFeeDeploySompi: 100_000_000_000n,
        opFeeMintSompi: 100_000_000n,
        opFeeDeployKas: 1000,
        opFeeMintKas: 1
    };
}

const ERC20_TRANSFER_ABI = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address owner) view returns (uint8)'
];

export const EVM_CLIENT_CHAINS: Record<
    string,
    {
        rpcUrl: string;
        chainId: number;
        explorerTxBase: string;
        explorerAddressBase: string;
        isToken?: boolean;
        contractAddress?: string;
        decimals?: number;
    }
> = {
    ETH: {
        rpcUrl: 'https://ethereum-rpc.publicnode.com',
        chainId: 1,
        explorerTxBase: 'https://etherscan.io/tx/',
        explorerAddressBase: 'https://etherscan.io/address/'
    },
    USDC: {
        rpcUrl: 'https://ethereum-rpc.publicnode.com',
        chainId: 1,
        explorerTxBase: 'https://etherscan.io/tx/',
        explorerAddressBase: 'https://etherscan.io/address/',
        isToken: true,
        contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6
    },
    USDT: {
        rpcUrl: 'https://ethereum-rpc.publicnode.com',
        chainId: 1,
        explorerTxBase: 'https://etherscan.io/tx/',
        explorerAddressBase: 'https://etherscan.io/address/',
        isToken: true,
        contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        decimals: 6
    },
    POL: {
        rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
        chainId: 137,
        explorerTxBase: 'https://polygonscan.com/tx/',
        explorerAddressBase: 'https://polygonscan.com/address/'
    },
    AVAX: {
        rpcUrl: 'https://avalanche-c-chain-rpc.publicnode.com',
        chainId: 43114,
        explorerTxBase: 'https://snowtrace.io/tx/',
        explorerAddressBase: 'https://snowtrace.io/address/'
    },
    ARB: {
        rpcUrl: 'https://arbitrum-one-rpc.publicnode.com',
        chainId: 42161,
        explorerTxBase: 'https://arbiscan.io/tx/',
        explorerAddressBase: 'https://arbiscan.com/address/'
    },
    BASE: {
        rpcUrl: 'https://base-rpc.publicnode.com',
        chainId: 8453,
        explorerTxBase: 'https://basescan.org/tx/',
        explorerAddressBase: 'https://basescan.org/address/'
    }
};

export function getChainExplorerTxUrl(assetOrNetwork: string, txHash: string): string {
    const cleanAsset = String(assetOrNetwork || 'KAS')
        .trim()
        .toUpperCase();
    const cleanTx = String(txHash || '').trim();
    if (!cleanTx) return '#';
    if (EVM_CLIENT_CHAINS[cleanAsset]) {
        return `${EVM_CLIENT_CHAINS[cleanAsset].explorerTxBase}${cleanTx}`;
    }
    switch (cleanAsset) {
        case 'KAS':
            return `https://kas.fyi/transaction/${cleanTx}`;
        case 'BTC':
            return `https://mempool.space/tx/${cleanTx}`;
        case 'SOL':
            return `https://solscan.io/tx/${cleanTx}`;
        case 'XRP':
            return `https://xrpscan.com/tx/${cleanTx}`;
        case 'DOGE':
            return `https://blockchair.com/dogecoin/transaction/${cleanTx}`;
        case 'SUI':
            return `https://suiscan.xyz/mainnet/tx/${cleanTx}`;
        case 'TRX':
            return `https://tronscan.org/#/transaction/${cleanTx}`;
        case 'ZEC':
            return `https://blockchair.com/zcash/transaction/${cleanTx}`;
        default:
            return `https://kas.fyi/transaction/${cleanTx}`;
    }
}

export function getChainExplorerAddressUrl(assetOrNetwork: string, address: string): string {
    const cleanAsset = String(assetOrNetwork || 'KAS')
        .trim()
        .toUpperCase();
    const cleanAddr = String(address || '').trim();
    if (!cleanAddr || cleanAddr.includes('Awaiting')) return '#';
    if (EVM_CLIENT_CHAINS[cleanAsset]) {
        return `${EVM_CLIENT_CHAINS[cleanAsset].explorerAddressBase}${cleanAddr}`;
    }
    switch (cleanAsset) {
        case 'KAS':
            return `https://kas.fyi/address/${cleanAddr.startsWith('kaspa:') ? cleanAddr : `kaspa:${cleanAddr}`}`;
        case 'BTC':
            return `https://mempool.space/address/${cleanAddr}`;
        case 'SOL':
            return `https://solscan.io/account/${cleanAddr}`;
        case 'XRP':
            return `https://xrpscan.com/account/${cleanAddr}`;
        case 'DOGE':
            return `https://blockchair.com/dogecoin/address/${cleanAddr}`;
        case 'SUI':
            return `https://suiscan.xyz/mainnet/account/${cleanAddr}`;
        case 'TRX':
            return `https://tronscan.org/#/address/${cleanAddr}`;
        case 'ZEC':
            return `https://blockchair.com/zcash/address/${cleanAddr}`;
        default:
            return `https://kas.fyi/address/${cleanAddr}`;
    }
}

function calculateComputeMass(
    numInputs: number,
    numOutputs: number,
    payloadByteLen = 0
): bigint {
    return (
        BASE_COMPUTE_MASS +
        BigInt(numInputs) * MASS_PER_INPUT +
        BigInt(numOutputs) * MASS_PER_OUTPUT +
        BigInt(payloadByteLen)
    );
}

function calculateStorageMass(inputAmounts: bigint[], outputAmounts: bigint[]): bigint {
    if (inputAmounts.length === 0 || outputAmounts.length === 0) {
        return 0n;
    }
    let harmonicOuts = 0n;
    for (const v of outputAmounts) {
        harmonicOuts += v > 0n ? STORAGE_MASS_PARAMETER / v : STORAGE_MASS_PARAMETER;
    }
    if (outputAmounts.length === 1 || inputAmounts.length >= outputAmounts.length) {
        let sumIns = 0n;
        for (const v of inputAmounts) {
            sumIns += v;
        }
        const meanIns = sumIns / BigInt(inputAmounts.length);
        if (meanIns <= 0n) {
            return harmonicOuts;
        }
        const arithmeticIns =
            BigInt(inputAmounts.length) * (STORAGE_MASS_PARAMETER / meanIns);
        return harmonicOuts > arithmeticIns ? harmonicOuts - arithmeticIns : 0n;
    } else {
        let harmonicIns = 0n;
        for (const v of inputAmounts) {
            if (v > 0n) {
                harmonicIns += STORAGE_MASS_PARAMETER / v;
            }
        }
        return harmonicOuts > harmonicIns ? harmonicOuts - harmonicIns : 0n;
    }
}

function hexToBytes(hex: string): Uint8Array {
    const clean = hex.trim().replace(/^0x/i, '');
    if (clean.length % 2 !== 0) throw new Error('ERR_INVALID_HEX_LENGTH');
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function normalizeSubnetworkIdHex(subnetworkId: string | undefined): string {
    const clean = String(subnetworkId || '')
        .trim()
        .replace(/^0x/i, '')
        .replace(/[^0-9a-fA-F]/g, '')
        .toLowerCase();
    if (!clean) return '0000000000000000000000000000000000000000';
    return clean.padStart(40, '0').slice(0, 40);
}

function writeUint16LE(val: number): Uint8Array {
    const arr = new Uint8Array(2);
    new DataView(arr.buffer).setUint16(0, val, true);
    return arr;
}

function writeUint32LE(val: number): Uint8Array {
    const arr = new Uint8Array(4);
    new DataView(arr.buffer).setUint32(0, val, true);
    return arr;
}

function writeBigUint64LE(val: bigint): Uint8Array {
    const arr = new Uint8Array(8);
    new DataView(arr.buffer).setBigUint64(0, val, true);
    return arr;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
    const totalLen = arrays.reduce((acc, arr) => acc + arr.length, 0);
    const res = new Uint8Array(totalLen);
    let offset = 0;
    for (const arr of arrays) {
        res.set(arr, offset);
        offset += arr.length;
    }
    return res;
}

export function computePayloadHash(
    subnetworkId: string | undefined,
    payloadHex: string | undefined
): Uint8Array {
    const normalizedSubnet = normalizeSubnetworkIdHex(subnetworkId);
    const isNativeSubnetwork =
        normalizedSubnet === '0000000000000000000000000000000000000000';
    const payloadBytes = payloadHex ? hexToBytes(payloadHex) : new Uint8Array(0);
    if (isNativeSubnetwork && payloadBytes.length === 0) {
        return new Uint8Array(32);
    }
    return blake2b(
        concatBytes(writeBigUint64LE(BigInt(payloadBytes.length)), payloadBytes),
        { dkLen: 32, key: TX_SIGNING_KEY }
    );
}

function computeInputSighash(
    tx: any,
    inputIndex: number,
    utxoSpkHex: string,
    utxoAmount: bigint,
    sighashType: number
): Uint8Array {
    const isAnyoneCanPay = (sighashType & 0x80) !== 0;
    const baseMask = sighashType & 0x7f;
    const isSingle = baseMask === 0x03 || baseMask === 0x04;
    const isNone = baseMask === 0x02;
    const prevOutsHash = isAnyoneCanPay
        ? new Uint8Array(32)
        : blake2b(
              concatBytes(
                  ...tx.inputs.map((i: any) =>
                      concatBytes(
                          hexToBytes(i.previousOutpoint.transactionId),
                          writeUint32LE(Number(i.previousOutpoint.index))
                      )
                  )
              ),
              { dkLen: 32, key: TX_SIGNING_KEY }
          );
    const sequencesHash =
        isAnyoneCanPay || isSingle || isNone
            ? new Uint8Array(32)
            : blake2b(
                  concatBytes(
                      ...tx.inputs.map((i: any) =>
                          writeBigUint64LE(BigInt(i.sequence ?? 0))
                      )
                  ),
                  { dkLen: 32, key: TX_SIGNING_KEY }
              );
    const sigOpCountsHash = isAnyoneCanPay
        ? new Uint8Array(32)
        : blake2b(
              concatBytes(
                  ...tx.inputs.map((i: any) => new Uint8Array([Number(i.sigOpCount ?? 1)]))
              ),
              { dkLen: 32, key: TX_SIGNING_KEY }
          );
    let outputsHash: Uint8Array;
    if (isNone) {
        outputsHash = new Uint8Array(32);
    } else if (isSingle) {
        if (inputIndex >= tx.outputs.length) {
            outputsHash = new Uint8Array(32);
        } else {
            const singleOut = tx.outputs[inputIndex];
            const spkStr =
                typeof singleOut.scriptPublicKey === 'string'
                    ? singleOut.scriptPublicKey
                    : singleOut.scriptPublicKey?.scriptPublicKey || '';
            const spkBytes = hexToBytes(spkStr);
            outputsHash = blake2b(
                concatBytes(
                    writeBigUint64LE(BigInt(singleOut.amount ?? singleOut.value ?? 0)),
                    writeUint16LE(0),
                    writeBigUint64LE(BigInt(spkBytes.length)),
                    spkBytes
                ),
                { dkLen: 32, key: TX_SIGNING_KEY }
            );
        }
    } else {
        outputsHash = blake2b(
            concatBytes(
                ...tx.outputs.map((o: any) => {
                    const spkStr =
                        typeof o.scriptPublicKey === 'string'
                            ? o.scriptPublicKey
                            : o.scriptPublicKey?.scriptPublicKey || '';
                    const spkBytes = hexToBytes(spkStr);
                    return concatBytes(
                        writeBigUint64LE(BigInt(o.amount ?? o.value ?? 0)),
                        writeUint16LE(0),
                        writeBigUint64LE(BigInt(spkBytes.length)),
                        spkBytes
                    );
                })
            ),
            { dkLen: 32, key: TX_SIGNING_KEY }
        );
    }
    const input = tx.inputs[inputIndex];
    const spkBytes = hexToBytes(utxoSpkHex);
    const normalizedSubnet = normalizeSubnetworkIdHex(tx.subnetworkId);
    const subnetworkIdBytes =
        normalizedSubnet !== '0000000000000000000000000000000000000000'
            ? hexToBytes(normalizedSubnet)
            : new Uint8Array(20);
    const payloadHash = computePayloadHash(normalizedSubnet, tx.payload);
    const sigHashData = concatBytes(
        writeUint16LE(Number(tx.version ?? 0)),
        prevOutsHash,
        sequencesHash,
        sigOpCountsHash,
        hexToBytes(input.previousOutpoint.transactionId),
        writeUint32LE(Number(input.previousOutpoint.index)),
        writeUint16LE(0),
        writeBigUint64LE(BigInt(spkBytes.length)),
        spkBytes,
        writeBigUint64LE(utxoAmount),
        writeBigUint64LE(BigInt(input.sequence ?? 0)),
        new Uint8Array([Number(input.sigOpCount ?? 1)]),
        outputsHash,
        writeBigUint64LE(BigInt(tx.lockTime ?? 0)),
        subnetworkIdBytes,
        writeBigUint64LE(BigInt(tx.gas ?? 0)),
        payloadHash,
        new Uint8Array([sighashType])
    );
    return blake2b(sigHashData, { dkLen: 32, key: TX_SIGNING_KEY });
}

export function decodeAddressToPubkey(address: string): Uint8Array {
    const formatted = address.trim().toLowerCase().startsWith('kaspa:')
        ? address.trim().toLowerCase()
        : `kaspa:${address.trim().toLowerCase()}`;
    const parts = formatted.split(':');
    if (parts.length !== 2) throw new Error('ERR_INVALID_ADDRESS_FORMAT');
    const base32 = parts[1];
    const decoded = new Uint8Array(base32.length - 8);
    for (let i = 0; i < base32.length - 8; i++) {
        const val = KASPA_CHARSET.indexOf(base32[i]);
        if (val === -1) throw new Error('ERR_INVALID_BASE32_CHAR');
        decoded[i] = val;
    }
    const out: number[] = [];
    let val = 0;
    let bits = 0;
    for (let i = 0; i < decoded.length; i++) {
        val = (val << 5) | decoded[i];
        bits += 5;
        while (bits >= 8) {
            bits -= 8;
            out.push((val >> bits) & 0xff);
        }
    }
    return new Uint8Array(out.slice(1, 33));
}

export async function executeSovereignPSBT(
    unsignedTx: any,
    utxoReferenceData: any[]
): Promise<string> {
    if (!txState.decryptedPrivateKeyHex) throw new Error('ERR_VAULT_LOCKED');
    txState.isBroadcasting = true;
    txState.error = '';
    let privKeyBytes: Uint8Array = new Uint8Array(0);
    try {
        privKeyBytes = hexToBytes(txState.decryptedPrivateKeyHex);
        const tx = JSON.parse(JSON.stringify(unsignedTx));
        for (let i = 0; i < tx.inputs.length; i++) {
            const input = tx.inputs[i];
            const utxo = utxoReferenceData.find(
                (u) =>
                    (u.transactionId ?? u.outpoint?.transactionId) ===
                        input.previousOutpoint.transactionId &&
                    Number(u.index ?? u.outpoint?.index ?? 0) ===
                        Number(input.previousOutpoint.index)
            );
            if (!utxo) throw new Error(`ERR_MISSING_UTXO_REFERENCE_FOR_INPUT_${i}`);
            const spkHex =
                typeof utxo.scriptPublicKey === 'string'
                    ? utxo.scriptPublicKey
                    : utxo.scriptPublicKey?.scriptPublicKey ??
                      utxo.utxoEntry?.scriptPublicKey?.scriptPublicKey;
            const amt = BigInt(Math.round(Number(utxo.amount ?? utxo.utxoEntry?.amount ?? 0)));
            const sighash = computeInputSighash(tx, i, spkHex, amt, SIGHASH_ALL);
            const signature = schnorr.sign(sighash, privKeyBytes);
            input.signatureScript = `41${bytesToHex(signature)}01`;
        }
        for (const output of tx.outputs) {
            delete output._metadata;
        }
        privKeyBytes.fill(0);
        txState.decryptedPrivateKeyHex = '0'.repeat(64);
        txState.decryptedPrivateKeyHex = '';
        const broadcastRes = await fetch('/api/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction: tx })
        });
        if (!broadcastRes.ok) {
            const errData = await broadcastRes.json().catch(() => ({}));
            throw new Error(
                `ERR_BROADCAST_REJECTED: ${errData.error || 'Node refused payload'}`
            );
        }
        const resData = await broadcastRes.json();
        txState.lastTxId = resData.transactionId || resData.id;
        txState.lastExplorerUrl = getChainExplorerTxUrl('KAS', txState.lastTxId);
        return txState.lastTxId;
    } catch (e: any) {
        txState.error = e.message;
        throw e;
    } finally {
        if (privKeyBytes.length > 0) privKeyBytes.fill(0);
        txState.isBroadcasting = false;
        txState.decryptedPrivateKeyHex = '0'.repeat(64);
        txState.decryptedPrivateKeyHex = '';
    }
}

export async function signClientP2pOffer(
    sellAmountKas: number,
    buyAmountKas: number,
    utxos: any[]
): Promise<string> {
    if (!txState.decryptedPrivateKeyHex) throw new Error('ERR_VAULT_LOCKED');
    txState.isBroadcasting = true;
    txState.error = '';
    let privKeyBytes: Uint8Array = new Uint8Array(0);
    try {
        privKeyBytes = hexToBytes(txState.decryptedPrivateKeyHex);
        const myPubKeyBytes = schnorr.getPublicKey(privKeyBytes);
        const sellerScriptHex = `20${bytesToHex(myPubKeyBytes)}ac`;
        const targetSellSompi = BigInt(Math.round(sellAmountKas * 1e8));
        const targetBuySompi = BigInt(Math.round(buyAmountKas * 1e8));
        if (targetSellSompi <= 0n || targetBuySompi <= 0n) {
            throw new Error('ERR_INVALID_P2P_AMOUNTS');
        }
        const sortedUtxos = [...(utxos || [])].sort((a, b) => {
            const amtA = BigInt(Math.round(Number(a.amount ?? a.utxoEntry?.amount ?? 0)));
            const amtB = BigInt(Math.round(Number(b.amount ?? b.utxoEntry?.amount ?? 0)));
            return amtA < amtB ? 1 : amtA > amtB ? -1 : 0;
        });
        let gatheredSompi = 0n;
        let currentMass = calculateComputeMass(0, 2, 0);
        const usedUtxos: any[] = [];
        const txInputs: any[] = [];
        for (const u of sortedUtxos) {
            const amt = BigInt(Math.round(Number(u.amount ?? u.utxoEntry?.amount ?? 0)));
            if (amt <= 0n) continue;
            const txId = u.transactionId ?? u.outpoint?.transactionId;
            const index = Number(u.index ?? u.outpoint?.index ?? 0);
            const spkHex =
                typeof u.scriptPublicKey === 'string'
                    ? u.scriptPublicKey
                    : u.scriptPublicKey?.scriptPublicKey ??
                      u.utxoEntry?.scriptPublicKey?.scriptPublicKey ??
                      sellerScriptHex;
            usedUtxos.push({
                transactionId: txId,
                index,
                amount: Number(amt),
                scriptPublicKey: spkHex
            });
            txInputs.push({
                previousOutpoint: {
                    transactionId: txId,
                    index
                },
                signatureScript: '',
                sequence: 0,
                sigOpCount: 1
            });
            gatheredSompi += amt;
            currentMass += MASS_PER_INPUT;
            const networkFeeSompi = currentMass * FEE_PER_GRAM;
            if (gatheredSompi >= targetSellSompi + networkFeeSompi) break;
        }
        const networkFeeSompi = currentMass * FEE_PER_GRAM;
        const totalRequired = targetSellSompi + networkFeeSompi;
        if (gatheredSompi < totalRequired) {
            throw new Error(
                `ERR_INSUFFICIENT_MASS: Required ${totalRequired} sompi to lock P2P offer, found ${gatheredSompi} sompi.`
            );
        }
        const txOutputs: Array<{ amount: number; scriptPublicKey: string }> = [
            {
                amount: Number(targetBuySompi),
                scriptPublicKey: sellerScriptHex
            }
        ];
        if (gatheredSompi >= totalRequired + MIN_CHANGE_SOMPI) {
            txOutputs.push({
                amount: Number(gatheredSompi - totalRequired),
                scriptPublicKey: sellerScriptHex
            });
        }
        while (txOutputs.length < txInputs.length) {
            txOutputs.push({
                amount: 0,
                scriptPublicKey: sellerScriptHex
            });
        }
        const tx = {
            version: 0,
            inputs: txInputs,
            outputs: txOutputs,
            lockTime: 0,
            subnetworkId: '0000000000000000000000000000000000000000',
            gas: 0,
            payload: ''
        };
        for (let i = 0; i < tx.inputs.length; i++) {
            const u = usedUtxos[i];
            const sighash = computeInputSighash(
                tx,
                i,
                u.scriptPublicKey,
                BigInt(u.amount),
                SIGHASH_SINGLE_ANYONECANPAY
            );
            const sig = schnorr.sign(sighash, privKeyBytes);
            tx.inputs[i].signatureScript = `41${bytesToHex(sig)}83`;
        }
        privKeyBytes.fill(0);
        txState.decryptedPrivateKeyHex = '0'.repeat(64);
        txState.decryptedPrivateKeyHex = '';
        const psbtJson = {
            version: tx.version,
            inputs: tx.inputs,
            outputs: tx.outputs,
            used_utxos: usedUtxos
        };
        return bytesToHex(new TextEncoder().encode(JSON.stringify(psbtJson)));
    } catch (e: any) {
        txState.error = e.message;
        throw e;
    } finally {
        if (privKeyBytes.length > 0) privKeyBytes.fill(0);
        txState.isBroadcasting = false;
        txState.decryptedPrivateKeyHex = '0'.repeat(64);
        txState.decryptedPrivateKeyHex = '';
    }
}

export async function executeClientP2pFill(
    orderId: string,
    buyerUtxos: any[]
): Promise<string> {
    if (!txState.decryptedPrivateKeyHex) throw new Error('ERR_VAULT_LOCKED');
    txState.isBroadcasting = true;
    txState.error = '';
    let privKeyBytes: Uint8Array = new Uint8Array(0);
    try {
        privKeyBytes = hexToBytes(txState.decryptedPrivateKeyHex);
        const myPubKeyBytes = schnorr.getPublicKey(privKeyBytes);
        const buyerScriptHex = `20${bytesToHex(myPubKeyBytes)}ac`;
        const orderRes = await fetch(`/api/p2p?id=${encodeURIComponent(orderId)}`);
        if (!orderRes.ok) {
            throw new Error('P2P order not found or already filled.');
        }
        const orderData = await orderRes.json();
        const sellerPsbtHex = String(orderData.sellerPsbt || '').trim();
        if (!sellerPsbtHex) {
            throw new Error('P2P order is missing seller cryptographic PSBT.');
        }
        const sellerPsbtJsonStr = new TextDecoder().decode(hexToBytes(sellerPsbtHex));
        const sellerPsbt = JSON.parse(sellerPsbtJsonStr);
        const finalInputs: any[] = [...(sellerPsbt.inputs || [])];
        const finalOutputs: any[] = [...(sellerPsbt.outputs || [])];
        const allUtxos: any[] = [...(sellerPsbt.used_utxos || [])];
        const sellAmountKas = Number(orderData.sellAmount || 0);
        const buyAmountKas = Number(orderData.buyAmount || 0);
        const targetBuyerSompi = BigInt(Math.round(buyAmountKas * 1e8));
        const sellerProceedsSompi = BigInt(Math.round(sellAmountKas * 1e8));
        let gatheredSompi = 0n;
        const buyerInputIndices: number[] = [];
        let currentMass = calculateComputeMass(
            finalInputs.length,
            finalOutputs.length + 2,
            0
        );
        for (const u of buyerUtxos || []) {
            const amt = BigInt(Math.round(Number(u.amount ?? u.utxoEntry?.amount ?? 0)));
            if (amt <= 0n) continue;
            const txId = u.transactionId ?? u.outpoint?.transactionId;
            const index = Number(u.index ?? u.outpoint?.index ?? 0);
            const spkHex =
                typeof u.scriptPublicKey === 'string'
                    ? u.scriptPublicKey
                    : u.scriptPublicKey?.scriptPublicKey ??
                      u.utxoEntry?.scriptPublicKey?.scriptPublicKey ??
                      buyerScriptHex;
            buyerInputIndices.push(finalInputs.length);
            finalInputs.push({
                previousOutpoint: {
                    transactionId: txId,
                    index
                },
                signatureScript: '',
                sequence: 0,
                sigOpCount: 1
            });
            allUtxos.push({
                transactionId: txId,
                index,
                amount: Number(amt),
                scriptPublicKey: spkHex
            });
            gatheredSompi += amt;
            currentMass += MASS_PER_INPUT;
            const networkFeeSompi = currentMass * FEE_PER_GRAM;
            if (gatheredSompi >= targetBuyerSompi + networkFeeSompi) break;
        }
        const networkFeeSompi = currentMass * FEE_PER_GRAM;
        const totalRequired = targetBuyerSompi + networkFeeSompi;
        if (gatheredSompi < totalRequired) {
            throw new Error(
                `ERR_INSUFFICIENT_MASS: Required ${totalRequired} sompi to fill P2P offer, available ${gatheredSompi} sompi.`
            );
        }
        finalOutputs.push({
            amount: Number(sellerProceedsSompi),
            scriptPublicKey: buyerScriptHex
        });
        if (gatheredSompi >= totalRequired + MIN_CHANGE_SOMPI) {
            finalOutputs.push({
                amount: Number(gatheredSompi - totalRequired),
                scriptPublicKey: buyerScriptHex
            });
        }
        const tx = {
            version: Number(sellerPsbt.version ?? 0),
            inputs: finalInputs,
            outputs: finalOutputs,
            lockTime: 0,
            subnetworkId: '0000000000000000000000000000000000000000',
            gas: 0,
            payload: ''
        };
        for (const buyerIdx of buyerInputIndices) {
            const u = allUtxos[buyerIdx];
            const sighash = computeInputSighash(
                tx,
                buyerIdx,
                u.scriptPublicKey,
                BigInt(Math.round(Number(u.amount))),
                SIGHASH_ALL
            );
            const sig = schnorr.sign(sighash, privKeyBytes);
            tx.inputs[buyerIdx].signatureScript = `41${bytesToHex(sig)}01`;
        }
        privKeyBytes.fill(0);
        txState.decryptedPrivateKeyHex = '0'.repeat(64);
        txState.decryptedPrivateKeyHex = '';
        const broadcastRes = await fetch('/api/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction: tx })
        });
        if (!broadcastRes.ok) {
            const errData = await broadcastRes.json().catch(() => ({}));
            throw new Error(
                `ERR_P2P_BROADCAST_REJECTED: ${errData.error || 'Node rejected atomic swap'}`
            );
        }
        const resData = await broadcastRes.json();
        const txId = resData.transactionId || resData.id;
        await fetch('/api/p2p', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'COMPLETE_P2P_FILL',
                orderId,
                txId
            })
        }).catch(() => {});
        txState.lastTxId = txId;
        txState.lastExplorerUrl = getChainExplorerTxUrl('KAS', txId);
        return txId;
    } catch (e: any) {
        txState.error = e.message;
        throw e;
    } finally {
        if (privKeyBytes.length > 0) privKeyBytes.fill(0);
        txState.isBroadcasting = false;
        txState.decryptedPrivateKeyHex = '0'.repeat(64);
        txState.decryptedPrivateKeyHex = '';
    }
}

export async function executeSovereignKrc20Transfer(
    ticker: string,
    destinationAddress: string,
    amountTokens: number
): Promise<string> {
    if (!txState.decryptedPrivateKeyHex) throw new Error('ERR_VAULT_LOCKED');
    const cleanTicker = ticker.trim().toUpperCase();
    const formattedDest = destinationAddress.trim().toLowerCase().startsWith('kaspa:')
        ? destinationAddress.trim().toLowerCase()
        : `kaspa:${destinationAddress.trim().toLowerCase()}`;
    const baseUnits = BigInt(Math.round(amountTokens * 1e8)).toString();
    const inscriptionJson = JSON.stringify({
        p: 'krc-20',
        op: 'transfer',
        tick: cleanTicker,
        amt: baseUnits,
        to: formattedDest
    });
    const payloadHex = bytesToHex(new TextEncoder().encode(inscriptionJson));
    const meRes = await fetch('/api/auth/me');
    if (!meRes.ok) throw new Error('ERR_LOST_SESSION');
    const { address: myAddress } = await meRes.json();
    const utxoFetchRes = await fetch(
        `/api/utxos?address=${encodeURIComponent(myAddress)}`
    );
    if (!utxoFetchRes.ok) throw new Error('ERR_UTXO_PROXY_UNREACHABLE');
    const utxoData = await utxoFetchRes.json();
    const utxos = Array.isArray(utxoData) ? utxoData : utxoData.entries || [];
    return executeSovereignKrc20Envelope(
        {
            version: 0,
            inputs: [],
            outputs: [],
            lockTime: 0,
            subnetworkId: '0000000000000000000000000000000000000000',
            gas: 0,
            payload: payloadHex
        },
        utxos,
        formattedDest
    );
}

async function signAndBroadcastSingleKrc20EnvelopeWithKey(
    privKeyBytes: Uint8Array,
    unsignedTx: any,
    availableUtxos: any[],
    explicitRecipientAddress?: string
): Promise<{ txId: string; remainingUtxos: any[] }> {
    const myPubKeyBytes = schnorr.getPublicKey(privKeyBytes);
    const selfScriptHex = `20${bytesToHex(myPubKeyBytes)}ac`;
    const payloadHex = String(unsignedTx?.payload || '');
    const payloadBytes = payloadHex ? hexToBytes(payloadHex) : new Uint8Array(0);

    let parsedEnvelope: any = null;
    if (payloadBytes.length > 0) {
        try {
            const decodedStr = new TextDecoder().decode(payloadBytes);
            parsedEnvelope = JSON.parse(decodedStr);
        } catch {
            parsedEnvelope = null;
        }
    }

    const isKrc20Deploy =
        parsedEnvelope?.p === 'krc-20' && parsedEnvelope?.op === 'deploy';
    const isKrc20Mint =
        parsedEnvelope?.p === 'krc-20' && parsedEnvelope?.op === 'mint';
    const carrierSompi = 30_000_000n;
    const destScriptHex = explicitRecipientAddress
        ? `20${bytesToHex(decodeAddressToPubkey(explicitRecipientAddress))}ac`
        : selfScriptHex;

    let kasplexFeeScriptHex = '';
    let kasplexFeeSompi = 0n;
    if (isKrc20Deploy || isKrc20Mint) {
        const info = await resolveKasplexProtocolInfo();
        const candidateFeeAddr = String(
            unsignedTx?.kasplexFeeAddress || info.feeAddress || ''
        ).trim();
        if (candidateFeeAddr && candidateFeeAddr.toLowerCase().includes('kaspa:')) {
            try {
                const feePub = decodeAddressToPubkey(candidateFeeAddr);
                kasplexFeeScriptHex = `20${bytesToHex(feePub)}ac`;
                kasplexFeeSompi = isKrc20Deploy
                    ? info.opFeeDeploySompi
                    : info.opFeeMintSompi;
            } catch {
                kasplexFeeScriptHex = '';
                kasplexFeeSompi = 0n;
            }
        }
    }

    const sortedUtxos = [...availableUtxos].sort((a, b) => {
        const amtA = BigInt(Math.round(Number(a.amount ?? a.utxoEntry?.amount ?? 0)));
        const amtB = BigInt(Math.round(Number(b.amount ?? b.utxoEntry?.amount ?? 0)));
        return amtA < amtB ? 1 : amtA > amtB ? -1 : 0;
    });

    const totalWalletSompi = sortedUtxos.reduce(
        (sum, u) => sum + BigInt(Math.round(Number(u.amount ?? u.utxoEntry?.amount ?? 0))),
        0n
    );

    const includeKasplexFeeOutput =
        Boolean(kasplexFeeScriptHex) &&
        kasplexFeeSompi > 0n &&
        totalWalletSompi >= carrierSompi + kasplexFeeSompi + 500_000n;

    const targetOutputSompi =
        carrierSompi + (includeKasplexFeeOutput ? kasplexFeeSompi : 0n);
    const estimatedOutputCount = includeKasplexFeeOutput ? 3 : 2;

    let gathered = 0n;
    let fee = 0n;
    const selectedUtxos: any[] = [];
    const consumedKeys = new Set<string>();

    for (const u of sortedUtxos) {
        const amt = BigInt(Math.round(Number(u.amount ?? u.utxoEntry?.amount ?? 0)));
        if (amt <= 0n) continue;
        selectedUtxos.push(u);
        const uTxId = u.outpoint?.transactionId ?? u.transactionId;
        const uIdx = Number(u.outpoint?.index ?? u.index ?? 0);
        consumedKeys.add(`${uTxId}:${uIdx}`);
        gathered += amt;
        const computeMass = calculateComputeMass(
            selectedUtxos.length,
            estimatedOutputCount,
            payloadBytes.length
        );
        fee = computeMass * FEE_PER_GRAM;
        if (gathered >= targetOutputSompi + fee) break;
    }

    if (gathered < targetOutputSompi + fee) {
        throw new Error(
            `ERR_INSUFFICIENT_MASS: Required ${targetOutputSompi + fee} sompi for protocol envelope, available ${gathered} sompi.`
        );
    }

    const changeSompi = gathered - targetOutputSompi - fee;
    const txInputs = selectedUtxos.map((u) => ({
        previousOutpoint: {
            transactionId: u.outpoint?.transactionId ?? u.transactionId,
            index: Number(u.outpoint?.index ?? u.index ?? 0)
        },
        signatureScript: '',
        sequence: 0,
        sigOpCount: 1
    }));

    const txOutputs: Array<{ amount: number; scriptPublicKey: string }> = [
        {
            amount: Number(carrierSompi),
            scriptPublicKey: destScriptHex
        }
    ];
    if (includeKasplexFeeOutput && kasplexFeeScriptHex) {
        txOutputs.push({
            amount: Number(kasplexFeeSompi),
            scriptPublicKey: kasplexFeeScriptHex
        });
    }
    let changeOutputIndex = -1;
    if (changeSompi >= MIN_CHANGE_SOMPI) {
        changeOutputIndex = txOutputs.length;
        txOutputs.push({
            amount: Number(changeSompi),
            scriptPublicKey: selfScriptHex
        });
    }

    const normalizedSubnet = normalizeSubnetworkIdHex(unsignedTx?.subnetworkId);
    const normalizedLockTime = Math.max(0, Number(unsignedTx?.lockTime ?? 0));
    const normalizedGas = Math.max(0, Number(unsignedTx?.gas ?? 0));
    const tx = {
        version: Number(unsignedTx?.version ?? 0),
        inputs: txInputs,
        outputs: txOutputs,
        lockTime: normalizedLockTime,
        subnetworkId: normalizedSubnet,
        gas: normalizedGas,
        payload: payloadHex
    };

    for (let i = 0; i < tx.inputs.length; i++) {
        const u = selectedUtxos[i];
        const spkHex =
            typeof u.scriptPublicKey === 'string'
                ? u.scriptPublicKey
                : u.scriptPublicKey?.scriptPublicKey ??
                  u.utxoEntry?.scriptPublicKey?.scriptPublicKey ??
                  selfScriptHex;
        const amt = BigInt(Math.round(Number(u.amount ?? u.utxoEntry?.amount ?? 0)));
        const sighash = computeInputSighash(tx, i, spkHex, amt, SIGHASH_ALL);
        const sig = schnorr.sign(sighash, privKeyBytes);
        tx.inputs[i].signatureScript = `41${bytesToHex(sig)}01`;
    }

    const broadcastRes = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: tx })
    });
    if (!broadcastRes.ok) {
        const errData = await broadcastRes.json().catch(() => ({}));
        throw new Error(
            `ERR_KRC20_BROADCAST_REJECTED: ${errData.error || 'Node refused inscription payload'}`
        );
    }
    const resData = await broadcastRes.json();
    const txId = String(resData.transactionId || resData.id);

    const remainingUtxos = sortedUtxos.filter((u) => {
        const uTxId = u.outpoint?.transactionId ?? u.transactionId;
        const uIdx = Number(u.outpoint?.index ?? u.index ?? 0);
        return !consumedKeys.has(`${uTxId}:${uIdx}`);
    });

    if (changeOutputIndex >= 0 && changeSompi >= MIN_CHANGE_SOMPI) {
        remainingUtxos.push({
            transactionId: txId,
            index: changeOutputIndex,
            amount: Number(changeSompi),
            scriptPublicKey: selfScriptHex
        });
    }

    return { txId, remainingUtxos };
}

export async function executeSovereignKrc20Envelope(
    unsignedTx: any,
    utxos: any[],
    explicitRecipientAddress?: string
): Promise<string> {
    if (!txState.decryptedPrivateKeyHex) throw new Error('ERR_VAULT_LOCKED');
    txState.isBroadcasting = true;
    txState.error = '';
    let privKeyBytes: Uint8Array = new Uint8Array(0);
    try {
        privKeyBytes = hexToBytes(txState.decryptedPrivateKeyHex);
        let resolvedUtxos = Array.isArray(utxos) ? [...utxos] : [];
        if (resolvedUtxos.length === 0) {
            const meRes = await fetch('/api/auth/me');
            if (meRes.ok) {
                const { address: myAddress } = await meRes.json();
                if (myAddress) {
                    const utxoFetchRes = await fetch(
                        `/api/utxos?address=${encodeURIComponent(myAddress)}`
                    );
                    if (utxoFetchRes.ok) {
                        const utxoData = await utxoFetchRes.json();
                        resolvedUtxos = Array.isArray(utxoData)
                            ? utxoData
                            : utxoData.entries || [];
                    }
                }
            }
        }
        const { txId } = await signAndBroadcastSingleKrc20EnvelopeWithKey(
            privKeyBytes,
            unsignedTx,
            resolvedUtxos,
            explicitRecipientAddress
        );
        privKeyBytes.fill(0);
        txState.decryptedPrivateKeyHex = '0'.repeat(64);
        txState.decryptedPrivateKeyHex = '';
        txState.lastTxId = txId;
        txState.lastExplorerUrl = getChainExplorerTxUrl('KAS', txId);
        return txId;
    } catch (e: any) {
        txState.error = e.message;
        throw e;
    } finally {
        if (privKeyBytes.length > 0) privKeyBytes.fill(0);
        txState.isBroadcasting = false;
        txState.decryptedPrivateKeyHex = '0'.repeat(64);
        txState.decryptedPrivateKeyHex = '';
    }
}

export async function executeSovereignKrc20DeployWithCapTableFanout(params: {
    deployPsbt: any;
    utxos: any[];
    ticker: string;
    decimals: number;
    capTable: CapTableEntry[];
}): Promise<{ deployTxId: string; fanoutReceipts: CapTableFanoutReceipt[] }> {
    if (!txState.decryptedPrivateKeyHex) throw new Error('ERR_VAULT_LOCKED');
    txState.isBroadcasting = true;
    txState.error = '';
    txState.lastFanoutReceipts = [];
    let privKeyBytes: Uint8Array = new Uint8Array(0);
    try {
        privKeyBytes = hexToBytes(txState.decryptedPrivateKeyHex);
        let currentUtxos = Array.isArray(params.utxos) ? [...params.utxos] : [];
        if (currentUtxos.length === 0) {
            const meRes = await fetch('/api/auth/me');
            if (meRes.ok) {
                const { address: myAddress } = await meRes.json();
                if (myAddress) {
                    const utxoFetchRes = await fetch(
                        `/api/utxos?address=${encodeURIComponent(myAddress)}`
                    );
                    if (utxoFetchRes.ok) {
                        const utxoData = await utxoFetchRes.json();
                        currentUtxos = Array.isArray(utxoData)
                            ? utxoData
                            : utxoData.entries || [];
                    }
                }
            }
        }

        // Step 1: Sign & Broadcast Genesis "op": "deploy" Inscription
        const deployResult = await signAndBroadcastSingleKrc20EnvelopeWithKey(
            privKeyBytes,
            params.deployPsbt,
            currentUtxos
        );
        const deployTxId = deployResult.txId;
        currentUtxos = deployResult.remainingUtxos;

        // Step 2: Automated Chained Client-Side "op": "transfer" Fan-Out Inscriptions
        const cleanTicker = params.ticker.trim().toUpperCase();
        const clampedDec = Math.max(0, Math.min(18, Math.floor(params.decimals || 8)));
        const multiplier = 10n ** BigInt(clampedDec);
        const fanoutReceipts: CapTableFanoutReceipt[] = [];

        const validAllocations = (params.capTable || []).filter(
            (row) => row.checksumValid && row.amount > 0
        );

        for (const entry of validAllocations) {
            const baseUnits = (BigInt(Math.round(entry.amount)) * multiplier).toString();
            const isTimelocked = entry.cliffDays > 0 || entry.linearDays > 0;
            const lockTimeMs =
                entry.cliffDays > 0
                    ? Date.now() + entry.cliffDays * 86_400_000
                    : 0;
            const transferEnvelopeObj: Record<string, any> = {
                p: 'krc-20',
                op: 'transfer',
                tick: cleanTicker,
                amt: baseUnits,
                to: entry.address,
                ...(isTimelocked
                    ? {
                          cov: 'TIMELOCK_ESCROW_COVENANT',
                          cliff_d: entry.cliffDays,
                          lin_d: entry.linearDays
                      }
                    : {})
            };
            const transferPayloadHex = bytesToHex(
                new TextEncoder().encode(JSON.stringify(transferEnvelopeObj))
            );
            const fanoutRes = await signAndBroadcastSingleKrc20EnvelopeWithKey(
                privKeyBytes,
                {
                    version: 0,
                    inputs: [],
                    outputs: [],
                    lockTime: lockTimeMs,
                    subnetworkId: '0000000000000000000000000000000000000000',
                    gas: 0,
                    payload: transferPayloadHex
                },
                currentUtxos,
                entry.address
            );
            currentUtxos = fanoutRes.remainingUtxos;
            fanoutReceipts.push({
                label: entry.label,
                recipientAddress: entry.address,
                amountTokens: entry.amount,
                cliffDays: entry.cliffDays,
                linearDays: entry.linearDays,
                txId: fanoutRes.txId,
                explorerUrl: getChainExplorerTxUrl('KAS', fanoutRes.txId),
                isTimelockedCovenant: isTimelocked
            });
        }

        privKeyBytes.fill(0);
        txState.decryptedPrivateKeyHex = '0'.repeat(64);
        txState.decryptedPrivateKeyHex = '';
        txState.lastTxId = deployTxId;
        txState.lastExplorerUrl = getChainExplorerTxUrl('KAS', deployTxId);
        txState.lastFanoutReceipts = fanoutReceipts;
        return { deployTxId, fanoutReceipts };
    } catch (e: any) {
        txState.error = e.message;
        throw e;
    } finally {
        if (privKeyBytes.length > 0) privKeyBytes.fill(0);
        txState.isBroadcasting = false;
        txState.decryptedPrivateKeyHex = '0'.repeat(64);
        txState.decryptedPrivateKeyHex = '';
    }
}

export async function executeMultiChainL1Transfer(params: {
    asset: string;
    network?: string;
    destinationAddress: string;
    amount: number;
    contractAddress?: string;
    decimals?: number;
    keys: SovereignVaultKeys;
}): Promise<{ txId: string; explorerUrl: string }> {
    const cleanAsset = String(params.asset || 'KAS')
        .trim()
        .toUpperCase();
    const cleanNetwork = String(params.network || cleanAsset)
        .trim()
        .toUpperCase();
    const dest = String(params.destinationAddress || '').trim();
    const amount = Number(params.amount || 0);
    if (!dest || isNaN(amount) || amount <= 0) {
        throw new Error('ERR_INVALID_L1_TRANSFER_PARAMETERS');
    }
    if (cleanAsset === 'KAS') {
        txState.decryptedPrivateKeyHex = params.keys.kaspa.privateKey.replace(/^0x/i, '');
        const txId = await executeSovereignTransaction(dest, amount);
        const explorerUrl = getChainExplorerTxUrl('KAS', txId);
        txState.lastExplorerUrl = explorerUrl;
        return { txId, explorerUrl };
    }
    if (cleanNetwork === 'KAS' && cleanAsset !== 'KAS') {
        txState.decryptedPrivateKeyHex = params.keys.kaspa.privateKey.replace(/^0x/i, '');
        const txId = await executeSovereignKrc20Transfer(cleanAsset, dest, amount);
        const explorerUrl = getChainExplorerTxUrl('KAS', txId);
        txState.lastExplorerUrl = explorerUrl;
        return { txId, explorerUrl };
    }
    txState.isBroadcasting = true;
    txState.error = '';
    try {
        if (
            EVM_CLIENT_CHAINS[cleanAsset] ||
            EVM_CLIENT_CHAINS[cleanNetwork]
        ) {
            const chainSpec =
                EVM_CLIENT_CHAINS[cleanAsset] || EVM_CLIENT_CHAINS[cleanNetwork];
            if (!ethers.isAddress(dest)) {
                throw new Error(`Invalid EVM destination address: ${dest}`);
            }
            const provider = new ethers.JsonRpcProvider(
                chainSpec.rpcUrl,
                chainSpec.chainId
            );
            const evmPrivKey = params.keys.ethereum.privateKey;
            const wallet = new ethers.Wallet(evmPrivKey, provider);
            const tokenContract = params.contractAddress || chainSpec.contractAddress;
            const isErc20 = Boolean(chainSpec.isToken || params.contractAddress);
            let txHash = '';
            if (isErc20 && tokenContract && ethers.isAddress(tokenContract)) {
                const decimals = params.decimals ?? chainSpec.decimals ?? 6;
                const contract = new ethers.Contract(
                    tokenContract,
                    ERC20_TRANSFER_ABI,
                    wallet
                );
                const rawUnits = ethers.parseUnits(amount.toFixed(decimals), decimals);
                const tx = await contract.transfer(dest, rawUnits);
                txHash = String(tx.hash);
            } else {
                const rawWei = ethers.parseEther(amount.toFixed(18));
                const tx = await wallet.sendTransaction({
                    to: dest,
                    value: rawWei
                });
                txHash = String(tx.hash);
            }
            const explorerUrl = getChainExplorerTxUrl(cleanNetwork, txHash);
            txState.lastTxId = txHash;
            txState.lastExplorerUrl = explorerUrl;
            return { txId: txHash, explorerUrl };
        }
        if (cleanAsset === 'SOL' || cleanNetwork === 'SOL') {
            const secretBytes = hexToBytes(params.keys.solana.privateKey);
            const keypair =
                secretBytes.length === 64
                    ? SolKeypair.fromSecretKey(secretBytes)
                    : SolKeypair.fromSeed(secretBytes.slice(0, 32));
            const toPubkey = new PublicKey(dest);
            const lamports = Math.floor(amount * 1e9);
            if (lamports <= 0) throw new Error('Invalid SOL transfer amount.');
            const connection = new Connection(
                'https://api.mainnet-beta.solana.com',
                'confirmed'
            );
            const { blockhash } = await connection.getLatestBlockhash('confirmed');
            const tx = new SolTransaction({
                recentBlockhash: blockhash,
                feePayer: keypair.publicKey
            }).add(
                SystemProgram.transfer({
                    fromPubkey: keypair.publicKey,
                    toPubkey,
                    lamports
                })
            );
            tx.sign(keypair);
            secretBytes.fill(0);
            const sig = await connection.sendRawTransaction(tx.serialize(), {
                skipPreflight: false,
                preflightCommitment: 'confirmed'
            });
            const explorerUrl = getChainExplorerTxUrl('SOL', sig);
            txState.lastTxId = sig;
            txState.lastExplorerUrl = explorerUrl;
            return { txId: sig, explorerUrl };
        }
        if (cleanAsset === 'BTC' || cleanNetwork === 'BTC') {
            const privBytes = hexToBytes(params.keys.bitcoin.privateKey);
            const pubKeyCompressed = secp256k1.getPublicKey(privBytes, true);
            const sourceAddr = params.keys.bitcoin.address;
            const p2pkh = bitcoin.payments.p2pkh({
                pubkey: Buffer.from(pubKeyCompressed),
                network: bitcoin.networks.bitcoin
            });
            const p2wpkh = bitcoin.payments.p2wpkh({
                pubkey: Buffer.from(pubKeyCompressed),
                network: bitcoin.networks.bitcoin
            });
            const utxoRes = await fetch(
                `https://mempool.space/api/address/${sourceAddr}/utxo`
            );
            if (!utxoRes.ok) {
                throw new Error(
                    `Failed to query Bitcoin UTXOs from mempool.space (${utxoRes.status}).`
                );
            }
            const utxos = await utxoRes.json();
            if (!Array.isArray(utxos) || utxos.length === 0) {
                throw new Error(`No spendable Bitcoin UTXOs found on ${sourceAddr}.`);
            }
            const targetSats = BigInt(Math.floor(amount * 1e8));
            if (targetSats < 546n) {
                throw new Error('BTC transfer amount is below the 546 satoshi dust limit.');
            }
            const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });
            let gatheredSats = 0n;
            const feeSats = 1500n;
            for (const u of utxos) {
                const val = BigInt(u.value || 0);
                if (val <= 0n) continue;
                gatheredSats += val;
                if (sourceAddr.startsWith('bc1') && p2wpkh.output) {
                    psbt.addInput({
                        hash: u.txid,
                        index: Number(u.vout),
                        witnessUtxo: {
                            script: p2wpkh.output,
                            value: val
                        }
                    });
                } else {
                    const rawRes = await fetch(
                        `https://mempool.space/api/tx/${u.txid}/hex`
                    );
                    const rawHex = (await rawRes.text()).trim();
                    psbt.addInput({
                        hash: u.txid,
                        index: Number(u.vout),
                        nonWitnessUtxo: Buffer.from(rawHex, 'hex')
                    });
                }
                if (gatheredSats >= targetSats + feeSats) break;
            }
            if (gatheredSats < targetSats + feeSats) {
                throw new Error(
                    `Insufficient BTC UTXO balance: required ${targetSats + feeSats} sats, available ${gatheredSats} sats.`
                );
            }
            psbt.addOutput({
                address: dest,
                value: targetSats
            });
            const changeSats = gatheredSats - targetSats - feeSats;
            if (changeSats >= 546n) {
                psbt.addOutput({
                    address: sourceAddr || p2pkh.address!,
                    value: changeSats
                });
            }
            const signer = {
                publicKey: Buffer.from(pubKeyCompressed),
                sign: (hash: Uint8Array) => {
                    const sig = secp256k1.sign(hash, privBytes);
                    return Buffer.from(sig.toCompactRawBytes());
                }
            };
            psbt.signAllInputs(signer as any);
            psbt.finalizeAllInputs();
            privBytes.fill(0);
            const rawTxHex = psbt.extractTransaction().toHex();
            const broadcastRes = await fetch('https://mempool.space/api/tx', {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: rawTxHex
            });
            if (!broadcastRes.ok) {
                const errText = await broadcastRes.text();
                throw new Error(`mempool.space rejected BTC transaction: ${errText}`);
            }
            const txId = (await broadcastRes.text()).trim();
            const explorerUrl = getChainExplorerTxUrl('BTC', txId);
            txState.lastTxId = txId;
            txState.lastExplorerUrl = explorerUrl;
            return { txId, explorerUrl };
        }
        if (cleanAsset === 'XRP' || cleanNetwork === 'XRP') {
            const xrpPrivHex = params.keys.xrp.privateKey.replace(/^0x/i, '').toUpperCase();
            const pubBytes = secp256k1.getPublicKey(hexToBytes(xrpPrivHex), true);
            const wallet = new XrplWallet(
                bytesToHex(pubBytes).toUpperCase(),
                xrpPrivHex
            );
            const client = new XrplClient('wss://xrplcluster.com');
            await client.connect();
            try {
                const prepared = await client.autofill({
                    TransactionType: 'Payment',
                    Account: wallet.classicAddress,
                    Amount: xrpToDrops(amount.toFixed(6)),
                    Destination: dest
                });
                const signed = wallet.sign(prepared);
                const submitRes = await client.submitAndWait(signed.tx_blob);
                const txHash = signed.hash || (submitRes.result as any)?.hash;
                if (!txHash) {
                    throw new Error('XRPL node returned no transaction hash.');
                }
                const explorerUrl = getChainExplorerTxUrl('XRP', txHash);
                txState.lastTxId = txHash;
                txState.lastExplorerUrl = explorerUrl;
                return { txId: txHash, explorerUrl };
            } finally {
                await client.disconnect().catch(() => {});
            }
        }
        throw new Error(
            `Direct browser-side L1 signing for ${cleanAsset} requires routing through the Sovereign L1 Dispatcher.`
        );
    } catch (e: any) {
        txState.error = e.message;
        throw e;
    } finally {
        txState.isBroadcasting = false;
    }
}

export async function executeSovereignTransaction(
    destinationAddress: string,
    amountKas: number
): Promise<string> {
    if (!txState.decryptedPrivateKeyHex) throw new Error('ERR_VAULT_LOCKED');
    txState.isBroadcasting = true;
    txState.error = '';
    let privKeyBytes: Uint8Array = new Uint8Array(0);
    try {
        privKeyBytes = hexToBytes(txState.decryptedPrivateKeyHex);
        const myPubKeyBytes = schnorr.getPublicKey(privKeyBytes);
        const sourceScriptHex = `20${bytesToHex(myPubKeyBytes)}ac`;
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok) throw new Error('ERR_LOST_SESSION');
        const { address: myAddress } = await meRes.json();
        const utxoFetchRes = await fetch(
            `/api/utxos?address=${encodeURIComponent(myAddress)}`
        );
        if (!utxoFetchRes.ok) throw new Error('ERR_UTXO_PROXY_UNREACHABLE');
        const utxoData = await utxoFetchRes.json();
        const utxos = Array.isArray(utxoData) ? utxoData : utxoData.entries || [];
        const targetSompi = BigInt(Math.floor(amountKas * 1e8));
        if (targetSompi <= 0n) {
            throw new Error(
                'ERR_INVALID_AMOUNT: Transfer amount must be greater than 0 sompi.'
            );
        }
        const sortedUtxos = [...utxos].sort((a, b) => {
            const amtA = BigInt(a.amount ?? a.utxoEntry?.amount ?? 0);
            const amtB = BigInt(b.amount ?? b.utxoEntry?.amount ?? 0);
            return amtA < amtB ? 1 : amtA > amtB ? -1 : 0;
        });
        let gathered = 0n;
        let fee = 0n;
        const selectedUtxos: any[] = [];
        const inputAmounts: bigint[] = [];
        for (const u of sortedUtxos) {
            selectedUtxos.push(u);
            const amt = BigInt(u.amount ?? u.utxoEntry?.amount ?? 0);
            inputAmounts.push(amt);
            gathered += amt;
            const computeMassTwoOutputs = calculateComputeMass(
                selectedUtxos.length,
                2,
                0
            );
            const provisionalFee = computeMassTwoOutputs * FEE_PER_GRAM;
            const provisionalChange =
                gathered > targetSompi + provisionalFee
                    ? gathered - (targetSompi + provisionalFee)
                    : 0n;
            const provisionalOutputs =
                provisionalChange >= MIN_CHANGE_SOMPI
                    ? [targetSompi, provisionalChange]
                    : [targetSompi];
            const computeMass = calculateComputeMass(
                selectedUtxos.length,
                provisionalOutputs.length,
                0
            );
            const storageMass = calculateStorageMass(
                inputAmounts,
                provisionalOutputs
            );
            const effectiveMass =
                computeMass > storageMass ? computeMass : storageMass;
            fee = effectiveMass * FEE_PER_GRAM;
            if (gathered >= targetSompi + fee) break;
        }
        if (gathered < targetSompi + fee) {
            throw new Error(
                `ERR_INSUFFICIENT_MASS: Required ${targetSompi + fee}, Available ${gathered}`
            );
        }
        const change = gathered - targetSompi - fee;
        const destPubKey = decodeAddressToPubkey(destinationAddress);
        const destScriptHex = `20${bytesToHex(destPubKey)}ac`;
        const txInputs = selectedUtxos.map((u) => {
            const txId = u.outpoint?.transactionId ?? u.transactionId;
            const index = u.outpoint?.index ?? u.index;
            return {
                previousOutpoint: {
                    transactionId: txId,
                    index: Number(index)
                },
                signatureScript: '',
                sequence: 0,
                sigOpCount: 1
            };
        });
        const txOutputs = [
            {
                amount: Number(targetSompi),
                scriptPublicKey: destScriptHex
            }
        ];
        if (change >= MIN_CHANGE_SOMPI) {
            txOutputs.push({
                amount: Number(change),
                scriptPublicKey: sourceScriptHex
            });
        }
        const tx = {
            version: 0,
            inputs: txInputs,
            outputs: txOutputs,
            lockTime: 0,
            subnetworkId: '0000000000000000000000000000000000000000',
            gas: 0,
            payload: '',
            mass: 0,
            storageMass: 0
        };
        for (let i = 0; i < tx.inputs.length; i++) {
            const utxo = selectedUtxos[i];
            const spkHex =
                typeof utxo.scriptPublicKey === 'string'
                    ? utxo.scriptPublicKey
                    : utxo.scriptPublicKey?.scriptPublicKey ??
                      utxo.utxoEntry?.scriptPublicKey?.scriptPublicKey;
            const amt = BigInt(utxo.amount ?? utxo.utxoEntry?.amount);
            const sighash = computeInputSighash(tx, i, spkHex, amt, SIGHASH_ALL);
            const signature = schnorr.sign(sighash, privKeyBytes);
            tx.inputs[i].signatureScript = `41${bytesToHex(signature)}01`;
        }
        privKeyBytes.fill(0);
        txState.decryptedPrivateKeyHex = '0'.repeat(64);
        txState.decryptedPrivateKeyHex = '';
        const broadcastRes = await fetch('/api/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction: tx })
        });
        if (!broadcastRes.ok) {
            const errData = await broadcastRes.json().catch(() => ({}));
            throw new Error(
                `ERR_BROADCAST_REJECTED: ${errData.error || 'Node refused payload'}`
            );
        }
        const resData = await broadcastRes.json();
        txState.lastTxId = resData.transactionId || resData.id;
        txState.lastExplorerUrl = getChainExplorerTxUrl('KAS', txState.lastTxId);
        return txState.lastTxId;
    } catch (e: any) {
        txState.error = e.message;
        throw e;
    } finally {
        if (privKeyBytes.length > 0) privKeyBytes.fill(0);
        txState.isBroadcasting = false;
        txState.decryptedPrivateKeyHex = '0'.repeat(64);
        txState.decryptedPrivateKeyHex = '';
    }
}

export async function executeSovereignUtxoCompound(): Promise<{
    txId: string;
    compoundedCount: number;
}> {
    if (!txState.decryptedPrivateKeyHex) throw new Error('ERR_VAULT_LOCKED');
    txState.isBroadcasting = true;
    txState.error = '';
    let privKeyBytes: Uint8Array = new Uint8Array(0);
    try {
        privKeyBytes = hexToBytes(txState.decryptedPrivateKeyHex);
        const myPubKeyBytes = schnorr.getPublicKey(privKeyBytes);
        const selfScriptHex = `20${bytesToHex(myPubKeyBytes)}ac`;
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok) throw new Error('ERR_LOST_SESSION');
        const { address: myAddress } = await meRes.json();
        const utxoFetchRes = await fetch(
            `/api/utxos?address=${encodeURIComponent(myAddress)}`
        );
        if (!utxoFetchRes.ok) throw new Error('ERR_UTXO_PROXY_UNREACHABLE');
        const utxoData = await utxoFetchRes.json();
        const utxos = Array.isArray(utxoData) ? utxoData : utxoData.entries || [];
        if (utxos.length < 2) {
            throw new Error(
                'UTXO_COMPOUND_UNNECESSARY: At least 2 UTXOs are required to compound.'
            );
        }
        const sortedUtxos = [...utxos].sort((a, b) => {
            const amtA = BigInt(a.amount ?? a.utxoEntry?.amount ?? 0);
            const amtB = BigInt(b.amount ?? b.utxoEntry?.amount ?? 0);
            return amtA < amtB ? -1 : amtA > amtB ? 1 : 0;
        });
        const selectedUtxos = sortedUtxos.slice(0, 80);
        let gathered = 0n;
        const inputAmounts: bigint[] = [];
        for (const u of selectedUtxos) {
            const amt = BigInt(u.amount ?? u.utxoEntry?.amount ?? 0);
            inputAmounts.push(amt);
            gathered += amt;
        }
        const computeMass = calculateComputeMass(selectedUtxos.length, 1, 0);
        const provisionalFee = computeMass * FEE_PER_GRAM;
        if (gathered <= provisionalFee) {
            throw new Error(
                'ERR_INSUFFICIENT_MASS: Selected UTXO sum cannot cover compounding network fee.'
            );
        }
        const provisionalOutput = gathered - provisionalFee;
        const storageMass = calculateStorageMass(inputAmounts, [provisionalOutput]);
        const effectiveMass = computeMass > storageMass ? computeMass : storageMass;
        const finalFee = effectiveMass * FEE_PER_GRAM;
        if (gathered <= finalFee) {
            throw new Error(
                'ERR_INSUFFICIENT_MASS: Selected UTXO sum cannot cover effective storage mass fee.'
            );
        }
        const finalOutputSompi = gathered - finalFee;
        const txInputs = selectedUtxos.map((u) => {
            const txId = u.outpoint?.transactionId ?? u.transactionId;
            const index = u.outpoint?.index ?? u.index;
            return {
                previousOutpoint: {
                    transactionId: txId,
                    index: Number(index)
                },
                signatureScript: '',
                sequence: 0,
                sigOpCount: 1
            };
        });
        const txOutputs = [
            {
                amount: Number(finalOutputSompi),
                scriptPublicKey: selfScriptHex
            }
        ];
        const tx = {
            version: 0,
            inputs: txInputs,
            outputs: txOutputs,
            lockTime: 0,
            subnetworkId: '0000000000000000000000000000000000000000',
            gas: 0,
            payload: '',
            mass: 0,
            storageMass: 0
        };
        for (let i = 0; i < tx.inputs.length; i++) {
            const utxo = selectedUtxos[i];
            const spkHex =
                typeof utxo.scriptPublicKey === 'string'
                    ? utxo.scriptPublicKey
                    : utxo.scriptPublicKey?.scriptPublicKey ??
                      utxo.utxoEntry?.scriptPublicKey?.scriptPublicKey;
            const amt = BigInt(utxo.amount ?? utxo.utxoEntry?.amount);
            const sighash = computeInputSighash(tx, i, spkHex, amt, SIGHASH_ALL);
            const signature = schnorr.sign(sighash, privKeyBytes);
            tx.inputs[i].signatureScript = `41${bytesToHex(signature)}01`;
        }
        privKeyBytes.fill(0);
        txState.decryptedPrivateKeyHex = '0'.repeat(64);
        txState.decryptedPrivateKeyHex = '';
        const broadcastRes = await fetch('/api/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction: tx })
        });
        if (!broadcastRes.ok) {
            const errData = await broadcastRes.json().catch(() => ({}));
            throw new Error(
                `ERR_BROADCAST_REJECTED: ${errData.error || 'Node refused compounding payload'}`
            );
        }
        const resData = await broadcastRes.json();
        const txId = resData.transactionId || resData.id;
        txState.lastTxId = txId;
        txState.lastExplorerUrl = getChainExplorerTxUrl('KAS', txId);
        return { txId, compoundedCount: selectedUtxos.length };
    } catch (e: any) {
        txState.error = e.message;
        throw e;
    } finally {
        if (privKeyBytes.length > 0) privKeyBytes.fill(0);
        txState.isBroadcasting = false;
        txState.decryptedPrivateKeyHex = '0'.repeat(64);
        txState.decryptedPrivateKeyHex = '';
    }
}