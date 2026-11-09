<!-- WINDOWS (FRONTEND): C:\Users\send2\perennia-v5\perennia-frontend\src\lib\components\dex\P2pOrderbookPanel.svelte -->
<script lang="ts">
    import { fade } from 'svelte/transition';
    import { identity } from '$lib/stores/identity.svelte';
    import { treasury, type UnifiedAsset } from '$lib/stores/treasury.svelte';

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
            mode:
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

    let sellHex = $derived(
        p2pSellToken?.theme?.hex || ambientPrimaryHex || '#18C6A5'
    );
    let buyHex = $derived(
        p2pBuyToken?.theme?.hex || ambientSecondaryHex || '#3B82F6'
    );

    let sellUsdValue = $derived(
        (parseFloat(p2pSellAmount) || 0) * (p2pSellToken?.spotPrice || 0)
    );
    let buyUsdValue = $derived(
        (parseFloat(p2pBuyAmount) || 0) * (p2pBuyToken?.spotPrice || 0)
    );

    let impliedRate = $derived.by(() => {
        const s = parseFloat(p2pSellAmount) || 0;
        const b = parseFloat(p2pBuyAmount) || 0;
        if (s <= 0 || b <= 0) return '0.0000';
        const r = b / s;
        return r < 0.01 ? r.toFixed(6) : r.toFixed(4);
    });

    function formatSpotDisplay(price: number): string {
        if (!Number.isFinite(price) || price <= 0) return '$0.00';
        if (price < 0.01) return `$${price.toFixed(6)}`;
        if (price < 1) return `$${price.toFixed(4)}`;
        return `$${price.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    }

    function setSellPercentage(pct: number) {
        const avail = Number(p2pSellToken?.availableBalance || 0);
        if (avail <= 0) {
            p2pSellAmount = '0';
            return;
        }
        p2pSellAmount = Number((avail * pct).toFixed(4)).toString();
    }

    function matchSpotAskAmount() {
        const sellQty = parseFloat(p2pSellAmount) || 0;
        const sellSpot = p2pSellToken?.spotPrice || 0;
        const buySpot = p2pBuyToken?.spotPrice || 0;
        if (sellQty > 0 && sellSpot > 0 && buySpot > 0) {
            const targetBuy = (sellQty * sellSpot) / buySpot;
            p2pBuyAmount = Number(
                targetBuy.toFixed(targetBuy < 1 ? 6 : 4)
            ).toString();
        }
    }

    function isOwnOrder(sellerWallet: string): boolean {
        const me = (identity.activeAddress || '').trim().toLowerCase();
        const maker = (sellerWallet || '').trim().toLowerCase();
        return Boolean(me && maker && me === maker);
    }

    function handleIconError(e: Event) {
        const target = e.currentTarget as HTMLImageElement;
        target.style.display = 'none';
        if (target.nextElementSibling) {
            (target.nextElementSibling as HTMLElement).style.display = 'flex';
        }
    }
</script>

<div
    data-testid="p2p-orderbook-panel"
    class="w-full flex flex-col gap-5 font-mono text-white"
    in:fade={{ duration: 150 }}
>
    {#if swapError}
        <div
            data-testid="p2p-error-banner"
            class="bg-red-950/30 border border-red-500/45 rounded-2xl p-3 text-center text-[10px] font-bold uppercase tracking-wider text-red-400"
        >
            ⚠ {swapError}
        </div>
    {/if}

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <!-- LEFT COLUMN: DEPLOY P2P OFFER CARD -->
        <div
            data-testid="p2p-deploy-offer-card"
            class="lg:col-span-5 bg-[#0a0d12] border rounded-[28px] p-6 md:p-7 shadow-2xl flex flex-col gap-3.5 transition-all duration-300"
            style="
                border-color: {buyHex}45;
                background-image:
                    radial-gradient(ellipse at top left, {sellHex}18, transparent 58%),
                    radial-gradient(ellipse at bottom right, {buyHex}24, transparent 65%);
                box-shadow:
                    0 20px 60px -15px rgba(0, 0, 0, 0.85),
                    0 0 40px -15px {sellHex}20,
                    0 0 40px -15px {buyHex}28;
            "
        >
            <div class="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
                <div class="flex items-center gap-2.5">
                    <span
                        class="w-2.5 h-2.5 rounded-full transition-colors duration-300"
                        style="background-color: {buyHex}; box-shadow: 0 0 10px {buyHex}80;"
                    ></span>
                    <h3 class="text-xs md:text-sm font-black uppercase tracking-widest text-white">
                        Deploy P2P Offer
                    </h3>
                </div>
                <span class="text-[9px] font-bold text-neutral-400">
                    1 {p2pSellToken.ticker} = {impliedRate} {p2pBuyToken.ticker}
                </span>
            </div>

            <!-- YOU OFFER BOX -->
            <div
                class="tactile-card bg-[#11161f] rounded-2xl p-4 md:p-5 flex flex-col gap-3 border transition-all duration-300"
                style="
                    border-color: {sellHex}45;
                    background-image: radial-gradient(ellipse at top left, {sellHex}16, transparent 65%);
                "
            >
                <div class="flex items-center justify-between">
                    <span class="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                        You Offer
                    </span>
                    <div class="flex items-center gap-1">
                        {#each [0.25, 0.5, 0.75, 1.0] as pct}
                            <button
                                type="button"
                                onclick={() => setSellPercentage(pct)}
                                class="tactile-btn px-2 py-0.5 rounded-md text-[9px] font-bold text-neutral-300 hover:text-white cursor-pointer"
                            >
                                {pct === 1.0 ? 'MAX' : `${pct * 100}%`}
                            </button>
                        {/each}
                    </div>
                </div>

                <div class="flex items-center justify-between gap-3">
                    <input
                        type="number"
                        data-testid="p2p-sell-amount-input"
                        min="0"
                        step="any"
                        bind:value={p2pSellAmount}
                        placeholder="0.00"
                        class="w-full bg-transparent text-3xl md:text-4xl font-bold font-mono text-white outline-none placeholder-neutral-600 tabular-nums"
                    />
                    <button
                        type="button"
                        data-testid="p2p-sell-token-selector"
                        onclick={() => onOpenTokenModal('p2pSell')}
                        class="tactile-btn shrink-0 flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-[#0a0d12] cursor-pointer transition-all duration-300"
                        style="border-color: {sellHex}55;"
                    >
                        <div
                            class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black overflow-hidden shrink-0"
                            style="background-color: {sellHex}22; color: {sellHex}; border: 1px solid {sellHex}60;"
                        >
                            {#if p2pSellToken.imgUrl}
                                <img
                                    src={p2pSellToken.imgUrl}
                                    alt={p2pSellToken.ticker}
                                    class="w-4 h-4 object-contain"
                                    onerror={handleIconError}
                                />
                                <span
                                    style="display:none;"
                                    class="w-full h-full items-center justify-center"
                                >
                                    {p2pSellToken.ticker[0]}
                                </span>
                            {:else}
                                <span>{p2pSellToken.ticker[0]}</span>
                            {/if}
                        </div>
                        <div class="flex flex-col items-start leading-tight">
                            <span class="text-xs font-black text-white uppercase">
                                {p2pSellToken.ticker}
                            </span>
                            <span
                                class="text-[9px] font-bold"
                                style="color: {sellHex};"
                            >
                                {formatSpotDisplay(p2pSellToken.spotPrice)}
                            </span>
                        </div>
                        <span class="text-[10px] text-neutral-400 ml-0.5"
                            >▾</span
                        >
                    </button>
                </div>

                <div class="flex items-center justify-between text-[10px] text-neutral-500 pt-0.5">
                    <span>
                        ≈ ${sellUsdValue.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        })}
                    </span>
                    <span>
                        Available: {p2pSellToken.availableBalance.toLocaleString(
                            undefined,
                            { maximumFractionDigits: 4 }
                        )}
                        {p2pSellToken.ticker}
                    </span>
                </div>
            </div>

            <!-- CENTER ARROW DIVIDER -->
            <div class="flex items-center justify-center -my-4 z-20 pointer-events-none">
                <div
                    class="w-9 h-9 rounded-xl bg-[#0a0d12] border flex items-center justify-center text-xs font-black shadow-xl transition-colors duration-300"
                    style="border-color: {buyHex}55; color: {buyHex};"
                >
                    ↓
                </div>
            </div>

            <!-- YOU REQUIRE BOX (SHADED IN SELECTED BUY TOKEN COLOR) -->
            <div
                class="tactile-card bg-[#11161f] rounded-2xl p-4 md:p-5 flex flex-col gap-3 border transition-all duration-300"
                style="
                    border-color: {buyHex}55;
                    background-image: radial-gradient(ellipse at bottom right, {buyHex}24, transparent 68%);
                    box-shadow: inset 0 0 26px -12px {buyHex}28;
                "
            >
                <div class="flex items-center justify-between">
                    <span
                        class="text-[10px] font-black uppercase tracking-widest transition-colors duration-300"
                        style="color: {buyHex};"
                    >
                        You Require
                    </span>
                    <button
                        type="button"
                        onclick={matchSpotAskAmount}
                        class="tactile-btn px-2 py-0.5 rounded-md text-[9px] font-bold text-neutral-300 hover:text-white cursor-pointer"
                    >
                        Match Spot
                    </button>
                </div>

                <div class="flex items-center justify-between gap-3">
                    <input
                        type="number"
                        data-testid="p2p-buy-amount-input"
                        min="0"
                        step="any"
                        bind:value={p2pBuyAmount}
                        placeholder="0.00"
                        class="w-full bg-transparent text-3xl md:text-4xl font-bold font-mono text-white outline-none placeholder-neutral-600 tabular-nums"
                    />
                    <button
                        type="button"
                        data-testid="p2p-buy-token-selector"
                        onclick={() => onOpenTokenModal('p2pBuy')}
                        class="tactile-btn shrink-0 flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-[#0a0d12] cursor-pointer transition-all duration-300"
                        style="border-color: {buyHex}60;"
                    >
                        <div
                            class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black overflow-hidden shrink-0"
                            style="background-color: {buyHex}22; color: {buyHex}; border: 1px solid {buyHex}60;"
                        >
                            {#if p2pBuyToken.imgUrl}
                                <img
                                    src={p2pBuyToken.imgUrl}
                                    alt={p2pBuyToken.ticker}
                                    class="w-4 h-4 object-contain"
                                    onerror={handleIconError}
                                />
                                <span
                                    style="display:none;"
                                    class="w-full h-full items-center justify-center"
                                >
                                    {p2pBuyToken.ticker[0]}
                                </span>
                            {:else}
                                <span>{p2pBuyToken.ticker[0]}</span>
                            {/if}
                        </div>
                        <div class="flex flex-col items-start leading-tight">
                            <span class="text-xs font-black text-white uppercase">
                                {p2pBuyToken.ticker}
                            </span>
                            <span
                                class="text-[9px] font-bold"
                                style="color: {buyHex};"
                            >
                                {formatSpotDisplay(p2pBuyToken.spotPrice)}
                            </span>
                        </div>
                        <span class="text-[10px] text-neutral-400 ml-0.5"
                            >▾</span
                        >
                    </button>
                </div>

                <div class="flex items-center justify-between text-[10px] text-neutral-500 pt-0.5">
                    <span>
                        ≈ ${buyUsdValue.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        })}
                    </span>
                    <span>
                        Available: {p2pBuyToken.availableBalance.toLocaleString(
                            undefined,
                            { maximumFractionDigits: 4 }
                        )}
                        {p2pBuyToken.ticker}
                    </span>
                </div>
            </div>

            <!-- DEPLOY P2P OFFER CTA -->
            <button
                type="button"
                data-testid="p2p-create-offer-btn"
                onclick={onCreateP2pOffer}
                disabled={isExecuting ||
                    !(parseFloat(p2pSellAmount) > 0) ||
                    !(parseFloat(p2pBuyAmount) > 0)}
                class="tactile-btn w-full py-4 rounded-2xl text-xs font-black uppercase tracking-widest text-white cursor-pointer disabled:opacity-45 transition-all duration-300 mt-0.5"
                style="
                    border-color: {buyHex}65;
                    background-image: radial-gradient(ellipse at center, {buyHex}28, transparent 70%);
                "
            >
                {#if isExecuting}
                    Deploying Offer...
                {:else}
                    Deploy {p2pSellToken.ticker} → {p2pBuyToken.ticker} Offer →
                {/if}
            </button>
        </div>

        <!-- RIGHT COLUMN: OPEN P2P ORDERBOOK -->
        <div
            data-testid="p2p-orderbook-card"
            class="lg:col-span-7 bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 md:p-7 shadow-2xl flex flex-col gap-4"
            style="background-image: radial-gradient(ellipse at top right, {buyHex}14, transparent 65%);"
        >
            <div class="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
                <div class="flex items-center gap-2.5">
                    <span class="w-2 h-2 rounded-full bg-[#18C6A5]"></span>
                    <h3 class="text-xs md:text-sm font-black uppercase tracking-widest text-white">
                        Open P2P Offers
                    </h3>
                </div>
                <span class="px-2.5 py-1 rounded-xl bg-[#11161f] border border-white/10 text-[9px] font-bold text-neutral-300 uppercase">
                    {p2pOrders.length} Active
                </span>
            </div>

            {#if p2pOrders.length === 0}
                <div class="py-14 text-center border border-dashed border-white/10 rounded-2xl bg-[#11161f]/40 flex flex-col items-center gap-2">
                    <span class="text-xs font-bold uppercase tracking-widest text-neutral-400">
                        No Open P2P Offers
                    </span>
                    <span class="text-[10px] text-neutral-500">
                        Deploy an offer on the left to list on the orderbook.
                    </span>
                </div>
            {:else}
                <div class="flex flex-col gap-2.5 max-h-[520px] overflow-y-auto hide-scrollbar">
                    {#each p2pOrders as order (order.id)}
                        {@const orderSellAsset = treasury.getAsset(order.sellToken)}
                        {@const orderBuyAsset = treasury.getAsset(order.buyToken)}
                        {@const orderSellHex =
                            orderSellAsset.theme?.hex || '#18C6A5'}
                        {@const orderBuyHex =
                            orderBuyAsset.theme?.hex || '#3B82F6'}
                        <div
                            data-testid="p2p-order-row-{order.id}"
                            class="tactile-card bg-[#11161f] rounded-2xl p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
                            style="
                                border-color: {orderBuyHex}40;
                                background-image: radial-gradient(ellipse at right, {orderBuyHex}16, transparent 70%);
                            "
                        >
                            <div class="flex flex-col gap-1">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <span
                                        class="text-xs md:text-sm font-black tabular-nums"
                                        style="color: {orderSellHex};"
                                    >
                                        {Number(
                                            order.sellAmount || 0
                                        ).toLocaleString(undefined, {
                                            maximumFractionDigits: 4
                                        })}
                                        {order.sellToken}
                                    </span>
                                    <span class="text-xs text-neutral-500"
                                        >→</span
                                    >
                                    <span
                                        class="text-xs md:text-sm font-black tabular-nums"
                                        style="color: {orderBuyHex};"
                                    >
                                        {Number(
                                            order.buyAmount || 0
                                        ).toLocaleString(undefined, {
                                            maximumFractionDigits: 4
                                        })}
                                        {order.buyToken}
                                    </span>
                                </div>
                                <div class="flex items-center gap-3 text-[9px] text-neutral-400">
                                    <span>
                                        Rate: <strong class="text-white"
                                            >{order.rate}</strong
                                        >
                                        {order.buyToken}/{order.sellToken}
                                    </span>
                                    <span>
                                        Maker: {order.seller
                                            ? `${order.seller.slice(0, 10)}...${order.seller.slice(-4)}`
                                            : 'Anon'}
                                    </span>
                                </div>
                            </div>

                            <div class="flex items-center gap-2 shrink-0">
                                {#if isOwnOrder(order.seller)}
                                    <button
                                        type="button"
                                        data-testid="p2p-cancel-order-btn-{order.id}"
                                        onclick={() =>
                                            onCancelP2pOrder(order.id)}
                                        disabled={isCancellingP2pId ===
                                            order.id}
                                        class="tactile-btn px-3.5 py-2 rounded-xl text-[9px] font-black uppercase text-red-400 border-red-500/40 cursor-pointer"
                                    >
                                        {isCancellingP2pId === order.id
                                            ? '...'
                                            : 'Cancel'}
                                    </button>
                                {:else}
                                    <button
                                        type="button"
                                        data-testid="p2p-fill-order-btn-{order.id}"
                                        onclick={() => onFillP2pOrder(order)}
                                        disabled={isExecuting}
                                        class="tactile-btn px-4 py-2 rounded-xl text-[9px] font-black uppercase text-white cursor-pointer"
                                        style="
                                            border-color: {orderBuyHex}60;
                                            background-image: radial-gradient(ellipse at center, {orderBuyHex}28, transparent 70%);
                                        "
                                    >
                                        Fill Offer →
                                    </button>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
</div>