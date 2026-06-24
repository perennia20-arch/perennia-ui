import { writable } from 'svelte/store';

// ==========================================
// MASTER ROUTING & STATE
// ==========================================
export const hasEntered = writable<boolean>(false);
export const activeTab = writable<string>('OPERATIONS'); 
export const systemMode = writable<'base' | 'overclocked'>('base');

// ==========================================
// GLOBAL PHYSICS (Live Hardware & APIs)
// ==========================================
export const globalKasPrice = writable<number>(0.16);
export const globalKasChange = writable<number>(0.00);
export const globalNetworkHashrate = writable<number>(0.00); // Live Worker Hashrate
export const globalNodeStatus = writable<string>('offline');

// ==========================================
// LEVEL 0: WORKERS (Raw Hash Power)
// ==========================================
export type WorkerType = 'physical' | 'capital';
export type SiloWidth = 4 | 6 | 12;

export interface Worker {
    id: string; type: WorkerType; name: string; stratumUrl: string; 
    walletWorker: string; hashRate: number; isOnline: boolean; assignedSiloId: string | null; 
    ipAddress?: string;      // NEW: Directly extracted from physical node
    hardwareType?: string;   // NEW: Directly extracted from physical node
}

// ==========================================
// THE SANCTUARY REGISTRY (Tokenized Assets)
// ==========================================
export type AssetClass = 'Crypto' | 'Real Estate' | 'Commodities' | 'Equities' | 'Energy';

export interface TokenAsset { ticker: string; name: string; assetClass: AssetClass; color: string; priceUsd: number; }

export const tokenRegistry: TokenAsset[] = [
    { ticker: 'KAS', name: 'Kaspa Native', assetClass: 'Crypto', color: 'text-teal-400', priceUsd: 0.16 }, // Updated dynamically
    { ticker: 'BTC', name: 'Bitcoin (Wrapped)', assetClass: 'Crypto', color: 'text-orange-400', priceUsd: 64000.00 },
    { ticker: 'SOL', name: 'Solana (Wrapped)', assetClass: 'Crypto', color: 'text-purple-400', priceUsd: 145.00 },
    { ticker: 'PER', name: 'Perennia Hash Power', assetClass: 'Energy', color: 'text-amber-500', priceUsd: 1.00 },
    { ticker: 'PWR-T', name: 'Texas Grid Output', assetClass: 'Energy', color: 'text-yellow-400', priceUsd: 42.50 },
    { ticker: 'ASPN', name: '123 Aspen Lodge', assetClass: 'Real Estate', color: 'text-blue-400', priceUsd: 125.50 },
    { ticker: 'NY-CM', name: 'Manhattan Commercial', assetClass: 'Real Estate', color: 'text-indigo-400', priceUsd: 2400.00 },
    { ticker: 'GLD-T', name: 'Vaulted Gold 1oz', assetClass: 'Commodities', color: 'text-yellow-500', priceUsd: 2350.00 },
    { ticker: 'SLV-T', name: 'Vaulted Silver 1oz', assetClass: 'Commodities', color: 'text-gray-300', priceUsd: 29.50 },
    { ticker: 'OIL-T', name: 'Crude Oil Barrel', assetClass: 'Commodities', color: 'text-slate-400', priceUsd: 82.00 },
    { ticker: 'TSLA-T', name: 'Tesla Tokenized Equity', assetClass: 'Equities', color: 'text-rose-400', priceUsd: 185.00 },
    { ticker: 'AAPL-T', name: 'Apple Tokenized Equity', assetClass: 'Equities', color: 'text-gray-200', priceUsd: 190.00 }
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
    pendingKaspa: number; // NEW: The mathematical reservoir holding unsettled Kaspa
}

// ==========================================
// LEVEL 2: PLANTS (Liquidity & Yield Synthesis)
// ==========================================
export interface LiquidityDeposit { isActive: boolean; pairName: string; totalLiquidityUsd: number; }
export interface Plant { id: string; name: string; liquidityDeposit: LiquidityDeposit; currentApr: number; autoCompound: boolean; }

// ==========================================
// LEVEL 3 & 4: VAULT INVENTORY & LEDGER
// ==========================================
export interface WalletInventoryItem { asset: TokenAsset; balance: number; usdValue: number; }
export interface GlobalProtocolStats { totalValueLockedUsd: number; perenniaApy: number; }
export interface TaxEvent { id: string; timestamp: string; type: string; asset: TokenAsset; amount: number; usdValueAtTime: number; txHash: string; }

// ==========================================
// MASTER MEMORY ARRAYS
// ==========================================
export const workers = writable<Worker[]>([]);
export const silos = writable<Silo[]>([]);
export const plants = writable<Plant[]>([]);
export const walletInventory = writable<WalletInventoryItem[]>([]);
export const globalStats = writable<GlobalProtocolStats>({ totalValueLockedUsd: 0, perenniaApy: 0 });
export const taxEvents = writable<TaxEvent[]>([]);