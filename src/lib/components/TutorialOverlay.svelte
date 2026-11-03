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
            title: 'Fiat On-Ramp, Buy SILO & Fee Shield',
            subtitle: 'Fund with USD via Wire/ACH or Card, purchase SILO tokens, and stake for 0.75%–0.25% fees',
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
            title: 'The Exchange (24/7 Wall St. & Crypto)',
            subtitle: 'Search crypto & Wall Street pairs, inspect swap quotes, and provide 50%-KAS LP',
            tab: 'DEX',
            accentHex: '#F59E0B'
        },
        {
            chapter: 6,
            shortName: 'Treasury',
            title: 'Multi-Chain Treasury & Cold Airlock',
            subtitle: 'Inspect balances, configure the Cold Vault Airlock, and view L1 payouts',
            tab: 'TREASURY',
            accentHex: '#3B82F6'
        },
        {
            chapter: 7,
            shortName: 'Tax',
            title: 'Zero-PII Tax Fortress, Settings & Guide',
            subtitle: 'Configure your jurisdiction, choose USDC or Auto-LP tax escrow, and explore System Settings',
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
                                    fiatAmountUsd: 250.0,
                                    feeUsd: 1.88,
                                    netUsdConverted: 248.12,
                                    spotPrice: 0.165,
                                    estimatedKas: 1503.78,
                                    paymentRail: 'SOVEREIGN_WIRE_ACH',
                                    settlementTarget: 'LEDGER_KAS',
                                    wireMemo: 'PER-ONRAMP-SILO01',
                                    wireInstructions: {
                                        beneficiaryName:
                                            'Perennia Holdings, LLC — Sovereign Treasury',
                                        bankName:
                                            'Mercury / Column N.A. Commercial Vault',
                                        routingNumber: '021000021',
                                        accountNumber: '8804921044',
                                        accountType: 'COMMERCIAL CHECKING',
                                        wireMemo: 'PER-ONRAMP-SILO01',
                                        settlementTarget: 'LEDGER_KAS'
                                    },
                                    status: 'AWAITING_WIRE_RECEIPT',
                                    nonKycTier: 'SOVEREIGN_WIRE_ACH',
                                    widgetUrl: 'https://global.transak.com/'
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
                                unified_rate: 23.809524,
                                estimated_output: 3928.5714,
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
                                                          stakeId:
                                                              'tut-silo-pos-01',
                                                          ticker: 'SILO',
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
                        if (bodyObj.action === 'GET_COLD_VAULT_AIRLOCK') {
                            return new Response(
                                JSON.stringify({
                                    success: true,
                                    data: {
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
                                            lpId: 'TUT-LP-365',
                                            poolPair: 'KAS/NVDA/USDC',
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
                const unlockBtn = headerBtns.find((b) =>
                    (b.textContent || '')
                        .replace(/\s+/g, ' ')
                        .trim()
                        .toUpperCase()
                        .includes('UNLOCK VAULT')
                );
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
            const workspaceButtons = Array.from(
                workspace.querySelectorAll('button')
            ) as HTMLButtonElement[];
            const swapTabBtn = workspaceButtons.find(
                (b) => (b.textContent || '').trim().toUpperCase() === 'SWAP'
            );
            const liquidityTabBtn = workspaceButtons.find(
                (b) =>
                    (b.textContent || '').trim().toUpperCase() === 'LIQUIDITY'
            );
            const fiatTabBtn = workspaceButtons.find(
                (b) => (b.textContent || '').trim().toUpperCase() === 'FIAT'
            );
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
                    const currentOnrampInput =
                        document.querySelector('#onrampUsdInput');
                    if (currentOnrampInput) {
                        const onrampPanel = currentOnrampInput.closest(
                            'div.bg-\\[\\#11161f\\]'
                        ) as HTMLElement | null;
                        if (onrampPanel) {
                            onrampPanel.setAttribute(
                                'data-tour-target',
                                'mod2silo-fiat-onramp-panel'
                            );
                        }
                    }
                    const allFiatBtns = Array.from(
                        workspace.querySelectorAll('button')
                    ) as HTMLButtonElement[];
                    const genOrderBtn = allFiatBtns.find(
                        (b) =>
                            (b.textContent || '')
                                .toUpperCase()
                                .includes('GENERATE SOVEREIGN WIRE') ||
                            (b.textContent || '')
                                .toUpperCase()
                                .includes('INITIALIZE INSTANT CARD')
                    );
                    if (genOrderBtn) {
                        genOrderBtn.setAttribute(
                            'data-tour-target',
                            'mod2silo-onramp-submit-btn'
                        );
                    }
                    if (stepIdx === 2) {
                        const downloadSlipBtn = allFiatBtns.find((b) =>
                            (b.textContent || '')
                                .toUpperCase()
                                .includes('DOWNLOAD WIRE SLIP PDF')
                        );
                        if (!downloadSlipBtn && genOrderBtn) {
                            genOrderBtn.click();
                        }
                        if (downloadSlipBtn) {
                            const receiptCard = downloadSlipBtn.closest(
                                'div.bg-\\[\\#11161f\\]'
                            ) as HTMLElement | null;
                            if (receiptCard) {
                                receiptCard.setAttribute(
                                    'data-tour-target',
                                    'mod2silo-onramp-receipt-card'
                                );
                            }
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
                    const swapCard = payInput.closest(
                        'div.rounded-\\[28px\\]'
                    ) as HTMLElement | null;
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
                    '[data-testid="silo-staking-vault-card"]'
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
                        '[data-testid="silo-stake-row-tut-silo-pos-01"]'
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
            const workspaceButtons = Array.from(
                workspace.querySelectorAll('button')
            ) as HTMLButtonElement[];
            const swapSubTabBtn = workspaceButtons.find(
                (b) => (b.textContent || '').trim().toUpperCase() === 'SWAP'
            );
            const liquiditySubTabBtn = workspaceButtons.find(
                (b) => (b.textContent || '').trim().toUpperCase() === 'LIQUIDITY'
            );
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
                const swapStationCard = payInput.closest(
                    'div.rounded-\\[28px\\]'
                ) as HTMLElement | null;
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
                const lpKasInput = document.querySelector(
                    '[data-testid="dex-lp-kas-amount-input"]'
                );
                if (!lpKasInput && liquiditySubTabBtn) {
                    liquiditySubTabBtn.click();
                }
                const activeLpInput = document.querySelector(
                    '[data-testid="dex-lp-kas-amount-input"]'
                );
                if (activeLpInput) {
                    const lpCard = activeLpInput.closest(
                        'div.lg\\:col-span-6'
                    ) as HTMLElement | null;
                    if (lpCard) {
                        lpCard.setAttribute(
                            'data-tour-target',
                            'mod4-lp-provision-card'
                        );
                    }
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
            const airlockCard = document.querySelector(
                '[data-testid="cold-vault-airlock-card"]'
            ) as HTMLElement | null;
            const toggleAirlockBtn = document.querySelector(
                '[data-testid="toggle-cold-vault-airlock-btn"]'
            ) as HTMLButtonElement | null;
            const airlockAddrInput = document.querySelector(
                '[data-testid="cold-vault-address-input"]'
            );
            if (
                (stepIdx === 0 || stepIdx === 1) &&
                airlockAddrInput &&
                toggleAirlockBtn
            ) {
                toggleAirlockBtn.click();
            }
            if (stepIdx >= 2 && stepIdx <= 4) {
                if (!airlockAddrInput && toggleAirlockBtn) {
                    toggleAirlockBtn.click();
                }
                if (airlockCard) {
                    const leftPanel = airlockCard.querySelector(
                        'div.lg\\:col-span-7'
                    ) as HTMLElement | null;
                    const rightPanel = airlockCard.querySelector(
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
            if (stepIdx >= 5 && airlockAddrInput && toggleAirlockBtn) {
                toggleAirlockBtn.click();
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

            if (stepIdx <= 11 && settingsStore.showSettingsModal) {
                settingsStore.showSettingsModal = false;
            }
            if (stepIdx === 12) {
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
            if (hifoLotsBtn) {
                const tableCard = hifoLotsBtn.closest(
                    'div.rounded-\\[28px\\]'
                ) as HTMLElement | null;
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
                    const modalCard = activeConfirmBtn.closest(
                        'div.rounded-\\[28px\\]'
                    ) as HTMLElement | null;
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

    function updateSpotlightRect(shouldScroll = false) {
        if (!browser || !ui.isTutorialActive || !currentSpec) {
            spotlightRect = null;
            return;
        }
        viewportW = window.innerWidth;
        viewportH = window.innerHeight;
        const el = resolveTargetElement();
        if (!el) {
            spotlightRect = null;
            return;
        }
        if (shouldScroll) {
            const rawRect = el.getBoundingClientRect();
            const outOfBounds =
                rawRect.top < 70 ||
                rawRect.bottom > window.innerHeight - 70 ||
                rawRect.left < 0 ||
                rawRect.right > window.innerWidth;
            if (outOfBounds) {
                el.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });
            }
        }
        const rect = el.getBoundingClientRect();
        const pad = isActionStep ? 6 : 8;
        const top = Math.max(4, rect.top - pad);
        const left = Math.max(4, rect.left - pad);
        const width = Math.min(window.innerWidth - left - 4, rect.width + pad * 2);
        const height = Math.min(window.innerHeight - top - 4, rect.height + pad * 2);
        spotlightRect = {
            top,
            left,
            width: Math.max(24, width),
            height: Math.max(24, height)
        };
    }

    let resolvedChevronPlacement = $derived.by((): ChevronPlacement => {
        if (currentSpec?.chevronPlacement) {
            return currentSpec.chevronPlacement;
        }
        if (!spotlightRect) return 'top';
        if (spotlightRect.top > 60) return 'top';
        if (spotlightRect.top + spotlightRect.height < viewportH - 60) return 'bottom';
        if (spotlightRect.left > 60) return 'left';
        return 'right';
    });

    let cardPositionClass = $derived.by(() => {
        if (!spotlightRect) return 'bottom-6 right-6';
        const cardW = 460;
        const cardH = 330;
        const overlapsBottomRight =
            spotlightRect.left + spotlightRect.width > viewportW - cardW - 36 &&
            spotlightRect.top + spotlightRect.height > viewportH - cardH - 36;
        if (overlapsBottomRight) {
            const overlapsBottomLeft =
                spotlightRect.left < cardW + 36 &&
                spotlightRect.top + spotlightRect.height > viewportH - cardH - 36;
            if (overlapsBottomLeft) {
                return 'top-24 right-6';
            }
            return 'bottom-6 left-6';
        }
        return 'bottom-6 right-6';
    });

    $effect(() => {
        if (browser && ui.isTutorialActive && currentSpec) {
            const timer = setTimeout(() => {
                updateSpotlightRect(true);
            }, 65);
            return () => clearTimeout(timer);
        } else if (!ui.isTutorialActive) {
            spotlightRect = null;
            hasResetWalletModalToMenu = false;
            settingsStore.showSettingsModal = false;
            restoreStashedVaultAfterTutorial();
            restoreUnifiedSandboxInterceptors();
            clearAllTourAttributes();
        }
    });

    function handleViewportChange() {
        if (!ui.isTutorialActive) return;
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
            updateSpotlightRect(false);
        });
    }

    function handleGlobalCaptureClick(e: MouseEvent) {
        if (!browser || !ui.isTutorialActive || !currentSpec) return;
        if (currentSpec.mode !== 'ACTION') return;
        const clickedNode = e.target as HTMLElement | null;
        if (!clickedNode) return;
        if (clickedNode.closest('[data-testid="tutorial-floating-card"]')) {
            return;
        }
        const targetEl = resolveTargetElement();
        const isInsideDomTarget = Boolean(
            targetEl && (targetEl === clickedNode || targetEl.contains(clickedNode))
        );
        const isInsideCutoutBounds = Boolean(
            spotlightRect &&
                e.clientX >= spotlightRect.left - 4 &&
                e.clientX <= spotlightRect.left + spotlightRect.width + 4 &&
                e.clientY >= spotlightRect.top - 4 &&
                e.clientY <= spotlightRect.top + spotlightRect.height + 4
        );
        if (isInsideDomTarget || isInsideCutoutBounds) {
            const stepIdAtClick = currentSpec.id;
            const totalStepsAtClick = currentSpec.totalChapterSteps;
            const delayMs = currentSpec.advanceDelayMs ?? 240;
            if (stepIdAtClick === 'settlement_step0_click_break_off') {
                setTimeout(() => {
                    const initBtn = document.querySelector(
                        '[data-testid="initialize-sector-btn"]'
                    ) as HTMLButtonElement | null;
                    if (initBtn) initBtn.click();
                }, 30);
            }
            if (advanceTimeout) clearTimeout(advanceTimeout);
            advanceTimeout = setTimeout(() => {
                if (
                    ui.isTutorialActive &&
                    ui.activeTourStepSpec?.id === stepIdAtClick
                ) {
                    ui.advanceTutorialSubStep(totalStepsAtClick);
                }
            }, delayMs);
        }
    }

    onMount(() => {
        if (!browser) return;
        ui.bindSandboxStores({ identity, operations, treasury });
        viewportW = window.innerWidth;
        viewportH = window.innerHeight;
        window.addEventListener('resize', handleViewportChange, { passive: true });
        window.addEventListener('scroll', handleViewportChange, {
            passive: true,
            capture: true
        });
        window.addEventListener('click', handleGlobalCaptureClick, true);
        pollTimer = setInterval(() => {
            if (ui.isTutorialActive) {
                synchronizeActiveChapterDom(
                    activeChapterNum,
                    Number(ui.tutorialSubStep || 0)
                );
                updateSpotlightRect(false);
            }
        }, 160);
    });

    onDestroy(() => {
        if (!browser) return;
        window.removeEventListener('resize', handleViewportChange);
        window.removeEventListener('scroll', handleViewportChange, true);
        window.removeEventListener('click', handleGlobalCaptureClick, true);
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (pollTimer) clearInterval(pollTimer);
        if (advanceTimeout) clearTimeout(advanceTimeout);
        settingsStore.showSettingsModal = false;
        restoreStashedVaultAfterTutorial();
        restoreUnifiedSandboxInterceptors();
        clearAllTourAttributes();
    });

    function handleLaunchChapter(chapter: number) {
        hasResetWalletModalToMenu = false;
        settingsStore.showSettingsModal = false;
        ui.bindSandboxStores({ identity, operations, treasury });
        ui.startTutorial(chapter);
    }

    function handleJumpChapter(chapter: number) {
        hasResetWalletModalToMenu = false;
        settingsStore.showSettingsModal = false;
        ui.bindSandboxStores({ identity, operations, treasury });
        ui.startChapter(chapter, 0);
    }

    function handleContinueStep() {
        if (!currentSpec) return;
        ui.advanceTutorialSubStep(currentSpec.totalChapterSteps);
    }

    function handleBackStep() {
        ui.prevTutorialSubStep();
    }
</script>

{#if ui.showTutorialPrompt}
    <div
        data-testid="tutorial-launch-modal"
        class="fixed inset-0 z-[10010] flex items-center justify-center p-4 bg-[#06080b]/75 font-mono"
        transition:fade={{ duration: 160 }}
    >
        <div
            class="w-full max-w-[540px] bg-[#0a0d12] border border-white/15 rounded-[28px] p-7 shadow-[0_24px_70px_rgba(0,0,0,0.95)] flex flex-col gap-4 relative overflow-hidden"
            style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.14), transparent 65%);"
            transition:fly={{ y: 10, duration: 200 }}
        >
            <div class="flex items-center justify-between border-b border-white/10 pb-3.5">
                <div class="flex items-center gap-2.5">
                    <span class="w-2 h-2 rounded-full bg-[#18C6A5] animate-pulse"></span>
                    <span class="text-[10px] font-black uppercase tracking-[0.2em] text-[#18C6A5]">
                        Interactive Walkthrough
                    </span>
                </div>
                <button
                    type="button"
                    onclick={() => ui.dismissTutorialPrompt()}
                    class="text-neutral-500 hover:text-white text-xs cursor-pointer px-2 py-1"
                >
                    ✕
                </button>
            </div>
            <div class="flex flex-col gap-1">
                <h2 class="text-lg font-black uppercase tracking-widest text-white">
                    Explore Perennia Step-by-Step
                </h2>
                <p class="text-xs text-neutral-400 leading-relaxed">
                    Take an interactive tour of the platform. Click highlighted controls to see each station in action, or jump directly to any section below.
                </p>
            </div>
            <div class="flex flex-col gap-1.5 bg-[#11161f] p-3 rounded-2xl border border-white/10 max-h-[360px] overflow-y-auto hide-scrollbar">
                {#each CHAPTERS as chap (chap.chapter)}
                    <button
                        type="button"
                        data-testid="launch-tutorial-chapter-{chap.chapter}"
                        onclick={() => handleLaunchChapter(chap.chapter)}
                        class="tactile-btn w-full p-2.5 rounded-xl text-left flex items-center justify-between gap-3 border border-white/5 hover:border-[#18C6A5]/45 cursor-pointer group"
                    >
                        <div class="flex items-center gap-3 min-w-0">
                            <span
                                class="w-7 h-7 rounded-lg bg-[#0a0d12] border border-white/10 flex items-center justify-center text-[10px] font-black shrink-0"
                                style="color: {chap.accentHex}; border-color: {chap.accentHex}40;"
                            >
                                0{chap.chapter}
                            </span>
                            <div class="flex flex-col min-w-0">
                                <span class="text-xs font-black uppercase tracking-wider text-white group-hover:text-[#18C6A5] transition-colors truncate">
                                    {chap.title}
                                </span>
                                <span class="text-[9px] text-neutral-400 truncate">
                                    {chap.subtitle}
                                </span>
                            </div>
                        </div>
                        <span class="text-[10px] font-black text-neutral-500 group-hover:text-white shrink-0">
                            Start →
                        </span>
                    </button>
                {/each}
            </div>
            <div class="flex gap-3 pt-1">
                <button
                    type="button"
                    onclick={() => ui.dismissTutorialPrompt()}
                    class="tactile-btn flex-1 py-3.5 rounded-xl text-neutral-400 hover:text-white text-[10px] font-bold uppercase tracking-widest cursor-pointer"
                >
                    Skip for Now
                </button>
                <button
                    type="button"
                    data-testid="start-full-tutorial-btn"
                    onclick={() => handleLaunchChapter(1)}
                    class="tactile-btn flex-[1.6] py-3.5 rounded-xl text-[#18C6A5] border-[#18C6A5]/45 text-[10px] font-black uppercase tracking-widest cursor-pointer"
                    style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.2), transparent 70%);"
                >
                    Start Interactive Tour →
                </button>
            </div>
        </div>
    </div>
{/if}

{#if ui.isTutorialActive && currentSpec}
    {#if spotlightRect}
        <div
            class="fixed left-0 top-0 z-[10010] bg-[#06080b]/35 pointer-events-auto transition-all duration-200 ease-out"
            style="width: 100vw; height: {Math.max(0, spotlightRect.top)}px;"
        ></div>
        <div
            class="fixed left-0 z-[10010] bg-[#06080b]/35 pointer-events-auto transition-all duration-200 ease-out"
            style="
                top: {spotlightRect.top + spotlightRect.height}px;
                width: 100vw;
                height: {Math.max(0, viewportH - (spotlightRect.top + spotlightRect.height))}px;
            "
        ></div>
        <div
            class="fixed left-0 z-[10010] bg-[#06080b]/35 pointer-events-auto transition-all duration-200 ease-out"
            style="
                top: {spotlightRect.top}px;
                width: {Math.max(0, spotlightRect.left)}px;
                height: {spotlightRect.height}px;
            "
        ></div>
        <div
            class="fixed z-[10010] bg-[#06080b]/35 pointer-events-auto transition-all duration-200 ease-out"
            style="
                top: {spotlightRect.top}px;
                left: {spotlightRect.left + spotlightRect.width}px;
                width: {Math.max(0, viewportW - (spotlightRect.left + spotlightRect.width))}px;
                height: {spotlightRect.height}px;
            "
        ></div>
        {#if !isActionStep}
            <div
                class="fixed z-[10012] bg-transparent pointer-events-auto"
                style="
                    top: {spotlightRect.top}px;
                    left: {spotlightRect.left}px;
                    width: {spotlightRect.width}px;
                    height: {spotlightRect.height}px;
                "
            ></div>
        {/if}
        <div
            data-testid="tutorial-spotlight-cutout"
            class="fixed z-[10015] pointer-events-none rounded-[18px] transition-all duration-250 ease-out {isActionStep ? 'tactical-cutout-pulse' : ''}"
            style="
                top: {spotlightRect.top}px;
                left: {spotlightRect.left}px;
                width: {spotlightRect.width}px;
                height: {spotlightRect.height}px;
                --cutout-accent: {currentSpec.accentHex};
                border: 1.5px solid {currentSpec.accentHex};
                box-shadow:
                    0 0 24px 1px {currentSpec.accentHex}30,
                    inset 0 0 14px {currentSpec.accentHex}14;
            "
        >
            <div
                class="absolute -top-[2px] -left-[2px] w-3 h-3 border-t-2 border-l-2 rounded-tl-[5px]"
                style="border-color: {currentSpec.accentHex};"
            ></div>
            <div
                class="absolute -top-[2px] -right-[2px] w-3 h-3 border-t-2 border-r-2 rounded-tr-[5px]"
                style="border-color: {currentSpec.accentHex};"
            ></div>
            <div
                class="absolute -bottom-[2px] -left-[2px] w-3 h-3 border-b-2 border-l-2 rounded-bl-[5px]"
                style="border-color: {currentSpec.accentHex};"
            ></div>
            <div
                class="absolute -bottom-[2px] -right-[2px] w-3 h-3 border-b-2 border-r-2 rounded-br-[5px]"
                style="border-color: {currentSpec.accentHex};"
            ></div>
            {#if isActionStep}
                {#if resolvedChevronPlacement === 'top'}
                    <div
                        data-testid="tutorial-tactical-chevron"
                        class="absolute -top-6 left-1/2 -translate-x-1/2 flex flex-col items-center tactical-drift-vertical"
                    >
                        <svg
                            class="w-4 h-4"
                            style="color: {currentSpec.accentHex};"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <path d="M4 4L8 8L12 4" stroke-linecap="square" opacity="0.55" />
                            <path d="M4 8.5L8 12.5L12 8.5" stroke-linecap="square" />
                        </svg>
                    </div>
                {:else if resolvedChevronPlacement === 'bottom'}
                    <div
                        data-testid="tutorial-tactical-chevron"
                        class="absolute -bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center tactical-drift-vertical-up"
                    >
                        <svg
                            class="w-4 h-4"
                            style="color: {currentSpec.accentHex};"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <path d="M4 7.5L8 3.5L12 7.5" stroke-linecap="square" />
                            <path d="M4 12L8 8L12 12" stroke-linecap="square" opacity="0.55" />
                        </svg>
                    </div>
                {:else if resolvedChevronPlacement === 'left'}
                    <div
                        data-testid="tutorial-tactical-chevron"
                        class="absolute top-1/2 -left-6 -translate-y-1/2 flex items-center tactical-drift-horizontal"
                    >
                        <svg
                            class="w-4 h-4"
                            style="color: {currentSpec.accentHex};"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <path d="M4 4L8 8L4 12" stroke-linecap="square" opacity="0.55" />
                            <path d="M8.5 4L12.5 8L8.5 12" stroke-linecap="square" />
                        </svg>
                    </div>
                {:else}
                    <div
                        data-testid="tutorial-tactical-chevron"
                        class="absolute top-1/2 -right-6 -translate-y-1/2 flex items-center tactical-drift-horizontal-left"
                    >
                        <svg
                            class="w-4 h-4"
                            style="color: {currentSpec.accentHex};"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <path d="M7.5 4L3.5 8L7.5 12" stroke-linecap="square" />
                            <path d="M12 4L8 8L12 12" stroke-linecap="square" opacity="0.55" />
                        </svg>
                    </div>
                {/if}
            {/if}
        </div>
    {:else}
        <div class="fixed inset-0 z-[10010] bg-[#06080b]/30 pointer-events-none"></div>
    {/if}

    <div
        data-testid="tutorial-floating-card"
        class="fixed {cardPositionClass} z-[10025] w-[calc(100vw-2rem)] max-w-[450px] font-mono pointer-events-auto transition-all duration-250"
        transition:fly={{ y: 16, duration: 200 }}
    >
        <div
            class="bg-[#0a0d12] border rounded-[24px] p-5 md:p-6 shadow-[0_24px_64px_rgba(0,0,0,0.92)] flex flex-col gap-3.5 relative overflow-hidden"
            style="
                border-color: {currentSpec.accentHex}60;
                background-image: radial-gradient(ellipse at top right, {currentSpec.accentHex}1c, transparent 65%);
            "
        >
            <div class="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
                <div class="flex items-center gap-2 min-w-0">
                    <span
                        class="w-2 h-2 rounded-full shrink-0 {isActionStep ? 'animate-pulse' : ''}"
                        style="background-color: {currentSpec.accentHex};"
                    ></span>
                    <span
                        class="text-[10px] font-black uppercase tracking-widest truncate"
                        style="color: {currentSpec.accentHex};"
                    >
                        {activeChapterMeta.shortName} • Step {currentSpec.stepIndex + 1} of {currentSpec.totalChapterSteps}
                    </span>
                </div>
                <button
                    type="button"
                    data-testid="tutorial-exit-btn"
                    onclick={() => {
                        settingsStore.showSettingsModal = false;
                        ui.completeTutorial();
                    }}
                    class="text-[9px] font-bold uppercase tracking-widest text-neutral-400 hover:text-white px-2.5 py-1 rounded-lg bg-[#11161f] border border-white/10 cursor-pointer shrink-0"
                >
                    Exit Tour ✕
                </button>
            </div>
            <div class="grid grid-cols-7 gap-1">
                {#each CHAPTERS as chap (chap.chapter)}
                    {@const isCurrentChap = activeChapterNum === chap.chapter}
                    {@const isCompletedChap = activeChapterNum > chap.chapter}
                    <button
                        type="button"
                        onclick={() => handleJumpChapter(chap.chapter)}
                        class="py-1.5 px-1 rounded-lg border text-[8px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer text-center truncate {isCurrentChap ? 'bg-[#161d29] text-white' : isCompletedChap ? 'bg-[#11161f] text-[#18C6A5]' : 'bg-[#11161f]/60 text-neutral-500 hover:text-neutral-300'}"
                        style="border-color: {isCurrentChap ? currentSpec.accentHex : isCompletedChap ? 'rgba(24,198,165,0.35)' : 'rgba(255,255,255,0.08)'};"
                        title={chap.title}
                    >
                        {chap.shortName}
                    </button>
                {/each}
            </div>
            <div class="flex items-center gap-1">
                {#each Array.from({ length: currentSpec.totalChapterSteps }) as _, idx}
                    <div
                        class="h-1 flex-1 rounded-full transition-all duration-200"
                        style="background-color: {idx <= currentSpec.stepIndex ? currentSpec.accentHex : 'rgba(255,255,255,0.1)'};"
                    ></div>
                {/each}
            </div>
            <div class="flex flex-col gap-1">
                <h3 class="text-sm font-black uppercase tracking-wider text-white">
                    {currentSpec.title}
                </h3>
                <p class="text-[11px] text-neutral-300 leading-relaxed">
                    {currentSpec.description}
                </p>
            </div>
            <div class="bg-[#11161f] border border-white/10 rounded-xl p-3 flex flex-col gap-1.5">
                {#each currentSpec.bullets as bullet, idx}
                    <div class="flex items-start gap-2 text-[10px] text-neutral-300 leading-snug">
                        <span
                            class="font-black shrink-0 mt-0.5"
                            style="color: {currentSpec.accentHex};"
                        >
                            0{idx + 1}.
                        </span>
                        <span>{bullet}</span>
                    </div>
                {/each}
            </div>
            <div class="flex items-center justify-between gap-2 pt-1">
                <button
                    type="button"
                    data-testid="tutorial-back-btn"
                    onclick={handleBackStep}
                    disabled={activeChapterNum === 1 && Number(ui.tutorialSubStep || 0) === 0}
                    class="tactile-btn px-3.5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shrink-0"
                >
                    ← Back
                </button>
                {#if isActionStep}
                    <div class="flex items-center gap-2 ml-auto">
                        <div
                            class="px-3 py-2 rounded-xl bg-[#11161f] border text-[9px] font-mono font-black uppercase tracking-widest flex items-center gap-2"
                            style="border-color: {currentSpec.accentHex}55; color: {currentSpec.accentHex};"
                        >
                            <span
                                class="w-1.5 h-1.5 rounded-full animate-ping"
                                style="background-color: {currentSpec.accentHex};"
                            ></span>
                            <span>{currentSpec.actionHint || 'Click Highlighted Element'}</span>
                        </div>
                        <button
                            type="button"
                            data-testid="tutorial-skip-action-btn"
                            onclick={handleContinueStep}
                            class="tactile-btn px-2.5 py-2 rounded-xl text-[9px] font-bold uppercase tracking-wider text-neutral-400 hover:text-white cursor-pointer shrink-0"
                        >
                            Next →
                        </button>
                    </div>
                {:else}
                    <button
                        type="button"
                        data-testid="tutorial-continue-btn"
                        onclick={handleContinueStep}
                        class="tactile-btn px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-white cursor-pointer ml-auto"
                        style="
                            border-color: {currentSpec.accentHex}60;
                            background-image: radial-gradient(ellipse at center, {currentSpec.accentHex}28, transparent 70%);
                        "
                    >
                        {activeChapterNum === 7 &&
                        currentSpec.stepIndex + 1 >= currentSpec.totalChapterSteps
                            ? 'Finish Tour ✓'
                            : 'Next →'}
                    </button>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    @keyframes tactical-perimeter-pulse {
        0%,
        100% {
            border-color: var(--cutout-accent, #18c6a5);
            box-shadow:
                0 0 22px 1px color-mix(in srgb, var(--cutout-accent, #18c6a5) 28%, transparent),
                inset 0 0 12px color-mix(in srgb, var(--cutout-accent, #18c6a5) 14%, transparent);
        }
        50% {
            border-color: #ffffff;
            box-shadow:
                0 0 28px 2px color-mix(in srgb, var(--cutout-accent, #18c6a5) 45%, transparent),
                inset 0 0 18px color-mix(in srgb, var(--cutout-accent, #18c6a5) 22%, transparent);
        }
    }
    .tactical-cutout-pulse {
        animation: tactical-perimeter-pulse 1.9s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    @keyframes drift-down {
        0%,
        100% {
            transform: translate(-50%, 0px);
        }
        50% {
            transform: translate(-50%, 3.5px);
        }
    }
    @keyframes drift-up {
        0%,
        100% {
            transform: translate(-50%, 0px);
        }
        50% {
            transform: translate(-50%, -3.5px);
        }
    }
    @keyframes drift-right {
        0%,
        100% {
            transform: translate(0px, -50%);
        }
        50% {
            transform: translate(3.5px, -50%);
        }
    }
    @keyframes drift-left {
        0%,
        100% {
            transform: translate(0px, -50%);
        }
        50% {
            transform: translate(-3.5px, -50%);
        }
    }
    .tactical-drift-vertical {
        animation: drift-down 1.4s ease-in-out infinite;
    }
    .tactical-drift-vertical-up {
        animation: drift-up 1.4s ease-in-out infinite;
    }
    .tactical-drift-horizontal {
        animation: drift-right 1.4s ease-in-out infinite;
    }
    .tactical-drift-horizontal-left {
        animation: drift-left 1.4s ease-in-out infinite;
    }
</style>