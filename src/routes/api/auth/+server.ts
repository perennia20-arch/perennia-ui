import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { blake2b } from '@noble/hashes/blake2.js';
import { schnorr } from '@noble/curves/secp256k1.js';
import crypto from 'node:crypto';

const KASPA_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

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

export const POST: RequestHandler = async ({ request, cookies }: RequestEvent) => {
    try {
        const payload = await request.json();
        const { address, signature, message, provider } = payload;

        if (!address) {
            return json({ error: 'Address required' }, { status: 400 });
        }

        if (provider && provider !== 'sovereign') {
            return json(
                { error: 'SOVEREIGN_WALLET_REQUIRED: External wallet extensions are disabled. Please use the native Perennia Sovereign Vault.' },
                { status: 403 }
            );
        }

        if (!signature || !message) {
            return json({ error: 'Missing cryptographic proof' }, { status: 400 });
        }

        const cleanAddress = address.trim().toLowerCase().startsWith('kaspa:')
            ? address.trim().toLowerCase()
            : `kaspa:${address.trim().toLowerCase()}`;

        const storedMessage = await redis.get(`auth_challenge:${cleanAddress}`);
        if (!storedMessage || storedMessage !== message) {
            return json({ error: 'Challenge expired or invalid. Please reconnect.' }, { status: 401 });
        }

        let isValid = false;
        try {
            const pubKeyBytes = decodeAddressToPubkey(cleanAddress);
            const sigBytes = hexToBytes(signature);
            const msgBuf = new TextEncoder().encode(message);
            const msgHash = blake2b(msgBuf, { dkLen: 32 });
            isValid = schnorr.verify(sigBytes, msgHash, pubKeyBytes);
        } catch (cryptoErr) {
            console.error("Sovereign signature verification failed:", cryptoErr);
        }

        if (!isValid) {
            return json({ error: 'Zero-Trust Protocol: Cryptographic signature mismatch.' }, { status: 401 });
        }

        await redis.del(`auth_challenge:${cleanAddress}`);

        const sessionId = crypto.randomBytes(32).toString('hex');
        await redis.set(`session:${sessionId}`, cleanAddress, 'EX', 60 * 60 * 24 * 7);

        cookies.set('perennia_session', sessionId, {
            path: '/',
            httpOnly: true,
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24 * 7
        });

        return json({ status: 'success', address: cleanAddress });
    } catch (error) {
        console.error("Auth Engine Fault:", error);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};

export const DELETE: RequestHandler = async ({ cookies }: RequestEvent) => {
    const sessionId = cookies.get('perennia_session');
    if (sessionId) {
        try {
            await redis.del(`session:${sessionId}`);
        } catch (e) {
            console.error("Failed to delete session from Redis:", e);
        }
    }
    cookies.delete('perennia_session', { path: '/' });
    return json({ status: 'logged_out' });
};