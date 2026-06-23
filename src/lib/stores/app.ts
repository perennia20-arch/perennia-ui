import { writable } from 'svelte/store';

// ==========================================
// MASTER ROUTING & STATE
// ==========================================
export const hasEntered = writable<boolean>(false);
export const activeTab = writable<string>('DEX'); 
export const systemMode = writable<'base' | 'overclocked'>('base');

// ==========================================
// LEVEL 0: WORKERS (Raw Hash Power)
// ==========================================
export type WorkerType = 'physical' | 'capital';
export type SiloWidth = 4 | 6 | 12;

export interface Worker {
    id: string; type: WorkerType; name: string; stratumUrl: string; 
    walletWorker: string; hashRate: number; isOnline: boolean; assignedSiloId: string | null; 
}

// ==========================================
// THE SANCTUARY REGISTRY (Tokenized Assets)
// ==========================================
export type AssetClass = 'Crypto' | 'Real Estate' | 'Commodities' | 'Equities' | 'Energy';

export interface TokenAsset {
    ticker: string; name: string; assetClass: AssetClass; color: string; 
}

export const tokenRegistry: TokenAsset[] = [
    { ticker: 'KAS', name: 'Kaspa Native', assetClass: 'Crypto', color: 'text-teal-400' },
    { ticker: 'BTC', name: 'Bitcoin (Wrapped)', assetClass: 'Crypto', color: 'text-orange-400' },
    { ticker: 'SOL', name: 'Solana (Wrapped)', assetClass: 'Crypto', color: 'text-purple-400' },
    
    { ticker: 'PER', name: 'Perennia Hash Power', assetClass: 'Energy', color: 'text-amber-500' },
    { ticker: 'PWR-T', name: 'Texas Grid Output', assetClass: 'Energy', color: 'text-yellow-400' },

    { ticker: 'ASPN', name: '123 Aspen Lodge', assetClass: 'Real Estate', color: 'text-blue-400' },
    { ticker: 'NY-CM', name: 'Manhattan Commercial', assetClass: 'Real Estate', color: 'text-indigo-400' },

    { ticker: 'GLD-T', name: 'Vaulted Gold 1oz', assetClass: 'Commodities', color: 'text-yellow-500' },
    { ticker: 'SLV-T', name: 'Vaulted Silver 1oz', assetClass: 'Commodities', color: 'text-gray-300' },
    { ticker: 'OIL-T', name: 'Crude Oil Barrel', assetClass: 'Commodities', color: 'text-slate-400' },

    { ticker: 'TSLA-T', name: 'Tesla Tokenized Equity', assetClass: 'Equities', color: 'text-rose-400' },
    { ticker: 'AAPL-T', name: 'Apple Tokenized Equity', assetClass: 'Equities', color: 'text-gray-200' }
];

// ==========================================
// LEVEL 1: SILOS (Settlement Routing)
// ==========================================
export type SettlementMode = 'threshold' | 'stream' | 'appointment';

export interface SettlementConfig {
    targetAsset: TokenAsset; 
    payoutAddress: string; autoPayout: boolean; mode: SettlementMode; threshold: number;
    streamMode: 'realtime' | 'interval'; streamValue: number; streamUnit: 'minutes' | 'hours' | 'days';
    appointmentDate: string; appointmentTime: string;
}

export interface Silo {
    id: string; name: string; width: SiloWidth; settlementConfig: SettlementConfig; 
    assignedPlantId: string | null; 
}

// ==========================================
// LEVEL 2: PLANTS (Liquidity & Yield Synthesis)
// ==========================================
export interface LiquidityDeposit {
    isActive: boolean; pairName: string; totalLiquidityUsd: number; 
}

export interface Plant {
    id: string; name: string; liquidityDeposit: LiquidityDeposit;
    currentApr: number; autoCompound: boolean;
}

// ==========================================
// LEVEL 3: TREASURY (Inventory & Projections)
// No simulated numbers allowed. Default to 0.00 until true data arrives.
// ==========================================
export interface WalletInventoryItem {
    asset: TokenAsset;
    balance: number;      // True on-chain balance
    usdValue: number;     // USD value based on live oracles
}

export interface GlobalProtocolStats {
    totalValueLockedUsd: number;
    perenniaApy: number;
}

// ==========================================
// MASTER MEMORY ARRAYS
// ==========================================
export const workers = writable<Worker[]>([]);
export const silos = writable<Silo[]>([]);
export const plants = writable<Plant[]>([]);

export const walletInventory = writable<WalletInventoryItem[]>([]);
export const globalStats = writable<GlobalProtocolStats>({ totalValueLockedUsd: 0, perenniaApy: 0 });