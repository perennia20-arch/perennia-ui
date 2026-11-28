<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { operations } from '$lib/stores/operations.svelte';
    import { i18n } from '$lib/stores/i18n.svelte';
    import { treasury, type UnifiedAsset } from '$lib/stores/treasury.svelte';
    import { getChainExplorerAddressUrl, getChainExplorerTxUrl } from '$lib/stores/transaction.svelte';
    import {
        LIVE_PRICING_UNAVAILABLE_MESSAGE,
        formatAtomicToDecimal,
        parseDecimalToAtomic,
        safeFiniteNumber,
        type RegisterVaultLockPayload,
        type SettlementReceiptRecord,
        type VaultCancelPsktResponse,
        type VaultLockRecord
    } from '$lib/crypto/atomicMath';
    import {
        buildNonCustodialSwapAmountAtomic,
        dexAtomicDecimals,
        formatSorQuoteDisplay
    } from '$lib/components/dex/dexHelpers';
    import type {
        Sector,
        RouteMode,
        SettlementConfig,
        PlantAssetTarget,
        AssetBucketTelemetry,
        PairFeeRateBps,
        PairFundMode,
        PairTermOption
    } from '$lib/stores/type';
    import {
        DEFAULT_PAIR_FEE_RATE_BPS,
        DEFAULT_PAIR_TERM,
        DEFAULT_RESERVE_PAYOUT_KAS,
        KASPA_DIFF_CONSTANT,
        PAIR_TERM_PRESETS,
        POOL_FEE_RATE,
        INITIAL_MINEABLE_KRC20_VAULTS,
        THERMOSTAT_VALVE_META,
        bpsToPctNumber,
        buildSvgPath,
        buildUpdateSectorAllocationPayload,
        cancelOrWithdrawPairSector,
        computeTotalAllocatedBps,
        computeUnallocatedBps,
        computeValveFillProgressBps,
        executeSharedWalletPair,
        fetchSovereignOperationsBundle,
        formatBpsToPctDisplay,
        formatSectorDisplayTitle,
        formatSettledAssetAmount,
        formatSettlementTierLabel,
        formatSompiToKasDisplay,
        formatSompiToUsdOrUnavailable,
        formatUsdMicrosDisplay,
        formatVaultKindLabel,
        formatVaultStatusLabel,
        hydrateSectorTargetAssets,
        hydrateThermostatValveDrafts,
        matchCatalogSpecForWorker,
        normalizePlantTargets,
        parsePctInputToBps,
        readSectorAllocationBps,
        recordPairSettlementActivity,
        requestVaultCancelPreview,
        resolveKaspaAssetOracleE8,
        resolveTargetNetworkForAsset,
        sanitizeRetailCopy,
        toPlantTargetSpec,
        type MineableKrc20VaultInfo,
        type ThermostatValveDraft,
        type ViewSector
    } from '$lib/components/operations/operationsHelpers';
    import WorkerFleetPanel from '$lib/components/operations/WorkerFleetPanel.svelte';
    import SectorCard from '$lib/components/operations/SectorCard.svelte';
    import PoolDistributionSidebar from '$lib/components/operations/PoolDistributionSidebar.svelte';
    import SectorConfigModals from '$lib/components/operations/SectorConfigModals.svelte';

    type ChartTimeframe = '1H' | '24H' | '7D' | '30D';

    let savedBankRailLast4 = $state<string | null>(null);
    let savedBankRailLabel = $state<string>('Primary Operating Account');
    let savedBankRailMethod = $state<string>('ACH');

    let hashChartTimeframe = $state<ChartTimeframe>('1H');
    let priceChartTimeframe = $state<ChartTimeframe>('24H');
    let priceTimeframeDelta = $state<number | null>(null);

    // Sovereign L1 Operations State
    let settlementReceipts = $state<SettlementReceiptRecord[]>([]);
    let isVaultModalOpen = $state(false);
    let vaultModalPreset = $state<Partial<RegisterVaultLockPayload> | null>(null);
    let cancelVaultTarget = $state<VaultLockRecord | null>(null);
    let cancelVaultPreview = $state<VaultCancelPsktResponse | null>(null);
    let cancelActionError = $state<string | null>(null);
    let isThermostatModalOpen = $state(false);
    let thermostatDrafts = $state<ThermostatValveDraft[]>([]);
    let sectorModalMode = $state<'split' | 'pair'>('split');
    let pairFundMode = $state<PairFundMode>('WALLET');
    let splitWalletBoostOpen = $state<boolean>(false);
    let draftPairFeeBps = $state<PairFeeRateBps>(DEFAULT_PAIR_FEE_RATE_BPS);
    let draftPairTerm = $state<PairTermOption>(DEFAULT_PAIR_TERM);
    let pairPartnerTicker = $state<string>('SILO');
    let fundTargetSectorId = $state<string | null>(null);
    let isSubmittingPair = $state<boolean>(false);
    let pairSubmitError = $state<string | null>(null);
    let initialPairSwapPayTicker = $state<string>('KAS');
    let initialPairSwapAmount = $state<string>('');
    let mobileMineTab = $state<'SPLITS' | 'RIGS' | 'REWARDS'>('SPLITS');
    let vaultDrawerManual = $state<boolean | null>(null);
    let thermostatDrawerManual = $state<boolean | null>(null);
    let receiptsDrawerManual = $state<boolean | null>(null);

    let activeVaultCount = $derived(
        (operations.vaultLocks || []).filter(
            (v) => !['CANCELLED', 'CANCELED', 'SPENT', 'REFUNDED'].includes(String(v.status || '').toUpperCase())
        ).length
    );
    let enabledValveCount = $derived(
        (operations.thermostatValves || []).filter((v) => v.isEnabled).length
    );
    let isVaultDrawerOpen = $derived(
        vaultDrawerManual !== null
            ? vaultDrawerManual
            : (operations.vaultLocks || []).length > 0 || Boolean(cancelActionError)
    );
    let isThermostatDrawerOpen = $derived(
        thermostatDrawerManual !== null ? thermostatDrawerManual : enabledValveCount > 0
    );
    let isReceiptsDrawerOpen = $derived(
        receiptsDrawerManual !== null ? receiptsDrawerManual : settlementReceipts.length > 0
    );

    let mineableKrc20Vaults = $state<MineableKrc20VaultInfo[]>([
        ...INITIAL_MINEABLE_KRC20_VAULTS
    ]);

    let mineableVaultMap = $derived.by(() => {
        const map = new Map<string, MineableKrc20VaultInfo>();
        for (const v of mineableKrc20Vaults) {
            map.set(v.tokenTicker.toUpperCase(), v);
        }
        return map;
    });

    let livePricingUnavailable = $derived(
        operations.livePricingUnavailable || treasury.livePricingUnavailable
    );
    let kasAsset = $derived(treasury.getAsset('KAS'));
    let kasSpotVisible = $derived(!livePricingUnavailable && kasAsset.spotPrice > 0);

    function resolveTargetWallet(): string | undefined {
        return identity.isCorporateAdmin && ui.adminModeActive && ui.adminTargetWallet
            ? ui.adminTargetWallet
            : undefined;
    }

    async function syncSovereignOperationsState() {
        if (!browser || !identity.isWalletConnected || !identity.activeAddress) return;
        const bundle = await fetchSovereignOperationsBundle(resolveTargetWallet());
        settlementReceipts = bundle.receipts;
        const filled = operations.reconcileQueuedPairFills(
            (t) => treasury.getAsset(t)?.onChainAtomic || '0'
        );
        for (const f of filled) {
            const r = f.settlementConfig?.pairReserve;
            if (r) {
                await safeDispatch('UPDATE_SETTLEMENT', {
                    id: f.id,
                    config: f.settlementConfig
                });
                await recordPairSettlementActivity({
                    sectorId: f.id,
                    eventType: 'LP_PAIR_FILLED',
                    ticker: r.baseTicker,
                    partnerTicker: r.partnerTicker,
                    amountAtomic: r.heldBaseAtomic,
                    oracleUsdE8: resolveKaspaAssetOracleE8(r.baseTicker).toString()
                });
            }
        }
        treasury.syncPoolAndPendingFromSectors(operations.sectors);
    }

    $effect(() => {
        treasury.syncPoolAndPendingFromSectors(operations.sectors || []);
    });

    async function syncMineableKrc20Vaults() {
        if (!browser) return;
        for (const v of mineableKrc20Vaults) {
            treasury.updateAsset(v.tokenTicker, {
                name: `${v.tokenTicker} (${v.vaultLabel})`,
                assetClass: 'Ecosystem',
                network: 'KAS'
            });
        }
        try {
            const res = await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'GET_FORGE_TOKENOMICS',
                    payload: { includeAllMineableVaults: true }
                })
            });
            if (res.ok) {
                const data = await res.json();
                const remoteList = data?.data?.allMineableVaults;
                if (Array.isArray(remoteList) && remoteList.length > 0) {
                    const merged = new Map<string, MineableKrc20VaultInfo>();
                    for (const v of mineableKrc20Vaults) {
                        merged.set(v.tokenTicker.toUpperCase(), v);
                    }
                    for (const rv of remoteList) {
                        const tick = String(rv.tokenTicker || '').trim().toUpperCase();
                        if (tick) {
                            merged.set(tick, {
                                vaultId: String(rv.vaultId || `vault-${tick}`),
                                tokenTicker: tick,
                                vaultLabel: String(rv.vaultLabel || `${tick} Mining Vault`),
                                totalFundedTokens: Number(rv.totalFundedTokens || 0),
                                remainingVaultTokens: Number(rv.remainingVaultTokens || 0),
                                dailyEmissionTokens: Number(rv.dailyEmissionTokens || 0),
                                distributedTokens: Number(rv.distributedTokens || 0),
                                minHashrateThs: Number(rv.minHashrateThs || 0.1),
                                syndicateSectorEnabled: rv.syndicateSectorEnabled !== false,
                                activeMinersCount: Number(rv.activeMinersCount || 1),
                                status: String(rv.status || 'ACTIVE')
                            });
                            treasury.updateAsset(tick, {
                                name: `${tick} (Mineable KRC-20 Vault)`,
                                assetClass: 'Ecosystem',
                                network: 'KAS'
                            });
                        }
                    }
                    mineableKrc20Vaults = Array.from(merged.values());
                }
            }
        } catch {
            // Ignore transient sync error
        }
    }

    function markMutation() {
        operations.markMutation();
    }

    async function safeDispatch(action: string, payload: unknown) {
        markMutation();
        await operations.dispatchStateAction(action, payload);
        markMutation();
    }

    let activeWorkerMenu = $state<string | null>(null);
    let activeMinerTypePickerWorkerId = $state<string | null>(null);
    let minerTypeSearch = $state('');
    let shimmerTargetId = $state<string | null>(null);

    function triggerShimmer(id: string) {
        shimmerTargetId = id;
        setTimeout(() => {
            if (shimmerTargetId === id) shimmerTargetId = null;
        }, 700);
    }

    async function syncSavedBankRailStatus() {
        if (!browser || !identity.isWalletConnected) return;
        try {
            const res = await fetch('/api/fiat/offramp');
            if (res.ok) {
                const data = await res.json();
                savedBankRailLast4 = data.savedBankRailLast4 || null;
                if (data.savedBankRail) {
                    savedBankRailLabel = data.savedBankRail.bankLabel || 'Primary Operating Account';
                    savedBankRailMethod = data.savedBankRail.payoutMethod || 'ACH';
                }
            }
        } catch {
            // Ignore bank status check error
        }
    }

    let displayedWorkers = $derived(Array.isArray(operations.workers) ? operations.workers : []);
    let displayHashrate = $derived(
        displayedWorkers.reduce((acc, w) => acc + safeFiniteNumber(w?.hashRate, 0), 0)
    );
    let totalShares = $derived(
        displayedWorkers.reduce((acc, w) => acc + safeFiniteNumber(w?.sharesContributed, 0), 0)
    );
    let allocatedBps = $derived(computeTotalAllocatedBps(operations.sectors || []));
    let unallocatedBps = $derived(computeUnallocatedBps(operations.sectors || []));
    let unallocatedPercentage = $derived(bpsToPctNumber(unallocatedBps));
    let siloSectors = $derived(
        (operations.sectors || []).filter((s) => s.routeMode !== 'auto-lp')
    );
    let plantSectors = $derived(
        (operations.sectors || []).filter((s) => s.routeMode === 'auto-lp')
    );
    let dragSectorId = $state<string | null>(null);
    let dropTargetSectorId = $state<string | null>(null);
    let displayedBuckets = $derived<AssetBucketTelemetry[]>(operations.displayedBuckets);

    let vaultByIdAndAsset = $derived.by(() => {
        const byId = new Map<string, VaultLockRecord>();
        const byAsset = new Map<string, VaultLockRecord>();
        for (const v of operations.vaultLocks || []) {
            byId.set(v.vaultId, v);
            const assetKey = String(v.targetAsset || '').toUpperCase();
            if (assetKey && !byAsset.has(assetKey)) byAsset.set(assetKey, v);
        }
        return { byId, byAsset };
    });

    let latestReceiptByAsset = $derived.by(() => {
        const map = new Map<string, SettlementReceiptRecord>();
        for (const r of settlementReceipts) {
            const tick = String(r.targetAsset || '').toUpperCase();
            if (tick && !map.has(tick)) map.set(tick, r);
        }
        return map;
    });

    function findVaultForSector(sector: ViewSector): VaultLockRecord | null {
        if (sector.vaultId && vaultByIdAndAsset.byId.has(sector.vaultId)) {
            return vaultByIdAndAsset.byId.get(sector.vaultId) || null;
        }
        const ticker = String(sector.settlementConfig?.targetAsset?.ticker || '').toUpperCase();
        return vaultByIdAndAsset.byAsset.get(ticker) || null;
    }

    function findLatestReceiptForSector(sector: ViewSector): SettlementReceiptRecord | null {
        const ticker = String(sector.settlementConfig?.targetAsset?.ticker || '').toUpperCase();
        return latestReceiptByAsset.get(ticker) || null;
    }

    let displayHashHistory = $state<number[]>([]);
    let kasHistory = $state<number[]>([]);

    async function loadHashChartHistory(tf: ChartTimeframe = hashChartTimeframe) {
        if (!browser || !identity.isWalletConnected) return;
        try {
            const targetParam =
                identity.isCorporateAdmin && ui.adminModeActive && ui.adminTargetWallet
                    ? `&target=${encodeURIComponent(ui.adminTargetWallet)}`
                    : '';
            const res = await fetch(
                `/api/state/stats?timeframe=${encodeURIComponent(tf)}${targetParam}`
            );
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.hashrateHistoryThs) && data.hashrateHistoryThs.length > 0) {
                    displayHashHistory = data.hashrateHistoryThs.slice(-60);
                    return;
                }
            }
        } catch {
            // Fallback below
        }
        if (displayHashrate > 0 && displayHashHistory.length === 0) {
            displayHashHistory = Array.from({ length: 20 }, () => displayHashrate);
        }
    }

    async function loadPriceChartHistory(tf: ChartTimeframe = priceChartTimeframe) {
        if (!browser) return;
        try {
            const res = await fetch(`/api/prices?history=KAS&timeframe=${encodeURIComponent(tf)}`);
            if (res.status === 503) {
                kasHistory = [];
                treasury.markOracleUnavailable();
                return;
            }
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.points) && data.points.length > 1) {
                    kasHistory = data.points;
                    if (typeof data.deltaPct === 'number') {
                        priceTimeframeDelta = data.deltaPct;
                    }
                    return;
                }
            }
        } catch {
            // Fail closed on oracle outage
        }
        const spot = treasury.getAsset('KAS').spotPrice;
        if (!livePricingUnavailable && spot > 0 && kasHistory.length === 0) {
            kasHistory = Array.from({ length: 24 }, () => spot);
        } else if (livePricingUnavailable || spot <= 0) {
            kasHistory = [];
        }
    }

    $effect(() => {
        if (
            browser &&
            identity.isWalletConnected &&
            (identity.activeAddress || ui.adminTargetWallet)
        ) {
            syncSovereignOperationsState();
            syncSavedBankRailStatus();
            syncMineableKrc20Vaults();
            loadHashChartHistory(hashChartTimeframe);
            loadPriceChartHistory(priceChartTimeframe);
        }
    });

    function computeLiveKasPerThPerDay(): number {
        if (operations.networkDifficulty > 0 && operations.blockRewardKas > 0) {
            const hashesPerThPerDay = 1e12 * 86400.0;
            const expectedBlockHashes = operations.networkDifficulty * 2.0 * KASPA_DIFF_CONSTANT;
            if (expectedBlockHashes > 0) {
                const grossKasPerThDay =
                    (hashesPerThPerDay * operations.blockRewardKas) / expectedBlockHashes;
                return Math.max(0, grossKasPerThDay * (1.0 - POOL_FEE_RATE));
            }
        }
        const anchorMs = Date.UTC(2024, 4, 5, 0, 0, 0);
        const currentMs = Date.now();
        const monthsElapsed = Math.max(
            0,
            (currentMs - anchorMs) / (1000 * 86400 * 30.436875)
        );
        const kasPerSecondGlobal = 103.83 * Math.pow(0.5, monthsElapsed / 12);
        const dailyGlobalKas = kasPerSecondGlobal * 86400;
        const baselineNetworkTh = Math.max(1_150_000_000, operations.globalNetworkHashrate || 0);
        return Math.max(0.5, (dailyGlobalKas / baselineNetworkTh) * (1.0 - POOL_FEE_RATE));
    }

    function estimateSectorDailyKas(sector: ViewSector): number {
        const lpMultiplier = sector.routeMode === 'auto-lp' ? 1.18 : 1.0;
        const consensusEstimate = operations.estimateSectorDailyKas(sector, displayHashrate);
        if (consensusEstimate > 0) {
            return consensusEstimate * lpMultiplier;
        }
        const bps = readSectorAllocationBps(sector);
        const pctRatio = bps / 10_000;
        const catalogFallbackTh = displayedWorkers.reduce((sum, w) => {
            const spec = matchCatalogSpecForWorker(w);
            return sum + (spec ? spec.hashrateTh : 0);
        }, 0);
        const effectiveTh =
            displayHashrate > 0
                ? displayHashrate * pctRatio
                : catalogFallbackTh > 0
                  ? catalogFallbackTh * pctRatio
                  : 0;
        if (effectiveTh <= 0) return 0;
        return Math.max(0, effectiveTh * computeLiveKasPerThPerDay() * lpMultiplier);
    }

    function estimateSectorDailyUsd(sector: ViewSector): number {
        if (livePricingUnavailable) return 0;
        const kasSpot = treasury.getAsset('KAS').spotPrice;
        if (!Number.isFinite(kasSpot) || kasSpot <= 0) return 0;
        return estimateSectorDailyKas(sector) * kasSpot;
    }

    function handleSectorDragStart(e: DragEvent, sector: Sector) {
        dragSectorId = sector.id;
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', sector.id);
        }
    }

    function handleSectorDragEnd() {
        dragSectorId = null;
        dropTargetSectorId = null;
    }

    function handleSectorDragOver(e: DragEvent, id: string) {
        e.preventDefault();
        dropTargetSectorId = id;
    }

    function handleSectorDragLeave() {
        dropTargetSectorId = null;
    }

    async function handleSectorDrop(e: DragEvent, targetId: string) {
        e.preventDefault();
        const sourceId = dragSectorId;
        dragSectorId = null;
        dropTargetSectorId = null;
        if (!sourceId || sourceId === targetId) return;
        const newArray = [...operations.sectors];
        const sourceIdx = newArray.findIndex((s) => s.id === sourceId);
        const targetIdx = newArray.findIndex((s) => s.id === targetId);
        if (sourceIdx !== -1 && targetIdx !== -1) {
            const [moved] = newArray.splice(sourceIdx, 1);
            newArray.splice(targetIdx, 0, moved);
            operations.sectors = newArray;
            await safeDispatch('REORDER_SECTORS', newArray);
        }
    }

    async function toggleSectorWidth(id: string) {
        operations.sectors = operations.sectors.map((s) => {
            if (s.id === id) {
                const newWidth = s.width === 6 ? 12 : 6;
                return { ...s, width: newWidth };
            }
            return s;
        });
        await safeDispatch('REORDER_SECTORS', operations.sectors);
    }

    async function snapSectorMaxRemaining(id: string) {
        markMutation();
        let updatedBps = 0;
        operations.sectors = operations.sectors.map((s) => {
            if (s.id !== id) return s;
            const otherBps = operations.sectors.reduce(
                (acc, sec) => (sec.id === id ? acc : acc + readSectorAllocationBps(sec)),
                0
            );
            updatedBps = Math.max(0, 10_000 - otherBps);
            return {
                ...s,
                allocationBps: updatedBps,
                allocationPercentage: bpsToPctNumber(updatedBps)
            } as ViewSector;
        });
        triggerShimmer(`sector_${id}`);
        ui.triggerMicroBadge(`sector_${id}`, 'ROUTED 100% ✓', '#18C6A5');
        await safeDispatch(
            'UPDATE_SECTOR_ALLOCATION',
            buildUpdateSectorAllocationPayload(id, updatedBps)
        );
    }

    let isSectorModalOpen = $state(false);
    $effect(() => {
        ui.syncSubOverlay('ops_new_split', isSectorModalOpen, () => {
            isSectorModalOpen = false;
        });
    });
    let draftSectorName = $state('');
    let draftSectorPct = $state(0);
    let draftSectorMax = $state(0);
    let draftSelectedAssets = $state<PlantAssetTarget[]>([]);
    let editSelectedAssets = $state<PlantAssetTarget[]>([]);
    let draftIsSyndicateSector = $state(false);

    const defaultSettlement: SettlementConfig = {
        targetAsset: treasury.registry[0],
        targetAssets: [],
        plantWeights: {},
        plantPair: 'KAS',
        payoutAddress: '',
        autoPayout: true,
        mode: 'epoch',
        threshold: DEFAULT_RESERVE_PAYOUT_KAS,
        appointmentDate: '',
        appointmentTime: '17:00'
    };

    let draftSettlementConfig = $state<SettlementConfig>({ ...defaultSettlement });
    let settlementModalSilo = $state<Sector | null>(null);
    let editSectorName = $state('');
    let editSettlementParams = $state<SettlementConfig>({ ...defaultSettlement });
    let isSigningSettlement = $state(false);

    function resolveChainAddressForTicker(ticker: string): string {
        const clean = ticker.toUpperCase();
        if (clean === 'USD') {
            return savedBankRailLast4
                ? `${savedBankRailLabel} (*${savedBankRailLast4} • ${savedBankRailMethod})`
                : 'Bank Rail Account (ACH / Wire)';
        }
        const keys = identity.sovereignKeys;
        if (!keys) return identity.activeAddress || '';
        switch (clean) {
            case 'KAS':
                return keys.kaspa?.address || identity.activeAddress || '';
            case 'BTC':
                return keys.bitcoin?.address || identity.activeAddress || '';
            case 'ETH':
            case 'USDC':
            case 'USDT':
            case 'ARB':
            case 'BASE':
            case 'SPY':
            case 'QQQ':
            case 'NVDA':
            case 'AAPL':
            case 'TSLA':
            case 'AMD':
            case 'TSM':
            case 'AVGO':
            case 'XLE':
            case 'XAU':
            case 'XAG':
            case 'USTB':
                return keys.ethereum?.address || identity.activeAddress || '';
            case 'SOL':
                return keys.solana?.address || identity.activeAddress || '';
            case 'DOGE':
                return keys.doge?.address || identity.activeAddress || '';
            case 'XRP':
                return keys.xrp?.address || identity.activeAddress || '';
            case 'POL':
                return keys.polygon?.address || keys.ethereum?.address || identity.activeAddress || '';
            case 'AVAX':
                return keys.avalanche?.address || keys.ethereum?.address || identity.activeAddress || '';
            case 'SUI':
                return keys.sui?.address || identity.activeAddress || '';
            case 'TRX':
                return keys.tron?.address || identity.activeAddress || '';
            case 'ZEC':
                return keys.zcash?.address || identity.activeAddress || '';
            default:
                return identity.activeAddress || '';
        }
    }

    function syncConfigFromAssetList(
        list: PlantAssetTarget[],
        cfg: SettlementConfig
    ): { updatedList: PlantAssetTarget[]; isPlant: boolean } {
        const normalized = normalizePlantTargets(list);
        const isPlant = normalized.length >= 2;
        cfg.targetAssets = normalized;
        if (isPlant) {
            const primarySecondary = normalized[1] || normalized[0];
            cfg.targetAsset = primarySecondary;
            const weightsMap: Record<string, number> = {};
            for (const item of normalized) {
                weightsMap[item.ticker] = item.weightPct;
            }
            cfg.plantWeights = weightsMap;
            cfg.plantPair = normalized.map((i) => i.ticker).join('/');
            cfg.mode = 'epoch';
            cfg.payoutAddress = resolveChainAddressForTicker(primarySecondary.ticker);
        } else {
            const single = normalized[0] || toPlantTargetSpec(treasury.getAsset('KAS'), 100.0);
            const singleTick = String(single.ticker || 'KAS').toUpperCase();
            cfg.targetAsset = single;
            cfg.plantWeights = { [singleTick]: 100.0 };
            cfg.plantPair = singleTick;
            cfg.payoutAddress = resolveChainAddressForTicker(singleTick);
            if (singleTick !== 'KAS') {
                cfg.mode = 'epoch';
            }
        }
        return { updatedList: normalized, isPlant };
    }

    function setSingleTargetAsset(targetMode: 'create' | 'edit', asset: UnifiedAsset) {
        const singleList = [toPlantTargetSpec(asset, 100.0)];
        const cleanTicker = asset.ticker.toUpperCase();
        const isMineable = mineableVaultMap.has(cleanTicker);
        if (targetMode === 'create') {
            const res = syncConfigFromAssetList(singleList, draftSettlementConfig);
            draftSelectedAssets = res.updatedList;
            draftIsSyndicateSector = isMineable;
            draftSectorName = cleanTicker;
            if (initialPairSwapPayTicker.toUpperCase() === cleanTicker) {
                initialPairSwapPayTicker = cleanTicker === 'KAS' ? 'USDC' : 'KAS';
            }
        } else {
            const res = syncConfigFromAssetList(singleList, editSettlementParams);
            editSelectedAssets = res.updatedList;
        }
    }

    function addOrToggleAssetInSector(
        targetMode: 'create' | 'edit',
        asset: UnifiedAsset,
        actionMode:
            | 'replace_primary'
            | 'add_secondary'
            | 'replace_pair_slot_0'
            | 'replace_pair_slot_1' = 'replace_primary'
    ) {
        const currentList =
            targetMode === 'create' ? [...draftSelectedAssets] : [...editSelectedAssets];
        const cleanTicker = asset.ticker.toUpperCase();

        if (
            targetMode === 'create' &&
            (actionMode === 'replace_pair_slot_0' || actionMode === 'replace_pair_slot_1')
        ) {
            const slotIdx = actionMode === 'replace_pair_slot_0' ? 0 : 1;
            const otherIdx = slotIdx === 0 ? 1 : 0;
            const list =
                currentList.length >= 2
                    ? [...currentList]
                    : [
                          toPlantTargetSpec(treasury.getAsset('KAS'), 50.0),
                          toPlantTargetSpec(treasury.getAsset('USDC'), 50.0)
                      ];
            const existingIdx = list.findIndex((i) => i.ticker.toUpperCase() === cleanTicker);
            if (existingIdx !== -1 && existingIdx !== slotIdx) {
                const temp = list[slotIdx];
                list[slotIdx] = list[existingIdx];
                list[existingIdx] = temp;
            } else {
                list[slotIdx] = toPlantTargetSpec(asset, list[slotIdx]?.weightPct || 50.0);
            }
            const syncRes = syncConfigFromAssetList(list, draftSettlementConfig);
            draftSelectedAssets = syncRes.updatedList;
            draftIsSyndicateSector = false;
            draftSectorName = syncRes.updatedList.map((i) => i.ticker).join(' / ');
            if (otherIdx >= 0 && initialPairSwapPayTicker.toUpperCase() === cleanTicker) {
                const altPay = syncRes.updatedList.find((i) => i.ticker.toUpperCase() !== cleanTicker)?.ticker;
                if (altPay) initialPairSwapPayTicker = altPay;
            }
            return;
        }

        if (currentList.length === 1 && actionMode === 'replace_primary') {
            setSingleTargetAsset(targetMode, asset);
            return;
        }
        const existingIdx = currentList.findIndex(
            (i) => i.ticker.toUpperCase() === cleanTicker
        );
        if (existingIdx !== -1) {
            if (currentList.length >= 2 && existingIdx === 0) {
                return;
            }
            const filtered = currentList.filter(
                (i) => i.ticker.toUpperCase() !== cleanTicker
            );
            const nextList =
                filtered.length === 0
                    ? [toPlantTargetSpec(treasury.getAsset('KAS'), 100.0)]
                    : filtered;
            if (targetMode === 'create') {
                const syncRes = syncConfigFromAssetList(nextList, draftSettlementConfig);
                draftSelectedAssets = syncRes.updatedList;
                draftSectorName = syncRes.updatedList.map((i) => i.ticker).join(' / ');
            } else {
                editSelectedAssets = syncConfigFromAssetList(
                    nextList,
                    editSettlementParams
                ).updatedList;
            }
            return;
        }
        const combined = [...currentList.slice(0, 3), toPlantTargetSpec(asset, 0)];
        if (targetMode === 'create') {
            const syncRes = syncConfigFromAssetList(
                combined,
                draftSettlementConfig
            );
            draftSelectedAssets = syncRes.updatedList;
            draftIsSyndicateSector = false;
            draftSectorName = syncRes.updatedList.map((i) => i.ticker).join(' / ');
        } else {
            editSelectedAssets = syncConfigFromAssetList(
                combined,
                editSettlementParams
            ).updatedList;
        }
    }

    function removeAssetFromSector(targetMode: 'create' | 'edit', ticker: string) {
        const clean = ticker.toUpperCase();
        const currentList =
            targetMode === 'create' ? [...draftSelectedAssets] : [...editSelectedAssets];
        let nextList: PlantAssetTarget[];
        if (targetMode === 'create' && sectorModalMode === 'pair' && currentList.length > 2) {
            nextList = currentList.filter((i) => i.ticker.toUpperCase() !== clean);
        } else {
            const remainingSecondaries = currentList.filter(
                (i) => i.ticker.toUpperCase() !== clean && i.ticker.toUpperCase() !== 'KAS'
            );
            if (remainingSecondaries.length === 0) {
                nextList = [toPlantTargetSpec(treasury.getAsset('KAS'), 100.0)];
            } else if (
                remainingSecondaries.length === 1 &&
                currentList.length === 2 &&
                clean === 'KAS'
            ) {
                nextList = [{ ...remainingSecondaries[0], weightPct: 100.0 }];
            } else {
                const equalW = Number((50.0 / remainingSecondaries.length).toFixed(2));
                nextList = [
                    toPlantTargetSpec(treasury.getAsset('KAS'), 50.0),
                    ...remainingSecondaries.map((s) => ({ ...s, weightPct: equalW }))
                ];
            }
        }
        if (targetMode === 'create') {
            const syncRes = syncConfigFromAssetList(
                nextList,
                draftSettlementConfig
            );
            draftSelectedAssets = syncRes.updatedList;
            draftSectorName =
                syncRes.updatedList.length >= 2
                    ? syncRes.updatedList.map((i) => i.ticker).join(' / ')
                    : syncRes.updatedList[0]?.ticker || 'KAS';
        } else {
            editSelectedAssets = syncConfigFromAssetList(
                nextList,
                editSettlementParams
            ).updatedList;
        }
    }

    function equalizeSecondaryWeights(targetMode: 'create' | 'edit') {
        const currentList =
            targetMode === 'create' ? [...draftSelectedAssets] : [...editSelectedAssets];
        if (currentList.length < 2) return;
        const secondaries = currentList.filter((i) => i.ticker.toUpperCase() !== 'KAS');
        const eq = Number((50.0 / Math.max(1, secondaries.length)).toFixed(2));
        const reset = [
            toPlantTargetSpec(treasury.getAsset('KAS'), 50.0),
            ...secondaries.map((s) => ({ ...s, weightPct: eq }))
        ];
        if (targetMode === 'create') {
            draftSelectedAssets = syncConfigFromAssetList(
                reset,
                draftSettlementConfig
            ).updatedList;
        } else {
            editSelectedAssets = syncConfigFromAssetList(
                reset,
                editSettlementParams
            ).updatedList;
        }
    }

    function adjustSecondaryPlantWeight(
        targetMode: 'create' | 'edit',
        changedTicker: string,
        rawNewPct: number
    ) {
        const currentList =
            targetMode === 'create' ? [...draftSelectedAssets] : [...editSelectedAssets];
        if (currentList.length < 2) return;
        const secondaries = currentList.filter((i) => i.ticker.toUpperCase() !== 'KAS');
        if (secondaries.length <= 1) return;
        const clampedTarget = Math.max(1.0, Math.min(49.0, rawNewPct));
        const remainingForOthers = Math.max(0.5, 50.0 - clampedTarget);
        const others = secondaries.filter(
            (s) => s.ticker.toUpperCase() !== changedTicker.toUpperCase()
        );
        const othersOldSum = others.reduce((sum, o) => sum + Math.max(0.1, o.weightPct), 0);
        const updatedSecondaries = secondaries.map((s) => {
            if (s.ticker.toUpperCase() === changedTicker.toUpperCase()) {
                return { ...s, weightPct: Number(clampedTarget.toFixed(2)) };
            }
            const share =
                othersOldSum > 0
                    ? (Math.max(0.1, s.weightPct) / othersOldSum) * remainingForOthers
                    : remainingForOthers / Math.max(1, others.length);
            return { ...s, weightPct: Number(share.toFixed(2)) };
        });
        const nextList = [
            toPlantTargetSpec(treasury.getAsset('KAS'), 50.0),
            ...updatedSecondaries
        ];
        if (targetMode === 'create') {
            draftSelectedAssets = syncConfigFromAssetList(
                nextList,
                draftSettlementConfig
            ).updatedList;
        } else {
            editSelectedAssets = syncConfigFromAssetList(
                nextList,
                editSettlementParams
            ).updatedList;
        }
    }

    function updateDraftPct(valStr: string) {
        const bps = parsePctInputToBps(valStr, unallocatedBps);
        draftSectorPct = bpsToPctNumber(bps);
    }

    function updateDraftHash(valStr: string) {
        const hashVal = Math.max(0, Number(valStr) || 0);
        const maxHash = (displayHashrate * unallocatedBps) / 10_000;
        const clampedHash = Math.min(hashVal, maxHash);
        const pctStr = displayHashrate > 0 ? ((clampedHash / displayHashrate) * 100).toFixed(2) : '0';
        const bps = parsePctInputToBps(pctStr, unallocatedBps);
        draftSectorPct = bpsToPctNumber(bps);
    }

    function handleSectorInputPct(id: string, valStr: string) {
        markMutation();
        operations.sectors = operations.sectors.map((s) => {
            if (s.id !== id) return s;
            const otherBps = operations.sectors.reduce(
                (acc, sec) => (sec.id === id ? acc : acc + readSectorAllocationBps(sec)),
                0
            );
            const maxBps = Math.max(0, 10_000 - otherBps);
            const nextBps = parsePctInputToBps(valStr, maxBps);
            return {
                ...s,
                allocationBps: nextBps,
                allocationPercentage: bpsToPctNumber(nextBps)
            } as ViewSector;
        });
    }

    function handleSectorInputHash(id: string, hashStr: string) {
        markMutation();
        const hashVal = Math.max(0, Number(hashStr) || 0);
        operations.sectors = operations.sectors.map((s) => {
            if (s.id !== id) return s;
            const otherBps = operations.sectors.reduce(
                (acc, sec) => (sec.id === id ? acc : acc + readSectorAllocationBps(sec)),
                0
            );
            const maxBps = Math.max(0, 10_000 - otherBps);
            const maxHash = (displayHashrate * maxBps) / 10_000;
            const cleanHash = Math.min(hashVal, maxHash);
            const pctStr = displayHashrate > 0 ? ((cleanHash / displayHashrate) * 100).toFixed(2) : '0';
            const nextBps = parsePctInputToBps(pctStr, maxBps);
            return {
                ...s,
                allocationBps: nextBps,
                allocationPercentage: bpsToPctNumber(nextBps)
            } as ViewSector;
        });
    }

    function handleSectorSliderInput(id: string, e: Event) {
        markMutation();
        const input = e.target as HTMLInputElement;
        operations.sectors = operations.sectors.map((s) => {
            if (s.id !== id) return s;
            const otherBps = operations.sectors.reduce(
                (acc, sec) => (sec.id === id ? acc : acc + readSectorAllocationBps(sec)),
                0
            );
            const maxBps = Math.max(0, 10_000 - otherBps);
            const nextBps = parsePctInputToBps(input.value, maxBps);
            const nextPct = bpsToPctNumber(nextBps);
            if (parsePctInputToBps(input.value, 10_000) > maxBps) {
                input.value = formatBpsToPctDisplay(nextBps, 1, true);
            }
            return {
                ...s,
                allocationBps: nextBps,
                allocationPercentage: nextPct
            } as ViewSector;
        });
    }

    async function handleSectorSliderChange(id: string) {
        await commitSectorUpdate(id);
    }

    async function commitSectorUpdate(id: string) {
        const sector = operations.sectors.find((s) => s.id === id);
        if (sector) {
            const bps = readSectorAllocationBps(sector);
            if (allocatedBps >= 9995) {
                ui.triggerMicroBadge(`sector_${id}`, 'ROUTED 100% ✓', '#18C6A5');
            }
            await safeDispatch(
                'UPDATE_SECTOR_ALLOCATION',
                buildUpdateSectorAllocationPayload(id, bps)
            );
        }
    }

    function registerSectorAssetsInTreasury(assets: PlantAssetTarget[]) {
        for (const item of assets) {
            const ticker = String(item?.ticker || '').trim().toUpperCase();
            if (!ticker) continue;
            treasury.registerDiscoveredAsset(
                {
                    ticker,
                    name: item.name || ticker,
                    assetClass: item.assetClass || 'Crypto',
                    network: item.network || resolveTargetNetworkForAsset(ticker),
                    contract: item.contract
                },
                false
            );
        }
    }

    function openSectorModal(mode: 'split' | 'pair' = 'split') {
        if (mode === 'split' && unallocatedBps <= 0) return;
        sectorModalMode = mode;
        fundTargetSectorId = null;
        pairSubmitError = null;
        syncSavedBankRailStatus();
        syncMineableKrc20Vaults();
        treasury.syncRwaOraclePrices();
        draftSectorMax = bpsToPctNumber(unallocatedBps);
        draftIsSyndicateSector = false;
        draftPairFeeBps = DEFAULT_PAIR_FEE_RATE_BPS;
        draftPairTerm = DEFAULT_PAIR_TERM;
        initialPairSwapAmount = '';
        splitWalletBoostOpen = false;
        const kasAssetObj = treasury.getAsset('KAS');
        if (mode === 'pair') {
            const siloAssetObj = treasury.getAsset('SILO');
            const initialPairList = [
                toPlantTargetSpec(kasAssetObj, 50.0),
                toPlantTargetSpec(siloAssetObj, 50.0)
            ];
            pairFundMode = 'WALLET';
            draftSectorPct = 0;
            initialPairSwapPayTicker = 'KAS';
            pairPartnerTicker = 'SILO';
            draftSectorName = 'KAS / SILO';
            draftSettlementConfig = {
                ...defaultSettlement,
                threshold: DEFAULT_RESERVE_PAYOUT_KAS,
                mode: 'epoch',
                payoutAddress: resolveChainAddressForTicker('SILO'),
                targetAsset: siloAssetObj as unknown as SettlementConfig['targetAsset'],
                targetAssets: initialPairList,
                plantWeights: { KAS: 50.0, SILO: 50.0 },
                plantPair: 'KAS/SILO',
                feeRateBps: DEFAULT_PAIR_FEE_RATE_BPS,
                swapSpreadBps: DEFAULT_PAIR_FEE_RATE_BPS,
                rebalanceThresholdBps: DEFAULT_PAIR_FEE_RATE_BPS,
                term: DEFAULT_PAIR_TERM,
                targetDurationDays: null,
                ownerExit24x7: true
            };
            draftSelectedAssets = initialPairList;
        } else {
            draftSectorPct = unallocatedBps > 0 ? bpsToPctNumber(unallocatedBps) : 0;
            initialPairSwapPayTicker = 'USDC';
            draftSectorName = 'KAS';
            draftSettlementConfig = {
                ...defaultSettlement,
                threshold: DEFAULT_RESERVE_PAYOUT_KAS,
                payoutAddress: resolveChainAddressForTicker('KAS'),
                targetAsset: kasAssetObj as unknown as SettlementConfig['targetAsset'],
                targetAssets: [toPlantTargetSpec(kasAssetObj, 100.0)],
                plantWeights: { KAS: 100.0 },
                plantPair: 'KAS'
            };
            draftSelectedAssets = [toPlantTargetSpec(kasAssetObj, 100.0)];
        }
        isSectorModalOpen = true;
    }

    function openFundPairModal(sector: Sector) {
        if (!identity.isWalletConnected || !identity.activeAddress) {
            ui.showWalletModal = true;
            return;
        }
        const reserve = sector.settlementConfig?.pairReserve;
        const targets = hydrateSectorTargetAssets(sector);
        const baseTick = reserve?.baseTicker || targets[0]?.ticker || 'KAS';
        const partnerTick = reserve?.partnerTicker || targets[1]?.ticker || 'SILO';
        const currentPct = bpsToPctNumber(readSectorAllocationBps(sector));
        sectorModalMode = 'pair';
        fundTargetSectorId = sector.id;
        pairSubmitError = null;
        draftSectorMax = Math.min(100, bpsToPctNumber(unallocatedBps) + currentPct);
        draftSectorPct = currentPct;
        draftPairFeeBps = reserve?.feeRateBps || 100;
        initialPairSwapPayTicker = baseTick;
        pairPartnerTicker = partnerTick;
        initialPairSwapAmount = '';
        isSectorModalOpen = true;
    }

    async function handleCreateOrFundPair(params: {
        baseTicker: string;
        partnerTicker: string;
        baseAmount: string;
        feeRateBps: PairFeeRateBps;
        allocationPct: number;
    }) {
        if (!identity.isWalletConnected || !identity.activeAddress) {
            ui.showWalletModal = true;
            return;
        }
        pairSubmitError = null;
        isSubmittingPair = true;
        try {
            const res = await executeSharedWalletPair({
                baseTicker: params.baseTicker,
                partnerTicker: params.partnerTicker,
                baseAmountInput: params.baseAmount,
                feeRateBps: params.feeRateBps,
                allocationPct: params.allocationPct,
                refundKaspaAddress: identity.activeAddress,
                targetWallet: resolveTargetWallet()
            });

            if (fundTargetSectorId) {
                const existing = operations.sectors.find((s) => s.id === fundTargetSectorId);
                if (existing) {
                    const prev = existing.settlementConfig?.pairReserve;
                    const nextBase = (
                        BigInt(prev?.baseBalanceAtomic || '0') +
                        BigInt(res.reserve.baseBalanceAtomic)
                    ).toString();
                    const nextPartner = (
                        BigInt(prev?.partnerBalanceAtomic || '0') +
                        BigInt(res.reserve.partnerBalanceAtomic)
                    ).toString();
                    const nextStatus =
                        prev?.status === 'ACTIVE' && res.reserve.status === 'ACTIVE'
                            ? 'ACTIVE'
                            : res.reserve.status;
                    const mergedReserve = {
                        ...res.reserve,
                        status: nextStatus,
                        baseBalanceAtomic: nextBase,
                        partnerBalanceAtomic: nextPartner,
                        vaultId: res.reserve.vaultId || prev?.vaultId
                    };
                    const nextConfig: SettlementConfig = {
                        ...existing.settlementConfig,
                        feeRateBps: params.feeRateBps,
                        swapSpreadBps: params.feeRateBps,
                        rebalanceThresholdBps: params.feeRateBps,
                        pairReserve: mergedReserve
                    };
                    operations.sectors = operations.sectors.map((s) =>
                        s.id === fundTargetSectorId
                            ? {
                                  ...s,
                                  allocationBps: res.allocationBps,
                                  allocationPercentage: bpsToPctNumber(res.allocationBps),
                                  settlementConfig: nextConfig
                              }
                            : s
                    );
                    await safeDispatch('UPDATE_SETTLEMENT', {
                        id: existing.id,
                        config: nextConfig
                    });
                    await safeDispatch(
                        'UPDATE_SECTOR_ALLOCATION',
                        buildUpdateSectorAllocationPayload(existing.id, res.allocationBps)
                    );
                    if (mergedReserve.status === 'ACTIVE') {
                        await recordPairSettlementActivity({
                            sectorId: existing.id,
                            eventType: 'LP_PAIR_ACTIVE',
                            ticker: mergedReserve.baseTicker,
                            partnerTicker: mergedReserve.partnerTicker,
                            amountAtomic: res.reserve.baseBalanceAtomic,
                            oracleUsdE8: resolveKaspaAssetOracleE8(mergedReserve.baseTicker).toString()
                        });
                    }
                    treasury.syncPoolAndPendingFromSectors(operations.sectors);
                    isSectorModalOpen = false;
                    fundTargetSectorId = null;
                    return;
                }
            }

            const id = Math.random().toString(36).substring(2, 8).toUpperCase();
            const partnerAssetObj = treasury.getAsset(params.partnerTicker);
            const configCopy: SettlementConfig = {
                ...defaultSettlement,
                mode: 'epoch',
                payoutAddress: resolveChainAddressForTicker(params.partnerTicker),
                targetAsset: partnerAssetObj as unknown as SettlementConfig['targetAsset'],
                targetAssets: res.targetAssets,
                plantWeights: { [params.baseTicker]: 50, [params.partnerTicker]: 50 },
                plantPair: `${params.baseTicker}/${params.partnerTicker}`,
                feeRateBps: params.feeRateBps,
                swapSpreadBps: params.feeRateBps,
                rebalanceThresholdBps: params.feeRateBps,
                term: DEFAULT_PAIR_TERM,
                targetDurationDays: null,
                ownerExit24x7: true,
                pairReserve: res.reserve
            };
            const newSector: ViewSector = {
                id,
                name: `${params.baseTicker} / ${params.partnerTicker}`,
                allocationBps: res.allocationBps,
                allocationPercentage: bpsToPctNumber(res.allocationBps),
                routeMode: 'auto-lp',
                settlementConfig: configCopy,
                pendingKaspa: 0,
                width: 6
            };
            operations.sectors = [...operations.sectors, newSector];
            treasury.syncPoolAndPendingFromSectors(operations.sectors);
            isSectorModalOpen = false;
            await safeDispatch('ADD_SECTOR', newSector);
            if (res.reserve.status === 'ACTIVE') {
                await recordPairSettlementActivity({
                    sectorId: id,
                    eventType: 'LP_PAIR_ACTIVE',
                    ticker: res.reserve.baseTicker,
                    partnerTicker: res.reserve.partnerTicker,
                    amountAtomic: res.reserve.baseBalanceAtomic,
                    oracleUsdE8: resolveKaspaAssetOracleE8(res.reserve.baseTicker).toString()
                });
            }
        } catch (err: unknown) {
            pairSubmitError =
                err instanceof Error ? err.message : LIVE_PRICING_UNAVAILABLE_MESSAGE;
        } finally {
            isSubmittingPair = false;
        }
    }

    async function handleCancelOrWithdrawPair(
        sector: Sector,
        mode: 'cancel' | 'withdraw'
    ) {
        await cancelOrWithdrawPairSector({
            sector,
            mode,
            targetWallet: resolveTargetWallet()
        });
        operations.sectors = operations.sectors.filter((s) => s.id !== sector.id);
        treasury.syncPoolAndPendingFromSectors(operations.sectors);
        await safeDispatch('DELETE_SECTOR', { id: sector.id });
    }

    async function createSector() {
        const { updatedList, isPlant } = syncConfigFromAssetList(
            draftSelectedAssets,
            draftSettlementConfig
        );
        const isPairCreation = isPlant || sectorModalMode === 'pair';
        const effectiveDraftPct =
            isPairCreation && pairFundMode === 'WALLET' ? 0 : draftSectorPct;
        const nextBps = parsePctInputToBps(effectiveDraftPct, unallocatedBps);
        const pendingSwapPay = initialPairSwapPayTicker;
        const pendingSwapAmt = initialPairSwapAmount.trim();
        const shouldExecuteWalletSwap = isPairCreation
            ? (pairFundMode === 'WALLET' || pairFundMode === 'BOTH') &&
              Boolean(pendingSwapAmt) &&
              Number(pendingSwapAmt) > 0
            : splitWalletBoostOpen && Boolean(pendingSwapAmt) && Number(pendingSwapAmt) > 0;
        if (!isPairCreation && nextBps <= 0 && !shouldExecuteWalletSwap) return;
        const finalBps = Math.max(0, nextBps);
        const id = Math.random().toString(36).substring(2, 8).toUpperCase();
        draftSelectedAssets = updatedList;
        registerSectorAssetsInTreasury(updatedList);
        const draftMineable = !isPlant
            ? mineableVaultMap.get(
                  (draftSettlementConfig.targetAsset?.ticker || '').toUpperCase()
              ) || null
            : null;
        const finalName = isPairCreation
            ? updatedList.map((i) => i.ticker.toUpperCase()).join(' / ')
            : (draftSettlementConfig.targetAsset?.ticker || updatedList[0]?.ticker || 'KAS').toUpperCase();
        const routeMode: RouteMode = isPairCreation
            ? 'auto-lp'
            : draftSettlementConfig.targetAsset.ticker === 'KAS'
              ? 'hold'
              : 'swap';
        const configCopy = JSON.parse(JSON.stringify(draftSettlementConfig)) as SettlementConfig;
        if (isPairCreation) {
            const termPreset = PAIR_TERM_PRESETS.find((t) => t.id === draftPairTerm);
            configCopy.feeRateBps = draftPairFeeBps;
            configCopy.swapSpreadBps = draftPairFeeBps;
            configCopy.rebalanceThresholdBps = draftPairFeeBps;
            configCopy.term = draftPairTerm;
            configCopy.targetDurationDays = termPreset?.days ?? null;
            configCopy.ownerExit24x7 = true;
        }
        if (!isPairCreation && draftMineable) {
            configCopy.isMineableKrc20 = true;
            configCopy.syndicateVault = draftIsSyndicateSector;
            configCopy.dailyVaultEmission = draftMineable.dailyEmissionTokens;
        }
        const newSector: ViewSector = {
            id,
            name: finalName,
            allocationBps: finalBps,
            allocationPercentage: bpsToPctNumber(finalBps),
            routeMode,
            settlementConfig: configCopy,
            pendingKaspa: 0,
            width: 6
        };
        operations.sectors = [...operations.sectors, newSector];
        isSectorModalOpen = false;
        triggerShimmer(`sector_${id}`);
        ui.triggerMicroBadge(
            `sector_${id}`,
            routeMode === 'auto-lp'
                ? 'PAIR ARMED ✓'
                : draftMineable
                  ? 'SYNDICATE SPLIT ARMED ✓'
                  : 'SPLIT DEPLOYED ✓',
            newSector.settlementConfig?.targetAsset?.theme?.hex || '#18C6A5'
        );
        await safeDispatch('ADD_SECTOR', newSector);
    }

    async function deleteSector(id: string) {
        operations.sectors = operations.sectors.filter((s) => s.id !== id);
        await safeDispatch('DELETE_SECTOR', { id });
    }

    async function renameSector(id: string) {
        const sectorIndex = operations.sectors.findIndex((s) => s.id === id);
        if (sectorIndex !== -1) {
            const currentName = operations.sectors[sectorIndex].name;
            const newName = prompt('Enter new Split name:', currentName);
            if (newName && newName.trim() !== '') {
                operations.sectors = operations.sectors.map((s) =>
                    s.id === id ? { ...s, name: newName.trim() } : s
                );
                triggerShimmer(`sector_${id}`);
                ui.triggerMicroBadge(`sector_${id}`, 'RENAMED ✓', '#18C6A5');
                await safeDispatch('RENAME_SECTOR', { id, name: newName.trim() });
            }
        }
    }

    async function handleInlineSaveSector(
        id: string,
        nextName: string,
        nextRouteMode: RouteMode,
        nextConfig: SettlementConfig
    ) {
        const existing = operations.sectors.find((s) => s.id === id);
        if (!existing) return;
        const trimmedName = nextName.trim() || existing.name;
        const nameChanged = trimmedName !== existing.name;
        const targetTickerUpper = (nextConfig.targetAsset?.ticker || '').toUpperCase();
        const mineable =
            nextRouteMode !== 'auto-lp' ? mineableVaultMap.get(targetTickerUpper) || null : null;
        const configCopy = JSON.parse(JSON.stringify(nextConfig));
        if (mineable) {
            configCopy.isMineableKrc20 = true;
            configCopy.dailyVaultEmission = mineable.dailyEmissionTokens;
        }
        operations.sectors = operations.sectors.map((s) =>
            s.id === id
                ? {
                      ...s,
                      name: trimmedName,
                      routeMode: nextRouteMode,
                      settlementConfig: configCopy
                  }
                : s
        );
        triggerShimmer(`sector_${id}`);
        ui.triggerMicroBadge(
            `sector_${id}`,
            nextRouteMode === 'auto-lp' ? 'POOL SPLIT SAVED ✓' : 'SPLIT SAVED ✓',
            configCopy.targetAsset?.theme?.hex || '#18C6A5'
        );
        if (nameChanged) {
            await safeDispatch('RENAME_SECTOR', { id, name: trimmedName });
        }
        await safeDispatch('UPDATE_SETTLEMENT', { id, config: configCopy });
    }

    function openSettlement(sector: Sector) {
        syncSavedBankRailStatus();
        syncMineableKrc20Vaults();
        treasury.syncRwaOraclePrices();
        settlementModalSilo = sector;
        editSectorName = sector.name;
        const safeConfig = sector.settlementConfig || {
            ...defaultSettlement,
            payoutAddress: resolveChainAddressForTicker('KAS')
        };
        if (!safeConfig.targetAsset) {
            safeConfig.targetAsset = treasury.getAsset('KAS') as unknown as SettlementConfig['targetAsset'];
        }
        editSettlementParams = JSON.parse(JSON.stringify(safeConfig));
        editSelectedAssets = hydrateSectorTargetAssets(sector);
        syncConfigFromAssetList(editSelectedAssets, editSettlementParams);
    }

    async function saveSettlementParams() {
        if (settlementModalSilo) {
            isSigningSettlement = true;
            try {
                const { updatedList, isPlant } = syncConfigFromAssetList(
                    editSelectedAssets,
                    editSettlementParams
                );
                editSelectedAssets = updatedList;
                const trimmedName = editSectorName.trim();
                const nameChanged =
                    trimmedName !== '' && trimmedName !== settlementModalSilo.name;
                const activeSiloId = settlementModalSilo.id;
                const newRouteMode: RouteMode = isPlant
                    ? 'auto-lp'
                    : editSettlementParams.targetAsset.ticker === 'KAS'
                      ? 'hold'
                      : 'swap';
                operations.sectors = operations.sectors.map((s) => {
                    if (s.id === activeSiloId) {
                        return {
                            ...s,
                            name: nameChanged ? trimmedName : s.name,
                            settlementConfig: JSON.parse(JSON.stringify(editSettlementParams)),
                            routeMode: newRouteMode
                        };
                    }
                    return s;
                });
                triggerShimmer(`sector_${activeSiloId}`);
                ui.triggerMicroBadge(
                    `sector_${activeSiloId}`,
                    isPlant ? 'POOL UPDATED ✓' : 'SPLIT UPDATED ✓',
                    editSettlementParams.targetAsset?.theme?.hex || '#18C6A5'
                );
                if (nameChanged) {
                    await safeDispatch('RENAME_SECTOR', { id: activeSiloId, name: trimmedName });
                }
                await safeDispatch('UPDATE_SETTLEMENT', {
                    id: activeSiloId,
                    config: editSettlementParams
                });
            } finally {
                isSigningSettlement = false;
                settlementModalSilo = null;
                editSettlementParams = { ...defaultSettlement };
            }
        }
    }

    function openRegisterVaultModal(sector?: Sector) {
        if (!identity.isWalletConnected || !identity.activeAddress) {
            ui.showWalletModal = true;
            return;
        }
        const ticker = sector?.settlementConfig?.targetAsset?.ticker || 'USDC';
        vaultModalPreset = sector
            ? {
                  vaultKind: sector.routeMode === 'auto-lp' ? 'MAKER_PLANT' : 'MINER_SILO',
                  targetAsset: ticker,
                  destinationAddress:
                      sector.settlementConfig?.payoutAddress || resolveChainAddressForTicker(ticker),
                  refundKaspaAddress: identity.activeAddress,
                  ...(sector.routeMode === 'auto-lp' && sector.settlementConfig?.feeRateBps
                      ? { makerSpreadBps: sector.settlementConfig.feeRateBps }
                      : {})
              }
            : {
                  vaultKind: 'MINER_SILO',
                  targetAsset: 'USDC',
                  destinationAddress: resolveChainAddressForTicker('USDC'),
                  refundKaspaAddress: identity.activeAddress
              };
        isVaultModalOpen = true;
    }

    async function initiateOwnerVaultCancel(vault: VaultLockRecord) {
        cancelActionError = null;
        const res = await requestVaultCancelPreview(vault.vaultId, resolveTargetWallet());
        if (!res.ok || !res.preview) {
            cancelActionError = res.error || 'Could not prepare vault return.';
            return;
        }
        cancelVaultTarget = vault;
        cancelVaultPreview = res.preview;
    }

    function openThermostatModal() {
        thermostatDrafts = hydrateThermostatValveDrafts(
            operations.thermostatValves || [],
            identity.activeAddress || ''
        );
        isThermostatModalOpen = true;
    }

    let effortData = $derived.by(() => {
        const segments: Array<{
            id: string;
            name: string;
            pct: number;
            offset: number;
            hex: string;
        }> = [];
        const totalHash = displayHashrate;
        let currentOffset = 0;
        (operations.sectors || []).forEach((sec) => {
            const bps = readSectorAllocationBps(sec);
            if (bps > 0) {
                const pct = bps / 100;
                const hex = sec.settlementConfig?.targetAsset?.theme?.hex || '#18C6A5';
                segments.push({
                    id: sec.id,
                    name: formatSectorDisplayTitle(sec),
                    pct,
                    offset: currentOffset,
                    hex
                });
                currentOffset += pct;
            }
        });
        return { segments, totalHash };
    });

    let chartInterval: ReturnType<typeof setInterval>;
    let reservePollInterval: ReturnType<typeof setInterval>;

    function handleRealtimeYieldOrFiatEvent() {
        syncSovereignOperationsState();
        syncSavedBankRailStatus();
    }

    onMount(() => {
        syncSovereignOperationsState();
        syncSavedBankRailStatus();
        syncMineableKrc20Vaults();
        loadHashChartHistory(hashChartTimeframe);
        loadPriceChartHistory(priceChartTimeframe);

        if (browser) {
            window.addEventListener('perennia:yield_update', handleRealtimeYieldOrFiatEvent);
            window.addEventListener('perennia:fiat_event', handleRealtimeYieldOrFiatEvent);
        }

        chartInterval = setInterval(() => {
            if (browser && identity.isWalletConnected) {
                if (hashChartTimeframe === '1H') {
                    displayHashHistory = [...displayHashHistory, displayHashrate].slice(-60);
                }
                const spot = treasury.getAsset('KAS').spotPrice;
                if (!livePricingUnavailable && spot > 0 && kasHistory.length === 0) {
                    kasHistory = [spot];
                }
            }
        }, 2000);

        reservePollInterval = setInterval(() => {
            if (browser && identity.isWalletConnected) {
                syncSovereignOperationsState();
                loadPriceChartHistory(priceChartTimeframe);
            }
        }, 12000);
    });

    onDestroy(() => {
        if (browser) {
            window.removeEventListener('perennia:yield_update', handleRealtimeYieldOrFiatEvent);
            window.removeEventListener('perennia:fiat_event', handleRealtimeYieldOrFiatEvent);
        }
        if (chartInterval) clearInterval(chartInterval);
        if (reservePollInterval) clearInterval(reservePollInterval);
    });

    let hashratePath = $derived(buildSvgPath(displayHashHistory, 200, 240, true));
    let pricePath = $derived(
        livePricingUnavailable ? '' : buildSvgPath(kasHistory, 200, 240, false)
    );
    let activePriceDeltaPct = $derived(
        priceTimeframeDelta !== null ? priceTimeframeDelta : kasAsset.delta || 0
    );
</script>

{#if activeWorkerMenu !== null}
    <div
        role="button"
        tabindex="0"
        aria-label="Close menu"
        class="fixed inset-0 z-30 cursor-default border-none bg-[var(--bg-overlay)]"
        onclick={() => {
            activeWorkerMenu = null;
            activeMinerTypePickerWorkerId = null;
            minerTypeSearch = '';
        }}
        onkeydown={(e) => {
            if (e.key === 'Escape') {
                activeWorkerMenu = null;
                activeMinerTypePickerWorkerId = null;
                minerTypeSearch = '';
            }
        }}
    ></div>
{/if}

<div class="w-full h-full p-3 sm:p-4 md:p-6 lg:p-8 overflow-y-auto bg-transparent" role="presentation">
    <!-- MOBILE STATUS + 3-TAB COLUMN SWITCHER (< 1024px ONLY) -->
    <div class="lg:hidden bg-[var(--bg-card)] border border-white/10 rounded-xl p-2 flex flex-col gap-2 font-mono">
        <div data-testid="mobile-kpi-ribbon" class="flex items-center justify-between gap-2 px-1.5 py-0.5 text-[10px]">
            <span class="font-bold text-white tabular-nums flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full {displayHashrate > 0 ? 'bg-[#18C6A5] animate-pulse' : 'bg-neutral-600'}"></span>
                {displayHashrate.toFixed(2)} <span class="text-[#18C6A5]">TH/s</span>
            </span>
            {#if kasSpotVisible}
                <span class="font-bold text-[var(--text-primary)] tabular-nums flex items-center gap-1">
                    {i18n.formatSpotPrice(kasAsset.spotPrice)}
                    <span class="text-[9px] {activePriceDeltaPct >= 0 ? 'text-[var(--accent-text)]' : 'text-red-400'}">
                        {activePriceDeltaPct >= 0 ? '+' : ''}{activePriceDeltaPct.toFixed(1)}%
                    </span>
                </span>
            {/if}
            <span class="font-bold text-amber-500 tabular-nums">
                Next {operations.formatEpochCountdown()}
            </span>
        </div>

        <div data-testid="mobile-column-switcher" class="grid grid-cols-3 gap-1 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg p-1">
            <button
                type="button"
                data-testid="mobile-col-tab-SPLITS"
                onclick={() => (mobileMineTab = 'SPLITS')}
                class="py-1.5 px-2 rounded-md text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer {mobileMineTab === 'SPLITS' ? 'bg-[var(--bg-elevated)] text-[var(--accent-text)] border border-[var(--border-active)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'}"
            >
                SPLITS ({(operations.sectors || []).length})
            </button>
            <button
                type="button"
                data-testid="mobile-col-tab-RIGS"
                onclick={() => (mobileMineTab = 'RIGS')}
                class="py-1.5 px-2 rounded-md text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer {mobileMineTab === 'RIGS' ? 'bg-[var(--bg-elevated)] text-[#18C6A5] border border-[#18C6A5]/40' : 'text-neutral-400 hover:text-white border border-transparent'}"
            >
                RIGS ({displayedWorkers.length})
            </button>
            <button
                type="button"
                data-testid="mobile-col-tab-REWARDS"
                onclick={() => (mobileMineTab = 'REWARDS')}
                class="py-1.5 px-2 rounded-md text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer {mobileMineTab === 'REWARDS' ? 'bg-[var(--bg-elevated)] text-[#18C6A5] border border-[#18C6A5]/40' : 'text-neutral-400 hover:text-white border border-transparent'}"
            >
                REWARDS
            </button>
        </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-2.5 w-full max-w-[1720px] mx-auto pb-24 items-start mt-2 lg:mt-0">
        <div class="{mobileMineTab === 'RIGS' ? 'contents' : 'hidden lg:contents'}">
            <svelte:boundary>
                <WorkerFleetPanel
                    {displayedWorkers}
                    {displayHashrate}
                    {totalShares}
                    {unallocatedPercentage}
                    bind:activeWorkerMenu
                    bind:activeMinerTypePickerWorkerId
                    bind:minerTypeSearch
                    {shimmerTargetId}
                    onTriggerShimmer={triggerShimmer}
                    onSafeDispatch={safeDispatch}
                    onOpenSectorModal={() => openSectorModal('split')}
                />
                {#snippet failed(_err, reset)}
                    <div class="lg:col-span-3 xl:col-span-2 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-4 text-xs font-mono text-[var(--text-muted)] flex items-center justify-between">
                        <span>Miners panel recovering...</span>
                        <button type="button" onclick={reset} class="px-2 py-1 rounded border border-[var(--border-subtle)] text-[10px] uppercase">Retry</button>
                    </div>
                {/snippet}
            </svelte:boundary>
        </div>

        <!-- CENTER WORKSPACE -->
        <div
            class="{mobileMineTab === 'SPLITS' ? 'flex' : 'hidden lg:flex'} flex-col gap-3.5 lg:col-span-6 xl:col-span-8 relative z-10 min-w-0"
            data-tour="sector-matrix"
            data-testid="ops-payout-splits-section"
        >
            {#if livePricingUnavailable}
                <div
                    data-testid="live-pricing-unavailable-banner"
                    class="bg-[var(--bg-card)] border border-amber-500/40 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 font-mono"
                    style="background-image: radial-gradient(ellipse at left, rgba(245, 158, 11, 0.10), transparent 70%);"
                >
                    <div class="flex items-center gap-2.5">
                        <span class="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
                        <span class="text-xs font-bold text-amber-300">
                            Live pricing unavailable
                        </span>
                    </div>
                </div>
            {/if}

            <!-- TELEMETRY CHARTS -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                    class="tactile-card bg-[var(--bg-card)] border border-white/10 rounded-[24px] p-4 flex flex-col justify-between h-[230px] shadow-inner relative overflow-hidden group"
                    style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.08), transparent 60%);"
                >
                    <div class="flex justify-between items-start gap-2 relative z-10">
                        <div class="flex flex-col pointer-events-none">
                            <span class="text-[10px] font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                                <div class="w-2 h-2 rounded-full {operations.globalNodeStatus === 'connected' ? 'bg-[#18C6A5] animate-pulse' : 'bg-neutral-600'}"></div>
                                Hashrate
                            </span>
                            <span class="text-2xl font-mono font-light text-white tracking-tight mt-0.5 whitespace-nowrap tabular-nums">
                                {displayHashrate.toFixed(2)}
                                <span class="text-xs text-neutral-400 font-bold">TH/s</span>
                            </span>
                        </div>
                        <div class="flex items-center gap-1 bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-1 pointer-events-auto">
                            {#each ['1H', '24H', '7D', '30D'] as tf (tf)}
                                <button
                                    type="button"
                                    data-testid="hash-chart-tf-{tf}"
                                    onclick={() => {
                                        hashChartTimeframe = tf as ChartTimeframe;
                                        loadHashChartHistory(tf as ChartTimeframe);
                                    }}
                                    class="px-2 py-0.5 rounded-lg text-[8px] font-mono font-bold uppercase cursor-pointer transition-colors {hashChartTimeframe === tf ? 'bg-[var(--bg-hover)] text-[#18C6A5] border border-[#18C6A5]/40' : 'text-neutral-400 hover:text-white'}"
                                >
                                    {tf}
                                </button>
                            {/each}
                        </div>
                    </div>
                    <div class="absolute inset-0 pointer-events-none p-4 z-0">
                        <div class="w-full h-full border-l border-b border-white/5 relative">
                            <span class="absolute -left-3 top-4 -rotate-90 origin-left text-[8px] tracking-widest uppercase font-mono text-neutral-500">
                                TH/s
                            </span>
                            <span class="absolute bottom-1 right-2 text-[8px] tracking-widest uppercase font-mono text-neutral-500">
                                {hashChartTimeframe} →
                            </span>
                        </div>
                    </div>
                    <div class="absolute bottom-0 left-0 w-full h-[175px] opacity-45 group-hover:opacity-80 transition-opacity duration-700 ml-4 mb-4">
                        <svg class="w-[calc(100%-16px)] h-full" preserveAspectRatio="none" viewBox="0 0 200 240">
                            <path d="{hashratePath} L 200,240 L 0,240 Z" fill="url(#hashGradient)" opacity="0.3" />
                            <path
                                d={hashratePath}
                                fill="none"
                                stroke="#18C6A5"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
                            <defs>
                                <linearGradient id="hashGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stop-color="#18C6A5" />
                                    <stop offset="100%" stop-color="transparent" />
                                </linearGradient>
                            </defs>
                        </svg>
                    </div>
                </div>

                <div
                    class="tactile-card bg-[var(--bg-card)] border border-white/10 rounded-[24px] p-4 flex flex-col justify-between h-[230px] shadow-inner relative overflow-hidden group"
                    style="background-image: radial-gradient(ellipse at top right, rgba(59, 130, 246, 0.08), transparent 60%);"
                >
                    <div class="flex justify-between items-start gap-2 relative z-10">
                        <div class="flex flex-col pointer-events-none">
                            <span class="text-[10px] font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                                <div class="w-2 h-2 rounded-full {kasSpotVisible ? 'bg-blue-500 animate-pulse' : 'bg-amber-400'}"></div>
                                KAS Price
                            </span>
                            {#if kasSpotVisible}
                                <div class="flex items-baseline gap-2 mt-0.5">
                                    <span class="text-2xl font-mono font-light text-[var(--text-primary)] tracking-tight tabular-nums">
                                        {i18n.formatSpotPrice(kasAsset.spotPrice)}
                                    </span>
                                    <span
                                        class="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border {activePriceDeltaPct >= 0 ? 'text-[#10b981] border-emerald-500/30' : 'text-[#ef4444] border-red-500/30'}"
                                    >
                                        {activePriceDeltaPct > 0 ? '+' : ''}{activePriceDeltaPct.toFixed(2)}%
                                    </span>
                                </div>
                            {:else}
                                <span class="text-sm font-mono font-bold text-amber-500 mt-1">
                                    Live pricing unavailable
                                </span>
                            {/if}
                        </div>
                        <div class="flex items-center gap-1 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl p-1 pointer-events-auto">
                            {#each ['1H', '24H', '7D', '30D'] as tf (tf)}
                                <button
                                    type="button"
                                    data-testid="price-chart-tf-{tf}"
                                    onclick={() => {
                                        priceChartTimeframe = tf as ChartTimeframe;
                                        loadPriceChartHistory(tf as ChartTimeframe);
                                    }}
                                    class="px-2 py-0.5 rounded-lg text-[8px] font-mono font-bold uppercase cursor-pointer transition-colors {priceChartTimeframe === tf ? 'bg-[var(--bg-hover)] text-[var(--accent-text)] border border-[var(--border-active)]' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}"
                                >
                                    {tf}
                                </button>
                            {/each}
                        </div>
                    </div>
                    <div class="absolute inset-0 pointer-events-none p-4 z-0">
                        <div class="w-full h-full border-l border-b border-[var(--border-subtle)] relative">
                            <span class="absolute -left-3 top-4 -rotate-90 origin-left text-[8px] tracking-widest uppercase font-mono text-[var(--text-muted)]">
                                {i18n.currency}
                            </span>
                            <span class="absolute bottom-1 right-2 text-[8px] tracking-widest uppercase font-mono text-neutral-500">
                                {priceChartTimeframe} →
                            </span>
                        </div>
                    </div>
                    {#if pricePath}
                        <div class="absolute bottom-0 left-0 w-full h-[175px] opacity-45 group-hover:opacity-80 transition-opacity duration-700 ml-4 mb-4">
                            <svg class="w-[calc(100%-16px)] h-full" preserveAspectRatio="none" viewBox="0 0 200 240">
                                <path d="{pricePath} L 200,240 L 0,240 Z" fill="url(#kasGradient)" opacity="0.3" />
                                <path
                                    d={pricePath}
                                    fill="none"
                                    stroke={activePriceDeltaPct >= 0 ? '#10b981' : '#ef4444'}
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                />
                                <defs>
                                    <linearGradient id="kasGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop
                                            offset="0%"
                                            stop-color={activePriceDeltaPct >= 0 ? '#10b981' : '#ef4444'}
                                        />
                                        <stop offset="100%" stop-color="transparent" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                    {/if}
                </div>
            </div>

            <!-- PAYOUT SPLITS CANVAS -->
            <div
                class="flex flex-col gap-5 border border-white/10 rounded-[32px] bg-[var(--bg-card)] p-5 sm:p-6 min-h-[240px] shadow-2xl relative overflow-hidden tactical-grid-canvas"
                style="background-image: radial-gradient(ellipse at 50% 0%, rgba(24, 198, 165, 0.06), transparent 60%), linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px); background-size: 100% 100%, 30px 30px, 30px 30px;"
            >
                <div
                    data-testid="ops-splits-action-bar"
                    class="grid grid-cols-2 gap-2.5 relative z-10"
                >
                    <button
                        type="button"
                        data-testid="ops-add-split-btn"
                        onclick={() => openSectorModal('split')}
                        disabled={!identity.isWalletConnected || identity.isWatchOnly || unallocatedBps <= 0}
                        class="tactile-btn mobile-touch-target w-full text-white text-[10px] lg:text-[11px] font-bold uppercase tracking-widest py-3 px-2 rounded-2xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        + Split
                    </button>
                    <button
                        type="button"
                        data-testid="ops-add-pair-btn"
                        onclick={() => openSectorModal('pair')}
                        disabled={!identity.isWalletConnected || identity.isWatchOnly}
                        class="tactile-btn mobile-touch-target w-full text-white text-[10px] lg:text-[11px] font-bold uppercase tracking-widest py-3 px-2 rounded-2xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        + Pair
                    </button>
                </div>

                {#if (operations.sectors || []).length === 0}
                    <div class="relative z-10 flex flex-col items-center justify-center text-center py-8 px-4">
                        <h2 class="text-3xl md:text-5xl font-light uppercase tracking-[0.1em] text-[var(--text-muted)] mb-6 text-center">
                            <span class="text-[var(--accent-text)] opacity-60">Token Splits</span>
                        </h2>
                        <div class="relative w-20 h-20 rounded-full bg-[#18C6A5]/5 border border-[#18C6A5]/20 flex items-center justify-center shadow-inner">
                            <svg
                                class="text-[#18C6A5]/30 w-9 h-9"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                stroke-width="1.5"
                            >
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                        </div>
                    </div>
                {:else}
                    <div class="flex flex-col gap-3 relative z-10 content-start pb-2">
                        {#if siloSectors.length > 0}
                            <div class="flex flex-col gap-2" data-testid="settlement-silos-section">
                                <div class="flex items-center justify-between border-b border-[#18C6A5]/25 pb-2">
                                    <h3 class="text-[10px] font-bold uppercase tracking-widest text-[#18C6A5]">
                                        Token Splits
                                    </h3>
                                    <span class="text-[9px] font-mono text-neutral-400">
                                        {siloSectors.length} Split{siloSectors.length === 1 ? '' : 's'}
                                    </span>
                                </div>
                                <div class="grid grid-cols-1 lg:grid-cols-12 gap-2.5">
                                    {#each siloSectors as sector (sector.id)}
                                        <SectorCard
                                            {sector}
                                            {displayHashrate}
                                            {unallocatedPercentage}
                                            {dragSectorId}
                                            {dropTargetSectorId}
                                            {shimmerTargetId}
                                            {mineableVaultMap}
                                            {savedBankRailLast4}
                                            {savedBankRailMethod}
                                            latestReceipt={findLatestReceiptForSector(sector)}
                                            {livePricingUnavailable}
                                            {resolveChainAddressForTicker}
                                            {estimateSectorDailyKas}
                                            {estimateSectorDailyUsd}
                                            onDragStart={handleSectorDragStart}
                                            onDragEnd={handleSectorDragEnd}
                                            onDragOver={handleSectorDragOver}
                                            onDragLeave={handleSectorDragLeave}
                                            onDrop={handleSectorDrop}
                                            onRenameSector={renameSector}
                                            onToggleWidth={toggleSectorWidth}
                                            onOpenSettlement={openSettlement}
                                            onDeleteSector={deleteSector}
                                            onInputPct={handleSectorInputPct}
                                            onInputHash={handleSectorInputHash}
                                            onSliderInput={handleSectorSliderInput}
                                            onSliderChange={handleSectorSliderChange}
                                            onCommitUpdate={commitSectorUpdate}
                                            onSnapMaxRemaining={snapSectorMaxRemaining}
                                            onInlineSaveSector={handleInlineSaveSector}
                                        />
                                    {/each}
                                </div>
                            </div>
                        {/if}

                        {#if plantSectors.length > 0}
                            <div class="flex flex-col gap-3 mt-2" data-testid="liquidity-plants-section">
                                <div class="flex items-center justify-between border-b border-blue-500/25 pb-2">
                                    <h3 class="text-[10px] font-bold uppercase tracking-widest text-blue-400">
                                        Liquidity Pairs
                                    </h3>
                                    <span class="text-[9px] font-mono text-neutral-400">
                                        {plantSectors.length} Pair{plantSectors.length === 1 ? '' : 's'}
                                    </span>
                                </div>
                                <div class="grid grid-cols-1 lg:grid-cols-12 gap-2.5">
                                    {#each plantSectors as sector (sector.id)}
                                        <SectorCard
                                            {sector}
                                            {displayHashrate}
                                            {unallocatedPercentage}
                                            {dragSectorId}
                                            {dropTargetSectorId}
                                            {shimmerTargetId}
                                            {mineableVaultMap}
                                            {savedBankRailLast4}
                                            {savedBankRailMethod}
                                            latestReceipt={findLatestReceiptForSector(sector)}
                                            {livePricingUnavailable}
                                            {resolveChainAddressForTicker}
                                            {estimateSectorDailyKas}
                                            {estimateSectorDailyUsd}
                                            onDragStart={handleSectorDragStart}
                                            onDragEnd={handleSectorDragEnd}
                                            onDragOver={handleSectorDragOver}
                                            onDragLeave={handleSectorDragLeave}
                                            onDrop={handleSectorDrop}
                                            onRenameSector={renameSector}
                                            onToggleWidth={toggleSectorWidth}
                                            onOpenSettlement={openSettlement}
                                            onDeleteSector={deleteSector}
                                            onInputPct={handleSectorInputPct}
                                            onInputHash={handleSectorInputHash}
                                            onSliderInput={handleSectorSliderInput}
                                            onSliderChange={handleSectorSliderChange}
                                            onCommitUpdate={commitSectorUpdate}
                                            onSnapMaxRemaining={snapSectorMaxRemaining}
                                            onInlineSaveSector={handleInlineSaveSector}
                                            onFundPair={openFundPairModal}
                                            onCancelOrWithdrawPair={handleCancelOrWithdrawPair}
                                        />
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>

        <div class="{mobileMineTab === 'REWARDS' ? 'contents' : 'hidden lg:contents'}">
            <svelte:boundary>
                <PoolDistributionSidebar
                    {displayHashrate}
                    {effortData}
                    {displayedBuckets}
                />
                {#snippet failed(_err, reset)}
                    <div class="lg:col-span-3 xl:col-span-2 bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-4 text-xs font-mono text-[var(--text-muted)] flex items-center justify-between">
                        <span>Pending splits recovering...</span>
                        <button type="button" onclick={reset} class="px-2 py-1 rounded border border-[var(--border-subtle)] text-[10px] uppercase">Retry</button>
                    </div>
                {/snippet}
            </svelte:boundary>
        </div>
    </div>
</div>

<svelte:boundary>
<SectorConfigModals
    bind:isSectorModalOpen
    {sectorModalMode}
    bind:pairFundMode
    bind:splitWalletBoostOpen
    bind:draftPairFeeBps
    bind:draftPairTerm
    bind:draftSectorName
    bind:draftSectorPct
    bind:draftSectorMax
    bind:draftSelectedAssets
    bind:draftIsSyndicateSector
    bind:draftSettlementConfig
    bind:settlementModalSilo
    bind:editSectorName
    bind:editSettlementParams
    bind:editSelectedAssets
    bind:isSigningSettlement
    bind:isVaultModalOpen
    {vaultModalPreset}
    bind:cancelVaultTarget
    bind:cancelVaultPreview
    bind:isThermostatModalOpen
    bind:thermostatDrafts
    bind:pairPartnerTicker
    bind:initialPairSwapPayTicker
    bind:initialPairSwapAmount
    {isSubmittingPair}
    {pairSubmitError}
    {livePricingUnavailable}
    {displayHashrate}
    {mineableVaultMap}
    {savedBankRailLast4}
    {savedBankRailMethod}
    refundKaspaAddress={identity.activeAddress || ''}
    {resolveChainAddressForTicker}
    onUpdateDraftPct={updateDraftPct}
    onUpdateDraftHash={updateDraftHash}
    onCreateSector={createSector}
    onExecutePairFlow={handleCreateOrFundPair}
    onSaveSettlementParams={saveSettlementParams}
    onEqualizeSecondaryWeights={equalizeSecondaryWeights}
    onAdjustSecondaryPlantWeight={adjustSecondaryPlantWeight}
    onRemoveAssetFromSector={removeAssetFromSector}
    onAddOrToggleAssetInSector={addOrToggleAssetInSector}
    onVaultRegistered={syncSovereignOperationsState}
    onVaultCancelled={async () => {
        await syncSovereignOperationsState();
    }}
    onThermostatSaved={syncSovereignOperationsState}
/>
    {#snippet failed(_err, reset)}
        <div class="fixed bottom-4 right-4 z-[9990] bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-3 text-xs font-mono text-[var(--text-primary)] flex items-center gap-2">
            <span>Modal reset</span>
            <button type="button" onclick={reset} class="px-2 py-1 rounded border border-[var(--border-subtle)]">Retry</button>
        </div>
    {/snippet}
</svelte:boundary>

<style>
    .hide-scrollbar::-webkit-scrollbar {
        display: none;
    }
    .hide-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
    :global(.custom-range-slider) {
        -webkit-appearance: none;
        appearance: none;
        height: 6px;
        background: var(--bg-elevated);
        border-radius: 4px;
        border: 1px solid var(--border-subtle);
        outline: none;
    }
    :global(.custom-range-slider::-webkit-slider-thumb) {
        -webkit-appearance: none;
        appearance: none;
        height: 18px;
        width: 18px;
        border-radius: 50%;
        background: var(--bg-card);
        cursor: pointer;
        border: 2px solid #18c6a5;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    }
</style>
