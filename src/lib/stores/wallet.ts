import { writable } from 'svelte/store';

// --- SVELTE REACTIVE STORES ---
export const isWalletConnected = writable(false);
export const walletAddress = writable<string | null>(null);
export const walletBalance = writable<string>("0"); 

// Helper to fetch and format the native Kaspa balance directly from the extension
async function updateBalance() {
    if (typeof window !== 'undefined' && (window as any).kasware) {
        try {
            const kasBalance = await (window as any).kasware.getBalance();
            if (kasBalance && kasBalance.total !== undefined) {
                // Convert Sompis to KAS (1 KAS = 100,000,000 Sompis)
                walletBalance.set((kasBalance.total / 100000000).toString());
            }
        } catch (e) {
            console.error("Failed to fetch balance from KasWare", e);
        }
    }
}

// --- NATIVE KASWARE INTERFACES ---
export async function connectWallet() {
    if (typeof window !== 'undefined') {
        const kasware = (window as any).kasware;
        
        if (!kasware) {
            alert("KasWare wallet is not installed. Please install the extension to connect to the Perennia ecosystem.");
            return;
        }

        try {
            // Directly request the Kaspa UTXO address
            const accounts = await kasware.requestAccounts();
            if (accounts && accounts.length > 0) {
                walletAddress.set(accounts[0]);
                isWalletConnected.set(true);
                await updateBalance();
            }
        } catch (error) {
            console.error("KasWare connection rejected or failed", error);
        }
    }
}

export async function disconnectWallet() {
    if (typeof window !== 'undefined' && (window as any).kasware) {
        try {
            if(typeof (window as any).kasware.disconnect === 'function') {
                await (window as any).kasware.disconnect();
            }
        } catch (e) {
            console.warn("KasWare disconnect error", e);
        }
    }
    // Wipe local state
    walletAddress.set(null);
    isWalletConnected.set(false);
    walletBalance.set("0");
}

export async function restoreSession() {
    if (typeof window !== 'undefined' && (window as any).kasware) {
        try {
            const accounts = await (window as any).kasware.getAccounts();
            if (accounts && accounts.length > 0) {
                walletAddress.set(accounts[0]);
                isWalletConnected.set(true);
                await updateBalance();
            }
        } catch (e) {
            // Fails silently; forces the user to manually click Connect
        }
    }
}

// --- KASWARE EVENT LISTENERS ---
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
        const kasware = (window as any).kasware;
        if (kasware) {
            kasware.on('accountsChanged', (accounts: Array<string>) => {
                if (accounts && accounts.length > 0) {
                    walletAddress.set(accounts[0]);
                    updateBalance();
                } else {
                    disconnectWallet();
                }
            });
            
            kasware.on('networkChanged', () => {
                updateBalance();
            });
        }
    });
}