<script lang="ts">
    import { fade, slide } from 'svelte/transition';
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
    import { ui } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { operations } from '$lib/stores/operations.svelte';
    import {
        treasury,
        DEFAULT_ECOSYSTEM_TICKER,
        type UnifiedAsset
    } from '$lib/stores/treasury.svelte';
    import { settingsStore } from '$lib/stores/settings.svelte';
    import { txState } from '$lib/stores/transaction.svelte';
    import { resolveSovereignAddressForChain } from '$lib/crypto/honeycomb';

    interface LpPosition {
        lpId: string;
        poolPair: string;
        stakedAssetA: number;
        stakedAssetB: number;
        weights?: Record<string, number>;
        reserves?: Record<string, number>;
        invariantK?: number;
        internalPairsCount?: number;
        isMultiAssetPlant?: boolean;
        lockDurationDays: number;
        unlockDate: string | null;
        createdAt: string | null;
        isUnlocked: boolean;
        multiplier: number;
        weightedTvl: number;
    }

    interface SecondaryPlantLeg {
        ticker: string;
        weightPct: number;
        amount: string;
    }

    interface SiloStakePosition {
        stakeId: string;
        ticker: string;
        amountStaked: number;
        status: 'ACTIVE' | 'COOLDOWN';
        txHash?: string | null;
        cooldownInitiatedAt?: string | null;
        cooldownEndsAt?: string | null;
        createdAt?: string | null;
        isMatured: boolean;
    }

    interface SavedBankRailMeta {
        bankLabel: string;
        accountType: 'CHECKING' | 'SAVINGS';
        payoutMethod: 'ACH' | 'WIRE';
        bankLast4: string;
        updatedAt: string;
    }

    interface AbaValidationResult {
        cleanDigits: string;
        isComplete: boolean;
        checksumValid: boolean;
        institutionName: string | null;
        fedDistrict: string | null;
    }

    interface DiscoveredOracleAsset {
        ticker: string;
        name: string;
        assetClass: 'Ecosystem' | 'Native L1' | 'DeFi' | 'Tokenized Asset';
        network: string;
        spotPrice: number;
        change24h: number;
        sources: string[];
        quorumCount: number;
        isKrc20: boolean;
        contract?: string;
        maxSupply?: number;
        mintedSupply?: number;
        holders?: number;
        theme: {
            hex: string;
            pastel: string;
        };
        imgUrl: string;
    }

    const ABA_INSTITUTION_DIRECTORY: Record<string, string> = {
        '021000021': 'JPMorgan Chase Bank, N.A. (New York)',
        '111000614': 'JPMorgan Chase Bank, N.A. (Texas / Dallas)',
        '322271627': 'JPMorgan Chase Bank, N.A. (California)',
        '071000013': 'JPMorgan Chase Bank, N.A. (Illinois)',
        '111000025': 'Bank of America, N.A. (Texas / Dallas)',
        '026009593': 'Bank of America, N.A. (New York Wire)',
        '121000358': 'Bank of America, N.A. (California)',
        '053000196': 'Bank of America, N.A. (North Carolina)',
        '121145433': 'Column N.A. / Mercury Commercial Vault',
        '084106768': 'Thread Bank / Mercury Commercial Rail',
        '064209588': 'Relay Financial / Thread Bank',
        '121000248': 'Wells Fargo Bank, N.A. (National)',
        '111900659': 'Wells Fargo Bank, N.A. (Texas)',
        '021000089': 'Citibank, N.A. (New York)',
        '322271724': 'Citibank, N.A. (California)',
        '122105155': 'U.S. Bank, N.A. (Western)',
        '091000022': 'U.S. Bank, N.A. (Minnesota / Institutional)',
        '101205681': 'Fidelity Cash Management / UMB Bank',
        '121202211': 'Charles Schwab Bank, SSB',
        '031100209': 'Capital One, N.A.',
        '043000096': 'PNC Bank, N.A.'
    };

    function formatRetailSafeCopy(rawText: string | null | undefined): string {
        const text = String(rawText || '');
        if (!text || identity.isCorporateAdmin) return text;
        return text
            .replace(/Dark Pool/gi, 'Liquidity Pool')
            .replace(/SIGHASH_SINGLE/gi, 'Atomic P2P')
            .replace(/VarDiff/gi, 'Auto-Difficulty');
    }

    function evaluateAbaRoutingNumber(raw: string): AbaValidationResult {
        const cleanDigits = String(raw || '').replace(/\D/g, '').slice(0, 9);
        if (cleanDigits.length < 9) {
            return {
                cleanDigits,
                isComplete: false,
                checksumValid: false,
                institutionName: null,
                fedDistrict: null
            };
        }
        const d = cleanDigits.split('').map((c) => parseInt(c, 10));
        const prefix2 = parseInt(cleanDigits.slice(0, 2), 10);
        const validFedPrefix =
            (prefix2 >= 1 && prefix2 <= 12) ||
            (prefix2 >= 21 && prefix2 <= 32) ||
            (prefix2 >= 61 && prefix2 <= 72) ||
            prefix2 === 80;
        const sum =
            3 * (d[0] + d[3] + d[6]) +
            7 * (d[1] + d[4] + d[7]) +
            1 * (d[2] + d[5] + d[8]);
        const checksumValid = validFedPrefix && sum > 0 && sum % 10 === 0;
        const knownBank = ABA_INSTITUTION_DIRECTORY[cleanDigits] || null;
        const districtMap: Record<string, string> = {
            '01': 'Boston Fed (01)',
            '02': 'New York Fed (02)',
            '03': 'Philadelphia Fed (03)',
            '04': 'Cleveland Fed (04)',
            '05': 'Richmond Fed (05)',
            '06': 'Atlanta Fed (06)',
            '07': 'Chicago Fed (07)',
            '08': 'St. Louis Fed (08)',
            '09': 'Minneapolis Fed (09)',
            '10': 'Kansas City Fed (10)',
            '11': 'Dallas Fed (11)',
            '12': 'San Francisco Fed (12)'
        };
        const fedDistrict =
            districtMap[cleanDigits.slice(0, 2)] || 'Federal Reserve ABA';
        return {
            cleanDigits,
            isComplete: true,
            checksumValid,
            institutionName:
                knownBank ||
                (checksumValid
                    ? `Verified Commercial Bank (${fedDistrict})`
                    : null),
            fedDistrict
        };
    }

    let p2pInterval: ReturnType<typeof setInterval>;
    let lpPositionsInterval: ReturnType<typeof setInterval>;
    let balanceSyncInterval: ReturnType<typeof setInterval>;
    let onrampPollInterval: ReturnType<typeof setInterval>;
    let globalDiscoverDebounce: ReturnType<typeof setTimeout>;
    let modalDiscoverDebounce: ReturnType<typeof setTimeout>;

    let isExecuting = $state(false);
    let isCancellingP2pId = $state<string | null>(null);
    let swapError = $state<string | null>(null);
    let swapSuccessId = $state<string | null>(null);
    let swapLegs = $state<any[]>([]);
    let activeDexTab = $state<'Swap' | 'Liquidity' | 'P2P' | 'Fiat'>('Swap');
    let payAmount = $state('');
    let receiveAmount = $state('');
    let payTicker = $state('KAS');
    let receiveTicker = $state('BTC');
    let lpTickerA = $state('KAS');
    let lpTickerB = $state('USDC');
    let lpAmountA = $state('');
    let lpAmountB = $state('');
    let lpWeightPctB = $state(50.0);
    let extraPlantLegs = $state<SecondaryPlantLeg[]>([]);
    let editingExtraLegIndex = $state<number>(0);
    let p2pSellTicker = $state('KAS');
    let p2pBuyTicker = $state('USDC');

    let payToken = $derived(treasury.getAsset(payTicker));
    let receiveToken = $derived(treasury.getAsset(receiveTicker));
    let lpTokenA = $derived(treasury.getAsset(lpTickerA));
    let lpTokenB = $derived(treasury.getAsset(lpTickerB));
    let p2pSellToken = $derived(treasury.getAsset(p2pSellTicker));
    let p2pBuyToken = $derived(treasury.getAsset(p2pBuyTicker));
    let siloAsset = $derived(treasury.getAsset(DEFAULT_ECOSYSTEM_TICKER));

    let totalPlantAssetCount = $derived(2 + extraPlantLegs.length);
    let totalPlantInternalPairs = $derived(
        (totalPlantAssetCount * (totalPlantAssetCount - 1)) / 2
    );
    let plantPairSummary = $derived(
        ['KAS', lpTickerB, ...extraPlantLegs.map((l) => l.ticker)].join('/')
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

    let siloStakeAmountInput = $state('');
    let isStakingSilo = $state(false);
    let isMutatingSiloId = $state<string | null>(null);
    let siloStakingTelemetry = $state<{
        ecosystemTicker: string;
        activeStaked: number;
        cooldownStaked: number;
        combinedEligibleStaked: number;
        feeRateCap: number;
        tierLabel: string;
        positions: SiloStakePosition[];
    }>({
        ecosystemTicker: DEFAULT_ECOSYSTEM_TICKER,
        activeStaked: 0,
        cooldownStaked: 0,
        combinedEligibleStaked: 0,
        feeRateCap: 0.015,
        tierLabel: '1.50% Standard Tier',
        positions: []
    });

    let isTileSweeping = $state(false);
    let sweepTimeout: ReturnType<typeof setTimeout>;
    function triggerTileSweep() {
        isTileSweeping = false;
        clearTimeout(sweepTimeout);
        requestAnimationFrame(() => {
            isTileSweeping = true;
            sweepTimeout = setTimeout(() => {
                isTileSweeping = false;
            }, 440);
        });
    }

    let ambientPrimaryHex = $derived.by(() => {
        if (activeDexTab === 'Liquidity') return lpTokenA.hex || '#18C6A5';
        if (activeDexTab === 'P2P') return p2pSellToken.hex || '#18C6A5';
        if (activeDexTab === 'Fiat') return '#18C6A5';
        return payToken.hex || '#18C6A5';
    });

    let ambientSecondaryHex = $derived.by(() => {
        const targetTicker =
            activeDexTab === 'Liquidity'
                ? lpTokenB.ticker
                : activeDexTab === 'P2P'
                  ? p2pBuyToken.ticker
                  : activeDexTab === 'Fiat'
                    ? 'USDC'
                    : receiveToken.ticker;
        if (targetTicker === 'BTC') return '#F7931A';
        if (
            targetTicker === 'USDC' ||
            targetTicker === 'ARB' ||
            targetTicker === 'BASE'
        )
            return '#3B82F6';
        if (targetTicker === 'ETH') return '#627EEA';
        if (targetTicker === 'SOL') return '#14F195';
        if (
            targetTicker === 'DOGE' ||
            targetTicker === 'ZEC' ||
            targetTicker === 'XAU'
        )
            return '#D4AF37';
        const asset = treasury.getAsset(targetTicker);
        return asset?.hex || '#3B82F6';
    });

    let isProvidingLiquidity = $state(false);
    let isWithdrawingLp = $state<string | null>(null);
    let lpPositions = $state<LpPosition[]>([]);
    let lockDurationIndex = $state(0);
    const lockOptions = [
        { label: 'Flexible', days: 0, multiplier: 1.0 },
        { label: '30 Days', days: 30, multiplier: 1.2 },
        { label: '90 Days', days: 90, multiplier: 1.5 },
        { label: '365 Days', days: 365, multiplier: 2.5 }
    ];

    let p2pSellAmount = $state('');
    let p2pBuyAmount = $state('');
    let p2pOrders = $state<
        {
            id: string;
            seller: string;
            sellToken: string;
            sellAmount: number;
            buyToken: string;
            buyAmount: number;
            rate: string;
            status: string;
        }[]
    >([]);
    let treasuryKasBalance = $state(0);

    // Fiat On/Off-Ramp State
    const WIRE_FEE_USD = 15.0;
    const ACH_FEE_USD = 2.0;
    let fiatMode = $state<'offramp' | 'onramp'>('onramp');
    let offrampSourceMode = $state<'onchain_kas' | 'ledger_kas' | 'ledger_usdc'>(
        'onchain_kas'
    );
    let otcCryptoAmountInput = $state('');
    let otcNetFiatOutput = $state(0);
    let otcSpreadFee = $state(0);
    let payoutMethod = $state<'wire' | 'ach'>('ach');
    let isWhaleWaiverActive = $state(false);
    let offrampBankLabel = $state('Primary Operating Account');
    let offrampAccountType = $state<'CHECKING' | 'SAVINGS'>('CHECKING');
    let offrampRoutingNumber = $state('');
    let offrampAccountNumber = $state('');
    let savedBankLast4 = $state<string | null>(null);
    let savedBankRailMeta = $state<SavedBankRailMeta | null>(null);
    let isEditingBankRail = $state(false);
    let isSavingBankRail = $state(false);
    let offrampError = $state<string | null>(null);
    let offrampSuccessBanner = $state<string | null>(null);
    let circleDirectActive = $state<boolean>(false);

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

    let onrampFiatAmountUsd = $state('250');
    let onrampPaymentRail = $state<'SOVEREIGN_WIRE_ACH' | 'CARD_INSTANT'>(
        'SOVEREIGN_WIRE_ACH'
    );
    let onrampSettlementTarget = $state<'LEDGER_KAS' | 'L1_KAS'>('LEDGER_KAS');
    let isInitializingOnramp = $state(false);
    let onrampSessionData = $state<{
        sessionId: string;
        clientSecret: string;
        estimatedKas: number;
        spotPrice: number;
        feeUsd: number;
        netUsdConverted?: number;
        paymentRail?: string;
        settlementTarget?: string;
        wireMemo?: string;
        wireInstructions?: {
            beneficiaryName: string;
            bankName: string;
            routingNumber: string;
            accountNumber: string;
            accountType: string;
            wireMemo: string;
            settlementTarget: string;
        };
        widgetUrl: string;
        nonKycTier: string;
        status?: string;
        txHash?: string;
    } | null>(null);
    let onrampError = $state<string | null>(null);
    let fiatHistoryEvents = $state<any[]>([]);
    let recentOfframpPayouts = $state<any[]>([]);
    let recentOnrampSessions = $state<any[]>([]);

    let offrampSelectedAssetTicker = $derived(
        offrampSourceMode === 'ledger_usdc' ? 'USDC' : 'KAS'
    );
    let offrampAvailableSourceBalance = $derived.by(() => {
        if (offrampSourceMode === 'ledger_usdc') {
            return treasury.getAsset('USDC').synthetic || 0;
        }
        if (offrampSourceMode === 'ledger_kas') {
            return treasury.getAsset('KAS').synthetic || 0;
        }
        return treasury.getAsset('KAS').onChain || 0;
    });

    let swapQuoteTelemetry = $derived.by(() => {
        const pSpot = payToken.spotPrice || 0;
        const rSpot = receiveToken.spotPrice || 0;
        const exchangeRate = pSpot > 0 && rSpot > 0 ? pSpot / rSpot : 0;
        const payVal = parseFloat(payAmount);
        const usdVolume = !isNaN(payVal) && payVal > 0 ? payVal * pSpot : 0;
        const targetBucket = operations.getBucket(receiveToken.ticker);
        const sourceBucket = operations.getBucket(payToken.ticker);
        let feeLabel = '1.50% Standard Tier';
        let feeRate = 0.015;
        let isDiscounted = false;
        if (
            targetBucket &&
            targetBucket.weightPct >= 85 &&
            targetBucket.weightPct < 100
        ) {
            feeLabel = '0.15% Drain Discount (Bucket Boost)';
            feeRate = 0.0015;
            isDiscounted = true;
        } else if (sourceBucket && sourceBucket.lpCoveragePct < 65) {
            feeLabel = '0.25% Inventory Rebate';
            feeRate = 0.0025;
            isDiscounted = true;
        } else if (usdVolume >= 2000) {
            feeLabel = '0.50% Institutional Tier (≥$2k)';
            feeRate = 0.005;
            isDiscounted = true;
        }
        if (siloStakingTelemetry.feeRateCap < feeRate) {
            feeRate = siloStakingTelemetry.feeRateCap;
            feeLabel = siloStakingTelemetry.tierLabel;
            isDiscounted = true;
        }
        return {
            exchangeRate,
            usdVolume,
            feeLabel,
            feeRate,
            feeUsd: usdVolume * feeRate,
            isDiscounted
        };
    });

    $effect(() => {
        if (ui.swapIntent) {
            const intent = ui.swapIntent;
            activeDexTab = 'Swap';
            payTicker = intent.payTicker;
            receiveTicker = intent.receiveTicker;
            payAmount = intent.payAmount;
            swapError = null;
            swapSuccessId = null;
            swapLegs = [];
            const pVal = parseFloat(intent.payAmount);
            const pSpot = treasury.getAsset(intent.payTicker).spotPrice;
            const rSpot = treasury.getAsset(intent.receiveTicker).spotPrice;
            if (!isNaN(pVal) && pVal > 0 && pSpot > 0 && rSpot > 0) {
                receiveAmount = ((pVal * pSpot) / rSpot).toFixed(8);
            } else {
                receiveAmount = '';
            }
            triggerTileSweep();
            ui.clearSwapIntent();
        }
    });

    function syncSecondaryAmountsFromKasAnchor(kasValNum: number) {
        const kasSpot = lpTokenA.spotPrice || 0;
        if (isNaN(kasValNum) || kasValNum <= 0 || kasSpot <= 0) {
            lpAmountB = '';
            extraPlantLegs = extraPlantLegs.map((l) => ({ ...l, amount: '' }));
            return;
        }
        const anchorKasUsd = kasValNum * kasSpot;
        const bSpot = lpTokenB.spotPrice || 0;
        if (bSpot > 0) {
            const bUsdTarget = anchorKasUsd * (lpWeightPctB / 50.0);
            lpAmountB = (bUsdTarget / bSpot).toFixed(6);
        }
        extraPlantLegs = extraPlantLegs.map((leg) => {
            const legSpot = treasury.getAsset(leg.ticker).spotPrice || 0;
            if (legSpot <= 0) return { ...leg, amount: '' };
            const legUsdTarget = anchorKasUsd * (leg.weightPct / 50.0);
            return {
                ...leg,
                amount: (legUsdTarget / legSpot).toFixed(6)
            };
        });
    }

    function addSecondaryPlantLeg(defaultTicker?: string) {
        if (extraPlantLegs.length >= 3) return;
        const used = new Set([
            'KAS',
            lpTickerB.toUpperCase(),
            ...extraPlantLegs.map((l) => l.ticker.toUpperCase())
        ]);
        const candidates = ['NVDA', 'XAU', 'BTC', 'SPY', 'USTB', 'ETH', 'SOL'];
        const chosen =
            defaultTicker && !used.has(defaultTicker.toUpperCase())
                ? defaultTicker.toUpperCase()
                : candidates.find((c) => !used.has(c)) || 'NVDA';
        const nextCount = 1 + extraPlantLegs.length + 1;
        const equalShare = Number((50.0 / nextCount).toFixed(2));
        let allocated = equalShare;
        lpWeightPctB = equalShare;
        const updatedExtras = extraPlantLegs.map((l) => {
            allocated += equalShare;
            return { ...l, weightPct: equalShare };
        });
        const finalShare = Number(Math.max(0.5, 50.0 - allocated).toFixed(2));
        extraPlantLegs = [
            ...updatedExtras,
            { ticker: chosen, weightPct: finalShare, amount: '' }
        ];
        const kasNum = parseFloat(lpAmountA);
        if (!isNaN(kasNum) && kasNum > 0) {
            syncSecondaryAmountsFromKasAnchor(kasNum);
        }
    }

    function removeSecondaryPlantLeg(idx: number) {
        const remaining = extraPlantLegs.filter((_, i) => i !== idx);
        const totalSecCount = 1 + remaining.length;
        const equalW = Number((50.0 / totalSecCount).toFixed(2));
        lpWeightPctB =
            remaining.length === 0
                ? 50.0
                : Number((50.0 - equalW * remaining.length).toFixed(2));
        extraPlantLegs = remaining.map((l) => ({ ...l, weightPct: equalW }));
        const kasNum = parseFloat(lpAmountA);
        if (!isNaN(kasNum) && kasNum > 0) {
            syncSecondaryAmountsFromKasAnchor(kasNum);
        }
    }

    function adjustDexPlantSecondaryWeights(
        changedKey: 'B' | number,
        rawNewPct: number
    ) {
        if (extraPlantLegs.length === 0) {
            lpWeightPctB = 50.0;
            return;
        }
        const clamped = Math.max(1.0, Math.min(48.0, rawNewPct));
        const remForOthers = Math.max(1.0, 50.0 - clamped);
        if (changedKey === 'B') {
            lpWeightPctB = Number(clamped.toFixed(2));
            const oldSum = extraPlantLegs.reduce(
                (s, l) => s + Math.max(0.1, l.weightPct),
                0
            );
            extraPlantLegs = extraPlantLegs.map((l) => {
                const share =
                    oldSum > 0
                        ? (Math.max(0.1, l.weightPct) / oldSum) * remForOthers
                        : remForOthers / extraPlantLegs.length;
                return { ...l, weightPct: Number(share.toFixed(2)) };
            });
        } else {
            const otherExtras = extraPlantLegs.filter(
                (_, idx) => idx !== changedKey
            );
            const oldOtherSum =
                Math.max(0.1, lpWeightPctB) +
                otherExtras.reduce((s, l) => s + Math.max(0.1, l.weightPct), 0);
            lpWeightPctB = Number(
                (
                    (Math.max(0.1, lpWeightPctB) / oldOtherSum) *
                    remForOthers
                ).toFixed(2)
            );
            extraPlantLegs = extraPlantLegs.map((l, idx) => {
                if (idx === changedKey) {
                    return { ...l, weightPct: Number(clamped.toFixed(2)) };
                }
                const share =
                    (Math.max(0.1, l.weightPct) / oldOtherSum) * remForOthers;
                return { ...l, weightPct: Number(share.toFixed(2)) };
            });
        }
        const kasNum = parseFloat(lpAmountA);
        if (!isNaN(kasNum) && kasNum > 0) {
            syncSecondaryAmountsFromKasAnchor(kasNum);
        }
    }

    async function syncUserBalances() {
        if (!identity.isWalletConnected || !identity.activeAddress) return;
        try {
            const [ledgerRes, onChainRes] = await Promise.all([
                fetch(
                    `/api/user/ledger?wallet=${encodeURIComponent(identity.activeAddress)}`
                ),
                fetch(
                    `/api/balance?address=${encodeURIComponent(identity.activeAddress)}`
                )
            ]);
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
            if (onChainRes.ok) {
                const balData = await onChainRes.json();
                if (typeof balData.balance === 'number') {
                    treasury.updateAsset('KAS', { onChain: balData.balance });
                }
            }
        } catch {
            // Ignore transient sync error
        }
    }

    async function fetchSiloStaking() {
        if (!identity.isWalletConnected || !identity.activeAddress) return;
        try {
            const res = await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'GET_SILO_STAKING',
                    payload: {}
                })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.data) {
                    const d = data.data;
                    siloStakingTelemetry = {
                        ecosystemTicker:
                            d.ecosystemTicker || DEFAULT_ECOSYSTEM_TICKER,
                        activeStaked: Number(d.activeStaked || 0),
                        cooldownStaked: Number(d.cooldownStaked || 0),
                        combinedEligibleStaked: Number(
                            d.combinedEligibleStaked || 0
                        ),
                        feeRateCap: Number(d.feeRateCap ?? 0.015),
                        tierLabel: d.tierLabel || '1.50% Standard Tier',
                        positions: Array.isArray(d.positions) ? d.positions : []
                    };
                    treasury.updateAsset(siloStakingTelemetry.ecosystemTicker, {
                        lpStaked:
                            siloStakingTelemetry.activeStaked +
                            siloStakingTelemetry.cooldownStaked
                    });
                }
            }
        } catch {
            // Ignore staking poll error
        }
    }

    async function executeStakeSilo() {
        if (!identity.activeAddress) {
            ui.showWalletModal = true;
            return;
        }
        const amt = parseFloat(siloStakeAmountInput);
        if (isNaN(amt) || amt <= 0) return;
        isStakingSilo = true;
        swapError = null;
        try {
            const res = await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'STAKE_SILO',
                    payload: {
                        ticker: DEFAULT_ECOSYSTEM_TICKER,
                        amount: amt
                    }
                })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                siloStakeAmountInput = '';
                ui.triggerMicroBadge(
                    'silo_stake_btn',
                    `+${amt.toLocaleString()} ${DEFAULT_ECOSYSTEM_TICKER} STAKED ✓`,
                    '#18C6A5'
                );
                await Promise.all([fetchSiloStaking(), syncUserBalances()]);
            } else {
                swapError = formatRetailSafeCopy(
                    data.error ||
                        `Failed to stake ${DEFAULT_ECOSYSTEM_TICKER}.`
                );
            }
        } catch (err: any) {
            swapError = formatRetailSafeCopy(
                err.message || 'SILO staking request failed.'
            );
        } finally {
            isStakingSilo = false;
        }
    }

    async function initiateSiloCooldown(stakeId: string) {
        if (!identity.activeAddress) return;
        isMutatingSiloId = stakeId;
        swapError = null;
        try {
            const res = await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'INITIATE_SILO_COOLDOWN',
                    payload: { stakeId }
                })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                ui.triggerMicroBadge(
                    `silo_pos_${stakeId}`,
                    '7-DAY COOLDOWN STARTED ✓',
                    '#F59E0B'
                );
                await fetchSiloStaking();
            } else {
                swapError = formatRetailSafeCopy(
                    data.error || 'Failed to initiate 7-day cooldown.'
                );
            }
        } catch (err: any) {
            swapError = formatRetailSafeCopy(err.message);
        } finally {
            isMutatingSiloId = null;
        }
    }

    async function claimUnstakedSilo(stakeId: string) {
        if (!identity.activeAddress) return;
        isMutatingSiloId = stakeId;
        swapError = null;
        try {
            const res = await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'CLAIM_UNSTAKED_SILO',
                    payload: { stakeId }
                })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                ui.triggerMicroBadge(
                    `silo_pos_${stakeId}`,
                    `${DEFAULT_ECOSYSTEM_TICKER} CLAIMED ✓`,
                    '#18C6A5'
                );
                await Promise.all([fetchSiloStaking(), syncUserBalances()]);
            } else {
                swapError = formatRetailSafeCopy(
                    data.error || '7-day unbonding cooldown is still active.'
                );
            }
        } catch (err: any) {
            swapError = formatRetailSafeCopy(err.message);
        } finally {
            isMutatingSiloId = null;
        }
    }

    async function checkFiatGatewayStatus() {
        try {
            const [offRes, onRes] = await Promise.all([
                fetch('/api/fiat/offramp'),
                fetch('/api/fiat/onramp')
            ]);
            if (offRes.ok) {
                const status = await offRes.json();
                circleDirectActive = Boolean(status.circleConfigured);
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
                    payoutMethod =
                        status.savedBankRail.payoutMethod === 'WIRE'
                            ? 'wire'
                            : 'ach';
                }
                if (Array.isArray(status.recentPayouts)) {
                    recentOfframpPayouts = status.recentPayouts;
                }
            }
            if (onRes.ok) {
                const onData = await onRes.json();
                if (Array.isArray(onData.fiatLedgerEvents)) {
                    fiatHistoryEvents = onData.fiatLedgerEvents;
                }
                if (Array.isArray(onData.recentOnrampSessions)) {
                    recentOnrampSessions = onData.recentOnrampSessions;
                }
            }
        } catch {
            // Ignore gateway poll error
        }
    }

    async function saveBankRailVault() {
        offrampError = null;
        offrampSuccessBanner = null;
        const cleanRouting = offrampRoutingNumber.replace(/\D/g, '').trim();
        const cleanAccount = offrampAccountNumber.replace(/\D/g, '').trim();
        if (cleanRouting.length !== 9 || cleanAccount.length < 4) {
            offrampError =
                'Please enter a valid 9-digit ABA Routing Number and Bank Account Number (minimum 4 digits).';
            return;
        }
        if (!abaTelemetry.checksumValid) {
            offrampError =
                'ABA_CHECKSUM_INVALID: The 9-digit routing number failed the Federal Reserve mod-10 checksum test.';
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
                return;
            }
            savedBankLast4 = data.savedBankRailLast4 || cleanAccount.slice(-4);
            if (data.savedBankRail) {
                savedBankRailMeta = data.savedBankRail;
            }
            offrampRoutingNumber = '';
            offrampAccountNumber = '';
            isEditingBankRail = false;
            offrampSuccessBanner = `AES-256-GCM Bank Rail Vault Updated (${resolvedLabel} • *${savedBankLast4} • ${offrampAccountType})`;
            ui.triggerMicroBadge(
                'dex_fiat_btn',
                `BANK *${savedBankLast4} SAVED ✓`,
                '#18C6A5'
            );
        } catch (err: any) {
            offrampError = err.message || 'Failed to save encrypted bank rail.';
        } finally {
            isSavingBankRail = false;
        }
    }

    async function downloadWireSlipPdf(sessionObj: any) {
        if (!browser || !sessionObj) return;
        try {
            const pdfDoc = await PDFDocument.create();
            const page = pdfDoc.addPage([612, 520]);
            const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const fontBold = await pdfDoc.embedFont(
                StandardFonts.HelveticaBold
            );
            const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
            const slateBg = rgb(0.04, 0.05, 0.07);
            const teal = rgb(0.094, 0.776, 0.647);
            const dark = rgb(0.1, 0.12, 0.16);
            const muted = rgb(0.42, 0.46, 0.52);
            page.drawRectangle({
                x: 0,
                y: 440,
                width: 612,
                height: 80,
                color: slateBg
            });
            page.drawText(
                'PERENNIA SOVEREIGN TREASURY — OFFICIAL WIRE / ACH SLIP',
                {
                    x: 36,
                    y: 484,
                    size: 13,
                    font: fontBold,
                    color: teal
                }
            );
            page.drawText(
                `ORDER ID: ${sessionObj.sessionId || sessionObj.orderId} • MANDATORY MEMO: ${sessionObj.wireMemo || sessionObj.sessionId}`,
                {
                    x: 36,
                    y: 462,
                    size: 9,
                    font: fontMono,
                    color: rgb(0.9, 0.92, 0.95)
                }
            );
            const wi = sessionObj.wireInstructions || {
                beneficiaryName:
                    'Perennia Holdings, LLC — Sovereign Treasury',
                bankName: 'Mercury / Column N.A. Commercial Vault',
                routingNumber: '021000021',
                accountNumber: '8804921044',
                accountType: 'COMMERCIAL CHECKING'
            };
            const lines = [
                [
                    'MANDATORY WIRE / ACH MEMO',
                    String(sessionObj.wireMemo || sessionObj.sessionId)
                ],
                ['BENEFICIARY NAME', String(wi.beneficiaryName)],
                ['RECEIVING COMMERCIAL BANK', String(wi.bankName)],
                ['9-DIGIT ABA ROUTING NUMBER', String(wi.routingNumber)],
                ['COMMERCIAL ACCOUNT NUMBER', String(wi.accountNumber)],
                [
                    'ACCOUNT TYPE',
                    String(wi.accountType || 'COMMERCIAL CHECKING')
                ],
                [
                    'USD AMOUNT TO WIRE',
                    `$${Number(sessionObj.fiatAmountUsd || onrampFiatAmountUsd || 0).toFixed(2)} USD`
                ],
                [
                    'ESTIMATED KAS DELIVERY',
                    `~${Number(sessionObj.estimatedKas || 0).toFixed(4)} KAS (@ $${Number(sessionObj.spotPrice || 0).toFixed(4)})`
                ],
                [
                    'SETTLEMENT TARGET',
                    String(sessionObj.settlementTarget || 'LEDGER_KAS')
                ],
                [
                    'DESTINATION KASPA WALLET',
                    String(
                        identity.activeAddress || sessionObj.walletAddress || ''
                    )
                ]
            ];
            let y = 406;
            for (const [label, val] of lines) {
                page.drawRectangle({
                    x: 36,
                    y: y - 8,
                    width: 540,
                    height: 28,
                    borderColor: rgb(0.84, 0.87, 0.9),
                    borderWidth: 1
                });
                page.drawText(label, {
                    x: 46,
                    y: y + 2,
                    size: 8,
                    font: fontBold,
                    color: muted
                });
                page.drawText(val.slice(0, 62), {
                    x: 235,
                    y: y + 2,
                    size: 8.5,
                    font: fontMono,
                    color: dark
                });
                y -= 34;
            }
            page.drawText(
                'IMPORTANT: Include the exact Wire Memo above in your bank transfer reference field for automated Director reconciliation.',
                {
                    x: 36,
                    y: 36,
                    size: 7.5,
                    font: fontReg,
                    color: muted
                }
            );
            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes as any], {
                type: 'application/pdf'
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Perennia_Wire_Slip_${sessionObj.wireMemo || sessionObj.sessionId}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            ui.triggerMicroBadge(
                'dex_fiat_btn',
                'WIRE SLIP PDF DOWNLOADED ✓',
                '#18C6A5'
            );
        } catch (err) {
            console.error('Failed to generate Wire Slip PDF:', err);
        }
    }

    async function downloadAchPayoutReceiptPdf(payout: any) {
        if (!browser || !payout) return;
        try {
            const pdfDoc = await PDFDocument.create();
            const page = pdfDoc.addPage([612, 480]);
            const fontBold = await pdfDoc.embedFont(
                StandardFonts.HelveticaBold
            );
            const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
            const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const slateBg = rgb(0.04, 0.05, 0.07);
            const teal = rgb(0.094, 0.776, 0.647);
            const dark = rgb(0.1, 0.12, 0.16);
            const muted = rgb(0.42, 0.46, 0.52);
            page.drawRectangle({
                x: 0,
                y: 400,
                width: 612,
                height: 80,
                color: slateBg
            });
            page.drawText(
                'PERENNIA SOVEREIGN TREASURY — ACH / WIRE SETTLEMENT RECEIPT',
                {
                    x: 36,
                    y: 444,
                    size: 12.5,
                    font: fontBold,
                    color: teal
                }
            );
            page.drawText(
                `PAYOUT ID: ${payout.payout_id || payout.payoutId} • STATUS: ${payout.status}`,
                {
                    x: 36,
                    y: 422,
                    size: 9,
                    font: fontMono,
                    color: rgb(0.9, 0.92, 0.95)
                }
            );
            const rows = [
                [
                    'PAYOUT REFERENCE ID',
                    String(payout.payout_id || payout.payoutId)
                ],
                [
                    'SETTLEMENT STATUS',
                    String(payout.status || 'QUEUED_FOR_TREASURY_DISPATCH')
                ],
                [
                    'ACH / WIRE TRACE NUMBER',
                    String(
                        payout.trace_id ||
                            payout.traceId ||
                            'AWAITING_BATCH_TRACE'
                    )
                ],
                [
                    'DESTINATION BANK RAIL',
                    `${payout.payout_method || 'ACH'} Account Ending *${payout.bank_last4 || '0000'}`
                ],
                [
                    'SOURCE ASSET LIQUIDATED',
                    `${Number(payout.amount_crypto || 0).toFixed(4)} ${payout.source_asset || 'KAS'} (${payout.source_type || 'ledger'})`
                ],
                [
                    'GROSS USD PROCEEDS',
                    `$${Number(payout.gross_usd || 0).toFixed(2)} USD`
                ],
                [
                    'PROTOCOL & RAIL FEE',
                    `-$${Number(payout.fee_usd || 0).toFixed(2)} USD`
                ],
                [
                    'NET USD DISPATCHED TO BANK',
                    `$${Number(payout.net_fiat_usd || 0).toFixed(2)} USD`
                ],
                [
                    'CREATED TIMESTAMP',
                    String(
                        payout.created_at
                            ? new Date(payout.created_at).toISOString()
                            : new Date().toISOString()
                    )
                ]
            ];
            let y = 364;
            for (const [label, val] of rows) {
                page.drawRectangle({
                    x: 36,
                    y: y - 8,
                    width: 540,
                    height: 28,
                    borderColor: rgb(0.84, 0.87, 0.9),
                    borderWidth: 1
                });
                page.drawText(label, {
                    x: 46,
                    y: y + 2,
                    size: 8,
                    font: fontBold,
                    color: muted
                });
                page.drawText(val.slice(0, 62), {
                    x: 240,
                    y: y + 2,
                    size: 8.5,
                    font: fontMono,
                    color: dark
                });
                y -= 34;
            }
            page.drawText(
                'Cryptographically verified by Perennia Fiat Bridge • Zero-PII Client Receipt.',
                {
                    x: 36,
                    y: 32,
                    size: 7.5,
                    font: fontReg,
                    color: muted
                }
            );
            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes as any], {
                type: 'application/pdf'
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Perennia_ACH_Receipt_${payout.payout_id || payout.payoutId}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Failed to compile ACH receipt PDF:', err);
        }
    }

    function getPayoutStageIndex(statusRaw: string): number {
        const st = String(statusRaw || '').toUpperCase();
        if (st.includes('DISPATCHED')) return 4;
        if (st.includes('QUEUED')) return 3;
        if (st.includes('NETTED')) return 2;
        return 1;
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
                        ui.triggerMicroBadge(
                            'dex_fiat_btn',
                            'ON-RAMP COMPLETED ✓',
                            '#18C6A5'
                        );
                        syncUserBalances();
                        checkFiatGatewayStatus();
                    }
                }
            }
        } catch {
            // Ignore poll timeout
        }
    }

    function calcFiatFromCrypto() {
        const amt = parseFloat(otcCryptoAmountInput);
        if (isNaN(amt) || amt <= 0) {
            otcNetFiatOutput = 0;
            otcSpreadFee = 0;
            isWhaleWaiverActive = false;
            return;
        }
        const unitSpot =
            offrampSourceMode === 'ledger_usdc'
                ? 1.0
                : treasury.getAsset('KAS').spotPrice;
        const grossUsd = amt * unitSpot;
        isWhaleWaiverActive = grossUsd >= 2000.0;
        const activeSpreadPct =
            offrampSourceMode === 'ledger_usdc'
                ? isWhaleWaiverActive
                    ? 0.0025
                    : 0.005
                : isWhaleWaiverActive
                  ? 0.005
                  : 0.015;
        otcSpreadFee = grossUsd * activeSpreadPct;
        let activeTransferFee = 0.0;
        if (!isWhaleWaiverActive) {
            activeTransferFee =
                payoutMethod === 'wire' ? WIRE_FEE_USD : ACH_FEE_USD;
        }
        const net = grossUsd - otcSpreadFee - activeTransferFee;
        otcNetFiatOutput = Math.max(0, net);
    }

    async function triggerFiatOfframp() {
        offrampError = null;
        offrampSuccessBanner = null;
        const parsedAmount = parseFloat(otcCryptoAmountInput);
        if (isNaN(parsedAmount) || parsedAmount <= 0) return;
        if (parsedAmount > offrampAvailableSourceBalance + 1e-6) {
            offrampError = `Insufficient ${offrampSelectedAssetTicker} in selected source (${offrampAvailableSourceBalance.toFixed(4)} available).`;
            return;
        }
        try {
            const preFlightRes = await fetch('/api/fiat/offramp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet: identity.activeAddress,
                    amountKas: parsedAmount,
                    kasAmount: parsedAmount,
                    amountAsset: parsedAmount,
                    sourceMode: offrampSourceMode,
                    sourceAsset: offrampSelectedAssetTicker,
                    payoutMethod,
                    bankLabel:
                        offrampBankLabel.trim() || 'Primary Operating Account',
                    accountType: offrampAccountType,
                    routingNumber: offrampRoutingNumber.trim() || undefined,
                    accountNumber: offrampAccountNumber.trim() || undefined,
                    systemMode: ui.systemMode,
                    preFlightOnly: true
                })
            });
            const preFlightData = await preFlightRes.json().catch(() => ({}));
            if (!preFlightRes.ok) {
                offrampError =
                    preFlightData.error ||
                    'Fiat Off-Ramp pre-flight check failed.';
                return;
            }
            if (preFlightData.bankAccountLast4) {
                savedBankLast4 = preFlightData.bankAccountLast4;
            }
        } catch (err: any) {
            offrampError =
                err.message || 'Unable to verify Fiat Off-Ramp gateway.';
            return;
        }
        identity.requestVaultAuthorization({
            actionType: 'FIAT_OFFRAMP',
            sourceMode: offrampSourceMode,
            payAsset: offrampSelectedAssetTicker,
            payAmount: parsedAmount,
            fiatAmount: otcNetFiatOutput.toFixed(2),
            payoutMethod: payoutMethod,
            bankLabel: offrampBankLabel.trim() || 'Primary Operating Account',
            accountType: offrampAccountType,
            routingNumber: offrampRoutingNumber.trim() || undefined,
            accountNumber: offrampAccountNumber.trim() || undefined,
            destinationAddress:
                offrampSourceMode === 'onchain_kas'
                    ? 'kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579'
                    : `Internal Treasury Ledger (${offrampSelectedAssetTicker} → ${payoutMethod.toUpperCase()})`
        });
        otcCryptoAmountInput = '';
        otcNetFiatOutput = 0;
    }

    async function initiateFiatOnramp() {
        if (!identity.activeAddress) {
            ui.showWalletModal = true;
            return;
        }
        isInitializingOnramp = true;
        onrampError = null;
        onrampSessionData = null;
        try {
            const res = await fetch('/api/fiat/onramp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    walletAddress: identity.activeAddress,
                    fiatAmountUsd: parseFloat(onrampFiatAmountUsd) || 250,
                    paymentRail: onrampPaymentRail,
                    settlementTarget: onrampSettlementTarget
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(
                    data.error || 'Failed to initialize Fiat On-Ramp session.'
                );
            }
            onrampSessionData = {
                sessionId: data.sessionId,
                clientSecret: data.clientSecret,
                estimatedKas: data.estimatedKas,
                spotPrice: data.spotPrice,
                feeUsd: data.feeUsd,
                netUsdConverted: data.netUsdConverted,
                paymentRail: data.paymentRail,
                settlementTarget: data.settlementTarget,
                wireMemo: data.wireMemo,
                wireInstructions: data.wireInstructions,
                widgetUrl: data.widgetUrl,
                nonKycTier: data.nonKycTier,
                status: data.status || 'ARMED_NON_KYC'
            };
            triggerTileSweep();
            ui.triggerMicroBadge(
                'dex_fiat_btn',
                data.paymentRail === 'SOVEREIGN_WIRE_ACH'
                    ? `WIRE ${data.wireMemo} ARMED ✓`
                    : 'ON-RAMP ARMED ✓',
                '#18C6A5'
            );
            checkFiatGatewayStatus();
        } catch (e: any) {
            onrampError = e.message || 'Fiat On-Ramp initialization failed.';
        } finally {
            isInitializingOnramp = false;
        }
    }

    // Universal Dynamic Asset Discovery State
    let globalSearchQuery = $state('');
    let isDiscoveringGlobal = $state(false);
    let discoveredGlobalAsset = $state<DiscoveredOracleAsset | null>(null);
    let discoverGlobalError = $state<string | null>(null);

    let isTokenModalOpen = $state(false);
    let activeSelection = $state<
        | 'pay'
        | 'receive'
        | 'lpA'
        | 'lpB'
        | 'lpExtra'
        | 'p2pSell'
        | 'p2pBuy'
        | null
    >(null);
    let tokenSearchQuery = $state('');
    let isDiscoveringModal = $state(false);
    let discoveredModalAsset = $state<DiscoveredOracleAsset | null>(null);
    let discoverModalError = $state<string | null>(null);
    let isPersistingWalletToken = $state<string | null>(null);

    let tokenCategoryFilter = $state<
        'ALL' | 'CRYPTO' | 'EQUITIES' | 'COMMODITIES'
    >('ALL');
    let slippageTolerance = $state('0.5');

    let filteredTokens = $derived(
        treasury.registry.filter((t) => {
            const q = tokenSearchQuery.trim().toLowerCase();
            const matchSearch =
                !q ||
                t.ticker.toLowerCase().includes(q) ||
                t.name.toLowerCase().includes(q) ||
                t.assetClass.toLowerCase().includes(q);
            if (!matchSearch) return false;
            if (tokenCategoryFilter === 'EQUITIES') {
                return t.assetClass === 'Public Equity';
            }
            if (tokenCategoryFilter === 'COMMODITIES') {
                return (
                    t.assetClass === 'Commodity' ||
                    t.assetClass === 'Sovereign Debt'
                );
            }
            if (tokenCategoryFilter === 'CRYPTO') {
                return (
                    t.assetClass === 'Native L1' ||
                    t.assetClass === 'Stablecoin' ||
                    t.assetClass === 'Ecosystem' ||
                    t.assetClass === 'DeFi' ||
                    t.assetClass === 'Tokenized Asset'
                );
            }
            return true;
        })
    );

    let globalSearchResults = $derived(
        globalSearchQuery.trim()
            ? treasury.registry.filter(
                  (t) =>
                      t.ticker
                          .toLowerCase()
                          .includes(globalSearchQuery.trim().toLowerCase()) ||
                      t.name
                          .toLowerCase()
                          .includes(globalSearchQuery.trim().toLowerCase())
              )
            : []
    );

    async function queryDynamicOracleDiscovery(
        rawQuery: string,
        mode: 'global' | 'modal'
    ) {
        const cleanTicker = rawQuery
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, 12);
        if (cleanTicker.length < 2) {
            if (mode === 'global') {
                isDiscoveringGlobal = false;
                discoveredGlobalAsset = null;
                discoverGlobalError = null;
            } else {
                isDiscoveringModal = false;
                discoveredModalAsset = null;
                discoverModalError = null;
            }
            return;
        }

        const existingInRegistry = treasury.registry.find(
            (a) => a.ticker.toUpperCase() === cleanTicker
        );
        if (existingInRegistry && existingInRegistry.spotPrice > 0) {
            if (mode === 'global') {
                isDiscoveringGlobal = false;
                discoveredGlobalAsset = null;
                discoverGlobalError = null;
            } else {
                isDiscoveringModal = false;
                discoveredModalAsset = null;
                discoverModalError = null;
            }
            return;
        }

        if (mode === 'global') {
            isDiscoveringGlobal = true;
            discoverGlobalError = null;
        } else {
            isDiscoveringModal = true;
            discoverModalError = null;
        }

        try {
            const res = await fetch(
                `/api/prices?discover=${encodeURIComponent(cleanTicker)}`
            );
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success && data.asset) {
                const asset: DiscoveredOracleAsset = data.asset;
                const derivedAddr = resolveSovereignAddressForChain(
                    asset.network || asset.ticker,
                    identity.sovereignKeys,
                    identity.activeAddress
                );
                treasury.updateAsset(asset.ticker, {
                    name: asset.name,
                    assetClass: asset.assetClass,
                    network: asset.network,
                    spotPrice: Number(asset.spotPrice || 0),
                    delta: Number(asset.change24h || 0),
                    contract: asset.contract || asset.ticker,
                    address: derivedAddr,
                    imgUrl: asset.imgUrl || '',
                    theme: asset.theme || {
                        hex: '#18C6A5',
                        pastel: '#99f6e4'
                    }
                });
                if (mode === 'global') {
                    discoveredGlobalAsset = asset;
                    discoverGlobalError = null;
                } else {
                    discoveredModalAsset = asset;
                    discoverModalError = null;
                }
            } else {
                if (mode === 'global') {
                    discoveredGlobalAsset = null;
                    discoverGlobalError =
                        data.error ||
                        `No live oracle feed found for "${cleanTicker}".`;
                } else {
                    discoveredModalAsset = null;
                    discoverModalError =
                        data.error ||
                        `No live oracle feed found for "${cleanTicker}".`;
                }
            }
        } catch {
            if (mode === 'global') {
                discoveredGlobalAsset = null;
                discoverGlobalError = 'Live oracle discovery timed out.';
            } else {
                discoveredModalAsset = null;
                discoverModalError = 'Live oracle discovery timed out.';
            }
        } finally {
            if (mode === 'global') {
                isDiscoveringGlobal = false;
            } else {
                isDiscoveringModal = false;
            }
        }
    }

    function handleGlobalSearchInput() {
        clearTimeout(globalDiscoverDebounce);
        const q = globalSearchQuery.trim();
        if (q.length < 2) {
            isDiscoveringGlobal = false;
            discoveredGlobalAsset = null;
            discoverGlobalError = null;
            return;
        }
        globalDiscoverDebounce = setTimeout(() => {
            queryDynamicOracleDiscovery(q, 'global');
        }, 260);
    }

    function handleModalSearchInput() {
        clearTimeout(modalDiscoverDebounce);
        const q = tokenSearchQuery.trim();
        if (q.length < 2) {
            isDiscoveringModal = false;
            discoveredModalAsset = null;
            discoverModalError = null;
            return;
        }
        modalDiscoverDebounce = setTimeout(() => {
            queryDynamicOracleDiscovery(q, 'modal');
        }, 260);
    }

    async function persistCustomTokenToWallet(tokenSpec: {
        ticker: string;
        name: string;
        assetClass?: string;
        network?: string;
        spotPrice: number;
        delta?: number;
        contract?: string;
        imgUrl?: string;
        theme?: { hex: string; pastel: string };
    }) {
        const cleanTicker = tokenSpec.ticker.trim().toUpperCase();
        const cleanNetwork = (
            tokenSpec.network ||
            (cleanTicker.length <= 6 ? 'KAS' : 'ETH')
        )
            .trim()
            .toUpperCase();
        const derivedAddr = resolveSovereignAddressForChain(
            cleanNetwork,
            identity.sovereignKeys,
            identity.activeAddress
        );

        treasury.updateAsset(cleanTicker, {
            name: tokenSpec.name || cleanTicker,
            assetClass: (tokenSpec.assetClass as any) || 'DeFi',
            network: cleanNetwork,
            spotPrice: Number(tokenSpec.spotPrice || 0),
            delta: Number(tokenSpec.delta || 0),
            contract: tokenSpec.contract || cleanTicker,
            address: derivedAddr,
            imgUrl: tokenSpec.imgUrl || '',
            theme: tokenSpec.theme || { hex: '#18C6A5', pastel: '#99f6e4' }
        });

        if (browser && identity.activeAddress) {
            try {
                const storageKey = `p_custom_tokens_${identity.activeAddress}`;
                const existingRaw = localStorage.getItem(storageKey);
                const parsed = existingRaw
                    ? JSON.parse(existingRaw)
                    : {
                          activeNetworks: ['BTC', 'ETH', 'SOL'],
                          userCustomTokens: {},
                          selectedTokensMap: {},
                          customNetworks: []
                      };
                if (!parsed.userCustomTokens) parsed.userCustomTokens = {};
                if (!parsed.selectedTokensMap) parsed.selectedTokensMap = {};
                if (!Array.isArray(parsed.userCustomTokens[cleanNetwork])) {
                    parsed.userCustomTokens[cleanNetwork] = [];
                }
                if (!Array.isArray(parsed.selectedTokensMap[cleanNetwork])) {
                    parsed.selectedTokensMap[cleanNetwork] = [];
                }
                if (
                    !parsed.userCustomTokens[cleanNetwork].some(
                        (t: any) =>
                            String(t.symbol || '').toUpperCase() === cleanTicker
                    )
                ) {
                    parsed.userCustomTokens[cleanNetwork].push({
                        symbol: cleanTicker,
                        name: tokenSpec.name || cleanTicker,
                        hex: tokenSpec.theme?.hex || '#18C6A5',
                        imgUrl: tokenSpec.imgUrl || '',
                        balance: 0,
                        onChain: 0,
                        synthetic: 0,
                        price: Number(tokenSpec.spotPrice || 0),
                        contract: tokenSpec.contract || cleanTicker,
                        badge: tokenSpec.assetClass || 'DeFi'
                    });
                }
                if (
                    !parsed.selectedTokensMap[cleanNetwork].includes(
                        cleanTicker
                    )
                ) {
                    parsed.selectedTokensMap[cleanNetwork].push(cleanTicker);
                }
                if (
                    cleanNetwork !== 'KAS' &&
                    Array.isArray(parsed.activeNetworks) &&
                    !parsed.activeNetworks.includes(cleanNetwork)
                ) {
                    parsed.activeNetworks.push(cleanNetwork);
                }
                localStorage.setItem(storageKey, JSON.stringify(parsed));
                fetch('/api/treasury/preferences', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        walletAddress: identity.activeAddress,
                        preferences: parsed
                    })
                }).catch(() => {});
            } catch {
                // Ignore local storage quota or parse warning
            }
        }

        if (identity.isWalletConnected) {
            isPersistingWalletToken = cleanTicker;
            try {
                await fetch('/api/state/action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'ADD_CUSTOM_TOKEN',
                        payload: {
                            ticker: cleanTicker,
                            symbol: cleanTicker,
                            name: tokenSpec.name || cleanTicker,
                            assetClass: tokenSpec.assetClass || 'DeFi',
                            network: cleanNetwork,
                            spotPrice: Number(tokenSpec.spotPrice || 0),
                            change24h: Number(tokenSpec.delta || 0),
                            contract: tokenSpec.contract || cleanTicker,
                            imgUrl: tokenSpec.imgUrl || '',
                            theme: tokenSpec.theme || {
                                hex: '#18C6A5',
                                pastel: '#99f6e4'
                            }
                        }
                    })
                });
            } catch {
                // Non-blocking fallback
            } finally {
                isPersistingWalletToken = null;
            }
        }
    }

    async function applyDiscoveredOrSearchAsset(
        assetObj: {
            ticker: string;
            name: string;
            assetClass?: string;
            network?: string;
            spotPrice: number;
            delta?: number;
            change24h?: number;
            contract?: string;
            imgUrl?: string;
            icon?: string;
            hex?: string;
            theme?: { hex: string; pastel: string };
        },
        role: 'pay' | 'receive' | 'wallet'
    ) {
        const cleanTicker = assetObj.ticker.trim().toUpperCase();
        await persistCustomTokenToWallet({
            ticker: cleanTicker,
            name: assetObj.name || cleanTicker,
            assetClass: assetObj.assetClass || 'DeFi',
            network: assetObj.network || 'ETH',
            spotPrice: Number(assetObj.spotPrice || 0),
            delta: Number(assetObj.delta ?? assetObj.change24h ?? 0),
            contract: assetObj.contract || cleanTicker,
            imgUrl: assetObj.imgUrl || assetObj.icon || '',
            theme: assetObj.theme || {
                hex: assetObj.hex || '#18C6A5',
                pastel: '#99f6e4'
            }
        });

        if (role === 'pay') {
            if (receiveTicker === cleanTicker) {
                receiveTicker = payTicker;
            }
            payTicker = cleanTicker;
            activeDexTab = 'Swap';
        } else if (role === 'receive') {
            if (payTicker === cleanTicker) {
                payTicker = receiveTicker;
            }
            receiveTicker = cleanTicker;
            activeDexTab = 'Swap';
        }

        const pVal = parseFloat(payAmount);
        const pSpot = treasury.getAsset(payTicker).spotPrice;
        const rSpot = treasury.getAsset(receiveTicker).spotPrice;
        if (!isNaN(pVal) && pVal > 0 && pSpot > 0 && rSpot > 0) {
            receiveAmount = ((pVal * pSpot) / rSpot).toFixed(8);
        }

        if (role === 'wallet') {
            ui.triggerMicroBadge(
                'dex_swap_btn',
                `+${cleanTicker} ADDED TO WALLET ✓`,
                '#18C6A5'
            );
        } else {
            ui.triggerMicroBadge(
                'dex_swap_btn',
                `${cleanTicker} → ${role === 'pay' ? 'YOU PAY' : 'YOU RECEIVE'} ✓`,
                '#18C6A5'
            );
            globalSearchQuery = '';
            discoveredGlobalAsset = null;
            isTokenModalOpen = false;
            triggerTileSweep();
        }
    }

    async function fetchP2pOrders() {
        try {
            const res = await fetch('/api/p2p');
            if (res.ok) p2pOrders = await res.json();
        } catch {
            // Ignore P2P poll error
        }
    }

    function isOrderMaker(sellerAddress: string): boolean {
        if (!identity.activeAddress || !sellerAddress) return false;
        const cleanSeller = sellerAddress
            .trim()
            .toLowerCase()
            .replace(/^kaspa:/i, '');
        const cleanMe = identity.activeAddress
            .trim()
            .toLowerCase()
            .replace(/^kaspa:/i, '');
        return cleanSeller === cleanMe || Boolean(identity.isCorporateAdmin);
    }

    async function cancelP2pOrder(orderId: string) {
        if (!identity.activeAddress) return;
        isCancellingP2pId = orderId;
        swapError = null;
        try {
            const res = await fetch(
                `/api/p2p?id=${encodeURIComponent(orderId)}`,
                {
                    method: 'DELETE'
                }
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || 'Failed to cancel P2P offer.');
            }
            p2pOrders = p2pOrders.filter((o) => o.id !== orderId);
            ui.triggerMicroBadge(
                `p2p_order_${orderId}`,
                'OFFER CANCELLED ✓',
                '#18C6A5'
            );
            triggerTileSweep();
        } catch (err: any) {
            swapError = formatRetailSafeCopy(
                err.message || 'Could not cancel P2P offer.'
            );
        } finally {
            isCancellingP2pId = null;
        }
    }

    async function fetchTreasuryLiquid() {
        try {
            const res = await fetch(
                `/api/treasury/corporate?kas=kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579`
            );
            if (res.ok) {
                const data = await res.json();
                const kasAsset = data.assets.find(
                    (a: any) => a.symbol === 'KAS'
                );
                if (kasAsset && typeof kasAsset.balance === 'number') {
                    treasuryKasBalance = kasAsset.balance;
                }
            }
        } catch {
            // Ignore corporate balance poll error
        }
    }

    async function fetchLpPositions() {
        if (!identity.isWalletConnected || !identity.activeAddress) return;
        try {
            const res = await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'GET_LP_POSITIONS',
                    payload: {}
                })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.data)) {
                    lpPositions = data.data;
                    const stakedTotals: Record<string, number> = {};
                    for (const pos of lpPositions) {
                        if (
                            pos.reserves &&
                            Object.keys(pos.reserves).length > 0
                        ) {
                            for (const [tick, qty] of Object.entries(
                                pos.reserves
                            )) {
                                stakedTotals[tick] =
                                    (stakedTotals[tick] || 0) +
                                    (Number(qty) || 0);
                            }
                        } else {
                            const [tA, tB] = (
                                pos.poolPair || 'KAS/USDC'
                            ).split('/');
                            if (tA)
                                stakedTotals[tA] =
                                    (stakedTotals[tA] || 0) +
                                    (Number(pos.stakedAssetA) || 0);
                            if (tB)
                                stakedTotals[tB] =
                                    (stakedTotals[tB] || 0) +
                                    (Number(pos.stakedAssetB) || 0);
                        }
                    }
                    for (const asset of treasury.registry) {
                        if (asset.ticker !== DEFAULT_ECOSYSTEM_TICKER) {
                            treasury.updateAsset(asset.ticker, {
                                lpStaked: stakedTotals[asset.ticker] || 0
                            });
                        }
                    }
                }
            }
        } catch {
            // Ignore LP positions poll error
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
                ui.triggerMicroBadge(
                    'dex_fiat_btn',
                    'ON-RAMP SETTLED ✓',
                    '#18C6A5'
                );
            } else if (payload.eventType === 'FIAT_OFFRAMP') {
                offrampSuccessBanner = `Fiat Off-Ramp Dispatched ($${Number(payload.payout?.netFiatUsd || 0).toFixed(2)} USD • Ref: ${payload.payout?.payoutId || 'QUEUED'})`;
            } else if (payload.eventType === 'FIAT_DISPATCHED') {
                offrampSuccessBanner = `Bank Transfer Dispatched (${payload.payoutId} • Trace: ${payload.traceId || 'CONFIRMED'})`;
            }
            syncUserBalances();
            checkFiatGatewayStatus();
        }
    }

    onMount(() => {
        checkFiatGatewayStatus();
        treasury.syncRwaOraclePrices();
        triggerTileSweep();
        if (browser) {
            window.addEventListener(
                'perennia:fiat_event',
                handleLiveFiatSseEvent
            );
        }
        if (identity.isWalletConnected) {
            syncUserBalances();
            fetchP2pOrders();
            fetchTreasuryLiquid();
            fetchLpPositions();
            fetchSiloStaking();
        }
        balanceSyncInterval = setInterval(() => {
            if (identity.isWalletConnected) {
                syncUserBalances();
            }
        }, 6000);
        p2pInterval = setInterval(() => {
            if (identity.isWalletConnected) {
                fetchP2pOrders();
                fetchTreasuryLiquid();
            }
        }, 12000);
        lpPositionsInterval = setInterval(() => {
            if (identity.isWalletConnected) {
                fetchLpPositions();
                fetchSiloStaking();
            }
        }, 10000);
        onrampPollInterval = setInterval(() => {
            if (
                activeDexTab === 'Fiat' &&
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
        if (balanceSyncInterval) clearInterval(balanceSyncInterval);
        if (p2pInterval) clearInterval(p2pInterval);
        if (lpPositionsInterval) clearInterval(lpPositionsInterval);
        if (onrampPollInterval) clearInterval(onrampPollInterval);
        clearTimeout(sweepTimeout);
        clearTimeout(globalDiscoverDebounce);
        clearTimeout(modalDiscoverDebounce);
    });

    function setPercentage(percent: number) {
        const bal = payToken.availableBalance;
        if (bal > 0) {
            const effectiveBal =
                payToken.ticker === 'KAS' &&
                payToken.synthetic < bal * percent &&
                percent === 1.0
                    ? Math.max(0, bal - 0.01)
                    : bal * percent;
            payAmount = effectiveBal.toFixed(6);
            const usdValue = parseFloat(payAmount) * payToken.spotPrice;
            if (receiveToken.spotPrice > 0) {
                receiveAmount = (usdValue / receiveToken.spotPrice).toFixed(8);
            } else {
                receiveAmount = '';
            }
        }
    }

    function setLpPercentageA(percent: number) {
        const bal = lpTokenA.availableBalance;
        if (bal <= 0) return;
        const effectiveBal =
            lpTokenA.ticker === 'KAS' &&
            lpTokenA.synthetic < bal * percent &&
            percent === 1.0
                ? Math.max(0, bal - 0.01)
                : bal * percent;
        lpAmountA = effectiveBal.toFixed(6);
        syncSecondaryAmountsFromKasAnchor(effectiveBal);
    }

    function setLpPercentageB(percent: number) {
        const bal = lpTokenB.availableBalance;
        if (bal <= 0) return;
        const effectiveBal = bal * percent;
        lpAmountB = effectiveBal.toFixed(6);
        if (lpTokenB.spotPrice > 0 && lpTokenA.spotPrice > 0) {
            const bUsdVal = effectiveBal * lpTokenB.spotPrice;
            const impliedKasUsd = bUsdVal * (50.0 / Math.max(1.0, lpWeightPctB));
            const impliedKas = impliedKasUsd / lpTokenA.spotPrice;
            lpAmountA = impliedKas.toFixed(6);
            syncSecondaryAmountsFromKasAnchor(impliedKas);
        }
    }

    function handlePayInput(e: Event) {
        const val = (e.target as HTMLInputElement).value;
        payAmount = val;
        const pVal = parseFloat(val);
        if (!isNaN(pVal) && pVal > 0 && receiveToken.spotPrice > 0) {
            const usdValue = pVal * payToken.spotPrice;
            receiveAmount = (usdValue / receiveToken.spotPrice).toFixed(8);
        } else {
            receiveAmount = '';
        }
    }

    function handleReceiveInput(e: Event) {
        const val = (e.target as HTMLInputElement).value;
        receiveAmount = val;
        const rVal = parseFloat(val);
        if (!isNaN(rVal) && rVal > 0 && payToken.spotPrice > 0) {
            const usdValue = rVal * receiveToken.spotPrice;
            payAmount = (usdValue / payToken.spotPrice).toFixed(8);
        } else {
            payAmount = '';
        }
    }

    function handleLpInputA(e: Event) {
        const val = (e.target as HTMLInputElement).value;
        lpAmountA = val;
        const amount = parseFloat(val);
        if (!isNaN(amount) && amount > 0) {
            syncSecondaryAmountsFromKasAnchor(amount);
        } else {
            lpAmountB = '';
            extraPlantLegs = extraPlantLegs.map((l) => ({ ...l, amount: '' }));
        }
    }

    function handleLpInputB(e: Event) {
        const val = (e.target as HTMLInputElement).value;
        lpAmountB = val;
        const amount = parseFloat(val);
        if (
            !isNaN(amount) &&
            amount > 0 &&
            lpTokenB.spotPrice > 0 &&
            lpTokenA.spotPrice > 0
        ) {
            const bUsdVal = amount * lpTokenB.spotPrice;
            const impliedKasUsd = bUsdVal * (50.0 / Math.max(1.0, lpWeightPctB));
            const impliedKas = impliedKasUsd / lpTokenA.spotPrice;
            lpAmountA = impliedKas.toFixed(6);
            syncSecondaryAmountsFromKasAnchor(impliedKas);
        } else {
            lpAmountA = '';
            extraPlantLegs = extraPlantLegs.map((l) => ({ ...l, amount: '' }));
        }
    }

    function flipTokens() {
        const tempTicker = payTicker;
        payTicker = receiveTicker;
        receiveTicker = tempTicker;
        const tempAmt = payAmount;
        payAmount = receiveAmount;
        receiveAmount = tempAmt;
        swapError = null;
        swapSuccessId = null;
        swapLegs = [];
        triggerTileSweep();
    }

    function openTokenModal(
        type:
            | 'pay'
            | 'receive'
            | 'lpA'
            | 'lpB'
            | 'lpExtra'
            | 'p2pSell'
            | 'p2pBuy',
        extraIdx?: number
    ) {
        activeSelection = type;
        if (typeof extraIdx === 'number') {
            editingExtraLegIndex = extraIdx;
        }
        tokenSearchQuery = '';
        discoveredModalAsset = null;
        discoverModalError = null;
        tokenCategoryFilter = 'ALL';
        isTokenModalOpen = true;
    }

    function selectToken(token: UnifiedAsset) {
        if (activeSelection === 'pay') {
            if (receiveTicker === token.ticker) flipTokens();
            else payTicker = token.ticker;
        } else if (activeSelection === 'receive') {
            if (payTicker === token.ticker) flipTokens();
            else receiveTicker = token.ticker;
        } else if (activeSelection === 'lpA') {
            lpTickerA = 'KAS';
        } else if (activeSelection === 'lpB') {
            if (token.ticker !== 'KAS') {
                lpTickerB = token.ticker;
                const kasNum = parseFloat(lpAmountA);
                if (!isNaN(kasNum) && kasNum > 0) {
                    syncSecondaryAmountsFromKasAnchor(kasNum);
                }
            }
        } else if (activeSelection === 'lpExtra') {
            if (token.ticker !== 'KAS') {
                extraPlantLegs = extraPlantLegs.map((l, idx) =>
                    idx === editingExtraLegIndex
                        ? { ...l, ticker: token.ticker }
                        : l
                );
                const kasNum = parseFloat(lpAmountA);
                if (!isNaN(kasNum) && kasNum > 0) {
                    syncSecondaryAmountsFromKasAnchor(kasNum);
                }
            }
        } else if (activeSelection === 'p2pSell') {
            p2pSellTicker = token.ticker;
        } else if (activeSelection === 'p2pBuy') {
            p2pBuyTicker = token.ticker;
        }
        const pVal = parseFloat(payAmount);
        const pSpot = treasury.getAsset(payTicker).spotPrice;
        const rSpot = treasury.getAsset(receiveTicker).spotPrice;
        if (!isNaN(pVal) && pVal > 0 && pSpot > 0 && rSpot > 0) {
            receiveAmount = ((pVal * pSpot) / rSpot).toFixed(8);
        }
        isTokenModalOpen = false;
        swapError = null;
        swapSuccessId = null;
        swapLegs = [];
        triggerTileSweep();
    }

    async function executeSwap() {
        if (!identity.activeAddress || !payAmount) return;
        const amount = parseFloat(payAmount);
        if (isNaN(amount) || amount <= 0) return;
        isExecuting = true;
        swapError = null;
        swapSuccessId = null;
        swapLegs = [];
        txState.lastTxId = '';
        triggerTileSweep();
        try {
            const res = await fetch('/api/sor/swap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet: identity.activeAddress,
                    payAsset: payToken.ticker,
                    receiveAsset: receiveToken.ticker,
                    amount,
                    slippageTolerance: parseFloat(slippageTolerance) || 0.5,
                    systemMode: ui.systemMode
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                swapError = formatRetailSafeCopy(
                    data.error || data.message || 'Swap Execution Rejected'
                );
                isExecuting = false;
                return;
            }
            swapLegs = data.legs || [];
            if (!data.psbt) {
                swapSuccessId =
                    data.transaction_uuid ||
                    (identity.isCorporateAdmin
                        ? 'POOL_BATCH_QUEUED'
                        : 'POOL_SWAP_CONFIRMED');
                payAmount = '';
                receiveAmount = '';
                isExecuting = false;
                ui.triggerMicroBadge(
                    'dex_swap_btn',
                    'SWAP EXECUTED ✓',
                    ambientSecondaryHex
                );
                setTimeout(syncUserBalances, 1500);
                setTimeout(syncUserBalances, 10500);
                return;
            }
            identity.requestVaultAuthorization({
                actionType: 'SWAP',
                payAsset: payToken.ticker,
                receiveAsset: receiveToken.ticker,
                payAmount: payAmount,
                destinationAddress: 'DEX Smart Router',
                amountSompi: Math.floor(amount * 1e8),
                psbtData: {
                    psbt: data.psbt,
                    formattedUtxos: data.formattedUtxos
                }
            });
        } catch (e: any) {
            swapError = formatRetailSafeCopy(
                e.message || 'Execution Signature Denied'
            );
            isExecuting = false;
        }
    }

    async function executeSupplyLiquidity() {
        if (!identity.activeAddress || !lpAmountA || !lpAmountB) return;
        isProvidingLiquidity = true;
        swapError = null;
        triggerTileSweep();
        try {
            const valA = parseFloat(lpAmountA);
            const valB = parseFloat(lpAmountB);
            const currentDuration = lockOptions[lockDurationIndex];
            const secondaryAssetsPayload = [
                {
                    ticker: lpTokenB.ticker,
                    weightPct: lpWeightPctB,
                    amount: valB
                },
                ...extraPlantLegs
                    .map((l) => ({
                        ticker: l.ticker,
                        weightPct: l.weightPct,
                        amount: parseFloat(l.amount) || 0
                    }))
                    .filter((l) => l.amount > 0)
            ];
            const weightsMap: Record<string, number> = { KAS: 0.5 };
            const reservesMap: Record<string, number> = { KAS: valA };
            for (const sec of secondaryAssetsPayload) {
                weightsMap[sec.ticker] = Number(
                    (sec.weightPct / 100.0).toFixed(4)
                );
                reservesMap[sec.ticker] = sec.amount;
            }
            const pairName = [
                'KAS',
                ...secondaryAssetsPayload.map((s) => s.ticker)
            ].join('/');
            const res = await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'STAKE_LP',
                    payload: {
                        poolPair: pairName,
                        amountA: valA,
                        amountB: valB,
                        secondaryAssets: secondaryAssetsPayload,
                        weights: weightsMap,
                        reserves: reservesMap,
                        lockDurationDays: currentDuration.days
                    }
                })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                lpAmountA = '';
                lpAmountB = '';
                extraPlantLegs = extraPlantLegs.map((l) => ({
                    ...l,
                    amount: ''
                }));
                ui.triggerMicroBadge(
                    'dex_lp_stake_btn',
                    '+LP PLANT STAKED ✓',
                    ambientSecondaryHex
                );
                await Promise.all([
                    fetchLpPositions(),
                    fetchSiloStaking(),
                    syncUserBalances()
                ]);
            } else {
                swapError = formatRetailSafeCopy(
                    data.error || 'Liquidity Staking Verification Rejected.'
                );
            }
        } catch (e: any) {
            swapError = formatRetailSafeCopy(e.message || 'LP Supply Fault');
        } finally {
            isProvidingLiquidity = false;
        }
    }

    async function withdrawLpPosition(lpId: string) {
        if (!identity.activeAddress) return;
        isWithdrawingLp = lpId;
        triggerTileSweep();
        try {
            const res = await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'WITHDRAW_LP',
                    payload: { lpId }
                })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                ui.triggerMicroBadge(
                    `lp_pos_${lpId}`,
                    'LP UNLOCKED ✓',
                    '#18C6A5'
                );
                await Promise.all([
                    fetchLpPositions(),
                    fetchSiloStaking(),
                    syncUserBalances()
                ]);
            } else {
                swapError = formatRetailSafeCopy(
                    data.error || 'Protocol invariant lockup active.'
                );
            }
        } catch (e: any) {
            swapError = formatRetailSafeCopy(e.message);
        } finally {
            isWithdrawingLp = null;
        }
    }

    async function createP2pOffer() {
        if (!identity.activeAddress) return;
        const sellVal = parseFloat(p2pSellAmount);
        const buyVal = parseFloat(p2pBuyAmount);
        if (isNaN(sellVal) || isNaN(buyVal) || sellVal <= 0 || buyVal <= 0)
            return;
        isExecuting = true;
        swapError = null;
        triggerTileSweep();
        try {
            const res = await fetch('/api/sor/swap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet: identity.activeAddress,
                    payAsset: p2pSellToken.ticker,
                    receiveAsset: p2pBuyToken.ticker,
                    amount: sellVal,
                    slippageTolerance: 0.5,
                    systemMode: ui.systemMode
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok)
                throw new Error(
                    data.error || 'Failed to assemble atomic swap PSBT.'
                );
            identity.requestVaultAuthorization({
                actionType: 'CREATE_P2P',
                payAsset: p2pSellToken.ticker,
                receiveAsset: p2pBuyToken.ticker,
                sellAmount: sellVal,
                buyAmount: buyVal,
                psbtData: {
                    psbt: data.psbt,
                    formattedUtxos: data.formattedUtxos
                }
            });
        } catch (e: any) {
            swapError = formatRetailSafeCopy(
                e.message || 'P2P Contract Assembly Failed'
            );
            isExecuting = false;
        }
    }

    async function fillP2pOrder(order: any) {
        if (!identity.activeAddress) {
            ui.showWalletModal = true;
            return;
        }
        isExecuting = true;
        swapError = null;
        swapSuccessId = null;
        triggerTileSweep();
        try {
            const res = await fetch(
                '/api/utxos?address=' +
                    encodeURIComponent(identity.activeAddress)
            );
            if (!res.ok) throw new Error('Failed to fetch UTXOs for P2P fill.');
            const utxoData = await res.json();
            const formattedUtxos = (utxoData.entries || []).map((u: any) => ({
                transactionId: u.outpoint?.transactionId || u.transactionId,
                index: u.outpoint?.index || u.index,
                amount: Number(u.utxoEntry?.amount || u.amount || 0),
                scriptPublicKey:
                    u.utxoEntry?.scriptPublicKey?.scriptPublicKey ||
                    u.scriptPublicKey ||
                    ''
            }));
            identity.requestVaultAuthorization({
                actionType: 'FILL_P2P',
                orderId: order.id,
                payAsset: order.buyToken,
                receiveAsset: order.sellToken,
                sellAmount: order.buyAmount,
                buyAmount: order.sellAmount,
                psbtData: { formattedUtxos }
            });
        } catch (e: any) {
            swapError = formatRetailSafeCopy(
                e.message || 'P2P Execution Failed'
            );
            isExecuting = false;
        }
    }

    $effect(() => {
        if (!identity.isVaultUnlockPending && isExecuting) {
            isExecuting = false;
            if (txState.lastTxId) {
                swapSuccessId = txState.lastTxId;
                payAmount = '';
                receiveAmount = '';
                p2pSellAmount = '';
                p2pBuyAmount = '';
                triggerTileSweep();
                ui.triggerMicroBadge(
                    'dex_swap_btn',
                    'BROADCASTED ✓',
                    ambientSecondaryHex
                );
                setTimeout(syncUserBalances, 1500);
                setTimeout(fetchP2pOrders, 1500);
                setTimeout(checkFiatGatewayStatus, 1800);
                setTimeout(syncUserBalances, 11000);
            }
        }
    });
</script>

<div
    class="w-full min-h-[calc(100dvh-9rem)] bg-app text-white font-mono flex flex-col items-center justify-start pt-4 pb-24 px-4 lg:px-10 relative overflow-hidden"
    data-tour="dex-workspace"
    style="--sweep-primary: {ambientPrimaryHex}; --sweep-secondary: {ambientSecondaryHex};"
>
    <div class="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div class="absolute inset-0 dex-deep-shaded-tiles"></div>
        {#if isTileSweeping}
            <div class="absolute inset-0 dex-subgrid-sweep"></div>
        {/if}
    </div>
    <div class="w-full max-w-[620px] relative mb-4 z-40 shrink-0 flex flex-col gap-2">
        <div class="relative">
            <div class="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                <svg class="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </div>
            <input
                type="text"
                data-testid="dex-global-search-input"
                bind:value={globalSearchQuery}
                oninput={handleGlobalSearchInput}
                placeholder="Search 24/7 Wall St. Equities, RWAs, T-Bills, or Crypto (NVDA, SPY, PEPE, XAU)..."
                class="w-full bg-[#0a0d12] border border-white/10 focus:border-white/25 rounded-2xl pl-12 pr-24 py-3.5 text-xs font-mono text-white outline-none transition-colors shadow-xl placeholder-neutral-600"
            />
            <div class="absolute inset-y-0 right-3 flex items-center gap-1.5">
                {#if globalSearchQuery}
                    <button
                        type="button"
                        onclick={() => {
                            globalSearchQuery = '';
                            discoveredGlobalAsset = null;
                            discoverGlobalError = null;
                        }}
                        class="text-neutral-500 hover:text-white text-xs px-2 py-1 cursor-pointer"
                    >
                        ✕
                    </button>
                {/if}
                <span
                    class="bg-[#11161f] border border-white/10 text-neutral-400 px-3 py-1.5 rounded-xl text-[9px] font-bold tracking-widest uppercase"
                >
                    {payTicker}/{receiveTicker}
                </span>
            </div>

            {#if globalSearchQuery.trim().length > 0 && (globalSearchResults.length > 0 || isDiscoveringGlobal || discoveredGlobalAsset || discoverGlobalError)}
                <div
                    data-testid="dex-global-search-dropdown"
                    class="absolute top-[110%] left-0 w-full bg-[#0a0d12] border border-white/15 rounded-2xl shadow-2xl z-[100] overflow-hidden flex flex-col max-h-[380px] overflow-y-auto"
                    transition:slide={{ duration: 150 }}
                >
                    {#each globalSearchResults as token (token.ticker)}
                        <div
                            data-testid="dex-search-result-{token.ticker}"
                            class="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 hover:bg-[#11161f] border-b border-white/5 transition-colors"
                        >
                            <button
                                type="button"
                                onclick={() => {
                                    receiveTicker = token.ticker;
                                    activeDexTab = 'Swap';
                                    globalSearchQuery = '';
                                    discoveredGlobalAsset = null;
                                    triggerTileSweep();
                                }}
                                class="flex items-center gap-3 text-left cursor-pointer flex-1"
                            >
                                <div
                                    class="w-8 h-8 rounded-full flex items-center justify-center font-black text-[11px] bg-[#11161f] border border-white/10 overflow-hidden shrink-0"
                                    style="color: {token.hex};"
                                >
                                    {#if token.icon}
                                        <img
                                            src={token.icon}
                                            alt={token.ticker}
                                            class="w-5 h-5 object-contain"
                                            onerror={(e) =>
                                                ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                                        />
                                    {:else}
                                        {token.ticker[0]}
                                    {/if}
                                </div>
                                <div class="flex flex-col">
                                    <div class="flex items-center gap-2">
                                        <span class="text-white font-bold text-xs tracking-wider">
                                            {token.ticker}
                                        </span>
                                        <span class="text-[8px] px-1.5 py-0.5 rounded bg-[#161d29] border border-white/10 text-neutral-400 uppercase">
                                            {token.assetClass}
                                        </span>
                                    </div>
                                    <span class="text-[10px] text-neutral-500">
                                        {token.name}
                                    </span>
                                </div>
                            </button>
                            <div class="flex flex-wrap items-center justify-end gap-2">
                                <div class="flex flex-col items-end mr-1">
                                    <span class="text-xs font-mono text-[#18C6A5] font-bold tabular-nums">
                                        ${token.spotPrice > 0 && token.spotPrice < 0.01
                                            ? token.spotPrice.toFixed(8)
                                            : token.spotPrice.toFixed(settingsStore.fiatDecimals)}
                                    </span>
                                    <span class="text-[9px] font-mono text-neutral-500">
                                        Avail: {token.availableBalance.toLocaleString(undefined, {
                                            minimumFractionDigits: 2,
                                            maximumFractionDigits: 4
                                        })}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    data-testid="dex-search-inject-pay-{token.ticker}"
                                    onclick={() => applyDiscoveredOrSearchAsset(token, 'pay')}
                                    class="tactile-btn px-2.5 py-1.5 rounded-lg text-[8px] font-mono font-black uppercase text-neutral-200 hover:text-white border-white/15 cursor-pointer"
                                >
                                    YOU PAY
                                </button>
                                <button
                                    type="button"
                                    data-testid="dex-search-inject-receive-{token.ticker}"
                                    onclick={() => applyDiscoveredOrSearchAsset(token, 'receive')}
                                    class="tactile-btn px-2.5 py-1.5 rounded-lg text-[8px] font-mono font-black uppercase text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer"
                                >
                                    YOU RECEIVE (EST.)
                                </button>
                                <button
                                    type="button"
                                    data-testid="dex-search-add-wallet-{token.ticker}"
                                    disabled={isPersistingWalletToken === token.ticker}
                                    onclick={() => applyDiscoveredOrSearchAsset(token, 'wallet')}
                                    class="tactile-btn px-2.5 py-1.5 rounded-lg text-[8px] font-mono font-black uppercase text-blue-400 border-blue-500/40 cursor-pointer disabled:opacity-40"
                                >
                                    + ADD TO WALLET
                                </button>
                            </div>
                        </div>
                    {/each}

                    {#if isDiscoveringGlobal}
                        <div class="p-4 text-center text-[10px] font-mono text-[#18C6A5] animate-pulse uppercase tracking-widest">
                            Querying Live Exchange Oracles (MEXC • Gate.io • KuCoin • Bitget • CoinEx) &amp; Kasplex L1 for "{globalSearchQuery.trim().toUpperCase()}"...
                        </div>
                    {:else if discoveredGlobalAsset && !globalSearchResults.some((r) => r.ticker === discoveredGlobalAsset?.ticker)}
                        <div
                            data-testid="dex-discovered-asset-{discoveredGlobalAsset.ticker}"
                            class="p-4 bg-[#11161f] border-t border-[#18C6A5]/35 flex flex-col gap-3"
                        >
                            <div class="flex items-center justify-between gap-3">
                                <div class="flex items-center gap-3">
                                    <div
                                        class="w-9 h-9 rounded-xl bg-[#0a0d12] border border-[#18C6A5]/45 flex items-center justify-center font-black text-xs text-[#18C6A5]"
                                    >
                                        {discoveredGlobalAsset.ticker.slice(0, 3)}
                                    </div>
                                    <div class="flex flex-col">
                                        <div class="flex items-center gap-2">
                                            <span class="text-xs font-black text-white tracking-wider">
                                                {discoveredGlobalAsset.ticker}
                                            </span>
                                            <span class="px-2 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/40 text-[#18C6A5] text-[8px] font-mono font-bold uppercase">
                                                LIVE ORACLE DISCOVERED ({discoveredGlobalAsset.quorumCount} FEEDS)
                                            </span>
                                        </div>
                                        <span class="text-[9px] text-neutral-400 mt-0.5">
                                            {discoveredGlobalAsset.name}
                                        </span>
                                    </div>
                                </div>
                                <div class="flex flex-col items-end">
                                    <span
                                        data-testid="dex-discovered-price-{discoveredGlobalAsset.ticker}"
                                        class="text-sm font-mono font-black text-[#18C6A5] tabular-nums"
                                    >
                                        ${discoveredGlobalAsset.spotPrice < 0.01
                                            ? discoveredGlobalAsset.spotPrice.toFixed(8)
                                            : discoveredGlobalAsset.spotPrice.toFixed(4)}
                                    </span>
                                    <span
                                        class="text-[9px] font-mono {discoveredGlobalAsset.change24h >= 0 ? 'text-[#18C6A5]' : 'text-red-400'}"
                                    >
                                        {discoveredGlobalAsset.change24h >= 0 ? '+' : ''}{discoveredGlobalAsset.change24h.toFixed(2)}% (24H)
                                    </span>
                                </div>
                            </div>
                            <div class="grid grid-cols-3 gap-2 pt-1 border-t border-white/10">
                                <button
                                    type="button"
                                    data-testid="dex-discovered-pay-btn"
                                    onclick={() =>
                                        discoveredGlobalAsset &&
                                        applyDiscoveredOrSearchAsset(discoveredGlobalAsset, 'pay')}
                                    class="tactile-btn py-2 px-3 rounded-xl text-[9px] font-mono font-black uppercase text-white border-white/15 cursor-pointer"
                                >
                                    YOU PAY
                                </button>
                                <button
                                    type="button"
                                    data-testid="dex-discovered-receive-btn"
                                    onclick={() =>
                                        discoveredGlobalAsset &&
                                        applyDiscoveredOrSearchAsset(discoveredGlobalAsset, 'receive')}
                                    class="tactile-btn py-2 px-3 rounded-xl text-[9px] font-mono font-black uppercase text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer"
                                >
                                    YOU RECEIVE (EST.)
                                </button>
                                <button
                                    type="button"
                                    data-testid="dex-discovered-wallet-btn"
                                    onclick={() =>
                                        discoveredGlobalAsset &&
                                        applyDiscoveredOrSearchAsset(discoveredGlobalAsset, 'wallet')}
                                    class="tactile-btn py-2 px-3 rounded-xl text-[9px] font-mono font-black uppercase text-blue-400 border-blue-500/45 cursor-pointer"
                                >
                                    + ADD TO WALLET
                                </button>
                            </div>
                        </div>
                    {:else if discoverGlobalError && globalSearchResults.length === 0}
                        <div class="p-4 text-center text-[10px] font-mono text-amber-400">
                            {discoverGlobalError}
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    </div>
    <div
        class="w-full {activeDexTab === 'Liquidity' || activeDexTab === 'P2P' ? 'max-w-[1160px]' : 'max-w-[620px]'} transition-all duration-300 relative z-20 flex flex-col items-stretch"
    >
        <div
            class="w-full bg-[#0a0d12] border border-white/10 rounded-2xl px-6 py-4 mb-5 flex flex-wrap justify-between items-center gap-4 shadow-xl"
            style="background-image: linear-gradient(90deg, {ambientPrimaryHex}10 0%, {ambientSecondaryHex}10 100%);"
        >
            <div class="flex items-center gap-6">
                {#each ['Swap', 'Liquidity', 'P2P', 'Fiat'] as tab}
                    <button
                        type="button"
                        onclick={() => {
                            activeDexTab = tab as any;
                            swapError = null;
                            triggerTileSweep();
                            if (tab === 'Fiat') {
                                checkFiatGatewayStatus();
                            } else if (tab === 'Liquidity') {
                                fetchSiloStaking();
                            }
                        }}
                        class="text-xs md:text-sm font-black uppercase tracking-widest cursor-pointer transition-colors relative py-1.5 {activeDexTab === tab ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'}"
                    >
                        {tab}
                        {#if activeDexTab === tab}
                            <div
                                class="absolute bottom-0 left-0 w-full h-[2px] rounded-full transition-colors duration-300"
                                style="background-color: {ambientSecondaryHex}; box-shadow: 0 0 10px {ambientSecondaryHex};"
                            ></div>
                        {/if}
                    </button>
                {/each}
            </div>
            <div class="flex items-center gap-2 text-[9px] font-mono text-neutral-400">
                <span class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-white/10">
                    Slippage: {slippageTolerance}%
                </span>
            </div>
        </div>
        {#if activeDexTab === 'Swap'}
            <div
                class="w-full bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 md:p-8 shadow-2xl relative overflow-hidden flex flex-col gap-3"
                style="
                    background-image:
                        radial-gradient(ellipse at top left, {ambientPrimaryHex}12, transparent 58%),
                        radial-gradient(ellipse at bottom right, {ambientSecondaryHex}14, transparent 62%);
                    box-shadow: 0 16px 48px -12px {ambientSecondaryHex}18;
                "
                in:fade={{ duration: 150 }}
            >
                <div class="tactile-card bg-[#11161f] border border-white/10 rounded-2xl p-5">
                    <div class="flex justify-between items-center mb-3">
                        <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                            You Pay
                        </span>
                        <div class="flex gap-1.5">
                            {#each [0.25, 0.5, 0.75, 1.0] as percent}
                                <button
                                    type="button"
                                    onclick={() => setPercentage(percent)}
                                    class="tactile-btn px-2.5 py-1 rounded-lg text-[9px] font-bold text-neutral-300 hover:text-white cursor-pointer"
                                >
                                    {percent === 1.0 ? 'MAX' : `${percent * 100}%`}
                                </button>
                            {/each}
                        </div>
                    </div>
                    <div class="flex justify-between items-center gap-4">
                        <input
                            type="number"
                            data-testid="dex-pay-amount-input"
                            value={payAmount}
                            oninput={handlePayInput}
                            disabled={isExecuting}
                            placeholder="0.00"
                            class="w-full bg-transparent text-3xl md:text-4xl font-bold font-mono text-white outline-none placeholder-neutral-700 disabled:opacity-50"
                        />
                        <button
                            type="button"
                            data-testid="dex-pay-token-selector"
                            onclick={() => openTokenModal('pay')}
                            disabled={isExecuting}
                            class="tactile-btn shrink-0 flex items-center gap-2.5 px-4 py-2.5 rounded-xl cursor-pointer group disabled:opacity-50"
                        >
                            <div
                                class="w-7 h-7 rounded-full flex items-center justify-center font-black text-[10px] overflow-hidden"
                                style="background-color: {payToken.hex}20; border: 1px solid {payToken.hex}50; color: {payToken.hex};"
                            >
                                {#if payToken.icon}
                                    <img
                                        src={payToken.icon}
                                        alt={payToken.ticker}
                                        class="w-4 h-4 object-contain"
                                        onerror={(e) =>
                                            ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                                    />
                                {:else}
                                    {payToken.ticker[0]}
                                {/if}
                            </div>
                            <div class="flex flex-col items-start gap-0.5">
                                <span class="font-bold text-white text-xs tracking-wider leading-none">
                                    {payToken.ticker}
                                </span>
                                <span class="text-[9px] font-mono text-neutral-400 leading-none">
                                    ${payToken.spotPrice > 0 && payToken.spotPrice < 0.01
                                        ? payToken.spotPrice.toFixed(6)
                                        : payToken.spotPrice.toFixed(settingsStore.fiatDecimals)}
                                </span>
                            </div>
                            <svg class="w-3.5 h-3.5 text-neutral-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    </div>
                    <div class="flex justify-between mt-3 pt-2 border-t border-white/5 text-[10px] font-mono text-neutral-500">
                        <span>
                            ≈ ${payAmount ? (parseFloat(payAmount) * payToken.spotPrice).toFixed(settingsStore.fiatDecimals) : '0.00'}
                        </span>
                        <span>
                            Available: {payToken.availableBalance.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 6
                            })} {payToken.ticker}
                        </span>
                    </div>
                </div>
                <div class="relative h-3 flex justify-center items-center z-20 my-0.5">
                    <button
                        type="button"
                        aria-label="Swap Tokens"
                        onclick={flipTokens}
                        disabled={isExecuting}
                        class="tactile-btn w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer shadow-lg"
                        style="border-color: {ambientSecondaryHex}40;"
                    >
                        <svg
                            class="w-4 h-4 transition-colors"
                            style="color: {ambientSecondaryHex};"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                    </button>
                </div>
                <div
                    class="tactile-card bg-[#11161f] border rounded-2xl p-5"
                    style="
                        border-color: {ambientSecondaryHex}30;
                        background-image: radial-gradient(ellipse at bottom right, {ambientSecondaryHex}14, transparent 65%);
                    "
                >
                    <div class="flex justify-between items-center mb-3">
                        <span class="text-[10px] font-bold uppercase tracking-widest" style="color: {ambientSecondaryHex};">
                            You Receive (Est.)
                        </span>
                        <span class="text-[8px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-[#0a0d12] border border-white/10 text-neutral-300">
                            {receiveToken.assetClass} • 24/7 Ledger
                        </span>
                    </div>
                    <div class="flex justify-between items-center gap-4">
                        <input
                            type="number"
                            data-testid="dex-receive-amount-input"
                            value={receiveAmount}
                            oninput={handleReceiveInput}
                            disabled={isExecuting}
                            placeholder="0.00"
                            class="w-full bg-transparent text-3xl md:text-4xl font-bold font-mono text-white outline-none placeholder-neutral-700 disabled:opacity-50"
                        />
                        <button
                            type="button"
                            data-testid="dex-receive-token-selector"
                            onclick={() => openTokenModal('receive')}
                            disabled={isExecuting}
                            class="tactile-btn shrink-0 flex items-center gap-2.5 px-4 py-2.5 rounded-xl cursor-pointer group disabled:opacity-50"
                            style="border-color: {ambientSecondaryHex}40;"
                        >
                            <div
                                class="w-7 h-7 rounded-full flex items-center justify-center font-black text-[10px] overflow-hidden"
                                style="background-color: {receiveToken.hex}20; border: 1px solid {receiveToken.hex}50; color: {receiveToken.hex};"
                            >
                                {#if receiveToken.icon}
                                    <img
                                        src={receiveToken.icon}
                                        alt={receiveToken.ticker}
                                        class="w-4 h-4 object-contain"
                                        onerror={(e) =>
                                            ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                                    />
                                {:else}
                                    {receiveToken.ticker[0]}
                                {/if}
                            </div>
                            <div class="flex flex-col items-start gap-0.5">
                                <span class="font-bold text-white text-xs tracking-wider leading-none">
                                    {receiveToken.ticker}
                                </span>
                                <span class="text-[9px] font-mono leading-none" style="color: {ambientSecondaryHex};">
                                    ${receiveToken.spotPrice > 0 && receiveToken.spotPrice < 0.01
                                        ? receiveToken.spotPrice.toFixed(6)
                                        : receiveToken.spotPrice.toLocaleString(undefined, {
                                              minimumFractionDigits: 2,
                                              maximumFractionDigits: 2
                                          })}
                                </span>
                            </div>
                            <svg class="w-3.5 h-3.5 text-neutral-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    </div>
                    <div class="flex justify-between mt-3 pt-2 border-t border-white/5 text-[10px] font-mono text-neutral-500">
                        <span>
                            ≈ ${receiveAmount ? (parseFloat(receiveAmount) * receiveToken.spotPrice).toFixed(settingsStore.fiatDecimals) : '0.00'}
                        </span>
                        <span>
                            Available: {receiveToken.availableBalance.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 6
                            })} {receiveToken.ticker}
                        </span>
                    </div>
                </div>
                <div class="bg-[#11161f]/90 border border-white/10 rounded-2xl p-4 flex flex-col gap-2 text-[10px] font-mono mt-1">
                    <div class="flex justify-between items-center">
                        <span class="text-neutral-500 uppercase tracking-widest">Live Oracle Rate</span>
                        <span data-testid="dex-oracle-rate-readout" class="text-white font-bold tabular-nums">
                            1 {payToken.ticker} = {swapQuoteTelemetry.exchangeRate > 0 ? swapQuoteTelemetry.exchangeRate.toFixed(6) : '0.000000'} {receiveToken.ticker}
                        </span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-neutral-500 uppercase tracking-widest">Active Fee Tier</span>
                        <span class="{swapQuoteTelemetry.isDiscounted ? 'text-amber-400 font-bold' : 'text-neutral-300'}">
                            <span data-testid="dex-active-fee-pct">{(swapQuoteTelemetry.feeRate * 100).toFixed(2)}%</span> • {swapQuoteTelemetry.feeLabel}
                            {#if swapQuoteTelemetry.usdVolume > 0}
                                (${swapQuoteTelemetry.feeUsd.toFixed(2)})
                            {/if}
                        </span>
                    </div>
                    <div class="flex justify-between items-center border-t border-white/5 pt-2">
                        <span class="text-neutral-500 uppercase tracking-widest">Settlement Execution</span>
                        <span class="text-[#18C6A5] font-bold">
                            $0.00 Network Gas (Instant Pool Settlement)
                        </span>
                    </div>
                </div>
                <div class="mt-2 flex flex-col gap-3 relative">
                    {#if ui.microBadges['dex_swap_btn']}
                        <div
                            class="micro-confirm-badge absolute -top-4 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-lg bg-[#11161f] border text-[9px] font-mono font-black uppercase tracking-widest shadow-xl"
                            style="border-color: {ui.microBadges['dex_swap_btn'].accentHex}60; color: {ui.microBadges['dex_swap_btn'].accentHex};"
                        >
                            {ui.microBadges['dex_swap_btn'].label}
                        </div>
                    {/if}
                    {#if swapError}
                        <div class="w-full bg-red-950/25 border border-red-500/40 p-3.5 rounded-xl flex items-center justify-center gap-2" in:fade>
                            <span class="text-red-400 font-bold">⚠</span>
                            <span class="text-[10px] font-mono font-bold uppercase tracking-widest text-red-400">
                                {swapError}
                            </span>
                        </div>
                    {/if}
                    {#if swapSuccessId}
                        <div class="w-full bg-[#11161f] border border-[#18C6A5]/40 p-4 rounded-xl flex flex-col items-center justify-center gap-1" in:fade>
                            <span class="text-[#18C6A5] text-[10px] font-bold uppercase tracking-widest">
                                Execution Confirmed
                            </span>
                            <span class="text-[9px] font-mono text-neutral-300 break-all">
                                {swapSuccessId}
                            </span>
                        </div>
                    {/if}
                    {#if !identity.isWalletConnected}
                        <button
                            type="button"
                            onclick={() => (ui.showWalletModal = true)}
                            class="tactile-btn w-full py-4 rounded-2xl text-white text-xs font-black uppercase tracking-widest cursor-pointer"
                            style="border-color: {ambientSecondaryHex}50; background-image: radial-gradient(ellipse at center, {ambientSecondaryHex}22, transparent 70%);"
                        >
                            Connect Sovereign Vault
                        </button>
                    {:else if !payAmount || parseFloat(payAmount) <= 0}
                        <button
                            type="button"
                            disabled
                            class="w-full py-4 rounded-2xl bg-[#11161f] border border-white/5 text-neutral-600 text-xs font-bold uppercase tracking-widest cursor-not-allowed"
                        >
                            Enter Swap Amount
                        </button>
                    {:else}
                        <button
                            type="button"
                            data-testid="dex-execute-swap-btn"
                            onclick={executeSwap}
                            disabled={isExecuting}
                            class="tactile-btn w-full py-4 rounded-2xl text-white text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-50 flex items-center justify-center gap-3"
                            style="
                                border-color: {ambientSecondaryHex}55;
                                background-image: radial-gradient(ellipse at center, {ambientSecondaryHex}26, transparent 72%);
                                box-shadow: 0 10px 30px -8px {ambientSecondaryHex}35;
                            "
                        >
                            {#if isExecuting}
                                <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                <span>Executing Sovereign Route...</span>
                            {:else}
                                <span>Review &amp; Execute {payToken.ticker} → {receiveToken.ticker} Swap</span>
                            {/if}
                        </button>
                    {/if}
                </div>
            </div>
        {/if}
        {#if activeDexTab === 'Liquidity'}
            <div class="flex flex-col gap-6" in:fade={{ duration: 150 }}>
                <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <div
                        class="lg:col-span-6 bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 md:p-7 shadow-2xl flex flex-col gap-4 relative"
                        style="background-image: radial-gradient(ellipse at top left, {ambientPrimaryHex}14, transparent 60%), radial-gradient(ellipse at bottom right, {ambientSecondaryHex}18, transparent 65%);"
                    >
                        <div class="flex items-center justify-between border-b border-white/10 pb-3">
                            <div class="flex flex-col">
                                <span class="text-xs font-black text-white uppercase tracking-widest">
                                    Provision 50%-KAS Liquidity Plant
                                </span>
                                <span class="text-[9px] font-mono text-neutral-400 uppercase tracking-widest mt-0.5">
                                    Constant-Mean Invariant • {totalPlantInternalPairs} Cross-Pair{totalPlantInternalPairs === 1 ? '' : 's'}
                                </span>
                            </div>
                            <span
                                data-testid="dex-plant-pair-badge"
                                class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/40 text-[9px] font-mono font-bold text-[#18C6A5]"
                            >
                                {plantPairSummary}
                            </span>
                        </div>
                        <div class="tactile-card flex flex-col gap-2.5 bg-[#11161f] p-4 rounded-2xl border border-[#18C6A5]/35">
                            <div class="flex justify-between items-center">
                                <span class="text-[9px] font-black uppercase tracking-widest text-[#18C6A5]">
                                    Anchor Asset A (50.0% Weight Locked)
                                </span>
                                <div class="flex gap-1">
                                    {#each [0.25, 0.5, 0.75, 1.0] as pct}
                                        <button
                                            type="button"
                                            onclick={() => setLpPercentageA(pct)}
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
                                    oninput={handleLpInputA}
                                    placeholder="0.00"
                                    class="w-full bg-transparent text-2xl font-bold font-mono text-white outline-none placeholder-neutral-700"
                                />
                                <div class="shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#0a0d12] border border-[#18C6A5]/40">
                                    <span class="font-black text-[#18C6A5] text-xs tracking-wider leading-none">
                                        KAS (50.0%)
                                    </span>
                                </div>
                            </div>
                            <div class="flex justify-between items-center text-[9px] font-mono text-neutral-500">
                                <span>
                                    ≈ ${lpAmountA ? (parseFloat(lpAmountA) * lpTokenA.spotPrice).toFixed(2) : '0.00'} USD
                                </span>
                                <span>
                                    Avail: {lpTokenA.availableBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} KAS
                                </span>
                            </div>
                        </div>
                        <div class="text-center text-neutral-500 font-bold text-[10px] -my-1">
                            + 50.0% SECONDARY BASKET ({totalPlantAssetCount - 1} ASSET{totalPlantAssetCount - 1 === 1 ? '' : 'S'}) +
                        </div>
                        <div
                            class="tactile-card flex flex-col gap-2.5 bg-[#11161f] p-4 rounded-2xl border"
                            style="border-color: {ambientSecondaryHex}30;"
                        >
                            <div class="flex justify-between items-center">
                                <span class="text-[9px] font-bold uppercase tracking-widest" style="color: {ambientSecondaryHex};">
                                    Secondary Asset B ({lpWeightPctB.toFixed(2)}% Weight)
                                </span>
                                <div class="flex gap-1">
                                    {#each [0.25, 0.5, 0.75, 1.0] as pct}
                                        <button
                                            type="button"
                                            onclick={() => setLpPercentageB(pct)}
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
                                    oninput={handleLpInputB}
                                    placeholder="0.00"
                                    class="w-full bg-transparent text-2xl font-bold font-mono text-white outline-none placeholder-neutral-700"
                                />
                                <button
                                    type="button"
                                    data-testid="dex-lp-select-b-btn"
                                    onclick={() => openTokenModal('lpB')}
                                    class="tactile-btn shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl cursor-pointer"
                                    style="border-color: {ambientSecondaryHex}40;"
                                >
                                    <span class="font-bold text-white text-xs tracking-wider leading-none">
                                        {lpTokenB.ticker}
                                    </span>
                                    <svg class="w-3 h-3 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
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
                                        adjustDexPlantSecondaryWeights(
                                            'B',
                                            parseFloat((e.currentTarget as HTMLInputElement).value) || 25
                                        )}
                                    class="w-full custom-range-slider cursor-pointer"
                                />
                            {/if}
                            <div class="flex justify-between items-center text-[9px] font-mono text-neutral-500">
                                <span>
                                    ≈ ${lpAmountB ? (parseFloat(lpAmountB) * lpTokenB.spotPrice).toFixed(2) : '0.00'} USD
                                </span>
                                <span>
                                    Avail: {lpTokenB.availableBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} {lpTokenB.ticker}
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
                                    <span class="text-[9px] font-bold uppercase tracking-widest text-blue-400">
                                        Secondary Asset #{idx + 2} ({leg.weightPct.toFixed(2)}% Weight)
                                    </span>
                                    <button
                                        type="button"
                                        onclick={() => removeSecondaryPlantLeg(idx)}
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
                                        onclick={() => openTokenModal('lpExtra', idx)}
                                        class="tactile-btn shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl cursor-pointer border-blue-500/40"
                                    >
                                        <span class="font-bold text-white text-xs tracking-wider leading-none">
                                            {leg.ticker}
                                        </span>
                                        <svg class="w-3 h-3 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
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
                                        adjustDexPlantSecondaryWeights(
                                            idx,
                                            parseFloat((e.currentTarget as HTMLInputElement).value) || 25
                                        )}
                                    class="w-full custom-range-slider cursor-pointer"
                                />
                                <div class="flex justify-between items-center text-[9px] font-mono text-neutral-500">
                                    <span>
                                        ≈ ${leg.amount ? (parseFloat(leg.amount) * legAsset.spotPrice).toFixed(2) : '0.00'} USD
                                    </span>
                                    <span>
                                        Avail: {legAsset.availableBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} {leg.ticker}
                                    </span>
                                </div>
                            </div>
                        {/each}
                        {#if extraPlantLegs.length < 3}
                            <button
                                type="button"
                                data-testid="dex-add-secondary-plant-asset-btn"
                                onclick={() => addSecondaryPlantLeg()}
                                class="tactile-btn w-full py-2.5 rounded-xl border-blue-500/40 text-blue-400 text-[10px] font-black uppercase tracking-widest cursor-pointer"
                            >
                                + Add Secondary Asset to 50% KAS Liquidity Plant
                            </button>
                        {/if}
                        <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4">
                            <div class="flex justify-between items-center mb-3">
                                <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                                    Stake Duration Lockup
                                </span>
                                <span class="text-[10px] font-black text-[#18C6A5] uppercase tracking-widest">
                                    {lockOptions[lockDurationIndex].label} ({lockOptions[lockDurationIndex].multiplier}x Yield)
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
                            <div class="flex justify-between mt-3 text-[9px] font-bold uppercase tracking-widest text-neutral-500">
                                <span>Flex (1.0x)</span>
                                <span>30D (1.2x)</span>
                                <span>90D (1.5x)</span>
                                <span>365D (2.5x)</span>
                            </div>
                            {#if livePlantInvariantK > 0}
                                <div class="border-t border-white/10 pt-2.5 mt-3 flex justify-between text-[9px] font-mono text-neutral-400">
                                    <span>Constant-Mean Invariant (k):</span>
                                    <span class="text-[#18C6A5] font-bold tabular-nums">
                                        {livePlantInvariantK.toFixed(4)} ({totalPlantInternalPairs} Cross-Pairs)
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
                                onclick={executeSupplyLiquidity}
                                disabled={!identity.isWalletConnected || !lpAmountA || !lpAmountB || isProvidingLiquidity}
                                class="tactile-btn w-full py-4 rounded-2xl text-white text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                style="
                                    border-color: {ambientSecondaryHex}50;
                                    background-image: radial-gradient(ellipse at center, {ambientSecondaryHex}24, transparent 70%);
                                    box-shadow: 0 10px 28px -8px {ambientSecondaryHex}30;
                                "
                            >
                                {isProvidingLiquidity
                                    ? 'Provisioning LP Plant...'
                                    : `Lock Capital & Stake ${plantPairSummary} (${lockOptions[lockDurationIndex].label})`}
                            </button>
                        </div>
                    </div>
                    <div
                        class="lg:col-span-6 bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 md:p-7 shadow-2xl flex flex-col gap-4 min-h-[480px]"
                        style="background-image: radial-gradient(ellipse at top right, {ambientSecondaryHex}14, transparent 65%);"
                    >
                        <div class="flex justify-between items-center border-b border-white/10 pb-3">
                            <div class="flex flex-col">
                                <h4 class="text-xs font-black uppercase tracking-widest text-white">
                                    Active Staked Liquidity Plants
                                </h4>
                                <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest mt-0.5">
                                    50%-KAS Constant-Mean Invariant • Rebalanced Daily at 22:00 UTC Global Settlement
                                </span>
                            </div>
                            <span class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-white/10 text-[9px] font-mono text-[#18C6A5] uppercase">
                                {lpPositions.length} ACTIVE
                            </span>
                        </div>
                        <div class="flex flex-col gap-3 max-h-[460px] overflow-y-auto hide-scrollbar pr-0.5">
                            {#each lpPositions as pos (pos.lpId)}
                                {@const pairTokens = (pos.poolPair || 'KAS/USDC').split('/')}
                                {@const posBadge = ui.microBadges[`lp_pos_${pos.lpId}`]}
                                {@const pairCombinations = pos.internalPairsCount || (pairTokens.length * (pairTokens.length - 1)) / 2}
                                <div
                                    data-testid="lp-position-card-{pos.lpId}"
                                    class="tactile-card bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-3 relative"
                                >
                                    {#if posBadge}
                                        <div class="micro-confirm-badge absolute top-2 right-2 px-2.5 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/50 text-[#18C6A5] text-[8px] font-mono font-black uppercase">
                                            {posBadge.label}
                                        </div>
                                    {/if}
                                    <div class="flex justify-between items-start">
                                        <div class="flex flex-col">
                                            <div class="flex flex-wrap items-center gap-2">
                                                <span class="font-bold text-white text-sm tracking-wide">
                                                    {pos.poolPair}
                                                </span>
                                                <span
                                                    class="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest {pos.lockDurationDays >= 365 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : pos.lockDurationDays >= 90 ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' : 'bg-[#0a0d12] text-neutral-400 border border-white/10'}"
                                                >
                                                    {pos.multiplier}x Multiplier
                                                </span>
                                                <span class="px-2 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/30 text-[8px] font-mono text-[#18C6A5]">
                                                    {pairCombinations} Cross-Pair{pairCombinations === 1 ? '' : 's'}
                                                </span>
                                            </div>
                                            {#if pos.reserves && Object.keys(pos.reserves).length > 2}
                                                <span class="text-[10px] font-mono text-neutral-300 mt-1">
                                                    {Object.entries(pos.reserves)
                                                        .map(([t, q]) => `${Number(q).toFixed(4)} ${t}`)
                                                        .join(' + ')}
                                                </span>
                                            {:else}
                                                <span class="text-[10px] font-mono text-neutral-400 mt-1">
                                                    {pos.stakedAssetA.toFixed(4)} {pairTokens[0] || 'KAS'} + {pos.stakedAssetB.toFixed(6)} {pairTokens[1] || 'USDC'}
                                                </span>
                                            {/if}
                                        </div>
                                        <div class="flex flex-col items-end">
                                            <span
                                                class="text-[8px] font-mono uppercase tracking-widest {pos.isUnlocked ? 'text-[#18C6A5]' : 'text-amber-400'}"
                                            >
                                                {pos.isUnlocked ? 'Matured' : 'Timelocked'}
                                            </span>
                                            <span class="text-[9px] font-mono text-neutral-500 mt-0.5">
                                                {pos.unlockDate && pos.lockDurationDays > 0
                                                    ? new Date(pos.unlockDate).toLocaleDateString()
                                                    : 'Flexible'}
                                            </span>
                                        </div>
                                    </div>
                                    <div class="flex justify-between items-center border-t border-white/5 pt-3">
                                        <div class="flex flex-col">
                                            <span class="text-[8px] uppercase tracking-widest text-neutral-500 font-bold">
                                                Weighted Share Volume
                                            </span>
                                            <span class="text-xs font-mono font-bold text-[#18C6A5]">
                                                {pos.weightedTvl.toFixed(4)} {pairTokens[0] || 'KAS'}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onclick={() => withdrawLpPosition(pos.lpId)}
                                            disabled={!pos.isUnlocked || isWithdrawingLp === pos.lpId}
                                            class="tactile-btn px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed {pos.isUnlocked ? 'text-[#18C6A5] border-[#18C6A5]/40' : 'text-neutral-500'}"
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
                                <div class="flex-1 flex flex-col items-center justify-center text-center py-16 px-4 border border-dashed border-white/10 rounded-2xl bg-[#11161f]/40">
                                    <span class="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-1">
                                        No Active Staked Liquidity Plants
                                    </span>
                                    <span class="text-[10px] font-mono text-neutral-500 max-w-xs leading-relaxed">
                                        Supply a 50% KAS Liquidity Plant on the left or add 2+ assets to a sector in Operations to earn 80% of pool settlement fees.
                                    </span>
                                </div>
                            {/if}
                        </div>
                    </div>
                </div>
                <div
                    data-testid="silo-staking-vault-card"
                    class="bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 md:p-7 shadow-2xl flex flex-col gap-5 relative overflow-hidden"
                    style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.14), rgba(245, 158, 11, 0.08) 55%, transparent 72%);"
                >
                    <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-4">
                        <div class="flex items-center gap-3.5">
                            <div class="w-11 h-11 rounded-2xl bg-[#11161f] border border-[#18C6A5]/40 flex items-center justify-center text-[#18C6A5] font-black text-sm shrink-0">
                                {DEFAULT_ECOSYSTEM_TICKER}
                            </div>
                            <div class="flex flex-col">
                                <div class="flex flex-wrap items-center gap-2">
                                    <h3 class="text-xs md:text-sm font-black uppercase tracking-widest text-white">
                                        {DEFAULT_ECOSYSTEM_TICKER} 7-Day Cooldown Staking &amp; Fee-Discount Vault
                                    </h3>
                                    <span
                                        data-testid="silo-active-tier-badge"
                                        class="px-2.5 py-0.5 rounded bg-[#11161f] border border-[#18C6A5]/40 text-[#18C6A5] text-[9px] font-black uppercase"
                                    >
                                        {siloStakingTelemetry.tierLabel}
                                    </span>
                                </div>
                                <span class="text-[10px] text-neutral-400 mt-0.5">
                                    Stake {DEFAULT_ECOSYSTEM_TICKER} to unlock protocol fee discounts across 24/7 Wall Street Equity, Commodity, and Crypto swaps (7-day unbonding cooldown).
                                </span>
                            </div>
                        </div>
                        <div class="flex flex-wrap items-center gap-2 text-[9px] font-mono">
                            <span class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-white/10 text-neutral-300">
                                ≥10k {DEFAULT_ECOSYSTEM_TICKER}: <strong class="text-[#18C6A5]">0.75% Fee</strong>
                            </span>
                            <span class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-white/10 text-neutral-300">
                                ≥100k {DEFAULT_ECOSYSTEM_TICKER}: <strong class="text-amber-400">0.50% Fee</strong>
                            </span>
                            <span class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-white/10 text-neutral-300">
                                ≥1M {DEFAULT_ECOSYSTEM_TICKER}: <strong class="text-blue-400">0.25% Fee</strong>
                            </span>
                        </div>
                    </div>
                    {#if swapError}
                        <div class="bg-red-950/25 border border-red-500/40 p-3 rounded-xl text-center">
                            <span class="text-[10px] font-mono font-bold uppercase tracking-widest text-red-400">
                                ⚠ {swapError}
                            </span>
                        </div>
                    {/if}
                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                        <div class="lg:col-span-5 bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-3 relative">
                            {#if ui.microBadges['silo_stake_btn']}
                                <div class="micro-confirm-badge absolute -top-3 right-3 px-2.5 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/60 text-[#18C6A5] text-[8px] font-mono font-black uppercase">
                                    {ui.microBadges['silo_stake_btn'].label}
                                </div>
                            {/if}
                            <div class="flex justify-between items-center text-[10px]">
                                <span class="font-bold uppercase tracking-widest text-neutral-300">
                                    Stake {DEFAULT_ECOSYSTEM_TICKER} (7-Day Cooldown Lockup)
                                </span>
                                <button
                                    type="button"
                                    onclick={() => {
                                        siloStakeAmountInput = String(siloAsset.availableBalance || 0);
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
                                    onclick={executeStakeSilo}
                                    disabled={isStakingSilo || !siloStakeAmountInput || parseFloat(siloStakeAmountInput) <= 0}
                                    class="tactile-btn px-5 py-2.5 rounded-xl border-[#18C6A5]/45 text-[#18C6A5] text-[10px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                                >
                                    {isStakingSilo ? 'Staking...' : `Stake ${DEFAULT_ECOSYSTEM_TICKER}`}
                                </button>
                            </div>
                            <div class="flex justify-between text-[9px] text-neutral-400 pt-1 border-t border-white/5">
                                <span>
                                    Active Staked: <strong class="text-white">{siloStakingTelemetry.activeStaked.toLocaleString()} {DEFAULT_ECOSYSTEM_TICKER}</strong>
                                </span>
                                <span>
                                    In 7D Cooldown: <strong class="text-amber-400">{siloStakingTelemetry.cooldownStaked.toLocaleString()} {DEFAULT_ECOSYSTEM_TICKER}</strong>
                                </span>
                            </div>
                        </div>
                        <div class="lg:col-span-7 flex flex-col gap-2.5">
                            {#if siloStakingTelemetry.positions.length === 0}
                                <div class="py-8 text-center border border-dashed border-white/10 rounded-2xl bg-[#11161f]/40 text-[10px] text-neutral-500 uppercase tracking-widest">
                                    No active {DEFAULT_ECOSYSTEM_TICKER} staking positions. Stake ≥10,000 {DEFAULT_ECOSYSTEM_TICKER} to unlock the 0.75% fee tier.
                                </div>
                            {:else}
                                {#each siloStakingTelemetry.positions as spos (spos.stakeId)}
                                    {@const sBadge = ui.microBadges[`silo_pos_${spos.stakeId}`]}
                                    <div
                                        data-testid="silo-stake-row-{spos.stakeId}"
                                        class="bg-[#11161f] border border-white/10 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[10px] relative"
                                    >
                                        {#if sBadge}
                                            <div class="micro-confirm-badge absolute -top-2.5 right-3 px-2 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/60 text-[#18C6A5] text-[8px] font-mono font-black uppercase">
                                                {sBadge.label}
                                            </div>
                                        {/if}
                                        <div class="flex flex-col gap-0.5">
                                            <div class="flex items-center gap-2">
                                                <span class="font-black text-white text-xs">
                                                    {Number(spos.amountStaked || 0).toLocaleString()} {spos.ticker}
                                                </span>
                                                <span
                                                    class="px-2 py-0.5 rounded text-[8px] font-black uppercase border {spos.status === 'ACTIVE' ? 'border-[#18C6A5]/40 text-[#18C6A5] bg-[#18C6A5]/10' : 'border-amber-500/40 text-amber-400 bg-amber-500/10'}"
                                                >
                                                    {spos.status === 'ACTIVE' ? 'ACTIVE FEE SHIELD' : '7-DAY COOLDOWN'}
                                                </span>
                                            </div>
                                            {#if spos.status === 'COOLDOWN' && spos.cooldownEndsAt}
                                                <span class="text-[9px] text-amber-400">
                                                    Unbonding Cooldown Ends: {new Date(spos.cooldownEndsAt).toLocaleString()}
                                                </span>
                                            {:else}
                                                <span class="text-[9px] text-neutral-400">
                                                    Unstaking requires a 7-day cooldown period before withdrawal.
                                                </span>
                                            {/if}
                                        </div>
                                        <div class="flex items-center gap-2 shrink-0">
                                            {#if spos.status === 'ACTIVE'}
                                                <button
                                                    type="button"
                                                    data-testid="silo-initiate-cooldown-btn-{spos.stakeId}"
                                                    disabled={isMutatingSiloId === spos.stakeId}
                                                    onclick={() => initiateSiloCooldown(spos.stakeId)}
                                                    class="tactile-btn px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider text-amber-400 border-amber-500/40 cursor-pointer disabled:opacity-40"
                                                >
                                                    {isMutatingSiloId === spos.stakeId
                                                        ? 'Starting...'
                                                        : '[Initiate 7-Day Cooldown]'}
                                                </button>
                                            {:else}
                                                <button
                                                    type="button"
                                                    data-testid="silo-claim-unstaked-btn-{spos.stakeId}"
                                                    disabled={!spos.isMatured || isMutatingSiloId === spos.stakeId}
                                                    onclick={() => claimUnstakedSilo(spos.stakeId)}
                                                    class="tactile-btn px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-40 {spos.isMatured ? 'text-[#18C6A5] border-[#18C6A5]/45' : 'text-neutral-500'}"
                                                >
                                                    {spos.isMatured ? '[Claim Unstaked SILO ✓]' : 'Cooldown Active (7D)'}
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
        {/if}
        {#if activeDexTab === 'P2P'}
            <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" in:fade={{ duration: 150 }}>
                <div
                    class="lg:col-span-5 bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 md:p-7 shadow-2xl flex flex-col gap-4"
                    style="background-image: radial-gradient(ellipse at top left, {ambientPrimaryHex}14, transparent 65%);"
                >
                    <div class="flex justify-between items-center border-b border-white/10 pb-3">
                        <div class="flex flex-col">
                            <h3 class="text-xs font-black uppercase tracking-widest text-white">
                                Deploy P2P Offer
                            </h3>
                            <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest mt-0.5">
                                Direct Peer-to-Peer Atomic P2P Swap
                            </span>
                        </div>
                    </div>
                    {#if swapError}
                        <div class="bg-red-950/25 border border-red-500/40 p-3 rounded-xl text-center">
                            <p class="text-red-400 text-[10px] uppercase tracking-widest font-bold">
                                {swapError}
                            </p>
                        </div>
                    {/if}
                    <div class="flex flex-col gap-2 bg-[#11161f] p-4 rounded-2xl border border-white/10">
                        <span class="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
                            You Sell (Lock in Atomic Offer)
                        </span>
                        <div class="flex justify-between items-center gap-3">
                            <input
                                type="number"
                                bind:value={p2pSellAmount}
                                placeholder="0.00"
                                class="w-full bg-transparent text-2xl font-bold font-mono text-white outline-none placeholder-neutral-700"
                            />
                            <button
                                type="button"
                                onclick={() => openTokenModal('p2pSell')}
                                class="tactile-btn shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl cursor-pointer"
                            >
                                <span class="font-bold text-white text-xs tracking-wider leading-none">
                                    {p2pSellToken.ticker}
                                </span>
                            </button>
                        </div>
                    </div>
                    <div class="flex flex-col gap-2 bg-[#11161f] p-4 rounded-2xl border border-white/10">
                        <span class="text-[9px] font-bold uppercase tracking-widest" style="color: {ambientSecondaryHex};">
                            You Require (Counterparty Settlement)
                        </span>
                        <div class="flex justify-between items-center gap-3">
                            <input
                                type="number"
                                bind:value={p2pBuyAmount}
                                placeholder="0.00"
                                class="w-full bg-transparent text-2xl font-bold font-mono text-white outline-none placeholder-neutral-700"
                            />
                            <button
                                type="button"
                                onclick={() => openTokenModal('p2pBuy')}
                                class="tactile-btn shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl cursor-pointer"
                            >
                                <span class="font-bold text-white text-xs tracking-wider leading-none">
                                    {p2pBuyToken.ticker}
                                </span>
                            </button>
                        </div>
                    </div>
                    <button
                        type="button"
                        onclick={createP2pOffer}
                        disabled={!p2pSellAmount || !p2pBuyAmount || isExecuting}
                        class="tactile-btn w-full py-4 mt-1 rounded-2xl text-white text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                        style="border-color: {ambientSecondaryHex}50; background-image: radial-gradient(ellipse at center, {ambientSecondaryHex}22, transparent 70%);"
                    >
                        Sign &amp; Deploy Atomic P2P Contract
                    </button>
                </div>
                <div
                    class="lg:col-span-7 bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 md:p-7 shadow-2xl flex flex-col gap-4 min-h-[420px]"
                    style="background-image: radial-gradient(ellipse at bottom right, {ambientSecondaryHex}14, transparent 65%);"
                >
                    <div class="flex justify-between items-center border-b border-white/10 pb-3">
                        <h3 class="text-xs font-black uppercase tracking-widest text-white">
                            Active P2P Contracts on DAG
                        </h3>
                        <span class="text-[9px] font-mono text-[#18C6A5] uppercase">
                            {p2pOrders.length} OPEN OFFERS
                        </span>
                    </div>
                    <div class="flex flex-col gap-3 max-h-[380px] overflow-y-auto hide-scrollbar">
                        {#each p2pOrders as order (order.id)}
                            {@const isMine = isOrderMaker(order.seller)}
                            <div class="tactile-card bg-[#11161f] border border-white/10 p-4 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4">
                                <div class="flex flex-col w-full md:w-auto">
                                    <div class="flex items-center gap-2 mb-1">
                                        <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest">
                                            Maker: {order.seller?.slice(0, 14)}...
                                        </span>
                                        {#if isMine}
                                            <span class="px-2 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/35 text-[#18C6A5] text-[8px] font-bold uppercase">
                                                YOUR OFFER
                                            </span>
                                        {/if}
                                    </div>
                                    <div class="flex items-center gap-2 text-sm">
                                        <span class="font-bold text-white">
                                            {order.sellAmount} {order.sellToken}
                                        </span>
                                        <span class="text-neutral-500">→</span>
                                        <span class="font-bold text-[#18C6A5]">
                                            {order.buyAmount} {order.buyToken}
                                        </span>
                                    </div>
                                    <span class="text-[9px] font-mono text-neutral-400 mt-1">
                                        Implied Rate: {order.rate} {order.buyToken}/{order.sellToken}
                                    </span>
                                </div>
                                <div class="flex items-center gap-2 w-full md:w-auto justify-end">
                                    {#if isMine}
                                        <button
                                            type="button"
                                            onclick={() => cancelP2pOrder(order.id)}
                                            disabled={isCancellingP2pId === order.id}
                                            class="tactile-btn px-4 py-2.5 text-red-400 border-red-500/35 text-[9px] font-bold uppercase tracking-widest rounded-xl cursor-pointer disabled:opacity-40"
                                        >
                                            {isCancellingP2pId === order.id ? 'Cancelling...' : '[Cancel Offer]'}
                                        </button>
                                    {/if}
                                    <button
                                        type="button"
                                        onclick={() => fillP2pOrder(order)}
                                        disabled={isExecuting}
                                        class="tactile-btn flex-1 md:flex-none px-5 py-2.5 text-[#18C6A5] border-[#18C6A5]/40 text-[10px] font-bold uppercase tracking-widest rounded-xl cursor-pointer disabled:opacity-40"
                                    >
                                        Execute Atomic P2P
                                    </button>
                                </div>
                            </div>
                        {/each}
                        {#if p2pOrders.length === 0}
                            <div class="flex-1 flex items-center justify-center text-center text-[10px] font-mono text-neutral-500 py-16 border border-dashed border-white/10 rounded-2xl">
                                No open P2P contracts currently resting on the DAG.
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        {/if}
        {#if activeDexTab === 'Fiat'}
            <div
                class="w-full bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 md:p-8 shadow-2xl flex flex-col gap-5"
                style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.12), transparent 65%);"
                in:fade={{ duration: 150 }}
            >
                <div class="flex flex-col gap-4 border-b border-white/10 pb-4">
                    <div class="flex items-center justify-between flex-wrap gap-2">
                        <div class="flex flex-col">
                            <h3 class="text-white font-black text-xs uppercase tracking-widest">
                                Fiat Bridge
                            </h3>
                            <span class="text-[9px] font-mono text-neutral-500 uppercase tracking-widest mt-0.5">
                                Sovereign Wire / ACH On-Ramp • Local ABA Mod-10 Recognition • 4-Stage ACH Pipeline
                            </span>
                        </div>
                        <span class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/35 text-[#18C6A5] text-[8px] font-mono font-bold uppercase">
                            {circleDirectActive ? 'CIRCLE RAIL ACTIVE' : 'SOVEREIGN TREASURY RAIL ARMED'}
                        </span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 bg-[#11161f] p-1.5 rounded-2xl border border-white/10">
                        <button
                            type="button"
                            data-testid="fiat-onramp-tab-btn"
                            onclick={() => {
                                fiatMode = 'onramp';
                                offrampError = null;
                            }}
                            class="tactile-btn py-2.5 px-3 text-[10px] font-black uppercase tracking-widest rounded-xl cursor-pointer {fiatMode === 'onramp' ? 'text-[#18C6A5] border-[#18C6A5]/40' : 'text-neutral-400 border-transparent'}"
                        >
                            On-Ramp (Buy KAS with Fiat)
                        </button>
                        <button
                            type="button"
                            data-testid="fiat-offramp-tab-btn"
                            onclick={() => {
                                fiatMode = 'offramp';
                                onrampError = null;
                                offrampError = null;
                                calcFiatFromCrypto();
                            }}
                            class="tactile-btn py-2.5 px-3 text-[10px] font-black uppercase tracking-widest rounded-xl cursor-pointer {fiatMode === 'offramp' ? 'text-[#18C6A5] border-[#18C6A5]/40' : 'text-neutral-400 border-transparent'}"
                        >
                            Off-Ramp (Liquidate to Bank)
                        </button>
                    </div>
                </div>
                {#if fiatMode === 'onramp'}
                    <div class="flex flex-col gap-4">
                        <div class="bg-[#11161f] border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
                            <div class="flex justify-between items-center flex-wrap gap-2">
                                <span class="text-[10px] font-bold text-[#18C6A5] uppercase tracking-widest">
                                    Sovereign Wire / ACH &amp; Instant Card On-Ramp
                                </span>
                                <span class="px-2 py-0.5 rounded bg-[#0a0d12] border border-white/10 text-[8px] font-mono text-neutral-400 uppercase">
                                    {onrampPaymentRail === 'SOVEREIGN_WIRE_ACH'
                                        ? '0.75% Wire / 0.50% ≥$2k'
                                        : '1.25% Instant Card'}
                                </span>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div class="flex flex-col gap-1.5 bg-[#0a0d12] p-3.5 rounded-xl border border-white/10">
                                    <label for="onrampUsdInput" class="text-[9px] uppercase tracking-widest text-neutral-500 font-bold">
                                        Fiat Purchase Amount (USD)
                                    </label>
                                    <div class="flex items-center justify-between">
                                        <span class="text-neutral-500 font-mono text-lg mr-1">$</span>
                                        <input
                                            id="onrampUsdInput"
                                            type="number"
                                            min="25"
                                            bind:value={onrampFiatAmountUsd}
                                            class="w-full bg-transparent text-xl font-bold font-mono text-white outline-none"
                                        />
                                        <span class="text-[10px] font-mono text-[#18C6A5] shrink-0">
                                            ≈ {treasury.getAsset('KAS').spotPrice > 0
                                                ? ((parseFloat(onrampFiatAmountUsd) || 0) / treasury.getAsset('KAS').spotPrice).toFixed(1)
                                                : '0.0'} KAS
                                        </span>
                                    </div>
                                </div>
                                <div class="flex flex-col gap-1.5 bg-[#0a0d12] p-3.5 rounded-xl border border-white/10">
                                    <span class="text-[9px] uppercase tracking-widest text-neutral-500 font-bold">
                                        Settlement Rail
                                    </span>
                                    <div class="grid grid-cols-2 gap-2 mt-0.5">
                                        <button
                                            type="button"
                                            onclick={() => (onrampPaymentRail = 'SOVEREIGN_WIRE_ACH')}
                                            class="tactile-btn py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest cursor-pointer {onrampPaymentRail === 'SOVEREIGN_WIRE_ACH' ? 'text-[#18C6A5] border-[#18C6A5]/40' : 'text-neutral-400'}"
                                        >
                                            Sovereign Wire / ACH
                                        </button>
                                        <button
                                            type="button"
                                            onclick={() => (onrampPaymentRail = 'CARD_INSTANT')}
                                            class="tactile-btn py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest cursor-pointer {onrampPaymentRail === 'CARD_INSTANT' ? 'text-[#18C6A5] border-[#18C6A5]/40' : 'text-neutral-400'}"
                                        >
                                            Card / Apple Pay
                                        </button>
                                    </div>
                                </div>
                            </div>
                            {#if onrampPaymentRail === 'SOVEREIGN_WIRE_ACH'}
                                <div class="flex flex-col gap-1.5 bg-[#0a0d12] p-3.5 rounded-xl border border-white/10">
                                    <span class="text-[9px] uppercase tracking-widest text-neutral-400 font-bold">
                                        KAS Fulfillment Target (Upon Treasury Wire Receipt)
                                    </span>
                                    <div class="grid grid-cols-2 gap-2 mt-0.5">
                                        <button
                                            type="button"
                                            onclick={() => (onrampSettlementTarget = 'LEDGER_KAS')}
                                            class="tactile-btn py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider cursor-pointer {onrampSettlementTarget === 'LEDGER_KAS' ? 'text-[#18C6A5] border-[#18C6A5]/40' : 'text-neutral-400'}"
                                        >
                                            Internal Treasury Ledger ($0 Gas)
                                        </button>
                                        <button
                                            type="button"
                                            onclick={() => (onrampSettlementTarget = 'L1_KAS')}
                                            class="tactile-btn py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider cursor-pointer {onrampSettlementTarget === 'L1_KAS' ? 'text-[#18C6A5] border-[#18C6A5]/40' : 'text-neutral-400'}"
                                        >
                                            Direct L1 Kaspa UTXO
                                        </button>
                                    </div>
                                </div>
                            {/if}
                            <div class="bg-[#0a0d12] border border-white/10 rounded-xl p-3.5 flex flex-col gap-1">
                                <span class="text-[8px] uppercase tracking-widest text-neutral-500 font-bold">
                                    Bound Sovereign L1 Destination Wallet
                                </span>
                                <span class="text-[10px] font-mono text-white break-all">
                                    {identity.activeAddress || 'Connect Sovereign Wallet to bind L1 destination'}
                                </span>
                            </div>
                        </div>
                        {#if onrampError}
                            <div class="bg-red-950/25 border border-red-500/40 p-4 rounded-xl text-center">
                                <span class="text-[10px] font-mono font-bold uppercase tracking-widest text-red-400">
                                    {onrampError}
                                </span>
                            </div>
                        {/if}
                        {#if onrampSessionData}
                            <div class="bg-[#11161f] border border-[#18C6A5]/40 p-5 rounded-2xl flex flex-col gap-3.5">
                                <div class="flex items-center justify-between border-b border-white/10 pb-2.5">
                                    <span class="text-[10px] font-black uppercase tracking-widest text-[#18C6A5]">
                                        ✓ Sovereign On-Ramp Order ({onrampSessionData.sessionId})
                                    </span>
                                    <div class="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onclick={() => downloadWireSlipPdf(onrampSessionData)}
                                            class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer"
                                        >
                                            [Download Wire Slip PDF ↓]
                                        </button>
                                        <span class="px-2 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/35 text-[8px] font-mono text-[#18C6A5] uppercase">
                                            {onrampSessionData.status || onrampSessionData.nonKycTier}
                                        </span>
                                    </div>
                                </div>
                                <div class="grid grid-cols-3 gap-2 text-[10px] font-mono">
                                    <div class="bg-[#0a0d12] p-2.5 rounded-lg border border-white/5">
                                        <span class="text-[8px] text-neutral-500 block uppercase">Est. Delivery</span>
                                        <span class="text-white font-bold">{onrampSessionData.estimatedKas.toLocaleString()} KAS</span>
                                    </div>
                                    <div class="bg-[#0a0d12] p-2.5 rounded-lg border border-white/5">
                                        <span class="text-[8px] text-neutral-500 block uppercase">Indicative Spot</span>
                                        <span class="text-white font-bold">${onrampSessionData.spotPrice.toFixed(4)}</span>
                                    </div>
                                    <div class="bg-[#0a0d12] p-2.5 rounded-lg border border-white/5">
                                        <span class="text-[8px] text-neutral-500 block uppercase">Protocol Spread</span>
                                        <span class="text-neutral-300">${onrampSessionData.feeUsd.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>
                        {/if}
                        <div class="relative">
                            {#if ui.microBadges['dex_fiat_btn']}
                                <div class="micro-confirm-badge absolute -top-4 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/60 text-[#18C6A5] text-[9px] font-mono font-black uppercase">
                                    {ui.microBadges['dex_fiat_btn'].label}
                                </div>
                            {/if}
                            <button
                                type="button"
                                onclick={initiateFiatOnramp}
                                disabled={isInitializingOnramp}
                                class="tactile-btn w-full py-4 rounded-2xl text-white border-[#18C6A5]/40 text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                                style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.2), transparent 70%);"
                            >
                                {#if isInitializingOnramp}
                                    Initializing Sovereign Fiat Order...
                                {:else if onrampPaymentRail === 'SOVEREIGN_WIRE_ACH'}
                                    Generate Sovereign Wire / ACH Order &amp; Memo
                                {:else}
                                    Initialize Instant Card On-Ramp Session
                                {/if}
                            </button>
                        </div>
                    </div>
                {:else}
                    <div class="flex flex-col gap-4">
                        <div class="flex flex-col gap-2 bg-[#11161f] p-4 rounded-2xl border border-white/10">
                            <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-400">
                                Liquidation Source (On-Chain UTXO or Zero-Gas Internal Ledger)
                            </span>
                            <div class="grid grid-cols-3 gap-2">
                                <button
                                    type="button"
                                    onclick={() => {
                                        offrampSourceMode = 'onchain_kas';
                                        calcFiatFromCrypto();
                                    }}
                                    class="tactile-btn py-2.5 px-2 rounded-xl text-[9px] font-bold uppercase tracking-wider cursor-pointer {offrampSourceMode === 'onchain_kas' ? 'text-[#18C6A5] border-[#18C6A5]/45' : 'text-neutral-400'}"
                                >
                                    On-Chain KAS ({treasury.getAsset('KAS').onChain.toFixed(2)})
                                </button>
                                <button
                                    type="button"
                                    onclick={() => {
                                        offrampSourceMode = 'ledger_kas';
                                        calcFiatFromCrypto();
                                    }}
                                    class="tactile-btn py-2.5 px-2 rounded-xl text-[9px] font-bold uppercase tracking-wider cursor-pointer {offrampSourceMode === 'ledger_kas' ? 'text-[#18C6A5] border-[#18C6A5]/45' : 'text-neutral-400'}"
                                >
                                    Ledger KAS ({treasury.getAsset('KAS').synthetic.toFixed(2)})
                                </button>
                                <button
                                    type="button"
                                    onclick={() => {
                                        offrampSourceMode = 'ledger_usdc';
                                        calcFiatFromCrypto();
                                    }}
                                    class="tactile-btn py-2.5 px-2 rounded-xl text-[9px] font-bold uppercase tracking-wider cursor-pointer {offrampSourceMode === 'ledger_usdc' ? 'text-blue-400 border-blue-500/45' : 'text-neutral-400'}"
                                >
                                    Ledger USDC (${treasury.getAsset('USDC').synthetic.toFixed(2)})
                                </button>
                            </div>
                        </div>
                        {#if offrampError}
                            <div class="bg-red-950/25 border border-red-500/40 p-3.5 rounded-xl text-center">
                                <span class="text-[10px] font-mono font-bold uppercase tracking-widest text-red-400">
                                    {offrampError}
                                </span>
                            </div>
                        {/if}
                        {#if offrampSuccessBanner}
                            <div class="bg-[#11161f] border border-[#18C6A5]/45 p-3.5 rounded-xl text-center">
                                <span class="text-[10px] font-mono font-bold uppercase tracking-widest text-[#18C6A5]">
                                    {offrampSuccessBanner}
                                </span>
                            </div>
                        {/if}
                        <div class="flex flex-col gap-3 bg-[#11161f] p-4 rounded-2xl border border-white/10">
                            <div class="flex items-center justify-between">
                                <div class="flex flex-col">
                                    <span class="text-[10px] font-black uppercase tracking-widest text-white">
                                        AES-256-GCM Encrypted Bank Rail Vault
                                    </span>
                                    <span class="text-[8px] font-mono text-neutral-400">
                                        Local Federal Reserve Mod-10 ABA Checksum &amp; Instant Institution Recognition
                                    </span>
                                </div>
                                {#if savedBankLast4}
                                    <button
                                        type="button"
                                        data-testid="edit-bank-rail-btn"
                                        onclick={() => (isEditingBankRail = !isEditingBankRail)}
                                        class="tactile-btn px-3 py-1 rounded-lg text-[8px] font-bold uppercase text-[#18C6A5] border-[#18C6A5]/35 cursor-pointer"
                                    >
                                        {isEditingBankRail ? 'Close Editor ✕' : `Update Rail (*${savedBankLast4})`}
                                    </button>
                                {/if}
                            </div>
                            {#if savedBankLast4 && !isEditingBankRail}
                                <div class="bg-[#0a0d12] border border-[#18C6A5]/30 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono">
                                    <div class="flex items-center gap-2.5">
                                        <span class="w-2 h-2 rounded-full bg-[#18C6A5]"></span>
                                        <span class="font-bold text-white">
                                            {savedBankRailMeta?.bankLabel || offrampBankLabel} (*{savedBankLast4})
                                        </span>
                                    </div>
                                    <div class="flex items-center gap-2 text-[9px]">
                                        <span class="px-2 py-0.5 rounded bg-[#11161f] border border-white/10 text-neutral-300">
                                            {savedBankRailMeta?.accountType || offrampAccountType}
                                        </span>
                                        <span class="px-2 py-0.5 rounded bg-[#11161f] border border-[#18C6A5]/30 text-[#18C6A5]">
                                            {savedBankRailMeta?.payoutMethod || payoutMethod.toUpperCase()} READY
                                        </span>
                                    </div>
                                </div>
                            {:else}
                                <div class="flex flex-col gap-3 pt-1">
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div class="flex flex-col gap-1">
                                            <label for="offrampBankLabelInput" class="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
                                                Bank / Account Label
                                            </label>
                                            <input
                                                id="offrampBankLabelInput"
                                                type="text"
                                                bind:value={offrampBankLabel}
                                                placeholder="Primary Operating Account"
                                                class="w-full bg-[#0a0d12] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3.5 py-2.5 text-[11px] font-mono text-white outline-none"
                                            />
                                        </div>
                                        <div class="flex flex-col gap-1">
                                            <span class="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
                                                Account Type
                                            </span>
                                            <div class="grid grid-cols-2 gap-2">
                                                <button
                                                    type="button"
                                                    onclick={() => (offrampAccountType = 'CHECKING')}
                                                    class="tactile-btn py-2.5 rounded-xl text-[9px] font-bold uppercase cursor-pointer {offrampAccountType === 'CHECKING' ? 'text-[#18C6A5] border-[#18C6A5]/40' : 'text-neutral-400'}"
                                                >
                                                    Checking
                                                </button>
                                                <button
                                                    type="button"
                                                    onclick={() => (offrampAccountType = 'SAVINGS')}
                                                    class="tactile-btn py-2.5 rounded-xl text-[9px] font-bold uppercase cursor-pointer {offrampAccountType === 'SAVINGS' ? 'text-[#18C6A5] border-[#18C6A5]/40' : 'text-neutral-400'}"
                                                >
                                                    Savings
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div class="flex flex-col gap-1">
                                            <label for="offrampRouting" class="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
                                                9-Digit ABA Routing Number
                                            </label>
                                            <input
                                                id="offrampRouting"
                                                data-testid="offramp-aba-input"
                                                type="text"
                                                maxlength="9"
                                                bind:value={offrampRoutingNumber}
                                                placeholder="021000021"
                                                class="w-full bg-[#0a0d12] border {abaTelemetry.isComplete ? (abaTelemetry.checksumValid ? 'border-[#18C6A5]/60' : 'border-red-500/60') : 'border-white/10'} focus:border-[#18C6A5]/50 rounded-xl px-3.5 py-2.5 text-[11px] font-mono text-white outline-none placeholder-neutral-600"
                                            />
                                            {#if abaTelemetry.cleanDigits.length > 0}
                                                <div
                                                    data-testid="aba-recognition-badge"
                                                    class="mt-1 px-2.5 py-1.5 rounded-lg border text-[9px] font-mono font-bold flex items-center justify-between {abaTelemetry.isComplete && abaTelemetry.checksumValid ? 'bg-[#0a0d12] border-[#18C6A5]/45 text-[#18C6A5]' : abaTelemetry.isComplete ? 'bg-red-950/25 border-red-500/45 text-red-400' : 'bg-[#0a0d12] border-white/10 text-neutral-400'}"
                                                >
                                                    {#if abaTelemetry.isComplete && abaTelemetry.checksumValid}
                                                        <span>✓ {abaTelemetry.institutionName}</span>
                                                        <span class="text-[8px] uppercase">MOD-10 VALID</span>
                                                    {:else if abaTelemetry.isComplete}
                                                        <span>✕ Invalid Federal Reserve ABA Checksum</span>
                                                        <span class="text-[8px] uppercase">MOD-10 FAIL</span>
                                                    {:else}
                                                        <span>Entering ABA Routing ({abaTelemetry.cleanDigits.length}/9 digits)...</span>
                                                    {/if}
                                                </div>
                                            {/if}
                                        </div>
                                        <div class="flex flex-col gap-1">
                                            <label for="offrampAccount" class="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">
                                                Bank Account Number
                                            </label>
                                            <input
                                                id="offrampAccount"
                                                data-testid="offramp-account-input"
                                                type="password"
                                                bind:value={offrampAccountNumber}
                                                placeholder="Account Number"
                                                class="w-full bg-[#0a0d12] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-3.5 py-2.5 text-[11px] font-mono text-white outline-none placeholder-neutral-600"
                                            />
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        data-testid="save-bank-rail-btn"
                                        onclick={saveBankRailVault}
                                        disabled={isSavingBankRail || !abaTelemetry.checksumValid || !offrampAccountNumber.trim()}
                                        class="tactile-btn w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer disabled:opacity-40"
                                    >
                                        {isSavingBankRail ? 'Encrypting & Saving Bank Rail...' : 'Save / Update Encrypted Bank Rail Vault'}
                                    </button>
                                </div>
                            {/if}
                        </div>
                        <div class="flex flex-col gap-2 bg-[#11161f] p-4 rounded-2xl border border-white/10">
                            <div class="flex items-center justify-between">
                                <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                                    Amount to Liquidate ({offrampSelectedAssetTicker})
                                </span>
                                <button
                                    type="button"
                                    onclick={() => {
                                        const maxBal =
                                            offrampSourceMode === 'onchain_kas'
                                                ? Math.max(0, offrampAvailableSourceBalance - 0.01)
                                                : offrampAvailableSourceBalance;
                                        otcCryptoAmountInput = maxBal > 0 ? maxBal.toFixed(4) : '';
                                        calcFiatFromCrypto();
                                    }}
                                    class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-bold uppercase text-[#18C6A5] cursor-pointer"
                                >
                                    [MAX]
                                </button>
                            </div>
                            <div class="flex justify-between items-center">
                                <input
                                    type="number"
                                    bind:value={otcCryptoAmountInput}
                                    oninput={calcFiatFromCrypto}
                                    placeholder="0.00"
                                    class="w-full bg-transparent text-2xl font-bold font-mono text-white outline-none placeholder-neutral-700"
                                />
                                <span class="font-bold text-white text-xs tracking-wider shrink-0 px-4 py-2 bg-[#0a0d12] border border-white/10 rounded-xl">
                                    {offrampSelectedAssetTicker}
                                </span>
                            </div>
                            <span class="text-[10px] font-mono text-neutral-500 mt-1">
                                Available in Source: {offrampAvailableSourceBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} {offrampSelectedAssetTicker}
                                {offrampSourceMode !== 'onchain_kas' ? '• $0.00 L1 Gas' : ''}
                            </span>
                        </div>
                        <div class="flex flex-col gap-2 bg-[#11161f] p-4 rounded-2xl border border-white/10">
                            <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                                Payout Method
                            </span>
                            <div class="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onclick={() => {
                                        payoutMethod = 'ach';
                                        calcFiatFromCrypto();
                                    }}
                                    class="tactile-btn py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-xl cursor-pointer {payoutMethod === 'ach' ? 'text-[#18C6A5] border-[#18C6A5]/40' : 'text-neutral-400'}"
                                >
                                    ACH Transfer ($2 Fee)
                                </button>
                                <button
                                    type="button"
                                    onclick={() => {
                                        payoutMethod = 'wire';
                                        calcFiatFromCrypto();
                                    }}
                                    class="tactile-btn py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-xl cursor-pointer {payoutMethod === 'wire' ? 'text-[#18C6A5] border-[#18C6A5]/40' : 'text-neutral-400'}"
                                >
                                    Same-Day Wire ($15 Fee)
                                </button>
                            </div>
                        </div>
                        <div class="flex flex-col gap-2 bg-[#11161f] p-4 rounded-2xl border border-white/10">
                            <span class="text-[10px] font-bold text-[#18C6A5] uppercase tracking-widest">
                                Net Cash to Bank
                            </span>
                            <div class="flex justify-between items-center">
                                <input
                                    type="text"
                                    readonly
                                    value={otcNetFiatOutput.toFixed(2)}
                                    class="w-full bg-transparent text-2xl font-bold font-mono text-[#18C6A5] outline-none"
                                />
                                <span class="font-bold text-white text-xs tracking-wider shrink-0 px-4 py-2 bg-[#0a0d12] border border-white/10 rounded-xl">
                                    USD
                                </span>
                            </div>
                        </div>
                        <button
                            type="button"
                            onclick={triggerFiatOfframp}
                            disabled={!otcCryptoAmountInput || isExecuting || otcNetFiatOutput <= 0}
                            class="tactile-btn w-full py-4 rounded-2xl text-white border-[#18C6A5]/40 text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
                            style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.18), transparent 70%);"
                        >
                            {payoutMethod === 'wire'
                                ? `Authorize ${offrampSelectedAssetTicker} → Same-Day Bank Wire`
                                : `Authorize ${offrampSelectedAssetTicker} → ACH Bank Transfer`}
                        </button>
                    </div>
                {/if}
                {#if recentOnrampSessions.length > 0 || recentOfframpPayouts.length > 0 || fiatHistoryEvents.length > 0}
                    <div class="border-t border-white/10 pt-4 mt-1 flex flex-col gap-3">
                        <div class="flex items-center justify-between">
                            <span class="text-[10px] font-black uppercase tracking-widest text-neutral-300">
                                Live 4-Stage ACH Pipeline &amp; Printable Receipts
                            </span>
                            <button
                                type="button"
                                onclick={checkFiatGatewayStatus}
                                class="text-[9px] font-mono text-neutral-400 hover:text-white cursor-pointer"
                            >
                                Refresh ↻
                            </button>
                        </div>
                        <div class="flex flex-col gap-2.5 max-h-[280px] overflow-y-auto hide-scrollbar">
                            {#each recentOfframpPayouts as p (p.payout_id)}
                                {@const stageIdx = getPayoutStageIndex(p.status)}
                                <div class="bg-[#11161f] border border-white/10 rounded-xl p-3.5 flex flex-col gap-2.5 text-[10px]">
                                    <div class="flex items-center justify-between gap-2">
                                        <div class="flex flex-col">
                                            <span class="font-bold text-white">
                                                OFF-RAMP ({p.payout_method} *{p.bank_last4}) • {Number(p.amount_crypto || 0).toFixed(4)} {p.source_asset}
                                            </span>
                                            <span class="text-[9px] text-neutral-400">
                                                Ref: {p.payout_id} • {p.status}
                                                {#if p.trace_id}
                                                    • <strong class="text-[#18C6A5]">Trace: {p.trace_id}</strong>
                                                {/if}
                                            </span>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onclick={() => downloadAchPayoutReceiptPdf(p)}
                                                class="tactile-btn px-2.5 py-1 rounded-lg text-[8px] font-bold uppercase text-neutral-300 hover:text-white cursor-pointer"
                                            >
                                                [Receipt PDF ↓]
                                            </button>
                                            <span class="font-bold text-[#18C6A5]">
                                                +${Number(p.net_fiat_usd || 0).toFixed(2)} USD
                                            </span>
                                        </div>
                                    </div>
                                    <div class="grid grid-cols-4 gap-1.5 pt-1 border-t border-white/5 text-[8px] font-mono">
                                        {#each [
                                            { step: 1, label: '1. Silo/Ledger Swept' },
                                            {
                                                step: 2,
                                                label: '2. Pool Liquidity Cleared'
                                            },
                                            { step: 3, label: '3. Treasury Queued' },
                                            { step: 4, label: p.trace_id ? `4. Dispatched (${p.trace_id.slice(0, 10)})` : '4. Bank Dispatched' }
                                        ] as st}
                                            <div class="flex flex-col gap-1">
                                                <div
                                                    class="h-1 rounded-full {stageIdx >= st.step ? 'bg-[#18C6A5]' : 'bg-white/10'}"
                                                ></div>
                                                <span
                                                    class="truncate {stageIdx >= st.step ? 'text-[#18C6A5] font-bold' : 'text-neutral-500'}"
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
        {/if}
    </div>
</div>

{#if isTokenModalOpen}
    <div
        class="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#06080b]/95 backdrop-blur-sm"
        transition:fade={{ duration: 150 }}
    >
        <button
            type="button"
            aria-label="Close"
            class="absolute inset-0 w-full h-full cursor-default border-none bg-transparent"
            onclick={() => (isTokenModalOpen = false)}
        ></button>
        <div class="relative z-10 w-full max-w-[460px] bg-[#0a0d12] border border-white/15 rounded-[28px] shadow-2xl flex flex-col overflow-hidden h-[580px]">
            <div class="p-4 border-b border-white/10 bg-[#11161f] flex items-center justify-between">
                <div class="flex flex-col">
                    <span class="text-xs font-black uppercase tracking-widest text-white">Select Asset</span>
                    <span class="text-[8px] font-mono text-[#18C6A5] uppercase">
                        24/7 Crypto • Wall Street Equities • Gold &amp; T-Bills
                    </span>
                </div>
                <button
                    type="button"
                    onclick={() => (isTokenModalOpen = false)}
                    class="w-7 h-7 rounded-full bg-[#0a0d12] text-neutral-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                    ✕
                </button>
            </div>
            <div class="p-3 border-b border-white/10 bg-[#0a0d12] flex flex-col gap-2">
                <input
                    type="text"
                    data-testid="dex-token-modal-search"
                    bind:value={tokenSearchQuery}
                    oninput={handleModalSearchInput}
                    placeholder="Filter or discover any ticker (NVDA, SPY, PEPE, XAU, BTC)..."
                    class="w-full bg-[#11161f] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-mono text-white outline-none"
                />
                <div class="grid grid-cols-4 gap-1.5">
                    {#each [
                        { id: 'ALL', label: 'All' },
                        { id: 'CRYPTO', label: 'Crypto' },
                        { id: 'EQUITIES', label: 'Equities' },
                        { id: 'COMMODITIES', label: 'Gold/Debt' }
                    ] as cat (cat.id)}
                        <button
                            type="button"
                            data-testid="dex-modal-cat-{cat.id}"
                            onclick={() => (tokenCategoryFilter = cat.id as any)}
                            class="py-1.5 rounded-lg text-[9px] font-mono font-bold uppercase cursor-pointer transition-colors {tokenCategoryFilter === cat.id ? 'bg-[#161d29] text-[#18C6A5] border border-[#18C6A5]/40' : 'bg-[#11161f] text-neutral-400 hover:text-white'}"
                        >
                            {cat.label}
                        </button>
                    {/each}
                </div>
            </div>
            <div class="flex-1 overflow-y-auto p-2 bg-[#0a0d12] hide-scrollbar">
                <div class="flex flex-col gap-1">
                    {#if isDiscoveringModal}
                        <div class="p-4 text-center text-[10px] font-mono text-[#18C6A5] animate-pulse uppercase tracking-widest">
                            Discovering Live Oracle Feed for "{tokenSearchQuery.trim().toUpperCase()}"...
                        </div>
                    {:else if discoveredModalAsset && !filteredTokens.some((t) => t.ticker === discoveredModalAsset?.ticker)}
                        <div class="p-3.5 rounded-xl bg-[#11161f] border border-[#18C6A5]/40 flex flex-col gap-2.5 mb-2">
                            <div class="flex items-center justify-between">
                                <div class="flex flex-col">
                                    <span class="text-xs font-black text-white">
                                        {discoveredModalAsset.ticker} • {discoveredModalAsset.name}
                                    </span>
                                    <span class="text-[8px] font-mono text-[#18C6A5] uppercase">
                                        LIVE ORACLE FEED ({discoveredModalAsset.quorumCount} SOURCES)
                                    </span>
                                </div>
                                <span class="text-xs font-mono font-black text-[#18C6A5]">
                                    ${discoveredModalAsset.spotPrice < 0.01
                                        ? discoveredModalAsset.spotPrice.toFixed(8)
                                        : discoveredModalAsset.spotPrice.toFixed(4)}
                                </span>
                            </div>
                            <div class="grid grid-cols-3 gap-1.5">
                                <button
                                    type="button"
                                    onclick={() =>
                                        discoveredModalAsset &&
                                        applyDiscoveredOrSearchAsset(discoveredModalAsset, 'pay')}
                                    class="tactile-btn py-1.5 rounded-lg text-[8px] font-mono font-black uppercase text-white cursor-pointer"
                                >
                                    YOU PAY
                                </button>
                                <button
                                    type="button"
                                    onclick={() =>
                                        discoveredModalAsset &&
                                        applyDiscoveredOrSearchAsset(discoveredModalAsset, 'receive')}
                                    class="tactile-btn py-1.5 rounded-lg text-[8px] font-mono font-black uppercase text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer"
                                >
                                    YOU RECEIVE
                                </button>
                                <button
                                    type="button"
                                    onclick={() =>
                                        discoveredModalAsset &&
                                        applyDiscoveredOrSearchAsset(discoveredModalAsset, 'wallet')}
                                    class="tactile-btn py-1.5 rounded-lg text-[8px] font-mono font-black uppercase text-blue-400 border-blue-500/40 cursor-pointer"
                                >
                                    + ADD TO WALLET
                                </button>
                            </div>
                        </div>
                    {:else if discoverModalError && filteredTokens.length === 0}
                        <div class="p-4 text-center text-[10px] font-mono text-amber-400">
                            {discoverModalError}
                        </div>
                    {/if}

                    {#each filteredTokens as token (token.ticker)}
                        <button
                            type="button"
                            data-testid="dex-select-token-{token.ticker}"
                            aria-label="Select {token.ticker}"
                            onclick={() => selectToken(token)}
                            class="w-full flex items-center justify-between p-3 rounded-xl hover:bg-[#11161f] transition-colors cursor-pointer group border border-transparent hover:border-white/10"
                        >
                            <div class="flex items-center gap-3 pointer-events-none">
                                <div
                                    class="w-8 h-8 rounded-full bg-[#11161f] border border-white/10 flex items-center justify-center text-[10px] font-black overflow-hidden"
                                    style="color: {token.hex};"
                                >
                                    {#if token.icon}
                                        <img
                                            src={token.icon}
                                            class="w-4 h-4 object-contain"
                                            alt="logo"
                                            onerror={(e) =>
                                                ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                                        />
                                    {:else}
                                        {token.ticker.slice(0, 3)}
                                    {/if}
                                </div>
                                <div class="flex flex-col items-start">
                                    <div class="flex items-center gap-1.5">
                                        <span class="text-xs font-bold text-white tracking-widest">
                                            {token.ticker}
                                        </span>
                                        <span class="text-[8px] px-1.5 py-0.5 rounded bg-[#11161f] border border-white/10 text-neutral-400 uppercase">
                                            {token.assetClass}
                                        </span>
                                    </div>
                                    <span class="text-[9px] text-neutral-500">{token.name}</span>
                                </div>
                            </div>
                            <div class="flex flex-col items-end pointer-events-none">
                                <span class="text-xs font-mono text-[#18C6A5] font-bold">
                                    ${token.spotPrice > 0 && token.spotPrice < 0.01
                                        ? token.spotPrice.toFixed(6)
                                        : token.spotPrice.toFixed(settingsStore.fiatDecimals)}
                                </span>
                                <span class="text-[9px] font-mono text-neutral-500">
                                    Avail: {token.availableBalance.toLocaleString(undefined, {
                                        maximumFractionDigits: 4
                                    })}
                                </span>
                            </div>
                        </button>
                    {/each}
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .dex-deep-shaded-tiles {
        background-image:
            linear-gradient(to right, rgba(255, 255, 255, 0.015) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.015) 1px, transparent 1px);
        background-size: 14px 14px;
        background-position: 0 0;
    }
    :global(html.theme-light) .dex-deep-shaded-tiles {
        background-image:
            linear-gradient(to right, rgba(42, 36, 24, 0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(42, 36, 24, 0.04) 1px, transparent 1px);
        background-size: 14px 14px;
    }
    @keyframes subgrid-shockwave {
        0% {
            transform: translate3d(-65%, -65%, 0);
            opacity: 0;
        }
        25% {
            opacity: 1;
        }
        100% {
            transform: translate3d(65%, 65%, 0);
            opacity: 0;
        }
    }
    .dex-subgrid-sweep {
        inset: -50%;
        background: linear-gradient(
            135deg,
            transparent 43%,
            color-mix(in srgb, var(--sweep-primary) 12%, transparent) 48%,
            color-mix(in srgb, var(--sweep-secondary) 18%, transparent) 50%,
            rgba(255, 255, 255, 0.05) 51%,
            transparent 56%
        );
        animation: subgrid-shockwave 420ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        will-change: transform, opacity;
    }
    :global(.hide-scrollbar::-webkit-scrollbar) {
        display: none;
    }
    :global(.hide-scrollbar) {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
    :global(.custom-range-slider) {
        -webkit-appearance: none;
        appearance: none;
        height: 6px;
        background: #11161f;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        outline: none;
    }
    :global(.custom-range-slider::-webkit-slider-thumb) {
        -webkit-appearance: none;
        appearance: none;
        height: 18px;
        width: 18px;
        border-radius: 50%;
        background: #e4e4e7;
        cursor: pointer;
        border: 2px solid #18c6a5;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    }
</style>