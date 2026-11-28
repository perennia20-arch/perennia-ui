<script lang="ts">
	import { mountStripeCard, createStripeCardPm, confirmStripeCard3ds } from '$lib/components/dex/stripeCardClient';
    import { fade, slide } from 'svelte/transition';
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import QRCode from 'qrcode';
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { i18n } from '$lib/stores/i18n.svelte';
    import {
        treasury,
        DEFAULT_ECOSYSTEM_TICKER,
        type UnifiedAsset
    } from '$lib/stores/treasury.svelte';
    import { txState } from '$lib/stores/transaction.svelte';
    import { requestUniversalL1Signature } from '$lib/stores/kaspaStore.svelte';
    import { LIVE_PRICING_UNAVAILABLE_MESSAGE } from '$lib/crypto/atomicMath';
    import {
        evaluateAbaRoutingNumber,
        getPayoutStageIndex,
        downloadWireSlipPdf,
        downloadAchPayoutReceiptPdf,
        computeOnrampCostPlusQuote,
        computeOfframpCostPlusQuote,
        resolveOfframpDepositAddressPreview,
        MERCURY_COLUMN_WIRE_INSTRUCTIONS,
        type SavedBankRailMeta,
        type OnrampGatewayMethod
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
    let onrampFiatAmountUsd = $state('');
    let onrampTargetTicker = $state('KAS');
    let onrampAutoStakeSilo = $state(false);
    let isTargetDropdownOpen = $state(false);
    let targetSearchQuery = $state('');
    let isDiscoveringToken = $state(false);
    let discoveryNotice = $state<string | null>(null);
    let discoverTimer: ReturnType<typeof setTimeout>;

    // Off-Ramp State (never resets when switching assets)
    let offrampTargetUsdInput = $state('500');
    let offrampAssetTicker = $state('KAS');
    let isOfframpDropdownOpen = $state(false);
    let offrampSourceMode = $state<'onchain_kas' | 'direct_wholesale_deposit'>('onchain_kas');
    let otcCryptoAmountInput = $state('');
    let externalCostBasisUsdInput = $state('');
    let payoutMethod = $state<'ach' | 'wire'>('ach');

    // Pillar 1 Gateway Method & Rail State
    let buyTab = $state<'INSTANT' | 'VIP_WIRE'>('INSTANT');
    let onrampGatewayMethod = $state<OnrampGatewayMethod>('card');
	let onrampUseColdStorage = $state(false);
	let onrampColdAddress = $state('');
	let onrampCardError = $state<string | null>(null);
    let wireCopyKey = $state<string | null>(null);
    let lastAutoAchAmountBucket = $state<'below625' | 'above625' | 'wire100k'>(
        'below625'
    );
    let onrampPaymentRail = $state<
        | 'SOVEREIGN_WIRE_ACH'
        | 'CARD_INSTANT'
        | 'STRIPE_CRYPTO_ONRAMP'
        | 'BRIDGE_VIRTUAL_ACCOUNT_WIRE'
    >('CARD_INSTANT');
    let onrampSettlementTarget = $state<'L1_KAS' | 'L1_SELF_CUSTODY'>('L1_KAS');

    let offrampBankLabel = $state('Bank Account');
    let offrampAccountType = $state<'CHECKING' | 'SAVINGS'>('CHECKING');
    let offrampRoutingNumber = $state('');
    let offrampAccountNumber = $state('');
    let savedBankLast4 = $state<string | null>(null);
    let savedBankRailMeta = $state<SavedBankRailMeta | null>(null);
    let isEditingBankRail = $state(false);
    let isSavingBankRail = $state(false);
    let showOnrampBankLinker = $state(false);

    // Step 3: Settlement Receipt State
    let isInitializingOnramp = $state(false);
    let isSettlingOnrampPass = $state(false);
    let awaitingWalletOfframpSign = $state(false);
    let onrampSessionData = $state<any | null>(null);
    let activeOfframpPass = $state<any | null>(null);
    let offrampDepositQrDataUrl = $state('');
    let onrampError = $state<string | null>(null);
    let offrampError = $state<string | null>(null);
    let offrampSuccessBanner = $state<string | null>(null);
    let circleDirectActive = $state<boolean>(false);
    let stripeDirectActive = $state<boolean>(false);
    let changenowActive = $state<boolean>(false);
    let masterTreasuryKasAddress = $state<string>('');
    let fiatHistoryEvents = $state<any[]>([]);
    let recentOfframpPayouts = $state<any[]>([]);
    let recentOnrampSessions = $state<any[]>([]);
    let onrampPollInterval: ReturnType<typeof setInterval>;

    // Cross-Platform Loyalty Pass & Pro/Miner Tier State
    let wholesaleFloorActive = $state<boolean>(false);
    let minerLoyaltyTelemetry = $state<{
        activeMiner: boolean;
        consecutiveWeeks: number;
        effectivePoolFeePct: number;
        unlockedSwapFeeFloorPct: number;
        inGraceWindow?: boolean;
    } | null>(null);

    let onrampAssetObj = $derived<UnifiedAsset>(
        treasury.getAsset(onrampTargetTicker)
    );
    let offrampAssetObj = $derived<UnifiedAsset>(
        treasury.getAsset(offrampAssetTicker)
    );
    let activeThemeHex = $derived(
        (fiatMode === 'onramp'
            ? onrampAssetObj.theme?.hex
            : offrampAssetObj.theme?.hex) || '#18C6A5'
    );
    let abaTelemetry = $derived(evaluateAbaRoutingNumber(offrampRoutingNumber));

    // Keep INSTANT Card default unless user chooses ACH/VIP Wire, or order >= $100,000+ requires Institutional Wire
    $effect(() => {
        const parsedUsd = Math.max(0, parseFloat(onrampFiatAmountUsd) || 0);
        if (parsedUsd >= 100_000) {
            lastAutoAchAmountBucket = 'wire100k';
            buyTab = 'VIP_WIRE';
            onrampGatewayMethod = 'wire';
            onrampPaymentRail = 'BRIDGE_VIRTUAL_ACCOUNT_WIRE';
        }
    });

    $effect(() => {
        if (
            abaTelemetry.isComplete &&
            abaTelemetry.checksumValid &&
            abaTelemetry.institutionName &&
            (offrampBankLabel === 'Bank Account' ||
                !offrampBankLabel.trim())
        ) {
            offrampBankLabel = abaTelemetry.institutionName;
        }
    });

    $effect(() => {
        if (!identity.isVaultUnlockPending && awaitingWalletOfframpSign) {
            awaitingWalletOfframpSign = false;
            if (txState.lastTxId) {
                offrampSuccessBanner = `Transfer Signed & Queued (${txState.lastTxId.slice(0, 14)}...) ✓`;
                if (activeOfframpPass) {
                    activeOfframpPass = {
                        ...activeOfframpPass,
                        txId: txState.lastTxId,
                        status: 'QUEUED_FOR_TREASURY_DISPATCH'
                    };
                }
                onSyncUserBalances();
                checkFiatGatewayStatus();
            } else if (txState.error) {
                offrampError = txState.error;
            }
        }
    });

    function handleTokenIconError(e: Event) {
        const target = e.currentTarget as HTMLImageElement;
        target.style.display = 'none';
        if (target.nextElementSibling) {
            (target.nextElementSibling as HTMLElement).style.display = 'flex';
        }
    }

    function formatSpotDisplay(price: number): string {
        return i18n.formatSpotPrice(price);
    }

    function handleTokenSearchInput(raw: string) {
        targetSearchQuery = raw;
        discoveryNotice = null;
        clearTimeout(discoverTimer);
        const trimmed = raw.trim();
        if (trimmed.length < 2) return;
        discoverTimer = setTimeout(async () => {
            isDiscoveringToken = true;
            try {
                if (
                    typeof (treasury as any).discoverAndRegisterToken ===
                    'function'
                ) {
                    const res = await (
                        treasury as any
                    ).discoverAndRegisterToken(trimmed, true);
                    if (res?.primary) {
                        discoveryNotice = `✓ Found ${res.primary.ticker} (${res.primary.network}) @ ${formatSpotDisplay(res.primary.spotPrice)}`;
                        return;
                    }
                }
                const resp = await fetch(
                    `/api/prices?discover=${encodeURIComponent(trimmed)}&register=1`
                );
                if (resp.ok) {
                    const data = await resp.json();
                    if (data.success && data.asset) {
                        const a = data.asset;
                        treasury.updateAsset(a.ticker, {
                            name: a.name || a.ticker,
                            assetClass: a.assetClass || 'DeFi',
                            network: a.network || 'ETH',
                            spotPrice: Number(a.spotPrice || 0),
                            delta: Number(a.change24h || 0),
                            contract: a.contract || a.ticker,
                            imgUrl: a.imgUrl || '',
                            theme: a.theme || {
                                hex: '#18C6A5',
                                pastel: '#99f6e4'
                            }
                        });
                        discoveryNotice = `✓ Found ${a.ticker} (${a.network}) @ ${formatSpotDisplay(Number(a.spotPrice || 0))}`;
                    }
                }
            } catch {
                // Ignore discovery timeout
            } finally {
                isDiscoveringToken = false;
            }
        }, 260);
    }

    function fillTestBankCredentials() {
        offrampRoutingNumber = '110000000';
        offrampAccountNumber = '000123456789';
        offrampBankLabel = 'Linked Bank';
        offrampAccountType = 'CHECKING';
        onrampError = null;
        offrampError = null;
    }

    function copyPanelWireField(key: string, text: string) {
        if (!browser || !navigator.clipboard) return;
        navigator.clipboard.writeText(text).then(() => {
            wireCopyKey = key;
            setTimeout(() => {
                if (wireCopyKey === key) wireCopyKey = null;
            }, 1800);
        }).catch(() => {});
    }

    function resolveSpotForTicker(ticker: string): number {
        const clean = ticker.trim().toUpperCase();
        if (clean === 'USD' || clean === 'USDC' || clean === 'USDT') return 1.0;
        const assetObj = treasury.getAsset(clean);
        if (assetObj.spotPrice > 0) return assetObj.spotPrice;
        return 0;
    }

    let onrampTargetSpotUsd = $derived(
        resolveSpotForTicker(onrampTargetTicker)
    );
    let offrampTargetSpotUsd = $derived(
        resolveSpotForTicker(offrampAssetTicker)
    );
    let fiatOracle503 = $state(false);
    let onrampLivePricingUnavailable = $derived(
        Boolean(treasury.livePricingUnavailable) ||
            fiatOracle503 ||
            !(onrampTargetSpotUsd > 0)
    );
    let offrampLivePricingUnavailable = $derived(
        Boolean(treasury.livePricingUnavailable) ||
            fiatOracle503 ||
            !(offrampTargetSpotUsd > 0)
    );

    let onrampCostPlusQuote = $derived(
        computeOnrampCostPlusQuote({
            assetTicker: onrampTargetTicker,
            grossUsd: Math.max(0, parseFloat(onrampFiatAmountUsd) || 0),
            spotPriceUsd: onrampTargetSpotUsd,
            autoStakeSilo: false,
            bundledKasOrSilo: false,
            wholesaleFloorActive:
                wholesaleFloorActive ||
                Boolean(minerLoyaltyTelemetry?.activeMiner),
            paymentMethod: onrampGatewayMethod
        })
    );

    let offrampCostPlusQuote = $derived(
        computeOfframpCostPlusQuote({
            assetTicker: offrampAssetTicker,
            grossUsd: Math.max(0, parseFloat(offrampTargetUsdInput) || 0),
            spotPriceUsd: offrampTargetSpotUsd,
            payoutMethod,
            wholesaleFloorActive:
                wholesaleFloorActive ||
                Boolean(minerLoyaltyTelemetry?.activeMiner)
        })
    );

    let offrampDepositPreview = $derived(
        resolveOfframpDepositAddressPreview(
            offrampAssetTicker,
            masterTreasuryKasAddress
        )
    );

    let previewWireReferenceMemo = $derived(
        onrampSessionData?.wireMemo ||
            `PERENNIA-${(identity.activeAddress || 'VAULT')
                .replace(/[^a-zA-Z0-9]/g, '')
                .slice(-6)
                .toUpperCase()}`
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
                a.assetClass.toLowerCase().includes(q) ||
                (a.contract && a.contract.toLowerCase().includes(q))
            );
        })
    );

    let offrampAvailableSourceBalance = $derived.by(() => {
        const asset = treasury.getAsset(offrampAssetTicker);
        return asset.onChain || 0;
    });

    export async function checkFiatGatewayStatus() {
        try {
            const requests: Promise<Response | null>[] = [
                fetch('/api/fiat/offramp').catch(() => null),
                fetch('/api/fiat/onramp').catch(() => null)
            ];
            if (identity.activeAddress) {
                requests.push(
                    fetch('/api/state/action', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'GET_MINER_LOYALTY',
                            payload: {}
                        })
                    }).catch(() => null)
                );
            }
            const [offRes, onRes, loyaltyRes] = await Promise.all(requests);
            if ((offRes && offRes.status === 503) || (onRes && onRes.status === 503)) {
                fiatOracle503 = true;
                treasury.markOracleUnavailable(LIVE_PRICING_UNAVAILABLE_MESSAGE);
            } else {
                fiatOracle503 = false;
            }
            if (offRes && offRes.ok) {
                const status = await offRes.json();
                circleDirectActive = Boolean(status.circleConfigured);
                changenowActive = Boolean(status.changenowConfigured);
                if (status.masterTreasuryKasAddress) {
                    masterTreasuryKasAddress = String(
                        status.masterTreasuryKasAddress
                    );
                }
                if (
                    typeof status.spotPrice === 'number' &&
                    status.spotPrice > 0
                ) {
                    treasury.updateAsset('KAS', {
                        spotPrice: status.spotPrice
                    });
                }
                if (status.savedBankRailLast4) {
                    savedBankLast4 = status.savedBankRailLast4;
                } else {
                    showOnrampBankLinker = true;
                }
                if (status.savedBankRail) {
                    savedBankRailMeta = status.savedBankRail;
                    offrampBankLabel =
                        status.savedBankRail.bankLabel ||
                        'Bank Account';
                    offrampAccountType =
                        status.savedBankRail.accountType === 'SAVINGS'
                            ? 'SAVINGS'
                            : 'CHECKING';
                }
                if (Array.isArray(status.recentPayouts)) {
                    recentOfframpPayouts = status.recentPayouts;
                }
            }
            if (onRes && onRes.ok) {
                const onData = await onRes.json();
                stripeDirectActive = Boolean(onData.stripeConfigured);
                if (
                    typeof onData.spotPrice === 'number' &&
                    onData.spotPrice > 0
                ) {
                    treasury.updateAsset('KAS', {
                        spotPrice: onData.spotPrice
                    });
                }
                if (typeof onData.wholesaleFloorActive === 'boolean') {
                    wholesaleFloorActive = onData.wholesaleFloorActive;
                }
                if (Array.isArray(onData.fiatLedgerEvents)) {
                    fiatHistoryEvents = onData.fiatLedgerEvents;
                }
                if (Array.isArray(onData.recentOnrampSessions)) {
                    recentOnrampSessions = onData.recentOnrampSessions;
                }
            }
            if (loyaltyRes && loyaltyRes.ok) {
                const lData = await loyaltyRes.json().catch(() => ({}));
                if (lData?.success && lData?.data) {
                    minerLoyaltyTelemetry = lData.data;
                    if (lData.data.activeMiner) {
                        wholesaleFloorActive = true;
                    }
                }
            }
        } catch {
            // Ignore transient status sync error
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
                'Please enter a valid 9-digit routing number and account number.';
            offrampError = msg;
            onrampError = msg;
            return;
        }
        if (!abaTelemetry.checksumValid) {
            const msg = 'Invalid 9-digit bank routing number.';
            offrampError = msg;
            onrampError = msg;
            return;
        }
        isSavingBankRail = true;
        try {
            const resolvedLabel =
                offrampBankLabel.trim() ||
                abaTelemetry.institutionName ||
                'Bank Account';
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
                offrampError = data.error || 'Failed to save bank account.';
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
            offrampSuccessBanner = `Bank Account Linked (${resolvedLabel} • *${savedBankLast4})`;
            ui.triggerMicroBadge(
                'dex_fiat_btn',
                `BANK *${savedBankLast4} SAVED ✓`,
                '#18C6A5'
            );
        } catch (err: any) {
            offrampError = err.message || 'Failed to save bank account.';
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
        const parsedUsd = parseFloat(onrampFiatAmountUsd) || 0;
        if (parsedUsd < 10) {
            onrampError = 'Minimum purchase amount is $10.00 USD.';
            return;
        }
        const isPushWire =
            onrampGatewayMethod === 'wire' ||
            onrampCostPlusQuote.requiresInstitutionalWire ||
            onrampPaymentRail === 'BRIDGE_VIRTUAL_ACCOUNT_WIRE';
        const isCardMethod = onrampGatewayMethod === 'card' && !isPushWire;
        const cleanInlineRouting = offrampRoutingNumber
            .replace(/\D/g, '')
            .trim();
        const cleanInlineAccount = offrampAccountNumber
            .replace(/\D/g, '')
            .trim();
        const hasTypedBankCredentials =
            cleanInlineRouting.length > 0 || cleanInlineAccount.length > 0;
        if (hasTypedBankCredentials && !isCardMethod && !isPushWire) {
            if (
                cleanInlineRouting.length !== 9 ||
                cleanInlineAccount.length < 4
            ) {
                onrampError =
                    'Please enter a complete 9-digit routing number and account number.';
                return;
            }
            if (!abaTelemetry.checksumValid) {
                onrampError = 'Invalid 9-digit routing number.';
                return;
            }
        } else if (
            !savedBankLast4 &&
            !isPushWire &&
            !isCardMethod &&
            parsedUsd < 100_000
        ) {
            showOnrampBankLinker = true;
            activeStep = 2;
            onrampError =
                'Link your bank account below for ACH Direct Debit, or select Card / Bank Wire.';
            return;
        }
        isInitializingOnramp = true;
        onrampError = null;
        onrampSessionData = null;
        const targetTicker = onrampTargetTicker.trim().toUpperCase();
        const isAutoStake = false;
        const resolvedLabel =
            offrampBankLabel.trim() ||
            abaTelemetry.institutionName ||
            savedBankRailMeta?.bankLabel ||
            'Bank Account';
        try {
            const payload: Record<string, any> = {
                walletAddress: identity.activeAddress,
                evmAddress: identity.sovereignKeys?.ethereum?.address,
                solAddress: identity.sovereignKeys?.solana?.address,
                fiatAmountUsd: parsedUsd,
                targetAsset: targetTicker,
                paymentMethod: isPushWire
                    ? 'wire'
                    : isCardMethod
                      ? 'card'
                      : 'ach',
                paymentRail: isPushWire
                    ? 'BRIDGE_VIRTUAL_ACCOUNT_WIRE'
                    : isCardMethod
                      ? 'CARD_INSTANT'
                      : 'SOVEREIGN_WIRE_ACH',
                settlementTarget: onrampUseColdStorage ? 'L1_SELF_CUSTODY' : onrampSettlementTarget,
                autoStakeSilo: false,
                bundledKasOrSilo: false,
                instantBankDebit: !isPushWire,
                bankLabel: resolvedLabel,
                accountType: offrampAccountType
            };
			if (onrampUseColdStorage) { if (onrampColdAddress.trim().length < 24) throw new Error('Enter a valid Cold Storage wallet address.'); payload.destinationAddress = onrampColdAddress.trim(); payload.settlementTarget = 'L1_SELF_CUSTODY'; }
			if (isCardMethod && !isPushWire) { const pm = await createStripeCardPm('panel'); if (pm.error) throw new Error(pm.error); if (pm.id) payload.stripePaymentMethodId = pm.id; }
            if (
                cleanInlineRouting.length === 9 &&
                cleanInlineAccount.length >= 4
            ) {
                payload.routingNumber = cleanInlineRouting;
                payload.accountNumber = cleanInlineAccount;
            }
            const res = await fetch('/api/fiat/onramp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 503 || data?.livePricingUnavailable) {
                fiatOracle503 = true;
                treasury.markOracleUnavailable(LIVE_PRICING_UNAVAILABLE_MESSAGE);
                throw new Error(LIVE_PRICING_UNAVAILABLE_MESSAGE);
            }
            if (!res.ok) {
                throw new Error(
                    data.uiMessage || data.error || 'Failed to execute bank purchase.'
                );
            }
			if (data.stripeStatus === 'requires_action' && data.clientSecret) { const c3 = await confirmStripeCard3ds('panel', data.clientSecret); if (c3.error) throw new Error(c3.error); }
            if (data.bankLast4) {
                savedBankLast4 = data.bankLast4;
                savedBankRailMeta = {
                    bankLabel: data.bankLabel || resolvedLabel,
                    accountType: offrampAccountType,
                    payoutMethod: 'ACH',
                    bankLast4: data.bankLast4,
                    updatedAt: new Date().toISOString()
                };
                offrampRoutingNumber = '';
                offrampAccountNumber = '';
                showOnrampBankLinker = false;
            }
            onrampSessionData = {
                ...data,
                sessionId: data.sessionId || data.orderId,
                orderId: data.orderId || data.sessionId,
                estimatedKas: data.estimatedKas,
                estimatedTokens: data.estimatedTokens ?? data.estimatedKas,
                deliveredTokens:
                    data.deliveredTokens ??
                    data.estimatedTokens ??
                    data.estimatedKas,
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
                totalGrossChargeUsd: Number(
                    data.totalGrossChargeUsd ??
                        onrampCostPlusQuote.totalGrossChargeUsd
                ),
                paymentRail: data.paymentRail,
                settlementTarget: data.settlementTarget,
                routingTopology:
                    data.routingTopology || onrampCostPlusQuote.routingTopology,
                wireMemo: data.wireMemo || data.sessionId,
                wireInstructions:
                    data.wireInstructions ||
                    MERCURY_COLUMN_WIRE_INSTRUCTIONS,
                postTradeAllocation: data.postTradeAllocation,
                status: data.status || 'COMPLETED',
                txHash: data.txHash,
                bankLast4: data.bankLast4 || savedBankLast4
            };
            activeStep = 3;
            onTriggerTileSweep();
            ui.triggerMicroBadge(
                'dex_fiat_btn',
                onrampSessionData.status === 'COMPLETED'
                    ? `${targetTicker} CREDITED ✓`
                    : `ORDER ${onrampSessionData.wireMemo} CREATED ✓`,
                '#18C6A5'
            );
            await onSyncUserBalances();
            await checkFiatGatewayStatus();
        } catch (e: any) {
            onrampError = e.message || 'Purchase failed.';
        } finally {
            isInitializingOnramp = false;
        }
    }

    async function settleActiveOnrampOrderNow() {
        if (!onrampSessionData?.orderId && !onrampSessionData?.sessionId)
            return;
        const targetOrderId =
            onrampSessionData.orderId || onrampSessionData.sessionId;
        isSettlingOnrampPass = true;
        onrampError = null;
        try {
            const res = await fetch('/api/fiat/onramp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'SETTLE_ORDER_NOW',
                    orderId: targetOrderId
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(
                    data.error || 'Failed to settle on-ramp order.'
                );
            }
            onrampSessionData = {
                ...onrampSessionData,
                status: 'COMPLETED',
                txHash: data.txHash || onrampSessionData.txHash,
                deliveredTokens:
                    data.deliveredTokens ?? onrampSessionData.estimatedTokens
            };
            ui.triggerMicroBadge(
                'dex_fiat_btn',
                `${onrampSessionData.targetAsset} DELIVERED ✓`,
                '#18C6A5'
            );
            await onSyncUserBalances();
            await checkFiatGatewayStatus();
        } catch (err: any) {
            onrampError = err.message || 'Failed to settle order.';
        } finally {
            isSettlingOnrampPass = false;
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
        if (grossUsd < 10 || parsedCrypto <= 0) {
            offrampError = 'Minimum sale amount is $10.00 USD.';
            return;
        }
        if (
            !savedBankLast4 &&
            (!abaTelemetry.checksumValid ||
                offrampAccountNumber.replace(/\D/g, '').length < 4)
        ) {
            offrampError =
                'Link or enter your 9-digit routing number and account number first.';
            return;
        }
        try {
            const resolvedSourceMode =
                offrampSourceMode === 'direct_wholesale_deposit'
                    ? 'direct_wholesale_deposit'
                    : 'onchain_kas';
            const extBasisParsed = parseFloat(externalCostBasisUsdInput);
            const payload: Record<string, any> = {
                wallet: identity.activeAddress,
                amountKas: parsedCrypto,
                kasAmount: parsedCrypto,
                amountAsset: parsedCrypto,
                grossUsd,
                sourceMode: resolvedSourceMode,
                sourceAsset: offrampAssetTicker,
                payoutMethod,
                bankLabel:
                    offrampBankLabel.trim() || 'Bank Account',
                accountType: offrampAccountType,
                ...(Number.isFinite(extBasisParsed) && extBasisParsed >= 0
                    ? { externalCostBasisUsd: extBasisParsed }
                    : {})
            };
            if (offrampRoutingNumber.trim() && offrampAccountNumber.trim()) {
                payload.routingNumber = offrampRoutingNumber.trim();
                payload.accountNumber = offrampAccountNumber.trim();
            }
            const res = await fetch('/api/fiat/offramp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 503 || data?.livePricingUnavailable) {
                fiatOracle503 = true;
                treasury.markOracleUnavailable(LIVE_PRICING_UNAVAILABLE_MESSAGE);
                offrampError = LIVE_PRICING_UNAVAILABLE_MESSAGE;
                return;
            }
            if (!res.ok) {
                offrampError = data.uiMessage || data.error || 'Off-Ramp order rejected.';
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
                    data.depositAddress ||
                    offrampDepositPreview.address ||
                    `bc1qperenniawholesale${offrampAssetTicker.toLowerCase()}`,
                depositRouteType:
                    data.depositRouteType || offrampDepositPreview.routeLabel,
                confirmationsRequired:
                    data.confirmationsRequired ||
                    offrampDepositPreview.confirmationsRequired,
                confirmationsCurrent: data.confirmationsCurrent ?? 0,
                status: data.status || 'AWAITING_ONCHAIN_CONFIRMATIONS'
            };
            activeStep = 3;
            offrampSuccessBanner = `Payout Order Created (${activeOfframpPass.payoutId} • $${Number(activeOfframpPass.netFiatUsd).toFixed(2)} USD)`;
            ui.triggerMicroBadge(
                'dex_fiat_btn',
                `OFF-RAMP ${activeOfframpPass.payoutId} ARMED ✓`,
                '#18C6A5'
            );
            await onSyncUserBalances();
            await checkFiatGatewayStatus();
        } catch (err: any) {
            offrampError = err.message || 'Unable to generate Off-Ramp order.';
        }
    }

    async function simulateOfframpConfirmNow() {
        if (!activeOfframpPass?.payoutId) return;
        activeOfframpPass = {
            ...activeOfframpPass,
            confirmationsCurrent:
                activeOfframpPass.confirmationsRequired || 6,
            status: 'DISPATCHED_BY_DIRECTOR',
            traceId: `ACH-TRACE-${Date.now().toString(36).toUpperCase()}`
        };
        offrampSuccessBanner = `Bank Payout Dispatched (${activeOfframpPass.payoutId}) ✓`;
        await onSyncUserBalances();
    }

    function signAndBroadcastOfframpFromWallet() {
        if (!activeOfframpPass) return;
        const dest =
            activeOfframpPass.depositAddress || masterTreasuryKasAddress;
        if (!dest) {
            offrampError = 'Deposit address unavailable for wallet signing.';
            return;
        }
        txState.lastTxId = '';
        txState.lastExplorerUrl = '';
        awaitingWalletOfframpSign = true;
        requestUniversalL1Signature({
            intentType: 'FIAT_OFFRAMP',
            payAsset: activeOfframpPass.sourceAsset || offrampAssetTicker,
            payAmount:
                activeOfframpPass.amountCrypto || otcCryptoAmountInput || '0',
            fiatAmountUsd: Number(activeOfframpPass.netFiatUsd || 0).toFixed(2),
            destinationAddress: dest,
            payoutMethod,
            bankLabel: offrampBankLabel,
            accountType: offrampAccountType,
            orderId: activeOfframpPass.payoutId
        });
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
            // Ignore transient poll error
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
        clearTimeout(discoverTimer);
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
    class="w-full max-w-[660px] mx-auto bg-[var(--bg-card)] border rounded-[24px] sm:rounded-[28px] p-4 sm:p-6 md:p-7 shadow-2xl flex flex-col gap-4 transition-all duration-300"
    style="
        border-color: {activeThemeHex}45;
        background-image:
            radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.14), transparent 58%),
            radial-gradient(ellipse at bottom right, {activeThemeHex}22, transparent 65%);
        box-shadow:
            0 20px 60px -15px rgba(0, 0, 0, 0.28),
            0 0 40px -15px {activeThemeHex}26;
    "
    in:fade={{ duration: 150 }}
>
    <div class="flex flex-col gap-3 border-b border-white/10 pb-3.5">
        <div class="flex items-center justify-between gap-2 flex-wrap">
            <div class="flex items-center gap-2.5 flex-wrap">
                <span
                    class="w-2.5 h-2.5 rounded-full transition-colors duration-300"
                    style="background-color: {activeThemeHex}; box-shadow: 0 0 10px {activeThemeHex}80;"
                ></span>
                <h3 class="text-white font-black text-xs md:text-sm uppercase tracking-widest">
                    
                </h3>
                
            </div>
            {#if savedBankLast4}
                <span class="px-2.5 py-1 rounded-lg bg-[var(--bg-elevated)] border border-[#18C6A5]/35 text-[#18C6A5] text-[8px] font-mono font-bold uppercase">
                    ✓ Bank *{savedBankLast4}
                </span>
            {/if}
        </div>
        <div class="grid grid-cols-2 gap-2 bg-[var(--bg-elevated)] p-1.5 rounded-2xl border border-white/10">
            <button
                type="button"
                data-testid="fiat-onramp-tab-btn"
                onclick={() => {
                    fiatMode = 'onramp';
                    offrampError = null;
                }}
                class="tactile-btn py-2.5 px-3 text-[10px] font-black uppercase tracking-widest rounded-xl cursor-pointer {fiatMode ===
                'onramp'
                    ? 'text-[#18C6A5] border-[#18C6A5]/45'
                    : 'text-neutral-400 border-transparent'}"
            >
                Buy
            </button>
            <button
                type="button"
                data-testid="fiat-offramp-tab-btn"
                onclick={() => {
                    fiatMode = 'offramp';
                    onrampError = null;
                    offrampError = null;
                }}
                class="tactile-btn py-2.5 px-3 text-[10px] font-black uppercase tracking-widest rounded-xl cursor-pointer {fiatMode ===
                'offramp'
                    ? 'text-[#18C6A5] border-[#18C6A5]/45'
                    : 'text-neutral-400 border-transparent'}"
            >
                Sell
            </button>
        </div>
        <div class="grid grid-cols-3 gap-1.5">
            
        </div>
    </div>

    {#if fiatMode === 'onramp'}
        <div
            data-testid="fiat-step1-calculator-card"
            class="flex flex-col gap-3"
        >
            <div class="grid grid-cols-2 gap-1.5 bg-[var(--bg-elevated)] p-1 rounded-xl border border-[var(--border-subtle)]">
                <button
                    type="button"
                    data-testid="panel-buy-tab-instant"
                    onclick={() => {
                        buyTab = 'INSTANT';
                        if (onrampGatewayMethod === 'wire') {
                            onrampGatewayMethod = 'card';
                            onrampPaymentRail = 'CARD_INSTANT';
                        }
                        showOnrampBankLinker = false;
                    }}
                    class="py-2 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer transition-colors {buyTab === 'INSTANT'
                        ? 'bg-[var(--bg-card)] text-[var(--accent-text)] border border-[var(--border-active)]'
                        : 'text-[var(--text-muted)] border border-transparent hover:text-[var(--text-primary)]'}"
                >
                    INSTANT · CARD / ACH
                </button>
                <button
                    type="button"
                    data-testid="panel-buy-tab-vip-wire"
                    onclick={() => {
                        buyTab = 'VIP_WIRE';
                        onrampGatewayMethod = 'wire';
                        onrampPaymentRail = 'BRIDGE_VIRTUAL_ACCOUNT_WIRE';
                        if ((parseFloat(onrampFiatAmountUsd) || 0) < 2500) {
                            onrampFiatAmountUsd = '2500';
                        }
                    }}
                    class="py-2 px-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer transition-colors {buyTab === 'VIP_WIRE' || onrampCostPlusQuote.requiresInstitutionalWire
                        ? 'bg-[var(--bg-card)] text-amber-500 border border-amber-500/45'
                        : 'text-[var(--text-muted)] border border-transparent hover:text-[var(--text-primary)]'}"
                >
                    VIP WIRE · {i18n.formatFiat(2500, { decimals: 0 })}+
                </button>
            </div>
            <div class="sr-only">
                {#each ['KAS', 'USDC', 'BTC', 'ETH', 'SOL', 'SILO'] as quickAsset}
                    <button
                        type="button"
                        data-testid="fiat-asset-pill-{quickAsset}"
                        onclick={() => {
                            onrampTargetTicker = quickAsset;
                            onrampAutoStakeSilo = false;
                            if (!onrampUseColdStorage) {
                                onrampSettlementTarget = 'L1_KAS';
                            }
                        }}
                    >
                        {quickAsset}
                    </button>
                {/each}
            </div>
            <div
                class="tactile-card bg-[var(--bg-elevated)] rounded-2xl p-4 md:p-5 flex flex-col gap-3 border border-[var(--border-active)]"
                style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.10), transparent 65%);"
            >
                <div class="flex items-center justify-between flex-wrap gap-2">
                    <label
                        for="onrampFiatAmountUsd"
                        class="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]"
                    >
                        {i18n.t('dex.you_pay')} ({i18n.currency})
                    </label>
                    {#if buyTab === 'INSTANT' && !onrampCostPlusQuote.requiresInstitutionalWire}
                        <div class="flex items-center gap-1 flex-wrap">
                            {#each ['50', '100', '250', '500'] as presetAmt (presetAmt)}
                                <button
                                    type="button"
                                    data-testid="panel-buy-preset-{presetAmt}"
                                    onclick={() => {
                                        onrampFiatAmountUsd = presetAmt;
                                    }}
                                    class="px-2 py-0.5 rounded-lg text-[9px] font-black border cursor-pointer transition-colors {onrampFiatAmountUsd === presetAmt
                                        ? 'bg-[var(--bg-hover)] text-[var(--accent-text)] border-[var(--border-active)]'
                                        : 'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'}"
                                >
                                    {i18n.formatFiat(Number(presetAmt), { decimals: 0 })}
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>
                <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-1.5 flex-1 min-w-0">
                        <span class="text-2xl md:text-3xl font-bold text-[var(--text-muted)]"
                            >{i18n.currencySymbol}</span
                        >
                        <input
                            id="onrampFiatAmountUsd"
                            data-testid="fiat-onramp-usd-input"
                            type="number"
                            min="10"
                            bind:value={onrampFiatAmountUsd}
                            class="w-full bg-transparent text-3xl md:text-4xl font-bold font-mono text-[var(--text-primary)] outline-none tabular-nums"
                        />
                    </div>
                    <div
                        class="shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-active)]"
                    >
                        <div class="w-6 h-6 rounded-full bg-[var(--bg-teal-subtle)] border border-[var(--border-active)] text-[var(--accent-text)] flex items-center justify-center text-[10px] font-black">
                            {i18n.currencySymbol}
                        </div>
                        <span class="text-xs font-black text-[var(--text-primary)] tracking-wider">
                            {i18n.currency}
                        </span>
                    </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-[var(--border-subtle)] text-[9px] font-mono">
                    <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl px-2.5 py-1.5 flex flex-col">
                        <span class="text-[var(--text-muted)] uppercase text-[7px]">
                            Fee ({onrampCostPlusQuote.protocolFeeFloorPct.toFixed(
                                2
                            )}%)
                        </span>
                        <span class="text-[var(--text-primary)] font-bold">
                            {i18n.formatFiat(onrampCostPlusQuote.perenniaFeeUsd)}
                        </span>
                    </div>
                    <div class="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl px-2.5 py-1.5 flex flex-col">
                        <span class="text-[var(--text-muted)] uppercase text-[7px]">
                            Gateway Fee
                        </span>
                        <span class="text-[var(--text-secondary)] font-bold">
                            {i18n.formatFiat(onrampCostPlusQuote.stripeGatewayFeeUsd)}
                        </span>
                    </div>
                    <div class="bg-[var(--bg-card)] border border-[var(--border-active)] rounded-xl px-2.5 py-1.5 flex flex-col">
                        <span class="text-[var(--accent-text)] uppercase text-[7px] font-bold">
                            Total
                        </span>
                        <span
                            data-testid="fiat-onramp-fee-breakdown" class:hidden={!(parseFloat(onrampFiatAmountUsd) > 0)}
                            class="text-[var(--accent-text)] font-black"
                        >
                            {i18n.formatFiat(onrampCostPlusQuote.totalGrossChargeUsd)} (Fee: {i18n.formatFiat(onrampCostPlusQuote.feeUsd)})
                        </span>
                    </div>
                </div>
            </div>

            <div class="flex items-center justify-center -my-4 z-20 pointer-events-none">
                <div
                    class="w-9 h-9 rounded-xl bg-[var(--bg-card)] border flex items-center justify-center text-xs font-black shadow-xl transition-colors duration-300"
                    style="border-color: {activeThemeHex}55; color: {activeThemeHex};"
                >
                    ↓
                </div>
            </div>

            
        </div>

        <div
            data-testid="fiat-step2-destination-card"
            class="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-4 flex flex-col gap-3"
        >
            <div class="grid grid-cols-2 gap-1.5 bg-[var(--bg-card)] p-1 rounded-xl border border-white/5"><button type="button" data-testid="onramp-dest-self-custody-card" onclick={() => { onrampUseColdStorage = false; onrampSettlementTarget = 'L1_KAS'; onrampAutoStakeSilo = false; }} class="py-2 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider cursor-pointer transition-all {!onrampUseColdStorage ? 'bg-[var(--bg-hover)] text-white border border-white/15' : 'text-neutral-400 hover:text-white'}">Wallet</button><button type="button" data-testid="onramp-dest-cold-storage-btn" onclick={() => { onrampUseColdStorage = true; onrampSettlementTarget = 'L1_KAS'; onrampAutoStakeSilo = false; }} class="py-2 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider cursor-pointer transition-all {onrampUseColdStorage ? 'bg-[var(--bg-hover)] text-[#18C6A5] border border-[#18C6A5]/40' : 'text-neutral-400 hover:text-white'}">Cold Storage</button></div>{#if onrampUseColdStorage}<div class="bg-[var(--bg-card)] border border-[#18C6A5]/35 rounded-xl p-2.5 flex flex-col gap-1"><span class="text-[8px] font-bold uppercase text-[#18C6A5]">Cold Storage Destination Wallet</span><input type="text" bind:value={onrampColdAddress} placeholder={onrampTargetTicker === 'KAS' || onrampTargetTicker === 'SILO' ? 'kaspa:q...' : onrampTargetTicker === 'BTC' ? 'bc1q...' : 'Paste external wallet address...'} class="bg-[var(--bg-elevated)] border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-white outline-none focus:border-[#18C6A5]/60" /></div>{/if}
            

            {#if buyTab === 'INSTANT' && !onrampCostPlusQuote.requiresInstitutionalWire && onrampGatewayMethod !== 'wire'}
                <div class="flex items-center justify-between flex-wrap gap-2 px-0.5 text-[9px]">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <button
                            type="button"
                            data-testid="onramp-rail-card-btn"
                            onclick={() => {
                                onrampGatewayMethod = 'card';
                                showOnrampBankLinker = false;
                                onrampPaymentRail = 'CARD_INSTANT';
                            }}
                            class="px-2.5 py-1.5 rounded-lg font-bold uppercase border cursor-pointer transition-colors {onrampGatewayMethod === 'card'
                                ? 'bg-[var(--bg-hover)] text-[var(--accent-text)] border-[var(--border-active)]'
                                : 'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'}"
                        >
                            Card / Apple Pay
                        </button>
                        <button
                            type="button"
                            data-testid="onramp-rail-ach-btn"
                            onclick={() => {
                                onrampGatewayMethod = 'ach';
                                onrampPaymentRail = 'SOVEREIGN_WIRE_ACH';
                            }}
                            class="px-2.5 py-1.5 rounded-lg font-bold uppercase border cursor-pointer transition-colors {onrampGatewayMethod === 'ach'
                                ? 'bg-[var(--bg-hover)] text-[var(--accent-text)] border-[var(--border-active)]'
                                : 'bg-[var(--bg-card)] text-[var(--text-muted)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'}"
                        >
                            Bank ACH
                        </button>
                    </div>
                    <span
                        data-testid="panel-buy-clearing-hold-badge"
                        class="px-2 py-0.5 rounded-md border font-black uppercase text-[8px] {onrampGatewayMethod === 'ach'
                            ? 'bg-[var(--bg-card)] text-amber-500 border-amber-500/45'
                            : 'bg-[var(--bg-card)] text-[var(--accent-text)] border-[var(--border-active)]'}"
                    >
                        {onrampGatewayMethod === 'ach' ? 'CLEARING · 5 BIZ DAYS → AVAILABLE' : 'AVAILABLE ON SETTLE'}
                    </span>
                </div>
                {#if onrampGatewayMethod === 'ach'}
                    <div class="flex justify-end px-0.5 text-[9px]">
                        <button
                            type="button"
                            onclick={() => (showOnrampBankLinker = !showOnrampBankLinker)}
                            class="font-bold {savedBankLast4 ? 'text-[var(--accent-text)]' : 'text-amber-500'} hover:underline uppercase cursor-pointer"
                        >
                            {showOnrampBankLinker ? '[Close Bank ✕]' : savedBankLast4 ? `✓ Bank *${savedBankLast4} [Change]` : '[+ Link Bank Account]'}
                        </button>
                    </div>
                {/if}
            {/if}

            {#if buyTab === 'VIP_WIRE' || onrampCostPlusQuote.requiresInstitutionalWire || onrampGatewayMethod === 'wire' || onrampPaymentRail === 'BRIDGE_VIRTUAL_ACCOUNT_WIRE'}
                <!-- VIP Wire ($2,500+) Institutional Fedwire Instruction View (Mercury) -->
                <div
                    data-testid="fiat-mercury-wire-instructions-card"
                    transition:slide={{ duration: 150 }}
                    class="bg-[var(--bg-card)] border border-amber-500/45 rounded-xl p-3.5 flex flex-col gap-2.5 text-[9px] font-mono"
                >
                    <div class="flex items-center justify-between flex-wrap gap-2 border-b border-[var(--border-subtle)] pb-2">
                        <span class="text-amber-500 font-black uppercase tracking-wider">
                            Fedwire Instructions (Mercury)
                        </span>
                        <span class="px-2 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-active)] text-[var(--accent-text)] font-bold text-[8px] uppercase">
                            Releases on SETTLED
                        </span>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div class="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-2.5 flex flex-col gap-0.5">
                            <span class="text-[7px] text-[var(--text-muted)] uppercase">
                                Recipient
                            </span>
                            <span class="text-[var(--text-primary)] font-bold">
                                {MERCURY_COLUMN_WIRE_INSTRUCTIONS.beneficiaryName} ({MERCURY_COLUMN_WIRE_INSTRUCTIONS.accountDescriptor})
                            </span>
                        </div>
                        <div class="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-2.5 flex flex-col gap-0.5">
                            <span class="text-[7px] text-[var(--text-muted)] uppercase">
                                Receiving Bank
                            </span>
                            <span class="text-[var(--text-primary)] font-bold">
                                {MERCURY_COLUMN_WIRE_INSTRUCTIONS.bankName}
                            </span>
                        </div>
                        <div class="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-2.5 flex items-center justify-between gap-2">
                            <div class="flex flex-col gap-0.5 min-w-0">
                                <span class="text-[7px] text-[var(--text-muted)] uppercase">
                                    Routing Number
                                </span>
                                <span class="text-[var(--accent-text)] font-black select-all">
                                    {MERCURY_COLUMN_WIRE_INSTRUCTIONS.routingNumber}
                                </span>
                            </div>
                            <button
                                type="button"
                                data-testid="panel-copy-wire-routing-btn"
                                onclick={() => copyPanelWireField('routing', MERCURY_COLUMN_WIRE_INSTRUCTIONS.routingNumber)}
                                class="px-2 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] text-[8px] font-black uppercase cursor-pointer shrink-0"
                            >
                                {wireCopyKey === 'routing' ? '✓' : 'COPY'}
                            </button>
                        </div>
                        <div class="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-2.5 flex items-center justify-between gap-2">
                            <div class="flex flex-col gap-0.5 min-w-0">
                                <span class="text-[7px] text-[var(--text-muted)] uppercase">
                                    Account Number
                                </span>
                                <span class="text-[var(--accent-text)] font-black select-all">
                                    {MERCURY_COLUMN_WIRE_INSTRUCTIONS.accountNumber}
                                </span>
                            </div>
                            <button
                                type="button"
                                data-testid="panel-copy-wire-account-btn"
                                onclick={() => copyPanelWireField('account', MERCURY_COLUMN_WIRE_INSTRUCTIONS.accountNumber)}
                                class="px-2 py-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-card)] text-[var(--text-primary)] text-[8px] font-black uppercase cursor-pointer shrink-0"
                            >
                                {wireCopyKey === 'account' ? '✓' : 'COPY'}
                            </button>
                        </div>
                    </div>
                    <div class="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div class="flex flex-col">
                            <span class="text-[7px] text-[var(--text-muted)] uppercase">
                                Bank Address
                            </span>
                            <span class="text-[var(--text-secondary)]">
                                {MERCURY_COLUMN_WIRE_INSTRUCTIONS.bankAddress}
                            </span>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                            <div class="flex flex-col sm:items-end">
                                <span class="text-[7px] text-amber-500 uppercase font-bold">
                                    Reference Code
                                </span>
                                <span class="text-[var(--text-primary)] font-black select-all">
                                    {previewWireReferenceMemo}
                                </span>
                            </div>
                            <button
                                type="button"
                                data-testid="panel-copy-wire-memo-btn"
                                onclick={() => copyPanelWireField('memo', previewWireReferenceMemo)}
                                class="px-2 py-1 rounded border border-amber-500/45 bg-[var(--bg-card)] text-amber-500 text-[8px] font-black uppercase cursor-pointer shrink-0"
                            >
                                {wireCopyKey === 'memo' ? '✓' : 'COPY'}
                            </button>
                        </div>
                    </div>
                </div>
            {:else if onrampGatewayMethod === 'card'}<div class="bg-[var(--bg-card)] border border-white/10 rounded-xl p-3 flex flex-col gap-2"><div class="flex items-center justify-between"><span class="text-[9px] font-bold uppercase text-neutral-300">Credit / Debit Card</span><span class="text-[8px] font-mono text-neutral-500">VISA • MC • AMEX</span></div><div use:mountStripeCard={{ slot: 'panel', onState: (st) => { onrampCardError = st.error; } }} class="bg-[var(--bg-elevated)] border border-white/10 focus-within:border-[#18C6A5]/60 rounded-lg px-3 py-2.5 min-h-[38px]"></div>{#if onrampCardError}<span class="text-[8px] font-mono font-bold text-red-400">{onrampCardError}</span>{/if}</div>{:else if onrampGatewayMethod === 'ach' && (showOnrampBankLinker || !savedBankLast4)}
                <div
                    transition:slide={{ duration: 150 }}
                    class="bg-[var(--bg-card)] border border-white/10 rounded-xl p-3 flex flex-col gap-2.5"
                >
                    <div class="flex items-center justify-between">
                        <span class="text-[9px] font-bold uppercase text-neutral-300">
                            Bank Account
                        </span>
                        
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div class="flex flex-col gap-1">
                            <label
                                for="onrampAbaInput"
                                class="text-[8px] font-bold uppercase text-neutral-400"
                            >
                                Routing Number
                            </label>
                            <input
                                id="onrampAbaInput"
                                type="text"
                                maxlength="9"
                                bind:value={offrampRoutingNumber}
                                placeholder="111000614"
                                class="bg-[var(--bg-elevated)] border {abaTelemetry.isComplete ? (abaTelemetry.checksumValid ? 'border-[#18C6A5]/60' : 'border-red-500/60') : 'border-white/10'} rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
                            />
                            {#if abaTelemetry.cleanDigits.length > 0}
                                <span
                                    class="text-[8px] font-mono font-bold {abaTelemetry.isComplete && abaTelemetry.checksumValid ? 'text-[#18C6A5]' : abaTelemetry.isComplete ? 'text-red-400' : 'text-neutral-500'}"
                                >
                                    {abaTelemetry.isComplete &&
                                    abaTelemetry.checksumValid
                                        ? `✓ ${abaTelemetry.institutionName}`
                                        : abaTelemetry.isComplete
                                          ? '✕ Invalid Routing Number'
                                          : `${abaTelemetry.cleanDigits.length}/9 digits`}
                                </span>
                            {/if}
                        </div>
                        <div class="flex flex-col gap-1">
                            <label
                                for="onrampAcctInput"
                                class="text-[8px] font-bold uppercase text-neutral-400"
                            >
                                Account Number
                            </label>
                            <input
                                id="onrampAcctInput"
                                type="password"
                                bind:value={offrampAccountNumber}
                                placeholder="Account Number"
                                class="bg-[var(--bg-elevated)] border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
                            />
                        </div>
                    </div>
                    <button
                        type="button"
                        onclick={saveBankRailVault}
                        disabled={isSavingBankRail ||
                            !abaTelemetry.checksumValid ||
                            !offrampAccountNumber.trim()}
                        class="tactile-btn w-full py-2 rounded-lg text-[9px] font-black uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer disabled:opacity-40"
                    >
                        {isSavingBankRail
                            ? 'Saving Bank Account...'
                            : 'Save Bank Account ✓'}
                    </button>
                </div>
            {/if}

            <div class="relative pt-1">
                {#if ui.microBadges['dex_fiat_btn']}
                    <div
                        class="micro-confirm-badge absolute -top-4 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-lg bg-[var(--bg-elevated)] border border-[#18C6A5]/60 text-[#18C6A5] text-[9px] font-mono font-black uppercase whitespace-nowrap"
                    >
                        {ui.microBadges['dex_fiat_btn'].label}
                    </div>
                {/if}
                <button
                    type="button"
                    data-testid="fiat-generate-pass-cta"
                    onclick={initiateFiatOnramp}
                    disabled={isInitializingOnramp ||
                        onrampLivePricingUnavailable ||
                        onrampCostPlusQuote.circuitBreakerTripped}
                    class="tactile-btn w-full py-4 rounded-2xl text-white text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-40 transition-all duration-300"
                    style="
                        border-color: {activeThemeHex}65;
                        background-image: radial-gradient(ellipse at center, {activeThemeHex}28, transparent 70%);
                    "
                >
                    {#if isInitializingOnramp}
                        Purchasing {onrampTargetTicker}...
                    {:else if buyTab === 'VIP_WIRE' || onrampCostPlusQuote.requiresInstitutionalWire || onrampGatewayMethod === 'wire'}
                        Generate Institutional Wire Order (~{onrampCostPlusQuote.estimatedTokens.toLocaleString(
                            undefined,
                            {
                                maximumFractionDigits:
                                    onrampCostPlusQuote.estimatedTokens < 1
                                        ? 6
                                        : 2
                            }
                        )}
                        {onrampTargetTicker} • {i18n.formatFiat(onrampCostPlusQuote.totalGrossChargeUsd)}) →
                    {:else}
                        Buy {onrampTargetTicker} (~{onrampCostPlusQuote.estimatedTokens.toLocaleString(
                            undefined,
                            {
                                maximumFractionDigits:
                                    onrampCostPlusQuote.estimatedTokens < 1
                                        ? 6
                                        : 2
                            }
                        )}
                        {onrampTargetTicker} • Total {i18n.formatFiat(onrampCostPlusQuote.totalGrossChargeUsd)}) →
                    {/if}
                </button>
            </div>
        </div>

        {#if onrampLivePricingUnavailable}
            <div
                data-testid="fiat-onramp-live-pricing-unavailable"
                class="bg-[var(--bg-card)] border border-amber-500/45 p-3.5 rounded-xl text-center"
            >
                <span class="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-300">
                    {LIVE_PRICING_UNAVAILABLE_MESSAGE}
                </span>
            </div>
        {:else if onrampError || onrampCostPlusQuote.circuitBreakerTripped}
            <div
                data-testid="fiat-circuit-breaker-banner"
                class="bg-[var(--bg-danger-subtle)] border border-red-500/40 p-3.5 rounded-xl text-center"
            >
                <span class="text-[10px] font-mono font-bold uppercase tracking-widest text-red-400">
                    {onrampError || onrampCostPlusQuote.circuitBreakerReason}
                </span>
            </div>
        {/if}

        {#if onrampSessionData}
            {@const activePass = onrampSessionData}
            {@const passStageIdx = getPayoutStageIndex(activePass.status)}
            <div
                data-testid="fiat-settlement-pass-card"
                class="bg-[var(--bg-elevated)] border border-[#18C6A5]/45 p-4 rounded-2xl flex flex-col gap-3"
            >
                <div class="flex items-center justify-between flex-wrap gap-2 border-b border-white/10 pb-2.5">
                    <div class="flex flex-col">
                        <span class="text-[10px] font-black uppercase tracking-widest text-[#18C6A5]">
                            ✓ {activePass.status === 'COMPLETED'
                                ? `Purchase Completed (${activePass.sessionId})`
                                : `Order ${activePass.sessionId} (${activePass.status})`}
                        </span>
                        <span class="text-[9px] font-mono text-neutral-400">
                            Memo / Ref: <strong class="text-white select-all"
                                >{activePass.wireMemo ||
                                    activePass.txHash ||
                                    activePass.sessionId}</strong
                            >
                        </span>
                    </div>
                    <div class="flex items-center gap-2 flex-wrap">
                        {#if activePass.status !== 'COMPLETED'}
                            <button
                                type="button"
                                data-testid="fiat-simulate-ach-clear-btn"
                                onclick={settleActiveOnrampOrderNow}
                                disabled={isSettlingOnrampPass}
                                class="tactile-btn px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-white border-[#18C6A5] cursor-pointer"
                            >
                                {isSettlingOnrampPass
                                    ? 'Settling...'
                                    : '[Complete Settlement ✓]'}
                            </button>
                        {/if}
                        <button
                            type="button"
                            data-testid="fiat-download-wire-slip-btn"
                            onclick={() =>
                                downloadWireSlipPdf(
                                    activePass,
                                    onrampFiatAmountUsd
                                )}
                            class="tactile-btn px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer"
                        >
                            Wire PDF
                        </button>
                    </div>
                </div>
                {#if activePass.postTradeAllocation}
                    <div
                        data-testid="fiat-post-trade-sweep-card"
                        class="sr-only"
                    >
                        ${Number(
                            activePass.postTradeAllocation
                                .wholesaleApiFloatSweepUsd || 0
                        ).toFixed(2)}
                    </div>
                {/if}
                <div
                    data-testid="fiat-4stage-stepper"
                    class="grid grid-cols-4 gap-2 pt-1 text-[8px] font-mono"
                >
                    {#each [
                        { step: 1, label: '1. Verified' },
                        { step: 2, label: '2. Cleared' },
                        { step: 3, label: '3. Executed' },
                        { step: 4, label: '4. Credited' }
                    ] as st (st.step)}
                        <div class="flex flex-col gap-1">
                            <div
                                class="h-1 rounded-full {passStageIdx >= st.step
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
            </div>
        {/if}
    {:else}
        <div
            data-testid="fiat-offramp-step1-card"
            class="flex flex-col gap-3"
        >
            <div class="sr-only">
                {#each ['KAS', 'USDC', 'BTC', 'ETH', 'SOL', 'SILO'] as sellAsset}
                    <button
                        type="button"
                        data-testid="offramp-asset-pill-{sellAsset}"
                        onclick={() => (offrampAssetTicker = sellAsset)}
                    >
                        {sellAsset}
                    </button>
                {/each}
            </div>
            <div
                class="tactile-card bg-[var(--bg-elevated)] rounded-2xl p-4 md:p-5 flex flex-col gap-3 border relative transition-all duration-300"
                style="
                    border-color: {activeThemeHex}55;
                    background-image: radial-gradient(ellipse at top left, {activeThemeHex}22, transparent 68%);
                    box-shadow: inset 0 0 26px -12px {activeThemeHex}28;
                "
            >
                <div class="flex items-center justify-between flex-wrap gap-2">
                    <span
                        class="text-[10px] font-black uppercase tracking-widest transition-colors duration-300"
                        style="color: {activeThemeHex};"
                    >
                        Sell ({offrampAssetTicker})
                    </span>
                    <div class="flex items-center gap-1 flex-wrap">
                        {#each [
                            { label: '$25', val: '25' },
                            { label: '$100', val: '100' },
                            { label: '$200', val: '200' },
                            { label: '$500', val: '500' },
                            { label: '$1k', val: '1000' },
                            { label: '$2.5k+', val: '2500' }
                        ] as preset (preset.val)}
                            <button
                                type="button"
                                data-testid="offramp-preset-{preset.val}"
                                onclick={() =>
                                    (offrampTargetUsdInput = preset.val)}
                                class="tactile-btn px-2 py-0.5 rounded-md text-[9px] font-mono font-bold cursor-pointer {offrampTargetUsdInput ===
                                preset.val
                                    ? 'text-[#18C6A5] border-[#18C6A5]/45'
                                    : 'text-neutral-300 hover:text-white'}"
                            >
                                {preset.label}
                            </button>
                        {/each}
                    </div>
                </div>
                <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-1.5 flex-1 min-w-0">
                        <span class="text-2xl md:text-3xl font-bold text-neutral-500"
                            >$</span
                        >
                        <input
                            data-testid="fiat-offramp-usd-input"
                            type="number"
                            min="10"
                            bind:value={offrampTargetUsdInput}
                            class="w-full bg-transparent text-3xl md:text-4xl font-bold font-mono text-white outline-none tabular-nums"
                        />
                    </div>
                    <button
                        type="button"
                        onclick={() =>
                            (isOfframpDropdownOpen = !isOfframpDropdownOpen)}
                        class="tactile-btn shrink-0 flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-[var(--bg-card)] cursor-pointer transition-all duration-300"
                        style="border-color: {activeThemeHex}60;"
                    >
                        <div
                            class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black overflow-hidden shrink-0"
                            style="background-color: {activeThemeHex}22; color: {activeThemeHex}; border: 1px solid {activeThemeHex}60;"
                        >
                            {#if offrampAssetObj.imgUrl}
                                <img
                                    src={offrampAssetObj.imgUrl}
                                    alt={offrampAssetObj.ticker}
                                    class="w-4 h-4 object-contain"
                                    onerror={handleTokenIconError}
                                />
                                <span
                                    style="display:none;"
                                    class="w-full h-full items-center justify-center"
                                >
                                    {offrampAssetObj.ticker[0]}
                                </span>
                            {:else}
                                <span>{offrampAssetObj.ticker[0]}</span>
                            {/if}
                        </div>
                        <div class="flex flex-col items-start leading-tight">
                            <span class="text-xs font-black text-white tracking-wider uppercase">
                                {offrampAssetObj.ticker}
                            </span>
                            <span
                                class="text-[9px] font-mono font-bold"
                                style="color: {activeThemeHex};"
                            >
                                {formatSpotDisplay(offrampTargetSpotUsd)}
                            </span>
                        </div>
                        <span class="text-[10px] text-neutral-400 ml-0.5"
                            >▾</span
                        >
                    </button>
                </div>
                <div class="flex items-center justify-between text-[10px] font-mono text-neutral-500 pt-0.5">
                    <span>
                        ≈ {Number(otcCryptoAmountInput || 0).toFixed(4)}
                        {offrampAssetTicker}
                    </span>
                    <button
                        type="button"
                        onclick={() => {
                            if (
                                offrampAvailableSourceBalance > 0 &&
                                offrampTargetSpotUsd > 0
                            ) {
                                otcCryptoAmountInput =
                                    offrampAvailableSourceBalance.toFixed(4);
                                offrampTargetUsdInput = (
                                    offrampAvailableSourceBalance *
                                    offrampTargetSpotUsd
                                ).toFixed(2);
                            }
                        }}
                        class="hover:underline uppercase cursor-pointer"
                        style="color: {activeThemeHex};"
                    >
                        Available: {offrampAvailableSourceBalance.toFixed(2)} MAX
                    </button>
                </div>
                {#if isOfframpDropdownOpen}
                    <div
                        class="absolute top-full right-0 mt-2 w-72 bg-[var(--bg-card)] border border-white/20 rounded-2xl shadow-2xl p-2.5 z-50 flex flex-col gap-1.5 max-h-64 overflow-y-auto"
                    >
                        <input
                            type="text"
                            value={targetSearchQuery}
                            oninput={(e) =>
                                handleTokenSearchInput(
                                    (e.currentTarget as HTMLInputElement).value
                                )}
                            placeholder="Search ticker or paste contract..."
                            class="w-full bg-[var(--bg-elevated)] border border-white/10 rounded-xl px-3 py-2 text-[10px] text-white outline-none"
                        />
                        {#each filteredOnrampAssets as assetItem (assetItem.ticker)}
                            {@const itemHex = assetItem.theme?.hex || '#18C6A5'}
                            <button
                                type="button"
                                onclick={() => {
                                    offrampAssetTicker = assetItem.ticker;
                                    isOfframpDropdownOpen = false;
                                }}
                                class="w-full text-left px-2.5 py-2 rounded-xl hover:bg-[var(--bg-hover)] flex items-center justify-between text-[10px] cursor-pointer"
                            >
                                <div class="flex items-center gap-2 min-w-0">
                                    <span
                                        class="w-2 h-2 rounded-full shrink-0"
                                        style="background-color: {itemHex};"
                                    ></span>
                                    <span class="font-bold text-white truncate">
                                        {assetItem.ticker} — {assetItem.name}
                                    </span>
                                </div>
                                <span
                                    class="font-bold shrink-0 ml-2"
                                    style="color: {itemHex};"
                                >
                                    {assetItem.spotPrice > 0
                                        ? formatSpotDisplay(assetItem.spotPrice)
                                        : 'LIVE'}
                                </span>
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
            <div class="flex items-center justify-center -my-4 z-20 pointer-events-none">
                <div
                    class="w-9 h-9 rounded-xl bg-[var(--bg-card)] border border-[#18C6A5]/50 text-[#18C6A5] flex items-center justify-center text-xs font-black shadow-xl"
                >
                    ↓
                </div>
            </div>
            <div
                class="tactile-card bg-[var(--bg-elevated)] rounded-2xl p-4 md:p-5 flex flex-col gap-3 border border-[#18C6A5]/45"
                style="background-image: radial-gradient(ellipse at bottom right, rgba(24, 198, 165, 0.14), transparent 65%);"
            >
                <div class="flex items-center justify-between">
                    <span class="text-[10px] font-black uppercase tracking-widest text-[#18C6A5]">
                        You Receive (USD)
                    </span>
                    <span
                        data-testid="fiat-offramp-fee-breakdown"
                        class="text-[9px] font-mono text-neutral-400"
                    >
                        Fee: ${offrampCostPlusQuote.feeUsd.toFixed(2)} ({offrampCostPlusQuote.effectiveFeePct.toFixed(
                            2
                        )}% )
                    </span>
                </div>
                <div class="flex items-center justify-between gap-3">
                    <span
                        data-testid="fiat-offramp-net-payout"
                        class="text-3xl md:text-4xl font-bold font-mono text-[#18C6A5] tabular-nums"
                    >
                        ${offrampCostPlusQuote.guestNetUsd.toFixed(2)} USD
                    </span>
                    <span class="px-3 py-1.5 rounded-xl bg-[var(--bg-card)] border border-[#18C6A5]/35 text-[9px] font-mono font-bold text-[#18C6A5] uppercase">
                        {payoutMethod.toUpperCase()}
                    </span>
                </div>
                <div
                    data-testid="fiat-offramp-savings-badge"
                    class="bg-[var(--bg-card)] border border-[#18C6A5]/35 rounded-xl px-3 py-2 flex items-center justify-between text-[9px] font-mono"
                >
                    
                    
                </div>
            </div>
        </div>
        <div
            data-testid="fiat-offramp-step2-card"
            class="bg-[var(--bg-elevated)] border border-white/10 rounded-2xl p-4 flex flex-col gap-3"
        >
            <div class="grid grid-cols-2 gap-1.5 bg-[var(--bg-card)] p-1 rounded-xl border border-white/5">
                <button
                    type="button"
                    onclick={() => (offrampSourceMode = 'onchain_kas')}
                    class="py-2 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider cursor-pointer transition-all {offrampSourceMode ===
                    'onchain_kas'
                        ? 'bg-[var(--bg-hover)] text-white border border-white/15'
                        : 'text-neutral-400 hover:text-white'}"
                >
                    Self-Custody Wallet ({treasury
                        .getAsset(offrampAssetTicker)
                        .onChain.toFixed(2)})
                </button>
                <button
                    type="button"
                    onclick={() => (offrampSourceMode = 'direct_wholesale_deposit')}
                    class="py-2 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider cursor-pointer transition-all {offrampSourceMode ===
                    'direct_wholesale_deposit'
                        ? 'bg-[var(--bg-hover)] text-white border border-white/15'
                        : 'text-neutral-400 hover:text-white'}"
                >
                    External Wallet Deposit
                </button>
            </div>
            <div class="flex items-center justify-between flex-wrap gap-2 px-0.5 text-[9px]">
                <div class="flex items-center gap-1.5">
                    <button
                        type="button"
                        data-testid="offramp-card-free-ach"
                        onclick={() => (payoutMethod = 'ach')}
                        class="px-2.5 py-1 rounded-lg font-bold uppercase border cursor-pointer transition-colors {payoutMethod ===
                        'ach'
                            ? 'bg-[var(--bg-hover)] text-[#18C6A5] border-[#18C6A5]/40'
                            : 'bg-[var(--bg-card)] text-neutral-400 border-white/10 hover:text-white'}"
                    >
                        Bank
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
                        class="px-2.5 py-1 rounded-lg font-bold uppercase border cursor-pointer transition-colors {payoutMethod ===
                        'wire'
                            ? 'bg-[var(--bg-hover)] text-[#18C6A5] border-[#18C6A5]/40'
                            : 'bg-[var(--bg-card)] text-neutral-400 border-white/10 hover:text-white'}"
                    >
                        Wire
                    </button>
                </div>
                {#if savedBankLast4}
                    <button
                        type="button"
                        data-testid="edit-bank-rail-btn"
                        onclick={() =>
                            (isEditingBankRail = !isEditingBankRail)}
                        class="font-bold text-[#18C6A5] hover:underline uppercase cursor-pointer"
                    >
                        {isEditingBankRail
                            ? '[Close Bank ✕]'
                            : `✓ Bank *${savedBankLast4} [Change]`}
                    </button>
                {/if}
            </div>
            {#if !savedBankLast4 || isEditingBankRail}
                <div class="bg-[var(--bg-card)] border border-white/10 rounded-xl p-3 flex flex-col gap-2.5">
                    <div class="flex items-center justify-between">
                        <span class="text-[9px] font-bold uppercase text-neutral-300">
                            Payout Bank Account
                        </span>
                        
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div class="flex flex-col gap-1">
                            <label
                                for="offrampRouting"
                                class="text-[8px] font-bold uppercase text-neutral-400"
                            >
                                Routing Number
                            </label>
                            <input
                                id="offrampRouting"
                                data-testid="offramp-aba-input"
                                type="text"
                                maxlength="9"
                                bind:value={offrampRoutingNumber}
                                placeholder="111000614"
                                class="w-full bg-[var(--bg-elevated)] border {abaTelemetry.isComplete ? (abaTelemetry.checksumValid ? 'border-[#18C6A5]/60' : 'border-red-500/60') : 'border-white/10'} rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
                            />
                            {#if abaTelemetry.cleanDigits.length > 0}
                                <div
                                    data-testid="aba-recognition-badge"
                                    class="px-2 py-1 rounded border text-[8px] font-mono font-bold flex items-center justify-between {abaTelemetry.isComplete && abaTelemetry.checksumValid ? 'bg-[var(--bg-elevated)] border-[#18C6A5]/45 text-[#18C6A5]' : abaTelemetry.isComplete ? 'bg-[var(--bg-danger-subtle)] border-red-500/45 text-red-400' : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)]'}"
                                >
                                    {#if abaTelemetry.isComplete && abaTelemetry.checksumValid}
                                        <span>✓ {abaTelemetry.institutionName}</span>
                                        
                                    {:else if abaTelemetry.isComplete}
                                        <span>✕ Invalid Routing Number</span>
                                        
                                    {:else}
                                        <span
                                            >{abaTelemetry.cleanDigits.length}/9
                                            digits</span
                                        >
                                    {/if}
                                </div>
                            {/if}
                        </div>
                        <div class="flex flex-col gap-1">
                            <label
                                for="offrampAccount"
                                class="text-[8px] font-bold uppercase text-neutral-400"
                            >
                                Account Number
                            </label>
                            <input
                                id="offrampAccount"
                                data-testid="offramp-account-input"
                                type="password"
                                bind:value={offrampAccountNumber}
                                placeholder="Account Number"
                                class="w-full bg-[var(--bg-elevated)] border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
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
                        class="tactile-btn w-full py-2 rounded-lg text-[9px] font-black uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer disabled:opacity-40"
                    >
                        {isSavingBankRail
                            ? 'Saving Bank Account...'
                            : 'Save Bank Account ✓'}
                    </button>
                </div>
            {/if}
            {#if offrampLivePricingUnavailable || onrampLivePricingUnavailable}
                <div
                    data-testid="fiat-live-pricing-unavailable"
                    class="bg-[var(--bg-card)] border border-amber-500/45 p-3 rounded-xl text-center"
                >
                    <span class="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-300">
                        {LIVE_PRICING_UNAVAILABLE_MESSAGE}
                    </span>
                </div>
            {:else if offrampError || offrampCostPlusQuote.circuitBreakerTripped}
                <div class="bg-[var(--bg-danger-subtle)] border border-red-500/40 p-3 rounded-xl text-center">
                    <span class="text-[10px] font-mono font-bold uppercase tracking-widest text-red-400">
                        {offrampError ||
                            offrampCostPlusQuote.circuitBreakerReason}
                    </span>
                </div>
            {/if}
            {#if offrampSuccessBanner}
                <div class="bg-[var(--bg-card)] border border-[#18C6A5]/45 p-3 rounded-xl text-center">
                    <span class="text-[10px] font-mono font-bold uppercase tracking-widest text-[#18C6A5]">
                        {offrampSuccessBanner}
                    </span>
                </div>
            {/if}
            <button
                type="button"
                data-testid="fiat-offramp-generate-pass-cta"
                onclick={generateOfframpSettlementPass}
                disabled={isExecuting ||
                    offrampLivePricingUnavailable ||
                    offrampCostPlusQuote.circuitBreakerTripped}
                class="tactile-btn w-full py-4 rounded-2xl text-white text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-40 transition-all duration-300"
                style="
                    border-color: {activeThemeHex}65;
                    background-image: radial-gradient(ellipse at center, {activeThemeHex}28, transparent 70%);
                "
            >
                Sell {Number(otcCryptoAmountInput || 0).toFixed(4)}
                {offrampAssetTicker} → ${offrampCostPlusQuote.guestNetUsd.toFixed(
                    2
                )} USD ({payoutMethod.toUpperCase()}) →
            </button>
        </div>
        {#if activeOfframpPass}
            {@const pass = activeOfframpPass}
            {@const stageIdx = getPayoutStageIndex(pass.status)}
            <div
                data-testid="fiat-offramp-settlement-pass-card"
                class="bg-[var(--bg-elevated)] border border-[#18C6A5]/45 p-4 rounded-2xl flex flex-col gap-3"
            >
                <div class="flex items-center justify-between flex-wrap gap-2 border-b border-white/10 pb-2.5">
                    <div class="flex flex-col">
                        <span class="text-[10px] font-black uppercase tracking-widest text-[#18C6A5]">
                            ✓ Payout Order ({pass.payoutId} • {pass.status})
                        </span>
                        <span class="text-[9px] font-mono text-neutral-400">
                            Net Payout: <strong class="text-white"
                                >${Number(pass.netFiatUsd).toFixed(2)} USD</strong
                            >
                        </span>
                    </div>
                    <div class="flex items-center gap-2 flex-wrap">
                        {#if offrampSourceMode === 'onchain_kas' && pass.status === 'AWAITING_ONCHAIN_CONFIRMATIONS'}
                            <button
                                type="button"
                                onclick={signAndBroadcastOfframpFromWallet}
                                class="tactile-btn px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-white border-[#18C6A5] cursor-pointer"
                            >
                                Send {Number(
                                    pass.amountCrypto || 0
                                ).toFixed(2)}
                                {pass.sourceAsset} 
                            </button>
                        {/if}
                        <button
                            type="button"
                            data-testid="fiat-simulate-offramp-confirm-btn"
                            onclick={simulateOfframpConfirmNow}
                            class="tactile-btn px-2.5 py-1.5 rounded-lg text-[8px] font-bold uppercase text-neutral-300 hover:text-white cursor-pointer"
                        >
                            Verify
                        </button>
                        <button
                            type="button"
                            data-testid="fiat-offramp-download-pdf-btn"
                            onclick={() => downloadAchPayoutReceiptPdf(pass)}
                            class="tactile-btn px-3 py-1.5 rounded-lg text-[9px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer"
                        >
                            Receipt PDF
                        </button>
                    </div>
                </div>
                <div class="bg-[var(--bg-card)] border border-white/10 rounded-xl p-3 flex items-center justify-between gap-3">
                    <div class="flex flex-col gap-1 min-w-0 flex-1">
                        <span class="text-[8px] font-bold uppercase text-neutral-400">
                            Deposit Address ({pass.sourceAsset})
                        </span>
                        <span
                            data-testid="offramp-direct-deposit-address"
                            class="text-[10px] font-mono font-bold text-[#18C6A5] break-all select-all"
                        >
                            {pass.depositAddress}
                        </span>
                    </div>
                    {#if offrampDepositQrDataUrl}
                        <img
                            src={offrampDepositQrDataUrl}
                            alt="Deposit QR"
                            class="w-16 h-16 rounded-lg bg-white p-1 shrink-0"
                        />
                    {/if}
                </div>
                <div
                    data-testid="fiat-offramp-4stage-stepper"
                    class="grid grid-cols-4 gap-2 pt-1 text-[8px] font-mono"
                >
                    {#each [
                        { step: 1, label: '1. Order Created' },
                        { step: 2, label: '2. Pool Liquidity Cleared' },
                        { step: 3, label: '3. USD Queued' },
                        {
                            step: 4,
                            label: pass.traceId
                                ? `4. Dispatched (${pass.traceId.slice(0, 8)})`
                                : '4. Bank Dispatched'
                        }
                    ] as st (st.step)}
                        <div class="flex flex-col gap-1">
                            <div
                                class="h-1 rounded-full {stageIdx >= st.step
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
    {/if}

    {#if recentOfframpPayouts.length > 0}
        <div class="border-t border-white/10 pt-3 flex flex-col gap-2">
            <div class="flex items-center justify-between">
                <span class="text-[9px] font-black uppercase tracking-widest text-neutral-400">
                    Orders
                </span>
                <button
                    type="button"
                    onclick={checkFiatGatewayStatus}
                    class="text-[8px] font-mono text-neutral-400 hover:text-white cursor-pointer"
                >
                    Refresh ↻
                </button>
            </div>
            <div class="flex flex-col gap-2 max-h-[200px] overflow-y-auto hide-scrollbar">
                {#each recentOfframpPayouts as p (p.payout_id)}
                    {@const stageIdx = getPayoutStageIndex(p.status)}
                    <div class="bg-[var(--bg-elevated)] border border-white/10 rounded-xl p-3 flex flex-col gap-2 text-[10px]">
                        <div class="flex items-center justify-between gap-2">
                            <span class="font-bold text-white">
                                {Number(p.amount_crypto || 0).toFixed(2)}
                                {p.source_asset} → *{p.bank_last4}
                            </span>
                            <div class="flex items-center gap-2">
                                <button
                                    type="button"
                                    onclick={() =>
                                        downloadAchPayoutReceiptPdf(p)}
                                    class="tactile-btn px-2 py-0.5 rounded text-[8px] font-bold uppercase text-neutral-300 hover:text-white cursor-pointer"
                                >
                                    PDF
                                </button>
                                <span class="font-bold text-[#18C6A5]">
                                    +${Number(p.net_fiat_usd || 0).toFixed(2)}
                                </span>
                            </div>
                        </div>
                        <div class="grid grid-cols-4 gap-1.5 pt-1 border-t border-white/5 text-[8px] font-mono">
                            {#each [
                                { step: 1, label: '1. Order Created' },
                                { step: 2, label: '2. Pool Liquidity Cleared' },
                                { step: 3, label: '3. USD Queued' },
                                { step: 4, label: '4. Bank Dispatched' }
                            ] as st}
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