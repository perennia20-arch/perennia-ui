<script lang="ts">
    import '../app.css';
    import { onMount, onDestroy } from 'svelte';
    import { get } from 'svelte/store';
    import { browser } from '$app/environment';
    import { fade, slide } from 'svelte/transition';
    import { activeTab, systemMode, globalKasPrice, globalKasChange, globalNetworkHashrate, globalNodeStatus, workers, silos, plants, walletInventory, coreTokenRegistry, adminModeActive, adminTargetWallet } from '$lib/stores/app';        
    
    import { isWalletConnected, walletAddress, walletBalance, disconnectWallet, restoreSession, showWalletModal, DEV_ADMIN_BYPASS, MASTER_ADMIN_ADDRESS } from '$lib/stores/wallet';
    import { showSettingsModal, uiBrightness } from '$lib/stores/settings';
    
    import EntryView from '$lib/views/EntryView.svelte';
    import WalletModal from '$lib/components/WalletModal.svelte';
    import SettingsModal from '$lib/components/SettingsModal.svelte';

    let { children } = $props();

    const tabs = ['DEX', 'OPERATIONS', 'TREASURY', 'TAX FORTRESS'];
    
    let isCorporateAdmin = $derived(DEV_ADMIN_BYPASS || ($walletAddress && $walletAddress.toLowerCase() === MASTER_ADMIN_ADDRESS.toLowerCase()));
    
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

    async function loadStateFromServer(targetWallet: string | null = null) {
        if (!browser || !$walletAddress) return;
        try {
            const url = targetWallet ? `${BACKEND_BASE}/api/state?target=${encodeURIComponent(targetWallet)}` : `${BACKEND_BASE}/api/state`;
            const res = await fetch(url);
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

    $effect(() => {
        if (browser) {
            if ($isWalletConnected && $walletAddress) {
                isLoaded = false; 
                const target = (isCorporateAdmin && $adminModeActive && $adminTargetWallet) ? $adminTargetWallet : null;
                loadStateFromServer(target);
                syncKasWareState();
            } else if (!$isWalletConnected) {
                isLoaded = false;
                purgeApplicationState();
            }
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
                    const assetTemplate = coreTokenRegistry.find(t => t.ticker === 'KAS');
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

<div class="theme-wrapper transition-colors duration-500 bg-black min-h-[100dvh]" class:theme-overclock={$systemMode === 'overclocked'}>
    {#if !hasEntered}
        <EntryView {enterNexus} />
    {:else}
        <div class="app-wrapper min-h-[100dvh] w-full text-white flex flex-col font-sans selection:bg-[#18C6A5]/30 overflow-x-hidden animate-[fade-in_1s_ease-out] {appAwakened ? 'glow-active' : 'dormant'}"
             style="filter: brightness({$uiBrightness});">
            
            <header class="h-20 lg:h-24 bg-black flex items-center justify-center z-50 shrink-0 w-full sticky top-0">
                <div class="w-full max-w-[1600px] px-4 lg:px-10 flex justify-between items-center h-full">
                    <div class="flex items-center gap-3 md:gap-4 cursor-pointer" onclick={() => window.location.href = '/'}>
                        <div class="w-8 h-8 md:w-10 md:h-10 bg-[#111] rounded-xl flex items-center justify-center shrink-0">
                            <span class="font-black text-emerald-400 text-lg md:text-xl">P</span>
                        </div>
                        <div class="flex items-center gap-2 hidden sm:flex h-full">
                            <span class="font-black tracking-[0.2em] text-xl md:text-2xl uppercase text-white leading-none self-center">Perennia</span>
                            <span class="text-[10px] font-normal text-neutral-500 tracking-widest lowercase self-center mt-0.5 select-none">v4</span>
                        </div>
                    </div>

                    <div class="flex items-center gap-3 md:gap-4">
                        
                        <button aria-label="Toggle Overclocked Mode" onclick={() => {
                                $systemMode = $systemMode === 'base' ? 'overclocked' : 'base';
                                import('$lib/stores/app').then(m => m.dispatchStateAction('SYSTEM_MODE', { mode: $systemMode }));
                            }} 
                                class="group relative w-12 h-6 bg-[#111] border border-neutral-800 rounded-full cursor-pointer transition-colors overflow-hidden hidden sm:block" title="Toggle Overclocked Mode">
                            <div class="absolute inset-0 bg-[#18C6A5]/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            <div class="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full transition-all duration-300 { $systemMode === 'overclocked' ? 'bg-[#18C6A5] left-[26px]' : 'bg-neutral-600 left-1'}"></div>
                        </button>

                        <button aria-label="Settings" onclick={() => $showSettingsModal = true} 
                                class="w-10 h-10 rounded-xl bg-transparent hover:bg-[#111] border border-transparent hover:border-neutral-800 text-neutral-500 hover:text-white flex items-center justify-center transition-colors cursor-pointer hidden sm:flex" title="System Parameters">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c-.94-1.543.826-3.31-2.37-2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        </button>

                        <div class="h-8 w-px bg-neutral-800 hidden sm:block"></div>

                        {#if !$isWalletConnected}
                            <button onclick={() => $showWalletModal = true} class="px-5 md:px-6 py-2.5 md:py-3 bg-[#18C6A5]/10 hover:bg-[#18C6A5]/20 border border-[#18C6A5]/30 text-[#18C6A5] text-[10px] md:text-[11px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer whitespace-nowrap">
                                Connect System
                            </button>
                        {:else}
                            <div class="flex items-center gap-1 md:gap-2 bg-[#111] border border-neutral-800 rounded-xl p-1 pr-2 md:pr-3">
                                <button onclick={copyToClipboard} class="relative bg-[#1a1a1a] rounded-lg px-3 md:px-4 py-1.5 md:py-2 flex items-center gap-2 border border-neutral-800/50 hover:bg-[#222] hover:border-[#18C6A5]/40 cursor-pointer transition-all group">
                                    <div class="w-2 h-2 rounded-full { $globalNodeStatus === 'online' ? 'bg-[#18C6A5] animate-pulse' : $globalNodeStatus === 'unreachable' ? 'bg-amber-500' : 'bg-neutral-600' } shrink-0"></div>
                                    <span class="{ $globalNodeStatus === 'online' ? 'text-[#18C6A5]' : $globalNodeStatus === 'unreachable' ? 'text-amber-500' : 'text-neutral-500' } font-mono text-[10px] md:text-[11px] font-bold truncate max-w-[80px] md:max-w-none group-hover:text-white transition-colors">
                                        {$walletAddress?.substring(0,10)}...{$walletAddress?.substring($walletAddress.length-4)}
                                    </span>
                                
                                    {#if showCopyToast}
                                        <div class="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-[#0a0a0a] border border-[#18C6A5]/50 rounded-md text-[#18C6A5] text-[9px] uppercase tracking-widest whitespace-nowrap">
                                            Copied
                                        </div>
                                    {/if}
                                </button>
                                <button aria-label="Disconnect" onclick={disconnectWallet} class="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer rounded-xl shrink-0" title="Disconnect">
                                    <svg class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                                </button>
                            </div>
                        {/if}
                    </div>
                </div>
            </header>

            <nav class="h-14 bg-black flex justify-center w-full z-40 shrink-0 hide-scrollbar">
                <div class="w-full max-w-[1600px] px-4 lg:px-10 flex items-center justify-start overflow-x-auto h-full hide-scrollbar">
                    <div class="flex gap-6 sm:gap-10 h-full min-w-max items-center">
                        {#each tabs as tab}
                            <button onclick={() => $activeTab = tab} 
                                    class="relative h-full px-2 {tab === 'DEX' ? 'text-[10px] md:text-[11px]' : 'text-[11px] md:text-sm'} font-bold tracking-[0.15em] uppercase transition-all duration-300 whitespace-nowrap { $activeTab === tab ? 'text-[#18C6A5]' : 'text-neutral-500 hover:text-white cursor-pointer hover:bg-[#111]' } rounded-lg my-1">
                                {tab}
                                {#if $activeTab === tab}
                                    <div class="absolute bottom-0 left-0 w-full h-[2px] bg-[#18C6A5]"></div>
                                {/if}
                            </button>
                        {/each}
                    </div>
                </div>
            </nav>
            
            <main class="flex-1 overflow-y-auto relative pb-24 mt-4">
                <div class="w-full h-full relative z-10">
                    {@render children()}
                </div>
            </main>
        </div>
    {/if}
</div>

<WalletModal />
<SettingsModal />

<style>
    .app-wrapper {
        transition: background-color 2.5s ease-in-out, box-shadow 2.5s ease-in-out, filter 0.3s ease-out;
    }
    
    .app-wrapper.dormant {
        background-color: #000000;
    }

    .app-wrapper.glow-active {
        background-color: #000000; 
    }
</style>