export const CRYPTO_ITERATIONS = 250000;

async function getDerivationKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        'raw',
        enc.encode(password) as BufferSource,
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    return window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt as BufferSource,
            iterations: CRYPTO_ITERATIONS,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

export async function encryptVault(
    password: string,
    mnemonic: string
): Promise<string> {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await getDerivationKey(password, salt);
    const enc = new TextEncoder();
    const encrypted = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv as BufferSource },
        key,
        enc.encode(mnemonic) as BufferSource
    );
    const payload = new Uint8Array(
        salt.length + iv.length + encrypted.byteLength
    );
    payload.set(salt, 0);
    payload.set(iv, salt.length);
    payload.set(new Uint8Array(encrypted), salt.length + iv.length);
    let binary = '';
    for (let i = 0; i < payload.byteLength; i++) {
        binary += String.fromCharCode(payload[i]);
    }
    return window.btoa(binary);
}

export async function decryptVault(
    password: string,
    encryptedB64: string
): Promise<string> {
    const binary = window.atob(encryptedB64);
    const payload = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        payload[i] = binary.charCodeAt(i);
    }
    const salt = payload.slice(0, 16);
    const iv = payload.slice(16, 28);
    const ciphertext = payload.slice(28);
    const key = await getDerivationKey(password, salt);
    const dec = new TextDecoder();
    const decryptedBuf = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as BufferSource },
        key,
        ciphertext as BufferSource
    );
    return dec.decode(decryptedBuf);
}