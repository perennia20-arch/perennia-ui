<script lang="ts">
    import '../app.css';
    import { onMount, onDestroy } from 'svelte';
    import { get } from 'svelte/store';
    import { hasEntered, activeTab, systemMode, globalKasPrice, globalKasChange, globalNetworkHashrate, globalNodeStatus, workers, silos, walletInventory, taxEvents, tokenRegistry } from '$lib/stores/app';        
    import { isWalletConnected, walletAddress, connectWallet, disconnectWallet } from '$lib/stores/wallet';
    
    import EntryView from '$lib/views/EntryView.svelte';
    import SwapView from '$lib/views/SwapView.svelte';
    import OperationsView from '$lib/views/OperationsView.svelte';
    import ForgeView from '$lib/views/ForgeView.svelte';
    import TreasuryView from '$lib/views/TreasuryView.svelte';
    import TaxFortressView from '$lib/views/TaxFortressView.svelte';

    const tabs = ['DEX', 'OPERATIONS', 'FORGE', 'TREASURY', 'TAX FORTRESS'];

    let engineInterval: ReturnType<typeof setInterval>;
    let priceInterval: ReturnType<typeof setInterval>;
    let telemetryInterval: ReturnType<typeof setInterval>;

    async function fetchPriceData() {
        try {
            const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=kaspa&vs_currencies=usd&include_24hr_change=true');
            if (res.ok) {
                const data = await res.json();
                if (data?.kaspa) { globalKasPrice.set(data.kaspa.usd); globalKasChange.set(data.kaspa.usd_24h_change || 0); }
            }
        } catch(e) {}
    }

    async function fetchTelemetryData() {
        if (get(isWalletConnected) && get(walletAddress)) {
            try { 
                const response = await fetch('/api/telemetry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ walletAddress: get(walletAddress), clientWorkers: get(workers) }) }); 
                if (response.ok) {
                    const data = await response.json(); 
                    if (data.success) { 
                        globalNodeStatus.set(data.nodeStatus);
                        
                        // STRICTLY REAL PHYSICAL BALANCES ONLY
                        if (data.livePoolBalance !== undefined) {
                            walletInventory.update(currentInv => {
                                let newInv = [...currentInv];
                                const kasItem = newInv.find(i => i.asset.ticker === 'KAS');
                                if (kasItem) {
                                    kasItem.balance = data.livePoolBalance;
                                    kasItem.usdValue = data.livePoolBalance * get(globalKasPrice);
                                } else {
                                    const kasAsset = tokenRegistry.find(t => t.ticker === 'KAS');
                                    if (kasAsset) {
                                        newInv.push({ asset: kasAsset, balance: data.livePoolBalance, usdValue: data.livePoolBalance * get(globalKasPrice) });
                                    }
                                }
                                return newInv;
                            });
                        }

                        if (data.serverWorkers && data.serverWorkers.length > 0) {
                            workers.update(currentWorkers => {
                                return currentWorkers.map(cw => {
                                    const sw = data.serverWorkers.find((s: any) => s.id === cw.id);
                                    if (sw) return { ...cw, hashRate: sw.hashRate, isOnline: sw.isOnline, ipAddress: sw.ipAddress, hardwareType: sw.hardwareType };
                                    return cw;
                                });
                            });
                        }
                    }
                } else { globalNodeStatus.set('unreachable'); }
            } catch (error) { globalNodeStatus.set('offline'); } 
        }
    }

    async function executeYieldTick() {
        if (!get(isWalletConnected)) return;

        const currentWorkers = get(workers);
        const totalAppHashrate = currentWorkers.reduce((acc, curr) => acc + curr.hashRate, 0);
        globalNetworkHashrate.set(totalAppHashrate);

        try {
            const response = await fetch('/api/settlement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ walletAddress: get(walletAddress), workers: get(workers), silos: get(silos), currentKasPrice: get(globalKasPrice) || 0.16 }) });
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    silos.set(data.updatedSilos);
                    if (data.transactions && data.transactions.length > 0) {
                        walletInventory.update(currentInv => {
                            let newInv = [...currentInv];
                            data.transactions.forEach((tx: any) => {
                                // STRICT ANTI-FLUCTUATION RULE: Do NOT let simulated API add fake KAS to wallet!
                                if (tx.asset.ticker === 'KAS') return; 
                                
                                const existing = newInv.find(i => i.asset.ticker === tx.asset.ticker);
                                if (existing) { existing.balance += tx.amount; existing.usdValue = existing.balance * tx.asset.priceUsd; } 
                                else { newInv.push({ asset: tx.asset, balance: tx.amount, usdValue: tx.usdValueAtTime }); }
                            });
                            return newInv;
                        });
                        taxEvents.update(currentEvents => {
                            const formattedTxs = data.transactions.map((tx: any) => ({ ...tx, timestamp: new Date(tx.timestamp).toLocaleTimeString() }));
                            let updated = [...formattedTxs, ...currentEvents];
                            if (updated.length > 150) updated = updated.slice(0, 150);
                            return updated;
                        });
                    }
                }
            }
        } catch (error) { }
    }

    onMount(() => {
        fetchPriceData();
        fetchTelemetryData();
        priceInterval = setInterval(fetchPriceData, 15000); 
        telemetryInterval = setInterval(fetchTelemetryData, 5000); 
        engineInterval = setInterval(executeYieldTick, 1000); 
    });

    onDestroy(() => {
        clearInterval(priceInterval);
        clearInterval(telemetryInterval);
        clearInterval(engineInterval);
    });
</script>

{#if !$hasEntered}
    <EntryView />
{:else}
    <div class="h-screen w-screen bg-[#050505] text-white flex flex-col font-sans selection:bg-teal-500/30 overflow-hidden animate-[fade-in_1s_ease-out]">
        <header class="h-16 border-b border-neutral-800/80 bg-[#0a0a0a]/95 backdrop-blur-xl px-6 lg:px-10 flex justify-between items-center z-50 shrink-0">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 bg-gradient-to-br from-teal-400 to-teal-600 rounded shadow-[0_0_15px_rgba(20,184,166,0.3)] flex items-center justify-center">
                    <span class="font-black text-black text-lg">P</span>
                </div>
                <span class="font-black tracking-[0.2em] text-xl uppercase text-white drop-shadow-md hidden sm:block">Perennia</span>
            </div>

            <div class="flex items-center gap-4">
                <button aria-label="Toggle Overclocked Mode" onclick={() => $systemMode = $systemMode === 'base' ? 'overclocked' : 'base'} 
                        class="group relative w-12 h-6 bg-[#111] border border-neutral-800 rounded-full cursor-pointer transition-colors overflow-hidden hidden sm:block" title="Toggle Overclocked Mode">
                    <div class="absolute inset-0 bg-teal-500/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div class="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full transition-all duration-300 shadow-sm {$systemMode === 'overclocked' ? 'bg-teal-500 left-[26px] shadow-[0_0_8px_rgba(20,184,166,0.8)]' : 'bg-neutral-600 left-1'}"></div>
                </button>

                <div class="h-8 w-px bg-neutral-800 hidden sm:block"></div>

                {#if !$isWalletConnected}
                    <button onclick={connectWallet} class="px-6 py-2.5 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-400 text-[11px] font-black uppercase tracking-widest rounded-xl shadow-[0_0_15px_rgba(20,184,166,0.1)] transition-all cursor-pointer">
                        Connect Wallet
                    </button>
                {:else}
                    <div class="flex items-center gap-2 bg-[#111] border border-neutral-800 rounded-xl p-1 pr-3">
                        <div class="bg-[#1a1a1a] rounded-lg px-4 py-2 flex items-center gap-2 border border-neutral-800/50">
                            <div class="w-1.5 h-1.5 rounded-full { $globalNodeStatus === 'online' ? 'bg-teal-500 animate-pulse shadow-[0_0_8px_rgba(20,184,166,0.8)]' : $globalNodeStatus === 'unreachable' ? 'bg-amber-500' : 'bg-neutral-600' }"></div>
                            <span class="{ $globalNodeStatus === 'online' ? 'text-teal-400' : $globalNodeStatus === 'unreachable' ? 'text-amber-500' : 'text-neutral-500' } font-mono text-[11px] font-bold">
                                {$walletAddress?.substring(0,6)}...{$walletAddress?.substring($walletAddress.length-4)}
                            </span>
                        </div>
                        <button aria-label="Disconnect" onclick={disconnectWallet} class="w-8 h-8 flex items-center justify-center text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer rounded-lg" title="Disconnect">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                        </button>
                    </div>
                {/if}
            </div>
        </header>

        <nav class="h-12 bg-[#050505] border-b border-neutral-800/60 flex items-center justify-start overflow-x-auto z-40 shrink-0 shadow-inner px-6 lg:px-10 hide-scrollbar">
            <div class="flex gap-4 sm:gap-8 h-full min-w-max">
                {#each tabs as tab}
                    <button onclick={() => $activeTab = tab} 
                            class="relative h-full px-2 text-[10px] md:text-[11px] font-bold tracking-[0.15em] uppercase transition-all duration-300 whitespace-nowrap { $activeTab === tab ? 'text-teal-400' : 'text-neutral-500 hover:text-white cursor-pointer hover:bg-[#111]' }">
                        {tab}
                        {#if $activeTab === tab}
                            <div class="absolute bottom-0 left-0 w-full h-[2px] bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.8)]"></div>
                        {/if}
                    </button>
                {/each}
            </div>
        </nav>
        
        <main class="flex-1 overflow-hidden relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#0a0f1a] via-[#050810] to-[#020305]">
            {#if $activeTab === 'DEX'} <SwapView />
            {:else if $activeTab === 'OPERATIONS'} <OperationsView />
            {:else if $activeTab === 'FORGE'} <ForgeView />
            {:else if $activeTab === 'TREASURY'} <TreasuryView />
            {:else if $activeTab === 'TAX FORTRESS'} <TaxFortressView />
            {/if}
        </main>
    </div>
{/if}

<style>
    @keyframes fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>