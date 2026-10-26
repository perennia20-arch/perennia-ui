export type SystemMode = 'base' | 'overclocked';

export type AssetClass =
    | 'Native L1'
    | 'Stablecoin'
    | 'Tokenized Asset'
    | 'DeFi'
    | 'Ecosystem'
    | 'Commodity'
    | 'Public Equity'
    | 'Sovereign Debt';

export type RouteMode = 'hold' | 'swap' | 'auto-lp';

export interface ThemeColors {
    hex: string;
    pastel: string;
}

export interface TargetAssetSpec {
    ticker: string;
    name: string;
    assetClass: string;
    spotPrice: number;
    theme: ThemeColors;
    imgUrl?: string;
}

export interface PlantAssetTarget extends TargetAssetSpec {
    weightPct: number;
}

export interface SettlementConfig {
    targetAsset: TargetAssetSpec;
    targetAssets?: PlantAssetTarget[];
    plantWeights?: Record<string, number>;
    plantPair?: string;
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
    lastSettledAt?: number;
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
    validShares?: number;
    rejectedShares?: number;
    acceptancePct?: number;
    lastShareTimestamp?: number;
    blocksFound?: number;
}

export interface AssetBucketTelemetry {
    asset: string;
    pendingKas: number;
    pendingUsd: number;
    minProfitableKas: number;
    minProfitableUsd: number;
    weightPct: number;
    participantCount: number;
    lpAvailableKasCapacity: number;
    lpCoveragePct: number;
    effectiveSpreadFloorPct: number;
    railCostUsd: number;
    status: string;
    lastClearedAt: number;
    lastClearType: string;
}

export interface EpochTelemetryState {
    anchorUtcHour: number;
    anchorLabel: string;
    currentEpochBellTs: number;
    nextEpochBellTs: number;
    secondsRemaining: number;
    volatilitySweepThresholdPct: number;
    updatedAt: number;
    buckets: Record<string, AssetBucketTelemetry>;
}