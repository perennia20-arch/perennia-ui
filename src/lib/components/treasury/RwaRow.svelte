<script lang="ts">
    import { onMount } from 'svelte';
    import { treasury } from '$lib/stores/treasury.svelte';
    import { ui } from '$lib/stores/ui.svelte';

    interface RwaAsset {
        ticker: string;
        name: string;
        hex: string;
        imgUrl: string;
        price: number;
        change24h: number;
        category: string;
        network: string;
        contract: string;
        desc: string;
    }

    let { fiatDecimals = 2 } = $props();
    let loading = $state(true);
    let error = $state('');
    let rwaSearchQuery = $state('');
    let isManaging = $state(false);
    let isSearching = $state(false);
    let selectedRwas = $state<string[]>([
        'SPY',
        'QQQ',
        'NVDA',
        'AAPL',
        'TSLA',
        'AMD',
        'TSM',
        'AVGO',
        'XLE',
        'XAU',
        'XAG',
        'USTB'
    ]);

    let rwaAssets = $state<RwaAsset[]>([
        {
            ticker: 'SPY',
            name: 'S&P 500 Index (bCSPX)',
            hex: '#3B82F6',
            imgUrl: '',
            price: 0,
            change24h: 0,
            category: 'Public Equity Index',
            network: 'BASE',
            contract: '0x1e2C4fb7eDE391d116E6B41cD0608260e8801D59',
            desc: 'Pyth Oracle: SPY/USD'
        },
        {
            ticker: 'QQQ',
            name: 'Nasdaq 100 Index (bQQQ)',
            hex: '#06B6D4',
            imgUrl: '',
            price: 0,
            change24h: 0,
            category: 'Public Equity Index',
            network: 'BASE',
            contract: '0x9695e2b96ea7b38596fb62eefb1e5f2b670b6c0f',
            desc: 'Pyth Oracle: QQQ/USD'
        },
        {
            ticker: 'NVDA',
            name: 'NVIDIA Corp. (bNVDA)',
            hex: '#76B900',
            imgUrl: '',
            price: 0,
            change24h: 0,
            category: 'Compute & AI Leader',
            network: 'BASE',
            contract: '0x76B812B06B89D93f7E43A40A806C7c7D9E086058',
            desc: 'Pyth Oracle: NVDA/USD'
        },
        {
            ticker: 'AAPL',
            name: 'Apple Inc. (bAAPL)',
            hex: '#94A3B8',
            imgUrl: '',
            price: 0,
            change24h: 0,
            category: 'Public Equity',
            network: 'BASE',
            contract: '0x49f6b65cb1de6b10eaf75e7c03ca029c306d0357',
            desc: 'Pyth Oracle: AAPL/USD'
        },
        {
            ticker: 'TSLA',
            name: 'Tesla Inc. (bTSLA)',
            hex: '#EF4444',
            imgUrl: '',
            price: 0,
            change24h: 0,
            category: 'Energy & Robotics',
            network: 'BASE',
            contract: '0x16dad506d7db8da01c87581c87ca897a012a1535',
            desc: 'Pyth Oracle: TSLA/USD'
        },
        {
            ticker: 'AMD',
            name: 'Advanced Micro Devices (bAMD)',
            hex: '#F97316',
            imgUrl: '',
            price: 0,
            change24h: 0,
            category: 'Compute & Silicon',
            network: 'BASE',
            contract: '0x2f95862b045670cd22bee3114c39763a4a08beeb',
            desc: 'Pyth Oracle: AMD/USD'
        },
        {
            ticker: 'TSM',
            name: 'Taiwan Semiconductor (bTSM)',
            hex: '#38BDF8',
            imgUrl: '',
            price: 0,
            change24h: 0,
            category: 'Foundry Leader',
            network: 'BASE',
            contract: '0x69145a36d62e91113b86b2e5b88f68f7f781c08d',
            desc: 'Pyth Oracle: TSM/USD'
        },
        {
            ticker: 'AVGO',
            name: 'Broadcom Inc. (bAVGO)',
            hex: '#E11D48',
            imgUrl: '',
            price: 0,
            change24h: 0,
            category: 'Networking & Silicon',
            network: 'BASE',
            contract: '0x72b021217ca3fe68922a19aaf990109cb9d84e9a',
            desc: 'Pyth Oracle: AVGO/USD'
        },
        {
            ticker: 'XLE',
            name: 'Energy Select Sector (bXLE)',
            hex: '#F59E0B',
            imgUrl: '',
            price: 0,
            change24h: 0,
            category: 'Energy Infrastructure',
            network: 'BASE',
            contract: '0x277b69923f8886d886c920d3616c2182f9d59c9c',
            desc: 'Pyth Oracle: XLE/USD'
        },
        {
            ticker: 'XAU',
            name: 'Physical Gold Oz (PAXG)',
            hex: '#D4AF37',
            imgUrl: 'https://cryptologos.cc/logos/tether-gold-xaut-logo.svg',
            price: 0,
            change24h: 0,
            category: 'Precious Metals',
            network: 'ETH',
            contract: '0x45804880De22913dAFE09f4980848ECE6EcbAf78',
            desc: 'Pyth Oracle: XAU/USD'
        },
        {
            ticker: 'XAG',
            name: 'Physical Silver Oz (KAG)',
            hex: '#CBD5E1',
            imgUrl: '',
            price: 0,
            change24h: 0,
            category: 'Precious Metals',
            network: 'ETH',
            contract: '0xf2fb02c32b055c805e7238d628e5e9dadef27437',
            desc: 'Pyth Oracle: XAG/USD'
        },
        {
            ticker: 'USTB',
            name: 'US Treasury Bills (bIB01)',
            hex: '#18C6A5',
            imgUrl: '',
            price: 0,
            change24h: 0,
            category: 'Sovereign Debt',
            network: 'ETH',
            contract: '0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a',
            desc: 'Pyth Oracle: USTB/USD'
        }
    ]);

    let filteredRwas = $derived(
        rwaAssets.filter((c) => {
            const searchStr = rwaSearchQuery.toLowerCase();
            const searchMatch =
                !rwaSearchQuery ||
                c.ticker.toLowerCase().includes(searchStr) ||
                c.name.toLowerCase().includes(searchStr) ||
                c.category.toLowerCase().includes(searchStr);
            const visibilityMatch = isManaging || selectedRwas.includes(c.ticker);
            return searchMatch && visibilityMatch;
        })
    );

    async function refreshRwaFeeds() {
        loading = true;
        error = '';
        try {
            const res = await fetch('/api/prices/rwa');
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success && Array.isArray(data.assets)) {
                rwaAssets = rwaAssets.map((asset) => {
                    const pythData = data.assets.find((a: any) => a.ticker === asset.ticker);
                    if (pythData) {
                        const parsedPrice = Number(pythData.spotPrice ?? pythData.price ?? 0);
                        const parsedChange = Number(pythData.change24h ?? 0);
                        if (parsedPrice > 0) {
                            treasury.updateAsset(asset.ticker, {
                                spotPrice: parsedPrice,
                                delta: parsedChange
                            });
                        }
                        return {
                            ...asset,
                            price: parsedPrice,
                            change24h: parsedChange
                        };
                    }
                    return asset;
                });
            } else {
                error = data.error || 'ORACLE_HALT: Failed to fetch Pyth Hermes oracle feeds.';
            }
        } catch {
            error = 'ORACLE_HALT: Failed to synchronize Pyth Hermes oracle.';
        } finally {
            loading = false;
        }
    }

    onMount(() => {
        refreshRwaFeeds();
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
            if (!rwaAssets.some((a) => a.ticker === clean)) {
                rwaAssets = [
                    ...rwaAssets,
                    {
                        ticker: clean,
                        name: `${clean} (Pyth Oracle Feed)`,
                        hex: '#18C6A5',
                        imgUrl: '',
                        price: 0.0,
                        change24h: 0.0,
                        category: 'Discovered RWA Feed',
                        network: 'BASE',
                        contract: clean,
                        desc: `Pyth Oracle: ${clean}/USD`
                    }
                ];
            }
            if (!selectedRwas.includes(clean)) {
                selectedRwas = [...selectedRwas, clean];
            }
            rwaSearchQuery = '';
            isManaging = true;
        } catch {
            error = 'Oracle network unreachable.';
        } finally {
            isSearching = false;
        }
    }
</script>

<div class="flex flex-col gap-4" data-testid="rwa-oracle-matrix">
    <div class="flex items-center gap-3 w-full mb-1">
        <div class="relative flex-1">
            <input
                type="text"
                bind:value={rwaSearchQuery}
                placeholder="Search Pyth Wall Street & Commodity Feeds (e.g. NVDA, SPY, AMD, XAU, USTB)..."
                class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl py-3 pl-10 pr-10 text-xs font-mono text-white outline-none transition-colors"
            />
            <svg
                class="absolute left-3.5 top-3.5 w-4 h-4 text-neutral-500 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
            </svg>
            {#if rwaSearchQuery}
                <button
                    type="button"
                    aria-label="Clear Search"
                    onclick={() => (rwaSearchQuery = '')}
                    class="absolute right-3.5 top-3.5 w-4 h-4 text-neutral-500 hover:text-white transition-colors cursor-pointer"
                >
                    ✕
                </button>
            {/if}
        </div>
        <button
            type="button"
            onclick={refreshRwaFeeds}
            class="tactile-btn px-3.5 py-2.5 rounded-xl text-[9px] font-mono font-bold uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer shrink-0"
        >
            Sync Pyth ↻
        </button>
        <div class="flex items-center gap-3 shrink-0 ml-1">
            <span
                class="text-[9px] font-bold uppercase tracking-widest transition-colors {isManaging ? 'text-[#18C6A5]' : 'text-neutral-500'}"
            >
                Manage Feeds
            </span>
            <button
                type="button"
                aria-label="Toggle Manage Feeds"
                onclick={() => {
                    isManaging = !isManaging;
                    if (!isManaging) rwaSearchQuery = '';
                }}
                class="w-10 h-5 rounded-full border transition-colors duration-300 relative cursor-pointer focus:outline-none shrink-0"
                style="background-color: {isManaging ? '#18C6A520' : '#11161f'}; border-color: {isManaging ? '#18C6A550' : 'rgba(255,255,255,0.15)'};"
            >
                <div
                    class="absolute top-[1px] w-4 h-4 rounded-full transition-all duration-300 shadow-sm"
                    style="background-color: {isManaging ? '#18C6A5' : '#737373'}; left: {isManaging ? '22px' : '1px'};"
                ></div>
            </button>
        </div>
    </div>

    {#if error}
        <div
            data-testid="rwa-oracle-error-banner"
            class="p-3.5 rounded-xl bg-red-950/25 border border-red-500/45 text-red-400 text-[10px] font-mono font-bold uppercase tracking-widest flex items-center justify-between"
        >
            <span>⚠ {error}</span>
            <button
                type="button"
                onclick={refreshRwaFeeds}
                class="tactile-btn px-2.5 py-1 rounded text-[8px] text-white cursor-pointer"
            >
                Retry
            </button>
        </div>
    {/if}

    {#if loading}
        <div class="text-neutral-500 text-[10px] font-mono animate-pulse py-4 text-center">
            Syncing Pyth Hermes Institutional Wall Street &amp; Commodity Oracles...
        </div>
    {:else}
        <div class="flex flex-col gap-2">
            {#if filteredRwas.length === 0}
                <div class="text-center py-6 flex flex-col items-center justify-center gap-4 border border-dashed border-white/10 rounded-2xl bg-[#0a0d12]">
                    <span class="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
                        No oracle feeds match "{rwaSearchQuery}"
                    </span>
                    {#if rwaSearchQuery.length > 1}
                        <button
                            type="button"
                            onclick={executeSearch}
                            disabled={isSearching}
                            class="tactile-btn px-5 py-2.5 border-[#18C6A5]/40 text-[#18C6A5] rounded-xl text-[9px] uppercase tracking-widest font-bold cursor-pointer disabled:opacity-50"
                        >
                            {#if isSearching}
                                Querying Oracle...
                            {:else}
                                Add {rwaSearchQuery.toUpperCase()} Feed
                            {/if}
                        </button>
                    {/if}
                </div>
            {/if}
            {#each filteredRwas as asset (asset.ticker)}
                <div
                    data-testid="rwa-row-{asset.ticker}"
                    class="tactile-card bg-[#0a0d12] border border-white/10 rounded-2xl overflow-hidden transition-all duration-300"
                    style="background-image: radial-gradient(ellipse at top left, {asset.hex}14, transparent 65%);"
                >
                    <div
                        class="flex flex-wrap items-center justify-between p-3.5 gap-3 {isManaging ? 'cursor-pointer' : ''} select-none"
                        onclick={() => (isManaging ? toggleSelection(asset.ticker) : null)}
                        role="button"
                        tabindex="0"
                    >
                        <div class="flex items-center gap-3.5">
                            <div
                                class="w-9 h-9 rounded-lg bg-[#11161f] border border-white/10 flex items-center justify-center text-xs shadow-inner font-black font-mono"
                                style="color: {asset.hex}; box-shadow: inset 0 0 10px {asset.hex}18;"
                            >
                                {#if asset.imgUrl}
                                    <img
                                        src={asset.imgUrl}
                                        class="w-5 h-5 object-contain drop-shadow-md"
                                        alt={asset.ticker}
                                    />
                                {:else}
                                    <span>{asset.ticker.slice(0, 4)}</span>
                                {/if}
                            </div>
                            <div class="flex flex-col">
                                <div class="flex items-center gap-2">
                                    <span class="text-xs font-bold tracking-wider text-white">
                                        {asset.name}
                                    </span>
                                    <span class="px-1.5 py-0.5 rounded bg-[#11161f] border border-white/10 text-[8px] font-mono text-neutral-400 uppercase">
                                        {asset.network}
                                    </span>
                                </div>
                                <span class="text-[9px] text-neutral-500 uppercase tracking-widest">
                                    {asset.category} • {asset.desc}
                                </span>
                            </div>
                        </div>
                        <div class="flex items-center gap-4 ml-auto">
                            {#if !isManaging}
                                <button
                                    type="button"
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        ui.routeToDexSwap('KAS', asset.ticker, '');
                                    }}
                                    class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-mono font-bold uppercase tracking-wider text-[#18C6A5] border-[#18C6A5]/35 cursor-pointer"
                                >
                                    [Swap 24/7]
                                </button>
                            {/if}
                            <div class="flex flex-col items-end">
                                {#if asset.price > 0}
                                    <span
                                        data-testid="rwa-price-{asset.ticker}"
                                        class="text-xs font-mono font-bold text-[#18C6A5] tabular-nums"
                                    >
                                        ${asset.price.toLocaleString(undefined, {
                                            minimumFractionDigits: fiatDecimals,
                                            maximumFractionDigits: fiatDecimals
                                        })}
                                    </span>
                                    <span
                                        class="text-[9px] font-mono tabular-nums {asset.change24h >= 0 ? 'text-[#18C6A5]' : 'text-red-400'}"
                                    >
                                        {asset.change24h >= 0 ? '▲' : '▼'} {Math.abs(asset.change24h).toFixed(2)}%
                                    </span>
                                {:else}
                                    <span class="text-[10px] font-mono font-bold text-amber-400 uppercase">
                                        AWAITING PYTH FEED
                                    </span>
                                {/if}
                            </div>
                            {#if isManaging}
                                <div class="pl-3 border-l border-white/10 flex items-center">
                                    <button
                                        type="button"
                                        aria-label="Toggle Token"
                                        onclick={(e) => {
                                            e.stopPropagation();
                                            toggleSelection(asset.ticker);
                                        }}
                                        class="w-10 h-5 rounded-full relative transition-colors border cursor-pointer focus:outline-none ml-2"
                                        style="background-color: {selectedRwas.includes(asset.ticker) ? '#18C6A520' : '#11161f'}; border-color: {selectedRwas.includes(asset.ticker) ? '#18C6A550' : 'rgba(255,255,255,0.15)'};"
                                    >
                                        <div
                                            class="absolute top-[1px] w-4 h-4 rounded-full transition-all shadow-sm"
                                            style="background-color: {selectedRwas.includes(asset.ticker) ? '#18C6A5' : '#737373'}; left: {selectedRwas.includes(asset.ticker) ? '22px' : '1px'};"
                                        ></div>
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