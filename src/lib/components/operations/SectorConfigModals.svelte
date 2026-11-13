<script lang="ts">
	import { ui } from '$lib/stores/ui.svelte';
    import { fade } from 'svelte/transition';
    import { treasury, type UnifiedAsset } from '$lib/stores/treasury.svelte';
    import type {
        Sector,
        SettlementConfig,
        PlantAssetTarget
    } from '$lib/stores/type';
    import type { MineableKrc20VaultInfo } from './operationsHelpers';

    let {
        isSectorModalOpen = $bindable(false),
        draftSectorName = $bindable(''),
        draftSectorPct = $bindable(0),
        draftSectorMax = $bindable(0),
        draftSelectedAssets = $bindable([]),
        draftIsSyndicateSector = $bindable(false),
        draftSettlementConfig = $bindable(),
        settlementModalSilo = $bindable(null),
        editSectorName = $bindable(''),
        editSettlementParams = $bindable(),
        editSelectedAssets = $bindable([]),
        isSigningSettlement = $bindable(false),
        displayHashrate = 0,
        mineableVaultMap = new Map(),
        savedBankRailLast4 = null,
        savedBankRailMethod = 'ACH',
        isPullingOutKey = null,
        onUpdateDraftPct,
        onUpdateDraftHash,
        onCreateSector,
        onSaveSettlementParams,
        onEqualizeSecondaryWeights,
        onAdjustSecondaryPlantWeight,
        onRemoveAssetFromSector,
        onAddOrToggleAssetInSector,
        onClaimPendingSectorKas
    }: {
        isSectorModalOpen: boolean;
        draftSectorName: string;
        draftSectorPct: number;
        draftSectorMax: number;
        draftSelectedAssets: PlantAssetTarget[];
        draftIsSyndicateSector: boolean;
        draftSettlementConfig: SettlementConfig;
        settlementModalSilo: Sector | null;
        editSectorName: string;
        editSettlementParams: SettlementConfig;
        editSelectedAssets: PlantAssetTarget[];
        isSigningSettlement: boolean;
        displayHashrate: number;
        mineableVaultMap: Map<string, MineableKrc20VaultInfo>;
        savedBankRailLast4: string | null;
        savedBankRailMethod: string;
        isPullingOutKey: string | null;
        onUpdateDraftPct: (valStr: string) => void;
        onUpdateDraftHash: (valStr: string) => void;
        onCreateSector: () => Promise<void>;
        onSaveSettlementParams: () => Promise<void>;
        onEqualizeSecondaryWeights: (mode: 'create' | 'edit') => void;
        onAdjustSecondaryPlantWeight: (
            mode: 'create' | 'edit',
            ticker: string,
            pct: number
        ) => void;
        onRemoveAssetFromSector: (mode: 'create' | 'edit', ticker: string) => void;
        onAddOrToggleAssetInSector: (
            mode: 'create' | 'edit',
            asset: UnifiedAsset,
            actionMode: 'replace_primary' | 'add_secondary'
        ) => void;
        onClaimPendingSectorKas: (params: {
            sectorId?: string;
            targetAsset?: string;
        }) => Promise<void>;
    } = $props();

    let assetPickerTarget = $state<'create' | 'edit'>('create');
    let assetPickerActionMode = $state<'replace_primary' | 'add_secondary'>(
        'replace_primary'
    );
    let isAssetPickerOpen = $state(false);
    let assetSearchQuery = $state('');
    let assetCategoryFilter = $state<
        'ALL' | 'CRYPTO' | 'EQUITIES' | 'COMMODITIES' | 'MINEABLE'
    >('ALL');

    let isDraftMultiAssetPlant = $derived(draftSelectedAssets.length >= 2);
    let isEditMultiAssetPlant = $derived(editSelectedAssets.length >= 2);
    let draftMineableVaultInfo = $derived(
        !isDraftMultiAssetPlant
            ? mineableVaultMap.get(
                  (draftSettlementConfig?.targetAsset?.ticker || '').toUpperCase()
              ) || null
            : null
    );
    let draftInternalPairsCount = $derived(
        draftSelectedAssets.length >= 2
            ? (draftSelectedAssets.length * (draftSelectedAssets.length - 1)) / 2
            : 0
    );
    let editInternalPairsCount = $derived(
        editSelectedAssets.length >= 2
            ? (editSelectedAssets.length * (editSelectedAssets.length - 1)) / 2
            : 0
    );

    let filteredAssets = $derived(
        treasury.registry.filter((a) => {
            const q = assetSearchQuery.trim().toLowerCase();
            const matchesSearch =
                !q ||
                a.ticker.toLowerCase().includes(q) ||
                a.name.toLowerCase().includes(q) ||
                a.assetClass.toLowerCase().includes(q);
            if (!matchesSearch) return false;
            if (assetCategoryFilter === 'MINEABLE') {
                return mineableVaultMap.has(a.ticker.toUpperCase());
            }
            if (assetCategoryFilter === 'EQUITIES') {
                return a.assetClass === 'Public Equity';
            }
            if (assetCategoryFilter === 'COMMODITIES') {
                return (
                    a.assetClass === 'Commodity' ||
                    a.assetClass === 'Sovereign Debt'
                );
            }
            if (assetCategoryFilter === 'CRYPTO') {
                return (
                    a.assetClass === 'Native L1' ||
                    a.assetClass === 'Stablecoin' ||
                    a.assetClass === 'Ecosystem' ||
                    a.assetClass === 'DeFi' ||
                    a.assetClass === 'Tokenized Asset'
                );
            }
            return true;
        })
    );

    function handleTokenIconError(e: Event) {
        const target = e.currentTarget as HTMLImageElement;
        target.style.display = 'none';
        if (target.nextElementSibling) {
            (target.nextElementSibling as HTMLElement).style.display = 'inline';
        }
    }
</script>

{#if isSectorModalOpen}
    <div
        class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#050505]/95"
        transition:fade={{ duration: 150 }}
    >
        <div class="absolute inset-0 w-full h-full cursor-default border-none"></div>
        <div class="relative z-10 w-full max-w-[540px] bg-[#0a0d12] border border-white/15 rounded-t-[28px] sm:rounded-[28px] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col">
            <div class="p-6 border-b border-white/10 bg-[#11161f] flex justify-between items-center shrink-0">
                <div class="flex flex-col">
                    <h2 class="text-white font-black uppercase tracking-widest text-lg leading-none">
                        New Payout Split
                    </h2>
                    <span
                        data-testid="sector-architecture-badge"
                        class="text-[10px] font-bold uppercase tracking-widest mt-1 {isDraftMultiAssetPlant ? 'text-blue-400' : draftMineableVaultInfo ? 'text-amber-400' : 'text-[#18C6A5]'}"
                    >
                        {isDraftMultiAssetPlant
                            ? `Multi-Asset Liquidity Plant (50.0% KAS Anchor • ${draftInternalPairsCount} Cross-Pairs)`
                            : draftMineableVaultInfo
                              ? `Proof-of-Hashrate Mineable KRC-20 Syndicate (${draftSettlementConfig.targetAsset.ticker})`
                              : `1-Asset Settlement Silo (${draftSettlementConfig.targetAsset.ticker})`}
                    </span>
                </div>
                <button
                    type="button"
                    onclick={() => (isSectorModalOpen = false)}
                    class="w-8 h-8 rounded-full bg-[#161d29] hover:bg-white/10 border border-white/10 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
                >
                    ✕
                </button>
            </div>
            <div class="p-6 flex flex-col gap-5 max-h-[66vh] overflow-y-auto hide-scrollbar">
                <div class="flex flex-col gap-1.5">
                    <label
                        for="draftSectorNameInput"
                        class="text-[10px] text-neutral-400 uppercase tracking-widest font-bold ml-1"
                    >
                        Name
                    </label>
                    <input
                        id="draftSectorNameInput"
                        type="text"
                        bind:value={draftSectorName}
                        placeholder="Sector Name"
                        spellcheck="false"
                        class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-4 py-3 text-xs font-bold text-white uppercase tracking-wider outline-none transition-colors"
                    />
                </div>
                <div class="flex flex-col gap-3">
                    <div class="flex justify-between items-end">
                        <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                            Hashrate %
                        </span>
                        <div class="flex items-center gap-2">
                            <div class="flex items-center gap-1 bg-[#11161f] border border-white/10 rounded-lg px-2.5 py-1 shadow-inner">
                                <input
                                    type="number"
                                    value={draftSectorPct}
                                    oninput={(e) => onUpdateDraftPct(e.currentTarget.value)}
                                    class="w-16 bg-transparent text-white text-lg font-black font-mono outline-none text-right"
                                />
                                <span class="text-neutral-400 font-bold">%</span>
                            </div>
                            <div class="flex items-center gap-1 bg-[#11161f] border border-white/10 rounded-lg px-2.5 py-1 shadow-inner">
                                <input
                                    type="number"
                                    value={(displayHashrate * (draftSectorPct / 100)).toFixed(2)}
                                    oninput={(e) => onUpdateDraftHash(e.currentTarget.value)}
                                    class="w-14 bg-transparent text-neutral-300 text-sm font-mono font-bold outline-none text-right focus:text-white"
                                />
                                <span class="text-neutral-500 font-bold text-xs">TH/s</span>
                            </div>
                        </div>
                    </div>
                    <input
                        type="range"
                        min="0.1"
                        max={draftSectorMax}
                        step="0.1"
                        bind:value={draftSectorPct}
                        class="w-full custom-range-slider cursor-pointer"
                    />
                    <div class="grid grid-cols-4 gap-2 mt-1">
                        {#each [25, 50, 75, 100] as pct}
                            <button
                                type="button"
                                onclick={() =>
                                    (draftSectorPct = parseFloat(
                                        Math.min(draftSectorMax, (draftSectorMax * pct) / 100).toFixed(1)
                                    ))}
                                class="tactile-btn py-2 rounded-lg text-[10px] font-mono font-bold text-neutral-300 hover:text-white cursor-pointer"
                            >
                                {pct === 100 ? 'MAX' : `${pct}%`}
                            </button>
                        {/each}
                    </div>
                </div>
                <div class="h-px bg-white/10 w-full"></div>
                <div class="flex flex-col gap-3">
                    <div class="flex items-center justify-between">
                        <div class="flex flex-col">
                            <span class="text-[10px] font-black text-white uppercase tracking-widest">
                                Get Paid In
                            </span>
                            <span class="text-[9px] text-neutral-400">
                                
                            </span>
                        </div>
                        {#if isDraftMultiAssetPlant && draftSelectedAssets.length > 2}
                            <button
                                type="button"
                                onclick={() => onEqualizeSecondaryWeights('create')}
                                class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-mono font-bold uppercase text-blue-400 border-blue-500/35 cursor-pointer"
                            >
                                50/50
                            </button>
                        {/if}
                    </div>
                    {#if !isDraftMultiAssetPlant}
                        <div class="bg-[#11161f] border border-[#18C6A5]/35 rounded-2xl p-4 flex flex-col gap-3">
                            <div class="flex items-center justify-between">
                                <span class="text-[9px] font-mono font-black uppercase tracking-widest text-[#18C6A5]">
                                    {draftMineableVaultInfo
                                        ? `⛏️ Proof-of-Hashrate Mineable KRC-20 Vault (${draftMineableVaultInfo.dailyEmissionTokens.toLocaleString()} ${draftSettlementConfig.targetAsset.ticker}/d)`
                                        : '✓ 1 Target Asset Selected → Settlement Silo'}
                                </span>
                                <span class="px-2 py-0.5 rounded bg-[#0a0d12] border border-white/10 text-[8px] font-mono text-neutral-300">
                                    100.0% {draftSettlementConfig.targetAsset.ticker}
                                </span>
                            </div>
                            <button
                                type="button"
                                data-testid="open-target-asset-picker-btn"
                                onclick={() => {
                                    assetPickerTarget = 'create';
                                    assetPickerActionMode = 'replace_primary';
                                    isAssetPickerOpen = true;
                                    assetSearchQuery = '';
                                    assetCategoryFilter = 'ALL';
                                }}
                                class="w-full bg-[#0a0d12] hover:bg-[#161d29] border border-white/10 hover:border-white/25 rounded-xl px-4 py-3 flex items-center justify-between transition-colors cursor-pointer"
                            >
                                <div class="flex items-center gap-3">
                                    <div
                                        class="w-7 h-7 rounded-full bg-[#11161f] border border-white/10 flex items-center justify-center text-xs font-black overflow-hidden"
                                        style="color: {draftSettlementConfig.targetAsset.theme?.hex || '#18C6A5'};"
                                    >
                                        {draftSettlementConfig.targetAsset.ticker === 'USD'
                                            ? '$'
                                            : draftSettlementConfig.targetAsset.ticker[0]}
                                    </div>
                                    <div class="flex flex-col items-start">
                                        <span class="text-xs font-bold text-white leading-none mb-0.5">
                                            {draftSettlementConfig.targetAsset.ticker} — {draftSettlementConfig.targetAsset.name}
                                        </span>
                                        <span class="text-[9px] font-mono text-neutral-400">
                                            {draftMineableVaultInfo
                                                ? `Vault Remaining: ${draftMineableVaultInfo.remainingVaultTokens.toLocaleString()} ${draftMineableVaultInfo.tokenTicker} • ${draftMineableVaultInfo.activeMinersCount} Miners`
                                                : draftSettlementConfig.targetAsset.spotPrice > 0
                                                  ? `Live Oracle: $${draftSettlementConfig.targetAsset.spotPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
                                                  : 'Change Primary Target Asset ▾'}
                                        </span>
                                    </div>
                                </div>
                                <span class="text-[8px] uppercase tracking-widest font-bold px-2 py-1 rounded bg-[#11161f] text-[#18C6A5] border border-[#18C6A5]/30">
                                    {draftMineableVaultInfo ? 'MINEABLE KRC-20' : draftSettlementConfig.targetAsset.assetClass}
                                </span>
                            </button>
                            {#if draftMineableVaultInfo}
                                <div
                                    data-testid="mineable-syndicate-banner"
                                    class="bg-[#0a0d12] border border-amber-500/40 rounded-xl p-3 flex items-center justify-between gap-2 text-[9px] font-mono"
                                >
                                    <div class="flex flex-col">
                                        <span class="text-amber-400 font-black uppercase">
                                            Syndicate Hashpower Pledge Active
                                        </span>
                                        <span class="text-neutral-400">
                                            Pro-rata daily {draftMineableVaultInfo.tokenTicker} distribution at the next payout based on verified ASIC share difficulty.
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        data-testid="syndicate-sector-toggle"
                                        onclick={() => (draftIsSyndicateSector = !draftIsSyndicateSector)}
                                        class="px-2.5 py-1 rounded bg-[#11161f] border {draftIsSyndicateSector ? 'border-[#18C6A5]/50 text-[#18C6A5]' : 'border-white/10 text-neutral-400'} font-black uppercase shrink-0 cursor-pointer"
                                    >
                                        {draftIsSyndicateSector ? '✓ SYNDICATE PLEDGED' : 'SOLO SILO'}
                                    </button>
                                </div>
                            {/if}
                            <button
                                type="button"
                                data-testid="add-plant-asset-btn"
                                onclick={() => {
                                    assetPickerTarget = 'create';
                                    assetPickerActionMode = 'add_secondary';
                                    isAssetPickerOpen = true;
                                    assetSearchQuery = '';
                                    assetCategoryFilter = 'ALL';
                                }}
                                class="tactile-btn w-full py-2.5 rounded-xl border-blue-500/40 text-blue-400 text-[10px] font-black uppercase tracking-widest cursor-pointer"
                            >
                                + Pair Token (50% KAS Pool)
                            </button>
                        </div>
                    {:else}
                        <div
                            data-testid="multi-asset-plant-panel"
                            class="bg-[#11161f] border border-blue-500/45 rounded-2xl p-4 flex flex-col gap-3"
                        >
                            <div class="flex items-center justify-between border-b border-white/10 pb-2">
                                <span class="text-[9px] font-mono font-black uppercase tracking-widest text-blue-400">
                                    ⚡ {draftSelectedAssets.length}-Asset Liquidity Plant ({draftInternalPairsCount} Internal Pairs)
                                </span>
                                <span class="px-2 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/40 text-[8px] font-mono font-bold text-[#18C6A5]">
                                    50% KAS
                                </span>
                            </div>
                            <div
                                data-testid="plant-kas-anchor-row"
                                class="bg-[#0a0d12] border border-[#18C6A5]/40 rounded-xl p-3 flex items-center justify-between"
                            >
                                <div class="flex items-center gap-2.5">
                                    <span class="w-6 h-6 rounded-full bg-[#11161f] border border-[#18C6A5]/50 flex items-center justify-center text-[10px] font-black text-[#18C6A5]">
                                        K
                                    </span>
                                    <div class="flex flex-col">
                                        <span class="text-xs font-bold text-white">
                                            KAS (50%)
                                        </span>
                                        <span class="text-[8px] font-mono text-neutral-400">
                                            
                                        </span>
                                    </div>
                                </div>
                                <span
                                    data-testid="plant-weight-readout-KAS"
                                    class="text-xs font-mono font-black text-[#18C6A5] tabular-nums"
                                >
                                    50.0%
                                </span>
                            </div>
                            {#each draftSelectedAssets.filter((a) => a.ticker !== 'KAS') as secAsset (secAsset.ticker)}
                                <div
                                    data-testid="plant-secondary-row-{secAsset.ticker}"
                                    class="bg-[#0a0d12] border border-white/10 rounded-xl p-3 flex flex-col gap-2"
                                >
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-2">
                                            <span
                                                class="w-6 h-6 rounded-full bg-[#11161f] border border-white/15 flex items-center justify-center text-[10px] font-black"
                                                style="color: {secAsset.theme?.hex || '#3B82F6'};"
                                            >
                                                {secAsset.ticker[0]}
                                            </span>
                                            <div class="flex flex-col">
                                                <span class="text-xs font-bold text-white">
                                                    {secAsset.ticker} ({secAsset.name})
                                                </span>
                                                <span class="text-[8px] font-mono text-neutral-400">
                                                    {secAsset.assetClass}
                                                </span>
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <span
                                                data-testid="plant-weight-readout-{secAsset.ticker}"
                                                class="text-xs font-mono font-black text-blue-400 tabular-nums"
                                            >
                                                {secAsset.weightPct.toFixed(2)}%
                                            </span>
                                            <button
                                                type="button"
                                                aria-label="Remove {secAsset.ticker}"
                                                onclick={() => onRemoveAssetFromSector('create', secAsset.ticker)}
                                                class="w-5 h-5 rounded bg-[#11161f] hover:bg-red-950/40 text-neutral-400 hover:text-red-400 text-[10px] flex items-center justify-center cursor-pointer"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                    {#if draftSelectedAssets.length > 2}
                                        <input
                                            type="range"
                                            min="1"
                                            max="49"
                                            step="0.5"
                                            data-testid="plant-weight-slider-{secAsset.ticker}"
                                            value={secAsset.weightPct}
                                            oninput={(e) =>
                                                onAdjustSecondaryPlantWeight(
                                                    'create',
                                                    secAsset.ticker,
                                                    parseFloat((e.currentTarget as HTMLInputElement).value) || 25
                                                )}
                                            class="w-full custom-range-slider cursor-pointer"
                                        />
                                    {/if}
                                </div>
                            {/each}
                            {#if draftSelectedAssets.length < 5}
                                <button
                                    type="button"
                                    data-testid="add-plant-asset-btn"
                                    onclick={() => {
                                        assetPickerTarget = 'create';
                                        assetPickerActionMode = 'add_secondary';
                                        isAssetPickerOpen = true;
                                        assetSearchQuery = '';
                                        assetCategoryFilter = 'ALL';
                                    }}
                                    class="tactile-btn w-full py-2.5 rounded-xl border-blue-500/40 text-blue-400 text-[10px] font-black uppercase tracking-widest cursor-pointer"
                                >
                                    + Add Token
                                </button>
                            {/if}
                        </div>
                    {/if}
                </div>
                {#if !isDraftMultiAssetPlant && draftSettlementConfig.targetAsset.ticker === 'USD'}
                    <div class="bg-[#11161f] border {savedBankRailLast4 ? 'border-[#18C6A5]/40' : 'border-amber-500/40'} rounded-xl p-3.5 flex flex-col gap-2 text-[10px] font-mono">
                        <div class="flex items-center justify-between">
                            <span class="font-black uppercase tracking-wider {savedBankRailLast4 ? 'text-[#18C6A5]' : 'text-amber-400'}">
                                {savedBankRailLast4
                                    ? `✓ Bank Rail Linked: *${savedBankRailLast4} (${savedBankRailMethod})`
                                    : '⚠ Bank Rail Vault Unlinked'}
                            </span>
                            <span class="px-2 py-0.5 rounded bg-[#0a0d12] border border-white/10 text-[8px] text-neutral-300">
                                $25.00 Min Batch
                            </span>
                        </div>
                        <p class="text-[9px] text-neutral-400 leading-relaxed">
                            Paid on next countdown ($25 min).
                        </p>
                    </div>
                {/if}
                <div class="flex flex-col gap-1.5">
                    <div class="flex items-center justify-between">
                        <label
                            for="draftDestWallet"
                            class="text-[10px] text-neutral-400 uppercase tracking-widest font-bold ml-1"
                        >
                            {isDraftMultiAssetPlant
                                ? 'Sovereign LP Vault Address'
                                : draftSettlementConfig.targetAsset.ticker === 'USD'
                                  ? 'Destination Bank Rail Vault'
                                  : `Destination ${draftSettlementConfig.targetAsset.ticker} L1 Address`}
                        </label>
                    </div>
                    
<input
                        id="draftDestWallet"
                        type="text"
                        bind:value={draftSettlementConfig.payoutAddress}
                        placeholder={draftSettlementConfig.targetAsset.ticker === 'USD' ? 'Sovereign Bank Rail Vault' : 'kaspa:...'}
                        spellcheck="false"
                        class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-4 py-3 text-xs font-mono text-[#18C6A5] outline-none transition-colors"
                    />
                </div>
                <div class="flex items-center justify-between bg-[#11161f] border border-white/10 rounded-xl p-4">
                    <div class="flex flex-col">
                        <span class="text-xs uppercase tracking-widest text-neutral-200 font-bold">
                            Schedule
                        </span>
                        <span class="text-[10px] text-neutral-400 leading-tight mt-0.5">
                            {isDraftMultiAssetPlant
                                ? 'Synchronized to the next payout for multi-asset LP rebalancing.'
                                : 'Route yields directly to your on-chain L1 wallet.'}
                        </span>
                    </div>
                    <button
                        type="button"
                        aria-label="Toggle Auto Payout"
                        onclick={() =>
                            (draftSettlementConfig.autoPayout = !draftSettlementConfig.autoPayout)}
                        class="w-10 h-5 rounded-full border transition-colors duration-300 relative {draftSettlementConfig.autoPayout ? 'bg-amber-500/20 border-amber-500/50' : 'bg-[#0a0d12] border-white/15'} cursor-pointer focus:outline-none"
                    >
                        <div
                            class="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full transition-all duration-300 shadow-sm {draftSettlementConfig.autoPayout ? 'bg-amber-500 left-[22px]' : 'bg-neutral-500 left-1'}"
                        ></div>
                    </button>
                </div>
                {#if !isDraftMultiAssetPlant}
                    <div
                        class="flex bg-[#0a0d12] rounded-xl p-1 border border-white/10 {draftSettlementConfig.autoPayout ? '' : 'opacity-50 pointer-events-none'} transition-opacity shadow-inner"
                    >
                        <button
                            type="button"
                            onclick={() => (draftSettlementConfig.mode = 'threshold')}
                            class="flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all {draftSettlementConfig.mode === 'threshold' ? 'bg-[#161d29] text-amber-400 shadow-md border border-white/10' : 'text-neutral-400 hover:text-white cursor-pointer border border-transparent'}"
                        >
                            Limit
                        </button>
                        <button
                            type="button"
                            onclick={() => (draftSettlementConfig.mode = 'epoch')}
                            class="flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all {draftSettlementConfig.mode === 'epoch' ? 'bg-[#161d29] text-[#18C6A5] shadow-md border border-white/10' : 'text-neutral-400 hover:text-white cursor-pointer border border-transparent'}"
                        >
                            Epoch
                        </button>
                        <button
                            type="button"
                            onclick={() => (draftSettlementConfig.mode = 'appointment')}
                            class="flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all {draftSettlementConfig.mode === 'appointment' ? 'bg-[#161d29] text-blue-400 shadow-md border border-white/10' : 'text-neutral-400 hover:text-white cursor-pointer border border-transparent'}"
                        >
                            Appt.
                        </button>
                    </div>
                {/if}
            </div>
            <div class="flex gap-3 px-6 pb-6 pt-4 bg-[#11161f] border-t border-white/10 shrink-0">
                <button
                    type="button"
                    onclick={() => (isSectorModalOpen = false)}
                    class="tactile-btn flex-1 py-3.5 text-neutral-300 hover:text-white font-bold uppercase tracking-widest text-xs rounded-xl cursor-pointer"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    data-testid="initialize-sector-btn"
                    onclick={onCreateSector}
                    disabled={draftSectorPct <= 0}
                    class="tactile-btn flex-[2] py-3.5 border-[#18C6A5]/40 text-[#18C6A5] hover:text-white font-black uppercase tracking-widest text-xs rounded-xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.16), transparent 70%);"
                >
                    Save Split
                </button>
            </div>
        </div>
    </div>
{/if}

{#if settlementModalSilo && editSettlementParams}
    {@const modalPendingKas = Math.max(0, Number(settlementModalSilo.pendingKaspa || 0))}
    <div class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div class="absolute inset-0 w-full h-full bg-[#050505]/98 cursor-default border-none"></div>
        <div
            class="relative z-10 w-full max-w-[500px] bg-[#0a0d12] border border-white/15 rounded-t-[28px] sm:rounded-[28px] shadow-2xl flex flex-col overflow-hidden transition-colors duration-500 border-t-4 {isEditMultiAssetPlant ? 'border-t-blue-500' : 'border-t-emerald-500'}"
        >
            <div class="px-6 pt-6 pb-4 border-b border-white/10 bg-[#11161f] shrink-0">
                <h3 class="text-white font-bold tracking-wide text-base mb-1 text-center truncate">
                    {settlementModalSilo.name}
                </h3>
                <span class="text-[10px] text-neutral-400 uppercase tracking-widest text-center block font-bold">
                    {isEditMultiAssetPlant
                        ? `Multi-Asset Liquidity Plant (50% KAS • ${editInternalPairsCount} Cross-Pairs)`
                        : 'Settlement Silo Protocol'}
                </span>
            </div>
            <div class="p-6 flex flex-col gap-5 max-h-[60vh] overflow-y-auto hide-scrollbar">
                <div class="flex flex-col gap-1.5">
                    <label
                        for="editSectorNameInput"
                        class="text-[10px] text-neutral-400 uppercase tracking-widest font-bold ml-1"
                    >
                        Name
                    </label>
                    <input
                        id="editSectorNameInput"
                        type="text"
                        bind:value={editSectorName}
                        placeholder="Sector Name"
                        spellcheck="false"
                        class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-4 py-3 text-xs font-bold text-white uppercase tracking-wider outline-none transition-colors"
                    />
                </div>
                {#if !isEditMultiAssetPlant}
                    <div class="flex flex-col gap-2">
                        <span class="text-[10px] text-neutral-400 uppercase tracking-widest font-bold ml-1 block">
                            Get Paid In
                        </span>
                        <button
                            type="button"
                            aria-label="Target Asset Route"
                            onclick={() => {
                                assetPickerTarget = 'edit';
                                assetPickerActionMode = 'replace_primary';
                                isAssetPickerOpen = true;
                                assetSearchQuery = '';
                            }}
                            class="w-full bg-[#11161f] hover:bg-[#161d29] border border-white/10 hover:border-white/20 rounded-xl px-4 py-3 flex items-center justify-between transition-colors cursor-pointer"
                        >
                            <div class="flex items-center gap-3">
                                <div
                                    class="w-7 h-7 rounded-full bg-[#0a0d12] border border-white/10 flex items-center justify-center text-xs font-black"
                                    style="color: {editSettlementParams.targetAsset.theme?.hex || '#ffffff'};"
                                >
                                    {editSettlementParams.targetAsset.ticker[0]}
                                </div>
                                <div class="flex flex-col items-start">
                                    <span class="text-xs font-bold text-white leading-none mb-0.5">
                                        {editSettlementParams.targetAsset.ticker}
                                    </span>
                                    <span class="text-[10px] font-mono text-neutral-400">
                                        {editSettlementParams.targetAsset.name}
                                    </span>
                                </div>
                            </div>
                            <span class="text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-lg bg-[#0a0d12] text-neutral-400 border border-white/10">
                                {editSettlementParams.targetAsset.assetClass}
                            </span>
                        </button>
                        <button
                            type="button"
                            onclick={() => {
                                assetPickerTarget = 'edit';
                                assetPickerActionMode = 'add_secondary';
                                isAssetPickerOpen = true;
                                assetSearchQuery = '';
                            }}
                            class="tactile-btn w-full py-2.5 rounded-xl border-blue-500/40 text-blue-400 text-[10px] font-black uppercase tracking-widest cursor-pointer"
                        >
                            + Pair Token (50% KAS Pool)
                        </button>
                    </div>
                {:else}
                    <div class="bg-[#11161f] border border-blue-500/40 rounded-2xl p-4 flex flex-col gap-2.5">
                        <div class="flex items-center justify-between">
                            <span class="text-[9px] font-mono font-black uppercase text-blue-400">
                                Multi-Asset Plant Weights (KAS 50.0% Anchor)
                            </span>
                            {#if editSelectedAssets.length > 2}
                                <button
                                    type="button"
                                    onclick={() => onEqualizeSecondaryWeights('edit')}
                                    class="text-[8px] font-mono text-[#18C6A5] hover:underline cursor-pointer"
                                >
                                    50/50
                                </button>
                            {/if}
                        </div>
                        {#each editSelectedAssets as item (item.ticker)}
                            <div class="bg-[#0a0d12] border border-white/10 rounded-xl p-2.5 flex flex-col gap-1.5">
                                <div class="flex items-center justify-between text-xs">
                                    <span class="font-bold text-white">{item.ticker}</span>
                                    <div class="flex items-center gap-2">
                                        <span class="font-mono font-black {item.ticker === 'KAS' ? 'text-[#18C6A5]' : 'text-blue-400'}">
                                            {item.weightPct.toFixed(2)}%
                                        </span>
                                        {#if item.ticker !== 'KAS'}
                                            <button
                                                type="button"
                                                onclick={() => onRemoveAssetFromSector('edit', item.ticker)}
                                                class="text-neutral-400 hover:text-red-400 text-[10px] cursor-pointer"
                                            >
                                                ✕
                                            </button>
                                        {/if}
                                    </div>
                                </div>
                                {#if item.ticker !== 'KAS' && editSelectedAssets.length > 2}
                                    <input
                                        type="range"
                                        min="1"
                                        max="49"
                                        step="0.5"
                                        value={item.weightPct}
                                        oninput={(e) =>
                                            onAdjustSecondaryPlantWeight(
                                                'edit',
                                                item.ticker,
                                                parseFloat((e.currentTarget as HTMLInputElement).value) || 25
                                            )}
                                        class="w-full custom-range-slider cursor-pointer"
                                    />
                                {/if}
                            </div>
                        {/each}
                        {#if editSelectedAssets.length < 5}
                            <button
                                type="button"
                                onclick={() => {
                                    assetPickerTarget = 'edit';
                                    assetPickerActionMode = 'add_secondary';
                                    isAssetPickerOpen = true;
                                    assetSearchQuery = '';
                                }}
                                class="tactile-btn w-full py-2 rounded-xl border-blue-500/40 text-blue-400 text-[9px] font-black uppercase tracking-widest cursor-pointer"
                            >
                                + Add Token
                            </button>
                        {/if}
                    </div>
                {/if}
                <div class="flex flex-col gap-1.5">
                    <label
                        for="destWallet"
                        class="text-[10px] text-neutral-400 uppercase tracking-widest font-bold ml-1"
                    >
                        Destination Address
                    </label>
                    <input
                        id="destWallet"
                        type="text"
                        bind:value={editSettlementParams.payoutAddress}
                        spellcheck="false"
                        class="w-full bg-[#11161f] border border-white/10 focus:border-amber-500/50 rounded-xl px-4 py-3 text-xs font-mono text-amber-400 outline-none transition-colors"
                    />
                </div>
                {#if modalPendingKas > 0}
                    <div class="bg-[#11161f] border border-white/10 rounded-xl p-3 flex items-center justify-between gap-3">
                        <div class="flex flex-col">
                            <span class="text-[9px] font-mono uppercase tracking-wider text-neutral-400">
                                Pending
                            </span>
                            <span class="text-xs font-mono font-bold text-white tabular-nums">
                                {modalPendingKas.toFixed(6)} KAS
                            </span>
                        </div>
                        <button
                            type="button"
                            onclick={() => {
                                if (settlementModalSilo) {
                                    onClaimPendingSectorKas({ sectorId: settlementModalSilo.id });
                                    settlementModalSilo = null;
                                }
                            }}
                            disabled={isPullingOutKey === settlementModalSilo.id}
                            class="tactile-btn px-3 py-1.5 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider text-neutral-300 hover:text-white cursor-pointer disabled:opacity-40"
                        >
                            Move to KAS
                        </button>
                    </div>
                {/if}
            </div>
            <div class="flex gap-3 px-6 pb-6 pt-4 bg-[#11161f] border-t border-white/10 shrink-0">
                <button
                    type="button"
                    aria-label="Cancel"
                    onclick={() => {
                        settlementModalSilo = null;
                        isAssetPickerOpen = false;
                        isSigningSettlement = false;
                    }}
                    class="tactile-btn flex-1 py-3 text-neutral-300 hover:text-white font-bold uppercase tracking-widest text-xs rounded-xl cursor-pointer"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    aria-label="Save"
                    onclick={onSaveSettlementParams}
                    disabled={isSigningSettlement}
                    class="tactile-btn flex-[2] py-3 border-[#18C6A5]/40 text-[#18C6A5] hover:text-white font-black uppercase tracking-widest text-xs rounded-xl cursor-pointer disabled:opacity-40"
                    style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.16), transparent 70%);"
                >
                    Save
                </button>
            </div>
        </div>
    </div>
{/if}

{#if isAssetPickerOpen}
    <div
        class="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#050505]/95"
        transition:fade={{ duration: 150 }}
    >
        <div class="absolute inset-0 w-full h-full cursor-default border-none bg-transparent"></div>
        <div class="relative z-10 w-full max-w-[490px] bg-[#0a0d12] border border-white/15 rounded-[28px] shadow-2xl flex flex-col overflow-hidden h-[590px]">
            <div class="p-4 border-b border-white/10 flex items-center justify-between bg-[#11161f]">
                <button
                    type="button"
                    aria-label="Back"
                    onclick={() => {
                        isAssetPickerOpen = false;
                        assetSearchQuery = '';
                    }}
                    class="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-neutral-400 transition-colors cursor-pointer"
                >
                    ✕
                </button>
                <div class="flex flex-col items-center">
                    <h3 class="font-bold tracking-wide text-sm text-center uppercase text-white">
                        {assetPickerActionMode === 'add_secondary'
                            ? 'Add Asset to 50% KAS Liquidity Plant'
                            : 'Select Target Asset'}
                    </h3>
                    <span class="text-[8px] font-mono text-[#18C6A5] uppercase">
                        
                    </span>
                </div>
                <div class="w-8"></div>
            </div>
            <div class="p-3 border-b border-white/10 bg-[#0a0d12] flex flex-col gap-2">
                <div class="relative">
                    <input
                        aria-label="Asset Search"
                        data-testid="operations-asset-search-input"
                        type="text"
                        bind:value={assetSearchQuery}
                        placeholder="Search NVDA, SPY, SILO, BEDRCK, NACHO, XAU..."
                        class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-4 py-2.5 text-xs font-mono text-white outline-none transition-colors"
                    />
                </div>
                <div class="grid grid-cols-5 gap-1">
                    {#each [
                        { id: 'ALL', label: 'All' },
                        { id: 'CRYPTO', label: 'Crypto' },
                        { id: 'EQUITIES', label: 'Equities' },
                        { id: 'COMMODITIES', label: 'Gold/Debt' },
                        { id: 'MINEABLE', label: 'Mineable' }
                    ] as cat (cat.id)}
                        <button
                            type="button"
                            data-testid="asset-cat-{cat.id}"
                            onclick={() => (assetCategoryFilter = cat.id as any)}
                            class="py-1.5 rounded-lg text-[8px] font-mono font-bold uppercase cursor-pointer transition-colors {assetCategoryFilter === cat.id ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/40' : 'bg-[#11161f] text-neutral-400 hover:text-white'}"
                        >
                            {cat.label}
                        </button>
                    {/each}
                </div>
            </div>
            <div class="flex-1 overflow-y-auto p-2 bg-[#0a0d12] hide-scrollbar">
                <div class="flex flex-col gap-1">
                    {#each filteredAssets as asset (asset.ticker)}
                        {@const vaultInfo = mineableVaultMap.get(asset.ticker.toUpperCase())}
                        <button
                            type="button"
                            data-testid="select-target-asset-{asset.ticker}"
                            onclick={() => {
                                onAddOrToggleAssetInSector(
                                    assetPickerTarget,
                                    asset,
                                    assetPickerActionMode
                                );
                                isAssetPickerOpen = false;
                                assetSearchQuery = '';
                            }}
                            class="w-full flex items-center justify-between p-3 rounded-xl hover:bg-[#11161f] transition-colors cursor-pointer group border border-transparent hover:border-white/10"
                        >
                            <div class="flex items-center gap-3 pointer-events-none">
                                <div
                                    class="w-8 h-8 rounded-full bg-[#11161f] border border-white/10 flex items-center justify-center text-xs font-black overflow-hidden"
                                    style="color: {asset.theme?.hex || '#ffffff'};"
                                >
                                    {#if asset.imgUrl}
                                        <img
                                            src={asset.imgUrl}
                                            class="w-4 h-4 object-contain"
                                            alt="logo"
                                            onerror={handleTokenIconError}
                                        />
                                        <span style="display:none;" class="text-xs font-black">
                                            {asset.ticker[0]}
                                        </span>
                                    {:else}
                                        {asset.ticker === 'USD' ? '$' : asset.ticker.slice(0, 3)}
                                    {/if}
                                </div>
                                <div class="flex flex-col items-start">
                                    <div class="flex items-center gap-1.5">
                                        <span class="text-sm font-bold text-white tracking-widest">
                                            {asset.ticker}
                                        </span>
                                        {#if vaultInfo}
                                            <span class="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-[7px] font-mono font-black text-amber-400 uppercase">
                                                POH VAULT
                                            </span>
                                        {/if}
                                    </div>
                                    <span class="text-[10px] font-mono text-neutral-400">
                                        {vaultInfo ? `${vaultInfo.dailyEmissionTokens.toLocaleString()} ${asset.ticker}/d` : asset.name}
                                    </span>
                                </div>
                            </div>
                            <div class="flex flex-col items-end pointer-events-none">
                                {#if asset.spotPrice > 0}
                                    <span class="text-xs font-mono font-bold text-[#18C6A5] tabular-nums">
                                        ${asset.spotPrice.toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 4
                                        })}
                                    </span>
                                {:else if vaultInfo}
                                    <span class="text-[9px] font-mono font-bold text-[#18C6A5] tabular-nums">
                                        {vaultInfo.remainingVaultTokens.toLocaleString()} Rem
                                    </span>
                                {/if}
                                <span class="text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-[#11161f] text-neutral-400 border border-white/10 mt-0.5">
                                    {vaultInfo ? 'Mineable KRC-20' : asset.assetClass}
                                </span>
                            </div>
                        </button>
                    {/each}
                </div>
            </div>
        </div>
    </div>
{/if}