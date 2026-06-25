import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { UniversalProvider } from '@walletconnect/universal-provider';
import { WalletConnectModal } from '@walletconnect/modal';

const WALLETCONNECT_PROJECT_ID = "59c7b54221d0bbe6a2730cf0125af10"; 

export const isWalletConnected = writable<boolean>(false);
export const walletAddress = writable<string | null>(null);
export const showWalletModal = writable<boolean>(false);
export const isConnecting = writable<boolean>(false);
export const walletMessage = writable<string | null>(null);

let cachedProvider: UniversalProvider | null = null;
let cachedModal: WalletConnectModal | null = null;

function notify(message: string) {
    walletMessage.set(message);
    setTimeout(() => walletMessage.set(null), 4000);
}

const yieldThread = () => new Promise(resolve => setTimeout(resolve, 50));

export function connectWallet() {
    walletMessage.set(null);
    showWalletModal.set(true);
}

export function disconnectWallet() {
    isWalletConnected.set(false);
    walletAddress.set(null);
    if (cachedProvider) {
        cachedProvider.disconnect().catch(() => {});
        if (browser && typeof localStorage !== 'undefined') localStorage.removeItem('wc@2:client:0.3//session');
    }
}

// 🟢 LIVE API CONNECTION: KasWare Browser Extension
export async function connectKasware() {
    if (!browser) return; // Fixes SSR Error
    isConnecting.set(true);
    walletMessage.set(null);
    await yieldThread();

    try {
        if (typeof window !== 'undefined' && (window as any).kasware) {
            const accounts = await (window as any).kasware.requestAccounts();
            if (accounts && accounts.length > 0) {
                walletAddress.set(accounts[0]);
                isWalletConnected.set(true);
                showWalletModal.set(false);
            }
        } else {
            notify('KasWare extension not detected.');
        }
    } catch (error) {
        console.error('KasWare API Error:', error);
        notify('KasWare connection failed.');
    } finally {
        isConnecting.set(false);
    }
}

export async function connectObserver(address: string) {
    if (!address || !address.startsWith('kaspa:')) {
        notify('Invalid format. Must begin with "kaspa:".');
        return;
    }
    
    isConnecting.set(true);
    walletMessage.set(null);
    await yieldThread();

    setTimeout(() => {
        walletAddress.set(address.trim());
        isWalletConnected.set(true);
        isConnecting.set(false);
        showWalletModal.set(false);
    }, 800);
}

// 🟢 LIVE API CONNECTION: WalletConnect V2 (Kaspium, Tangem)
export async function connectWalletConnect() {
    if (!browser) return; // Fixes SSR Error
    isConnecting.set(true);
    walletMessage.set(null);
    await yieldThread();

    const failsafe = setTimeout(() => {
        if (get(isConnecting)) {
            isConnecting.set(false);
            notify("Network Congested. Please try again.");
        }
    }, 15000);

    try {
        if (!cachedProvider) {
            cachedProvider = await UniversalProvider.init({
                projectId: WALLETCONNECT_PROJECT_ID,
                metadata: {
                    name: "Perennia",
                    description: "Web3 Asset Tokenization & Yield Routing",
                    url: window.location.origin,
                    icons: [`${window.location.origin}/favicon.ico`]
                }
            });

            cachedModal = new WalletConnectModal({ 
                projectId: WALLETCONNECT_PROJECT_ID,
                themeMode: "dark",
                themeVariables: {
                    "--wcm-font-family": "ui-sans-serif, system-ui, -apple-system, sans-serif",
                    "--wcm-accent-color": "#14b8a6",
                    "--wcm-z-index": "99999"
                }
            });

            cachedProvider.on("display_uri", (uri: string) => {
                clearTimeout(failsafe);
                isConnecting.set(false); 
                showWalletModal.set(false); // Hides UI so QR takes over
                cachedModal?.openModal({ uri });
            });
        }

        if (cachedProvider.session) {
            clearTimeout(failsafe);
            isConnecting.set(false);
            const fullAddress = cachedProvider.session.namespaces.kaspa?.accounts[0];
            if (fullAddress) {
                walletAddress.set(fullAddress.split(':').slice(-2).join(':'));
                isWalletConnected.set(true);
                showWalletModal.set(false);
            }
            return;
        }

        await cachedProvider.connect({
            namespaces: {
                kaspa: {
                    methods: ["kaspa_signMessage", "kaspa_signTransaction"],
                    chains: ["kaspa:mainnet"],
                    events: ["accountsChanged"]
                }
            }
        });

        clearTimeout(failsafe);
        isConnecting.set(false);

        const session = cachedProvider.session;
        if (session && session.namespaces.kaspa && session.namespaces.kaspa.accounts.length > 0) {
            const fullAddress = session.namespaces.kaspa.accounts[0];
            const address = fullAddress.split(':').slice(-2).join(':'); 
            walletAddress.set(address);
            isWalletConnected.set(true);
            showWalletModal.set(false);
        }
        cachedModal?.closeModal();

    } catch (error: any) {
        clearTimeout(failsafe);
        isConnecting.set(false);
        console.error("WalletConnect Error:", error);
        cachedProvider = null;
        if (browser && typeof localStorage !== 'undefined') localStorage.removeItem('wc@2:client:0.3//session');
        if (error.message && !error.message.includes('User rejected')) {
            notify("WalletConnect bridge closed or failed.");
        }
    }
}

export function connectPendingProvider(providerName: string) {
    notify(`[PROTOCOL LOCK] ${providerName} is locked.`);
}