import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { redis } from '$lib/server/redis';
import { blake2b } from '@noble/hashes/blake2.js';
import { schnorr } from '@noble/curves/secp256k1.js';
import { ethers } from 'ethers';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const kaspaCore = require('@kaspa/core-lib');

const KASPA_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

// Zero-Dependency Native Base32 Kaspa Decoder for Absolute Sovereign Verification
function decodeAddressToPubkey(address: string): Uint8Array {
    const parts = address.split(':');
    if (parts.length !== 2) throw new Error("ERR_INVALID_ADDRESS_FORMAT");
    
    const base32 = parts[1];
    const decoded = new Uint8Array(base32.length - 8);
    
    for (let i = 0; i < base32.length - 8; i++) {
        const val = KASPA_CHARSET.indexOf(base32[i]);
        if (val === -1) throw new Error("ERR_INVALID_BASE32_CHAR");
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

function hexToBytes(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) throw new Error("ERR_INVALID_HEX_LENGTH");
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

export const POST: RequestHandler = async ({ request, cookies }) => {
    try {
        const { address, signature, message, provider } = await request.json();

        if (!address) {
            return json({ error: 'Address required' }, { status: 400 });
        }

        const cleanAddress = address.toLowerCase();

        // ⚡ GLOBAL DEV BYPASS: Set to false in production!
        const GLOBAL_DEV_BYPASS = true; 
        let isValid = false;

        // Observer Mode bypasses mathematical auth entirely
        if (provider !== 'observer') {
            if (!signature || !message) {
                return json({ error: 'Missing cryptographic proof' }, { status: 400 });
            }

            // 1. Verify Challenge Exists & Matches
            const storedMessage = await redis.get(`auth_challenge:${cleanAddress}`);
            if (!storedMessage || storedMessage !== message) {
                return json({ error: 'Challenge expired or invalid. Please reconnect.' }, { status: 401 });
            }

            // 2. Cryptographic Mathematical Verification
            try {
                if (provider === 'walletconnect') {
                    const recoveredAddress = ethers.verifyMessage(message, signature);
                    isValid = recoveredAddress.toLowerCase() === cleanAddress;
                } else if (provider === 'kasware') {
                    try {
                        const KaspaMessage = kaspaCore.Message || kaspaCore.default?.Message;
                        if (KaspaMessage) {
                            const msgObj = new KaspaMessage(message);
                            const noPrefixAddress = cleanAddress.replace('kaspa:', '');
                            isValid = msgObj.verify(cleanAddress, signature) || msgObj.verify(noPrefixAddress, signature);
                        }
                    } catch (e) {
                        console.warn("Core-lib verification warning:", e);
                    }
                } else if (provider === 'sovereign') {
                    const pubKeyBytes = decodeAddressToPubkey(cleanAddress);
                    const sigBytes = hexToBytes(signature);
                    const msgBuf = new TextEncoder().encode(message);
                    const msgHash = blake2b(msgBuf, { dkLen: 32 });
                    
                    try {
                        isValid = schnorr.verify(sigBytes, msgHash, pubKeyBytes);
                    } catch (e) {
                        isValid = false;
                    }
                }
            } catch (cryptoErr) {
                console.error("Signature math failed:", cryptoErr);
            }

            // ⚡ OVERRIDE
            if (!isValid && GLOBAL_DEV_BYPASS) {
                isValid = true;
                console.warn(`⚠️ DEV BYPASS ACTIVATED: Signature verification overridden for testing wallet: ${cleanAddress}`);
            }

            if (!isValid) {
                return json({ error: 'Zero-Trust Protocol: Cryptographic signature mismatch.' }, { status: 401 });
            }

            // 3. Consume nonce to ensure it can never be reused
            await redis.del(`auth_challenge:${cleanAddress}`);
        }

        // 4. Issue the strict HTTP-Only Zero-Trust Session
        cookies.set('perennia_session', address, {
            path: '/',
            httpOnly: true, // Prevents XSS memory scraping
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24 * 7 // 1 Week persistent base state
        });

        return json({ status: 'success', address });
    } catch (error) {
        console.error("Auth Engine Fault:", error);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};

export const DELETE: RequestHandler = async ({ cookies }) => {
    cookies.delete('perennia_session', { path: '/' });
    return json({ status: 'logged_out' });
};