import { writable } from 'svelte/store';

// ========================================================
// 🧠 PERENNIA CENTRAL STATE STORE
// ========================================================

export type AssetClass = 'Crypto' | 'Real Estate' | 'Commodities' | 'Equities' | 'Energy';
export type SystemMode = 'base' | 'overclocked';
export type SiloWidth = 4 | 6 | 12;

export interface TokenAsset {
    ticker: string;
    name: string;
    assetClass: AssetClass;
    priceUsd: number;
    imgUrl?: string; // <-- Fixes the TypeScript Error!
    icon?: string;
    type?: string;
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

export interface Silo {
    id: string;
    name: string;
    width: SiloWidth;
    assignedPlantId: string | null;
    pendingKaspa: number;
    settlementConfig: SettlementConfig;
}

export interface Worker {
    id: string;
    type: 'physical' | 'capital';
    name: string;
    stratumUrl: string;
    walletWorker: string;
    hashRate: number;
    isOnline: boolean;
    assignedSiloId: string | null;
    ipAddress?: string;
    hardwareType?: string;
}

export interface Plant {
    id: string;
    name: string;
    liquidityDeposit: {
        isActive: boolean;
        pairName: string;
        totalLiquidityUsd: number;
    };
    currentApr: number;
    autoCompound: boolean;
}

export interface WalletInventoryItem {
    asset: TokenAsset;
    balance: number;
    usdValue: number;
}

// Global UI State
export const hasEntered = writable<boolean>(false);
export const activeTab = writable<string>('DEX');
export const systemMode = writable<SystemMode>('base');

// Global Oracle State
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

// Token Registry (Phase 1 Assets)
export const tokenRegistry: TokenAsset[] = [
    { ticker: 'KAS', name: 'Kaspa Native', assetClass: 'Crypto', priceUsd: 0.16, imgUrl: 'https://cryptologos.cc/logos/kaspa-kas-logo.svg?v=032', type: 'Layer 1' },
    { ticker: 'PER', name: 'Perennia Hash', assetClass: 'Energy', priceUsd: 1.00, icon: 'P', type: 'Infrastructure' },
    { ticker: 'USDC', name: 'USD Coin', assetClass: 'Crypto', priceUsd: 1.00, imgUrl: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg?v=032', type: 'Stablecoin' },
    { ticker: 'USDT', name: 'Tether USD', assetClass: 'Crypto', priceUsd: 1.00, imgUrl: 'https://cryptologos.cc/logos/tether-usdt-logo.svg?v=032', type: 'Stablecoin' },
    { ticker: 'wBTC', name: 'Wrapped Bitcoin', assetClass: 'Crypto', priceUsd: 65200.00, imgUrl: 'https://cryptologos.cc/logos/bitcoin-btc-logo.svg?v=032', type: 'Crypto' },
    { ticker: 'wETH', name: 'Wrapped Ethereum', assetClass: 'Crypto', priceUsd: 3450.00, imgUrl: 'https://cryptologos.cc/logos/ethereum-eth-logo.svg?v=032', type: 'Crypto' },
    { ticker: 'SOL', name: 'Solana', assetClass: 'Crypto', priceUsd: 145.20, imgUrl: 'https://cryptologos.cc/logos/solana-sol-logo.svg?v=032', type: 'Crypto' },
    { ticker: 'RE-IDX', name: 'Commercial R.E. Index', assetClass: 'Real Estate', priceUsd: 1250.00, icon: '🏢', type: 'Real World Asset' },
    { ticker: 'GLDT', name: 'Vaulted Gold (1oz)', assetClass: 'Commodities', priceUsd: 2340.50, icon: '🪙', type: 'Commodity' },
    { ticker: 'WTI-C', name: 'Crude Oil (1bbl)', assetClass: 'Commodities', priceUsd: 82.50, icon: '🛢', type: 'Commodity' },
    { ticker: 'WATT', name: 'Solar Energy (1MWh)', assetClass: 'Energy', priceUsd: 45.00, icon: '☀️', type: 'Infrastructure' },
    { ticker: 'TSLA.t', name: 'Tokenized Tesla', assetClass: 'Equities', priceUsd: 185.00, icon: 'T', type: 'Equity' }
];

export const workers = writable<Worker[]>([]);
export const silos = writable<Silo[]>([]);
export const plants = writable<Plant[]>([]);
export const walletInventory = writable<WalletInventoryItem[]>([]);
export const taxEvents = writable<any[]>([]);