<script lang="ts">
    import { isWalletConnected, walletAddress } from '$lib/stores/wallet';
    import { onMount, onDestroy } from 'svelte';
    import { walletInventory, globalStats, workers, plants } from '$lib/stores/app';

    // ==========================================
    // REAL DATA ENGINE (NO SIMULATIONS)
    // ==========================================
    let networkHashrate = $state(0.00);
    let kasPrice = $state(0.00);
    let isAutoCompounding = $derived($plants.some(p => p.autoCompound));

    // ==========================================
    // THE FORECASTING ALGORITHM (Pure Math)
    // ==========================================
    // Approx USD yield calculation based on Hashrate and Oracle Pricing
    let baseMonthlyYieldUsd = $derived(networkHashrate > 0 ? (networkHashrate * 850 * kasPrice) : 0); 
    
    // Trajectory 1: Base Limit Yield
    let projectionBase = $derived.by(() => {
        let currentBalance = $walletInventory.reduce((sum, item) => sum + item.usdValue, 0);
        let dataPoints = [];
        for (let month = 0; month <= 12; month++) {
            dataPoints.push(currentBalance);
            currentBalance += baseMonthlyYieldUsd;
        }
        return dataPoints;
    });

    // Trajectory 2: Plant Auto-Compounding
    let projectionCompound = $derived.by(() => {
        let currentBalance = $walletInventory.reduce((sum, item) => sum + item.usdValue, 0);
        let dataPoints = [];
        for (let month = 0; month <= 12; month++) {
            dataPoints.push(currentBalance);
            let monthlyGrowth = baseMonthlyYieldUsd * (1 + (18.5 / 100) / 12); // 18.5% APR
            currentBalance = (currentBalance + monthlyGrowth) * 1.015; // compound effect
        }
        return dataPoints;
    });

    // Trajectory 3: PER Token Network Growth
    let projectionPerGrowth = $derived.by(() => {
        let currentBalance = $walletInventory.reduce((sum, item) => sum + item.usdValue, 0);
        let dataPoints = [];
        for (let month = 0; month <= 12; month++) {
            dataPoints.push(currentBalance);
            let monthlyGrowth = baseMonthlyYieldUsd * (1 + (32.0 / 100) / 12); // PER Super Growth
            currentBalance = (currentBalance + monthlyGrowth) * 1.03; // network effect
        }
        return dataPoints;
    });

    let projected12MonthValue = $derived(isAutoCompounding ? projectionCompound[12] : projectionBase[12]);

    // Custom SVG Bezier Curve Generator
    function buildBezier(data: number[], width: number, height: number): string {
        if (!data || data.length === 0) return '';
        const max = Math.max(...projectionPerGrowth) || 1; // Scale all graphs to the max possible value
        return data.map((val, i) => {
            const x = (i / 12) * width;
            const y = height - (val / max) * height;
            if (i === 0) return `M ${x},${y}`;
            const prevX = ((i - 1) / 12) * width;
            const prevY = height - (data[i-1] / max) * height;
            const cp1x = prevX + (x - prevX) / 2;
            return `C ${cp1x},${prevY} ${cp1x},${y} ${x},${y}`;
        }).join(' ');
    }

    let pathBase = $derived(buildBezier(projectionBase, 1000, 300));
    let pathCompound = $derived(buildBezier(projectionCompound, 1000, 300));
    let pathPerGrowth = $derived(buildBezier(projectionPerGrowth, 1000, 300));

    let pollingInterval: ReturnType<typeof setInterval>;
    let kaspaInterval: ReturnType<typeof setInterval>;

    async function fetchRealData() {
        if (!$isWalletConnected || !$walletAddress) return;
        try {
            const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=kaspa&vs_currencies=usd');
            const data = await res.json();
            if (data?.kaspa) kasPrice = data.kaspa.usd;
        } catch(e) {}
        try { 
            const response = await fetch('/api/telemetry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ walletAddress: $walletAddress, clientWorkers: $workers }) }); 
            const data = await response.json(); 
            if (data.success) { networkHashrate = parseFloat(data.networkPower || "0"); } 
        } catch (error) {} 
    }

    onMount(() => { 
        fetchRealData();
        kaspaInterval = setInterval(fetchRealData, 30000); 
        pollingInterval = setInterval(fetchRealData, 5000); 
    });
    onDestroy(() => { clearInterval(pollingInterval); clearInterval(kaspaInterval); });
</script>

<div class="w-full h-full p-4 md:p-8 overflow-y-auto hide-scrollbar relative">
    <div class="max-w-[2000px] mx-auto pb-24 relative z-10 flex flex-col gap-8">
        
        <div class="animate-[fade-in-up_0.4s_ease-out]">
            <h2 class="text-[11px] font-bold uppercase tracking-widest text-neutral-500 mb-4 border-b border-neutral-800/80 pb-2">Global Protocol State</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div class="bg-[#0c0c0c] border border-neutral-800/80 rounded-2xl p-5 shadow-inner">
                    <h3 class="text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Total Value Locked</h3>
                    <div class="text-2xl font-mono font-light text-white tracking-tight">${$globalStats.totalValueLockedUsd.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                    <span class="text-[8px] text-teal-500 font-bold block mt-1 uppercase tracking-widest">Awaiting Chain Sync</span>
                </div>
                <div class="bg-[#0c0c0c] border border-neutral-800/80 rounded-2xl p-5 shadow-inner">
                    <h3 class="text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Global Active Power</h3>
                    <div class="text-2xl font-mono font-light text-white tracking-tight">0.00 <span class="text-sm text-neutral-600">TH/s</span></div>
                    <span class="text-[8px] text-teal-500 font-bold block mt-1 uppercase tracking-widest">Awaiting Chain Sync</span>
                </div>
                <div class="bg-[#0c0c0c] border border-neutral-800/80 rounded-2xl p-5 shadow-inner">
                    <h3 class="text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1">Perennia Auto-APY</h3>
                    <div class="text-2xl font-mono font-light text-white tracking-tight">0.00%</div>
                    <span class="text-[8px] text-teal-500 font-bold block mt-1 uppercase tracking-widest">Awaiting Chain Sync</span>
                </div>
                <div class="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-teal-900/30 rounded-2xl p-5 shadow-2xl relative overflow-hidden group">
                    <div class="absolute right-0 top-0 w-1/2 h-full bg-[radial-gradient(ellipse_at_right,_var(--tw-gradient-stops))] from-teal-500/10 to-transparent pointer-events-none"></div>
                    <h3 class="text-[9px] font-bold uppercase tracking-widest text-teal-500 mb-1 drop-shadow-[0_0_8px_rgba(20,184,166,0.3)]">Your Live Telemetry</h3>
                    <div class="text-2xl font-mono font-light text-white tracking-tight">
                        {#if !$isWalletConnected} 0.00 <span class="text-sm text-neutral-600">TH/s</span>
                        {:else} {networkHashrate.toFixed(2)} <span class="text-sm text-teal-400 font-bold ml-1">TH/s</span> {/if}
                    </div>
                    <span class="text-[8px] font-bold block mt-1 uppercase tracking-widest {networkHashrate > 0 ? 'text-teal-400 animate-pulse' : 'text-neutral-600'}">{networkHashrate > 0 ? 'PHYSICS SYNCED' : 'WAITING FOR HARDWARE'}</span>
                </div>
            </div>
        </div>

        {#if !$isWalletConnected}
            <div class="w-full bg-[#0a0a0a] border border-neutral-800 rounded-3xl p-12 text-center min-h-[400px] flex flex-col items-center justify-center shadow-inner mt-4">
                <svg class="w-16 h-16 text-neutral-800 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                <h2 class="text-3xl font-black uppercase tracking-[0.2em] text-neutral-600 mb-4">Vault Locked</h2>
                <p class="text-sm font-mono text-neutral-500 uppercase tracking-widest max-w-md">Connect your Web3 Wallet to scan physical inventory and calculate your 12-month wealth trajectory.</p>
            </div>
        {:else}
            <div class="grid grid-cols-1 xl:grid-cols-12 gap-8 animate-[fade-in-up_0.6s_ease-out]">
                
                <div class="xl:col-span-8 flex flex-col gap-6">
                    <div class="w-full bg-[#050505] border border-neutral-800/80 rounded-[32px] p-6 md:p-10 shadow-2xl relative overflow-hidden">
                        
                        <div class="flex flex-col md:flex-row justify-between mb-12 relative z-10 gap-6">
                            <div>
                                <h2 class="text-sm font-bold uppercase tracking-widest text-teal-400 mb-2 drop-shadow-[0_0_10px_rgba(20,184,166,0.4)] flex items-center gap-2"><div class="w-2 h-2 bg-teal-400 rounded-full animate-pulse"></div> Trajectory Forecast</h2>
                                <div class="flex items-end gap-3">
                                    <span class="text-4xl md:text-5xl font-black text-white tracking-tighter">${projected12MonthValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                                    <span class="text-xs font-mono font-bold uppercase tracking-widest text-neutral-500 mb-1.5">Projected 12m Outlook</span>
                                </div>
                            </div>
                            
                            <div class="flex flex-col gap-2 border border-neutral-800 bg-[#0a0a0a] p-3 rounded-xl shadow-inner min-w-[200px]">
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2"><div class="w-2 h-0.5 bg-blue-500"></div><span class="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Base Yield</span></div>
                                    <span class="text-[9px] font-mono text-white">${projectionBase[12]?.toLocaleString(undefined, {maximumFractionDigits:0})}</span>
                                </div>
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2"><div class="w-2 h-0.5 bg-teal-500"></div><span class="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Auto-Compound</span></div>
                                    <span class="text-[9px] font-mono text-white">${projectionCompound[12]?.toLocaleString(undefined, {maximumFractionDigits:0})}</span>
                                </div>
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-2"><div class="w-2 h-0.5 bg-purple-500"></div><span class="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">PER Token Growth</span></div>
                                    <span class="text-[9px] font-mono text-white">${projectionPerGrowth[12]?.toLocaleString(undefined, {maximumFractionDigits:0})}</span>
                                </div>
                            </div>
                        </div>

                        <div class="w-full h-[300px] relative z-0">
                            <div class="absolute inset-0 grid grid-cols-12 gap-0 border-b border-l border-neutral-800/50">
                                {#each Array(12) as _, i}
                                    <div class="border-r border-neutral-800/30 h-full relative">
                                        <span class="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[9px] font-mono text-neutral-600 font-bold">M{i+1}</span>
                                    </div>
                                {/each}
                            </div>
                            
                            {#if networkHashrate > 0}
                                <svg class="w-full h-full absolute inset-0 overflow-visible" preserveAspectRatio="none" viewBox="0 0 1000 300">
                                    <path d={pathBase} fill="none" stroke="#3b82f6" stroke-width="2" stroke-dasharray="4 4" class="opacity-50 sweep-animation" />
                                    <path d={pathCompound} fill="none" stroke="#14b8a6" stroke-width="3" stroke-linecap="round" class="drop-shadow-[0_0_8px_rgba(20,184,166,0.4)] sweep-animation" style="animation-delay: 0.2s;" />
                                    <path d={pathPerGrowth} fill="none" stroke="#a855f7" stroke-width="3" stroke-linecap="round" class="drop-shadow-[0_0_12px_rgba(168,85,247,0.5)] sweep-animation" style="animation-delay: 0.4s;" />
                                    
                                    <path d="{isAutoCompounding ? pathCompound : pathBase} L 1000,300 L 0,300 Z" fill="url(#activeGradient)" class="opacity-20 transition-all duration-1000 ease-out sweep-animation" />
                                    
                                    <defs>
                                        <linearGradient id="activeGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stop-color={isAutoCompounding ? "#14b8a6" : "#3b82f6"} />
                                            <stop offset="100%" stop-color="transparent" />
                                        </linearGradient>
                                    </defs>
                                </svg>
                            {:else}
                                <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-2">
                                    <span class="text-4xl mb-2">📉</span>
                                    <span class="text-[10px] font-mono text-neutral-600 uppercase tracking-widest font-bold border border-neutral-800 bg-[#050505] px-6 py-3 rounded-full shadow-lg">Zero Trajectory Detected</span>
                                    <span class="text-[9px] text-neutral-500 uppercase tracking-widest">Awaiting active hardware yields in operations</span>
                                </div>
                            {/if}
                        </div>
                    </div>
                </div>

                <div class="xl:col-span-4 flex flex-col gap-4">
                    <div class="flex items-center justify-between border-b border-neutral-800/80 pb-2 px-2">
                        <h2 class="text-[11px] font-bold uppercase tracking-widest text-neutral-400">Wallet Inventory</h2>
                        <span class="text-[9px] font-mono text-neutral-600 font-bold">{$walletInventory.length} ASSETS FOUND</span>
                    </div>

                    <div class="w-full border border-neutral-800/50 rounded-2xl bg-[#0a0a0a] overflow-hidden shadow-inner flex-1 flex flex-col min-h-[400px]">
                        {#if $walletInventory.length === 0}
                            <div class="flex-1 flex flex-col items-center justify-center p-8 text-center">
                                <svg class="w-12 h-12 text-neutral-800 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                                <p class="text-[10px] font-mono text-neutral-600 uppercase tracking-widest font-bold">Registry query returned 0 assets</p>
                                <p class="text-[9px] text-neutral-500 uppercase tracking-widest mt-2 max-w-[200px]">Account is empty. Start mining to accumulate assets.</p>
                            </div>
                        {:else}
                            <div class="overflow-y-auto flex-1 p-2">
                                <div class="flex flex-col gap-2">
                                    {#each $walletInventory as item}
                                        <div class="bg-[#111] border border-neutral-800/80 rounded-xl p-4 flex items-center justify-between hover:bg-[#161616] transition-colors group">
                                            <div class="flex items-center gap-3">
                                                <div class="w-8 h-8 rounded-full bg-[#0a0a0a] border border-neutral-700 flex items-center justify-center text-[10px] font-black {item.asset.color}">{item.asset.ticker[0]}</div>
                                                <div class="flex flex-col">
                                                    <span class="text-sm font-bold text-white tracking-widest leading-none mb-1">{item.asset.ticker}</span>
                                                    <span class="text-[8px] font-mono uppercase tracking-widest text-neutral-500">{item.asset.assetClass}</span>
                                                </div>
                                            </div>
                                            <div class="flex flex-col items-end">
                                                <span class="font-mono text-sm text-white font-bold">{item.balance.toLocaleString(undefined, {minimumFractionDigits: 4})}</span>
                                                <span class="text-[10px] font-mono text-emerald-400 font-bold">${item.usdValue.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    </div>
                </div>

            </div>
        {/if}
    </div>
</div>

<style>
    @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(15px); } 100% { opacity: 1; transform: translateY(0); } }
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
    
    .sweep-animation {
        stroke-dasharray: 3000;
        stroke-dashoffset: 3000;
        animation: sweep-draw 2.5s ease-in-out forwards;
    }
    @keyframes sweep-draw {
        to { stroke-dashoffset: 0; }
    }
</style>