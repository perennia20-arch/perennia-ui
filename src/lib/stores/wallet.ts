import { writable, get } from 'svelte/store';
import { UniversalProvider } from '@walletconnect/universal-provider';
import { WalletConnectModal } from '@walletconnect/modal';
import { ethers } from 'ethers';
import * as bitcoin from 'bitcoinjs-lib';
import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { blake2b } from '@noble/hashes/blake2.js';
import { schnorr } from '@noble/curves/secp256k1.js';
import createHash from 'create-hash';
import bs58check from 'bs58check';
import { deriveHoneycombKeys } from '$lib/crypto/honeycomb';

import { activeInviteCode } from '$lib/stores/app';

// @ts-ignore
import { executeSovereignTransaction, executeSovereignPSBT, txState } from './transaction.svelte.ts';

if (typeof window !== 'undefined') {
    (window as any).Buffer = (window as any).Buffer || Buffer;
}

function hexToBytes(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) throw new Error("ERR_INVALID_HEX_LENGTH");
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export const DEV_ADMIN_BYPASS = false;
export const MASTER_ADMIN_ADDRESS = "kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579";

export const showWalletModal = writable<boolean>(false);
export const isConnecting = writable<boolean>(false);
export const walletMessage = writable<string>('');

export const isVaultUnlockPending = writable<boolean>(false);
export const pendingTransactionDetails = writable<{
    payAsset: string;
    receiveAsset: string;
    payAmount: string;
    destinationAddress: string;
    amountSompi: number;
    psbtData?: { psbt: any, formattedUtxos: any[] };
} | null>(null);

export const isWalletConnected = writable<boolean>(false);
export const walletAddress = writable<string | null>(null);
export const walletBalance = writable<string>("0"); 
export const activeWalletType = writable<'kasware' | 'walletconnect' | 'sovereign' | 'observer' | null>(null);
export const sovereignKeys = writable<any>(null);
export const networkStatus = writable<'syncing' | 'connected' | 'offline'>('offline');

const TREASURY_ADDRESSES = {
    KAS: MASTER_ADMIN_ADDRESS, 
    ETH: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",   
    SOL: "HN7cAB1wJe3D1v6K18u1nC9Wvy98aV3X45kv5FgvV61a",  
    BTC: "1Cw18pUXoH1T3GL7HMHmSB9DGeGa1Pip5EP"     
};

export function normalizeKaspaAddress(addr: string | null | undefined): string | null {
    if (!addr) return null;
    const clean = addr.trim().toLowerCase();
    if (clean.startsWith('kaspa:')) return clean;
    return `kaspa:${clean}`;
}

export function getCleanKaspaAddress(addr: string | null | undefined): string {
    if (!addr) return '';
    return addr.replace(/^kaspa:/i, '').trim().toLowerCase();
}

const CRYPTO_ITERATIONS = 250000;

async function getDerivationKey(password: string, salt: Uint8Array) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );
    return window.crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: salt as any, iterations: CRYPTO_ITERATIONS, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

export async function encryptVault(password: string, mnemonic: string): Promise<string> {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await getDerivationKey(password, salt);
    const enc = new TextEncoder();
    
    const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as any }, key, enc.encode(mnemonic));
    
    const payload = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    payload.set(salt, 0);
    payload.set(iv, salt.length);
    payload.set(new Uint8Array(encrypted), salt.length + iv.length);
    
    let binary = '';
    for (let i = 0; i < payload.byteLength; i++) {
        binary += String.fromCharCode(payload[i]);
    }
    return window.btoa(binary);
}

export async function decryptVault(password: string, encryptedB64: string): Promise<string> {
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
    
    const decryptedBuf = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as any }, key, ciphertext);
    return dec.decode(decryptedBuf);
}

async function buildAndSecureVault(password: string, mnemonic: string, isImport = false) {
    isConnecting.set(true);
    walletMessage.set(isImport ? 'Importing Omni-Chain Matrix...' : 'Forging Omni-Chain Matrix...');
    
    try {
        const keys = await deriveHoneycombKeys(mnemonic);
        const kasAddress = normalizeKaspaAddress(keys.kaspa.address)!;

        walletMessage.set('Executing Local Zero-Trust Handshake...');
        
        const challengeRes = await fetch('/api/auth/challenge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: kasAddress })
        });
        
        if (!challengeRes.ok) throw new Error("Failed to secure connection challenge.");
        const { message } = await challengeRes.json();

        let privateKeyHex = keys.kaspa.privateKey.replace('0x', '');
        const msgBuf = new TextEncoder().encode(message);
        const hash = blake2b(msgBuf, { dkLen: 32 });
        const signatureBytes = schnorr.sign(hash, hexToBytes(privateKeyHex));
        const signature = bytesToHex(signatureBytes);

        privateKeyHex = "0".repeat(64); // Scrub memory

        const authBody: Record<string, any> = { address: kasAddress, signature, message, provider: 'sovereign' };
        const invite = get(activeInviteCode);
        if (invite) authBody.inviteCode = invite;

        const authRes = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(authBody)
        });

        if (!authRes.ok) {
            const errData = await authRes.json();
            throw new Error(errData.error || "Matrix Authentication Failed.");
        }

        walletMessage.set('Encrypting Ephemeral Vault...');
        const encryptedVault = await encryptVault(password, mnemonic);

        const safeWallets = {
            kaspa: { address: keys.kaspa.address },
            bitcoin: { address: keys.bitcoin.address },
            ethereum: { address: keys.ethereum.address },
            solana: { address: keys.solana.address },
            doge: { address: keys.doge.address },
            xrp: { address: keys.xrp.address },
            polygon: { address: keys.polygon.address },
            avalanche: { address: keys.avalanche.address },
            sui: { address: keys.sui.address },
            tron: { address: keys.tron.address },
            zcash: { address: keys.zcash.address }
        };

        const vaultPayload = {
            wallets: safeWallets,
            vault: encryptedVault
        };

        return { 
            success: true, 
            payload: vaultPayload, 
            mnemonic,
            addresses: safeWallets
        };

    } catch (e: any) {
        console.error("[Perennia Core] Matrix Forge Failed:", e);
        walletMessage.set(e.message || 'Sovereign Generation Failed.');
        disconnectWallet();
        throw e;
    } finally {
        isConnecting.set(false);
    }
}

export async function generateSovereignHoneycomb(password: string) {
    const randomEntropy = window.crypto.getRandomValues(new Uint8Array(32));
    const mnemonicObj = ethers.Mnemonic.fromEntropy(randomEntropy);
    const mnemonic = mnemonicObj.phrase;
    return await buildAndSecureVault(password, mnemonic, false);
}

export async function importSovereignVault(password: string, mnemonic: string) {
    return await buildAndSecureVault(password, mnemonic.trim().toLowerCase(), true);
}

export async function unlockSovereignVault(password: string) {
    isConnecting.set(true);
    walletMessage.set('Decrypting Vault...');
    let privateKeyHex = "";
    
    try {
        const rawPayload = localStorage.getItem('perennia_sovereign_payload');
        if (!rawPayload) throw new Error("No vault found on this device.");
        
        const vaultPayload = JSON.parse(rawPayload);
        const mnemonic = await decryptVault(password, vaultPayload.vault);
        
        const keys = await deriveHoneycombKeys(mnemonic);
        privateKeyHex = keys.kaspa.privateKey.replace('0x', '');
        const kasAddress = normalizeKaspaAddress(keys.kaspa.address)!;

        walletMessage.set('Requesting cryptographic handshake...');
        const challengeRes = await fetch('/api/auth/challenge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: kasAddress })
        });
        
        if (!challengeRes.ok) throw new Error("Failed to secure connection challenge.");
        const { message } = await challengeRes.json();

        walletMessage.set('Signing identity matrix...');
        const msgBuf = new TextEncoder().encode(message);
        const hash = blake2b(msgBuf, { dkLen: 32 });
        const signatureBytes = schnorr.sign(hash, hexToBytes(privateKeyHex));
        const signature = bytesToHex(signatureBytes);

        privateKeyHex = "0".repeat(64);

        walletMessage.set('Verifying zero-trust session...');
        const authBody: Record<string, any> = { address: kasAddress, signature, message, provider: 'sovereign' };
        const invite = get(activeInviteCode);
        if (invite) authBody.inviteCode = invite;

        const authRes = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(authBody)
        });

        if (!authRes.ok) {
            const errData = await authRes.json();
            throw new Error(errData.error || "Sovereign authentication rejected by backend.");
        }

        walletMessage.set('Hydrating Omni-Chain Balances...');
        
        vaultPayload.wallets = {
            kaspa: { address: keys.kaspa.address },
            bitcoin: { address: keys.bitcoin.address },
            ethereum: { address: keys.ethereum.address },
            solana: { address: keys.solana.address },
            doge: { address: keys.doge.address },
            xrp: { address: keys.xrp.address },
            polygon: { address: keys.polygon.address },
            avalanche: { address: keys.avalanche.address },
            sui: { address: keys.sui.address },
            tron: { address: keys.tron.address },
            zcash: { address: keys.zcash.address }
        };

        authorizeSovereignVault(vaultPayload);
        
        return { success: true };
    } catch (e: any) {
        console.error("Decryption/Auth failed:", e);
        walletMessage.set('');
        return { success: false, error: e.message };
    } finally {
        privateKeyHex = "0".repeat(64);
        isConnecting.set(false);
    }
}

export async function confirmSovereignTransaction(password: string, destinationAddress: string, amountSompi: number, psbtData?: any) {
    let privateKey = "";
    isConnecting.set(true);
    walletMessage.set('Authorizing Transaction...');
    
    try {
        const rawPayload = localStorage.getItem('perennia_sovereign_payload');
        if (!rawPayload) throw new Error("No vault found on this device.");
        
        const vaultPayload = JSON.parse(rawPayload);
        const mnemonic = await decryptVault(password, vaultPayload.vault);
        
        walletMessage.set('Signing Transaction...');
        const keys = await deriveHoneycombKeys(mnemonic);
        
        privateKey = keys.kaspa.privateKey;
        if (privateKey.startsWith('0x')) {
            privateKey = privateKey.substring(2);
        }
        
        txState.decryptedPrivateKeyHex = privateKey;
        
        walletMessage.set('Broadcasting Sovereign Transaction...');
        let txId = "";
        
        if (psbtData) {
            txId = await executeSovereignPSBT(psbtData.psbt, psbtData.formattedUtxos);
        } else {
            const amountKas = amountSompi / 100000000;
            txId = await executeSovereignTransaction(destinationAddress, amountKas);
        }
        
        isVaultUnlockPending.set(false);
        pendingTransactionDetails.set(null);
        walletMessage.set('');
        
        return { success: true, txId };
    } catch (e) {
        console.error("[Perennia Core] JIT Execution Failed:", e);
        walletMessage.set('TRANSACTION FAILED.');
        throw e;
    } finally {
        privateKey = "0".repeat(64);
        txState.decryptedPrivateKeyHex = ""; 
        isConnecting.set(false);
    }
}

async function getKaswareWithRetry(maxAttempts = 10, delayMs = 100): Promise<any> {
    if (typeof window === 'undefined') return null;
    for (let i = 0; i < maxAttempts; i++) {
        if ((window as any).kasware) {
            return (window as any).kasware;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return null;
}

function setupKaswareListeners(kasware: any) {
    kasware.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length > 0) {
            walletAddress.set(normalizeKaspaAddress(accounts[0]));
            updateBalance();
        } else {
            disconnectWallet();
        }
    });
}

export async function updateBalance(maxAttempts = 15, delayMs = 200): Promise<boolean> {
    const type = get(activeWalletType);
    const address = get(walletAddress);
    
    if (!address) {
        networkStatus.set('offline');
        return false;
    }

    networkStatus.set('syncing');

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            if (type === 'kasware') {
                const kasware = await getKaswareWithRetry(5, 100);
                if (kasware) {
                    const kasBalance = await kasware.getBalance();
                    if (kasBalance && kasBalance.total !== undefined) {
                        walletBalance.set((kasBalance.total / 100000000).toString());
                        networkStatus.set('connected');
                        return true;
                    }
                }
            } else if (type === 'sovereign') {
                const res = await fetch(`/api/balance?address=${encodeURIComponent(address)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.balance !== undefined) {
                        walletBalance.set(data.balance.toString());
                        networkStatus.set('connected');
                        return true;
                    }
                } else {
                    throw new Error(`Sovereign Fetch Failed: ${res.status}`);
                }
            } else if (type === 'walletconnect' || type === 'observer') {
                networkStatus.set('connected');
                return true; 
            }
        } catch (e) {
            console.warn(`[Perennia RPC] Hydration attempt ${attempt + 1} failed for ${type}.`);
        }
        
        if (attempt < maxAttempts - 1) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    
    walletBalance.set("0");
    networkStatus.set('offline');
    return false;
}

export async function connectKasware() {
    isConnecting.set(true);
    walletMessage.set('Requesting KasWare connection...');
    try {
        const kasware = await getKaswareWithRetry(10, 100);
        if (kasware) {
            const accounts = await kasware.requestAccounts();
            if (accounts && accounts.length > 0) {
                const formattedAddress = normalizeKaspaAddress(accounts[0]) as string;
                
                walletMessage.set('Requesting cryptographic handshake...');
                const challengeRes = await fetch('/api/auth/challenge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ address: formattedAddress })
                });
                
                if (!challengeRes.ok) throw new Error("Failed to secure connection challenge.");
                const { message } = await challengeRes.json();
                
                walletMessage.set('Awaiting KasWare signature...');
                const signatureObj = await kasware.signMessage(message);
                const signature = typeof signatureObj === 'string' ? signatureObj : signatureObj.signature;

                walletMessage.set('Verifying identity matrix...');
                const authBody: Record<string, any> = { 
                    address: formattedAddress, 
                    signature, 
                    message, 
                    provider: 'kasware'
                };
                const invite = get(activeInviteCode);
                if (invite) authBody.inviteCode = invite;

                const authRes = await fetch('/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(authBody)
                });

                if (!authRes.ok) {
                    const errData = await authRes.json();
                    throw new Error(errData.error || "Backend verification rejected the signature.");
                }

                walletAddress.set(formattedAddress);
                activeWalletType.set('kasware');
                
                if (typeof window !== 'undefined') {
                    sessionStorage.setItem('perennia_active_wallet_type', 'kasware');
                }
                
                setupKaswareListeners(kasware);
                walletMessage.set('Hydrating L1 payload...');
                
                await updateBalance(15, 200);
                isWalletConnected.set(true);
                showWalletModal.set(false);
            }
        } else {
            walletMessage.set('KasWare extension not found.');
        }
    } catch (error: any) {
        console.error("KasWare Connect Error:", error);
        walletMessage.set(error.message || 'Connection aborted.');
        disconnectWallet();
    } finally {
        isConnecting.set(false);
    }
}

const WALLETCONNECT_PROJECT_ID = '3a6699d793be81a5a0bd7a810f54546d'; 
export async function connectWalletConnect() {
    isConnecting.set(true);
    walletMessage.set('Initializing WalletConnect Protocol...');
    try {
        const provider = await UniversalProvider.init({
            projectId: WALLETCONNECT_PROJECT_ID,
            metadata: {
                name: "Perennia",
                description: "Tokenize Anything. Liquidate Everything.",
                url: "https://perennia.io",
                icons: ["https://perennia.io/favicon.png"]
            }
        });

        provider.on("display_uri", (uri: string) => {
            const modal = new WalletConnectModal({ projectId: WALLETCONNECT_PROJECT_ID });
            modal.openModal({ uri });
        });

        const session = await provider.connect({
            namespaces: {
                eip155: {
                    methods: ["eth_sendTransaction", "personal_sign"],
                    chains: ["eip155:1"],
                    events: ["chainChanged", "accountsChanged"]
                }
            }
        });

        if (session) {
            const address = session.namespaces.eip155.accounts[0].split(":")[2];
            
            walletMessage.set('Requesting cryptographic handshake...');
            const challengeRes = await fetch('/api/auth/challenge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address })
            });
            if (!challengeRes.ok) throw new Error("Failed to secure connection challenge.");
            const { message } = await challengeRes.json();

            walletMessage.set('Awaiting WalletConnect signature...');
            const signature = await provider.request({
                method: "personal_sign",
                params: [ethers.hexlify(ethers.toUtf8Bytes(message)), address]
            }, "eip155:1");

            walletMessage.set('Verifying identity matrix...');
            const authBody: Record<string, any> = { 
                address, 
                signature, 
                message, 
                provider: 'walletconnect'
            };
            const invite = get(activeInviteCode);
            if (invite) authBody.inviteCode = invite;

            const authRes = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(authBody)
            });

            if (!authRes.ok) {
                const errData = await authRes.json();
                throw new Error(errData.error || "Backend verification rejected the signature.");
            }

            walletAddress.set(address);
            activeWalletType.set('walletconnect');
            
            if (typeof window !== 'undefined') {
                sessionStorage.setItem('perennia_active_wallet_type', 'walletconnect');
            }
            
            await updateBalance(15, 200);
            isWalletConnected.set(true);
            showWalletModal.set(false);
        }
    } catch (e: any) {
        walletMessage.set(e.message || 'WalletConnect aborted.');
        disconnectWallet();
    } finally {
        isConnecting.set(false);
    }
}

export function authorizeSovereignVault(vaultPayload: any) {
    sovereignKeys.set(vaultPayload.wallets);
    
    const formattedAddress = normalizeKaspaAddress(vaultPayload.wallets.kaspa.address);
    walletAddress.set(formattedAddress); 
    activeWalletType.set('sovereign');
    
    if (typeof window !== 'undefined') {
        sessionStorage.setItem('perennia_active_wallet_type', 'sovereign');
        localStorage.setItem('perennia_sovereign_payload', JSON.stringify(vaultPayload));
    }
    
    updateBalance(15, 200).then(() => {
        isWalletConnected.set(true);
    });
}

export function disconnectWallet() {
    const type = get(activeWalletType);
    if (type === 'kasware') {
        try {
            const target = (window as any).kasware;
            if (target && typeof target.disconnect === 'function') {
                target.disconnect();
            }
        } catch (e) {}
    }
    
    fetch('/api/auth', { method: 'DELETE' }).catch(() => {});
    
    walletAddress.set(null);
    isWalletConnected.set(false);
    activeWalletType.set(null);
    walletBalance.set("0");
    networkStatus.set('offline');
    sovereignKeys.set(null); 
    isVaultUnlockPending.set(false);
    pendingTransactionDetails.set(null);
    txState.decryptedPrivateKeyHex = ""; 
    activeInviteCode.set('');
    
    if (typeof window !== 'undefined') {
        sessionStorage.removeItem('perennia_active_wallet_type');
    }
}

export async function restoreSession() {
    if (typeof window === 'undefined') return;
    
    try {
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok) {
            disconnectWallet();
            return;
        }
    } catch (e) {
        console.warn("Session validation unreachable.");
    }

    const savedType = sessionStorage.getItem('perennia_active_wallet_type');
    if (!savedType) return;

    try {
        if (savedType === 'kasware') {
            const kasware = await getKaswareWithRetry(10, 100);
            if (kasware) {
                const accounts = await kasware.getAccounts();
                if (accounts && accounts.length > 0) {
                    walletAddress.set(normalizeKaspaAddress(accounts[0]));
                    activeWalletType.set('kasware');
                    setupKaswareListeners(kasware);
                    
                    await updateBalance(15, 200);
                    isWalletConnected.set(true);
                } else {
                    disconnectWallet();
                }
            }
        } else if (savedType === 'sovereign') {
            const rawPayload = localStorage.getItem('perennia_sovereign_payload');
            if (rawPayload) {
                const vaultPayload = JSON.parse(rawPayload);
                sovereignKeys.set(vaultPayload.wallets);
                walletAddress.set(normalizeKaspaAddress(vaultPayload.wallets.kaspa.address)); 
                activeWalletType.set('sovereign');
                
                await updateBalance(15, 200);
                isWalletConnected.set(true);
            }
        } else if (savedType === 'observer') {
            const authRes = await fetch('/api/auth/me');
            if (authRes.ok) {
                const { address } = await authRes.json();
                walletAddress.set(address);
                activeWalletType.set('observer');
                await updateBalance(15, 200);
                isWalletConnected.set(true);
            }
        }
    } catch (e) {
        console.error("Failed to automatically restore session:", e);
        disconnectWallet();
    }
}

export async function connectObserver() {
    walletMessage.set('Observer mode initializing...');
    
    const address = prompt("Enter Kaspa Address to Observe:");
    if (!address) {
        walletMessage.set('Observer mode aborted.');
        isConnecting.set(false);
        return;
    }
    
    const formattedAddress = normalizeKaspaAddress(address);
    
    const authRes = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: formattedAddress, provider: 'observer' })
    });

    if (authRes.ok) {
        walletAddress.set(formattedAddress);
        activeWalletType.set('observer');
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('perennia_active_wallet_type', 'observer');
        }
        await updateBalance(15, 200);
        isWalletConnected.set(true);
        showWalletModal.set(false);
    } else {
        walletMessage.set('Observer connection rejected.');
    }
    isConnecting.set(false);
}

export async function executeOmniChainSwap(payAsset: string, receiveAsset: string, payAmount: string) {
    const type = get(activeWalletType);
    if (payAsset === 'KAS') {
        const amountSompi = Math.floor(parseFloat(payAmount) * 100000000);
        if (type === 'kasware') {
            const txId = await (window as any).kasware.sendKaspa(TREASURY_ADDRESSES.KAS, amountSompi);
            return { success: true, txId: txId };
        } else if (type === 'sovereign') {
            pendingTransactionDetails.set({
                payAsset,
                receiveAsset,
                payAmount,
                destinationAddress: TREASURY_ADDRESSES.KAS,
                amountSompi
            });
            isVaultUnlockPending.set(true);
            return { success: true, pending: true, message: 'AWAITING_JIT_DECRYPTION' };
        }
    } 
    throw new Error("Unsupported routing path.");
}

export async function executeKrc20Forge(ticker: string, maxSupply: number, mintLimit: number) {
    const type = get(activeWalletType);
    if (type === 'kasware') {
        const deployJson = JSON.stringify({
            p: "krc-20", op: "deploy", tick: ticker.toUpperCase(), max: maxSupply.toString(), lim: mintLimit.toString()
        });
        const txId = await (window as any).kasware.inscribe(deployJson);
        return { success: true, txId: txId };
    } 
    throw new Error("Unsupported forge path.");
}