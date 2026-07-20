<script lang="ts">
    import { onMount } from 'svelte';
    import { fade, fly } from 'svelte/transition';
    import { globalKasPrice } from '$lib/stores/app';

    let isLoading = $state(true);
    let estate = $state<any>(null);
    let error = $state<string | null>(null);

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
            // For now, only KAS is wired to the live oracle, others calculate at $0
            const price = asset.symbol === 'KAS' ? $globalKasPrice : 0;
            return acc + (asset.balance * price);
        }, 0) : 0
    );

    function copyText(text: string) { 
        navigator.clipboard.writeText(text); 
    }

    onMount(async () => {
        try {
            const res = await fetch('/api/treasury/corporate');
            if (!res.ok) throw new Error("Failed to sync with Corporate Treasury RPC.");
            estate = await res.json();
        } catch (err: any) {
            error = err.message;
        } finally {
            isLoading = false;
        }
    });
</script>

<div class="w-full h-full flex flex-col gap-6 font-sans p-4 lg:p-8" in:fade={{ duration: 300 }}>
    
    <div class="flex items-center justify-between border-b border-neutral-900 pb-4 shrink-0">
        <div>
            <h2 class="text-2xl md:text-3xl font-black uppercase tracking-[0.2em] text-white drop-shadow-md">Corporate Treasury</h2>
            <p class="text-[10px] uppercase tracking-widest text-teal-500 font-bold mt-1">Perennia Holdings, LLC • Immutable Reserve</p>
        </div>
        {#if estate}
            <div class="text-right flex flex-col items-end">
                <span class="text-[9px] text-neutral-500 uppercase tracking-widest mb-1">Vault Identity Signature</span>
                <span class="text-xs font-mono text-teal-500 bg-teal-900/10 px-3 py-1 border border-teal-900/50">
                    {estate.masterIdentity}
                </span>
            </div>
        {/if}
    </div>

    {#if isLoading}
        <div class="flex-grow flex flex-col items-center justify-center gap-4 h-[400px]">
            <div class="w-12 h-12 border-2 border-teal-900/30 border-t-teal-500 rounded-full animate-spin"></div>
            <span class="text-xs font-mono text-teal-500/80 uppercase tracking-widest animate-pulse">Synchronizing Omni-Chain Ledger...</span>
        </div>
    
    {:else if error}
        <div class="flex-grow flex flex-col items-center justify-center gap-4 h-[400px] border border-red-900/30 bg-red-900/5 rounded-2xl">
            <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="square" stroke-linejoin="miter" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            <span class="text-xs font-mono text-red-500 uppercase tracking-widest">{error}</span>
        </div>
    
    {:else if estate}
        <div class="w-full bg-[#0a0a0a] border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl relative" in:fly={{ y: 20, duration: 400 }}>
            <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-teal-500/5 rounded-full blur-[120px] pointer-events-none"></div>

            <div class="p-8 lg:p-12 flex flex-col items-center justify-center border-b border-neutral-800/80 relative z-10 text-center">
                <span class="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 mb-4">Total Superimposed Liquidity</span>
                <span class="text-6xl md:text-7xl font-mono font-light tracking-tighter text-teal-400 drop-shadow-[0_0_20px_rgba(20,184,166,0.3)]">
                    {totalTreasuryUsd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                </span>
            </div>

            <div class="flex flex-col relative z-10 bg-[#0c0c0c]">
                {#each estate.assets as asset, index}
                    <div class="flex flex-col md:flex-row md:items-center justify-between p-6 border-b border-neutral-800/50 hover:bg-[#111] transition-colors group">
                        
                        <div class="flex items-center gap-5 mb-4 md:mb-0">
                            <div class="w-1.5 h-8 rounded-full shadow-[0_0_10px_currentColor]" style="background-color: {asset.color}; color: {asset.color};"></div>
                            <div class="flex flex-col">
                                <span class="text-sm font-black uppercase tracking-widest text-white group-hover:text-teal-400 transition-colors">{asset.name}</span>
                                <div class="flex items-center gap-3 mt-1.5">
                                    <span class="text-[9px] uppercase tracking-widest text-neutral-500 border border-neutral-800 bg-[#0a0a0a] px-2 py-0.5 rounded">{asset.network}</span>
                                    <div class="flex items-center gap-1.5 text-neutral-600 hover:text-white transition-colors cursor-pointer" onclick={() => copyText(asset.address)} role="button" tabindex="0">
                                        <span class="text-[10px] font-mono truncate w-32 md:w-64">{asset.address}</span>
                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="square" stroke-linejoin="miter" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="flex flex-col items-start md:items-end pl-6 md:pl-0">
                            <span class="text-2xl font-mono font-bold text-white tracking-tight">
                                {asset.balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 4})}
                            </span>
                            <span class="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mt-1">{asset.symbol} Reserve</span>
                        </div>
                    </div>
                {/each}
            </div>
        </div>

        <div class="mt-4 border border-neutral-800 bg-[#0a0a0a] rounded-3xl p-8 relative overflow-hidden shadow-2xl" in:fly={{ y: 20, duration: 400, delay: 200 }}>
            <div class="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9IiMzMzMiLz48L3N2Zz4=')] opacity-[0.03] pointer-events-none"></div>
            
            <div class="flex flex-col lg:flex-row justify-between gap-10 relative z-10">
                <div class="flex-1">
                    <h3 class="text-sm font-black uppercase tracking-[0.15em] text-teal-500 mb-8 flex items-center gap-3">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="square" stroke-linejoin="miter" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                        Global Yield Forecaster
                    </h3>
                    
                    <div class="space-y-8">
                        <div>
                            <div class="flex justify-between text-[10px] uppercase font-bold text-neutral-400 tracking-widest mb-3">
                                <span>Compound Horizon</span>
                                <span class="text-white px-2 py-1 bg-neutral-900 rounded border border-neutral-800">{projectedMonths} Months</span>
                            </div>
                            <input type="range" min="1" max="60" bind:value={projectedMonths} class="custom-slider w-full">
                        </div>

                        <div>
                            <div class="flex justify-between text-[10px] uppercase font-bold text-neutral-400 tracking-widest mb-3">
                                <span>Simulated Corporate Hashrate</span>
                                <span class="text-white px-2 py-1 bg-neutral-900 rounded border border-neutral-800">{estimatedHashrate} TH/s</span>
                            </div>
                            <input type="range" min="1" max="1000" bind:value={estimatedHashrate} class="custom-slider w-full">
                        </div>
                    </div>
                </div>

                <div class="flex-1 flex flex-col justify-center items-start lg:items-end border-t lg:border-t-0 lg:border-l border-neutral-800/80 pt-8 lg:pt-0 lg:pl-10">
                    <span class="text-[10px] uppercase tracking-widest text-neutral-500 font-bold mb-3">Projected Fiat Accumulation</span>
                    <div class="text-5xl lg:text-6xl font-mono font-light tracking-tighter text-teal-400 drop-shadow-[0_0_20px_rgba(20,184,166,0.3)]">
                        {projectedYield}
                    </div>
                    <span class="text-xs text-neutral-500 mt-3 font-bold uppercase tracking-widest">Calculated at Live Market Rate (${$globalKasPrice.toFixed(4)})</span>
                    
                    <div class="mt-8 w-full lg:w-auto flex gap-3">
                        <button class="flex-1 lg:flex-none px-6 py-3 bg-[#111] hover:bg-[#1a1a1a] border border-neutral-800 hover:border-neutral-600 text-[10px] font-bold uppercase tracking-widest text-neutral-400 transition-all cursor-pointer rounded-xl">
                            Reset Params
                        </button>
                        <button class="flex-[2] lg:flex-none px-8 py-3 bg-[#18C6A5]/10 hover:bg-[#18C6A5]/20 border border-[#18C6A5]/30 text-[10px] font-black uppercase tracking-[0.1em] text-[#18C6A5] transition-all cursor-pointer rounded-xl shadow-[0_0_15px_rgba(24,198,165,0.1)]">
                            Export Analysis
                        </button>
                    </div>
                </div>
            </div>
        </div>
    {/if}
</div>

<style>
    .custom-slider {
        -webkit-appearance: none;
        background: #1a1a1a;
        height: 8px;
        border-radius: 4px;
        outline: none;
        border: 1px solid #222;
    }
    
    .custom-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #111;
        cursor: pointer;
        border: 2px solid #14b8a6;
        box-shadow: 0 0 15px rgba(20, 184, 166, 0.4);
        transition: transform 0.1s;
    }

    .custom-slider::-webkit-slider-thumb:hover { transform: scale(1.15); background: #14b8a6; }
</style>