<script lang="ts">
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { operations } from '$lib/stores/operations.svelte';
    import { treasury } from '$lib/stores/treasury.svelte';
    import type { AssetBucketTelemetry } from '$lib/stores/type';
    let {
        displayHashrate = 0,
        effortData = { segments: [], totalHash: 0 },
        displayedBuckets = []
    }: {
        displayHashrate: number;
        effortData: {
            segments: Array<{
                id: string;
                name: string;
                pct: number;
                offset: number;
                hex: string;
            }>;
            totalHash: number;
        };
        displayedBuckets: AssetBucketTelemetry[];
    } = $props();
    let userRoutedAssets = $derived.by(() => {
        const routed = new Set<string>();
        for (const sec of operations.sectors || []) {
            if (
                (sec.allocationPercentage || 0) <= 0 &&
                (sec.pendingKaspa || 0) <= 0
            ) {
                continue;
            }
            const primary = sec.settlementConfig?.targetAsset?.ticker;
            if (primary && primary.trim().toUpperCase() !== 'KAS') {
                routed.add(primary.trim().toUpperCase());
            }
            if (Array.isArray(sec.settlementConfig?.targetAssets)) {
                for (const t of sec.settlementConfig.targetAssets) {
                    const tick = t?.ticker?.trim().toUpperCase();
                    if (tick && tick !== 'KAS') {
                        routed.add(tick);
                    }
                }
            }
            if (
                sec.settlementConfig?.plantWeights &&
                typeof sec.settlementConfig.plantWeights === 'object'
            ) {
                for (const k of Object.keys(sec.settlementConfig.plantWeights)) {
                    const tick = k.trim().toUpperCase();
                    if (tick && tick !== 'KAS') {
                        routed.add(tick);
                    }
                }
            }
        }
        return routed;
    });
    let userActiveBuckets = $derived(
        displayedBuckets.filter((b) => {
            const ticker = String(b.asset || '').trim().toUpperCase();
            return ticker !== 'KAS' && userRoutedAssets.has(ticker);
        })
    );
</script>
<div
    class="flex flex-col gap-3 lg:col-span-3 xl:col-span-2 min-w-0 bg-[#0a0d12] border border-white/10 rounded-[32px] p-4 shadow-2xl pb-8 w-full relative z-10"
    data-tour="bell-telemetry"
>
    {#if identity.isWalletConnected || ui.isTutorialActive}
        <div class="w-full flex flex-col">
            <div
                class="flex items-center justify-between border-b border-white/10 pb-2.5 mb-3 pointer-events-none"
            >
                <h2
                    class="text-[10px] font-bold uppercase tracking-widest text-neutral-400"
                >
                    Payout Split
                </h2>
            </div>
            <div class="flex flex-col items-center pointer-events-auto">
                <div class="relative w-28 h-28 mb-3 pointer-events-none">
                    <svg
                        viewBox="0 0 100 100"
                        class="w-full h-full transform -rotate-90"
                    >
                        <circle
                            cx="50"
                            cy="50"
                            r="42"
                            fill="transparent"
                            stroke="#161d29"
                            stroke-width="6"
                        ></circle>
                        {#if effortData.segments.length === 0}
                            <circle
                                cx="50"
                                cy="50"
                                r="42"
                                fill="transparent"
                                stroke="#262f40"
                                stroke-width="6"
                                stroke-dasharray="263.89 0"
                            ></circle>
                        {/if}
                        {#each effortData.segments as seg}
                            <circle
                                cx="50"
                                cy="50"
                                r="42"
                                fill="transparent"
                                stroke="{seg.hex}70"
                                stroke-width="6"
                                stroke-dasharray="{seg.pct * 2.6389} {263.89 -
                                    seg.pct * 2.6389}"
                                stroke-dashoffset={-(seg.offset * 2.6389)}
                                class="transition-all duration-1000 ease-out"
                                stroke-linecap="round"
                                style="filter: drop-shadow(0 0 8px {seg.hex}40);"
                            ></circle>
                        {/each}
                    </svg>
                    <div
                        class="absolute inset-0 flex flex-col items-center justify-center"
                    >
                        <span
                            class="text-xl font-mono font-light text-white leading-none tabular-nums"
                        >
                            {displayHashrate.toFixed(2)}
                        </span>
                        <span
                            class="text-[8px] font-bold uppercase tracking-widest text-neutral-400 mt-0.5"
                        >
                            TH/s
                        </span>
                    </div>
                </div>
                <div class="w-full flex flex-col gap-1.5 pointer-events-auto">
                    <div class="flex flex-col gap-1.5 w-full">
                        {#each effortData.segments as seg}
                            <div
                                class="flex items-stretch gap-1.5 w-full group"
                            >
                                <div
                                    class="flex-1 bg-[#11161f] hover:bg-[#161d29] border border-white/10 rounded-xl p-2 flex justify-between items-center transition-colors min-w-0"
                                >
                                    <div
                                        class="flex items-center gap-2 min-w-0"
                                    >
                                        <div
                                            class="w-2 h-2 rounded-full shrink-0"
                                            style="background-color: {seg.hex}; box-shadow: 0 0 6px {seg.hex}40;"
                                        ></div>
                                        <span
                                            class="text-[10px] font-bold uppercase tracking-wider text-neutral-200 truncate"
                                        >
                                            {seg.name}
                                        </span>
                                    </div>
                                    <span
                                        class="text-[10px] font-bold font-mono text-white shrink-0 ml-2 tabular-nums"
                                    >
                                        {seg.pct.toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                        {/each}
                        {#if effortData.segments.length === 0}
                            <div
                                class="text-center text-[9px] font-mono text-neutral-400 uppercase tracking-widest py-2 px-2 border border-dashed border-white/10 rounded-xl"
                            >
                                100% KAS
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        </div>
        <div
            class="w-full flex flex-col gap-2.5 border-t border-white/10 pt-3 mb-2"
        >
            <div
                class="bg-[#11161f] border border-white/10 rounded-2xl p-3 shadow-inner flex flex-col gap-0.5"
                style="background-image: radial-gradient(ellipse at top, rgba(24, 198, 165, 0.08), transparent 70%);"
            >
                <div class="flex items-center justify-between gap-1">
                    <span
                        class="text-[9px] font-bold uppercase tracking-wider text-[#18C6A5] flex items-center gap-1.5 truncate"
                    >
                        <span
                            class="w-1.5 h-1.5 rounded-full bg-[#18C6A5] animate-pulse shrink-0"
                        ></span>
                        Next Payout
                    </span>
                </div>
                <div
                    class="text-lg font-mono font-black text-white tracking-wider text-center py-0.5 tabular-nums"
                >
                    {operations.formatEpochCountdown()}
                </div>
                <div
                    class="text-[8px] font-mono text-neutral-400 text-center uppercase tracking-wider"
                >
                    
                </div>
            </div>
            <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between gap-1 px-0.5">
                    <span
                        class="text-[9px] font-bold uppercase tracking-wider text-neutral-400 truncate"
                    >
                        Pending Splits
                    </span>
                    <span class="text-[8px] font-mono text-neutral-500 shrink-0">
                        {userActiveBuckets.length} Active
                    </span>
                </div>
                <div
                    data-testid="pool-buckets-scroll-container"
                    class="flex flex-col gap-2.5 pr-0.5"
                >
                    {#if userActiveBuckets.length === 0}
                        <div
                            class="bg-[#11161f]/60 border border-dashed border-white/10 rounded-xl p-3 text-center flex flex-col gap-1"
                        >
                            <span
                                class="text-[9px] font-mono text-neutral-400 uppercase tracking-wider"
                            >
                                No pending splits
                            </span>
                            <span
                                class="text-[8px] font-mono text-neutral-500 leading-relaxed"
                            >
                                
                            </span>
                        </div>
                    {:else}
                        {#each userActiveBuckets as bucket (bucket.asset)}
                            {@const assetTheme =
                                treasury.getAsset(bucket.asset).theme?.hex ||
                                '#18C6A5'}
                            {@const barWidth = Math.min(
                                100,
                                Math.max(0, bucket.weightPct)
                            )}
                            {@const isReady =
                                bucket.weightPct >= 100 ||
                                bucket.status === 'READY_FOR_BELL'}
                            {@const minKas =
                                bucket.minProfitableKas > 0
                                    ? bucket.minProfitableKas
                                    : (operations.getBucket(bucket.asset)
                                          ?.minProfitableKas ?? 47.4)}
                            {@const neededKas = Math.max(
                                0,
                                minKas - (bucket.pendingKas || 0)
                            )}
                            {@const bucketBadge =
                                ui.microBadges[`bucket_${bucket.asset}`]}
                            <div
                                data-testid="bucket-card-{bucket.asset}"
                                class="tactile-card bg-[#11161f] border border-white/10 rounded-xl p-3 flex flex-col gap-2 relative"
                            >
                                {#if bucketBadge}
                                    <div
                                        class="micro-confirm-badge absolute top-2 right-2 z-30 px-2 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/60 text-[#18C6A5] text-[8px] font-mono font-black uppercase"
                                    >
                                        {bucketBadge.label}
                                    </div>
                                {/if}
                                <div
                                    class="flex items-center justify-between gap-2 min-w-0"
                                >
                                    <div
                                        class="flex items-center gap-1.5 min-w-0"
                                    >
                                        <span
                                            class="w-2 h-2 rounded-full shrink-0"
                                            style="background-color: {assetTheme};"
                                        ></span>
                                        <span
                                            class="text-xs font-bold font-mono text-white truncate"
                                        >
                                            {bucket.asset}
                                        </span>
                                    </div>
                                    <span
                                        class="text-[10px] font-mono font-black whitespace-nowrap shrink-0 tabular-nums {isReady
                                            ? 'text-[#18C6A5]'
                                            : 'text-neutral-300'}"
                                    >
                                        {bucket.weightPct.toFixed(1)}%
                                    </span>
                                </div>
                                <div
                                    class="w-full bg-[#0a0d12] rounded-full h-1.5 overflow-hidden border border-white/10"
                                >
                                    <div
                                        class="h-full transition-all duration-500"
                                        style="width: {barWidth}%; background-color: {isReady
                                            ? '#18C6A5'
                                            : assetTheme};"
                                    ></div>
                                </div>
                                <div
                                    class="flex justify-between items-center gap-1 text-[9px] font-mono text-neutral-400"
                                >
                                    <span class="tabular-nums truncate">
                                        {bucket.pendingKas.toFixed(1)} / {minKas.toFixed(
                                            1
                                        )} KAS
                                    </span>
                                    <span
                                        class="uppercase font-bold shrink-0 {isReady
                                            ? 'text-[#18C6A5]'
                                            : 'text-neutral-300'}"
                                    >
                                        {isReady ? 'READY' : 'FILLING'}
                                    </span>
                                </div>
                                {#if !isReady && neededKas > 0 && bucket.asset !== 'USD'}
                                    <button
                                        type="button"
                                        onclick={() =>
                                            ui.triggerBucketBoost(
                                                bucket.asset,
                                                neededKas
                                            )}
                                        class="tactile-btn mobile-touch-target w-full py-2.5 lg:py-1.5 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider text-[#18C6A5] hover:text-white cursor-pointer"
                                    >
                                        Boost +{neededKas.toFixed(1)} KAS
                                    </button>
                                {/if}
                            </div>
                        {/each}
                    {/if}
                </div>
            </div>
        </div>
    {/if}
    <div class="mt-4 pointer-events-none flex flex-col gap-3 w-full">
        <div
            class="flex items-center justify-between border-t border-white/10 pt-3"
        >
            <h2
                class="text-[10px] font-bold uppercase tracking-widest text-neutral-400"
            >
                NODE SYNC
            </h2>
            <span
                class="text-[9px] font-mono flex items-center gap-1.5 {operations.globalNodeStatus ===
                'connected'
                    ? 'text-[#18C6A5]'
                    : operations.globalNodeStatus === 'unreachable'
                      ? 'text-amber-500'
                      : 'text-neutral-500'} transition-colors"
            >
                <div
                    class="w-1.5 h-1.5 rounded-full {operations.globalNodeStatus ===
                    'connected'
                        ? 'bg-[#18C6A5] animate-pulse'
                        : operations.globalNodeStatus === 'unreachable'
                          ? 'bg-amber-500'
                          : 'bg-neutral-600'}"
                ></div>
                {operations.globalNodeStatus === 'connected'
                    ? 'ONLINE'
                    : 'OFFLINE'}
            </span>
        </div>
    </div>
</div>