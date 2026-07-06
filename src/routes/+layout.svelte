<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<script lang="ts">
    declare global {
        interface Window {
            kasware: any;
        }
    }

    import { PUBLIC_API_BASE_URL } from '$env/static/public';
    import '../app.css';
    import { onMount, onDestroy } from 'svelte';
    import { get } from 'svelte/store';
    import { browser } from '$app/environment';
    import { activeTab, systemMode, globalKasPrice, globalKasChange, globalNetworkHashrate, globalNodeStatus, workers, silos, plants, walletInventory, tokenRegistry } from '$lib/stores/app';        
    import { isWalletConnected, walletAddress, walletBalance, connectWallet, disconnectWallet, restoreSession } from '$lib/stores/wallet';

    let { children } = $props();

    const tabs = ['DEX', 'OPERATIONS', 'FORGE', 'TREASURY', 'TAX FORTRESS'];
    const disabledTabs = []; 

    let priceInterval: ReturnType<typeof setInterval>;
    const BACKEND_BASE = PUBLIC_API_BASE_URL;

    // --- SYSTEM STATE ---
    let isLoaded = $state(false);
    let isServerReachable = $state(true);

    // --- WALLET MODAL STATE ---
    let isWalletModalOpen = $state(false);
    let creationState = $state('idle'); // 'idle' | 'forging' | 'success' | 'error'
    let newIdentity: any = $state(null);
    let forgeError = $state('');

    async function igniteSovereignVault() {
        creationState = 'forging';
        forgeError = '';
        newIdentity = null;

        try {
            const response = await fetch('http://192.168.0.12:5000/api/forge');
            if (!response.ok) throw new Error("Local node un-reachable.");
            
            const data = await response.json();
            
            if (data.success) {
                newIdentity = data.identity;
                creationState = 'success';
            } else {
                throw new Error(data.error || "Cryptographic forge failed.");
            }
        } catch (error: any) {
            console.error("Forge API Error:", error);
            forgeError = error.message || "Failed to communicate with wRPC bridge.";
            creationState = 'error';
        }
    }

    function handleKasWareConnect() {
        connectWallet();
        isWalletModalOpen = false;
    }

    function closeWalletModal() {
        isWalletModalOpen = false;
        setTimeout(() => {
            creationState = 'idle';
            newIdentity = null;
        }, 300); // Reset state after animation
    }

    // --- LIFECYCLE & SYNC ---
    async function loadStateFromServer(address: string | null) {
        if (!browser || !address) return;
        try {
            const res = await fetch(`${BACKEND_BASE}/api/state/${address.toLowerCase()}`);
            if (res.ok) {
                const parsed = await res.json();
                workers.set(parsed.workers || []);
                silos.set(parsed.silos || []);
                if (parsed.plants) plants.set(parsed.plants);
                if (parsed.systemMode) systemMode.set(parsed.systemMode);
                isServerReachable = true;
                setTimeout(() => { isLoaded = true; }, 500);
            } else {
                isServerReachable = false;
            }
        } catch (e) {
            isServerReachable = false;
        } 
    }

    async function saveStateToServer(address: string | null) {
        if (!browser || !address || !isLoaded || !isServerReachable) return;
        try {
            const statePayload = {
                workers: get(workers),
                silos: get(silos),
                plants: get(plants),
                systemMode: get(systemMode)
            };
            await fetch(`${BACKEND_BASE}/api/state/${address.toLowerCase()}`, {
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
                loadStateFromServer($walletAddress);
                syncKasWareState();
            } else if (!$isWalletConnected) {
                isLoaded = false;
                workers.set([]);
                silos.set([]);
                plants.set([]);
                walletInventory.set([]); 
            }
        }
    });

    $effect(() => {
        if (browser && $isWalletConnected && $walletAddress && isLoaded && isServerReachable) {
            saveStateToServer($walletAddress);
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
        if (browser && typeof window !== 'undefined' && window.kasware) {
            try {
                const accounts = await window.kasware.getAccounts();
                if (accounts && accounts.length > 0) {
                    const balance = await window.kasware.getBalance();
                    walletBalance.set((balance.total / 100000000).toString());
                }
            } catch (e) {}
        }
    }

    async function fetchPriceData() {
        try {
            const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=kaspa&vs_currencies=usd&include_24hr_change=true');
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

        if (typeof window !== 'undefined' && window.kasware) {
            window.kasware.on('accountsChanged', (accounts: string[]) => {
                if (accounts && accounts.length > 0) {
                    walletAddress.set(accounts[0]);
                    syncKasWareState();
                } else {
                    disconnectWallet();
                }
            });
            window.kasware.on('networkChanged', () => {
                syncKasWareState();
            });
        }
    });

    onDestroy(() => {
        clearInterval(priceInterval);
    });
</script>

<!-- WALLET AUTHENTICATION MODAL -->
{#if isWalletModalOpen}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onclick={closeWalletModal}></div>
        
        <div class="relative w-full max-w-md bg-[#050505] border border-neutral-800 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden animate-[fade-in-up_0.3s_ease-out]">
            <!-- Header -->
            <div class="p-6 border-b border-neutral-800/60 bg-[#0a0a0a]">
                <div class="flex justify-between items-center">
                    <div>
                        <h2 class="text-white font-black tracking-[0.2em] uppercase text-lg">System Access</h2>
                        <p class="text-teal-500/80 text-[10px] tracking-widest uppercase mt-1">Select Authentication Vector</p>
                    </div>
                    <button onclick={closeWalletModal} class="text-neutral-500 hover:text-white transition-colors">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>
            </div>

            <!-- Body -->
            <div class="p-6">
                {#if creationState === 'idle'}
                    <div class="flex flex-col gap-3">
                        <button onclick={handleKasWareConnect} class="w-full bg-[#111] border border-neutral-800 hover:border-teal-500/50 p-4 rounded-xl flex items-center gap-4 group transition-all duration-300">
                            <div class="w-10 h-10 rounded bg-[#050505] border border-neutral-800 flex items-center justify-center shadow-inner group-hover:shadow-[0_0_15px_rgba(20,184,166,0.2)] transition-shadow">
                                <span class="font-bold text-teal-400">KW</span>
                            </div>
                            <div class="text-left">
                                <p class="text-white font-bold tracking-wide">KasWare</p>
                                <p class="text-neutral-500 text-[10px] uppercase tracking-widest mt-0.5">Browser Extension</p>
                            </div>
                        </button>

                        <button class="w-full bg-[#111] border border-neutral-800 hover:border-teal-500/50 p-4 rounded-xl flex items-center gap-4 group transition-all duration-300">
                            <div class="w-10 h-10 rounded bg-[#050505] border border-neutral-800 flex items-center justify-center shadow-inner group-hover:shadow-[0_0_15px_rgba(20,184,166,0.2)] transition-shadow">
                                <span class="font-bold text-teal-400">P</span>
                            </div>
                            <div class="text-left">
                                <p class="text-white font-bold tracking-wide">Perennia Native</p>
                                <p class="text-neutral-500 text-[10px] uppercase tracking-widest mt-0.5">Sovereign KMS Access</p>
                            </div>
                        </button>
                    </div>

                    <div class="mt-8 pt-6 border-t border-neutral-800/60 text-center">
                        <p class="text-neutral-500 text-[10px] uppercase tracking-widest mb-3">Don't have a sovereign vault?</p>
                        <button onclick={igniteSovereignVault} class="text-teal-400 text-xs font-bold tracking-[0.2em] uppercase hover:text-teal-300 transition-colors border-b border-transparent hover:border-teal-400 pb-1">
                            [ Initialize Bare-Metal Identity ]
                        </button>
                    </div>
                {/if}

                {#if creationState === 'forging'}
                    <div class="py-8 flex flex-col items-center justify-center text-center">
                        <div class="w-12 h-12 rounded-full border-2 border-neutral-800 border-t-teal-500 animate-spin mb-4"></div>
                        <p class="text-teal-400 font-bold tracking-widest uppercase text-sm">Igniting Forge...</p>
                        <p class="text-neutral-500 text-xs mt-2">Generating mathematically pure keypair.</p>
                    </div>
                {/if}

                {#if creationState === 'error'}
                    <div class="py-6 flex flex-col items-center text-center">
                        <div class="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 mb-4 text-xl font-black">!</div>
                        <p class="text-red-400 font-bold tracking-widest uppercase text-sm">Forge Failure</p>
                        <p class="text-neutral-500 text-xs mt-2 px-4">{forgeError}</p>
                        <button onclick={() => creationState = 'idle'} class="mt-6 text-neutral-400 hover:text-white text-xs tracking-widest uppercase border border-neutral-800 px-4 py-2 rounded">Return</button>
                    </div>
                {/if}

                {#if creationState === 'success' && newIdentity}
                    <div class="flex flex-col gap-4 animate-[fade-in_0.5s_ease-out]">
                        <div class="bg-teal-500/10 border border-teal-500/30 p-3 rounded-lg text-center">
                            <p class="text-teal-400 text-[10px] uppercase tracking-widest font-bold">Identity Forged Successfully</p>
                        </div>
                        
                        <div class="bg-[#0a0a0a] border border-neutral-800 p-4 rounded-lg">
                            <p class="text-neutral-500 text-[9px] uppercase tracking-widest mb-1">Public Receive Vector</p>
                            <code class="text-teal-500 text-xs break-all select-all">{newIdentity.publicKey}</code>
                        </div>

                        <div class="bg-[#110505] border border-red-900/30 p-4 rounded-lg">
                            <p class="text-red-500/80 text-[9px] uppercase tracking-widest mb-1 font-bold">Raw Private Key (DO NOT SHARE)</p>
                            <code class="text-neutral-400 text-xs break-all select-all">{newIdentity.privateKey}</code>
                        </div>

                        <button onclick={closeWalletModal} class="w-full bg-teal-500 text-black font-black uppercase tracking-widest text-xs py-3 rounded-lg mt-2 hover:bg-teal-400 transition-colors">
                            I Have Secured My Keys
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<div class="min-h-[100dvh] w-full bg-[#050505] text-white flex flex-col font-sans selection:bg-teal-500/30 overflow-x-hidden animate-[fade-in_1s_ease-out]">
    
    <!-- MAIN HEADER -->
    <header class="h-16 border-b border-neutral-800/80 bg-[#0a0a0a]/95 backdrop-blur-xl flex items-center justify-center z-50 shrink-0 w-full sticky top-0">
        <div class="w-full max-w-[1600px] px-4 lg:px-10 flex justify-between items-center h-full">
            <div class="flex items-center gap-2 md:gap-3 cursor-pointer" onclick={() => window.location.href = '/'}>
                <div class="w-7 h-7 md:w-8 md:h-8 bg-gradient-to-br from-teal-400 to-teal-600 rounded shadow-[0_0_15px_rgba(20,184,166,0.3)] flex items-center justify-center shrink-0">
                    <span class="font-black text-black text-base md:text-lg">P</span>
                </div>
                <div class="flex items-center gap-2 hidden sm:flex h-full">
                    <span class="font-black tracking-[0.2em] text-lg md:text-xl uppercase text-white drop-shadow-md leading-none self-center">Perennia</span>
                    <span class="text-[9px] font-normal text-neutral-500 tracking-widest lowercase self-center mt-0.5 select-none">v4</span>
                </div>
            </div>

            <div class="flex items-center gap-3 md:gap-4">
                <button aria-label="Toggle Overclocked Mode" onclick={() => $systemMode = $systemMode === 'base' ? 'overclocked' : 'base'} 
                        class="group relative w-12 h-6 bg-[#111] border border-neutral-800 rounded-full cursor-pointer transition-colors overflow-hidden hidden sm:block" title="Toggle Overclocked Mode">
                    <div class="absolute inset-0 bg-teal-500/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div class="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full transition-all duration-300 shadow-sm {$systemMode === 'overclocked' ? 'bg-teal-500 left-[26px] shadow-[0_0_8px_rgba(20,184,166,0.8)]' : 'bg-neutral-600 left-1'}"></div>
                </button>

                <div class="h-8 w-px bg-neutral-800 hidden sm:block"></div>

                {#if !$isWalletConnected}
                    <!-- HIJACKED CONNECT WALLET BUTTON -->
                    <button onclick={() => isWalletModalOpen = true} class="px-4 md:px-6 py-2 md:py-2.5 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-400 text-[10px] md:text-[11px] font-black uppercase tracking-widest rounded-xl shadow-[0_0_15px_rgba(20,184,166,0.1)] transition-all cursor-pointer whitespace-nowrap">
                        Connect System
                    </button>
                {:else}
                    <div class="flex items-center gap-1 md:gap-2 bg-[#111] border border-neutral-800 rounded-xl p-1 pr-2 md:pr-3">
                        <div class="bg-[#1a1a1a] rounded-lg px-2 md:px-4 py-1.5 md:py-2 flex items-center gap-2 border border-neutral-800/50">
                            <div class="w-1.5 h-1.5 rounded-full { $globalNodeStatus === 'online' ? 'bg-teal-500 animate-pulse shadow-[0_0_8px_rgba(20,184,166,0.8)]' : $globalNodeStatus === 'unreachable' ? 'bg-amber-500' : 'bg-neutral-600' } shrink-0"></div>
                            <span class="{ $globalNodeStatus === 'online' ? 'text-teal-400' : $globalNodeStatus === 'unreachable' ? 'text-amber-500' : 'text-neutral-500' } font-mono text-[10px] md:text-[11px] font-bold truncate max-w-[80px] md:max-w-none">
                                {$walletAddress?.substring(0,10)}...{$walletAddress?.substring($walletAddress.length-4)}
                            </span>
                        </div>
                        <button aria-label="Disconnect" onclick={disconnectWallet} class="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer rounded-lg shrink-0" title="Disconnect">
                            <svg class="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    </header>

    <nav class="h-12 bg-[#050505] border-b border-neutral-800/60 flex justify-center w-full z-40 shrink-0 shadow-inner hide-scrollbar">
        <div class="w-full max-w-[1600px] px-4 lg:px-10 flex items-center justify-start overflow-x-auto h-full hide-scrollbar">
            <div class="flex gap-4 sm:gap-8 h-full min-w-max items-center">
                {#each tabs as tab}
                    {#if disabledTabs.includes(tab)}
                        <div class="relative h-full flex items-center px-2 cursor-not-allowed group">
                            <span class="text-[9px] md:text-[10px] font-bold tracking-[0.15em] uppercase text-neutral-700 whitespace-nowrap transition-colors group-hover:text-neutral-600">
                                {tab}
                            </span>
                        </div>
                    {:else}
                        <button onclick={() => $activeTab = tab} 
                                class="relative h-full px-2 {tab === 'DEX' ? 'text-[9px] md:text-[10px]' : 'text-[10px] md:text-[11px]'} font-bold tracking-[0.15em] uppercase transition-all duration-300 whitespace-nowrap { $activeTab === tab ? 'text-teal-400' : 'text-neutral-500 hover:text-white cursor-pointer hover:bg-[#111]' }">
                            {tab}
                            {#if $activeTab === tab}
                                <div class="absolute bottom-0 left-0 w-full h-[2px] bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.8)]"></div>
                            {/if}
                        </button>
                    {/if}
                {/each}
            </div>
        </div>
    </nav>
    
    <main class="flex-1 overflow-y-auto relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#0a0f1a] via-[#050810] to-[#020305] pb-24">
        <div class="w-full h-full relative">
            {@render children()}
        </div>
    </main>
</div>

<style>
    @keyframes fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
    @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>