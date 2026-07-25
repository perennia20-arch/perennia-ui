import { writable, get } from 'svelte/store';
import { UniversalProvider } from '@walletconnect/universal-provider';
import { WalletConnectModal } from '@walletconnect/modal';
import { ethers } from 'ethers';
import * as bitcoin from 'bitcoinjs-lib';
import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@solana/web3.js';
import { Buffer } from 'buffer';

// @ts-ignore - Svelte 5 Runes require the .svelte.ts extension; TS throws a false positive here.
import { executeSovereignTransaction, txState } from './transaction.svelte.ts';

// Polyfill Buffer globally for browser/Vite environments
if (typeof window !== 'undefined') {
    (window as any).Buffer = (window as any).Buffer || Buffer;
}

// --- UI & RECTIFICATION STORES ---
export const showWalletModal = writable<boolean>(false);
export const isConnecting = writable<boolean>(false);
export const walletMessage = writable<string>('');

// --- JIT DECRYPTION STORES ---
export const isVaultUnlockPending = writable<boolean>(false);
export const pendingTransactionDetails = writable<{
    payAsset: string;
    receiveAsset: string;
    payAmount: string;
    destinationAddress: string;
    amountSompi: number;
} | null>(null);

// --- REACTIVE CORE STORES ---
export const isWalletConnected = writable<boolean>(false);
export const walletAddress = writable<string | null>(null);
export const walletBalance = writable<string>("0"); 
export const activeWalletType = writable<'kasware' | 'walletconnect' | 'sovereign' | null>(null);
export const sovereignKeys = writable<any>(null);
export const networkStatus = writable<'syncing' | 'connected' | 'offline'>('offline');

// ALIGNMENT PATCH: User's Validated Kaspa Receive Address
const TREASURY_ADDRESSES = {
    KAS: "kaspa:qz2sehqzx8xetzkhz2ycqflwf8dhusyxhj0myv4ez72k0n6vdaj827jexnyzz", 
    ETH: "0xPerenniaTreasuryEVM",   
    SOL: "PerenniaSolanaTreasury",  
    BTC: "bc1qperenniatreasury"     
};

// ============================================================================
// ADDRESS NORMALIZATION UTILITY
// ============================================================================
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

// ============================================================================
// ZERO-DEPENDENCY KASPA ADDRESS ENCODER (CASHADDR + 40-BIT POLYMOD)
// ============================================================================
function getKaspaAddress(pubKeyHex: string): string {
    const prefix = "kaspa";
    let polymodData = [];
    for (let i = 0; i < prefix.length; i++) {
        polymodData.push(prefix.charCodeAt(i) & 31);
    }
    polymodData.push(0);

    let payload = [0]; 
    for (let i = 0; i < pubKeyHex.length; i += 2) {
        payload.push(parseInt(pubKeyHex.substring(i, i + 2), 16));
    }

    let acc = 0;
    let bits = 0;
    let payload5 = [];
    for (let value of payload) {
        acc = (acc << 8) | value;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            payload5.push((acc >> bits) & 31);
        }
    }
    if (bits > 0) {
        payload5.push((acc << (5 - bits)) & 31);
    }

    polymodData = polymodData.concat(payload5).concat([0, 0, 0, 0, 0, 0, 0, 0]);

    let c = 1n;
    for (let d of polymodData) {
        let c0 = c >> 35n;
        c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(d);
        if (c0 & 1n) c ^= 0x98f2bc8e61n;
        if (c0 & 2n) c ^= 0x79b76d99e2n;
        if (c0 & 4n) c ^= 0xf33e5fb3c4n;
        if (c0 & 8n) c ^= 0xae2eabe2a8n;
        if (c0 & 16n) c ^= 0x1e4f43e470n;
    }
    let checksum = c ^ 1n;

    const charset = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    let address = prefix + ":";
    for (let i = 0; i < payload5.length; i++) {
        address += charset[payload5[i]];
    }
    for (let i = 0; i < 8; i++) {
        address += charset[Number((checksum >> BigInt(5 * (7 - i))) & 31n)];
    }
    return address;
}

// ============================================================================
// WEB CRYPTO VAULT ENCRYPTION
// ============================================================================
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

// ============================================================================
// SOVEREIGN HONEYCOMB GENERATION
// ============================================================================
export async function generateSovereignHoneycomb(password: string) {
    isConnecting.set(true);
    walletMessage.set('Forging Sovereign Matrix (24-word Entropy)...');
    
    try {
        const randomEntropy = window.crypto.getRandomValues(new Uint8Array(32));
        const mnemonicObj = ethers.Mnemonic.fromEntropy(randomEntropy);
        const mnemonic = mnemonicObj.phrase;
        
        walletMessage.set('Deriving Omni-Chain Matrix...');
        
        // ⚡ Ethers v6 Root Node Derivation Fix: Instantiate at Absolute Root (Depth 0)
        const seed = mnemonicObj.computeSeed();
        const rootNode = ethers.HDNodeWallet.fromSeed(seed);

        // KASPA
        const kaspaNode = rootNode.derivePath("m/44'/111111'/0'/0/0");
        const kaspaXCoordinate = kaspaNode.publicKey.substring(4);
        const kasAddress = normalizeKaspaAddress(getKaspaAddress(kaspaXCoordinate))!;

        // ETHEREUM
        const ethNode = rootNode.derivePath("m/44'/60'/0'/0/0");
        const ethAddress = ethNode.address;

        // BITCOIN
        const btcNode = rootNode.derivePath("m/84'/0'/0'/0/0");
        const btcPubkeyBuffer = Buffer.from(btcNode.publicKey.substring(2), 'hex');
        const { address: btcAddress } = bitcoin.payments.p2wpkh({ pubkey: btcPubkeyBuffer });

        // SOLANA
        const seedHex = mnemonicObj.computeSeed().substring(2); 
        const solDerived = derivePath("m/44'/501'/0'/0'", seedHex);
        const solKeypair = Keypair.fromSeed(solDerived.key);
        const solAddress = solKeypair.publicKey.toBase58();

        walletMessage.set('Encrypting Ephemeral Vault...');
        const encryptedVault = await encryptVault(password, mnemonic);

        const vaultPayload = {
            wallets: {
                kaspa: { address: kasAddress, path: "m/44'/111111'/0'/0/0" },
                bitcoin: { address: btcAddress, path: "m/84'/0'/0'/0/0" },
                ethereum: { address: ethAddress, path: "m/44'/60'/0'/0/0" },
                solana: { address: solAddress, path: "m/44'/501'/0'/0'" }
            },
            vault: encryptedVault
        };

        return { 
            success: true, 
            payload: vaultPayload, 
            mnemonic,
            addresses: {
                kaspa: kasAddress,
                bitcoin: btcAddress,
                ethereum: ethAddress,
                solana: solAddress
            }
        };

    } catch (e) {
        console.error("[Perennia Core] Matrix Forge Failed:", e);
        walletMessage.set('Sovereign Generation Failed.');
        disconnectWallet();
        throw e;
    } finally {
        isConnecting.set(false);
    }
}

// ============================================================================
// SOVEREIGN UNLOCK HANDLER
// ============================================================================
export async function unlockSovereignVault(password: string) {
    isConnecting.set(true);
    walletMessage.set('Decrypting Vault...');
    try {
        const rawPayload = sessionStorage.getItem('perennia_sovereign_payload');
        if (!rawPayload) throw new Error("No vault found in session.");
        
        const vaultPayload = JSON.parse(rawPayload);
        await decryptVault(password, vaultPayload.vault);
        
        walletMessage.set('Hydrating Omni-Chain Balances...');
        authorizeSovereignVault(vaultPayload);
        
        return { success: true };
    } catch (e) {
        console.error("Decryption failed:", e);
        // We will catch this in the UI logic now to turn it explicitly red
        walletMessage.set('');
        return { success: false };
    } finally {
        isConnecting.set(false);
    }
}

// ============================================================================
// JUST-IN-TIME (JIT) DECRYPTION HANDLER
// ============================================================================
export async function confirmSovereignTransaction(password: string, destinationAddress: string, amountSompi: number) {
    let privateKey = "";
    isConnecting.set(true);
    walletMessage.set('Authorizing Transaction...');
    
    try {
        const rawPayload = sessionStorage.getItem('perennia_sovereign_payload');
        if (!rawPayload) throw new Error("No vault found in session.");
        
        const vaultPayload = JSON.parse(rawPayload);
        const mnemonic = await decryptVault(password, vaultPayload.vault);
        
        walletMessage.set('Signing Transaction...');
        const mnemonicObj = ethers.Mnemonic.fromPhrase(mnemonic);
        
        // ⚡ Ethers v6 Root Node Derivation Fix
        const seed = mnemonicObj.computeSeed();
        const rootNode = ethers.HDNodeWallet.fromSeed(seed);
        
        const kaspaNode = rootNode.derivePath(vaultPayload.wallets.kaspa.path);
        privateKey = kaspaNode.privateKey;
        if (privateKey.startsWith('0x')) {
            privateKey = privateKey.substring(2);
        }
        
        // 1. Inject Private Key strictly into the Svelte 5 Rune State (Zero-Trust execution proxy)
        txState.decryptedPrivateKeyHex = privateKey;
        
        // 2. Denomination Fix: Convert Sompi back to raw KAS before triggering the engine 
        const amountKas = amountSompi / 100000000;
        
        walletMessage.set('Broadcasting Sovereign Transaction...');
        const txId = await executeSovereignTransaction(destinationAddress, amountKas);
        
        isVaultUnlockPending.set(false);
        pendingTransactionDetails.set(null);
        walletMessage.set('');
        
        return { success: true, txId };
    } catch (e) {
        console.error("[Perennia Core] JIT Execution Failed:", e);
        walletMessage.set('TRANSACTION FAILED.');
        throw e;
    } finally {
        // Zero-Trust Mandate: Scrub the key from local and global Svelte memory scopes immediately
        privateKey = "0".repeat(64);
        txState.decryptedPrivateKeyHex = ""; 
        isConnecting.set(false);
    }
}

// ============================================================================
// EXTENSION POLLING
// ============================================================================
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

// ============================================================================
// UNIFIED BALANCE & NETWORK HYDRATION
// ============================================================================
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
            } else if (type === 'walletconnect') {
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

// ============================================================================
// CONNECTION HANDLERS WITH ATOMIC STORE SYNCHRONIZATION
// ============================================================================
export async function connectKasware() {
    isConnecting.set(true);
    walletMessage.set('Requesting KasWare signature...');
    try {
        const kasware = await getKaswareWithRetry(10, 100);
        if (kasware) {
            const accounts = await kasware.requestAccounts();
            if (accounts && accounts.length > 0) {
                // Atomic address update BEFORE setting connection state
                const formattedAddress = normalizeKaspaAddress(accounts[0]);
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
    } catch (error) {
        walletMessage.set('Connection aborted.');
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
            walletAddress.set(address);
            activeWalletType.set('walletconnect');
            
            if (typeof window !== 'undefined') {
                sessionStorage.setItem('perennia_active_wallet_type', 'walletconnect');
            }
            
            await updateBalance(15, 200);
            isWalletConnected.set(true);
            showWalletModal.set(false);
        }
    } catch (e) {
        walletMessage.set('WalletConnect aborted.');
        disconnectWallet();
    } finally {
        isConnecting.set(false);
    }
}

export function authorizeSovereignVault(vaultPayload: any) {
    sovereignKeys.set(vaultPayload.wallets);
    
    // Explicit address normalization before raising connection flag
    const formattedAddress = normalizeKaspaAddress(vaultPayload.wallets.kaspa.address);
    walletAddress.set(formattedAddress); 
    activeWalletType.set('sovereign');
    
    if (typeof window !== 'undefined') {
        sessionStorage.setItem('perennia_active_wallet_type', 'sovereign');
        sessionStorage.setItem('perennia_sovereign_payload', JSON.stringify(vaultPayload));
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
    
    walletAddress.set(null);
    isWalletConnected.set(false);
    activeWalletType.set(null);
    walletBalance.set("0");
    networkStatus.set('offline');
    sovereignKeys.set(null); 
    isVaultUnlockPending.set(false);
    pendingTransactionDetails.set(null);
    txState.decryptedPrivateKeyHex = ""; // Zero-trust state wipe upon disconnect
    
    if (typeof window !== 'undefined') {
        sessionStorage.removeItem('perennia_active_wallet_type');
        sessionStorage.removeItem('perennia_sovereign_payload');
    }
}

export async function restoreSession() {
    if (typeof window === 'undefined') return;
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
            const rawPayload = sessionStorage.getItem('perennia_sovereign_payload');
            if (rawPayload) {
                const vaultPayload = JSON.parse(rawPayload);
                sovereignKeys.set(vaultPayload.wallets);
                walletAddress.set(normalizeKaspaAddress(vaultPayload.wallets.kaspa.address)); 
                activeWalletType.set('sovereign');
                
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
}

// ============================================================================
// OMNI-CHAIN ROUTING EXPORTS
// ============================================================================
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