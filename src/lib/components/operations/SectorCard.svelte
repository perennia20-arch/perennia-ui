<script lang="ts">
	const _num = (v: unknown): number => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : 0; };
	import { operations } from '$lib/stores/operations.svelte';
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
    class="tactile-card {shimmerTargetId === `sector_${sector.id}` ? 'shimmer-flash' : ''} bg-[#0c1017] rounded-xl p-3 flex flex-col gap-2.5 relative cursor-grab active:cursor-grabbing min-w-0 overflow-hidden {spanClass} {isDragged ? 'opacity-50 scale-95' : ''} {isDropTarget ? 'scale-[1.02] brightness-125' : ''}"
    style="border: 1px solid rgba(255,255,255,0.07); box-shadow: none;"
>
    {#if activeBadge}
        <div
            class="micro-confirm-badge absolute top-3 left-1/2 -translate-x-1/2 z-40 px-3 py-1 rounded-lg bg-[#11161f] border text-[10px] font-mono font-black uppercase tracking-widest shadow-lg"
            style="border-color: {activeBadge.accentHex}60; color: {activeBadge.accentHex};"
        >
            {activeBadge.label}
        </div>
    {/if}
    ﻿<div class="flex justify-between items-center gap-2 min-w-0">
  <button type="button" onmousedown={(e) => e.stopPropagation()}
    onclick={() => onRenameSector(sector.id)} title="Click to Rename"
    class="flex items-center gap-1.5 min-w-0 text-xs sm:text-sm font-bold uppercase text-white tracking-wider truncate text-left hover:text-[#18C6A5] transition-colors cursor-pointer">
    <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:{hex};"></span>
    <span class="truncate">{sector.name}</span>
  </button>
  <div class="flex items-center gap-1.5 shrink-0">
    <span class="text-[10px] font-mono text-neutral-300 font-bold whitespace-nowrap tabular-nums">
      {_num(sectorPendingKas).toFixed(4)} <span class="text-[#18C6A5]">KAS</span>
    </span>
    <button type="button" onmousedown={(e) => e.stopPropagation()}
      onclick={() => onToggleWidth(sector.id)} title="Toggle Width"
      class="text-neutral-500 hover:text-white cursor-pointer w-5 h-5 hidden lg:flex items-center justify-center bg-white/[0.03] border border-white/10 rounded text-[7px] font-bold">[ ]</button>
    <button type="button" onmousedown={(e) => e.stopPropagation()}
      onclick={() => onOpenSettlement(sector)} title="Configure"
      class="text-neutral-400 hover:text-white cursor-pointer w-6 h-6 flex items-center justify-center bg-white/[0.03] border border-white/10 rounded-md text-[11px]">⚙</button>
    <button type="button" onmousedown={(e) => e.stopPropagation()}
      onclick={() => onDeleteSector(sector.id)} title="Remove"
      class="text-neutral-500 hover:text-red-400 cursor-pointer w-6 h-6 flex items-center justify-center bg-white/[0.03] border border-white/10 rounded-md text-[10px]">✕</button>
  </div>
</div>

﻿<div class="flex items-start justify-between gap-2 pt-1.5 border-t border-white/[0.06] min-w-0">
  <div class="flex items-start gap-2 min-w-0">
    {#if isLp}
      <div class="flex -space-x-1.5 shrink-0 mt-0.5">
        {#each plantTargets as pt (pt.ticker)}
          <div class="w-4 h-4 rounded-full border border-white/15 bg-[#080b10] flex items-center justify-center text-[7px] font-black"
            style="color:{pt.theme?.hex || '#18C6A5'};">{pt.ticker[0]}</div>
        {/each}
      </div>
    {:else}
      <div class="w-4 h-4 mt-0.5 rounded-full border border-white/15 bg-[#080b10] flex items-center justify-center text-[8px] font-black overflow-hidden shrink-0"
        style="color:{hex};">
        {#if sector.settlementConfig?.targetAsset?.imgUrl}
          <img src={sector.settlementConfig.targetAsset.imgUrl} class="w-3 h-3 object-contain" alt="" onerror={handleTokenIconError} />
          <span style="display:none;">{targetTicker[0]}</span>
        {:else}{isUsdSilo ? '$' : targetTicker[0]}{/if}
      </div>
    {/if}
    <div class="flex flex-col min-w-0">
      <span class="text-[11px] font-mono font-bold tracking-wide truncate"
        style="color:{isLp ? '#e5e7eb' : hex};">{isLp ? plantPairLabel : isUsdSilo ? 'USD' : targetTicker}</span>
      {#if !isUsdSilo && sectorExplorerUrl && sectorExplorerUrl !== '#'}
        <a href={sectorExplorerUrl} target="_blank" rel="noopener noreferrer"
          onmousedown={(e) => e.stopPropagation()} onclick={(e) => e.stopPropagation()}
          data-testid="sector-explorer-link-{sector.id}"
          class="mt-0.5 px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/[0.08] text-[7px] font-mono font-bold uppercase tracking-wider text-neutral-400 hover:text-[#18C6A5] hover:border-[#18C6A5]/40 transition-colors w-fit">Explorer ↗</a>
      {:else if isUsdSilo}
        <span class="text-[8px] font-mono text-neutral-500 truncate">{savedBankRailLast4 ? `*${savedBankRailLast4} (${savedBankRailMethod})` : 'Link Bank Rail'}</span>
      {/if}
    </div>
  </div>
  <div class="flex flex-col items-end shrink-0 font-mono">
    <span class="text-[9px] font-bold uppercase whitespace-nowrap" style="color:{hex};">
      {isLp || targetTicker !== 'KAS' ? operations.formatEpochCountdown() : sector.settlementConfig?.mode === 'threshold' ? `${sector.settlementConfig?.threshold || DEFAULT_RESERVE_PAYOUT_KAS} KAS` : sector.settlementConfig?.mode || 'epoch'}
    </span>
    <span class="text-[9px] text-neutral-400 tabular-nums whitespace-nowrap mt-0.5">
      ~{_num(dailyKas).toFixed(1)} KAS/d <span class="text-[#18C6A5]">(${_num(dailyUsd).toFixed(2)})</span>
    </span>
  </div>
</div>

﻿<div class="flex items-center gap-1.5 pt-1.5 border-t border-white/[0.06] min-w-0 w-full font-mono font-bold"
  draggable="true" ondragstart={(e) => { e.preventDefault(); e.stopPropagation(); }}
  onmousedown={(e) => e.stopPropagation()}>
  <div class="flex items-center bg-[#080b10] border border-white/[0.08] rounded-md px-1.5 py-0.5 shrink-0">
    <input type="number" value={sector.allocationPercentage}
      oninput={(e) => onInputPct(sector.id, e.currentTarget.value)}
      onchange={() => onCommitUpdate(sector.id)}
      class="sector-slim-num w-8 bg-transparent text-white text-[10px] outline-none text-right tabular-nums" />
    <span class="text-neutral-500 text-[9px] ml-0.5">%</span>
  </div>
  {#if unallocatedPercentage > 0}
    <button type="button" onclick={() => onSnapMaxRemaining(sector.id)}
      class="px-1.5 py-0.5 rounded bg-[#18C6A5]/10 border border-[#18C6A5]/30 text-[7px] font-black uppercase text-[#18C6A5] cursor-pointer shrink-0">MAX</button>
  {/if}
  <input type="range" min="0" max="100" step="0.1" value={sector.allocationPercentage}
    oninput={(e) => onSliderInput(sector.id, e)}
    onchange={() => onSliderChange(sector.id)}
    class="sector-slim-range flex-1 min-w-[48px] touch-pan-y cursor-pointer"
    style="--shex:{hex};background:linear-gradient(to right,{hex} 0%,{hex} {Math.min(100,Math.max(0,_num(sector.allocationPercentage)))}%,rgba(255,255,255,0.08) {Math.min(100,Math.max(0,_num(sector.allocationPercentage)))}%,rgba(255,255,255,0.08) 100%);" />
  <div class="flex items-center gap-0.5 bg-[#080b10] border border-white/[0.08] rounded-md px-1.5 py-0.5 shrink-0">
    <input type="number" value={_num(mappedHash).toFixed(2)}
      oninput={(e) => onInputHash(sector.id, e.currentTarget.value)}
      onchange={() => onCommitUpdate(sector.id)}
      class="sector-slim-num w-9 bg-transparent text-neutral-200 text-[10px] outline-none text-right focus:text-white tabular-nums" />
    <span class="text-neutral-500 text-[8px] whitespace-nowrap">TH/s</span>
  </div>
</div>
</div>

<style>
.sector-slim-num::-webkit-outer-spin-button,.sector-slim-num::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.sector-slim-num{-moz-appearance:textfield;appearance:textfield}
input[type='range'].sector-slim-range{-webkit-appearance:none;appearance:none;height:3px!important;min-height:3px!important;border-radius:999px;outline:none;padding:0;margin:0 2px}
input[type='range'].sector-slim-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:11px!important;height:11px!important;border-radius:999px;background:#0c1017;border:2px solid var(--shex,#18C6A5);cursor:pointer}
input[type='range'].sector-slim-range::-moz-range-thumb{width:11px;height:11px;border-radius:999px;background:#0c1017;border:2px solid var(--shex,#18C6A5);cursor:pointer}
</style>
