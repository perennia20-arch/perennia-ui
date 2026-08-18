<script lang="ts">
    import { fade, slide } from 'svelte/transition';
    import QRCode from 'qrcode';

    let { 
        asset, 
        subAssets = [], 
        selectedTokens = [], 
        onToggleToken = (symbol: string) => {},
        onDeleteToken = (symbol: string) => {},
        standardLabel = '', 
        searchQuery = '', 
        activeHoverSegment = null, 
        onHover = (val: string | null) => {},
        displayUnit = 'token', 
        timeframe = '24H',
        fiatDecimals = 2, 
        tokenDecimals = 8,
        isManagingNetworks = false,
        isOrganizing = false,
        isNetworkSelected = true,
        onNetworkToggle = () => {},
        autoOpenToken = null
    } = $props();

    let isMainOpen = $state(false);
    let _lastNetworkState = isNetworkSelected;
    
    $effect(() => {
        if (isNetworkSelected !== _lastNetworkState) {
            isMainOpen = isNetworkSelected;
            _lastNetworkState = isNetworkSelected;
        }
    });

    let expandedSubToken = $state<string | null>(null);
    let qrCodeUrl = $state('');
    let isRoutingVisible = $state(false);
    let isSubRoutingVisible = $state(false);

    $effect(() => {
        if (autoOpenToken) {
            isMainOpen = true;
            isRoutingVisible = false;
            expandedSubToken = autoOpenToken;
        }
    });

    $effect(() => {
        if (!expandedSubToken) isSubRoutingVisible = false;
    });

    $effect(() => {
        if (asset?.address && !asset.address.includes('Awaiting')) {
            QRCode.toDataURL(asset.address, { margin: 1, color: { dark: '#000000', light: '#ffffff' }, width: 200 })
                .then(url => qrCodeUrl = url).catch(e => console.error(e));
        } else {
            qrCodeUrl = '';
        }
    });

    function generateSparkline(seed: string, delta: number, width = 64, height = 24) {
        let hash = 0;
        const seedStr = seed || 'KAS';
        for (let i = 0; i < seedStr.length; i++) hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
        const points = [];
        const segments = 15;
        const clampedDelta = Math.max(-20, Math.min(20, delta || 0)); 
        const endY = height/2 - (clampedDelta / 20) * (height/2 - 2); 
        for(let i = 0; i <= segments; i++) {
            const x = (i / segments) * width;
            const progress = i / segments;
            const baseY = (height/2) * (1 - progress) + (endY * progress);
            const noiseStr = Math.sin(hash + i).toString();
            const noise = (parseFloat(noiseStr.substring(noiseStr.length - 2)) / 100 - 0.5) * 8; 
            const damp = Math.sin(progress * Math.PI);
            const y = baseY + (noise * damp);
            points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        }
        return `M ${points.join(' L ')}`;
    }

    let filteredSubAssets = $derived(
        (subAssets || []).filter((t: any) => {
            const contractStr = t.contract ? t.contract.toLowerCase() : '';
            const searchStr = searchQuery.toLowerCase();
            const searchMatch = !searchQuery || 
                t.symbol?.toLowerCase().includes(searchStr) || 
                t.name?.toLowerCase().includes(searchStr) ||
                contractStr.includes(searchStr);
            const visibilityMatch = isManagingNetworks || (selectedTokens || []).includes(t.symbol);
            return searchMatch && visibilityMatch;
        })
    );

    function copyNativeAddress(e: Event, address: string) {
        e.stopPropagation(); 
        if (typeof navigator !== 'undefined' && address && !address.includes('Awaiting')) {
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
</script>

<div 
    class="rounded-[24px] transition-all duration-300 flex flex-col relative overflow-hidden group"
    style="
        background-color: #0c0c0c;
        background-image: radial-gradient(ellipse at left top, {asset.hex}10, transparent 50%);
        box-shadow: 0 8px 32px -8px {asset.hex}15;
        {activeHoverSegment === (asset.symbol || asset.ticker) ? `box-shadow: 0 8px 40px -4px ${asset.hex}25;` : ''}
    "
    onmouseenter={() => onHover(asset.symbol || asset.ticker)}
    onmouseleave={() => onHover(null)}
>
    <!-- MASTER COVER -->
    <div onclick={() => {
        if (isManagingNetworks || isOrganizing) {
            if (isManagingNetworks) onNetworkToggle();
        } else {
            isMainOpen = !isMainOpen;
            if (!isMainOpen) {
                expandedSubToken = null;
                isRoutingVisible = false;
            }
        }
    }} role="button" tabindex="0" class="w-full p-4 md:p-5 flex items-center justify-between gap-4 transition-colors {isManagingNetworks || isOrganizing ? '' : 'cursor-pointer hover:bg-[#111]'} focus:outline-none text-left border-none select-none relative z-10">
        
        <!-- Left Side: Identity & Routing -->
        <div class="flex items-center gap-4 shrink-0">
            {#if isOrganizing && isNetworkSelected}
                <div class="text-neutral-600 flex flex-col gap-1 pr-1 pointer-events-none" transition:slide={{axis: 'x'}}>
                    <div class="w-1 h-1 rounded-full bg-neutral-600"></div>
                    <div class="w-1 h-1 rounded-full bg-neutral-600"></div>
                    <div class="w-1 h-1 rounded-full bg-neutral-600"></div>
                </div>
            {/if}

            <div class="w-12 h-12 rounded-xl bg-[#050505] flex items-center justify-center p-2.5 shrink-0 shadow-inner relative overflow-hidden self-start mt-1">
                <div class="absolute inset-0 opacity-[0.12]" style="background-color: {asset.hex}"></div>
                {#if (asset.icon && (asset.icon.startsWith('/') || asset.icon.startsWith('http'))) || (asset.imgUrl && (asset.imgUrl.startsWith('/') || asset.imgUrl.startsWith('http')))}
                    <img src={asset.icon || asset.imgUrl} alt="{asset.symbol || asset.ticker} logo" class="w-full h-full object-contain relative z-10" style="filter: drop-shadow(0 0 4px {asset.hex}40);" />
                {:else}
                    <span class="text-xl font-bold relative z-10" style="color: {asset.hex}">{(asset.symbol || asset.ticker || 'TOK').slice(0, 3)}</span>
                {/if}
            </div>
            <div class="flex flex-col gap-1.5">
                <div class="flex items-center gap-3">
                    <span class="text-sm md:text-base font-medium uppercase tracking-widest text-neutral-200">{asset.name}</span>
                    <span class="text-[8px] font-medium uppercase tracking-widest bg-[#111] text-neutral-400 px-2 py-0.5 rounded-md shadow-inner hidden xl:block">{asset.badge || asset.type}</span>
                    
                    <!-- ⚡ NEW: Subdued APY Pill next to the Network Badge -->
                    {#if asset.apy}
                        <span class="text-[8px] font-bold uppercase tracking-widest bg-[#18C6A5]/10 text-[#18C6A5] px-2 py-0.5 rounded-md shadow-inner hidden xl:block">{asset.apy}% APY</span>
                    {/if}

                    {#if !isManagingNetworks && !isOrganizing}
                        <div class="flex items-center gap-3 ml-2 border-l border-neutral-800/80 pl-3" onclick={(e) => e.stopPropagation()}>
                            <div class="flex items-center gap-1.5">
                                <span class="text-[8px] font-bold uppercase tracking-widest transition-colors {isRoutingVisible ? 'text-white' : 'text-neutral-500'}">Routing</span>
                                <button aria-label="Toggle Routing" onclick={() => { isRoutingVisible = !isRoutingVisible; if(isRoutingVisible) isMainOpen = true; }} class="w-6 h-3 rounded-full border transition-colors duration-300 relative cursor-pointer focus:outline-none shrink-0" style="background-color: {isRoutingVisible ? `${asset.hex}20` : '#050505'}; border-color: {isRoutingVisible ? `${asset.hex}50` : '#404040'};">
                                    <div class="absolute top-[1px] w-2 h-2 rounded-full transition-all duration-300 shadow-sm" style="background-color: {isRoutingVisible ? asset.hex : '#737373'}; left: {isRoutingVisible ? '13px' : '1px'};"></div>
                                </button>
                            </div>
                            <a href={getExplorerUrl(asset.symbol || asset.ticker, asset.address)} target="_blank" rel="noopener noreferrer" class="text-[8px] uppercase tracking-widest font-bold text-neutral-500 hover:text-[#18C6A5] transition-colors flex items-center gap-1">
                                Explorer
                            </a>
                        </div>
                    {/if}
                </div>
                
                <div class="flex items-center gap-3">
                    <span class="text-[10px] font-medium text-neutral-500 tracking-widest flex items-center gap-1.5">
                        ${(asset.spotPrice || 0).toLocaleString(undefined, {minimumFractionDigits: fiatDecimals, maximumFractionDigits: fiatDecimals})} 
                        <span class="{(asset.delta || 0) >= 0 ? 'text-[#18C6A5]' : 'text-red-500'} drop-shadow-sm">{(asset.delta || 0) >= 0 ? '▲' : '▼'} {Math.abs(asset.delta || 0).toFixed(2)}%</span>
                    </span>
                    <svg class="w-16 h-4 opacity-70" viewBox="0 0 64 24" preserveAspectRatio="none">
                        <path d={generateSparkline(asset.symbol || asset.ticker, asset.delta)} fill="none" stroke="{(asset.delta || 0) >= 0 ? '#18C6A5' : '#ef4444'}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </div>
            </div>
        </div>

        <!-- Right Side: Balances & Staking Breakdown -->
        <div class="flex items-center gap-4 shrink-0">
            <div class="flex flex-col items-end gap-1">
                {#if displayUnit === 'token'}
                    <span class="text-lg md:text-xl font-normal tabular-nums leading-none tracking-tight text-neutral-200">
                        {(asset.totalBalance || 0).toLocaleString(undefined, {minimumFractionDigits: tokenDecimals, maximumFractionDigits: tokenDecimals})} <span class="text-xs font-mono text-neutral-400">{asset.symbol || asset.ticker}</span>
                    </span>
                    <span class="text-[10px] font-mono text-neutral-500 tracking-wider tabular-nums flex items-center gap-1.5">
                        <!-- ⚡ NEW: Staking sub-balance display -->
                        {#if asset.stakedBalance}
                            <span class="text-neutral-600">({asset.stakedBalance.toLocaleString(undefined, {maximumFractionDigits: 2})} Staked)</span>
                        {/if}
                        ≈ ${((asset.totalBalance || 0) * (asset.spotPrice || 0)).toLocaleString(undefined, {minimumFractionDigits: fiatDecimals, maximumFractionDigits: fiatDecimals})}
                    </span>
                {:else}
                    <span class="text-lg md:text-xl font-normal tabular-nums leading-none tracking-tight text-[#18C6A5]">
                        ${((asset.totalBalance || 0) * (asset.spotPrice || 0)).toLocaleString(undefined, {minimumFractionDigits: fiatDecimals, maximumFractionDigits: fiatDecimals})}
                    </span>
                    <span class="text-[10px] font-mono text-neutral-500 tracking-wider tabular-nums flex items-center gap-1.5">
                        <!-- ⚡ NEW: Staking sub-balance display -->
                        {#if asset.stakedBalance}
                            <span class="text-neutral-600">({asset.stakedBalance.toLocaleString(undefined, {maximumFractionDigits: 2})} Staked)</span>
                        {/if}
                        ≈ {(asset.totalBalance || 0).toLocaleString(undefined, {minimumFractionDigits: tokenDecimals, maximumFractionDigits: tokenDecimals})} {asset.symbol || asset.ticker}
                    </span>
                {/if}
            </div>

            {#if isManagingNetworks}
                <div class="pl-4 border-l border-neutral-800/80 flex items-center">
                    <button aria-label="Toggle Network" onclick={(e) => { e.stopPropagation(); onNetworkToggle(); }} class="w-10 h-5 rounded-full relative transition-colors border cursor-pointer focus:outline-none" style="background-color: {isNetworkSelected ? `${asset.hex}20` : '#111'}; border-color: {isNetworkSelected ? `${asset.hex}50` : '#404040'};">
                        <div class="absolute top-[1px] w-4 h-4 rounded-full transition-all shadow-sm" style="background-color: {isNetworkSelected ? asset.hex : '#737373'}; left: {isNetworkSelected ? '22px' : '1px'};"></div>
                    </button>
                </div>
            {/if}
        </div>
    </div>

    <!-- EXPANDED DRAWER CONTENT -->
    {#if isMainOpen && !isManagingNetworks && !isOrganizing}
        <div transition:slide class="px-4 md:px-5 pb-4 md:pb-5 relative z-0 -mt-2">

            <!-- L1 Staking & Accrual Silo -->
            {#if asset.stakedBalance}
                <div transition:slide class="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2 mb-4">
                    <div class="bg-[#050505] rounded-2xl p-6 flex flex-col justify-center min-h-[120px] gap-3 shadow-inner">
                        <span class="text-[9px] uppercase tracking-widest font-medium text-neutral-500">Staking & Yield Telemetry</span>
                        <div class="flex justify-between items-center">
                            <span class="text-[10px] font-mono text-neutral-400">Staked Principal</span>
                            <span class="text-[10px] font-mono font-medium text-white">{(asset.stakedBalance || 0).toLocaleString()} {asset.symbol || asset.ticker}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-[10px] font-mono text-neutral-400">Effective APY</span>
                            <span class="text-[10px] font-mono font-medium text-[#18C6A5]">{asset.apy}% Compounding</span>
                        </div>
                    </div>
                    <div class="bg-[#050505] rounded-2xl p-6 flex flex-col justify-center min-h-[120px] gap-3 shadow-inner">
                        <span class="text-[9px] uppercase tracking-widest font-medium text-neutral-500">Accrual & Cooldown Silo</span>
                        <div class="flex justify-between items-center">
                            <span class="text-[10px] font-mono text-neutral-400">Accrued (Unclaimed)</span>
                            <span class="text-[10px] font-mono font-bold text-[#18C6A5]">+{asset.accruedYield?.toLocaleString(undefined, {minimumFractionDigits: 6, maximumFractionDigits: 6}) || '0.000000'} {asset.symbol || asset.ticker}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-[10px] font-mono text-neutral-400">Strategy / Node</span>
                            <span class="text-[10px] font-mono font-medium text-white truncate max-w-[140px]">{asset.validator || 'Native Sovereign Node'}</span>
                        </div>
                    </div>
                </div>
            {/if}

            <!-- Toggled L1 Inbound Routing / QR Display -->
            {#if isRoutingVisible}
                <div transition:slide class="bg-[#050505] rounded-[20px] p-5 flex flex-col md:flex-row items-center justify-between shadow-inner w-full gap-6 mb-4 mt-2">
                    <div class="flex flex-col justify-center w-full md:w-2/3">
                        <span class="text-[10px] uppercase tracking-widest font-bold text-neutral-500 mb-3">Inbound Routing</span>
                        <span class="text-sm font-bold text-white uppercase tracking-widest mb-1">Deposit {asset.symbol || asset.ticker}</span>
                        <span class="text-sm md:text-lg font-mono text-[#18C6A5] break-all leading-relaxed mb-6 select-all">{asset.address}</span>
                        <button aria-label="Copy Address" onclick={(e) => copyNativeAddress(e, asset.address)} class="w-fit px-8 py-3 rounded-xl bg-[#111] hover:bg-[#222] text-xs font-bold uppercase tracking-widest text-neutral-300 hover:text-white transition-colors cursor-pointer focus:outline-none shadow-sm">
                            {asset.address?.includes('Awaiting') ? 'Locked' : 'Copy Route'}
                        </button>
                    </div>

                    <div class="w-[160px] h-[160px] md:w-[200px] md:h-[200px] bg-[#0c0c0c] rounded-2xl p-3 flex items-center justify-center shrink-0 shadow-xl relative overflow-hidden">
                        {#if qrCodeUrl && !asset.address.includes('Awaiting')}
                            <img src={qrCodeUrl} alt="QR Code" class="w-full h-full rounded-xl bg-white p-2" style="image-rendering: pixelated;" />
                        {:else}
                            <div class="flex flex-col items-center justify-center text-neutral-600 gap-2">
                                <svg class="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                                <span class="text-[10px] uppercase tracking-widest text-neutral-600 font-mono font-bold">Locked</span>
                            </div>
                        {/if}
                    </div>
                </div>
            {/if}

            <!-- Seamless, Indented Sub-Tokens -->
            {#if filteredSubAssets.length > 0}
                <div class="flex flex-col gap-2 pt-1">
                    {#each filteredSubAssets as token}
                        <div class="bg-[#050505] hover:bg-[#0a0a0a] rounded-2xl overflow-hidden transition-all duration-300 group/token ml-8 md:ml-10 shadow-inner">
                            <div class="flex items-center justify-between p-3.5 cursor-pointer select-none" onclick={() => { expandedSubToken = expandedSubToken === token.symbol ? null : token.symbol; }} role="button" tabindex="0">
                                <div class="flex items-center gap-4 self-start">
                                    <div class="w-9 h-9 rounded-lg bg-[#0c0c0c] flex items-center justify-center text-[16px] shadow-inner font-black font-sans mt-1" style="color: {token.hex}; box-shadow: inset 0 0 10px {token.hex}15;">
                                        {#if token.imgUrl}
                                            <img src={token.imgUrl} class="w-5 h-5 object-contain drop-shadow-md" alt={token.symbol} 
                                                    onerror={(e) => (e.currentTarget as HTMLImageElement).style.display='none'} />
                                        {:else}
                                            <span class="text-xs font-black" style="color: {token.hex}">{token.symbol[0]}</span>
                                        {/if}
                                    </div>
                                    <div class="flex flex-col gap-1.5">
                                        <!-- Top Line: Symbol, Badges, Sparkline, Routing & Explorer -->
                                        <div class="flex flex-wrap items-center gap-2 md:gap-2.5">
                                            <span class="text-xs font-bold tracking-wider text-white">{token.symbol}</span>
                                            {#if token.badge}
                                                <span class="text-[8px] bg-[#222] text-neutral-400 px-1.5 py-0.5 rounded shrink-0 uppercase tracking-widest shadow-inner">{token.badge}</span>
                                            {/if}
                                            
                                            <!-- ⚡ Sub-Token Yield Badge -->
                                            {#if token.apy}
                                                <span class="text-[8px] bg-[#18C6A5]/10 text-[#18C6A5] px-1.5 py-0.5 rounded shrink-0 font-bold uppercase tracking-widest shadow-inner">{token.apy}% APY</span>
                                            {/if}

                                            {#if !isManagingNetworks && !isOrganizing}
                                                <div class="flex items-center gap-2.5 ml-1 border-l border-neutral-800/80 pl-2.5" onclick={(e) => e.stopPropagation()}>
                                                    <div class="flex items-center gap-1.5">
                                                        <span class="text-[8px] font-bold uppercase tracking-widest transition-colors {isSubRoutingVisible && expandedSubToken === token.symbol ? 'text-white' : 'text-neutral-500'}">Routing</span>
                                                        <button aria-label="Toggle Routing" onclick={() => { if(expandedSubToken !== token.symbol) { expandedSubToken = token.symbol; isSubRoutingVisible = true; } else { isSubRoutingVisible = !isSubRoutingVisible; } }} class="w-6 h-3 rounded-full border transition-colors duration-300 relative cursor-pointer focus:outline-none shrink-0" style="background-color: {isSubRoutingVisible && expandedSubToken === token.symbol ? `${token.hex}20` : '#0c0c0c'}; border-color: {isSubRoutingVisible && expandedSubToken === token.symbol ? `${token.hex}50` : '#404040'};">
                                                            <div class="absolute top-[1px] w-2 h-2 rounded-full transition-all duration-300 shadow-sm" style="background-color: {isSubRoutingVisible && expandedSubToken === token.symbol ? token.hex : '#737373'}; left: {isSubRoutingVisible && expandedSubToken === token.symbol ? '13px' : '1px'};"></div>
                                                        </button>
                                                    </div>
                                                    <a href={getExplorerUrl(asset.symbol || asset.ticker, asset.address)} target="_blank" rel="noopener noreferrer" class="text-[8px] uppercase tracking-widest font-bold text-neutral-500 hover:text-[#18C6A5] transition-colors flex items-center gap-1">
                                                        Explorer
                                                    </a>
                                                    <button aria-label="Delete Token" onclick={(e) => { e.stopPropagation(); onDeleteToken(token.symbol); }} class="text-neutral-600 hover:text-red-400 transition-colors cursor-pointer ml-1" title="Remove token from vault">
                                                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                                    </button>
                                                </div>
                                            {/if}
                                        </div>
                                        <div class="flex items-center gap-3">
                                            <span class="text-[9px] text-neutral-500 uppercase tracking-widest truncate max-w-[150px]">{token.name}</span>
                                            <svg class="w-10 h-3 opacity-60" viewBox="0 0 64 24" preserveAspectRatio="none">
                                                <path d={generateSparkline(token.symbol, token.price ? (token.price * 100) % 20 - 10 : 0)} fill="none" stroke="{token.hex}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>

                                <div class="flex items-center gap-4 pr-1 self-start mt-1">
                                    <div class="flex flex-col items-end gap-1">
                                        {#if displayUnit === 'token'}
                                            <span class="text-xs font-mono font-bold text-white tabular-nums leading-none">
                                                {(token.balance || 0).toLocaleString(undefined, {minimumFractionDigits: tokenDecimals, maximumFractionDigits: tokenDecimals})} <span class="text-[9px] text-neutral-500">{token.symbol}</span>
                                            </span>
                                            <span class="text-[9px] font-mono text-neutral-500 tabular-nums flex items-center gap-1.5">
                                                <!-- ⚡ NEW: Sub-Token Staking split balance -->
                                                {#if token.stakedBalance}
                                                    <span class="text-neutral-600">({token.stakedBalance.toLocaleString(undefined, {maximumFractionDigits: 2})} Staked)</span>
                                                {/if}
                                                ≈ ${((token.balance || 0) * (token.price || 0)).toLocaleString(undefined, {minimumFractionDigits: fiatDecimals, maximumFractionDigits: fiatDecimals})}
                                            </span>
                                        {:else}
                                            <span class="text-xs font-mono font-bold text-[#18C6A5] tabular-nums leading-none">
                                                ${((token.balance || 0) * (token.price || 0)).toLocaleString(undefined, {minimumFractionDigits: fiatDecimals, maximumFractionDigits: fiatDecimals})}
                                            </span>
                                            <span class="text-[9px] font-mono text-neutral-500 tabular-nums flex items-center gap-1.5">
                                                {#if token.stakedBalance}
                                                    <span class="text-neutral-600">({token.stakedBalance.toLocaleString(undefined, {maximumFractionDigits: 2})} Staked)</span>
                                                {/if}
                                                ≈ {(token.balance || 0).toLocaleString(undefined, {minimumFractionDigits: tokenDecimals, maximumFractionDigits: tokenDecimals})} {token.symbol}
                                            </span>
                                        {/if}
                                    </div>
                                </div>
                            </div>

                            <!-- Expanded Token Telemetry -->
                            {#if expandedSubToken === token.symbol}
                                <div transition:slide class="bg-[#0c0c0c] p-4 shadow-inner">
                                    
                                    {#if isSubRoutingVisible}
                                        <div transition:slide class="bg-[#050505] rounded-[20px] p-5 flex flex-col md:flex-row items-center justify-between shadow-inner w-full gap-6 mb-5">
                                            <div class="flex flex-col justify-center w-full md:w-2/3">
                                                <span class="text-[10px] uppercase tracking-widest font-bold text-neutral-500 mb-3">Inbound Routing</span>
                                                <span class="text-sm font-bold text-white uppercase tracking-widest mb-1">Deposit {token.symbol}</span>
                                                <span class="text-sm md:text-lg font-mono text-[#18C6A5] break-all leading-relaxed mb-6 select-all">{asset.address}</span>
                                                <button aria-label="Copy Address" onclick={(e) => copyNativeAddress(e, asset.address)} class="w-fit px-8 py-3 rounded-xl bg-[#111] hover:bg-[#222] text-xs font-bold uppercase tracking-widest text-neutral-300 hover:text-white transition-colors cursor-pointer focus:outline-none shadow-sm">
                                                    {asset.address?.includes('Awaiting') ? 'Locked' : 'Copy Route'}
                                                </button>
                                            </div>
                                        </div>
                                    {/if}

                                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        <!-- Conditional: Staking Yield OR Standard Contract Data -->
                                        {#if token.stakedBalance}
                                            <div class="bg-[#050505] rounded-2xl p-6 flex flex-col justify-center min-h-[120px] gap-3 shadow-inner">
                                                <span class="text-[9px] uppercase tracking-widest font-medium text-neutral-500">Yield & Protocol Telemetry</span>
                                                <div class="flex justify-between items-center">
                                                    <span class="text-[10px] font-mono text-neutral-400">Staked Principal</span>
                                                    <span class="text-[10px] font-mono font-medium text-white">{(token.stakedBalance || 0).toLocaleString()} {token.symbol}</span>
                                                </div>
                                                <div class="flex justify-between items-center">
                                                    <span class="text-[10px] font-mono text-neutral-400">Effective APY</span>
                                                    <span class="text-[10px] font-mono font-medium text-[#18C6A5]">{token.apy}% Auto-Compounding</span>
                                                </div>
                                            </div>
                                            <div class="bg-[#050505] rounded-2xl p-6 flex flex-col justify-center min-h-[120px] gap-3 shadow-inner">
                                                <span class="text-[9px] uppercase tracking-widest font-medium text-neutral-500">Accrual Silo</span>
                                                <div class="flex justify-between items-center">
                                                    <span class="text-[10px] font-mono text-neutral-400">Accrued (Unclaimed)</span>
                                                    <span class="text-[10px] font-mono font-bold text-[#18C6A5]">+{token.accruedYield?.toLocaleString(undefined, {minimumFractionDigits: 6, maximumFractionDigits: 6}) || '0.000000'} {token.symbol}</span>
                                                </div>
                                                <div class="flex justify-between items-center">
                                                    <span class="text-[10px] font-mono text-neutral-400">Smart Contract</span>
                                                    <span class="text-[10px] font-mono font-medium text-neutral-500 truncate max-w-[140px]">{token.contract || 'Protocol Vault'}</span>
                                                </div>
                                            </div>
                                        {:else}
                                            <div class="bg-[#050505] rounded-2xl p-6 flex flex-col justify-center min-h-[120px] gap-3 shadow-inner">
                                                <span class="text-[9px] uppercase tracking-widest font-medium text-neutral-500">Contract Telemetry</span>
                                                <div class="flex justify-between items-center">
                                                    <span class="text-[10px] font-mono text-neutral-400">Mint Contract</span>
                                                    <span class="text-[10px] font-mono font-medium text-neutral-400 truncate max-w-[140px]">{token.contract || 'Native Asset'}</span>
                                                </div>
                                            </div>
                                            <div class="bg-[#050505] rounded-2xl p-6 flex flex-col justify-center min-h-[120px] gap-3 shadow-inner">
                                                <span class="text-[9px] uppercase tracking-widest font-medium text-neutral-500">Silo Telemetry</span>
                                                <div class="flex justify-between items-center">
                                                    <span class="text-[10px] font-mono text-neutral-400">DEX Volume Accredited</span>
                                                    <span class="text-[10px] font-mono font-medium text-neutral-400">{(token.siloVolume || 0).toLocaleString(undefined, {maximumFractionDigits: 8})} {token.symbol}</span>
                                                </div>
                                            </div>
                                        {/if}
                                    </div>

                                    <div class="pt-6 mt-6">
                                        <div class="flex items-center justify-between mb-4">
                                            <span class="text-[10px] uppercase tracking-widest font-bold text-neutral-500">Transactions</span>
                                        </div>
                                        <div class="flex flex-col gap-4">
                                            <div class="py-6 text-center border border-dashed border-neutral-800 rounded-xl bg-[#050505]">
                                                <span class="text-[10px] font-mono text-neutral-600 uppercase tracking-widest">No recent transactions</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}
</div>