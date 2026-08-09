<script lang="ts">
    import '../app.css';
    import { onMount, onDestroy } from 'svelte';
    import { get } from 'svelte/store';
    import { browser } from '$app/environment';
    import { fade, slide } from 'svelte/transition';
    import { activeTab, systemMode, globalKasPrice, globalKasChange, globalNetworkHashrate, globalNodeStatus, workers, silos, plants, walletInventory, tokenRegistry, adminGlobalView } from '$lib/stores/app';        
    
    import { isWalletConnected, walletAddress, walletBalance, disconnectWallet, restoreSession, showWalletModal, DEV_ADMIN_BYPASS, MASTER_ADMIN_ADDRESS } from '$lib/stores/wallet';
    import EntryView from '$lib/views/EntryView.svelte';
    import WalletModal from '$lib/components/WalletModal.svelte';

    let { children } = $props();

    const tabs = ['DEX', 'OPERATIONS', 'FORGE', 'TREASURY', 'TAX FORTRESS'];
    
    let isCorporateAdmin = $derived(DEV_ADMIN_BYPASS || $walletAddress === MASTER_ADMIN_ADDRESS);
    
    let disabledTabs: string[] = $state([]); 

    let priceInterval: ReturnType<typeof setInterval>;
    const BACKEND_BASE = '';

    let hasEntered = $state(false);

    function enterNexus() {
        hasEntered = true;
        $activeTab = 'OPERATIONS';
    }

    let isLoaded = $state(false);
    let isServerReachable = $state(true);
    let showCopyToast = $state(false);

    // Step 3: Cascading Glow State Trigger
    let appAwakened = $derived($isWalletConnected && isLoaded);

    function purgeApplicationState() {
        workers.set([]);
        silos.set([]);
        plants.set([]);
        walletInventory.set([]);
    }

    function copyToClipboard() {
        if ($walletAddress) {
            navigator.clipboard.writeText($walletAddress);
            showCopyToast = true;
            setTimeout(() => { showCopyToast = false; }, 2000);
        }
    }

    // ⚡ ZERO-TRUST: Fetching state via secure HTTP-Only cookie, NO address parameter
    async function loadStateFromServer() {
        if (!browser || !$walletAddress) return;
        try {
            const res = await fetch(`${BACKEND_BASE}/api/state`);
            if (res.ok) {
                const parsed = await res.json();
                workers.set(parsed.workers || []);
                silos.set(parsed.silos || []);
                if (parsed.plants) plants.set(parsed.plants);
                if (parsed.systemMode) systemMode.set(parsed.systemMode);
                isServerReachable = true;
                setTimeout(() => { isLoaded = true; }, 500);
            } else {
                purgeApplicationState();
                isServerReachable = true; 
                setTimeout(() => { isLoaded = true; }, 500);
            }
        } catch (e) {
            isServerReachable = false;
        } 
    }

    // ⚡ ZERO-TRUST: Saving state via secure HTTP-Only cookie, NO address parameter
    async function saveStateToServer() {
        if (!browser || !$walletAddress || !isLoaded || !isServerReachable || isCorporateAdmin) return;
        try {
            const statePayload = {
                workers: get(workers),
                silos: get(silos),
                plants: get(plants),
                systemMode: get(systemMode)
            };
            await fetch(`${BACKEND_BASE}/api/state`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(statePayload)
            });
        } catch (e) {}
    }

    $effect(() => {
        if (browser) {
            if ($isWalletConnected && $walletAddress) {
                isLoaded = false; 
                loadStateFromServer();
                syncKasWareState();
            } else if (!$isWalletConnected) {
                isLoaded = false;
                purgeApplicationState();
            }
        }
    });

    $effect(() => {
        if (browser && $isWalletConnected && $walletAddress && isLoaded && isServerReachable) {
            saveStateToServer();
        }
    });

    $effect(() => {
        if (browser && $isWalletConnected) {
            const numericBalance = parseFloat($walletBalance) || 0;
            const currentPrice = $globalKasPrice || 0;

            walletInventory.update(currentInv => {
                let newInv = [...currentInv];
                const existingItem = newInv.find(i => i.asset.ticker === 'KAS'); 
                
                if (existingItem) {
                    existingItem.balance = numericBalance;
                    existingItem.usdValue = numericBalance * currentPrice;
                } else {
                    const assetTemplate = tokenRegistry.find(t => t.ticker === 'KAS');
                    if (assetTemplate) {
                        newInv.push({ 
                            asset: assetTemplate, 
                            balance: numericBalance, 
                            usdValue: numericBalance * currentPrice 
                        });
                    }
                }
                return newInv;
            });
        }
    });

    async function syncKasWareState() {
        if (browser && typeof window !== 'undefined' && (window as any).kasware) {
            try {
                const accounts = await (window as any).kasware.getAccounts();
                if (accounts && accounts.length > 0 && accounts[0] === get(walletAddress)) {
                    const balance = await (window as any).kasware.getBalance();
                    walletBalance.set((balance.total / 100000000).toString());
                }
            } catch (e) {}
        }
    }

    async function fetchPriceData() {
        try {
            const res = await fetch('/api/prices?ids=kaspa&include_24hr_change=true');
            if (res.ok) {
                const data = await res.json();
                if (data?.kaspa) { 
                    globalKasPrice.set(data.kaspa.usd); 
                    globalKasChange.set(data.kaspa.usd_24h_change || 0); 
                }
            }
        } catch(e) {}
    }

    onMount(() => {
        restoreSession();
        fetchPriceData();
        priceInterval = setInterval(fetchPriceData, 15000); 
    });

    onDestroy(() => {
        clearInterval(priceInterval);
    });
</script>

{#if !$isWalletConnected && !hasEntered}
    <EntryView {enterNexus} />
{:else}
    <!-- Step 3: Cascading Glow Wrapper -->
    <div class="app-wrapper min-h-[100dvh] w-full text-white flex flex-col font-sans selection:bg-[#18C6A5]/30 overflow-x-hidden animate-[fade-in_1s_ease-out] {appAwakened ? 'glow-active' : 'dormant'}">
        
        <header class="h-16 border-b border-neutral-800/80 bg-transparent flex items-center justify-center z-50 shrink-0 w-full sticky top-0 backdrop-blur-xl">
            <div class="w-full max-w-[1600px] px-4 lg:px-10 flex justify-between items-center h-full">
                <div class="flex items-center gap-2 md:gap-3 cursor-pointer" onclick={() => window.location.href = '/'}>
                    <div class="w-7 h-7 md:w-8 md:h-8 bg-gradient-to-br from-[#18C6A5] to-teal-700 rounded shadow-[0_0_15px_rgba(24,198,165,0.3)] flex items-center justify-center shrink-0">
                        <span class="font-black text-black text-base md:text-lg">P</span>
                    </div>
                    <div class="flex items-center gap-2 hidden sm:flex h-full">
                        <span class="font-black tracking-[0.2em] text-lg md:text-xl uppercase text-white drop-shadow-md leading-none self-center">Perennia</span>
                        <span class="text-[9px] font-normal text-neutral-500 tracking-widest lowercase self-center mt-0.5 select-none">v4</span>
                    </div>
                </div>

                <div class="flex items-center gap-3 md:gap-4">
                    {#if isCorporateAdmin}
                        <button aria-label="Toggle Global Operations" onclick={() => $adminGlobalView = !$adminGlobalView} 
                                class="group relative w-12 h-6 bg-[#111] border { $adminGlobalView ? 'border-amber-500/50' : 'border-neutral-800'} rounded-full cursor-pointer transition-colors overflow-hidden hidden sm:block" title="Toggle Global Operations View">
                            <div class="absolute inset-0 { $adminGlobalView ? 'bg-amber-500/10' : 'bg-white/5'} opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div class="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full transition-all duration-300 shadow-sm { $adminGlobalView ? 'bg-amber-500 left-[26px] shadow-[0_0_8px_rgba(245,158,11,0.8)]' : 'bg-neutral-600 left-1'}"></div>
                        </button>
                    {/if}

                    <button aria-label="Toggle Overclocked Mode" onclick={() => $systemMode = $systemMode === 'base' ? 'overclocked' : 'base'} 
                            class="group relative w-12 h-6 bg-[#111] border border-neutral-800 rounded-full cursor-pointer transition-colors overflow-hidden hidden sm:block" title="Toggle Overclocked Mode">
                        <div class="absolute inset-0 bg-[#18C6A5]/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div class="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full transition-all duration-300 shadow-sm {$systemMode === 'overclocked' ? 'bg-[#18C6A5] left-[26px] shadow-[0_0_8px_rgba(24,198,165,0.8)]' : 'bg-neutral-600 left-1'}"></div>
                    </button>

                    <div class="h-8 w-px bg-neutral-800 hidden sm:block"></div>

                    {#if !$isWalletConnected}
                        <button onclick={() => $showWalletModal = true} class="px-4 md:px-6 py-2 md:py-2.5 bg-[#18C6A5]/10 hover:bg-[#18C6A5]/20 border border-[#18C6A5]/30 text-[#18C6A5] text-[10px] md:text-[11px] font-black uppercase tracking-widest rounded-xl shadow-[0_0_15px_rgba(24,198,165,0.1)] transition-all cursor-pointer whitespace-nowrap">
                            Connect System
                        </button>
                    {:else}
                        <div class="flex items-center gap-1 md:gap-2 bg-[#111] border border-neutral-800 rounded-xl p-1 pr-2 md:pr-3">
                            <button onclick={copyToClipboard} class="relative bg-[#1a1a1a] rounded-lg px-2 md:px-4 py-1.5 md:py-2 flex items-center gap-2 border border-neutral-800/50 hover:bg-[#222] hover:border-[#18C6A5]/40 cursor-pointer transition-all group">
                                <div class="w-1.5 h-1.5 rounded-full { $globalNodeStatus === 'online' ? 'bg-[#18C6A5] animate-pulse shadow-[0_0_8px_rgba(24,198,165,0.8)]' : $globalNodeStatus === 'unreachable' ? 'bg-amber-500' : 'bg-neutral-600' } shrink-0"></div>
                                <span class="{ $globalNodeStatus === 'online' ? 'text-[#18C6A5]' : $globalNodeStatus === 'unreachable' ? 'text-amber-500' : 'text-neutral-500' } font-mono text-[10px] md:text-[11px] font-bold truncate max-w-[80px] md:max-w-none group-hover:text-white transition-colors">
                                    {$walletAddress?.substring(0,10)}...{$walletAddress?.substring($walletAddress.length-4)}
                                </span>
                            
                                {#if showCopyToast}
                                    <div class="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-[#0a0a0a] border border-[#18C6A5]/50 rounded text-[#18C6A5] text-[9px] uppercase tracking-widest whitespace-nowrap shadow-[0_0_10px_rgba(24,198,165,0.1)]">
                                        Copied
                                    </div>
                                {/if}
                            </button>
                            <button aria-label="Disconnect" onclick={disconnectWallet} class="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer rounded-lg shrink-0" title="Disconnect">
                                <svg class="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                            </button>
                        </div>
                    {/if}
                </div>
            </div>
        </header>

        <nav class="h-12 bg-transparent border-b border-neutral-800/60 flex justify-center w-full z-40 shrink-0 shadow-inner hide-scrollbar">
            <div class="w-full max-w-[1600px] px-4 lg:px-10 flex items-center justify-start overflow-x-auto h-full hide-scrollbar">
                <div class="flex gap-4 sm:gap-8 h-full min-w-max items-center">
                    {#each tabs as tab}
                        {#if disabledTabs.includes(tab)}
                            <div class="relative h-full flex items-center px-2 cursor-not-allowed group" title="Restricted: Master Treasury Override">
                                <span class="text-[9px] md:text-[10px] font-bold tracking-[0.15em] uppercase text-neutral-800 whitespace-nowrap transition-colors group-hover:text-red-900/50">
                                    {tab}
                                </span>
                                <svg class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 text-red-900/40 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                            </div>
                        {:else}
                            <button onclick={() => $activeTab = tab} 
                                    class="relative h-full px-2 {tab === 'DEX' ? 'text-[9px] md:text-[10px]' : 'text-[10px] md:text-[11px]'} font-bold tracking-[0.15em] uppercase transition-all duration-300 whitespace-nowrap { $activeTab === tab ? 'text-[#18C6A5]' : 'text-neutral-500 hover:text-white cursor-pointer hover:bg-[#111]' }">
                                {tab}
                                {#if $activeTab === tab}
                                    <div class="absolute bottom-0 left-0 w-full h-[2px] bg-[#18C6A5] shadow-[0_0_8px_rgba(24,198,165,0.8)]"></div>
                                {/if}
                            </button>
                        {/if}
                    {/each}
                </div>
            </div>
        </nav>
        
        <main class="flex-1 overflow-y-auto relative pb-24">
            <div class="w-full h-full relative z-10">
                {@render children()}
            </div>
        </main>
    </div>
{/if}

<WalletModal />

<style>
    /* Step 3: Cascading Transitions & Glowing States */
    .app-wrapper {
        transition: background-color 2.5s ease-in-out, box-shadow 2.5s ease-in-out;
    }
    
    .app-wrapper.dormant {
        background-color: #050505;
        box-shadow: inset 0 0 0px rgba(24, 198, 165, 0);
    }

    .app-wrapper.glow-active {
        background-color: #0a0f12; 
        /* Massive cascading internal glow tracking the connection */
        box-shadow: inset 0 0 150px rgba(24, 198, 165, 0.05),
                    inset 0 0 50px rgba(168, 85, 247, 0.03); 
    }
</style>