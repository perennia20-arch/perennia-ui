<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { operations } from '$lib/stores/operations.svelte';
    import { treasury, type UnifiedAsset } from '$lib/stores/treasury.svelte';
    import type {
        Sector,
        RouteMode,
        SettlementConfig,
        PlantAssetTarget,
        AssetBucketTelemetry
    } from '$lib/stores/type';
    import {
        DEFAULT_RESERVE_PAYOUT_KAS,
        KASPA_DIFF_CONSTANT,
        POOL_FEE_RATE,
        INITIAL_MINEABLE_KRC20_VAULTS,
        matchCatalogSpecForWorker,
        toPlantTargetSpec,
        normalizePlantTargets,
        hydrateSectorTargetAssets,
        buildSvgPath,
        type ViewSector,
        type MineableKrc20VaultInfo
    } from '$lib/components/operations/operationsHelpers';
    import WorkerFleetPanel from '$lib/components/operations/WorkerFleetPanel.svelte';
    import SectorCard from '$lib/components/operations/SectorCard.svelte';
    import PoolDistributionSidebar from '$lib/components/operations/PoolDistributionSidebar.svelte';
    import SectorConfigModals from '$lib/components/operations/SectorConfigModals.svelte';

    type ChartTimeframe = '1H' | '24H' | '7D' | '30D';

    let unassignedReserveKas = $state(0.0);
    let unassignedReserveTargetKas = $state(DEFAULT_RESERVE_PAYOUT_KAS);
    let savedBankRailLast4 = $state<string | null>(null);
    let savedBankRailLabel = $state<string>('Primary Operating Account');
    let savedBankRailMethod = $state<string>('ACH');
    let isPullingOutKey = $state<string | null>(null);

    let hashChartTimeframe = $state<ChartTimeframe>('1H');
    let priceChartTimeframe = $state<ChartTimeframe>('24H');
    let priceTimeframeDelta = $state<number | null>(null);

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
                        const tick = String(rv.tokenTicker || '')
                            .trim()
                            .toUpperCase();
                        if (tick) {
                            merged.set(tick, {
                                vaultId: String(rv.vaultId || `vault-${tick}`),
                                tokenTicker: tick,
                                vaultLabel: String(
                                    rv.vaultLabel || `${tick} Mining Vault`
                                ),
                                totalFundedTokens: Number(
                                    rv.totalFundedTokens || 0
                                ),
                                remainingVaultTokens: Number(
                                    rv.remainingVaultTokens || 0
                                ),
                                dailyEmissionTokens: Number(
                                    rv.dailyEmissionTokens || 0
                                ),
                                distributedTokens: Number(
                                    rv.distributedTokens || 0
                                ),
                                minHashrateThs: Number(
                                    rv.minHashrateThs || 0.1
                                ),
                                syndicateSectorEnabled:
                                    rv.syndicateSectorEnabled !== false,
                                activeMinersCount: Number(
                                    rv.activeMinersCount || 1
                                ),
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

    async function safeDispatch(action: string, payload: any) {
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

    async function claimPendingSectorKas(params: {
        sectorId?: string;
        targetAsset?: string;
    }) {
        if (!identity.isWalletConnected || !identity.activeAddress) {
            ui.showWalletModal = true;
            return;
        }
        const key = params.sectorId || params.targetAsset || 'claim';
        isPullingOutKey = key;
        markMutation();
        let claimedSum = 0;
        const cleanTarget = params.targetAsset
            ? params.targetAsset.trim().toUpperCase()
            : '';
        operations.sectors = (operations.sectors || []).map((sec) => {
            const pending = Math.max(0, Number(sec.pendingKaspa || 0));
            if (pending <= 0) return sec;
            let matches = false;
            if (params.sectorId && sec.id === params.sectorId) {
                matches = true;
            } else if (cleanTarget) {
                const primary = (
                    sec.settlementConfig?.targetAsset?.ticker || ''
                ).toUpperCase();
                if (primary === cleanTarget) {
                    matches = true;
                } else if (sec.routeMode === 'auto-lp') {
                    const targets = hydrateSectorTargetAssets(sec);
                    if (
                        targets.some(
                            (t) => t.ticker.toUpperCase() === cleanTarget
                        )
                    ) {
                        matches = true;
                    }
                }
            }
            if (matches) {
                claimedSum += pending;
                return { ...sec, pendingKaspa: 0 };
            }
            return sec;
        });
        try {
            const targetWallet =
                identity.isCorporateAdmin &&
                ui.adminModeActive &&
                ui.adminTargetWallet
                    ? ui.adminTargetWallet
                    : undefined;
            const res = await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'CLAIM_PENDING_SECTOR_KAS',
                    payload: {
                        sectorId: params.sectorId,
                        targetAsset: params.targetAsset
                    },
                    targetWallet
                })
            });
            const data = await res.json().catch(() => ({}));
            const finalClaimed = Number(data?.data?.claimedKas ?? claimedSum);
            if (params.sectorId) {
                triggerShimmer(`sector_${params.sectorId}`);
                ui.triggerMicroBadge(
                    `sector_${params.sectorId}`,
                    `RECLAIMED ${finalClaimed.toFixed(2)} KAS ✓`,
                    '#18C6A5'
                );
            } else if (cleanTarget) {
                ui.triggerMicroBadge(
                    `bucket_${cleanTarget}`,
                    `RECLAIMED ${finalClaimed.toFixed(2)} KAS ✓`,
                    '#18C6A5'
                );
            }
            await Promise.all([
                syncUnassignedReserveTelemetry(),
                syncRecentSettlementEvents()
            ]);
        } catch (e) {
            console.error('Failed to reclaim pending sector KAS:', e);
        } finally {
            isPullingOutKey = null;
            markMutation();
        }
    }

    async function syncSavedBankRailStatus() {
        if (!browser || !identity.isWalletConnected) return;
        try {
            const res = await fetch('/api/fiat/offramp');
            if (res.ok) {
                const data = await res.json();
                savedBankRailLast4 = data.savedBankRailLast4 || null;
                if (data.savedBankRail) {
                    savedBankRailLabel =
                        data.savedBankRail.bankLabel ||
                        'Primary Operating Account';
                    savedBankRailMethod =
                        data.savedBankRail.payoutMethod || 'ACH';
                }
            }
        } catch {
            // Ignore bank status check error
        }
    }

    async function syncRecentSettlementEvents() {
        if (!browser || !identity.isWalletConnected) return;
        try {
            const res = await fetch('/api/user/tax-events');
            if (res.ok) {
                const events = await res.json();
                if (Array.isArray(events)) {
                    ui.taxEvents = events;
                }
            }
        } catch {
            // Ignore tax events fetch error
        }
    }

    async function syncUnassignedReserveTelemetry() {
        if (!browser || !identity.isWalletConnected || !identity.activeAddress)
            return;
        const targetWallet =
            identity.isCorporateAdmin &&
            ui.adminModeActive &&
            ui.adminTargetWallet
                ? ui.adminTargetWallet
                : identity.activeAddress;
        try {
            const res = await fetch(
                `/api/user/ledger?wallet=${encodeURIComponent(targetWallet)}`
            );
            if (res.ok) {
                const data = await res.json();
                if (typeof data.unassignedReserveKas === 'number') {
                    unassignedReserveKas = Math.max(
                        0,
                        data.unassignedReserveKas
                    );
                }
                if (
                    typeof data.unassignedReserveTargetKas === 'number' &&
                    data.unassignedReserveTargetKas > 0
                ) {
                    unassignedReserveTargetKas =
                        data.unassignedReserveTargetKas;
                }
                if (!ui.adminModeActive) {
                    for (const [ticker, val] of Object.entries(data)) {
                        if (
                            ticker !== 'unassignedReserveKas' &&
                            ticker !== 'unassignedReserveTargetKas'
                        ) {
                            treasury.updateAsset(ticker.toUpperCase(), {
                                synthetic: Number(val) || 0
                            });
                        }
                    }
                }
            }
        } catch {
            // Ignore ledger sync error
        }
    }

    let displayedWorkers = $derived(operations.workers || []);
    let displayHashrate = $derived(
        displayedWorkers.reduce((acc, w) => acc + (w.hashRate || 0), 0)
    );
    let totalShares = $derived(
        displayedWorkers.reduce(
            (acc, w) => acc + (w.sharesContributed || 0),
            0
        )
    );
    let allocatedPercentage = $derived(
        (operations.sectors || []).reduce(
            (acc, s) => acc + (s.allocationPercentage || 0),
            0
        )
    );
    let unallocatedPercentage = $derived(
        Math.max(0, parseFloat((100.0 - allocatedPercentage).toFixed(1)))
    );
    let siloSectors = $derived(
        (operations.sectors || []).filter((s) => s.routeMode !== 'auto-lp')
    );
    let plantSectors = $derived(
        (operations.sectors || []).filter((s) => s.routeMode === 'auto-lp')
    );
    let dragSectorId = $state<string | null>(null);
    let dropTargetSectorId = $state<string | null>(null);
    let displayedBuckets = $derived<AssetBucketTelemetry[]>(
        operations.displayedBuckets
    );

    let displayHashHistory = $state<number[]>([]);
    let kasHistory = $state<number[]>([]);

    async function loadHashChartHistory(
        tf: ChartTimeframe = hashChartTimeframe
    ) {
        if (!browser || !identity.isWalletConnected) return;
        try {
            const targetParam =
                identity.isCorporateAdmin &&
                ui.adminModeActive &&
                ui.adminTargetWallet
                    ? `&target=${encodeURIComponent(ui.adminTargetWallet)}`
                    : '';
            const res = await fetch(
                `/api/state/stats?timeframe=${encodeURIComponent(tf)}${targetParam}`
            );
            if (res.ok) {
                const data = await res.json();
                if (
                    Array.isArray(data.hashrateHistoryThs) &&
                    data.hashrateHistoryThs.length > 0
                ) {
                    displayHashHistory = data.hashrateHistoryThs.slice(-60);
                    return;
                }
            }
        } catch {
            // Fallback below
        }
        if (displayHashrate > 0 && displayHashHistory.length === 0) {
            displayHashHistory = Array.from(
                { length: 20 },
                () => displayHashrate
            );
        }
    }

    async function loadPriceChartHistory(
        tf: ChartTimeframe = priceChartTimeframe
    ) {
        if (!browser) return;
        try {
            const res = await fetch(
                `/api/prices?history=KAS&timeframe=${encodeURIComponent(tf)}`
            );
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
            // Fallback below
        }
        const spot = treasury.getAsset('KAS').spotPrice;
        if (spot > 0 && kasHistory.length === 0) {
            kasHistory = Array.from({ length: 24 }, () => spot);
        }
    }

    $effect(() => {
        if (
            browser &&
            identity.isWalletConnected &&
            (identity.activeAddress || ui.adminTargetWallet)
        ) {
            syncUnassignedReserveTelemetry();
            syncSavedBankRailStatus();
            syncRecentSettlementEvents();
            syncMineableKrc20Vaults();
            loadHashChartHistory(hashChartTimeframe);
            loadPriceChartHistory(priceChartTimeframe);
        }
    });

    function computeLiveKasPerThPerDay(): number {
        if (operations.networkDifficulty > 0 && operations.blockRewardKas > 0) {
            const hashesPerThPerDay = 1e12 * 86400.0;
            const expectedBlockHashes =
                operations.networkDifficulty * 2.0 * KASPA_DIFF_CONSTANT;
            if (expectedBlockHashes > 0) {
                const grossKasPerThDay =
                    (hashesPerThPerDay * operations.blockRewardKas) /
                    expectedBlockHashes;
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
        const baselineNetworkTh = Math.max(
            1_150_000_000,
            operations.globalNetworkHashrate || 0
        );
        return Math.max(
            0.5,
            (dailyGlobalKas / baselineNetworkTh) * (1.0 - POOL_FEE_RATE)
        );
    }

    function estimateSectorDailyKas(sector: ViewSector): number {
        const lpMultiplier = sector.routeMode === 'auto-lp' ? 1.18 : 1.0;
        const consensusEstimate = operations.estimateSectorDailyKas(
            sector,
            displayHashrate
        );
        if (consensusEstimate > 0) {
            return consensusEstimate * lpMultiplier;
        }
        const pctRatio =
            Math.max(0, Number(sector.allocationPercentage || 0)) / 100.0;
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
        return Math.max(
            0,
            effectiveTh * computeLiveKasPerThPerDay() * lpMultiplier
        );
    }

    function estimateSectorDailyUsd(sector: ViewSector): number {
        const kasDay = estimateSectorDailyKas(sector);
        const kasSpot = treasury.getAsset('KAS').spotPrice || 0;
        return kasDay * kasSpot;
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
        let updatedPct = 0;
        operations.sectors = operations.sectors.map((s) => {
            if (s.id !== id) return s;
            const otherAllocated = operations.sectors.reduce(
                (acc, sec) =>
                    sec.id === id ? acc : acc + (sec.allocationPercentage || 0),
                0
            );
            const maxAvailable = Math.max(
                0,
                parseFloat((100.0 - otherAllocated).toFixed(1))
            );
            updatedPct = maxAvailable;
            return { ...s, allocationPercentage: maxAvailable };
        });
        triggerShimmer(`sector_${id}`);
        ui.triggerMicroBadge(`sector_${id}`, 'ROUTED 100% ✓', '#18C6A5');
        await safeDispatch('UPDATE_SECTOR_ALLOCATION', {
            id,
            allocationPercentage: updatedPct
        });
    }

    let isSectorModalOpen = $state(false);
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

    let draftSettlementConfig = $state<SettlementConfig>({
        ...defaultSettlement
    });
    let settlementModalSilo = $state<Sector | null>(null);
    let editSectorName = $state('');
    let editSettlementParams = $state<SettlementConfig>({
        ...defaultSettlement
    });
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
                return (
                    keys.polygon?.address ||
                    keys.ethereum?.address ||
                    identity.activeAddress ||
                    ''
                );
            case 'AVAX':
                return (
                    keys.avalanche?.address ||
                    keys.ethereum?.address ||
                    identity.activeAddress ||
                    ''
                );
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
            cfg.payoutAddress = resolveChainAddressForTicker(
                primarySecondary.ticker
            );
        } else {
            const single = normalized[0];
            cfg.targetAsset = single;
            cfg.plantWeights = { [single.ticker]: 100.0 };
            cfg.plantPair = single.ticker;
            cfg.payoutAddress = resolveChainAddressForTicker(single.ticker);
            if (single.ticker !== 'KAS') {
                cfg.mode = 'epoch';
            }
        }
        return { updatedList: normalized, isPlant };
    }

    function setSingleTargetAsset(
        targetMode: 'create' | 'edit',
        asset: UnifiedAsset
    ) {
        const singleList = [toPlantTargetSpec(asset, 100.0)];
        const isMineable = mineableVaultMap.has(asset.ticker.toUpperCase());
        if (targetMode === 'create') {
            const res = syncConfigFromAssetList(
                singleList,
                draftSettlementConfig
            );
            draftSelectedAssets = res.updatedList;
            draftIsSyndicateSector = isMineable;
            if (isMineable && draftSectorName.startsWith('SILO-')) {
                draftSectorName = `SYNDICATE-${asset.ticker.toUpperCase()}`;
            }
        } else {
            const res = syncConfigFromAssetList(
                singleList,
                editSettlementParams
            );
            editSelectedAssets = res.updatedList;
        }
    }

    function addOrToggleAssetInSector(
        targetMode: 'create' | 'edit',
        asset: UnifiedAsset,
        actionMode: 'replace_primary' | 'add_secondary' = 'replace_primary'
    ) {
        const currentList =
            targetMode === 'create'
                ? [...draftSelectedAssets]
                : [...editSelectedAssets];
        const cleanTicker = asset.ticker.toUpperCase();
        if (currentList.length === 1 && actionMode === 'replace_primary') {
            setSingleTargetAsset(targetMode, asset);
            return;
        }
        const existingIdx = currentList.findIndex(
            (i) => i.ticker.toUpperCase() === cleanTicker
        );
        if (existingIdx !== -1) {
            if (cleanTicker === 'KAS' && currentList.length >= 2) {
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
            return;
        }
        const existingSecondaries = currentList
            .filter((i) => i.ticker.toUpperCase() !== 'KAS')
            .slice(0, 3);
        if (cleanTicker !== 'KAS') {
            existingSecondaries.push(toPlantTargetSpec(asset, 0));
        } else if (existingSecondaries.length === 0) {
            existingSecondaries.push(
                toPlantTargetSpec(treasury.getAsset('USDC'), 50.0)
            );
        }
        const equalShare = Number(
            (50.0 / existingSecondaries.length).toFixed(2)
        );
        const reweightedSecondaries = existingSecondaries.map((sec) => ({
            ...sec,
            weightPct: equalShare
        }));
        const combined = [
            toPlantTargetSpec(treasury.getAsset('KAS'), 50.0),
            ...reweightedSecondaries
        ];
        if (targetMode === 'create') {
            draftSelectedAssets = syncConfigFromAssetList(
                combined,
                draftSettlementConfig
            ).updatedList;
            draftIsSyndicateSector = false;
            if (draftSectorName.startsWith('SILO-')) {
                draftSectorName = draftSectorName.replace('SILO-', 'PLANT-');
            }
        } else {
            editSelectedAssets = syncConfigFromAssetList(
                combined,
                editSettlementParams
            ).updatedList;
        }
    }

    function removeAssetFromSector(
        targetMode: 'create' | 'edit',
        ticker: string
    ) {
        const clean = ticker.toUpperCase();
        const currentList =
            targetMode === 'create'
                ? [...draftSelectedAssets]
                : [...editSelectedAssets];
        const remainingSecondaries = currentList.filter(
            (i) =>
                i.ticker.toUpperCase() !== clean &&
                i.ticker.toUpperCase() !== 'KAS'
        );
        let nextList: PlantAssetTarget[];
        if (remainingSecondaries.length === 0) {
            nextList = [toPlantTargetSpec(treasury.getAsset('KAS'), 100.0)];
        } else if (
            remainingSecondaries.length === 1 &&
            currentList.length === 2 &&
            clean === 'KAS'
        ) {
            nextList = [{ ...remainingSecondaries[0], weightPct: 100.0 }];
        } else {
            const equalW = Number(
                (50.0 / remainingSecondaries.length).toFixed(2)
            );
            nextList = [
                toPlantTargetSpec(treasury.getAsset('KAS'), 50.0),
                ...remainingSecondaries.map((s) => ({
                    ...s,
                    weightPct: equalW
                }))
            ];
        }
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

    function equalizeSecondaryWeights(targetMode: 'create' | 'edit') {
        const currentList =
            targetMode === 'create'
                ? [...draftSelectedAssets]
                : [...editSelectedAssets];
        if (currentList.length < 2) return;
        const secondaries = currentList.filter(
            (i) => i.ticker.toUpperCase() !== 'KAS'
        );
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
            targetMode === 'create'
                ? [...draftSelectedAssets]
                : [...editSelectedAssets];
        if (currentList.length < 2) return;
        const secondaries = currentList.filter(
            (i) => i.ticker.toUpperCase() !== 'KAS'
        );
        if (secondaries.length <= 1) {
            return;
        }
        const clampedTarget = Math.max(1.0, Math.min(49.0, rawNewPct));
        const remainingForOthers = Math.max(0.5, 50.0 - clampedTarget);
        const others = secondaries.filter(
            (s) => s.ticker.toUpperCase() !== changedTicker.toUpperCase()
        );
        const othersOldSum = others.reduce(
            (sum, o) => sum + Math.max(0.1, o.weightPct),
            0
        );
        const updatedSecondaries = secondaries.map((s) => {
            if (s.ticker.toUpperCase() === changedTicker.toUpperCase()) {
                return { ...s, weightPct: Number(clampedTarget.toFixed(2)) };
            }
            const share =
                othersOldSum > 0
                    ? (Math.max(0.1, s.weightPct) / othersOldSum) *
                      remainingForOthers
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
        let val = parseFloat(valStr);
        if (isNaN(val)) val = 0;
        if (val > draftSectorMax) val = draftSectorMax;
        draftSectorPct = parseFloat(val.toFixed(1));
    }

    function updateDraftHash(valStr: string) {
        let val = parseFloat(valStr);
        if (isNaN(val)) val = 0;
        const maxHash = displayHashrate * (draftSectorMax / 100);
        if (val > maxHash) val = maxHash;
        draftSectorPct = parseFloat(
            ((val / (displayHashrate || 1)) * 100).toFixed(1)
        );
    }

    function handleSectorInputPct(id: string, valStr: string) {
        markMutation();
        let val = parseFloat(valStr);
        if (isNaN(val)) val = 0;
        operations.sectors = operations.sectors.map((s) => {
            if (s.id === id) {
                const max = s.allocationPercentage + unallocatedPercentage;
                const cleanVal = parseFloat(Math.min(val, max).toFixed(1));
                return { ...s, allocationPercentage: cleanVal };
            }
            return s;
        });
    }

    function handleSectorInputHash(id: string, hashStr: string) {
        markMutation();
        let hashVal = parseFloat(hashStr);
        if (isNaN(hashVal)) hashVal = 0;
        operations.sectors = operations.sectors.map((s) => {
            if (s.id === id) {
                const maxPct = s.allocationPercentage + unallocatedPercentage;
                const maxHash = displayHashrate * (maxPct / 100);
                const cleanHash = Math.min(hashVal, maxHash);
                const pct = parseFloat(
                    ((cleanHash / (displayHashrate || 1)) * 100).toFixed(1)
                );
                return { ...s, allocationPercentage: pct };
            }
            return s;
        });
    }

    function handleSectorSliderInput(id: string, e: Event) {
        markMutation();
        const input = e.target as HTMLInputElement;
        let val = parseFloat(input.value);
        if (isNaN(val)) val = 0;
        operations.sectors = operations.sectors.map((s) => {
            if (s.id !== id) return s;
            const otherAllocated = operations.sectors.reduce(
                (acc, sec) =>
                    sec.id === id ? acc : acc + sec.allocationPercentage,
                0
            );
            const absoluteMax = parseFloat((100.0 - otherAllocated).toFixed(1));
            const cleanVal = parseFloat(Math.min(val, absoluteMax).toFixed(1));
            if (val > absoluteMax) input.value = cleanVal.toString();
            return { ...s, allocationPercentage: cleanVal };
        });
    }

    async function handleSectorSliderChange(id: string) {
        await commitSectorUpdate(id);
    }

    async function commitSectorUpdate(id: string) {
        const sector = operations.sectors.find((s) => s.id === id);
        if (sector) {
            if (Math.abs(allocatedPercentage - 100.0) < 0.05) {
                ui.triggerMicroBadge(`sector_${id}`, 'ROUTED 100% ✓', '#18C6A5');
            }
            await safeDispatch('UPDATE_SECTOR_ALLOCATION', {
                id,
                allocationPercentage: sector.allocationPercentage
            });
        }
    }

    function openSectorModal() {
        if (unallocatedPercentage <= 0) return;
        syncSavedBankRailStatus();
        syncMineableKrc20Vaults();
        treasury.syncRwaOraclePrices();
        draftSectorPct = parseFloat(unallocatedPercentage.toFixed(1));
        draftSectorMax = parseFloat(unallocatedPercentage.toFixed(1));
        const randomHex = Math.random()
            .toString(36)
            .substring(2, 6)
            .toUpperCase();
        draftSectorName = `SILO-${randomHex}`;
        draftIsSyndicateSector = false;
        const kasAsset = treasury.getAsset('KAS');
        draftSettlementConfig = {
            ...defaultSettlement,
            threshold: DEFAULT_RESERVE_PAYOUT_KAS,
            payoutAddress: resolveChainAddressForTicker('KAS'),
            targetAsset: kasAsset as any,
            targetAssets: [toPlantTargetSpec(kasAsset, 100.0)],
            plantWeights: { KAS: 100.0 },
            plantPair: 'KAS'
        };
        draftSelectedAssets = [toPlantTargetSpec(kasAsset, 100.0)];
        isSectorModalOpen = true;
    }

    async function createSector() {
        if (draftSectorPct <= 0 || draftSectorPct > draftSectorMax) return;
        const id = Math.random().toString(36).substring(2, 8).toUpperCase();
        const { updatedList, isPlant } = syncConfigFromAssetList(
            draftSelectedAssets,
            draftSettlementConfig
        );
        draftSelectedAssets = updatedList;
        const draftMineable = !isPlant
            ? mineableVaultMap.get(
                  (draftSettlementConfig.targetAsset?.ticker || '').toUpperCase()
              ) || null
            : null;
        const fallbackName = `${isPlant ? 'Plant' : draftIsSyndicateSector ? 'Syndicate' : 'Silo'}-${id.substring(0, 4)}`;
        const finalName = draftSectorName.trim() || fallbackName;
        let routeMode: RouteMode = 'hold';
        if (isPlant) {
            routeMode = 'auto-lp';
        } else {
            routeMode =
                draftSettlementConfig.targetAsset.ticker === 'KAS'
                    ? 'hold'
                    : 'swap';
        }
        const configCopy: any = JSON.parse(
            JSON.stringify(draftSettlementConfig)
        );
        if (!isPlant && draftMineable) {
            configCopy.isMineableKrc20 = true;
            configCopy.syndicateVault = draftIsSyndicateSector;
            configCopy.dailyVaultEmission = draftMineable.dailyEmissionTokens;
        }
        const newSector: Sector = {
            id,
            name: finalName,
            allocationPercentage: draftSectorPct,
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
                ? '+LP PLANT ARMED ✓'
                : draftMineable
                  ? 'POH KRC-20 SYNDICATE ARMED ✓'
                  : 'SILO DEPLOYED ✓',
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
            const newName = prompt('Enter new Sector name:', currentName);
            if (newName && newName.trim() !== '') {
                operations.sectors = operations.sectors.map((s) =>
                    s.id === id ? { ...s, name: newName.trim() } : s
                );
                triggerShimmer(`sector_${id}`);
                ui.triggerMicroBadge(`sector_${id}`, 'RENAMED ✓', '#18C6A5');
                await safeDispatch('RENAME_SECTOR', {
                    id,
                    name: newName.trim()
                });
            }
        }
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
        if (!safeConfig.targetAsset)
            safeConfig.targetAsset = treasury.getAsset('KAS') as any;
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
                    trimmedName !== '' &&
                    trimmedName !== settlementModalSilo.name;
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
                            settlementConfig: JSON.parse(
                                JSON.stringify(editSettlementParams)
                            ),
                            routeMode: newRouteMode
                        };
                    }
                    return s;
                });
                triggerShimmer(`sector_${activeSiloId}`);
                ui.triggerMicroBadge(
                    `sector_${activeSiloId}`,
                    isPlant
                        ? 'LIQUIDITY PLANT UPDATED ✓'
                        : 'PROTOCOL UPDATED ✓',
                    editSettlementParams.targetAsset?.theme?.hex || '#18C6A5'
                );
                if (nameChanged)
                    await safeDispatch('RENAME_SECTOR', {
                        id: activeSiloId,
                        name: trimmedName
                    });
                await safeDispatch('UPDATE_SETTLEMENT', {
                    id: activeSiloId,
                    config: editSettlementParams
                });
            } catch {
                alert('Signature Request Rejected. Parameters not saved.');
                return;
            } finally {
                isSigningSettlement = false;
                settlementModalSilo = null;
                editSettlementParams = { ...defaultSettlement };
            }
        }
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
        operations.sectors.forEach((sec) => {
            if (sec.allocationPercentage > 0) {
                const pct = sec.allocationPercentage;
                const hex =
                    sec.settlementConfig?.targetAsset?.theme?.hex || '#18C6A5';
                segments.push({
                    id: sec.id,
                    name: sec.name,
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
        syncUnassignedReserveTelemetry();
        syncSavedBankRailStatus();
        syncRecentSettlementEvents();
    }

    onMount(() => {
        syncUnassignedReserveTelemetry();
        syncSavedBankRailStatus();
        syncRecentSettlementEvents();
        syncMineableKrc20Vaults();
        loadHashChartHistory(hashChartTimeframe);
        loadPriceChartHistory(priceChartTimeframe);

        if (browser) {
            window.addEventListener(
                'perennia:yield_update',
                handleRealtimeYieldOrFiatEvent
            );
            window.addEventListener(
                'perennia:fiat_event',
                handleRealtimeYieldOrFiatEvent
            );
        }

        chartInterval = setInterval(() => {
            if (browser && identity.isWalletConnected) {
                if (hashChartTimeframe === '1H') {
                    displayHashHistory = [
                        ...displayHashHistory,
                        displayHashrate
                    ].slice(-60);
                }
                const spot = treasury.getAsset('KAS').spotPrice;
                if (spot > 0 && kasHistory.length === 0) {
                    kasHistory = [spot];
                }
            }
        }, 2000);

        reservePollInterval = setInterval(() => {
            if (browser && identity.isWalletConnected) {
                syncUnassignedReserveTelemetry();
                loadPriceChartHistory(priceChartTimeframe);
            }
        }, 12000);
    });

    onDestroy(() => {
        if (browser) {
            window.removeEventListener(
                'perennia:yield_update',
                handleRealtimeYieldOrFiatEvent
            );
            window.removeEventListener(
                'perennia:fiat_event',
                handleRealtimeYieldOrFiatEvent
            );
        }
        if (chartInterval) clearInterval(chartInterval);
        if (reservePollInterval) clearInterval(reservePollInterval);
    });

    let hashratePath = $derived(
        buildSvgPath(displayHashHistory, 200, 240, true)
    );
    let pricePath = $derived(buildSvgPath(kasHistory.length > 1 ? kasHistory : (ui.isTutorialActive ? [0.158, 0.161, 0.159, 0.163, 0.162, 0.165] : kasHistory), 200, 240, false));
    let activePriceDeltaPct = $derived(
        priceTimeframeDelta !== null
            ? priceTimeframeDelta
            : treasury.getAsset('KAS').delta || 0
    );
</script>

{#if activeWorkerMenu !== null}
    <div
        role="button"
        tabindex="0"
        aria-label="Close menu"
        class="fixed inset-0 z-30 cursor-default border-none bg-black/20"
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
<div data-testid="mobile-kpi-ribbon" class="lg:hidden flex items-stretch gap-2.5 overflow-x-auto snap-x snap-mandatory hide-scrollbar -mx-1 px-1 pb-1 font-mono"><div class="snap-start shrink-0 min-w-[146px] bg-[#0a0d12] border border-[#18C6A5]/35 rounded-2xl px-3.5 py-2.5 flex flex-col justify-between"><span class="text-[8px] font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full {displayHashrate > 0 ? 'bg-[#18C6A5] animate-pulse' : 'bg-neutral-600'}"></span>Hashrate</span><span class="text-sm font-black text-white tabular-nums mt-0.5">{displayHashrate.toFixed(2)} <span class="text-[9px] text-[#18C6A5]">TH/s</span></span></div><div class="snap-start shrink-0 min-w-[146px] bg-[#0a0d12] border border-white/10 rounded-2xl px-3.5 py-2.5 flex flex-col justify-between"><span class="text-[8px] font-bold uppercase tracking-widest text-neutral-400">KAS / USD</span><div class="flex items-baseline gap-1.5 mt-0.5"><span class="text-sm font-black text-white tabular-nums">${treasury.getAsset('KAS').spotPrice.toFixed(4)}</span><span class="text-[8px] font-bold {activePriceDeltaPct >= 0 ? 'text-[#18C6A5]' : 'text-red-400'}">{activePriceDeltaPct >= 0 ? '+' : ''}{activePriceDeltaPct.toFixed(1)}%</span></div></div><div class="snap-start shrink-0 min-w-[152px] bg-[#0a0d12] border border-white/10 rounded-2xl px-3.5 py-2.5 flex flex-col justify-between"><span class="text-[8px] font-bold uppercase tracking-widest text-neutral-400">Blocks</span><span class="text-xs font-black text-blue-400 tabular-nums mt-0.5 truncate">{operations.virtualDaaScore > 0 ? operations.virtualDaaScore.toLocaleString() : operations.networkDifficulty > 0 ? operations.networkDifficulty.toExponential(2) : (operations.globalNodeStatus === 'connected' ? 'DAG ONLINE' : 'STANDBY')}</span></div><div class="snap-start shrink-0 min-w-[158px] bg-[#0a0d12] border border-amber-500/35 rounded-2xl px-3.5 py-2.5 flex flex-col justify-between"><span class="text-[8px] font-bold uppercase tracking-widest text-amber-400">Next Payout</span><span class="text-sm font-black text-white tabular-nums mt-0.5">{operations.formatEpochCountdown()}</span></div></div>
<div class="grid grid-cols-1 lg:grid-cols-12 gap-4 xl:gap-5 w-full max-w-[1720px] mx-auto pb-24 items-start mt-2 lg:mt-0">
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
            onOpenSectorModal={openSectorModal}
        />

        <!-- CENTER WORKSPACE: TELEMETRY CHARTS + SETTLEMENT SILOS & LIQUIDITY PLANTS -->
        <div
            class="flex flex-col gap-4 lg:col-span-6 xl:col-span-8 relative z-10 min-w-0"
            data-tour="sector-matrix"
        >
            
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div
                        class="tactile-card bg-[#0a0d12] border border-white/10 rounded-[24px] p-4 flex flex-col justify-between h-[230px] shadow-inner relative overflow-hidden group"
                        style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.08), transparent 60%);"
                    >
                        <div class="flex justify-between items-start gap-2 relative z-10">
                            <div class="flex flex-col pointer-events-none">
                                <span class="text-[10px] font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                                    <div
                                        class="w-2 h-2 rounded-full {operations.globalNodeStatus === 'connected' ? 'bg-[#18C6A5] animate-pulse' : 'bg-neutral-600'}"
                                    ></div>
                                    Hashrate
                                </span>
                                <span class="text-2xl font-mono font-light text-white tracking-tight mt-0.5 whitespace-nowrap tabular-nums">
                                    {displayHashrate.toFixed(2)}
                                    <span class="text-xs text-neutral-400 font-bold">TH/s</span>
                                </span>
                            </div>
                            <div class="flex items-center gap-1 bg-[#11161f] border border-white/10 rounded-xl p-1 pointer-events-auto">
                                {#each ['1H', '24H', '7D', '30D'] as tf (tf)}
                                    <button
                                        type="button"
                                        data-testid="hash-chart-tf-{tf}"
                                        onclick={() => {
                                            hashChartTimeframe = tf as ChartTimeframe;
                                            loadHashChartHistory(tf as ChartTimeframe);
                                        }}
                                        class="px-2 py-0.5 rounded-lg text-[8px] font-mono font-bold uppercase cursor-pointer transition-colors {hashChartTimeframe === tf ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/40' : 'text-neutral-400 hover:text-white'}"
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
                                    class="drop-shadow-[0_0_5px_rgba(24,198,165,0.5)]"
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
                        class="tactile-card bg-[#0a0d12] border border-white/10 rounded-[24px] p-4 flex flex-col justify-between h-[230px] shadow-inner relative overflow-hidden group"
                        style="background-image: radial-gradient(ellipse at top right, rgba(59, 130, 246, 0.08), transparent 60%);"
                    >
                        <div class="flex justify-between items-start gap-2 relative z-10">
                            <div class="flex flex-col pointer-events-none">
                                <span class="text-[10px] font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                                    <div class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                                    KAS Price
                                </span>
                                <div class="flex items-baseline gap-2 mt-0.5">
                                    <span class="text-2xl font-mono font-light text-white tracking-tight tabular-nums">
                                        ${treasury.getAsset('KAS').spotPrice.toFixed(4)}
                                    </span>
                                    <span
                                        class="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-[#11161f] border {activePriceDeltaPct >= 0 ? 'text-[#10b981] border-emerald-900/30' : 'text-[#ef4444] border-red-900/30'}"
                                    >
                                        {activePriceDeltaPct > 0 ? '+' : ''}{activePriceDeltaPct.toFixed(2)}%
                                    </span>
                                </div>
                            </div>
                            <div class="flex items-center gap-1 bg-[#11161f] border border-white/10 rounded-xl p-1 pointer-events-auto">
                                {#each ['1H', '24H', '7D', '30D'] as tf (tf)}
                                    <button
                                        type="button"
                                        data-testid="price-chart-tf-{tf}"
                                        onclick={() => {
                                            priceChartTimeframe = tf as ChartTimeframe;
                                            loadPriceChartHistory(tf as ChartTimeframe);
                                        }}
                                        class="px-2 py-0.5 rounded-lg text-[8px] font-mono font-bold uppercase cursor-pointer transition-colors {priceChartTimeframe === tf ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/40' : 'text-neutral-400 hover:text-white'}"
                                    >
                                        {tf}
                                    </button>
                                {/each}
                            </div>
                        </div>
                        <div class="absolute inset-0 pointer-events-none p-4 z-0">
                            <div class="w-full h-full border-l border-b border-white/5 relative">
                                <span class="absolute -left-3 top-4 -rotate-90 origin-left text-[8px] tracking-widest uppercase font-mono text-neutral-500">
                                    USD
                                </span>
                                <span class="absolute bottom-1 right-2 text-[8px] tracking-widest uppercase font-mono text-neutral-500">
                                    {priceChartTimeframe} →
                                </span>
                            </div>
                        </div>
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
                                    class="drop-shadow-[0_0_5px_rgba(112,199,186,0.5)]"
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
                    </div>
                </div>
            

            <div
                class="flex flex-col gap-5 flex-1 border border-white/10 rounded-[32px] bg-[#0a0d12] p-5 sm:p-6 min-h-[260px] lg:min-h-[420px] shadow-2xl relative overflow-hidden tactical-grid-canvas"
                style="background-image: radial-gradient(ellipse at 50% 0%, rgba(24, 198, 165, 0.06), transparent 60%), linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px); background-size: 100% 100%, 30px 30px, 30px 30px;"
            >
                {#if operations.sectors.length === 0}
                    <div class="relative z-10 flex flex-col items-center justify-center text-center py-10 px-4">
                        <h2 class="text-3xl md:text-5xl font-light uppercase tracking-[0.1em] text-white/30 mb-8 drop-shadow-lg text-center">
                            <br />
                            <span class="text-[#18C6A5]/50">Payout Splits</span>
                        </h2>
                        <div class="relative w-24 h-24 rounded-full bg-[#18C6A5]/5 border border-[#18C6A5]/20 flex items-center justify-center mb-6 shadow-inner">
                            <svg
                                class="text-[#18C6A5]/30 w-10 h-10"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                stroke-width="1.5"
                            >
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                        </div>
                        <p class="text-[11px] uppercase tracking-widest text-neutral-400 font-bold text-center leading-relaxed">
                            100% KAS → Wallet (50 KAS min • 1% fee)<br />
                            <span class="text-[10px] font-mono text-neutral-500 font-normal mt-2 block">
                                
                            </span>
                        </p>
                    </div>
                {:else}
                    <div class="flex flex-col gap-6 relative z-10 content-start pb-10">
                        {#if siloSectors.length > 0}
                            <div class="flex flex-col gap-3" data-testid="settlement-silos-section">
                                <div class="flex items-center justify-between border-b border-[#18C6A5]/25 pb-2">
                                    <h3 class="text-[10px] font-bold uppercase tracking-widest text-[#18C6A5]">
                                        Token Splits
                                    </h3>
                                    <span class="text-[9px] font-mono text-neutral-400">
                                        {siloSectors.length} Split{siloSectors.length === 1 ? '' : 's'}
                                    </span>
                                </div>
                                <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 xl:gap-5">
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
                                        />
                                    {/each}
                                </div>
                            </div>
                        {/if}

                        {#if plantSectors.length > 0}
                            <div class="flex flex-col gap-3 mt-2" data-testid="liquidity-plants-section">
                                <div class="flex items-center justify-between border-b border-blue-500/25 pb-2">
                                    <h3 class="text-[10px] font-bold uppercase tracking-widest text-blue-400">
                                        Pool Splits
                                    </h3>
                                    <span class="text-[9px] font-mono text-neutral-400">
                                        {plantSectors.length} Pool Split{plantSectors.length === 1 ? '' : 's'}
                                    </span>
                                </div>
                                <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 xl:gap-5">
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
                                        />
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>

        <PoolDistributionSidebar
            {displayHashrate}
            {effortData}
            {displayedBuckets}
        />
    </div>
</div>

<SectorConfigModals
    bind:isSectorModalOpen
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
    {displayHashrate}
    {mineableVaultMap}
    {savedBankRailLast4}
    {savedBankRailMethod}
    {isPullingOutKey}
    onUpdateDraftPct={updateDraftPct}
    onUpdateDraftHash={updateDraftHash}
    onCreateSector={createSector}
    onSaveSettlementParams={saveSettlementParams}
    onEqualizeSecondaryWeights={equalizeSecondaryWeights}
    onAdjustSecondaryPlantWeight={adjustSecondaryPlantWeight}
    onRemoveAssetFromSector={removeAssetFromSector}
    onAddOrToggleAssetInSector={addOrToggleAssetInSector}
    onClaimPendingSectorKas={claimPendingSectorKas}
/>

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
        background: #11161f;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        outline: none;
    }
    :global(.custom-range-slider::-webkit-slider-thumb) {
        -webkit-appearance: none;
        appearance: none;
        height: 18px;
        width: 18px;
        border-radius: 50%;
        background: #e4e4e7;
        cursor: pointer;
        border: 2px solid #18c6a5;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    }
</style>