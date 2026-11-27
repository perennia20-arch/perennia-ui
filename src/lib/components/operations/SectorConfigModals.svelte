<script lang="ts">
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { txState, getChainExplorerTxUrl } from '$lib/stores/transaction.svelte';
    import { fade } from 'svelte/transition';
    import { treasury, type UnifiedAsset } from '$lib/stores/treasury.svelte';
    import {
        LIVE_PRICING_UNAVAILABLE_MESSAGE,
        formatAtomicToDecimal,
        parseDecimalToAtomic,
        parseU128Str,
        type RegisterVaultLockPayload,
        type VaultCancelPsktResponse,
        type VaultKind,
        type VaultLockRecord
    } from '$lib/crypto/atomicMath';
    import {
        dexAtomicDecimals
    } from '$lib/components/dex/dexHelpers';
    import LiquidityAndSiloPanel from '$lib/components/dex/LiquidityAndSiloPanel.svelte';
    import type {
        Sector,
        SettlementConfig,
        PlantAssetTarget,
        PairFeeRateBps,
        PairFundMode,
        PairTermOption
    } from '$lib/stores/type';
    import {
        DEFAULT_PAIR_FEE_RATE_BPS,
        DEFAULT_PAIR_TERM,
        DEFAULT_VAULT_THRESHOLD_KAS,
        PAIR_FEE_RATE_PRESETS,
        PAIR_TERM_PRESETS,
        buildRegisterVaultLockPayload,
        buildUpsertThermostatValvesPayload,
        computeHashrateQuickFillPct,
        computeWalletQuickFillDecimal,
        executeOwnerVaultCancelBroadcast,
        formatSompiToKasDisplay,
        formatVaultKindLabel,
        hydrateSectorTargetAssets,
        postSovereignStateAction,
        resolveTargetNetworkForAsset,
        sanitizeRetailCopy,
        type MineableKrc20VaultInfo,
        type ThermostatValveDraft
    } from './operationsHelpers';

    let {
        isSectorModalOpen = $bindable(false),
        sectorModalMode = 'split',
        pairFundMode = $bindable<PairFundMode>('WALLET'),
        splitWalletBoostOpen = $bindable(false),
        draftPairFeeBps = $bindable<PairFeeRateBps>(DEFAULT_PAIR_FEE_RATE_BPS),
        draftPairTerm = $bindable<PairTermOption>(DEFAULT_PAIR_TERM),
        draftSectorName = $bindable(''),
        draftSectorPct = $bindable(0),
        draftSectorMax = $bindable(0),
        draftSelectedAssets = $bindable([]),
        draftIsSyndicateSector = $bindable(false),
        draftSettlementConfig = $bindable(),
        settlementModalSilo = $bindable(null),
        editSectorName = $bindable(''),
        editSettlementParams = $bindable(),
        editSelectedAssets = $bindable([]),
        isSigningSettlement = $bindable(false),
        isVaultModalOpen = $bindable(false),
        vaultModalPreset = null,
        cancelVaultTarget = $bindable(null),
        cancelVaultPreview = $bindable(null),
        isThermostatModalOpen = $bindable(false),
        thermostatDrafts = $bindable([]),
        pairPartnerTicker = $bindable('SILO'),
        initialPairSwapPayTicker = $bindable('KAS'),
        initialPairSwapAmount = $bindable(''),
        isSubmittingPair = false,
        pairSubmitError = null,
        livePricingUnavailable = false,
        displayHashrate = 0,
        mineableVaultMap = new Map(),
        savedBankRailLast4 = null,
        savedBankRailMethod = 'ACH',
        refundKaspaAddress = '',
        resolveChainAddressForTicker = () => '',
        onUpdateDraftPct,
        onUpdateDraftHash,
        onCreateSector,
        onExecutePairFlow,
        onSaveSettlementParams,
        onEqualizeSecondaryWeights,
        onAdjustSecondaryPlantWeight,
        onRemoveAssetFromSector,
        onAddOrToggleAssetInSector,
        onVaultRegistered,
        onVaultCancelled,
        onThermostatSaved
    }: {
        isSectorModalOpen: boolean;
        sectorModalMode?: 'split' | 'pair';
        pairFundMode?: PairFundMode;
        splitWalletBoostOpen?: boolean;
        draftPairFeeBps?: PairFeeRateBps;
        draftPairTerm?: PairTermOption;
        draftSectorName: string;
        draftSectorPct: number;
        draftSectorMax: number;
        draftSelectedAssets: PlantAssetTarget[];
        draftIsSyndicateSector: boolean;
        draftSettlementConfig: SettlementConfig;
        settlementModalSilo: Sector | null;
        editSectorName: string;
        editSettlementParams: SettlementConfig;
        editSelectedAssets: PlantAssetTarget[];
        isSigningSettlement: boolean;
        isVaultModalOpen?: boolean;
        vaultModalPreset?: Partial<RegisterVaultLockPayload> | null;
        cancelVaultTarget?: VaultLockRecord | null;
        cancelVaultPreview?: VaultCancelPsktResponse | null;
        isThermostatModalOpen?: boolean;
        thermostatDrafts?: ThermostatValveDraft[];
        pairPartnerTicker?: string;
        initialPairSwapPayTicker?: string;
        initialPairSwapAmount?: string;
        isSubmittingPair?: boolean;
        pairSubmitError?: string | null;
        livePricingUnavailable?: boolean;
        displayHashrate: number;
        mineableVaultMap: Map<string, MineableKrc20VaultInfo>;
        savedBankRailLast4: string | null;
        savedBankRailMethod: string;
        refundKaspaAddress?: string;
        resolveChainAddressForTicker?: (ticker: string) => string;
        onUpdateDraftPct: (valStr: string) => void;
        onUpdateDraftHash: (valStr: string) => void;
        onCreateSector: () => Promise<void>;
        onExecutePairFlow?: (params: {
            baseTicker: string;
            partnerTicker: string;
            baseAmount: string;
            feeRateBps: PairFeeRateBps;
            allocationPct: number;
        }) => Promise<void>;
        onSaveSettlementParams: () => Promise<void>;
        onEqualizeSecondaryWeights: (mode: 'create' | 'edit') => void;
        onAdjustSecondaryPlantWeight: (
            mode: 'create' | 'edit',
            ticker: string,
            pct: number
        ) => void;
        onRemoveAssetFromSector: (mode: 'create' | 'edit', ticker: string) => void;
        onAddOrToggleAssetInSector: (
            mode: 'create' | 'edit',
            asset: UnifiedAsset,
            actionMode:
                | 'replace_primary'
                | 'add_secondary'
                | 'replace_pair_slot_0'
                | 'replace_pair_slot_1'
        ) => void;
        onVaultRegistered?: () => Promise<void>;
        onVaultCancelled?: (txId: string) => Promise<void>;
        onThermostatSaved?: () => Promise<void>;
    } = $props();

    let assetPickerTarget = $state<'create' | 'edit'>('create');
    let assetPickerActionMode = $state<
        'replace_primary' | 'add_secondary' | 'replace_pair_slot_0' | 'replace_pair_slot_1'
    >('replace_primary');
    let isAssetPickerOpen = $state(false);
    let assetSearchQuery = $state('');
    let isSearchingAssets = $state(false);
    let discoveredPickerAssets = $state<UnifiedAsset[]>([]);
    let assetDiscoverTimer: ReturnType<typeof setTimeout> | undefined;
    let searchSeq = 0;
    let assetCategoryFilter = $state<'ALL' | 'CRYPTO' | 'EQUITIES' | 'COMMODITIES' | 'MINEABLE'>('ALL');

    // Sovereign Vault Lock Registration State
    let vaultKindInput = $state<VaultKind>('MINER_SILO');
    let vaultTargetAssetInput = $state('USDC');
    let vaultTargetNetworkInput = $state('BASE');
    let vaultDestAddressInput = $state('');
    let vaultRefundAddressInput = $state('');
    let vaultThresholdKasInput = $state(DEFAULT_VAULT_THRESHOLD_KAS);
    let vaultTokenTickerInput = $state('');
    let isSubmittingVaultLock = $state(false);
    let vaultLockError = $state<string | null>(null);

    // Owner-Signed Vault Cancellation State
    let cancelVaultPassword = $state('');
    let isSigningVaultCancel = $state(false);
    let cancelVaultError = $state<string | null>(null);
    let cancelVaultTxId = $state<string | null>(null);

    // 4-Valve Thermostat Modal State
    let isSavingThermostat = $state(false);
    let thermostatError = $state<string | null>(null);

    // Pair & Split modal state
    let pairPayAssetChoices = $derived.by(() => {
        const defaults = ['KAS', 'USDC', 'USDT', 'BTC', 'ETH', 'SOL'];
        const withBalances = (treasury.assets || [])
            .filter((a) => (a.onChain || 0) > 0 || defaults.includes(a.ticker))
            .map((a) => a.ticker);
        return Array.from(new Set([...withBalances, ...defaults])).slice(0, 16);
    });
    let splitPayAssetChoices = $derived(
        pairPayAssetChoices.filter(
            (t) => t !== (draftSettlementConfig?.targetAsset?.ticker || '').toUpperCase()
        )
    );
    let selectedPayAsset = $derived(treasury.getAsset(initialPairSwapPayTicker));
    let payBalanceAtomic = $derived.by(() => {
        try {
            return parseU128Str(selectedPayAsset?.onChainAtomic || '0', 'onChainAtomic');
        } catch {
            return 0n;
        }
    });
    let formattedPayBalance = $derived(
        formatAtomicToDecimal(
            payBalanceAtomic,
            selectedPayAsset?.decimals ?? dexAtomicDecimals(initialPairSwapPayTicker),
            4,
            false
        )
    );
    const isPositiveDecimalInput = (raw: string): boolean => {
        const trimmed = String(raw || '').trim();
        return /^\d+(\.\d+)?$/.test(trimmed) && /[1-9]/.test(trimmed);
    };

    $effect(() => () => {
        clearTimeout(assetDiscoverTimer);
        clearTimeout(pairSwapQuoteTimer);
        clearTimeout(createSwapQuoteTimer);
    });
    $effect(() => {
        if (!isAssetPickerOpen) {
            discoveredPickerAssets = [];
            isSearchingAssets = false;
        }
    });
    $effect(() => {
        if (isAssetPickerOpen) {
            ui.syncSubOverlay('ops_asset_picker', true, () => {
                isAssetPickerOpen = false;
                assetSearchQuery = '';
            });
        } else if (isSectorModalOpen) {
            ui.syncSubOverlay('ops_new_split', true, () => {
                isSectorModalOpen = false;
            });
        } else {
            ui.syncSubOverlay('ops_asset_picker', false, () => {});
        }
    });

    $effect(() => {
        if (isVaultModalOpen) {
            const presetAsset = String(vaultModalPreset?.targetAsset || 'USDC').toUpperCase();
            vaultKindInput = vaultModalPreset?.vaultKind || 'MINER_SILO';
            vaultTargetAssetInput = presetAsset;
            vaultTargetNetworkInput = String(
                vaultModalPreset?.targetNetwork || resolveTargetNetworkForAsset(presetAsset)
            ).toUpperCase();
            vaultDestAddressInput =
                vaultModalPreset?.destinationAddress ||
                resolveChainAddressForTicker(presetAsset) ||
                refundKaspaAddress ||
                identity.activeAddress ||
                '';
            vaultRefundAddressInput =
                vaultModalPreset?.refundKaspaAddress ||
                refundKaspaAddress ||
                identity.activeAddress ||
                '';
            vaultThresholdKasInput = DEFAULT_VAULT_THRESHOLD_KAS;
            vaultTokenTickerInput = String(vaultModalPreset?.kcc20TokenTicker || '');
            vaultLockError = null;
        }
    });

    $effect(() => {
        if (!cancelVaultTarget) {
            cancelVaultPassword = '';
            cancelVaultError = null;
            cancelVaultTxId = null;
        }
    });

    function handleModalAssetSearchInput(raw: string) {
        assetSearchQuery = raw;
        const trimmed = raw.trim();
        if (trimmed.length > 0 && assetCategoryFilter !== 'ALL') assetCategoryFilter = 'ALL';
        clearTimeout(assetDiscoverTimer);
        if (trimmed.length < 2) {
            isSearchingAssets = false;
            discoveredPickerAssets = [];
            return;
        }
        const seq = ++searchSeq;
        isSearchingAssets = true;
        assetDiscoverTimer = setTimeout(async () => {
            try {
                const res = await treasury.discoverAndRegisterToken(trimmed, true);
                if (seq === searchSeq && Array.isArray(res?.matches)) {
                    discoveredPickerAssets = res.matches;
                }
            } finally {
                if (seq === searchSeq) isSearchingAssets = false;
            }
        }, 200);
    }

    function selectCustomModalTicker() {
        const clean = assetSearchQuery
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, 10);
        if (clean.length < 2) return;
        const customAsset = treasury.registerDiscoveredAsset(
            {
                ticker: clean,
                name: `${clean} (Custom Asset)`,
                assetClass: 'Ecosystem',
                network: 'KAS',
                contract: clean
            },
            true
        );
        onAddOrToggleAssetInSector(assetPickerTarget, customAsset, assetPickerActionMode);
        isAssetPickerOpen = false;
        assetSearchQuery = '';
        discoveredPickerAssets = [];
    }

    async function submitRegisterVaultLock() {
        vaultLockError = null;
        isSubmittingVaultLock = true;
        try {
            const payload = buildRegisterVaultLockPayload({
                vaultKind: vaultKindInput,
                targetAsset: vaultTargetAssetInput,
                targetNetwork: vaultTargetNetworkInput,
                destinationAddress: vaultDestAddressInput,
                refundKaspaAddress: vaultRefundAddressInput,
                thresholdKasInput: vaultThresholdKasInput,
                kcc20TokenTicker: vaultTokenTickerInput
            });
            const targetWallet =
                identity.isCorporateAdmin && ui.adminModeActive && ui.adminTargetWallet
                    ? ui.adminTargetWallet
                    : undefined;
            const res = await postSovereignStateAction(
                'REGISTER_VAULT_LOCK',
                payload as Record<string, unknown>,
                targetWallet
            );
            if (!res.ok) {
                vaultLockError = res.error || 'Could not activate vault lock.';
                return;
            }
            isVaultModalOpen = false;
            if (onVaultRegistered) await onVaultRegistered();
        } catch (err: unknown) {
            vaultLockError = sanitizeRetailCopy(
                err instanceof Error ? err.message : 'Invalid vault settings.'
            );
        } finally {
            isSubmittingVaultLock = false;
        }
    }

    async function submitOwnerVaultCancel() {
        if (!cancelVaultTarget || !cancelVaultPreview) return;
        cancelVaultError = null;
        isSigningVaultCancel = true;
        try {
            const { txId } = await executeOwnerVaultCancelBroadcast({
                cancelPreview: cancelVaultPreview,
                redeemScriptHex: cancelVaultTarget.redeemScriptHex,
                vaultPassword: cancelVaultPassword
            });
            cancelVaultTxId = txId;
            cancelVaultPassword = '';
            if (onVaultCancelled) await onVaultCancelled(txId);
        } catch (err: unknown) {
            cancelVaultError = sanitizeRetailCopy(
                err instanceof Error ? err.message : 'Could not sign return transaction.'
            );
        } finally {
            isSigningVaultCancel = false;
        }
    }

    async function submitThermostatValves() {
        thermostatError = null;
        isSavingThermostat = true;
        try {
            const payload = buildUpsertThermostatValvesPayload(thermostatDrafts);
            const targetWallet =
                identity.isCorporateAdmin && ui.adminModeActive && ui.adminTargetWallet
                    ? ui.adminTargetWallet
                    : undefined;
            const res = await postSovereignStateAction(
                'UPSERT_THERMOSTAT_VALVES',
                payload as Record<string, unknown>,
                targetWallet
            );
            if (!res.ok) {
                thermostatError = res.error || 'Could not save payout priority rules.';
                return;
            }
            isThermostatModalOpen = false;
            if (onThermostatSaved) await onThermostatSaved();
        } catch (err: unknown) {
            thermostatError = sanitizeRetailCopy(
                err instanceof Error ? err.message : 'Invalid priority rule settings.'
            );
        } finally {
            isSavingThermostat = false;
        }
    }

    let isDraftMultiAssetPlant = $derived(draftSelectedAssets.length >= 2);
    let isPairFlow = $derived(sectorModalMode === 'pair' || isDraftMultiAssetPlant);
    let createHasSwapAmt = $derived(isPositiveDecimalInput(initialPairSwapAmount));
    let walletSwapSelected = $derived(
        isPairFlow
            ? pairFundMode === 'WALLET' || pairFundMode === 'BOTH'
            : splitWalletBoostOpen
    );
    let isCreateSubmitDisabled = $derived(
        (walletSwapSelected && livePricingUnavailable && createHasSwapAmt) ||
            (!isPairFlow &&
                draftSectorPct <= 0 &&
                !(splitWalletBoostOpen && !livePricingUnavailable && createHasSwapAmt))
    );
    let draftMineableVaultInfo = $derived(
        !isDraftMultiAssetPlant
            ? mineableVaultMap.get(
                  (draftSettlementConfig?.targetAsset?.ticker || '').toUpperCase()
              ) || null
            : null
    );
    let autoPairTitle = $derived(
        draftSelectedAssets.length > 0
            ? draftSelectedAssets.map((a) => a.ticker.toUpperCase()).join(' / ')
            : 'KAS / USDC'
    );
    let autoSplitTitle = $derived(
        (draftSettlementConfig?.targetAsset?.ticker || 'KAS').toUpperCase()
    );

    let filteredAssets = $derived.by(() => {
        const q = assetSearchQuery.trim().toLowerCase();
        const combined = new Map<string, UnifiedAsset>();
        for (const d of discoveredPickerAssets) if (d?.ticker) combined.set(d.ticker.toUpperCase(), d);
        for (const r of treasury.registry) {
            const k = String(r.ticker || '').toUpperCase();
            if (k && !combined.has(k)) combined.set(k, r);
        }
        const matches = Array.from(combined.values()).filter((a) => {
            const tick = String(a.ticker || '').toLowerCase();
            const name = String(a.name || '').toLowerCase();
            const cls = String(a.assetClass || '').toLowerCase();
            const net = String(a.network || '').toLowerCase();
            const contract = String(a.contract || '').toLowerCase();
            const hit =
                !q ||
                tick.includes(q) ||
                name.includes(q) ||
                cls.includes(q) ||
                net.includes(q) ||
                contract.includes(q);
            if (!hit) return false;
            if (assetCategoryFilter === 'MINEABLE') {
                return mineableVaultMap.has(tick.toUpperCase()) || net === 'kas';
            }
            if (assetCategoryFilter === 'EQUITIES') return a.assetClass === 'Public Equity';
            if (assetCategoryFilter === 'COMMODITIES') {
                return a.assetClass === 'Commodity' || a.assetClass === 'Sovereign Debt';
            }
            if (assetCategoryFilter === 'CRYPTO') {
                return (
                    a.assetClass !== 'Public Equity' &&
                    a.assetClass !== 'Commodity' &&
                    a.assetClass !== 'Sovereign Debt'
                );
            }
            return true;
        });
        if (!q) return matches;
        return [...matches].sort((a, b) => {
            const at = String(a.ticker || '').toLowerCase();
            const bt = String(b.ticker || '').toLowerCase();
            if (at === q && bt !== q) return -1;
            if (bt === q && at !== q) return 1;
            if (at.startsWith(q) && !bt.startsWith(q)) return -1;
            if (bt.startsWith(q) && !at.startsWith(q)) return 1;
            return 0;
        });
    });

    function handleTokenIconError(e: Event) {
        const target = e.currentTarget as HTMLImageElement;
        target.style.display = 'none';
        if (target.nextElementSibling) {
            (target.nextElementSibling as HTMLElement).style.display = 'inline';
        }
    }
</script>

{#if isSectorModalOpen}
    <div
        class="fixed inset-0 z-[9990] flex items-center justify-center px-3 pt-4 pb-24 sm:px-4 sm:pt-4 sm:pb-12 bg-[#06080b]/95"
        transition:fade={{ duration: 150 }}
    >
        <div class="absolute inset-0 w-full h-full cursor-default border-none"></div>
        <div class="relative z-10 w-full max-w-[540px] bg-[#0a0d12] border border-white/15 rounded-2xl sm:rounded-[24px] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col">
            <div class="px-5 py-4 border-b border-white/10 bg-[#11161f] flex justify-between items-center shrink-0">
                <div class="flex items-center gap-2.5 min-w-0">
                    <h2 class="text-white font-black uppercase tracking-widest text-sm sm:text-base leading-none">
                        {isPairFlow ? 'PAIR' : 'SPLIT'}
                    </h2>
                    {#if !isPairFlow}
                        <span
                            data-testid="split-auto-title-badge"
                            class="px-2 py-0.5 rounded-md bg-[#0a0d12] border border-white/15 text-[10px] font-mono font-bold text-[#18C6A5] truncate"
                        >
                            {autoSplitTitle}
                        </span>
                    {/if}
                </div>
                <button
                    type="button"
                    aria-label="Close"
                    onclick={() => (isSectorModalOpen = false)}
                    class="w-8 h-8 rounded-full bg-[#161d29] hover:bg-white/10 border border-white/10 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer shrink-0"
                >
                    ✕
                </button>
            </div>
            <div class="p-4 sm:p-5 flex flex-col gap-3.5 max-h-[62dvh] sm:max-h-[70vh] overflow-y-auto hide-scrollbar">
                {#if isPairFlow}
                    <LiquidityAndSiloPanel
                        mode="mine"
                        bind:baseTicker={initialPairSwapPayTicker}
                        bind:partnerTicker={pairPartnerTicker}
                        bind:baseAmount={initialPairSwapAmount}
                        bind:feeRateBps={draftPairFeeBps}
                        bind:allocationPct={draftSectorPct}
                        maxAllocationPct={draftSectorMax}
                        {displayHashrate}
                        {livePricingUnavailable}
                        isSubmitting={isSubmittingPair}
                        errorMessage={pairSubmitError}
                        onExecutePair={onExecutePairFlow}
                        onCancelModal={() => (isSectorModalOpen = false)}
                    />
                {:else}
                    <!-- STREAMLINED + SPLIT FLOW -->
                    <!-- TOP: TARGET TOKEN PICKER -->
                    <div class="bg-[#11161f] border border-white/10 rounded-2xl p-3.5 flex flex-col gap-2.5">
                        <div class="flex items-center justify-between">
                            <span class="text-[10px] font-mono font-black uppercase tracking-widest text-neutral-300">
                                Token
                            </span>
                            <span class="px-2 py-0.5 rounded bg-[#0a0d12] border border-white/10 text-[9px] font-mono text-[#18C6A5]">
                                {draftMineableVaultInfo ? 'Mineable Vault' : '100% Target'}
                            </span>
                        </div>
                        <button
                            type="button"
                            data-testid="open-target-asset-picker-btn"
                            onclick={() => {
                                assetPickerTarget = 'create';
                                assetPickerActionMode = 'replace_primary';
                                isAssetPickerOpen = true;
                                assetSearchQuery = '';
                                assetCategoryFilter = 'ALL';
                            }}
                            class="w-full bg-[#0a0d12] hover:bg-[#161d29] border border-[#18C6A5]/40 rounded-xl px-3.5 py-3 flex items-center justify-between transition-colors cursor-pointer"
                        >
                            <div class="flex items-center gap-3 min-w-0">
                                <div
                                    class="w-7 h-7 rounded-full bg-[#11161f] border border-white/15 flex items-center justify-center text-xs font-black shrink-0"
                                    style="color: {draftSettlementConfig.targetAsset.theme?.hex || '#18C6A5'};"
                                >
                                    {draftSettlementConfig.targetAsset.ticker === 'USD'
                                        ? '$'
                                        : draftSettlementConfig.targetAsset.ticker[0]}
                                </div>
                                <div class="flex flex-col items-start min-w-0">
                                    <span class="text-xs font-bold text-white leading-none mb-0.5 truncate">
                                        {draftSettlementConfig.targetAsset.ticker} — {draftSettlementConfig.targetAsset.name}
                                    </span>
                                    <span class="text-[9px] font-mono text-neutral-400">
                                        {draftMineableVaultInfo
                                            ? `${draftMineableVaultInfo.dailyEmissionTokens.toLocaleString()} ${draftMineableVaultInfo.tokenTicker}/d`
                                            : livePricingUnavailable
                                              ? LIVE_PRICING_UNAVAILABLE_MESSAGE
                                              : draftSettlementConfig.targetAsset.spotPrice > 0
                                                ? `$${draftSettlementConfig.targetAsset.spotPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
                                                : 'Choose Token'}
                                    </span>
                                </div>
                            </div>
                            <span class="text-xs text-neutral-400 shrink-0">▾</span>
                        </button>

                        {#if draftMineableVaultInfo}
                            <div
                                data-testid="mineable-syndicate-banner"
                                class="bg-[#0a0d12] border border-amber-500/40 rounded-xl p-2.5 flex items-center justify-between gap-2 text-[9px] font-mono"
                            >
                                <span class="text-amber-400 font-black uppercase">
                                    Syndicate Hashpower Pledge Active
                                </span>
                                <button
                                    type="button"
                                    data-testid="syndicate-sector-toggle"
                                    onclick={() => (draftIsSyndicateSector = !draftIsSyndicateSector)}
                                    class="px-2.5 py-1 rounded bg-[#11161f] border {draftIsSyndicateSector ? 'border-[#18C6A5]/50 text-[#18C6A5]' : 'border-white/10 text-neutral-400'} font-black uppercase shrink-0 cursor-pointer"
                                >
                                    {draftIsSyndicateSector ? '✓ SYNDICATE PLEDGED' : 'SOLO SPLIT'}
                                </button>
                            </div>
                        {/if}

                        {#if draftSettlementConfig.targetAsset.ticker === 'USD'}
                            <div class="bg-[#0a0d12] border {savedBankRailLast4 ? 'border-[#18C6A5]/40' : 'border-amber-500/40'} rounded-xl px-3 py-2 flex items-center justify-between text-[10px] font-mono">
                                <span class="font-black uppercase tracking-wider {savedBankRailLast4 ? 'text-[#18C6A5]' : 'text-amber-400'}">
                                    {savedBankRailLast4
                                        ? `✓ Bank Rail: *${savedBankRailLast4} (${savedBankRailMethod})`
                                        : '⚠ Bank Rail Unlinked'}
                                </span>
                                <span class="text-[9px] text-neutral-400">$25 Min</span>
                            </div>
                        {/if}
                    </div>

                    <!-- MIDDLE: HASHRATE % -->
                    <div class="bg-[#11161f] border border-white/10 rounded-2xl p-3.5 flex flex-col gap-2.5 font-mono">
                        <div class="flex justify-between items-center gap-2">
                            <span class="text-[10px] font-black text-neutral-300 uppercase tracking-widest">
                                Hashrate %
                            </span>
                            <div class="flex items-center gap-2">
                                <div class="flex items-center gap-1 bg-[#0a0d12] border border-white/10 rounded-lg px-2.5 py-1">
                                    <input
                                        type="number"
                                        value={draftSectorPct}
                                        oninput={(e) => onUpdateDraftPct(e.currentTarget.value)}
                                        class="w-14 bg-transparent text-white text-base font-black outline-none text-right tabular-nums"
                                    />
                                    <span class="text-neutral-400 text-xs font-bold">%</span>
                                </div>
                                <div class="flex items-center gap-1 bg-[#0a0d12] border border-white/10 rounded-lg px-2.5 py-1">
                                    <input
                                        type="number"
                                        value={(displayHashrate * (draftSectorPct / 100)).toFixed(2)}
                                        oninput={(e) => onUpdateDraftHash(e.currentTarget.value)}
                                        class="w-12 bg-transparent text-[#18C6A5] text-xs font-bold outline-none text-right tabular-nums"
                                    />
                                    <span class="text-neutral-500 text-[10px] font-bold">TH/s</span>
                                </div>
                            </div>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max={Math.max(draftSectorMax, 0)}
                            step="0.1"
                            disabled={draftSectorMax <= 0}
                            bind:value={draftSectorPct}
                            class="w-full custom-range-slider cursor-pointer disabled:opacity-40"
                        />
                        <div class="grid grid-cols-4 gap-2">
                            {#each ([25, 50, 75, 100] as const) as pct}
                                <button
                                    type="button"
                                    data-testid="split-hashrate-qf-{pct}"
                                    disabled={draftSectorMax <= 0}
                                    onclick={() =>
                                        (draftSectorPct = computeHashrateQuickFillPct(
                                            draftSectorMax,
                                            pct
                                        ))}
                                    class="py-2 rounded-lg bg-[#0a0d12] border border-white/10 hover:border-[#18C6A5]/50 text-[10px] font-bold text-neutral-300 hover:text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {pct === 100 ? 'MAX' : `${pct}%`}
                                </button>
                            {/each}
                        </div>
                    </div>

                    <!-- OPTIONAL WALLET BOOST -->
                    <div class="flex flex-col gap-2 font-mono">
                        <button
                            type="button"
                            data-testid="split-wallet-boost-toggle"
                            onclick={() => (splitWalletBoostOpen = !splitWalletBoostOpen)}
                            class="w-full py-2 px-3 rounded-xl border text-[10px] font-bold uppercase tracking-wider flex items-center justify-between cursor-pointer transition-colors {splitWalletBoostOpen ? 'bg-[#161d29] border-[#18C6A5]/50 text-[#18C6A5]' : 'bg-[#11161f] border-white/10 text-neutral-400 hover:text-white'}"
                        >
                            <span>+ WALLET</span>
                            <span>{splitWalletBoostOpen ? '▴' : '▾'}</span>
                        </button>

                        {#if splitWalletBoostOpen}
                            <div
                                data-testid="split-wallet-boost-panel"
                                class="bg-[#11161f] border border-white/10 rounded-xl p-3 flex flex-col gap-2"
                            >
                                <div class="flex items-center justify-between text-[10px]">
                                    <span class="text-neutral-400 uppercase font-bold">Pay</span>
                                    <span class="text-neutral-300 tabular-nums">
                                        {formattedPayBalance} {initialPairSwapPayTicker}
                                    </span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <select
                                        aria-label="Pay Token"
                                        bind:value={initialPairSwapPayTicker}
                                        class="bg-[#0a0d12] border border-white/10 rounded-lg px-2.5 py-2 text-xs font-bold text-white outline-none"
                                    >
                                        {#each splitPayAssetChoices as tick}
                                            <option value={tick}>{tick}</option>
                                        {/each}
                                    </select>
                                    <input
                                        type="text"
                                        inputmode="decimal"
                                        data-testid="split-wallet-boost-amount"
                                        bind:value={initialPairSwapAmount}
                                        placeholder="0.00"
                                        disabled={livePricingUnavailable}
                                        class="flex-1 bg-[#0a0d12] border border-white/10 focus:border-[#18C6A5]/50 rounded-lg px-3 py-2 text-xs font-bold text-white outline-none disabled:opacity-40"
                                    />
                                </div>
                                <div class="grid grid-cols-4 gap-1.5">
                                    {#each ([25, 50, 75, 100] as const) as pct}
                                        <button
                                            type="button"
                                            data-testid="split-wallet-qf-{pct}"
                                            disabled={livePricingUnavailable || payBalanceAtomic <= 0n}
                                            onclick={() => {
                                                initialPairSwapAmount = computeWalletQuickFillDecimal(
                                                    selectedPayAsset?.onChainAtomic,
                                                    selectedPayAsset?.decimals ??
                                                        dexAtomicDecimals(initialPairSwapPayTicker),
                                                    pct
                                                );
                                            }}
                                            class="py-1.5 rounded-lg bg-[#0a0d12] border border-white/10 hover:border-[#18C6A5]/50 text-[10px] font-bold text-neutral-300 hover:text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            {pct === 100 ? 'MAX' : `${pct}%`}
                                        </button>
                                    {/each}
                                </div>
                                {#if livePricingUnavailable}
                                    <span class="text-[9px] text-amber-400 font-bold">
                                        {LIVE_PRICING_UNAVAILABLE_MESSAGE}
                                    </span>
                                {/if}
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>
            {#if !isPairFlow}
                <div class="flex gap-3 px-5 py-3 bg-[#11161f] border-t border-white/10 shrink-0">
                    <button
                        type="button"
                        onclick={() => (isSectorModalOpen = false)}
                        class="tactile-btn flex-1 py-3.5 text-neutral-300 hover:text-white font-bold uppercase tracking-widest text-xs rounded-xl cursor-pointer"
                    >
                        CANCEL
                    </button>
                    <button
                        type="button"
                        data-testid="initialize-sector-btn"
                        onclick={onCreateSector}
                        disabled={isCreateSubmitDisabled}
                        class="tactile-btn flex-[2] py-3.5 border-[#18C6A5]/40 text-[#18C6A5] hover:text-white font-black uppercase tracking-widest text-xs rounded-xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.16), transparent 70%);"
                    >
                        SPLIT
                    </button>
                </div>
            {/if}
        </div>
    </div>
{/if}

{#if isAssetPickerOpen}
    <div
        class="fixed inset-0 z-[9995] flex items-start sm:items-center justify-center px-3 pt-3 pb-6 sm:p-4 bg-[#06080b]/95 overflow-y-auto"
        transition:fade={{ duration: 150 }}
    >
        <button
            type="button"
            aria-label="Close Asset Picker"
            onclick={() => {
                isAssetPickerOpen = false;
                assetSearchQuery = '';
                discoveredPickerAssets = [];
            }}
            class="fixed inset-0 w-full h-full cursor-default border-none bg-transparent"
        ></button>
        <div class="relative z-10 w-full max-w-[490px] bg-[#0a0d12] border border-white/15 rounded-[24px] sm:rounded-[28px] shadow-2xl flex flex-col overflow-hidden max-h-[82dvh] sm:h-[560px]">
            <div class="p-4 border-b border-white/10 flex items-center justify-between bg-[#11161f]">
                <button
                    type="button"
                    aria-label="Back"
                    onclick={() => {
                        isAssetPickerOpen = false;
                        assetSearchQuery = '';
                    }}
                    class="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-neutral-400 transition-colors cursor-pointer"
                >
                    ✕
                </button>
                <div class="flex flex-col items-center">
                    <h3 class="font-bold tracking-wide text-sm text-center uppercase text-white">
                        {assetPickerActionMode === 'add_secondary'
                            ? 'Add Token to Liquidity Pair'
                            : assetPickerActionMode === 'replace_pair_slot_0' ||
                                assetPickerActionMode === 'replace_pair_slot_1'
                              ? 'Select Pair Token'
                              : 'Select Target Asset'}
                    </h3>
                    {#if isSearchingAssets}
                        <span class="text-[8px] font-mono text-[#18C6A5] uppercase animate-pulse mt-0.5">
                            Searching Live Price Feeds...
                        </span>
                    {/if}
                </div>
                <div class="w-8"></div>
            </div>
            <div class="p-3 border-b border-white/10 bg-[#0a0d12] flex flex-col gap-2">
                <div class="relative flex items-center">
                    <input
                        aria-label="Asset Search"
                        data-testid="operations-asset-search-input"
                        type="text"
                        value={assetSearchQuery}
                        oninput={(e) =>
                            handleModalAssetSearchInput((e.currentTarget as HTMLInputElement).value)}
                        onkeydown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                if (filteredAssets.length > 0) {
                                    onAddOrToggleAssetInSector(
                                        assetPickerTarget,
                                        filteredAssets[0],
                                        assetPickerActionMode
                                    );
                                    isAssetPickerOpen = false;
                                    assetSearchQuery = '';
                                } else {
                                    selectCustomModalTicker();
                                }
                            }
                        }}
                        placeholder="Search BTC, USDC, NVDA, NACHO, SILO, XAU..."
                        class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/60 rounded-xl pl-4 pr-9 py-2.5 text-xs font-mono text-white outline-none transition-colors"
                    />
                    {#if assetSearchQuery}
                        <button
                            type="button"
                            aria-label="Clear Search"
                            onclick={() => {
                                assetSearchQuery = '';
                                discoveredPickerAssets = [];
                                isSearchingAssets = false;
                            }}
                            class="absolute right-2.5 text-neutral-400 hover:text-white text-sm px-1 cursor-pointer"
                        >
                            &times;
                        </button>
                    {/if}
                </div>
                <div class="grid grid-cols-5 gap-1">
                    {#each [
                        { id: 'ALL', label: 'All' },
                        { id: 'CRYPTO', label: 'Crypto' },
                        { id: 'EQUITIES', label: 'Equities' },
                        { id: 'COMMODITIES', label: 'Gold/Debt' },
                        { id: 'MINEABLE', label: 'Mineable' }
                    ] as cat (cat.id)}
                        <button
                            type="button"
                            data-testid="asset-cat-{cat.id}"
                            onclick={() => (assetCategoryFilter = cat.id as typeof assetCategoryFilter)}
                            class="py-1.5 rounded-lg text-[8px] font-mono font-bold uppercase cursor-pointer transition-colors {assetCategoryFilter === cat.id ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/40' : 'bg-[#11161f] text-neutral-400 hover:text-white'}"
                        >
                            {cat.label}
                        </button>
                    {/each}
                </div>
            </div>
            <div class="flex-1 overflow-y-auto p-2 bg-[#0a0d12] hide-scrollbar">
                <div class="flex flex-col gap-1">
                    {#if filteredAssets.length === 0}
                        <div class="py-8 px-4 text-center flex flex-col items-center gap-3 font-mono">
                            <span class="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                                {isSearchingAssets
                                    ? 'Searching Live Price Feeds...'
                                    : 'No indexed feed for ' + assetSearchQuery.trim()}
                            </span>
                            {#if !isSearchingAssets && /^[A-Za-z0-9]{2,10}$/.test(assetSearchQuery.trim())}
                                <button
                                    type="button"
                                    onclick={selectCustomModalTicker}
                                    class="tactile-btn px-4 py-2 rounded-xl border-[#18C6A5]/45 text-[#18C6A5] text-[10px] font-black uppercase tracking-wider cursor-pointer"
                                >
                                    + Add {assetSearchQuery.trim().toUpperCase()}
                                </button>
                            {/if}
                        </div>
                    {/if}
                    {#each filteredAssets as asset (asset.ticker)}
                        {@const vaultInfo = mineableVaultMap.get(asset.ticker.toUpperCase())}
                        <button
                            type="button"
                            data-testid="select-target-asset-{asset.ticker}"
                            onclick={() => {
                                onAddOrToggleAssetInSector(
                                    assetPickerTarget,
                                    asset,
                                    assetPickerActionMode
                                );
                                isAssetPickerOpen = false;
                                assetSearchQuery = '';
                            }}
                            class="w-full flex items-center justify-between p-3 rounded-xl hover:bg-[#11161f] transition-colors cursor-pointer group border border-transparent hover:border-white/10"
                        >
                            <div class="flex items-center gap-3 pointer-events-none">
                                <div
                                    class="w-8 h-8 rounded-full bg-[#11161f] border border-white/10 flex items-center justify-center text-xs font-black overflow-hidden"
                                    style="color: {asset.theme?.hex || '#ffffff'};"
                                >
                                    {#if asset.imgUrl}
                                        <img
                                            src={asset.imgUrl}
                                            class="w-4 h-4 object-contain"
                                            alt="logo"
                                            onerror={handleTokenIconError}
                                        />
                                        <span style="display:none;" class="text-xs font-black">
                                            {asset.ticker[0]}
                                        </span>
                                    {:else}
                                        {asset.ticker === 'USD' ? '$' : asset.ticker.slice(0, 3)}
                                    {/if}
                                </div>
                                <div class="flex flex-col items-start">
                                    <div class="flex items-center gap-1.5">
                                        <span class="text-sm font-bold text-white tracking-widest">
                                            {asset.ticker}
                                        </span>
                                        {#if vaultInfo}
                                            <span class="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-[7px] font-mono font-black text-amber-400 uppercase">
                                                MINEABLE VAULT
                                            </span>
                                        {/if}
                                    </div>
                                    <span class="text-[10px] font-mono text-neutral-400">
                                        {vaultInfo
                                            ? `${vaultInfo.dailyEmissionTokens.toLocaleString()} ${asset.ticker}/d`
                                            : asset.name}
                                    </span>
                                </div>
                            </div>
                            <div class="flex flex-col items-end pointer-events-none">
                                {#if livePricingUnavailable}
                                    <span class="text-[9px] font-mono font-bold text-amber-400">
                                        Live pricing unavailable
                                    </span>
                                {:else if asset.spotPrice > 0}
                                    <span class="text-xs font-mono font-bold text-[#18C6A5] tabular-nums">
                                        ${asset.spotPrice.toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 4
                                        })}
                                    </span>
                                {:else if vaultInfo}
                                    <span class="text-[9px] font-mono font-bold text-[#18C6A5] tabular-nums">
                                        {vaultInfo.remainingVaultTokens.toLocaleString()} Rem
                                    </span>
                                {/if}
                                <span class="text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-[#11161f] text-neutral-400 border border-white/10 mt-0.5">
                                    {vaultInfo ? 'Mineable KRC-20' : asset.assetClass}
                                </span>
                            </div>
                        </button>
                    {/each}
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- REGISTER SELF-CUSTODY VAULT LOCK MODAL -->
{#if isVaultModalOpen}
    <div
        data-testid="register-vault-lock-modal"
        class="fixed inset-0 z-[9992] flex items-center justify-center px-3 pt-4 pb-20 sm:p-4 bg-[#06080b]/95"
        transition:fade={{ duration: 140 }}
    >
        <div class="w-full max-w-[520px] bg-[#0a0d12] border border-white/15 rounded-2xl overflow-hidden flex flex-col font-mono">
            <div class="p-5 border-b border-white/10 bg-[#11161f] flex items-center justify-between">
                <h2 class="text-sm font-black uppercase tracking-widest text-white">
                    Vault Lock
                </h2>
                <button
                    type="button"
                    onclick={() => (isVaultModalOpen = false)}
                    class="w-8 h-8 rounded-full bg-[#161d29] border border-white/10 text-neutral-400 hover:text-white cursor-pointer"
                >
                    ✕
                </button>
            </div>
            <div class="p-5 flex flex-col gap-3 max-h-[70dvh] overflow-y-auto">
                {#if vaultLockError}
                    <div class="p-3 rounded-xl bg-red-950/30 border border-red-500/40 text-red-300 text-[10px]">
                        {vaultLockError}
                    </div>
                {/if}
                <div class="grid grid-cols-3 gap-2">
                    {#each (['MINER_SILO', 'STANDALONE_WALLET_SILO', 'MAKER_PLANT'] as VaultKind[]) as kind}
                        <button
                            type="button"
                            onclick={() => (vaultKindInput = kind)}
                            class="py-2 px-2 rounded-xl border text-[9px] font-bold uppercase cursor-pointer {vaultKindInput === kind ? 'bg-[#161d29] border-[#18C6A5]/50 text-[#18C6A5]' : 'bg-[#11161f] border-white/10 text-neutral-400 hover:text-white'}"
                        >
                            {formatVaultKindLabel(kind)}
                        </button>
                    {/each}
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div class="flex flex-col gap-1">
                        <label for="vaultAssetInput" class="text-[9px] uppercase text-neutral-400 font-bold">
                            Target Asset
                        </label>
                        <input
                            id="vaultAssetInput"
                            type="text"
                            bind:value={vaultTargetAssetInput}
                            oninput={() => {
                                vaultTargetNetworkInput = resolveTargetNetworkForAsset(vaultTargetAssetInput);
                            }}
                            class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3 py-2 text-xs text-white uppercase outline-none"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label for="vaultNetworkInput" class="text-[9px] uppercase text-neutral-400 font-bold">
                            Target Network
                        </label>
                        <input
                            id="vaultNetworkInput"
                            type="text"
                            bind:value={vaultTargetNetworkInput}
                            class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3 py-2 text-xs text-white uppercase outline-none"
                        />
                    </div>
                </div>
                <div class="flex flex-col gap-1">
                    <label for="vaultDestInput" class="text-[9px] uppercase text-neutral-400 font-bold">
                        Destination Address
                    </label>
                    <input
                        id="vaultDestInput"
                        type="text"
                        bind:value={vaultDestAddressInput}
                        spellcheck="false"
                        class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3 py-2 text-xs text-[#18C6A5] outline-none"
                    />
                </div>
                <div class="flex flex-col gap-1">
                    <label for="vaultRefundInput" class="text-[9px] uppercase text-neutral-400 font-bold">
                        Kaspa Refund Wallet
                    </label>
                    <input
                        id="vaultRefundInput"
                        type="text"
                        bind:value={vaultRefundAddressInput}
                        spellcheck="false"
                        class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3 py-2 text-xs text-white outline-none"
                    />
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div class="flex flex-col gap-1">
                        <label for="vaultThresholdInput" class="text-[9px] uppercase text-neutral-400 font-bold">
                            Payout Minimum (KAS)
                        </label>
                        <input
                            id="vaultThresholdInput"
                            type="text"
                            bind:value={vaultThresholdKasInput}
                            class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3 py-2 text-xs text-white tabular-nums outline-none"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label for="vaultTokenTickerInput" class="text-[9px] uppercase text-neutral-400 font-bold">
                            Token
                        </label>
                        <input
                            id="vaultTokenTickerInput"
                            type="text"
                            bind:value={vaultTokenTickerInput}
                            placeholder="SILO"
                            class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3 py-2 text-xs text-white uppercase outline-none"
                        />
                    </div>
                </div>
            </div>
            <div class="p-4 border-t border-white/10 bg-[#11161f] flex gap-3">
                <button
                    type="button"
                    onclick={() => (isVaultModalOpen = false)}
                    class="tactile-btn flex-1 py-2.5 rounded-xl text-xs font-bold uppercase text-neutral-300"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    data-testid="confirm-register-vault-btn"
                    disabled={isSubmittingVaultLock}
                    onclick={submitRegisterVaultLock}
                    class="tactile-btn flex-[2] py-2.5 rounded-xl border-[#18C6A5]/45 text-[#18C6A5] hover:text-white text-xs font-black uppercase tracking-wider disabled:opacity-40"
                    style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.16), transparent 70%);"
                >
                    {isSubmittingVaultLock ? 'Activating...' : 'Activate Vault Lock'}
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- OWNER-SIGNED RETURN VAULT TO WALLET MODAL -->
{#if cancelVaultTarget && cancelVaultPreview}
    <div
        data-testid="vault-cancel-modal"
        class="fixed inset-0 z-[9993] flex items-center justify-center px-3 pt-4 pb-20 sm:p-4 bg-[#06080b]/95"
        transition:fade={{ duration: 140 }}
    >
        <div class="w-full max-w-[480px] bg-[#0a0d12] border border-white/15 rounded-2xl overflow-hidden flex flex-col font-mono">
            <div class="p-5 border-b border-white/10 bg-[#11161f] flex items-center justify-between">
                <h2 class="text-sm font-black uppercase tracking-widest text-white">
                    Withdraw
                </h2>
                <button
                    type="button"
                    onclick={() => {
                        cancelVaultTarget = null;
                        cancelVaultPreview = null;
                    }}
                    class="w-8 h-8 rounded-full bg-[#161d29] border border-white/10 text-neutral-400 hover:text-white cursor-pointer"
                >
                    ✕
                </button>
            </div>
            <div class="p-5 flex flex-col gap-3 text-xs">
                <div class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex flex-col gap-2">
                    <div class="flex justify-between">
                        <span class="text-neutral-400">Vault Balance</span>
                        <span class="text-white font-bold tabular-nums">
                            {formatSompiToKasDisplay(cancelVaultPreview.feeBreakdown.totalInputSompi, 4, true)} KAS
                        </span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-neutral-400">Network Fee</span>
                        <span class="text-neutral-300 tabular-nums">
                            {formatSompiToKasDisplay(cancelVaultPreview.feeBreakdown.networkFeeSompi, 6, true)} KAS
                        </span>
                    </div>
                    <div class="flex justify-between border-t border-white/10 pt-2">
                        <span class="text-[#18C6A5] font-bold">Net Returned to Wallet</span>
                        <span class="text-[#18C6A5] font-black tabular-nums">
                            {formatSompiToKasDisplay(cancelVaultPreview.feeBreakdown.refundOutputSompi, 4, true)} KAS
                        </span>
                    </div>
                    <div class="text-[9px] text-neutral-400 break-all pt-1">
                        Refund Wallet: {cancelVaultTarget.refundKaspaAddress}
                    </div>
                </div>

                {#if !txState.decryptedPrivateKeyHex && !cancelVaultTxId}
                    <div class="flex flex-col gap-1">
                        <label for="cancelVaultPwd" class="text-[9px] uppercase text-neutral-400 font-bold">
                            Password
                        </label>
                        <input
                            id="cancelVaultPwd"
                            data-testid="vault-cancel-password-input"
                            type="password"
                            bind:value={cancelVaultPassword}
                            placeholder=""
                            class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3 py-2.5 text-xs text-white outline-none"
                        />
                    </div>
                {/if}

                {#if cancelVaultError}
                    <div class="p-3 rounded-xl bg-red-950/30 border border-red-500/40 text-red-300 text-[10px]">
                        {cancelVaultError}
                    </div>
                {/if}

                {#if cancelVaultTxId}
                    <div class="p-3 rounded-xl bg-[#11161f] border border-[#18C6A5]/45 text-[#18C6A5] text-[10px] flex flex-col gap-1">
                        <span class="font-bold">Returned to Wallet</span>
                        <a
                            href={getChainExplorerTxUrl('KAS', cancelVaultTxId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="underline break-all"
                        >
                            View Transaction {cancelVaultTxId} ↗
                        </a>
                    </div>
                {/if}
            </div>
            <div class="p-4 border-t border-white/10 bg-[#11161f] flex gap-3">
                <button
                    type="button"
                    onclick={() => {
                        cancelVaultTarget = null;
                        cancelVaultPreview = null;
                    }}
                    class="tactile-btn flex-1 py-2.5 rounded-xl text-xs font-bold uppercase text-neutral-300"
                >
                    Close
                </button>
                {#if !cancelVaultTxId}
                    <button
                        type="button"
                        data-testid="confirm-vault-cancel-sign-btn"
                        disabled={isSigningVaultCancel}
                        onclick={submitOwnerVaultCancel}
                        class="tactile-btn flex-[2] py-2.5 rounded-xl border-[#18C6A5]/45 text-[#18C6A5] hover:text-white text-xs font-black uppercase tracking-wider disabled:opacity-40"
                        style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.16), transparent 70%);"
                    >
                        {isSigningVaultCancel ? 'Signing...' : 'Sign & Return to Wallet'}
                    </button>
                {/if}
            </div>
        </div>
    </div>
{/if}

<!-- 4-PRIORITY PAYOUT THERMOSTAT MODAL -->
{#if isThermostatModalOpen}
    <div
        data-testid="thermostat-valves-modal"
        class="fixed inset-0 z-[9992] flex items-center justify-center px-3 pt-4 pb-20 sm:p-4 bg-[#06080b]/95"
        transition:fade={{ duration: 140 }}
    >
        <div class="w-full max-w-[680px] bg-[#0a0d12] border border-white/15 rounded-2xl overflow-hidden flex flex-col font-mono">
            <div class="p-5 border-b border-white/10 bg-[#11161f] flex items-center justify-between">
                <h2 class="text-sm font-black uppercase tracking-widest text-white">
                    Thermostat
                </h2>
                <button
                    type="button"
                    onclick={() => (isThermostatModalOpen = false)}
                    class="w-8 h-8 rounded-full bg-[#161d29] border border-white/10 text-neutral-400 hover:text-white cursor-pointer"
                >
                    ✕
                </button>
            </div>
            <div class="p-4 sm:p-5 flex flex-col gap-3 max-h-[68dvh] overflow-y-auto">
                {#if thermostatError}
                    <div class="p-3 rounded-xl bg-red-950/30 border border-red-500/40 text-red-300 text-[10px]">
                        {thermostatError}
                    </div>
                {/if}
                {#each thermostatDrafts as valve, idx (valve.priorityOrder)}
                    <div class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex flex-col gap-2.5">
                        <div class="flex items-center justify-between gap-2">
                            <span class="text-xs font-black text-white">
                                {valve.priorityOrder} — {valve.title}
                            </span>
                            <button
                                type="button"
                                onclick={() => {
                                    thermostatDrafts[idx].isEnabled = !thermostatDrafts[idx].isEnabled;
                                }}
                                class="px-2.5 py-1 rounded-lg border text-[9px] font-bold uppercase cursor-pointer {valve.isEnabled ? 'bg-[#161d29] border-[#18C6A5]/50 text-[#18C6A5]' : 'bg-[#0a0d12] border-white/10 text-neutral-400'}"
                            >
                                {valve.isEnabled ? 'Enabled' : 'Paused'}
                            </button>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div class="flex flex-col gap-1">
                                <span class="text-[8px] uppercase text-neutral-400">Asset</span>
                                <input
                                    type="text"
                                    bind:value={thermostatDrafts[idx].targetAsset}
                                    oninput={() => {
                                        thermostatDrafts[idx].targetNetwork = resolveTargetNetworkForAsset(
                                            thermostatDrafts[idx].targetAsset
                                        );
                                    }}
                                    class="bg-[#0a0d12] border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white uppercase outline-none"
                                />
                            </div>
                            <div class="flex flex-col gap-1">
                                <span class="text-[8px] uppercase text-neutral-400">Cycle Cap (KAS)</span>
                                <input
                                    type="text"
                                    bind:value={thermostatDrafts[idx].targetCapKas}
                                    class="bg-[#0a0d12] border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white tabular-nums outline-none"
                                />
                            </div>
                            <div class="flex flex-col gap-1">
                                <span class="text-[8px] uppercase text-neutral-400">Cycle Cap (USD)</span>
                                <input
                                    type="text"
                                    bind:value={thermostatDrafts[idx].targetCapUsd}
                                    class="bg-[#0a0d12] border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white tabular-nums outline-none"
                                />
                            </div>
                        </div>
                        <div class="flex flex-col gap-1">
                            <span class="text-[8px] uppercase text-neutral-400">Destination Address</span>
                            <input
                                type="text"
                                bind:value={thermostatDrafts[idx].destinationAddress}
                                spellcheck="false"
                                class="bg-[#0a0d12] border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-[#18C6A5] outline-none"
                            />
                        </div>
                        {#if valve.priorityOrder === 1}
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div class="flex flex-col gap-1">
                                    <span class="text-[8px] uppercase text-neutral-400">Utility Reference</span>
                                    <input
                                        type="text"
                                        bind:value={thermostatDrafts[idx].externalRailRef}
                                        placeholder=""
                                        class="bg-[#0a0d12] border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-white outline-none"
                                    />
                                </div>
                                <div class="flex flex-col gap-1">
                                    <span class="text-[8px] uppercase text-neutral-400">Commitment</span>
                                    <input
                                        type="text"
                                        bind:value={thermostatDrafts[idx].zktlsBillerCommitmentHex}
                                        placeholder=""
                                        class="bg-[#0a0d12] border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-neutral-300 outline-none"
                                    />
                                </div>
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
            <div class="p-4 border-t border-white/10 bg-[#11161f] flex gap-3">
                <button
                    type="button"
                    onclick={() => (isThermostatModalOpen = false)}
                    class="tactile-btn flex-1 py-2.5 rounded-xl text-xs font-bold uppercase text-neutral-300"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    data-testid="save-thermostat-valves-btn"
                    disabled={isSavingThermostat}
                    onclick={submitThermostatValves}
                    class="tactile-btn flex-[2] py-2.5 rounded-xl border-[#18C6A5]/45 text-[#18C6A5] hover:text-white text-xs font-black uppercase tracking-wider disabled:opacity-40"
                    style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.16), transparent 70%);"
                >
                    {isSavingThermostat ? 'Saving...' : 'Save Priority Rules'}
                </button>
            </div>
        </div>
    </div>
{/if}
