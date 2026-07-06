<script lang="ts">
    // Temporary Override: High-Fidelity Mock Data for Prototype Visualization
    
    // --- OMNI-CHAIN STATE ---
    let activeNetwork = $state('CITADELLE');

    const baseNetworks = {
        KAS: {
            name: 'Kaspa',
            color: '#14b8a6', // Teal
            symbol: '₭',
            tokens: [
                { ticker: 'KAS', name: 'Native Kaspa', balance: 4500000, price: 0.15, icon: 'K' },
                { ticker: 'KSPR', name: 'Kasper Token', balance: 12500000, price: 0.008, icon: 'KS' },
                { ticker: 'NACHO', name: 'Nacho the Kat', balance: 85000000, price: 0.0004, icon: 'N' }
            ]
        },
        BTC: {
            name: 'Bitcoin',
            color: '#f7931a', // Orange
            symbol: '₿',
            tokens: [
                { ticker: 'BTC', name: 'Native Bitcoin', balance: 18.5, price: 64200.00, icon: 'B' },
                { ticker: 'ORDI', name: 'Ordinals', balance: 2450, price: 38.50, icon: 'O' },
                { ticker: 'SATS', name: 'Sats', balance: 150000000, price: 0.0002, icon: 'S' }
            ]
        },
        ETH: {
            name: 'Ethereum',
            color: '#627eea', // Blue/Purple
            symbol: 'Ξ',
            tokens: [
                { ticker: 'ETH', name: 'Native Ethereum', balance: 420.5, price: 3450.00, icon: 'E' },
                { ticker: 'USDC', name: 'USD Coin', balance: 850000, price: 1.00, icon: '$' },
                { ticker: 'UNI', name: 'Uniswap', balance: 12500, price: 9.85, icon: 'U' }
            ]
        },
        SOL: {
            name: 'Solana',
            color: '#14F195', // Neon Green
            symbol: '◎',
            tokens: [
                { ticker: 'SOL', name: 'Native Solana', balance: 8500, price: 142.00, icon: 'S' },
                { ticker: 'JUP', name: 'Jupiter', balance: 450000, price: 0.85, icon: 'J' },
                { ticker: 'PYTH', name: 'Pyth Network', balance: 320000, price: 0.35, icon: 'P' }
            ]
        }
    };

    // Aggregate all tokens and sort by USD value for the combined view
    const allTokens = Object.values(baseNetworks)
        .flatMap(network => network.tokens)
        .sort((a, b) => (b.balance * b.price) - (a.balance * a.price));

    const networkData = {
        CITADELLE: {
            name: 'Citadelle Synthesis',
            color: '#d4af37', // Sovereign Gold
            symbol: 'Ω',
            tokens: allTokens
        },
        ...baseNetworks
    };

    let activeData = $derived(networkData[activeNetwork as keyof typeof networkData]);
    let activeColor = $derived(activeData.color);
    
    let activeColorRgb = $derived(
        activeNetwork === 'KAS' ? '20, 184, 166' :
        activeNetwork === 'BTC' ? '247, 147, 26' :
        activeNetwork === 'ETH' ? '98, 126, 234' :
        activeNetwork === 'SOL' ? '20, 241, 149' :
        '212, 175, 55' // Sovereign Gold RGB
    );

    // Calculate total net worth across the currently selected view
    let networkNetWorth = $derived.by(() => {
        return activeData.tokens.reduce((acc, token) => acc + (token.balance * token.price), 0);
    });

    // --- LIQUIDITY FORECASTING ENGINE ---
    let lpTokenA = $state(0); 
    let lpTokenB = $state(1);
    let projectionYears = $state(3);
    let apyAssumption = $state(24.5); 
    
    // Auto-adjust selected tokens if network switches and array bounds change
    $effect(() => {
        if (activeNetwork) {
            lpTokenA = 0;
            lpTokenB = 1;
        }
    });

    let selectedTokenA = $derived(activeData.tokens[lpTokenA]);
    let selectedTokenB = $derived(activeData.tokens[lpTokenB]);

    // Simulated LP Position (Assuming user provides 25% of their holding into the pool)
    let lpPrincipalUsd = $derived(
        selectedTokenA && selectedTokenB ? 
        (selectedTokenA.balance * selectedTokenA.price * 0.25) + (selectedTokenB.balance * selectedTokenB.price * 0.25) : 0
    );

    let projectedFutureValue = $derived.by(() => {
        let rate = apyAssumption / 100;
        let months = projectionYears * 12;
        let futureValue = lpPrincipalUsd;
        for (let i = 0; i < months; i++) {
            futureValue = futureValue * (1 + rate / 12);
        }
        return futureValue;
    });

    let totalProfit = $derived(projectedFutureValue - lpPrincipalUsd);

    // --- DYNAMIC SVG CHART GENERATOR (LP TRAJECTORY) ---
    let chartPath = $derived.by(() => {
        const width = 800;
        const height = 250;
        let points = [];
        let principal = lpPrincipalUsd;
        let rate = apyAssumption / 100;
        let months = projectionYears * 12;
        let maxVal = projectedFutureValue || 1; 
        
        for (let i = 0; i <= months; i++) {
            const x = (i / months) * width;
            let currentVal = principal;
            for (let m = 0; m < i; m++) {
                currentVal = currentVal * (1 + rate / 12);
            }
            const y = height - ((currentVal / maxVal) * height) + 10;
            points.push({x, y});
        }

        if (points.length === 0) return '';
        let d = `M ${points[0].x},${points[0].y}`;
        for (let i = 1; i < points.length - 1; i++) {
            const xc = (points[i].x + points[i + 1].x) / 2;
            const yc = (points[i].y + points[i + 1].y) / 2;
            d += ` Q ${points[i].x},${points[i].y} ${xc},${yc}`;
        }
        d += ` L ${points[points.length - 1].x},${points[points.length - 1].y}`;
        return d;
    });

    let areaPath = $derived(`${chartPath} L 800,280 L 0,280 Z`);
</script>

<div class="w-full h-full p-4 lg:p-8 flex flex-col gap-6 animate-[fade-in_1s_ease-out] overflow-y-auto hide-scrollbar" style="--theme-color: {activeColor}; --theme-color-rgb: {activeColorRgb};">
    
    <!-- OMNI-CHAIN DOCK (TOP NAVIGATION) -->
    <div class="flex flex-wrap gap-4 border-b border-neutral-800/80 pb-6 items-center justify-between z-20">
        <div class="flex flex-wrap gap-2 bg-[#0a0a0a] border border-neutral-800 p-1.5 rounded-xl shadow-lg">
            {#each Object.entries(networkData) as [key, data]}
                <button 
                    onclick={() => activeNetwork = key}
                    class="relative px-4 lg:px-6 py-2.5 rounded-lg text-xs font-bold tracking-widest uppercase transition-all duration-300"
                    style="color: {activeNetwork === key ? '#fff' : '#666'}; background: {activeNetwork === key ? '#151515' : 'transparent'};"
                >
                    <span class="relative z-10 flex items-center gap-2">
                        {#if activeNetwork === key}
                            <div class="w-2 h-2 rounded-full shadow-glow-theme animate-pulse" style="background: var(--theme-color);"></div>
                        {/if}
                        {#if key === 'CITADELLE'}
                            <span class="font-black text-sm" style="color: {activeNetwork === key ? 'var(--theme-color)' : 'inherit'};">Ω</span>
                        {/if}
                        {data.name}
                    </span>
                    {#if activeNetwork === key}
                        <div class="absolute inset-0 rounded-lg border border-theme/30 bg-theme/5 shadow-inner-theme" style="border-color: var(--theme-color); opacity: 0.5;"></div>
                    {/if}
                </button>
            {/each}
        </div>
        
        <div class="text-right mt-4 lg:mt-0">
            <p class="text-neutral-500 text-[10px] tracking-widest uppercase mb-1">
                {activeNetwork === 'CITADELLE' ? 'Global Aggregate Value' : `${activeData.name} Vault Value`}
            </p>
            <p class="text-3xl font-black text-white tracking-tighter drop-shadow-theme">
                <span style="color: var(--theme-color); opacity: 0.8;">$</span>{networkNetWorth.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </p>
        </div>
    </div>

    <!-- MAIN GRID -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        
        <!-- ASSET INVENTORY (LEFT 4 COLS) -->
        <div class="lg:col-span-4 flex flex-col gap-4">
            <div class="bg-[#050505] border border-neutral-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden h-[600px] flex flex-col">
                <div class="absolute top-0 right-0 w-48 h-48 rounded-full blur-[80px] pointer-events-none opacity-10 transition-colors duration-500" style="background: var(--theme-color);"></div>
                
                <h3 class="text-neutral-500 text-[10px] font-bold tracking-[0.2em] uppercase mb-6 flex justify-between items-center">
                    <span>{activeData.name} Ecosystem</span>
                    <span style="color: var(--theme-color); text-shadow: 0 0 10px rgba(var(--theme-color-rgb), 0.5);">{activeData.tokens.length} Assets</span>
                </h3>
                
                <div class="flex flex-col gap-3 flex-1 overflow-y-auto hide-scrollbar pr-2">
                    {#each activeData.tokens as token}
                        <div class="flex justify-between items-center bg-[#0a0a0a] border border-neutral-800/80 p-4 rounded-xl hover:border-theme transition-all group relative cursor-pointer" style="--hover-border: rgba(var(--theme-color-rgb), 0.4);">
                            <div class="absolute inset-0 bg-theme/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" style="background: var(--theme-color); mix-blend-mode: overlay;"></div>
                            
                            <div class="flex items-center gap-4 relative z-10">
                                <div class="w-10 h-10 rounded-full flex items-center justify-center font-black text-lg border border-neutral-700 shadow-md group-hover:shadow-glow-theme transition-all duration-300" style="background: #111; color: var(--theme-color);">
                                    {token.icon}
                                </div>
                                <div>
                                    <p class="text-white font-bold tracking-wider text-sm">{token.ticker}</p>
                                    <p class="text-neutral-500 text-[10px] uppercase tracking-widest mt-0.5">{token.name}</p>
                                </div>
                            </div>
                            <div class="text-right relative z-10">
                                <p class="text-white font-mono text-sm">{token.balance.toLocaleString('en-US', {maximumFractionDigits: 4})}</p>
                                <p class="text-xs font-mono mt-1 opacity-80" style="color: var(--theme-color);">${(token.balance * token.price).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        </div>

        <!-- LIQUIDITY FORECASTING ENGINE (RIGHT 8 COLS) -->
        <div class="lg:col-span-8 flex flex-col gap-4">
            <div class="bg-[#050505] border border-neutral-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden h-[600px] flex flex-col">
                <div class="absolute bottom-0 left-1/2 -translate-x-1/2 w-[80%] h-32 rounded-[100%] blur-[100px] pointer-events-none opacity-10 transition-colors duration-500" style="background: var(--theme-color);"></div>

                <!-- FORECASTER HEADER -->
                <div class="flex flex-col md:flex-row justify-between items-start mb-6 z-10 gap-6 border-b border-neutral-800/60 pb-6">
                    <div>
                        <h3 class="text-neutral-500 text-[10px] font-bold tracking-[0.2em] uppercase">Liquidity Pairing Projection</h3>
                        <div class="flex flex-wrap items-center gap-4 mt-4">
                            
                            <select bind:value={lpTokenA} class="bg-[#0a0a0a] border border-neutral-700 text-white text-xs font-bold tracking-widest p-2.5 rounded-lg outline-none focus:border-theme transition-colors cursor-pointer" style="--tw-ring-color: {activeColor};">
                                {#each activeData.tokens as token, i}
                                    <option value={i}>{token.ticker}</option>
                                {/each}
                            </select>
                            
                            <span class="text-neutral-600 font-black">×</span>
                            
                            <select bind:value={lpTokenB} class="bg-[#0a0a0a] border border-neutral-700 text-white text-xs font-bold tracking-widest p-2.5 rounded-lg outline-none focus:border-theme transition-colors cursor-pointer">
                                {#each activeData.tokens as token, i}
                                    <option value={i}>{token.ticker}</option>
                                {/each}
                            </select>
                            
                            <span class="ml-2 text-[10px] text-neutral-500 uppercase tracking-widest bg-neutral-900 px-2 py-1 rounded border border-neutral-800">50/50 Pool (25% Cap)</span>
                        </div>
                    </div>

                    <div class="text-left md:text-right">
                        <p class="text-neutral-500 text-[10px] tracking-widest uppercase mb-1">Projected LP Value</p>
                        <p class="text-4xl font-black text-white tracking-tight drop-shadow-theme">
                            ${projectedFutureValue.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                        </p>
                        <p class="text-xs font-mono mt-1 opacity-80 font-bold" style="color: var(--theme-color);">
                            +{totalProfit.toLocaleString('en-US', {maximumFractionDigits: 0})} NET PROFIT
                        </p>
                    </div>
                </div>

                <!-- DYNAMIC TRAJECTORY CHART -->
                <div class="flex-1 w-full relative min-h-[200px] z-10 mb-6">
                    <svg class="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 800 300">
                        <defs>
                            <linearGradient id="lineGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stop-color="var(--theme-color)" stop-opacity="0.3" />
                                <stop offset="100%" stop-color="var(--theme-color)" stop-opacity="1" />
                            </linearGradient>
                            <linearGradient id="areaFill" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stop-color="var(--theme-color)" stop-opacity="0.25" />
                                <stop offset="100%" stop-color="var(--theme-color)" stop-opacity="0" />
                            </linearGradient>
                        </defs>
                        
                        <g class="stroke-neutral-800/40 stroke-[1]" stroke-dasharray="4 4">
                            <line x1="0" y1="50" x2="800" y2="50" />
                            <line x1="0" y1="125" x2="800" y2="125" />
                            <line x1="0" y1="200" x2="800" y2="200" />
                        </g>

                        <path d={areaPath} fill="url(#areaFill)" class="transition-all duration-700 ease-in-out" />
                        <path d={chartPath} fill="none" stroke="url(#lineGlow)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="transition-all duration-700 ease-in-out drop-shadow-theme-heavy" />
                    </svg>
                </div>

                <!-- COMPOUNDING MATRICES CONTROLS -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8 z-10 bg-[#0a0a0a]/50 p-6 rounded-xl border border-neutral-800/50">
                    <div class="flex flex-col gap-4">
                        <div class="flex justify-between items-center">
                            <label class="text-[9px] text-neutral-400 tracking-[0.2em] uppercase font-bold">Horizon</label>
                            <span class="text-white font-mono text-xs bg-neutral-900 px-3 py-1.5 rounded border border-neutral-800">{projectionYears} YEARS</span>
                        </div>
                        <input type="range" min="1" max="10" bind:value={projectionYears} class="custom-slider w-full" />
                    </div>

                    <div class="flex flex-col gap-4">
                        <div class="flex justify-between items-center">
                            <label class="text-[9px] text-neutral-400 tracking-[0.2em] uppercase font-bold">Yield Assumption (APY)</label>
                            <span class="font-mono text-xs px-3 py-1.5 rounded font-bold transition-colors duration-500" style="color: var(--theme-color); background: rgba(var(--theme-color-rgb), 0.1); border: 1px solid rgba(var(--theme-color-rgb), 0.3);">{apyAssumption}%</span>
                        </div>
                        <input type="range" min="1" max="150" step="0.5" bind:value={apyAssumption} class="custom-slider w-full" />
                    </div>
                </div>

            </div>
        </div>
    </div>
</div>

<style>
    @keyframes fade-in { 0% { opacity: 0; transform: scale(0.99); } 100% { opacity: 1; transform: scale(1); } }
    
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

    /* Dynamic Theme Shadows based on CSS variables */
    .shadow-glow-theme { box-shadow: 0 0 15px var(--theme-color); }
    .drop-shadow-theme { text-shadow: 0 0 20px rgba(var(--theme-color-rgb), 0.3); }
    .drop-shadow-theme-heavy { filter: drop-shadow(0 0 12px rgba(var(--theme-color-rgb), 0.8)); }
    .hover\:border-theme:hover { border-color: var(--hover-border) !important; }
    .focus\:border-theme:focus { border-color: var(--theme-color) !important; }

    /* Custom Premium Sliders */
    .custom-slider {
        -webkit-appearance: none;
        background: #1a1a1a;
        height: 6px;
        border-radius: 3px;
        outline: none;
        border: 1px solid #222;
        box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);
    }
    
    .custom-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #fff;
        cursor: pointer;
        border: 2px solid var(--theme-color);
        box-shadow: 0 0 15px rgba(var(--theme-color-rgb), 0.6);
        transition: transform 0.1s;
    }

    .custom-slider::-webkit-slider-thumb:hover {
        transform: scale(1.2);
    }
    
    select option {
        background: #0a0a0a;
        color: #fff;
    }
</style>