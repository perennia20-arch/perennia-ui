<!-- WINDOWS (FRONTEND): C:\Users\send2\perennia-v5\perennia-frontend\src\lib\components\dex\LiquidityAndSiloPanel.svelte -->
<script lang="ts">
    import { treasury } from '$lib/stores/treasury.svelte';
    import {
        LIVE_PRICING_UNAVAILABLE_MESSAGE,
        parseU128Str,
        type U128Str
    } from '$lib/crypto/atomicMath';
    import type { PairFeeRateBps, Sector } from '$lib/stores/type';
    import {
        KASPA_NATIVE_PAIR_ASSETS,
        PAIR_FEE_RATE_PRESETS,
        computeHashrateQuickFillPct,
        computeWalletQuickFillDecimal,
        formatPairReserveDisplay,
        isKaspaNativePairAsset
    } from '$lib/components/operations/operationsHelpers';
    import { dexAtomicDecimals } from './dexHelpers';

    let {
        mode = 'swap',
        baseTicker = $bindable('KAS'),
        partnerTicker = $bindable('SILO'),
        baseAmount = $bindable(''),
        feeRateBps = $bindable<PairFeeRateBps>(100),
        allocationPct = $bindable(0),
        maxAllocationPct = 100,
        displayHashrate = 0,
        livePricingUnavailable = false,
        isSubmitting = false,
        isWithdrawingId = null,
        errorMessage = null,
        plantSectors = [],
        onExecutePair,
        onFundReserve,
        onCancelOrWithdrawReserve,
        onCancelModal
    }: {
        mode?: 'mine' | 'swap';
        baseTicker?: string;
        partnerTicker?: string;
        baseAmount?: string;
        feeRateBps?: PairFeeRateBps;
        allocationPct?: number;
        maxAllocationPct?: number;
        displayHashrate?: number;
        livePricingUnavailable?: boolean;
        isSubmitting?: boolean;
        isWithdrawingId?: string | null;
        errorMessage?: string | null;
        plantSectors?: Sector[];
        onExecutePair?: (params: {
            baseTicker: string;
            partnerTicker: string;
            baseAmount: string;
            feeRateBps: PairFeeRateBps;
            allocationPct: number;
        }) => Promise<void> | void;
        onFundReserve?: (sector: Sector) => void;
        onCancelOrWithdrawReserve?: (
            sector: Sector,
            action: 'cancel' | 'withdraw'
        ) => Promise<void> | void;
        onCancelModal?: () => void;
    } = $props();

    let kaspaNativeChoices = $derived.by(() => {
        const seen = new Set<string>();
        const funded: string[] = [];
        const nativeRest: string[] = [];

        for (const a of treasury.registry) {
            const t = String(a?.ticker || '').trim().toUpperCase();
            if (!t || seen.has(t) || !isKaspaNativePairAsset(t)) continue;
            seen.add(t);
            const atomic = parseU128Str(a.onChainAtomic || '0');
            if (atomic > 0n) funded.push(t);
            else nativeRest.push(t);
        }
        for (const t of KASPA_NATIVE_PAIR_ASSETS) {
            if (!seen.has(t)) {
                seen.add(t);
                nativeRest.push(t);
            }
        }
        return [...funded, ...nativeRest];
    });

    let baseChoices = $derived(kaspaNativeChoices);
    let partnerChoices = $derived(
        kaspaNativeChoices.filter((t) => t !== String(baseTicker || '').toUpperCase())
    );

    $effect(() => {
        const cleanBase = String(baseTicker || 'KAS').toUpperCase();
        const cleanPartner = String(partnerTicker || 'SILO').toUpperCase();
        if (cleanBase === cleanPartner) {
            partnerTicker = partnerChoices[0] || (cleanBase === 'KAS' ? 'SILO' : 'KAS');
        }
    });

    let baseAsset = $derived(treasury.getAsset(baseTicker));
    let baseBalanceAtomic = $derived.by<bigint>(() => {
        try {
            return parseU128Str(baseAsset?.onChainAtomic || '0', 'baseBalanceAtomic');
        } catch {
            return 0n;
        }
    });
    let baseDecimals = $derived(baseAsset?.decimals ?? dexAtomicDecimals(baseTicker));
    let maxBaseDecimal = $derived(
        computeWalletQuickFillDecimal(baseAsset?.onChainAtomic || '0', baseDecimals, 100)
    );
    let partnerAsset = $derived(treasury.getAsset(partnerTicker));
    let partnerBalanceAtomic = $derived.by<bigint>(() => {
        try {
            return parseU128Str(partnerAsset?.onChainAtomic || '0', 'partnerBalanceAtomic');
        } catch {
            return 0n;
        }
    });
    let partnerDecimals = $derived(partnerAsset?.decimals ?? dexAtomicDecimals(partnerTicker));
    let partnerMaxDecimal = $derived(
        computeWalletQuickFillDecimal(partnerAsset?.onChainAtomic || '0', partnerDecimals, 100)
    );

    let hasPositiveAmount = $derived.by(() => {
        const t = String(baseAmount || '').trim();
        return /^\d+(\.\d+)?$/.test(t) && /[1-9]/.test(t);
    });
    let submitDisabled = $derived(
        isSubmitting || livePricingUnavailable || !hasPositiveAmount || baseBalanceAtomic <= 0n
    );

    function handleAllocationPctInput(raw: string) {
        const parsed = parseFloat(raw);
        if (!Number.isFinite(parsed)) {
            allocationPct = 0;
            return;
        }
        allocationPct = Math.max(0, Math.min(Math.max(0, maxAllocationPct), parsed));
    }

    function handleHashrateInput(raw: string) {
        const parsed = parseFloat(raw);
        if (!Number.isFinite(parsed) || displayHashrate <= 0) {
            allocationPct = 0;
            return;
        }
        const pct = (parsed / displayHashrate) * 100;
        allocationPct = Math.max(
            0,
            Math.min(Math.max(0, maxAllocationPct), Number(pct.toFixed(2)))
        );
    }

    async function submitPair() {
        if (submitDisabled || !onExecutePair) return;
        await onExecutePair({
            baseTicker: String(baseTicker || 'KAS').toUpperCase(),
            partnerTicker: String(partnerTicker || 'SILO').toUpperCase(),
            baseAmount: String(baseAmount || '').trim(),
            feeRateBps,
            allocationPct: mode === 'mine' ? allocationPct : 0
        });
    }
</script>

<div
    data-testid="pair-flow-panel"
    class="w-full {mode === 'swap' ? 'max-w-[540px] mx-auto' : ''} flex flex-col gap-3 font-mono"
>
    <div class="bg-[var(--bg-card)] border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
        <!-- ASSET PAIR + AMOUNT -->
        <div class="flex items-center justify-between text-[11px] font-bold">
            <select
                aria-label={baseTicker}
                data-testid="pair-base-select"
                bind:value={baseTicker}
                class="bg-[var(--bg-elevated)] border border-white/15 rounded-xl px-3 py-2 text-xs font-black text-white uppercase outline-none cursor-pointer"
            >
                {#each baseChoices as tick}
                    <option value={tick}>{tick}</option>
                {/each}
            </select>
            <span class="text-xs font-black text-neutral-500">×</span>
            <select
                aria-label={partnerTicker}
                data-testid="pair-partner-select"
                bind:value={partnerTicker}
                class="bg-[var(--bg-elevated)] border border-white/15 rounded-xl px-3 py-2 text-xs font-black text-white uppercase outline-none cursor-pointer"
            >
                {#each partnerChoices as tick}
                    <option value={tick}>{tick}</option>
                {/each}
            </select>
        </div>

        <div class="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-3 flex flex-col gap-2">
            <div class="flex items-center justify-between text-[10px] text-neutral-400 tabular-nums">
                <span>{baseTicker} {maxBaseDecimal}</span>
                <span>{partnerTicker} {partnerMaxDecimal}</span>
            </div>
            <input
                type="text"
                inputmode="decimal"
                data-testid="pair-modal-swap-amount"
                bind:value={baseAmount}
                placeholder="0.00"
                disabled={livePricingUnavailable}
                class="w-full bg-[var(--bg-card)] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3 py-2.5 text-lg font-black text-white tabular-nums outline-none disabled:opacity-40"
            />
            <div class="grid grid-cols-4 gap-1.5">
                {#each ([25, 50, 75, 100] as const) as pct}
                    <button
                        type="button"
                        data-testid="pair-wallet-qf-{pct}"
                        disabled={livePricingUnavailable || baseBalanceAtomic <= 0n}
                        onclick={() => {
                            baseAmount = computeWalletQuickFillDecimal(
                                (baseAsset?.onChainAtomic || '0') as U128Str,
                                baseDecimals,
                                pct
                            );
                        }}
                        class="py-1.5 rounded-lg bg-[var(--bg-card)] border border-white/10 hover:border-[#18C6A5]/50 text-[10px] font-bold text-neutral-300 hover:text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {pct === 100 ? 'MAX' : `${pct}%`}
                    </button>
                {/each}
            </div>
        </div>

        <!-- FEE TIER PILLS -->
        <div data-testid="pair-fee-rate-row" class="grid grid-cols-3 gap-1.5">
            {#each PAIR_FEE_RATE_PRESETS as preset (preset.bps)}
                <button
                    type="button"
                    data-testid="pair-fee-pill-{preset.bps}"
                    onclick={() => (feeRateBps = preset.bps)}
                    class="py-2 rounded-xl border text-[11px] font-bold transition-colors cursor-pointer {feeRateBps === preset.bps ? 'bg-[var(--bg-hover)] border-[#18C6A5]/60 text-[#18C6A5]' : 'bg-[var(--bg-elevated)] border-white/10 text-neutral-400 hover:text-white'}"
                >
                    {preset.label}
                </button>
            {/each}
        </div>

        <!-- UNLABELED % / TH/s SLIDER (MINE MODE ONLY) -->
        {#if mode === 'mine'}
            <div
                data-testid="pair-hashrate-slider-row"
                class="flex items-center gap-1.5 pt-1 border-t border-white/5"
            >
                <div class="flex items-center bg-[var(--bg-elevated)] border border-white/10 rounded-lg px-2 py-1 shrink-0">
                    <input
                        type="number"
                        value={Number(allocationPct || 0).toFixed(1)}
                        oninput={(e) => handleAllocationPctInput(e.currentTarget.value)}
                        class="w-10 bg-transparent text-white text-[11px] font-bold outline-none text-right tabular-nums"
                    />
                    <span class="text-neutral-500 text-[10px] ml-0.5">%</span>
                </div>
                <input
                    type="range"
                    min="0"
                    max={Math.max(0, maxAllocationPct)}
                    step="0.1"
                    disabled={maxAllocationPct <= 0}
                    bind:value={allocationPct}
                    oninput={() => {
                        if (allocationPct > maxAllocationPct) {
                            allocationPct = computeHashrateQuickFillPct(maxAllocationPct, 100);
                        }
                    }}
                    class="pair-slim-range flex-1 min-w-[60px] cursor-pointer disabled:opacity-40"
                />
                <div class="flex items-center gap-0.5 bg-[var(--bg-elevated)] border border-white/10 rounded-lg px-2 py-1 shrink-0">
                    <input
                        type="number"
                        value={(displayHashrate * (Number(allocationPct || 0) / 100)).toFixed(2)}
                        oninput={(e) => handleHashrateInput(e.currentTarget.value)}
                        class="w-11 bg-transparent text-[#18C6A5] text-[11px] font-bold outline-none text-right tabular-nums"
                    />
                    <span class="text-neutral-500 text-[9px]">TH/s</span>
                </div>
            </div>
        {/if}

        {#if livePricingUnavailable}
            <div class="px-3 py-2 rounded-xl bg-[var(--bg-elevated)] border border-amber-500/40 text-[10px] font-bold text-amber-300">
                {LIVE_PRICING_UNAVAILABLE_MESSAGE}
            </div>
        {:else if errorMessage}
            <div class="px-3 py-2 rounded-xl bg-[var(--bg-danger-subtle)] border border-red-500/40 text-[10px] font-bold text-red-300">
                {errorMessage}
            </div>
        {/if}

        <div class="flex items-center gap-2 pt-1">
            {#if mode === 'mine' && onCancelModal}
                <button
                    type="button"
                    onclick={onCancelModal}
                    class="tactile-btn flex-1 py-3 rounded-xl border border-white/10 text-neutral-300 hover:text-white text-xs font-black uppercase tracking-widest cursor-pointer"
                >
                    CANCEL
                </button>
            {/if}
            <button
                type="button"
                data-testid={mode === 'mine' ? 'initialize-sector-btn' : 'dex-supply-lp-btn'}
                disabled={submitDisabled}
                onclick={submitPair}
                class="tactile-btn flex-[2] py-3 rounded-xl border border-[#18C6A5]/45 text-[#18C6A5] hover:text-white text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.16), transparent 70%);"
            >
                {livePricingUnavailable ? LIVE_PRICING_UNAVAILABLE_MESSAGE : 'PAIR'}
            </button>
        </div>
    </div>

    {#if mode === 'swap' && plantSectors.length > 0}
        <div class="flex flex-col gap-2" data-testid="swap-pair-reserves-list">
            {#each plantSectors as sec (sec.id)}
                {@const reserve = sec.settlementConfig?.pairReserve}
                {#if reserve}
                    {@const disp = formatPairReserveDisplay(reserve)}
                    {#if reserve.status === 'QUEUED'}
                        <div class="bg-[var(--bg-card)] border border-white/10 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                            <div class="flex items-center gap-2 min-w-0">
                                <span class="font-black text-white">{reserve.baseTicker} / {reserve.partnerTicker}</span>
                                <span class="px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-amber-500/40 text-[9px] font-bold text-amber-300 uppercase">QUEUED</span>
                            </div>
                            <span class="text-neutral-300 tabular-nums text-[11px]">
                                {disp.heldBaseFormatted} {reserve.baseTicker} / {disp.queuedBaseFormatted} {reserve.baseTicker}
                            </span>
                            <button
                                type="button"
                                disabled={isWithdrawingId === sec.id}
                                onclick={() => onCancelOrWithdrawReserve?.(sec, 'cancel')}
                                class="px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] border border-white/15 hover:border-red-400/50 text-[10px] font-black uppercase text-neutral-300 hover:text-red-300 cursor-pointer disabled:opacity-40"
                            >
                                CANCEL
                            </button>
                        </div>
                    {:else}
                        <div class="bg-[var(--bg-card)] border border-white/10 rounded-xl p-3 flex flex-col gap-2 text-xs">
                            <div class="flex items-center justify-between gap-2">
                                <span class="font-black text-white">{reserve.baseTicker} / {reserve.partnerTicker}</span>
                                <div class="flex items-center gap-2 tabular-nums">
                                    <span class="text-white font-bold">
                                        {disp.livePricingUnavailable ? LIVE_PRICING_UNAVAILABLE_MESSAGE : disp.totalUsdFormatted}
                                    </span>
                                    <span class="text-[#18C6A5] font-bold">{disp.accruedFeesUsdFormatted}</span>
                                </div>
                            </div>
                            <div class="flex items-center justify-between text-[11px] text-neutral-300 tabular-nums">
                                <span>{disp.baseFormatted} {reserve.baseTicker}</span>
                                <span>{disp.partnerFormatted} {reserve.partnerTicker}</span>
                            </div>
                            <div class="flex items-center gap-2">
                                <button
                                    type="button"
                                    onclick={() => onFundReserve?.(sec)}
                                    class="flex-1 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[#18C6A5]/40 text-[#18C6A5] hover:text-white text-[10px] font-black uppercase cursor-pointer"
                                >
                                    FUND
                                </button>
                                <button
                                    type="button"
                                    disabled={isWithdrawingId === sec.id}
                                    onclick={() => onCancelOrWithdrawReserve?.(sec, 'withdraw')}
                                    class="flex-1 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-white/15 text-neutral-300 hover:text-white text-[10px] font-black uppercase cursor-pointer disabled:opacity-40"
                                >
                                    WITHDRAW
                                </button>
                            </div>
                        </div>
                    {/if}
                {/if}
            {/each}
        </div>
    {/if}
</div>

<style>
    input[type='range'].pair-slim-range {
        -webkit-appearance: none;
        appearance: none;
        height: 4px;
        border-radius: 999px;
        background: var(--border-subtle);
        outline: none;
    }
    input[type='range'].pair-slim-range::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 12px;
        height: 12px;
        border-radius: 999px;
        background: var(--bg-card);
        border: 2px solid #18c6a5;
        cursor: pointer;
    }
</style>
