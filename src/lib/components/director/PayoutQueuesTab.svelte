<script lang="ts">
    import { fade } from 'svelte/transition';
    import { ui } from '$lib/stores/ui.svelte';
    import { operations } from '$lib/stores/operations.svelte';
    import { treasury } from '$lib/stores/treasury.svelte';
    let {
        fiatOnrampOrders = [],
        fiatOfframpQueue = [],
        l1PayoutQueue = [],
        traceInputs = $bindable({}),
        isProcessingOrderId = null,
        onConfirmWireOnramp = async (_orderId: string) => {},
        onMarkFiatDispatched = async (_payoutId: string, _traceId: string) => {},
        onRetryL1Payout = async (_payoutId: string) => {}
    }: {
        fiatOnrampOrders: any[];
        fiatOfframpQueue: any[];
        l1PayoutQueue: any[];
        traceInputs: Record<string, string>;
        isProcessingOrderId: string | null;
        onConfirmWireOnramp: (orderId: string) => Promise<void>;
        onMarkFiatDispatched: (payoutId: string, traceId: string) => Promise<void>;
        onRetryL1Payout: (payoutId: string) => Promise<void>;
    } = $props();
    let allGlobalBuckets = $derived(operations.allGlobalPoolBuckets || []);
    let totalGlobalPendingKas = $derived(
        allGlobalBuckets.reduce((sum, b) => sum + Number(b.pendingKas || 0), 0)
    );
    let totalGlobalPendingUsd = $derived(
        allGlobalBuckets.reduce((sum, b) => sum + Number(b.pendingUsd || 0), 0)
    );
    let readyGlobalBucketCount = $derived(
        allGlobalBuckets.filter(
            (b) => b.weightPct >= 100 || b.status === 'READY_FOR_BELL'
        ).length
    );
    let fillingGlobalBucketCount = $derived(
        allGlobalBuckets.filter(
            (b) => Number(b.pendingKas || 0) > 0 && b.weightPct < 100
        ).length
    );
</script>
<div
    data-testid="director-payout-queues-tab"
    class="flex flex-col gap-6"
    in:fade={{ duration: 150 }}
>
    <div
        data-testid="director-global-18-buckets-card"
        class="bg-[#0a0d12] border border-white/10 rounded-[24px] p-5 flex flex-col gap-4 shadow-2xl"
    >
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div class="flex flex-col">
                <span class="text-xs font-black uppercase tracking-widest text-[#18C6A5]">
                    00. Master Pool Batch Buckets &amp; 18 Global Settlement Queues ({allGlobalBuckets.length})
                </span>
                <span class="text-[9px] text-neutral-400">
                    Global pool-wide pending KAS volume, LP capacity coverage, and 22:00 UTC batch readiness across all 18 pool buckets
                </span>
            </div>
            <span class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/40 text-[9px] font-mono font-bold text-[#18C6A5]">
                22:00 UTC BELL IN {operations.formatEpochCountdown()}
            </span>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
            <div class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex flex-col gap-0.5">
                <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-400">
                    Master Pool Queues
                </span>
                <span class="text-base font-black text-white tabular-nums">
                    {allGlobalBuckets.length} Global Buckets
                </span>
                <span class="text-[8px] text-[#18C6A5]">
                    {readyGlobalBucketCount} Armed • {fillingGlobalBucketCount} Filling
                </span>
            </div>
            <div class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex flex-col gap-0.5">
                <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-400">
                    Global Queued KAS
                </span>
                <span class="text-base font-black text-[#18C6A5] tabular-nums">
                    {totalGlobalPendingKas.toFixed(2)} KAS
                </span>
                <span class="text-[8px] text-neutral-400">
                    ≈ ${totalGlobalPendingUsd.toFixed(2)} USD Pending
                </span>
            </div>
            <div class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex flex-col gap-0.5">
                <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-400">
                    Pending Fiat Orders
                </span>
                <span class="text-base font-black text-white tabular-nums">
                    {fiatOnrampOrders.length} Buy / {fiatOfframpQueue.length} Sell
                </span>
                <span class="text-[8px] text-blue-400">
                    ACH &amp; FedWire Queue
                </span>
            </div>
            <div class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex flex-col gap-0.5">
                <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-400">
                    Multi-Chain L1 Queue
                </span>
                <span class="text-base font-black text-amber-400 tabular-nums">
                    {l1PayoutQueue.length} L1 Payouts
                </span>
                <span class="text-[8px] text-neutral-400">
                    Direct On-Chain Dispatch
                </span>
            </div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
            {#each allGlobalBuckets as bucket (bucket.asset)}
                {@const assetTheme =
                    treasury.getAsset(bucket.asset).theme?.hex || '#18C6A5'}
                {@const barWidth = Math.min(100, Math.max(0, bucket.weightPct))}
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
                <div
                    data-testid="director-master-bucket-{bucket.asset}"
                    class="bg-[#11161f] border border-white/10 rounded-xl p-3 flex flex-col gap-2"
                >
                    <div class="flex items-center justify-between gap-1">
                        <div class="flex items-center gap-1.5 min-w-0">
                            <span
                                class="w-2 h-2 rounded-full shrink-0"
                                style="background-color: {assetTheme};"
                            ></span>
                            <span class="text-xs font-bold font-mono text-white truncate">
                                {bucket.asset}
                            </span>
                        </div>
                        <span
                            class="text-[9px] font-mono font-black tabular-nums {isReady
                                ? 'text-[#18C6A5]'
                                : 'text-neutral-300'}"
                        >
                            {bucket.weightPct.toFixed(1)}%
                        </span>
                    </div>
                    <div class="w-full bg-[#0a0d12] rounded-full h-1.5 overflow-hidden border border-white/10">
                        <div
                            class="h-full transition-all duration-500"
                            style="width: {barWidth}%; background-color: {isReady
                                ? '#18C6A5'
                                : assetTheme};"
                        ></div>
                    </div>
                    <div class="flex items-center justify-between text-[8px] font-mono text-neutral-400">
                        <span class="tabular-nums truncate">
                            {bucket.pendingKas.toFixed(1)} / {minKas.toFixed(1)} KAS
                        </span>
                        <span
                            class="uppercase font-bold {isReady
                                ? 'text-[#18C6A5]'
                                : 'text-neutral-500'}"
                        >
                            {isReady ? 'READY' : 'QUEUE'}
                        </span>
                    </div>
                    {#if !isReady && neededKas > 0 && bucket.asset !== 'USD'}
                        <button
                            type="button"
                            onclick={() =>
                                ui.triggerBucketBoost(bucket.asset, neededKas)}
                            class="tactile-btn w-full py-1 rounded-lg text-[8px] font-mono font-bold uppercase text-[#18C6A5] hover:text-white cursor-pointer"
                        >
                            [Boost +{neededKas.toFixed(1)} KAS]
                        </button>
                    {/if}
                </div>
            {/each}
        </div>
    </div>
    <div class="bg-[#0a0d12] border border-white/10 rounded-[24px] p-5 flex flex-col gap-4 shadow-2xl">
        <div class="flex items-center justify-between border-b border-white/10 pb-3">
            <div class="flex flex-col">
                <span class="text-xs font-black uppercase tracking-widest text-[#18C6A5]">
                    01. Incoming Wire / ACH On-Ramp Orders ({fiatOnrampOrders.length})
                </span>
                <span class="text-[9px] text-neutral-400">
                    Verify incoming bank wire memo and release KAS / Token conversion legs to the user's wallet
                </span>
            </div>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs font-mono">
                <thead>
                    <tr class="border-b border-white/10 text-[9px] uppercase tracking-widest text-neutral-400">
                        <th class="py-2.5 px-3">Order / Memo</th>
                        <th class="py-2.5 px-3">Wallet</th>
                        <th class="py-2.5 px-3">Fiat USD</th>
                        <th class="py-2.5 px-3">Est. Output</th>
                        <th class="py-2.5 px-3">Target</th>
                        <th class="py-2.5 px-3">Status</th>
                        <th class="py-2.5 px-3 text-right">Reconcile</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-white/5 text-[11px]">
                    {#each fiatOnrampOrders as ord (ord.order_id)}
                        <tr class="hover:bg-[#11161f]/60 transition-colors">
                            <td class="py-2.5 px-3 font-bold text-white">
                                {ord.wire_memo || ord.order_id}
                            </td>
                            <td class="py-2.5 px-3 text-neutral-300 max-w-[200px] truncate">
                                {ord.wallet_address}
                            </td>
                            <td class="py-2.5 px-3 text-[#18C6A5] font-bold">
                                ${Number(ord.fiat_amount_usd || 0).toFixed(2)}
                            </td>
                            <td class="py-2.5 px-3 text-white">
                                {Number(
                                    ord.estimated_tokens ?? ord.estimated_kas ?? 0
                                ).toFixed(4)}
                                {ord.target_asset || 'KAS'}
                            </td>
                            <td class="py-2.5 px-3 text-blue-400">
                                {ord.settlement_target || 'LEDGER_KAS'}
                            </td>
                            <td class="py-2.5 px-3">
                                <span class="px-2 py-0.5 rounded bg-[#11161f] border border-white/10 text-[9px] uppercase text-amber-400">
                                    {ord.status}
                                </span>
                            </td>
                            <td class="py-2.5 px-3 text-right">
                                {#if ord.status !== 'COMPLETED'}
                                    <button
                                        type="button"
                                        disabled={isProcessingOrderId === ord.order_id}
                                        onclick={() => onConfirmWireOnramp(ord.order_id)}
                                        class="tactile-btn px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer disabled:opacity-40"
                                    >
                                        {isProcessingOrderId === ord.order_id
                                            ? 'Crediting...'
                                            : 'Confirm Wire & Credit ✓'}
                                    </button>
                                {:else}
                                    <span class="text-[9px] text-[#18C6A5] font-bold">
                                        SETTLED ✓
                                    </span>
                                {/if}
                            </td>
                        </tr>
                    {/each}
                    {#if fiatOnrampOrders.length === 0}
                        <tr>
                            <td colspan="7" class="py-6 text-center text-neutral-500 text-[10px] uppercase tracking-widest">
                                No pending Fiat On-Ramp orders.
                            </td>
                        </tr>
                    {/if}
                </tbody>
            </table>
        </div>
    </div>
    <div class="bg-[#0a0d12] border border-white/10 rounded-[24px] p-5 flex flex-col gap-4 shadow-2xl">
        <div class="flex items-center justify-between border-b border-white/10 pb-3">
            <div class="flex flex-col">
                <span class="text-xs font-black uppercase tracking-widest text-blue-400">
                    02. Outgoing Fiat Off-Ramp ACH / Wire Treasury Queue ({fiatOfframpQueue.length})
                </span>
                <span class="text-[9px] text-neutral-400">
                    Attach commercial bank ACH / FedWire trace numbers to advance payouts to Stage 4 Dispatched
                </span>
            </div>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs font-mono">
                <thead>
                    <tr class="border-b border-white/10 text-[9px] uppercase tracking-widest text-neutral-400">
                        <th class="py-2.5 px-3">Payout ID</th>
                        <th class="py-2.5 px-3">Source Asset</th>
                        <th class="py-2.5 px-3">Net Fiat USD</th>
                        <th class="py-2.5 px-3">Rail / Last4</th>
                        <th class="py-2.5 px-3">Status</th>
                        <th class="py-2.5 px-3 text-right">Bank Trace &amp; Dispatch</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-white/5 text-[11px]">
                    {#each fiatOfframpQueue as p (p.payout_id)}
                        <tr class="hover:bg-[#11161f]/60 transition-colors">
                            <td class="py-2.5 px-3 font-bold text-white">{p.payout_id}</td>
                            <td class="py-2.5 px-3 text-neutral-300">
                                {Number(p.amount_crypto || 0).toFixed(4)} {p.source_asset}
                            </td>
                            <td class="py-2.5 px-3 text-[#18C6A5] font-bold">
                                ${Number(p.net_fiat_usd || 0).toFixed(2)}
                            </td>
                            <td class="py-2.5 px-3 text-white">
                                {p.payout_method} *{p.bank_last4}
                            </td>
                            <td class="py-2.5 px-3 text-amber-400">{p.status}</td>
                            <td class="py-2.5 px-3 text-right">
                                {#if !String(p.status || '').includes('DISPATCHED')}
                                    <div class="flex items-center justify-end gap-2">
                                        <input
                                            type="text"
                                            bind:value={traceInputs[p.payout_id]}
                                            placeholder="ACH/Wire Trace #"
                                            class="bg-[#11161f] border border-white/15 rounded-lg px-2.5 py-1 text-[10px] text-white outline-none w-36"
                                        />
                                        <button
                                            type="button"
                                            disabled={isProcessingOrderId === p.payout_id}
                                            onclick={() =>
                                                onMarkFiatDispatched(
                                                    p.payout_id,
                                                    traceInputs[p.payout_id] ||
                                                        `FED-${Date.now()}`
                                                )}
                                            class="tactile-btn px-3 py-1 rounded-lg text-[9px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer"
                                        >
                                            Dispatch ✓
                                        </button>
                                    </div>
                                {:else}
                                    <span class="text-[9px] text-[#18C6A5]">
                                        Trace: {p.trace_id || 'CONFIRMED'}
                                    </span>
                                {/if}
                            </td>
                        </tr>
                    {/each}
                    {#if fiatOfframpQueue.length === 0}
                        <tr>
                            <td colspan="6" class="py-6 text-center text-neutral-500 text-[10px] uppercase tracking-widest">
                                No pending Fiat Off-Ramp payouts.
                            </td>
                        </tr>
                    {/if}
                </tbody>
            </table>
        </div>
    </div>
    <div class="bg-[#0a0d12] border border-white/10 rounded-[24px] p-5 flex flex-col gap-4 shadow-2xl">
        <div class="flex items-center justify-between border-b border-white/10 pb-3">
            <span class="text-xs font-black uppercase tracking-widest text-amber-400">
                03. Multi-Chain L1 Payout Queue ({l1PayoutQueue.length})
            </span>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs font-mono">
                <thead>
                    <tr class="border-b border-white/10 text-[9px] uppercase tracking-widest text-neutral-400">
                        <th class="py-2.5 px-3">Payout ID</th>
                        <th class="py-2.5 px-3">Asset / Net</th>
                        <th class="py-2.5 px-3">Destination</th>
                        <th class="py-2.5 px-3">Amount</th>
                        <th class="py-2.5 px-3">Status</th>
                        <th class="py-2.5 px-3 text-right">Action</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-white/5 text-[11px]">
                    {#each l1PayoutQueue as l1 (l1.payout_id)}
                        <tr class="hover:bg-[#11161f]/60 transition-colors">
                            <td class="py-2.5 px-3 font-bold text-white">{l1.payout_id}</td>
                            <td class="py-2.5 px-3 text-[#18C6A5] font-bold">
                                {l1.asset_ticker} ({l1.network})
                            </td>
                            <td class="py-2.5 px-3 text-neutral-300 max-w-[220px] truncate">
                                {l1.destination_address}
                            </td>
                            <td class="py-2.5 px-3 text-white">
                                {Number(l1.amount_tokens || 0).toFixed(6)}
                            </td>
                            <td class="py-2.5 px-3 text-amber-400">{l1.status}</td>
                            <td class="py-2.5 px-3 text-right">
                                <button
                                    type="button"
                                    disabled={isProcessingOrderId === l1.payout_id}
                                    onclick={() => onRetryL1Payout(l1.payout_id)}
                                    class="tactile-btn px-3 py-1 rounded-lg text-[9px] font-bold uppercase text-white border-white/15 cursor-pointer"
                                >
                                    Re-Broadcast ↻
                                </button>
                            </td>
                        </tr>
                    {/each}
                    {#if l1PayoutQueue.length === 0}
                        <tr>
                            <td colspan="6" class="py-6 text-center text-neutral-500 text-[10px] uppercase tracking-widest">
                                L1 Payout Queue is clear.
                            </td>
                        </tr>
                    {/if}
                </tbody>
            </table>
        </div>
    </div>
</div>