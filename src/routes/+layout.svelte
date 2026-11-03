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
    import type { Worker } from '$lib/stores/type';
    import {
        evaluateAbaRoutingNumber,
        downloadWireSlipPdf,
        computeOnrampCostPlusQuote,
        type SavedBankRailMeta
    } from '$lib/components/dex/dexHelpers';
    import EntryView from '$lib/views/EntryView.svelte';
    import WalletModal from '$lib/components/WalletModal.svelte';
    import SettingsModal from '$lib/components/SettingsModal.svelte';
    import TutorialOverlay from '$lib/components/TutorialOverlay.svelte';

    let { children } = $props();
    const BACKEND_BASE = '';
    let hasEntered = $state(false);
    let headerPillShimmer = $state(false);

    // Global In-Context Fiat Modal State
    let globalFiatUsdInput = $state('500');
    let globalFiatPaymentRail = $state<'SOVEREIGN_WIRE_ACH' | 'CARD_INSTANT'>(
        'SOVEREIGN_WIRE_ACH'
    );
    let globalFiatDeliveryMode = $state<
        'LEDGER_KAS' | 'L1_KAS' | 'AUTO_STAKE_SILO'
    >('L1_KAS');
    let globalAssetSearch = $state('');
    let showGlobalAssetDropdown = $state(false);
    let isSubmittingGlobalFiat = $state(false);
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

    $effect(() => {
        if (ui.showFiatModal) {
            globalFiatUsdInput = ui.fiatModalDefaultUsd || '500';
            globalFiatError = null;
            globalFiatSuccessOrder = null;
            if (
                ui.fiatModalTargetTicker === DEFAULT_ECOSYSTEM_TICKER &&
                ui.fiatModalAutoStakeSilo
            ) {
                globalFiatDeliveryMode = 'AUTO_STAKE_SILO';
            } else if (globalFiatDeliveryMode === 'AUTO_STAKE_SILO') {
                globalFiatDeliveryMode = 'L1_KAS';
            }
            checkGlobalBankRailStatus();
        }
    });

    let selectedGlobalTargetAsset = $derived(
        treasury.getAsset(ui.fiatModalTargetTicker || 'KAS')
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
                globalFiatDeliveryMode === 'AUTO_STAKE_SILO'
        })
    );

    let selectableGlobalAssets = $derived(
        treasury.registry.filter((a) => {
            if (a.ticker === 'USD') return false;
            const q = globalAssetSearch.trim().toLowerCase();
            if (!q) return true;
            return (
                a.ticker.toLowerCase().includes(q) ||
                a.name.toLowerCase().includes(q) ||
                a.assetClass.toLowerCase().includes(q)
            );
        })
    );

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
            ui.triggerMicroBadge('header_wallet_pill', 'COPIED ✓', '#18C6A5');
            setTimeout(() => {
                headerPillShimmer = false;
            }, 650);
        }
    }

    async function checkGlobalBankRailStatus() {
        if (!browser || !identity.isWalletConnected) return;
        try {
            const res = await fetch('/api/fiat/offramp');
            if (res.ok) {
                const data = await res.json();
                savedBankLast4 = data.savedBankRailLast4 || null;
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
        } catch {
            // Ignore transient check error
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
            inlineBankBanner = `AES-256-GCM Bank Rail Linked (${resolvedLabel} • *${savedBankLast4})`;
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
            globalFiatError = 'Minimum direct purchase amount is $10.00 USD.';
            return;
        }
        if (globalCostPlusPreview.circuitBreakerTripped) {
            globalFiatError =
                globalCostPlusPreview.circuitBreakerReason ||
                'Live oracle price feed is offline; failing closed.';
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
        try {
            const res = await fetch('/api/fiat/onramp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    walletAddress: identity.activeAddress,
                    fiatAmountUsd: usdAmt,
                    targetAsset: targetTicker,
                    paymentRail: globalFiatPaymentRail,
                    settlementTarget: isAutoStakeSilo
                        ? 'AUTO_STAKE_SILO'
                        : globalFiatDeliveryMode,
                    autoStakeSilo: isAutoStakeSilo,
                    bundledKasOrSilo: isAutoStakeSilo
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(
                    data.error || 'Failed to generate Settlement Pass.'
                );
            }
            globalFiatSuccessOrder = data;
            ui.triggerMicroBadge(
                'global_fiat_btn',
                `PASS ${data.orderId || data.sessionId} RESERVED ✓`,
                '#18C6A5'
            );
            if (data.status === 'COMPLETED' && identity.activeAddress) {
                hydrateHeaderTreasuryBalances(identity.activeAddress);
            }
        } catch (err: any) {
            globalFiatError =
                err.message || 'Direct fiat purchase initialization failed.';
        } finally {
            isSubmittingGlobalFiat = false;
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
            const [balRes, ledgerRes] = await Promise.all([
                fetch(`/api/balance?address=${encodeURIComponent(walletAddr)}`),
                fetch(
                    `/api/user/ledger?wallet=${encodeURIComponent(walletAddr)}`
                )
            ]);
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
        } catch {
            // Ignore balance hydration error
        }
    }

    async function loadStateFromServer(targetWallet: string | null = null) {
        if (!browser || !identity.activeAddress || !identity.isWalletConnected)
            return;
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
        } catch {
            // Ignore transient price fetch error
        }
    }

    let priceInterval: ReturnType<typeof setInterval>;
    let epochClockInterval: ReturnType<typeof setInterval>;

    onMount(async () => {
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
                if (typeof data.isCorporateAdmin === 'boolean') {
                    identity.serverVerifiedAdmin = data.isCorporateAdmin;
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
            // Ignore initial auth check error
        }
        fetchPriceData();
        settingsStore.applyTheme();
        priceInterval = setInterval(fetchPriceData, 15000);
    });

    onDestroy(() => {
        if (priceInterval) clearInterval(priceInterval);
        if (epochClockInterval) clearInterval(epochClockInterval);
    });
</script>

<div class="theme-wrapper min-h-[100dvh] bg-app">
    {#if !hasEntered && !ui.hasEntered}
        <EntryView {enterNexus} />
    {:else}
        <div
            class="app-wrapper min-h-[100dvh] w-full flex flex-col font-sans selection:bg-[#18C6A5]/30 overflow-x-hidden {appAwakened ? 'glow-active' : 'dormant'}"
        >
            <header
                class="min-h-[4.5rem] lg:h-20 bg-[#06080b] flex items-center justify-center z-50 shrink-0 w-full sticky top-0 border-b border-white/10 py-2 lg:py-0"
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
                        <div class="hidden sm:flex flex-col">
                            <span
                                class="font-black tracking-[0.2em] text-base md:text-lg uppercase text-white leading-none"
                            >
                                PERENNIA
                            </span>
                            <span
                                class="text-[8px] font-mono uppercase tracking-widest text-neutral-500 mt-0.5"
                            >
                                {operations.globalNodeStatus === 'connected'
                                    ? 'DAG NODE ONLINE'
                                    : 'SOVEREIGN NEXUS'}
                            </span>
                        </div>
                    </button>
                    <nav
                        aria-label="Primary Command Navigation"
                        class="order-3 lg:order-2 w-full lg:w-auto flex items-center justify-start lg:justify-center overflow-x-auto hide-scrollbar"
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
                                OPERATIONS
                            </button>
                            <button
                                type="button"
                                data-testid="header-nav-DEX"
                                onclick={() => (ui.activeTab = 'DEX')}
                                class="px-3 md:px-3.5 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 {ui.activeTab === 'DEX' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/45 shadow-sm' : 'text-neutral-400 hover:text-white border border-transparent'}"
                            >
                                <span>EXCHANGE</span>
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
                                title="Open Sovereign Multi-Chain Treasury Vault"
                            >
                                <span>TREASURY</span>
                                <span
                                    class="px-2 py-0.5 rounded-lg bg-[#11161f] border border-white/10 text-[#18C6A5] font-mono font-bold text-[9px] tabular-nums"
                                >
                                    ${treasury.totalVaultValue.toLocaleString(
                                        'en-US',
                                        {
                                            minimumFractionDigits:
                                                settingsStore.fiatDecimals,
                                            maximumFractionDigits:
                                                settingsStore.fiatDecimals
                                        }
                                    )}
                                </span>
                            </button>
                            <button
                                type="button"
                                data-testid="header-nav-TAX-FORTRESS"
                                onclick={() => (ui.activeTab = 'TAX FORTRESS')}
                                class="px-3 md:px-3.5 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap {ui.activeTab === 'TAX FORTRESS' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/45 shadow-sm' : 'text-neutral-400 hover:text-white border border-transparent'}"
                            >
                                TAX FORTRESS
                            </button>
                            {#if identity.canAccessForge}
                                <button
                                    type="button"
                                    data-testid="header-nav-FORGE"
                                    onclick={() => (ui.activeTab = 'FORGE')}
                                    class="px-3 md:px-3.5 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap {ui.activeTab === 'FORGE' ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/45 shadow-sm' : 'text-neutral-400 hover:text-white border border-transparent'}"
                                >
                                    FORGE
                                </button>
                            {/if}
                            {#if identity.isCorporateAdmin}
                                <button
                                    type="button"
                                    data-testid="header-nav-DIRECTOR"
                                    onclick={() => (ui.activeTab = 'DIRECTOR')}
                                    class="px-3 md:px-3.5 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest transition-all cursor-pointer whitespace-nowrap {ui.activeTab === 'DIRECTOR' ? 'bg-[#161d29] text-amber-400 border border-amber-500/45 shadow-sm' : 'text-amber-400/80 hover:text-amber-300 border border-transparent'}"
                                >
                                    DIRECTOR
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
                                    ui.openFiatModal('KAS', false, '500')}
                                class="tactile-btn px-3.5 py-2 rounded-xl text-[10px] font-mono font-black uppercase tracking-widest cursor-pointer flex items-center gap-1.5 text-[#18C6A5] border-[#18C6A5]/50 whitespace-nowrap"
                                style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.22), transparent 70%);"
                                title="Buy KAS, SILO, BTC, or Any Token with USD (Zero-Loss Cost-Plus)"
                            >
                                <span class="text-xs font-black">$</span>
                                <span>Buy Crypto</span>
                            </button>
                        </div>
                        <button
                            type="button"
                            aria-label="Settings"
                            data-testid="header-settings-btn"
                            onclick={() =>
                                (settingsStore.showSettingsModal = true)}
                            class="tactile-btn w-9 h-9 rounded-xl {settingsStore.showSettingsModal || ui.isTutorialActive ? 'text-[#18C6A5] border-[#18C6A5]/45' : 'text-neutral-400 hover:text-white'} flex items-center justify-center cursor-pointer shrink-0"
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
                                onclick={() => (ui.showWalletModal = true)}
                                class="tactile-btn px-4 md:px-5 py-2 border-[#18C6A5]/40 text-[#18C6A5] hover:text-white text-[10px] font-mono font-black uppercase tracking-widest rounded-xl cursor-pointer whitespace-nowrap"
                                style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.16), transparent 70%);"
                            >
                                Unlock Vault
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
                                    title="Click to copy Sovereign Kaspa Address"
                                >
                                    <div
                                        class="w-2 h-2 rounded-full {operations.globalNodeStatus === 'connected' ? 'bg-[#18C6A5] animate-pulse' : operations.globalNodeStatus === 'unreachable' ? 'bg-amber-500' : 'bg-neutral-600'} shrink-0"
                                    ></div>
                                    <span
                                        class="{operations.globalNodeStatus === 'connected' ? 'text-[#18C6A5]' : operations.globalNodeStatus === 'unreachable' ? 'text-amber-500' : 'text-neutral-400'} font-mono text-[10px] font-bold truncate max-w-[90px] md:max-w-none group-hover:text-white transition-colors"
                                    >
                                        {identity.activeAddress?.substring(
                                            0,
                                            10
                                        )}...{identity.activeAddress?.substring(
                                            identity.activeAddress.length - 4
                                        )}
                                    </span>
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
            <main class="flex-1 overflow-y-auto relative pb-24 mt-2">
                <div class="w-full h-full relative z-10">
                    {@render children()}
                </div>
            </main>
        </div>
    {/if}
</div>

{#if ui.showFiatModal}
    <div
        data-testid="global-fiat-modal"
        class="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-[#06080b]/92 font-mono overflow-y-auto"
        transition:fade={{ duration: 150 }}
    >
        <button
            type="button"
            aria-label="Close Fiat Purchase Modal"
            onclick={() => ui.closeFiatModal()}
            class="fixed inset-0 w-full h-full bg-transparent border-none cursor-default"
        ></button>
        <div
            class="relative z-10 w-full max-w-[700px] bg-[#0a0d12] border border-[#18C6A5]/45 rounded-[28px] p-6 md:p-7 shadow-[0_24px_80px_rgba(0,0,0,0.95)] flex flex-col gap-4 my-auto"
            style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.14), transparent 65%);"
        >
            <div
                class="flex items-start justify-between gap-3 border-b border-white/10 pb-3.5"
            >
                <div class="flex flex-col">
                    <div class="flex items-center gap-2">
                        <span
                            class="w-2 h-2 rounded-full bg-[#18C6A5] animate-pulse"
                        ></span>
                        <h2
                            class="text-xs md:text-sm font-black uppercase tracking-widest text-white"
                        >
                            Zero-Loss Cost-Plus On-Ramp &amp; Single-Hop
                            Drop-Ship
                        </h2>
                    </div>
                    <span class="text-[9px] text-neutral-400 mt-0.5">
                        Direct Bank-to-Self-Custody or 1-Click SILO Auto-Stake •
                        Zero Batch Waiting
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
                class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-3"
            >
                <div class="flex items-center justify-between flex-wrap gap-2">
                    <span
                        class="text-[10px] font-black uppercase tracking-widest text-[#18C6A5]"
                    >
                        Step 1 • Instant Payout Calculator
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
                                onclick={() =>
                                    (globalFiatUsdInput = preset.val)}
                                class="tactile-btn px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase whitespace-nowrap cursor-pointer {globalFiatUsdInput === preset.val ? 'text-[#18C6A5] border-[#18C6A5]/45' : 'text-neutral-400 hover:text-white'}"
                            >
                                {preset.label}
                            </button>
                        {/each}
                    </div>
                </div>
                <div
                    class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-stretch"
                >
                    <div
                        class="sm:col-span-6 bg-[#0a0d12] border border-white/10 rounded-xl p-3.5 flex flex-col justify-between"
                    >
                        <label
                            for="globalFiatUsdAmount"
                            class="text-[8px] font-bold uppercase tracking-widest text-neutral-500"
                        >
                            You Pay (USD Bank ACH / Whale Wire)
                        </label>
                        <div class="flex items-center gap-1 mt-1">
                            <span class="text-neutral-500 text-xl font-bold"
                                >$</span
                            >
                            <input
                                id="globalFiatUsdAmount"
                                data-testid="global-fiat-usd-input"
                                type="number"
                                min="10"
                                bind:value={globalFiatUsdInput}
                                class="w-full bg-transparent text-2xl font-black text-white outline-none tabular-nums"
                            />
                            <span
                                class="text-[10px] font-bold text-neutral-400 px-2 py-0.5 rounded bg-[#11161f] border border-white/10"
                            >
                                USD
                            </span>
                        </div>
                        <span class="text-[8px] text-neutral-400 mt-1">
                            {globalCostPlusPreview.railLabel} • Net Converted:
                            <strong class="text-white"
                                >${globalCostPlusPreview.guestNetUsd.toFixed(
                                    2
                                )}</strong
                            >
                            (Fee: ${globalCostPlusPreview.feeUsd.toFixed(2)})
                        </span>
                    </div>
                    <div
                        class="sm:col-span-6 bg-[#0a0d12] border border-[#18C6A5]/35 rounded-xl p-3.5 flex flex-col justify-between relative"
                    >
                        <div class="flex items-center justify-between">
                            <span
                                class="text-[8px] font-bold uppercase tracking-widest text-[#18C6A5]"
                            >
                                You Receive (Est. Output)
                            </span>
                            <span class="text-[8px] text-neutral-400">
                                {#if globalCostPlusPreview.spotPriceUsd > 0}
                                    Spot: ${globalCostPlusPreview.spotPriceUsd <
                                    0.01
                                        ? globalCostPlusPreview.spotPriceUsd.toFixed(
                                              6
                                          )
                                        : globalCostPlusPreview.spotPriceUsd.toFixed(
                                              4
                                          )}
                                {:else}
                                    Oracle Syncing...
                                {/if}
                            </span>
                        </div>
                        <div
                            class="flex items-center justify-between gap-2 mt-1"
                        >
                            <span
                                data-testid="global-fiat-estimated-output"
                                class="text-xl font-black text-[#18C6A5] tabular-nums truncate"
                            >
                                ≈ {globalCostPlusPreview.estimatedTokens.toLocaleString(
                                    undefined,
                                    {
                                        maximumFractionDigits:
                                            globalCostPlusPreview.estimatedTokens <
                                            1
                                                ? 6
                                                : 2
                                    }
                                )}
                            </span>
                            <button
                                type="button"
                                data-testid="global-fiat-asset-selector-btn"
                                onclick={() =>
                                    (showGlobalAssetDropdown =
                                        !showGlobalAssetDropdown)}
                                class="tactile-btn px-3 py-1.5 rounded-xl border-[#18C6A5]/45 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shrink-0 cursor-pointer"
                            >
                                <span>{selectedGlobalTargetAsset.ticker}</span>
                                <span class="text-[9px] text-neutral-400"
                                    >▾</span
                                >
                            </button>
                        </div>
                        <span class="text-[8px] text-neutral-400 mt-1 truncate">
                            {globalCostPlusPreview.routingTopology}
                        </span>
                        {#if showGlobalAssetDropdown}
                            <div
                                class="absolute top-full right-0 mt-1.5 w-64 bg-[#0a0d12] border border-white/20 rounded-2xl shadow-2xl p-2 z-50 flex flex-col gap-1.5 max-h-60 overflow-y-auto"
                            >
                                <input
                                    type="text"
                                    bind:value={globalAssetSearch}
                                    placeholder="Filter KAS, SILO, BTC, NVDA..."
                                    class="w-full bg-[#11161f] border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-white outline-none"
                                />
                                {#each selectableGlobalAssets as item (item.ticker)}
                                    <button
                                        type="button"
                                        onclick={() => {
                                            ui.fiatModalTargetTicker =
                                                item.ticker;
                                            if (
                                                item.ticker !==
                                                DEFAULT_ECOSYSTEM_TICKER
                                            ) {
                                                ui.fiatModalAutoStakeSilo = false;
                                                if (
                                                    globalFiatDeliveryMode ===
                                                    'AUTO_STAKE_SILO'
                                                ) {
                                                    globalFiatDeliveryMode =
                                                        'L1_KAS';
                                                }
                                            }
                                            showGlobalAssetDropdown = false;
                                        }}
                                        class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#161d29] flex items-center justify-between text-[10px] cursor-pointer"
                                    >
                                        <span class="font-bold text-white"
                                            >{item.ticker} — {item.name}</span
                                        >
                                        <span class="text-[#18C6A5] font-bold">
                                            ${item.spotPrice > 0
                                                ? item.spotPrice < 0.01
                                                    ? item.spotPrice.toFixed(4)
                                                    : item.spotPrice.toFixed(2)
                                                : 'LIVE'}
                                        </span>
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
                <div
                    data-testid="global-fiat-competitor-savings-badge"
                    class="bg-[#0a0d12] border border-[#18C6A5]/45 rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2"
                >
                    <span class="text-[11px] font-black text-[#18C6A5]">
                        You keep +${globalCostPlusPreview.guestSavingsUsd.toFixed(
                            2
                        )} more than Uphold &amp; Retail Exchange Apps.
                    </span>
                    <span class="text-[9px] text-neutral-400">
                        Perennia Net: ${globalCostPlusPreview.guestNetUsd.toFixed(
                            2
                        )} vs. Uphold: ${globalCostPlusPreview.competitorNetUsd.toFixed(
                            2
                        )}
                    </span>
                </div>
                <div class="flex flex-wrap items-center gap-1.5 pt-1">
                    <span class="text-[8px] text-neutral-500 uppercase mr-1"
                        >Quick Asset:</span
                    >
                    {#each ['KAS', 'BTC', 'ETH', 'SOL', 'USDC', 'SILO', 'NVDA', 'SPY', 'XAU'] as quickTick}
                        <button
                            type="button"
                            onclick={() => {
                                ui.fiatModalTargetTicker = quickTick;
                                if (quickTick !== DEFAULT_ECOSYSTEM_TICKER) {
                                    ui.fiatModalAutoStakeSilo = false;
                                    if (
                                        globalFiatDeliveryMode ===
                                        'AUTO_STAKE_SILO'
                                    ) {
                                        globalFiatDeliveryMode = 'L1_KAS';
                                    }
                                }
                            }}
                            class="px-2.5 py-0.5 rounded-md text-[9px] font-bold uppercase border cursor-pointer transition-colors {ui.fiatModalTargetTicker === quickTick ? 'bg-[#161d29] text-[#18C6A5] border-[#18C6A5]/45' : 'bg-[#0a0d12] text-neutral-400 border-white/10 hover:text-white'}"
                        >
                            {quickTick}
                        </button>
                    {/each}
                </div>
            </div>
            <div
                class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-3"
            >
                <div class="flex items-center justify-between flex-wrap gap-2">
                    <span
                        class="text-[10px] font-black uppercase tracking-widest text-white"
                    >
                        Step 2 • Destination Upgrade &amp; Bank Vault
                    </span>
                    {#if savedBankLast4}
                        <button
                            type="button"
                            onclick={() =>
                                (showInlineBankSetup = !showInlineBankSetup)}
                            class="text-[9px] font-bold text-[#18C6A5] hover:underline uppercase cursor-pointer"
                        >
                            {showInlineBankSetup
                                ? '[Close Bank Editor ✕]'
                                : `✓ Linked Bank *${savedBankLast4} [Change]`}
                        </button>
                    {:else}
                        <button
                            type="button"
                            data-testid="global-fiat-link-bank-toggle-btn"
                            onclick={() =>
                                (showInlineBankSetup = !showInlineBankSetup)}
                            class="text-[9px] font-bold text-amber-400 hover:underline uppercase cursor-pointer"
                        >
                            {showInlineBankSetup
                                ? '[Hide Bank Setup ▴]'
                                : '[+ Link Bank Account (Mod-10 ABA)]'}
                        </button>
                    {/if}
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                        type="button"
                        onclick={() => {
                            globalFiatDeliveryMode = 'L1_KAS';
                            ui.fiatModalAutoStakeSilo = false;
                        }}
                        class="p-3 rounded-xl border text-left cursor-pointer flex flex-col gap-1 {globalFiatDeliveryMode !== 'AUTO_STAKE_SILO' && !ui.fiatModalAutoStakeSilo ? 'bg-[#161d29] border-[#18C6A5] text-white' : 'bg-[#0a0d12] border-white/10 text-neutral-400'}"
                    >
                        <span class="text-[10px] font-black uppercase text-white">
                            Direct to Self-Custody Wallet
                        </span>
                        <span class="text-[9px] text-neutral-300">
                            "100% yours the moment settlement clears—no 65-day
                            exchange holds."
                        </span>
                    </button>
                    <button
                        type="button"
                        data-testid="global-fiat-1click-silo-btn"
                        onclick={() => {
                            ui.fiatModalTargetTicker = DEFAULT_ECOSYSTEM_TICKER;
                            ui.fiatModalAutoStakeSilo = true;
                            globalFiatDeliveryMode = 'AUTO_STAKE_SILO';
                        }}
                        class="p-3 rounded-xl border text-left cursor-pointer flex flex-col gap-1 {globalFiatDeliveryMode === 'AUTO_STAKE_SILO' || ui.fiatModalAutoStakeSilo ? 'bg-[#161d29] border-[#18C6A5] text-white' : 'bg-[#0a0d12] border-white/10 text-neutral-400'}"
                    >
                        <span class="text-[10px] font-black uppercase text-[#18C6A5]">
                            1-Click Auto-Stake to SILO Vault
                        </span>
                        <span class="text-[9px] text-neutral-300">
                            "Skip the extra swap and earn vault yield
                            immediately."
                        </span>
                    </button>
                </div>
                {#if inlineBankBanner}
                    <div
                        class="p-2.5 rounded-xl bg-[#0a0d12] border border-[#18C6A5]/40 text-[#18C6A5] text-[9px] font-bold text-center"
                    >
                        {inlineBankBanner}
                    </div>
                {/if}
                {#if showInlineBankSetup}
                    <div
                        transition:slide={{ duration: 150 }}
                        class="bg-[#0a0d12] border border-white/10 rounded-xl p-3.5 flex flex-col gap-2.5"
                    >
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div class="flex flex-col gap-1">
                                <label
                                    for="inlineAbaRouting"
                                    class="text-[8px] font-bold uppercase text-neutral-400"
                                >
                                    9-Digit ABA Routing Number
                                </label>
                                <input
                                    id="inlineAbaRouting"
                                    data-testid="global-fiat-aba-input"
                                    type="text"
                                    maxlength="9"
                                    bind:value={inlineRoutingNumber}
                                    placeholder="021000021"
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
                                              ? '✕ Invalid ABA Mod-10 Checksum'
                                              : `Digits: ${inlineAbaTelemetry.cleanDigits.length}/9`}
                                    </span>
                                {/if}
                            </div>
                            <div class="flex flex-col gap-1">
                                <label
                                    for="inlineBankAcct"
                                    class="text-[8px] font-bold uppercase text-neutral-400"
                                >
                                    Checking / Savings Account Number
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
                                ? 'Encrypting Bank Rail...'
                                : 'Save Encrypted Bank Rail & Arm 1-Click ACH ✓'}
                        </button>
                    </div>
                {/if}
            </div>
            {#if globalFiatError || globalCostPlusPreview.circuitBreakerTripped}
                <div
                    class="p-3 rounded-xl bg-red-950/30 border border-red-500/45 text-red-400 text-[10px] font-bold text-center"
                >
                    ⚠ {globalFiatError ||
                        globalCostPlusPreview.circuitBreakerReason}
                </div>
            {/if}
            {#if globalFiatSuccessOrder}
                <div
                    data-testid="global-fiat-order-receipt"
                    class="bg-[#11161f] border border-[#18C6A5]/50 rounded-2xl p-4 flex flex-col gap-2.5"
                >
                    <div class="flex items-center justify-between">
                        <span
                            class="text-[10px] font-black uppercase text-[#18C6A5]"
                        >
                            ✓ Settlement Pass {globalFiatSuccessOrder.orderId} Reserved
                            ({globalFiatSuccessOrder.status})
                        </span>
                        <button
                            type="button"
                            onclick={() =>
                                downloadWireSlipPdf(
                                    globalFiatSuccessOrder,
                                    globalFiatUsdInput
                                )}
                            class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer"
                        >
                            [Download Wire Slip PDF ↓]
                        </button>
                    </div>
                    <div class="text-[10px] text-neutral-300">
                        Reserved <strong class="text-white"
                            >~{Number(
                                globalFiatSuccessOrder.estimatedTokens ??
                                    globalFiatSuccessOrder.estimatedKas ??
                                    0
                            ).toLocaleString(undefined, {
                                maximumFractionDigits: 4
                            })}
                            {globalFiatSuccessOrder.targetAsset ||
                                selectedGlobalTargetAsset.ticker}</strong
                        >
                        (Memo:
                        <strong class="text-[#18C6A5] select-all"
                            >{globalFiatSuccessOrder.wireMemo ||
                                globalFiatSuccessOrder.orderId}</strong
                        >) • Saves +${Number(
                            globalFiatSuccessOrder.guestSavingsUsd ??
                                globalCostPlusPreview.guestSavingsUsd
                        ).toFixed(2)} USD vs. Uphold &amp; Retail Apps.
                    </div>
                </div>
            {/if}
            <button
                type="button"
                data-testid="global-fiat-submit-btn"
                onclick={executeGlobalFiatPurchase}
                disabled={isSubmittingGlobalFiat ||
                    globalCostPlusPreview.circuitBreakerTripped}
                class="tactile-btn w-full py-4 rounded-2xl text-white border-[#18C6A5]/50 text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.24), transparent 70%);"
            >
                {#if isSubmittingGlobalFiat}
                    Generating Reserved Settlement Pass...
                {:else}
                    Generate Settlement Pass → (~{globalCostPlusPreview.estimatedTokens.toLocaleString(
                        undefined,
                        { maximumFractionDigits: 4 }
                    )}
                    {selectedGlobalTargetAsset.ticker} for ${globalCostPlusPreview.grossUsd.toFixed(
                        2
                    )} USD)
                {/if}
            </button>
        </div>
    </div>
{/if}

<WalletModal />
<SettingsModal />
<TutorialOverlay />

<style>
    .app-wrapper.dormant {
        background-color: var(--bg-app);
    }
    .app-wrapper.glow-active {
        background-color: var(--bg-app);
    }
</style>