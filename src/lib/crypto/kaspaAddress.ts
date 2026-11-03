import { blake2b } from '@noble/hashes/blake2.js';

export const KASPA_UNSPENDABLE_BURN_ADDRESS =
    'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e';

export const KASPA_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
export const KASPA_ADDR_VERSION_P2PK_SCHNORR = 0x00;
export const KASPA_ADDR_VERSION_P2PK_ECDSA = 0x01;
export const KASPA_ADDR_VERSION_P2SH = 0x08;

export interface KasplexProtocolInfo {
    online: boolean;
    feeAddress: string;
    opFeeDeploySompi: bigint;
    opFeeMintSompi: bigint;
    opFeeDeployKas: number;
    opFeeMintKas: number;
    syncedBlockScore?: string;
}

export function hexToBytes(hex: string): Uint8Array {
    const clean = hex.trim().replace(/^0x/i, '');
    if (clean.length % 2 !== 0) throw new Error('ERR_INVALID_HEX_LENGTH');
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

export function writeUint16LE(val: number): Uint8Array {
    const arr = new Uint8Array(2);
    new DataView(arr.buffer).setUint16(0, val, true);
    return arr;
}

export function writeUint32LE(val: number): Uint8Array {
    const arr = new Uint8Array(4);
    new DataView(arr.buffer).setUint32(0, val, true);
    return arr;
}

export function writeBigUint64LE(val: bigint): Uint8Array {
    const arr = new Uint8Array(8);
    new DataView(arr.buffer).setBigUint64(0, val, true);
    return arr;
}

export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
    const totalLen = arrays.reduce((acc, arr) => acc + arr.length, 0);
    const res = new Uint8Array(totalLen);
    let offset = 0;
    for (const arr of arrays) {
        res.set(arr, offset);
        offset += arr.length;
    }
    return res;
}

export function kaspaPolymod(values: number[]): bigint {
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

export function encodeKaspaBech32mWithVersion(
    versionByte: number,
    payload32: Uint8Array
): string {
    const prefix = 'kaspa';
    const prefixValues = prefix
        .split('')
        .map((c) => c.charCodeAt(0) & 31)
        .concat([0]);
    const payload = [versionByte & 0xff, ...payload32.slice(0, 32)];
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

export function encodeKaspaAddressFromPubkeyBytes(pubKeyX: Uint8Array): string {
    return encodeKaspaBech32mWithVersion(KASPA_ADDR_VERSION_P2PK_SCHNORR, pubKeyX);
}

export function encodeKaspaP2shAddressFromScriptHash(scriptHash32: Uint8Array): string {
    return encodeKaspaBech32mWithVersion(KASPA_ADDR_VERSION_P2SH, scriptHash32);
}

export function deriveDeterministicKaspaAddress(seedLabel: string): string {
    const digest = new Uint8Array(
        blake2b(new TextEncoder().encode(`PERENNIA_CAP_TABLE:${seedLabel}`), {
            dkLen: 32
        })
    );
    return encodeKaspaAddressFromPubkeyBytes(digest);
}

export function deriveDeterministicKaspaP2shAddress(seedLabel: string): string {
    const digest = new Uint8Array(
        blake2b(
            new TextEncoder().encode(`PERENNIA_SILVERSCRIPT_VAULT:${seedLabel}`),
            { dkLen: 32 }
        )
    );
    return encodeKaspaP2shAddressFromScriptHash(digest);
}

export function validateKaspaBech32mAddress(rawAddress: string): {
    valid: boolean;
    normalized: string;
    version?: number;
    addressType?: 'P2PK' | 'P2SH';
    payloadBytes?: Uint8Array;
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
    const dataWords = payloadWords.slice(0, payloadWords.length - 8);
    const decodedBytes: number[] = [];
    let val = 0;
    let bits = 0;
    for (let i = 0; i < dataWords.length; i++) {
        val = (val << 5) | dataWords[i];
        bits += 5;
        while (bits >= 8) {
            bits -= 8;
            decodedBytes.push((val >> bits) & 0xff);
        }
    }
    if (decodedBytes.length < 33) {
        return {
            valid: false,
            normalized: trimmed,
            error: 'Decoded Kaspa address payload is shorter than 33 bytes.'
        };
    }
    const version = decodedBytes[0];
    if (
        version !== KASPA_ADDR_VERSION_P2PK_SCHNORR &&
        version !== KASPA_ADDR_VERSION_P2PK_ECDSA &&
        version !== KASPA_ADDR_VERSION_P2SH
    ) {
        return {
            valid: false,
            normalized: trimmed,
            error: `Unsupported Kaspa address version byte 0x${version.toString(16).padStart(2, '0')}.`
        };
    }
    return {
        valid: true,
        normalized: trimmed,
        version,
        addressType: version === KASPA_ADDR_VERSION_P2SH ? 'P2SH' : 'P2PK',
        payloadBytes: new Uint8Array(decodedBytes.slice(1, 33))
    };
}

export function decodeAddressToPubkey(address: string): Uint8Array {
    const formatted = address.trim().toLowerCase().startsWith('kaspa:')
        ? address.trim().toLowerCase()
        : `kaspa:${address.trim().toLowerCase()}`;
    const parts = formatted.split(':');
    if (parts.length !== 2) throw new Error('ERR_INVALID_ADDRESS_FORMAT');
    const base32 = parts[1];
    if (base32.length < 9) throw new Error('ERR_INVALID_ADDRESS_LENGTH');
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

export function decodeAddressToVersionAndHash(address: string): {
    version: number;
    hash32: Uint8Array;
    addressType: 'P2PK' | 'P2SH';
} {
    const formatted = address.trim().toLowerCase().startsWith('kaspa:')
        ? address.trim().toLowerCase()
        : `kaspa:${address.trim().toLowerCase()}`;
    const parts = formatted.split(':');
    if (parts.length !== 2) throw new Error('ERR_INVALID_ADDRESS_FORMAT');
    const base32 = parts[1];
    if (base32.length < 9) throw new Error('ERR_INVALID_ADDRESS_LENGTH');
    const decoded = new Uint8Array(base32.length - 8);
    for (let i = 0; i < base32.length - 8; i++) {
        const idx = KASPA_CHARSET.indexOf(base32[i]);
        if (idx === -1) throw new Error('ERR_INVALID_BASE32_CHAR');
        decoded[i] = idx;
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
    if (out.length < 2) throw new Error('ERR_DECODED_PAYLOAD_TOO_SHORT');
    const version = out[0];
    return {
        version,
        hash32: new Uint8Array(out.slice(1, 33)),
        addressType: version === KASPA_ADDR_VERSION_P2SH ? 'P2SH' : 'P2PK'
    };
}

export function decodeAddressToScript(address: string): string {
    const { version, hash32 } = decodeAddressToVersionAndHash(address);
    const hashHex = bytesToHex(hash32);
    if (version === KASPA_ADDR_VERSION_P2SH) {
        return `a9${hashHex}87`;
    }
    return `20${hashHex}ac`;
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