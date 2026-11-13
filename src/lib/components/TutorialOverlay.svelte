<!-- WINDOWS (FRONTEND): C:\Users\send2\perennia-v5\perennia-frontend\src\lib\components\TutorialOverlay.svelte -->
<script lang="ts">
    import { fade, fly } from 'svelte/transition';
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import {
        ui,
        SANDBOX_MNEMONIC_WORDS,
        SANDBOX_WALLETS,
        SANDBOX_ONLINE_WORKER,
        SANDBOX_DEMO_SECTOR,
        SANDBOX_TAX_EVENTS,
        type ChevronPlacement
    } from '$lib/stores/ui.svelte';
    import { identity } from '$lib/stores/identity.svelte';
    import { operations } from '$lib/stores/operations.svelte';
    import { treasury } from '$lib/stores/treasury.svelte';
    import { settingsStore } from '$lib/stores/settings.svelte';

    interface ChapterMeta {
        chapter: number;
        shortName: string;
        title: string;
        subtitle: string;
        tab: string;
        accentHex: string;
    }

    const CHAPTERS: ChapterMeta[] = [
        {
            chapter: 1,
            shortName: 'Wallet',
            title: 'Sign Up, Log In & Sovereign Wallet',
            subtitle: 'Create a new 24-word vault or log in with your saved password & .json backup',
            tab: 'OPERATIONS',
            accentHex: '#18C6A5'
        },
        {
            chapter: 2,
            shortName: 'SILO',
            title: 'Fiat Bridge, Buy SILO & 3-Tier Fee Shield',
            subtitle: 'Fund via Instant Bank/Card or Bank Wire, buy SILO, and unlock 1.50% → 0.75% → 0.25% fees',
            tab: 'DEX',
            accentHex: '#18C6A5'
        },
        {
            chapter: 3,
            shortName: 'Workers',
            title: 'ASIC Workers & Stratum Setup',
            subtitle: 'Add a worker, see it appear in your fleet, and copy your Stratum credentials',
            tab: 'OPERATIONS',
            accentHex: '#18C6A5'
        },
        {
            chapter: 4,
            shortName: 'Sectors',
            title: 'Sectors, Silos & Liquidity Plants',
            subtitle: 'Route hashpower into single-asset Silos or 50%-KAS Liquidity Plants',
            tab: 'OPERATIONS',
            accentHex: '#3B82F6'
        },
        {
            chapter: 5,
            shortName: 'Exchange',
            title: 'The Exchange (Swaps, 50%-KAS LP & Atomic P2P)',
            subtitle: 'Trade 24/7 crypto & equities, supply 50%-KAS liquidity, and post atomic P2P offers',
            tab: 'DEX',
            accentHex: '#F59E0B'
        },
        {
            chapter: 6,
            shortName: 'Treasury',
            title: 'Multi-Chain Treasury & Per-Token Cold Vault',
            subtitle: 'Inspect balances, configure per-token [Cold Vault] auto-sweeps, and view L1 payouts',
            tab: 'TREASURY',
            accentHex: '#3B82F6'
        },
        {
            chapter: 7,
            shortName: 'Tax',
            title: 'Zero-PII Tax Fortress, External Cost Basis & Settings',
            subtitle: 'Configure jurisdiction, protect Form 8949 with External Cost Basis, and set Language/FX',
            tab: 'TAX FORTRESS',
            accentHex: '#18C6A5'
        }
    ];

    const SANDBOX_PASSWORD = 'PerenniaSandboxVault2026!';
    const SANDBOX_HIFO_BUNDLE = {
        accountingMethod: 'PASSIVE_HIFO_NO_WASH',
        lots: [
            {
                lotId: 'LOT-HIGH-0180',
                assetTicker: 'KAS',
                acquiredAt: '2026-10-20T22:00:00.000Z',
                kasSompi: 100_000_000_000,
                initialTokens: 1000.0,
                remainingSompi: 50_000_000_000,
                remainingTokens: 500.0,
                fmvUsdPerToken: 0.18,
                totalCostBasisUsd: 180.0,
                remainingCostBasisUsd: 90.0,
                sourceEventType: 'YIELD',
                sourceTxHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
                status: 'OPEN',
                holdingDays: 9,
                isLongTerm: false
            },
            {
                lotId: 'LOT-LOW-0150',
                assetTicker: 'KAS',
                acquiredAt: '2026-10-24T22:00:00.000Z',
                kasSompi: 100_000_000_000,
                initialTokens: 1000.0,
                remainingSompi: 100_000_000_000,
                remainingTokens: 1000.0,
                fmvUsdPerToken: 0.15,
                totalCostBasisUsd: 150.0,
                remainingCostBasisUsd: 150.0,
                sourceEventType: 'YIELD',
                sourceTxHash: 'b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef01',
                status: 'OPEN',
                holdingDays: 5,
                isLongTerm: false
            }
        ],
        disposalMatches: [
            {
                matchId: 'MATCH-8949-01',
                lotId: 'LOT-HIGH-0180',
                assetTicker: 'KAS',
                disposedSompi: 50_000_000_000,
                disposedTokens: 500.0,
                acquiredAt: '2026-10-20T22:00:00.000Z',
                disposedAt: '2026-10-28T16:30:00.000Z',
                holdingPeriodDays: 8,
                isLongTerm: false,
                costBasisUsd: 90.0,
                grossProceedsUsd: 95.0,
                realizedGainLossUsd: 5.0,
                disposalTxHash: 'c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef012'
            }
        ],
        summary: {
            openCostBasisUsd: 240.0,
            openKasTokens: 1500.0,
            totalMatchedCostBasisUsd: 90.0,
            totalMatchedProceedsUsd: 95.0,
            shortTermGainLossUsd: 5.0,
            longTermGainLossUsd: 0.0,
            netRealizedGainLossUsd: 5.0
        }
    };

    ui.bindSandboxStores({ identity, operations, treasury });

    let activeChapterNum = $derived(Number(ui.tutorialChapter || 1));
    let activeChapterMeta = $derived(
        CHAPTERS.find((c) => c.chapter === activeChapterNum) || CHAPTERS[0]
    );
    let currentSpec = $derived(ui.activeTourStepSpec);
    let isActionStep = $derived(currentSpec?.mode === 'ACTION');
    let spotlightRect = $state<{
        top: number;
        left: number;
        width: number;
        height: number;
    } | null>(null);
    let viewportW = $state(1440);
    let viewportH = $state(900);
    let rafId: number | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let advanceTimeout: ReturnType<typeof setTimeout> | null = null;
    let capturedSeedWords = $state<string[]>([...SANDBOX_MNEMONIC_WORDS]);

    let stashedLocalStorageVault: string | null = null;
    let hasStashedVault = false;
    let hasResetWalletModalToMenu = false;
    let hasFilledPasswords = false;
    let hasTriggeredSeedGen = false;
    let hasFilledVerifyWords = false;
    let hasFilledSampleAba = false;
    let hasFilledSiloSwapQuote = false;
    let hasFilledSiloStakeInput = false;
    let hasFilledNvdaSwapQuote = false;
    let sandboxSiloStakedAmount = 0;

    let originalFetch: typeof window.fetch | null = null;
    let originalPrompt: typeof window.prompt | null = null;

    function stashAndClearStoredVaultForTutorial() {
        if (!browser) return;
        if (!hasStashedVault) {
            stashedLocalStorageVault = localStorage.getItem(
                'perennia_sovereign_payload'
            );
            hasStashedVault = true;
        }
        localStorage.removeItem('perennia_sovereign_payload');
    }

    function restoreStashedVaultAfterTutorial() {
        if (!browser || !hasStashedVault) return;
        if (stashedLocalStorageVault !== null) {
            localStorage.setItem(
                'perennia_sovereign_payload',
                stashedLocalStorageVault
            );
        } else {
            localStorage.removeItem('perennia_sovereign_payload');
        }
        stashedLocalStorageVault = null;
        hasStashedVault = false;
    }

    function forceResetWalletModalViewState() {
        if (!browser || hasResetWalletModalToMenu) return;
        hasResetWalletModalToMenu = true;
        stashAndClearStoredVaultForTutorial();
        identity.pendingTransactionDetails = { actionType: 'TUTORIAL_RESET' };
        identity.isVaultUnlockPending = true;
        setTimeout(() => {
            identity.isVaultUnlockPending = false;
            identity.pendingTransactionDetails = null;
            if (ui.tutorialChapter === 1 && ui.tutorialSubStep === 0) {
                ui.showWalletModal = false;
            }
        }, 30);
    }

    function installUnifiedSandboxInterceptors() {
        if (!browser) return;
        if (!originalPrompt) {
            originalPrompt = window.prompt.bind(window);
            window.prompt = (message?: string, defaultValue?: string) => {
                if (ui.isTutorialActive) {
                    return 'RIG-KS7-LITE';
                }
                return originalPrompt!(message, defaultValue);
            };
        }
        if (!originalFetch) {
            originalFetch = window.fetch.bind(window);
            window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
                const urlStr =
                    typeof input === 'string'
                        ? input
                        : input instanceof URL
                          ? input.href
                          : input.url;
                if (ui.isTutorialActive && ui.isTutorialSandbox) {
                    if (urlStr.includes('/api/auth/challenge')) {
                        return new Response(
                            JSON.stringify({
                                message: `Perennia Sovereign Matrix Sandbox Authorization\nNonce: tutorial-sandbox`
                            }),
                            {
                                status: 200,
                                headers: { 'Content-Type': 'application/json' }
                            }
                        );
                    }
                    if (urlStr.endsWith('/api/auth') && init?.method === 'POST') {
                        return new Response(
                            JSON.stringify({
                                status: 'success',
                                address: SANDBOX_WALLETS.kaspa.address
                            }),
                            {
                                status: 200,
                                headers: { 'Content-Type': 'application/json' }
                            }
                        );
                    }
                    if (urlStr.includes('/api/fiat/offramp')) {
                        return new Response(
                            JSON.stringify({
                                circleConfigured: false,
                                sovereignQueueEnabled: true,
                                oracleOnline: true,
                                spotPrice: 0.165,
                                savedBankRailReady: false,
                                savedBankRailLast4: null,
                                recentPayouts: []
                            }),
                            {
                                status: 200,
                                headers: { 'Content-Type': 'application/json' }
                            }
                        );
                    }
                    if (urlStr.includes('/api/fiat/onramp')) {
                        if (init?.method === 'POST') {
                            return new Response(
                                JSON.stringify({
                                    success: true,
                                    sessionId: 'PER-ONRAMP-SILO01',
                                    orderId: 'PER-ONRAMP-SILO01',
                                    clientSecret: 'per_sec_sandbox_silo',
                                    walletAddress: SANDBOX_WALLETS.kaspa.address,
                                    fiatAmountUsd: 500.0,
                                    feeUsd: 10.0,
                                    netUsdConverted: 490.0,
                                    spotPrice: 0.165,
                                    estimatedKas: 2969.7,
                                    estimatedTokens: 2969.7,
                                    deliveredTokens: 2969.7,
                                    targetAsset: 'KAS',
                                    paymentRail: 'SOVEREIGN_WIRE_ACH',
                                    settlementTarget: 'L1_KAS',
                                    wireMemo: 'PER-ONRAMP-SILO01',
                                    wireInstructions: {
                                        beneficiaryName:
                                            'Perennia Holdings, LLC — Sovereign Treasury',
                                        bankName:
                                            'Lead Bank / Column N.A. Commercial Vault',
                                        routingNumber: '101019644',
                                        accountNumber: '8804921044',
                                        accountType: 'COMMERCIAL CHECKING',
                                        wireMemo: 'PER-ONRAMP-SILO01',
                                        settlementTarget: 'L1_KAS'
                                    },
                                    status: 'COMPLETED',
                                    txHash: 'ONRAMP-SANDBOX-CONFIRMED-01',
                                    nonKycTier: 'SOVEREIGN_WIRE_ACH'
                                }),
                                {
                                    status: 200,
                                    headers: { 'Content-Type': 'application/json' }
                                }
                            );
                        }
                        return new Response(
                            JSON.stringify({
                                online: true,
                                nonKycEnabled: true,
                                sovereignWireEnabled: true,
                                spotPrice: 0.165,
                                recentOnrampSessions: [],
                                fiatLedgerEvents: []
                            }),
                            {
                                status: 200,
                                headers: { 'Content-Type': 'application/json' }
                            }
                        );
                    }
                    if (urlStr.includes('/api/sor/swap')) {
                        const currentSilo = treasury.getAsset('SILO');
                        treasury.updateAsset('SILO', {
                            synthetic: (currentSilo.synthetic || 5000) + 3928.57
                        });
                        return new Response(
                            JSON.stringify({
                                success: true,
                                orderId: 'SILO-PURCHASE-CONFIRMED-01',
                                txHash: 'SILO-PURCHASE-CONFIRMED-01',
                                unified_rate: 23.809524,
                                estimated_output: 3928.5714,
                                receivedAmount: 3928.5714,
                                transaction_uuid: 'SILO-PURCHASE-CONFIRMED-01',
                                legs: [
                                    {
                                        tier: 1,
                                        provider: 'Perennia Internal Pool',
                                        filledAmount: 1000,
                                        executionRate: 23.809524,
                                        marginCaptured: 0
                                    }
                                ],
                                psbt: null,
                                formattedUtxos: []
                            }),
                            {
                                status: 200,
                                headers: { 'Content-Type': 'application/json' }
                            }
                        );
                    }
                    if (urlStr.includes('/api/p2p')) {
                        return new Response(
                            JSON.stringify({
                                success: true,
                                orders: [
                                    {
                                        id: 'P2P-SANDBOX-01',
                                        seller: SANDBOX_WALLETS.kaspa.address,
                                        sellToken: 'KAS',
                                        sellAmount: 2500,
                                        buyToken: 'USDC',
                                        buyAmount: 412.5,
                                        rate: '0.1650',
                                        status: 'OPEN'
                                    }
                                ]
                            }),
                            {
                                status: 200,
                                headers: { 'Content-Type': 'application/json' }
                            }
                        );
                    }
                    if (urlStr.includes('/api/user/tax-events')) {
                        if (urlStr.includes('bundle=hifo')) {
                            return new Response(
                                JSON.stringify({
                                    events: SANDBOX_TAX_EVENTS,
                                    hifoLots: SANDBOX_HIFO_BUNDLE.lots,
                                    disposalMatches:
                                        SANDBOX_HIFO_BUNDLE.disposalMatches,
                                    hifoSummary: SANDBOX_HIFO_BUNDLE.summary
                                }),
                                {
                                    status: 200,
                                    headers: { 'Content-Type': 'application/json' }
                                }
                            );
                        }
                        return new Response(JSON.stringify(SANDBOX_TAX_EVENTS), {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }
                    if (urlStr.includes('/api/treasury/kyc')) {
                        return new Response(
                            JSON.stringify({
                                success: true,
                                zeroPiiEnforced: true,
                                status: 'verified',
                                jurisdiction: {
                                    countryCode: 'US',
                                    stateRegion: 'TX',
                                    jurisdictionCode: 'US-TX',
                                    entityType: 'LLC',
                                    filingStatus: 'SINGLE',
                                    effectiveTaxRate: 13.92
                                }
                            }),
                            {
                                status: 200,
                                headers: { 'Content-Type': 'application/json' }
                            }
                        );
                    }
                    if (urlStr.includes('/api/treasury/corporate')) {
                        return new Response(
                            JSON.stringify({
                                assets: [
                                    {
                                        symbol: 'KAS',
                                        address: SANDBOX_WALLETS.kaspa.address,
                                        balance: 14520.0
                                    },
                                    {
                                        symbol: 'BTC',
                                        address: SANDBOX_WALLETS.bitcoin.address,
                                        balance: 0.085
                                    },
                                    {
                                        symbol: 'ETH',
                                        address: SANDBOX_WALLETS.ethereum.address,
                                        balance: 1.45
                                    },
                                    {
                                        symbol: 'SOL',
                                        address: SANDBOX_WALLETS.solana.address,
                                        balance: 18.5
                                    }
                                ],
                                reconciliation: null
                            }),
                            {
                                status: 200,
                                headers: { 'Content-Type': 'application/json' }
                            }
                        );
                    }
                    if (urlStr.includes('/api/user/ledger')) {
                        return new Response(
                            JSON.stringify({
                                KAS: 1640.5,
                                SILO: 25000.0,
                                USDC: 340.0,
                                BTC: 0.012,
                                ETH: 0.25,
                                SOL: 3.2,
                                NVDA: 1.5,
                                unassignedReserveKas: 28.4,
                                unassignedReserveTargetKas: 50.0
                            }),
                            {
                                status: 200,
                                headers: { 'Content-Type': 'application/json' }
                            }
                        );
                    }
                    if (urlStr.includes('/api/utxos')) {
                        return new Response(
                            JSON.stringify({
                                entries: [
                                    {
                                        transactionId:
                                            '1111222233334444555566667777888899990000aaaabbbbccccddddeeee0001',
                                        index: 0,
                                        amount: 500_000_000_000
                                    },
                                    {
                                        transactionId:
                                            '1111222233334444555566667777888899990000aaaabbbbccccddddeeee0002',
                                        index: 1,
                                        amount: 450_000_000_000
                                    }
                                ]
                            }),
                            {
                                status: 200,
                                headers: { 'Content-Type': 'application/json' }
                            }
                        );
                    }
                    if (urlStr.includes('/api/state/action')) {
                        let bodyObj: any = {};
                        try {
                            bodyObj = init?.body ? JSON.parse(String(init.body)) : {};
                        } catch {
                            bodyObj = {};
                        }
                        if (bodyObj.action === 'STAKE_SILO') {
                            const added = Number(bodyObj.payload?.amount || 15000);
                            sandboxSiloStakedAmount = Math.max(15000, added);
                            return new Response(
                                JSON.stringify({
                                    success: true,
                                    data: {
                                        stakeId: 'tut-silo-pos-01',
                                        ticker: 'SILO',
                                        stakedAmount: sandboxSiloStakedAmount,
                                        feeRateCap: 0.0075,
                                        tierLabel: 'SILO Staker Tier (0.75% Fee)',
                                        totalActiveStaked: sandboxSiloStakedAmount
                                    }
                                }),
                                {
                                    status: 200,
                                    headers: { 'Content-Type': 'application/json' }
                                }
                            );
                        }
                        if (bodyObj.action === 'GET_SILO_STAKING') {
                            const activeAmt =
                                sandboxSiloStakedAmount > 0
                                    ? sandboxSiloStakedAmount
                                    : activeChapterNum > 2
                                      ? 15000
                                      : 0;
                            const isStaker = activeAmt >= 10000;
                            return new Response(
                                JSON.stringify({
                                    success: true,
                                    data: {
                                        ecosystemTicker: 'SILO',
                                        activeStaked: activeAmt,
                                        cooldownStaked: 0,
                                        combinedEligibleStaked: activeAmt,
                                        feeRateCap: isStaker ? 0.0075 : 0.015,
                                        tierLabel: isStaker
                                            ? 'SILO Staker Tier (0.75% Fee)'
                                            : '1.50% Standard Tier',
                                        positions:
                                            activeAmt > 0
                                                ? [
                                                      {
                                                          id: 'tut-silo-pos-01',
                                                          stakeId:
                                                              'tut-silo-pos-01',
                                                          ticker: 'SILO',
                                                          amount: activeAmt,
                                                          amountStaked: activeAmt,
                                                          status: 'ACTIVE',
                                                          isMatured: false
                                                      }
                                                  ]
                                                : []
                                    }
                                }),
                                {
                                    status: 200,
                                    headers: { 'Content-Type': 'application/json' }
                                }
                            );
                        }
                        if (bodyObj.action === 'GET_HIFO_TAX_LOTS') {
                            return new Response(
                                JSON.stringify({
                                    success: true,
                                    data: SANDBOX_HIFO_BUNDLE
                                }),
                                {
                                    status: 200,
                                    headers: { 'Content-Type': 'application/json' }
                                }
                            );
                        }
                        if (
                            bodyObj.action === 'GET_USER_COLD_VAULT_RULES' ||
                            bodyObj.action === 'GET_COLD_VAULT_AIRLOCK'
                        ) {
                            return new Response(
                                JSON.stringify({
                                    success: true,
                                    data: {
                                        rulesByAsset: {
                                            KAS: {
                                                assetTicker: 'KAS',
                                                network: 'KAS',
                                                coldDestinationAddress:
                                                    SANDBOX_WALLETS.kaspa.address,
                                                vaultLabel:
                                                    'Primary Air-Gapped Hardware Vault',
                                                overflowCeiling: 500,
                                                autoSweepEnabled: true
                                            }
                                        },
                                        clientVault: {
                                            coldKaspaAddress:
                                                SANDBOX_WALLETS.kaspa.address,
                                            cardPublicKeyHex:
                                                '02a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef',
                                            cardLabel:
                                                'Primary Air-Gapped Hardware Vault',
                                            signerMode: 'WEB_QR_AIRLOCK',
                                            overflowThresholdKas: 500,
                                            autoSweepEnabled: true,
                                            lastSweepTxid:
                                                'b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef01',
                                            lastSweepAt: new Date().toISOString()
                                        },
                                        nodeAirlock: {
                                            hotSignerAddress:
                                                SANDBOX_WALLETS.kaspa.address,
                                            coldVaultAddress:
                                                SANDBOX_WALLETS.kaspa.address,
                                            hotBalanceKas: 4250.0,
                                            hotCeilingKas: 5000.0,
                                            minRunwayKas: 250.0,
                                            runwayHoursRemaining: 312.0,
                                            lowRunwayBreakerTripped: false,
                                            status: 'ARMED_NOMINAL'
                                        }
                                    }
                                }),
                                {
                                    status: 200,
                                    headers: { 'Content-Type': 'application/json' }
                                }
                            );
                        }
                        if (bodyObj.action === 'GET_LP_POSITIONS') {
                            return new Response(
                                JSON.stringify({
                                    success: true,
                                    data: [
                                        {
                                            id: 'TUT-LP-365',
                                            lpId: 'TUT-LP-365',
                                            poolPair: 'KAS/NVDA/USDC',
                                            amountA: 4200.0,
                                            amountB: 4.85,
                                            usdValue: 1386.0,
                                            stakedAssetA: 4200.0,
                                            stakedAssetB: 4.85,
                                            weights: {
                                                KAS: 0.5,
                                                NVDA: 0.25,
                                                USDC: 0.25
                                            },
                                            reserves: {
                                                KAS: 4200.0,
                                                NVDA: 2.42,
                                                USDC: 346.5
                                            },
                                            internalPairsCount: 3,
                                            isMultiAssetPlant: true,
                                            lockDurationDays: 365,
                                            unlockDate: new Date(
                                                Date.now() + 365 * 86400 * 1000
                                            ).toISOString(),
                                            createdAt: new Date().toISOString(),
                                            isUnlocked: false,
                                            isLocked: true,
                                            multiplier: 2.5,
                                            weightedTvl: 10500.0
                                        }
                                    ]
                                }),
                                {
                                    status: 200,
                                    headers: { 'Content-Type': 'application/json' }
                                }
                            );
                        }
                        return new Response(JSON.stringify({ success: true }), {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }
                }
                return originalFetch!(input, init);
            };
        }
    }

    function restoreUnifiedSandboxInterceptors() {
        if (!browser) return;
        if (originalPrompt) {
            window.prompt = originalPrompt;
            originalPrompt = null;
        }
        if (originalFetch) {
            window.fetch = originalFetch;
            originalFetch = null;
        }
    }

    function setNativeInputValue(inputEl: HTMLInputElement, value: string) {
        if (inputEl.value === value) return;
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
        )?.set;
        if (setter) {
            setter.call(inputEl, value);
        } else {
            inputEl.value = value;
        }
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function clearAllTourAttributes() {
        if (!browser) return;
        const nodes = document.querySelectorAll('[data-tour-target]');
        for (const el of Array.from(nodes)) {
            el.removeAttribute('data-tour-target');
        }
    }

    function synchronizeActiveChapterDom(chapter: number, stepIdx: number) {
        if (!browser || !ui.isTutorialActive) return;
        installUnifiedSandboxInterceptors();
        clearAllTourAttributes();

        if (chapter !== 7 && settingsStore.showSettingsModal) {
            settingsStore.showSettingsModal = false;
        }

        if (chapter === 1) {
            if (operations.workers.length > 0) operations.workers = [];
            if (operations.sectors.length > 0) operations.sectors = [];
            if (stepIdx === 0) {
                hasFilledPasswords = false;
                hasTriggeredSeedGen = false;
                hasFilledVerifyWords = false;
                stashAndClearStoredVaultForTutorial();
                if (!hasResetWalletModalToMenu) {
                    forceResetWalletModalViewState();
                } else if (identity.isWalletConnected || ui.showWalletModal) {
                    ui.setSandboxPreWalletState();
                }
                const headerBtns = Array.from(
                    document.querySelectorAll('header button')
                ) as HTMLButtonElement[];
                const unlockBtn = (document.querySelector('[data-testid="header-unlock-vault-btn"]') as HTMLButtonElement | null) || headerBtns.find((b) => (b.textContent || '').replace(/\s+/g, ' ').trim().toUpperCase().includes('UNLOCK VAULT'));
                if (unlockBtn) {
                    unlockBtn.setAttribute(
                        'data-tour-target',
                        'mod1-unlock-vault-btn'
                    );
                }
                return;
            }
            if (stepIdx >= 1 && stepIdx <= 8) {
                stashAndClearStoredVaultForTutorial();
                if (!ui.showWalletModal) {
                    ui.showWalletModal = true;
                }
                const dialog = document.querySelector(
                    '[role="dialog"]'
                ) as HTMLElement | null;
                if (!dialog) return;
                const allDialogButtons = Array.from(
                    dialog.querySelectorAll('button')
                ) as HTMLButtonElement[];
                if (stepIdx === 1 || stepIdx === 2) {
                    hasFilledPasswords = false;
                    hasTriggeredSeedGen = false;
                    const backOrOptionsBtn = allDialogButtons.find((b) => {
                        const t = (b.textContent || '').trim().toUpperCase();
                        return t === 'OPTIONS' || t === 'BACK';
                    });
                    if (backOrOptionsBtn) {
                        backOrOptionsBtn.click();
                    }
                    const newVaultBtnCheck = allDialogButtons.find((b) =>
                        (b.textContent || '')
                            .toUpperCase()
                            .includes('NEW 24-WORD VAULT')
                    );
                    if (!newVaultBtnCheck && !identity.isVaultUnlockPending) {
                        identity.pendingTransactionDetails = {
                            actionType: 'TUTORIAL_RESET'
                        };
                        identity.isVaultUnlockPending = true;
                        setTimeout(() => {
                            identity.isVaultUnlockPending = false;
                            identity.pendingTransactionDetails = null;
                        }, 25);
                        return;
                    }
                    if (newVaultBtnCheck) {
                        newVaultBtnCheck.setAttribute(
                            'data-tour-target',
                            'mod1-new-vault-btn'
                        );
                        const menuWrapper = newVaultBtnCheck.closest(
                            'div.w-full.flex.flex-col'
                        ) as HTMLElement | null;
                        if (menuWrapper) {
                            menuWrapper.setAttribute(
                                'data-tour-target',
                                'mod1-wallet-menu-options'
                            );
                        }
                    }
                    return;
                }
                if (stepIdx === 3 || stepIdx === 4) {
                    const newVaultBtn = allDialogButtons.find((b) =>
                        (b.textContent || '')
                            .toUpperCase()
                            .includes('NEW 24-WORD VAULT')
                    );
                    if (newVaultBtn) {
                        newVaultBtn.click();
                    }
                    const passInputs = Array.from(
                        dialog.querySelectorAll('input[type="password"]')
                    ) as HTMLInputElement[];
                    if (
                        passInputs.length >= 2 &&
                        !hasFilledPasswords &&
                        !identity.isConnecting
                    ) {
                        setNativeInputValue(passInputs[0], SANDBOX_PASSWORD);
                        setNativeInputValue(passInputs[1], SANDBOX_PASSWORD);
                        hasFilledPasswords = true;
                    }
                    const formEl = dialog.querySelector(
                        'form'
                    ) as HTMLElement | null;
                    if (formEl) {
                        formEl.setAttribute(
                            'data-tour-target',
                            'mod1-password-form'
                        );
                    }
                    const submitBtn = dialog.querySelector(
                        'button[type="submit"]'
                    ) as HTMLButtonElement | null;
                    if (submitBtn) {
                        submitBtn.setAttribute(
                            'data-tour-target',
                            'mod1-generate-seed-btn'
                        );
                    }
                    return;
                }
                if (stepIdx === 5 || stepIdx === 6 || stepIdx === 7) {
                    const viewSeedBtn = allDialogButtons.find((b) =>
                        (b.textContent || '')
                            .toUpperCase()
                            .includes('VIEW SEED')
                    );
                    if (viewSeedBtn) {
                        viewSeedBtn.click();
                    }
                    const wordSpans = Array.from(
                        dialog.querySelectorAll('span.select-all')
                    ) as HTMLElement[];
                    if (
                        wordSpans.length < 24 &&
                        !hasTriggeredSeedGen &&
                        !identity.isConnecting
                    ) {
                        const passInputs = Array.from(
                            dialog.querySelectorAll('input[type="password"]')
                        ) as HTMLInputElement[];
                        const submitBtn = dialog.querySelector(
                            'button[type="submit"]'
                        ) as HTMLButtonElement | null;
                        if (passInputs.length >= 2 && submitBtn) {
                            setNativeInputValue(passInputs[0], SANDBOX_PASSWORD);
                            setNativeInputValue(passInputs[1], SANDBOX_PASSWORD);
                            hasTriggeredSeedGen = true;
                            submitBtn.click();
                        }
                        return;
                    }
                    if (wordSpans.length >= 24) {
                        capturedSeedWords = wordSpans
                            .slice(0, 24)
                            .map((s) => (s.textContent || '').trim().toLowerCase());
                        const gridContainer = wordSpans[0].closest('div.grid');
                        if (gridContainer) {
                            gridContainer.setAttribute(
                                'data-tour-target',
                                'mod1-seed-grid'
                            );
                        }
                    }
                    const copySeedBtn = allDialogButtons.find((b) =>
                        (b.textContent || '')
                            .toUpperCase()
                            .includes('COPY 24 WORDS')
                    );
                    if (copySeedBtn && copySeedBtn.parentElement) {
                        copySeedBtn.parentElement.setAttribute(
                            'data-tour-target',
                            'mod1-backup-controls'
                        );
                    }
                    const proceedBtn = allDialogButtons.find((b) =>
                        (b.textContent || '')
                            .toUpperCase()
                            .includes('PROCEED TO 2-WORD TEST')
                    );
                    if (proceedBtn) {
                        proceedBtn.setAttribute(
                            'data-tour-target',
                            'mod1-proceed-verify-btn'
                        );
                    }
                    return;
                }
                if (stepIdx === 8) {
                    const wordSpans = Array.from(
                        dialog.querySelectorAll('span.select-all')
                    ) as HTMLElement[];
                    if (wordSpans.length >= 24) {
                        capturedSeedWords = wordSpans
                            .slice(0, 24)
                            .map((s) => (s.textContent || '').trim().toLowerCase());
                    }
                    const proceedBtn = allDialogButtons.find((b) =>
                        (b.textContent || '')
                            .toUpperCase()
                            .includes('PROCEED TO 2-WORD TEST')
                    );
                    if (proceedBtn) proceedBtn.click();
                    const label1 = dialog.querySelector(
                        'label[for="verifyWord1"]'
                    );
                    const label2 = dialog.querySelector(
                        'label[for="verifyWord2"]'
                    );
                    const input1 = dialog.querySelector(
                        '#verifyWord1'
                    ) as HTMLInputElement | null;
                    const input2 = dialog.querySelector(
                        '#verifyWord2'
                    ) as HTMLInputElement | null;
                    if (
                        label1 &&
                        input1 &&
                        label2 &&
                        input2 &&
                        !hasFilledVerifyWords
                    ) {
                        const idx1 =
                            parseInt(
                                (label1.textContent || '').replace(/\D/g, ''),
                                10
                            ) - 1;
                        const idx2 =
                            parseInt(
                                (label2.textContent || '').replace(/\D/g, ''),
                                10
                            ) - 1;
                        if (idx1 >= 0 && capturedSeedWords[idx1]) {
                            setNativeInputValue(input1, capturedSeedWords[idx1]);
                        }
                        if (idx2 >= 0 && capturedSeedWords[idx2]) {
                            setNativeInputValue(input2, capturedSeedWords[idx2]);
                        }
                        hasFilledVerifyWords = true;
                    }
                    const verifySubmitBtn = dialog.querySelector(
                        'button[type="submit"]'
                    ) as HTMLButtonElement | null;
                    if (verifySubmitBtn) {
                        verifySubmitBtn.setAttribute(
                            'data-tour-target',
                            'mod1-verify-submit-btn'
                        );
                    }
                    return;
                }
            }
            return;
        }

        if (chapter === 2) {
            if (ui.showWalletModal) ui.showWalletModal = false;
            if (!identity.isWalletConnected) ui.activateSandboxWalletSession();
            const workspace = document.querySelector(
                '[data-tour="dex-workspace"]'
            ) as HTMLElement | null;
            if (!workspace) return;
            const swapTabBtn = document.querySelector(
                '[data-testid="dex-mode-swap-btn"]'
            ) as HTMLButtonElement | null;
            const liquidityTabBtn = document.querySelector(
                '[data-testid="dex-mode-lp-btn"]'
            ) as HTMLButtonElement | null;
            const fiatTabBtn = document.querySelector(
                '[data-testid="dex-mode-fiat-btn"]'
            ) as HTMLButtonElement | null;
            if (swapTabBtn) {
                swapTabBtn.setAttribute(
                    'data-tour-target',
                    'mod2silo-swap-tab-btn'
                );
            }
            if (liquidityTabBtn) {
                liquidityTabBtn.setAttribute(
                    'data-tour-target',
                    'mod2silo-liquidity-tab-btn'
                );
            }
            if (stepIdx <= 4) {
                hasFilledSiloSwapQuote = false;
                hasFilledSiloStakeInput = false;
                sandboxSiloStakedAmount = 0;
                const onrampTabBtn = document.querySelector(
                    '[data-testid="fiat-onramp-tab-btn"]'
                ) as HTMLButtonElement | null;
                if (!onrampTabBtn && fiatTabBtn) {
                    fiatTabBtn.click();
                }
                if (stepIdx <= 3) {
                    hasFilledSampleAba = false;
                    const onrampUsdInput =
                        document.querySelector('#onrampUsdInput');
                    const activeOnrampTabBtn = document.querySelector(
                        '[data-testid="fiat-onramp-tab-btn"]'
                    ) as HTMLButtonElement | null;
                    if (!onrampUsdInput && activeOnrampTabBtn) {
                        activeOnrampTabBtn.click();
                    }
                    const step1Card = document.querySelector(
                        '[data-testid="fiat-step1-calculator-card"]'
                    ) as HTMLElement | null;
                    if (step1Card) {
                        step1Card.setAttribute(
                            'data-tour-target',
                            'mod2silo-fiat-onramp-panel'
                        );
                    }
                    const genOrderBtn = document.querySelector(
                        '[data-testid="fiat-generate-pass-cta"]'
                    ) as HTMLButtonElement | null;
                    if (genOrderBtn) {
                        genOrderBtn.setAttribute(
                            'data-tour-target',
                            'mod2silo-onramp-submit-btn'
                        );
                    }
                    if (stepIdx === 2) {
                        const passCard = document.querySelector(
                            '[data-testid="fiat-settlement-pass-card"]'
                        ) as HTMLElement | null;
                        if (!passCard && genOrderBtn) {
                            genOrderBtn.click();
                        }
                        if (passCard) {
                            passCard.setAttribute(
                                'data-tour-target',
                                'mod2silo-onramp-receipt-card'
                            );
                        }
                    }
                    return;
                }
                if (stepIdx === 4) {
                    const offrampTabBtn = document.querySelector(
                        '[data-testid="fiat-offramp-tab-btn"]'
                    ) as HTMLButtonElement | null;
                    let abaInput = document.querySelector(
                        '[data-testid="offramp-aba-input"]'
                    ) as HTMLInputElement | null;
                    if (!abaInput && offrampTabBtn) {
                        offrampTabBtn.click();
                        abaInput = document.querySelector(
                            '[data-testid="offramp-aba-input"]'
                        ) as HTMLInputElement | null;
                    }
                    if (abaInput) {
                        if (!hasFilledSampleAba) {
                            setNativeInputValue(abaInput, '111000614');
                            hasFilledSampleAba = true;
                        }
                        const bankVaultCard = abaInput.closest(
                            'div.bg-\\[\\#11161f\\]'
                        ) as HTMLElement | null;
                        if (bankVaultCard) {
                            bankVaultCard.setAttribute(
                                'data-tour-target',
                                'mod2silo-bank-rail-vault'
                            );
                        }
                    }
                    return;
                }
            }
            if (stepIdx === 5) {
                return;
            }
            if (stepIdx >= 6 && stepIdx <= 10) {
                const receiveSelector = document.querySelector(
                    '[data-testid="dex-receive-token-selector"]'
                ) as HTMLButtonElement | null;
                if (!receiveSelector && swapTabBtn) {
                    swapTabBtn.click();
                }
                if (stepIdx === 6) {
                    const closeBtn = document.querySelector(
                        'button[aria-label="Close"]'
                    ) as HTMLButtonElement | null;
                    if (closeBtn) closeBtn.click();
                    return;
                }
                if (stepIdx === 7) {
                    const modalSearch = document.querySelector(
                        '[data-testid="dex-token-modal-search"]'
                    );
                    const activeReceiveSelector = document.querySelector(
                        '[data-testid="dex-receive-token-selector"]'
                    ) as HTMLButtonElement | null;
                    if (!modalSearch && activeReceiveSelector) {
                        activeReceiveSelector.click();
                    }
                    return;
                }
                const modalSearch = document.querySelector(
                    '[data-testid="dex-token-modal-search"]'
                );
                if (modalSearch) {
                    const siloBtn = document.querySelector(
                        '[data-testid="dex-select-token-SILO"]'
                    ) as HTMLButtonElement | null;
                    if (siloBtn) {
                        siloBtn.click();
                    } else {
                        const closeBtn = document.querySelector(
                            'button[aria-label="Close"]'
                        ) as HTMLButtonElement | null;
                        if (closeBtn) closeBtn.click();
                    }
                }
                const payInput = document.querySelector(
                    '[data-testid="dex-pay-amount-input"]'
                ) as HTMLInputElement | null;
                if (payInput) {
                    const swapCard = payInput.closest('div.shadow-2xl, [class*="rounded-[28px]"], [class*="rounded-t-[28px]"]') as HTMLElement | null;
                    if (swapCard) {
                        swapCard.setAttribute(
                            'data-tour-target',
                            'mod2silo-swap-station-card'
                        );
                    }
                    if (!hasFilledSiloSwapQuote) {
                        setNativeInputValue(payInput, '1000');
                        hasFilledSiloSwapQuote = true;
                    }
                }
                if (stepIdx === 10) {
                    const execBtn = document.querySelector(
                        '[data-testid="dex-execute-swap-btn"]'
                    ) as HTMLButtonElement | null;
                    if (execBtn && !workspace.textContent?.includes('Execution Confirmed')) {
                        execBtn.click();
                    }
                }
                return;
            }
            if (stepIdx >= 11) {
                const siloVaultCard = document.querySelector(
                    '[data-testid="silo-staking-card"]'
                );
                if (!siloVaultCard && liquidityTabBtn) {
                    liquidityTabBtn.click();
                }
                const stakeInput = document.querySelector(
                    '[data-testid="silo-stake-amount-input"]'
                ) as HTMLInputElement | null;
                const stakeSubmitBtn = document.querySelector(
                    '[data-testid="silo-stake-submit-btn"]'
                ) as HTMLButtonElement | null;
                if (stepIdx === 11 && stakeInput && !hasFilledSiloStakeInput) {
                    setNativeInputValue(stakeInput, '15000');
                    hasFilledSiloStakeInput = true;
                }
                if (stepIdx === 12) {
                    const activeRow = document.querySelector(
                        '[data-testid="silo-position-row-tut-silo-pos-01"]'
                    );
                    if (!activeRow && stakeSubmitBtn && stakeInput) {
                        setNativeInputValue(stakeInput, '15000');
                        stakeSubmitBtn.click();
                    }
                }
            }
            return;
        }

        if (chapter === 3) {
            if (ui.showWalletModal) ui.showWalletModal = false;
            if (!identity.isWalletConnected) ui.activateSandboxWalletSession();
            if (operations.sectors.length > 0) operations.sectors = [];
            const panel = document.querySelector('[data-tour="workers-panel"]');
            if (!panel) return;
            const firstPanelCard = panel.querySelector(
                'div.tactile-card'
            ) as HTMLElement | null;
            if (firstPanelCard) {
                firstPanelCard.setAttribute(
                    'data-tour-target',
                    'mod2-master-pool-telemetry'
                );
            }
            const allPanelButtons = Array.from(
                panel.querySelectorAll('button')
            ) as HTMLButtonElement[];
            const addWorkerBtn = allPanelButtons.find((b) =>
                (b.textContent || '').toUpperCase().includes('+ ADD WORKER')
            );
            if (addWorkerBtn) {
                addWorkerBtn.setAttribute(
                    'data-tour-target',
                    'mod2-add-worker-btn'
                );
            }
            if (stepIdx === 0) {
                if (operations.workers.length > 0) operations.workers = [];
                return;
            }
            if (stepIdx >= 1 && stepIdx <= 6 && operations.workers.length === 0) {
                operations.workers = [
                    {
                        id: 'TUT-WK1',
                        type: 'physical',
                        name: 'RIG-NEW',
                        stratumUrl: 'stratum+tcp://pool.perennia.io:3332',
                        walletWorker: `${SANDBOX_WALLETS.kaspa.address}.RIG-NEW`,
                        hashRate: 0,
                        isOnline: false,
                        hardwareType: 'Select Miner Type',
                        sharesContributed: 0,
                        validShares: 0,
                        rejectedShares: 0,
                        acceptancePct: 100.0,
                        blocksFound: 0
                    }
                ];
            }
            if (stepIdx >= 7) {
                const closeBackdrop = document.querySelector(
                    'div[aria-label="Close menu"]'
                ) as HTMLElement | null;
                if (closeBackdrop) closeBackdrop.click();
                ui.simulateSandboxWorkerOnline();
            }
            const workerOptionBtns = Array.from(
                panel.querySelectorAll('button[aria-label="Worker Options"]')
            ) as HTMLButtonElement[];
            const targetOptionsBtn = workerOptionBtns[0] || null;
            if (targetOptionsBtn) {
                const workerCard = targetOptionsBtn.closest(
                    'div.tactile-card'
                ) as HTMLElement | null;
                if (workerCard) {
                    workerCard.setAttribute(
                        'data-tour-target',
                        'mod2-active-worker-card'
                    );
                    const telemetryGrid = workerCard.querySelector(
                        'div.grid.grid-cols-3'
                    ) as HTMLElement | null;
                    if (telemetryGrid) {
                        telemetryGrid.setAttribute(
                            'data-tour-target',
                            'mod2-worker-telemetry-row'
                        );
                    } else {
                        workerCard.setAttribute(
                            'data-tour-target',
                            'mod2-worker-telemetry-row'
                        );
                    }
                }
                targetOptionsBtn.setAttribute(
                    'data-tour-target',
                    'mod2-worker-options-btn'
                );
            }
            let menuEl = panel.querySelector('[role="menu"]') as HTMLElement | null;
            if ((stepIdx === 1 || stepIdx === 2) && menuEl) {
                const closeBackdrop = document.querySelector(
                    'div[aria-label="Close menu"]'
                ) as HTMLElement | null;
                if (closeBackdrop) closeBackdrop.click();
                menuEl = null;
            }
            if (stepIdx >= 3 && stepIdx <= 6 && !menuEl && targetOptionsBtn) {
                targetOptionsBtn.click();
                menuEl = panel.querySelector('[role="menu"]') as HTMLElement | null;
            }
            if (menuEl) {
                const menuButtons = Array.from(
                    menuEl.querySelectorAll('button')
                ) as HTMLButtonElement[];
                const renameBtn = menuButtons.find((b) =>
                    (b.textContent || '')
                        .toUpperCase()
                        .includes('RENAME WORKER')
                );
                if (renameBtn) {
                    renameBtn.setAttribute(
                        'data-tour-target',
                        'mod2-rename-worker-btn'
                    );
                }
                const minerTypeBtn = menuButtons.find((b) =>
                    (b.textContent || '')
                        .toUpperCase()
                        .includes('MINER TYPE (SELECT ASIC)')
                );
                if (minerTypeBtn) {
                    minerTypeBtn.setAttribute(
                        'data-tour-target',
                        'mod2-miner-type-btn'
                    );
                }
                if (stepIdx === 5) {
                    const searchInput = menuEl.querySelector(
                        'input[placeholder*="Search KS0"]'
                    ) as HTMLInputElement | null;
                    if (!searchInput && minerTypeBtn) {
                        minerTypeBtn.click();
                    }
                    const updatedMenuButtons = Array.from(
                        menuEl.querySelectorAll('button')
                    ) as HTMLButtonElement[];
                    const ks7LiteBtn =
                        updatedMenuButtons.find((b) =>
                            (b.textContent || '')
                                .toUpperCase()
                                .includes('ICERIVER KS7 LITE')
                        ) ||
                        updatedMenuButtons.find((b) =>
                            (b.textContent || '').toUpperCase().includes('PORT :')
                        );
                    if (ks7LiteBtn) {
                        ks7LiteBtn.setAttribute(
                            'data-tour-target',
                            'mod2-asic-model-choice'
                        );
                    }
                }
                const stratumCopyBtn = menuButtons.find(
                    (b) =>
                        (b.getAttribute('title') || '').includes('Stratum URL') ||
                        (b.textContent || '')
                            .toUpperCase()
                            .includes('STRATUM ADDRESS')
                );
                if (stratumCopyBtn) {
                    stratumCopyBtn.setAttribute(
                        'data-tour-target',
                        'mod2-copy-stratum-btn'
                    );
                }
            }
            return;
        }

        if (chapter === 4) {
            if (ui.showWalletModal) ui.showWalletModal = false;
            if (!identity.isWalletConnected) ui.activateSandboxWalletSession();
            if (!operations.workers || operations.workers.length === 0) {
                operations.workers = [
                    JSON.parse(JSON.stringify(SANDBOX_ONLINE_WORKER))
                ];
            }
            const workersPanel = document.querySelector(
                '[data-tour="workers-panel"]'
            );
            let breakOffBtn: HTMLButtonElement | null = null;
            if (workersPanel) {
                const btns = Array.from(
                    workersPanel.querySelectorAll('button')
                ) as HTMLButtonElement[];
                breakOffBtn =
                    btns.find((b) =>
                        (b.textContent || '')
                            .toUpperCase()
                            .includes('+ BREAK OFF SECTOR')
                    ) || null;
                if (breakOffBtn) {
                    breakOffBtn.setAttribute(
                        'data-tour-target',
                        'mod3-break-off-sector-btn'
                    );
                }
            }
            const closeDeployModal = () => {
                const deployNameInput = document.querySelector(
                    '#draftSectorNameInput'
                );
                if (deployNameInput) {
                    const modalRoot = deployNameInput.closest(
                        'div.relative.z-10'
                    );
                    if (modalRoot) {
                        const buttons = Array.from(
                            modalRoot.querySelectorAll('button')
                        );
                        const cancelBtn = buttons.find(
                            (b) =>
                                (b.textContent || '').trim().toUpperCase() ===
                                'CANCEL'
                        );
                        if (cancelBtn) (cancelBtn as HTMLButtonElement).click();
                    }
                }
            };
            const closeEditModal = () => {
                const cancelEditBtn = document.querySelector(
                    'button[aria-label="Cancel"]'
                ) as HTMLButtonElement | null;
                if (cancelEditBtn) cancelEditBtn.click();
            };
            if (stepIdx === 0) {
                closeDeployModal();
                closeEditModal();
                if (operations.sectors.length > 0) {
                    operations.sectors = [];
                }
                return;
            }
            const initBtn = document.querySelector(
                '[data-testid="initialize-sector-btn"]'
            ) as HTMLButtonElement | null;
            if (initBtn) initBtn.click();
            closeDeployModal();
            if (!operations.sectors || operations.sectors.length === 0) {
                operations.sectors = [
                    JSON.parse(JSON.stringify(SANDBOX_DEMO_SECTOR))
                ];
            } else if (
                !operations.sectors[0].pendingKaspa ||
                operations.sectors[0].pendingKaspa <= 0
            ) {
                operations.sectors = operations.sectors.map((s, idx) =>
                    idx === 0
                        ? { ...s, pendingKaspa: 48.25, allocationPercentage: 50.0 }
                        : s
                );
            }
            const silosSection = document.querySelector(
                '[data-testid="settlement-silos-section"]'
            );
            const siloCards = silosSection
                ? (Array.from(
                      silosSection.querySelectorAll(
                          '[data-testid^="sector-card-"]'
                      )
                  ) as HTMLElement[])
                : [];
            const targetSiloCard = siloCards[0] || null;
            let targetGearBtn: HTMLButtonElement | null = null;
            if (targetSiloCard) {
                targetSiloCard.setAttribute(
                    'data-tour-target',
                    'mod3-created-sector-card'
                );
                targetGearBtn = targetSiloCard.querySelector(
                    'button[title="Configure Parameters"]'
                ) as HTMLButtonElement | null;
                if (targetGearBtn) {
                    targetGearBtn.setAttribute(
                        'data-tour-target',
                        'mod3-sector-gear-btn'
                    );
                }
            }
            if (stepIdx === 1 || stepIdx === 2) {
                closeEditModal();
                return;
            }
            let editNameInput = document.querySelector(
                '#editSectorNameInput'
            ) as HTMLInputElement | null;
            if (!editNameInput && targetGearBtn) {
                targetGearBtn.click();
                editNameInput = document.querySelector(
                    '#editSectorNameInput'
                ) as HTMLInputElement | null;
            }
            if (editNameInput) {
                const idSection = editNameInput.closest(
                    'div.flex.flex-col'
                ) as HTMLElement | null;
                if (idSection) {
                    idSection.setAttribute(
                        'data-tour-target',
                        'mod3-config-identifier'
                    );
                }
                const routeBtn = document.querySelector(
                    'button[aria-label="Target Asset Route"]'
                ) as HTMLElement | null;
                if (routeBtn) {
                    routeBtn.setAttribute(
                        'data-tour-target',
                        'mod3-config-target-asset-btn'
                    );
                }
                const modalRoot = editNameInput.closest(
                    'div.relative.z-10'
                ) as HTMLElement | null;
                if (modalRoot) {
                    const modalBtns = Array.from(
                        modalRoot.querySelectorAll('button')
                    ) as HTMLButtonElement[];
                    const addSecondAssetBtn = modalBtns.find((b) =>
                        (b.textContent || '')
                            .toUpperCase()
                            .includes('ADD 2ND ASSET')
                    );
                    if (addSecondAssetBtn) {
                        addSecondAssetBtn.setAttribute(
                            'data-tour-target',
                            'mod3-config-add-second-asset-btn'
                        );
                    }
                    const reclaimBtn = modalBtns.find((b) =>
                        (b.textContent || '')
                            .toUpperCase()
                            .includes('RECLAIM TO KAS LEDGER')
                    );
                    if (reclaimBtn && reclaimBtn.parentElement) {
                        reclaimBtn.parentElement.setAttribute(
                            'data-tour-target',
                            'mod3-config-reclaim-box'
                        );
                    }
                }
                const destInput = document.querySelector(
                    '#destWallet'
                ) as HTMLElement | null;
                if (destInput && destInput.parentElement) {
                    destInput.setAttribute(
                        'data-tour-target',
                        'mod3-config-dest-wallet'
                    );
                }
            }
            return;
        }

        if (chapter === 5) {
            if (ui.showWalletModal) ui.showWalletModal = false;
            if (!identity.isWalletConnected) ui.activateSandboxWalletSession();
            const workspace = document.querySelector(
                '[data-tour="dex-workspace"]'
            );
            if (!workspace) return;
            const swapSubTabBtn = document.querySelector(
                '[data-testid="dex-mode-swap-btn"]'
            ) as HTMLButtonElement | null;
            const liquiditySubTabBtn = document.querySelector(
                '[data-testid="dex-mode-lp-btn"]'
            ) as HTMLButtonElement | null;
            const p2pSubTabBtn = document.querySelector(
                '[data-testid="dex-mode-p2p-btn"]'
            ) as HTMLButtonElement | null;

            if (liquiditySubTabBtn) {
                liquiditySubTabBtn.setAttribute(
                    'data-tour-target',
                    'mod4-liquidity-tab-btn'
                );
            }
            if (stepIdx <= 5) {
                const receiveSelector = document.querySelector(
                    '[data-testid="dex-receive-token-selector"]'
                ) as HTMLButtonElement | null;
                if (!receiveSelector && swapSubTabBtn) {
                    swapSubTabBtn.click();
                }
            }
            const payInput = document.querySelector(
                '[data-testid="dex-pay-amount-input"]'
            ) as HTMLInputElement | null;
            if (payInput) {
                const swapStationCard = payInput.closest('div.shadow-2xl, [class*="rounded-[28px]"], [class*="rounded-t-[28px]"]') as HTMLElement | null;
                if (swapStationCard) {
                    swapStationCard.setAttribute(
                        'data-tour-target',
                        'mod4-swap-station-card'
                    );
                }
            }
            if (stepIdx === 0 || stepIdx === 1) {
                hasFilledNvdaSwapQuote = false;
                const closeBtn = document.querySelector(
                    'button[aria-label="Close"]'
                ) as HTMLButtonElement | null;
                if (closeBtn) closeBtn.click();
                return;
            }
            if (stepIdx >= 2 && stepIdx <= 4) {
                let modalSearch = document.querySelector(
                    '[data-testid="dex-token-modal-search"]'
                ) as HTMLInputElement | null;
                if (!modalSearch) {
                    const receiveSelector = document.querySelector(
                        '[data-testid="dex-receive-token-selector"]'
                    ) as HTMLButtonElement | null;
                    if (receiveSelector) {
                        receiveSelector.click();
                        modalSearch = document.querySelector(
                            '[data-testid="dex-token-modal-search"]'
                        ) as HTMLInputElement | null;
                    }
                }
                if (modalSearch && modalSearch.parentElement) {
                    modalSearch.parentElement.setAttribute(
                        'data-tour-target',
                        'mod4-asset-modal-header'
                    );
                }
                if (stepIdx === 4) {
                    const nvdaBtn = document.querySelector(
                        '[data-testid="dex-select-token-NVDA"]'
                    );
                    if (!nvdaBtn) {
                        const equitiesCatBtn = document.querySelector(
                            '[data-testid="dex-modal-cat-EQUITIES"]'
                        ) as HTMLButtonElement | null;
                        if (equitiesCatBtn) equitiesCatBtn.click();
                    }
                }
                return;
            }
            if (stepIdx === 5) {
                const modalSearch = document.querySelector(
                    '[data-testid="dex-token-modal-search"]'
                );
                if (modalSearch) {
                    const nvdaBtn = document.querySelector(
                        '[data-testid="dex-select-token-NVDA"]'
                    ) as HTMLButtonElement | null;
                    if (nvdaBtn) nvdaBtn.click();
                    else {
                        const closeBtn = document.querySelector(
                            'button[aria-label="Close"]'
                        ) as HTMLButtonElement | null;
                        if (closeBtn) closeBtn.click();
                    }
                }
                if (payInput && !hasFilledNvdaSwapQuote) {
                    setNativeInputValue(payInput, '1000');
                    hasFilledNvdaSwapQuote = true;
                }
                const oracleRateEl = document.querySelector(
                    '[data-testid="dex-oracle-rate-readout"]'
                );
                if (oracleRateEl) {
                    const telemetryBox = oracleRateEl.closest(
                        'div.rounded-2xl'
                    ) as HTMLElement | null;
                    if (telemetryBox) {
                        telemetryBox.setAttribute(
                            'data-tour-target',
                            'mod4-swap-execution-panel'
                        );
                    }
                }
                return;
            }
            if (stepIdx === 7) {
                const lpCard = document.querySelector(
                    '[data-testid="dex-liquidity-plant-card"]'
                ) as HTMLElement | null;
                if (!lpCard && liquiditySubTabBtn) {
                    liquiditySubTabBtn.click();
                }
                const activeLpCard = document.querySelector(
                    '[data-testid="dex-liquidity-plant-card"]'
                ) as HTMLElement | null;
                if (activeLpCard) {
                    activeLpCard.setAttribute(
                        'data-tour-target',
                        'mod4-lp-provision-card'
                    );
                }
                return;
            }
            if (stepIdx === 9) {
                const p2pCard = document.querySelector(
                    '[data-testid="p2p-deploy-offer-card"]'
                ) as HTMLElement | null;
                if (!p2pCard && p2pSubTabBtn) {
                    p2pSubTabBtn.click();
                }
            }
            return;
        }

        if (chapter === 6) {
            if (ui.showWalletModal) ui.showWalletModal = false;
            if (!identity.isWalletConnected) ui.activateSandboxWalletSession();
            const vaultContainer = document.querySelector(
                '[data-tour="treasury-vault"]'
            );
            if (!vaultContainer) return;
            const allSpans = Array.from(vaultContainer.querySelectorAll('span'));
            const totalValueSpan = allSpans.find((s) =>
                (s.textContent || '')
                    .toUpperCase()
                    .includes('TOTAL VAULT VALUE')
            );
            if (totalValueSpan) {
                const summaryCard = totalValueSpan.closest(
                    'div.tactile-card'
                ) as HTMLElement | null;
                if (summaryCard) {
                    summaryCard.setAttribute(
                        'data-tour-target',
                        'mod5-vault-summary-card'
                    );
                }
            }
            const searchInput = document.querySelector(
                '[data-testid="treasury-token-search-input"]'
            ) as HTMLInputElement | null;
            if (searchInput) {
                const barCard = searchInput.closest(
                    'div.rounded-\\[24px\\]'
                ) as HTMLElement | null;
                if (barCard) {
                    barCard.setAttribute(
                        'data-tour-target',
                        'mod5-multichain-search-bar'
                    );
                } else {
                    searchInput.setAttribute(
                        'data-tour-target',
                        'mod5-multichain-search-bar'
                    );
                }
            }

            const coldVaultBtn = document.querySelector(
                '[data-testid="cold-vault-btn-KAS"]'
            ) as HTMLButtonElement | null;
            const coldVaultDrawer = document.querySelector(
                '[data-testid="cold-vault-drawer-KAS"]'
            ) as HTMLElement | null;

            if ((stepIdx === 0 || stepIdx === 1) && coldVaultDrawer && coldVaultBtn) {
                coldVaultBtn.click();
            }
            if (stepIdx >= 2 && stepIdx <= 4) {
                if (!coldVaultDrawer && coldVaultBtn) {
                    coldVaultBtn.click();
                }
                const activeColdDrawer = document.querySelector(
                    '[data-testid="cold-vault-drawer-KAS"]'
                ) as HTMLElement | null;
                if (activeColdDrawer) {
                    const leftPanel = activeColdDrawer.querySelector(
                        'div.lg\\:col-span-7'
                    ) as HTMLElement | null;
                    const rightPanel = activeColdDrawer.querySelector(
                        'div.lg\\:col-span-5'
                    ) as HTMLElement | null;
                    if (leftPanel) {
                        leftPanel.setAttribute(
                            'data-tour-target',
                            'mod5-airlock-left-panel'
                        );
                    }
                    if (rightPanel) {
                        rightPanel.setAttribute(
                            'data-tour-target',
                            'mod5-airlock-right-panel'
                        );
                    }
                }
            }
            if (stepIdx >= 5 && coldVaultDrawer && coldVaultBtn) {
                coldVaultBtn.click();
            }

            const kasRow = document.querySelector(
                '[data-testid="network-row-KAS"]'
            ) as HTMLElement | null;
            const withdrawBtn = document.querySelector(
                '[data-testid="withdraw-l1-btn-KAS"]'
            ) as HTMLButtonElement | null;
            const activityBtn = document.querySelector(
                '[data-testid="activity-btn-KAS"]'
            ) as HTMLButtonElement | null;
            if (stepIdx === 6 || stepIdx === 7) {
                const destInput = document.querySelector(
                    '[data-testid="l1-dest-input-KAS"]'
                );
                if (!destInput && withdrawBtn) {
                    withdrawBtn.click();
                }
            }
            if (stepIdx === 8) {
                const settledLink = kasRow?.querySelector(
                    '[data-testid="settled-payout-explorer-link"]'
                );
                if (!settledLink && activityBtn) {
                    activityBtn.click();
                }
            }
            if (kasRow) {
                const routingDrawer = kasRow.querySelector(
                    'div.rounded-\\[20px\\]'
                ) as HTMLElement | null;
                if (routingDrawer) {
                    routingDrawer.setAttribute(
                        'data-tour-target',
                        'mod5-kas-routing-drawer'
                    );
                }
            }
            return;
        }

        if (chapter === 7) {
            if (ui.showWalletModal) ui.showWalletModal = false;
            if (!identity.isWalletConnected) ui.activateSandboxWalletSession();
            if (!ui.taxEvents || ui.taxEvents.length === 0) {
                ui.taxEvents = JSON.parse(JSON.stringify(SANDBOX_TAX_EVENTS));
            }

            if (stepIdx <= 13 && settingsStore.showSettingsModal) {
                settingsStore.showSettingsModal = false;
            }
            if (stepIdx === 14) {
                if (!settingsStore.showSettingsModal) {
                    settingsStore.showSettingsModal = true;
                }
                return;
            }

            const viewContainer = document.querySelector(
                '[data-testid="tax-fortress-view"]'
            ) as HTMLElement | null;
            if (!viewContainer) return;
            const rateDisplay = viewContainer.querySelector(
                '[data-testid="effective-tax-rate-display"]'
            );
            if (rateDisplay) {
                const summaryGrid = rateDisplay.closest(
                    'div.grid'
                ) as HTMLElement | null;
                if (summaryGrid) {
                    summaryGrid.setAttribute(
                        'data-tour-target',
                        'mod6-summary-grid'
                    );
                }
            }
            const pdfBtn = viewContainer.querySelector(
                '[data-testid="generate-1099-pdf-btn"]'
            ) as HTMLElement | null;
            if (pdfBtn && pdfBtn.parentElement) {
                pdfBtn.parentElement.setAttribute(
                    'data-tour-target',
                    'mod6-export-buttons'
                );
            }
            const hifoLotsBtn = viewContainer.querySelector(
                '[data-testid="tax-mode-hifo-lots-btn"]'
            ) as HTMLButtonElement | null;
            const extBasisBtn = viewContainer.querySelector(
                '[data-testid="tax-tab-external-btn"]'
            ) as HTMLButtonElement | null;
            if (hifoLotsBtn) {
                const tableCard = hifoLotsBtn.closest('div.shadow-2xl, [class*="rounded-[28px]"], [class*="rounded-t-[28px]"]') as HTMLElement | null;
                if (tableCard) {
                    tableCard.setAttribute(
                        'data-tour-target',
                        'mod6-ledger-table-card'
                    );
                }
            }
            const configBtn = viewContainer.querySelector(
                '[data-testid="configure-jurisdiction-btn"]'
            ) as HTMLButtonElement | null;
            let configForm = viewContainer.querySelector(
                '[data-testid="jurisdiction-config-form"]'
            ) as HTMLElement | null;
            if ((stepIdx === 0 || stepIdx === 1) && configForm && configBtn) {
                configBtn.click();
                configForm = null;
            }
            if (stepIdx >= 2 && stepIdx <= 4) {
                if (!configForm && configBtn) {
                    configBtn.click();
                    configForm = viewContainer.querySelector(
                        '[data-testid="jurisdiction-config-form"]'
                    ) as HTMLElement | null;
                }
                if (configForm) {
                    const countrySelect = configForm.querySelector(
                        '[data-testid="tax-country-select"]'
                    );
                    if (countrySelect) {
                        const selectorGrid = countrySelect.closest(
                            'div.grid'
                        ) as HTMLElement | null;
                        if (selectorGrid) {
                            selectorGrid.setAttribute(
                                'data-tour-target',
                                'mod6-jurisdiction-selectors'
                            );
                        }
                    }
                    const legalNameInput = configForm.querySelector('#legalName');
                    if (legalNameInput) {
                        const piiGrid = legalNameInput.closest(
                            'div.grid'
                        ) as HTMLElement | null;
                        if (piiGrid) {
                            piiGrid.setAttribute(
                                'data-tour-target',
                                'mod6-local-pii-row'
                            );
                        }
                    }
                }
            }
            if (stepIdx >= 5 && configForm && configBtn) {
                configBtn.click();
            }
            const escrowConfirmBtn = document.querySelector(
                '[data-testid="confirm-tax-escrow-btn"]'
            ) as HTMLButtonElement | null;
            const escrowToggleBtn = viewContainer.querySelector(
                '[data-testid="toggle-tax-escrow-btn"]'
            ) as HTMLButtonElement | null;
            if (stepIdx === 6 || stepIdx === 7) {
                if (!escrowConfirmBtn && escrowToggleBtn) {
                    escrowToggleBtn.click();
                }
                const activeConfirmBtn = document.querySelector(
                    '[data-testid="confirm-tax-escrow-btn"]'
                ) as HTMLElement | null;
                if (activeConfirmBtn) {
                    const modalCard = activeConfirmBtn.closest('div.shadow-2xl, [class*="rounded-[28px]"], [class*="rounded-t-[28px]"]') as HTMLElement | null;
                    if (modalCard) {
                        modalCard.setAttribute(
                            'data-tour-target',
                            'mod6-escrow-modal-card'
                        );
                    }
                }
            }
            if (stepIdx >= 8 && escrowConfirmBtn) {
                escrowConfirmBtn.click();
            }
            if (stepIdx === 9 && hifoLotsBtn) {
                if (!viewContainer.textContent?.includes('HIFO-LOT-')) {
                    hifoLotsBtn.click();
                }
            }
            if (stepIdx === 11 && extBasisBtn) {
                const extCard = viewContainer.querySelector(
                    '[data-testid="external-cost-basis-card"]'
                );
                if (!extCard) {
                    extBasisBtn.click();
                }
            }
        }
    }

    function resolveTargetElement(): HTMLElement | null {
        if (!browser || !ui.isTutorialActive || !currentSpec) return null;
        synchronizeActiveChapterDom(
            activeChapterNum,
            Number(ui.tutorialSubStep || 0)
        );
        const primaryList = document.querySelectorAll(currentSpec.targetSelector);
        for (const node of Array.from(primaryList)) {
            const el = node as HTMLElement;
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                return el;
            }
        }
        if (currentSpec.fallbackSelector) {
            const fallbackList = document.querySelectorAll(
                currentSpec.fallbackSelector
            );
            for (const node of Array.from(fallbackList)) {
                const el = node as HTMLElement;
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    return el;
                }
            }
        }
        return null;
    }

    let mobileHudAtTop = $state(false);
let showMobileDetails = $state(false);
let lastSyncedStepId = $state('');
let desktopCornerClass = $state('bottom-6 right-6');
function findScrollParent(node: HTMLElement | null): HTMLElement | null {
  let cur = node?.parentElement || null;
  while (cur && cur !== document.body) { const st = window.getComputedStyle(cur); if ((st.overflowY === 'auto' || st.overflowY === 'scroll') && cur.scrollHeight > cur.clientHeight + 4) return cur; cur = cur.parentElement; }
  return (document.scrollingElement as HTMLElement) || null;
}
function getOpenModalRect(): DOMRect | null {
  if (!browser) return null;
  for (const sel of ['[role="dialog"]', '[data-testid="settings-modal-card"]', '#editSectorNameInput', '#draftSectorNameInput', '[data-testid="dex-token-modal-search"]', '[data-testid="confirm-tax-escrow-btn"]']) {
    const m = document.querySelector(sel) as HTMLElement | null;
    if (m) { const box = (m.closest('[role="dialog"], .shadow-2xl') as HTMLElement || m).getBoundingClientRect(); if (box.height > 30 && box.width > 30) return box; }
  }
  return null;
}
function rectOverlapArea(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): number {
  const ox = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
  const oy = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
  return ox * oy;
}
function updateSpotlightRect(shouldScroll = false) {
  if (!browser || !ui.isTutorialActive || !currentSpec) { spotlightRect = null; return; }
  viewportW = window.innerWidth; viewportH = window.innerHeight;
  if (currentSpec.id !== lastSyncedStepId) { lastSyncedStepId = currentSpec.id; showMobileDetails = false; }
  const el = resolveTargetElement();
  if (!el) { spotlightRect = null; return; }
  const modalRect = getOpenModalRect();
  const isMobile = viewportW < 1024;
  if (isMobile) {
    if (modalRect) { mobileHudAtTop = true; }
    else {
      if (shouldScroll) {
        const sp = findScrollParent(el), r0 = el.getBoundingClientRect(), bandTop = 68, bandBot = viewportH - 195;
        if (sp && (r0.top < bandTop || r0.bottom > bandBot)) { sp.scrollTop += (r0.top + r0.height / 2) - (bandTop + (bandBot - bandTop) * 0.45); }
      }
      const r1 = el.getBoundingClientRect();
      mobileHudAtTop = r1.bottom > viewportH - 185 && r1.top > 180;
    }
  } else if (shouldScroll) {
    const sp = findScrollParent(el), r0 = el.getBoundingClientRect();
    if (sp && (r0.top < 84 || r0.bottom > viewportH - 60)) { sp.scrollTop += (r0.top + r0.height / 2) - viewportH * 0.46; }
  }
  const rect = el.getBoundingClientRect(), pad = isActionStep ? 6 : 8;
  const top = Math.max(4, rect.top - pad), left = Math.max(4, rect.left - pad);
  const width = Math.max(24, Math.min(viewportW - left - 4, rect.width + pad * 2));
  const height = Math.max(24, Math.min(viewportH - top - 4, rect.height + pad * 2));
  spotlightRect = { top, left, width, height };
  if (!isMobile) {
    const cw = 420, ch = 330, cands = [
      { cls: 'bottom-6 right-6', x: viewportW - cw - 24, y: viewportH - ch - 24 },
      { cls: 'bottom-6 left-6', x: 24, y: viewportH - ch - 24 },
      { cls: 'top-24 right-6', x: viewportW - cw - 24, y: 96 },
      { cls: 'top-24 left-6', x: 24, y: 96 }
    ];
    let best = cands[0], bestScore = Infinity;
    for (const c of cands) {
      let sc = rectOverlapArea(c.x, c.y, cw, ch, left - 16, top - 16, width + 32, height + 32);
      if (modalRect) sc += rectOverlapArea(c.x, c.y, cw, ch, modalRect.left - 12, modalRect.top - 12, modalRect.width + 24, modalRect.height + 24) * 0.5;
      if (sc < bestScore) { bestScore = sc; best = c; }
    }
    desktopCornerClass = best.cls;
  }
}
let resolvedChevronPlacement = $derived.by((): ChevronPlacement => {
  if (currentSpec?.chevronPlacement) return currentSpec.chevronPlacement;
  if (!spotlightRect) return 'top';
  if (spotlightRect.top > 60) return 'top';
  if (spotlightRect.top + spotlightRect.height < viewportH - 60) return 'bottom';
  return spotlightRect.left > 60 ? 'left' : 'right';
});
$effect(() => {
  if (browser) document.body.classList.toggle('tutorial-active', Boolean(ui.isTutorialActive));
  if (browser && ui.isTutorialActive && currentSpec) { const t = setTimeout(() => updateSpotlightRect(true), 50); return () => clearTimeout(t); }
  else if (!ui.isTutorialActive) { spotlightRect = null; hasResetWalletModalToMenu = false; settingsStore.showSettingsModal = false; restoreStashedVaultAfterTutorial(); restoreUnifiedSandboxInterceptors(); clearAllTourAttributes(); }
});
function handleViewportChange() { if (!ui.isTutorialActive) return; if (rafId !== null) cancelAnimationFrame(rafId); rafId = requestAnimationFrame(() => updateSpotlightRect(false)); }
function handleGlobalCaptureClick(e: MouseEvent) {
  if (!browser || !ui.isTutorialActive || !currentSpec || currentSpec.mode !== 'ACTION') return;
  const clickedNode = e.target as HTMLElement | null;
  if (!clickedNode || clickedNode.closest('[data-testid="tutorial-floating-card"]')) return;
  const targetEl = resolveTargetElement();
  const hitDom = Boolean(targetEl && (targetEl === clickedNode || targetEl.contains(clickedNode)));
  const hitBox = Boolean(spotlightRect && e.clientX >= spotlightRect.left - 4 && e.clientX <= spotlightRect.left + spotlightRect.width + 4 && e.clientY >= spotlightRect.top - 4 && e.clientY <= spotlightRect.top + spotlightRect.height + 4);
  if (hitDom || hitBox) {
    const stepIdAtClick = currentSpec.id, totalStepsAtClick = currentSpec.totalChapterSteps, delayMs = currentSpec.advanceDelayMs ?? 240;
    if (stepIdAtClick === 'settlement_step0_click_break_off') setTimeout(() => (document.querySelector('[data-testid="initialize-sector-btn"]') as HTMLButtonElement | null)?.click(), 30);
    if (advanceTimeout) clearTimeout(advanceTimeout);
    advanceTimeout = setTimeout(() => { if (ui.isTutorialActive && ui.activeTourStepSpec?.id === stepIdAtClick) ui.advanceTutorialSubStep(totalStepsAtClick); }, delayMs);
  }
}
onMount(() => {
  if (!browser) return;
  ui.bindSandboxStores({ identity, operations, treasury }); viewportW = window.innerWidth; viewportH = window.innerHeight;
  window.addEventListener('resize', handleViewportChange, { passive: true });
  window.addEventListener('scroll', handleViewportChange, { passive: true, capture: true });
  window.addEventListener('click', handleGlobalCaptureClick, true);
  pollTimer = setInterval(() => { if (ui.isTutorialActive) { synchronizeActiveChapterDom(activeChapterNum, Number(ui.tutorialSubStep || 0)); updateSpotlightRect(false); } }, 180);
});
onDestroy(() => {
  if (!browser) return;
  document.body.classList.remove('tutorial-active');
  window.removeEventListener('resize', handleViewportChange); window.removeEventListener('scroll', handleViewportChange, true); window.removeEventListener('click', handleGlobalCaptureClick, true);
  if (rafId !== null) cancelAnimationFrame(rafId); if (pollTimer) clearInterval(pollTimer); if (advanceTimeout) clearTimeout(advanceTimeout);
  settingsStore.showSettingsModal = false; restoreStashedVaultAfterTutorial(); restoreUnifiedSandboxInterceptors(); clearAllTourAttributes();
});
function handleLaunchChapter(ch: number) { hasResetWalletModalToMenu = false; settingsStore.showSettingsModal = false; ui.bindSandboxStores({ identity, operations, treasury }); ui.startTutorial(ch); }
function handleJumpChapter(ch: number) { hasResetWalletModalToMenu = false; settingsStore.showSettingsModal = false; ui.bindSandboxStores({ identity, operations, treasury }); ui.startChapter(ch, 0); }
function handleContinueStep() { if (currentSpec) ui.advanceTutorialSubStep(currentSpec.totalChapterSteps); }
function handleBackStep() { ui.prevTutorialSubStep(); }
</script>
{#if ui.showTutorialPrompt}
<div data-testid="tutorial-launch-modal" class="fixed inset-0 z-[10010] flex items-end sm:items-center justify-center p-2.5 sm:p-4 bg-[#06080b]/55 backdrop-blur-[2px] font-mono" transition:fade={{ duration: 150 }}>
  <div class="w-full max-w-[500px] bg-[#0a0d12]/96 border border-[#18C6A5]/40 rounded-[24px] p-4 sm:p-6 shadow-[0_24px_70px_rgba(0,0,0,0.92)] flex flex-col gap-3 max-h-[82dvh] overflow-y-auto" style="background-image: radial-gradient(ellipse at top left, rgba(24,198,165,0.15), transparent 65%);" transition:fly={{ y: 12, duration: 180 }}>
    <div class="flex items-center justify-between border-b border-white/10 pb-2.5"><div class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-[#18C6A5] animate-pulse"></span><span class="text-[10px] font-black uppercase tracking-[0.18em] text-[#18C6A5]">Interactive Visual Tour</span></div><button type="button" onclick={() => ui.dismissTutorialPrompt()} class="text-neutral-400 hover:text-white text-xs px-2 py-1">&#x2715;</button></div>
    <p class="text-[11px] text-neutral-300 leading-snug">Tap any station below for a live spotlight walkthrough, or start the full guided tour.</p>
    <div class="grid grid-cols-2 gap-1.5">{#each CHAPTERS as chap (chap.chapter)}<button type="button" data-testid="launch-tutorial-chapter-{chap.chapter}" onclick={() => handleLaunchChapter(chap.chapter)} class="tactile-btn p-2.5 rounded-xl text-left flex items-center gap-2 border border-white/10 hover:border-[#18C6A5]/45"><span class="w-6 h-6 rounded-lg bg-[#070b0e] border flex items-center justify-center text-[9px] font-black shrink-0" style="color:{chap.accentHex};border-color:{chap.accentHex}45;">0{chap.chapter}</span><span class="text-[10px] font-black uppercase text-white truncate">{chap.shortName}</span></button>{/each}</div>
    <div class="flex gap-2 pt-1"><button type="button" onclick={() => ui.dismissTutorialPrompt()} class="tactile-btn flex-1 py-3 rounded-xl text-neutral-400 hover:text-white text-[10px] font-bold uppercase">Skip</button><button type="button" data-testid="start-full-tutorial-btn" onclick={() => handleLaunchChapter(1)} class="tactile-btn flex-[1.6] py-3 rounded-xl text-[#18C6A5] border-[#18C6A5]/50 text-[10px] font-black uppercase" style="background-image: radial-gradient(ellipse at center, rgba(24,198,165,0.2), transparent 70%);">Start Visual Tour &rarr;</button></div>
  </div></div>{/if}
{#if ui.isTutorialActive && currentSpec}
{#if spotlightRect}
<div data-testid="tutorial-spotlight-cutout" class="fixed z-[10015] pointer-events-none rounded-[18px] transition-all duration-200 ease-out {isActionStep ? 'tactical-cutout-pulse' : ''}" style="top:{spotlightRect.top}px;left:{spotlightRect.left}px;width:{spotlightRect.width}px;height:{spotlightRect.height}px;--cutout-accent:{currentSpec.accentHex};border:2px solid {currentSpec.accentHex};box-shadow:0 0 0 9999px rgba(6,8,11,0.52),0 0 28px 2px {currentSpec.accentHex}45,inset 0 0 16px {currentSpec.accentHex}18;">
  <div class="absolute -top-[2px] -left-[2px] w-3.5 h-3.5 border-t-2 border-l-2 rounded-tl-[5px]" style="border-color:{currentSpec.accentHex};"></div><div class="absolute -top-[2px] -right-[2px] w-3.5 h-3.5 border-t-2 border-r-2 rounded-tr-[5px]" style="border-color:{currentSpec.accentHex};"></div><div class="absolute -bottom-[2px] -left-[2px] w-3.5 h-3.5 border-b-2 border-l-2 rounded-bl-[5px]" style="border-color:{currentSpec.accentHex};"></div><div class="absolute -bottom-[2px] -right-[2px] w-3.5 h-3.5 border-b-2 border-r-2 rounded-br-[5px]" style="border-color:{currentSpec.accentHex};"></div>
  {#if isActionStep}<div data-testid="tutorial-tactical-chevron" class="absolute {resolvedChevronPlacement === 'bottom' ? '-bottom-6 left-1/2 -translate-x-1/2' : '-top-6 left-1/2 -translate-x-1/2'} px-2 py-0.5 rounded-full bg-[#070b0e] border text-[8px] font-mono font-black uppercase whitespace-nowrap shadow-lg" style="border-color:{currentSpec.accentHex};color:{currentSpec.accentHex};">{currentSpec.actionHint || 'Tap Here'}</div>{/if}
</div>
{/if}
<div data-testid="tutorial-floating-card" class="fixed z-[10025] font-mono pointer-events-auto transition-all duration-200 {viewportW < 1024 ? (mobileHudAtTop ? 'top-[calc(0.4rem+env(safe-area-inset-top,0px))] inset-x-2.5' : 'bottom-[calc(0.5rem+env(safe-area-inset-bottom,0px))] inset-x-2.5') : `${desktopCornerClass} w-[420px]`}">
  <div class="bg-[#0a0d12]/96 backdrop-blur-xl border rounded-2xl lg:rounded-[24px] p-3 lg:p-5 shadow-[0_20px_60px_rgba(0,0,0,0.92)] flex flex-col gap-2 lg:gap-3" style="border-color:{currentSpec.accentHex}65;background-image:radial-gradient(ellipse at top right,{currentSpec.accentHex}1c,transparent 65%);">
    <div class="flex items-center justify-between gap-1.5"><div class="flex items-center gap-1 overflow-x-auto hide-scrollbar">{#each CHAPTERS as chap (chap.chapter)}<button type="button" onclick={() => handleJumpChapter(chap.chapter)} class="px-2 py-1 rounded-lg border text-[8px] font-bold uppercase shrink-0 {activeChapterNum === chap.chapter ? 'bg-[#161d29] text-white' : activeChapterNum > chap.chapter ? 'bg-[#11161f] text-[#18C6A5]' : 'bg-[#11161f]/60 text-neutral-500'}" style="border-color:{activeChapterNum === chap.chapter ? currentSpec.accentHex : 'rgba(255,255,255,0.08)'};">{chap.shortName}</button>{/each}</div><button type="button" data-testid="tutorial-exit-btn" onclick={() => { settingsStore.showSettingsModal = false; ui.completeTutorial(); }} class="text-[9px] font-black uppercase text-neutral-300 hover:text-white px-2 py-1 rounded-lg bg-[#11161f] border border-white/10 shrink-0">&#x2715;</button></div>
    <div class="flex items-center gap-1">{#each Array.from({ length: currentSpec.totalChapterSteps }) as _, idx}<div class="h-1 flex-1 rounded-full" style="background-color:{idx <= currentSpec.stepIndex ? currentSpec.accentHex : 'rgba(255,255,255,0.1)'};"></div>{/each}</div>
    <div class="flex flex-col gap-1"><div class="flex items-center justify-between gap-2"><h3 class="text-xs lg:text-sm font-black uppercase tracking-wider text-white truncate">{currentSpec.title}</h3><span class="text-[9px] font-bold shrink-0" style="color:{currentSpec.accentHex};">{currentSpec.stepIndex + 1}/{currentSpec.totalChapterSteps}</span></div><p class="text-[10px] lg:text-[11px] text-neutral-300 leading-snug {viewportW < 1024 && !showMobileDetails ? 'line-clamp-2' : ''}">{currentSpec.description}</p></div>
    {#if viewportW >= 1024 || showMobileDetails}<div class="bg-[#11161f] border border-white/10 rounded-xl p-2.5 lg:p-3 flex flex-col gap-1 max-h-[120px] lg:max-h-none overflow-y-auto">{#each currentSpec.bullets as bullet, idx}<div class="flex items-start gap-2 text-[9.5px] lg:text-[10px] text-neutral-300 leading-snug"><span class="font-black shrink-0" style="color:{currentSpec.accentHex};">0{idx + 1}.</span><span>{bullet}</span></div>{/each}</div>{/if}
    <div class="flex items-center justify-between gap-2 pt-0.5"><div class="flex items-center gap-1.5"><button type="button" data-testid="tutorial-back-btn" onclick={handleBackStep} disabled={activeChapterNum === 1 && Number(ui.tutorialSubStep || 0) === 0} class="tactile-btn px-2.5 lg:px-3.5 py-1.5 lg:py-2 rounded-xl text-[9px] lg:text-[10px] font-bold uppercase text-neutral-300 disabled:opacity-30">&larr;</button>{#if viewportW < 1024}<button type="button" onclick={() => (showMobileDetails = !showMobileDetails)} class="px-2 py-1.5 rounded-xl bg-[#11161f] border border-white/10 text-[8px] font-bold uppercase text-neutral-400">{showMobileDetails ? 'Less' : 'Tips'}</button>{/if}</div>
    {#if isActionStep}<div class="flex items-center gap-1.5 ml-auto"><span class="px-2.5 py-1.5 rounded-xl bg-[#11161f] border text-[8.5px] lg:text-[9px] font-black uppercase flex items-center gap-1.5" style="border-color:{currentSpec.accentHex}55;color:{currentSpec.accentHex};"><span class="w-1.5 h-1.5 rounded-full animate-ping" style="background-color:{currentSpec.accentHex};"></span><span class="truncate max-w-[140px] sm:max-w-none">{currentSpec.actionHint || 'Tap Highlighted'}</span></span><button type="button" data-testid="tutorial-skip-action-btn" onclick={handleContinueStep} class="tactile-btn px-2.5 py-1.5 lg:py-2 rounded-xl text-[9px] font-bold uppercase text-neutral-300">Next &rarr;</button></div>{:else}<button type="button" data-testid="tutorial-continue-btn" onclick={handleContinueStep} class="tactile-btn px-4 py-1.5 lg:py-2 rounded-xl text-[9.5px] lg:text-[10px] font-black uppercase text-white ml-auto" style="border-color:{currentSpec.accentHex}60;background-image:radial-gradient(ellipse at center,{currentSpec.accentHex}28,transparent 70%);">{activeChapterNum === 7 && currentSpec.stepIndex + 1 >= currentSpec.totalChapterSteps ? 'Finish ✓' : 'Next →'}</button>{/if}</div>
  </div></div>{/if}
<style>@keyframes tactical-perimeter-pulse { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.25); } } .tactical-cutout-pulse { animation: tactical-perimeter-pulse 1.8s ease-in-out infinite; }</style>
