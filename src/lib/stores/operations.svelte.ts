import { browser } from '$app/environment';
import type { Worker, Sector, EpochTelemetryState, AssetBucketTelemetry } from './type';
import { identity } from './identity.svelte';
export const CORE_EPOCH_ASSETS = ['USDC', 'USD', 'BTC', 'ETH', 'SOL'] as const;
export const ALL_18_POOL_BUCKET_ASSETS = [
    'USDC',
    'USDT',
    'USD',
    'BTC',
    'ETH',
    'SOL',
    'SILO',
    'XRP',
    'DOGE',
    'POL',
    'AVAX',
    'SUI',
    'TRX',
    'ZEC',
    'ARB',
    'BASE',
    'NVDA',
    'SPY'
] as const;
const KASPA_DIFF_CONSTANT = 4_294_967_296.0;
const POOL_FEE_RATE = 0.01;
export function computeDynamicProfitableThreshold(
    ticker: string,
    kasSpotUsd = 0.15
): {
    minProfitableKas: number;
    minProfitableUsd: number;
    railCostUsd: number;
} {
    const clean = String(ticker || 'USDC').trim().toUpperCase();
    const safeKasSpot =
        Number.isFinite(kasSpotUsd) && kasSpotUsd > 0 ? kasSpotUsd : 0.15;
    if (clean === 'USD') {
        const minUsd = 25.28;
        const minKas = Math.ceil((minUsd / safeKasSpot) * 10) / 10;
        return {
            minProfitableKas: minKas,
            minProfitableUsd: Number((minKas * safeKasSpot).toFixed(2)),
            railCostUsd: 0.25
        };
    }
    if (
        clean === 'SILO' ||
        clean === 'NACHO' ||
        clean === 'BEDRCK' ||
        clean === 'PERX'
    ) {
        const minUsd = 3.5;
        const minKas = Math.ceil((minUsd / safeKasSpot) * 10) / 10;
        return {
            minProfitableKas: minKas,
            minProfitableUsd: Number((minKas * safeKasSpot).toFixed(2)),
            railCostUsd: 0
        };
    }
    const minBridgeUsd =
        clean === 'BTC'
            ? 22.0
            : clean === 'ETH' ||
                clean === 'XAU' ||
                clean === 'XAG' ||
                clean === 'USTB' ||
                clean === 'USDT'
              ? 14.0
              : clean === 'USDC' ||
                  clean === 'SOL' ||
                  clean === 'ARB' ||
                  clean === 'BASE' ||
                  clean === 'POL' ||
                  clean === 'AVAX'
                ? 6.5
                : clean === 'SPY' ||
                    clean === 'QQQ' ||
                    clean === 'NVDA' ||
                    clean === 'AAPL' ||
                    clean === 'TSLA' ||
                    clean === 'AMD' ||
                    clean === 'TSM' ||
                    clean === 'AVGO' ||
                    clean === 'XLE'
                  ? 8.5
                  : 5.5;
    const baseBridgeMinKas = minBridgeUsd / safeKasSpot;
    const marginKas = 0.5 / safeKasSpot;
    const minProfitableKas =
        Math.ceil((baseBridgeMinKas * 1.015 + marginKas) * 10) / 10;
    const minProfitableUsd = Number(
        (minProfitableKas * safeKasSpot).toFixed(2)
    );
    return {
        minProfitableKas,
        minProfitableUsd,
        railCostUsd: 0
    };
}
class OperationsStore {
    workers = $state<Worker[]>([]);
    sectors = $state<Sector[]>([]);
    globalNetworkHashrate = $state(0);
    globalNodeStatus = $state<'offline' | 'syncing' | 'connected' | 'unreachable'>('offline');
    epochTelemetry = $state<EpochTelemetryState | null>(null);
    liveEpochSecondsRemaining = $state<number>(0);
    lastMutationTime = $state<number>(0);
    networkDifficulty = $state<number>(0);
    blockRewardKas = $state<number>(0);
	virtualDaaScore = $state<number>(0);
    private actionQueue: Promise<any> = Promise.resolve();
    constructor() {
        this.liveEpochSecondsRemaining = this.computeFallbackSecondsTo2200Utc();
    }
    markMutation() {
        this.lastMutationTime = Date.now();
    }
    computeFallbackSecondsTo2200Utc(): number {
        const nowSecs = Math.floor(Date.now() / 1000);
        const dayStart = nowSecs - (nowSecs % 86400);
        const todaySettlement = dayStart + 22 * 3600;
        const nextSettlement = nowSecs >= todaySettlement ? todaySettlement + 86400 : todaySettlement;
        return Math.max(0, nextSettlement - nowSecs);
    }
    tickEpochClock() {
        if (this.epochTelemetry?.nextEpochBellTs && this.epochTelemetry.nextEpochBellTs > 0) {
            const nowSecs = Math.floor(Date.now() / 1000);
            const remaining = this.epochTelemetry.nextEpochBellTs - nowSecs;
            if (remaining >= 0) {
                this.liveEpochSecondsRemaining = remaining;
                return;
            }
        }
        this.liveEpochSecondsRemaining = this.computeFallbackSecondsTo2200Utc();
    }
    formatEpochCountdown(totalSeconds: number = this.liveEpochSecondsRemaining): string {
        const clamped = Math.max(0, Math.floor(totalSeconds));
        const hrs = Math.floor(clamped / 3600);
        const mins = Math.floor((clamped % 3600) / 60);
        const secs = clamped % 60;
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    estimateSectorDailyKas(sector: Sector, totalUserHashrateThs: number): number {
        const pct = Math.max(0, Number(sector.allocationPercentage || 0)) / 100.0;
        const sectorThs = totalUserHashrateThs * pct;
        if (sectorThs > 0 && this.networkDifficulty > 0 && this.blockRewardKas > 0) {
            const hashesPerDay = sectorThs * 1e12 * 86400.0;
            const expectedBlockHashes = this.networkDifficulty * 2.0 * KASPA_DIFF_CONSTANT;
            if (expectedBlockHashes > 0) {
                const grossKasDay = (hashesPerDay * this.blockRewardKas) / expectedBlockHashes;
                return Math.max(0, grossKasDay * (1.0 - POOL_FEE_RATE));
            }
        }
        const pending = Math.max(0, Number(sector.pendingKaspa || 0));
        if (pending > 0) {
            const elapsedInEpoch = Math.max(300, 86400 - this.liveEpochSecondsRemaining);
            return (pending / elapsedInEpoch) * 86400;
        }
        return 0;
    }
    get localBellTimeLabel(): string {
        if (!browser) return '16:00 CT';
        try {
            const now = new Date();
            const utcSettlementDate = new Date(
                Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 22, 0, 0)
            );
            return new Intl.DateTimeFormat(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                timeZoneName: 'short'
            }).format(utcSettlementDate);
        } catch {
            return '16:00 CT';
        }
    }
    get isFinalHour(): boolean {
        return this.liveEpochSecondsRemaining > 0 && this.liveEpochSecondsRemaining <= 3600;
    }
    get targetedAssets(): string[] {
        const targets = new Set<string>();
        for (const sector of this.sectors) {
            if (sector.settlementConfig?.targetAsset?.ticker) {
                targets.add(sector.settlementConfig.targetAsset.ticker.toUpperCase());
            }
            if (Array.isArray(sector.settlementConfig?.targetAssets)) {
                for (const t of sector.settlementConfig.targetAssets) {
                    if (t?.ticker) {
                        targets.add(t.ticker.toUpperCase());
                    }
                }
            }
            if (
                sector.settlementConfig?.plantWeights &&
                typeof sector.settlementConfig.plantWeights === 'object'
            ) {
                for (const k of Object.keys(sector.settlementConfig.plantWeights)) {
                    targets.add(k.toUpperCase());
                }
            }
        }
        return Array.from(targets);
    }
    get allGlobalPoolBuckets(): AssetBucketTelemetry[] {
        const bucketsMap = this.epochTelemetry?.buckets || {};
        const tickers = new Set<string>([
            ...ALL_18_POOL_BUCKET_ASSETS,
            ...Object.keys(bucketsMap)
        ]);
        return Array.from(tickers).map((ticker): AssetBucketTelemetry => {
            const existing = bucketsMap[ticker];
            if (existing) return existing;
            const dyn = computeDynamicProfitableThreshold(ticker);
            return {
                asset: ticker,
                pendingKas: 0,
                pendingUsd: 0,
                minProfitableKas: dyn.minProfitableKas,
                minProfitableUsd: dyn.minProfitableUsd,
                weightPct: 0,
                participantCount: 0,
                lpAvailableKasCapacity: 5000,
                lpCoveragePct: 100,
                effectiveSpreadFloorPct: 0.10,
                railCostUsd: dyn.railCostUsd,
                status: 'IDLE',
                lastClearedAt: 0,
                lastClearType: 'NONE'
            };
        });
    }
    get allGlobalBuckets(): AssetBucketTelemetry[] {
        return this.allGlobalPoolBuckets;
    }
    get displayedBuckets(): AssetBucketTelemetry[] {
        const userPendingByAsset = new Map<string, number>();
        for (const sec of this.sectors || []) {
            const allocPct = Number(sec.allocationPercentage || 0);
            const secPendingKas = Math.max(0, Number(sec.pendingKaspa || 0));
            if (allocPct <= 0 && secPendingKas <= 0) continue;
            if (
                Array.isArray(sec.settlementConfig?.targetAssets) &&
                sec.settlementConfig.targetAssets.length >= 2
            ) {
                for (const leg of sec.settlementConfig.targetAssets) {
                    const tick = String(leg?.ticker || '').trim().toUpperCase();
                    if (!tick || tick === 'KAS') continue;
                    const legShare = Math.max(0, Number(leg.weightPct || 50)) / 100.0;
                    userPendingByAsset.set(
                        tick,
                        (userPendingByAsset.get(tick) || 0) + secPendingKas * legShare
                    );
                }
            } else {
                const primary = String(
                    sec.settlementConfig?.targetAsset?.ticker || ''
                )
                    .trim()
                    .toUpperCase();
                if (primary && primary !== 'KAS') {
                    userPendingByAsset.set(
                        primary,
                        (userPendingByAsset.get(primary) || 0) + secPendingKas
                    );
                }
            }
        }
        const globalMap = new Map(
            this.allGlobalPoolBuckets.map((b) => [b.asset.toUpperCase(), b])
        );
        const result: AssetBucketTelemetry[] = [];
        for (const [ticker, userPendingKas] of userPendingByAsset.entries()) {
            const globalBucket = globalMap.get(ticker);
            const dyn = computeDynamicProfitableThreshold(ticker);
            const minProfitableKas =
                globalBucket?.minProfitableKas && globalBucket.minProfitableKas > 0
                    ? globalBucket.minProfitableKas
                    : dyn.minProfitableKas;
            const minProfitableUsd =
                globalBucket?.minProfitableUsd && globalBucket.minProfitableUsd > 0
                    ? globalBucket.minProfitableUsd
                    : dyn.minProfitableUsd;
            const effectivePendingKas = Math.max(
                userPendingKas,
                globalBucket?.pendingKas || 0
            );
            const weightPct =
                minProfitableKas > 0
                    ? Math.min(100, (effectivePendingKas / minProfitableKas) * 100)
                    : 0;
            result.push({
                asset: ticker,
                pendingKas: userPendingKas,
                pendingUsd: globalBucket?.pendingUsd || 0,
                minProfitableKas,
                minProfitableUsd,
                weightPct,
                participantCount: Math.max(1, globalBucket?.participantCount || 1),
                lpAvailableKasCapacity: globalBucket?.lpAvailableKasCapacity || 5000,
                lpCoveragePct: globalBucket?.lpCoveragePct ?? 100,
                effectiveSpreadFloorPct: globalBucket?.effectiveSpreadFloorPct ?? 0.10,
                railCostUsd: globalBucket?.railCostUsd ?? dyn.railCostUsd,
                status:
                    weightPct >= 100
                        ? 'READY_FOR_BELL'
                        : globalBucket?.status || 'FILLING',
                lastClearedAt: globalBucket?.lastClearedAt || 0,
                lastClearType: globalBucket?.lastClearType || 'NONE'
            });
        }
        return result;
    }
    get armedBucketCount(): number {
        return this.displayedBuckets.filter(
            (b) =>
                b.weightPct >= 100 ||
                b.status === 'READY_FOR_BELL' ||
                b.status === 'CLEARED_EPOCH'
        ).length;
    }
    get boostZoneBuckets(): AssetBucketTelemetry[] {
        return this.displayedBuckets.filter(
            (b) => b.weightPct >= 85 && b.weightPct < 100
        );
    }
    getBucket(ticker: string): AssetBucketTelemetry | null {
        const clean = ticker.trim().toUpperCase();
        if (clean === 'KAS') return null;
        return (
            this.displayedBuckets.find((b) => b.asset === clean) ||
            this.allGlobalPoolBuckets.find((b) => b.asset === clean) ||
            null
        );
    }
    updateEpochTelemetry(epochData: EpochTelemetryState | null | undefined) {
        if (!epochData || typeof epochData !== 'object') return;
        this.epochTelemetry = {
            anchorUtcHour: epochData.anchorUtcHour ?? 22,
            anchorLabel: epochData.anchorLabel ?? '22:00 UTC Global Settlement',
            currentEpochBellTs: Number(epochData.currentEpochBellTs || 0),
            nextEpochBellTs: Number(epochData.nextEpochBellTs || 0),
            secondsRemaining: Number(epochData.secondsRemaining || 0),
            volatilitySweepThresholdPct: Number(
                epochData.volatilitySweepThresholdPct || 450
            ),
            updatedAt: Number(epochData.updatedAt || Math.floor(Date.now() / 1000)),
            buckets: epochData.buckets ?? (this.epochTelemetry?.buckets || {})
        };
        if (
            typeof epochData.secondsRemaining === 'number' &&
            epochData.secondsRemaining >= 0
        ) {
            this.liveEpochSecondsRemaining = epochData.secondsRemaining;
        } else {
            this.tickEpochClock();
        }
    }
    async dispatchStateAction(action: string, payload: any) {
        const execute = async () => {
            try {
                const targetWallet =
                    identity.isCorporateAdmin && identity.activeAddress
                        ? identity.activeAddress
                        : undefined;
                const res = await fetch('/api/state/action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action, payload, targetWallet })
                });
                return res.ok;
            } catch (e) {
                console.error('Matrix action dispatch failed:', e);
                return false;
            }
        };
        this.actionQueue = this.actionQueue.then(execute).catch(execute);
        return this.actionQueue;
    }
    purge() {
        this.workers = [];
        this.sectors = [];
    }
}
export const operations = new OperationsStore();
export const ops = operations;
export type { Sector as YieldSector, Worker as WorkerNode } from './type';