<!-- WINDOWS (FRONTEND): C:\Users\send2\perennia-v5\perennia-frontend\src\lib\components\dex\LiquidityAndSiloPanel.svelte -->
<script lang="ts">
  const _num = (v: unknown): number => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : 0; };
  let onQuickSwapPair: (() => void) | undefined = undefined;
    import { fade, slide } from 'svelte/transition';
    import { ui } from '$lib/stores/ui.svelte';
    import {
        DEFAULT_ECOSYSTEM_TICKER,
        treasury,
        type UnifiedAsset
    } from '$lib/stores/treasury.svelte';
    import {
        LOCK_OPTIONS,
        type LpPosition,
        type SecondaryPlantLeg,
        type SiloStakePosition
    } from './dexHelpers';

    let {
        lpAmountA = $bindable(''),
        lpAmountB = $bindable(''),
        lpWeightPctB = $bindable(50.0),
        extraPlantLegs = $bindable<SecondaryPlantLeg[]>([]),
        lockDurationIndex = $bindable(0),
        siloStakeAmountInput = $bindable(''),
        lpTokenA,
        lpTokenB,
        siloAsset,
        lpPositions = [],
        siloStakingTelemetry,
        isProvidingLiquidity = false,
        isWithdrawingLp = null,
        isStakingSilo = false,
        isMutatingSiloId = null,
        swapError = null,
        ambientPrimaryHex = '#18C6A5',
        ambientSecondaryHex = '#3B82F6',
        onOpenTokenModal,
    onQuickSwapForPair = undefined,
        onSetLpPercentageA,
        onSetLpPercentageB,
        onHandleLpInputA,
        onHandleLpInputB,
        onAddSecondaryPlantLeg,
        onRemoveSecondaryPlantLeg,
        onAdjustDexPlantSecondaryWeights,
        onExecuteSupplyLiquidity,
        onWithdrawLpPosition,
        onExecuteStakeSilo,
        onInitiateSiloCooldown,
        onClaimUnstakedSilo
    }: {
        lpAmountA: string;
        lpAmountB: string;
        lpWeightPctB: number;
        extraPlantLegs: SecondaryPlantLeg[];
        lockDurationIndex: number;
        siloStakeAmountInput: string;
        lpTokenA: UnifiedAsset;
        lpTokenB: UnifiedAsset;
        siloAsset: UnifiedAsset;
        lpPositions: LpPosition[];
        siloStakingTelemetry: {
            ecosystemTicker: string;
            activeStaked: number;
            cooldownStaked: number;
            combinedEligibleStaked: number;
            feeRateCap: number;
            tierLabel: string;
            positions: SiloStakePosition[];
        };
        isProvidingLiquidity: boolean;
        isWithdrawingLp: string | null;
        isStakingSilo: boolean;
        isMutatingSiloId: string | null;
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
    onQuickSwapForPair?: () => void;
        onSetLpPercentageA: (pct: number) => void;
        onSetLpPercentageB: (pct: number) => void;
        onHandleLpInputA: (e: Event) => void;
        onHandleLpInputB: (e: Event) => void;
        onAddSecondaryPlantLeg: (defaultTicker?: string) => void;
        onRemoveSecondaryPlantLeg: (idx: number) => void;
        onAdjustDexPlantSecondaryWeights: (
            changedKey: 'B' | number,
            rawNewPct: number
        ) => void;
        onExecuteSupplyLiquidity: () => Promise<void>;
        onWithdrawLpPosition: (lpId: string) => Promise<void>;
        onExecuteStakeSilo: () => Promise<void>;
        onInitiateSiloCooldown: (stakeId: string) => Promise<void>;
        onClaimUnstakedSilo: (stakeId: string) => Promise<void>;
    } = $props();

    let tokenBHex = $derived(lpTokenB.theme?.hex || ambientSecondaryHex || '#3B82F6');
    let siloHex = $derived(siloAsset.theme?.hex || '#18C6A5');

    let activeFeePct = $derived(
        _num((
            (siloStakingTelemetry.feeRateCap > 0
                ? siloStakingTelemetry.feeRateCap
                : 0.015) * 100
        )).toFixed(2)
    );

    let lpTotalUsdValue = $derived.by(() => {
        const kasQty = parseFloat(lpAmountA) || 0;
        const kasUsd = kasQty * (lpTokenA.spotPrice || 0);
        return kasUsd > 0 ? kasUsd * 2 : 0;
    });

    function formatSpotDisplay(price: number): string {
        if (!Number.isFinite(price) || price <= 0) return '$0.00';
        if (price < 0.01) return `$${_num(price).toFixed(6)}`;
        if (price < 1) return `$${_num(price).toFixed(4)}`;
        return `$${_num(price).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    }

    function setSiloPercentage(pct: number) {
        const avail = Number(siloAsset.availableBalance || 0);
        siloStakeAmountInput =
            avail > 0 ? Number(_num((avail * pct)).toFixed(2)).toString() : '0';
    }

    function formatCooldownTag(endsAt?: string | number | null): string {
        if (!endsAt) return '7d Cooldown';
        const endMs =
            typeof endsAt === 'number' ? endsAt : new Date(endsAt).getTime();
        const diffMs = endMs - Date.now();
        if (!Number.isFinite(diffMs) || diffMs <= 0) return 'Ready to Claim';
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor(
            (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
        );
        return `${days}d ${hours}h left`;
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
    class="w-full flex flex-col gap-5 font-mono text-white"
    in:fade={{ duration: 150 }}
>
    {#if swapError}
        <div
            data-testid="lp-error-banner"
            class="bg-red-950/30 border border-red-500/45 rounded-2xl p-3 text-center text-[10px] font-bold uppercase tracking-wider text-red-400"
        >
            ⚠ {swapError}
        </div>
    {/if}

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <!-- LEFT COLUMN: LIQUIDITY POOL PROVISIONING -->
        <div
            data-testid="dex-liquidity-plant-card"
            class="lg:col-span-7 bg-[#0a0d12] border rounded-[24px] sm:rounded-[28px] p-4 sm:p-6 md:p-7 shadow-2xl flex flex-col gap-3.5 transition-all duration-300"
            style="
                border-color: {tokenBHex}45;
                background-image:
                    radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.16), transparent 58%),
                    radial-gradient(ellipse at bottom right, {tokenBHex}22, transparent 65%);
                box-shadow:
                    0 20px 60px -15px rgba(0, 0, 0, 0.85),
                    0 0 40px -15px {tokenBHex}25;
            "
        >
            <div class="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
                <div class="flex items-center gap-2.5">
                    <span
                        class="w-2.5 h-2.5 rounded-full"
                        style="background-color: {tokenBHex}; box-shadow: 0 0 10px {tokenBHex}80;"
                    ></span>
                    <h3 class="text-xs md:text-sm font-black uppercase tracking-widest text-white">
                        Add Liquidity
                    </h3>
                </div>
                {#if extraPlantLegs.length < 3}
                    <button
                        type="button"
                        data-testid="dex-plant-add-leg-btn"
                        onclick={() => onAddSecondaryPlantLeg('XAU')}
                        class="tactile-btn px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer"
                    >
                        + Token
                    </button>
                {/if}
            </div>

            <!-- LEG A: 50% KAS ANCHOR -->
            <div
                class="tactile-card bg-[#11161f] rounded-2xl p-4 md:p-5 flex flex-col gap-3 border border-[#18C6A5]/35"
                style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.10), transparent 65%);"
            >
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                            Deposit
                        </span>
                        <span class="px-2 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/40 text-[#18C6A5] text-[8px] font-black">
                            50% KAS
                        </span>
                    </div>
                    <div class="flex items-center gap-1">
                        {#each [0.25, 0.5, 0.75, 1.0] as pct}
                            <button
                                type="button"
                                onclick={() => onSetLpPercentageA(pct)}
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
                        data-testid="lp-amount-a-input"
                        min="0"
                        step="any"
                        value={lpAmountA}
                        oninput={onHandleLpInputA}
                        placeholder="0.00"
                        class="w-full bg-transparent text-3xl md:text-4xl font-bold font-mono text-white outline-none placeholder-neutral-600 tabular-nums"
                    />
                    <div class="shrink-0 flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-[#0a0d12] border border-[#18C6A5]/45">
                        <div class="w-6 h-6 rounded-full bg-[#18C6A5]/20 border border-[#18C6A5]/50 text-[#18C6A5] flex items-center justify-center text-[10px] font-black">
                            K
                        </div>
                        <div class="flex flex-col items-start leading-tight">
                            <span class="text-xs font-black text-white uppercase">
                                KAS
                            </span>
                            <span class="text-[9px] font-bold text-[#18C6A5]">
                                {formatSpotDisplay(lpTokenA.spotPrice)}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="flex items-center justify-between text-[10px] text-neutral-500 pt-0.5">
                    <span>
                        ≈ ${_num((
                            (parseFloat(lpAmountA) || 0) *
                            (lpTokenA.spotPrice || 0)
                        )).toFixed(2)}
                    </span>
                    <span>
                        Balance: {_num(lpTokenA?.availableBalance).toLocaleString(
                            undefined,
                            { maximumFractionDigits: 4 }
                        )} KAS
                    </span>
                </div>
            </div>

            <!-- CENTER PLUS DIVIDER -->
            <div class="flex items-center justify-center -my-4 z-20 pointer-events-none">
                <div
                    class="w-9 h-9 rounded-xl bg-[#0a0d12] border flex items-center justify-center text-xs font-black shadow-xl transition-colors duration-300"
                    style="border-color: {tokenBHex}55; color: {tokenBHex};"
                >
                    +
                </div>
            </div>

            <!-- LEG B: PAIRED ASSET (SHADED IN SELECTED ASSET'S COLOR) -->
            <div
                class="tactile-card bg-[#11161f] rounded-2xl p-4 md:p-5 flex flex-col gap-3 border transition-all duration-300"
                style="
                    border-color: {tokenBHex}55;
                    background-image: radial-gradient(ellipse at bottom right, {tokenBHex}22, transparent 68%);
                    box-shadow: inset 0 0 26px -12px {tokenBHex}28;
                "
            >
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span
                            class="text-[10px] font-black uppercase tracking-widest"
                            style="color: {tokenBHex};"
                        >
                            Token
                        </span>
                        <span
                            data-testid="dex-plant-weight-b-badge"
                            class="px-2 py-0.5 rounded bg-[#0a0d12] border border-white/10 text-white text-[8px] font-bold"
                        >
                            {_num(lpWeightPctB).toFixed(0)}%
                        </span>
                    </div>
                    <div class="flex items-center gap-1">
                        {#each [0.25, 0.5, 0.75, 1.0] as pct}
                            <button
                                type="button"
                                onclick={() => onSetLpPercentageB(pct)}
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
                        data-testid="lp-amount-b-input"
                        min="0"
                        step="any"
                        value={lpAmountB}
                        oninput={onHandleLpInputB}
                        placeholder="0.00"
                        class="w-full bg-transparent text-3xl md:text-4xl font-bold font-mono text-white outline-none placeholder-neutral-600 tabular-nums"
                    />
                    <button
                        type="button"
                        data-testid="lp-token-b-selector"
                        onclick={() => onOpenTokenModal('lpB')}
                        class="tactile-btn shrink-0 flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-[#0a0d12] cursor-pointer"
                        style="border-color: {tokenBHex}60;"
                    >
                        <div
                            class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black overflow-hidden shrink-0"
                            style="background-color: {tokenBHex}22; color: {tokenBHex}; border: 1px solid {tokenBHex}60;"
                        >
                            {#if lpTokenB.imgUrl}
                                <img
                                    src={lpTokenB.imgUrl}
                                    alt={lpTokenB.ticker}
                                    class="w-4 h-4 object-contain"
                                    onerror={handleIconError}
                                />
                                <span
                                    style="display:none;"
                                    class="w-full h-full items-center justify-center"
                                >
                                    {lpTokenB.ticker[0]}
                                </span>
                            {:else}
                                <span>{lpTokenB.ticker[0]}</span>
                            {/if}
                        </div>
                        <div class="flex flex-col items-start leading-tight">
                            <span class="text-xs font-black text-white uppercase">
                                {lpTokenB.ticker}
                            </span>
                            <span
                                class="text-[9px] font-bold"
                                style="color: {tokenBHex};"
                            >
                                {formatSpotDisplay(lpTokenB.spotPrice)}
                            </span>
                        </div>
                        <span class="text-[10px] text-neutral-400 ml-0.5"
                            >▾</span
                        >
                    </button>
                </div>

                {#if extraPlantLegs.length > 0}
                    <div class="flex items-center gap-3 pt-1">
                        <span class="text-[9px] text-neutral-400 uppercase">
                            Weight
                        </span>
                        <input
                            type="range"
                            data-testid="dex-plant-weight-b-slider"
                            min="5"
                            max="45"
                            step="1"
                            value={lpWeightPctB}
                            oninput={(e) =>
                                onAdjustDexPlantSecondaryWeights(
                                    'B',
                                    parseFloat(
                                        (e.currentTarget as HTMLInputElement)
                                            .value
                                    )
                                )}
                            class="w-full accent-[#18C6A5] cursor-pointer"
                        />
                    </div>
                {/if}

                <div class="flex items-center justify-between text-[10px] text-neutral-500 pt-0.5">
                    <span>
                        ≈ ${_num((
                            (parseFloat(lpAmountB) || 0) *
                            (lpTokenB.spotPrice || 0)
                        )).toFixed(2)}
                    </span>
                    <span>
                        Balance: {_num(lpTokenB?.availableBalance).toLocaleString(
                            undefined,
                            { maximumFractionDigits: 4 }
                        )}
                        {lpTokenB.ticker}
                    </span>
                </div>
            </div>

            <!-- EXTRA MULTI-ASSET LEGS (IF ADDED) -->
            {#each extraPlantLegs as leg, idx (idx)}
                {@const legAsset = treasury.getAsset(leg.ticker)}
                {@const legHex = legAsset.theme?.hex || '#F59E0B'}
                <div
                    transition:slide={{ duration: 150 }}
                    class="tactile-card bg-[#11161f] rounded-2xl p-4 flex flex-col gap-2.5 border"
                    style="
                        border-color: {legHex}50;
                        background-image: radial-gradient(ellipse at bottom right, {legHex}1e, transparent 68%);
                    "
                >
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <span
                                class="text-[10px] font-black uppercase"
                                style="color: {legHex};"
                            >
                                Leg {idx + 3}
                            </span>
                            <span class="px-2 py-0.5 rounded bg-[#0a0d12] border border-white/10 text-white text-[8px] font-bold">
                                {_num(leg.weightPct).toFixed(0)}%
                            </span>
                        </div>
                        <button
                            type="button"
                            onclick={() => onRemoveSecondaryPlantLeg(idx)}
                            class="text-[9px] text-neutral-400 hover:text-red-400 cursor-pointer"
                        >
                            Remove
                        </button>
                    </div>

                    <div class="flex items-center justify-between gap-3">
                        <input
                            type="text"
                            readonly
                            value={leg.amount || '0.00'}
                            class="w-full bg-transparent text-2xl font-bold font-mono text-white outline-none tabular-nums"
                        />
                        <button
                            type="button"
                            data-testid="dex-plant-extra-selector-{idx}"
                            onclick={() => onOpenTokenModal('lpExtra', idx)}
                            class="tactile-btn shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0a0d12] cursor-pointer"
                            style="border-color: {legHex}55;"
                        >
                            <span class="text-xs font-black text-white">
                                {leg.ticker}
                            </span>
                            <span
                                class="text-[9px] font-bold"
                                style="color: {legHex};"
                            >
                                {formatSpotDisplay(legAsset.spotPrice)}
                            </span>
                            <span class="text-[9px] text-neutral-400">▾</span>
                        </button>
                    </div>
                </div>
            {/each}

            <!-- LOCKUP DURATION BAR -->
            <div class="bg-[#11161f] border border-white/10 rounded-2xl p-3 flex flex-col gap-2">
                <div class="flex items-center justify-between text-[9px] px-1">
                    <span class="font-bold uppercase tracking-widest text-neutral-400">
                        Lock
                    </span>
                    <span class="font-bold text-[#18C6A5]">
                        Total Value: ${_num(lpTotalUsdValue).toFixed(2)} USD
                    </span>
                </div>
                <div class="grid grid-cols-4 gap-1.5">
                    {#each LOCK_OPTIONS as opt, idx (opt.days)}
                        <button
                            type="button"
                            data-testid="lp-lock-option-{opt.days}"
                            onclick={() => (lockDurationIndex = idx)}
                            class="py-2 px-2 rounded-xl border text-center cursor-pointer transition-all flex flex-col items-center gap-0.5 {lockDurationIndex ===
                            idx
                                ? 'bg-[#161d29] border-[#18C6A5] text-white'
                                : 'bg-[#0a0d12] border-white/10 text-neutral-400 hover:text-white'}"
                        >
                            <span class="text-[10px] font-black uppercase">
                                {opt.days === 0 ? 'Flex' : `${opt.days}d`}
                            </span>
                            <span class="text-[8px] text-[#18C6A5] font-bold">
                                {opt.multiplier}
                            </span>
                        </button>
                    {/each}
                </div>
            </div>

            <!-- SUPPLY LIQUIDITY CTA -->
            <div class="relative mt-0.5">
                {#if ui.microBadges['dex_lp_stake_btn']}
                    <div
                        class="micro-confirm-badge absolute -top-4 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/60 text-[#18C6A5] text-[9px] font-black uppercase"
                    >
                        {ui.microBadges['dex_lp_stake_btn'].label}
                    </div>
                {/if}
                {#if parseFloat(lpAmountB) > 0 && _num(lpTokenB?.availableBalance) < parseFloat(lpAmountB) && onQuickSwapForPair}
<div class="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-mono mb-2">
  <span class="text-amber-200">Need {lpAmountB} {lpTokenB.ticker}</span>
  <button type="button" data-testid="lp-quick-swap-pair-btn" onclick={onQuickSwapForPair} class="px-2.5 py-1 rounded-lg bg-[#18C6A5]/20 border border-[#18C6A5]/50 text-[#18C6A5] font-black uppercase cursor-pointer">Swap KAS &rarr; {lpTokenB.ticker}</button>
</div>
{/if}
<button type="button" data-testid="dex-supply-lp-btn"
                    onclick={onExecuteSupplyLiquidity}
                    disabled={isProvidingLiquidity ||
                        !(parseFloat(lpAmountA) > 0)}
                    class="tactile-btn w-full py-4 rounded-2xl text-xs font-black uppercase tracking-widest text-white cursor-pointer disabled:opacity-45 transition-all duration-300"
                    style="
                        border-color: {tokenBHex}65;
                        background-image: radial-gradient(ellipse at center, {tokenBHex}28, transparent 70%);
                    "
                >
                    {#if isProvidingLiquidity}
                        Supplying Liquidity...
                    {:else}
                        Supply {[
                            'KAS',
                            lpTokenB.ticker,
                            ...extraPlantLegs.map((l) => l.ticker)
                        ].join('/')} Liquidity →
                    {/if}
                </button>
            </div>

            <!-- ACTIVE LP POSITIONS (COMPACT) -->
            {#if Array.isArray(lpPositions) && lpPositions.length > 0}
                <div class="flex flex-col gap-2 pt-2 border-t border-white/10">
                    <span class="text-[9px] font-black uppercase tracking-widest text-neutral-400 px-1">
                        Your Pools ({lpPositions.length})
                    </span>
                    {#each (Array.isArray(lpPositions) ? lpPositions : []) as pos (pos.id)}
                        <div
                            data-testid="lp-position-card-{pos.id}"
                            class="bg-[#11161f] border border-white/10 rounded-xl p-3 flex items-center justify-between gap-2 text-[10px]"
                        >
                            <div class="flex flex-col">
                                <span class="font-black text-white">
                                    {pos.poolPair || 'KAS/Pool'} • ${_num(Number(
                                        pos.usdValue || 0
                                    )).toFixed(2)}
                                </span>
                                <span class="text-[9px] text-neutral-400">
                                    {_num(Number(pos.amountA || 0)).toFixed(2)} KAS +
                                    {_num(Number(pos.amountB || 0)).toFixed(4)}
                                </span>
                            </div>
                            <button
                                type="button"
                                data-testid="withdraw-lp-btn-{pos.id}"
                                onclick={() => onWithdrawLpPosition(pos.id)}
                                disabled={isWithdrawingLp === pos.id ||
                                    Boolean(pos.isLocked)}
                                class="tactile-btn px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer disabled:opacity-40"
                            >
                                {isWithdrawingLp === pos.id
                                    ? '...'
                                    : pos.isLocked
                                      ? 'Locked'
                                      : 'Withdraw'}
                            </button>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- RIGHT COLUMN: STREAMLINED SILO FEE TIER STAKING -->
        <div
            data-testid="silo-staking-card"
            class="lg:col-span-5 bg-[#0a0d12] border rounded-[24px] sm:rounded-[28px] p-4 sm:p-6 md:p-7 shadow-2xl flex flex-col gap-3.5 transition-all duration-300"
            style="
                border-color: {siloHex}45;
                background-image:
                    radial-gradient(ellipse at top right, {siloHex}20, transparent 60%),
                    radial-gradient(ellipse at bottom left, rgba(24, 198, 165, 0.12), transparent 65%);
                box-shadow:
                    0 20px 60px -15px rgba(0, 0, 0, 0.85),
                    0 0 40px -15px {siloHex}25;
            "
        >
            <!-- HEADER -->
            <div class="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
                <div class="flex items-center gap-2.5">
                    <span
                        class="w-2.5 h-2.5 rounded-full"
                        style="background-color: {siloHex}; box-shadow: 0 0 10px {siloHex}80;"
                    ></span>
                    <h3 class="text-xs md:text-sm font-black uppercase tracking-widest text-white">
                        {DEFAULT_ECOSYSTEM_TICKER} Fee Tier
                    </h3>
                </div>
                <span
                    data-testid="silo-active-fee-tier"
                    class="px-2.5 py-1 rounded-xl bg-[#11161f] border border-[#18C6A5]/45 text-[#18C6A5] text-[10px] font-black uppercase"
                >
                    {activeFeePct}% Active Fee
                </span>
            </div>

            <!-- 3 VISUAL FEE TIER PILLS (HOW STAKING IMPACTS FEES) -->
            <div class="grid grid-cols-3 gap-2">
                {#each [
                    {
                        id: 'standard',
                        fee: '1.50%',
                        req: '0 SILO',
                        active: siloStakingTelemetry.combinedEligibleStaked < 10000
                    },
                    {
                        id: 'shield',
                        fee: '0.75%',
                        req: '10k+ SILO',
                        active:
                            siloStakingTelemetry.combinedEligibleStaked >=
                                10000 &&
                            siloStakingTelemetry.combinedEligibleStaked < 100000
                    },
                    {
                        id: 'sovereign',
                        fee: '0.25%',
                        req: '100k+ SILO',
                        active:
                            siloStakingTelemetry.combinedEligibleStaked >=
                            100000
                    }
                ] as tier (tier.id)}
                    <div
                        data-testid="silo-tier-pill-{tier.id}"
                        class="p-3 rounded-2xl border flex flex-col items-center justify-center gap-0.5 transition-all {tier.active
                            ? 'bg-[#161d29] border-[#18C6A5] shadow-lg'
                            : 'bg-[#11161f] border-white/10 opacity-70'}"
                    >
                        <span
                            class="text-base md:text-lg font-black tabular-nums {tier.active
                                ? 'text-[#18C6A5]'
                                : 'text-white'}"
                        >
                            {tier.fee}
                        </span>
                        <span class="text-[9px] font-bold uppercase text-neutral-400">
                            {tier.req}
                        </span>
                    </div>
                {/each}
            </div>

            <!-- STAKE INPUT CARD (DEX STYLE) -->
            <div
                class="tactile-card bg-[#11161f] rounded-2xl p-4 md:p-5 flex flex-col gap-3 border"
                style="
                    border-color: {siloHex}50;
                    background-image: radial-gradient(ellipse at bottom right, {siloHex}22, transparent 68%);
                "
            >
                <div class="flex items-center justify-between gap-2">
                    <span class="text-[10px] font-black uppercase tracking-widest text-[#18C6A5]">
                        Stake {DEFAULT_ECOSYSTEM_TICKER}
                    </span>
                    <div class="flex items-center gap-1">
                        {#each [0.25, 0.5, 0.75, 1.0] as pct}
                            <button
                                type="button"
                                onclick={() => setSiloPercentage(pct)}
                                class="tactile-btn px-2 py-0.5 rounded-md text-[9px] font-bold text-neutral-300 hover:text-white cursor-pointer"
                            >
                                {pct === 1.0 ? 'MAX' : `${pct * 100}%`}
                            </button>
                        {/each}
                        <button
                            type="button"
                            data-testid="silo-buy-with-usd-btn"
                            onclick={() =>
                                ui.openFiatModal(
                                    DEFAULT_ECOSYSTEM_TICKER,
                                    true,
                                    '250'
                                )}
                            class="tactile-btn px-2 py-0.5 rounded-md text-[9px] font-black text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer ml-0.5"
                        >
                            + Buy
                        </button>
                    </div>
                </div>

                <div class="flex items-center justify-between gap-3">
                    <input
                        type="number"
                        data-testid="silo-stake-amount-input"
                        min="0"
                        step="any"
                        bind:value={siloStakeAmountInput}
                        placeholder="0.00"
                        class="w-full bg-transparent text-3xl md:text-4xl font-bold font-mono text-white outline-none placeholder-neutral-600 tabular-nums"
                    />
                    <div
                        class="shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#0a0d12] border"
                        style="border-color: {siloHex}55;"
                    >
                        <div
                            class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black"
                            style="background-color: {siloHex}22; color: {siloHex}; border: 1px solid {siloHex}60;"
                        >
                            S
                        </div>
                        <div class="flex flex-col items-start leading-tight">
                            <span class="text-xs font-black text-white uppercase">
                                {DEFAULT_ECOSYSTEM_TICKER}
                            </span>
                            <span
                                class="text-[9px] font-bold"
                                style="color: {siloHex};"
                            >
                                {formatSpotDisplay(siloAsset.spotPrice)}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="flex items-center justify-between text-[10px] text-neutral-400 pt-0.5">
                    <span data-testid="silo-staked-balance-display">
                        Staked: <strong class="text-white"
                            >{_num(siloStakingTelemetry.combinedEligibleStaked).toLocaleString()}</strong
                        >
                        {DEFAULT_ECOSYSTEM_TICKER}
                    </span>
                    <span>
                        Balance: {_num(siloAsset.availableBalance).toLocaleString(
                            undefined,
                            { maximumFractionDigits: 2 }
                        )}
                    </span>
                </div>
            </div>

            <!-- STAKE BUTTON -->
            <div class="relative">
                {#if ui.microBadges['silo_stake_btn']}
                    <div
                        class="micro-confirm-badge absolute -top-4 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/60 text-[#18C6A5] text-[9px] font-black uppercase"
                    >
                        {ui.microBadges['silo_stake_btn'].label}
                    </div>
                {/if}
                <button
                    type="button"
                    data-testid="silo-stake-submit-btn"
                    onclick={onExecuteStakeSilo}
                    disabled={isStakingSilo ||
                        !(parseFloat(siloStakeAmountInput) > 0)}
                    class="tactile-btn w-full py-4 rounded-2xl text-xs font-black uppercase tracking-widest text-white cursor-pointer disabled:opacity-45 transition-all duration-300"
                    style="
                        border-color: {siloHex}65;
                        background-image: radial-gradient(ellipse at center, {siloHex}28, transparent 70%);
                    "
                >
                    {#if isStakingSilo}
                        Staking {DEFAULT_ECOSYSTEM_TICKER}...
                    {:else}
                        Stake {DEFAULT_ECOSYSTEM_TICKER} →
                    {/if}
                </button>
            </div>

            <!-- ACTIVE STAKES & 7D COOLDOWN LIST -->
            {#if siloStakingTelemetry.positions.length > 0}
                <div class="flex flex-col gap-2 pt-2 border-t border-white/10">
                    <div class="flex items-center justify-between text-[9px] text-neutral-400 px-1">
                        <span class="font-black uppercase tracking-widest">
                            Staked Positions
                        </span>
                        <span>7d unstake</span>
                    </div>
                    {#each (Array.isArray(siloStakingTelemetry?.positions) ? siloStakingTelemetry.positions : []) as pos (pos.id)}
                        <div
                            data-testid="silo-position-row-{pos.id}"
                            class="bg-[#11161f] border border-white/10 rounded-xl p-3 flex items-center justify-between gap-2 text-[10px]"
                        >
                            <div class="flex flex-col">
                                <span class="font-black text-white">
                                    {_num(Number(pos.amount || 0)).toLocaleString()}
                                    {DEFAULT_ECOSYSTEM_TICKER}
                                </span>
                                <span
                                    class="text-[9px] {pos.status === 'ACTIVE'
                                        ? 'text-[#18C6A5]'
                                        : 'text-amber-400'}"
                                >
                                    {pos.status === 'ACTIVE'
                                        ? 'Active Fee Shield'
                                        : formatCooldownTag(pos.cooldownEndsAt)}
                                </span>
                            </div>

                            {#if pos.status === 'ACTIVE'}
                                <button
                                    type="button"
                                    data-testid="silo-start-cooldown-btn-{pos.id}"
                                    onclick={() =>
                                        onInitiateSiloCooldown(pos.id)}
                                    disabled={isMutatingSiloId === pos.id}
                                    class="tactile-btn px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-amber-400 border-amber-500/40 cursor-pointer"
                                >
                                    {isMutatingSiloId === pos.id
                                        ? '...'
                                        : 'Unstake (7d)'}
                                </button>
                            {:else}
                                <button
                                    type="button"
                                    data-testid="silo-claim-unstaked-btn-{pos.id}"
                                    onclick={() => onClaimUnstakedSilo(pos.id)}
                                    disabled={isMutatingSiloId === pos.id}
                                    class="tactile-btn px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer"
                                >
                                    {isMutatingSiloId === pos.id
                                        ? '...'
                                        : 'Claim'}
                                </button>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
</div>