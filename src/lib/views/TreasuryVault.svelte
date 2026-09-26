<script lang="ts">
    import { onMount, onDestroy, untrack } from 'svelte';
    import { slide } from 'svelte/transition';
    import { browser } from '$app/environment';

    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { operations } from '$lib/stores/operations.svelte';
    import { treasury, type UnifiedAsset } from '$lib/stores/treasury.svelte';
    import { settingsStore } from '$lib/stores/settings.svelte';

    import NetworkRow from '$lib/components/treasury/NetworkRow.svelte';

    let activeHoverSegment = $state<string | null>(null);
    let displayUnit = $state<'token' | 'usd'>('token');
    let timeframe = $state<'1H' | '24H' | '7D' | '30D' | '1Y' | 'ALL'>('24H');

    let isAllNetworksDrawerOpen = $state(false);
    let isManagingNetworks = $state(false);
    
    let isOrganizing = $state(false);
    let draggedNetwork = $state<string | null>(null);

    let networkSearchQuery = $state('');
    let isGlobalSearching = $state(false);
    let globalSearchError = $state('');
    let searchResults = $state<any[]>([]);

    let targetAutoOpenNetwork = $state<string | null>(null);
    let targetAutoOpenToken = $state<string | null>(null);

    // ⚡ THE FIX: Wiped the default array to [] for a true zero-state baseline
    let activeNetworks = $state<string[]>([]);
    
    let userCustomTokens = $state<Record<string, any[]>>({
        KAS: [], BTC: [], ETH: [], ARB: [], BASE: [], SOL: [], DOGE: [], XRP: [], POL: [], AVAX: [], SUI: [], TRX: [], ZEC: []
    });
    let selectedTokensMap = $state<Record<string, string[]>>({
        KAS: [], BTC: [], ETH: [], ARB: [], BASE: [], SOL: [], DOGE: [], XRP: [], POL: [], AVAX: [], SUI: [], TRX: [], ZEC: []
    });

    let hasLoadedLocalState = $state(false);
    let serverSyncTimeout: ReturnType<typeof setTimeout>;

    const secondaryNetworks = [
        { ticker: 'BTC', standard: 'BRC-20 / Runes' },
        { ticker: 'ETH', standard: 'ERC-20' },
        { ticker: 'ARB', standard: 'Arbitrum One' },
        { ticker: 'BASE', standard: 'Base' },
        { ticker: 'SOL', standard: 'SPL Tokens' },
        { ticker: 'DOGE', standard: 'Doginals' },
        { ticker: 'XRP', standard: 'XRPL Tokens' },
        { ticker: 'POL', standard: 'ERC-20 (Polygon)' },
        { ticker: 'AVAX', standard: 'ARC-20' },
        { ticker: 'SUI', standard: 'Sui Objects' },
        { ticker: 'TRX', standard: 'TRC-20' },
        { ticker: 'ZEC', standard: 'Shielded Assets' }
    ];

    let autoActiveNetworks = $derived.by(() => {
        const nets = new Set<string>(activeNetworks);
        treasury.visibleAssets.forEach(asset => {
            if (asset.network && asset.network !== 'KAS') {
                nets.add(asset.network);
            }
        });
        return Array.from(nets);
    });

    // ⚡ THE FIX: Autonomously maps targeted tokens so the UI can auto-expand their parent network
    let targetedSubAssetsMap = $derived.by(() => {
        const map: Record<string, string> = {};
        for (const asset of treasury.visibleAssets) {
            if (asset.network && asset.network !== asset.ticker && operations.targetedAssets.includes(asset.ticker)) {
                map[asset.network] = asset.ticker;
            }
        }
        return map;
    });

    function getDynamicSubAssets(networkTicker: string) {
        const manualTokens = userCustomTokens[networkTicker] || [];
        const autoTokens = treasury.visibleAssets.filter(a => a.network === networkTicker && a.ticker !== networkTicker);
        
        const map = new Map();
        manualTokens.forEach(t => map.set(t.symbol, t));
        autoTokens.forEach(t => {
            map.set(t.ticker, {
                symbol: t.ticker,
                name: t.name,
                hex: t.theme?.hex || '#ffffff',
                imgUrl: t.imgUrl,
                balance: t.availableBalance, 
                stakedBalance: t.stakedBalance,
                price: t.spotPrice,
                contract: t.contract,
                badge: t.assetClass
            });
        });
        return Array.from(map.values());
    }

    function getDynamicSelectedTokens(networkTicker: string) {
        const manual = selectedTokensMap[networkTicker] || [];
        const autoTokens = treasury.visibleAssets.filter(a => a.network === networkTicker && a.ticker !== networkTicker).map(a => a.ticker);
        return Array.from(new Set([...manual, ...autoTokens]));
    }

    let visibleSecondaryNetworks = $derived.by(() => {
        let visible: any[] = [];
        autoActiveNetworks.forEach(ticker => {
            if (ticker === 'KAS') return; 
            const net = secondaryNetworks.find(n => n.ticker === ticker);
            if (net) visible.push(net);
        });

        if (isManagingNetworks || networkSearchQuery) {
            secondaryNetworks.forEach(net => {
                if (net.ticker !== 'KAS' && !autoActiveNetworks.includes(net.ticker)) {
                    visible.push(net);
                }
            });
        }

        const query = networkSearchQuery.toLowerCase();
        if (!query) return visible;

        return visible.filter(n => {
            if (!n || n.ticker === 'KAS') return false; 
            const asset = treasury.getAsset(n.ticker);
            const dynamicSubs = getDynamicSubAssets(n.ticker);
            return n.ticker?.toLowerCase().includes(query) ||
                (asset?.name?.toLowerCase().includes(query)) ||
                (n.standard?.toLowerCase().includes(query)) ||
                dynamicSubs.some((t: any) => 
                    t?.symbol?.toLowerCase().includes(query) || 
                    t?.name?.toLowerCase().includes(query)
                );
        });
    });

    function handleDragStart(event: DragEvent, ticker: string) {
        draggedNetwork = ticker;
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', ticker);
        }
    }

    function handleDragOver(event: DragEvent, ticker: string) {
        event.preventDefault();
        if (!draggedNetwork || draggedNetwork === ticker) return;

        const fromIdx = activeNetworks.indexOf(draggedNetwork);
        const toIdx = activeNetworks.indexOf(ticker);

        if (fromIdx !== -1 && toIdx !== -1) {
            const newOrder = [...activeNetworks];
            newOrder.splice(fromIdx, 1);
            newOrder.splice(toIdx, 0, draggedNetwork);
            activeNetworks = newOrder;
        }
    }

    function handleDrop(event: DragEvent) {
        event.preventDefault();
        draggedNetwork = null;
    }

    function toggleNetworkVisibility(ticker: string) {
        if (activeNetworks.includes(ticker)) {
            activeNetworks = activeNetworks.filter((t: string) => t !== ticker);
        } else {
            activeNetworks = [...activeNetworks, ticker];
        }
    }

    function addTokenToNetwork(network: string, token: any) {
        if (!userCustomTokens[network]) userCustomTokens[network] = [];
        if (!userCustomTokens[network].some((t: any) => t.symbol === token.symbol)) {
            userCustomTokens[network] = [...userCustomTokens[network], token];
        }
        if (!selectedTokensMap[network]) selectedTokensMap[network] = [];
        if (!selectedTokensMap[network].includes(token.symbol)) {
            selectedTokensMap[network] = [...selectedTokensMap[network], token.symbol];
        }
    }

    function toggleTokenSelection(network: string, symbol: string) {
        if (!selectedTokensMap[network]) selectedTokensMap[network] = [];
        if (selectedTokensMap[network].includes(symbol)) {
            selectedTokensMap[network] = selectedTokensMap[network].filter((s: string) => s !== symbol);
        } else {
            selectedTokensMap[network] = [...selectedTokensMap[network], symbol];
        }
    }

    function deleteTokenFromNetwork(network: string, symbol: string) {
        if (userCustomTokens[network]) {
            userCustomTokens[network] = userCustomTokens[network].filter((t: any) => t.symbol !== symbol);
        }
        if (selectedTokensMap[network]) {
            selectedTokensMap[network] = selectedTokensMap[network].filter((s: string) => s !== symbol);
        }
    }

    function selectSearchResult(result: any) {
        addTokenToNetwork(result.network, {
            symbol: result.symbol,
            name: result.name,
            hex: result.hex,
            imgUrl: result.imgUrl,
            balance: 0,
            price: result.price,
            contract: result.contract,
            badge: result.badge 
        });
        
        if (!activeNetworks.includes(result.network) && result.network !== 'KAS') {
            activeNetworks = [...activeNetworks, result.network];
        }
        
        targetAutoOpenNetwork = result.network;
        targetAutoOpenToken = result.symbol;
        
        searchResults = [];
        networkSearchQuery = '';
    }

    $effect(() => {
        if (identity.sovereignKeys) {
            untrack(() => {
                if (identity.sovereignKeys.kaspa?.address) treasury.updateAsset('KAS', { address: identity.sovereignKeys.kaspa.address });
                if (identity.sovereignKeys.bitcoin?.address) treasury.updateAsset('BTC', { address: identity.sovereignKeys.bitcoin.address });
                if (identity.sovereignKeys.ethereum?.address) treasury.updateAsset('ETH', { address: identity.sovereignKeys.ethereum.address });
                if (identity.sovereignKeys.solana?.address) treasury.updateAsset('SOL', { address: identity.sovereignKeys.solana.address });
                if (identity.sovereignKeys.doge?.address) treasury.updateAsset('DOGE', { address: identity.sovereignKeys.doge.address });
                if (identity.sovereignKeys.xrp?.address) treasury.updateAsset('XRP', { address: identity.sovereignKeys.xrp.address });
                if (identity.sovereignKeys.polygon?.address) treasury.updateAsset('POL', { address: identity.sovereignKeys.polygon.address });
                if (identity.sovereignKeys.avalanche?.address) treasury.updateAsset('AVAX', { address: identity.sovereignKeys.avalanche.address });
                if (identity.sovereignKeys.sui?.address) treasury.updateAsset('SUI', { address: identity.sovereignKeys.sui.address });
                if (identity.sovereignKeys.tron?.address) treasury.updateAsset('TRX', { address: identity.sovereignKeys.tron.address });
                if (identity.sovereignKeys.zcash?.address) treasury.updateAsset('ZEC', { address: identity.sovereignKeys.zcash.address });
                if (identity.sovereignKeys.ethereum?.address) {
                    treasury.updateAsset('ARB', { address: identity.sovereignKeys.ethereum.address });
                    treasury.updateAsset('BASE', { address: identity.sovereignKeys.ethereum.address });
                }
            });
        }
    });

    const knownTokens = [
        { tickers: ['PAXG', 'GOLD', 'PAX GOLD'], name: 'PAX Gold', symbol: 'PAXG', hex: '#E5A93C', imgUrl: 'https://cryptologos.cc/logos/pax-gold-paxg-logo.svg?v=033', price: 2412.50, network: 'ETH', badge: 'COMMODITY' },
        { tickers: ['XAUT', 'GOLD', 'TETHER GOLD'], name: 'Tether Gold', symbol: 'XAUT', hex: '#E5A93C', imgUrl: 'https://cryptologos.cc/logos/tether-gold-xaut-logo.svg?v=033', price: 2412.50, network: 'ETH', badge: 'COMMODITY' },
        { tickers: ['USDC', 'USD COIN'], name: 'USD Coin', hex: '#2775CA', imgUrl: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg?v=032', price: 1.00, network: 'ETH', contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
        { tickers: ['USDT', 'TETHER'], name: 'Tether USD', hex: '#26A17B', imgUrl: 'https://cryptologos.cc/logos/tether-usdt-logo.svg?v=032', price: 1.00, network: 'ETH', contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7' }
    ];

    function handleLiveSearch() {
        const query = networkSearchQuery.trim().toUpperCase();
        if (!query) {
            searchResults = [];
            globalSearchError = '';
            isGlobalSearching = false;
            return;
        }

        let localResults: any[] = [];
        const matches = knownTokens.filter(t => 
            t.tickers.some(tk => tk.includes(query)) || 
            (t.symbol && t.symbol.toUpperCase().includes(query)) ||
            t.name.toUpperCase().includes(query)
        );

        matches.forEach(match => {
            localResults.push({
                symbol: match.symbol || match.tickers[0],
                name: match.name,
                hex: match.hex,
                imgUrl: match.imgUrl,
                price: match.price || 0,
                contract: (match as any).contract || query,
                network: match.network,
                badge: match.badge
            });
        });
        
        searchResults = [...localResults];
    }

    async function executeGlobalMasterSearch() {
        const query = networkSearchQuery.trim().toUpperCase();
        if (query.length < 2) return;
        
        isGlobalSearching = true;
        globalSearchError = '';
        
        try {
            let externalResults: any[] = [];
            
            const dsRes = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${query}`);
            if (dsRes.ok) {
                const dsData = await dsRes.json();
                if (dsData.pairs && dsData.pairs.length > 0) {
                    let exactPairs = dsData.pairs.filter((p: any) => p.baseToken.symbol.toUpperCase() === query || p.baseToken.name.toUpperCase().includes(query));
                    if (exactPairs.length === 0) exactPairs = dsData.pairs;
                    let liquidPairs = exactPairs.filter((p: any) => parseFloat(p.liquidity?.usd || 0) > 1000);
                    
                    let bestPairPerChain: Record<string, any> = {};
                    liquidPairs.forEach((pair: any) => {
                        const chain = pair.chainId;
                        if (!bestPairPerChain[chain] || parseFloat(pair.liquidity.usd) > parseFloat(bestPairPerChain[chain].liquidity.usd)) {
                            bestPairPerChain[chain] = pair;
                        }
                    });

                    for (const [chain, pair] of Object.entries(bestPairPerChain)) {
                        let targetNetwork = '';
                        switch(chain) {
                            case 'ethereum': targetNetwork = 'ETH'; break;
                            case 'solana': targetNetwork = 'SOL'; break;
                            case 'polygon': targetNetwork = 'POL'; break;
                            case 'avalanche': targetNetwork = 'AVAX'; break;
                            case 'arbitrum': targetNetwork = 'ARB'; break;
                            case 'base': targetNetwork = 'BASE'; break;
                            case 'sui': targetNetwork = 'SUI'; break;
                            case 'bsc': targetNetwork = 'BSC'; break;
                        }

                        if (targetNetwork) {
                            const isDup = searchResults.some(r => r.symbol === pair.baseToken.symbol.toUpperCase() && r.network === targetNetwork);
                            if (!isDup) {
                                externalResults.push({
                                    symbol: pair.baseToken.symbol.toUpperCase(),
                                    name: pair.baseToken.name,
                                    hex: '#18C6A5', 
                                    imgUrl: pair.info?.imageUrl || `https://cryptologos.cc/logos/${pair.baseToken.symbol.toLowerCase()}-${pair.baseToken.symbol.toLowerCase()}-logo.svg`,
                                    price: parseFloat(pair.priceUsd || '0'),
                                    contract: pair.baseToken.address,
                                    network: targetNetwork
                                });
                            }
                        }
                    }
                }
            }

            try {
                const kasRes = await fetch(`https://api.kasplex.org/v1/krc20/token/${query}`);
                if (kasRes.ok) {
                    const kasData = await kasRes.json();
                    if (kasData.result && kasData.result.length > 0) {
                        const isDup = searchResults.some(r => r.symbol === query && r.network === 'KAS');
                        if (!isDup) {
                            externalResults.push({
                                symbol: query,
                                name: `${query} (KRC-20)`,
                                hex: '#18C6A5',
                                imgUrl: `https://storage.googleapis.com/kasfyi/token-icons/${query.toLowerCase()}.png`,
                                price: 0,
                                contract: query,
                                network: 'KAS'
                            });
                        }
                    }
                }
            } catch(e) {}

            if (externalResults.length > 0) {
                searchResults = [...searchResults, ...externalResults];
            } else {
                globalSearchError = `No verified liquidity found for "${query}".`;
            }

        } catch(e) {
            globalSearchError = 'Global on-chain indexer unreachable.';
        }
        isGlobalSearching = false;
    }

    $effect(() => {
        if (browser && identity.activeAddress && hasLoadedLocalState) {
            const stateToSave = { activeNetworks, userCustomTokens, selectedTokensMap };
            const stateString = JSON.stringify(stateToSave);
            
            localStorage.setItem(`p_custom_tokens_${identity.activeAddress}`, stateString);

            clearTimeout(serverSyncTimeout);
            serverSyncTimeout = setTimeout(async () => {
                try {
                    await fetch('/api/treasury/preferences', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            walletAddress: identity.activeAddress, 
                            preferences: stateToSave 
                        })
                    });
                } catch(e) {
                    console.error('Failed to sync treasury layout to remote database:', e);
                }
            }, 1500);
        }
    });

    async function loadTreasuryState() {
        if (!browser || !identity.activeAddress) return;
        
        const localSaved = localStorage.getItem(`p_custom_tokens_${identity.activeAddress}`);
        if (localSaved) {
            try {
                const data = JSON.parse(localSaved);
                if (data.activeNetworks) {
                    activeNetworks = Array.from(new Set(data.activeNetworks)).filter((t: any) => t !== 'KAS') as string[];
                }
                if (data.userCustomTokens) userCustomTokens = data.userCustomTokens;
                if (data.selectedTokensMap) selectedTokensMap = data.selectedTokensMap;
            } catch(e) {}
        }
        
        try {
            const res = await fetch(`/api/treasury/preferences?wallet=${identity.activeAddress}`);
            if (res.ok) {
                const { preferences: remoteData } = await res.json();
                if (remoteData) {
                    if (remoteData.activeNetworks) {
                        activeNetworks = Array.from(new Set(remoteData.activeNetworks)).filter((t: any) => t !== 'KAS') as string[];
                    }
                    if (remoteData.userCustomTokens) userCustomTokens = remoteData.userCustomTokens;
                    if (remoteData.selectedTokensMap) selectedTokensMap = remoteData.selectedTokensMap;
                    
                    localStorage.setItem(`p_custom_tokens_${identity.activeAddress}`, JSON.stringify(remoteData));
                }
            }
        } catch(e) {}

        hasLoadedLocalState = true;
    }

    $effect(() => {
        if (identity.isWalletConnected && !hasLoadedLocalState) {
            untrack(() => loadTreasuryState());
        }
    });

    let ringSegments = $derived.by(() => {
        let cumulativePercent = 0;
        const vaultValue = treasury.totalVaultValue;

        return treasury.visibleAssets.map((asset) => {
            let usdValue = asset.totalBalance * asset.spotPrice;
            const percent = vaultValue > 0 ? (usdValue / vaultValue) * 100 : 0;
            const offset = -cumulativePercent;
            cumulativePercent += percent;
            return { ...asset, usdValue, percent, dasharray: `${percent} ${100 - percent}`, dashoffset: offset };
        });
    });

    async function fetchSyntheticLedger() {
        if (!identity.isWalletConnected || !identity.activeAddress) return;
        try {
            const res = await fetch(`/api/user/ledger?wallet=${encodeURIComponent(identity.activeAddress)}`);
            if (res.ok) {
                const ledgerBalances = await res.json();
                for (const [ticker, amount] of Object.entries(ledgerBalances)) {
                    treasury.updateAsset(ticker.toUpperCase(), { synthetic: Number(amount) || 0 });
                }
            }
        } catch (e) {}
    }

    async function fetchOmniChainInventory() {
        if (!identity.isWalletConnected || !identity.activeAddress) return;
        try {
            const params = new URLSearchParams({
                kas: identity.sovereignKeys?.kaspa?.address || identity.activeAddress,
                btc: identity.sovereignKeys?.bitcoin?.address || '',
                eth: identity.sovereignKeys?.ethereum?.address || '',
                sol: identity.sovereignKeys?.solana?.address || ''
            });

            const res = await fetch(`/api/treasury/corporate?${params.toString()}`);
            if (res.ok) {
                const estate = await res.json();
                estate.assets.forEach((onChainAsset: any) => {
                    if (onChainAsset.balance !== undefined && onChainAsset.address && !onChainAsset.address.includes('Awaiting')) {
                        treasury.updateAsset(onChainAsset.symbol.toUpperCase(), { onChain: onChainAsset.balance });
                    }
                });
            }
        } catch (e) {}
    }

    let fetchInterval: ReturnType<typeof setInterval>;
    let omniChainInterval: ReturnType<typeof setInterval>;

    onMount(() => {
        if (identity.isWalletConnected) { 
            fetchOmniChainInventory(); 
            fetchSyntheticLedger();
        }

        fetchInterval = setInterval(() => { 
            if (identity.isWalletConnected) {
                fetchOmniChainInventory(); 
                fetchSyntheticLedger();
            }
        }, 10000);

        if (browser) {
            window.addEventListener('storage', (e) => {
                if (e.key === `p_custom_tokens_${identity.activeAddress}`) {
                    const saved = localStorage.getItem(`p_custom_tokens_${identity.activeAddress}`);
                    if (saved) {
                        try {
                            const data = JSON.parse(saved);
                            if (data.activeNetworks) {
                                activeNetworks = Array.from(new Set(data.activeNetworks)).filter((t: any) => t !== 'KAS') as string[];
                            }
                            if (data.userCustomTokens) userCustomTokens = data.userCustomTokens;
                            if (data.selectedTokensMap) selectedTokensMap = data.selectedTokensMap;
                        } catch(err) {}
                    }
                }
            });
        }

        omniChainInterval = setInterval(fetchOmniChainInventory, 15000);
    });

    onDestroy(() => {
        if (fetchInterval) clearInterval(fetchInterval);
        if (omniChainInterval) clearInterval(omniChainInterval);
    });
</script>

<div class="w-full h-full min-h-[100dvh] bg-app text-neutral-300 font-mono flex flex-col items-center pb-24 overflow-y-auto animate-[fade-in-up_0.3s_ease-out] relative">
    {#if !identity.isWalletConnected}
        <div class="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#050505]/98 p-6 text-center">
            <h2 class="text-2xl md:text-4xl font-medium uppercase tracking-[0.2em] text-neutral-500 mb-4">TREASURY LOCKED</h2>
        </div>
    {/if}

    <div class="w-full max-w-5xl p-4 lg:p-8 flex flex-col gap-8 transition-opacity duration-500 {!identity.isWalletConnected ? 'opacity-10 pointer-events-none' : 'opacity-100'} relative">

        <div class="bg-[#0a0a0a] border border-[#18C6A5]/20 rounded-[32px] shadow-[0_0_40px_rgba(24,198,165,0.15)] relative overflow-hidden group">
            <div class="relative z-10 p-8 lg:p-10 flex flex-col md:flex-row items-center justify-between gap-10">
                <div class="flex flex-col md:flex-row items-center w-full gap-10">
                    <div class="flex flex-col items-center md:items-start text-center md:text-left">
                        <span class="text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-500 mb-2 flex items-center gap-2">
                            <div class="w-1.5 h-1.5 bg-[#18C6A5] rounded-full animate-pulse"></div> Total Vault Portfolio Value
                        </span>
                        <span class="text-5xl lg:text-7xl font-black tracking-tighter text-white tabular-nums drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                            ${treasury.totalVaultValue.toLocaleString('en-US', { minimumFractionDigits: settingsStore.fiatDecimals, maximumFractionDigits: settingsStore.fiatDecimals })}
                        </span>
                    </div>
                </div>

                <div class="flex flex-col items-end gap-3 self-center lg:self-end mt-6 lg:mt-0 relative z-20">
                    <div class="flex items-center bg-[#111] border border-neutral-800 rounded-xl p-1 shrink-0 overflow-x-auto max-w-[280px] md:max-w-full no-scrollbar">
                        {#each ['1H', '24H', '7D', '30D', '1Y', 'ALL'] as tf}
                            <button onclick={() => timeframe = tf as any} class="px-2.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all cursor-pointer {timeframe === tf ? 'bg-[#18C6A5] text-black shadow-md' : 'text-neutral-500 hover:text-white'}">{tf}</button>
                        {/each}
                    </div>

                    <div class="flex items-center bg-[#111] border border-neutral-800 rounded-xl p-1 shrink-0 w-fit">
                        <button onclick={() => displayUnit = 'token'} class="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all cursor-pointer {displayUnit === 'token' ? 'bg-[#18C6A5] text-black shadow-md' : 'text-neutral-500 hover:text-white'}">Token</button>
                        <button onclick={() => displayUnit = 'usd'} class="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all cursor-pointer {displayUnit === 'usd' ? 'bg-[#18C6A5] text-black shadow-md' : 'text-neutral-500 hover:text-white'}">USD</button>
                    </div>
                </div>
            </div>

            <div class="absolute right-[-40px] top-[-40px] w-64 h-64 opacity-30 pointer-events-none hidden lg:block">
                <svg viewBox="0 0 36 36" class="w-full h-full transform -rotate-90">
                    <circle cx="18" cy="18" r="15.915" fill="none" stroke="#222" stroke-width="2.5"></circle>
                    {#each ringSegments as segment}
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke={segment.theme.hex} stroke-width={activeHoverSegment === segment.ticker ? "4" : "2.5"} stroke-dasharray={segment.dasharray} stroke-dashoffset={segment.dashoffset} class="transition-all duration-300"></circle>
                    {/each}
                </svg>
            </div>
        </div>

        <div class="flex justify-center -mt-2 mb-2 relative z-20">
            <button onclick={() => isOrganizing = !isOrganizing} class="bg-[#111] hover:bg-[#1a1a1a] border border-neutral-800 text-neutral-400 hover:text-white px-5 py-2 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 shadow-md cursor-pointer">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"/></svg>
                {isOrganizing ? 'Done Organizing' : 'Organize Tokens'}
            </button>
        </div>

        <div class="flex flex-col gap-4 w-full relative">

            <div class="bg-[#050505] border border-neutral-800/80 hover:border-neutral-700 rounded-[24px] shadow-xl w-full p-4 lg:p-6 flex flex-col lg:flex-row items-center justify-between gap-4 transition-colors cursor-pointer {isAllNetworksDrawerOpen ? 'border-neutral-600' : ''}" onclick={() => {
                isAllNetworksDrawerOpen = !isAllNetworksDrawerOpen;
                if (!isAllNetworksDrawerOpen) {
                    isManagingNetworks = false;
                    networkSearchQuery = '';
                    searchResults = [];
                }
            }}>
                <div class="flex items-center gap-4 w-full lg:w-auto">
                    <div class="w-10 h-10 rounded-xl bg-[#0a0a0a] border border-neutral-800 flex items-center justify-center text-neutral-500 shadow-inner shrink-0">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
                    </div>
                    <div class="flex flex-col items-start text-left flex-1">
                        <span class="text-xs md:text-sm font-bold uppercase tracking-widest text-white">All Networks</span>
                        <span class="text-[9px] text-neutral-500 mt-0.5">Sovereign Multi-Chain Key Derivations & Ecosystem Assets</span>
                    </div>
                    <svg class="w-5 h-5 text-neutral-500 transform transition-transform duration-300 {isAllNetworksDrawerOpen ? 'rotate-180' : ''} lg:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                </div>
                
                <div class="flex items-center gap-3 w-full lg:w-auto justify-end" onclick={(e) => e.stopPropagation()}>
                    <div class="relative flex-1 lg:w-[300px]">
                        <input 
                            type="text" 
                            bind:value={networkSearchQuery} 
                            oninput={() => { 
                                if(networkSearchQuery.trim().length > 0) isAllNetworksDrawerOpen = true;
                                handleLiveSearch();
                            }}
                            placeholder="Search blockchains or Web3 tokens..." 
                            class="w-full bg-[#111] border border-neutral-800 focus:border-[#18C6A5]/50 rounded-xl py-2.5 pl-9 pr-8 text-xs font-mono text-white outline-none transition-colors" 
                        />
                        <svg class="absolute left-3 top-3 w-3.5 h-3.5 text-neutral-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                        
                        <div class="absolute right-3 top-2.5 flex items-center justify-center">
                            {#if isGlobalSearching}
                                <div class="w-3.5 h-3.5 border-2 border-neutral-600 border-t-[#18C6A5] rounded-full animate-spin"></div>
                            {:else if networkSearchQuery}
                                <button aria-label="Clear Search" onclick={() => {networkSearchQuery = ''; searchResults = []; isGlobalSearching = false;}} class="w-3.5 h-3.5 text-neutral-500 hover:text-white transition-colors cursor-pointer flex items-center justify-center">
                                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                                </button>
                            {/if}
                        </div>

                        {#if searchResults.length > 0}
                            <div transition:slide={{duration: 200}} class="absolute top-[115%] left-0 w-full bg-[#111] border border-neutral-700 rounded-[20px] shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-[100] overflow-hidden max-h-[400px] overflow-y-auto flex flex-col no-scrollbar">
                                <div class="px-5 py-3.5 bg-[#1a1a1a] border-b border-neutral-800 flex items-center justify-between sticky top-0 z-10 shadow-sm">
                                    <span class="text-[9px] font-bold uppercase text-neutral-500 tracking-widest">Select Token</span>
                                    <span class="text-[9px] font-bold text-neutral-600">{searchResults.length} Matches</span>
                                </div>
                                {#each searchResults as result}
                                    <div class="flex items-center justify-between p-4 hover:bg-[#1a1a1a] transition-colors border-b border-neutral-800/50 last:border-0 cursor-pointer" onclick={(e) => { e.stopPropagation(); selectSearchResult(result); }}>
                                        <div class="flex items-center gap-4">
                                            <div class="w-10 h-10 rounded-[12px] bg-[#050505] border border-neutral-800 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                                                {#if result.imgUrl}
                                                    <img src={result.imgUrl} class="w-6 h-6 object-contain drop-shadow-md" alt={result.symbol} onerror={(e) => (e.currentTarget as HTMLImageElement).style.display='none'} />
                                                {:else}
                                                    <span class="text-[12px] font-black" style="color: {result.hex}">{result.symbol[0]}</span>
                                                {/if}
                                            </div>
                                            <div class="flex flex-col gap-0.5">
                                                <span class="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                                                    {result.symbol}
                                                    <span class="text-[8px] bg-[#222] border border-neutral-700 text-neutral-400 px-1.5 py-0.5 rounded shrink-0 uppercase tracking-widest">{result.network}</span>
                                                </span>
                                                <span class="text-[9px] font-mono text-neutral-500 tracking-widest uppercase truncate max-w-[120px]">{result.name}</span>
                                            </div>
                                        </div>
                                        <button class="bg-[#18C6A5]/10 hover:bg-[#18C6A5]/20 text-[#18C6A5] px-4 py-2 rounded-[12px] text-[10px] font-bold uppercase tracking-widest transition-colors shrink-0 cursor-pointer">
                                            Add
                                        </button>
                                    </div>
                                {/each}
                            </div>
                        {/if}
                        
                        {#if networkSearchQuery.trim().length > 1 && searchResults.length === 0 && !isGlobalSearching}
                            <div transition:slide={{duration: 200}} class="absolute top-[115%] left-0 w-full bg-[#111] border border-neutral-700 rounded-[20px] shadow-[0_10px_40px_rgba(0,0,0,0.8)] z-[100] p-4 text-center">
                                <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500">No assets found for "{networkSearchQuery}"</span>
                            </div>
                        {/if}
                    </div>
                    
                    <div class="flex items-center gap-2 shrink-0">
                        <span class="text-[9px] font-bold uppercase tracking-widest {isManagingNetworks ? 'text-[#18C6A5]' : 'text-neutral-500'} transition-colors hidden sm:inline">Manage</span>
                        <button aria-label="Toggle Manage Networks" onclick={() => { isManagingNetworks = !isManagingNetworks; if (!isManagingNetworks) { networkSearchQuery = ''; searchResults = []; } else isAllNetworksDrawerOpen = true; }} class="w-10 h-5 rounded-full border transition-colors duration-300 relative cursor-pointer focus:outline-none shrink-0" style="background-color: {isManagingNetworks ? '#18C6A520' : '#111'}; border-color: {isManagingNetworks ? '#18C6A550' : '#404040'};">
                            <div class="absolute top-[1px] w-4 h-4 rounded-full transition-all duration-300 shadow-sm" style="background-color: {isManagingNetworks ? '#18C6A5' : '#737373'}; left: {isManagingNetworks ? '22px' : '1px'};"></div>
                        </button>
                    </div>
                    <svg class="w-5 h-5 text-neutral-500 transform transition-transform duration-300 {isAllNetworksDrawerOpen ? 'rotate-180' : ''} hidden lg:block ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                </div>
            </div>

            {#if isAllNetworksDrawerOpen}
                <div transition:slide class="w-full">
                    <div class="flex flex-col gap-4">
                        
                        {#if networkSearchQuery.trim().length > 1 && searchResults.length === 0 && !isGlobalSearching}
                            <div transition:slide class="py-5 text-center flex flex-col items-center justify-center gap-3 border border-dashed border-neutral-800 rounded-2xl bg-[#0a0a0a] shadow-inner">
                                <span class="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">Don't see your token?</span>
                                <button onclick={executeGlobalMasterSearch} disabled={isGlobalSearching} class="px-8 py-3 bg-[#111] hover:bg-[#1a1a1a] border border-[#18C6A5]/50 hover:border-[#18C6A5] text-[#18C6A5] rounded-xl text-[10px] uppercase tracking-widest font-bold transition-all duration-300 cursor-pointer disabled:opacity-50 shadow-md">
                                    Search Web3 for "{networkSearchQuery.toUpperCase()}"
                                </button>
                                {#if globalSearchError} <span class="text-red-500 text-[9px] mt-1">{globalSearchError}</span> {/if}
                            </div>
                        {:else if networkSearchQuery.trim().length > 0 && visibleSecondaryNetworks.length === 0 && searchResults.length === 0 && !isGlobalSearching}
                            <div transition:slide class="py-8 text-center border border-dashed border-neutral-800 rounded-[24px] bg-[#0a0a0a]">
                                <span class="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">No local blockchains match "{networkSearchQuery}"</span>
                            </div>
                        {/if}

                        <NetworkRow 
                            asset={treasury.getAsset('KAS') as any} 
                            subAssets={getDynamicSubAssets('KAS')} 
                            selectedTokens={getDynamicSelectedTokens('KAS')} 
                            onToggleToken={(s: string) => toggleTokenSelection('KAS', s)}
                            onDeleteToken={(s: string) => deleteTokenFromNetwork('KAS', s)}
                            standardLabel="KRC-20" 
                            searchQuery={networkSearchQuery}
                            {activeHoverSegment}
                            onHover={(v: string | null) => activeHoverSegment = v} 
                            {displayUnit} 
                            {timeframe}
                            fiatDecimals={settingsStore.fiatDecimals} 
                            tokenDecimals={settingsStore.tokenDecimals} 
                            {isManagingNetworks}
                            {isOrganizing}
                            isNetworkSelected={true}
                            autoOpenToken={targetAutoOpenNetwork === 'KAS' ? targetAutoOpenToken : targetedSubAssetsMap['KAS'] || null}
                        />

                        {#each visibleSecondaryNetworks as net (net.ticker)}
                            <div 
                                draggable={isOrganizing && autoActiveNetworks.includes(net.ticker)}
                                ondragstart={(e) => handleDragStart(e, net.ticker)}
                                ondragover={(e) => handleDragOver(e, net.ticker)}
                                ondrop={handleDrop}
                                ondragend={() => draggedNetwork = null}
                                class="transition-all duration-300 {draggedNetwork === net.ticker ? 'opacity-40 scale-[0.98]' : 'opacity-100'} {isOrganizing && autoActiveNetworks.includes(net.ticker) ? 'cursor-grab active:cursor-grabbing' : ''}"
                            >
                                <NetworkRow 
                                    asset={treasury.getAsset(net.ticker) as any} 
                                    subAssets={getDynamicSubAssets(net.ticker)} 
                                    selectedTokens={getDynamicSelectedTokens(net.ticker)} 
                                    onToggleToken={(s: string) => toggleTokenSelection(net.ticker, s)}
                                    onDeleteToken={(s: string) => deleteTokenFromNetwork(net.ticker, s)}
                                    standardLabel={net.standard} 
                                    searchQuery={networkSearchQuery}
                                    {activeHoverSegment}
                                    onHover={(v: string | null) => activeHoverSegment = v} 
                                    {displayUnit} 
                                    {timeframe}
                                    fiatDecimals={settingsStore.fiatDecimals} 
                                    tokenDecimals={settingsStore.tokenDecimals} 
                                    {isManagingNetworks}
                                    {isOrganizing}
                                    isNetworkSelected={autoActiveNetworks.includes(net.ticker)}
                                    onNetworkToggle={() => toggleNetworkVisibility(net.ticker)}
                                    autoOpenToken={targetAutoOpenNetwork === net.ticker ? targetAutoOpenToken : targetedSubAssetsMap[net.ticker] || null}
                                />
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}

        </div>
    </div>
</div>