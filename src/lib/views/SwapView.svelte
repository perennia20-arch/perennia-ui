<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { fade, slide } from 'svelte/transition';
    import { browser } from '$app/environment';
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { operations } from '$lib/stores/operations.svelte';
    import {
        treasury,
        DEFAULT_ECOSYSTEM_TICKER
    } from '$lib/stores/treasury.svelte';
    import { settingsStore } from '$lib/stores/settings.svelte';
    import { txState, getChainExplorerTxUrl } from '$lib/stores/transaction.svelte';
    import FiatBridgePanel from '$lib/components/dex/FiatBridgePanel.svelte';
    import {
        LOCK_OPTIONS,
        formatRetailSafeCopy,
        downloadWireSlipPdf,
        computeOnrampCostPlusQuote,
        type LpPosition,
        type SiloStakePosition,
        type SecondaryPlantLeg
    } from '$lib/components/dex/dexHelpers';

    type DexMode = 'SWAP' | 'FIAT' | 'LP_VAULT' | 'P2P';

    let activeDexMode = $state<DexMode>('SWAP');
    let executionMode = $state<'BATCH_2200_UTC' | 'INSTANT_SOR'>('BATCH_2200_UTC');
    let fundingSource = $state<'LEDGER' | 'ONCHAIN_L1'>('LEDGER');

    let payTicker = $state('KAS');
    let receiveTicker = $state('USDC');
    let payAmount = $state('250');
    let destinationL1Address = $state('');

    let showPaySelector = $state(false);
    let showReceiveSelector = $state(false);
    let assetSearchQuery = $state('');

    let isExecuting = $state(false);
    let tileSweepActive = $state(false);
    let swapError = $state<string | null>(null);
    let swapSuccessBanner = $state<string | null>(null);
    let lastSwapTxHash = $state<string | null>(null);
    let lastSwapExplorerUrl = $state<string | null>(null);
    let reservedUsdOnrampPass = $state<any | null>(null);

    // SILO Fee-Discount Staking & Multi-Asset LP State
    let siloPositions = $state<SiloStakePosition[]>([]);
    let lpPositions = $state<LpPosition[]>([]);
    let siloStakeInput = $state('1000');
    let lpKasAmountInput = $state('500');
    let lpPairTicker = $state('USDC');
    let lpLockDays = $state<number>(365);
    let secondaryLegs = $state<SecondaryPlantLeg[]>([
        { ticker: 'USDC', weightPct: 50, amount: '75' }
    ]);
    let isMutatingLpOrSilo = $state(false);

    // P2P Atomic Orderbook State
    let p2pOrders = $state<any[]>([]);
    let p2pOfferTicker = $state('KAS');
    let p2pOfferAmount = $state('500');
    let p2pAskTicker = $state('USDC');
    let p2pAskAmount = $state('75');
    let isLoadingP2p = $state(false);

    function triggerTileSweep() {
        tileSweepActive = true;
        setTimeout(() => {
            tileSweepActive = false;
        }, 700);
    }

    // Hydrate prefilled swap intent routed from Treasury search
    $effect(() => {
        const prefill = (ui as any).dexPrefill;
        if (prefill && (prefill.payAsset || prefill.receiveAsset)) {
            if (prefill.payAsset) payTicker = String(prefill.payAsset).toUpperCase();
            if (prefill.receiveAsset) {
                receiveTicker = String(prefill.receiveAsset).toUpperCase();
            }
            if (prefill.amount) payAmount = String(prefill.amount);
            activeDexMode = 'SWAP';
            (ui as any).dexPrefill = null;
        }
    });

    function resolveStrictLiveSpotUsd(ticker: string): number {
        const clean = String(ticker || '').trim().toUpperCase();
        if (clean === 'USD' || clean === 'USDC' || clean === 'USDT') return 1.0;
        const assetObj = treasury.getAsset(clean);
        if (Number.isFinite(assetObj.spotPrice) && assetObj.spotPrice > 0) {
            return assetObj.spotPrice;
        }
        const kasSpot = treasury.getAsset('KAS').spotPrice || 0;
        if (clean === DEFAULT_ECOSYSTEM_TICKER && kasSpot > 0) {
            return Number((kasSpot / 23.809524).toFixed(6));
        }
        return 0;
    }

    let paySpotUsd = $derived(resolveStrictLiveSpotUsd(payTicker));
    let receiveSpotUsd = $derived(resolveStrictLiveSpotUsd(receiveTicker));

    let oracleHaltActive = $derived(
        paySpotUsd <= 0 || receiveSpotUsd <= 0
    );

    let activeStakedSiloTotal = $derived(
        siloPositions
            .filter((p) => p.status === 'ACTIVE')
            .reduce((sum, p) => sum + (Number(p.amountStaked) || 0), 0)
    );

    let effectiveProtocolFeePct = $derived.by(() => {
        if (payTicker === 'USD') {
            return computeOnrampCostPlusQuote({
                assetTicker: receiveTicker,
                grossUsd: Math.max(0, parseFloat(payAmount) || 0),
                spotPriceUsd: receiveSpotUsd,
                autoStakeSilo: false,
                bundledKasOrSilo:
                    receiveTicker === 'KAS' ||
                    receiveTicker === DEFAULT_ECOSYSTEM_TICKER
            }).effectiveFeePct;
        }
        if (executionMode === 'BATCH_2200_UTC') {
            if (activeStakedSiloTotal >= 25000) return 0.15;
            if (activeStakedSiloTotal >= 5000) return 0.25;
            return 0.35;
        }
        if (activeStakedSiloTotal >= 25000) return 0.25;
        if (activeStakedSiloTotal >= 5000) return 0.5;
        return 0.75;
    });

    let swapQuote = $derived.by(() => {
        const parsedIn = Math.max(0, parseFloat(payAmount) || 0);
        if (parsedIn <= 0 || oracleHaltActive) {
            return {
                grossUsd: 0,
                feeUsd: 0,
                netUsd: 0,
                estimatedOut: 0,
                exchangeRate:
                    paySpotUsd > 0 && receiveSpotUsd > 0
                        ? paySpotUsd / receiveSpotUsd
                        : 0
            };
        }

        if (payTicker === 'USD') {
            const onrampQuote = computeOnrampCostPlusQuote({
                assetTicker: receiveTicker,
                grossUsd: parsedIn,
                spotPriceUsd: receiveSpotUsd,
                autoStakeSilo: false,
                bundledKasOrSilo:
                    receiveTicker === 'KAS' ||
                    receiveTicker === DEFAULT_ECOSYSTEM_TICKER
            });
            return {
                grossUsd: onrampQuote.grossUsd,
                feeUsd: onrampQuote.feeUsd,
                netUsd: onrampQuote.guestNetUsd,
                estimatedOut: onrampQuote.estimatedTokens,
                exchangeRate: receiveSpotUsd > 0 ? 1 / receiveSpotUsd : 0
            };
        }

        const grossUsd = parsedIn * paySpotUsd;
        const feeUsd = Number(
            ((grossUsd * effectiveProtocolFeePct) / 100).toFixed(4)
        );
        const netUsd = Math.max(0, grossUsd - feeUsd);
        const estimatedOut = receiveSpotUsd > 0 ? netUsd / receiveSpotUsd : 0;
        const exchangeRate = receiveSpotUsd > 0 ? paySpotUsd / receiveSpotUsd : 0;

        return {
            grossUsd,
            feeUsd,
            netUsd,
            estimatedOut,
            exchangeRate
        };
    });

    let availablePayBalance = $derived.by(() => {
        if (payTicker === 'USD') return 0;
        const asset = treasury.getAsset(payTicker);
        if (fundingSource === 'ONCHAIN_L1') {
            return Number(asset.onChain || 0);
        }
        return Number(asset.synthetic || 0);
    });

    let filteredSelectableAssets = $derived.by(() => {
        const q = assetSearchQuery.trim().toLowerCase();
        const usdPseudo = {
            ticker: 'USD',
            name: 'US Dollar (Sovereign ACH / Wire)',
            assetClass: 'Fiat Rail',
            spotPrice: 1.0
        };
        const all = [usdPseudo, ...treasury.registry.filter((a) => a.ticker !== 'USD')];
        if (!q) return all;
        return all.filter(
            (a) =>
                a.ticker.toLowerCase().includes(q) ||
                a.name.toLowerCase().includes(q) ||
                a.assetClass.toLowerCase().includes(q)
        );
    });

    function flipAssets() {
        const prevPay = payTicker;
        payTicker = receiveTicker;
        receiveTicker = prevPay;
        swapError = null;
        swapSuccessBanner = null;
        reservedUsdOnrampPass = null;
    }

    export async function syncUserBalances() {
        if (!browser || !identity.isWalletConnected || !identity.activeAddress)
            return;
        try {
            const [ledgerRes, balRes, lpRes, p2pRes] = await Promise.all([
                fetch(
                    `/api/user/ledger?wallet=${encodeURIComponent(identity.activeAddress)}`
                ),
                fetch(
                    `/api/balance?address=${encodeURIComponent(identity.activeAddress)}`
                ),
                fetch(
                    `/api/lp?wallet=${encodeURIComponent(identity.activeAddress)}`
                ).catch(() => null),
                fetch('/api/p2p').catch(() => null)
            ]);

            if (ledgerRes.ok) {
                const ledgerData = await ledgerRes.json();
                for (const [ticker, val] of Object.entries(ledgerData)) {
                    if (
                        ticker !== 'unassignedReserveKas' &&
                        ticker !== 'unassignedReserveTargetKas'
                    ) {
                        treasury.updateAsset(ticker.toUpperCase(), {
                            synthetic: Number(val) || 0
                        });
                    }
                }
            }

            if (balRes.ok) {
                const balData = await balRes.json();
                if (typeof balData.balance === 'number') {
                    treasury.updateAsset('KAS', { onChain: balData.balance });
                }
            }

            if (lpRes && lpRes.ok) {
                const lpData = await lpRes.json();
                if (Array.isArray(lpData.positions)) {
                    lpPositions = lpData.positions;
                }
                if (Array.isArray(lpData.siloPositions)) {
                    siloPositions = lpData.siloPositions;
                }
            }

            if (p2pRes && p2pRes.ok) {
                const p2pData = await p2pRes.json();
                if (Array.isArray(p2pData.orders)) {
                    p2pOrders = p2pData.orders;
                }
            }
        } catch {
            // Ignore transient sync error
        }
    }

    async function executeSorSwap() {
        swapError = null;
        swapSuccessBanner = null;
        lastSwapTxHash = null;
        lastSwapExplorerUrl = null;
        reservedUsdOnrampPass = null;

        if (!identity.isWalletConnected || !identity.activeAddress) {
            ui.showWalletModal = true;
            return;
        }

        const parsedAmount = parseFloat(payAmount);
        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
            swapError = 'Enter a valid swap amount greater than 0.';
            return;
        }

        if (payTicker === receiveTicker) {
            swapError = 'Pay asset and Receive asset must be different.';
            return;
        }

        if (oracleHaltActive) {
            swapError = `ORACLE_HALT: Live oracle price feed for ${paySpotUsd <= 0 ? payTicker : receiveTicker} is offline. Failing closed.`;
            return;
        }

        // Route USD -> Token swaps through verified Settlement Pass reservation (no immediate credit)
        if (payTicker === 'USD') {
            isExecuting = true;
            try {
                const res = await fetch('/api/fiat/onramp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        walletAddress: identity.activeAddress,
                        fiatAmountUsd: parsedAmount,
                        targetAsset: receiveTicker,
                        paymentRail: 'SOVEREIGN_WIRE_ACH',
                        settlementTarget: 'L1_KAS',
                        autoStakeSilo: false,
                        bundledKasOrSilo:
                            receiveTicker === 'KAS' ||
                            receiveTicker === DEFAULT_ECOSYSTEM_TICKER
                    })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(
                        data.error || 'Failed to reserve Fiat Settlement Pass.'
                    );
                }
                reservedUsdOnrampPass = data;
                swapSuccessBanner = `Reserved Fiat Settlement Pass ${data.orderId || data.sessionId} (Status: ${data.status}). Complete wire/ACH transfer with Memo ${data.wireMemo || data.orderId} to clear tokens.`;
                triggerTileSweep();
                ui.triggerMicroBadge(
                    'dex_swap_btn',
                    `PASS ${data.orderId || data.sessionId} RESERVED ✓`,
                    '#18C6A5'
                );
            } catch (err: any) {
                swapError = err.message || 'USD On-Ramp Pass reservation failed.';
            } finally {
                isExecuting = false;
            }
            return;
        }

        if (receiveTicker === 'USD') {
            activeDexMode = 'FIAT';
            return;
        }

        if (
            fundingSource === 'LEDGER' &&
            parsedAmount > availablePayBalance + 1e-8
        ) {
            swapError = `INSUFFICIENT_BATCH_QUEUE_BALANCE: Requested ${parsedAmount.toFixed(4)} ${payTicker}, available ${availablePayBalance.toFixed(4)} ${payTicker}.`;
            return;
        }

        isExecuting = true;
        try {
            const res = await fetch('/api/sor/swap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet: identity.activeAddress,
                    payAsset: payTicker,
                    receiveAsset: receiveTicker,
                    payAmount: parsedAmount,
                    executionMode,
                    fundingSource,
                    destinationL1Address: destinationL1Address.trim() || undefined
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) {
                throw new Error(
                    data.error || 'Smart Order Router rejected swap execution.'
                );
            }

            const outQty = Number(
                data.receivedAmount ??
                    data.estimatedOutput ??
                    swapQuote.estimatedOut
            );
            const txRef = String(
                data.txHash || data.orderId || data.batchId || ''
            );
            lastSwapTxHash = txRef || null;
            lastSwapExplorerUrl = txRef
                ? getChainExplorerTxUrl(receiveTicker, txRef)
                : null;

            swapSuccessBanner =
                executionMode === 'BATCH_2200_UTC'
                    ? `Queued ${parsedAmount.toFixed(4)} ${payTicker} → ~${outQty.toFixed(4)} ${receiveTicker} for 22:00 UTC Zero-Slippage Batch Netting ✓`
                    : `Executed ${parsedAmount.toFixed(4)} ${payTicker} → ${outQty.toFixed(4)} ${receiveTicker} via Sovereign SOR ✓`;

            triggerTileSweep();
            ui.triggerMicroBadge(
                'dex_swap_btn',
                `${payTicker} → ${receiveTicker} SETTLED ✓`,
                '#18C6A5'
            );
            await syncUserBalances();
        } catch (err: any) {
            swapError = err.message || 'Failed to execute SOR swap.';
        } finally {
            isExecuting = false;
        }
    }

    async function stakeSiloTokens() {
        swapError = null;
        const amt = parseFloat(siloStakeInput);
        if (!Number.isFinite(amt) || amt <= 0) {
            swapError = 'Enter a valid SILO stake amount greater than 0.';
            return;
        }
        isMutatingLpOrSilo = true;
        try {
            const res = await fetch('/api/lp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'STAKE_SILO',
                    wallet: identity.activeAddress,
                    amount: amt
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) {
                throw new Error(data.error || 'Failed to stake SILO.');
            }
            swapSuccessBanner = `Staked ${amt.toLocaleString()} SILO into Fee-Discount Vault ✓`;
            await syncUserBalances();
        } catch (err: any) {
            swapError = err.message || 'SILO staking failed.';
        } finally {
            isMutatingLpOrSilo = false;
        }
    }

    async function provideLiquidityPosition() {
        swapError = null;
        const kasAmt = parseFloat(lpKasAmountInput);
        if (!Number.isFinite(kasAmt) || kasAmt <= 0) {
            swapError = 'Enter a valid KAS liquidity amount.';
            return;
        }
        isMutatingLpOrSilo = true;
        try {
            const res = await fetch('/api/lp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'ADD_LIQUIDITY',
                    wallet: identity.activeAddress,
                    kasAmount: kasAmt,
                    pairAsset: lpPairTicker,
                    lockDurationDays: lpLockDays,
                    secondaryLegs
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) {
                throw new Error(data.error || 'Failed to add LP position.');
            }
            swapSuccessBanner = `Committed ${kasAmt.toLocaleString()} KAS + ${lpPairTicker} to ${lpLockDays}D Liquidity Pool ✓`;
            await syncUserBalances();
        } catch (err: any) {
            swapError = err.message || 'LP provision failed.';
        } finally {
            isMutatingLpOrSilo = false;
        }
    }

    async function createP2pOffer() {
        swapError = null;
        const offerAmt = parseFloat(p2pOfferAmount);
        const askAmt = parseFloat(p2pAskAmount);
        if (
            !Number.isFinite(offerAmt) ||
            offerAmt <= 0 ||
            !Number.isFinite(askAmt) ||
            askAmt <= 0
        ) {
            swapError = 'Enter valid Offer and Ask amounts for P2P order.';
            return;
        }
        isLoadingP2p = true;
        try {
            const res = await fetch('/api/p2p', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'CREATE_ORDER',
                    makerWallet: identity.activeAddress,
                    offerAsset: p2pOfferTicker,
                    offerAmount: offerAmt,
                    askAsset: p2pAskTicker,
                    askAmount: askAmt
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || data.error) {
                throw new Error(data.error || 'Failed to post P2P offer.');
            }
            swapSuccessBanner = `Posted Atomic P2P Offer: ${offerAmt} ${p2pOfferTicker} for ${askAmt} ${p2pAskTicker} ✓`;
            await syncUserBalances();
        } catch (err: any) {
            swapError = err.message || 'Failed to create P2P order.';
        } finally {
            isLoadingP2p = false;
        }
    }

    onMount(() => {
        syncUserBalances();
    });
</script>

<div
    data-testid="swap-view"
    class="w-full min-h-[calc(100dvh-9rem)] p-4 md:p-6 lg:p-8 font-mono text-white max-w-[1440px] mx-auto pb-24 flex flex-col gap-6"
>
    <div
        class="bg-[#0a0d12] border border-white/10 rounded-[28px] p-5 md:p-6 shadow-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4"
    >
        <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2.5">
                <span class="w-2 h-2 rounded-full bg-[#18C6A5] animate-pulse"
                ></span>
                <h1
                    class="text-sm md:text-base font-black uppercase tracking-widest text-white"
                >
                    {formatRetailSafeCopy(
                        'Perennia Dark Pool DEX & Smart Order Router'
                    )}
                </h1>
                <span
                    class="px-2 py-0.5 rounded bg-[#11161f] border border-[#18C6A5]/40 text-[#18C6A5] text-[8px] font-mono font-black uppercase"
                >
                    22:00 UTC BELL IN {operations.formatEpochCountdown()}
                </span>
            </div>
            <p class="text-[10px] text-neutral-400">
                Zero-slippage 22:00 UTC batch netting, instant single-hop L1
                routing, Two-Way Zero-Loss Fiat Rails, and SILO fee-shield
                vaults.
            </p>
        </div>

        <div
            class="flex flex-wrap items-center gap-1.5 bg-[#11161f] p-1.5 rounded-2xl border border-white/10"
        >
            <button
                type="button"
                data-testid="dex-mode-swap-btn"
                onclick={() => (activeDexMode = 'SWAP')}
                class="tactile-btn px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer {activeDexMode === 'SWAP' ? 'text-[#18C6A5] border-[#18C6A5]/45' : 'text-neutral-400 hover:text-white'}"
            >
                01. SOR Swap
            </button>
            <button
                type="button"
                data-testid="dex-mode-fiat-btn"
                onclick={() => (activeDexMode = 'FIAT')}
                class="tactile-btn px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer {activeDexMode === 'FIAT' ? 'text-[#18C6A5] border-[#18C6A5]/45' : 'text-neutral-400 hover:text-white'}"
            >
                02. USD Fiat Bridge
            </button>
            <button
                type="button"
                data-testid="dex-mode-lp-btn"
                onclick={() => (activeDexMode = 'LP_VAULT')}
                class="tactile-btn px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer {activeDexMode === 'LP_VAULT' ? 'text-[#18C6A5] border-[#18C6A5]/45' : 'text-neutral-400 hover:text-white'}"
            >
                03. LP &amp; SILO Staking
            </button>
            <button
                type="button"
                data-testid="dex-mode-p2p-btn"
                onclick={() => (activeDexMode = 'P2P')}
                class="tactile-btn px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer {activeDexMode === 'P2P' ? 'text-[#18C6A5] border-[#18C6A5]/45' : 'text-neutral-400 hover:text-white'}"
            >
                04. P2P Atomic Book
            </button>
        </div>
    </div>

    {#if swapError}
        <div
            data-testid="swap-error-banner"
            class="bg-red-950/30 border border-red-500/45 rounded-2xl p-4 text-center text-xs font-bold text-red-400"
        >
            ⚠ {swapError}
        </div>
    {/if}

    {#if swapSuccessBanner}
        <div
            data-testid="swap-success-banner"
            class="bg-[#11161f] border border-[#18C6A5]/50 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#18C6A5]"
        >
            <span>✓ {swapSuccessBanner}</span>
            <div class="flex items-center gap-2">
                {#if reservedUsdOnrampPass}
                    <button
                        type="button"
                        onclick={() =>
                            downloadWireSlipPdf(reservedUsdOnrampPass, payAmount)}
                        class="tactile-btn px-3 py-1 rounded-lg text-[9px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer"
                    >
                        [Download Wire Slip PDF ↓]
                    </button>
                {/if}
                {#if lastSwapExplorerUrl && lastSwapExplorerUrl !== '#'}
                    <a
                        href={lastSwapExplorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="tactile-btn px-3 py-1 rounded-lg text-[9px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/45"
                    >
                        Verify on Explorer ↗
                    </a>
                {/if}
            </div>
        </div>
    {/if}

    {#if activeDexMode === 'FIAT'}
        <FiatBridgePanel
            {isExecuting}
            onTriggerTileSweep={triggerTileSweep}
            onSyncUserBalances={syncUserBalances}
        />
    {:else if activeDexMode === 'SWAP'}
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div
                class="lg:col-span-7 bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 md:p-8 shadow-2xl flex flex-col gap-5 relative overflow-hidden {tileSweepActive ? 'ring-1 ring-[#18C6A5]/50' : ''}"
                style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.12), transparent 60%);"
                in:fade={{ duration: 150 }}
            >
                <div
                    class="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4"
                >
                    <div class="flex flex-col">
                        <span
                            class="text-xs font-black uppercase tracking-widest text-white"
                        >
                            Sovereign Smart Order Router (SOR)
                        </span>
                        <span class="text-[9px] text-neutral-400">
                            Fee Tier: {effectiveProtocolFeePct.toFixed(2)}% ({activeStakedSiloTotal >
                            0
                                ? `${activeStakedSiloTotal.toLocaleString()} SILO Staked`
                                : 'Standard Tier'})
                        </span>
                    </div>
                    <div
                        class="flex items-center gap-1.5 bg-[#11161f] p-1 rounded-xl border border-white/10"
                    >
                        <button
                            type="button"
                            onclick={() => (executionMode = 'BATCH_2200_UTC')}
                            class="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider cursor-pointer {executionMode === 'BATCH_2200_UTC' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/40' : 'text-neutral-400 hover:text-white'}"
                        >
                            22:00 UTC Batch (0% Slippage)
                        </button>
                        <button
                            type="button"
                            onclick={() => (executionMode = 'INSTANT_SOR')}
                            class="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider cursor-pointer {executionMode === 'INSTANT_SOR' ? 'bg-[#161d29] text-amber-400 border border-amber-500/40' : 'text-neutral-400 hover:text-white'}"
                        >
                            Instant SOR Fill
                        </button>
                    </div>
                </div>

                {#if payTicker !== 'USD'}
                    <div class="flex items-center justify-between text-[9px]">
                        <span class="text-neutral-400 uppercase font-bold">
                            Funding Source
                        </span>
                        <div class="flex items-center gap-1.5">
                            <button
                                type="button"
                                onclick={() => (fundingSource = 'LEDGER')}
                                class="px-2.5 py-1 rounded-lg border text-[8px] font-bold uppercase cursor-pointer {fundingSource === 'LEDGER' ? 'bg-[#161d29] border-[#18C6A5]/45 text-[#18C6A5]' : 'bg-[#11161f] border-white/10 text-neutral-400'}"
                            >
                                Batch Queue ({treasury
                                    .getAsset(payTicker)
                                    .synthetic.toFixed(4)})
                            </button>
                            <button
                                type="button"
                                onclick={() => (fundingSource = 'ONCHAIN_L1')}
                                class="px-2.5 py-1 rounded-lg border text-[8px] font-bold uppercase cursor-pointer {fundingSource === 'ONCHAIN_L1' ? 'bg-[#161d29] border-[#18C6A5]/45 text-[#18C6A5]' : 'bg-[#11161f] border-white/10 text-neutral-400'}"
                            >
                                On-Chain L1 ({treasury
                                    .getAsset(payTicker)
                                    .onChain.toFixed(4)})
                            </button>
                        </div>
                    </div>
                {/if}

                <div
                    class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-2 relative"
                >
                    <div
                        class="flex items-center justify-between text-[9px] text-neutral-400"
                    >
                        <span class="uppercase font-bold">You Pay</span>
                        {#if payTicker !== 'USD'}
                            <button
                                type="button"
                                onclick={() =>
                                    (payAmount =
                                        availablePayBalance.toFixed(4))}
                                class="text-[#18C6A5] hover:underline uppercase cursor-pointer"
                            >
                                Avail: {availablePayBalance.toFixed(4)}
                                {payTicker} [MAX]
                            </button>
                        {:else}
                            <span class="text-[#18C6A5] uppercase">
                                Sovereign Wire / ACH Pass
                            </span>
                        {/if}
                    </div>
                    <div class="flex items-center justify-between gap-3">
                        <input
                            type="number"
                            data-testid="swap-pay-input"
                            min="0"
                            step="any"
                            bind:value={payAmount}
                            placeholder="0.00"
                            class="w-full bg-transparent text-2xl font-black text-white outline-none tabular-nums"
                        />
                        <button
                            type="button"
                            data-testid="swap-pay-asset-btn"
                            onclick={() => {
                                showPaySelector = !showPaySelector;
                                showReceiveSelector = false;
                            }}
                            class="tactile-btn px-4 py-2 rounded-xl border-white/15 text-xs font-black uppercase text-white flex items-center gap-2 shrink-0 cursor-pointer"
                        >
                            <span>{payTicker}</span>
                            <span class="text-[9px] text-neutral-400">▾</span>
                        </button>
                    </div>
                    <div
                        class="flex items-center justify-between text-[9px] text-neutral-500"
                    >
                        <span>
                            ≈ ${swapQuote.grossUsd.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                            })} USD
                        </span>
                        <span>
                            {paySpotUsd > 0
                                ? `Spot: $${paySpotUsd < 0.01 ? paySpotUsd.toFixed(6) : paySpotUsd.toFixed(4)}`
                                : 'Oracle Offline (Halt)'}
                        </span>
                    </div>

                    {#if showPaySelector}
                        <div
                            class="absolute top-full right-0 mt-1.5 w-72 bg-[#0a0d12] border border-white/20 rounded-2xl shadow-2xl p-2.5 z-50 flex flex-col gap-1.5 max-h-64 overflow-y-auto"
                        >
                            <input
                                type="text"
                                bind:value={assetSearchQuery}
                                placeholder="Search KAS, USD, USDC, BTC, SILO..."
                                class="w-full bg-[#11161f] border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-white outline-none"
                            />
                            {#each filteredSelectableAssets as item (item.ticker)}
                                <button
                                    type="button"
                                    onclick={() => {
                                        payTicker = item.ticker;
                                        showPaySelector = false;
                                    }}
                                    class="w-full text-left px-3 py-2 rounded-lg hover:bg-[#161d29] flex items-center justify-between text-[10px] cursor-pointer"
                                >
                                    <span class="font-bold text-white"
                                        >{item.ticker} — {item.name}</span
                                    >
                                    <span class="text-[#18C6A5] font-bold">
                                        {item.spotPrice > 0
                                            ? `$${item.spotPrice < 0.01 ? item.spotPrice.toFixed(4) : item.spotPrice.toFixed(2)}`
                                            : 'OFFLINE'}
                                    </span>
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>

                <div class="flex items-center justify-center -my-2 z-10">
                    <button
                        type="button"
                        data-testid="swap-flip-assets-btn"
                        onclick={flipAssets}
                        class="tactile-btn w-9 h-9 rounded-xl bg-[#11161f] border border-white/15 text-[#18C6A5] hover:text-white flex items-center justify-center cursor-pointer"
                        title="Flip Pay & Receive Assets"
                    >
                        ⇅
                    </button>
                </div>

                <div
                    class="bg-[#11161f] border border-[#18C6A5]/35 rounded-2xl p-4 flex flex-col gap-2 relative"
                >
                    <div
                        class="flex items-center justify-between text-[9px] text-neutral-400"
                    >
                        <span class="uppercase font-bold text-[#18C6A5]"
                            >You Receive (Estimated)</span
                        >
                        <span>
                            Fee: ${swapQuote.feeUsd.toFixed(2)} ({effectiveProtocolFeePct.toFixed(
                                2
                            )}%)
                        </span>
                    </div>
                    <div class="flex items-center justify-between gap-3">
                        <span
                            data-testid="swap-receive-output"
                            class="text-2xl font-black text-[#18C6A5] tabular-nums truncate"
                        >
                            {swapQuote.estimatedOut.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits:
                                    swapQuote.estimatedOut < 1 ? 6 : 4
                            })}
                        </span>
                        <button
                            type="button"
                            data-testid="swap-receive-asset-btn"
                            onclick={() => {
                                showReceiveSelector = !showReceiveSelector;
                                showPaySelector = false;
                            }}
                            class="tactile-btn px-4 py-2 rounded-xl border-[#18C6A5]/45 text-xs font-black uppercase text-white flex items-center gap-2 shrink-0 cursor-pointer"
                        >
                            <span>{receiveTicker}</span>
                            <span class="text-[9px] text-neutral-400">▾</span>
                        </button>
                    </div>
                    <div
                        class="flex items-center justify-between text-[9px] text-neutral-500"
                    >
                        <span>
                            Net Value: ${swapQuote.netUsd.toFixed(2)} USD
                        </span>
                        <span>
                            {receiveSpotUsd > 0
                                ? `Spot: $${receiveSpotUsd < 0.01 ? receiveSpotUsd.toFixed(6) : receiveSpotUsd.toFixed(4)}`
                                : 'Oracle Offline (Halt)'}
                        </span>
                    </div>

                    {#if showReceiveSelector}
                        <div
                            class="absolute top-full right-0 mt-1.5 w-72 bg-[#0a0d12] border border-white/20 rounded-2xl shadow-2xl p-2.5 z-50 flex flex-col gap-1.5 max-h-64 overflow-y-auto"
                        >
                            <input
                                type="text"
                                bind:value={assetSearchQuery}
                                placeholder="Search KAS, USDC, BTC, SILO, NVDA..."
                                class="w-full bg-[#11161f] border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-white outline-none"
                            />
                            {#each filteredSelectableAssets as item (item.ticker)}
                                <button
                                    type="button"
                                    onclick={() => {
                                        receiveTicker = item.ticker;
                                        showReceiveSelector = false;
                                    }}
                                    class="w-full text-left px-3 py-2 rounded-lg hover:bg-[#161d29] flex items-center justify-between text-[10px] cursor-pointer"
                                >
                                    <span class="font-bold text-white"
                                        >{item.ticker} — {item.name}</span
                                    >
                                    <span class="text-[#18C6A5] font-bold">
                                        {item.spotPrice > 0
                                            ? `$${item.spotPrice < 0.01 ? item.spotPrice.toFixed(4) : item.spotPrice.toFixed(2)}`
                                            : 'OFFLINE'}
                                    </span>
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>

                {#if oracleHaltActive}
                    <div
                        data-testid="swap-oracle-halt-banner"
                        class="bg-red-950/30 border border-red-500/45 rounded-xl p-3 text-center text-[10px] font-bold text-red-400 uppercase"
                    >
                        CIRCUIT BREAKER TRIPPED: Live oracle spot feed for {paySpotUsd <=
                        0
                            ? payTicker
                            : receiveTicker} is offline; failing closed.
                    </div>
                {/if}

                <div class="relative">
                    {#if ui.microBadges['dex_swap_btn']}
                        <div
                            class="micro-confirm-badge absolute -top-4 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/60 text-[#18C6A5] text-[9px] font-mono font-black uppercase"
                        >
                            {ui.microBadges['dex_swap_btn'].label}
                        </div>
                    {/if}
                    <button
                        type="button"
                        data-testid="swap-execute-btn"
                        onclick={executeSorSwap}
                        disabled={isExecuting ||
                            oracleHaltActive ||
                            parseFloat(payAmount) <= 0}
                        class="tactile-btn w-full py-4 rounded-2xl text-white border-[#18C6A5]/50 text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                        style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.22), transparent 70%);"
                    >
                        {#if isExecuting}
                            Routing Order Through Sovereign SOR...
                        {:else if payTicker === 'USD'}
                            Reserve USD → {receiveTicker} Settlement Pass →
                        {:else if executionMode === 'BATCH_2200_UTC'}
                            Queue {payTicker} → {receiveTicker} in 22:00 UTC Zero-Slippage
                            Batch
                        {:else}
                            Execute Instant {payTicker} → {receiveTicker} Swap
                        {/if}
                    </button>
                </div>
            </div>

            <div class="lg:col-span-5 flex flex-col gap-4">
                <div
                    class="bg-[#0a0d12] border border-white/10 rounded-[24px] p-5 flex flex-col gap-3 shadow-xl"
                >
                    <span
                        class="text-[10px] font-black uppercase tracking-widest text-[#18C6A5]"
                    >
                        22:00 UTC Batch Netting Buckets (Live Pool Skew)
                    </span>
                    <div
                        class="flex flex-col gap-2 max-h-[360px] overflow-y-auto hide-scrollbar"
                    >
                        {#each operations.displayedBuckets as bucket (bucket.asset)}
                            <div
                                class="bg-[#11161f] border border-white/10 rounded-xl p-3 flex items-center justify-between text-[10px]"
                            >
                                <div class="flex flex-col">
                                    <span class="font-bold text-white"
                                        >KAS / {bucket.asset}</span
                                    >
                                    <span class="text-[8px] text-neutral-400">
                                        LP Coverage: {bucket.lpCoveragePct.toFixed(
                                            0
                                        )}% • Floor: {bucket.effectiveSpreadFloorPct.toFixed(
                                            2
                                        )}%
                                    </span>
                                </div>
                                <div class="flex flex-col items-end">
                                    <span class="text-[#18C6A5] font-bold">
                                        {bucket.pendingKas.toFixed(2)} KAS
                                    </span>
                                    <span class="text-[8px] text-neutral-500">
                                        ${bucket.pendingUsd.toFixed(2)} Pending
                                    </span>
                                </div>
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
        </div>
    {:else if activeDexMode === 'LP_VAULT'}
        <div
            class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
            in:fade={{ duration: 150 }}
        >
            <div
                class="lg:col-span-6 bg-[#0a0d12] border border-white/10 rounded-[24px] p-6 flex flex-col gap-4 shadow-2xl"
            >
                <span
                    class="text-xs font-black uppercase tracking-widest text-[#18C6A5]"
                >
                    SILO Fee-Shield Staking Vault (0.75% → 0.15% Protocol Fee)
                </span>
                <p class="text-[10px] text-neutral-400 leading-relaxed">
                    Stake {DEFAULT_ECOSYSTEM_TICKER} to unlock reduced protocol fees
                    across all 22:00 UTC Batch Netting and Instant SOR swaps. Unstaking
                    enforces a 7-day security cooldown.
                </p>
                <div class="flex items-center gap-2">
                    <input
                        type="number"
                        bind:value={siloStakeInput}
                        placeholder="1000"
                        class="flex-1 bg-[#11161f] border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-white outline-none"
                    />
                    <button
                        type="button"
                        onclick={stakeSiloTokens}
                        disabled={isMutatingLpOrSilo}
                        class="tactile-btn px-5 py-3 rounded-xl text-[10px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer"
                    >
                        {isMutatingLpOrSilo
                            ? 'Staking...'
                            : `Stake ${DEFAULT_ECOSYSTEM_TICKER}`}
                    </button>
                </div>
                {#if siloPositions.length > 0}
                    <div class="flex flex-col gap-2 pt-2">
                        {#each siloPositions as pos (pos.stakeId)}
                            <div
                                class="bg-[#11161f] border border-white/10 rounded-xl p-3 flex items-center justify-between text-[10px]"
                            >
                                <span class="font-bold text-white">
                                    {Number(pos.amountStaked).toLocaleString()}
                                    {pos.ticker}
                                </span>
                                <span
                                    class="px-2 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/40 text-[#18C6A5] text-[8px] font-bold uppercase"
                                >
                                    {pos.status}
                                </span>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

            <div
                class="lg:col-span-6 bg-[#0a0d12] border border-white/10 rounded-[24px] p-6 flex flex-col gap-4 shadow-2xl"
            >
                <span
                    class="text-xs font-black uppercase tracking-widest text-white"
                >
                    Multi-Asset Liquidity Pool Vault (Up to 2.5x 365D Multiplier)
                </span>
                <p class="text-[10px] text-neutral-400 leading-relaxed">
                    Note: Staking KAS/USDC liquidity exposes your principal to
                    impermanent loss if market prices diverge significantly.
                </p>
                <div class="grid grid-cols-2 gap-3">
                    <div class="flex flex-col gap-1">
                        <label
                            for="lpKasInput"
                            class="text-[8px] font-bold uppercase text-neutral-400"
                        >
                            KAS Principal
                        </label>
                        <input
                            id="lpKasInput"
                            type="number"
                            bind:value={lpKasAmountInput}
                            class="bg-[#11161f] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-bold text-white outline-none"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label
                            for="lpPairSelect"
                            class="text-[8px] font-bold uppercase text-neutral-400"
                        >
                            Paired Asset
                        </label>
                        <input
                            id="lpPairSelect"
                            type="text"
                            bind:value={lpPairTicker}
                            class="bg-[#11161f] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#18C6A5] uppercase outline-none"
                        />
                    </div>
                </div>
                <div class="grid grid-cols-4 gap-2">
                    {#each LOCK_OPTIONS as opt (opt.days)}
                        <button
                            type="button"
                            onclick={() => (lpLockDays = opt.days)}
                            class="py-2 rounded-xl border text-[9px] font-bold uppercase cursor-pointer {lpLockDays === opt.days ? 'bg-[#161d29] border-[#18C6A5] text-[#18C6A5]' : 'bg-[#11161f] border-white/10 text-neutral-400'}"
                        >
                            {opt.label} ({opt.multiplier}x)
                        </button>
                    {/each}
                </div>
                <button
                    type="button"
                    onclick={provideLiquidityPosition}
                    disabled={isMutatingLpOrSilo}
                    class="tactile-btn w-full py-3.5 rounded-xl text-[10px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer"
                >
                    {isMutatingLpOrSilo
                        ? 'Committing Liquidity...'
                        : `Commit KAS / ${lpPairTicker} Liquidity (${lpLockDays}D)`}
                </button>
            </div>
        </div>
    {:else if activeDexMode === 'P2P'}
        <div
            class="bg-[#0a0d12] border border-white/10 rounded-[24px] p-6 flex flex-col gap-4 shadow-2xl"
            in:fade={{ duration: 150 }}
        >
            <span
                class="text-xs font-black uppercase tracking-widest text-[#18C6A5]"
            >
                {formatRetailSafeCopy(
                    'SIGHASH_SINGLE|ANYONECANPAY Atomic P2P Orderbook'
                )}
            </span>
            <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                    type="text"
                    bind:value={p2pOfferTicker}
                    placeholder="Offer Ticker (KAS)"
                    class="bg-[#11161f] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-bold text-white uppercase outline-none"
                />
                <input
                    type="number"
                    bind:value={p2pOfferAmount}
                    placeholder="Offer Amount"
                    class="bg-[#11161f] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-bold text-white outline-none"
                />
                <input
                    type="text"
                    bind:value={p2pAskTicker}
                    placeholder="Ask Ticker (USDC)"
                    class="bg-[#11161f] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#18C6A5] uppercase outline-none"
                />
                <input
                    type="number"
                    bind:value={p2pAskAmount}
                    placeholder="Ask Amount"
                    class="bg-[#11161f] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#18C6A5] outline-none"
                />
            </div>
            <button
                type="button"
                onclick={createP2pOffer}
                disabled={isLoadingP2p}
                class="tactile-btn w-fit px-6 py-3 rounded-xl text-[10px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer"
            >
                {isLoadingP2p
                    ? 'Posting Atomic Order...'
                    : 'Post Non-Custodial P2P Order →'}
            </button>
            {#if p2pOrders.length > 0}
                <div class="flex flex-col gap-2 pt-2">
                    {#each p2pOrders as ord (ord.order_id || ord.orderId)}
                        <div
                            class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex items-center justify-between text-xs"
                        >
                            <span>
                                Offer: <strong class="text-white"
                                    >{ord.offer_amount ?? ord.offerAmount}
                                    {ord.offer_asset ?? ord.offerAsset}</strong
                                >
                                → Ask:
                                <strong class="text-[#18C6A5]"
                                    >{ord.ask_amount ?? ord.askAmount}
                                    {ord.ask_asset ?? ord.askAsset}</strong
                                >
                            </span>
                            <span
                                class="text-[9px] text-neutral-400 uppercase"
                            >
                                {ord.status || 'OPEN'}
                            </span>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}
</div>