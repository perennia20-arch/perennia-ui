<script lang="ts">
    import { ui } from '$lib/stores/ui.svelte';
import { pwa } from '$lib/stores/pwa.svelte';
    import {
        getChainExplorerAddressUrl,
        getChainExplorerTxUrl
    } from '$lib/stores/transaction.svelte';
    import type { Sector } from '$lib/stores/type';
    import {
        DEFAULT_RESERVE_PAYOUT_KAS,
        hydrateSectorTargetAssets,
        type ViewSector,
        type MineableKrc20VaultInfo
    } from './operationsHelpers';

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
        resolveChainAddressForTicker,
        estimateSectorDailyKas,
        estimateSectorDailyUsd,
        onDragStart,
        onDragEnd,
        onDragOver,
        onDragLeave,
        onDrop,
        onRenameSector,
        onToggleWidth,
        onOpenSettlement,
        onDeleteSector,
        onInputPct,
        onInputHash,
        onSliderInput,
        onSliderChange,
        onCommitUpdate,
        onSnapMaxRemaining
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
        resolveChainAddressForTicker: (ticker: string) => string;
        estimateSectorDailyKas: (s: ViewSector) => number;
        estimateSectorDailyUsd: (s: ViewSector) => number;
        onDragStart: (e: DragEvent, s: Sector) => void;
        onDragEnd: () => void;
        onDragOver: (e: DragEvent, id: string) => void;
        onDragLeave: () => void;
        onDrop: (e: DragEvent, id: string) => void;
        onRenameSector: (id: string) => void;
        onToggleWidth: (id: string) => void;
        onOpenSettlement: (s: Sector) => void;
        onDeleteSector: (id: string) => void;
        onInputPct: (id: string, valStr: string) => void;
        onInputHash: (id: string, hashStr: string) => void;
        onSliderInput: (id: string, e: Event) => void;
        onSliderChange: (id: string) => void;
        onCommitUpdate: (id: string) => void;
        onSnapMaxRemaining: (id: string) => void;
    } = $props();

    function handleTokenIconError(e: Event) {
        const target = e.currentTarget as HTMLImageElement;
        target.style.display = 'none';
        if (target.nextElementSibling) {
            (target.nextElementSibling as HTMLElement).style.display = 'inline';
        }
    }

    function findLatestSettledEventForAsset(ticker: string) {
        const clean = ticker.trim().toUpperCase();
        return (ui.taxEvents || []).find(
            (ev: any) =>
                (ev.asset?.ticker || '').toUpperCase() === clean &&
                ev.txHash &&
                !String(ev.txHash).startsWith('PER-L1-')
        );
    }

    let isLp = $derived(sector.routeMode === 'auto-lp');
    let targetTicker = $derived(sector.settlementConfig?.targetAsset?.ticker || 'KAS');
    let isUsdSilo = $derived(!isLp && targetTicker === 'USD');
    let mineableInfo = $derived(!isLp ? mineableVaultMap.get(targetTicker.toUpperCase()) || null : null);
    let hex = $derived(sector.settlementConfig?.targetAsset?.theme?.hex || '#18C6A5');
    let mappedHash = $derived(displayHashrate * (sector.allocationPercentage / 100));
    let dailyKas = $derived(estimateSectorDailyKas(sector));
    let dailyUsd = $derived(estimateSectorDailyUsd(sector));
    let isDragged = $derived(dragSectorId === sector.id);
    let isDropTarget = $derived(dropTargetSectorId === sector.id);
    let spanClass = $derived((sector.width || 6) === 12 ? 'lg:col-span-12' : 'lg:col-span-6');
    let activeBadge = $derived(ui.microBadges[`sector_${sector.id}`]);
    let resolvedPayoutAddr = $derived(
        sector.settlementConfig?.payoutAddress ||
            resolveChainAddressForTicker(targetTicker)
    );
    let latestSettledEvent = $derived(findLatestSettledEventForAsset(targetTicker));
    let sectorExplorerUrl = $derived(
        latestSettledEvent?.explorerUrl ||
            (latestSettledEvent?.txHash
                ? getChainExplorerTxUrl(targetTicker, latestSettledEvent.txHash)
                : getChainExplorerAddressUrl(targetTicker, resolvedPayoutAddr))
    );
    let plantTargets = $derived(isLp ? hydrateSectorTargetAssets(sector) : []);
    let plantPairLabel = $derived(
        isLp && plantTargets.length >= 2
            ? plantTargets.map((t) => t.ticker).join(' / ')
            : `KAS / ${targetTicker}`
    );
    let plantInternalPairs = $derived(
        isLp && plantTargets.length >= 2
            ? (plantTargets.length * (plantTargets.length - 1)) / 2
            : 1
    );
    let sectorPendingKas = $derived(Math.max(0, Number(sector.pendingKaspa || 0)));
</script>

<div draggable={!pwa.isMobile} data-testid="sector-card-{sector.name}"
    ondragstart={(e) => onDragStart(e, sector)}
    ondragend={onDragEnd}
    ondragover={(e) => onDragOver(e, sector.id)}
    ondragleave={onDragLeave}
    ondrop={(e) => onDrop(e, sector.id)}
    class="tactile-card {shimmerTargetId === `sector_${sector.id}` ? 'shimmer-flash' : ''} bg-[#0a0d12] rounded-[20px] p-4 sm:p-5 flex flex-col gap-3.5 relative cursor-grab active:cursor-grabbing min-w-0 overflow-hidden {spanClass} {isDragged ? 'opacity-50 scale-95' : ''} {isDropTarget ? 'scale-[1.02] brightness-125' : ''}"
    style="
        border: 1px solid {hex}35;
        background-image: radial-gradient(ellipse at top right, {hex}16, transparent 60%);
        box-shadow: 0 10px 32px -10px {hex}25, inset 0 0 18px -10px {hex}18;
    "
>
    {#if activeBadge}
        <div
            class="micro-confirm-badge absolute top-3 left-1/2 -translate-x-1/2 z-40 px-3 py-1 rounded-lg bg-[#11161f] border text-[10px] font-mono font-black uppercase tracking-widest shadow-lg"
            style="border-color: {activeBadge.accentHex}60; color: {activeBadge.accentHex};"
        >
            {activeBadge.label}
        </div>
    {/if}
    <div class="flex justify-between items-start gap-2 min-w-0">
        <div class="flex flex-col min-w-0 flex-1">
            <span class="text-[8px] uppercase tracking-widest font-bold text-neutral-500 mb-0.5 truncate">
                {isLp
                    ? plantTargets.length > 2
                        ? `Multi-Asset Liquidity Plant (50% KAS • ${plantInternalPairs} Pairs)`
                        : 'Liquidity Plant (50% KAS Auto-LP)'
                    : mineableInfo
                      ? `Proof-of-Hashrate Syndicate Sector (${mineableInfo.dailyEmissionTokens.toLocaleString()} ${targetTicker}/d)`
                      : isUsdSilo
                        ? 'Mining-to-Bank USD Silo ($25 Min ACH)'
                        : 'Settlement Silo'}
            </span>
            <button
                type="button"
                onmousedown={(e) => e.stopPropagation()}
                onclick={() => onRenameSector(sector.id)}
                class="text-base sm:text-lg font-black uppercase text-white tracking-wider truncate text-left hover:text-[#18C6A5] transition-colors cursor-pointer"
                title="Click to Rename Sector"
            >
                {sector.name}
            </button>
        </div>
        <div class="flex flex-col items-end shrink-0">
            <div class="flex items-center gap-1.5 mb-1">
                {#if !isUsdSilo && sectorExplorerUrl && sectorExplorerUrl !== '#'}
                    <a
                        href={sectorExplorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onmousedown={(e) => e.stopPropagation()}
                        onclick={(e) => e.stopPropagation()}
                        data-testid="sector-explorer-link-{sector.id}"
                        class="px-2 py-0.5 rounded-lg bg-[#11161f] hover:bg-[#161d29] border border-white/10 hover:border-[#18C6A5]/40 text-[8px] font-mono font-bold uppercase text-neutral-300 hover:text-[#18C6A5] transition-colors"
                        title="Verify L1 Payout Address or Latest Transaction on Block Explorer"
                    >
                        Explorer ↗
                    </a>
                {/if}
                <button
                    type="button"
                    onmousedown={(e) => e.stopPropagation()}
                    onclick={() => onToggleWidth(sector.id)}
                    class="text-neutral-400 hover:text-white transition-colors cursor-pointer w-6 h-6 hidden lg:flex items-center justify-center bg-[#11161f] hover:bg-[#161d29] border border-white/10 hover:border-white/25 rounded-lg active:scale-[0.96]"
                    title="Toggle Full / Half Width"
                >
                    <span class="font-bold tracking-widest text-[8px]">[ ]</span>
                </button>
                <button
                    type="button"
                    onmousedown={(e) => e.stopPropagation()}
                    onclick={() => onOpenSettlement(sector)}
                    class="text-neutral-400 hover:text-white transition-colors cursor-pointer w-9 h-9 lg:w-6 lg:h-6 flex items-center justify-center bg-[#11161f] hover:bg-[#161d29] border border-white/10 hover:border-white/25 rounded-full active:scale-[0.96]"
                    title="Configure Parameters"
                >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c-.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </button>
                <button
                    type="button"
                    onmousedown={(e) => e.stopPropagation()}
                    onclick={() => onDeleteSector(sector.id)}
                    class="text-neutral-400 hover:text-red-400 transition-colors cursor-pointer w-9 h-9 lg:w-6 lg:h-6 flex items-center justify-center bg-[#11161f] hover:bg-red-950/30 border border-white/10 hover:border-red-500/40 rounded-full active:scale-[0.96]"
                    title="Dismantle Sector"
                >
                    ✕
                </button>
            </div>
            <span class="text-[11px] font-mono text-white font-bold whitespace-nowrap tabular-nums">
                {sectorPendingKas.toFixed(6)} <span class="text-[#18C6A5]">KAS</span>
            </span>
            <span class="text-[7px] font-mono uppercase tracking-widest text-neutral-500">
                Pending
            </span>
        </div>
    </div>

    <div class="flex flex-col gap-2 bg-[#11161f] p-3 rounded-xl border border-white/10 shadow-inner min-w-0">
        <div class="flex items-center justify-between gap-2 min-w-0">
            <div class="flex items-center gap-2.5 min-w-0">
                {#if isLp}
                    <div class="flex -space-x-2 shrink-0">
                        {#each plantTargets as pt (pt.ticker)}
                            <div
                                class="w-6 h-6 rounded-full border border-white/15 bg-[#0a0d12] flex items-center justify-center text-[9px] font-black"
                                style="color: {pt.theme?.hex || '#18C6A5'};"
                            >
                                {pt.ticker[0]}
                            </div>
                        {/each}
                    </div>
                    <div class="flex flex-col min-w-0">
                        <span class="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#18C6A5] to-[#3B82F6] tracking-wider truncate">
                            {plantPairLabel}
                        </span>
                        <span class="text-[8px] font-mono text-neutral-400 truncate">
                            {plantTargets.map((t) => `${t.weightPct.toFixed(1)}% ${t.ticker}`).join(' + ')}
                        </span>
                    </div>
                {:else}
                    <div
                        class="w-6 h-6 rounded-full border border-white/15 bg-[#0a0d12] flex items-center justify-center text-[10px] font-black overflow-hidden shrink-0"
                        style="color: {hex};"
                    >
                        {#if sector.settlementConfig?.targetAsset?.imgUrl}
                            <img
                                src={sector.settlementConfig.targetAsset.imgUrl}
                                class="w-4 h-4 object-contain"
                                alt="logo"
                                onerror={handleTokenIconError}
                            />
                            <span style="display:none;" class="text-xs font-black">
                                {sector.settlementConfig.targetAsset.ticker[0]}
                            </span>
                        {:else}
                            {isUsdSilo ? '$' : sector.settlementConfig?.targetAsset?.ticker?.[0] || 'K'}
                        {/if}
                    </div>
                    <div class="flex flex-col min-w-0">
                        <span class="text-xs font-bold tracking-wider truncate" style="color: {hex};">
                            {isUsdSilo
                                ? 'USD (Direct Bank ACH / Wire)'
                                : mineableInfo
                                  ? `${targetTicker} (Mineable KRC-20)`
                                  : `${sector.settlementConfig?.targetAsset?.ticker || 'KAS'}`}
                        </span>
                        {#if isUsdSilo}
                            <span class="text-[8px] font-mono {savedBankRailLast4 ? 'text-[#18C6A5]' : 'text-amber-400'} truncate">
                                {savedBankRailLast4
                                    ? `Vault Rail: *${savedBankRailLast4} (${savedBankRailMethod})`
                                    : 'Link Bank Rail in DEX → Fiat'}
                            </span>
                        {:else if mineableInfo}
                            <span class="text-[8px] font-mono text-[#18C6A5] truncate">
                                Vault Pool: {mineableInfo.dailyEmissionTokens.toLocaleString()} {targetTicker}/d
                            </span>
                        {:else}
                            <span class="text-[8px] font-mono text-neutral-400 truncate max-w-[180px]">
                                L1: {resolvedPayoutAddr}
                            </span>
                        {/if}
                    </div>
                {/if}
            </div>
            <div class="flex flex-col items-end shrink-0">
                <span class="text-[7px] uppercase tracking-widest font-bold text-neutral-500">Mode</span>
                <span class="text-[9px] font-mono font-bold uppercase whitespace-nowrap" style="color: {hex};">
                    {sector.routeMode === 'auto-lp' ||
                    (sector.settlementConfig?.targetAsset?.ticker &&
                        sector.settlementConfig.targetAsset.ticker !== 'KAS')
                        ? operations.formatEpochCountdown()
                        : sector.settlementConfig?.mode === 'threshold'
                          ? `${sector.settlementConfig?.threshold || DEFAULT_RESERVE_PAYOUT_KAS} KAS LIMIT`
                          : sector.settlementConfig?.mode || 'epoch'}
                </span>
            </div>
        </div>
        <div class="flex items-center justify-between gap-2 border-t border-white/10 pt-2 mt-0.5 min-w-0">
            <span class="text-[8px] font-mono uppercase tracking-wider text-neutral-400 shrink-0">
                Per Day
            </span>
            <span class="text-[10px] font-mono font-bold text-white tabular-nums truncate text-right">
                ~{dailyKas.toFixed(1)} KAS/d
                <span class="text-[#18C6A5] ml-0.5">(${dailyUsd.toFixed(2)})</span>
            </span>
        </div>
    </div>

    <div
        class="mt-0.5 flex flex-col gap-2 min-w-0 w-full"
        draggable="true"
        ondragstart={(e) => {
            e.preventDefault();
            e.stopPropagation();
        }}
        onmousedown={(e) => e.stopPropagation()}
    >
        <div class="flex items-center justify-between gap-1.5 w-full min-w-0 font-mono font-bold">
            <div class="flex items-center gap-1.5 min-w-0">
                <div class="flex items-center gap-0.5 bg-[#11161f] border border-white/10 rounded-lg px-2 py-1 shrink-0">
                    <input
                        type="number"
                        value={sector.allocationPercentage}
                        oninput={(e) => onInputPct(sector.id, e.currentTarget.value)}
                        onchange={() => onCommitUpdate(sector.id)}
                        class="w-10 bg-transparent text-white text-[11px] outline-none text-right tabular-nums"
                    />
                    <span class="text-neutral-400 text-[10px]">%</span>
                </div>
                <button
                    type="button"
                    onclick={() => onSnapMaxRemaining(sector.id)}
                    disabled={unallocatedPercentage <= 0}
                    class="tactile-btn px-2 py-1 rounded-lg text-[8px] font-mono font-black uppercase tracking-wider text-[#18C6A5] disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer shrink-0 whitespace-nowrap"
                    title="Snap sector allocation to consume all remaining unallocated hashpower (100% total)"
                >
                    MAX
                </button>
            </div>
            <div class="flex items-center gap-1 bg-[#11161f] border border-white/10 rounded-lg px-2 py-1 shrink-0">
                <input
                    type="number"
                    value={mappedHash.toFixed(2)}
                    oninput={(e) => onInputHash(sector.id, e.currentTarget.value)}
                    onchange={() => onCommitUpdate(sector.id)}
                    class="w-11 bg-transparent text-neutral-200 text-[11px] outline-none text-right focus:text-white tabular-nums"
                />
                <span class="text-neutral-500 text-[9px] whitespace-nowrap">TH/s</span>
            </div>
        </div>
        <input
            type="range"
            min="0"
            max="100"
            step="0.1"
            value={sector.allocationPercentage}
            oninput={(e) => onSliderInput(sector.id, e)}
            onchange={() => onSliderChange(sector.id)}
            class="w-full custom-range-slider touch-pan-y cursor-pointer"
        />
    </div>
</div>