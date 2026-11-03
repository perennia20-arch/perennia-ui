<script lang="ts">
    import { fade } from 'svelte/transition';

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
</script>

<div
    data-testid="director-payout-queues-tab"
    class="flex flex-col gap-6"
    in:fade={{ duration: 150 }}
>
    <div class="bg-[#0a0d12] border border-white/10 rounded-[24px] p-5 flex flex-col gap-4 shadow-2xl">
        <div class="flex items-center justify-between border-b border-white/10 pb-3">
            <div class="flex flex-col">
                <span class="text-xs font-black uppercase tracking-widest text-[#18C6A5]">
                    01. Incoming Sovereign Wire / ACH On-Ramp Orders ({fiatOnrampOrders.length})
                </span>
                <span class="text-[9px] text-neutral-400">
                    Verify incoming bank wire memo and release KAS / Token conversion legs to the user's vault
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
                        <th class="py-2.5 px-3">Est. KAS</th>
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
                                {Number(ord.estimated_kas || 0).toFixed(2)} KAS
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
                                        {isProcessingOrderId === ord.order_id ? 'Crediting...' : 'Confirm Wire & Credit ✓'}
                                    </button>
                                {:else}
                                    <span class="text-[9px] text-[#18C6A5] font-bold">SETTLED ✓</span>
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
                    Attach commercial bank ACH / Fedwire trace numbers to advance payouts to Stage 4 Dispatched
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
                                {Number(p.amount_crypto || 0).toFixed(2)} {p.source_asset}
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
                                                    traceInputs[p.payout_id] || `FED-${Date.now()}`
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