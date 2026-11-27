import { browser } from '$app/environment';
import type { Worker, Sector, EpochTelemetryState, AssetBucketTelemetry } from './type';
import { identity } from './identity.svelte';
import {
    KAS_DECIMALS,
    LIVE_PRICING_UNAVAILABLE_MESSAGE,
    ORACLE_E8_DECIMALS,
    ORACLE_USD_E8_SCALE,
    USD_MICROS_DECIMALS,
    USD_MICROS_SCALE,
    atomicToUsdMicrosCeil,
    ceilDivBigInt,
    formatAtomicToDecimal,
    normalizeAllocationBps,
    parseDecimalToAtomic,
    parseU128Str,
    type EpochPayoutOutboxItem,
    type MatureAccrualSnapshot,
    type SolvencyProofSnapshot,
    type ThermostatValveRecord,
    type U128Str,
    type VaultLockRecord
} from '$lib/crypto/atomicMath';

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

export interface ProfitableThresholdResult {
    minProfitableKas: number;
    minProfitableSompi: U128Str;
    minProfitableUsd: number;
    minProfitableUsdMicros: U128Str;
    railCostUsd: number;
    railCostUsdMicros: U128Str;
    livePricingUnavailable: boolean;
}

/**
 * Computes minimum profitable payout threshold strictly from live E8 KAS oracle price.
 * Fails closed (returns `'0'` + `livePricingUnavailable: true`) if oracle price is unavailable.
 */
export function computeDynamicProfitableThresholdFromE8(
    ticker: string,
    kasOracleUsdE8: bigint | null | undefined
): ProfitableThresholdResult {
    const clean = String(ticker || 'USDC').trim().toUpperCase();
    const railCostUsdMicros = clean === 'USD' ? 250_000n : 0n;
    const railCostUsd = clean === 'USD' ? 0.25 : 0;

    if (!kasOracleUsdE8 || kasOracleUsdE8 <= 0n) {
        return {
            minProfitableKas: 0,
            minProfitableSompi: '0',
            minProfitableUsd: 0,
            minProfitableUsdMicros: '0',
            railCostUsd,
            railCostUsdMicros: railCostUsdMicros.toString(),
            livePricingUnavailable: true
        };
    }

    const roundUpTenthKas = (usdMicrosTarget: bigint): bigint => {
        const tenths = ceilDivBigInt(
            usdMicrosTarget * 10n * ORACLE_USD_E8_SCALE,
            kasOracleUsdE8 * USD_MICROS_SCALE
        );
        return tenths * 10_000_000n;
    };

    let minSompi: bigint;
    if (clean === 'USD') {
        minSompi = roundUpTenthKas(25_280_000n);
    } else if (clean === 'SILO' || clean === 'NACHO' || clean === 'BEDRCK' || clean === 'PERX') {
        minSompi = roundUpTenthKas(3_500_000n);
    } else {
        const minBridgeUsdMicros =
            clean === 'BTC'
                ? 22_000_000n
                : clean === 'ETH' ||
                    clean === 'XAU' ||
                    clean === 'XAG' ||
                    clean === 'USTB' ||
                    clean === 'USDT'
                  ? 14_000_000n
                  : clean === 'USDC' ||
                      clean === 'SOL' ||
                      clean === 'ARB' ||
                      clean === 'BASE' ||
                      clean === 'POL' ||
                      clean === 'AVAX'
                    ? 6_500_000n
                    : clean === 'SPY' ||
                        clean === 'QQQ' ||
                        clean === 'NVDA' ||
                        clean === 'AAPL' ||
                        clean === 'TSLA' ||
                        clean === 'AMD' ||
                        clean === 'TSM' ||
                        clean === 'AVGO' ||
                        clean === 'XLE'
                      ? 8_500_000n
                      : 5_500_000n;
        const targetMicros = ceilDivBigInt(minBridgeUsdMicros * 10_150n, 10_000n) + 500_000n;
        minSompi = roundUpTenthKas(targetMicros);
    }

    const minUsdMicros = atomicToUsdMicrosCeil(minSompi, KAS_DECIMALS, kasOracleUsdE8);
    return {
        minProfitableKas: Number(formatAtomicToDecimal(minSompi, KAS_DECIMALS, 1, false)),
        minProfitableSompi: minSompi.toString(),
        minProfitableUsd: Number(formatAtomicToDecimal(minUsdMicros, USD_MICROS_DECIMALS, 2, false)),
        minProfitableUsdMicros: minUsdMicros.toString(),
        railCostUsd,
        railCostUsdMicros: railCostUsdMicros.toString(),
        livePricingUnavailable: false
    };
}

/**
 * Converts a boundary KAS USD spot price (`number`) to E8 and delegates to `computeDynamicProfitableThresholdFromE8`.
 * Zero hardcoded fallback: missing/zero price returns `livePricingUnavailable: true`.
 */
export function computeDynamicProfitableThreshold(
    ticker: string,
    kasSpotUsd?: number | null
): ProfitableThresholdResult {
    if (kasSpotUsd === undefined || kasSpotUsd === null || !Number.isFinite(kasSpotUsd) || kasSpotUsd <= 0) {
        return computeDynamicProfitableThresholdFromE8(ticker, null);
    }
    try {
        const e8 = parseDecimalToAtomic(kasSpotUsd, ORACLE_E8_DECIMALS, 'floor');
        return computeDynamicProfitableThresholdFromE8(ticker, e8);
    } catch {
        return computeDynamicProfitableThresholdFromE8(ticker, null);
    }
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
    blockRewardSompi = $state<U128Str>('0');
    virtualDaaScore = $state<number>(0);

    // Sovereign L1 & Fail-Closed Oracle State
    kasOracleUsdE8 = $state<U128Str | null>(null);
    oracleOnline = $state<boolean>(false);
    livePricingUnavailable = $derived(!this.oracleOnline || !this.kasOracleUsdE8);
    pricingStatusMessage = $derived(
        this.livePricingUnavailable ? LIVE_PRICING_UNAVAILABLE_MESSAGE : null
    );
    matureAccrual = $state<MatureAccrualSnapshot | null>(null);
    payoutOutbox = $state<EpochPayoutOutboxItem[]>([]);
    vaultLocks = $state<VaultLockRecord[]>([]);
    thermostatValves = $state<ThermostatValveRecord[]>([]);
    solvencyProof = $state<SolvencyProofSnapshot | null>(null);

    private actionQueue: Promise<any> = Promise.resolve();

    constructor() {
        this.liveEpochSecondsRemaining = this.computeFallbackSecondsTo2200Utc();
    }

    markMutation() {
        this.lastMutationTime = Date.now();
    }

    setKasOracleUsdE8(e8: U128Str | bigint | null) {
        if (e8 === null || e8 === undefined) {
            this.kasOracleUsdE8 = null;
            this.oracleOnline = false;
            return;
        }
        try {
            const parsed = parseU128Str(e8, 'kasOracleUsdE8');
            if (parsed > 0n) {
                this.kasOracleUsdE8 = parsed.toString();
                this.oracleOnline = true;
            } else {
                this.kasOracleUsdE8 = null;
                this.oracleOnline = false;
            }
        } catch {
            this.kasOracleUsdE8 = null;
            this.oracleOnline = false;
        }
    }

    hydrateSovereignState(snapshot: Record<string, any>) {
        if (!snapshot || typeof snapshot !== 'object') return;
        if (snapshot.matureAccrual !== undefined) {
            this.matureAccrual = (snapshot.matureAccrual ?? null) as MatureAccrualSnapshot | null;
        }
        if (Array.isArray(snapshot.payoutOutbox)) {
            this.payoutOutbox = snapshot.payoutOutbox as EpochPayoutOutboxItem[];
        }
        if (Array.isArray(snapshot.vaultLocks)) {
            this.vaultLocks = snapshot.vaultLocks as VaultLockRecord[];
        }
        if (Array.isArray(snapshot.thermostatValves)) {
            this.thermostatValves = snapshot.thermostatValves as ThermostatValveRecord[];
        }
        if (snapshot.solvencyProof !== undefined) {
            this.solvencyProof = (snapshot.solvencyProof ?? null) as SolvencyProofSnapshot | null;
        }
        if (typeof snapshot.blockRewardSompi === 'string') {
            this.blockRewardSompi = snapshot.blockRewardSompi;
        }
        if (snapshot.kasOracleUsdE8 !== undefined) {
            this.setKasOracleUsdE8(snapshot.kasOracleUsdE8);
        }
        if (typeof snapshot.oracleOnline === 'boolean') {
            this.oracleOnline = snapshot.oracleOnline;
        }
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
        let bps = 0;
        try {
            bps = normalizeAllocationBps({
                allocationBps: (sector as any).allocationBps,
                allocationPercentage: sector.allocationPercentage
            });
        } catch {
            bps = 0;
        }
        const pct = bps / 10_000;
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
        const liveKasE8 = this.kasOracleUsdE8 ? parseU128Str(this.kasOracleUsdE8) : null;
        return Array.from(tickers).map((ticker): AssetBucketTelemetry => {
            const existing = bucketsMap[ticker];
            if (existing) return existing;
            const dyn = computeDynamicProfitableThresholdFromE8(ticker, liveKasE8);
            return {
                asset: ticker,
                pendingKas: 0,
                pendingUsd: 0,
                minProfitableKas: dyn.minProfitableKas,
                minProfitableUsd: dyn.minProfitableUsd,
                weightPct: 0,
                participantCount: 0,
                lpAvailableKasCapacity: 0,
                lpCoveragePct: 0,
                effectiveSpreadFloorPct: 0.1,
                railCostUsd: dyn.railCostUsd,
                status: dyn.livePricingUnavailable ? 'PRICING_UNAVAILABLE' : 'IDLE',
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
            let bps = 0;
            try {
                bps = normalizeAllocationBps({
                    allocationBps: (sec as any).allocationBps,
                    allocationPercentage: sec.allocationPercentage
                });
            } catch {
                bps = 0;
            }
            const secPendingKas = Math.max(0, Number(sec.pendingKaspa || 0));
            const reserve = sec.settlementConfig?.pairReserve;
            if (reserve?.status === 'QUEUED') {
                const partnerTick = String(reserve.partnerTicker || '').trim().toUpperCase();
                if (partnerTick && partnerTick !== 'KAS') {
                    const queuedAtomic = parseU128Str(reserve.queuedBaseAtomic || '0');
                    const queuedBaseFloat =
                        reserve.baseTicker === 'KAS'
                            ? Number(formatAtomicToDecimal(queuedAtomic, KAS_DECIMALS, 6, true))
                            : Number(formatAtomicToDecimal(queuedAtomic, KAS_DECIMALS, 6, true));
                    userPendingByAsset.set(
                        partnerTick,
                        (userPendingByAsset.get(partnerTick) || 0) + queuedBaseFloat
                    );
                }
            }
            if (bps <= 0 && secPendingKas <= 0) continue;
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
        const liveKasE8 = this.kasOracleUsdE8 ? parseU128Str(this.kasOracleUsdE8) : null;
        const result: AssetBucketTelemetry[] = [];
        for (const [ticker, userPendingKas] of userPendingByAsset.entries()) {
            const globalBucket = globalMap.get(ticker);
            const dyn = computeDynamicProfitableThresholdFromE8(ticker, liveKasE8);
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
                participantCount: globalBucket?.participantCount || 0,
                lpAvailableKasCapacity: globalBucket?.lpAvailableKasCapacity || 0,
                lpCoveragePct: globalBucket?.lpCoveragePct ?? 0,
                effectiveSpreadFloorPct: globalBucket?.effectiveSpreadFloorPct ?? 0.1,
                railCostUsd: globalBucket?.railCostUsd ?? dyn.railCostUsd,
                status: dyn.livePricingUnavailable
                    ? 'PRICING_UNAVAILABLE'
                    : weightPct >= 100
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

    async dispatchSovereignAction<T = any>(
        action: string,
        payload: Record<string, unknown> = {}
    ): Promise<{
        ok: boolean;
        status: number;
        data: T | null;
        error: string | null;
        livePricingUnavailable: boolean;
    }> {
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
            const body = (await res.json().catch(() => null)) as Record<string, any> | null;
            if (res.status === 503 || body?.livePricingUnavailable) {
                this.oracleOnline = false;
                return {
                    ok: false,
                    status: 503,
                    data: null,
                    error: LIVE_PRICING_UNAVAILABLE_MESSAGE,
                    livePricingUnavailable: true
                };
            }
            if (!res.ok || body?.success === false) {
                return {
                    ok: false,
                    status: res.status,
                    data: null,
                    error: String(body?.message || body?.error || 'Action failed.'),
                    livePricingUnavailable: false
                };
            }
            return {
                ok: true,
                status: res.status,
                data: (body?.data ?? null) as T | null,
                error: null,
                livePricingUnavailable: false
            };
        } catch {
            return {
                ok: false,
                status: 503,
                data: null,
                error: LIVE_PRICING_UNAVAILABLE_MESSAGE,
                livePricingUnavailable: true
            };
        }
    }

    async dispatchStateAction(action: string, payload: any): Promise<boolean> {
        const execute = async () => {
            const res = await this.dispatchSovereignAction(action, payload ?? {});
            return res.ok;
        };
        this.actionQueue = this.actionQueue.then(execute).catch(execute);
        return this.actionQueue;
    }

    reconcileQueuedPairFills(getAssetOnChainAtomic: (ticker: string) => U128Str): Sector[] {
        const activated: Sector[] = [];
        let changed = false;
        this.sectors = this.sectors.map((sec) => {
            const reserve = sec.settlementConfig?.pairReserve;
            if (!reserve || reserve.status !== 'QUEUED') return sec;
            const targetAtomic = parseU128Str(reserve.targetPartnerAtomic || '0');
            if (targetAtomic <= 0n) return sec;
            const walletAtomic = parseU128Str(getAssetOnChainAtomic(reserve.partnerTicker) || '0');
            const globalBucket = this.allGlobalPoolBuckets.find(
                (b) => b.asset.toUpperCase() === reserve.partnerTicker.toUpperCase()
            );
            const isFilled = walletAtomic >= targetAtomic || globalBucket?.status === 'READY_FOR_BELL';
            if (!isFilled) return sec;
            changed = true;
            const nextSec: Sector = {
                ...sec,
                settlementConfig: {
                    ...sec.settlementConfig,
                    pairReserve: {
                        ...reserve,
                        status: 'ACTIVE',
                        partnerBalanceAtomic: targetAtomic.toString(),
                        queuedBaseAtomic: '0',
                        updatedAt: Date.now()
                    }
                }
            };
            activated.push(nextSec);
            return nextSec;
        });
        return changed ? activated : [];
    }

    purge() {
        this.workers = [];
        this.sectors = [];
        this.matureAccrual = null;
        this.payoutOutbox = [];
        this.vaultLocks = [];
        this.thermostatValves = [];
        this.solvencyProof = null;
    }
}

export const operations = new OperationsStore();
export const ops = operations;
export type { Sector as YieldSector, Worker as WorkerNode } from './type';
