<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { fade, fly } from 'svelte/transition';
    import { globalKasPrice } from '$lib/stores/app';
    import { isWalletConnected, activeWalletType, sovereignKeys } from '$lib/stores/wallet';

    let isLoading = $state(false);
    let estate = $state<any>(null);
    let error = $state<string | null>(null);
    let fetchInterval: ReturnType<typeof setInterval>;

    // Placeholder Fiat Prices for non-KAS assets (Replace with Oracle later)
    const STATIC_PRICES: Record<string, number> = {
        BTC: 65200.00,
        ETH: 3450.00,
        SOL: 145.20
    };

    // Myst-like Forecasting Panel State
    let projectedMonths = $state(12);
    let estimatedHashrate = $state(50); // TH/s
    let networkDifficulty = $state(1.5);
    
    // Auto-calculates projection based on live market price
    let projectedYield = $derived(
        ((estimatedHashrate / networkDifficulty) * projectedMonths * 1250 * $globalKasPrice).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    );

    let totalTreasuryUsd = $derived(
        estate ? estate.assets.reduce((acc: number, asset: any) => {
            const price = asset.symbol === 'KAS' ? $globalKasPrice : (STATIC_PRICES[asset.symbol] || 0);
            return acc + (asset.balance * price);
        }, 0) : 0
    );

    // Derived flag to strictly enforce the UI lock
    let isVaultDecrypted = $derived($isWalletConnected && $activeWalletType === 'sovereign' && $sovereignKeys !== null);

    function copyText(text: string) { 
        if (typeof navigator !== 'undefined') navigator.clipboard.writeText(text); 
    }

    async function fetchTreasuryData() {
        // Enforce Sovereign Unlock Requirement
        if (!isVaultDecrypted) {
            estate = null;
            return;
        }

        if (!estate) isLoading = true;

        try {
            const keys = $sovereignKeys;
            const params = new URLSearchParams({
                kas: keys.kaspa?.address || '',
                btc: keys.bitcoin?.address || '',
                eth: keys.ethereum?.address || '',
                sol: keys.solana?.address || ''
            });

            const res = await fetch(`/api/treasury/corporate?${params.toString()}`);
            if (!res.ok) {
                const errData = await res.json().catch(() => null);
                throw new Error(errData?.error || `HTTP ${res.status}: Failed to sync with Omni-Chain Proxy.`);
            }
            estate = await res.json();
            error = null;
        } catch (err: any) {
            error = err.message;
        } finally {
            isLoading = false;
        }
    }

    // Reactive trigger if connection state changes while on page
    $effect(() => {
        if (isVaultDecrypted) {
            if (!estate && !isLoading) fetchTreasuryData();
        } else {
            estate = null;
        }
    });

    onMount(() => {
        if (isVaultDecrypted) fetchTreasuryData();
        // ⚡ Expanded to 15000ms to prevent immediate rate-limiting from the 4 Public RPCs
        fetchInterval = setInterval(() => {
            if (isVaultDecrypted) fetchTreasuryData();
        }, 15000);
    });

    onDestroy(() => {
        if (fetchInterval) clearInterval(fetchInterval);
    });

    function formatTime(isoString: string) {
        if (!isoString) return '';
        const d = new Date(isoString);
        return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
</script>

<div class="w-full h-full flex flex-col gap-6 font-mono p-4 lg:p-8 bg-[#030303] relative" in:fade={{ duration: 300 }}>
    
    <!-- UI ENFORCEMENT: BRUTALIST LOCK SCREEN -->
    {#if !isVaultDecrypted}
        <div class="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#050505] p-6 text-center">
            <div class="w-24 h-24 border-2 border-neutral-800 flex items-center justify-center rounded-none mb-6 bg-[#0a0a0a]">
                <svg class="w-10 h-10 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="square" stroke-linejoin="miter" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
            </div>
            <h2 class="text-3xl md:text-4xl font-black uppercase tracking-[0.2em] text-neutral-500 mb-4">TREASURY LOCKED: DECRYPT VAULT TO VIEW LIQUIDITY</h2>
        </div>
    {/if}

    <div class="flex items-center justify-between border-b-2 border-neutral-900 pb-4 shrink-0 bg-[#0a0a0a] p-4 transition-opacity duration-500 {!isVaultDecrypted ? 'opacity-10 pointer-events-none' : 'opacity-100'}">
        <div>
            <h2 class="text-2xl md:text-3xl font-black uppercase tracking-[0.2em] text-white">Corporate Treasury</h2>
            <p class="text-[10px] uppercase tracking-widest text-[#18C6A5] font-bold mt-1">Perennia Holdings, LLC • Immutable Reserve</p>
        </div>
        {#if estate}
            <div class="text-right flex flex-col items-end">
                <span class="text-[9px] text-neutral-500 uppercase tracking-widest mb-1 font-bold">Vault Identity Signature</span>
                <span class="text-xs font-mono font-bold text-black bg-[#18C6A5] px-3 py-1">
                    {estate.masterIdentity}
                </span>
            </div>
        {/if}
    </div>

    <div class="flex-1 flex flex-col transition-opacity duration-500 {!isVaultDecrypted ? 'opacity-10 pointer-events-none' : 'opacity-100'}">
        {#if isLoading && !estate}
            <div class="flex-grow flex flex-col items-center justify-center gap-4 h-[400px]">
                <div class="w-12 h-12 border-4 border-neutral-900 border-t-[#18C6A5] animate-spin"></div>
                <span class="text-xs font-mono text-[#18C6A5] uppercase tracking-widest font-bold">Synchronizing Omni-Chain Ledger...</span>
            </div>
        
        {:else if error && !estate}
            <div class="flex-grow flex flex-col items-center justify-center gap-4 h-[400px] border border-red-900 bg-[#110000]">
                <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="square" stroke-linejoin="miter" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                <span class="text-xs font-mono text-red-500 uppercase tracking-widest font-bold">CRITICAL DESYNC: {error}</span>
            </div>
        
        {:else if estate}
            <div class="w-full bg-[#0a0a0a] border border-neutral-800 overflow-hidden" in:fly={{ y: 20, duration: 400 }}>

                <div class="p-8 lg:p-12 flex flex-col items-center justify-center border-b border-neutral-800 relative z-10 text-center bg-[#050505]">
                    <span class="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 mb-4">Total Superimposed Liquidity</span>
                    <span class="text-6xl md:text-7xl font-mono font-black tracking-tighter text-[#18C6A5]">
                        {totalTreasuryUsd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </span>
                </div>

                <div class="flex flex-col relative z-10 bg-[#0a0a0a]">
                    {#each estate.assets as asset}
                        <div class="flex flex-col md:flex-row md:items-center justify-between p-6 border-b border-neutral-900 hover:bg-[#111] transition-none group">
                            
                            <div class="flex items-center gap-5 mb-4 md:mb-0">
                                <div class="w-3 h-8 border border-neutral-900" style="background-color: {asset.color};"></div>
                                <div class="flex flex-col">
                                    <span class="text-sm font-black uppercase tracking-widest text-white">{asset.name}</span>
                                    <div class="flex items-center gap-3 mt-1.5">
                                        <span class="text-[9px] uppercase tracking-widest text-neutral-500 border border-neutral-800 bg-[#050505] px-2 py-0.5 font-bold">{asset.network}</span>
                                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                                        <!-- svelte-ignore a11y_interactive_supports_focus -->
                                        <div class="flex items-center gap-1.5 text-neutral-600 hover:text-white transition-colors cursor-pointer" onclick={() => copyText(asset.address)} role="button">
                                            <span class="text-[10px] font-mono truncate w-32 md:w-64 text-left select-all">{asset.address}</span>
                                            <span class="font-bold text-[10px]">[COPY]</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="flex flex-col items-start md:items-end pl-6 md:pl-0">
                                <span class="text-2xl font-mono font-black tracking-tight tabular-nums" style="color: {asset.balance > 0 ? asset.color : 'white'}">
                                    {asset.balance.toLocaleString(undefined, {minimumFractionDigits: 4, maximumFractionDigits: 6})}
                                </span>
                                <span class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mt-1">{asset.symbol} Reserve</span>
                            </div>
                        </div>
                    {/each}
                </div>
                
                {#if estate.networkBlocks && estate.networkBlocks.length > 0}
                    <div class="flex flex-col bg-[#050505] border-t border-neutral-800 p-6">
                        <span class="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 mb-4 block">L1 Network Discoveries (Persistent Ledger)</span>
                        <div class="flex flex-col w-full">
                            <div class="grid grid-cols-12 p-3 border-b border-neutral-800 bg-[#0a0a0a] text-[9px] font-bold uppercase tracking-widest text-neutral-600">
                                <div class="col-span-3">Timestamp</div>
                                <div class="col-span-3 text-center">Worker Identity</div>
                                <div class="col-span-2 text-center">Difficulty</div>
                                <div class="col-span-4 text-right">Block Hash</div>
                            </div>
                            {#each estate.networkBlocks as block}
                                <div class="grid grid-cols-12 p-3 border-b border-neutral-900 hover:bg-[#111] transition-none items-center text-[10px] font-mono">
                                    <div class="col-span-3 text-[#18C6A5] font-bold">{formatTime(block.timestamp)}</div>
                                    <div class="col-span-3 text-neutral-400 text-center truncate px-2">{block.worker}</div>
                                    <div class="col-span-2 text-amber-500 text-center">{block.difficulty.toFixed(2)}</div>
                                    <div class="col-span-4 text-neutral-500 text-right truncate" title={block.hash}>{block.hash}</div>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>

            <div class="mt-4 border border-neutral-800 bg-[#0a0a0a] p-8 relative overflow-hidden z-10" in:fly={{ y: 20, duration: 400, delay: 200 }}>
                
                <div class="flex flex-col lg:flex-row justify-between gap-10 relative z-10">
                    <div class="flex-1">
                        <h3 class="text-sm font-black uppercase tracking-[0.15em] text-[#18C6A5] mb-8 border-b border-neutral-900 pb-2 flex items-center gap-3">
                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="square" stroke-linejoin="miter" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                            Global Yield Forecaster
                        </h3>
                        
                        <div class="space-y-8">
                            <div>
                                <div class="flex justify-between text-[10px] uppercase font-bold text-neutral-500 tracking-widest mb-3">
                                    <span>Compound Horizon</span>
                                    <span class="text-white px-2 py-1 bg-[#050505] border border-neutral-800">{projectedMonths} Months</span>
                                </div>
                                <input type="range" min="1" max="60" bind:value={projectedMonths} class="custom-slider w-full">
                            </div>

                            <div>
                                <div class="flex justify-between text-[10px] uppercase font-bold text-neutral-500 tracking-widest mb-3">
                                    <span>Simulated Corporate Hashrate</span>
                                    <span class="text-white px-2 py-1 bg-[#050505] border border-neutral-800">{estimatedHashrate} TH/s</span>
                                </div>
                                <input type="range" min="1" max="1000" bind:value={estimatedHashrate} class="custom-slider w-full">
                            </div>
                        </div>
                    </div>

                    <div class="flex-1 flex flex-col justify-center items-start lg:items-end border-t lg:border-t-0 lg:border-l border-neutral-900 pt-8 lg:pt-0 lg:pl-10">
                        <span class="text-[10px] uppercase tracking-widest text-neutral-500 font-bold mb-3">Projected Fiat Accumulation</span>
                        <div class="text-5xl lg:text-6xl font-mono font-black tracking-tighter text-[#18C6A5]">
                            {projectedYield}
                        </div>
                        <span class="text-xs text-neutral-500 mt-3 font-bold uppercase tracking-widest bg-[#050505] px-2 py-1 border border-neutral-900">Calculated at Live Market Rate (${$globalKasPrice.toFixed(4)})</span>
                        
                        <div class="mt-8 w-full lg:w-auto flex gap-3">
                            <button class="flex-1 lg:flex-none px-6 py-3 bg-[#111] hover:bg-[#1a1a1a] border border-neutral-800 text-[10px] font-bold uppercase tracking-widest text-neutral-400 transition-none cursor-pointer focus:outline-none">
                                Reset Params
                            </button>
                            <button class="flex-[2] lg:flex-none px-8 py-3 bg-[#18C6A5] hover:bg-[#15b093] text-[10px] font-black uppercase tracking-[0.1em] text-black transition-none cursor-pointer border border-[#18C6A5] focus:outline-none">
                                Export Analysis
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
    @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(15px); } 100% { opacity: 1; transform: translateY(0); } }

    .custom-slider {
        -webkit-appearance: none;
        appearance: none;
        background: #111;
        height: 12px;
        border: 1px solid #333;
        outline: none;
    }
    
    .custom-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 20px;
        height: 24px;
        background: #18C6A5;
        cursor: pointer;
        border: 1px solid #000;
    }

    .custom-slider::-webkit-slider-thumb:hover { background: #fff; }
</style>