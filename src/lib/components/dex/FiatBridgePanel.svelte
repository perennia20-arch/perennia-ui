<script lang="ts">
    import { fade, slide } from 'svelte/transition';
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import QRCode from 'qrcode';
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import {
        treasury,
        DEFAULT_ECOSYSTEM_TICKER
    } from '$lib/stores/treasury.svelte';
    import {
        evaluateAbaRoutingNumber,
        getPayoutStageIndex,
        downloadWireSlipPdf,
        downloadAchPayoutReceiptPdf,
        computeOnrampCostPlusQuote,
        computeOfframpCostPlusQuote,
        computePostTradeUsdSplit,
        resolveOfframpDepositAddressPreview,
        type SavedBankRailMeta
    } from './dexHelpers';

    let {
        isExecuting = false,
        onTriggerTileSweep = () => {},
        onSyncUserBalances = async () => {}
    }: {
        isExecuting: boolean;
        onTriggerTileSweep: () => void;
        onSyncUserBalances: () => Promise<void>;
    } = $props();

    let fiatMode = $state<'onramp' | 'offramp'>('onramp');
    let activeStep = $state<1 | 2 | 3>(1);
    let onrampFiatAmountUsd = $state('500');
    let onrampTargetTicker = $state('KAS');
    let onrampAutoStakeSilo = $state(false);
    let isTargetDropdownOpen = $state(false);
    let targetSearchQuery = $state('');

    // Off-Ramp Step 1 & 2 State
    let offrampTargetUsdInput = $state('500');
    let offrampAssetTicker = $state('KAS');
    let offrampSourceMode = $state<'onchain_kas' | 'ledger_kas' | 'ledger_usdc'>(
        'onchain_kas'
    );
    let otcCryptoAmountInput = $state('');
    let payoutMethod = $state<'ach' | 'wire'>('ach');
    let onrampPaymentRail = $state<'SOVEREIGN_WIRE_ACH' | 'CARD_INSTANT'>(
        'SOVEREIGN_WIRE_ACH'
    );
    let onrampSettlementTarget = $state<
        'LEDGER_KAS' | 'L1_KAS' | 'AUTO_STAKE_SILO'
    >('L1_KAS');

    let offrampBankLabel = $state('Primary Operating Account');
    let offrampAccountType = $state<'CHECKING' | 'SAVINGS'>('CHECKING');
    let offrampRoutingNumber = $state('');
    let offrampAccountNumber = $state('');
    let savedBankLast4 = $state<string | null>(null);
    let savedBankRailMeta = $state<SavedBankRailMeta | null>(null);
    let isEditingBankRail = $state(false);
    let isSavingBankRail = $state(false);
    let showOnrampBankLinker = $state(false);

    // Step 3: Reserved Settlement Pass & Live Pipeline State
    let isInitializingOnramp = $state(false);
    let onrampSessionData = $state<any | null>(null);
    let activeOfframpPass = $state<any | null>(null);
    let offrampDepositQrDataUrl = $state('');
    let onrampError = $state<string | null>(null);
    let offrampError = $state<string | null>(null);
    let offrampSuccessBanner = $state<string | null>(null);
    let circleDirectActive = $state<boolean>(false);
    let changenowActive = $state<boolean>(false);
    let masterTreasuryKasAddress = $state<string>('');

    let fiatHistoryEvents = $state<any[]>([]);
    let recentOfframpPayouts = $state<any[]>([]);
    let recentOnrampSessions = $state<any[]>([]);
    let onrampPollInterval: ReturnType<typeof setInterval>;

    let abaTelemetry = $derived(evaluateAbaRoutingNumber(offrampRoutingNumber));

    $effect(() => {
        if (
            abaTelemetry.isComplete &&
            abaTelemetry.checksumValid &&
            abaTelemetry.institutionName &&
            (offrampBankLabel === 'Primary Operating Account' ||
                !offrampBankLabel.trim())
        ) {
            offrampBankLabel = abaTelemetry.institutionName;
        }
    });

    function resolveSpotForTicker(ticker: string): number {
        const clean = ticker.trim().toUpperCase();
        if (clean === 'USD' || clean === 'USDC' || clean === 'USDT') return 1.0;
        const assetObj = treasury.getAsset(clean);
        if (assetObj.spotPrice > 0) return assetObj.spotPrice;
        const kasSpot = treasury.getAsset('KAS').spotPrice || 0;
        if (clean === DEFAULT_ECOSYSTEM_TICKER && kasSpot > 0) {
            return Number((kasSpot / 23.809524).toFixed(6));
        }
        return 0;
    }

    let onrampTargetSpotUsd = $derived(resolveSpotForTicker(onrampTargetTicker));
    let offrampTargetSpotUsd = $derived(resolveSpotForTicker(offrampAssetTicker));

    let onrampCostPlusQuote = $derived(
        computeOnrampCostPlusQuote({
            assetTicker: onrampTargetTicker,
            grossUsd: Math.max(0, parseFloat(onrampFiatAmountUsd) || 0),
            spotPriceUsd: onrampTargetSpotUsd,
            autoStakeSilo:
                onrampAutoStakeSilo ||
                onrampSettlementTarget === 'AUTO_STAKE_SILO',
            bundledKasOrSilo:
                onrampAutoStakeSilo ||
                onrampSettlementTarget === 'AUTO_STAKE_SILO'
        })
    );

    let onrampPostTradeSplit = $derived(
        computePostTradeUsdSplit(onrampCostPlusQuote.grossUsd)
    );

    let offrampCostPlusQuote = $derived(
        computeOfframpCostPlusQuote({
            assetTicker: offrampAssetTicker,
            grossUsd: Math.max(0, parseFloat(offrampTargetUsdInput) || 0),
            spotPriceUsd: offrampTargetSpotUsd,
            payoutMethod
        })
    );

    let offrampDepositPreview = $derived(
        resolveOfframpDepositAddressPreview(
            offrampAssetTicker,
            masterTreasuryKasAddress
        )
    );

    $effect(() => {
        const gross = parseFloat(offrampTargetUsdInput) || 0;
        if (gross >= 2500 && payoutMethod !== 'wire') {
            payoutMethod = 'wire';
        }
        if (gross > 0 && offrampTargetSpotUsd > 0) {
            otcCryptoAmountInput = (gross / offrampTargetSpotUsd).toFixed(
                offrampAssetTicker === 'BTC' ? 6 : 4
            );
        }
    });

    $effect(() => {
        const addr =
            activeOfframpPass?.depositAddress || offrampDepositPreview.address;
        if (browser && addr) {
            QRCode.toDataURL(addr, {
                margin: 1,
                width: 180,
                color: { dark: '#000000', light: '#ffffff' }
            })
                .then((url) => {
                    offrampDepositQrDataUrl = url;
                })
                .catch(() => {});
        } else {
            offrampDepositQrDataUrl = '';
        }
    });

    let filteredOnrampAssets = $derived(
        treasury.registry.filter((a) => {
            if (a.ticker === 'USD') return false;
            const q = targetSearchQuery.trim().toLowerCase();
            if (!q) return true;
            return (
                a.ticker.toLowerCase().includes(q) ||
                a.name.toLowerCase().includes(q) ||
                a.assetClass.toLowerCase().includes(q)
            );
        })
    );

    let offrampAvailableSourceBalance = $derived.by(() => {
        const asset = treasury.getAsset(offrampAssetTicker);
        if (offrampSourceMode === 'ledger_usdc') {
            return treasury.getAsset('USDC').synthetic || 0;
        }
        if (offrampSourceMode === 'ledger_kas') {
            return asset.synthetic || 0;
        }
        return asset.availableBalance || 0;
    });

    export async function checkFiatGatewayStatus() {
        try {
            const [offRes, onRes] = await Promise.all([
                fetch('/api/fiat/offramp'),
                fetch('/api/fiat/onramp')
            ]);
            if (offRes.ok) {
                const status = await offRes.json();
                circleDirectActive = Boolean(status.circleConfigured);
                changenowActive = Boolean(status.changenowConfigured);
                if (status.masterTreasuryKasAddress) {
                    masterTreasuryKasAddress = String(
                        status.masterTreasuryKasAddress
                    );
                }
                if (typeof status.spotPrice === 'number' && status.spotPrice > 0) {
                    treasury.updateAsset('KAS', { spotPrice: status.spotPrice });
                }
                if (status.savedBankRailLast4) {
                    savedBankLast4 = status.savedBankRailLast4;
                }
                if (status.savedBankRail) {
                    savedBankRailMeta = status.savedBankRail;
                    offrampBankLabel =
                        status.savedBankRail.bankLabel ||
                        'Primary Operating Account';
                    offrampAccountType =
                        status.savedBankRail.accountType === 'SAVINGS'
                            ? 'SAVINGS'
                            : 'CHECKING';
                }
                if (Array.isArray(status.recentPayouts)) {
                    recentOfframpPayouts = status.recentPayouts;
                }
            }
            if (onRes.ok) {
                const onData = await onRes.json();
                if (typeof onData.spotPrice === 'number' && onData.spotPrice > 0) {
                    treasury.updateAsset('KAS', { spotPrice: onData.spotPrice });
                }
                if (Array.isArray(onData.fiatLedgerEvents)) {
                    fiatHistoryEvents = onData.fiatLedgerEvents;
                }
                if (Array.isArray(onData.recentOnrampSessions)) {
                    recentOnrampSessions = onData.recentOnrampSessions;
                }
            }
        } catch {
            // Ignore transient gateway status check error
        }
    }

    async function saveBankRailVault() {
        offrampError = null;
        offrampSuccessBanner = null;
        onrampError = null;
        const cleanRouting = offrampRoutingNumber.replace(/\D/g, '').trim();
        const cleanAccount = offrampAccountNumber.replace(/\D/g, '').trim();
        if (cleanRouting.length !== 9 || cleanAccount.length < 4) {
            const msg =
                'Please enter a valid 9-digit ABA Routing Number and Bank Account Number (minimum 4 digits).';
            offrampError = msg;
            onrampError = msg;
            return;
        }
        if (!abaTelemetry.checksumValid) {
            const msg =
                'ABA_CHECKSUM_INVALID: The 9-digit routing number failed the Federal Reserve mod-10 checksum test.';
            offrampError = msg;
            onrampError = msg;
            return;
        }
        isSavingBankRail = true;
        try {
            const resolvedLabel =
                offrampBankLabel.trim() ||
                abaTelemetry.institutionName ||
                'Primary Operating Account';
            const res = await fetch('/api/fiat/offramp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'SAVE_BANK_RAIL',
                    wallet: identity.activeAddress,
                    bankLabel: resolvedLabel,
                    accountType: offrampAccountType,
                    payoutMethod,
                    routingNumber: cleanRouting,
                    accountNumber: cleanAccount
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                offrampError =
                    data.error || 'Failed to save encrypted bank rail.';
                onrampError = offrampError;
                return;
            }
            savedBankLast4 = data.savedBankRailLast4 || cleanAccount.slice(-4);
            if (data.savedBankRail) {
                savedBankRailMeta = data.savedBankRail;
            }
            offrampRoutingNumber = '';
            offrampAccountNumber = '';
            isEditingBankRail = false;
            showOnrampBankLinker = false;
            offrampSuccessBanner = `AES-256-GCM Bank Rail Vault Updated (${resolvedLabel} • *${savedBankLast4} • ${offrampAccountType})`;
            ui.triggerMicroBadge(
                'dex_fiat_btn',
                `BANK *${savedBankLast4} SAVED ✓`,
                '#18C6A5'
            );
        } catch (err: any) {
            offrampError = err.message || 'Failed to save encrypted bank rail.';
            onrampError = offrampError;
        } finally {
            isSavingBankRail = false;
        }
    }

    function handleCryptoOfframpInput(e: Event) {
        const val = (e.currentTarget as HTMLInputElement).value;
        otcCryptoAmountInput = val;
        const parsed = parseFloat(val);
        if (!isNaN(parsed) && parsed > 0 && offrampTargetSpotUsd > 0) {
            offrampTargetUsdInput = (parsed * offrampTargetSpotUsd).toFixed(2);
        }
    }

    async function initiateFiatOnramp() {
        if (!identity.activeAddress) {
            ui.showWalletModal = true;
            return;
        }
        isInitializingOnramp = true;
        onrampError = null;
        onrampSessionData = null;
        const targetTicker = onrampTargetTicker.trim().toUpperCase();
        const isAutoStake =
            targetTicker === DEFAULT_ECOSYSTEM_TICKER &&
            (onrampAutoStakeSilo ||
                onrampSettlementTarget === 'AUTO_STAKE_SILO');
        try {
            const res = await fetch('/api/fiat/onramp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    walletAddress: identity.activeAddress,
                    fiatAmountUsd: parseFloat(onrampFiatAmountUsd) || 500,
                    targetAsset: targetTicker,
                    paymentRail: onrampPaymentRail,
                    settlementTarget: isAutoStake
                        ? 'AUTO_STAKE_SILO'
                        : onrampSettlementTarget,
                    autoStakeSilo: isAutoStake,
                    bundledKasOrSilo: isAutoStake
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(
                    data.error || 'Failed to initialize Fiat On-Ramp session.'
                );
            }
            onrampSessionData = {
                ...data,
                sessionId: data.sessionId || data.orderId,
                orderId: data.orderId || data.sessionId,
                estimatedKas: data.estimatedKas,
                estimatedTokens: data.estimatedTokens ?? data.estimatedKas,
                targetAsset: data.targetAsset || targetTicker,
                targetSpotPrice: data.targetSpotPrice ?? data.spotPrice,
                autoStakeSilo: Boolean(data.autoStakeSilo),
                spotPrice: data.spotPrice,
                feeUsd: Number(data.feeUsd ?? onrampCostPlusQuote.feeUsd),
                hardCostUsd: Number(
                    data.hardCostUsd ?? onrampCostPlusQuote.hardCostUsd
                ),
                guaranteedProfitUsd: Number(
                    data.guaranteedProfitUsd ??
                        onrampCostPlusQuote.guaranteedProfitUsd
                ),
                competitorFeeUsd: Number(
                    data.competitorFeeUsd ??
                        onrampCostPlusQuote.competitorFeeUsd
                ),
                guestSavingsUsd: Number(
                    data.guestSavingsUsd ?? onrampCostPlusQuote.guestSavingsUsd
                ),
                netUsdConverted: Number(
                    data.netUsdConverted ?? onrampCostPlusQuote.guestNetUsd
                ),
                paymentRail: data.paymentRail,
                settlementTarget: data.settlementTarget,
                routingTopology:
                    data.routingTopology || onrampCostPlusQuote.routingTopology,
                wireMemo: data.wireMemo || data.sessionId,
                wireInstructions: data.wireInstructions,
                status: data.status || 'AWAITING_WIRE_RECEIPT',
                txHash: data.txHash
            };
            activeStep = 3;
            onTriggerTileSweep();
            ui.triggerMicroBadge(
                'dex_fiat_btn',
                `PASS ${onrampSessionData.wireMemo} RESERVED ✓`,
                '#18C6A5'
            );
            checkFiatGatewayStatus();
        } catch (e: any) {
            onrampError = e.message || 'Fiat On-Ramp initialization failed.';
        } finally {
            isInitializingOnramp = false;
        }
    }

    async function generateOfframpSettlementPass() {
        if (!identity.activeAddress) {
            ui.showWalletModal = true;
            return;
        }
        offrampError = null;
        offrampSuccessBanner = null;
        const grossUsd = parseFloat(offrampTargetUsdInput) || 0;
        const parsedCrypto =
            parseFloat(otcCryptoAmountInput) ||
            (offrampTargetSpotUsd > 0 ? grossUsd / offrampTargetSpotUsd : 0);
        if (grossUsd <= 0 || parsedCrypto <= 0) {
            offrampError =
                'Enter a valid sale amount to generate a Settlement Pass.';
            return;
        }
        if (
            !savedBankLast4 &&
            (!abaTelemetry.checksumValid ||
                offrampAccountNumber.replace(/\D/g, '').length < 4)
        ) {
            offrampError =
                'Link or enter a valid 9-digit ABA Routing Number and Bank Account Number before generating an Off-Ramp Settlement Pass.';
            return;
        }
        try {
            const payload: Record<string, any> = {
                wallet: identity.activeAddress,
                amountKas: parsedCrypto,
                kasAmount: parsedCrypto,
                amountAsset: parsedCrypto,
                grossUsd,
                sourceMode: 'direct_wholesale_deposit',
                sourceAsset: offrampAssetTicker,
                payoutMethod,
                bankLabel:
                    offrampBankLabel.trim() || 'Primary Operating Account',
                accountType: offrampAccountType
            };
            if (
                offrampRoutingNumber.trim() &&
                offrampAccountNumber.trim()
            ) {
                payload.routingNumber = offrampRoutingNumber.trim();
                payload.accountNumber = offrampAccountNumber.trim();
            }

            const res = await fetch('/api/fiat/offramp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                offrampError =
                    data.error || 'Fiat Off-Ramp Settlement Pass rejected.';
                return;
            }
            activeOfframpPass = {
                ...data,
                payoutId: data.payoutId || data.wireReferenceId,
                sourceAsset: data.sourceAsset || offrampAssetTicker,
                amountCrypto: data.amountCrypto ?? parsedCrypto,
                grossUsd: data.grossUsd ?? offrampCostPlusQuote.grossUsd,
                feeUsd: data.feeUsd ?? offrampCostPlusQuote.feeUsd,
                hardCostUsd:
                    data.hardCostUsd ?? offrampCostPlusQuote.hardCostUsd,
                guaranteedProfitUsd:
                    data.guaranteedProfitUsd ??
                    offrampCostPlusQuote.guaranteedProfitUsd,
                guestSavingsUsd:
                    data.guestSavingsUsd ??
                    offrampCostPlusQuote.guestSavingsUsd,
                netFiatUsd:
                    data.netFiatPayout ??
                    data.netFiatUsd ??
                    offrampCostPlusQuote.guestNetUsd,
                depositAddress:
                    data.depositAddress || offrampDepositPreview.address,
                depositRouteType:
                    data.depositRouteType || offrampDepositPreview.routeLabel,
                confirmationsRequired:
                    data.confirmationsRequired ||
                    offrampDepositPreview.confirmationsRequired,
                confirmationsCurrent: data.confirmationsCurrent ?? 0,
                status: data.status || 'AWAITING_ONCHAIN_CONFIRMATIONS'
            };
            activeStep = 3;
            offrampSuccessBanner = `Off-Ramp Settlement Pass Reserved (${activeOfframpPass.payoutId} • Net Bank Payout: $${Number(activeOfframpPass.netFiatUsd).toFixed(2)} USD)`;
            ui.triggerMicroBadge(
                'dex_fiat_btn',
                `OFF-RAMP PASS ${activeOfframpPass.payoutId} ARMED ✓`,
                '#18C6A5'
            );
            checkFiatGatewayStatus();
        } catch (err: any) {
            offrampError =
                err.message || 'Unable to generate Off-Ramp Settlement Pass.';
        }
    }

    async function pollActiveOnrampSession() {
        if (!onrampSessionData?.sessionId) return;
        try {
            const res = await fetch(
                `/api/fiat/onramp?sessionId=${encodeURIComponent(onrampSessionData.sessionId)}`
            );
            if (res.ok) {
                const data = await res.json();
                if (data.session) {
                    onrampSessionData = {
                        ...onrampSessionData,
                        status: data.session.status || onrampSessionData.status,
                        txHash: data.session.txHash || onrampSessionData.txHash
                    };
                    if (data.session.status === 'COMPLETED') {
                        onSyncUserBalances();
                        checkFiatGatewayStatus();
                    }
                }
            }
        } catch {
            // Ignore poll error
        }
    }

    function handleLiveFiatSseEvent(e: Event) {
        const customEvt = e as CustomEvent;
        const payload = customEvt.detail;
        if (!payload) return;
        const myClean = (identity.activeAddress || '')
            .toLowerCase()
            .replace(/^kaspa:/i, '')
            .trim();
        const evtClean = String(payload.wallet || '')
            .toLowerCase()
            .replace(/^kaspa:/i, '')
            .trim();
        if (myClean && evtClean === myClean) {
            if (payload.eventType === 'FIAT_ONRAMP') {
                if (
                    onrampSessionData &&
                    payload.sessionId === onrampSessionData.sessionId
                ) {
                    onrampSessionData = {
                        ...onrampSessionData,
                        status: payload.status || 'COMPLETED',
                        txHash: payload.txHash || onrampSessionData.txHash
                    };
                }
            } else if (payload.eventType === 'FIAT_DISPATCHED') {
                offrampSuccessBanner = `Bank Transfer Dispatched (${payload.payoutId} • Trace: ${payload.traceId || 'CONFIRMED'})`;
                if (
                    activeOfframpPass &&
                    activeOfframpPass.payoutId === payload.payoutId
                ) {
                    activeOfframpPass = {
                        ...activeOfframpPass,
                        status: 'DISPATCHED_BY_DIRECTOR',
                        traceId: payload.traceId
                    };
                }
            }
            onSyncUserBalances();
            checkFiatGatewayStatus();
        }
    }

    onMount(() => {
        checkFiatGatewayStatus();
        if (browser) {
            window.addEventListener(
                'perennia:fiat_event',
                handleLiveFiatSseEvent
            );
        }
        onrampPollInterval = setInterval(() => {
            if (
                onrampSessionData?.sessionId &&
                onrampSessionData.status !== 'COMPLETED'
            ) {
                pollActiveOnrampSession();
            }
        }, 6000);
    });

    onDestroy(() => {
        if (browser) {
            window.removeEventListener(
                'perennia:fiat_event',
                handleLiveFiatSseEvent
            );
        }
        if (onrampPollInterval) clearInterval(onrampPollInterval);
    });
</script>

<div
    data-testid="fiat-bridge-panel"
    class="w-full bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 md:p-8 shadow-2xl flex flex-col gap-5"
    style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.12), transparent 65%);"
    in:fade={{ duration: 150 }}
>
    <div class="flex flex-col gap-4 border-b border-white/10 pb-4">
        <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex flex-col">
                <h3
                    class="text-white font-black text-xs md:text-sm uppercase tracking-widest"
                >
                    Two-Way Zero-Loss Fiat Rails &amp; Direct API Drop-Ship
                </h3>
                <span
                    class="text-[9px] font-mono text-neutral-400 uppercase tracking-widest mt-0.5"
                >
                    Single-Hop Exchange-to-Wallet On-Ramp • ChangeNOW v2
                    Non-Custodial Off-Ramp • Zero Batch Waiting
                </span>
            </div>
            <span
                class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/35 text-[#18C6A5] text-[8px] font-mono font-bold uppercase whitespace-nowrap"
            >
                {circleDirectActive
                    ? 'CIRCLE RAIL ACTIVE'
                    : savedBankLast4
                      ? `BANK *${savedBankLast4} LINKED`
                      : changenowActive
                        ? 'CHANGENOW V2 LIVE'
                        : 'SOVEREIGN WIRE / ACH'}
            </span>
        </div>
        <div
            class="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-[#11161f] p-1.5 rounded-2xl border border-white/10"
        >
            <button
                type="button"
                data-testid="fiat-onramp-tab-btn"
                onclick={() => {
                    fiatMode = 'onramp';
                    offrampError = null;
                }}
                class="tactile-btn py-2.5 px-4 text-[10px] font-black uppercase tracking-widest rounded-xl cursor-pointer whitespace-nowrap {fiatMode === 'onramp' ? 'text-[#18C6A5] border-[#18C6A5]/45' : 'text-neutral-400 border-transparent'}"
            >
                Buy with USD (On-Ramp)
            </button>
            <button
                type="button"
                data-testid="fiat-offramp-tab-btn"
                onclick={() => {
                    fiatMode = 'offramp';
                    onrampError = null;
                    offrampError = null;
                }}
                class="tactile-btn py-2.5 px-4 text-[10px] font-black uppercase tracking-widest rounded-xl cursor-pointer whitespace-nowrap {fiatMode === 'offramp' ? 'text-[#18C6A5] border-[#18C6A5]/45' : 'text-neutral-400 border-transparent'}"
            >
                Sell for USD (Off-Ramp)
            </button>
        </div>
        <div class="grid grid-cols-3 gap-2">
            {#each [
                { step: 1, title: 'Step 1 • Instant Payout Calculator' },
                {
                    step: 2,
                    title:
                        fiatMode === 'onramp'
                            ? 'Step 2 • Destination Upgrade'
                            : 'Step 2 • Bank Payout Upgrade'
                },
                { step: 3, title: 'Step 3 • Reserved Settlement Pass' }
            ] as s (s.step)}
                <button
                    type="button"
                    data-testid="fiat-step-{s.step}-btn"
                    onclick={() => (activeStep = s.step as 1 | 2 | 3)}
                    class="py-2 px-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 {activeStep === s.step ? 'bg-[#161d29] border-[#18C6A5]/50 text-[#18C6A5]' : activeStep > s.step ? 'bg-[#11161f] border-[#18C6A5]/25 text-white' : 'bg-[#11161f]/60 border-white/10 text-neutral-400 hover:text-white'}"
                >
                    <span class="text-[9px] font-mono font-black uppercase truncate">
                        {s.title}
                    </span>
                    <span class="text-[9px] font-mono font-bold shrink-0">
                        {activeStep > s.step ? '✓' : `0${s.step}`}
                    </span>
                </button>
            {/each}
        </div>
    </div>

    {#if fiatMode === 'onramp'}
        <div class="flex flex-col gap-4">
            <div
                class="bg-[#11161f] border {onrampTargetTicker === DEFAULT_ECOSYSTEM_TICKER && onrampAutoStakeSilo ? 'border-[#18C6A5]' : 'border-[#18C6A5]/35'} rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
                <div class="flex flex-col gap-0.5">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span
                            class="px-2 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/45 text-[#18C6A5] text-[8px] font-mono font-black uppercase whitespace-nowrap"
                        >
                            0% USDC BUNDLE FEE WAIVER
                        </span>
                        <span
                            class="text-xs font-black uppercase tracking-wider text-white"
                        >
                            1-Click Auto-Stake {DEFAULT_ECOSYSTEM_TICKER} into Fee-Discount
                            Vault (0.75%–0.25% Fee)
                        </span>
                    </div>
                    <span class="text-[9px] text-neutral-400">
                        Waives standalone USDC conversion fees (0%) when bundled
                        into a 1-click KAS swap or SILO auto-stake.
                    </span>
                </div>
                <button
                    type="button"
                    data-testid="fiat-1click-silo-toggle-btn"
                    onclick={() => {
                        onrampTargetTicker = DEFAULT_ECOSYSTEM_TICKER;
                        onrampAutoStakeSilo = !onrampAutoStakeSilo;
                        onrampSettlementTarget = onrampAutoStakeSilo
                            ? 'AUTO_STAKE_SILO'
                            : 'L1_KAS';
                    }}
                    class="tactile-btn px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider whitespace-nowrap cursor-pointer shrink-0 {onrampTargetTicker === DEFAULT_ECOSYSTEM_TICKER && onrampAutoStakeSilo ? 'text-[#18C6A5] border-[#18C6A5]' : 'text-neutral-300 border-white/15'}"
                >
                    {onrampTargetTicker === DEFAULT_ECOSYSTEM_TICKER &&
                    onrampAutoStakeSilo
                        ? '✓ Buy & Auto-Stake SILO Armed'
                        : '[1-Click Buy & Auto-Stake SILO]'}
                </button>
            </div>

            <div
                data-testid="fiat-step1-calculator-card"
                class="bg-[#11161f] border {activeStep === 1 ? 'border-[#18C6A5]/50' : 'border-white/10'} rounded-2xl p-5 flex flex-col gap-4"
            >
                <div class="flex items-center justify-between flex-wrap gap-2">
                    <span
                        class="text-[10px] font-black text-[#18C6A5] uppercase tracking-widest"
                    >
                        Step 1 • Instant Payout Calculator (Zero-Loss Cost-Plus)
                    </span>
                    <div class="flex items-center gap-1.5 flex-wrap">
                        {#each [
                            { label: '$100', val: '100' },
                            { label: '$250', val: '250' },
                            { label: '$500', val: '500' },
                            { label: '$1,000', val: '1000' },
                            { label: '$2,500+', val: '2500' }
                        ] as preset (preset.val)}
                            <button
                                type="button"
                                data-testid="fiat-preset-{preset.val}"
                                onclick={() =>
                                    (onrampFiatAmountUsd = preset.val)}
                                class="tactile-btn px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold uppercase whitespace-nowrap cursor-pointer {onrampFiatAmountUsd === preset.val ? 'text-[#18C6A5] border-[#18C6A5]/45' : 'text-neutral-400 hover:text-white'}"
                            >
                                {preset.label}
                            </button>
                        {/each}
                    </div>
                </div>
                <div class="flex flex-wrap items-center gap-1.5">
                    <span
                        class="text-[8px] font-mono uppercase text-neutral-500 mr-1"
                    >
                        Select Asset:
                    </span>
                    {#each ['KAS', 'BTC', 'ETH', 'SOL', 'USDC', 'SILO'] as quickAsset}
                        <button
                            type="button"
                            data-testid="fiat-asset-pill-{quickAsset}"
                            onclick={() => {
                                onrampTargetTicker = quickAsset;
                                if (quickAsset !== DEFAULT_ECOSYSTEM_TICKER) {
                                    onrampAutoStakeSilo = false;
                                    if (
                                        onrampSettlementTarget ===
                                        'AUTO_STAKE_SILO'
                                    ) {
                                        onrampSettlementTarget = 'L1_KAS';
                                    }
                                }
                            }}
                            class="px-3 py-1 rounded-lg text-[9px] font-mono font-bold uppercase border cursor-pointer transition-colors whitespace-nowrap {onrampTargetTicker === quickAsset ? 'bg-[#161d29] text-[#18C6A5] border-[#18C6A5]/45' : 'bg-[#0a0d12] text-neutral-400 border-white/10 hover:text-white'}"
                        >
                            {quickAsset}
                        </button>
                    {/each}
                </div>
                <div
                    class="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch"
                >
                    <div
                        class="md:col-span-6 flex flex-col justify-between gap-1.5 bg-[#0a0d12] p-4 rounded-xl border border-white/10"
                    >
                        <label
                            for="onrampUsdInput"
                            class="text-[9px] uppercase tracking-widest text-neutral-400 font-bold"
                        >
                            You Pay (USD Bank ACH / Whale Wire)
                        </label>
                        <div class="flex items-center justify-between gap-2">
                            <span
                                class="text-neutral-500 font-mono text-xl font-bold"
                                >$</span
                            >
                            <input
                                id="onrampUsdInput"
                                data-testid="fiat-onramp-usd-input"
                                type="number"
                                min="10"
                                bind:value={onrampFiatAmountUsd}
                                class="w-full bg-transparent text-2xl font-black font-mono text-white outline-none tabular-nums"
                            />
                            <span
                                class="text-[10px] font-mono font-bold text-neutral-400 px-2.5 py-1 rounded-lg bg-[#11161f] border border-white/10 shrink-0"
                            >
                                USD
                            </span>
                        </div>
                        <span class="text-[8px] font-mono text-neutral-400">
                            {onrampCostPlusQuote.railLabel} • Net Converted:
                            <strong class="text-white"
                                >${onrampCostPlusQuote.guestNetUsd.toFixed(
                                    2
                                )} USD</strong
                            >
                            (Fee: ${onrampCostPlusQuote.feeUsd.toFixed(2)})
                        </span>
                    </div>
                    <div
                        class="md:col-span-6 flex flex-col justify-between gap-1.5 bg-[#0a0d12] p-4 rounded-xl border border-[#18C6A5]/35 relative"
                    >
                        <div class="flex items-center justify-between gap-2">
                            <span
                                class="text-[9px] uppercase tracking-widest text-[#18C6A5] font-bold"
                            >
                                You Receive (Live Payout Readout)
                            </span>
                            <span
                                class="text-[9px] font-mono text-neutral-400 whitespace-nowrap"
                            >
                                {#if onrampCostPlusQuote.spotPriceUsd > 0}
                                    Spot: ${onrampCostPlusQuote.spotPriceUsd <
                                    0.01
                                        ? onrampCostPlusQuote.spotPriceUsd.toFixed(
                                              6
                                          )
                                        : onrampCostPlusQuote.spotPriceUsd.toFixed(
                                              4
                                          )}
                                {:else}
                                    Oracle Syncing...
                                {/if}
                            </span>
                        </div>
                        <div class="flex items-center justify-between gap-2">
                            <span
                                data-testid="fiat-onramp-est-output"
                                class="text-2xl font-mono font-black text-[#18C6A5] tabular-nums truncate"
                            >
                                ≈ {onrampCostPlusQuote.estimatedTokens.toLocaleString(
                                    undefined,
                                    {
                                        maximumFractionDigits:
                                            onrampCostPlusQuote.estimatedTokens <
                                            1
                                                ? 6
                                                : 2
                                    }
                                )}
                            </span>
                            <button
                                type="button"
                                data-testid="fiat-target-token-selector"
                                onclick={() =>
                                    (isTargetDropdownOpen =
                                        !isTargetDropdownOpen)}
                                class="tactile-btn px-3.5 py-2 rounded-xl border-[#18C6A5]/45 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shrink-0 cursor-pointer whitespace-nowrap"
                            >
                                <span>{onrampTargetTicker}</span>
                                <span class="text-[9px] text-neutral-400"
                                    >▾</span
                                >
                            </button>
                        </div>
                        <span class="text-[8px] font-mono text-neutral-400">
                            Route: {onrampCostPlusQuote.routingTopology}
                        </span>
                        {#if isTargetDropdownOpen}
                            <div
                                class="absolute top-full right-0 mt-1.5 w-72 bg-[#0a0d12] border border-white/20 rounded-2xl shadow-2xl p-2.5 z-50 flex flex-col gap-1.5 max-h-64 overflow-y-auto"
                            >
                                <input
                                    type="text"
                                    bind:value={targetSearchQuery}
                                    placeholder="Search KAS, SILO, BTC, NVDA, XAU..."
                                    class="w-full bg-[#11161f] border border-white/10 rounded-lg px-3 py-1.5 text-[10px] font-mono text-white outline-none"
                                />
                                {#each filteredOnrampAssets as assetItem (assetItem.ticker)}
                                    <button
                                        type="button"
                                        onclick={() => {
                                            onrampTargetTicker =
                                                assetItem.ticker;
                                            if (
                                                assetItem.ticker !==
                                                DEFAULT_ECOSYSTEM_TICKER
                                            ) {
                                                onrampAutoStakeSilo = false;
                                                if (
                                                    onrampSettlementTarget ===
                                                    'AUTO_STAKE_SILO'
                                                ) {
                                                    onrampSettlementTarget =
                                                        'L1_KAS';
                                                }
                                            }
                                            isTargetDropdownOpen = false;
                                        }}
                                        class="w-full text-left px-3 py-2 rounded-lg hover:bg-[#161d29] flex items-center justify-between text-[10px] font-mono cursor-pointer"
                                    >
                                        <span class="font-bold text-white"
                                            >{assetItem.ticker} — {assetItem.name}</span
                                        >
                                        <span class="text-[#18C6A5] font-bold">
                                            ${assetItem.spotPrice > 0
                                                ? assetItem.spotPrice < 0.01
                                                    ? assetItem.spotPrice.toFixed(
                                                          4
                                                      )
                                                    : assetItem.spotPrice.toFixed(
                                                          2
                                                      )
                                                : 'LIVE'}
                                        </span>
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
                <div
                    data-testid="fiat-competitor-savings-badge"
                    class="bg-[#0a0d12] border border-[#18C6A5]/45 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                    <div class="flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full bg-[#18C6A5]"></span>
                        <span class="text-xs font-mono font-black text-[#18C6A5]">
                            You keep +${onrampCostPlusQuote.guestSavingsUsd.toFixed(
                                2
                            )} more than Uphold &amp; Retail Exchange Apps.
                        </span>
                    </div>
                    <span class="text-[9px] font-mono text-neutral-400">
                        Perennia Net: <strong class="text-white"
                            >${onrampCostPlusQuote.guestNetUsd.toFixed(
                                2
                            )}</strong
                        >
                        vs. Uphold Net: ${onrampCostPlusQuote.competitorNetUsd.toFixed(
                            2
                        )}
                        (Hard Cost: ${onrampCostPlusQuote.hardCostUsd.toFixed(
                            2
                        )} + Net Profit: ${onrampCostPlusQuote.guaranteedProfitUsd.toFixed(
                            2
                        )})
                    </span>
                </div>
                <div class="flex justify-end">
                    <button
                        type="button"
                        data-testid="fiat-lock-quote-cta"
                        onclick={() => (activeStep = 2)}
                        disabled={onrampCostPlusQuote.circuitBreakerTripped}
                        class="tactile-btn px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/50 cursor-pointer disabled:opacity-40"
                        style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.2), transparent 70%);"
                    >
                        Lock In My Quote →
                    </button>
                </div>
            </div>

            <div
                data-testid="fiat-step2-destination-card"
                class="bg-[#11161f] border {activeStep === 2 ? 'border-[#18C6A5]/50' : 'border-white/10'} rounded-2xl p-5 flex flex-col gap-4"
            >
                <div class="flex items-center justify-between flex-wrap gap-2">
                    <span
                        class="text-[10px] font-black text-white uppercase tracking-widest"
                    >
                        Step 2 • Destination / Payout Upgrade
                    </span>
                    <button
                        type="button"
                        onclick={() =>
                            (showOnrampBankLinker = !showOnrampBankLinker)}
                        class="text-[9px] font-mono font-bold {savedBankLast4 ? 'text-[#18C6A5]' : 'text-amber-400'} hover:underline uppercase cursor-pointer"
                    >
                        {showOnrampBankLinker
                            ? '[Close Bank Vault Editor ✕]'
                            : savedBankLast4
                              ? `✓ Linked Bank *${savedBankLast4} (${savedBankRailMeta?.accountType || 'CHECKING'}) [Edit]`
                              : '[+ Link Bank Account (AES-256-GCM Mod-10 ABA)]'}
                    </button>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button
                        type="button"
                        data-testid="onramp-dest-self-custody-card"
                        onclick={() => {
                            onrampSettlementTarget = 'L1_KAS';
                            onrampAutoStakeSilo = false;
                        }}
                        class="p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 {onrampSettlementTarget !== 'AUTO_STAKE_SILO' && !onrampAutoStakeSilo ? 'bg-[#161d29] border-[#18C6A5] shadow-lg' : 'bg-[#0a0d12] border-white/10 hover:border-white/25'}"
                    >
                        <div class="flex items-center justify-between">
                            <span
                                class="text-xs font-black uppercase tracking-wider text-white"
                            >
                                Direct to Self-Custody Wallet
                            </span>
                            <span
                                class="px-2 py-0.5 rounded bg-[#11161f] border border-[#18C6A5]/40 text-[#18C6A5] text-[8px] font-mono font-bold uppercase"
                            >
                                SINGLE-HOP DROP-SHIP
                            </span>
                        </div>
                        <p class="text-[10px] text-neutral-300 leading-relaxed">
                            "100% yours the moment settlement clears—no 65-day
                            exchange holds."
                        </p>
                        <span class="text-[9px] font-mono text-neutral-400 truncate">
                            Bound Wallet: {identity.activeAddress ||
                                'Connect Sovereign Vault'}
                        </span>
                    </button>
                    <button
                        type="button"
                        data-testid="onramp-dest-autostake-silo-card"
                        onclick={() => {
                            onrampTargetTicker = DEFAULT_ECOSYSTEM_TICKER;
                            onrampAutoStakeSilo = true;
                            onrampSettlementTarget = 'AUTO_STAKE_SILO';
                        }}
                        class="p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 {onrampSettlementTarget === 'AUTO_STAKE_SILO' || onrampAutoStakeSilo ? 'bg-[#161d29] border-[#18C6A5] shadow-lg' : 'bg-[#0a0d12] border-white/10 hover:border-white/25'}"
                    >
                        <div class="flex items-center justify-between">
                            <span
                                class="text-xs font-black uppercase tracking-wider text-white"
                            >
                                1-Click Auto-Stake to SILO Vault
                            </span>
                            <span
                                class="px-2 py-0.5 rounded bg-[#11161f] border border-[#18C6A5]/40 text-[#18C6A5] text-[8px] font-mono font-bold uppercase"
                            >
                                0% USDC BUNDLE FEE
                            </span>
                        </div>
                        <p class="text-[10px] text-neutral-300 leading-relaxed">
                            "Skip the extra swap and earn vault yield
                            immediately."
                        </p>
                        <span class="text-[9px] font-mono text-[#18C6A5]">
                            Unlocks 0.75%–0.25% Protocol Fee Shield + Passive
                            HIFO Tax Lot
                        </span>
                    </button>
                </div>

                {#if showOnrampBankLinker}
                    <div
                        transition:slide={{ duration: 150 }}
                        class="bg-[#0a0d12] border border-white/10 rounded-xl p-4 flex flex-col gap-3"
                    >
                        <span
                            class="text-[9px] font-bold uppercase tracking-widest text-[#18C6A5]"
                        >
                            Link AES-256-GCM Bank Rail (Mod-10 ABA Checksum)
                        </span>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div class="flex flex-col gap-1">
                                <label
                                    for="onrampAbaInput"
                                    class="text-[8px] font-bold uppercase text-neutral-400"
                                >
                                    9-Digit ABA Routing Number
                                </label>
                                <input
                                    id="onrampAbaInput"
                                    type="text"
                                    maxlength="9"
                                    bind:value={offrampRoutingNumber}
                                    placeholder="021000021"
                                    class="bg-[#11161f] border {abaTelemetry.isComplete ? (abaTelemetry.checksumValid ? 'border-[#18C6A5]/60' : 'border-red-500/60') : 'border-white/10'} rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
                                />
                                {#if abaTelemetry.cleanDigits.length > 0}
                                    <span
                                        class="text-[8px] font-mono font-bold {abaTelemetry.isComplete && abaTelemetry.checksumValid ? 'text-[#18C6A5]' : abaTelemetry.isComplete ? 'text-red-400' : 'text-neutral-500'}"
                                    >
                                        {abaTelemetry.isComplete &&
                                        abaTelemetry.checksumValid
                                            ? `✓ ${abaTelemetry.institutionName}`
                                            : abaTelemetry.isComplete
                                              ? '✕ Invalid ABA Mod-10 Checksum'
                                              : `Entering ABA (${abaTelemetry.cleanDigits.length}/9)...`}
                                    </span>
                                {/if}
                            </div>
                            <div class="flex flex-col gap-1">
                                <label
                                    for="onrampAcctInput"
                                    class="text-[8px] font-bold uppercase text-neutral-400"
                                >
                                    Bank Account Number
                                </label>
                                <input
                                    id="onrampAcctInput"
                                    type="password"
                                    bind:value={offrampAccountNumber}
                                    placeholder="Account Number"
                                    class="bg-[#11161f] border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
                                />
                            </div>
                        </div>
                        <button
                            type="button"
                            onclick={saveBankRailVault}
                            disabled={isSavingBankRail ||
                                !abaTelemetry.checksumValid ||
                                !offrampAccountNumber.trim()}
                            class="tactile-btn w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer disabled:opacity-40"
                        >
                            {isSavingBankRail
                                ? 'Encrypting & Saving Bank Rail...'
                                : 'Save Encrypted Bank Rail ✓'}
                        </button>
                    </div>
                {/if}

                <div class="relative">
                    {#if ui.microBadges['dex_fiat_btn']}
                        <div
                            class="micro-confirm-badge absolute -top-4 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/60 text-[#18C6A5] text-[9px] font-mono font-black uppercase whitespace-nowrap"
                        >
                            {ui.microBadges['dex_fiat_btn'].label}
                        </div>
                    {/if}
                    <button
                        type="button"
                        data-testid="fiat-generate-pass-cta"
                        onclick={initiateFiatOnramp}
                        disabled={isInitializingOnramp ||
                            onrampCostPlusQuote.circuitBreakerTripped}
                        class="tactile-btn w-full py-4 rounded-2xl text-white border-[#18C6A5]/45 text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                        style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.22), transparent 70%);"
                    >
                        {#if isInitializingOnramp}
                            Generating Reserved Settlement Pass...
                        {:else}
                            Generate Settlement Pass → (Generate Sovereign Wire /
                            ACH Order &amp; Memo • {onrampTargetTicker}{onrampAutoStakeSilo
                                ? ' Auto-Stake'
                                : ''})
                        {/if}
                    </button>
                </div>
            </div>

            {#if onrampError || onrampCostPlusQuote.circuitBreakerTripped}
                <div
                    data-testid="fiat-circuit-breaker-banner"
                    class="bg-red-950/25 border border-red-500/40 p-4 rounded-xl text-center"
                >
                    <span
                        class="text-[10px] font-mono font-bold uppercase tracking-widest text-red-400"
                    >
                        {onrampError ||
                            onrampCostPlusQuote.circuitBreakerReason}
                    </span>
                </div>
            {/if}

            {#if onrampSessionData}
                {@const activePass = onrampSessionData}
                {@const passStageIdx = getPayoutStageIndex(activePass.status)}
                <div
                    data-testid="fiat-settlement-pass-card"
                    class="bg-[#11161f] border border-[#18C6A5]/45 p-5 rounded-2xl flex flex-col gap-4"
                >
                    <div
                        class="flex items-center justify-between flex-wrap gap-2 border-b border-white/10 pb-3"
                    >
                        <div class="flex flex-col">
                            <span
                                class="text-[10px] font-black uppercase tracking-widest text-[#18C6A5]"
                            >
                                ✓ Step 3 • Reserved Settlement Pass ({activePass.sessionId})
                            </span>
                            <span class="text-[9px] font-mono text-neutral-400">
                                Mandatory Wire / ACH Memo:
                                <strong class="text-white select-all"
                                    >{activePass.wireMemo ||
                                        activePass.sessionId}</strong
                                >
                            </span>
                        </div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <button
                                type="button"
                                data-testid="fiat-download-wire-slip-btn"
                                onclick={() =>
                                    downloadWireSlipPdf(
                                        activePass,
                                        onrampFiatAmountUsd
                                    )}
                                class="tactile-btn px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer whitespace-nowrap"
                            >
                                [Download Wire Slip PDF ↓]
                            </button>
                            <span
                                class="px-2.5 py-1 rounded bg-[#0a0d12] border border-[#18C6A5]/35 text-[8px] font-mono text-[#18C6A5] uppercase"
                            >
                                {activePass.status}
                            </span>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono">
                        <div
                            class="bg-[#0a0d12] p-2.5 rounded-lg border border-white/5"
                        >
                            <span
                                class="text-[8px] text-neutral-500 block uppercase"
                                >Est. Delivery</span
                            >
                            <span class="text-white font-bold">
                                {Number(
                                    activePass.estimatedTokens ??
                                        activePass.estimatedKas ??
                                        0
                                ).toLocaleString(undefined, {
                                    maximumFractionDigits: 4
                                })}
                                {activePass.targetAsset || onrampTargetTicker}
                            </span>
                        </div>
                        <div
                            class="bg-[#0a0d12] p-2.5 rounded-lg border border-white/5"
                        >
                            <span
                                class="text-[8px] text-neutral-500 block uppercase"
                                >Execution Lock</span
                            >
                            <span class="text-[#18C6A5] font-bold">
                                Locked on Clearing
                            </span>
                        </div>
                        <div
                            class="bg-[#0a0d12] p-2.5 rounded-lg border border-white/5"
                        >
                            <span
                                class="text-[8px] text-neutral-500 block uppercase"
                                >Cost-Plus Fee</span
                            >
                            <span class="text-neutral-200 font-bold">
                                ${Number(activePass.feeUsd || 0).toFixed(2)} USD
                            </span>
                        </div>
                        <div
                            class="bg-[#0a0d12] p-2.5 rounded-lg border border-white/5"
                        >
                            <span
                                class="text-[8px] text-neutral-500 block uppercase"
                                >Guest Savings</span
                            >
                            <span class="text-[#18C6A5] font-bold">
                                +${Number(
                                    activePass.guestSavingsUsd ??
                                        onrampCostPlusQuote.guestSavingsUsd
                                ).toFixed(2)} USD
                            </span>
                        </div>
                    </div>
                    <div
                        data-testid="fiat-4stage-stepper"
                        class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/10 text-[9px] font-mono"
                    >
                        {#each [
                            { step: 1, label: '1. Pass Reserved & Memo Locked' },
                            { step: 2, label: '2. Inbound ACH / Wire Cleared' },
                            { step: 3, label: '3. 0%-Fee Maker / Re-Par Fill' },
                            {
                                step: 4,
                                label: '4. Single-Hop Self-Custody Delivered'
                            }
                        ] as st (st.step)}
                            <div class="flex flex-col gap-1">
                                <div
                                    class="h-1.5 rounded-full {passStageIdx >=
                                    st.step
                                        ? 'bg-[#18C6A5]'
                                        : 'bg-white/10'}"
                                ></div>
                                <span
                                    class="truncate {passStageIdx >= st.step
                                        ? 'text-[#18C6A5] font-bold'
                                        : 'text-neutral-500'}"
                                >
                                    {st.label}
                                </span>
                            </div>
                        {/each}
                    </div>
                    <div
                        data-testid="fiat-post-trade-sweep-card"
                        class="bg-[#0a0d12] border border-white/10 rounded-xl p-3 flex flex-col gap-2 text-[9px] font-mono"
                    >
                        <span class="text-[8px] font-bold uppercase tracking-widest text-neutral-400">
                            Automated 4-Bucket Post-Trade USD Allocation (${onrampPostTradeSplit.grossInboundUsd.toFixed(
                                2
                            )} USD)
                        </span>
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div>
                                <span class="text-neutral-500 block"
                                    >48.5% API Float Sweep</span
                                >
                                <span class="text-white font-bold"
                                    >${onrampPostTradeSplit.wholesaleApiFloatSweepUsd.toFixed(
                                        2
                                    )}</span
                                >
                            </div>
                            <div>
                                <span class="text-neutral-500 block"
                                    >49.0% Chronos Miner Net</span
                                >
                                <span class="text-[#18C6A5] font-bold"
                                    >${onrampPostTradeSplit.chronosMinerSettlementUsd.toFixed(
                                        2
                                    )}</span
                                >
                            </div>
                            <div>
                                <span class="text-neutral-500 block"
                                    >0.7% LLC Tax Reserve</span
                                >
                                <span class="text-amber-400 font-bold"
                                    >${onrampPostTradeSplit.llcTaxAndRailReserveUsd.toFixed(
                                        2
                                    )}</span
                                >
                            </div>
                            <div>
                                <span class="text-neutral-500 block"
                                    >1.8% Profit &amp; Ratchet</span
                                >
                                <span class="text-blue-400 font-bold"
                                    >${onrampPostTradeSplit.netProfitAndRatchetUsd.toFixed(
                                        2
                                    )}</span
                                >
                            </div>
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    {:else}
        <div class="flex flex-col gap-4">
            <div
                data-testid="fiat-offramp-step1-card"
                class="bg-[#11161f] border {activeStep === 1 ? 'border-[#18C6A5]/50' : 'border-white/10'} rounded-2xl p-5 flex flex-col gap-4"
            >
                <div class="flex items-center justify-between flex-wrap gap-2">
                    <span
                        class="text-[10px] font-black text-[#18C6A5] uppercase tracking-widest"
                    >
                        Step 1 • Instant Off-Ramp Payout Calculator (Direct
                        Non-Custodial Deposit)
                    </span>
                    <div class="flex items-center gap-1.5 flex-wrap">
                        {#each [
                            { label: '$100', val: '100' },
                            { label: '$200', val: '200' },
                            { label: '$500', val: '500' },
                            { label: '$1,000', val: '1000' },
                            { label: '$2,500+', val: '2500' }
                        ] as preset (preset.val)}
                            <button
                                type="button"
                                data-testid="offramp-preset-{preset.val}"
                                onclick={() =>
                                    (offrampTargetUsdInput = preset.val)}
                                class="tactile-btn px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold uppercase whitespace-nowrap cursor-pointer {offrampTargetUsdInput === preset.val ? 'text-[#18C6A5] border-[#18C6A5]/45' : 'text-neutral-400 hover:text-white'}"
                            >
                                {preset.label}
                            </button>
                        {/each}
                    </div>
                </div>
                <div class="flex flex-wrap items-center gap-1.5">
                    <span
                        class="text-[8px] font-mono uppercase text-neutral-500 mr-1"
                    >
                        Asset to Sell:
                    </span>
                    {#each ['KAS', 'BTC', 'ETH', 'SOL', 'USDC', 'SILO'] as sellAsset}
                        <button
                            type="button"
                            data-testid="offramp-asset-pill-{sellAsset}"
                            onclick={() => (offrampAssetTicker = sellAsset)}
                            class="px-3 py-1 rounded-lg text-[9px] font-mono font-bold uppercase border cursor-pointer transition-colors whitespace-nowrap {offrampAssetTicker === sellAsset ? 'bg-[#161d29] text-[#18C6A5] border-[#18C6A5]/45' : 'bg-[#0a0d12] text-neutral-400 border-white/10 hover:text-white'}"
                        >
                            {sellAsset}
                        </button>
                    {/each}
                </div>
                <div
                    class="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch"
                >
                    <div
                        class="md:col-span-6 flex flex-col justify-between gap-1.5 bg-[#0a0d12] p-4 rounded-xl border border-white/10"
                    >
                        <div class="flex items-center justify-between">
                            <span
                                class="text-[9px] uppercase tracking-widest text-neutral-400 font-bold"
                            >
                                You Sell ({offrampAssetTicker} → USD)
                            </span>
                            <span class="text-[9px] font-mono text-neutral-400">
                                ≈ {Number(otcCryptoAmountInput || 0).toFixed(4)}
                                {offrampAssetTicker}
                            </span>
                        </div>
                        <div class="flex items-center justify-between gap-2">
                            <span
                                class="text-neutral-500 font-mono text-xl font-bold"
                                >$</span
                            >
                            <input
                                data-testid="fiat-offramp-usd-input"
                                type="number"
                                min="10"
                                bind:value={offrampTargetUsdInput}
                                class="w-full bg-transparent text-2xl font-black font-mono text-white outline-none tabular-nums"
                            />
                            <span
                                class="text-[10px] font-mono font-bold text-white px-2.5 py-1 rounded-lg bg-[#11161f] border border-white/10 shrink-0"
                            >
                                {offrampAssetTicker}
                            </span>
                        </div>
                        <div class="flex items-center justify-between text-[8px] font-mono text-neutral-500">
                            <span>
                                Token Qty:
                                <input
                                    type="number"
                                    value={otcCryptoAmountInput}
                                    oninput={handleCryptoOfframpInput}
                                    class="w-24 bg-transparent text-neutral-300 font-bold outline-none border-b border-white/10"
                                />
                            </span>
                            <span>
                                Avail: {offrampAvailableSourceBalance.toFixed(2)}
                                {offrampAssetTicker}
                            </span>
                        </div>
                    </div>
                    <div
                        class="md:col-span-6 flex flex-col justify-between gap-1.5 bg-[#0a0d12] p-4 rounded-xl border border-[#18C6A5]/35"
                    >
                        <div class="flex items-center justify-between">
                            <span
                                class="text-[9px] uppercase tracking-widest text-[#18C6A5] font-bold"
                            >
                                Net Cash Dispatched to Your Bank
                            </span>
                            <span class="text-[9px] font-mono text-neutral-400">
                                Fee: ${offrampCostPlusQuote.feeUsd.toFixed(2)} ({offrampCostPlusQuote.effectiveFeePct.toFixed(
                                    2
                                )}%)
                            </span>
                        </div>
                        <div class="flex items-center justify-between gap-2">
                            <span
                                data-testid="fiat-offramp-net-payout"
                                class="text-2xl font-mono font-black text-[#18C6A5] tabular-nums"
                            >
                                ${offrampCostPlusQuote.guestNetUsd.toFixed(2)} USD
                            </span>
                            <span
                                class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/35 text-[9px] font-mono font-bold text-[#18C6A5] uppercase"
                            >
                                {offrampCostPlusQuote.railLabel}
                            </span>
                        </div>
                        <span class="text-[8px] font-mono text-neutral-400">
                            Route: {offrampCostPlusQuote.routingTopology}
                        </span>
                    </div>
                </div>
                <div
                    data-testid="fiat-offramp-savings-badge"
                    class="bg-[#0a0d12] border border-[#18C6A5]/45 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                    <div class="flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full bg-[#18C6A5]"></span>
                        <span class="text-xs font-mono font-black text-[#18C6A5]">
                            You keep +${offrampCostPlusQuote.guestSavingsUsd.toFixed(
                                2
                            )} more than Uphold &amp; Retail Exchange Apps.
                        </span>
                    </div>
                    <span class="text-[9px] font-mono text-neutral-400">
                        Perennia Payout: <strong class="text-white"
                            >${offrampCostPlusQuote.guestNetUsd.toFixed(
                                2
                            )}</strong
                        >
                        vs. Retail Exchange: ${offrampCostPlusQuote.competitorNetUsd.toFixed(
                            2
                        )}
                    </span>
                </div>
                <div class="flex justify-end">
                    <button
                        type="button"
                        data-testid="fiat-offramp-lock-quote-cta"
                        onclick={() => (activeStep = 2)}
                        disabled={offrampCostPlusQuote.circuitBreakerTripped}
                        class="tactile-btn px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/50 cursor-pointer disabled:opacity-40"
                    >
                        Lock In My Quote →
                    </button>
                </div>
            </div>

            <div
                data-testid="fiat-offramp-step2-card"
                class="flex flex-col gap-3 bg-[#11161f] p-5 rounded-2xl border {activeStep === 2 ? 'border-[#18C6A5]/50' : 'border-white/10'}"
            >
                <span
                    class="text-[10px] font-black uppercase tracking-widest text-white"
                >
                    Step 2 • Choose Your Bank Payout Speed &amp; Link ABA Vault
                </span>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button
                        type="button"
                        data-testid="offramp-card-free-ach"
                        onclick={() => (payoutMethod = 'ach')}
                        class="p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 {payoutMethod === 'ach' ? 'bg-[#161d29] border-[#18C6A5] shadow-lg' : 'bg-[#0a0d12] border-white/10 hover:border-white/25'}"
                    >
                        <div class="flex items-center justify-between">
                            <span
                                class="text-xs font-black uppercase tracking-wider text-white"
                            >
                                Free Bank ACH Payout
                            </span>
                            <span
                                class="px-2 py-0.5 rounded bg-[#11161f] border border-[#18C6A5]/40 text-[#18C6A5] text-[8px] font-mono font-bold uppercase"
                            >
                                TWO-WAY FLOAT SETTLED
                            </span>
                        </div>
                        <p class="text-[10px] text-neutral-300 leading-relaxed">
                            "Direct deposit to your checking account."
                        </p>
                        <span class="text-[9px] font-mono text-neutral-400">
                            Paid from Perennia Holdings LLC cleared commercial
                            checking float
                        </span>
                    </button>
                    <button
                        type="button"
                        data-testid="offramp-card-whale-wire"
                        onclick={() => {
                            payoutMethod = 'wire';
                            if (
                                (parseFloat(offrampTargetUsdInput) || 0) < 2500
                            ) {
                                offrampTargetUsdInput = '2500';
                            }
                        }}
                        class="p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 {payoutMethod === 'wire' ? 'bg-[#161d29] border-[#18C6A5] shadow-lg' : 'bg-[#0a0d12] border-white/10 hover:border-white/25'}"
                    >
                        <div class="flex items-center justify-between">
                            <span
                                class="text-xs font-black uppercase tracking-wider text-white"
                            >
                                Same-Day Whale FedWire
                            </span>
                            <span
                                class="px-2 py-0.5 rounded bg-[#11161f] border border-amber-500/40 text-amber-400 text-[8px] font-mono font-bold uppercase"
                            >
                                $2,500+ INSTITUTIONAL
                            </span>
                        </div>
                        <p class="text-[10px] text-neutral-300 leading-relaxed">
                            "Unlocked at $2,500+ for instant institutional
                            settlement."
                        </p>
                        <span class="text-[9px] font-mono text-[#18C6A5]">
                            1.2% All-In Whale Rate ($2,470 Net on $2,500 vs.
                            $2,437 Retail)
                        </span>
                    </button>
                </div>

                <div
                    class="flex flex-col gap-3 bg-[#0a0d12] p-4 rounded-2xl border border-white/10 mt-1"
                >
                    <div
                        class="flex items-center justify-between flex-wrap gap-2"
                    >
                        <div class="flex flex-col">
                            <span
                                class="text-[10px] font-black uppercase tracking-widest text-white"
                            >
                                AES-256-GCM Encrypted Bank Rail Vault
                            </span>
                            <span class="text-[8px] font-mono text-neutral-400">
                                Local Federal Reserve Mod-10 ABA Checksum &amp;
                                Instant Institution Recognition
                            </span>
                        </div>
                        {#if savedBankLast4}
                            <button
                                type="button"
                                data-testid="edit-bank-rail-btn"
                                onclick={() =>
                                    (isEditingBankRail = !isEditingBankRail)}
                                class="tactile-btn px-3 py-1 rounded-lg text-[8px] font-bold uppercase text-[#18C6A5] border-[#18C6A5]/35 cursor-pointer whitespace-nowrap"
                            >
                                {isEditingBankRail
                                    ? 'Close Editor ✕'
                                    : `Update Rail (*${savedBankLast4})`}
                            </button>
                        {/if}
                    </div>
                    {#if savedBankLast4 && !isEditingBankRail}
                        <div
                            class="bg-[#11161f] border border-[#18C6A5]/30 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono"
                        >
                            <div class="flex items-center gap-2.5">
                                <span class="w-2 h-2 rounded-full bg-[#18C6A5]"
                                ></span>
                                <span class="font-bold text-white">
                                    {savedBankRailMeta?.bankLabel ||
                                        offrampBankLabel} (*{savedBankLast4})
                                </span>
                            </div>
                            <div class="flex items-center gap-2 text-[9px]">
                                <span
                                    class="px-2 py-0.5 rounded bg-[#0a0d12] border border-white/10 text-neutral-300"
                                >
                                    {savedBankRailMeta?.accountType ||
                                        offrampAccountType}
                                </span>
                                <span
                                    class="px-2 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/30 text-[#18C6A5]"
                                >
                                    {payoutMethod.toUpperCase()} READY
                                </span>
                            </div>
                        </div>
                    {:else}
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div class="flex flex-col gap-1">
                                <label
                                    for="offrampRouting"
                                    class="text-[9px] font-bold text-neutral-400 uppercase tracking-widest"
                                >
                                    9-Digit ABA Routing Number
                                </label>
                                <input
                                    id="offrampRouting"
                                    data-testid="offramp-aba-input"
                                    type="text"
                                    maxlength="9"
                                    bind:value={offrampRoutingNumber}
                                    placeholder="111000614"
                                    class="w-full bg-[#11161f] border {abaTelemetry.isComplete ? (abaTelemetry.checksumValid ? 'border-[#18C6A5]/60' : 'border-red-500/60') : 'border-white/10'} rounded-xl px-3.5 py-2.5 text-[11px] font-mono text-white outline-none"
                                />
                                {#if abaTelemetry.cleanDigits.length > 0}
                                    <div
                                        data-testid="aba-recognition-badge"
                                        class="mt-1 px-2.5 py-1.5 rounded-lg border text-[9px] font-mono font-bold flex items-center justify-between {abaTelemetry.isComplete && abaTelemetry.checksumValid ? 'bg-[#11161f] border-[#18C6A5]/45 text-[#18C6A5]' : abaTelemetry.isComplete ? 'bg-red-950/25 border-red-500/45 text-red-400' : 'bg-[#11161f] border-white/10 text-neutral-400'}"
                                    >
                                        {#if abaTelemetry.isComplete && abaTelemetry.checksumValid}
                                            <span
                                                >✓ {abaTelemetry.institutionName}</span
                                            >
                                            <span class="text-[8px] uppercase"
                                                >MOD-10 VALID</span
                                            >
                                        {:else if abaTelemetry.isComplete}
                                            <span
                                                >✕ Invalid Federal Reserve ABA
                                                Checksum</span
                                            >
                                            <span class="text-[8px] uppercase"
                                                >MOD-10 FAIL</span
                                            >
                                        {:else}
                                            <span
                                                >Entering ABA Routing ({abaTelemetry
                                                    .cleanDigits.length}/9
                                                digits)...</span
                                            >
                                        {/if}
                                    </div>
                                {/if}
                            </div>
                            <div class="flex flex-col gap-1">
                                <label
                                    for="offrampAccount"
                                    class="text-[9px] font-bold text-neutral-400 uppercase tracking-widest"
                                >
                                    Bank Account Number
                                </label>
                                <input
                                    id="offrampAccount"
                                    data-testid="offramp-account-input"
                                    type="password"
                                    bind:value={offrampAccountNumber}
                                    placeholder="Account Number"
                                    class="w-full bg-[#11161f] border border-white/10 rounded-xl px-3.5 py-2.5 text-[11px] font-mono text-white outline-none"
                                />
                            </div>
                        </div>
                        <button
                            type="button"
                            data-testid="save-bank-rail-btn"
                            onclick={saveBankRailVault}
                            disabled={isSavingBankRail ||
                                !abaTelemetry.checksumValid ||
                                !offrampAccountNumber.trim()}
                            class="tactile-btn w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer disabled:opacity-40"
                        >
                            {isSavingBankRail
                                ? 'Encrypting & Saving Bank Rail...'
                                : 'Save / Update Encrypted Bank Rail Vault'}
                        </button>
                    {/if}
                </div>

                {#if offrampError || offrampCostPlusQuote.circuitBreakerTripped}
                    <div
                        class="bg-red-950/25 border border-red-500/40 p-3.5 rounded-xl text-center"
                    >
                        <span
                            class="text-[10px] font-mono font-bold uppercase tracking-widest text-red-400"
                        >
                            {offrampError ||
                                offrampCostPlusQuote.circuitBreakerReason}
                        </span>
                    </div>
                {/if}
                {#if offrampSuccessBanner}
                    <div
                        class="bg-[#0a0d12] border border-[#18C6A5]/45 p-3.5 rounded-xl text-center"
                    >
                        <span
                            class="text-[10px] font-mono font-bold uppercase tracking-widest text-[#18C6A5]"
                        >
                            {offrampSuccessBanner}
                        </span>
                    </div>
                {/if}
                <button
                    type="button"
                    data-testid="fiat-offramp-generate-pass-cta"
                    onclick={generateOfframpSettlementPass}
                    disabled={isExecuting ||
                        offrampCostPlusQuote.circuitBreakerTripped}
                    class="tactile-btn w-full py-4 rounded-2xl text-white border-[#18C6A5]/45 text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                    style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.2), transparent 70%);"
                >
                    Generate Settlement Pass → ({offrampAssetTicker} → ${offrampCostPlusQuote.guestNetUsd.toFixed(
                        2
                    )} USD {payoutMethod.toUpperCase()})
                </button>
            </div>

            {#if activeOfframpPass}
                {@const pass = activeOfframpPass}
                {@const stageIdx = getPayoutStageIndex(pass.status)}
                <div
                    data-testid="fiat-offramp-settlement-pass-card"
                    class="bg-[#11161f] border border-[#18C6A5]/45 p-5 rounded-2xl flex flex-col gap-4"
                >
                    <div
                        class="flex items-center justify-between flex-wrap gap-2 border-b border-white/10 pb-3"
                    >
                        <div class="flex flex-col">
                            <span
                                class="text-[10px] font-black uppercase tracking-widest text-[#18C6A5]"
                            >
                                ✓ Step 3 • Off-Ramp Settlement Pass ({pass.payoutId})
                            </span>
                            <span class="text-[9px] font-mono text-neutral-400">
                                {pass.depositRouteType} • Confirmation Lock: {pass.confirmationsCurrent}/{pass.confirmationsRequired}
                                Blocks
                            </span>
                        </div>
                        <div class="flex items-center gap-2 flex-wrap">
                            <button
                                type="button"
                                data-testid="fiat-offramp-download-pdf-btn"
                                onclick={() =>
                                    downloadAchPayoutReceiptPdf(pass)}
                                class="tactile-btn px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer"
                            >
                                [Download Settlement Pass PDF ↓]
                            </button>
                        </div>
                    </div>
                    <div
                        class="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-[#0a0d12] border border-white/10 rounded-xl p-4"
                    >
                        <div class="md:col-span-8 flex flex-col gap-2">
                            <span
                                class="text-[9px] font-bold uppercase tracking-widest text-neutral-400"
                            >
                                Send {Number(pass.amountCrypto || 0).toFixed(4)}
                                {pass.sourceAsset} Directly to Non-Custodial Settlement
                                Deposit Address:
                            </span>
                            <div
                                data-testid="offramp-direct-deposit-address"
                                class="p-3 rounded-lg bg-[#11161f] border border-[#18C6A5]/35 text-xs font-mono font-bold text-[#18C6A5] break-all select-all"
                            >
                                {pass.depositAddress}
                            </div>
                            <span class="text-[9px] font-mono text-neutral-400">
                                Zero-Loss Safety Lock: USD payout rate (${Number(
                                    pass.netFiatUsd
                                ).toFixed(2)} USD to *{pass.bankLast4}) locks automatically
                                upon {pass.confirmationsRequired} block confirmations.
                            </span>
                        </div>
                        <div
                            class="md:col-span-4 flex flex-col items-center justify-center"
                        >
                            {#if offrampDepositQrDataUrl}
                                <img
                                    src={offrampDepositQrDataUrl}
                                    alt="Off-Ramp Deposit QR"
                                    class="w-32 h-32 rounded-xl bg-white p-2 border border-white/20"
                                />
                            {/if}
                        </div>
                    </div>
                    <div
                        data-testid="fiat-offramp-4stage-stepper"
                        class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/10 text-[9px] font-mono"
                    >
                        {#each [
                            {
                                step: 1,
                                label: '1. Direct Deposit Address Reserved'
                            },
                            {
                                step: 2,
                                label: '2. On-Chain Confirmations Locked'
                            },
                            {
                                step: 3,
                                label: '3. API Float Refilled & USD Netted'
                            },
                            {
                                step: 4,
                                label: pass.traceId
                                    ? `4. Dispatched (${pass.traceId})`
                                    : '4. ACH / FedWire Dispatched'
                            }
                        ] as st (st.step)}
                            <div class="flex flex-col gap-1">
                                <div
                                    class="h-1.5 rounded-full {stageIdx >=
                                    st.step
                                        ? 'bg-[#18C6A5]'
                                        : 'bg-white/10'}"
                                ></div>
                                <span
                                    class="truncate {stageIdx >= st.step
                                        ? 'text-[#18C6A5] font-bold'
                                        : 'text-neutral-500'}"
                                >
                                    {st.label}
                                </span>
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>
    {/if}

    {#if recentOnrampSessions.length > 0 || recentOfframpPayouts.length > 0 || fiatHistoryEvents.length > 0}
        <div class="border-t border-white/10 pt-4 mt-1 flex flex-col gap-3">
            <div class="flex items-center justify-between">
                <span
                    class="text-[10px] font-black uppercase tracking-widest text-neutral-300"
                >
                    Live 4-Stage ACH / FedWire Pipeline &amp; Printable Receipts
                </span>
                <button
                    type="button"
                    onclick={checkFiatGatewayStatus}
                    class="text-[9px] font-mono text-neutral-400 hover:text-white cursor-pointer"
                >
                    Refresh ↻
                </button>
            </div>
            <div
                class="flex flex-col gap-2.5 max-h-[260px] overflow-y-auto hide-scrollbar"
            >
                {#each recentOfframpPayouts as p (p.payout_id)}
                    {@const stageIdx = getPayoutStageIndex(p.status)}
                    <div
                        class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex flex-col gap-2.5 text-[10px]"
                    >
                        <div class="flex items-center justify-between gap-2">
                            <div class="flex flex-col">
                                <span class="font-bold text-white">
                                    OFF-RAMP ({p.payout_method} *{p.bank_last4})
                                    • {Number(p.amount_crypto || 0).toFixed(4)}
                                    {p.source_asset}
                                </span>
                                <span class="text-[9px] text-neutral-400">
                                    Ref: {p.payout_id} • {p.status}
                                    {#if p.trace_id}
                                        • <strong class="text-[#18C6A5]"
                                            >Trace: {p.trace_id}</strong
                                        >
                                    {/if}
                                </span>
                            </div>
                            <div class="flex items-center gap-2">
                                <button
                                    type="button"
                                    onclick={() =>
                                        downloadAchPayoutReceiptPdf(p)}
                                    class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-bold uppercase text-neutral-300 hover:text-white cursor-pointer whitespace-nowrap"
                                >
                                    [Receipt PDF ↓]
                                </button>
                                <span class="font-bold text-[#18C6A5]">
                                    +${Number(p.net_fiat_usd || 0).toFixed(2)} USD
                                </span>
                            </div>
                        </div>
                        <div
                            class="grid grid-cols-4 gap-1.5 pt-1 border-t border-white/5 text-[8px] font-mono"
                        >
                            {#each [{ step: 1, label: '1. Deposit Reserved' }, { step: 2, label: '2. Block Confirmed' }, { step: 3, label: '3. Float Rebalanced' }, { step: 4, label: p.trace_id ? `4. Dispatched (${p.trace_id.slice(0, 10)})` : '4. Bank Dispatched' }] as st}
                                <div class="flex flex-col gap-1">
                                    <div
                                        class="h-1 rounded-full {stageIdx >=
                                        st.step
                                            ? 'bg-[#18C6A5]'
                                            : 'bg-white/10'}"
                                    ></div>
                                    <span
                                        class="truncate {stageIdx >= st.step
                                            ? 'text-[#18C6A5] font-bold'
                                            : 'text-neutral-500'}"
                                    >
                                        {st.label}
                                    </span>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</div>