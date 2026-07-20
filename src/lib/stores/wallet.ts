import { writable, get } from 'svelte/store';
import { UniversalProvider } from '@walletconnect/universal-provider';
import { WalletConnectModal } from '@walletconnect/modal';

// --- UI STATE ---
export const showWalletModal = writable(false);
export const isConnecting = writable(false);
export const walletMessage = writable('');

// --- SVELTE REACTIVE STORES ---
export const isWalletConnected = writable(false);
export const walletAddress = writable<string | null>(null);
export const walletBalance = writable<string>("0"); 
export const activeWalletType = writable<'kasware' | 'walletconnect' | 'sovereign' | null>(null);
export const sovereignKeys = writable<any>(null);

const BACKEND_BASE = 'http://192.168.0.12:5000';

const TREASURY_ADDRESSES = {
    KAS: "kaspa:qperenniatreasury", 
    ETH: "0xPerenniaTreasuryEVM",   
    SOL: "PerenniaSolanaTreasury",  
    BTC: "bc1qperenniatreasury"     
};

// ============================================================================
// HELPER: RESILIENT EXTENSION POLLING
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

// ⚡ FIX 1: BACKGROUND EVENT LISTENERS
// This keeps the UI perfectly in sync if the user changes accounts inside the extension
function setupKaswareListeners(kasware: any) {
    kasware.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length > 0) {
            walletAddress.set(accounts[0]);
            updateBalance();
        } else {
            disconnectWallet();
        }
    });
}

// ============================================================================
// UNIVERSAL BALANCE UPDATER
// ============================================================================
export async function updateBalance() {
    const type = get(activeWalletType);
    const address = get(walletAddress);
    if (!address) return;

    try {
        const kasware = await getKaswareWithRetry(5, 100);
        if (type === 'kasware' && kasware) {
            const kasBalance = await kasware.getBalance();
            if (kasBalance && kasBalance.total !== undefined) {
                walletBalance.set((kasBalance.total / 100000000).toString());
            }
        } else if (type === 'sovereign') {
            const res = await fetch(`${BACKEND_BASE}/api/treasury/balance/${address}`);
            if (res.ok) {
                const data = await res.json();
                walletBalance.set(data.balance.toString());
            }
        }
    } catch (e) {
        console.error(`Failed to fetch balance for ${type}`, e);
    }
}

// ============================================================================
// CONNECTION HANDLERS
// ============================================================================
export async function connectKasware() {
    isConnecting.set(true);
    walletMessage.set('Requesting KasWare signature...');
    try {
        const kasware = await getKaswareWithRetry(10, 100);
        if (kasware) {
            const accounts = await kasware.requestAccounts();
            if (accounts && accounts.length > 0) {
                walletAddress.set(accounts[0]);
                activeWalletType.set('kasware');
                isWalletConnected.set(true);
                showWalletModal.set(false);
                
                if (typeof window !== 'undefined') {
                    localStorage.setItem('perennia_active_wallet_type', 'kasware');
                }
                
                // ⚡ FIX 2: Bind the background listeners
                setupKaswareListeners(kasware);
                
                // ⚡ FIX 3: THE 500ms RPC BUFFER
                // Forces Svelte to wait for KasWare's internal engine to catch up before fetching the balance
                await new Promise(resolve => setTimeout(resolve, 500));
                
                await updateBalance();
            }
        } else {
            walletMessage.set('KasWare extension not found.');
        }
    } catch (error) {
        walletMessage.set('Connection aborted.');
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
            isWalletConnected.set(true);
            showWalletModal.set(false);
            
            if (typeof window !== 'undefined') {
                localStorage.setItem('perennia_active_wallet_type', 'walletconnect');
            }
            
            await updateBalance();
        }
    } catch (e) {
        walletMessage.set('WalletConnect aborted.');
    } finally {
        isConnecting.set(false);
    }
}

export function authorizeSovereignVault(vaultPayload: any) {
    sovereignKeys.set(vaultPayload.wallets);
    walletAddress.set(vaultPayload.wallets.kaspa.address); 
    activeWalletType.set('sovereign');
    isWalletConnected.set(true);
    
    if (typeof window !== 'undefined') {
        localStorage.setItem('perennia_active_wallet_type', 'sovereign');
        localStorage.setItem('perennia_sovereign_payload', JSON.stringify(vaultPayload));
    }
    
    updateBalance();
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
    sovereignKeys.set(null); 
    
    if (typeof window !== 'undefined') {
        localStorage.removeItem('perennia_active_wallet_type');
        localStorage.removeItem('perennia_sovereign_payload');
    }
}

export async function restoreSession() {
    if (typeof window === 'undefined') return;
    
    const savedType = localStorage.getItem('perennia_active_wallet_type');
    if (!savedType) return;

    try {
        if (savedType === 'kasware') {
            const kasware = await getKaswareWithRetry(10, 100);
            if (kasware) {
                const accounts = await kasware.getAccounts();
                if (accounts && accounts.length > 0) {
                    walletAddress.set(accounts[0]);
                    activeWalletType.set('kasware');
                    isWalletConnected.set(true);
                    
                    // ⚡ FIX: Bind listeners on auto-restore as well
                    setupKaswareListeners(kasware);
                    
                    await updateBalance();
                }
            }
        } else if (savedType === 'sovereign') {
            const rawPayload = localStorage.getItem('perennia_sovereign_payload');
            if (rawPayload) {
                const vaultPayload = JSON.parse(rawPayload);
                sovereignKeys.set(vaultPayload.wallets);
                walletAddress.set(vaultPayload.wallets.kaspa.address); 
                activeWalletType.set('sovereign');
                isWalletConnected.set(true);
                await updateBalance();
            }
        }
    } catch (e) {
        console.error("Failed to automatically restore session:", e);
    }
}

export async function connectObserver() {
    walletMessage.set('Observer mode initializing...');
}

// ============================================================================
// OMNI-CHAIN ROUTING EXPORTS (Safe for frontend)
// ============================================================================
export async function executeOmniChainSwap(payAsset: string, receiveAsset: string, payAmount: string) {
    const type = get(activeWalletType);
    if (payAsset === 'KAS' && type === 'kasware') {
        const amountSompi = Math.floor(parseFloat(payAmount) * 100000000);
        const txId = await (window as any).kasware.sendKaspa(TREASURY_ADDRESSES.KAS, amountSompi);
        return { success: true, txId: txId };
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