import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { walletAddress } from '$lib/stores/wallet';

// ========================================================
// 🧠 PERENNIA CENTRAL STATE STORE
// ========================================================

export type SystemMode = 'base' | 'overclocked';
export type AssetClass = 'Native L1' | 'Stablecoin' | 'Tokenized Asset' | 'DeFi' | 'Ecosystem';
export type RouteMode = 'hold' | 'swap' | 'auto-lp';

export interface ThemeColors {
    hex: string;
    pastel: string;
}

export interface TokenAsset {
    ticker: string;
    name: string;
    assetClass: AssetClass;
    priceUsd: number;
    imgUrl?: string; 
    icon?: string;
    theme: ThemeColors;
}

export interface SettlementConfig {
    targetAsset: TokenAsset;
    payoutAddress: string;
    autoPayout: boolean;
    mode: 'stream' | 'threshold' | 'appointment';
    threshold: number;
    streamMode: 'realtime' | 'interval';
    streamValue: number;
    streamUnit: string;
    appointmentDate: string;
    appointmentTime: string;
}

export interface Sector {
    id: string;
    name: string;
    allocationPercentage: number; // 0-100
    routeMode: RouteMode;
    settlementConfig: SettlementConfig;
}

export interface Worker {
    id: string;
    type: 'physical';
    name: string;
    stratumUrl: string;
    walletWorker: string;
    hashRate: number;
    isOnline: boolean;
    ipAddress?: string;
    hardwareType?: string;
    sharesContributed?: number;
    blocksFound?: number;
}

export interface WalletInventoryItem {
    asset: TokenAsset;
    balance: number;
    usdValue: number;
}

export const hasEntered = writable<boolean>(false);
export const activeTab = writable<string>('DEX');
export const systemMode = writable<SystemMode>('base');

// ⚡ ZERO-TRUST INVITE REGISTRY
export const activeInviteCode = writable<string>('');

// ⚡ TARGETED ADMIN IMPERSONATION
export const adminModeActive = writable<boolean>(false);
export const adminTargetWallet = writable<string>('');

export const globalKasPrice = writable<number>(0.16);
export const globalKasChange = writable<number>(0);
export const globalNetworkHashrate = writable<number>(0);
export const globalNodeStatus = writable<string>('offline');

export const globalStats = writable<any>({
    totalTreasuryValue: 0,
    totalMined: 0,
    activeWorkers: 0,
    networkHealth: 100
});

export const ClassThemes: Record<AssetClass, ThemeColors> = {
    'Native L1': { hex: '#18C6A5', pastel: '#99f6e4' },        // Teal
    'Stablecoin': { hex: '#3B82F6', pastel: '#bfdbfe' },       // Blue
    'Tokenized Asset': { hex: '#F59E0B', pastel: '#fef08a' },  // Amber
    'DeFi': { hex: '#A855F7', pastel: '#d8b4fe' },             // Purple
    'Ecosystem': { hex: '#EC4899', pastel: '#fbcfe8' }         // Pink
};

export const coreTokenRegistry: TokenAsset[] = [
    { ticker: 'KAS', name: 'Kaspa', assetClass: 'Native L1', priceUsd: 0.16, imgUrl: '/assets/tokens/kas.svg', theme: ClassThemes['Native L1'] },
    { ticker: 'BTC', name: 'Bitcoin', assetClass: 'Native L1', priceUsd: 65000, imgUrl: '/assets/tokens/btc.svg', theme: { hex: '#F7931A', pastel: '#fcd34d' } },
    { ticker: 'ETH', name: 'Ethereum', assetClass: 'Native L1', priceUsd: 3500, imgUrl: '/assets/tokens/eth.svg', theme: { hex: '#627EEA', pastel: '#c7d2fe' } },
    { ticker: 'SOL', name: 'Solana', assetClass: 'Native L1', priceUsd: 150, imgUrl: '/assets/tokens/sol.svg', theme: { hex: '#14F195', pastel: '#a7f3d0' } },
    { ticker: 'DOGE', name: 'Dogecoin', assetClass: 'Native L1', priceUsd: 0.10, imgUrl: 'https://cryptologos.cc/logos/dogecoin-doge-logo.svg?v=033', theme: { hex: '#C2A633', pastel: '#fde047' } },
    { ticker: 'XRP', name: 'XRP Ledger', assetClass: 'Native L1', priceUsd: 0.58, imgUrl: 'https://cryptologos.cc/logos/xrp-xrp-logo.svg?v=033', theme: { hex: '#23292F', pastel: '#94a3b8' } },
    { ticker: 'POL', name: 'Polygon', assetClass: 'Native L1', priceUsd: 0.42, imgUrl: 'https://cryptologos.cc/logos/polygon-matic-logo.svg?v=033', theme: { hex: '#8247E5', pastel: '#d8b4fe' } },
    { ticker: 'AVAX', name: 'Avalanche', assetClass: 'Native L1', priceUsd: 22.50, imgUrl: 'https://cryptologos.cc/logos/avalanche-avax-logo.svg?v=033', theme: { hex: '#E84142', pastel: '#fca5a5' } },
    { ticker: 'SUI', name: 'Sui Network', assetClass: 'Native L1', priceUsd: 0.95, imgUrl: 'https://cryptologos.cc/logos/sui-sui-logo.svg?v=033', theme: { hex: '#4CA2FF', pastel: '#bfdbfe' } },
    { ticker: 'TRX', name: 'TRON', assetClass: 'Native L1', priceUsd: 0.15, imgUrl: 'https://cryptologos.cc/logos/tron-trx-logo.svg?v=033', theme: { hex: '#FF0013', pastel: '#fca5a5' } },
    { ticker: 'ZEC', name: 'Zcash', assetClass: 'Native L1', priceUsd: 31.20, imgUrl: 'https://cryptologos.cc/logos/zcash-zec-logo.svg?v=033', theme: { hex: '#F4B728', pastel: '#fde047' } },
    { ticker: 'USDC', name: 'USD Coin', assetClass: 'Stablecoin', priceUsd: 1.00, imgUrl: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg?v=032', theme: ClassThemes['Stablecoin'] },
    { ticker: 'USDT', name: 'Tether USD', assetClass: 'Stablecoin', priceUsd: 1.00, imgUrl: 'https://cryptologos.cc/logos/tether-usdt-logo.svg?v=032', theme: ClassThemes['Stablecoin'] },
];

export const workers = writable<Worker[]>([]);
export const sectors = writable<Sector[]>([]);
export const walletInventory = writable<WalletInventoryItem[]>([]);
export const taxEvents = writable<any[]>([]);

let actionQueue: Promise<any> = Promise.resolve();

export async function dispatchStateAction(action: string, payload: any, targetWallet?: string) {
    const execute = async () => {
        try {
            const res = await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, payload, targetWallet })
            });
            return res.ok;
        } catch (e) {
            console.error("Matrix action dispatch failed:", e);
            return false;
        }
    };

    actionQueue = actionQueue.then(execute).catch(execute);
    return actionQueue;
}

// ========================================================
// 🔐 MULTI-TENANT STORAGE ISOLATION 
// ========================================================

export function getScopedKey(baseKey: string, wallet: string | null): string {
    if (!wallet) return `${baseKey}_unauthed`;
    const cleanWallet = wallet.replace('kaspa:', '').toLowerCase().trim();
    return `${baseKey}_${cleanWallet}`;
}

function loadScopedState<T>(baseKey: string, fallback: T): T {
    if (!browser) return fallback;
    const activeWallet = get(walletAddress);
    if (!activeWallet) return fallback;
    
    try {
        const raw = localStorage.getItem(getScopedKey(baseKey, activeWallet));
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function saveScopedState<T>(baseKey: string, data: T) {
    if (!browser) return;
    const activeWallet = get(walletAddress);
    if (!activeWallet) return;
    try {
        localStorage.setItem(getScopedKey(baseKey, activeWallet), JSON.stringify(data));
    } catch (e) {
        console.error(`Failed to save scoped state for ${baseKey}:`, e);
    }
}

// Rehydrate and synchronize stores on wallet changes
if (browser) {
    walletAddress.subscribe((addr) => {
        if (addr) {
            sectors.set(loadScopedState<Sector[]>('perennia_sectors', []));
            workers.set(loadScopedState<Worker[]>('perennia_workers', []));
        } else {
            sectors.set([]);
            workers.set([]);
        }
    });

    sectors.subscribe((val) => saveScopedState('perennia_sectors', val));
    workers.subscribe((val) => saveScopedState('perennia_workers', val));

    // Multi-tab storage listener with strict origin and wallet matching
    window.addEventListener('storage', (e) => {
        const currentWallet = get(walletAddress);
        if (!currentWallet || !e.key) return;

        if (e.key === getScopedKey('perennia_sectors', currentWallet)) {
            try {
                sectors.set(e.newValue ? JSON.parse(e.newValue) : []);
            } catch {}
        }
        if (e.key === getScopedKey('perennia_workers', currentWallet)) {
            try {
                workers.set(e.newValue ? JSON.parse(e.newValue) : []);
            } catch {}
        }
    });
}