// src/lib/stores/identity.svelte.ts
import { browser } from '$app/environment';
import { ui } from '$lib/stores/ui.svelte';
import { operations } from '$lib/stores/operations.svelte';

import { UniversalProvider } from '@walletconnect/universal-provider';
import { WalletConnectModal } from '@walletconnect/modal';
import { ethers } from 'ethers';
import { blake2b } from '@noble/hashes/blake2.js';
import { schnorr } from '@noble/curves/secp256k1.js';
import { deriveHoneycombKeys } from '$lib/crypto/honeycomb';

const MASTER_ADMIN_ADDRESS = "kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579";
const DEV_ADMIN_BYPASS = false;
const WALLETCONNECT_PROJECT_ID = '3a6699d793be81a5a0bd7a810f54546d'; 

class IdentityStore {
    isWalletConnected = $state(false);
    activeAddress = $state<string | null>(null);
    activeWalletType = $state<'kasware' | 'walletconnect' | 'sovereign' | 'observer' | null>(null);
    sovereignKeys = $state<any>(null);
    
    isConnecting = $state(false);
    walletMessage = $state('');

    isVaultUnlockPending = $state(false);
    pendingTransactionDetails = $state<any>(null);
    activeInviteCode = $state('');

    get isCorporateAdmin() {
        return DEV_ADMIN_BYPASS || (this.activeAddress && this.activeAddress.toLowerCase() === MASTER_ADMIN_ADDRESS.toLowerCase());
    }

    normalizeKaspaAddress(addr: string | null | undefined): string | null {
        if (!addr) return null;
        const clean = addr.trim().toLowerCase();
        if (clean.startsWith('kaspa:')) return clean;
        return `kaspa:${clean}`;
    }

    hexToBytes(hex: string): Uint8Array {
        if (hex.length % 2 !== 0) throw new Error("ERR_INVALID_HEX_LENGTH");
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        }
        return bytes;
    }

    bytesToHex(bytes: Uint8Array): string {
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async connectKasware() {
        this.isConnecting = true;
        this.walletMessage = 'Requesting KasWare connection...';
        try {
            const kasware = (window as any).kasware;
            if (kasware) {
                const accounts = await kasware.requestAccounts();
                if (accounts && accounts.length > 0) {
                    const formattedAddress = this.normalizeKaspaAddress(accounts[0]) as string;
                    
                    this.walletMessage = 'Requesting cryptographic handshake...';
                    const challengeRes = await fetch('/api/auth/challenge', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ address: formattedAddress })
                    });
                    
                    if (!challengeRes.ok) throw new Error("Failed to secure connection challenge.");
                    const { message } = await challengeRes.json();
                    
                    this.walletMessage = 'Awaiting KasWare signature...';
                    const signatureObj = await kasware.signMessage(message);
                    const signature = typeof signatureObj === 'string' ? signatureObj : signatureObj.signature;

                    this.walletMessage = 'Verifying identity matrix...';
                    const authBody: Record<string, any> = { 
                        address: formattedAddress, 
                        signature, 
                        message, 
                        provider: 'kasware'
                    };
                    if (this.activeInviteCode) authBody.inviteCode = this.activeInviteCode;

                    const authRes = await fetch('/api/auth', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(authBody)
                    });

                    if (!authRes.ok) throw new Error("Backend verification rejected the signature.");

                    this.activeAddress = formattedAddress;
                    this.activeWalletType = 'kasware';
                    if (browser) sessionStorage.setItem('perennia_active_wallet_type', 'kasware');
                    
                    this.isWalletConnected = true;
                    ui.showWalletModal = false;
                }
            } else {
                this.walletMessage = 'KasWare extension not found.';
            }
        } catch (error: any) {
            console.error("KasWare Connect Error:", error);
            this.walletMessage = error.message || 'Connection aborted.';
            this.disconnect();
        } finally {
            this.isConnecting = false;
        }
    }

    async connectWalletConnect() {
        this.isConnecting = true;
        this.walletMessage = 'Initializing WalletConnect Protocol...';
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
                
                this.walletMessage = 'Requesting cryptographic handshake...';
                const challengeRes = await fetch('/api/auth/challenge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ address })
                });
                if (!challengeRes.ok) throw new Error("Failed to secure connection challenge.");
                const { message } = await challengeRes.json();

                this.walletMessage = 'Awaiting WalletConnect signature...';
                const signature = await provider.request({
                    method: "personal_sign",
                    params: [ethers.hexlify(ethers.toUtf8Bytes(message)), address]
                }, "eip155:1");

                this.walletMessage = 'Verifying identity matrix...';
                const authBody: Record<string, any> = { 
                    address, 
                    signature, 
                    message, 
                    provider: 'walletconnect'
                };
                if (this.activeInviteCode) authBody.inviteCode = this.activeInviteCode;

                const authRes = await fetch('/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(authBody)
                });

                if (!authRes.ok) {
                    const errData = await authRes.json();
                    throw new Error(errData.error || "Backend verification rejected the signature.");
                }

                this.activeAddress = address;
                this.activeWalletType = 'walletconnect';
                
                if (browser) {
                    sessionStorage.setItem('perennia_active_wallet_type', 'walletconnect');
                }
                
                this.isWalletConnected = true;
                ui.showWalletModal = false;
            }
        } catch (e: any) {
            this.walletMessage = e.message || 'WalletConnect aborted.';
            this.disconnect();
        } finally {
            this.isConnecting = false;
        }
    }

    async connectObserver() {
        this.isConnecting = true;
        this.walletMessage = 'Observer mode initializing...';
        
        const address = prompt("Enter Kaspa Address to Observe:");
        if (!address) {
            this.walletMessage = 'Observer mode aborted.';
            this.isConnecting = false;
            return;
        }
        
        const formattedAddress = this.normalizeKaspaAddress(address) as string;
        
        const authRes = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: formattedAddress, provider: 'observer' })
        });

        if (authRes.ok) {
            this.activeAddress = formattedAddress;
            this.activeWalletType = 'observer';
            if (browser) {
                sessionStorage.setItem('perennia_active_wallet_type', 'observer');
            }
            this.isWalletConnected = true;
            ui.showWalletModal = false;
        } else {
            this.walletMessage = 'Observer connection rejected.';
        }
        this.isConnecting = false;
    }

    authorizeSovereignVault(vaultPayload: any) {
        this.sovereignKeys = vaultPayload.wallets;
        this.activeAddress = this.normalizeKaspaAddress(vaultPayload.wallets.kaspa.address);
        this.activeWalletType = 'sovereign';
        
        if (browser) {
            sessionStorage.setItem('perennia_active_wallet_type', 'sovereign');
            localStorage.setItem('perennia_sovereign_payload', JSON.stringify(vaultPayload));
        }
        
        this.isWalletConnected = true;
    }

    disconnect() {
        if (this.activeWalletType === 'kasware') {
            try {
                const target = (window as any).kasware;
                if (target && typeof target.disconnect === 'function') target.disconnect();
            } catch (e) {}
        }
        
        fetch('/api/auth', { method: 'DELETE' }).catch(() => {});
        
        this.activeAddress = null;
        this.isWalletConnected = false;
        this.activeWalletType = null;
        this.sovereignKeys = null; 
        this.isVaultUnlockPending = false;
        this.pendingTransactionDetails = null;
        this.activeInviteCode = '';
        
        operations.purge();

        if (browser) {
            sessionStorage.removeItem('perennia_active_wallet_type');
        }
    }
}

export const identity = new IdentityStore();