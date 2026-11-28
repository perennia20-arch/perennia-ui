<script lang="ts">
    import { slide } from 'svelte/transition';
    import { operations } from '$lib/stores/operations.svelte';
    import { ui } from '$lib/stores/ui.svelte';
    import { pwa } from '$lib/stores/pwa.svelte';
    import { i18n } from '$lib/stores/i18n.svelte';
    import { treasury, type UnifiedAsset } from '$lib/stores/treasury.svelte';
    import {
        getChainExplorerAddressUrl,
        getChainExplorerTxUrl
    } from '$lib/stores/transaction.svelte';
    import {
        LIVE_PRICING_UNAVAILABLE_MESSAGE,
        type SettlementReceiptRecord,
        type VaultLockRecord
    } from '$lib/crypto/atomicMath';
    import type {
        Sector,
        RouteMode,
        SettlementConfig,
        PlantAssetTarget
    } from '$lib/stores/type';
    import {
        DEFAULT_RESERVE_PAYOUT_KAS,
        formatBpsToPctDisplay,
        formatPairReserveDisplay,
        formatSectorDisplayTitle,
        formatSettlementTierLabel,
        formatSettledAssetAmount,
        formatSompiToKasDisplay,
        formatVaultStatusLabel,
        hydrateSectorTargetAssets,
        normalizePlantTargets,
        readSectorAllocationBps,
        toPlantTargetSpec,
        type MineableKrc20VaultInfo,
        type ViewSector
    } from './operationsHelpers';

    const _num = (v: unknown): number => {
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? n : 0;
    };

    let {
        sector,
        displayHashrate = 0,
        unallocatedPercentage = 0,
        dragSectorId = null,
        dropTargetSectorId = null,
        shimmerTargetId = null,
        mineableVaultMap = new Map(),
        savedBankRailLast4 = null,
        savedBankRailMethod = 'ACH',
        vaultLock = null,
        latestReceipt = null,
        livePricingUnavailable = false,
        resolveChainAddressForTicker,
        estimateSectorDailyKas,
        estimateSectorDailyUsd,
        onDragStart,
        onDragEnd,
        onDragOver,
        onDragLeave,
        onDrop,
        onToggleWidth,
        onDeleteSector,
        onInputPct,
        onInputHash,
        onSliderInput,
        onSliderChange,
        onCommitUpdate,
        onSnapMaxRemaining,
        onInlineSaveSector,
        onFundPair,
        onCancelOrWithdrawPair
    }: {
        sector: ViewSector;
        displayHashrate: number;
        unallocatedPercentage: number;
        dragSectorId: string | null;
        dropTargetSectorId: string | null;
        shimmerTargetId: string | null;
        mineableVaultMap: Map<string, MineableKrc20VaultInfo>;
        savedBankRailLast4: string | null;
        savedBankRailMethod: string;
        vaultLock?: VaultLockRecord | null;
        latestReceipt?: SettlementReceiptRecord | null;
        livePricingUnavailable?: boolean;
        resolveChainAddressForTicker: (ticker: string) => string;
        estimateSectorDailyKas: (s: ViewSector) => number;
        estimateSectorDailyUsd: (s: ViewSector) => number;
        onDragStart: (e: DragEvent, s: Sector) => void;
        onDragEnd: () => void;
        onDragOver: (e: DragEvent, id: string) => void;
        onDragLeave: () => void;
        onDrop: (e: DragEvent, id: string) => void;
        onRenameSector?: (id: string) => void;
        onToggleWidth: (id: string) => void;
        onOpenSettlement?: (s: Sector) => void;
        onDeleteSector: (id: string) => void;
        onInputPct: (id: string, valStr: string) => void;
        onInputHash: (id: string, hashStr: string) => void;
        onSliderInput: (id: string, e: Event) => void;
        onSliderChange: (id: string) => void;
        onCommitUpdate: (id: string) => void;
        onSnapMaxRemaining: (id: string) => void;
        onInlineSaveSector?: (
            id: string,
            nextName: string,
            nextRouteMode: RouteMode,
            nextConfig: SettlementConfig
        ) => Promise<void>;
        onOpenVaultLock?: (s: Sector) => void;
        onFundPair?: (s: Sector) => void;
        onCancelOrWithdrawPair?: (
            s: Sector,
            action: 'cancel' | 'withdraw'
        ) => Promise<void> | void;
    } = $props();

    let isEditing = $state(false);
    let isSaving = $state(false);
    let pickerMode = $state<'closed' | 'replace_primary' | 'add_secondary'>('closed');
    let pickerQuery = $state('');
    let pickerCategory = $state<'ALL' | 'CRYPTO' | 'EQUITIES' | 'COMMODITIES' | 'MINEABLE'>('ALL');

    let draftName = $state('');
    let draftPayoutAddr = $state('');
    let draftMode = $state<'epoch' | 'threshold' | 'appointment'>('epoch');
    let draftThreshold = $state(DEFAULT_RESERVE_PAYOUT_KAS);
    let draftAutoPayout = $state(true);
    let draftAssets = $state<PlantAssetTarget[]>([]);
    let isPickerSearching = $state(false);
    let discoveredInlineAssets = $state<UnifiedAsset[]>([]);
    let pickerDiscoverTimer: ReturnType<typeof setTimeout> | undefined;
    let inlineSearchSeq = 0;

    $effect(() => () => clearTimeout(pickerDiscoverTimer));
    $effect(() => {
        const key = 'sector_edit_' + sector.id;
        ui.syncSubOverlay(key, isEditing, cancelInlineEditor);
        return () => ui.syncSubOverlay(key, false, () => {});
    });

    function handleInlinePickerInput(raw: string) {
        pickerQuery = raw;
        const trimmed = raw.trim();
        if (trimmed.length > 0 && pickerCategory !== 'ALL') pickerCategory = 'ALL';
        clearTimeout(pickerDiscoverTimer);
        if (trimmed.length < 2) {
            isPickerSearching = false;
            discoveredInlineAssets = [];
            return;
        }
        const seq = ++inlineSearchSeq;
        isPickerSearching = true;
        pickerDiscoverTimer = setTimeout(async () => {
            try {
                const res = await treasury.discoverAndRegisterToken(trimmed, true);
                if (seq === inlineSearchSeq && Array.isArray(res?.matches)) {
                    discoveredInlineAssets = res.matches;
                }
            } finally {
                if (seq === inlineSearchSeq) isPickerSearching = false;
            }
        }, 200);
    }

    function selectCustomInlineTicker() {
        const clean = pickerQuery
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, 10);
        if (clean.length < 2) return;
        const customAsset = treasury.registerDiscoveredAsset(
            {
                ticker: clean,
                name: `${clean} (Custom Asset)`,
                assetClass: 'Ecosystem',
                network: 'KAS',
                contract: clean
            },
            true
        );
        selectDraftAsset(customAsset);
    }

    function handleTokenIconError(e: Event) {
        const target = e.currentTarget as HTMLImageElement;
        target.style.display = 'none';
        if (target.nextElementSibling) {
            (target.nextElementSibling as HTMLElement).style.display = 'inline';
        }
    }

    let isLp = $derived(sector.routeMode === 'auto-lp');
    let targetTicker = $derived(sector.settlementConfig?.targetAsset?.ticker || 'KAS');
    let isUsdSilo = $derived(!isLp && targetTicker === 'USD');
    let hex = $derived(sector.settlementConfig?.targetAsset?.theme?.hex || '#18C6A5');
    let allocationBps = $derived(readSectorAllocationBps(sector));
    let allocationPctDisplay = $derived(formatBpsToPctDisplay(allocationBps, 2, true));
    let allocationPctNumeric = $derived(allocationBps / 100);
    let mappedHash = $derived((displayHashrate * allocationBps) / 10_000);
    let dailyKas = $derived(estimateSectorDailyKas(sector));
    let dailyUsd = $derived(estimateSectorDailyUsd(sector));
    let isDragged = $derived(dragSectorId === sector.id);
    let isDropTarget = $derived(dropTargetSectorId === sector.id);
    let spanClass = $derived(
        isEditing || (sector.width || 6) === 12 ? 'lg:col-span-12' : 'lg:col-span-6'
    );
    let activeBadge = $derived(ui.microBadges[`sector_${sector.id}`]);
    let resolvedPayoutAddr = $derived(
        sector.settlementConfig?.payoutAddress ||
            resolveChainAddressForTicker(targetTicker)
    );
    let sectorExplorerUrl = $derived(
        latestReceipt?.destinationTxid
            ? getChainExplorerTxUrl(latestReceipt.targetAsset || targetTicker, latestReceipt.destinationTxid)
            : latestReceipt?.kaspaL1Txid
              ? getChainExplorerTxUrl('KAS', latestReceipt.kaspaL1Txid)
              : vaultLock?.covenantAddress
                ? getChainExplorerAddressUrl('KAS', vaultLock.covenantAddress)
                : getChainExplorerAddressUrl(targetTicker, resolvedPayoutAddr)
    );
    let plantTargets = $derived(isLp ? hydrateSectorTargetAssets(sector) : []);
    let plantPairLabel = $derived(
        isLp && plantTargets.length >= 2
            ? plantTargets.map((t) => t.ticker).join(' / ')
            : `KAS / ${targetTicker}`
    );
    let displayTitle = $derived(formatSectorDisplayTitle(sector));
    let pairReserve = $derived.by(() => {
        if (!isLp) return null;
        if (sector.settlementConfig?.pairReserve) {
            return sector.settlementConfig.pairReserve;
        }
        const t0 = plantTargets[0]?.ticker || 'KAS';
        const t1 = plantTargets[1]?.ticker || targetTicker || 'SILO';
        return {
            status: 'QUEUED' as const,
            baseTicker: t0,
            partnerTicker: t1,
            baseBalanceAtomic: '0',
            partnerBalanceAtomic: '0',
            heldBaseAtomic: '0',
            queuedBaseAtomic: '0',
            targetPartnerAtomic: '0',
            accruedFeesUsdMicros: '0',
            feeRateBps: 100 as const,
            updatedAt: Date.now()
        };
    });
    let pairReserveDisplay = $derived(
        pairReserve ? formatPairReserveDisplay(pairReserve) : null
    );
    let vaultBalanceKas = $derived(
        vaultLock
            ? formatSompiToKasDisplay(
                  vaultLock.liveUtxoSompi || vaultLock.confirmedUtxoSompi || '0',
                  4,
                  true
              )
            : null
    );

    let isDraftPlant = $derived(draftAssets.length >= 2);
    let draftPrimaryAsset = $derived(
        isDraftPlant
            ? draftAssets[1] || draftAssets[0]
            : draftAssets[0] || toPlantTargetSpec(treasury.getAsset('KAS'), 100.0)
    );

    let filteredAssets = $derived.by(() => {
        const q = pickerQuery.trim().toLowerCase();
        const combined = new Map<string, UnifiedAsset>();
        for (const d of discoveredInlineAssets) if (d?.ticker) combined.set(d.ticker.toUpperCase(), d);
        for (const r of treasury.registry) {
            const k = String(r.ticker || '').toUpperCase();
            if (k && !combined.has(k)) combined.set(k, r);
        }
        const matches = Array.from(combined.values()).filter((a) => {
            const tick = String(a.ticker || '').toLowerCase();
            const name = String(a.name || '').toLowerCase();
            const cls = String(a.assetClass || '').toLowerCase();
            const net = String(a.network || '').toLowerCase();
            const contract = String(a.contract || '').toLowerCase();
            const hit =
                !q ||
                tick.includes(q) ||
                name.includes(q) ||
                cls.includes(q) ||
                net.includes(q) ||
                contract.includes(q);
            if (!hit) return false;
            if (pickerCategory === 'MINEABLE') {
                return mineableVaultMap.has(tick.toUpperCase()) || net === 'kas';
            }
            if (pickerCategory === 'EQUITIES') return a.assetClass === 'Public Equity';
            if (pickerCategory === 'COMMODITIES') {
                return a.assetClass === 'Commodity' || a.assetClass === 'Sovereign Debt';
            }
            if (pickerCategory === 'CRYPTO') {
                return (
                    a.assetClass !== 'Public Equity' &&
                    a.assetClass !== 'Commodity' &&
                    a.assetClass !== 'Sovereign Debt'
                );
            }
            return true;
        });
        if (!q) return matches;
        return [...matches].sort((a, b) => {
            const at = String(a.ticker || '').toLowerCase();
            const bt = String(b.ticker || '').toLowerCase();
            if (at === q && bt !== q) return -1;
            if (bt === q && at !== q) return 1;
            if (at.startsWith(q) && !bt.startsWith(q)) return -1;
            if (bt.startsWith(q) && !at.startsWith(q)) return 1;
            return 0;
        });
    });

    function openInlineEditor(
        initialPicker: 'closed' | 'replace_primary' | 'add_secondary' = 'closed'
    ) {
        if (!isEditing) {
            draftName = sector.name;
            const hydrated = hydrateSectorTargetAssets(sector);
            draftAssets = normalizePlantTargets(hydrated);
            const prim = draftAssets.length >= 2 ? draftAssets[1] : draftAssets[0];
            draftPayoutAddr =
                sector.settlementConfig?.payoutAddress ||
                resolveChainAddressForTicker(prim?.ticker || 'KAS');
            draftMode = (sector.settlementConfig?.mode as 'epoch' | 'threshold' | 'appointment') || 'epoch';
            draftThreshold = Number(
                sector.settlementConfig?.threshold || DEFAULT_RESERVE_PAYOUT_KAS
            );
            draftAutoPayout = sector.settlementConfig?.autoPayout !== false;
            isEditing = true;
            treasury.syncRwaOraclePrices();
        }
        pickerMode = initialPicker;
        pickerQuery = '';
        discoveredInlineAssets = [];
        isPickerSearching = false;
    }

    function cancelInlineEditor() {
        isEditing = false;
        pickerMode = 'closed';
        pickerQuery = '';
        discoveredInlineAssets = [];
        isPickerSearching = false;
    }

    function selectDraftAsset(asset: UnifiedAsset) {
        const cleanTicker = asset.ticker.toUpperCase();
        if (pickerMode === 'replace_primary' && draftAssets.length <= 1) {
            draftAssets = [toPlantTargetSpec(asset, 100.0)];
            draftPayoutAddr = resolveChainAddressForTicker(cleanTicker);
            if (cleanTicker !== 'KAS') draftMode = 'epoch';
            pickerMode = 'closed';
            return;
        }

        const secondaries = draftAssets
            .filter(
                (i) =>
                    i.ticker.toUpperCase() !== 'KAS' &&
                    i.ticker.toUpperCase() !== cleanTicker
            )
            .slice(0, 3);
        if (cleanTicker !== 'KAS') {
            secondaries.push(toPlantTargetSpec(asset, 0));
        } else if (secondaries.length === 0) {
            secondaries.push(toPlantTargetSpec(treasury.getAsset('USDC'), 50.0));
        }
        const eqShare = Number((50.0 / secondaries.length).toFixed(2));
        draftAssets = normalizePlantTargets([
            toPlantTargetSpec(treasury.getAsset('KAS'), 50.0),
            ...secondaries.map((s) => ({ ...s, weightPct: eqShare }))
        ]);
        const primSec = draftAssets[1] || draftAssets[0];
        draftPayoutAddr = resolveChainAddressForTicker(primSec.ticker);
        draftMode = 'epoch';
        pickerMode = 'closed';
    }

    function removeSecondaryAsset(ticker: string) {
        const clean = ticker.toUpperCase();
        const rem = draftAssets.filter(
            (i) => i.ticker.toUpperCase() !== clean && i.ticker.toUpperCase() !== 'KAS'
        );
        if (rem.length === 0) {
            draftAssets = [toPlantTargetSpec(treasury.getAsset('KAS'), 100.0)];
            draftPayoutAddr = resolveChainAddressForTicker('KAS');
        } else {
            const eq = Number((50.0 / rem.length).toFixed(2));
            draftAssets = normalizePlantTargets([
                toPlantTargetSpec(treasury.getAsset('KAS'), 50.0),
                ...rem.map((s) => ({ ...s, weightPct: eq }))
            ]);
            draftPayoutAddr = resolveChainAddressForTicker(draftAssets[1].ticker);
        }
    }

    function equalizeDraftWeights() {
        if (draftAssets.length < 2) return;
        const secs = draftAssets.filter((i) => i.ticker.toUpperCase() !== 'KAS');
        const eq = Number((50.0 / Math.max(1, secs.length)).toFixed(2));
        draftAssets = normalizePlantTargets([
            toPlantTargetSpec(treasury.getAsset('KAS'), 50.0),
            ...secs.map((s) => ({ ...s, weightPct: eq }))
        ]);
    }

    function adjustDraftWeight(changedTicker: string, rawPct: number) {
        if (draftAssets.length <= 2) return;
        const secs = draftAssets.filter((i) => i.ticker.toUpperCase() !== 'KAS');
        const clamped = Math.max(1.0, Math.min(49.0, rawPct));
        const remOthers = Math.max(0.5, 50.0 - clamped);
        const others = secs.filter(
            (s) => s.ticker.toUpperCase() !== changedTicker.toUpperCase()
        );
        const oldSum = others.reduce((acc, o) => acc + Math.max(0.1, o.weightPct), 0);
        const updated = secs.map((s) => {
            if (s.ticker.toUpperCase() === changedTicker.toUpperCase()) {
                return { ...s, weightPct: Number(clamped.toFixed(2)) };
            }
            const share =
                oldSum > 0
                    ? (Math.max(0.1, s.weightPct) / oldSum) * remOthers
                    : remOthers / Math.max(1, others.length);
            return { ...s, weightPct: Number(share.toFixed(2)) };
        });
        draftAssets = normalizePlantTargets([
            toPlantTargetSpec(treasury.getAsset('KAS'), 50.0),
            ...updated
        ]);
    }

    async function saveInlineChanges() {
        isSaving = true;
        try {
            const normalized = normalizePlantTargets(draftAssets);
            const isPlant = normalized.length >= 2;
            const nextName = draftName.trim() || sector.name;
            const weightsMap: Record<string, number> = {};
            for (const item of normalized) {
                weightsMap[item.ticker] = item.weightPct;
            }
            const targetObj = isPlant ? normalized[1] || normalized[0] : normalized[0];
            const nextRouteMode: RouteMode = isPlant
                ? 'auto-lp'
                : targetObj.ticker.toUpperCase() === 'KAS'
                  ? 'hold'
                  : 'swap';

            const baseCfg = sector.settlementConfig || {
                targetAsset: targetObj,
                targetAssets: normalized,
                plantWeights: weightsMap,
                plantPair: normalized.map((i) => i.ticker).join('/'),
                payoutAddress:
                    draftPayoutAddr.trim() || resolveChainAddressForTicker(targetObj.ticker),
                autoPayout: draftAutoPayout,
                mode: 'epoch',
                threshold: DEFAULT_RESERVE_PAYOUT_KAS,
                appointmentDate: '',
                appointmentTime: '17:00'
            };

            const nextConfig: SettlementConfig = {
                ...JSON.parse(JSON.stringify(baseCfg)),
                targetAsset: targetObj,
                targetAssets: normalized,
                plantWeights: weightsMap,
                plantPair: isPlant
                    ? normalized.map((i) => i.ticker).join('/')
                    : targetObj.ticker,
                payoutAddress:
                    draftPayoutAddr.trim() || resolveChainAddressForTicker(targetObj.ticker),
                autoPayout: draftAutoPayout,
                mode:
                    isPlant || targetObj.ticker.toUpperCase() !== 'KAS'
                        ? 'epoch'
                        : draftMode,
                threshold: Math.max(1, Number(draftThreshold) || DEFAULT_RESERVE_PAYOUT_KAS)
            };

            if (onInlineSaveSector) {
                await onInlineSaveSector(sector.id, nextName, nextRouteMode, nextConfig);
            } else {
                const nameChanged = nextName !== sector.name;
                operations.sectors = operations.sectors.map((s) =>
                    s.id === sector.id
                        ? {
                              ...s,
                              name: nextName,
                              routeMode: nextRouteMode,
                              settlementConfig: nextConfig
                          }
                        : s
                );
                if (nameChanged) {
                    await operations.dispatchStateAction('RENAME_SECTOR', {
                        id: sector.id,
                        name: nextName
                    });
                }
                await operations.dispatchStateAction('UPDATE_SETTLEMENT', {
                    id: sector.id,
                    config: nextConfig
                });
            }

            isEditing = false;
            pickerMode = 'closed';
        } finally {
            isSaving = false;
        }
    }
</script>

<div
    draggable={!pwa.isMobile && !isEditing}
    data-testid="sector-card-{sector.name}"
    ondragstart={(e) => {
        if (isEditing) {
            e.preventDefault();
            return;
        }
        onDragStart(e, sector);
    }}
    ondragend={onDragEnd}
    ondragover={(e) => onDragOver(e, sector.id)}
    ondragleave={onDragLeave}
    ondrop={(e) => onDrop(e, sector.id)}
    class="tactile-card {shimmerTargetId === `sector_${sector.id}` ? 'shimmer-flash' : ''} sector-card-compact bg-[var(--bg-card)] rounded-xl px-3 py-2 flex flex-col gap-1.5 relative {isEditing ? 'cursor-default' : 'cursor-pointer'} min-w-0 overflow-hidden {spanClass} {isDragged ? 'opacity-50 scale-95' : ''} {isDropTarget ? 'scale-[1.02]' : ''}"
    style="border: 1px solid {isEditing ? `${hex}75` : 'var(--border-subtle)'}; box-shadow: none;"
>
    {#if activeBadge}
        <div
            class="micro-confirm-badge absolute top-2.5 left-1/2 -translate-x-1/2 z-40 px-3 py-1 rounded-lg bg-[var(--bg-elevated)] border text-[10px] font-mono font-black uppercase tracking-widest"
            style="border-color: {activeBadge.accentHex}60; color: {activeBadge.accentHex};"
        >
            {activeBadge.label}
        </div>
    {/if}

    {#if isLp && pairReserve && pairReserveDisplay}
        <div
            data-testid="pair-reserve-card-{sector.id}"
            onmousedown={(e) => e.stopPropagation()}
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
            role="group"
            class="flex flex-col gap-2 font-mono"
        >
            {#if pairReserve.status === 'QUEUED'}
                <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="text-xs font-black uppercase text-[var(--text-primary)] tracking-wider truncate">
                            {pairReserve.baseTicker} / {pairReserve.partnerTicker}
                        </span>
                        <span
                            data-testid="pair-status-queued-{sector.id}"
                            class="px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-amber-500/40 text-[9px] font-bold uppercase text-amber-500 tabular-nums"
                        >
                            QUEUED · {pairReserveDisplay.progressPctDisplay}%
                        </span>
                    </div>
                    <button
                        type="button"
                        data-testid="pair-cancel-btn-{sector.id}"
                        onclick={() =>
                            onCancelOrWithdrawPair
                                ? onCancelOrWithdrawPair(sector, 'cancel')
                                : onDeleteSector(sector.id)}
                        class="px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-strong)] hover:border-red-400/50 text-[9px] font-black uppercase text-[var(--text-secondary)] hover:text-red-500 cursor-pointer shrink-0"
                    >
                        CANCEL
                    </button>
                </div>
                <div
                    data-testid="pair-queued-progress-{sector.id}"
                    class="w-full h-1.5 rounded-full bg-[var(--bg-input)] border border-[var(--border-subtle)] overflow-hidden"
                >
                    <div
                        class="h-full bg-[#18C6A5] transition-all duration-300"
                        style="width: {Math.min(100, Math.max(0, pairReserveDisplay.progressBps / 100))}%;"
                    ></div>
                </div>
                <div class="flex items-center justify-between text-[11px] text-[var(--text-secondary)] tabular-nums pt-1 border-t border-[var(--border-subtle)]">
                    <span>{pairReserveDisplay.heldBaseFormatted} {pairReserve.baseTicker}</span>
                    <span>
                        {pairReserveDisplay.queuedBaseFormatted} {pairReserve.baseTicker} → {pairReserve.partnerTicker}
                    </span>
                </div>
            {:else}
                <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-black uppercase text-white tracking-wider truncate">
                        {pairReserve.baseTicker} / {pairReserve.partnerTicker}
                    </span>
                    <div class="flex items-center gap-2 tabular-nums shrink-0 text-[11px]">
                        <span class="font-bold text-white">
                            {pairReserveDisplay.livePricingUnavailable
                                ? LIVE_PRICING_UNAVAILABLE_MESSAGE
                                : pairReserveDisplay.totalUsdFormatted}
                        </span>
                        <span class="font-bold text-[#18C6A5]">
                            {pairReserveDisplay.accruedFeesUsdFormatted}
                        </span>
                    </div>
                </div>
                <div class="flex items-center justify-between text-[11px] text-neutral-300 tabular-nums pt-1 border-t border-white/[0.05]">
                    <span>{pairReserveDisplay.baseFormatted} {pairReserve.baseTicker}</span>
                    <span>{pairReserveDisplay.partnerFormatted} {pairReserve.partnerTicker}</span>
                </div>
                <div
                    class="flex items-center gap-1.5 pt-1 border-t border-white/[0.05] min-w-0 w-full font-mono font-bold"
                    role="group"
                >
                    <div class="flex items-center bg-[var(--bg-input)] border border-white/[0.08] rounded px-1.5 py-0 h-[19px] shrink-0">
                        <input
                            type="number"
                            value={allocationPctDisplay}
                            oninput={(e) => onInputPct(sector.id, e.currentTarget.value)}
                            onchange={() => onCommitUpdate(sector.id)}
                            class="sector-slim-num w-8 bg-transparent text-white text-[10px] outline-none text-right tabular-nums"
                        />
                        <span class="text-neutral-500 text-[9px] ml-0.5">%</span>
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        step="0.1"
                        value={allocationPctNumeric}
                        oninput={(e) => onSliderInput(sector.id, e)}
                        onchange={() => onSliderChange(sector.id)}
                        class="sector-slim-range flex-1 min-w-[48px] touch-pan-y cursor-pointer"
                        style="--shex:{hex};background:linear-gradient(to right,{hex} 0%,{hex} {Math.min(100, Math.max(0, allocationPctNumeric))}%,var(--border-subtle) {Math.min(100, Math.max(0, allocationPctNumeric))}%,var(--border-subtle) 100%);"
                    />
                    <div class="flex items-center gap-0.5 bg-[var(--bg-input)] border border-white/[0.08] rounded px-1.5 py-0 h-[19px] shrink-0">
                        <input
                            type="number"
                            value={_num(mappedHash).toFixed(2)}
                            oninput={(e) => onInputHash(sector.id, e.currentTarget.value)}
                            onchange={() => onCommitUpdate(sector.id)}
                            class="sector-slim-num w-9 bg-transparent text-neutral-200 text-[10px] outline-none text-right focus:text-white tabular-nums"
                        />
                        <span class="text-neutral-500 text-[8px] whitespace-nowrap">TH/s</span>
                    </div>
                </div>
                <div class="flex items-center gap-2 pt-1">
                    <button
                        type="button"
                        data-testid="pair-fund-btn-{sector.id}"
                        onclick={() => onFundPair?.(sector)}
                        class="flex-1 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[#18C6A5]/40 text-[#18C6A5] hover:text-white text-[10px] font-black uppercase cursor-pointer"
                    >
                        FUND
                    </button>
                    <button
                        type="button"
                        data-testid="pair-withdraw-btn-{sector.id}"
                        onclick={() =>
                            onCancelOrWithdrawPair
                                ? onCancelOrWithdrawPair(sector, 'withdraw')
                                : onDeleteSector(sector.id)}
                        class="flex-1 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-white/15 text-neutral-300 hover:text-white text-[10px] font-black uppercase cursor-pointer"
                    >
                        WITHDRAW
                    </button>
                </div>
            {/if}
        </div>
    {:else}
    <!-- HEADER ROW -->
    <div
        role="button"
        tabindex="0"
        onclick={() => (isEditing ? cancelInlineEditor() : openInlineEditor('closed'))}
        onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                isEditing ? cancelInlineEditor() : openInlineEditor('closed');
            }
        }}
        class="flex justify-between items-center gap-2 min-w-0"
    >
        <div class="flex items-center gap-1.5 min-w-0 text-xs font-bold uppercase text-white tracking-wider truncate hover:text-[#18C6A5] transition-colors">
            <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:{hex};"></span>
            <span class="truncate">{displayTitle}</span>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
            {#if !isEditing}
                <button
                    type="button"
                    onmousedown={(e) => e.stopPropagation()}
                    onclick={(e) => {
                        e.stopPropagation();
                        onToggleWidth(sector.id);
                    }}
                    class="text-neutral-500 hover:text-white cursor-pointer w-5 h-5 hidden lg:flex items-center justify-center bg-white/[0.03] border border-white/10 rounded text-[7px] font-bold"
                >
                    [ ]
                </button>
            {/if}
            <button
                type="button"
                data-testid="sector-inline-toggle-{sector.id}"
                onmousedown={(e) => e.stopPropagation()}
                onclick={(e) => {
                    e.stopPropagation();
                    isEditing ? cancelInlineEditor() : openInlineEditor('closed');
                }}
                class="cursor-pointer w-5 h-5 flex items-center justify-center border rounded-md text-[10px] transition-colors {isEditing ? 'bg-[var(--bg-hover)] border-[#18C6A5]/60 text-[#18C6A5]' : 'bg-white/[0.03] border-white/10 text-neutral-400 hover:text-white'}"
            >
                {isEditing ? '▴' : '⚙'}
            </button>
            <button
                type="button"
                onmousedown={(e) => e.stopPropagation()}
                onclick={(e) => {
                    e.stopPropagation();
                    onDeleteSector(sector.id);
                }}
                class="text-neutral-500 hover:text-red-400 cursor-pointer w-5 h-5 flex items-center justify-center bg-white/[0.03] border border-white/10 rounded-md text-[10px]"
            >
                ✕
            </button>
        </div>
    </div>

    <!-- ASSET & TELEMETRY ROW -->
    <div
        role="button"
        tabindex="0"
        onclick={() => openInlineEditor(isLp ? 'add_secondary' : 'replace_primary')}
        onkeydown={(e) => {
            if (e.key === 'Enter') openInlineEditor(isLp ? 'add_secondary' : 'replace_primary');
        }}
        class="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.05] min-w-0 group"
    >
        <div class="flex items-start gap-2 min-w-0">
            {#if isLp}
                <div class="flex -space-x-1.5 shrink-0 mt-0.5">
                    {#each plantTargets as pt (pt.ticker)}
                        <div
                            class="w-4 h-4 rounded-full border border-white/15 bg-[var(--bg-input)] flex items-center justify-center text-[7px] font-black"
                            style="color:{pt.theme?.hex || '#18C6A5'};"
                        >
                            {pt.ticker[0]}
                        </div>
                    {/each}
                </div>
            {:else}
                <div
                    class="w-4 h-4 mt-0.5 rounded-full border border-white/15 bg-[var(--bg-input)] flex items-center justify-center text-[8px] font-black overflow-hidden shrink-0"
                    style="color:{hex};"
                >
                    {#if sector.settlementConfig?.targetAsset?.imgUrl}
                        <img
                            src={sector.settlementConfig.targetAsset.imgUrl}
                            class="w-3 h-3 object-contain"
                            alt=""
                            onerror={handleTokenIconError}
                        />
                        <span style="display:none;">{targetTicker[0]}</span>
                    {:else}
                        {isUsdSilo ? '$' : targetTicker[0]}
                    {/if}
                </div>
            {/if}

            <div class="flex flex-col min-w-0">
                <span
                    class="text-[11px] font-mono font-bold tracking-wide truncate group-hover:underline"
                    style="color:{isLp ? 'var(--text-primary)' : hex};"
                >
                    {isLp ? plantPairLabel : isUsdSilo ? 'USD' : targetTicker} ▾
                </span>
                {#if latestReceipt}
                    <span class="text-[7px] font-mono text-neutral-400 truncate">
                        Last: {formatSettledAssetAmount(latestReceipt.settledAtomic, latestReceipt.targetAsset, 4)} {latestReceipt.targetAsset} • {formatSettlementTierLabel(latestReceipt.settlementTier)}
                    </span>
                {:else if !isUsdSilo && sectorExplorerUrl && sectorExplorerUrl !== '#'}
                    <a
                        href={sectorExplorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onmousedown={(e) => e.stopPropagation()}
                        onclick={(e) => e.stopPropagation()}
                        data-testid="sector-explorer-link-{sector.id}"
                        class="mt-0.5 text-[7px] font-mono font-bold uppercase tracking-wider text-neutral-500 hover:text-[#18C6A5] transition-colors w-fit"
                    >
                        Explorer ↗
                    </a>
                {:else if isUsdSilo}
                    <span class="text-[8px] font-mono text-neutral-500 truncate">
                        {savedBankRailLast4
                            ? `*${savedBankRailLast4} (${savedBankRailMethod})`
                            : 'Link Bank Rail'}
                    </span>
                {/if}
            </div>
        </div>

        <div class="flex flex-col items-end shrink-0 font-mono">
            <span class="text-[9px] font-bold uppercase whitespace-nowrap" style="color:{hex};">
                {isLp || targetTicker !== 'KAS'
                    ? operations.formatEpochCountdown()
                    : sector.settlementConfig?.mode === 'threshold'
                      ? `${sector.settlementConfig?.threshold || DEFAULT_RESERVE_PAYOUT_KAS} KAS`
                      : sector.settlementConfig?.mode || 'epoch'}
            </span>
            <span class="text-[9px] text-[var(--text-muted)] tabular-nums whitespace-nowrap">
                ~{_num(dailyKas).toFixed(1)} KAS/d{#if !livePricingUnavailable}
                    {' '}<span class="text-[var(--accent-text)]">({i18n.formatFiat(_num(dailyUsd))}/d)</span>
                {/if}
            </span>
        </div>
    </div>

    <!-- ALLOCATION SLIDER ROW -->
    <div
        class="flex items-center gap-1.5 pt-1 border-t border-white/[0.05] min-w-0 w-full font-mono font-bold"
        draggable="true"
        ondragstart={(e) => {
            e.preventDefault();
            e.stopPropagation();
        }}
        onmousedown={(e) => e.stopPropagation()}
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="group"
    >
        <div class="flex items-center bg-[var(--bg-input)] border border-white/[0.08] rounded px-1.5 py-0 h-[19px] shrink-0">
            <input
                type="number"
                value={allocationPctDisplay}
                oninput={(e) => onInputPct(sector.id, e.currentTarget.value)}
                onchange={() => onCommitUpdate(sector.id)}
                class="sector-slim-num w-8 bg-transparent text-white text-[10px] outline-none text-right tabular-nums"
            />
            <span class="text-neutral-500 text-[9px] ml-0.5">%</span>
        </div>

        {#if unallocatedPercentage > 0}
            <button
                type="button"
                onclick={() => onSnapMaxRemaining(sector.id)}
                class="px-1.5 py-0.5 rounded bg-[#18C6A5]/10 border border-[#18C6A5]/30 text-[7px] font-black uppercase text-[#18C6A5] cursor-pointer shrink-0"
            >
                MAX
            </button>
        {/if}

        <input
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={allocationPctNumeric}
            oninput={(e) => onSliderInput(sector.id, e)}
            onchange={() => onSliderChange(sector.id)}
            class="sector-slim-range flex-1 min-w-[48px] touch-pan-y cursor-pointer"
            style="--shex:{hex};background:linear-gradient(to right,{hex} 0%,{hex} {Math.min(100, Math.max(0, allocationPctNumeric))}%,rgba(255,255,255,0.08) {Math.min(100, Math.max(0, allocationPctNumeric))}%,rgba(255,255,255,0.08) 100%);"
        />

        <div class="flex items-center gap-0.5 bg-[var(--bg-input)] border border-white/[0.08] rounded px-1.5 py-0 h-[19px] shrink-0">
            <input
                type="number"
                value={_num(mappedHash).toFixed(2)}
                oninput={(e) => onInputHash(sector.id, e.currentTarget.value)}
                onchange={() => onCommitUpdate(sector.id)}
                class="sector-slim-num w-9 bg-transparent text-neutral-200 text-[10px] outline-none text-right focus:text-white tabular-nums"
            />
            <span class="text-neutral-500 text-[8px] whitespace-nowrap">TH/s</span>
        </div>
    </div>

    <!-- INLINE EXPANDED SETTINGS DRAWER -->
    {#if isEditing}
        <div
            data-testid="sector-inline-editor-{sector.id}"
            transition:slide={{ duration: 140 }}
            onmousedown={(e) => e.stopPropagation()}
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') cancelInlineEditor();
            }}
            role="region"
            aria-label="Inline Split Configuration"
            class="mt-1.5 pt-2.5 border-t border-white/10 flex flex-col gap-2.5 font-mono"
        >
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div class="flex flex-col gap-1">
                    <label
                        for="inline-name-{sector.id}"
                        class="text-[8px] font-bold uppercase tracking-widest text-neutral-400"
                    >
                        Name
                    </label>
                    <input
                        id="inline-name-{sector.id}"
                        type="text"
                        bind:value={draftName}
                        spellcheck="false"
                        class="w-full bg-[var(--bg-canvas)] border border-white/12 focus:border-[#18C6A5] rounded-lg px-2.5 py-2 text-[11px] font-bold text-white uppercase tracking-wider outline-none"
                    />
                </div>

                <div class="flex flex-col gap-1">
                    <label
                        for="inline-dest-{sector.id}"
                        class="text-[8px] font-bold uppercase tracking-widest text-neutral-400"
                    >
                        Destination Address
                    </label>
                    <input
                        id="inline-dest-{sector.id}"
                        type="text"
                        bind:value={draftPayoutAddr}
                        spellcheck="false"
                        class="w-full bg-[var(--bg-canvas)] border border-white/12 focus:border-amber-500/60 rounded-lg px-2.5 py-2 text-[10px] text-amber-400 outline-none"
                    />
                </div>
            </div>

            {#if !isDraftPlant}
                <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <button
                        type="button"
                        onclick={() =>
                            (pickerMode =
                                pickerMode === 'replace_primary' ? 'closed' : 'replace_primary')}
                        class="flex-1 bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] border border-white/12 hover:border-[#18C6A5]/50 rounded-lg px-3 py-2 flex items-center justify-between gap-2 cursor-pointer"
                    >
                        <div class="flex items-center gap-2 min-w-0">
                            <span
                                class="w-5 h-5 rounded-full bg-[var(--bg-canvas)] border border-white/15 flex items-center justify-center text-[9px] font-black shrink-0"
                                style="color:{draftPrimaryAsset.theme?.hex || '#18C6A5'};"
                            >
                                {draftPrimaryAsset.ticker === 'USD' ? '$' : draftPrimaryAsset.ticker[0]}
                            </span>
                            <span class="text-[11px] font-black text-white uppercase truncate">
                                {draftPrimaryAsset.ticker} — {draftPrimaryAsset.name}
                            </span>
                        </div>
                        <span class="px-1.5 py-0.5 rounded bg-[var(--bg-canvas)] border border-white/10 text-[8px] font-bold uppercase text-neutral-400 shrink-0">
                            {draftPrimaryAsset.assetClass} ▾
                        </span>
                    </button>
                </div>
            {:else}
                <div class="flex items-center justify-between text-[10px] text-neutral-400">
                    <span>{draftAssets.map((a) => a.ticker).join(' / ')}</span>
                </div>
            {/if}

            {#if pickerMode !== 'closed'}
                <div class="bg-[var(--bg-canvas)] border border-[#18C6A5]/45 rounded-xl p-2.5 flex flex-col gap-2">
                    <div class="flex flex-wrap items-center gap-1.5">
                        <div class="relative flex-1 min-w-[170px] flex items-center">
                            <input
                                type="text"
                                data-testid="sector-inline-asset-search-{sector.id}"
                                value={pickerQuery}
                                onmousedown={(e) => e.stopPropagation()}
                                ontouchstart={(e) => e.stopPropagation()}
                                oninput={(e) =>
                                    handleInlinePickerInput((e.currentTarget as HTMLInputElement).value)}
                                onkeydown={(e) => {
                                    e.stopPropagation();
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (filteredAssets.length > 0) selectDraftAsset(filteredAssets[0]);
                                        else selectCustomInlineTicker();
                                    }
                                }}
                                placeholder="SEARCH BTC, USDC, NVDA, NACHO, SILO..."
                                class="w-full bg-[var(--bg-elevated)] border border-white/10 focus:border-[#18C6A5] rounded-lg pl-2.5 pr-7 py-1.5 text-[10px] text-white outline-none"
                            />
                            {#if pickerQuery}
                                <button
                                    type="button"
                                    onclick={() => {
                                        pickerQuery = '';
                                        discoveredInlineAssets = [];
                                        isPickerSearching = false;
                                    }}
                                    class="absolute right-2 text-neutral-400 hover:text-white text-xs cursor-pointer"
                                >
                                    &times;
                                </button>
                            {/if}
                        </div>
                        {#each [
                            { id: 'ALL', label: 'All' },
                            { id: 'CRYPTO', label: 'Crypto' },
                            { id: 'EQUITIES', label: 'Stocks' },
                            { id: 'COMMODITIES', label: 'Gold' },
                            { id: 'MINEABLE', label: 'KRC-20' }
                        ] as cat (cat.id)}
                            <button
                                type="button"
                                onclick={() => (pickerCategory = cat.id as typeof pickerCategory)}
                                class="px-2 py-1 rounded-md text-[8px] font-black uppercase cursor-pointer {pickerCategory === cat.id ? 'bg-[var(--bg-hover)] text-[#18C6A5] border border-[#18C6A5]/45' : 'bg-[var(--bg-elevated)] text-neutral-400 hover:text-white border border-white/5'}"
                            >
                                {cat.label}
                            </button>
                        {/each}
                    </div>
                    {#if isPickerSearching}
                        <span class="text-[8px] font-bold uppercase tracking-wider text-[#18C6A5] px-1 animate-pulse">
                            Searching Live Price Feeds...
                        </span>
                    {/if}
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-[176px] overflow-y-auto pr-0.5">
                        {#if filteredAssets.length === 0 && !isPickerSearching}
                            <div class="col-span-full py-3 text-center flex flex-col items-center gap-2">
                                <span class="text-[9px] font-bold uppercase tracking-wider text-neutral-500">
                                    No indexed feed for "{pickerQuery.trim()}"
                                </span>
                                {#if /^[A-Za-z0-9]{2,10}$/.test(pickerQuery.trim())}
                                    <button
                                        type="button"
                                        onclick={selectCustomInlineTicker}
                                        class="tactile-btn px-3 py-1 rounded-lg border-[#18C6A5]/45 text-[#18C6A5] text-[9px] font-black uppercase cursor-pointer"
                                    >
                                        + Add {pickerQuery.trim().toUpperCase()}
                                    </button>
                                {/if}
                            </div>
                        {/if}
                        {#each filteredAssets as asset (asset.ticker)}
                            <button
                                type="button"
                                onclick={() => {
                                    pickerQuery = '';
                                    discoveredInlineAssets = [];
                                    selectDraftAsset(asset);
                                }}
                                class="bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] border border-white/8 hover:border-[#18C6A5]/50 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-1.5 text-left cursor-pointer"
                            >
                                <div class="flex flex-col min-w-0">
                                    <span class="text-[10px] font-black text-white uppercase truncate">
                                        {asset.ticker}
                                    </span>
                                    <span class="text-[8px] text-neutral-400 truncate">
                                        {asset.name}
                                    </span>
                                </div>
                                {#if !livePricingUnavailable && asset.spotPrice > 0}
                                    <span class="text-[9px] font-bold text-[var(--accent-text)] tabular-nums shrink-0">
                                        {i18n.formatSpotPrice(asset.spotPrice)}
                                    </span>
                                {/if}
                            </button>
                        {/each}
                    </div>
                </div>
            {/if}

            <!-- PAYOUT SCHEDULE + SELF-CUSTODY VAULT LOCK + SAVE BAR -->
            <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div class="flex flex-wrap items-center gap-2">
                    {#if !isDraftPlant && draftPrimaryAsset.ticker.toUpperCase() === 'KAS'}
                        <div class="flex items-center gap-1 bg-[var(--bg-canvas)] border border-white/10 rounded-lg p-0.5">
                            <button
                                type="button"
                                onclick={() => (draftMode = 'epoch')}
                                class="px-2 py-1 rounded text-[8px] font-black uppercase cursor-pointer {draftMode === 'epoch' ? 'bg-[var(--bg-hover)] text-[#18C6A5]' : 'text-neutral-400'}"
                            >
                                22:00 UTC
                            </button>
                            <button
                                type="button"
                                onclick={() => (draftMode = 'threshold')}
                                class="px-2 py-1 rounded text-[8px] font-black uppercase cursor-pointer {draftMode === 'threshold' ? 'bg-[var(--bg-hover)] text-amber-400' : 'text-neutral-400'}"
                            >
                                {draftThreshold} KAS Min
                            </button>
                        </div>
                    {/if}
                </div>

                <div class="flex items-center gap-2 ml-auto">
                    <button
                        type="button"
                        onclick={cancelInlineEditor}
                        class="px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-white/10 text-[9px] font-bold uppercase tracking-wider text-neutral-400 hover:text-white cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        data-testid="sector-inline-save-{sector.id}"
                        onclick={saveInlineChanges}
                        disabled={isSaving}
                        class="tactile-btn px-4 py-1.5 rounded-lg border-[#18C6A5]/55 text-[#18C6A5] hover:text-white text-[9px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                        style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.16), transparent 70%);"
                    >
                        {isSaving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    {/if}
    {/if}
</div>

<style>
    .sector-card-compact,
    .sector-card-compact * {
        line-height: 1.15 !important;
    }
    .sector-slim-num::-webkit-outer-spin-button,
    .sector-slim-num::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }
    .sector-slim-num {
        -moz-appearance: textfield;
        appearance: textfield;
    }
    input[type='range'].sector-slim-range {
        -webkit-appearance: none;
        appearance: none;
        height: 3px !important;
        min-height: 3px !important;
        border-radius: 999px;
        outline: none;
        padding: 0;
        margin: 0 2px;
    }
    input[type='range'].sector-slim-range::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 11px !important;
        height: 11px !important;
        border-radius: 999px;
        background: var(--bg-card);
        border: 2px solid var(--shex, #18c6a5);
        cursor: pointer;
    }
    input[type='range'].sector-slim-range::-moz-range-thumb {
        width: 11px;
        height: 11px;
        border-radius: 999px;
        background: var(--bg-card);
        border: 2px solid var(--shex, #18c6a5);
        cursor: pointer;
    }
</style>
