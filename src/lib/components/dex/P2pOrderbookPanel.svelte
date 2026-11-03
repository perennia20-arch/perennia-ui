<script lang="ts">
    import { fade } from 'svelte/transition';
    import { identity } from '$lib/stores/identity.svelte';
    import type { UnifiedAsset } from '$lib/stores/treasury.svelte';

    let {
        p2pSellAmount = $bindable(''),
        p2pBuyAmount = $bindable(''),
        p2pSellToken,
        p2pBuyToken,
        p2pOrders = [],
        isExecuting = false,
        isCancellingP2pId = null,
        swapError = null,
        ambientPrimaryHex = '#18C6A5',
        ambientSecondaryHex = '#3B82F6',
        onOpenTokenModal,
        onCreateP2pOffer,
        onFillP2pOrder,
        onCancelP2pOrder
    }: {
        p2pSellAmount: string;
        p2pBuyAmount: string;
        p2pSellToken: UnifiedAsset;
        p2pBuyToken: UnifiedAsset;
        p2pOrders: Array<{
            id: string;
            seller: string;
            sellToken: string;
            sellAmount: number;
            buyToken: string;
            buyAmount: number;
            rate: string;
            status: string;
        }>;
        isExecuting: boolean;
        isCancellingP2pId: string | null;
        swapError: string | null;
        ambientPrimaryHex: string;
        ambientSecondaryHex: string;
        onOpenTokenModal: (
            type:
                | 'pay'
                | 'receive'
                | 'lpA'
                | 'lpB'
                | 'lpExtra'
                | 'p2pSell'
                | 'p2pBuy',
            extraIdx?: number
        ) => void;
        onCreateP2pOffer: () => Promise<void>;
        onFillP2pOrder: (order: any) => Promise<void>;
        onCancelP2pOrder: (orderId: string) => Promise<void>;
    } = $props();

    function isOrderMaker(sellerAddress: string): boolean {
        if (!identity.activeAddress || !sellerAddress) return false;
        const cleanSeller = sellerAddress
            .trim()
            .toLowerCase()
            .replace(/^kaspa:/i, '');
        const cleanMe = identity.activeAddress
            .trim()
            .toLowerCase()
            .replace(/^kaspa:/i, '');
        return cleanSeller === cleanMe || Boolean(identity.isCorporateAdmin);
    }
</script>

<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" in:fade={{ duration: 150 }}>
    <div
        class="lg:col-span-5 bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 md:p-7 shadow-2xl flex flex-col gap-4"
        style="background-image: radial-gradient(ellipse at top left, {ambientPrimaryHex}14, transparent 65%);"
    >
        <div class="flex justify-between items-center border-b border-white/10 pb-3">
            <div class="flex flex-col">
                <h3 class="text-xs font-black uppercase tracking-widest text-white">
                    Deploy P2P Offer
                </h3>
                <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest mt-0.5">
                    Direct Peer-to-Peer Atomic P2P Swap
                </span>
            </div>
        </div>
        {#if swapError}
            <div class="bg-red-950/25 border border-red-500/40 p-3 rounded-xl text-center">
                <p class="text-red-400 text-[10px] uppercase tracking-widest font-bold">
                    {swapError}
                </p>
            </div>
        {/if}
        <div class="flex flex-col gap-2 bg-[#11161f] p-4 rounded-2xl border border-white/10">
            <span class="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
                You Sell (Lock in Atomic Offer)
            </span>
            <div class="flex justify-between items-center gap-3">
                <input
                    type="number"
                    bind:value={p2pSellAmount}
                    placeholder="0.00"
                    class="w-full bg-transparent text-2xl font-bold font-mono text-white outline-none placeholder-neutral-700"
                />
                <button
                    type="button"
                    onclick={() => onOpenTokenModal('p2pSell')}
                    class="tactile-btn shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl cursor-pointer"
                >
                    <span class="font-bold text-white text-xs tracking-wider leading-none">
                        {p2pSellToken.ticker}
                    </span>
                </button>
            </div>
        </div>
        <div class="flex flex-col gap-2 bg-[#11161f] p-4 rounded-2xl border border-white/10">
            <span class="text-[9px] font-bold uppercase tracking-widest" style="color: {ambientSecondaryHex};">
                You Require (Counterparty Settlement)
            </span>
            <div class="flex justify-between items-center gap-3">
                <input
                    type="number"
                    bind:value={p2pBuyAmount}
                    placeholder="0.00"
                    class="w-full bg-transparent text-2xl font-bold font-mono text-white outline-none placeholder-neutral-700"
                />
                <button
                    type="button"
                    onclick={() => onOpenTokenModal('p2pBuy')}
                    class="tactile-btn shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl cursor-pointer"
                >
                    <span class="font-bold text-white text-xs tracking-wider leading-none">
                        {p2pBuyToken.ticker}
                    </span>
                </button>
            </div>
        </div>
        <button
            type="button"
            onclick={onCreateP2pOffer}
            disabled={!p2pSellAmount || !p2pBuyAmount || isExecuting}
            class="tactile-btn w-full py-4 mt-1 rounded-2xl text-white text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
            style="border-color: {ambientSecondaryHex}50; background-image: radial-gradient(ellipse at center, {ambientSecondaryHex}22, transparent 70%);"
        >
            Sign &amp; Deploy Atomic P2P Contract
        </button>
    </div>
    <div
        class="lg:col-span-7 bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 md:p-7 shadow-2xl flex flex-col gap-4 min-h-[420px]"
        style="background-image: radial-gradient(ellipse at bottom right, {ambientSecondaryHex}14, transparent 65%);"
    >
        <div class="flex justify-between items-center border-b border-white/10 pb-3">
            <h3 class="text-xs font-black uppercase tracking-widest text-white">
                Active P2P Contracts on DAG
            </h3>
            <span class="text-[9px] font-mono text-[#18C6A5] uppercase">
                {p2pOrders.length} OPEN OFFERS
            </span>
        </div>
        <div class="flex flex-col gap-3 max-h-[380px] overflow-y-auto hide-scrollbar">
            {#each p2pOrders as order (order.id)}
                {@const isMine = isOrderMaker(order.seller)}
                <div class="tactile-card bg-[#11161f] border border-white/10 p-4 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4">
                    <div class="flex flex-col w-full md:w-auto">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">
                                Maker: {order.seller?.slice(0, 14)}...
                            </span>
                            {#if isMine}
                                <span class="px-2 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/35 text-[#18C6A5] text-[8px] font-bold uppercase">
                                    YOUR OFFER
                                </span>
                            {/if}
                        </div>
                        <div class="flex items-center gap-2 text-sm">
                            <span class="font-bold text-white">
                                {order.sellAmount} {order.sellToken}
                            </span>
                            <span class="text-neutral-500">→</span>
                            <span class="font-bold text-[#18C6A5]">
                                {order.buyAmount} {order.buyToken}
                            </span>
                        </div>
                        <span class="text-[9px] font-mono text-neutral-400 mt-1">
                            Implied Rate: {order.rate} {order.buyToken}/{order.sellToken}
                        </span>
                    </div>
                    <div class="flex items-center gap-2 w-full md:w-auto justify-end">
                        {#if isMine}
                            <button
                                type="button"
                                onclick={() => onCancelP2pOrder(order.id)}
                                disabled={isCancellingP2pId === order.id}
                                class="tactile-btn px-4 py-2.5 text-red-400 border-red-500/35 text-[9px] font-bold uppercase tracking-widest rounded-xl cursor-pointer disabled:opacity-40"
                            >
                                {isCancellingP2pId === order.id ? 'Cancelling...' : '[Cancel Offer]'}
                            </button>
                        {/if}
                        <button
                            type="button"
                            onclick={() => onFillP2pOrder(order)}
                            disabled={isExecuting}
                            class="tactile-btn flex-1 md:flex-none px-5 py-2.5 text-[#18C6A5] border-[#18C6A5]/40 text-[10px] font-bold uppercase tracking-widest rounded-xl cursor-pointer disabled:opacity-40"
                        >
                            Execute Atomic P2P
                        </button>
                    </div>
                </div>
            {/each}
            {#if p2pOrders.length === 0}
                <div class="flex-1 flex items-center justify-center text-center text-[10px] font-mono text-neutral-500 py-16 border border-dashed border-white/10 rounded-2xl">
                    No open P2P contracts currently resting on the DAG.
                </div>
            {/if}
        </div>
    </div>
</div>