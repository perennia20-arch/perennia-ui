<script lang="ts">
    import { fade } from 'svelte/transition';
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import {
        treasury,
        DEFAULT_ECOSYSTEM_TICKER,
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
        extraPlantLegs = $bindable([]),
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

    let fiatToSiloPresetUsd = $state('250');
    let autoStakeOnFiatBuy = $state(true);

    let totalPlantAssetCount = $derived(2 + extraPlantLegs.length);
    let totalPlantInternalPairs = $derived(
        (totalPlantAssetCount * (totalPlantAssetCount - 1)) / 2
    );
    let plantPairSummary = $derived(
        ['KAS', lpTokenB.ticker, ...extraPlantLegs.map((l) => l.ticker)].join(
            '/'
        )
    );

    let livePlantInvariantK = $derived.by(() => {
        const kasQty = parseFloat(lpAmountA) || 0;
        const bQty = parseFloat(lpAmountB) || 0;
        if (kasQty <= 0 || bQty <= 0) return 0;
        let k = Math.pow(kasQty, 0.5) * Math.pow(bQty, lpWeightPctB / 100.0);
        for (const leg of extraPlantLegs) {
            const q = parseFloat(leg.amount) || 0;
            if (q <= 0) return 0;
            k *= Math.pow(q, leg.weightPct / 100.0);
        }
        return k;
    });

    let estimatedSiloFromFiat = $derived.by(() => {
        const usd = Math.max(0, parseFloat(fiatToSiloPresetUsd) || 0);
        const netUsd = usd * 0.9925;
        const kasSpot = treasury.getAsset('KAS').spotPrice || 0.165;
        const siloSpot =
            siloAsset.spotPrice > 0
                ? siloAsset.spotPrice
                : kasSpot / 23.809524;
        return siloSpot > 0 ? netUsd / siloSpot : 0;
    });
</script>

<div class="flex flex-col gap-6" in:fade={{ duration: 150 }}>
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div
            class="lg:col-span-6 bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 md:p-7 shadow-2xl flex flex-col gap-4 relative"
            style="background-image: radial-gradient(ellipse at top left, {ambientPrimaryHex}14, transparent 60%), radial-gradient(ellipse at bottom right, {ambientSecondaryHex}18, transparent 65%);"
        >
            <div
                class="flex items-center justify-between border-b border-white/10 pb-3"
            >
                <div class="flex flex-col">
                    <span
                        class="text-xs font-black text-white uppercase tracking-widest"
                    >
                        Provision 50%-KAS Liquidity Plant
                    </span>
                    <span
                        class="text-[9px] font-mono text-neutral-400 uppercase tracking-widest mt-0.5"
                    >
                        Constant-Mean Invariant • {totalPlantInternalPairs} Cross-Pair{totalPlantInternalPairs ===
                        1
                            ? ''
                            : 's'}
                    </span>
                </div>
                <span
                    data-testid="dex-plant-pair-badge"
                    class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/40 text-[9px] font-mono font-bold text-[#18C6A5]"
                >
                    {plantPairSummary}
                </span>
            </div>

            <div
                class="tactile-card flex flex-col gap-2.5 bg-[#11161f] p-4 rounded-2xl border border-[#18C6A5]/35"
            >
                <div class="flex justify-between items-center">
                    <span
                        class="text-[9px] font-black uppercase tracking-widest text-[#18C6A5]"
                    >
                        Anchor Asset A (50.0% Weight Locked)
                    </span>
                    <div class="flex gap-1">
                        {#each [0.25, 0.5, 0.75, 1.0] as pct}
                            <button
                                type="button"
                                onclick={() => onSetLpPercentageA(pct)}
                                class="tactile-btn px-2 py-0.5 rounded text-[8px] font-mono font-bold text-neutral-300 hover:text-white cursor-pointer"
                            >
                                {pct === 1.0 ? 'MAX' : `${pct * 100}%`}
                            </button>
                        {/each}
                    </div>
                </div>
                <div class="flex justify-between items-center gap-3">
                    <input
                        type="number"
                        data-testid="dex-lp-kas-amount-input"
                        value={lpAmountA}
                        oninput={onHandleLpInputA}
                        placeholder="0.00"
                        class="w-full bg-transparent text-2xl font-bold font-mono text-white outline-none placeholder-neutral-700"
                    />
                    <div
                        class="shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0a0d12] border border-[#18C6A5]/40"
                    >
                        <span
                            class="font-black text-[#18C6A5] text-xs tracking-wider leading-none whitespace-nowrap"
                        >
                            KAS (50.0%)
                        </span>
                    </div>
                </div>
                <div
                    class="flex justify-between items-center text-[9px] font-mono text-neutral-500"
                >
                    <span>
                        ≈ ${lpAmountA
                            ? (
                                  parseFloat(lpAmountA) * lpTokenA.spotPrice
                              ).toFixed(2)
                            : '0.00'} USD
                    </span>
                    <span>
                        Avail: {lpTokenA.availableBalance.toLocaleString(
                            undefined,
                            { maximumFractionDigits: 4 }
                        )} KAS
                    </span>
                </div>
            </div>

            <div
                class="text-center text-neutral-500 font-bold text-[10px] -my-1"
            >
                + 50.0% SECONDARY BASKET ({totalPlantAssetCount - 1} ASSET{totalPlantAssetCount -
                    1 ===
                1
                    ? ''
                    : 'S'}) +
            </div>

            <div
                class="tactile-card flex flex-col gap-2.5 bg-[#11161f] p-4 rounded-2xl border"
                style="border-color: {ambientSecondaryHex}30;"
            >
                <div class="flex justify-between items-center">
                    <span
                        class="text-[9px] font-bold uppercase tracking-widest"
                        style="color: {ambientSecondaryHex};"
                    >
                        Secondary Asset B ({lpWeightPctB.toFixed(2)}% Weight)
                    </span>
                    <div class="flex gap-1">
                        {#each [0.25, 0.5, 0.75, 1.0] as pct}
                            <button
                                type="button"
                                onclick={() => onSetLpPercentageB(pct)}
                                class="tactile-btn px-2 py-0.5 rounded text-[8px] font-mono font-bold text-neutral-300 hover:text-white cursor-pointer"
                            >
                                {pct === 1.0 ? 'MAX' : `${pct * 100}%`}
                            </button>
                        {/each}
                    </div>
                </div>
                <div class="flex justify-between items-center gap-3">
                    <input
                        type="number"
                        data-testid="dex-lp-secondary-b-input"
                        value={lpAmountB}
                        oninput={onHandleLpInputB}
                        placeholder="0.00"
                        class="w-full bg-transparent text-2xl font-bold font-mono text-white outline-none placeholder-neutral-700"
                    />
                    <button
                        type="button"
                        data-testid="dex-lp-select-b-btn"
                        onclick={() => onOpenTokenModal('lpB')}
                        class="tactile-btn shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl cursor-pointer"
                        style="border-color: {ambientSecondaryHex}40;"
                    >
                        <span
                            class="font-bold text-white text-xs tracking-wider leading-none"
                        >
                            {lpTokenB.ticker}
                        </span>
                        <svg
                            class="w-3 h-3 text-neutral-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M19 9l-7 7-7-7"
                            />
                        </svg>
                    </button>
                </div>
                {#if extraPlantLegs.length > 0}
                    <input
                        type="range"
                        min="1"
                        max="48"
                        step="0.5"
                        value={lpWeightPctB}
                        oninput={(e) =>
                            onAdjustDexPlantSecondaryWeights(
                                'B',
                                parseFloat(
                                    (e.currentTarget as HTMLInputElement).value
                                ) || 25
                            )}
                        class="w-full custom-range-slider cursor-pointer"
                    />
                {/if}
                <div
                    class="flex justify-between items-center text-[9px] font-mono text-neutral-500"
                >
                    <span>
                        ≈ ${lpAmountB
                            ? (
                                  parseFloat(lpAmountB) * lpTokenB.spotPrice
                              ).toFixed(2)
                            : '0.00'} USD
                    </span>
                    <span>
                        Avail: {lpTokenB.availableBalance.toLocaleString(
                            undefined,
                            { maximumFractionDigits: 4 }
                        )}
                        {lpTokenB.ticker}
                    </span>
                </div>
            </div>

            {#each extraPlantLegs as leg, idx (leg.ticker + idx)}
                {@const legAsset = treasury.getAsset(leg.ticker)}
                <div
                    data-testid="dex-lp-extra-leg-{idx}"
                    class="tactile-card flex flex-col gap-2.5 bg-[#11161f] p-4 rounded-2xl border border-blue-500/30"
                >
                    <div class="flex justify-between items-center">
                        <span
                            class="text-[9px] font-bold uppercase tracking-widest text-blue-400"
                        >
                            Secondary Asset #{idx + 2} ({leg.weightPct.toFixed(
                                2
                            )}% Weight)
                        </span>
                        <button
                            type="button"
                            onclick={() => onRemoveSecondaryPlantLeg(idx)}
                            class="text-[9px] font-mono text-neutral-400 hover:text-red-400 cursor-pointer"
                        >
                            [Remove ✕]
                        </button>
                    </div>
                    <div class="flex justify-between items-center gap-3">
                        <input
                            type="number"
                            readonly
                            value={leg.amount}
                            placeholder="0.00"
                            class="w-full bg-transparent text-xl font-bold font-mono text-white outline-none placeholder-neutral-700"
                        />
                        <button
                            type="button"
                            onclick={() => onOpenTokenModal('lpExtra', idx)}
                            class="tactile-btn shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl cursor-pointer border-blue-500/40"
                        >
                            <span
                                class="font-bold text-white text-xs tracking-wider leading-none"
                            >
                                {leg.ticker}
                            </span>
                            <svg
                                class="w-3 h-3 text-neutral-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M19 9l-7 7-7-7"
                                />
                            </svg>
                        </button>
                    </div>
                    <input
                        type="range"
                        min="1"
                        max="48"
                        step="0.5"
                        value={leg.weightPct}
                        oninput={(e) =>
                            onAdjustDexPlantSecondaryWeights(
                                idx,
                                parseFloat(
                                    (e.currentTarget as HTMLInputElement).value
                                ) || 25
                            )}
                        class="w-full custom-range-slider cursor-pointer"
                    />
                    <div
                        class="flex justify-between items-center text-[9px] font-mono text-neutral-500"
                    >
                        <span>
                            ≈ ${leg.amount
                                ? (
                                      parseFloat(leg.amount) *
                                      legAsset.spotPrice
                                  ).toFixed(2)
                                : '0.00'} USD
                        </span>
                        <span>
                            Avail: {legAsset.availableBalance.toLocaleString(
                                undefined,
                                { maximumFractionDigits: 4 }
                            )}
                            {leg.ticker}
                        </span>
                    </div>
                </div>
            {/each}

            {#if extraPlantLegs.length < 3}
                <button
                    type="button"
                    data-testid="dex-add-secondary-plant-asset-btn"
                    onclick={() => onAddSecondaryPlantLeg()}
                    class="tactile-btn w-full py-2.5 rounded-xl border-blue-500/40 text-blue-400 text-[10px] font-black uppercase tracking-widest cursor-pointer"
                >
                    + Add Secondary Asset to 50% KAS Liquidity Plant
                </button>
            {/if}

            <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4">
                <div class="flex justify-between items-center mb-3">
                    <span
                        class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest"
                    >
                        Stake Duration Lockup
                    </span>
                    <span
                        class="text-[10px] font-black text-[#18C6A5] uppercase tracking-widest"
                    >
                        {LOCK_OPTIONS[lockDurationIndex].label} ({LOCK_OPTIONS[
                            lockDurationIndex
                        ].multiplier}x Yield)
                    </span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="3"
                    step="1"
                    bind:value={lockDurationIndex}
                    class="custom-range-slider w-full"
                />
                <div
                    class="flex justify-between mt-3 text-[9px] font-bold uppercase tracking-widest text-neutral-500"
                >
                    <span>Flex (1.0x)</span>
                    <span>30D (1.2x)</span>
                    <span>90D (1.5x)</span>
                    <span>365D (2.5x)</span>
                </div>
                {#if livePlantInvariantK > 0}
                    <div
                        class="border-t border-white/10 pt-2.5 mt-3 flex justify-between text-[9px] font-mono text-neutral-400"
                    >
                        <span>Constant-Mean Invariant (k):</span>
                        <span class="text-[#18C6A5] font-bold tabular-nums">
                            {livePlantInvariantK.toFixed(4)} ({totalPlantInternalPairs}
                            Cross-Pairs)
                        </span>
                    </div>
                {/if}
            </div>

            <div class="relative">
                {#if ui.microBadges['dex_lp_stake_btn']}
                    <div
                        class="micro-confirm-badge absolute -top-4 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/60 text-[#18C6A5] text-[9px] font-mono font-black uppercase tracking-widest shadow-xl"
                    >
                        {ui.microBadges['dex_lp_stake_btn'].label}
                    </div>
                {/if}
                <button
                    type="button"
                    data-testid="dex-stake-lp-submit-btn"
                    onclick={onExecuteSupplyLiquidity}
                    disabled={!identity.isWalletConnected ||
                        !lpAmountA ||
                        !lpAmountB ||
                        isProvidingLiquidity}
                    class="tactile-btn w-full py-4 rounded-2xl text-white text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    style="
                        border-color: {ambientSecondaryHex}50;
                        background-image: radial-gradient(ellipse at center, {ambientSecondaryHex}24, transparent 70%);
                        box-shadow: 0 10px 28px -8px {ambientSecondaryHex}30;
                    "
                >
                    {isProvidingLiquidity
                        ? 'Provisioning LP Plant...'
                        : `Lock Capital & Stake ${plantPairSummary} (${LOCK_OPTIONS[lockDurationIndex].label})`}
                </button>
            </div>
        </div>

        <div
            class="lg:col-span-6 bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 md:p-7 shadow-2xl flex flex-col gap-4 min-h-[480px]"
            style="background-image: radial-gradient(ellipse at top right, {ambientSecondaryHex}14, transparent 65%);"
        >
            <div
                class="flex justify-between items-center border-b border-white/10 pb-3"
            >
                <div class="flex flex-col">
                    <h4
                        class="text-xs font-black uppercase tracking-widest text-white"
                    >
                        Active Staked Liquidity Plants
                    </h4>
                    <span
                        class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest mt-0.5"
                    >
                        50%-KAS Constant-Mean Invariant • Rebalanced Daily at
                        22:00 UTC Global Settlement
                    </span>
                </div>
                <span
                    class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-white/10 text-[9px] font-mono text-[#18C6A5] uppercase"
                >
                    {lpPositions.length} ACTIVE
                </span>
            </div>

            <div
                class="flex flex-col gap-3 max-h-[460px] overflow-y-auto hide-scrollbar pr-0.5"
            >
                {#each lpPositions as pos (pos.lpId)}
                    {@const pairTokens = (
                        pos.poolPair || 'KAS/USDC'
                    ).split('/')}
                    {@const posBadge = ui.microBadges[`lp_pos_${pos.lpId}`]}
                    {@const pairCombinations =
                        pos.internalPairsCount ||
                        (pairTokens.length * (pairTokens.length - 1)) / 2}
                    <div
                        data-testid="lp-position-card-{pos.lpId}"
                        class="tactile-card bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-3 relative"
                    >
                        {#if posBadge}
                            <div
                                class="micro-confirm-badge absolute top-2 right-2 px-2.5 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/50 text-[#18C6A5] text-[8px] font-mono font-black uppercase"
                            >
                                {posBadge.label}
                            </div>
                        {/if}
                        <div class="flex justify-between items-start">
                            <div class="flex flex-col">
                                <div class="flex flex-wrap items-center gap-2">
                                    <span
                                        class="font-bold text-white text-sm tracking-wide"
                                    >
                                        {pos.poolPair}
                                    </span>
                                    <span
                                        class="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest {pos.lockDurationDays >=
                                        365
                                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                            : pos.lockDurationDays >= 90
                                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                                              : 'bg-[#0a0d12] text-neutral-400 border border-white/10'}"
                                    >
                                        {pos.multiplier}x Multiplier
                                    </span>
                                    <span
                                        class="px-2 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/30 text-[8px] font-mono text-[#18C6A5]"
                                    >
                                        {pairCombinations} Cross-Pair{pairCombinations ===
                                        1
                                            ? ''
                                            : 's'}
                                    </span>
                                </div>
                                {#if pos.reserves && Object.keys(pos.reserves).length > 2}
                                    <span
                                        class="text-[10px] font-mono text-neutral-300 mt-1"
                                    >
                                        {Object.entries(pos.reserves)
                                            .map(
                                                ([t, q]) =>
                                                    `${Number(q).toFixed(4)} ${t}`
                                            )
                                            .join(' + ')}
                                    </span>
                                {:else}
                                    <span
                                        class="text-[10px] font-mono text-neutral-400 mt-1"
                                    >
                                        {pos.stakedAssetA.toFixed(4)}
                                        {pairTokens[0] || 'KAS'} + {pos.stakedAssetB.toFixed(
                                            6
                                        )}
                                        {pairTokens[1] || 'USDC'}
                                    </span>
                                {/if}
                            </div>
                            <div class="flex flex-col items-end">
                                <span
                                    class="text-[8px] font-mono uppercase tracking-widest {pos.isUnlocked
                                        ? 'text-[#18C6A5]'
                                        : 'text-amber-400'}"
                                >
                                    {pos.isUnlocked ? 'Matured' : 'Timelocked'}
                                </span>
                                <span
                                    class="text-[9px] font-mono text-neutral-500 mt-0.5"
                                >
                                    {pos.unlockDate && pos.lockDurationDays > 0
                                        ? new Date(
                                              pos.unlockDate
                                          ).toLocaleDateString()
                                        : 'Flexible'}
                                </span>
                            </div>
                        </div>
                        <div
                            class="flex justify-between items-center border-t border-white/5 pt-3"
                        >
                            <div class="flex flex-col">
                                <span
                                    class="text-[8px] uppercase tracking-widest text-neutral-500 font-bold"
                                >
                                    Weighted Share Volume
                                </span>
                                <span
                                    class="text-xs font-mono font-bold text-[#18C6A5]"
                                >
                                    {pos.weightedTvl.toFixed(4)}
                                    {pairTokens[0] || 'KAS'}
                                </span>
                            </div>
                            <button
                                type="button"
                                onclick={() => onWithdrawLpPosition(pos.lpId)}
                                disabled={!pos.isUnlocked ||
                                    isWithdrawingLp === pos.lpId}
                                class="tactile-btn px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed {pos.isUnlocked
                                    ? 'text-[#18C6A5] border-[#18C6A5]/40'
                                    : 'text-neutral-500'}"
                            >
                                {#if isWithdrawingLp === pos.lpId}
                                    Unlocking...
                                {:else if pos.isUnlocked}
                                    Withdraw LP
                                {:else}
                                    Locked
                                {/if}
                            </button>
                        </div>
                    </div>
                {/each}
                {#if lpPositions.length === 0}
                    <div
                        class="flex-1 flex flex-col items-center justify-center text-center py-16 px-4 border border-dashed border-white/10 rounded-2xl bg-[#11161f]/40"
                    >
                        <span
                            class="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-1"
                        >
                            No Active Staked Liquidity Plants
                        </span>
                        <span
                            class="text-[10px] font-mono text-neutral-500 max-w-xs leading-relaxed"
                        >
                            Supply a 50% KAS Liquidity Plant on the left or add
                            2+ assets to a sector in Operations to earn 80% of
                            pool settlement fees.
                        </span>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    <!-- SILO 7-DAY COOLDOWN STAKING & 1-CLICK FIAT-TO-SILO PIPELINE -->
    <div
        data-testid="silo-staking-vault-card"
        class="bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 md:p-7 shadow-2xl flex flex-col gap-5 relative overflow-hidden"
        style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.14), rgba(245, 158, 11, 0.08) 55%, transparent 72%);"
    >
        <div
            class="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-4"
        >
            <div class="flex items-center gap-3.5">
                <div
                    class="w-11 h-11 rounded-2xl bg-[#11161f] border border-[#18C6A5]/40 flex items-center justify-center text-[#18C6A5] font-black text-sm shrink-0"
                >
                    {DEFAULT_ECOSYSTEM_TICKER}
                </div>
                <div class="flex flex-col">
                    <div class="flex flex-wrap items-center gap-2">
                        <h3
                            class="text-xs md:text-sm font-black uppercase tracking-widest text-white"
                        >
                            {DEFAULT_ECOSYSTEM_TICKER} 7-Day Cooldown Staking &amp;
                            Fee-Discount Vault
                        </h3>
                        <span
                            data-testid="silo-active-tier-badge"
                            class="px-2.5 py-0.5 rounded bg-[#11161f] border border-[#18C6A5]/40 text-[#18C6A5] text-[9px] font-black uppercase"
                        >
                            {siloStakingTelemetry.tierLabel}
                        </span>
                    </div>
                    <span class="text-[10px] text-neutral-400 mt-0.5">
                        Stake {DEFAULT_ECOSYSTEM_TICKER} to unlock protocol fee discounts
                        across 24/7 Wall Street Equity, Commodity, and Crypto swaps
                        (7-day unbonding cooldown).
                    </span>
                </div>
            </div>
            <div class="flex flex-wrap items-center gap-2 text-[9px] font-mono">
                <span
                    class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-white/10 text-neutral-300 whitespace-nowrap"
                >
                    ≥10k {DEFAULT_ECOSYSTEM_TICKER}:
                    <strong class="text-[#18C6A5]">0.75% Fee</strong>
                </span>
                <span
                    class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-white/10 text-neutral-300 whitespace-nowrap"
                >
                    ≥100k {DEFAULT_ECOSYSTEM_TICKER}:
                    <strong class="text-amber-400">0.50% Fee</strong>
                </span>
                <span
                    class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-white/10 text-neutral-300 whitespace-nowrap"
                >
                    ≥1M {DEFAULT_ECOSYSTEM_TICKER}:
                    <strong class="text-blue-400">0.25% Fee</strong>
                </span>
            </div>
        </div>

        <!-- 1-CLICK FIAT-TO-SILO (BUY & AUTO-STAKE) ACTION BAR -->
        <div
            class="bg-[#11161f] border border-[#18C6A5]/40 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
        >
            <div class="flex flex-col gap-1">
                <div class="flex items-center gap-2 flex-wrap">
                    <span
                        class="px-2 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/50 text-[#18C6A5] text-[8px] font-mono font-black uppercase whitespace-nowrap"
                    >
                        1-CLICK FIAT-TO-SILO
                    </span>
                    <span
                        class="text-xs font-black uppercase tracking-wider text-white"
                    >
                        Direct Bank / Card → {DEFAULT_ECOSYSTEM_TICKER} Fee-Discount
                        Vault
                    </span>
                </div>
                <span class="text-[10px] text-neutral-400">
                    Need {DEFAULT_ECOSYSTEM_TICKER}? Buy directly with USD (~{estimatedSiloFromFiat.toLocaleString(
                        undefined,
                        { maximumFractionDigits: 0 }
                    )}
                    {DEFAULT_ECOSYSTEM_TICKER} for ${fiatToSiloPresetUsd} USD) and
                    auto-stake into your Fee Shield in one click.
                </span>
            </div>

            <div class="flex flex-wrap items-center gap-2 shrink-0">
                <div
                    class="flex items-center gap-1 bg-[#0a0d12] p-1 rounded-xl border border-white/10"
                >
                    {#each ['100', '250', '500', '2000'] as usdPreset}
                        <button
                            type="button"
                            onclick={() => (fiatToSiloPresetUsd = usdPreset)}
                            class="px-2 py-1 rounded-lg text-[9px] font-mono font-bold uppercase cursor-pointer transition-colors whitespace-nowrap {fiatToSiloPresetUsd ===
                            usdPreset
                                ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/40'
                                : 'text-neutral-400 hover:text-white'}"
                        >
                            ${Number(usdPreset).toLocaleString()}
                        </button>
                    {/each}
                </div>

                <label
                    class="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-[#0a0d12] border border-white/10 text-[9px] font-mono font-bold text-neutral-300 cursor-pointer select-none whitespace-nowrap"
                >
                    <input
                        type="checkbox"
                        bind:checked={autoStakeOnFiatBuy}
                        class="accent-[#18C6A5] cursor-pointer"
                    />
                    <span>Auto-Stake Vault</span>
                </label>

                <button
                    type="button"
                    data-testid="silo-buy-autostake-fiat-btn"
                    onclick={() =>
                        ui.openFiatModal(
                            DEFAULT_ECOSYSTEM_TICKER,
                            autoStakeOnFiatBuy,
                            fiatToSiloPresetUsd
                        )}
                    class="tactile-btn px-4 py-2.5 rounded-xl border-[#18C6A5]/50 text-[#18C6A5] text-[10px] font-black uppercase tracking-widest cursor-pointer whitespace-nowrap"
                    style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.22), transparent 70%);"
                >
                    {autoStakeOnFiatBuy
                        ? `[ $ Buy & Auto-Stake SILO ($${fiatToSiloPresetUsd}) → ]`
                        : `[ $ Buy SILO with USD ($${fiatToSiloPresetUsd}) → ]`}
                </button>
            </div>
        </div>

        {#if swapError}
            <div
                class="bg-red-950/25 border border-red-500/40 p-3 rounded-xl text-center"
            >
                <span
                    class="text-[10px] font-mono font-bold uppercase tracking-widest text-red-400"
                >
                    ⚠ {swapError}
                </span>
            </div>
        {/if}

        <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div
                class="lg:col-span-5 bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-3 relative"
            >
                {#if ui.microBadges['silo_stake_btn']}
                    <div
                        class="micro-confirm-badge absolute -top-3 right-3 px-2.5 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/60 text-[#18C6A5] text-[8px] font-mono font-black uppercase"
                    >
                        {ui.microBadges['silo_stake_btn'].label}
                    </div>
                {/if}
                <div class="flex justify-between items-center text-[10px]">
                    <span
                        class="font-bold uppercase tracking-widest text-neutral-300"
                    >
                        Stake Existing {DEFAULT_ECOSYSTEM_TICKER} (7-Day Cooldown)
                    </span>
                    <button
                        type="button"
                        onclick={() => {
                            siloStakeAmountInput = String(
                                siloAsset.availableBalance || 0
                            );
                        }}
                        class="tactile-btn px-2 py-0.5 rounded text-[8px] font-bold uppercase text-[#18C6A5] cursor-pointer"
                    >
                        [MAX: {siloAsset.availableBalance.toLocaleString()}]
                    </button>
                </div>
                <div class="flex items-center gap-2">
                    <input
                        type="number"
                        data-testid="silo-stake-amount-input"
                        bind:value={siloStakeAmountInput}
                        placeholder="10000"
                        class="flex-1 bg-[#0a0d12] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3.5 py-2.5 text-sm font-mono font-bold text-white outline-none"
                    />
                    <button
                        type="button"
                        data-testid="silo-stake-submit-btn"
                        onclick={onExecuteStakeSilo}
                        disabled={isStakingSilo ||
                            !siloStakeAmountInput ||
                            parseFloat(siloStakeAmountInput) <= 0}
                        class="tactile-btn px-5 py-2.5 rounded-xl border-[#18C6A5]/45 text-[#18C6A5] text-[10px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-40 whitespace-nowrap"
                    >
                        {isStakingSilo
                            ? 'Staking...'
                            : `Stake ${DEFAULT_ECOSYSTEM_TICKER}`}
                    </button>
                </div>
                <div
                    class="flex justify-between text-[9px] text-neutral-400 pt-1 border-t border-white/5"
                >
                    <span>
                        Active Staked: <strong class="text-white"
                            >{siloStakingTelemetry.activeStaked.toLocaleString()}
                            {DEFAULT_ECOSYSTEM_TICKER}</strong
                        >
                    </span>
                    <span>
                        In 7D Cooldown: <strong class="text-amber-400"
                            >{siloStakingTelemetry.cooldownStaked.toLocaleString()}
                            {DEFAULT_ECOSYSTEM_TICKER}</strong
                        >
                    </span>
                </div>
            </div>

            <div class="lg:col-span-7 flex flex-col gap-2.5">
                {#if siloStakingTelemetry.positions.length === 0}
                    <div
                        class="py-8 text-center border border-dashed border-white/10 rounded-2xl bg-[#11161f]/40 text-[10px] text-neutral-500 uppercase tracking-widest"
                    >
                        No active {DEFAULT_ECOSYSTEM_TICKER} staking positions. Stake
                        ≥10,000 {DEFAULT_ECOSYSTEM_TICKER} or use 1-Click Buy &amp;
                        Auto-Stake above to unlock the 0.75% fee tier.
                    </div>
                {:else}
                    {#each siloStakingTelemetry.positions as spos (spos.stakeId)}
                        {@const sBadge =
                            ui.microBadges[`silo_pos_${spos.stakeId}`]}
                        <div
                            data-testid="silo-stake-row-{spos.stakeId}"
                            class="bg-[#11161f] border border-white/10 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[10px] relative"
                        >
                            {#if sBadge}
                                <div
                                    class="micro-confirm-badge absolute -top-2.5 right-3 px-2 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/60 text-[#18C6A5] text-[8px] font-mono font-black uppercase"
                                >
                                    {sBadge.label}
                                </div>
                            {/if}
                            <div class="flex flex-col gap-0.5">
                                <div class="flex items-center gap-2">
                                    <span class="font-black text-white text-xs">
                                        {Number(
                                            spos.amountStaked || 0
                                        ).toLocaleString()}
                                        {spos.ticker}
                                    </span>
                                    <span
                                        class="px-2 py-0.5 rounded text-[8px] font-black uppercase border {spos.status ===
                                        'ACTIVE'
                                            ? 'border-[#18C6A5]/40 text-[#18C6A5] bg-[#18C6A5]/10'
                                            : 'border-amber-500/40 text-amber-400 bg-amber-500/10'}"
                                    >
                                        {spos.status === 'ACTIVE'
                                            ? 'ACTIVE FEE SHIELD'
                                            : '7-DAY COOLDOWN'}
                                    </span>
                                </div>
                                {#if spos.status === 'COOLDOWN' && spos.cooldownEndsAt}
                                    <span class="text-[9px] text-amber-400">
                                        Unbonding Cooldown Ends: {new Date(
                                            spos.cooldownEndsAt
                                        ).toLocaleString()}
                                    </span>
                                {:else}
                                    <span class="text-[9px] text-neutral-400">
                                        Unstaking requires a 7-day cooldown
                                        period before withdrawal.
                                    </span>
                                {/if}
                            </div>
                            <div class="flex items-center gap-2 shrink-0">
                                {#if spos.status === 'ACTIVE'}
                                    <button
                                        type="button"
                                        data-testid="silo-initiate-cooldown-btn-{spos.stakeId}"
                                        disabled={isMutatingSiloId ===
                                            spos.stakeId}
                                        onclick={() =>
                                            onInitiateSiloCooldown(
                                                spos.stakeId
                                            )}
                                        class="tactile-btn px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider text-amber-400 border-amber-500/40 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                                    >
                                        {isMutatingSiloId === spos.stakeId
                                            ? 'Starting...'
                                            : '[Initiate 7-Day Cooldown]'}
                                    </button>
                                {:else}
                                    <button
                                        type="button"
                                        data-testid="silo-claim-unstaked-btn-{spos.stakeId}"
                                        disabled={!spos.isMatured ||
                                            isMutatingSiloId === spos.stakeId}
                                        onclick={() =>
                                            onClaimUnstakedSilo(spos.stakeId)}
                                        class="tactile-btn px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-40 whitespace-nowrap {spos.isMatured
                                            ? 'text-[#18C6A5] border-[#18C6A5]/45'
                                            : 'text-neutral-500'}"
                                    >
                                        {spos.isMatured
                                            ? '[Claim Unstaked SILO ✓]'
                                            : 'Cooldown Active (7D)'}
                                    </button>
                                {/if}
                            </div>
                        </div>
                    {/each}
                {/if}
            </div>
        </div>
    </div>
</div>