import { browser } from '$app/environment';
import type { Worker, Sector, EpochTelemetryState, AssetBucketTelemetry } from './type';
import { identity } from './identity.svelte';
export const CORE_EPOCH_ASSETS = ['USDC', 'USD', 'BTC', 'ETH', 'SOL'] as const;
const KASPA_DIFF_CONSTANT = 4_294_967_296.0;
const POOL_FEE_RATE = 0.01;
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
        }
        return Array.from(targets);
    }
    get displayedBuckets(): AssetBucketTelemetry[] {
        const bucketsMap = this.epochTelemetry?.buckets || {};
        const tickers = new Set<string>([...CORE_EPOCH_ASSETS, ...Object.keys(bucketsMap)]);
        return Array.from(tickers).map((ticker): AssetBucketTelemetry => {
            const existing = bucketsMap[ticker];
            if (existing) return existing;
            return {
                asset: ticker,
                pendingKas: 0,
                pendingUsd: 0,
                minProfitableKas: 0,
                minProfitableUsd: ticker === 'USD' ? 25 : 0,
                weightPct: 0,
                participantCount: 0,
                lpAvailableKasCapacity: 0,
                lpCoveragePct: 100,
                effectiveSpreadFloorPct: 1.5,
                railCostUsd: ticker === 'USD' ? 2.0 : 0,
                status: 'IDLE',
                lastClearedAt: 0,
                lastClearType: 'NONE'
            };
        });
    }
    get armedBucketCount(): number {
        return this.displayedBuckets.filter(
            (b) => b.weightPct >= 100 || b.status === 'READY_FOR_BELL' || b.status === 'CLEARED_EPOCH'
        ).length;
    }
    get boostZoneBuckets(): AssetBucketTelemetry[] {
        return this.displayedBuckets.filter((b) => b.weightPct >= 85 && b.weightPct < 100);
    }
    getBucket(ticker: string): AssetBucketTelemetry | null {
        const clean = ticker.trim().toUpperCase();
        if (clean === 'KAS') return null;
        return this.displayedBuckets.find((b) => b.asset === clean) || null;
    }
    updateEpochTelemetry(epochData: EpochTelemetryState | null | undefined) {
        if (!epochData || typeof epochData !== 'object') return;
        this.epochTelemetry = {
            anchorUtcHour: epochData.anchorUtcHour ?? 22,
            anchorLabel: epochData.anchorLabel ?? '22:00 UTC Global Settlement',
            currentEpochBellTs: Number(epochData.currentEpochBellTs || 0),
            nextEpochBellTs: Number(epochData.nextEpochBellTs || 0),
            secondsRemaining: Number(epochData.secondsRemaining || 0),
            volatilitySweepThresholdPct: Number(epochData.volatilitySweepThresholdPct || 450),
            updatedAt: Number(epochData.updatedAt || Math.floor(Date.now() / 1000)),
            buckets: epochData.buckets ?? (this.epochTelemetry?.buckets || {})
        };
        if (typeof epochData.secondsRemaining === 'number' && epochData.secondsRemaining >= 0) {
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