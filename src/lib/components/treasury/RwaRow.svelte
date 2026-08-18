<script lang="ts">
    import { onMount } from 'svelte';

    interface RwaAsset {
        ticker: string;
        name: string;
        hex: string;
        imgUrl: string;
        price: number;
        category: string;
        desc: string;
    }

    let { fiatDecimals = 2 } = $props();

    let loading = $state(true);
    let error = $state('');
    let rwaSearchQuery = $state('');
    let isManaging = $state(false);
    let isSearching = $state(false);

    let selectedRwas = $state<string[]>(['XAU', 'SPY', 'USTB']);

    let rwaAssets = $state<RwaAsset[]>([
        { ticker: 'XAU', name: 'Gold (Oz)', hex: '#D4AF37', imgUrl: 'https://cryptologos.cc/logos/tether-gold-xaut-logo.svg', price: 0, category: 'Precious Metals', desc: 'Pyth Oracle: XAU/USD' },
        { ticker: 'XAG', name: 'Silver (Oz)', hex: '#C0C0C0', imgUrl: '', price: 0, category: 'Precious Metals', desc: 'Pyth Oracle: XAG/USD' },
        { ticker: 'SPY', name: 'S&P 500 Index', hex: '#0052FF', imgUrl: '', price: 0, category: 'Equities', desc: 'Pyth Oracle: SPY/USD' },
        { ticker: 'AAPL', name: 'Apple Inc.', hex: '#A3AAAE', imgUrl: '', price: 0, category: 'Equities', desc: 'Pyth Oracle: AAPL/USD' },
        { ticker: 'USTB', name: 'US Short-Term T-Bills', hex: '#141414', imgUrl: '', price: 1.00, category: 'Sovereign Debt', desc: 'Pyth Oracle: USTB/USD' }
    ]);

    let filteredRwas = $derived(
        rwaAssets.filter(c => {
            const searchStr = rwaSearchQuery.toLowerCase();
            const searchMatch = !rwaSearchQuery || 
                c.ticker.toLowerCase().includes(searchStr) ||
                c.name.toLowerCase().includes(searchStr) ||
                c.category.toLowerCase().includes(searchStr);
            const visibilityMatch = isManaging || selectedRwas.includes(c.ticker);
            return searchMatch && visibilityMatch;
        })
    );

    onMount(async () => {
        try {
            const res = await fetch('/api/prices/rwa');
            const data = await res.json();
            if (data.success && data.assets) {
                rwaAssets = rwaAssets.map(asset => {
                    const pythData = data.assets.find((a: any) => a.ticker === asset.ticker);
                    if (pythData) {
                        return { ...asset, price: parseFloat(pythData.price) };
                    }
                    return asset;
                });
            } else {
                error = data.error || 'Failed to fetch oracle data';
            }
        } catch (e: any) {
            error = "Failed to synchronize Pyth Hermes oracle.";
        } finally {
            loading = false;
        }
    });

    function toggleSelection(ticker: string) {
        if (selectedRwas.includes(ticker)) {
            selectedRwas = selectedRwas.filter((s: string) => s !== ticker);
        } else {
            selectedRwas = [...selectedRwas, ticker];
        }
    }

    async function executeSearch() {
        if (!rwaSearchQuery.trim()) return;
        isSearching = true;
        error = '';
        try {
            const clean = rwaSearchQuery.trim().toUpperCase();
            if (!rwaAssets.some(a => a.ticker === clean)) {
                rwaAssets = [...rwaAssets, {
                    ticker: clean,
                    name: `${clean} (Oracle Feed)`,
                    hex: '#18C6A5',
                    imgUrl: '',
                    price: 0.00,
                    category: 'Discovered Asset',
                    desc: `Pyth Oracle: ${clean}/USD`
                }];
            }
            if (!selectedRwas.includes(clean)) {
                selectedRwas = [...selectedRwas, clean];
            }
            rwaSearchQuery = '';
            isManaging = true;
        } catch (e) {
            error = 'Oracle network unreachable.';
        } finally {
            isSearching = false;
        }
    }
</script>

<div class="flex flex-col gap-4">
    <div class="flex items-center gap-3 w-full mb-2">
        <div class="relative flex-1">
            <input 
                type="text" 
                bind:value={rwaSearchQuery} 
                placeholder="Search Pyth Network Feeds (e.g. Gold, SPY, TSLA)..." 
                class="w-full bg-[#111] border border-neutral-800 focus:border-[#18C6A5]/50 rounded-xl py-3 pl-10 pr-10 text-xs font-mono text-white outline-none transition-colors" 
            />
            <svg class="absolute left-3.5 top-3.5 w-4 h-4 text-neutral-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            {#if rwaSearchQuery}
                <button aria-label="Clear Search" onclick={() => rwaSearchQuery = ''} class="absolute right-3.5 top-3.5 w-4 h-4 text-neutral-500 hover:text-white transition-colors cursor-pointer">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            {/if}
        </div>
        <div class="flex items-center gap-3 shrink-0 ml-1">
            <span class="text-[9px] font-bold uppercase tracking-widest transition-colors {isManaging ? 'text-[#18C6A5]' : 'text-neutral-500'}">Manage Tokens</span>
            <button aria-label="Toggle Manage Tokens" onclick={() => { isManaging = !isManaging; if (!isManaging) rwaSearchQuery = ''; }} class="w-10 h-5 rounded-full border transition-colors duration-300 relative cursor-pointer focus:outline-none shrink-0" style="background-color: {isManaging ? '#18C6A520' : '#111'}; border-color: {isManaging ? '#18C6A550' : '#404040'};">
                <div class="absolute top-[1px] w-4 h-4 rounded-full transition-all duration-300 shadow-sm" style="background-color: {isManaging ? '#18C6A5' : '#737373'}; left: {isManaging ? '22px' : '1px'};"></div>
            </button>
        </div>
    </div>

    {#if loading}
        <div class="text-neutral-500 text-[10px] font-mono animate-pulse py-4 text-center">Syncing Pyth Hermes Network Oracles...</div>
    {:else}
        <div class="flex flex-col gap-2">
            {#if filteredRwas.length === 0}
                <div class="text-center py-6 flex flex-col items-center justify-center gap-4 border border-dashed border-neutral-800 rounded-xl bg-[#0a0a0a]">
                    <span class="text-[10px] font-mono text-neutral-600 uppercase tracking-widest">No oracle feeds match "{rwaSearchQuery}"</span>
                    {#if rwaSearchQuery.length > 1}
                        <button onclick={executeSearch} disabled={isSearching} class="px-5 py-2.5 bg-[#111] hover:bg-[#1a1a1a] border border-[#18C6A5] text-[#18C6A5] rounded-xl text-[9px] uppercase tracking-widest font-bold transition-all duration-300 cursor-pointer disabled:opacity-50">
                            {#if isSearching} Querying Oracle... {:else} Add {rwaSearchQuery.toUpperCase()} Feed {/if}
                        </button>
                        {#if error} <span class="text-red-500 text-[9px]">{error}</span> {/if}
                    {/if}
                </div>
            {/if}

            {#each filteredRwas as asset}
                <div class="bg-[#0c0c0c] border border-neutral-800 hover:border-neutral-700 rounded-xl overflow-hidden transition-all duration-300">
                    <div class="flex items-center justify-between p-3.5 {isManaging ? 'cursor-pointer' : ''} select-none" onclick={() => isManaging ? toggleSelection(asset.ticker) : null} role="button" tabindex="0">
                        <div class="flex items-center gap-4">
                            <div class="w-9 h-9 rounded-lg bg-[#050505] border border-neutral-800 flex items-center justify-center text-[16px] shadow-inner font-black font-sans" style="color: {asset.hex}; box-shadow: inset 0 0 10px {asset.hex}15;">
                                {#if asset.imgUrl}
                                    <img src={asset.imgUrl} class="w-5 h-5 object-contain drop-shadow-md" alt={asset.ticker} />
                                {:else}
                                    <span class="text-xs font-black">{asset.ticker[0]}</span>
                                {/if}
                            </div>
                            <div class="flex flex-col">
                                <span class="text-xs font-bold tracking-wider text-white">{asset.name}</span>
                                <span class="text-[9px] text-neutral-500 uppercase tracking-widest">{asset.category}</span>
                            </div>
                        </div>

                        <div class="flex items-center gap-4 pr-1">
                            <div class="flex flex-col items-end">
                                <span class="text-xs font-mono font-bold text-[#18C6A5] tabular-nums">
                                    ${asset.price.toLocaleString(undefined, {minimumFractionDigits: fiatDecimals, maximumFractionDigits: fiatDecimals})}
                                </span>
                                <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">{asset.desc}</span>
                            </div>
                            {#if isManaging}
                                <div class="pl-3 border-l border-neutral-800/80 flex items-center">
                                    <button aria-label="Toggle Token" onclick={(e) => { e.stopPropagation(); toggleSelection(asset.ticker); }} class="w-10 h-5 rounded-full relative transition-colors border cursor-pointer focus:outline-none ml-2" style="background-color: {selectedRwas.includes(asset.ticker) ? '#18C6A520' : '#111'}; border-color: {selectedRwas.includes(asset.ticker) ? '#18C6A550' : '#404040'};">
                                        <div class="absolute top-[1px] w-4 h-4 rounded-full transition-all shadow-sm" style="background-color: {selectedRwas.includes(asset.ticker) ? '#18C6A5' : '#737373'}; left: {selectedRwas.includes(asset.ticker) ? '22px' : '1px'};"></div>
                                    </button>
                                </div>
                            {/if}
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>