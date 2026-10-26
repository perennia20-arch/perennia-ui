<script lang="ts">
    import '../app.css';
    import { source } from 'sveltekit-sse';
    import { onMount, onDestroy, untrack } from 'svelte';
    import { browser } from '$app/environment';
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { operations } from '$lib/stores/operations.svelte';
    import { treasury } from '$lib/stores/treasury.svelte';
    import { settingsStore } from '$lib/stores/settings.svelte';
    import type { Worker } from '$lib/stores/type';
    import EntryView from '$lib/views/EntryView.svelte';
    import WalletModal from '$lib/components/WalletModal.svelte';
    import SettingsModal from '$lib/components/SettingsModal.svelte';
    import TutorialOverlay from '$lib/components/TutorialOverlay.svelte';

    let { children } = $props();

    let tabs = $derived(
        identity.isCorporateAdmin
            ? ['DEX', 'OPERATIONS', 'FORGE', 'TREASURY', 'TAX FORTRESS', 'DIRECTOR']
            : ['DEX', 'OPERATIONS', 'FORGE', 'TREASURY', 'TAX FORTRESS']
    );

    const BACKEND_BASE = '';
    let hasEntered = $state(false);
    let headerPillShimmer = $state(false);

    function enterNexus() {
        hasEntered = true;
        ui.hasEntered = true;
        ui.activeTab = 'OPERATIONS';
        ui.showWalletModal = true;
    }

    function resolveAutoStratumUrl(hashrateTh: number): string {
        if (hashrateTh > 10.0) {
            return 'stratum+tcp://pool.perennia.io:3334';
        }
        if (hashrateTh >= 1.0) {
            return 'stratum+tcp://pool.perennia.io:3333';
        }
        return 'stratum+tcp://pool.perennia.io:3332';
    }

    let isLoaded = $state(false);
    let isServerReachable = $state(true);
    let appAwakened = $derived(identity.isWalletConnected && isLoaded);

    const resolveTargetWallet = () =>
        identity.isCorporateAdmin && ui.adminModeActive && ui.adminTargetWallet
            ? ui.adminTargetWallet
            : identity.activeAddress;

    function copyHeaderWalletAddress() {
        if (identity.activeAddress && browser && navigator.clipboard) {
            navigator.clipboard.writeText(identity.activeAddress);
            headerPillShimmer = true;
            ui.triggerMicroBadge('header_wallet_pill', 'COPIED ✓', '#18C6A5');
            setTimeout(() => {
                headerPillShimmer = false;
            }, 650);
        }
    }

    async function loadStateFromServer(targetWallet: string | null = null) {
        if (!browser || !identity.activeAddress || !identity.isWalletConnected) return;
        try {
            const url = targetWallet
                ? `${BACKEND_BASE}/api/state?target=${encodeURIComponent(targetWallet)}`
                : `${BACKEND_BASE}/api/state`;
            const res = await fetch(url);
            if (res.ok) {
                const parsed = await res.json();
                operations.workers = parsed.workers || [];
                operations.sectors = parsed.sectors || [];
                if (parsed.systemMode) ui.systemMode = parsed.systemMode;
                if (parsed.epochTelemetry) {
                    operations.updateEpochTelemetry(parsed.epochTelemetry);
                }
                if (typeof parsed.networkDifficulty === 'number' && parsed.networkDifficulty > 0) {
                    operations.networkDifficulty = parsed.networkDifficulty;
                }
                if (typeof parsed.blockRewardKas === 'number' && parsed.blockRewardKas > 0) {
                    operations.blockRewardKas = parsed.blockRewardKas;
                }
                isServerReachable = true;
                isLoaded = true;
            } else {
                operations.purge();
                isServerReachable = true;
                isLoaded = true;
            }
        } catch {
            isServerReachable = false;
        }
    }

    $effect(() => {
        if (browser) {
            const connected = identity.isWalletConnected;
            const addr = identity.activeAddress;
            const adminActive = ui.adminModeActive;
            const adminTarget = ui.adminTargetWallet;
            untrack(() => {
                if (connected && addr) {
                    isLoaded = false;
                    const target =
                        identity.isCorporateAdmin && adminActive && adminTarget
                            ? adminTarget
                            : null;
                    loadStateFromServer(target);
                } else if (!connected) {
                    isLoaded = false;
                    operations.purge();
                }
            });
        }
    });

    $effect(() => {
        const connected = identity.isWalletConnected;
        const addr = identity.activeAddress;
        if (browser && connected && addr) {
            let connection: any;
            let unsubscribe: (() => void) | undefined;
            untrack(() => {
                connection = source(`/api/telemetry?address=${encodeURIComponent(addr)}`);
                unsubscribe = connection.select('message').subscribe((rawData: string) => {
                    if (!rawData) return;
                    untrack(() => {
                        try {
                            const parsed = JSON.parse(rawData);
                            if (parsed.error) return;
                            if (parsed.fiat_event) {
                                window.dispatchEvent(
                                    new CustomEvent('perennia:fiat_event', { detail: parsed })
                                );
                                return;
                            }
                            if (
                                typeof parsed.networkDifficulty === 'number' &&
                                parsed.networkDifficulty > 0
                            ) {
                                operations.networkDifficulty = parsed.networkDifficulty;
                            }
                            if (
                                typeof parsed.blockRewardKas === 'number' &&
                                parsed.blockRewardKas > 0
                            ) {
                                operations.blockRewardKas = parsed.blockRewardKas;
                            }
                            if (parsed.epoch_telemetry_update && parsed.epoch) {
                                operations.updateEpochTelemetry(parsed.epoch);
                                return;
                            }
                            if (parsed.epoch) {
                                operations.updateEpochTelemetry(parsed.epoch);
                            }
                            const targetUserWallet = resolveTargetWallet();
                            const cleanTarget = (targetUserWallet || '')
                                .replace(/kaspa:/i, '')
                                .toLowerCase()
                                .trim();
                            const incWallet = (parsed.wallet || '')
                                .replace(/kaspa:/i, '')
                                .toLowerCase()
                                .trim();
                            if (parsed.layout_state_update) {
                                if (Date.now() - operations.lastMutationTime < 4000) return;
                                if (incWallet === cleanTarget) {
                                    operations.workers = parsed.state.workers || [];
                                    operations.sectors = parsed.state.sectors || [];
                                    if (parsed.state.systemMode)
                                        ui.systemMode = parsed.state.systemMode;
                                }
                                return;
                            }
                            if (parsed.yield_update) {
                                if (incWallet === cleanTarget) {
                                    operations.sectors = operations.sectors.map((s) => {
                                        const update = parsed.sectors?.find(
                                            (u: any) => u.id === s.id
                                        );
                                        if (update && s.pendingKaspa !== update.pendingKaspa) {
                                            return { ...s, pendingKaspa: update.pendingKaspa };
                                        }
                                        return s;
                                    });
                                }
                                window.dispatchEvent(
                                    new CustomEvent('perennia:yield_update', { detail: parsed })
                                );
                                return;
                            }
                            operations.globalNetworkHashrate =
                                (parsed.pool?.totalHashrate || parsed.totalHashrate || 0) / 1e12;
                            operations.globalNodeStatus = 'connected';
                            let nextWorkers = [...operations.workers];
                            let matchedIndices = new Set<number>();
                            (parsed.workers || []).forEach((bw: any) => {
                                const rawIdentity = bw.walletAddress || bw.fullIdentity || '';
                                const bBase = rawIdentity
                                    .split('.')[0]
                                    .replace(/kaspa:/i, '')
                                    .toLowerCase()
                                    .trim();
                                const bName = bw.name || rawIdentity.split('.')[1] || 'Rig';
                                const existingIdx = nextWorkers.findIndex((w, idx) => {
                                    if (matchedIndices.has(idx)) return false;
                                    const wIdentity = w.walletWorker || '';
                                    const wBase = wIdentity
                                        .split('.')[0]
                                        .replace(/kaspa:/i, '')
                                        .toLowerCase()
                                        .trim();
                                    return (
                                        wIdentity.toLowerCase() ===
                                            (bw.fullIdentity || '').toLowerCase() ||
                                        (w.name?.toLowerCase() === bName.toLowerCase() &&
                                            (wBase === bBase ||
                                                wBase === 'pending' ||
                                                wBase === ''))
                                    );
                                });
                                const rawHash = bw.trackingRate || bw.hashrate || bw.hashRate || 0;
                                const liveHashTh = rawHash / 1e12;
                                const autoAssignedStratumUrl = resolveAutoStratumUrl(liveHashTh);
                                const validShares =
                                    typeof bw.validShares === 'number'
                                        ? bw.validShares
                                        : undefined;
                                const rejectedShares =
                                    typeof bw.rejectedShares === 'number'
                                        ? bw.rejectedShares
                                        : undefined;
                                const acceptancePct =
                                    typeof bw.acceptancePct === 'number'
                                        ? bw.acceptancePct
                                        : undefined;
                                const lastShareTimestamp =
                                    typeof bw.lastShareTimestamp === 'number'
                                        ? bw.lastShareTimestamp
                                        : undefined;
                                if (existingIdx !== -1) {
                                    matchedIndices.add(existingIdx);
                                    const currentWorker = nextWorkers[existingIdx];
                                    const hasManualModel =
                                        currentWorker.hardwareType &&
                                        currentWorker.hardwareType !== 'IceRiver KS' &&
                                        currentWorker.hardwareType !== 'Select Miner Type';
                                    nextWorkers[existingIdx] = {
                                        ...currentWorker,
                                        hashRate: liveHashTh,
                                        stratumUrl: hasManualModel
                                            ? currentWorker.stratumUrl
                                            : liveHashTh > 0
                                              ? autoAssignedStratumUrl
                                              : currentWorker.stratumUrl || autoAssignedStratumUrl,
                                        sharesContributed: bw.sharesContributed || bw.shares || 0,
                                        validShares: validShares ?? currentWorker.validShares,
                                        rejectedShares:
                                            rejectedShares ?? currentWorker.rejectedShares,
                                        acceptancePct:
                                            acceptancePct ?? currentWorker.acceptancePct ?? 100.0,
                                        lastShareTimestamp:
                                            lastShareTimestamp ?? currentWorker.lastShareTimestamp,
                                        blocksFound: bw.blocksFound || bw.blocks || 0,
                                        hardwareType:
                                            bw.hardwareType ||
                                            currentWorker.hardwareType ||
                                            'IceRiver KS',
                                        isOnline: true
                                    };
                                } else {
                                    const newWorker: Worker = {
                                        id: Math.random().toString(36).substring(2, 8).toUpperCase(),
                                        type: 'physical',
                                        name: bName,
                                        stratumUrl: autoAssignedStratumUrl,
                                        walletWorker: bw.fullIdentity || `kaspa:${bBase}.${bName}`,
                                        hashRate: liveHashTh,
                                        isOnline: true,
                                        hardwareType: bw.hardwareType || 'IceRiver KS',
                                        sharesContributed: bw.sharesContributed || bw.shares || 0,
                                        validShares: validShares ?? 0,
                                        rejectedShares: rejectedShares ?? 0,
                                        acceptancePct: acceptancePct ?? 100.0,
                                        lastShareTimestamp: lastShareTimestamp ?? Date.now(),
                                        blocksFound: bw.blocksFound || bw.blocks || 0
                                    };
                                    matchedIndices.add(nextWorkers.length);
                                    nextWorkers.push(newWorker);
                                    setTimeout(() => {
                                        operations.markMutation();
                                        operations.dispatchStateAction('ADD_WORKER', newWorker);
                                    }, 100);
                                }
                            });
                            operations.workers = nextWorkers.map((w, idx) => {
                                if (!matchedIndices.has(idx)) {
                                    return { ...w, hashRate: 0, isOnline: false };
                                }
                                return w;
                            });
                        } catch {
                            operations.globalNodeStatus = 'unreachable';
                        }
                    });
                });
            });
            return () => {
                if (unsubscribe) unsubscribe();
                if (connection && typeof connection.close === 'function') connection.close();
            };
        } else {
            untrack(() => {
                operations.globalNodeStatus = 'offline';
            });
        }
    });

    async function fetchPriceData() {
        try {
            const res = await fetch(
                '/api/prices?ids=kaspa,bitcoin,ethereum,solana,dogecoin,ripple,polygon-ecosystem-token,avalanche-2,sui,tron,zcash,arbitrum&include_24hr_change=true'
            );
            if (res.ok) {
                const data = await res.json();
                const map: Record<string, string> = {
                    kaspa: 'KAS',
                    bitcoin: 'BTC',
                    ethereum: 'ETH',
                    solana: 'SOL',
                    dogecoin: 'DOGE',
                    ripple: 'XRP',
                    'polygon-ecosystem-token': 'POL',
                    'avalanche-2': 'AVAX',
                    sui: 'SUI',
                    tron: 'TRX',
                    zcash: 'ZEC',
                    arbitrum: 'ARB'
                };
                for (const [cgKey, ticker] of Object.entries(map)) {
                    if (data?.[cgKey]?.usd !== undefined) {
                        treasury.updateAsset(ticker, {
                            spotPrice: Number(data[cgKey].usd),
                            delta: Number(data[cgKey].usd_24h_change || 0)
                        });
                    }
                }
            }
        } catch {
        }
    }

    let priceInterval: ReturnType<typeof setInterval>;
    let epochClockInterval: ReturnType<typeof setInterval>;

    onMount(async () => {
        operations.tickEpochClock();
        epochClockInterval = setInterval(() => {
            operations.tickEpochClock();
        }, 1000);
        const unlockedInTab =
            browser && sessionStorage.getItem('perennia_vault_unlocked') === 'true';
        try {
            const res = await fetch('/api/auth/me');
            if (res.ok) {
                const data = await res.json();
                if (data.authenticated && data.address) {
                    if (unlockedInTab) {
                        const restored = identity.hydrateStoredSovereignSession(data.address);
                        if (restored) {
                            hasEntered = true;
                            ui.hasEntered = true;
                        }
                    } else {
                        identity.hydrateStoredSovereignSession(data.address);
                        hasEntered = true;
                        ui.hasEntered = true;
                        ui.showWalletModal = true;
                    }
                }
            }
        } catch {
        }
        fetchPriceData();
        settingsStore.applyTheme();
        priceInterval = setInterval(fetchPriceData, 15000);
    });

    onDestroy(() => {
        if (priceInterval) clearInterval(priceInterval);
        if (epochClockInterval) clearInterval(epochClockInterval);
    });
</script>

<div class="theme-wrapper min-h-[100dvh] bg-app">
    {#if !hasEntered && !ui.hasEntered}
        <EntryView {enterNexus} />
    {:else}
        <div
            class="app-wrapper min-h-[100dvh] w-full flex flex-col font-sans selection:bg-[#18C6A5]/30 overflow-x-hidden {appAwakened ? 'glow-active' : 'dormant'}"
        >
            <header class="h-20 lg:h-24 bg-[#06080b]/95 backdrop-blur-md flex items-center justify-center z-50 shrink-0 w-full sticky top-0 border-b border-white/10">
                <div class="w-full max-w-[1600px] px-4 lg:px-10 flex justify-between items-center h-full gap-3">
                    <button
                        type="button"
                        class="flex items-center gap-3 md:gap-4 cursor-pointer shrink-0 bg-transparent border-none text-left"
                        onclick={() => (ui.activeTab = 'OPERATIONS')}
                    >
                        <div class="w-8 h-8 md:w-10 md:h-10 bg-[#11161f] rounded-xl flex items-center justify-center shrink-0 border border-white/10">
                            <span class="font-black text-[#18C6A5] text-lg md:text-xl">P</span>
                        </div>
                        <div class="flex items-center gap-2 hidden sm:flex h-full">
                            <span class="font-black tracking-[0.2em] text-xl md:text-2xl uppercase text-white leading-none self-center">
                                Perennia
                            </span>
                            <span class="text-[10px] font-mono text-neutral-500 tracking-widest lowercase self-center mt-0.5 select-none">
                                v4
                            </span>
                        </div>
                    </button>

                    <div class="flex items-center gap-2.5 md:gap-3.5 shrink-0">
                        {#if identity.isCorporateAdmin && ui.adminModeActive && ui.adminTargetWallet}
                            <div class="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/40 font-mono">
                                <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                                <span class="text-[9px] font-black uppercase tracking-widest text-amber-400">
                                    Inspecting: {ui.adminTargetWallet.slice(0, 14)}...
                                </span>
                                <button
                                    type="button"
                                    onclick={() => {
                                        ui.adminModeActive = false;
                                        ui.adminTargetWallet = '';
                                    }}
                                    class="text-[9px] font-black text-neutral-300 hover:text-white ml-1 cursor-pointer"
                                    title="Exit Miner Impersonation"
                                >
                                    [Exit ✕]
                                </button>
                            </div>
                        {/if}

                        <button
                            type="button"
                            onclick={() => ui.toggleTutorialMode()}
                            class="tactile-btn px-3.5 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest cursor-pointer flex items-center gap-1.5 {ui.isTutorialActive ? 'text-[#18C6A5] border-[#18C6A5]/50' : 'text-neutral-400 hover:text-white'}"
                            title="Toggle Interactive Nexus Guide"
                        >
                            <span class="w-1.5 h-1.5 rounded-full {ui.isTutorialActive ? 'bg-[#18C6A5] animate-pulse' : 'bg-neutral-500'}"></span>
                            <span>[? GUIDE]</span>
                        </button>

                        <button
                            type="button"
                            aria-label="Settings"
                            onclick={() => (settingsStore.showSettingsModal = true)}
                            class="tactile-btn w-10 h-10 rounded-xl text-neutral-400 hover:text-white flex items-center justify-center cursor-pointer"
                            title="System Parameters"
                        >
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c-.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>

                        <div class="h-7 w-px bg-white/10 hidden sm:block"></div>

                        {#if !identity.isWalletConnected}
                            <button
                                type="button"
                                onclick={() => (ui.showWalletModal = true)}
                                class="tactile-btn px-5 md:px-6 py-2.5 md:py-3 border-[#18C6A5]/40 text-[#18C6A5] hover:text-white text-[10px] md:text-[11px] font-black uppercase tracking-widest rounded-xl cursor-pointer whitespace-nowrap"
                                style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.16), transparent 70%);"
                            >
                                Unlock Vault
                            </button>
                        {:else}
                            <div class="flex items-center gap-1.5 bg-[#0a0d12] border border-white/10 rounded-xl p-1 pr-2 relative">
                                {#if ui.microBadges['header_wallet_pill']}
                                    <div class="micro-confirm-badge absolute -bottom-7 left-1/2 -translate-x-1/2 z-50 px-2.5 py-0.5 rounded bg-[#11161f] border border-[#18C6A5]/50 text-[#18C6A5] text-[8px] font-mono font-black uppercase tracking-widest whitespace-nowrap shadow-lg">
                                        {ui.microBadges['header_wallet_pill'].label}
                                    </div>
                                {/if}
                                <button
                                    type="button"
                                    onclick={copyHeaderWalletAddress}
                                    class="tactile-btn {headerPillShimmer ? 'shimmer-flash' : ''} rounded-lg px-3 md:px-4 py-1.5 md:py-2 flex items-center gap-2 cursor-pointer group"
                                    title="Click to copy Sovereign Kaspa Address"
                                >
                                    <div
                                        class="w-2 h-2 rounded-full {operations.globalNodeStatus === 'connected' ? 'bg-[#18C6A5] animate-pulse' : operations.globalNodeStatus === 'unreachable' ? 'bg-amber-500' : 'bg-neutral-600'} shrink-0"
                                    ></div>
                                    <span
                                        class="{operations.globalNodeStatus === 'connected' ? 'text-[#18C6A5]' : operations.globalNodeStatus === 'unreachable' ? 'text-amber-500' : 'text-neutral-400'} font-mono text-[10px] md:text-[11px] font-bold truncate max-w-[95px] md:max-w-none group-hover:text-white transition-colors"
                                    >
                                        {identity.activeAddress?.substring(0, 10)}...{identity.activeAddress?.substring(identity.activeAddress.length - 4)}
                                    </span>
                                    <span
                                        class="hidden lg:inline-block px-1.5 py-0.5 rounded text-[7px] font-mono uppercase tracking-widest border bg-[#18C6A5]/10 border-[#18C6A5]/30 text-[#18C6A5]"
                                    >
                                        UNLOCKED
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    aria-label="Disconnect"
                                    onclick={() => identity.disconnect()}
                                    class="w-8 h-8 flex items-center justify-center text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer rounded-lg shrink-0"
                                    title="Disconnect"
                                >
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                </button>
                            </div>
                        {/if}
                    </div>
                </div>
            </header>

            <nav class="h-14 bg-[#06080b]/90 flex justify-center w-full z-40 shrink-0 hide-scrollbar border-b border-white/10">
                <div class="w-full max-w-[1600px] px-4 lg:px-10 flex items-center justify-between overflow-x-auto h-full hide-scrollbar gap-4">
                    <div class="flex gap-6 sm:gap-10 h-full min-w-max items-center">
                        {#each tabs as tab}
                            <button
                                type="button"
                                onclick={() => (ui.activeTab = tab)}
                                class="relative h-full px-2 text-[11px] md:text-sm font-bold tracking-[0.15em] uppercase transition-colors duration-150 whitespace-nowrap {ui.activeTab === tab ? 'text-[#18C6A5]' : 'text-neutral-500 hover:text-white cursor-pointer hover:bg-white/5'} rounded-lg my-1"
                            >
                                {tab}
                                {#if ui.activeTab === tab}
                                    <div class="absolute bottom-0 left-0 w-full h-[2px] bg-[#18C6A5]"></div>
                                {/if}
                            </button>
                        {/each}
                    </div>
                </div>
            </nav>

            <main class="flex-1 overflow-y-auto relative pb-24 mt-2">
                <div class="w-full h-full relative z-10">
                    {@render children()}
                </div>
            </main>
        </div>
    {/if}
</div>

<WalletModal />
<SettingsModal />
<TutorialOverlay />

<style>
    .app-wrapper.dormant {
        background-color: var(--bg-app);
    }
    .app-wrapper.glow-active {
        background-color: var(--bg-app);
    }
</style>