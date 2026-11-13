<script lang="ts">
    import { slide } from 'svelte/transition';
    import { browser } from '$app/environment';
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { operations } from '$lib/stores/operations.svelte';
    import type { Worker } from '$lib/stores/type';
    import {
        STRATUM_HOST,
        KASPA_MINER_CATALOG,
        formatPortTierLabel,
        getWorkerPortTelemetry,
        getWorkerStratumUrl,
        formatHardwareName,
        type KaspaMinerSpec
    } from './operationsHelpers';

    let {
        displayedWorkers = [],
        displayHashrate = 0,
        totalShares = 0,
        unallocatedPercentage = 100,
        activeWorkerMenu = $bindable(null),
        activeMinerTypePickerWorkerId = $bindable(null),
        minerTypeSearch = $bindable(''),
        shimmerTargetId = null,
        onTriggerShimmer = (_id: string) => {},
        onSafeDispatch = async (_action: string, _payload: any) => {},
        onOpenSectorModal = () => {}
    }: {
        displayedWorkers: Worker[];
        displayHashrate: number;
        totalShares: number;
        unallocatedPercentage: number;
        activeWorkerMenu: string | null;
        activeMinerTypePickerWorkerId: string | null;
        minerTypeSearch: string;
        shimmerTargetId: string | null;
        onTriggerShimmer: (id: string) => void;
        onSafeDispatch: (action: string, payload: any) => Promise<void>;
        onOpenSectorModal: () => void;
    } = $props();

    let copiedMenuField = $state<string | null>(null);
let mobileFleetExpanded = $state(false);

    function markInlineCopied(key: string) {
        copiedMenuField = key;
        setTimeout(() => {
            if (copiedMenuField === key) copiedMenuField = null;
        }, 1800);
    }

    let filteredMinerCatalog = $derived(
        KASPA_MINER_CATALOG.filter((m) => {
            const q = minerTypeSearch.trim().toLowerCase();
            if (!q) return true;
            return (
                m.model.toLowerCase().includes(q) ||
                m.manufacturer.toLowerCase().includes(q) ||
                m.displayHashrate.toLowerCase().includes(q) ||
                String(m.port).includes(q)
            );
        })
    );

    function getWorkerIdentityString(worker: Worker): string {
        const targetAddr =
            identity.isCorporateAdmin &&
            ui.adminModeActive &&
            ui.adminTargetWallet
                ? ui.adminTargetWallet
                : identity.activeAddress;
        const cleanWallet = targetAddr?.replace(/kaspa:/i, '').trim() || '';
        return worker.walletWorker && !worker.walletWorker.includes('pending')
            ? worker.walletWorker
            : `kaspa:${cleanWallet}.${worker.name}`;
    }

    async function createManualWorker() {
        if (!identity.isWalletConnected || !identity.activeAddress) {
            ui.showWalletModal = true;
            return;
        }
        const randomSuffix = Math.random()
            .toString(36)
            .substring(2, 6)
            .toUpperCase();
        const defaultName = `RIG-${randomSuffix}`;
        const cleanWallet = identity.activeAddress
            .replace(/kaspa:/i, '')
            .trim();
        const newWorker: Worker = {
            id: Math.random().toString(36).substring(2, 8).toUpperCase(),
            type: 'physical',
            name: defaultName,
            stratumUrl: `stratum+tcp://${STRATUM_HOST}:3332`,
            walletWorker: `kaspa:${cleanWallet}.${defaultName}`,
            hashRate: 0,
            isOnline: false,
            hardwareType: 'Select Miner Type',
            sharesContributed: 0,
            validShares: 0,
            rejectedShares: 0,
            acceptancePct: 100.0,
            blocksFound: 0
        };
        operations.workers = [...operations.workers, newWorker];
        onTriggerShimmer(`worker_${newWorker.id}`);
        ui.triggerMicroBadge(
            `worker_${newWorker.id}`,
            'WORKER DEPLOYED ✓',
            '#18C6A5'
        );
        await onSafeDispatch('ADD_WORKER', newWorker);
    }

    async function selectWorkerMinerType(worker: Worker, spec: KaspaMinerSpec) {
        const updatedStratumUrl = `stratum+tcp://${STRATUM_HOST}:${spec.port}`;
        const updatedWorker: Worker = {
            ...worker,
            hardwareType: spec.model,
            stratumUrl: updatedStratumUrl
        };
        operations.workers = operations.workers.map((w) =>
            w.id === worker.id ? updatedWorker : w
        );
        activeMinerTypePickerWorkerId = null;
        minerTypeSearch = '';
        onTriggerShimmer(`worker_${worker.id}`);
        ui.triggerMicroBadge(
            `worker_${worker.id}`,
            `${spec.model.toUpperCase()} • :${spec.port} ✓`,
            '#18C6A5'
        );
        await onSafeDispatch('DELETE_WORKER', { id: worker.id });
        await onSafeDispatch('ADD_WORKER', updatedWorker);
    }

    async function renameWorkerAction(worker: Worker) {
        activeWorkerMenu = null;
        activeMinerTypePickerWorkerId = null;
        const newName = prompt('Rename this worker:', worker.name);
        if (newName && newName.trim() !== '' && newName.trim() !== worker.name) {
            const cleanWallet = identity.activeAddress
                ?.replace(/kaspa:/i, '')
                .trim();
            const newWalletWorker = `kaspa:${cleanWallet}.${newName.trim()}`;
            operations.workers = operations.workers.map((w) =>
                w.id === worker.id
                    ? {
                          ...w,
                          name: newName.trim(),
                          walletWorker: newWalletWorker
                      }
                    : w
            );
            onTriggerShimmer(`worker_${worker.id}`);
            ui.triggerMicroBadge(
                `worker_${worker.id}`,
                'RENAMED ✓',
                '#18C6A5'
            );
            await onSafeDispatch('RENAME_WORKER', {
                id: worker.id,
                name: newName.trim(),
                walletWorker: newWalletWorker
            });
        }
    }

    async function deleteWorkerAction(id: string) {
        activeWorkerMenu = null;
        activeMinerTypePickerWorkerId = null;
        if (
            confirm(
                'Remove this worker? It will reappear if hardware continues hashing.'
            )
        ) {
            operations.workers = operations.workers.filter((w) => w.id !== id);
            await onSafeDispatch('DELETE_WORKER', { id });
        }
    }

    function copyWorkerStratumOnly(worker: Worker) {
        const rawUrl = getWorkerStratumUrl(worker);
        if (browser && navigator.clipboard) {
            navigator.clipboard.writeText(rawUrl);
        }
        markInlineCopied(`stratum_${worker.id}`);
        onTriggerShimmer(`worker_${worker.id}`);
        ui.triggerMicroBadge(
            `worker_${worker.id}`,
            'STRATUM COPIED ✓',
            '#18C6A5'
        );
    }

    function copyWorkerIdentityOnly(worker: Worker) {
        const walletWorkerString = getWorkerIdentityString(worker);
        if (browser && navigator.clipboard) {
            navigator.clipboard.writeText(walletWorkerString);
        }
        markInlineCopied(`wallet_${worker.id}`);
        onTriggerShimmer(`worker_${worker.id}`);
        ui.triggerMicroBadge(
            `worker_${worker.id}`,
            'WALLET.WORKER COPIED ✓',
            '#18C6A5'
        );
    }
</script>

<div
    class="flex flex-col gap-3.5 lg:col-span-3 xl:col-span-2 relative {activeWorkerMenu !== null ? 'z-[70]' : 'z-20'}"
    data-tour="workers-panel"
>
    <div class="tactile-card bg-[#0a0d12] border border-white/10 rounded-2xl p-4 shadow-inner {ui.isTutorialActive ? 'flex' : 'hidden lg:flex'} flex-col gap-3"
        style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.08), transparent 65%);"
    >
        <div class="flex items-center justify-between">
            <h2 class="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                
            </h2>
            <span
                class="w-2 h-2 rounded-full {displayHashrate > 0 ? 'bg-[#18C6A5] shadow-[0_0_8px_rgba(24,198,165,0.8)] animate-pulse' : 'bg-neutral-600'}"
            ></span>
        </div>
        <div class="flex items-baseline gap-1.5 whitespace-nowrap">
            <span class="text-2xl xl:text-3xl font-mono font-light text-white leading-none tabular-nums">
                {displayHashrate.toFixed(2)}
            </span>
            <span class="text-xs text-[#18C6A5] font-mono font-bold uppercase">
                TH/s
            </span>
        </div>
        <div class="flex items-center justify-between border-t border-white/10 pt-2.5">
            <span class="text-[9px] uppercase tracking-wider text-neutral-400 font-bold font-mono">
                Shares
            </span>
            <span class="text-xs font-mono font-black text-amber-400 leading-none tabular-nums whitespace-nowrap">
                {totalShares.toLocaleString()}
            </span>
        </div>
    </div>

    <div data-testid="mobile-worker-pills-bar" class="lg:hidden flex items-center gap-2 overflow-x-auto hide-scrollbar py-0.5"><button type="button" onclick={() => (mobileFleetExpanded = !mobileFleetExpanded)} class="tactile-btn mobile-touch-target shrink-0 px-3 py-2 rounded-xl border-[#18C6A5]/40 text-[#18C6A5] text-[10px] font-mono font-black uppercase flex items-center gap-1.5"><span>Miners ({displayedWorkers.filter((w) => w.isOnline && w.hashRate > 0).length}/{displayedWorkers.length})</span><span>{mobileFleetExpanded ? '▴' : '▾'}</span></button>{#each displayedWorkers as pillW (pillW.id)}<button type="button" onclick={() => { mobileFleetExpanded = true; }} class="shrink-0 px-3 py-2 rounded-xl bg-[#0a0d12] border border-white/10 flex items-center gap-2 text-[10px] font-mono"><span class="w-2 h-2 rounded-full {pillW.isOnline && pillW.hashRate > 0 ? 'bg-[#18C6A5] animate-pulse' : 'bg-neutral-600'}"></span><span class="font-bold text-white">{pillW.name}</span><span class="text-[#18C6A5] tabular-nums">{pillW.hashRate.toFixed(2)}T</span></button>{/each}</div><div class="grid grid-cols-2 lg:grid-cols-1 gap-2.5"><button type="button" onclick={createManualWorker} disabled={!identity.isWalletConnected || identity.isWatchOnly} class="tactile-btn mobile-touch-target w-full text-white text-[10px] lg:text-[11px] font-bold uppercase tracking-widest py-3 lg:py-3.5 px-2 rounded-2xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">+ Miner</button><button type="button" onclick={onOpenSectorModal} disabled={!identity.isWalletConnected || identity.isWatchOnly || unallocatedPercentage <= 0} class="tactile-btn mobile-touch-target w-full text-white text-[10px] lg:text-[11px] font-bold uppercase tracking-widest py-3 lg:py-3.5 px-2 rounded-2xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">+ Split</button></div>

    <div class="{mobileFleetExpanded || ui.isTutorialActive || activeWorkerMenu !== null || displayedWorkers.length === 0 ? 'flex' : 'hidden lg:flex'} flex-col gap-2.5 mt-1 lg:mt-2">
        {#if displayedWorkers.length === 0}
            <div class="flex-1 border border-dashed border-white/10 rounded-2xl flex items-center justify-center bg-[#0a0d12] p-6 text-center pointer-events-none min-h-[150px]">
                <p class="text-[10px] uppercase tracking-widest text-neutral-500 font-bold leading-relaxed">
                    {#if !identity.isWalletConnected}
                        Log in
                    {:else}
                        No miners yet
                    {/if}
                </p>
            </div>
        {/if}

        {#each displayedWorkers as worker (worker.id)}
            {@const workerBadge = ui.microBadges[`worker_${worker.id}`]}
            {@const portTelemetry = getWorkerPortTelemetry(worker)}
            {@const liveStratumUrl = getWorkerStratumUrl(worker)}
            {@const liveWalletWorker = getWorkerIdentityString(worker)}
            {@const isMenuOpen = activeWorkerMenu === worker.id}
            {@const isMinerPickerOpen = activeMinerTypePickerWorkerId === worker.id}
            {@const isStratumCopied = copiedMenuField === `stratum_${worker.id}`}
            {@const isWalletCopied = copiedMenuField === `wallet_${worker.id}`}

            <div
                class="tactile-card {shimmerTargetId === `worker_${worker.id}` && !isMenuOpen ? 'shimmer-flash' : ''} {isMenuOpen ? 'z-[100] overflow-visible border-[#18C6A5]/50' : 'z-10 border-white/10'} bg-[#0a0d12] border rounded-2xl p-3.5 flex flex-col gap-2 relative"
                style="background-image: radial-gradient(ellipse at top right, rgba(24, 198, 165, 0.07), transparent 65%);"
            >
                {#if workerBadge}
                    <div
                        class="micro-confirm-badge absolute -top-3 right-3 z-[120] px-2.5 py-0.5 rounded-lg bg-[#11161f] border border-[#18C6A5]/60 text-[#18C6A5] text-[9px] font-mono font-black uppercase tracking-wider shadow-xl"
                    >
                        {workerBadge.label}
                    </div>
                {/if}
                <div class="flex justify-between items-start relative gap-2">
                    <div class="flex flex-col gap-1 min-w-0 flex-1">
                        <div class="flex items-center gap-2 min-w-0">
                            <div
                                class="w-2 h-2 rounded-full {worker.isOnline && worker.hashRate > 0 ? 'bg-[#18C6A5] shadow-[0_0_8px_rgba(24,198,165,0.8)] animate-pulse' : 'bg-neutral-600'} shrink-0"
                            ></div>
                            <span
                                class="text-xs font-bold text-white truncate leading-snug"
                                title={worker.name}
                            >
                                {worker.name}
                            </span>
                        </div>
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span
                                class="text-[8px] font-mono text-[#18C6A5]/90 bg-[#11161f] border border-white/10 px-2 py-0.5 rounded-md uppercase tracking-wider select-none"
                            >
                                {formatHardwareName(worker)}
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        aria-label="Worker Options"
                        onclick={(e) => {
                            e.stopPropagation();
                            if (activeWorkerMenu === worker.id) {
                                activeWorkerMenu = null;
                                activeMinerTypePickerWorkerId = null;
                            } else {
                                activeWorkerMenu = worker.id;
                                activeMinerTypePickerWorkerId = null;
                                minerTypeSearch = '';
                            }
                        }}
                        class="mobile-touch-target flex items-center justify-center text-neutral-300 hover:text-white cursor-pointer p-2 lg:p-1.5 rounded-lg bg-[#11161f] hover:bg-[#161d29] border border-white/10 hover:border-white/25 transition-colors shrink-0"
                        title="Worker Options"
                    >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                    </button>
                </div>

                {#if isMenuOpen}
                    <div
                        onclick={(e) => e.stopPropagation()}
                        onkeydown={(e) => e.stopPropagation()}
                        role="menu"
                        tabindex="-1"
                        class="absolute right-0 top-12 lg:right-auto lg:left-[calc(100%+12px)] lg:top-0 w-[min(330px,calc(100vw-2.5rem))] sm:w-[370px] bg-[#11161f] border border-white/20 rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.95)] p-2.5 z-[110] flex flex-col gap-1.5"
                        style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.12), transparent 70%);"
                    >
                        <button
                            type="button"
                            onclick={() => renameWorkerAction(worker)}
                            class="w-full text-left px-3.5 py-2.5 rounded-xl text-[11px] uppercase tracking-widest font-black text-neutral-100 hover:text-white hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-between gap-2"
                        >
                            <span class="pointer-events-none shrink-0">Rename</span>
                            <span class="text-[10px] font-mono text-neutral-400 pointer-events-none truncate">{worker.name} ✎</span>
                        </button>
                        <button
                            type="button"
                            onclick={(e) => {
                                e.stopPropagation();
                                activeMinerTypePickerWorkerId =
                                    activeMinerTypePickerWorkerId === worker.id
                                        ? null
                                        : worker.id;
                                minerTypeSearch = '';
                            }}
                            class="w-full text-left px-3.5 py-2.5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-between border {isMinerPickerOpen ? 'border-[#18C6A5]/50 bg-[#0a0d12]/80' : 'border-white/5 bg-[#0a0d12]/40'}"
                        >
                            <div class="flex flex-col gap-0.5 pointer-events-none">
                                <span class="text-[11px] uppercase tracking-widest font-black text-white">
                                    Model
                                </span>
                                <span class="text-[10px] font-mono text-[#18C6A5] font-bold">
                                    {formatHardwareName(worker)}
                                    {#if portTelemetry.matchedSpec}
                                        • {portTelemetry.matchedSpec.displayHashrate}
                                    {/if}
                                </span>
                            </div>
                            <div class="flex items-center gap-2 pointer-events-none">
                                <span class="px-2 py-0.5 rounded-lg bg-[#0a0d12] border border-amber-500/40 text-[10px] font-mono font-bold text-amber-400">
                                    :{portTelemetry.port}
                                </span>
                                <span class="text-xs text-white font-bold">
                                    {isMinerPickerOpen ? '▾' : '▸'}
                                </span>
                            </div>
                        </button>
                        {#if isMinerPickerOpen}
                            <div
                                transition:slide={{ duration: 150 }}
                                class="bg-[#0a0d12] border border-white/15 rounded-xl p-2 flex flex-col gap-1.5 my-0.5"
                            >
                                <input
                                    type="text"
                                    bind:value={minerTypeSearch}
                                    placeholder="Search KS0, KS5, KS7, Goldshell..."
                                    class="w-full bg-[#11161f] border border-white/15 focus:border-[#18C6A5]/60 rounded-lg px-3 py-1.5 text-[11px] font-mono text-white outline-none"
                                />
                                <div class="flex flex-col gap-1 max-h-[230px] overflow-y-auto hide-scrollbar pr-0.5">
                                    {#each filteredMinerCatalog as spec (spec.id)}
                                        {@const isSelected = portTelemetry.matchedSpec?.id === spec.id}
                                        <button
                                            type="button"
                                            onclick={(e) => {
                                                e.stopPropagation();
                                                selectWorkerMinerType(worker, spec);
                                            }}
                                            class="w-full text-left px-3 py-2 rounded-xl transition-colors cursor-pointer flex items-center justify-between border {isSelected ? 'bg-[#161d29] border-[#18C6A5]/50' : 'hover:bg-[#11161f] border-white/5'}"
                                        >
                                            <div class="flex flex-col pointer-events-none">
                                                <span class="text-[11px] font-bold text-white">
                                                    {spec.model}
                                                </span>
                                                <span class="text-[9px] font-mono text-neutral-400">
                                                    {spec.displayHashrate} • {spec.powerWatts}W
                                                </span>
                                            </div>
                                            <div class="flex flex-col items-end pointer-events-none">
                                                <span
                                                    class="text-[9px] font-mono font-black px-2 py-0.5 rounded border {spec.port === 3334 ? 'text-amber-400 border-amber-500/40 bg-amber-500/10' : spec.port === 3333 ? 'text-blue-400 border-blue-500/40 bg-blue-500/10' : 'text-[#18C6A5] border-[#18C6A5]/40 bg-[#18C6A5]/10'}"
                                                >
                                                    PORT :{spec.port}
                                                </span>
                                            </div>
                                        </button>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                        <div class="h-px w-full bg-white/10 my-0.5"></div>
                        <button
                            type="button"
                            onclick={(e) => {
                                e.stopPropagation();
                                copyWorkerStratumOnly(worker);
                            }}
                            class="w-full text-left px-3.5 py-2.5 rounded-xl bg-[#0a0d12]/60 hover:bg-white/10 border {isStratumCopied ? 'border-[#18C6A5]' : 'border-white/5 hover:border-[#18C6A5]/40'} transition-colors cursor-pointer flex flex-col gap-1 group"
                            title="Click to copy Stratum URL into your miner dashboard"
                        >
                            <div class="flex items-center justify-between pointer-events-none">
                                <span class="text-[9px] font-bold uppercase tracking-wider text-neutral-300 group-hover:text-white">
                                    Stratum Address ({formatPortTierLabel(portTelemetry.port, portTelemetry.tierLabel)})
                                </span>
                                <span class="text-[9px] font-mono font-black {isStratumCopied ? 'text-[#18C6A5]' : 'text-[#18C6A5]/80 group-hover:text-[#18C6A5]'}">
                                    {isStratumCopied ? '✓ COPIED' : 'Copy'}
                                </span>
                            </div>
                            <span class="text-xs font-mono font-bold text-[#18C6A5] break-all leading-snug pointer-events-none">
                                {liveStratumUrl}
                            </span>
                        </button>
                        <button
                            type="button"
                            onclick={(e) => {
                                e.stopPropagation();
                                copyWorkerIdentityOnly(worker);
                            }}
                            class="w-full text-left px-3.5 py-2.5 rounded-xl bg-[#0a0d12]/60 hover:bg-white/10 border {isWalletCopied ? 'border-blue-400' : 'border-white/5 hover:border-blue-400/40'} transition-colors cursor-pointer flex flex-col gap-1 group"
                            title="Click to copy full kaspa:address.worker into your miner dashboard"
                        >
                            <div class="flex items-center justify-between pointer-events-none">
                                <span class="text-[9px] font-bold uppercase tracking-wider text-neutral-300 group-hover:text-white">
                                    Wallet.Worker
                                </span>
                                <span class="text-[9px] font-mono font-black {isWalletCopied ? 'text-blue-400' : 'text-blue-400/80 group-hover:text-blue-400'}">
                                    {isWalletCopied ? '✓ COPIED' : 'Copy'}
                                </span>
                            </div>
                            <span class="text-[11px] font-mono font-bold text-blue-400 break-all leading-snug pointer-events-none">
                                {liveWalletWorker}
                            </span>
                        </button>
                        <div class="h-px w-full bg-white/10 my-0.5"></div>
                        <button
                            type="button"
                            onclick={() => deleteWorkerAction(worker.id)}
                            class="w-full text-left px-3.5 py-2 rounded-xl text-[10px] uppercase tracking-widest font-bold text-red-400 hover:text-red-300 hover:bg-red-950/30 transition-colors cursor-pointer"
                        >
                            Remove
                        </button>
                    </div>
                {/if}

                <div class="grid grid-cols-3 items-end gap-1.5 border-t border-white/10 pt-2.5 mt-0.5">
                    <div class="flex flex-col min-w-0">
                        <span class="text-[8px] uppercase tracking-wider text-neutral-400 font-bold font-mono whitespace-nowrap">
                            Hashrate
                        </span>
                        <span class="text-[11px] font-mono font-black whitespace-nowrap tabular-nums {worker.hashRate > 0 ? 'text-white' : 'text-neutral-500'}">
                            {worker.hashRate.toFixed(2)} <span class="text-[9px] text-neutral-400 font-normal">TH/s</span>
                        </span>
                    </div>
                    <div class="flex flex-col items-center min-w-0">
                        <span class="text-[8px] uppercase tracking-wider text-neutral-400 font-bold font-mono whitespace-nowrap">
                            Blocks
                        </span>
                        <span class="text-[11px] font-mono font-black whitespace-nowrap tabular-nums {worker.blocksFound && worker.blocksFound > 0 ? 'text-blue-400 drop-shadow-[0_0_5px_rgba(96,165,250,0.5)]' : 'text-neutral-500'}">
                            {worker.blocksFound || 0}
                        </span>
                    </div>
                    <div class="flex flex-col items-end min-w-0">
                        <span class="text-[8px] uppercase tracking-wider text-neutral-400 font-bold font-mono whitespace-nowrap">
                            Shares
                        </span>
                        <span class="text-[11px] font-mono font-black whitespace-nowrap tabular-nums {worker.sharesContributed && worker.sharesContributed > 0 ? 'text-amber-400 drop-shadow-[0_0_5px_rgba(245,158,11,0.5)]' : 'text-neutral-500'}">
                            {(worker.sharesContributed || 0).toLocaleString()}
                        </span>
                    </div>
                </div>
            </div>
        {/each}
    </div>
</div>