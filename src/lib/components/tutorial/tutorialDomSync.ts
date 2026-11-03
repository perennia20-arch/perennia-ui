import { browser } from '$app/environment';
import {
    ui,
    SANDBOX_MNEMONIC_WORDS,
    SANDBOX_WALLETS,
    SANDBOX_ONLINE_WORKER,
    SANDBOX_DEMO_SECTOR,
    SANDBOX_TAX_EVENTS
} from '$lib/stores/ui.svelte';
import { identity } from '$lib/stores/identity.svelte';
import { operations } from '$lib/stores/operations.svelte';
import { treasury } from '$lib/stores/treasury.svelte';

export interface ChapterMeta {
    chapter: number;
    shortName: string;
    title: string;
    subtitle: string;
    tab: string;
    accentHex: string;
}

export const CHAPTERS: ChapterMeta[] = [
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
        title: 'Zero-PII Tax Fortress & Escrow LP',
        subtitle: 'Configure your jurisdiction, earn LP fees on tax escrow, and compile 1099-DA PDFs',
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

export class TutorialDomSynchronizer {
    capturedSeedWords: string[] = [...SANDBOX_MNEMONIC_WORDS];
    private stashedLocalStorageVault: string | null = null;
    private hasStashedVault = false;
    private hasResetWalletModalToMenu = false;
    private hasFilledPasswords = false;
    private hasTriggeredSeedGen = false;
    private hasFilledVerifyWords = false;
    private hasFilledSampleAba = false;
    private hasFilledSiloSwapQuote = false;
    private hasFilledSiloStakeInput = false;
    private hasFilledNvdaSwapQuote = false;
    private sandboxSiloStakedAmount = 0;
    private originalFetch: typeof window.fetch | null = null;
    private originalPrompt: typeof window.prompt | null = null;

    resetModalFlags() {
        this.hasResetWalletModalToMenu = false;
    }

    stashAndClearStoredVaultForTutorial() {
        if (!browser) return;
        if (!this.hasStashedVault) {
            this.stashedLocalStorageVault = localStorage.getItem('perennia_sovereign_payload');
            this.hasStashedVault = true;
        }
        localStorage.removeItem('perennia_sovereign_payload');
    }

    restoreStashedVaultAfterTutorial() {
        if (!browser || !this.hasStashedVault) return;
        if (this.stashedLocalStorageVault !== null) {
            localStorage.setItem('perennia_sovereign_payload', this.stashedLocalStorageVault);
        } else {
            localStorage.removeItem('perennia_sovereign_payload');
        }
        this.stashedLocalStorageVault = null;
        this.hasStashedVault = false;
    }

    forceResetWalletModalViewState() {
        if (!browser || this.hasResetWalletModalToMenu) return;
        this.hasResetWalletModalToMenu = true;
        this.stashAndClearStoredVaultForTutorial();
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

    installUnifiedSandboxInterceptors(activeChapterNum: number) {
        if (!browser) return;
        if (!this.originalPrompt) {
            this.originalPrompt = window.prompt.bind(window);
            window.prompt = (message?: string, defaultValue?: string) => {
                if (ui.isTutorialActive) {
                    return 'RIG-KS7-LITE';
                }
                return this.originalPrompt!(message, defaultValue);
            };
        }
        if (!this.originalFetch) {
            this.originalFetch = window.fetch.bind(window);
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
                            { status: 200, headers: { 'Content-Type': 'application/json' } }
                        );
                    }
                    if (urlStr.endsWith('/api/auth') && init?.method === 'POST') {
                        return new Response(
                            JSON.stringify({
                                status: 'success',
                                address: SANDBOX_WALLETS.kaspa.address
                            }),
                            { status: 200, headers: { 'Content-Type': 'application/json' } }
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
                            { status: 200, headers: { 'Content-Type': 'application/json' } }
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
                                        beneficiaryName: 'Perennia Holdings, LLC — Sovereign Treasury',
                                        bankName: 'Mercury / Column N.A. Commercial Vault',
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
                                { status: 200, headers: { 'Content-Type': 'application/json' } }
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
                            { status: 200, headers: { 'Content-Type': 'application/json' } }
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
                            { status: 200, headers: { 'Content-Type': 'application/json' } }
                        );
                    }
                    if (urlStr.includes('/api/user/tax-events')) {
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
                            { status: 200, headers: { 'Content-Type': 'application/json' } }
                        );
                    }
                    if (urlStr.includes('/api/treasury/corporate')) {
                        return new Response(
                            JSON.stringify({
                                assets: [
                                    { symbol: 'KAS', address: SANDBOX_WALLETS.kaspa.address, balance: 14520.0 },
                                    { symbol: 'BTC', address: SANDBOX_WALLETS.bitcoin.address, balance: 0.085 },
                                    { symbol: 'ETH', address: SANDBOX_WALLETS.ethereum.address, balance: 1.45 },
                                    { symbol: 'SOL', address: SANDBOX_WALLETS.solana.address, balance: 18.5 }
                                ],
                                reconciliation: null
                            }),
                            { status: 200, headers: { 'Content-Type': 'application/json' } }
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
                            { status: 200, headers: { 'Content-Type': 'application/json' } }
                        );
                    }
                    if (urlStr.includes('/api/utxos')) {
                        return new Response(
                            JSON.stringify({
                                entries: [
                                    {
                                        transactionId: '1111222233334444555566667777888899990000aaaabbbbccccddddeeee0001',
                                        index: 0,
                                        amount: 500_000_000_000
                                    },
                                    {
                                        transactionId: '1111222233334444555566667777888899990000aaaabbbbccccddddeeee0002',
                                        index: 1,
                                        amount: 450_000_000_000
                                    }
                                ]
                            }),
                            { status: 200, headers: { 'Content-Type': 'application/json' } }
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
                            this.sandboxSiloStakedAmount = Math.max(15000, added);
                            return new Response(
                                JSON.stringify({
                                    success: true,
                                    data: {
                                        stakeId: 'tut-silo-pos-01',
                                        ticker: 'SILO',
                                        stakedAmount: this.sandboxSiloStakedAmount,
                                        feeRateCap: 0.0075,
                                        tierLabel: 'SILO Staker Tier (0.75% Fee)',
                                        totalActiveStaked: this.sandboxSiloStakedAmount
                                    }
                                }),
                                { status: 200, headers: { 'Content-Type': 'application/json' } }
                            );
                        }
                        if (bodyObj.action === 'GET_SILO_STAKING') {
                            const activeAmt =
                                this.sandboxSiloStakedAmount > 0
                                    ? this.sandboxSiloStakedAmount
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
                                                          stakeId: 'tut-silo-pos-01',
                                                          ticker: 'SILO',
                                                          amountStaked: activeAmt,
                                                          status: 'ACTIVE',
                                                          isMatured: false
                                                      }
                                                  ]
                                                : []
                                    }
                                }),
                                { status: 200, headers: { 'Content-Type': 'application/json' } }
                            );
                        }
                        if (bodyObj.action === 'GET_HIFO_TAX_LOTS') {
                            return new Response(
                                JSON.stringify({ success: true, data: SANDBOX_HIFO_BUNDLE }),
                                { status: 200, headers: { 'Content-Type': 'application/json' } }
                            );
                        }
                        if (bodyObj.action === 'GET_COLD_VAULT_AIRLOCK') {
                            return new Response(
                                JSON.stringify({
                                    success: true,
                                    data: {
                                        clientVault: {
                                            coldKaspaAddress: SANDBOX_WALLETS.kaspa.address,
                                            cardPublicKeyHex: '02a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef',
                                            cardLabel: 'Primary Air-Gapped Hardware Vault',
                                            signerMode: 'WEB_QR_AIRLOCK',
                                            overflowThresholdKas: 500,
                                            autoSweepEnabled: true,
                                            lastSweepTxid: 'b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef01',
                                            lastSweepAt: new Date().toISOString()
                                        },
                                        nodeAirlock: {
                                            hotSignerAddress: SANDBOX_WALLETS.kaspa.address,
                                            coldVaultAddress: SANDBOX_WALLETS.kaspa.address,
                                            hotBalanceKas: 4250.0,
                                            hotCeilingKas: 5000.0,
                                            minRunwayKas: 250.0,
                                            runwayHoursRemaining: 312.0,
                                            lowRunwayBreakerTripped: false,
                                            status: 'ARMED_NOMINAL'
                                        }
                                    }
                                }),
                                { status: 200, headers: { 'Content-Type': 'application/json' } }
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
                                            weights: { KAS: 0.5, NVDA: 0.25, USDC: 0.25 },
                                            reserves: { KAS: 4200.0, NVDA: 2.42, USDC: 346.5 },
                                            internalPairsCount: 3,
                                            isMultiAssetPlant: true,
                                            lockDurationDays: 365,
                                            unlockDate: new Date(Date.now() + 365 * 86400 * 1000).toISOString(),
                                            createdAt: new Date().toISOString(),
                                            isUnlocked: false,
                                            multiplier: 2.5,
                                            weightedTvl: 10500.0
                                        }
                                    ]
                                }),
                                { status: 200, headers: { 'Content-Type': 'application/json' } }
                            );
                        }
                        return new Response(JSON.stringify({ success: true }), {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }
                }
                return this.originalFetch!(input, init);
            };
        }
    }

    restoreUnifiedSandboxInterceptors() {
        if (!browser) return;
        if (this.originalPrompt) {
            window.prompt = this.originalPrompt;
            this.originalPrompt = null;
        }
        if (this.originalFetch) {
            window.fetch = this.originalFetch;
            this.originalFetch = null;
        }
    }

    setNativeInputValue(inputEl: HTMLInputElement, value: string) {
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

    clearAllTourAttributes() {
        if (!browser) return;
        const nodes = document.querySelectorAll('[data-tour-target]');
        for (const el of Array.from(nodes)) {
            el.removeAttribute('data-tour-target');
        }
    }

    teardown() {
        this.hasResetWalletModalToMenu = false;
        this.restoreStashedVaultAfterTutorial();
        this.restoreUnifiedSandboxInterceptors();
        this.clearAllTourAttributes();
    }

    synchronizeActiveChapterDom(chapter: number, stepIdx: number) {
        if (!browser || !ui.isTutorialActive) return;
        this.installUnifiedSandboxInterceptors(chapter);
        this.clearAllTourAttributes();

        if (chapter === 1) {
            if (operations.workers.length > 0) operations.workers = [];
            if (operations.sectors.length > 0) operations.sectors = [];
            if (stepIdx === 0) {
                this.hasFilledPasswords = false;
                this.hasTriggeredSeedGen = false;
                this.hasFilledVerifyWords = false;
                this.stashAndClearStoredVaultForTutorial();
                if (!this.hasResetWalletModalToMenu) {
                    this.forceResetWalletModalViewState();
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
                    unlockBtn.setAttribute('data-tour-target', 'mod1-unlock-vault-btn');
                }
                return;
            }
            if (stepIdx >= 1 && stepIdx <= 8) {
                this.stashAndClearStoredVaultForTutorial();
                if (!ui.showWalletModal) {
                    ui.showWalletModal = true;
                }
                const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
                if (!dialog) return;
                const allDialogButtons = Array.from(dialog.querySelectorAll('button')) as HTMLButtonElement[];
                if (stepIdx === 1 || stepIdx === 2) {
                    this.hasFilledPasswords = false;
                    this.hasTriggeredSeedGen = false;
                    const backOrOptionsBtn = allDialogButtons.find((b) => {
                        const t = (b.textContent || '').trim().toUpperCase();
                        return t === 'OPTIONS' || t === 'BACK';
                    });
                    if (backOrOptionsBtn) backOrOptionsBtn.click();
                    const newVaultBtnCheck = allDialogButtons.find((b) =>
                        (b.textContent || '').toUpperCase().includes('NEW 24-WORD VAULT')
                    );
                    if (!newVaultBtnCheck && !identity.isVaultUnlockPending) {
                        identity.pendingTransactionDetails = { actionType: 'TUTORIAL_RESET' };
                        identity.isVaultUnlockPending = true;
                        setTimeout(() => {
                            identity.isVaultUnlockPending = false;
                            identity.pendingTransactionDetails = null;
                        }, 25);
                        return;
                    }
                    if (newVaultBtnCheck) {
                        newVaultBtnCheck.setAttribute('data-tour-target', 'mod1-new-vault-btn');
                        const menuWrapper = newVaultBtnCheck.closest('div.w-full.flex.flex-col') as HTMLElement | null;
                        if (menuWrapper) {
                            menuWrapper.setAttribute('data-tour-target', 'mod1-wallet-menu-options');
                        }
                    }
                    return;
                }
                if (stepIdx === 3 || stepIdx === 4) {
                    const newVaultBtn = allDialogButtons.find((b) =>
                        (b.textContent || '').toUpperCase().includes('NEW 24-WORD VAULT')
                    );
                    if (newVaultBtn) newVaultBtn.click();
                    const passInputs = Array.from(
                        dialog.querySelectorAll('input[type="password"]')
                    ) as HTMLInputElement[];
                    if (passInputs.length >= 2 && !this.hasFilledPasswords && !identity.isConnecting) {
                        this.setNativeInputValue(passInputs[0], SANDBOX_PASSWORD);
                        this.setNativeInputValue(passInputs[1], SANDBOX_PASSWORD);
                        this.hasFilledPasswords = true;
                    }
                    const formEl = dialog.querySelector('form') as HTMLElement | null;
                    if (formEl) formEl.setAttribute('data-tour-target', 'mod1-password-form');
                    const submitBtn = dialog.querySelector('button[type="submit"]') as HTMLButtonElement | null;
                    if (submitBtn) submitBtn.setAttribute('data-tour-target', 'mod1-generate-seed-btn');
                    return;
                }
                if (stepIdx === 5 || stepIdx === 6 || stepIdx === 7) {
                    const viewSeedBtn = allDialogButtons.find((b) =>
                        (b.textContent || '').toUpperCase().includes('VIEW SEED')
                    );
                    if (viewSeedBtn) viewSeedBtn.click();
                    const wordSpans = Array.from(dialog.querySelectorAll('span.select-all')) as HTMLElement[];
                    if (wordSpans.length < 24 && !this.hasTriggeredSeedGen && !identity.isConnecting) {
                        const passInputs = Array.from(
                            dialog.querySelectorAll('input[type="password"]')
                        ) as HTMLInputElement[];
                        const submitBtn = dialog.querySelector('button[type="submit"]') as HTMLButtonElement | null;
                        if (passInputs.length >= 2 && submitBtn) {
                            this.setNativeInputValue(passInputs[0], SANDBOX_PASSWORD);
                            this.setNativeInputValue(passInputs[1], SANDBOX_PASSWORD);
                            this.hasTriggeredSeedGen = true;
                            submitBtn.click();
                        }
                        return;
                    }
                    if (wordSpans.length >= 24) {
                        this.capturedSeedWords = wordSpans
                            .slice(0, 24)
                            .map((s) => (s.textContent || '').trim().toLowerCase());
                        const gridContainer = wordSpans[0].closest('div.grid');
                        if (gridContainer) gridContainer.setAttribute('data-tour-target', 'mod1-seed-grid');
                    }
                    const copySeedBtn = allDialogButtons.find((b) =>
                        (b.textContent || '').toUpperCase().includes('COPY 24 WORDS')
                    );
                    if (copySeedBtn && copySeedBtn.parentElement) {
                        copySeedBtn.parentElement.setAttribute('data-tour-target', 'mod1-backup-controls');
                    }
                    const proceedBtn = allDialogButtons.find((b) =>
                        (b.textContent || '').toUpperCase().includes('PROCEED TO 2-WORD TEST')
                    );
                    if (proceedBtn) proceedBtn.setAttribute('data-tour-target', 'mod1-proceed-verify-btn');
                    return;
                }
                if (stepIdx === 8) {
                    const wordSpans = Array.from(dialog.querySelectorAll('span.select-all')) as HTMLElement[];
                    if (wordSpans.length >= 24) {
                        this.capturedSeedWords = wordSpans
                            .slice(0, 24)
                            .map((s) => (s.textContent || '').trim().toLowerCase());
                    }
                    const proceedBtn = allDialogButtons.find((b) =>
                        (b.textContent || '').toUpperCase().includes('PROCEED TO 2-WORD TEST')
                    );
                    if (proceedBtn) proceedBtn.click();
                    const label1 = dialog.querySelector('label[for="verifyWord1"]');
                    const label2 = dialog.querySelector('label[for="verifyWord2"]');
                    const input1 = dialog.querySelector('#verifyWord1') as HTMLInputElement | null;
                    const input2 = dialog.querySelector('#verifyWord2') as HTMLInputElement | null;
                    if (label1 && input1 && label2 && input2 && !this.hasFilledVerifyWords) {
                        const idx1 = parseInt((label1.textContent || '').replace(/\D/g, ''), 10) - 1;
                        const idx2 = parseInt((label2.textContent || '').replace(/\D/g, ''), 10) - 1;
                        if (idx1 >= 0 && this.capturedSeedWords[idx1]) {
                            this.setNativeInputValue(input1, this.capturedSeedWords[idx1]);
                        }
                        if (idx2 >= 0 && this.capturedSeedWords[idx2]) {
                            this.setNativeInputValue(input2, this.capturedSeedWords[idx2]);
                        }
                        this.hasFilledVerifyWords = true;
                    }
                    const verifySubmitBtn = dialog.querySelector('button[type="submit"]') as HTMLButtonElement | null;
                    if (verifySubmitBtn) {
                        verifySubmitBtn.setAttribute('data-tour-target', 'mod1-verify-submit-btn');
                    }
                    return;
                }
            }
            return;
        }

        if (chapter === 2) {
            if (ui.showWalletModal) ui.showWalletModal = false;
            if (!identity.isWalletConnected) ui.activateSandboxWalletSession();
            const workspace = document.querySelector('[data-tour="dex-workspace"]') as HTMLElement | null;
            if (!workspace) return;
            const workspaceButtons = Array.from(workspace.querySelectorAll('button')) as HTMLButtonElement[];
            const swapTabBtn = workspaceButtons.find((b) => (b.textContent || '').trim().toUpperCase() === 'SWAP');
            const liquidityTabBtn = workspaceButtons.find((b) => (b.textContent || '').trim().toUpperCase() === 'LIQUIDITY');
            const fiatTabBtn = workspaceButtons.find((b) => (b.textContent || '').trim().toUpperCase() === 'FIAT');
            if (swapTabBtn) swapTabBtn.setAttribute('data-tour-target', 'mod2silo-swap-tab-btn');
            if (liquidityTabBtn) liquidityTabBtn.setAttribute('data-tour-target', 'mod2silo-liquidity-tab-btn');

            if (stepIdx <= 4) {
                this.hasFilledSiloSwapQuote = false;
                this.hasFilledSiloStakeInput = false;
                this.sandboxSiloStakedAmount = 0;
                const onrampTabBtn = document.querySelector('[data-testid="fiat-onramp-tab-btn"]') as HTMLButtonElement | null;
                if (!onrampTabBtn && fiatTabBtn) fiatTabBtn.click();
                if (stepIdx <= 3) {
                    this.hasFilledSampleAba = false;
                    const onrampUsdInput = document.querySelector('#onrampUsdInput');
                    const activeOnrampTabBtn = document.querySelector('[data-testid="fiat-onramp-tab-btn"]') as HTMLButtonElement | null;
                    if (!onrampUsdInput && activeOnrampTabBtn) activeOnrampTabBtn.click();
                    const currentOnrampInput = document.querySelector('#onrampUsdInput');
                    if (currentOnrampInput) {
                        const onrampPanel = currentOnrampInput.closest('div.bg-\\[\\#11161f\\]') as HTMLElement | null;
                        if (onrampPanel) onrampPanel.setAttribute('data-tour-target', 'mod2silo-fiat-onramp-panel');
                    }
                    const allFiatBtns = Array.from(workspace.querySelectorAll('button')) as HTMLButtonElement[];
                    const genOrderBtn = allFiatBtns.find(
                        (b) =>
                            (b.textContent || '').toUpperCase().includes('GENERATE SOVEREIGN WIRE') ||
                            (b.textContent || '').toUpperCase().includes('INITIALIZE INSTANT CARD')
                    );
                    if (genOrderBtn) genOrderBtn.setAttribute('data-tour-target', 'mod2silo-onramp-submit-btn');
                    if (stepIdx === 2) {
                        const downloadSlipBtn = allFiatBtns.find((b) =>
                            (b.textContent || '').toUpperCase().includes('DOWNLOAD WIRE SLIP PDF')
                        );
                        if (!downloadSlipBtn && genOrderBtn) genOrderBtn.click();
                        if (downloadSlipBtn) {
                            const receiptCard = downloadSlipBtn.closest('div.bg-\\[\\#11161f\\]') as HTMLElement | null;
                            if (receiptCard) receiptCard.setAttribute('data-tour-target', 'mod2silo-onramp-receipt-card');
                        }
                    }
                    return;
                }
                if (stepIdx === 4) {
                    const offrampTabBtn = document.querySelector('[data-testid="fiat-offramp-tab-btn"]') as HTMLButtonElement | null;
                    let abaInput = document.querySelector('[data-testid="offramp-aba-input"]') as HTMLInputElement | null;
                    if (!abaInput && offrampTabBtn) {
                        offrampTabBtn.click();
                        abaInput = document.querySelector('[data-testid="offramp-aba-input"]') as HTMLInputElement | null;
                    }
                    if (abaInput) {
                        if (!this.hasFilledSampleAba) {
                            this.setNativeInputValue(abaInput, '111000614');
                            this.hasFilledSampleAba = true;
                        }
                        const bankVaultCard = abaInput.closest('div.bg-\\[\\#11161f\\]') as HTMLElement | null;
                        if (bankVaultCard) bankVaultCard.setAttribute('data-tour-target', 'mod2silo-bank-rail-vault');
                    }
                    return;
                }
            }
            if (stepIdx === 5) return;
            if (stepIdx >= 6 && stepIdx <= 10) {
                const receiveSelector = document.querySelector('[data-testid="dex-receive-token-selector"]') as HTMLButtonElement | null;
                if (!receiveSelector && swapTabBtn) swapTabBtn.click();
                if (stepIdx === 6) {
                    const closeBtn = document.querySelector('button[aria-label="Close"]') as HTMLButtonElement | null;
                    if (closeBtn) closeBtn.click();
                    return;
                }
                if (stepIdx === 7) {
                    const modalSearch = document.querySelector('[data-testid="dex-token-modal-search"]');
                    const activeReceiveSelector = document.querySelector('[data-testid="dex-receive-token-selector"]') as HTMLButtonElement | null;
                    if (!modalSearch && activeReceiveSelector) activeReceiveSelector.click();
                    return;
                }
                const modalSearch = document.querySelector('[data-testid="dex-token-modal-search"]');
                if (modalSearch) {
                    const siloBtn = document.querySelector('[data-testid="dex-select-token-SILO"]') as HTMLButtonElement | null;
                    if (siloBtn) siloBtn.click();
                    else {
                        const closeBtn = document.querySelector('button[aria-label="Close"]') as HTMLButtonElement | null;
                        if (closeBtn) closeBtn.click();
                    }
                }
                const payInput = document.querySelector('[data-testid="dex-pay-amount-input"]') as HTMLInputElement | null;
                if (payInput) {
                    const swapCard = payInput.closest('div.rounded-\\[28px\\]') as HTMLElement | null;
                    if (swapCard) swapCard.setAttribute('data-tour-target', 'mod2silo-swap-station-card');
                    if (!this.hasFilledSiloSwapQuote) {
                        this.setNativeInputValue(payInput, '1000');
                        this.hasFilledSiloSwapQuote = true;
                    }
                }
                if (stepIdx === 10) {
                    const execBtn = document.querySelector('[data-testid="dex-execute-swap-btn"]') as HTMLButtonElement | null;
                    if (execBtn && !workspace.textContent?.includes('Execution Confirmed')) {
                        execBtn.click();
                    }
                }
                return;
            }
            if (stepIdx >= 11) {
                const siloVaultCard = document.querySelector('[data-testid="silo-staking-vault-card"]');
                if (!siloVaultCard && liquidityTabBtn) liquidityTabBtn.click();
                const stakeInput = document.querySelector('[data-testid="silo-stake-amount-input"]') as HTMLInputElement | null;
                const stakeSubmitBtn = document.querySelector('[data-testid="silo-stake-submit-btn"]') as HTMLButtonElement | null;
                if (stepIdx === 11 && stakeInput && !this.hasFilledSiloStakeInput) {
                    this.setNativeInputValue(stakeInput, '15000');
                    this.hasFilledSiloStakeInput = true;
                }
                if (stepIdx === 12) {
                    const activeRow = document.querySelector('[data-testid="silo-stake-row-tut-silo-pos-01"]');
                    if (!activeRow && stakeSubmitBtn && stakeInput) {
                        this.setNativeInputValue(stakeInput, '15000');
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
            const firstPanelCard = panel.querySelector('div.tactile-card') as HTMLElement | null;
            if (firstPanelCard) firstPanelCard.setAttribute('data-tour-target', 'mod2-master-pool-telemetry');
            const sectorMatrix = document.querySelector('[data-tour="sector-matrix"]');
            if (sectorMatrix) {
                const routingHeader = sectorMatrix.querySelector('div.border-b.border-white\\/10') as HTMLElement | null;
                if (routingHeader) routingHeader.setAttribute('data-tour-target', 'mod2-sector-partition-bar');
                else sectorMatrix.setAttribute('data-tour-target', 'mod2-sector-partition-bar');
            }
            const allPanelButtons = Array.from(panel.querySelectorAll('button')) as HTMLButtonElement[];
            const addWorkerBtn = allPanelButtons.find((b) =>
                (b.textContent || '').toUpperCase().includes('+ ADD WORKER')
            );
            if (addWorkerBtn) addWorkerBtn.setAttribute('data-tour-target', 'mod2-add-worker-btn');
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
                const closeBackdrop = document.querySelector('div[aria-label="Close menu"]') as HTMLElement | null;
                if (closeBackdrop) closeBackdrop.click();
                ui.simulateSandboxWorkerOnline();
            }
            const workerOptionBtns = Array.from(
                panel.querySelectorAll('button[aria-label="Worker Options"]')
            ) as HTMLButtonElement[];
            const targetOptionsBtn = workerOptionBtns[0] || null;
            if (targetOptionsBtn) {
                const workerCard = targetOptionsBtn.closest('div.tactile-card') as HTMLElement | null;
                if (workerCard) {
                    workerCard.setAttribute('data-tour-target', 'mod2-active-worker-card');
                    const telemetryGrid = workerCard.querySelector('div.grid.grid-cols-3') as HTMLElement | null;
                    if (telemetryGrid) telemetryGrid.setAttribute('data-tour-target', 'mod2-worker-telemetry-row');
                    else workerCard.setAttribute('data-tour-target', 'mod2-worker-telemetry-row');
                }
                targetOptionsBtn.setAttribute('data-tour-target', 'mod2-worker-options-btn');
            }
            let menuEl = panel.querySelector('[role="menu"]') as HTMLElement | null;
            if ((stepIdx === 1 || stepIdx === 2) && menuEl) {
                const closeBackdrop = document.querySelector('div[aria-label="Close menu"]') as HTMLElement | null;
                if (closeBackdrop) closeBackdrop.click();
                menuEl = null;
            }
            if (stepIdx >= 3 && stepIdx <= 6 && !menuEl && targetOptionsBtn) {
                targetOptionsBtn.click();
                menuEl = panel.querySelector('[role="menu"]') as HTMLElement | null;
            }
            if (menuEl) {
                const menuButtons = Array.from(menuEl.querySelectorAll('button')) as HTMLButtonElement[];
                const renameBtn = menuButtons.find((b) =>
                    (b.textContent || '').toUpperCase().includes('RENAME WORKER')
                );
                if (renameBtn) renameBtn.setAttribute('data-tour-target', 'mod2-rename-worker-btn');
                const minerTypeBtn = menuButtons.find((b) =>
                    (b.textContent || '').toUpperCase().includes('MINER TYPE (SELECT ASIC)')
                );
                if (minerTypeBtn) minerTypeBtn.setAttribute('data-tour-target', 'mod2-miner-type-btn');
                if (stepIdx === 5) {
                    const searchInput = menuEl.querySelector('input[placeholder*="Search KS0"]') as HTMLInputElement | null;
                    if (!searchInput && minerTypeBtn) minerTypeBtn.click();
                    const updatedMenuButtons = Array.from(menuEl.querySelectorAll('button')) as HTMLButtonElement[];
                    const ks7LiteBtn =
                        updatedMenuButtons.find((b) =>
                            (b.textContent || '').toUpperCase().includes('ICERIVER KS7 LITE')
                        ) ||
                        updatedMenuButtons.find((b) =>
                            (b.textContent || '').toUpperCase().includes('PORT :')
                        );
                    if (ks7LiteBtn) ks7LiteBtn.setAttribute('data-tour-target', 'mod2-asic-model-choice');
                }
                const stratumCopyBtn = menuButtons.find(
                    (b) =>
                        (b.getAttribute('title') || '').includes('Stratum URL') ||
                        (b.textContent || '').toUpperCase().includes('STRATUM ADDRESS')
                );
                if (stratumCopyBtn) stratumCopyBtn.setAttribute('data-tour-target', 'mod2-copy-stratum-btn');
            }
            return;
        }

        if (chapter === 4) {
            if (ui.showWalletModal) ui.showWalletModal = false;
            if (!identity.isWalletConnected) ui.activateSandboxWalletSession();
            if (!operations.workers || operations.workers.length === 0) {
                operations.workers = [JSON.parse(JSON.stringify(SANDBOX_ONLINE_WORKER))];
            }
            const workersPanel = document.querySelector('[data-tour="workers-panel"]');
            if (workersPanel) {
                const btns = Array.from(workersPanel.querySelectorAll('button')) as HTMLButtonElement[];
                const breakOffBtn =
                    btns.find((b) =>
                        (b.textContent || '').toUpperCase().includes('+ BREAK OFF SECTOR')
                    ) || null;
                if (breakOffBtn) breakOffBtn.setAttribute('data-tour-target', 'mod3-break-off-sector-btn');
            }
            const closeDeployModal = () => {
                const deployNameInput = document.querySelector('#draftSectorNameInput');
                if (deployNameInput) {
                    const modalRoot = deployNameInput.closest('div.relative.z-10');
                    if (modalRoot) {
                        const buttons = Array.from(modalRoot.querySelectorAll('button'));
                        const cancelBtn = buttons.find((b) => (b.textContent || '').trim().toUpperCase() === 'CANCEL');
                        if (cancelBtn) (cancelBtn as HTMLButtonElement).click();
                    }
                }
            };
            const closeEditModal = () => {
                const cancelEditBtn = document.querySelector('button[aria-label="Cancel"]') as HTMLButtonElement | null;
                if (cancelEditBtn) cancelEditBtn.click();
            };
            if (stepIdx === 0) {
                closeDeployModal();
                closeEditModal();
                if (operations.sectors.length > 0) operations.sectors = [];
                return;
            }
            const initBtn = document.querySelector('[data-testid="initialize-sector-btn"]') as HTMLButtonElement | null;
            if (initBtn) initBtn.click();
            closeDeployModal();
            if (!operations.sectors || operations.sectors.length === 0) {
                operations.sectors = [JSON.parse(JSON.stringify(SANDBOX_DEMO_SECTOR))];
            } else if (!operations.sectors[0].pendingKaspa || operations.sectors[0].pendingKaspa <= 0) {
                operations.sectors = operations.sectors.map((s, idx) =>
                    idx === 0 ? { ...s, pendingKaspa: 48.25, allocationPercentage: 50.0 } : s
                );
            }
            const silosSection = document.querySelector('[data-testid="settlement-silos-section"]');
            const siloCards = silosSection
                ? (Array.from(silosSection.querySelectorAll('[data-testid^="sector-card-"]')) as HTMLElement[])
                : [];
            const targetSiloCard = siloCards[0] || null;
            let targetGearBtn: HTMLButtonElement | null = null;
            if (targetSiloCard) {
                targetSiloCard.setAttribute('data-tour-target', 'mod3-created-sector-card');
                targetGearBtn = targetSiloCard.querySelector('button[title="Configure Parameters"]') as HTMLButtonElement | null;
                if (targetGearBtn) targetGearBtn.setAttribute('data-tour-target', 'mod3-sector-gear-btn');
            }
            if (stepIdx === 1 || stepIdx === 2) {
                closeEditModal();
                return;
            }
            let editNameInput = document.querySelector('#editSectorNameInput') as HTMLInputElement | null;
            if (!editNameInput && targetGearBtn) {
                targetGearBtn.click();
                editNameInput = document.querySelector('#editSectorNameInput') as HTMLInputElement | null;
            }
            if (editNameInput) {
                const idSection = editNameInput.closest('div.flex.flex-col') as HTMLElement | null;
                if (idSection) idSection.setAttribute('data-tour-target', 'mod3-config-identifier');
                const routeBtn = document.querySelector('button[aria-label="Target Asset Route"]') as HTMLElement | null;
                if (routeBtn) routeBtn.setAttribute('data-tour-target', 'mod3-config-target-asset-btn');
                const modalRoot = editNameInput.closest('div.relative.z-10') as HTMLElement | null;
                if (modalRoot) {
                    const modalBtns = Array.from(modalRoot.querySelectorAll('button')) as HTMLButtonElement[];
                    const addSecondAssetBtn = modalBtns.find((b) =>
                        (b.textContent || '').toUpperCase().includes('ADD 2ND ASSET')
                    );
                    if (addSecondAssetBtn) {
                        addSecondAssetBtn.setAttribute('data-tour-target', 'mod3-config-add-second-asset-btn');
                    }
                    const reclaimBtn = modalBtns.find((b) =>
                        (b.textContent || '').toUpperCase().includes('RECLAIM TO KAS LEDGER')
                    );
                    if (reclaimBtn && reclaimBtn.parentElement) {
                        reclaimBtn.parentElement.setAttribute('data-tour-target', 'mod3-config-reclaim-box');
                    }
                }
                const destInput = document.querySelector('#destWallet') as HTMLElement | null;
                if (destInput && destInput.parentElement) {
                    destInput.parentElement.setAttribute('data-tour-target', 'mod3-config-dest-wallet');
                }
            }
            return;
        }

        if (chapter === 5) {
            if (ui.showWalletModal) ui.showWalletModal = false;
            if (!identity.isWalletConnected) ui.activateSandboxWalletSession();
            const workspace = document.querySelector('[data-tour="dex-workspace"]');
            if (!workspace) return;
            const workspaceButtons = Array.from(workspace.querySelectorAll('button')) as HTMLButtonElement[];
            const swapSubTabBtn = workspaceButtons.find((b) => (b.textContent || '').trim().toUpperCase() === 'SWAP');
            const liquiditySubTabBtn = workspaceButtons.find((b) => (b.textContent || '').trim().toUpperCase() === 'LIQUIDITY');
            if (liquiditySubTabBtn) liquiditySubTabBtn.setAttribute('data-tour-target', 'mod4-liquidity-tab-btn');
            if (stepIdx <= 5) {
                const receiveSelector = document.querySelector('[data-testid="dex-receive-token-selector"]') as HTMLButtonElement | null;
                if (!receiveSelector && swapSubTabBtn) swapSubTabBtn.click();
            }
            const payInput = document.querySelector('[data-testid="dex-pay-amount-input"]') as HTMLInputElement | null;
            if (payInput) {
                const swapStationCard = payInput.closest('div.rounded-\\[28px\\]') as HTMLElement | null;
                if (swapStationCard) swapStationCard.setAttribute('data-tour-target', 'mod4-swap-station-card');
            }
            if (stepIdx === 0 || stepIdx === 1) {
                this.hasFilledNvdaSwapQuote = false;
                const closeBtn = document.querySelector('button[aria-label="Close"]') as HTMLButtonElement | null;
                if (closeBtn) closeBtn.click();
                return;
            }
            if (stepIdx >= 2 && stepIdx <= 4) {
                let modalSearch = document.querySelector('[data-testid="dex-token-modal-search"]') as HTMLInputElement | null;
                if (!modalSearch) {
                    const receiveSelector = document.querySelector('[data-testid="dex-receive-token-selector"]') as HTMLButtonElement | null;
                    if (receiveSelector) {
                        receiveSelector.click();
                        modalSearch = document.querySelector('[data-testid="dex-token-modal-search"]') as HTMLInputElement | null;
                    }
                }
                if (modalSearch && modalSearch.parentElement) {
                    modalSearch.parentElement.setAttribute('data-tour-target', 'mod4-asset-modal-header');
                }
                if (stepIdx === 4) {
                    const nvdaBtn = document.querySelector('[data-testid="dex-select-token-NVDA"]');
                    if (!nvdaBtn) {
                        const equitiesCatBtn = document.querySelector('[data-testid="dex-modal-cat-EQUITIES"]') as HTMLButtonElement | null;
                        if (equitiesCatBtn) equitiesCatBtn.click();
                    }
                }
                return;
            }
            if (stepIdx === 5) {
                const modalSearch = document.querySelector('[data-testid="dex-token-modal-search"]');
                if (modalSearch) {
                    const nvdaBtn = document.querySelector('[data-testid="dex-select-token-NVDA"]') as HTMLButtonElement | null;
                    if (nvdaBtn) nvdaBtn.click();
                    else {
                        const closeBtn = document.querySelector('button[aria-label="Close"]') as HTMLButtonElement | null;
                        if (closeBtn) closeBtn.click();
                    }
                }
                if (payInput && !this.hasFilledNvdaSwapQuote) {
                    this.setNativeInputValue(payInput, '1000');
                    this.hasFilledNvdaSwapQuote = true;
                }
                const oracleRateEl = document.querySelector('[data-testid="dex-oracle-rate-readout"]');
                if (oracleRateEl) {
                    const telemetryBox = oracleRateEl.closest('div.rounded-2xl') as HTMLElement | null;
                    if (telemetryBox) telemetryBox.setAttribute('data-tour-target', 'mod4-swap-execution-panel');
                }
                return;
            }
            if (stepIdx === 7) {
                const lpKasInput = document.querySelector('[data-testid="dex-lp-kas-amount-input"]');
                if (!lpKasInput && liquiditySubTabBtn) liquiditySubTabBtn.click();
                const activeLpInput = document.querySelector('[data-testid="dex-lp-kas-amount-input"]');
                if (activeLpInput) {
                    const lpCard = activeLpInput.closest('div.lg\\:col-span-6') as HTMLElement | null;
                    if (lpCard) lpCard.setAttribute('data-tour-target', 'mod4-lp-provision-card');
                }
            }
            return;
        }

        if (chapter === 6) {
            if (ui.showWalletModal) ui.showWalletModal = false;
            if (!identity.isWalletConnected) ui.activateSandboxWalletSession();
            const vaultContainer = document.querySelector('[data-tour="treasury-vault"]');
            if (!vaultContainer) return;
            const allSpans = Array.from(vaultContainer.querySelectorAll('span'));
            const totalValueSpan = allSpans.find((s) =>
                (s.textContent || '').toUpperCase().includes('TOTAL VAULT VALUE')
            );
            if (totalValueSpan) {
                const summaryCard = totalValueSpan.closest('div.tactile-card') as HTMLElement | null;
                if (summaryCard) summaryCard.setAttribute('data-tour-target', 'mod5-vault-summary-card');
            }
            const searchInput = document.querySelector('[data-testid="treasury-token-search-input"]') as HTMLInputElement | null;
            if (searchInput) {
                const barCard = searchInput.closest('div.rounded-\\[24px\\]') as HTMLElement | null;
                if (barCard) barCard.setAttribute('data-tour-target', 'mod5-multichain-search-bar');
                else searchInput.setAttribute('data-tour-target', 'mod5-multichain-search-bar');
            }
            const airlockCard = document.querySelector('[data-testid="cold-vault-airlock-card"]') as HTMLElement | null;
            const toggleAirlockBtn = document.querySelector('[data-testid="toggle-cold-vault-airlock-btn"]') as HTMLButtonElement | null;
            const airlockAddrInput = document.querySelector('[data-testid="cold-vault-address-input"]');
            if ((stepIdx === 0 || stepIdx === 1) && airlockAddrInput && toggleAirlockBtn) {
                toggleAirlockBtn.click();
            }
            if (stepIdx >= 2 && stepIdx <= 4) {
                if (!airlockAddrInput && toggleAirlockBtn) toggleAirlockBtn.click();
                if (airlockCard) {
                    const leftPanel = airlockCard.querySelector('div.lg\\:col-span-7') as HTMLElement | null;
                    const rightPanel = airlockCard.querySelector('div.lg\\:col-span-5') as HTMLElement | null;
                    if (leftPanel) leftPanel.setAttribute('data-tour-target', 'mod5-airlock-left-panel');
                    if (rightPanel) rightPanel.setAttribute('data-tour-target', 'mod5-airlock-right-panel');
                }
            }
            if (stepIdx >= 5 && airlockAddrInput && toggleAirlockBtn) {
                toggleAirlockBtn.click();
            }
            const kasRow = document.querySelector('[data-testid="network-row-KAS"]') as HTMLElement | null;
            const withdrawBtn = document.querySelector('[data-testid="withdraw-l1-btn-KAS"]') as HTMLButtonElement | null;
            const activityBtn = document.querySelector('[data-testid="activity-btn-KAS"]') as HTMLButtonElement | null;
            if (stepIdx === 6 || stepIdx === 7) {
                const destInput = document.querySelector('[data-testid="l1-dest-input-KAS"]');
                if (!destInput && withdrawBtn) withdrawBtn.click();
            }
            if (stepIdx === 8) {
                const settledLink = kasRow?.querySelector('[data-testid="settled-payout-explorer-link"]');
                if (!settledLink && activityBtn) activityBtn.click();
            }
            if (kasRow) {
                const routingDrawer = kasRow.querySelector('div.rounded-\\[20px\\]') as HTMLElement | null;
                if (routingDrawer) routingDrawer.setAttribute('data-tour-target', 'mod5-kas-routing-drawer');
            }
            return;
        }

        if (chapter === 7) {
            if (ui.showWalletModal) ui.showWalletModal = false;
            if (!identity.isWalletConnected) ui.activateSandboxWalletSession();
            if (!ui.taxEvents || ui.taxEvents.length === 0) {
                ui.taxEvents = JSON.parse(JSON.stringify(SANDBOX_TAX_EVENTS));
            }
            const viewContainer = document.querySelector('[data-testid="tax-fortress-view"]') as HTMLElement | null;
            if (!viewContainer) return;
            const rateDisplay = viewContainer.querySelector('[data-testid="effective-tax-rate-display"]');
            if (rateDisplay) {
                const summaryGrid = rateDisplay.closest('div.grid') as HTMLElement | null;
                if (summaryGrid) summaryGrid.setAttribute('data-tour-target', 'mod6-summary-grid');
            }
            const pdfBtn = viewContainer.querySelector('[data-testid="generate-1099-pdf-btn"]') as HTMLElement | null;
            if (pdfBtn && pdfBtn.parentElement) {
                pdfBtn.parentElement.setAttribute('data-tour-target', 'mod6-export-buttons');
            }
            const hifoLotsBtn = viewContainer.querySelector('[data-testid="tax-mode-hifo-lots-btn"]') as HTMLButtonElement | null;
            if (hifoLotsBtn) {
                const tableCard = hifoLotsBtn.closest('div.rounded-\\[28px\\]') as HTMLElement | null;
                if (tableCard) tableCard.setAttribute('data-tour-target', 'mod6-ledger-table-card');
            }
            const configBtn = viewContainer.querySelector('[data-testid="configure-jurisdiction-btn"]') as HTMLButtonElement | null;
            let configForm = viewContainer.querySelector('[data-testid="jurisdiction-config-form"]') as HTMLElement | null;
            if ((stepIdx === 0 || stepIdx === 1) && configForm && configBtn) {
                configBtn.click();
                configForm = null;
            }
            if (stepIdx >= 2 && stepIdx <= 4) {
                if (!configForm && configBtn) {
                    configBtn.click();
                    configForm = viewContainer.querySelector('[data-testid="jurisdiction-config-form"]') as HTMLElement | null;
                }
                if (configForm) {
                    const countrySelect = configForm.querySelector('[data-testid="tax-country-select"]');
                    if (countrySelect) {
                        const selectorGrid = countrySelect.closest('div.grid') as HTMLElement | null;
                        if (selectorGrid) selectorGrid.setAttribute('data-tour-target', 'mod6-jurisdiction-selectors');
                    }
                    const legalNameInput = configForm.querySelector('#legalName');
                    if (legalNameInput) {
                        const piiGrid = legalNameInput.closest('div.grid') as HTMLElement | null;
                        if (piiGrid) piiGrid.setAttribute('data-tour-target', 'mod6-local-pii-row');
                    }
                }
            }
            if (stepIdx >= 5 && configForm && configBtn) {
                configBtn.click();
            }
            const escrowConfirmBtn = document.querySelector('[data-testid="confirm-tax-escrow-btn"]') as HTMLButtonElement | null;
            const escrowToggleBtn = viewContainer.querySelector('[data-testid="toggle-tax-escrow-btn"]') as HTMLButtonElement | null;
            if (stepIdx === 6 || stepIdx === 7) {
                if (!escrowConfirmBtn && escrowToggleBtn) escrowToggleBtn.click();
                const activeConfirmBtn = document.querySelector('[data-testid="confirm-tax-escrow-btn"]') as HTMLElement | null;
                if (activeConfirmBtn) {
                    const modalCard = activeConfirmBtn.closest('div.rounded-\\[28px\\]') as HTMLElement | null;
                    if (modalCard) modalCard.setAttribute('data-tour-target', 'mod6-escrow-modal-card');
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
}