<script lang="ts">
    import { onMount } from 'svelte';

    let rwaAssets: Array<{ ticker: string, price: string, publishTime: string }> = [];
    let loading = true;
    let error = '';

    onMount(async () => {
        try {
            const res = await fetch('/api/prices/rwa');
            const data = await res.json();
            if (data.success) {
                rwaAssets = data.assets;
            } else {
                error = data.error;
            }
        } catch (e: any) {
            error = "Failed to fetch oracle data";
        } finally {
            loading = false;
        }
    });
</script>

<div class="mt-8 border-t border-gray-800 pt-6">
    <h3 class="text-sm font-bold text-gray-400 mb-4 tracking-widest uppercase">Real-World Assets (Oracle Feeds)</h3>
    
    {#if loading}
        <div class="text-gray-500 text-sm animate-pulse">Syncing Pyth Network Oracles...</div>
    {:else if error}
        <div class="text-red-500 text-sm">{error}</div>
    {:else}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            {#each rwaAssets as asset}
                <div class="bg-gray-900 border border-gray-800 rounded-lg p-4 flex justify-between items-center hover:border-gray-600 transition-colors">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-bold">
                            {asset.ticker}
                        </div>
                        <div>
                            <p class="text-gray-200 font-medium tracking-wide">
                                {#if asset.ticker === 'XAU'} Gold (Oz)
                                {:else if asset.ticker === 'XAG'} Silver (Oz)
                                {:else if asset.ticker === 'SPY'} S&P 500 ETF
                                {:else if asset.ticker === 'AAPL'} Apple Inc.
                                {:else} {asset.ticker} {/if}
                            </p>
                            <p class="text-xs text-gray-500">Live Pyth Oracle</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-lg font-mono text-green-400">${asset.price}</p>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>