<script lang="ts">
    import '../app.css';
    import { source } from 'sveltekit-sse';
    import { fade, slide } from 'svelte/transition';
    import { onMount, onDestroy, untrack } from 'svelte';
    import { browser } from '$app/environment';
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { operations } from '$lib/stores/operations.svelte';
    import {
        treasury,
        DEFAULT_ECOSYSTEM_TICKER
    } from '$lib/stores/treasury.svelte';
    import { settingsStore } from '$lib/stores/settings.svelte';
    import { i18n } from '$lib/stores/i18n.svelte';
    import type { Worker } from '$lib/stores/type';
    import {
        evaluateAbaRoutingNumber,
        downloadWireSlipPdf,
        computeOnrampCostPlusQuote,
        MERCURY_COLUMN_WIRE_INSTRUCTIONS,
        type SavedBankRailMeta,
        type OnrampGatewayMethod
    } from '$lib/components/dex/dexHelpers';
    import EntryView from '$lib/views/EntryView.svelte';
    import WalletModal from '$lib/components/WalletModal.svelte';
    import SettingsModal from '$lib/components/SettingsModal.svelte';
    import TutorialOverlay from '$lib/components/TutorialOverlay.svelte';
import { pwa } from '$lib/stores/pwa.svelte';
import InstallAppModal from '$lib/components/InstallAppModal.svelte';
import MobileBottomDock from '$lib/components/MobileBottomDock.svelte';

    let { children } = $props();
    const BACKEND_BASE = '';
    let hasEntered = $state(false);
    let headerPillShimmer = $state(false);

    // Master Treasury Header Accounting (Earned Fee Revenue vs. Custodial Miner Block Rewards)
    let adminTreasuryAccounting = $state<{
        blocksWonCount: number;
        totalBlocksRewardKas: number;
        earnedPoolFeeKas: number;
        earnedPoolFeeUsd: number;
        totalEarnedRevenueUsd: number;
        custodialMinerLiabilityKas: number;
        custodialMinerLiabilityUsd: number;
    } | null>(null);

    // Global In-Context Fiat Modal State
    let globalFiatUsdInput = $state('650');
    let globalFiatGatewayMethod = $state<OnrampGatewayMethod>('ach');
    let lastGlobalAchBucket = $state<'below625' | 'above625' | 'wire100k'>(
        'above625'
    );
    let globalWholesaleFloorActive = $state(false);
    let globalFiatPaymentRail = $state<
        | 'SOVEREIGN_WIRE_ACH'
        | 'CARD_INSTANT'
        | 'STRIPE_CRYPTO_ONRAMP'
        | 'BRIDGE_VIRTUAL_ACCOUNT_WIRE'
    >('SOVEREIGN_WIRE_ACH');
    let globalFiatDeliveryMode = $state<
        'LEDGER_KAS' | 'L1_KAS' | 'AUTO_STAKE_SILO'
    >('L1_KAS');
    let globalAssetSearch = $state('');
    let showGlobalAssetDropdown = $state(false);
    let isDiscoveringGlobalAsset = $state(false);
    let globalDiscoveryNotice = $state<string | null>(null);
    let globalDiscoverTimer: ReturnType<typeof setTimeout>;
    let isSubmittingGlobalFiat = $state(false);
    let isSettlingGlobalFiat = $state(false);
    let globalFiatError = $state<string | null>(null);
    let globalFiatSuccessOrder = $state<any | null>(null);

    // Inline AES-256-GCM Bank Rail State inside Global Modal
    let savedBankLast4 = $state<string | null>(null);
    let savedBankRailMeta = $state<SavedBankRailMeta | null>(null);
    let showInlineBankSetup = $state(false);
    let inlineBankLabel = $state('Primary Operating Account');
    let inlineAccountType = $state<'CHECKING' | 'SAVINGS'>('CHECKING');
    let inlinePayoutMethod = $state<'ach' | 'wire'>('ach');
    let inlineRoutingNumber = $state('');
    let inlineAccountNumber = $state('');
    let isSavingInlineBankRail = $state(false);
    let inlineBankBanner = $state<string | null>(null);

    let inlineAbaTelemetry = $derived(
        evaluateAbaRoutingNumber(inlineRoutingNumber)
    );

    // Auto-default orders >= $625 to ACH ($5 cap) and hard-gate $100,000+ to Institutional Wire
    $effect(() => {
        const parsedUsd = Math.max(0, parseFloat(globalFiatUsdInput) || 0);
        if (parsedUsd >= 100_000) {
            if (lastGlobalAchBucket !== 'wire100k') {
                lastGlobalAchBucket = 'wire100k';
            }
            if (globalFiatGatewayMethod !== 'wire') {
                globalFiatGatewayMethod = 'wire';
            }
            if (globalFiatPaymentRail !== 'BRIDGE_VIRTUAL_ACCOUNT_WIRE') {
                globalFiatPaymentRail = 'BRIDGE_VIRTUAL_ACCOUNT_WIRE';
            }
        } else if (parsedUsd >= 625) {
            if (lastGlobalAchBucket !== 'above625') {
                lastGlobalAchBucket = 'above625';
                globalFiatGatewayMethod = 'ach';
                globalFiatPaymentRail = 'SOVEREIGN_WIRE_ACH';
            }
        } else {
            if (lastGlobalAchBucket !== 'below625') {
                lastGlobalAchBucket = 'below625';
                if (globalFiatGatewayMethod === 'wire') {
                    globalFiatGatewayMethod = 'ach';
                    globalFiatPaymentRail = 'SOVEREIGN_WIRE_ACH';
                }
            }
        }
    });

    $effect(() => {
        if (
            inlineAbaTelemetry.isComplete &&
            inlineAbaTelemetry.checksumValid &&
            inlineAbaTelemetry.institutionName &&
            (inlineBankLabel === 'Primary Operating Account' ||
                !inlineBankLabel.trim())
        ) {
            inlineBankLabel = inlineAbaTelemetry.institutionName;
        }
    });

    let wasFiatModalOpen = false;
    $effect(() => {
        const isOpen = ui.showFiatModal;
        if (isOpen && !wasFiatModalOpen) {
            wasFiatModalOpen = true;
            untrack(() => {
                const defaultUsd =
                    ui.fiatModalDefaultUsd ||
                    (ui as any).fiatModalDefaultAmountUsd ||
                    '650';
                globalFiatUsdInput = String(defaultUsd);
                const targetTick =
                    ui.fiatModalTargetTicker ||
                    (ui as any).fiatModalTargetAsset ||
                    'KAS';
                if (ui.fiatModalTargetTicker !== targetTick) {
                    ui.fiatModalTargetTicker = String(targetTick).toUpperCase();
                }
                globalFiatError = null;
                globalFiatSuccessOrder = null;
                showGlobalAssetDropdown = false;
                if (
                    ui.fiatModalTargetTicker === DEFAULT_ECOSYSTEM_TICKER &&
                    ui.fiatModalAutoStakeSilo
                ) {
                    globalFiatDeliveryMode = 'AUTO_STAKE_SILO';
                } else if (globalFiatDeliveryMode === 'AUTO_STAKE_SILO') {
                    globalFiatDeliveryMode = 'L1_KAS';
                }
                checkGlobalBankRailStatus();
            });
        } else if (!isOpen && wasFiatModalOpen) {
            wasFiatModalOpen = false;
            showGlobalAssetDropdown = false;
        }
    });

    let selectedGlobalTargetAsset = $derived(
        treasury.getAsset(ui.fiatModalTargetTicker || 'KAS')
    );
    let targetAssetHex = $derived(
        selectedGlobalTargetAsset.theme?.hex || '#18C6A5'
    );
    let globalTargetSpotUsd = $derived.by(() => {
        const t = selectedGlobalTargetAsset;
        if (
            t.ticker === 'USD' ||
            t.ticker === 'USDC' ||
            t.ticker === 'USDT'
        ) {
            return 1.0;
        }
        if (t.spotPrice > 0) return t.spotPrice;
        const kasSpot = treasury.getAsset('KAS').spotPrice || 0;
        if (t.ticker === DEFAULT_ECOSYSTEM_TICKER && kasSpot > 0) {
            return Number((kasSpot / 23.809524).toFixed(6));
        }
        return 0;
    });

    let globalCostPlusPreview = $derived(
        computeOnrampCostPlusQuote({
            assetTicker: selectedGlobalTargetAsset.ticker,
            grossUsd: Math.max(0, parseFloat(globalFiatUsdInput) || 0),
            spotPriceUsd: globalTargetSpotUsd,
            autoStakeSilo:
                ui.fiatModalAutoStakeSilo ||
                globalFiatDeliveryMode === 'AUTO_STAKE_SILO',
            bundledKasOrSilo:
                ui.fiatModalAutoStakeSilo ||
                globalFiatDeliveryMode === 'AUTO_STAKE_SILO',
            wholesaleFloorActive: globalWholesaleFloorActive,
            paymentMethod: globalFiatGatewayMethod
        })
    );

    let globalWireMemoPreview = $derived(
        globalFiatSuccessOrder?.wireMemo ||
            `PERENNIA-${(identity.activeAddress || 'VAULT')
                .replace(/[^a-zA-Z0-9]/g, '')
                .slice(-6)
                .toUpperCase()}`
    );

    let selectableGlobalAssets = $derived(
        treasury.registry.filter((a) => {
            if (a.ticker === 'USD') return false;
            const q = globalAssetSearch.trim().toLowerCase();
            if (!q) return true;
            return (
                a.ticker.toLowerCase().includes(q) ||
                a.name.toLowerCase().includes(q) ||
                a.assetClass.toLowerCase().includes(q) ||
                (a.contract && a.contract.toLowerCase().includes(q))
            );
        })
    );

    function formatGlobalSpotDisplay(price: number): string {
        if (!Number.isFinite(price) || price <= 0) {
            return i18n.formatFiat(0, { decimals: 2 });
        }
        return i18n.formatFiat(price, { adaptiveSmallPrice: true });
    }

    function handleModalIconError(e: Event) {
        const target = e.currentTarget as HTMLImageElement;
        target.style.display = 'none';
        if (target.nextElementSibling) {
            (target.nextElementSibling as HTMLElement).style.display = 'flex';
        }
    }

    function handleGlobalAssetSearchInput(raw: string) {
        globalAssetSearch = raw;
        globalDiscoveryNotice = null;
        clearTimeout(globalDiscoverTimer);
        const trimmed = raw.trim();
        if (trimmed.length < 2) return;
        globalDiscoverTimer = setTimeout(async () => {
            isDiscoveringGlobalAsset = true;
            try {
                if (
                    typeof (treasury as any).discoverAndRegisterToken ===
                    'function'
                ) {
                    const res = await (
                        treasury as any
                    ).discoverAndRegisterToken(trimmed, true);
                    if (res?.primary) {
                        globalDiscoveryNotice = `✓ Discovered ${res.primary.ticker} (${res.primary.network}) @ ${formatGlobalSpotDisplay(res.primary.spotPrice)}`;
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
                        globalDiscoveryNotice = `✓ Discovered ${a.ticker} (${a.network}) @ ${formatGlobalSpotDisplay(Number(a.spotPrice || 0))}`;
                    }
                }
            } catch {
                // Ignore discovery timeout
            } finally {
                isDiscoveringGlobalAsset = false;
            }
        }, 260);
    }

    $effect(() => {
        if (ui.activeTab === 'treasury') {
            ui.activeTab = 'TREASURY';
        }
        if (ui.activeTab === 'FORGE' && !identity.canAccessForge) {
            ui.activeTab = 'OPERATIONS';
        }
    });

    function enterNexus() {
        hasEntered = true;
        ui.hasEntered = true;
        ui.activeTab = 'OPERATIONS';
        ui.showWalletModal = true;
    }

    function resolveAutoStratumUrl(hashrateTh: number): string {
        if (hashrateTh > 10.0) {
            return 'stratum+tcp://pool.perennia.io:3334';
        }
        if (hashrateTh >= 1.0) {
            return 'stratum+tcp://pool.perennia.io:3333';
        }
        return 'stratum+tcp://pool.perennia.io:3332';
    }

    let isLoaded = $state(false);
    let isServerReachable = $state(true);
    let appAwakened = $derived(identity.isWalletConnected && isLoaded);

    const resolveTargetWallet = () =>
        identity.isCorporateAdmin && ui.adminModeActive && ui.adminTargetWallet
            ? ui.adminTargetWallet
            : identity.activeAddress;

    function copyHeaderWalletAddress() {
        if (identity.activeAddress && browser && navigator.clipboard) {
            navigator.clipboard.writeText(identity.activeAddress);
            headerPillShimmer = true;
            ui.triggerMicroBadge(
                'header_wallet_pill',
                i18n.t('header.copied'),
                '#18C6A5'
            );
            setTimeout(() => {
                headerPillShimmer = false;
            }, 650);
        }
    }

    function fillTestBankCredentials() {
        inlineRoutingNumber = '110000000';
        inlineAccountNumber = '000123456789';
        inlineBankLabel = 'Stripe Test Bank (ACH Direct Debit)';
        inlineAccountType = 'CHECKING';
        globalFiatError = null;
    }

    async function checkGlobalBankRailStatus() {
        if (!browser || !identity.isWalletConnected) return;
        try {
            const [offRes, onRes] = await Promise.all([
                fetch('/api/fiat/offramp').catch(() => null),
                fetch('/api/fiat/onramp').catch(() => null)
            ]);
            if (offRes && offRes.ok) {
                const data = await offRes.json();
                savedBankLast4 = data.savedBankRailLast4 || null;
                if (!savedBankLast4) {
                    showInlineBankSetup = true;
                }
                if (typeof data.spotPrice === 'number' && data.spotPrice > 0) {
                    treasury.updateAsset('KAS', { spotPrice: data.spotPrice });
                }
                if (data.savedBankRail) {
                    savedBankRailMeta = data.savedBankRail;
                    inlineBankLabel =
                        data.savedBankRail.bankLabel ||
                        'Primary Operating Account';
                    inlineAccountType =
                        data.savedBankRail.accountType === 'SAVINGS'
                            ? 'SAVINGS'
                            : 'CHECKING';
                    inlinePayoutMethod =
                        data.savedBankRail.payoutMethod === 'WIRE'
                            ? 'wire'
                            : 'ach';
                }
            }
            if (onRes && onRes.ok) {
                const onData = await onRes.json();
                if (typeof onData.wholesaleFloorActive === 'boolean') {
                    globalWholesaleFloorActive = onData.wholesaleFloorActive;
                }
            }
        } catch {
            // Ignore transient status error
        }
    }

    async function saveInlineBankRail() {
        globalFiatError = null;
        inlineBankBanner = null;
        const cleanRouting = inlineRoutingNumber.replace(/\D/g, '').trim();
        const cleanAccount = inlineAccountNumber.replace(/\D/g, '').trim();
        if (cleanRouting.length !== 9 || cleanAccount.length < 4) {
            globalFiatError =
                'Enter a valid 9-digit ABA Routing Number and Bank Account Number (minimum 4 digits).';
            return;
        }
        if (!inlineAbaTelemetry.checksumValid) {
            globalFiatError =
                'ABA_CHECKSUM_INVALID: The 9-digit routing number failed the Federal Reserve Mod-10 checksum test.';
            return;
        }
        isSavingInlineBankRail = true;
        try {
            const resolvedLabel =
                inlineBankLabel.trim() ||
                inlineAbaTelemetry.institutionName ||
                'Primary Operating Account';
            const res = await fetch('/api/fiat/offramp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'SAVE_BANK_RAIL',
                    wallet: identity.activeAddress,
                    bankLabel: resolvedLabel,
                    accountType: inlineAccountType,
                    payoutMethod: inlinePayoutMethod,
                    routingNumber: cleanRouting,
                    accountNumber: cleanAccount
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                globalFiatError =
                    data.error || 'Failed to save encrypted bank rail.';
                return;
            }
            savedBankLast4 = data.savedBankRailLast4 || cleanAccount.slice(-4);
            if (data.savedBankRail) {
                savedBankRailMeta = data.savedBankRail;
            }
            inlineRoutingNumber = '';
            inlineAccountNumber = '';
            showInlineBankSetup = false;
            inlineBankBanner = `Bank Account Linked (${resolvedLabel} • *${savedBankLast4})`;
            ui.triggerMicroBadge(
                'global_fiat_btn',
                `BANK *${savedBankLast4} LINKED ✓`,
                '#18C6A5'
            );
        } catch (err: any) {
            globalFiatError =
                err.message || 'Failed to save encrypted bank rail.';
        } finally {
            isSavingInlineBankRail = false;
        }
    }

    async function executeGlobalFiatPurchase() {
        if (!identity.activeAddress) {
            ui.closeFiatModal();
            ui.showWalletModal = true;
            return;
        }
        const usdAmt = parseFloat(globalFiatUsdInput);
        if (isNaN(usdAmt) || usdAmt < 10) {
            globalFiatError = 'Minimum purchase amount is $10.00 USD.';
            return;
        }
        if (globalCostPlusPreview.circuitBreakerTripped) {
            globalFiatError =
                globalCostPlusPreview.circuitBreakerReason ||
                'Live oracle price feed is offline; failing closed.';
            return;
        }
        const isBridgePushWire =
            globalFiatGatewayMethod === 'wire' ||
            globalCostPlusPreview.requiresInstitutionalWire ||
            globalFiatPaymentRail === 'BRIDGE_VIRTUAL_ACCOUNT_WIRE';
        const isCardMethod =
            globalFiatGatewayMethod === 'card' && !isBridgePushWire;
        const cleanInlineRouting = inlineRoutingNumber
            .replace(/\D/g, '')
            .trim();
        const cleanInlineAccount = inlineAccountNumber
            .replace(/\D/g, '')
            .trim();
        const hasTypedBankCredentials =
            cleanInlineRouting.length > 0 || cleanInlineAccount.length > 0;
        if (hasTypedBankCredentials && !isCardMethod && !isBridgePushWire) {
            if (
                cleanInlineRouting.length !== 9 ||
                cleanInlineAccount.length < 4
            ) {
                globalFiatError =
                    'Please enter a complete 9-digit ABA Routing Number and Bank Account Number (minimum 4 digits).';
                return;
            }
            if (!inlineAbaTelemetry.checksumValid) {
                globalFiatError =
                    'ABA_CHECKSUM_INVALID: The 9-digit routing number failed the Federal Reserve Mod-10 checksum test.';
                return;
            }
        } else if (
            !savedBankLast4 &&
            !isBridgePushWire &&
            !isCardMethod &&
            globalFiatPaymentRail !== 'STRIPE_CRYPTO_ONRAMP'
        ) {
            showInlineBankSetup = true;
            globalFiatError =
                'Enter your 9-digit ABA Routing Number and Bank Account Number below to purchase via ACH, or select Card / Wire.';
            return;
        }
        isSubmittingGlobalFiat = true;
        globalFiatError = null;
        globalFiatSuccessOrder = null;
        const targetTicker = (ui.fiatModalTargetTicker || 'KAS').toUpperCase();
        const isAutoStakeSilo =
            targetTicker === DEFAULT_ECOSYSTEM_TICKER &&
            (ui.fiatModalAutoStakeSilo ||
                globalFiatDeliveryMode === 'AUTO_STAKE_SILO');
        const resolvedLabel =
            inlineBankLabel.trim() ||
            inlineAbaTelemetry.institutionName ||
            savedBankRailMeta?.bankLabel ||
            'Primary Operating Account';
        try {
            const payload: Record<string, any> = {
                walletAddress: identity.activeAddress,
                evmAddress: identity.sovereignKeys?.ethereum?.address,
                solAddress: identity.sovereignKeys?.solana?.address,
                fiatAmountUsd: usdAmt,
                targetAsset: targetTicker,
                paymentMethod: isBridgePushWire
                    ? 'wire'
                    : isCardMethod
                      ? 'card'
                      : 'ach',
                paymentRail: isBridgePushWire
                    ? 'BRIDGE_VIRTUAL_ACCOUNT_WIRE'
                    : isCardMethod
                      ? 'CARD_INSTANT'
                      : globalFiatPaymentRail,
                settlementTarget: isAutoStakeSilo
                    ? 'AUTO_STAKE_SILO'
                    : globalFiatDeliveryMode,
                autoStakeSilo: isAutoStakeSilo,
                bundledKasOrSilo: isAutoStakeSilo,
                instantBankDebit: !isBridgePushWire,
                bankLabel: resolvedLabel,
                accountType: inlineAccountType
            };
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
            if (!res.ok) {
                throw new Error(
                    data.error || 'Failed to execute bank purchase.'
                );
            }
            if (data.bankLast4) {
                savedBankLast4 = data.bankLast4;
                savedBankRailMeta = {
                    bankLabel: data.bankLabel || resolvedLabel,
                    accountType: inlineAccountType,
                    payoutMethod: 'ACH',
                    bankLast4: data.bankLast4,
                    updatedAt: new Date().toISOString()
                };
                inlineRoutingNumber = '';
                inlineAccountNumber = '';
                showInlineBankSetup = false;
            }
            globalFiatSuccessOrder = data;
            ui.triggerMicroBadge(
                'global_fiat_btn',
                data.status === 'COMPLETED'
                    ? `${targetTicker} PURCHASED & CREDITED ✓`
                    : `ORDER ${data.orderId || data.sessionId} CREATED ✓`,
                '#18C6A5'
            );
            if (identity.activeAddress) {
                await hydrateHeaderTreasuryBalances(identity.activeAddress);
            }
        } catch (err: any) {
            globalFiatError =
                err.message || 'Direct bank purchase execution failed.';
        } finally {
            isSubmittingGlobalFiat = false;
        }
    }

    async function settleGlobalFiatOrderNow() {
        if (
            !globalFiatSuccessOrder?.orderId &&
            !globalFiatSuccessOrder?.sessionId
        )
            return;
        const orderId =
            globalFiatSuccessOrder.orderId || globalFiatSuccessOrder.sessionId;
        isSettlingGlobalFiat = true;
        globalFiatError = null;
        try {
            const res = await fetch('/api/fiat/onramp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'SETTLE_ORDER_NOW',
                    orderId
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(
                    data.error || 'Failed to settle purchase order.'
                );
            }
            globalFiatSuccessOrder = {
                ...globalFiatSuccessOrder,
                status: 'COMPLETED',
                txHash: data.txHash || globalFiatSuccessOrder.txHash,
                deliveredTokens:
                    data.deliveredTokens ??
                    globalFiatSuccessOrder.estimatedTokens
            };
            ui.triggerMicroBadge(
                'global_fiat_btn',
                `${globalFiatSuccessOrder.targetAsset || selectedGlobalTargetAsset.ticker} DELIVERED ✓`,
                '#18C6A5'
            );
            if (identity.activeAddress) {
                await hydrateHeaderTreasuryBalances(identity.activeAddress);
            }
        } catch (err: any) {
            globalFiatError =
                err.message || 'Failed to complete order settlement.';
        } finally {
            isSettlingGlobalFiat = false;
        }
    }

    function hydratePersistedCustomTokens(customTokens: any[] | undefined) {
        if (!Array.isArray(customTokens)) return;
        for (const ct of customTokens) {
            const tick = String(ct?.ticker || ct?.symbol || '')
                .trim()
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '');
            if (!tick) continue;
            const existing = treasury.getAsset(tick);
            treasury.updateAsset(tick, {
                name: ct.name || existing.name || tick,
                assetClass: ct.assetClass || existing.assetClass || 'DeFi',
                network: (
                    ct.network ||
                    existing.network ||
                    'ETH'
                ).toUpperCase(),
                spotPrice:
                    Number(ct.spotPrice ?? ct.price ?? 0) > 0
                        ? Number(ct.spotPrice ?? ct.price)
                        : existing.spotPrice,
                delta:
                    ct.delta !== undefined || ct.change24h !== undefined
                        ? Number(ct.delta ?? ct.change24h ?? 0)
                        : existing.delta,
                contract: ct.contract || existing.contract || tick,
                imgUrl: ct.imgUrl || existing.imgUrl || '',
                theme: ct.theme ||
                    existing.theme || {
                        hex: '#18C6A5',
                        pastel: '#99f6e4'
                    }
            });
        }
    }

    async function hydrateHeaderTreasuryBalances(walletAddr: string) {
        if (!browser || !walletAddr) return;
        try {
            const requests: Promise<Response>[] = [
                fetch(`/api/balance?address=${encodeURIComponent(walletAddr)}`),
                fetch(
                    `/api/user/ledger?wallet=${encodeURIComponent(walletAddr)}`
                )
            ];
            if (identity.isCorporateAdmin && !ui.adminModeActive) {
                requests.push(
                    fetch(
                        `/api/treasury/corporate?corporate=true&kas=${encodeURIComponent(walletAddr)}`
                    )
                );
            }
            const [balRes, ledgerRes, corpRes] = await Promise.all(requests);
            if (balRes.ok) {
                const balData = await balRes.json();
                if (typeof balData.balance === 'number') {
                    treasury.updateAsset('KAS', { onChain: balData.balance });
                }
            }
            if (ledgerRes.ok) {
                const ledgerBalances = await ledgerRes.json();
                for (const [ticker, amount] of Object.entries(ledgerBalances)) {
                    if (
                        ticker !== 'unassignedReserveKas' &&
                        ticker !== 'unassignedReserveTargetKas'
                    ) {
                        treasury.updateAsset(ticker.toUpperCase(), {
                            synthetic: Number(amount) || 0
                        });
                    }
                }
            }
            if (corpRes && corpRes.ok) {
                const corpData = await corpRes.json();
                if (corpData?.reconciliation?.treasuryAccounting) {
                    adminTreasuryAccounting =
                        corpData.reconciliation.treasuryAccounting;
                }
            }
        } catch {
            // Ignore transient header balance refresh error
        }
    }

    async function loadStateFromServer(targetWallet: string | null = null) {
	if (!browser || !identity.activeAddress || !identity.isWalletConnected) return;
	if (identity.isWatchOnly) {
		try {
			const [wRes, bRes] = await Promise.all([fetch(`/api/stratum/bind?publicWorkers=1&wallet=${encodeURIComponent(identity.activeAddress)}`), fetch(`/api/balance?address=${encodeURIComponent(identity.activeAddress)}`)]);
			if (wRes.ok) { const wd = await wRes.json(); operations.globalNodeStatus = wd.online ? 'connected' : 'offline'; operations.workers = (wd.workers || []).map((r: any) => ({ id: String(r.worker_id || r.worker_name || 'RIG'), type: 'physical', name: String(r.worker_name || 'Rig'), stratumUrl: `stratum+tcp://pool.perennia.io:${r.stratum_port || 3332}`, walletWorker: `${identity.activeAddress}.${r.worker_name || 'Rig'}`, hashRate: Number(r.hashrate_ths || (Number(r.current_hashrate || 0) / 1e12) || 0), isOnline: Number(r.current_hashrate || r.hashrate_ths || 0) > 0, hardwareType: r.hardware_model || 'IceRiver KS', sharesContributed: Number(r.valid_shares || 0), validShares: Number(r.valid_shares || 0), rejectedShares: Number(r.rejected_shares || 0), blocksFound: Number(r.blocks_found || 0) })); }
			if (bRes.ok) { const bd = await bRes.json(); if (typeof bd.balance === 'number') treasury.updateAsset('KAS', { onChain: bd.balance, address: identity.activeAddress }); }
		} catch {}
		isLoaded = true; return;
	}
        try {
            const url = targetWallet
                ? `${BACKEND_BASE}/api/state?target=${encodeURIComponent(targetWallet)}`
                : `${BACKEND_BASE}/api/state`;
            const res = await fetch(url);
            if (res.ok) {
                const parsed = await res.json();
                operations.workers = parsed.workers || [];
                operations.sectors = parsed.sectors || [];
                if (parsed.systemMode) ui.systemMode = parsed.systemMode;
                if (typeof parsed.forgePublicEnabled === 'boolean') {
                    identity.forgePublicEnabled = parsed.forgePublicEnabled;
                }
                if (Array.isArray(parsed.customTokens)) {
                    hydratePersistedCustomTokens(parsed.customTokens);
                }
                if (parsed.epochTelemetry) {
                    operations.updateEpochTelemetry(parsed.epochTelemetry);
                }
                if (
                    typeof parsed.networkDifficulty === 'number' &&
                    parsed.networkDifficulty > 0
                ) {
                    operations.networkDifficulty = parsed.networkDifficulty;
                }
                if (
                    typeof parsed.blockRewardKas === 'number' &&
                    parsed.blockRewardKas > 0
                ) {
                    operations.blockRewardKas = parsed.blockRewardKas;
                }
	if (typeof parsed.virtualDaaScore === 'number' && parsed.virtualDaaScore > 0) operations.virtualDaaScore = parsed.virtualDaaScore;
                isServerReachable = true;
                isLoaded = true;
            } else {
                operations.purge();
                isServerReachable = true;
                isLoaded = true;
            }
            hydrateHeaderTreasuryBalances(
                targetWallet || identity.activeAddress
            );
        } catch {
            isServerReachable = false;
        }
    }

    $effect(() => {
        if (browser) {
            const connected = identity.isWalletConnected;
            const addr = identity.activeAddress;
            const adminActive = ui.adminModeActive;
            const adminTarget = ui.adminTargetWallet;
            untrack(() => {
                if (connected && addr) {
                    isLoaded = false;
                    const target =
                        identity.isCorporateAdmin && adminActive && adminTarget
                            ? adminTarget
                            : null;
                    loadStateFromServer(target);
                } else if (!connected) {
                    isLoaded = false;
                    adminTreasuryAccounting = null;
                    operations.purge();
                }
            });
        }
    });

    $effect(() => {
        const connected = identity.isWalletConnected;
        const addr = identity.activeAddress;
        if (browser && connected && addr) {
            let connection: any;
            let unsubscribe: (() => void) | undefined;
            untrack(() => {
                connection = source(
                    `/api/telemetry?address=${encodeURIComponent(addr)}`
                );
                unsubscribe = connection
                    .select('message')
                    .subscribe((rawData: string) => {
                        if (!rawData) return;
                        untrack(() => {
                            try {
                                const parsed = JSON.parse(rawData);
                                if (parsed.error) return;
                                if (parsed.fiat_event) {
                                    window.dispatchEvent(
                                        new CustomEvent('perennia:fiat_event', {
                                            detail: parsed
                                        })
                                    );
                                    if (identity.activeAddress) {
                                        hydrateHeaderTreasuryBalances(
                                            resolveTargetWallet() ||
                                                identity.activeAddress
                                        );
                                    }
                                    return;
                                }
                                if (
                                    typeof parsed.networkDifficulty ===
                                        'number' &&
                                    parsed.networkDifficulty > 0
                                ) {
                                    operations.networkDifficulty =
                                        parsed.networkDifficulty;
                                }
                                if (
                                    typeof parsed.blockRewardKas === 'number' &&
                                    parsed.blockRewardKas > 0
                                ) {
                                    operations.blockRewardKas =
                                        parsed.blockRewardKas;
                                }
                                if (
                                    parsed.epoch_telemetry_update &&
                                    parsed.epoch
                                ) {
                                    operations.updateEpochTelemetry(
                                        parsed.epoch
                                    );
                                    return;
                                }
                                if (parsed.epoch) {
                                    operations.updateEpochTelemetry(
                                        parsed.epoch
                                    );
                                }
                                const targetUserWallet = resolveTargetWallet();
                                const cleanTarget = (targetUserWallet || '')
                                    .replace(/kaspa:/i, '')
                                    .toLowerCase()
                                    .trim();
                                const incWallet = (parsed.wallet || '')
                                    .replace(/kaspa:/i, '')
                                    .toLowerCase()
                                    .trim();
                                if (parsed.layout_state_update) {
                                    if (
                                        Date.now() -
                                            operations.lastMutationTime <
                                        4000
                                    )
                                        return;
                                    if (incWallet === cleanTarget) {
                                        operations.workers =
                                            parsed.state.workers || [];
                                        operations.sectors =
                                            parsed.state.sectors || [];
                                        if (parsed.state.systemMode)
                                            ui.systemMode =
                                                parsed.state.systemMode;
                                        if (
                                            Array.isArray(
                                                parsed.state.customTokens
                                            )
                                        ) {
                                            hydratePersistedCustomTokens(
                                                parsed.state.customTokens
                                            );
                                        }
                                    }
                                    return;
                                }
                                if (parsed.yield_update) {
                                    if (incWallet === cleanTarget) {
                                        operations.sectors =
                                            operations.sectors.map((s) => {
                                                const update =
                                                    parsed.sectors?.find(
                                                        (u: any) =>
                                                            u.id === s.id
                                                    );
                                                if (
                                                    update &&
                                                    s.pendingKaspa !==
                                                        update.pendingKaspa
                                                ) {
                                                    return {
                                                        ...s,
                                                        pendingKaspa:
                                                            update.pendingKaspa
                                                    };
                                                }
                                                return s;
                                            });
                                    }
                                    window.dispatchEvent(
                                        new CustomEvent(
                                            'perennia:yield_update',
                                            { detail: parsed }
                                        )
                                    );
                                    return;
                                }
                                operations.globalNetworkHashrate =
                                    (parsed.pool?.totalHashrate ||
                                        parsed.totalHashrate ||
                                        0) / 1e12;
                                operations.globalNodeStatus = 'connected';
                                let nextWorkers = [...operations.workers];
                                let matchedIndices = new Set<number>();
                                (parsed.workers || []).forEach((bw: any) => {
                                    const rawIdentity =
                                        bw.walletAddress ||
                                        bw.fullIdentity ||
                                        '';
                                    const bBase = rawIdentity
                                        .split('.')[0]
                                        .replace(/kaspa:/i, '')
                                        .toLowerCase()
                                        .trim();
                                    const bName =
                                        bw.name ||
                                        rawIdentity.split('.')[1] ||
                                        'Rig';
                                    const existingIdx = nextWorkers.findIndex(
                                        (w, idx) => {
                                            if (matchedIndices.has(idx))
                                                return false;
                                            const wIdentity =
                                                w.walletWorker || '';
                                            const wBase = wIdentity
                                                .split('.')[0]
                                                .replace(/kaspa:/i, '')
                                                .toLowerCase()
                                                .trim();
                                            return (
                                                wIdentity.toLowerCase() ===
                                                    (
                                                        bw.fullIdentity || ''
                                                    ).toLowerCase() ||
                                                (w.name?.toLowerCase() ===
                                                    bName.toLowerCase() &&
                                                    (wBase === bBase ||
                                                        wBase === 'pending' ||
                                                        wBase === ''))
                                            );
                                        }
                                    );
                                    const rawHash =
                                        bw.trackingRate ||
                                        bw.hashrate ||
                                        bw.hashRate ||
                                        0;
                                    const liveHashTh = rawHash / 1e12;
                                    const autoAssignedStratumUrl =
                                        resolveAutoStratumUrl(liveHashTh);
                                    const validShares =
                                        typeof bw.validShares === 'number'
                                            ? bw.validShares
                                            : undefined;
                                    const rejectedShares =
                                        typeof bw.rejectedShares === 'number'
                                            ? bw.rejectedShares
                                            : undefined;
                                    const acceptancePct =
                                        typeof bw.acceptancePct === 'number'
                                            ? bw.acceptancePct
                                            : undefined;
                                    const lastShareTimestamp =
                                        typeof bw.lastShareTimestamp ===
                                        'number'
                                            ? bw.lastShareTimestamp
                                            : undefined;
                                    if (existingIdx !== -1) {
                                        matchedIndices.add(existingIdx);
                                        const currentWorker =
                                            nextWorkers[existingIdx];
                                        const hasManualModel =
                                            currentWorker.hardwareType &&
                                            currentWorker.hardwareType !==
                                                'IceRiver KS' &&
                                            currentWorker.hardwareType !==
                                                'Select Miner Type';
                                        nextWorkers[existingIdx] = {
                                            ...currentWorker,
                                            hashRate: liveHashTh,
                                            stratumUrl: hasManualModel
                                                ? currentWorker.stratumUrl
                                                : liveHashTh > 0
                                                  ? autoAssignedStratumUrl
                                                  : currentWorker.stratumUrl ||
                                                    autoAssignedStratumUrl,
                                            sharesContributed:
                                                bw.sharesContributed ||
                                                bw.shares ||
                                                0,
                                            validShares:
                                                validShares ??
                                                currentWorker.validShares,
                                            rejectedShares:
                                                rejectedShares ??
                                                currentWorker.rejectedShares,
                                            acceptancePct:
                                                acceptancePct ??
                                                currentWorker.acceptancePct ??
                                                100.0,
                                            lastShareTimestamp:
                                                lastShareTimestamp ??
                                                currentWorker.lastShareTimestamp,
                                            blocksFound:
                                                bw.blocksFound ||
                                                bw.blocks ||
                                                0,
                                            hardwareType:
                                                bw.hardwareType ||
                                                currentWorker.hardwareType ||
                                                'IceRiver KS',
                                            isOnline: true
                                        };
                                    } else {
                                        const newWorker: Worker = {
                                            id: Math.random()
                                                .toString(36)
                                                .substring(2, 8)
                                                .toUpperCase(),
                                            type: 'physical',
                                            name: bName,
                                            stratumUrl: autoAssignedStratumUrl,
                                            walletWorker:
                                                bw.fullIdentity ||
                                                `kaspa:${bBase}.${bName}`,
                                            hashRate: liveHashTh,
                                            isOnline: true,
                                            hardwareType:
                                                bw.hardwareType ||
                                                'IceRiver KS',
                                            sharesContributed:
                                                bw.sharesContributed ||
                                                bw.shares ||
                                                0,
                                            validShares: validShares ?? 0,
                                            rejectedShares: rejectedShares ?? 0,
                                            acceptancePct:
                                                acceptancePct ?? 100.0,
                                            lastShareTimestamp:
                                                lastShareTimestamp ??
                                                Date.now(),
                                            blocksFound:
                                                bw.blocksFound || bw.blocks || 0
                                        };
                                        matchedIndices.add(nextWorkers.length);
                                        nextWorkers.push(newWorker);
                                        setTimeout(() => {
                                            operations.markMutation();
                                            operations.dispatchStateAction(
                                                'ADD_WORKER',
                                                newWorker
                                            );
                                        }, 100);
                                    }
                                });
                                operations.workers = nextWorkers.map(
                                    (w, idx) => {
                                        if (!matchedIndices.has(idx)) {
                                            return {
                                                ...w,
                                                hashRate: 0,
                                                isOnline: false
                                            };
                                        }
                                        return w;
                                    }
                                );
                            } catch {
                                operations.globalNodeStatus = 'unreachable';
                            }
                        });
                    });
            });
            return () => {
                if (unsubscribe) unsubscribe();
                if (connection && typeof connection.close === 'function')
                    connection.close();
            };
        } else {
            untrack(() => {
                operations.globalNodeStatus = 'offline';
            });
        }
    });

    async function fetchPriceData() {
        try {
            const res = await fetch(
                '/api/prices?ids=kaspa,bitcoin,ethereum,solana,dogecoin,ripple,polygon-ecosystem-token,avalanche-2,sui,tron,zcash,arbitrum&include_24hr_change=true'
            );
            if (res.ok) {
                const data = await res.json();
                const map: Record<string, string> = {
                    kaspa: 'KAS',
                    bitcoin: 'BTC',
                    ethereum: 'ETH',
                    solana: 'SOL',
                    dogecoin: 'DOGE',
                    ripple: 'XRP',
                    'polygon-ecosystem-token': 'POL',
                    'avalanche-2': 'AVAX',
                    sui: 'SUI',
                    tron: 'TRX',
                    zcash: 'ZEC',
                    arbitrum: 'ARB'
                };
                const mappedKeys = new Set(Object.keys(map));
                for (const [cgKey, ticker] of Object.entries(map)) {
                    if (data?.[cgKey]?.usd !== undefined) {
                        const spotVal = Number(data[cgKey].usd);
                        treasury.updateAsset(ticker, {
                            spotPrice: spotVal,
                            delta: Number(data[cgKey].usd_24h_change || 0)
                        });
                        if (
                            ticker === 'KAS' &&
                            spotVal > 0 &&
                            treasury.getAsset(DEFAULT_ECOSYSTEM_TICKER)
                                .spotPrice <= 0
                        ) {
                            treasury.updateAsset(DEFAULT_ECOSYSTEM_TICKER, {
                                spotPrice: Number(
                                    (spotVal / 23.809524).toFixed(6)
                                )
                            });
                        }
                    }
                }
                for (const [rawKey, valObj] of Object.entries(data || {})) {
                    if (mappedKeys.has(rawKey)) continue;
                    const quote = valObj as any;
                    if (
                        quote &&
                        typeof quote.usd === 'number' &&
                        quote.usd > 0
                    ) {
                        const dynTicker = rawKey.trim().toUpperCase();
                        if (
                            treasury.registry.some(
                                (a) => a.ticker === dynTicker
                            )
                        ) {
                            treasury.updateAsset(dynTicker, {
                                spotPrice: Number(quote.usd),
                                delta: Number(quote.usd_24h_change || 0)
                            });
                        }
                    }
                }
            }
            if (identity.isWalletConnected && identity.activeAddress) {
                hydrateHeaderTreasuryBalances(
                    resolveTargetWallet() || identity.activeAddress
                );
            }
        } catch {
            // Ignore transient price fetch error
        }
    }

    let priceInterval: ReturnType<typeof setInterval>;
    let epochClockInterval: ReturnType<typeof setInterval>;

    onMount(async () => {
	pwa.init();
        operations.tickEpochClock();
        epochClockInterval = setInterval(() => {
            operations.tickEpochClock();
        }, 1000);
        const unlockedInTab =
            browser &&
            sessionStorage.getItem('perennia_vault_unlocked') === 'true';
        try {
            const res = await fetch('/api/auth/me');
            if (res.ok) {
                const data = await res.json();
                identity.serverVerifiedAdmin = Boolean(
                    data.authenticated && data.isCorporateAdmin
                );
                identity.serverAuthenticatedAddress =
                    data.authenticated && data.address
                        ? identity.normalizeKaspaAddress(data.address)
                        : null;
                if (!unlockedInTab && ui.activeTab === 'DIRECTOR') {
                    ui.activeTab = 'OPERATIONS';
                }
                if (data.masterTreasuryAddress) {
                    identity.masterTreasuryAddress =
                        identity.normalizeKaspaAddress(
                            data.masterTreasuryAddress
                        ) || '';
                }
                if (data.authenticated && data.address) {
                    if (unlockedInTab) {
                        const restored =
                            identity.hydrateStoredSovereignSession(
                                data.address
                            );
                        if (restored) {
                            hasEntered = true;
                            ui.hasEntered = true;
                        }
                    } else {
                        identity.hydrateStoredSovereignSession(data.address);
                        hasEntered = true;
                        ui.hasEntered = true;
                        ui.showWalletModal = true;
                    }
                }
            }
        } catch {
            // Ignore auth check error at boot
        }
        if (!identity.isWalletConnected && browser) { const savedWatchAddr = sessionStorage.getItem('perennia_watch_only_address'); if (savedWatchAddr && identity.connectWatchOnlyKaspa(savedWatchAddr)) { hasEntered = true; ui.hasEntered = true; } }
	fetchPriceData();
	settingsStore.applyTheme();
        priceInterval = setInterval(fetchPriceData, 15000);
    });

    onDestroy(() => {
        if (priceInterval) clearInterval(priceInterval);
        if (epochClockInterval) clearInterval(epochClockInterval);
        clearTimeout(globalDiscoverTimer);
    });
</script>

<div class="theme-wrapper min-h-[100dvh] bg-app">
    {#if !hasEntered && !ui.hasEntered}
        <EntryView {enterNexus} />
    {:else}
        <div
            class="app-wrapper min-h-[100dvh] max-lg:h-[100dvh] max-lg:max-h-[100dvh] max-lg:overflow-hidden w-full flex flex-col font-sans selection:bg-[#18C6A5]/30 overflow-x-hidden {appAwakened ? 'glow-active' : 'dormant'}"
        >
            <header
                class="min-h-[3.75rem] lg:h-20 bg-[#070b0e]/95 backdrop-blur-md flex items-center justify-center z-50 shrink-0 w-full sticky top-0 border-b border-white/10 pt-[calc(0.375rem+env(safe-area-inset-top,0px))] pb-1.5 lg:py-0"
            >
                <div
                    class="w-full max-w-[1720px] px-3 sm:px-5 lg:px-8 flex flex-wrap lg:flex-nowrap justify-between items-center h-full gap-2.5"
                >
                    <button
                        type="button"
                        class="flex items-center gap-2.5 md:gap-3 cursor-pointer shrink-0 bg-transparent border-none text-left group"
                        onclick={() => (ui.activeTab = 'OPERATIONS')}
                    >
                        <div
                            class="w-9 h-9 bg-[#11161f] rounded-xl flex items-center justify-center shrink-0 border border-white/10 group-hover:border-[#18C6A5]/45 transition-colors relative"
                        >
                            <span
                                class="font-black text-[#18C6A5] text-lg leading-none"
                            >
                                P
                            </span>
                            <span
                                class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#06080b] {operations.globalNodeStatus === 'connected' ? 'bg-[#18C6A5] animate-pulse' : operations.globalNodeStatus === 'unreachable' ? 'bg-amber-500' : 'bg-neutral-600'}"
                                title="Node Status: {operations.globalNodeStatus.toUpperCase()}"
                            ></span>
                        </div>
                        <div class="flex flex-col"><span class="font-black tracking-[0.14em] sm:tracking-[0.2em] text-xs sm:text-base md:text-lg uppercase text-white leading-none">PERENNIA</span><span class="hidden sm:block text-[8px] font-mono uppercase tracking-widest text-neutral-500 mt-0.5">
                                {operations.globalNodeStatus === 'connected'
                                    ? i18n.t('header.node_online')
                                    : i18n.t('header.mining_settlement')}
                            </span>
                        </div>
                    </button>
                    <nav
                        aria-label="Primary Command Navigation"
                        class="hidden lg:flex lg:order-2 lg:w-auto items-center justify-center overflow-x-auto hide-scrollbar"
                    >
                        <div
                            class="flex items-center gap-1 bg-[#0a0d12] border border-white/10 p-1 rounded-2xl min-w-max shadow-inner"
                        >
                            <button
                                type="button"
                                data-testid="header-nav-OPERATIONS"
                                onclick={() => (ui.activeTab = 'OPERATIONS')}
                                class="px-3 md:px-3.5 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap {ui.activeTab === 'OPERATIONS' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/45 shadow-sm' : 'text-neutral-400 hover:text-white border border-transparent'}"
                            >
                                {i18n.t('nav.operations')}
                            </button>
                            <button
                                type="button"
                                data-testid="header-nav-DEX"
                                onclick={() => (ui.activeTab = 'DEX')}
                                class="px-3 md:px-3.5 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 {ui.activeTab === 'DEX' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/45 shadow-sm' : 'text-neutral-400 hover:text-white border border-transparent'}"
                            >
                                <span>{i18n.t('nav.exchange')}</span>
                                <span
                                    class="hidden xl:inline text-[8px] px-1.5 py-0.5 rounded bg-[#11161f] border border-white/10 text-neutral-400"
                                >
                                    DEX
                                </span>
                            </button>
                            <button
                                type="button"
                                data-testid="header-treasury-btn"
                                onclick={() => (ui.activeTab = 'TREASURY')}
                                class="px-3 md:px-3.5 py-1.5 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 {ui.activeTab === 'TREASURY' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/45 shadow-sm' : 'text-neutral-300 hover:text-white border border-transparent'}"
                                title={identity.isCorporateAdmin &&
                                !ui.adminModeActive &&
                                adminTreasuryAccounting
                                    ? `Earned Fee Revenue: ${i18n.formatFiat(adminTreasuryAccounting.totalEarnedRevenueUsd, { decimals: settingsStore.fiatDecimals })} | Custodial Miner Rewards (22:00 UTC): ${i18n.formatFiat(adminTreasuryAccounting.custodialMinerLiabilityUsd, { decimals: settingsStore.fiatDecimals })}`
                                    : 'Open Multi-Chain Treasury'}
                            >
                                <span>{i18n.t('nav.treasury')}</span>
                                {#if identity.isCorporateAdmin && !ui.adminModeActive && adminTreasuryAccounting}
                                    <span
                                        class="px-2 py-0.5 rounded-lg bg-[#11161f] border border-[#18C6A5]/35 text-[#18C6A5] font-mono font-bold text-[9px] tabular-nums"
                                    >
                                        Fee: {i18n.formatFiat(
                                            adminTreasuryAccounting.totalEarnedRevenueUsd,
                                            {
                                                decimals:
                                                    settingsStore.fiatDecimals
                                            }
                                        )}
                                    </span>
                                    <span
                                        class="hidden 2xl:inline px-2 py-0.5 rounded-lg bg-[#11161f] border border-amber-500/35 text-amber-400 font-mono font-bold text-[9px] tabular-nums"
                                    >
                                        Pool: {i18n.formatFiat(
                                            adminTreasuryAccounting.custodialMinerLiabilityUsd,
                                            {
                                                decimals:
                                                    settingsStore.fiatDecimals
                                            }
                                        )}
                                    </span>
                                {:else}
                                    <span
                                        class="px-2 py-0.5 rounded-lg bg-[#11161f] border border-white/10 text-[#18C6A5] font-mono font-bold text-[9px] tabular-nums"
                                    >
                                        {i18n.formatFiat(
                                            treasury.totalVaultValue,
                                            {
                                                decimals:
                                                    settingsStore.fiatDecimals
                                            }
                                        )}
                                    </span>
                                {/if}
                            </button>
                            <button
                                type="button"
                                data-testid="header-nav-TAX-FORTRESS"
                                onclick={() => (ui.activeTab = 'TAX FORTRESS')}
                                class="px-3 md:px-3.5 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap {ui.activeTab === 'TAX FORTRESS' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/45 shadow-sm' : 'text-neutral-400 hover:text-white border border-transparent'}"
                            >
                                {i18n.t('nav.tax_fortress')}
                            </button>
                            {#if identity.canAccessForge}
                                <button
                                    type="button"
                                    data-testid="header-nav-FORGE"
                                    onclick={() => (ui.activeTab = 'FORGE')}
                                    class="px-3 md:px-3.5 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap {ui.activeTab === 'FORGE' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/45 shadow-sm' : 'text-neutral-400 hover:text-white border border-transparent'}"
                                >
                                    {i18n.t('nav.forge')}
                                </button>
                            {/if}
                            {#if identity.isCorporateAdmin}
                                <button
                                    type="button"
                                    data-testid="header-nav-DIRECTOR"
                                    onclick={() => (ui.activeTab = 'DIRECTOR')}
                                    class="px-3 md:px-3.5 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap {ui.activeTab === 'DIRECTOR' ? 'bg-[#161d29] text-amber-400 border border-amber-500/45 shadow-sm' : 'text-amber-400/80 hover:text-amber-300 border border-transparent'}"
                                >
                                    {i18n.t('nav.director')}
                                </button>
                            {/if}
                        </div>
                    </nav>
                    <div
                        class="order-2 lg:order-3 flex items-center gap-2 shrink-0 relative"
                    >
                        {#if identity.isCorporateAdmin && ui.adminModeActive && ui.adminTargetWallet}
                            <div
                                class="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/40 font-mono"
                            >
                                <span
                                    class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"
                                ></span>
                                <span
                                    class="text-[8px] font-black uppercase tracking-wider text-amber-400"
                                >
                                    {ui.adminTargetWallet.slice(0, 12)}...
                                </span>
                                <button
                                    type="button"
                                    onclick={() => {
                                        ui.adminModeActive = false;
                                        ui.adminTargetWallet = '';
                                    }}
                                    class="text-[8px] font-black text-neutral-300 hover:text-white cursor-pointer"
                                    title="Exit Miner Impersonation"
                                >
                                    ✕
                                </button>
                            </div>
                        {/if}
                        {#if !pwa.isStandalone}<button type="button" data-testid="header-install-app-btn" onclick={() => pwa.handleInstallClick()} class="tactile-btn mobile-touch-target px-2.5 sm:px-3.5 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-wider text-white border-white/15 hover:border-[#18C6A5]/50 flex items-center gap-1.5 whitespace-nowrap" title="Install Perennia Standalone App"><svg class="w-3.5 h-3.5 text-[#18C6A5] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" /></svg><span class="hidden sm:inline">Install App</span><span class="sm:hidden">App</span></button>{/if}
<div class="relative">
                            {#if ui.microBadges['global_fiat_btn']}
                                <div
                                    class="micro-confirm-badge absolute -bottom-7 left-1/2 -translate-x-1/2 z-50 px-2.5 py-0.5 rounded bg-[#11161f] border border-[#18C6A5]/60 text-[#18C6A5] text-[8px] font-mono font-black uppercase tracking-widest whitespace-nowrap shadow-xl"
                                >
                                    {ui.microBadges['global_fiat_btn'].label}
                                </div>
                            {/if}
                            <button
                                type="button"
                                data-testid="header-buy-fiat-btn"
                                onclick={() =>
                                    ui.openFiatModal('KAS', false, '650')}
                                class="tactile-btn px-3.5 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest cursor-pointer flex items-center gap-1.5 text-[#18C6A5] border-[#18C6A5]/50 whitespace-nowrap"
                                style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.22), transparent 70%);"
                                title="Buy Crypto with USD"
                            >
                                <span class="text-xs font-black">$</span>
                                <span class="hidden sm:inline">{i18n.t('header.buy_crypto')}</span><span class="sm:hidden">Buy</span>
                            </button>
                        </div>
                        <button
                            type="button"
                            aria-label="Settings"
                            data-testid="header-settings-btn"
                            onclick={() =>
                                (settingsStore.showSettingsModal = true)}
                            class="tactile-btn mobile-touch-target w-10 h-10 lg:w-9 lg:h-9 rounded-xl {settingsStore.showSettingsModal || ui.isTutorialActive ? 'text-[#18C6A5] border-[#18C6A5]/45' : 'text-neutral-400 hover:text-white'} flex items-center justify-center cursor-pointer shrink-0"
                            title="System Parameters & Interactive Guide"
                        >
                            <svg
                                class="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c-.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                                />
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                />
                            </svg>
                        </button>
                        {#if !identity.isWalletConnected}
                            <button
                                type="button"
                                data-testid="header-unlock-vault-btn" onclick={() => (ui.showWalletModal = true)} class="tactile-btn px-2.5 sm:px-4 md:px-5 py-2 border-[#18C6A5]/40 text-[#18C6A5] hover:text-white text-[10px] font-mono font-black uppercase tracking-widest rounded-xl cursor-pointer whitespace-nowrap"
                                style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.16), transparent 70%);"
                            >
                                {i18n.t('header.unlock_vault')}
                                <span class="sr-only">Log In</span>
                            </button>
                        {:else}
                            <div
                                class="flex items-center gap-1 bg-[#0a0d12] border border-white/10 rounded-xl p-1 pr-1.5 relative"
                            >
                                {#if ui.microBadges['header_wallet_pill']}
                                    <div
                                        class="micro-confirm-badge absolute -bottom-7 left-1/2 -translate-x-1/2 z-50 px-2.5 py-0.5 rounded bg-[#11161f] border border-[#18C6A5]/50 text-[#18C6A5] text-[8px] font-mono font-black uppercase tracking-widest whitespace-nowrap shadow-lg"
                                    >
                                        {ui.microBadges['header_wallet_pill']
                                            .label}
                                    </div>
                                {/if}
                                <button
                                    type="button"
                                    onclick={copyHeaderWalletAddress}
                                    class="tactile-btn {headerPillShimmer ? 'shimmer-flash' : ''} rounded-lg px-2.5 md:px-3 py-1.5 flex items-center gap-1.5 cursor-pointer group"
                                    title="Click to copy Kaspa Address"
                                >
                                    <div
                                        class="w-2 h-2 rounded-full {operations.globalNodeStatus === 'connected' ? 'bg-[#18C6A5] animate-pulse' : operations.globalNodeStatus === 'unreachable' ? 'bg-amber-500' : 'bg-neutral-600'} shrink-0"
                                    ></div>
                                    <span
                                        class="{operations.globalNodeStatus === 'connected' ? 'text-[#18C6A5]' : operations.globalNodeStatus === 'unreachable' ? 'bg-amber-500' : 'text-neutral-400'} font-mono text-[10px] font-bold truncate max-w-[90px] md:max-w-none group-hover:text-white transition-colors"
                                    >
                                        {identity.activeAddress?.substring(
                                            0,
                                            10
                                        )}...{identity.activeAddress?.substring(
                                            identity.activeAddress.length - 4
                                        )}
                                    </span>
                                    {#if identity.isWatchOnly}<span class="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-400 text-[8px] font-black uppercase">WATCH</span>{/if}<span class="sr-only">UNLOCKED</span>
                                </button>
                                <button
                                    type="button"
                                    aria-label="Disconnect"
                                    onclick={() => identity.disconnect()}
                                    class="w-7 h-7 flex items-center justify-center text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer rounded-lg shrink-0"
                                    title="Disconnect"
                                >
                                    <svg
                                        class="w-3.5 h-3.5"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                                        />
                                    </svg>
                                </button>
                            </div>
                        {/if}
                    </div>
                </div>
            </header>
            <main class="flex-1 min-h-0 overflow-y-auto overscroll-y-contain relative pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] lg:pb-24 mt-0 lg:mt-2">
                <div class="w-full h-full relative z-10">
                    {@render children()}
                </div>
            </main>
<MobileBottomDock />
</div>
{/if}
</div>

{#if ui.showFiatModal}
    <div
        data-testid="global-fiat-modal" class="fixed inset-0 z-[9990] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#06080b]/92 font-mono overflow-y-auto"
        transition:fade={{ duration: 150 }}
    >
        <button
            type="button"
            aria-label="Close Fiat Purchase Modal"
            onclick={() => ui.closeFiatModal()}
            class="fixed inset-0 w-full h-full bg-transparent border-none cursor-default"
        ></button>
        <div
            class="relative z-10 w-full max-w-[580px] max-h-[92dvh] overflow-y-auto bg-[#0a0d12] border-t sm:border rounded-t-[28px] sm:rounded-[28px] p-4 sm:p-6 md:p-7 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:pb-7 flex flex-col gap-3.5 sm:my-auto transition-all duration-300"
            style="
                border-color: {targetAssetHex}45;
                background-image:
                    radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.16), transparent 58%),
                    radial-gradient(ellipse at bottom right, {targetAssetHex}24, transparent 65%);
                box-shadow:
                    0 24px 70px -15px rgba(0, 0, 0, 0.9),
                    0 0 42px -15px {targetAssetHex}30;
            "
        >
            <div class="flex items-center justify-between gap-3 pb-2 border-b border-white/10 flex-wrap">
                <div class="flex items-center gap-2.5 flex-wrap">
                    <span
                        class="w-2.5 h-2.5 rounded-full transition-colors duration-300"
                        style="background-color: {targetAssetHex}; box-shadow: 0 0 10px {targetAssetHex}80;"
                    ></span>
                    <h2 class="text-xs md:text-sm font-black uppercase tracking-widest text-white">
                        Buy {selectedGlobalTargetAsset.ticker} with USD
                    </h2>
                    <span class="px-2 py-0.5 rounded-lg bg-[#11161f] border border-[#18C6A5]/40 text-[#18C6A5] text-[8px] font-black uppercase">
                        {globalCostPlusPreview.tierBadgeLabel}
                    </span>
                </div>
                <button
                    type="button"
                    data-testid="close-global-fiat-modal-btn"
                    onclick={() => ui.closeFiatModal()}
                    class="w-8 h-8 rounded-full bg-[#11161f] border border-white/10 text-neutral-400 hover:text-white flex items-center justify-center cursor-pointer shrink-0"
                >
                    ✕
                </button>
            </div>
            <div
                class="tactile-card bg-[#11161f] rounded-2xl p-4 md:p-5 flex flex-col gap-3 border border-[#18C6A5]/35"
                style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.10), transparent 65%);"
            >
                <div class="flex items-center justify-between flex-wrap gap-2">
                    <label
                        for="globalFiatUsdAmount"
                        class="text-[10px] font-black uppercase tracking-widest text-neutral-400"
                    >
                        {i18n.t('dex.you_pay')}
                    </label>
                    <div class="flex items-center gap-1 flex-wrap">
                        {#each [
                            { label: '$100', val: '100' },
                            { label: '$650 (ACH)', val: '650' },
                            { label: '$2.5k', val: '2500' },
                            { label: '$10k (Pro)', val: '10000' },
                            { label: '$100k (Wire)', val: '100000' }
                        ] as preset (preset.val)}
                            <button
                                type="button"
                                onclick={() =>
                                    (globalFiatUsdInput = preset.val)}
                                class="tactile-btn px-2 py-0.5 rounded-md text-[9px] font-mono font-bold cursor-pointer {globalFiatUsdInput ===
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
                            id="globalFiatUsdAmount"
                            data-testid="global-fiat-usd-input"
                            type="number"
                            min="10"
                            bind:value={globalFiatUsdInput}
                            placeholder="650"
                            class="w-full bg-transparent text-3xl md:text-4xl font-bold font-mono text-white outline-none tabular-nums"
                        />
                    </div>
                    <div
                        class="shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#0a0d12] border border-[#18C6A5]/40"
                    >
                        <div class="w-6 h-6 rounded-full bg-[#18C6A5]/20 border border-[#18C6A5]/50 text-[#18C6A5] flex items-center justify-center text-[10px] font-black">
                            $
                        </div>
                        <span class="text-xs font-black text-white tracking-wider">
                            USD
                        </span>
                    </div>
                </div>
                <div class="flex items-center justify-between flex-wrap gap-2 text-[10px] font-mono text-neutral-400 pt-1 border-t border-white/10">
                    <span>
                        Principal: ${globalCostPlusPreview.guestNetUsd.toFixed(
                            2
                        )} • Perennia ({globalCostPlusPreview.protocolFeeFloorPct.toFixed(
                            2
                        )}%): ${globalCostPlusPreview.perenniaFeeUsd.toFixed(2)} • Gateway: ${globalCostPlusPreview.stripeGatewayFeeUsd.toFixed(
                            2
                        )}
                    </span>
                    <span
                        data-testid="global-fiat-fee-breakdown"
                        class="text-[#18C6A5] font-bold"
                    >
                        Total Charge: ${globalCostPlusPreview.totalGrossChargeUsd.toFixed(
                            2
                        )} (Fee: ${globalCostPlusPreview.feeUsd.toFixed(2)})
                    </span>
                </div>
            </div>
            <div class="flex items-center justify-center -my-4 z-20 pointer-events-none">
                <div
                    class="w-9 h-9 rounded-xl bg-[#0a0d12] border flex items-center justify-center text-xs font-black shadow-xl transition-colors duration-300"
                    style="border-color: {targetAssetHex}55; color: {targetAssetHex};"
                >
                    ↓
                </div>
            </div>
            <div
                class="tactile-card bg-[#11161f] rounded-2xl p-4 md:p-5 flex flex-col gap-3 border relative transition-all duration-300"
                style="
                    border-color: {targetAssetHex}55;
                    background-image: radial-gradient(ellipse at bottom right, {targetAssetHex}24, transparent 68%);
                    box-shadow: inset 0 0 26px -12px {targetAssetHex}28;
                "
            >
                <div class="flex items-center justify-between">
                    <span
                        class="text-[10px] font-black uppercase tracking-widest transition-colors duration-300"
                        style="color: {targetAssetHex};"
                    >
                        {i18n.t('dex.you_receive')}
                    </span>
                    <span class="text-[9px] font-mono font-bold uppercase tracking-widest text-neutral-400">
                        {selectedGlobalTargetAsset.assetClass.toUpperCase()} 
                    </span>
                </div>
                <div class="flex items-center justify-between gap-3">
                    <span
                        data-testid="global-fiat-estimated-output"
                        class="text-3xl md:text-4xl font-bold font-mono text-white tabular-nums truncate"
                    >
                        {globalCostPlusPreview.estimatedTokens > 0
                            ? globalCostPlusPreview.estimatedTokens.toLocaleString(
                                  undefined,
                                  {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits:
                                          globalCostPlusPreview.estimatedTokens <
                                          1
                                              ? 6
                                              : 2
                                  }
                              )
                            : '0.00'}
                    </span>
                    <button
                        type="button"
                        data-testid="global-fiat-asset-selector-btn"
                        onclick={() =>
                            (showGlobalAssetDropdown =
                                !showGlobalAssetDropdown)}
                        class="tactile-btn shrink-0 flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-[#0a0d12] cursor-pointer transition-all duration-300"
                        style="border-color: {targetAssetHex}60;"
                    >
                        <div
                            class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black overflow-hidden shrink-0"
                            style="background-color: {targetAssetHex}22; color: {targetAssetHex}; border: 1px solid {targetAssetHex}60;"
                        >
                            {#if selectedGlobalTargetAsset.imgUrl}
                                <img
                                    src={selectedGlobalTargetAsset.imgUrl}
                                    alt={selectedGlobalTargetAsset.ticker}
                                    class="w-4 h-4 object-contain"
                                    onerror={handleModalIconError}
                                />
                                <span
                                    style="display:none;"
                                    class="w-full h-full items-center justify-center"
                                >
                                    {selectedGlobalTargetAsset.ticker[0]}
                                </span>
                            {:else}
                                <span>{selectedGlobalTargetAsset.ticker[0]}</span>
                            {/if}
                        </div>
                        <div class="flex flex-col items-start leading-tight">
                            <span class="text-xs font-black text-white tracking-wider uppercase">
                                {selectedGlobalTargetAsset.ticker}
                            </span>
                            <span
                                class="text-[9px] font-mono font-bold"
                                style="color: {targetAssetHex};"
                            >
                                {formatGlobalSpotDisplay(
                                    globalCostPlusPreview.spotPriceUsd
                                )}
                            </span>
                        </div>
                        <span class="text-[10px] text-neutral-400 ml-0.5"
                            >▾</span
                        >
                    </button>
                </div>
                <div
                    data-testid="global-fiat-competitor-savings-badge"
                    class="bg-[#0a0d12] border border-[#18C6A5]/35 rounded-xl px-3 py-1.5 flex items-center justify-between flex-wrap gap-2 text-[9px] font-mono"
                >
                    <span class="text-[#18C6A5] font-bold">
                        ✓ Save +${globalCostPlusPreview.savingsVsMoonpayUsd.toFixed(
                            2
                        )} vs. MoonPay &amp; +${globalCostPlusPreview.savingsVsCoinbaseUsd.toFixed(
                            2
                        )} vs. Coinbase
                    </span>
                    <span class="text-neutral-400">
                        {i18n.t('dex.available')}: {selectedGlobalTargetAsset.availableBalance.toLocaleString(
                            undefined,
                            {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 4
                            }
                        )}
                        {selectedGlobalTargetAsset.ticker}
                    </span>
                </div>
                {#if showGlobalAssetDropdown}
                    <div
                        class="absolute top-full right-0 mt-2 w-72 bg-[#0a0d12] border border-white/20 rounded-2xl shadow-2xl p-2.5 z-50 flex flex-col gap-1.5 max-h-64 overflow-y-auto"
                    >
                        <input
                            type="text"
                            value={globalAssetSearch}
                            oninput={(e) =>
                                handleGlobalAssetSearchInput(
                                    (e.currentTarget as HTMLInputElement).value
                                )}
                            placeholder="Search ticker or paste contract..."
                            class="w-full bg-[#11161f] border border-white/10 rounded-xl px-3 py-2 text-[10px] text-white outline-none"
                        />
                        {#if isDiscoveringGlobalAsset}
                            <span
                                class="text-[8px] text-[#18C6A5] animate-pulse px-1"
                            >
                                Discovering live token feed...
                            </span>
                        {:else if globalDiscoveryNotice}
                            <span class="text-[8px] text-[#18C6A5] px-1">
                                {globalDiscoveryNotice}
                            </span>
                        {/if}
                        {#each selectableGlobalAssets as item (item.ticker)}
                            {@const itemHex = item.theme?.hex || '#18C6A5'}
                            <button
                                type="button"
                                onclick={() => {
                                    ui.fiatModalTargetTicker = item.ticker;
                                    if (
                                        item.ticker !== DEFAULT_ECOSYSTEM_TICKER
                                    ) {
                                        ui.fiatModalAutoStakeSilo = false;
                                        if (
                                            globalFiatDeliveryMode ===
                                            'AUTO_STAKE_SILO'
                                        ) {
                                            globalFiatDeliveryMode = 'L1_KAS';
                                        }
                                    }
                                    showGlobalAssetDropdown = false;
                                }}
                                class="w-full text-left px-2.5 py-2 rounded-xl hover:bg-[#161d29] flex items-center justify-between text-[10px] cursor-pointer"
                            >
                                <div class="flex items-center gap-2 min-w-0">
                                    <span
                                        class="w-2 h-2 rounded-full shrink-0"
                                        style="background-color: {itemHex};"
                                    ></span>
                                    <span class="font-bold text-white truncate">
                                        {item.ticker} — {item.name}
                                    </span>
                                </div>
                                <span
                                    class="font-bold shrink-0 ml-2"
                                    style="color: {itemHex};"
                                >
                                    {item.spotPrice > 0
                                        ? formatGlobalSpotDisplay(
                                              item.spotPrice
                                          )
                                        : 'LIVE'}
                                </span>
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
            <div class="bg-[#11161f] border border-white/10 rounded-2xl p-3.5 flex flex-col gap-2.5">
                <div class="grid grid-cols-3 gap-1.5 bg-[#0a0d12] p-1 rounded-xl border border-white/5">
                    <button
                        type="button"
                        onclick={() => {
                            globalFiatDeliveryMode = 'L1_KAS';
                            ui.fiatModalAutoStakeSilo = false;
                        }}
                        class="py-2 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider cursor-pointer transition-all {globalFiatDeliveryMode ===
                            'L1_KAS' && !ui.fiatModalAutoStakeSilo
                            ? 'bg-[#161d29] text-white border border-white/15'
                            : 'text-neutral-400 hover:text-white'}"
                    >
                        Wallet
                    </button>
                    <button
                        type="button"
                        onclick={() => {
                            globalFiatDeliveryMode = 'LEDGER_KAS';
                            ui.fiatModalAutoStakeSilo = false;
                        }}
                        class="py-2 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider cursor-pointer transition-all {globalFiatDeliveryMode ===
                            'LEDGER_KAS' && !ui.fiatModalAutoStakeSilo
                            ? 'bg-[#161d29] text-white border border-white/15'
                            : 'text-neutral-400 hover:text-white'}"
                    >
                        Balance ($0 Gas)
                    </button>
                    <button
                        type="button"
                        data-testid="global-fiat-1click-silo-btn"
                        onclick={() => {
                            ui.fiatModalTargetTicker = DEFAULT_ECOSYSTEM_TICKER;
                            ui.fiatModalAutoStakeSilo = true;
                            globalFiatDeliveryMode = 'AUTO_STAKE_SILO';
                        }}
                        class="py-2 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider cursor-pointer transition-all {globalFiatDeliveryMode ===
                            'AUTO_STAKE_SILO' || ui.fiatModalAutoStakeSilo
                            ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/45'
                            : 'text-neutral-400 hover:text-[#18C6A5]'}"
                    >
                        Auto-Stake {DEFAULT_ECOSYSTEM_TICKER}
                    </button>
                </div>
                <div class="flex items-center justify-between flex-wrap gap-2 px-0.5 text-[9px]">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        <button
                            type="button"
                            data-testid="modal-rail-stripe-btn"
                            disabled={globalCostPlusPreview.requiresInstitutionalWire}
                            onclick={() => {
                                globalFiatGatewayMethod = 'ach';
                                globalFiatPaymentRail = 'SOVEREIGN_WIRE_ACH';
                            }}
                            class="px-2.5 py-1 rounded-lg font-bold uppercase border cursor-pointer transition-colors disabled:opacity-35 {globalFiatGatewayMethod ===
                                'ach' &&
                            !globalCostPlusPreview.requiresInstitutionalWire
                                ? 'bg-[#161d29] text-[#18C6A5] border-[#18C6A5]/40'
                                : 'bg-[#0a0d12] text-neutral-400 border-white/10 hover:text-white'}"
                        >
                            Bank ACH ($5 max)
                        </button>
                        <button
                            type="button"
                            disabled={globalCostPlusPreview.requiresInstitutionalWire}
                            onclick={() => {
                                globalFiatGatewayMethod = 'card';
                                globalFiatPaymentRail = 'CARD_INSTANT';
                            }}
                            class="px-2.5 py-1 rounded-lg font-bold uppercase border cursor-pointer transition-colors disabled:opacity-35 {globalFiatGatewayMethod ===
                                'card' &&
                            !globalCostPlusPreview.requiresInstitutionalWire
                                ? 'bg-[#161d29] text-[#18C6A5] border-[#18C6A5]/40'
                                : 'bg-[#0a0d12] text-neutral-400 border-white/10 hover:text-white'}"
                        >
                            Card (2.9%)
                        </button>
                        <button
                            type="button"
                            data-testid="modal-rail-bridge-wire-btn"
                            onclick={() => {
                                globalFiatGatewayMethod = 'wire';
                                globalFiatPaymentRail =
                                    'BRIDGE_VIRTUAL_ACCOUNT_WIRE';
                            }}
                            class="px-2.5 py-1 rounded-lg font-bold uppercase border cursor-pointer transition-colors {globalFiatGatewayMethod ===
                                'wire' ||
                            globalCostPlusPreview.requiresInstitutionalWire
                                ? 'bg-[#161d29] text-amber-400 border-amber-500/40'
                                : 'bg-[#0a0d12] text-neutral-400 border-white/10 hover:text-white'}"
                        >
                            Wire ($100k+)
                        </button>
                    </div>
                    {#if globalFiatGatewayMethod !== 'wire' && !globalCostPlusPreview.requiresInstitutionalWire}
                        {#if savedBankLast4}
                            <button
                                type="button"
                                onclick={() =>
                                    (showInlineBankSetup =
                                        !showInlineBankSetup)}
                                class="font-bold text-[#18C6A5] hover:underline uppercase cursor-pointer"
                            >
                                {showInlineBankSetup
                                    ? '[Close Bank ✕]'
                                    : `✓ Bank *${savedBankLast4} [Change]`}
                            </button>
                        {:else}
                            <button
                                type="button"
                                data-testid="global-fiat-link-bank-toggle-btn"
                                onclick={() =>
                                    (showInlineBankSetup =
                                        !showInlineBankSetup)}
                                class="font-bold text-amber-400 hover:underline uppercase cursor-pointer"
                            >
                                {showInlineBankSetup
                                    ? '[Hide Bank ▴]'
                                    : '[+ Link Bank Account]'}
                            </button>
                        {/if}
                    {/if}
                </div>
                {#if inlineBankBanner}
                    <div class="p-2 rounded-xl bg-[#0a0d12] border border-[#18C6A5]/40 text-[#18C6A5] text-[9px] font-bold text-center">
                        {inlineBankBanner}
                    </div>
                {/if}
                {#if globalCostPlusPreview.requiresInstitutionalWire || globalFiatGatewayMethod === 'wire' || globalFiatPaymentRail === 'BRIDGE_VIRTUAL_ACCOUNT_WIRE'}
                    <div
                        transition:slide={{ duration: 150 }}
                        class="bg-[#0a0d12] border border-amber-500/45 rounded-xl p-3 flex flex-col gap-2 text-[9px] font-mono"
                    >
                        <div class="flex items-center justify-between">
                            <span class="text-amber-400 font-black uppercase">
                                Wire Details ($0 Fee)
                            </span>
                            <span class="text-[#18C6A5] font-bold">
                                
                            </span>
                        </div>
                        <div class="grid grid-cols-2 gap-2 text-[8px]">
                            <div class="bg-[#11161f] p-2 rounded border border-white/5">
                                <span class="text-neutral-500 block">ABA ROUTING</span>
                                <span class="text-white font-black select-all">
                                    {MERCURY_COLUMN_WIRE_INSTRUCTIONS.routingNumber}
                                </span>
                            </div>
                            <div class="bg-[#11161f] p-2 rounded border border-white/5">
                                <span class="text-neutral-500 block">ACCOUNT NUMBER</span>
                                <span class="text-white font-black select-all">
                                    {MERCURY_COLUMN_WIRE_INSTRUCTIONS.accountNumber}
                                </span>
                            </div>
                        </div>
                        <div class="flex items-center justify-between text-[8px] text-neutral-400">
                            <span>{MERCURY_COLUMN_WIRE_INSTRUCTIONS.bankName}</span>
                            <span class="text-amber-300 font-bold select-all">
                                Memo: {globalWireMemoPreview}
                            </span>
                        </div>
                    </div>
                {:else if showInlineBankSetup || (!savedBankLast4 && globalFiatGatewayMethod === 'ach')}
                    <div
                        transition:slide={{ duration: 150 }}
                        class="bg-[#0a0d12] border border-white/10 rounded-xl p-3 flex flex-col gap-2.5 mt-0.5"
                    >
                        <div class="flex items-center justify-between">
                            <span class="text-[9px] font-bold uppercase text-neutral-300">
                                Bank Account
                            </span>
                            <button
                                type="button"
                                onclick={fillTestBankCredentials}
                                class="px-2 py-0.5 rounded bg-[#11161f] border border-white/10 hover:border-[#18C6A5]/45 text-[8px] font-mono text-neutral-300 hover:text-[#18C6A5] cursor-pointer"
                            >
                                Test Bank
                            </button>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div class="flex flex-col gap-1">
                                <label
                                    for="inlineAbaRouting"
                                    class="text-[8px] font-bold uppercase text-neutral-400"
                                >
                                    Routing #
                                </label>
                                <input
                                    id="inlineAbaRouting"
                                    data-testid="global-fiat-aba-input"
                                    type="text"
                                    maxlength="9"
                                    bind:value={inlineRoutingNumber}
                                    placeholder="111000614"
                                    class="bg-[#11161f] border {inlineAbaTelemetry.isComplete ? (inlineAbaTelemetry.checksumValid ? 'border-[#18C6A5]/60' : 'border-red-500/60') : 'border-white/10'} rounded-lg px-3 py-2 text-xs text-white outline-none"
                                />
                                {#if inlineAbaTelemetry.cleanDigits.length > 0}
                                    <span
                                        class="text-[8px] font-bold {inlineAbaTelemetry.isComplete && inlineAbaTelemetry.checksumValid ? 'text-[#18C6A5]' : inlineAbaTelemetry.isComplete ? 'text-red-400' : 'text-neutral-500'}"
                                    >
                                        {inlineAbaTelemetry.isComplete &&
                                        inlineAbaTelemetry.checksumValid
                                            ? `✓ ${inlineAbaTelemetry.institutionName}`
                                            : inlineAbaTelemetry.isComplete
                                              ? '✕ Invalid Routing Number'
                                              : `${inlineAbaTelemetry.cleanDigits.length}/9 digits`}
                                    </span>
                                {/if}
                            </div>
                            <div class="flex flex-col gap-1">
                                <label
                                    for="inlineBankAcct"
                                    class="text-[8px] font-bold uppercase text-neutral-400"
                                >
                                    Account Number
                                </label>
                                <input
                                    id="inlineBankAcct"
                                    data-testid="global-fiat-account-input"
                                    type="password"
                                    bind:value={inlineAccountNumber}
                                    placeholder="Account Number"
                                    class="bg-[#11161f] border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none"
                                />
                            </div>
                        </div>
                        <button
                            type="button"
                            data-testid="global-fiat-save-bank-btn"
                            onclick={saveInlineBankRail}
                            disabled={isSavingInlineBankRail ||
                                !inlineAbaTelemetry.checksumValid ||
                                inlineAccountNumber.trim().length < 4}
                            class="tactile-btn w-full py-2 rounded-lg text-[9px] font-black uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer disabled:opacity-40"
                        >
                            {isSavingInlineBankRail
                                ? 'Saving Bank Account...'
                                : 'Save Bank Account ✓'}
                        </button>
                    </div>
                {/if}
            </div>
            {#if globalFiatError || globalCostPlusPreview.circuitBreakerTripped}
                <div class="p-3 rounded-xl bg-red-950/30 border border-red-500/45 text-red-400 text-[10px] font-bold text-center">
                    ⚠ {globalFiatError ||
                        globalCostPlusPreview.circuitBreakerReason}
                </div>
            {/if}
            {#if globalFiatSuccessOrder}
                <div
                    data-testid="global-fiat-order-receipt"
                    class="bg-[#11161f] border border-[#18C6A5]/50 rounded-2xl p-4 flex flex-col gap-2.5"
                >
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <span class="text-[10px] font-black uppercase text-[#18C6A5]">
                            ✓ {globalFiatSuccessOrder.status === 'COMPLETED'
                                ? `Purchase Completed (${globalFiatSuccessOrder.orderId})`
                                : `Order ${globalFiatSuccessOrder.orderId} (${globalFiatSuccessOrder.status})`}
                        </span>
                        <div class="flex items-center gap-2">
                            {#if globalFiatSuccessOrder.status !== 'COMPLETED'}
                                <button
                                    type="button"
                                    data-testid="global-fiat-complete-settlement-btn"
                                    onclick={settleGlobalFiatOrderNow}
                                    disabled={isSettlingGlobalFiat}
                                    class="tactile-btn px-3 py-1 rounded-lg text-[8px] font-black uppercase text-white border-[#18C6A5] cursor-pointer"
                                    style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.28), transparent 70%);"
                                >
                                    {isSettlingGlobalFiat
                                        ? 'Settling...'
                                        : '[Complete Settlement ✓]'}
                                </button>
                            {/if}
                            <button
                                type="button"
                                onclick={() =>
                                    downloadWireSlipPdf(
                                        globalFiatSuccessOrder,
                                        globalFiatUsdInput
                                    )}
                                class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer"
                            >
                                Receipt PDF
                            </button>
                        </div>
                    </div>
                    <div class="text-[10px] text-neutral-300">
                        Credited <strong class="text-white"
                            >{Number(
                                globalFiatSuccessOrder.deliveredTokens ??
                                    globalFiatSuccessOrder.estimatedTokens ??
                                    globalFiatSuccessOrder.estimatedKas ??
                                    0
                            ).toLocaleString(undefined, {
                                maximumFractionDigits: 4
                            })}
                            {globalFiatSuccessOrder.targetAsset ||
                                selectedGlobalTargetAsset.ticker}</strong
                        >
                        to your balance (Memo/Ref:
                        <strong class="text-[#18C6A5] select-all"
                            >{globalFiatSuccessOrder.wireMemo ||
                                globalFiatSuccessOrder.txHash ||
                                globalFiatSuccessOrder.orderId}</strong
                        >).
                    </div>
                </div>
            {/if}
            <button
                type="button"
                data-testid="global-fiat-submit-btn"
                onclick={executeGlobalFiatPurchase}
                disabled={isSubmittingGlobalFiat ||
                    globalCostPlusPreview.circuitBreakerTripped}
                class="tactile-btn w-full py-4 rounded-2xl text-white text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-40 transition-all duration-300"
                style="
                    border-color: {targetAssetHex}65;
                    background-image: radial-gradient(ellipse at center, {targetAssetHex}28, transparent 70%);
                "
            >
                {#if isSubmittingGlobalFiat}
                    Purchasing {selectedGlobalTargetAsset.ticker}...
                {:else}
                    Buy {selectedGlobalTargetAsset.ticker} (~{globalCostPlusPreview.estimatedTokens.toLocaleString(
                        undefined,
                        { maximumFractionDigits: 4 }
                    )}
                    {selectedGlobalTargetAsset.ticker} • Total ${globalCostPlusPreview.totalGrossChargeUsd.toFixed(
                        2
                    )} USD) →
                {/if}
            </button>
        </div>
    </div>
{/if}

<WalletModal />
<SettingsModal />
<InstallAppModal />
<TutorialOverlay />

<style>
    .app-wrapper.dormant {
        background-color: var(--bg-app);
    }
    .app-wrapper.glow-active {
        background-color: var(--bg-app);
    }
</style>