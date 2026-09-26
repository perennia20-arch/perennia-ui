// src/lib/stores/types.ts

export type SystemMode = 'base' | 'overclocked';
export type AssetClass = 'Native L1' | 'Stablecoin' | 'Tokenized Asset' | 'DeFi' | 'Ecosystem' | 'Commodity';
export type RouteMode = 'hold' | 'swap' | 'auto-lp';

export interface ThemeColors {
    hex: string;
    pastel: string;
}

export interface SettlementConfig {
    targetAsset: {
        ticker: string;
        name: string;
        assetClass: string;
        priceUsd: number;
        theme: ThemeColors;
        imgUrl?: string;
    };
    payoutAddress: string;
    autoPayout: boolean;
    mode: 'epoch' | 'threshold' | 'appointment';
    threshold: number;
    appointmentDate: string;
    appointmentTime: string;
}

export interface Sector {
    id: string;
    name: string;
    allocationPercentage: number;
    routeMode: RouteMode;
    settlementConfig: SettlementConfig;
    pendingKaspa: number;
    width: number;
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