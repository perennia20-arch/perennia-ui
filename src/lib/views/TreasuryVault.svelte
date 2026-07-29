<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { globalKasPrice, globalKasChange } from '$lib/stores/app';
    import { isWalletConnected, activeWalletType, sovereignKeys } from '$lib/stores/wallet';
    
    // ⚡ Svelte 5: 2-State Drawer expansion tracker
    let expandedDrawer = $state<string | null>(null);

    // Live State 
    let estate = $state<any>(null);
    let isLoading = $state(false);

    // Real-Time Oracle Market Data
    let btcPrice = $state(64500.00); let btcDelta = $state(0);
    let ethPrice = $state(3450.00);  let ethDelta = $state(0);
    let solPrice = $state(145.00);   let solDelta = $state(0);

    // Strict UI Enforcement: Vault must be decrypted to view actual treasury metrics
    let isVaultDecrypted = $derived($isWalletConnected && $activeWalletType === 'sovereign' && $sovereignKeys !== null);

    // ⚡ Svelte 5 Derived: Real-Time Oracle & Backend Merged Matrix
    let assets = $derived.by(() => {
        const kasBal = estate?.assets?.find((a: any) => a.symbol === 'KAS')?.balance || 0;
        const btcBal = estate?.assets?.find((a: any) => a.symbol === 'BTC')?.balance || 0;
        const ethBal = estate?.assets?.find((a: any) => a.symbol === 'ETH')?.balance || 0;
        const solBal = estate?.assets?.find((a: any) => a.symbol === 'SOL')?.balance || 0;

        const kasAddr = estate?.assets?.find((a: any) => a.symbol === 'KAS')?.address || $sovereignKeys?.kaspa?.address || 'Awaiting Decryption';
        const btcAddr = estate?.assets?.find((a: any) => a.symbol === 'BTC')?.address || $sovereignKeys?.bitcoin?.address || 'Awaiting Decryption';
        const ethAddr = estate?.assets?.find((a: any) => a.symbol === 'ETH')?.address || $sovereignKeys?.ethereum?.address || 'Awaiting Decryption';
        const solAddr = estate?.assets?.find((a: any) => a.symbol === 'SOL')?.address || $sovereignKeys?.solana?.address || 'Awaiting Decryption';

        return [
            { symbol: 'KAS', icon: '/assets/tokens/kas.svg', name: 'Kaspa', badge: 'KAS [L1]', spotPrice: $globalKasPrice || 0, delta: $globalKasChange || 0, balance: kasBal, address: kasAddr, hex: '#18C6A5' },
            { symbol: 'BTC', icon: '/assets/tokens/btc.svg', name: 'Bitcoin', badge: 'BTC [COLD]', spotPrice: btcPrice, delta: btcDelta, balance: btcBal, address: btcAddr, hex: '#F7931A' },
            { symbol: 'ETH', icon: '/assets/tokens/eth.svg', name: 'Ethereum', badge: 'ETH [ERC20]', spotPrice: ethPrice, delta: ethDelta, balance: ethBal, address: ethAddr, hex: '#627EEA' },
            { symbol: 'SOL', icon: '/assets/tokens/sol.svg', name: 'Solana', badge: 'SOL [NATIVE]', spotPrice: solPrice, delta: solDelta, balance: solBal, address: solAddr, hex: '#14F195' }
        ];
    });

    let totalVaultValue = $derived(
        assets.reduce((sum, asset) => sum + (asset.balance * asset.spotPrice), 0)
    );

    function toggleDrawer(symbol: string) {
        expandedDrawer = expandedDrawer === symbol ? null : symbol;
    }

    function copyNativeAddress(e: Event, address: string) {
        e.stopPropagation(); 
        if (typeof navigator !== 'undefined') navigator.clipboard.writeText(address);
    }

    // ⚡ REAL-TIME ORACLE: Fetch true market prices
    async function fetchExternalPrices() {
        try {
            const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true');
            if (res.ok) {
                const data = await res.json();
                if (data.bitcoin) { btcPrice = data.bitcoin.usd; btcDelta = data.bitcoin.usd_24h_change || 0; }
                if (data.ethereum) { ethPrice = data.ethereum.usd; ethDelta = data.ethereum.usd_24h_change || 0; }
                if (data.solana) { solPrice = data.solana.usd; solDelta = data.solana.usd_24h_change || 0; }
            }
        } catch (e) {
            console.error("Oracle fetch failed:", e);
        }
    }

    // ⚡ NETWORK LEDGER: Fetch true asset balances
    async function fetchTreasuryData() {
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
            if (res.ok) {
                estate = await res.json();
            }
        } catch (err: any) {
            console.error("Network Fetch Error:", err);
        } finally {
            isLoading = false;
        }
    }

    let fetchInterval: ReturnType<typeof setInterval>;
    let priceInterval: ReturnType<typeof setInterval>;

    $effect(() => {
        if (isVaultDecrypted && !estate && !isLoading) {
            fetchTreasuryData();
        } else if (!isVaultDecrypted) {
            estate = null;
        }
    });

    onMount(() => {
        fetchExternalPrices();
        priceInterval = setInterval(fetchExternalPrices, 15000);
        
        if (isVaultDecrypted) fetchTreasuryData();
        fetchInterval = setInterval(() => {
            if (isVaultDecrypted) fetchTreasuryData();
        }, 15000);
    });

    onDestroy(() => {
        if (fetchInterval) clearInterval(fetchInterval);
        if (priceInterval) clearInterval(priceInterval);
    });
</script>

<div class="w-full h-full min-h-[100dvh] bg-[#050505] text-neutral-300 font-mono flex flex-col items-center pb-12 overflow-y-auto animate-[fade-in-up_0.3s_ease-out] relative">
    
    <!-- BRUTALIST LOCK SCREEN -->
    {#if !isVaultDecrypted}
        <div class="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#050505] p-6 text-center">
            <div class="w-24 h-24 border-2 border-neutral-800 flex items-center justify-center rounded-2xl mb-6 bg-[#0a0a0a] shadow-inner">
                <svg class="w-10 h-10 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
            </div>
            <h2 class="text-2xl md:text-4xl font-medium uppercase tracking-[0.2em] text-neutral-500 mb-4">TREASURY LOCKED:<br/>DECRYPT VAULT TO VIEW LIQUIDITY</h2>
        </div>
    {/if}

    <div class="w-full max-w-4xl p-4 lg:p-8 flex flex-col gap-6 transition-opacity duration-500 {!isVaultDecrypted ? 'opacity-10 pointer-events-none' : 'opacity-100'}">
        
        <!-- 1. TOP: GLOWING HERO CARD (Operations Style) -->
        <div class="bg-[#0a0a0a] border border-neutral-800/50 rounded-[32px] p-10 flex flex-col items-center justify-center text-center shadow-2xl mb-2 relative overflow-hidden">
            <div class="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none"></div>
            
            <span class="text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-500 mb-4 flex items-center gap-2 relative z-10">
                <div class="w-1.5 h-1.5 bg-[#18C6A5] rounded-full animate-pulse shadow-[0_0_8px_rgba(24,198,165,0.8)]"></div>
                Total Vault Portfolio Value
            </span>
            
            <span class="text-5xl md:text-7xl tracking-tighter text-neutral-200 tabular-nums relative z-10 drop-shadow-[0_0_10px_rgba(255,255,255,0.05)]">
                {totalVaultValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
            </span>
        </div>

        <!-- 2. MIDDLE: STACKED ASSET ROWS -->
        <div class="flex flex-col gap-4">
            {#each assets as asset}
                <div class="bg-[#0c0c0c] rounded-[24px] border {expandedDrawer === asset.symbol ? 'border-neutral-500 shadow-[0_0_20px_rgba(255,255,255,0.05)]' : 'border-neutral-800/80 hover:border-neutral-700 shadow-xl'} transition-all duration-300 flex flex-col relative overflow-hidden">
                    
                    <!-- STATE 1: COLLAPSED ROW -->
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_interactive_supports_focus -->
                    <div onclick={() => toggleDrawer(asset.symbol)} role="button" class="w-full p-6 flex items-center justify-between cursor-pointer hover:bg-[#111] transition-colors focus:outline-none text-left border-none select-none relative z-10">
                        <div class="flex items-center gap-5">
                            
                            <!-- ⚡ NEW: SVG ICON INTEGRATION -->
                            <div class="w-12 h-12 rounded-xl border border-neutral-800 bg-[#050505] flex items-center justify-center p-2.5 shrink-0 shadow-inner relative overflow-hidden">
                                <div class="absolute inset-0 opacity-[0.12]" style="background-color: {asset.hex}"></div>
                                <img src={asset.icon} alt="{asset.symbol} logo" class="w-full h-full object-contain relative z-10" style="filter: drop-shadow(0 0 4px {asset.hex}40);" />
                            </div>
                            
                            <div class="flex flex-col gap-1.5">
                                <div class="flex items-center gap-3">
                                    <span class="text-sm md:text-base font-medium uppercase tracking-widest text-neutral-200">{asset.name}</span>
                                    <span class="text-[8px] font-medium uppercase tracking-widest bg-[#111] border border-neutral-800 text-neutral-400 px-2 py-0.5 rounded-md shadow-inner">
                                        {asset.badge}
                                    </span>
                                </div>
                                <span class="text-[10px] font-medium text-neutral-500 tracking-widest">
                                    ${asset.spotPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} 
                                    <span class="ml-2 {asset.delta >= 0 ? 'text-[#18C6A5]' : 'text-red-500'} drop-shadow-sm">
                                        {asset.delta >= 0 ? '▲' : '▼'} {Math.abs(asset.delta).toFixed(2)}%
                                    </span>
                                </span>
                            </div>
                        </div>

                        <div class="flex flex-col items-end gap-2.5">
                            <span class="text-xl md:text-2xl font-normal tabular-nums tracking-tight text-neutral-200 leading-none">
                                {asset.balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 6})}
                            </span>
                            <button aria-label="Copy Address" onclick={(e) => copyNativeAddress(e, asset.address)} class="px-3 py-1 rounded-lg bg-[#050505] border border-neutral-800 hover:border-neutral-500 text-[9px] font-medium uppercase tracking-widest text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer focus:outline-none shrink-0 shadow-sm">
                                Copy Root
                            </button>
                        </div>
                    </div>

                    <!-- STATE 2: EXPANDED DRAWER -->
                    {#if expandedDrawer === asset.symbol}
                        <div class="border-t border-neutral-800/50 bg-[#050505] p-6 flex flex-col gap-4 animate-[fade-in-down_0.2s_ease-out] shadow-inner relative z-0">
                            <div class="flex items-center justify-between border-b border-neutral-800/80 pb-3 mb-2">
                                <span class="text-[9px] uppercase tracking-widest font-medium text-neutral-500">Asset Network Telemetry</span>
                                <span class="text-[8px] uppercase tracking-widest font-medium bg-[#111] border border-neutral-800 text-neutral-300 px-2 py-0.5 rounded-md">Nexus Framework</span>
                            </div>
                            
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div class="bg-[#0a0a0a] border border-dashed border-neutral-800/80 rounded-2xl hover:border-neutral-600 transition-colors p-6 flex flex-col items-center justify-center text-center min-h-[120px] cursor-pointer group shadow-inner">
                                    <svg class="w-6 h-6 text-neutral-600 group-hover:text-neutral-300 transition-colors mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                                    <span class="text-[10px] font-medium uppercase tracking-widest text-neutral-500 group-hover:text-neutral-300 transition-colors mb-1">Mint Synthetic Assets</span>
                                    <span class="text-[9px] font-mono text-neutral-600 leading-relaxed">Route Forge Payloads Here</span>
                                </div>

                                <div class="bg-[#0a0a0a] border border-neutral-800/80 rounded-2xl p-6 flex flex-col justify-center min-h-[120px] gap-3 shadow-inner">
                                    <span class="text-[9px] uppercase tracking-widest font-medium text-neutral-500">ASIC Worker Telemetry</span>
                                    <div class="flex justify-between items-center">
                                        <span class="text-[10px] font-mono text-neutral-400">Yield Hashrate</span>
                                        <span class="text-[10px] font-mono font-medium text-neutral-200">0.00 TH/s</span>
                                    </div>
                                    <div class="w-full h-1 bg-[#111] border border-neutral-800 rounded-full overflow-hidden">
                                        <div class="h-full w-[0%] transition-all duration-1000 rounded-full" style="background-color: {asset.hex}; box-shadow: 0 0 8px {asset.hex}80;"></div>
                                    </div>
                                    <span class="text-[8px] font-mono text-neutral-600 uppercase tracking-widest text-right mt-1">Awaiting Stratum Broadcasts</span>
                                </div>
                            </div>
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    </div>
</div>

<style>
    @keyframes fade-in-up { 
        0% { opacity: 0; transform: translateY(10px); } 
        100% { opacity: 1; transform: translateY(0); } 
    }
    @keyframes fade-in-down { 
        0% { opacity: 0; transform: translateY(-10px); } 
        100% { opacity: 1; transform: translateY(0); } 
    }
</style>