<script lang="ts">
    import { fade, slide } from 'svelte/transition';
    import QRCode from 'qrcode';

    let { 
        asset, 
        subAssets = $bindable(), 
        selectedTokens = $bindable(), 
        standardLabel, 
        searchGlobalNetwork,
        activeHoverSegment = $bindable()
    } = $props();

    let isMainOpen = $state(false);
    let isSubOpen = $state(false);
    let isManaging = $state(false);
    let searchQuery = $state('');
    let expandedSubToken = $state<string | null>(null);
    let qrCodeUrl = $state('');
    let isSearching = $state(false);
    let searchError = $state('');

    $effect(() => {
        if (asset.address && !asset.address.includes('Awaiting')) {
            QRCode.toDataURL(asset.address, { margin: 1, color: { dark: '#000000', light: '#ffffff' } })
                .then(url => qrCodeUrl = url).catch(e => console.error(e));
        } else {
            qrCodeUrl = '';
        }
    });

    let filteredSubAssets = $derived(
        subAssets.filter((t: any) => 
            (t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || 
             t.name.toLowerCase().includes(searchQuery.toLowerCase())) && 
            (isManaging || selectedTokens.includes(t.symbol))
        )
    );

    function toggleSelection(symbol: string) {
        if (selectedTokens.includes(symbol)) {
            selectedTokens = selectedTokens.filter((s: string) => s !== symbol);
        } else {
            selectedTokens = [...selectedTokens, symbol];
        }
    }

    function copyNativeAddress(e: Event, address: string) {
        e.stopPropagation(); 
        if (typeof navigator !== 'undefined' && !address.includes('Awaiting')) {
            navigator.clipboard.writeText(address);
        }
    }

    function getExplorerUrl(network: string, address: string) {
        if (!address || address.includes('Awaiting')) return '#';
        switch(network) {
            case 'KAS': return `https://kas.fyi/address/${address}`;
            case 'BTC': return `https://mempool.space/address/${address}`;
            case 'ETH': return `https://etherscan.io/address/${address}`;
            case 'SOL': return `https://solscan.io/account/${address}`;
            case 'DOGE': return `https://blockchair.com/dogecoin/address/${address}`;
            case 'XRP': return `https://xrpscan.com/account/${address}`;
            case 'POL': return `https://polygonscan.com/address/${address}`;
            case 'AVAX': return `https://snowtrace.io/address/${address}`;
            case 'SUI': return `https://suiscan.xyz/mainnet/account/${address}`;
            case 'TRX': return `https://tronscan.org/#/address/${address}`;
            case 'ZEC': return `https://blockchair.com/zcash/address/${address}`;
            default: return '#';
        }
    }

    async function executeSearch() {
        isSearching = true;
        searchError = '';
        try {
            const error = await searchGlobalNetwork(asset.symbol, searchQuery);
            if (error) searchError = error;
            else { searchQuery = ''; isManaging = true; }
        } catch(e) {
            searchError = 'Network error.';
        }
        isSearching = false;
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div 
    class="bg-[#0c0c0c] rounded-[24px] border {isMainOpen ? 'border-neutral-500 shadow-[0_0_20px_rgba(255,255,255,0.05)]' : 'border-neutral-800/80 shadow-xl'} transition-all duration-300 flex flex-col relative overflow-hidden"
    style={activeHoverSegment === asset.symbol ? `border-color: ${asset.hex}50; box-shadow: 0 0 30px ${asset.hex}15;` : ''}
    onmouseenter={() => activeHoverSegment = asset.symbol}
    onmouseleave={() => activeHoverSegment = null}
>
    <!-- L1 MAIN ROW -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div onclick={() => isMainOpen = !isMainOpen} role="button" tabindex="0" class="w-full p-6 flex items-center justify-between cursor-pointer hover:bg-[#111] transition-colors focus:outline-none text-left border-none select-none relative z-10">
        <div class="flex items-center gap-5">
            <div class="w-12 h-12 rounded-xl border border-neutral-800 bg-[#050505] flex items-center justify-center p-2.5 shrink-0 shadow-inner relative overflow-hidden">
                <div class="absolute inset-0 opacity-[0.12]" style="background-color: {asset.hex}"></div>
                {#if asset.icon.startsWith('/') || asset.icon.startsWith('http')}
                    <img src={asset.icon} alt="{asset.symbol} logo" class="w-full h-full object-contain relative z-10" style="filter: drop-shadow(0 0 4px {asset.hex}40);" />
                {:else}
                    <span class="text-xl font-bold relative z-10" style="color: {asset.hex}">{asset.symbol.slice(0, 3)}</span>
                {/if}
            </div>
            <div class="flex flex-col gap-1.5">
                <div class="flex items-center gap-3">
                    <span class="text-sm md:text-base font-medium uppercase tracking-widest text-neutral-200">{asset.name}</span>
                    <span class="text-[8px] font-medium uppercase tracking-widest bg-[#111] border border-neutral-800 text-neutral-400 px-2 py-0.5 rounded-md shadow-inner hidden xl:block">{asset.badge}</span>
                </div>
                <span class="text-[10px] font-medium text-neutral-500 tracking-widest">
                    ${asset.spotPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} 
                    <span class="ml-2 {asset.delta >= 0 ? 'text-[#18C6A5]' : 'text-red-500'} drop-shadow-sm">{asset.delta >= 0 ? '▲' : '▼'} {Math.abs(asset.delta).toFixed(2)}%</span>
                </span>
            </div>
        </div>
        <div class="flex flex-col items-end gap-2.5">
            <span class="text-xl md:text-2xl font-normal tabular-nums tracking-tight text-neutral-200 leading-none">{asset.balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 6})}</span>
            <button aria-label="Copy Address" onclick={(e) => copyNativeAddress(e, asset.address)} class="px-3 py-1 rounded-lg bg-[#050505] border border-neutral-800 hover:border-neutral-500 text-[9px] font-medium uppercase tracking-widest text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer focus:outline-none shrink-0 shadow-sm">
                {asset.address.includes('Awaiting') ? 'Locked' : 'Copy Root'}
            </button>
        </div>
    </div>

    <!-- EXPANDED L1 NETWORK DRAWER -->
    {#if isMainOpen}
        <div transition:slide class="border-t border-neutral-800/50 bg-[#050505] p-6 flex flex-col gap-4 shadow-inner relative z-0">
            <div class="flex items-center justify-between border-b border-neutral-800/80 pb-3 mb-2">
                <span class="text-[9px] uppercase tracking-widest font-medium text-neutral-500">{asset.name} Telemetry</span>
                <a href={getExplorerUrl(asset.symbol, asset.address)} target="_blank" rel="noopener noreferrer" class="text-[9px] uppercase tracking-widest font-bold bg-[#111] hover:bg-[#1a1a1a] border border-neutral-700 hover:border-[#18C6A5] text-[#18C6A5] px-3 py-1 rounded-lg transition-all duration-200 shadow-md flex items-center gap-1.5">
                    <span>Explorer</span>
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                </a>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 {asset.symbol === 'KAS' ? 'xl:grid-cols-3' : ''} gap-4">
                <div class="bg-[#0a0a0a] border border-neutral-800/80 rounded-2xl p-5 flex items-center justify-between shadow-inner min-h-[120px]">
                    <div class="flex flex-col justify-between h-full w-full pr-4">
                        <span class="text-[9px] uppercase tracking-widest font-medium text-neutral-500 mb-2">Inbound Routing</span>
                        <div class="flex flex-col gap-1">
                            <span class="text-[10px] font-bold text-white uppercase tracking-widest">Deposit {asset.symbol}</span>
                            <span class="text-[9px] font-mono text-neutral-500 break-all leading-tight max-w-[180px]">{asset.address}</span>
                        </div>
                    </div>

                    <!-- ⚡ SLEEK DARK QR PLACEHOLDER (NO MORE WHITE BOX) -->
                    <div class="w-[85px] h-[85px] bg-[#050505] border border-neutral-800 rounded-xl p-1 flex items-center justify-center shrink-0 shadow-md relative overflow-hidden">
                        {#if qrCodeUrl && !asset.address.includes('Awaiting')}
                            <img src={qrCodeUrl} alt="QR Code" class="w-full h-full rounded-lg bg-white p-1" style="image-rendering: pixelated;" />
                        {:else}
                            <div class="flex flex-col items-center justify-center text-neutral-600 gap-1">
                                <svg class="w-5 h-5 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                                <span class="text-[7px] uppercase tracking-widest text-neutral-600 font-mono">Locked</span>
                            </div>
                        {/if}
                    </div>
                </div>

                <div class="bg-[#0a0a0a] border border-neutral-800/80 rounded-2xl p-6 flex flex-col justify-center min-h-[120px] gap-3 shadow-inner">
                    <span class="text-[9px] uppercase tracking-widest font-medium text-neutral-500">Security Status</span>
                    <div class="flex justify-between items-center">
                        <span class="text-[10px] font-mono text-neutral-400">Vault Keypair</span>
                        <span class="text-[10px] font-mono font-medium text-neutral-200">24-Word Derived</span>
                    </div>
                    <div class="w-full h-1 bg-[#111] border border-neutral-800 rounded-full overflow-hidden">
                        <div class="h-full w-[100%] transition-all duration-1000 rounded-full" style="background-color: {asset.hex}; box-shadow: 0 0 8px {asset.hex}80;"></div>
                    </div>
                    <span class="text-[8px] font-mono text-neutral-600 uppercase tracking-widest text-right mt-1">Immutable Ledger Synchronized</span>
                </div>
            </div>

            <!-- UNIVERSAL ECOSYSTEM SUB-TOKEN DRAWER -->
            <div class="mt-2 bg-[#0a0a0a] border border-neutral-800/80 rounded-2xl shadow-inner overflow-hidden transition-all duration-300">
                <button onclick={() => {isSubOpen = !isSubOpen; isManaging = false;}} class="w-full p-5 flex items-center justify-between hover:bg-[#111] transition-colors cursor-pointer border-none outline-none">
                    <span class="text-[9px] uppercase tracking-widest font-medium flex items-center gap-2" style="color: {asset.hex}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/></svg>
                        {asset.symbol} Ecosystem Assets ({standardLabel})
                    </span>
                    <svg class="w-4 h-4 text-neutral-500 transform transition-transform duration-300 {isSubOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                </button>

                {#if isSubOpen}
                    <div transition:slide class="border-t border-neutral-800/80 bg-[#080808] p-5 flex flex-col gap-4">
                        <div class="flex items-center gap-3">
                            <div class="relative flex-1">
                                <input type="text" bind:value={searchQuery} placeholder="Search {standardLabel}..." class="w-full bg-[#111] border border-neutral-800 rounded-xl py-2 pl-9 pr-4 text-xs font-mono text-white outline-none focus:border-neutral-500 transition-colors" />
                                <svg class="absolute left-3 top-2.5 w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                            </div>
                            <button onclick={() => isManaging = !isManaging} class="px-4 py-2 bg-[#111] border {isManaging ? 'border-neutral-400 text-white' : 'border-neutral-800 text-neutral-400 hover:text-white'} rounded-xl text-[9px] uppercase tracking-widest font-bold transition-colors cursor-pointer shrink-0">
                                {isManaging ? 'Done' : 'Manage'}
                            </button>
                        </div>

                        <div class="flex flex-col gap-2 mt-1">
                            {#if filteredSubAssets.length === 0}
                                <div class="text-center py-6 flex flex-col items-center justify-center gap-4 border border-dashed border-neutral-800 rounded-xl bg-[#0a0a0a]">
                                    <span class="text-[10px] font-mono text-neutral-600 uppercase tracking-widest">No local tokens match "{searchQuery}"</span>
                                    {#if searchQuery.length > 1}
                                        <button onclick={executeSearch} disabled={isSearching} class="px-5 py-2.5 bg-[#111] hover:bg-[#1a1a1a] border rounded-xl text-[9px] uppercase tracking-widest font-bold transition-all duration-300 cursor-pointer disabled:opacity-50" style="border-color: {asset.hex}; color: {asset.hex};">
                                            {#if isSearching} Querying Global Ledger... {:else} Search Network for "{searchQuery.toUpperCase()}" {/if}
                                        </button>
                                        {#if searchError} <span class="text-red-500 text-[9px]">{searchError}</span> {/if}
                                    {/if}
                                </div>
                            {/if}

                            {#each filteredSubAssets as token}
                                <div class="bg-[#0c0c0c] border border-neutral-800 hover:border-neutral-700 rounded-xl overflow-hidden transition-all duration-300">
                                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                                    <!-- svelte-ignore a11y_interactive_supports_focus -->
                                    <div class="flex items-center justify-between p-3.5 cursor-pointer select-none" onclick={() => isManaging ? toggleSelection(token.symbol) : expandedSubToken = expandedSubToken === token.symbol ? null : token.symbol} role="button" tabindex="0">
                                        <div class="flex items-center gap-4">
                                            <div class="w-9 h-9 rounded-lg bg-[#050505] border border-neutral-800 flex items-center justify-center text-[16px] shadow-inner font-black font-sans" style="color: {token.hex}; box-shadow: inset 0 0 10px {token.hex}15;">{token.icon}</div>
                                            <div class="flex flex-col">
                                                <span class="text-xs font-bold tracking-wider text-white">{token.symbol}</span>
                                                <span class="text-[9px] text-neutral-500 uppercase tracking-widest">{token.name}</span>
                                            </div>
                                        </div>
                                        
                                        <div class="flex items-center gap-5 pr-1">
                                            <div class="flex flex-col items-end">
                                                <span class="text-xs font-mono font-bold text-white">{token.balance.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 4})}</span>
                                                <span class="text-[9px] font-mono text-neutral-500">${(token.balance * token.price).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                                            </div>
                                            {#if isManaging}
                                                <div class="w-8 h-4 rounded-full relative transition-colors {selectedTokens.includes(token.symbol) ? 'bg-neutral-600 border border-neutral-400' : 'bg-[#1a1a1a] border border-neutral-700'}">
                                                    <div class="absolute top-[1px] w-3 h-3 rounded-full transition-all {selectedTokens.includes(token.symbol) ? 'left-[17px] bg-white' : 'left-[1px] bg-neutral-500'}"></div>
                                                </div>
                                            {/if}
                                        </div>
                                    </div>
                                    
                                    {#if !isManaging && expandedSubToken === token.symbol}
                                        <div transition:slide class="border-t border-neutral-800/80 bg-[#111] p-6 shadow-inner">
                                            <div class="flex items-center justify-between border-b border-neutral-800/80 pb-3 mb-4">
                                                <span class="text-[9px] uppercase tracking-widest font-medium text-neutral-500">{token.symbol} Telemetry</span>
                                                <a href={getExplorerUrl(asset.symbol, asset.address)} target="_blank" rel="noopener noreferrer" class="text-[8px] uppercase tracking-widest font-bold bg-[#1a1a1a] hover:bg-[#222] border border-neutral-700 hover:border-white text-neutral-200 px-2.5 py-1 rounded-md transition-all duration-200 flex items-center gap-1 shadow-sm">
                                                    <span>Explorer</span>
                                                    <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                                                </a>
                                            </div>

                                            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                                <div class="bg-[#0a0a0a] border border-neutral-800/80 rounded-2xl p-5 flex items-center justify-between shadow-inner min-h-[120px]">
                                                    <div class="flex flex-col justify-between h-full w-full pr-4">
                                                        <span class="text-[9px] uppercase tracking-widest font-medium text-neutral-500 mb-2">Inbound Routing</span>
                                                        <div class="flex flex-col gap-1">
                                                            <span class="text-[10px] font-bold text-white uppercase tracking-widest">Deposit {token.symbol}</span>
                                                            <span class="text-[9px] font-mono text-neutral-500 break-all leading-tight max-w-[150px]">{asset.address}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div class="bg-[#0a0a0a] border border-neutral-800/80 rounded-2xl p-6 flex flex-col justify-center min-h-[120px] gap-3 shadow-inner">
                                                    <span class="text-[9px] uppercase tracking-widest font-medium text-neutral-500">Silo Telemetry</span>
                                                    <div class="flex justify-between items-center">
                                                        <span class="text-[10px] font-mono text-neutral-400">DEX Volume Accredited</span>
                                                        <span class="text-[10px] font-mono font-medium" style="color: {asset.hex}">{token.siloVolume.toLocaleString(undefined, {maximumFractionDigits: 0})} {token.symbol}</span>
                                                    </div>
                                                </div>

                                                <div class="bg-[#0a0a0a] border border-neutral-800/80 rounded-2xl p-6 flex flex-col justify-center min-h-[120px] gap-3 shadow-inner">
                                                    <span class="text-[9px] uppercase tracking-widest font-medium text-neutral-500">{asset.symbol} Tokenomics</span>
                                                    <div class="flex justify-between items-center mb-1">
                                                        <span class="text-[10px] font-mono text-neutral-400">Max Supply</span>
                                                        <span class="text-[10px] font-mono font-medium text-neutral-200">{token.supply > 0 ? token.supply.toLocaleString() : 'Fetching...'}</span>
                                                    </div>
                                                    <div class="flex justify-between items-center">
                                                        <span class="text-[10px] font-mono text-neutral-400">Circulating</span>
                                                        <span class="text-[10px] font-mono font-medium text-neutral-200">{token.minted > 0 ? token.minted.toLocaleString() : 'Fetching...'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
</div>