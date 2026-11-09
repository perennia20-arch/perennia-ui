// WINDOWS (FRONTEND): C:\Users\send2\perennia-v5\perennia-frontend\src\lib\stores\tutorialRegistry.ts
import type { Worker, Sector } from './type';

export type TutorialInteractionMode = 'ACTION' | 'READ';
export type ChevronPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TutorialRelayStepSpec {
    id: string;
    chapter: number;
    stepIndex: number;
    totalChapterSteps: number;
    tab: string;
    mode: TutorialInteractionMode;
    targetSelector: string;
    fallbackSelector?: string;
    chevronPlacement?: ChevronPlacement;
    actionHint?: string;
    badge: string;
    title: string;
    description: string;
    bullets: string[];
    accentHex: string;
    advanceDelayMs?: number;
}

export interface TutorialChapterMeta {
    chapter: number;
    code: string;
    title: string;
    subtitle: string;
    tab: string;
    accentHex: string;
}

export const TUTORIAL_CHAPTERS: TutorialChapterMeta[] = [
    {
        chapter: 1,
        code: 'Wallet',
        title: 'Sign Up, Log In & Sovereign Wallet',
        subtitle: 'Create a new 24-word vault or log in with your saved password & .json backup',
        tab: 'OPERATIONS',
        accentHex: '#18C6A5'
    },
    {
        chapter: 2,
        code: 'SILO',
        title: 'Fiat Bridge, Buy SILO & 3-Tier Fee Shield',
        subtitle: 'Fund via Instant Bank/Card or Bank Wire, buy SILO, and unlock 1.50% → 0.75% → 0.25% fees',
        tab: 'DEX',
        accentHex: '#18C6A5'
    },
    {
        chapter: 3,
        code: 'Workers',
        title: 'ASIC Workers & Stratum Setup',
        subtitle: 'Add a worker, bridge Stratum, and inspect live hashrate, blocks & shares',
        tab: 'OPERATIONS',
        accentHex: '#18C6A5'
    },
    {
        chapter: 4,
        code: 'Sectors',
        title: 'Sectors, Silos & Liquidity Plants',
        subtitle: 'Partition your hashrate into custom sectors and walk through the Configuration Center',
        tab: 'OPERATIONS',
        accentHex: '#3B82F6'
    },
    {
        chapter: 5,
        code: 'Exchange',
        title: 'The Exchange (Swaps, 50%-KAS LP & Atomic P2P)',
        subtitle: 'Trade 24/7 crypto & equities, supply 50%-KAS liquidity, and post atomic P2P offers',
        tab: 'DEX',
        accentHex: '#F59E0B'
    },
    {
        chapter: 6,
        code: 'Treasury',
        title: 'Multi-Chain Treasury & Per-Token Cold Vault',
        subtitle: 'Inspect balances, configure per-token [Cold Vault] auto-sweeps, and view L1 payouts',
        tab: 'TREASURY',
        accentHex: '#3B82F6'
    },
    {
        chapter: 7,
        code: 'Tax',
        title: 'Zero-PII Tax Fortress, External Cost Basis & Settings',
        subtitle: 'Configure jurisdiction, protect Form 8949 with External Cost Basis, and set Language/FX',
        tab: 'TAX FORTRESS',
        accentHex: '#18C6A5'
    }
];

export const SANDBOX_MNEMONIC_WORDS: string[] = [
    'abandon', 'ability', 'able', 'about', 'above', 'absent',
    'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident',
    'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire',
    'across', 'act', 'action', 'actor', 'actress', 'art'
];

export const SANDBOX_WALLETS = {
    kaspa: {
        address: 'kaspa:qp9v8s7t6u5w4x3y2z0q9w8e7r6t5y4u3i2o1p0a9s8d7f6g5h4j3k2l1m0n9'
    },
    bitcoin: {
        address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
    },
    ethereum: {
        address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
    },
    solana: {
        address: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH'
    },
    doge: {
        address: 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L'
    },
    xrp: {
        address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
    },
    polygon: {
        address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
    },
    avalanche: {
        address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
    },
    sui: {
        address: '0x0000000000000000000000000000000000000000000000000000000000000001'
    },
    tron: {
        address: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'
    },
    zcash: {
        address: 't1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs'
    },
    arbitrum: {
        address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
    },
    base: {
        address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
    }
};

export const SANDBOX_ONLINE_WORKER: Worker = {
    id: 'TUT-WK1',
    type: 'physical',
    name: 'RIG-KS7-LITE',
    stratumUrl: 'stratum+tcp://pool.perennia.io:3334',
    walletWorker: `${SANDBOX_WALLETS.kaspa.address}.RIG-KS7-LITE`,
    hashRate: 4.2,
    isOnline: true,
    hardwareType: 'IceRiver KS7 Lite',
    sharesContributed: 14820,
    validShares: 14820,
    rejectedShares: 0,
    acceptancePct: 100.0,
    blocksFound: 2
};

export const SANDBOX_DEMO_SECTOR: Sector = {
    id: 'TUT-SILO-01',
    name: 'SILO-KAS-01',
    allocationPercentage: 50.0,
    routeMode: 'hold',
    pendingKaspa: 48.25,
    width: 6,
    settlementConfig: {
        targetAsset: {
            ticker: 'KAS',
            name: 'Kaspa',
            assetClass: 'Native L1',
            spotPrice: 0.165,
            theme: { hex: '#18C6A5', pastel: '#99f6e4' },
            imgUrl: '/assets/tokens/kas.svg'
        },
        targetAssets: [
            {
                ticker: 'KAS',
                name: 'Kaspa',
                assetClass: 'Native L1',
                spotPrice: 0.165,
                theme: { hex: '#18C6A5', pastel: '#99f6e4' },
                imgUrl: '/assets/tokens/kas.svg',
                weightPct: 100.0
            }
        ],
        plantWeights: { KAS: 100.0 },
        plantPair: 'KAS',
        payoutAddress: SANDBOX_WALLETS.kaspa.address,
        autoPayout: true,
        mode: 'threshold',
        threshold: 50,
        appointmentDate: '',
        appointmentTime: '17:00'
    }
};

export const SANDBOX_TAX_EVENTS = [
    {
        id: 'tut-tax-ev-1',
        timestamp: '10/20/2026, 22:00:00 UTC',
        recordedAtIso: '2026-10-20T22:00:00.000Z',
        type: 'Epoch L1 Payout',
        rawEventType: 'YIELD',
        asset: { ticker: 'KAS', color: '#18C6A5' },
        amount: 1000.0,
        usdValueAtTime: 180.0,
        costBasisUsd: 180.0,
        realizedGainLossUsd: 0.0,
        holdingPeriod: 'SHORT_TERM',
        spotPriceAtExecution: 0.18,
        txHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
        explorerUrl:
            'https://kas.fyi/transaction/a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
        l1Status: 'DISPATCHED_ONCHAIN'
    },
    {
        id: 'tut-tax-ev-2',
        timestamp: '10/24/2026, 22:00:00 UTC',
        recordedAtIso: '2026-10-24T22:00:00.000Z',
        type: 'Epoch L1 Payout',
        rawEventType: 'YIELD',
        asset: { ticker: 'KAS', color: '#18C6A5' },
        amount: 1000.0,
        usdValueAtTime: 150.0,
        costBasisUsd: 150.0,
        realizedGainLossUsd: 0.0,
        holdingPeriod: 'SHORT_TERM',
        spotPriceAtExecution: 0.15,
        txHash: 'b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef01',
        explorerUrl:
            'https://kas.fyi/transaction/b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef01',
        l1Status: 'DISPATCHED_ONCHAIN'
    },
    {
        id: 'tut-tax-ev-3',
        timestamp: '10/28/2026, 16:30:00 UTC',
        recordedAtIso: '2026-10-28T16:30:00.000Z',
        type: 'DEX Swap',
        rawEventType: 'DEX_SWAP',
        asset: { ticker: 'KAS', color: '#18C6A5' },
        amount: 500.0,
        usdValueAtTime: 95.0,
        costBasisUsd: 90.0,
        realizedGainLossUsd: 5.0,
        holdingPeriod: 'SHORT_TERM',
        spotPriceAtExecution: 0.19,
        txHash: 'c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef012',
        explorerUrl:
            'https://kas.fyi/transaction/c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef012',
        l1Status: 'DISPATCHED_ONCHAIN'
    }
];

export const SANDBOX_TREASURY_PRICES: Array<{
    ticker: string;
    spotPrice: number;
    delta: number;
    onChain: number;
    synthetic: number;
    lpStaked: number;
    address: string;
}> = [
    {
        ticker: 'KAS',
        spotPrice: 0.165,
        delta: 4.82,
        onChain: 14520.0,
        synthetic: 640.5,
        lpStaked: 4200.0,
        address: SANDBOX_WALLETS.kaspa.address
    },
    {
        ticker: 'SILO',
        spotPrice: 0.042,
        delta: 8.4,
        onChain: 25000.0,
        synthetic: 5000.0,
        lpStaked: 15000.0,
        address: SANDBOX_WALLETS.kaspa.address
    },
    {
        ticker: 'USDC',
        spotPrice: 1.0,
        delta: 0.01,
        onChain: 1250.0,
        synthetic: 340.0,
        lpStaked: 693.0,
        address: SANDBOX_WALLETS.ethereum.address
    },
    {
        ticker: 'BTC',
        spotPrice: 94250.0,
        delta: 2.15,
        onChain: 0.085,
        synthetic: 0.012,
        lpStaked: 0,
        address: SANDBOX_WALLETS.bitcoin.address
    },
    {
        ticker: 'ETH',
        spotPrice: 3180.0,
        delta: 1.94,
        onChain: 1.45,
        synthetic: 0.25,
        lpStaked: 0,
        address: SANDBOX_WALLETS.ethereum.address
    },
    {
        ticker: 'SOL',
        spotPrice: 192.4,
        delta: 5.12,
        onChain: 18.5,
        synthetic: 3.2,
        lpStaked: 0,
        address: SANDBOX_WALLETS.solana.address
    },
    {
        ticker: 'NVDA',
        spotPrice: 142.85,
        delta: 3.45,
        onChain: 6.0,
        synthetic: 1.5,
        lpStaked: 4.85,
        address: SANDBOX_WALLETS.base.address
    },
    {
        ticker: 'SPY',
        spotPrice: 598.2,
        delta: 0.88,
        onChain: 2.0,
        synthetic: 0.5,
        lpStaked: 0,
        address: SANDBOX_WALLETS.base.address
    },
    {
        ticker: 'QQQ',
        spotPrice: 518.6,
        delta: 1.12,
        onChain: 1.5,
        synthetic: 0.25,
        lpStaked: 0,
        address: SANDBOX_WALLETS.base.address
    },
    {
        ticker: 'XAU',
        spotPrice: 2745.0,
        delta: 0.65,
        onChain: 0.5,
        synthetic: 0.1,
        lpStaked: 0,
        address: SANDBOX_WALLETS.ethereum.address
    },
    {
        ticker: 'USTB',
        spotPrice: 104.25,
        delta: 0.04,
        onChain: 10.0,
        synthetic: 2.0,
        lpStaked: 0,
        address: SANDBOX_WALLETS.ethereum.address
    }
];

export const CHAPTER_STEPS_REGISTRY: Record<number, TutorialRelayStepSpec[]> = {
    1: [
        {
            id: 'wallet_step0_click_unlock_vault',
            chapter: 1,
            stepIndex: 0,
            totalChapterSteps: 9,
            tab: 'OPERATIONS',
            mode: 'ACTION',
            targetSelector: '[data-tour-target="mod1-unlock-vault-btn"]',
            fallbackSelector: 'header button',
            chevronPlacement: 'bottom',
            actionHint: 'Click Unlock Vault',
            badge: 'Wallet • Step 1 of 9',
            title: 'How to Sign Up or Log In to Perennia',
            description:
                'Welcome to Perennia. Instead of usernames, emails, or browser extensions, Perennia uses a built-in, non-custodial 11-chain Sovereign Wallet. Click [Unlock Vault] in the top-right header to open the login and sign-up window.',
            bullets: [
                'Self-Custodial by Design: Your single vault holds your KAS, SILO tokens, BTC, ETH, SOL, USDC, and Wall Street assets.',
                'Click the highlighted [Unlock Vault] button in the top-right corner.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 260
        },
        {
            id: 'wallet_step1_demonstrate_wallet_menu',
            chapter: 1,
            stepIndex: 1,
            totalChapterSteps: 9,
            tab: 'OPERATIONS',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod1-wallet-menu-options"]',
            fallbackSelector: '[role="dialog"]',
            badge: 'Wallet • Step 2 of 9',
            title: 'Signing Up (New Users) vs. Logging In (Returning Users)',
            description:
                'Here is the Sovereign Matrix Vault switchboard. Depending on whether you are a brand-new visitor or returning to your account, here is how you access your wallet:',
            bullets: [
                'Sign Up (New 24-Word Vault): Generates a brand-new 24-word recovery phrase and creates your 11-chain wallet addresses.',
                'Log In on This Device: Once created, your encrypted vault stays saved in your browser so you simply enter your password to log in.',
                'Log In on Another Computer: Use [Import Encrypted Vault (.json)] or [Import Seed Phrase] to restore your account anywhere. Click [Next →] to sign up.'
            ],
            accentHex: '#18C6A5'
        },
        {
            id: 'wallet_step2_click_new_vault',
            chapter: 1,
            stepIndex: 2,
            totalChapterSteps: 9,
            tab: 'OPERATIONS',
            mode: 'ACTION',
            targetSelector: '[data-tour-target="mod1-new-vault-btn"]',
            fallbackSelector: '[role="dialog"] button',
            chevronPlacement: 'top',
            actionHint: 'Click New 24-Word Vault',
            badge: 'Wallet • Step 3 of 9',
            title: 'Sign Up: Click New 24-Word Vault',
            description:
                'Click the highlighted [New 24-Word Vault] button to create a new Sovereign Wallet.',
            bullets: [
                'One 24-word phrase automatically derives your Kaspa, SILO (KRC-20), Bitcoin, Ethereum, Solana, XRP, Dogecoin, Polygon, Avalanche, Sui, TRON, and Zcash addresses.',
                'Click the highlighted [New 24-Word Vault] button.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 260
        },
        {
            id: 'wallet_step3_demonstrate_password',
            chapter: 1,
            stepIndex: 3,
            totalChapterSteps: 9,
            tab: 'OPERATIONS',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod1-password-form"]',
            fallbackSelector: '[role="dialog"]',
            badge: 'Wallet • Step 4 of 9',
            title: 'Create Your Daily Login Password',
            description:
                'We have pre-filled a sandbox password for this tour. When you sign up for real, you will choose a password (8+ characters) that acts as your daily login key on this device.',
            bullets: [
                'Local AES-256-GCM Encryption: Your password encrypts your 24-word seed phrase inside your browser so you can log in with just your password next time.',
                'Zero Server Knowledge: Perennia never receives your password or private keys.',
                'Click [Next →] below to generate your 24-word recovery seed.'
            ],
            accentHex: '#18C6A5'
        },
        {
            id: 'wallet_step4_click_generate_seed',
            chapter: 1,
            stepIndex: 4,
            totalChapterSteps: 9,
            tab: 'OPERATIONS',
            mode: 'ACTION',
            targetSelector: '[data-tour-target="mod1-generate-seed-btn"]',
            fallbackSelector: '[role="dialog"] button[type="submit"]',
            chevronPlacement: 'top',
            actionHint: 'Click Generate 24-Word Seed',
            badge: 'Wallet • Step 5 of 9',
            title: 'Generate Your 24-Word Recovery Seed',
            description:
                'Click the highlighted [Generate 24-Word Seed →] button to forge your 11-chain cryptographic keys locally in your browser.',
            bullets: [
                'Your browser uses WebCrypto entropy to generate 24 random BIP-39 words and derive your public addresses.',
                'Click the highlighted [Generate 24-Word Seed →] button.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 900
        },
        {
            id: 'wallet_step5_demonstrate_seed_grid',
            chapter: 1,
            stepIndex: 5,
            totalChapterSteps: 9,
            tab: 'OPERATIONS',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod1-seed-grid"]',
            fallbackSelector: '[role="dialog"]',
            badge: 'Wallet • Step 6 of 9',
            title: 'Safeguard Your 24-Word Recovery Phrase',
            description:
                'Here is your 24-word recovery seed phrase. These 24 words are the master key to your account—if you ever clear your browser or switch computers, these words restore your entire wallet.',
            bullets: [
                'Shown Only Once: Perennia never stores these words on a server and never displays your raw seed phrase again after sign-up.',
                'Write Them Down Offline: Write all 24 words in exact numerical order (01 to 24) on paper or steel and store them safely offline.',
                'Click [Next →] below after inspecting the 24-word grid.'
            ],
            accentHex: '#F59E0B'
        },
        {
            id: 'wallet_step6_demonstrate_backups',
            chapter: 1,
            stepIndex: 6,
            totalChapterSteps: 9,
            tab: 'OPERATIONS',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod1-backup-controls"]',
            fallbackSelector: '[role="dialog"]',
            badge: 'Wallet • Step 7 of 9',
            title: 'Save Your Encrypted .JSON Login File',
            description:
                'Directly below your 24 words is your derived Kaspa Public Address along with three backup utilities:',
            bullets: [
                'Save .JSON Backup: Downloads your password-encrypted vault file (`perennia-vault.json`). Keep this file so you can log in on any device in one click using your password.',
                'Copy 24 Words & Copy Address: Quickly copy your recovery phrase or public Kaspa address.',
                'Click [Next →] below to proceed to the 2-word verification check.'
            ],
            accentHex: '#18C6A5'
        },
        {
            id: 'wallet_step7_click_proceed_verify',
            chapter: 1,
            stepIndex: 7,
            totalChapterSteps: 9,
            tab: 'OPERATIONS',
            mode: 'ACTION',
            targetSelector: '[data-tour-target="mod1-proceed-verify-btn"]',
            fallbackSelector: '[role="dialog"] button',
            chevronPlacement: 'top',
            actionHint: 'Click Proceed to 2-Word Test',
            badge: 'Wallet • Step 8 of 9',
            title: 'Proceed to the 2-Word Verification Check',
            description:
                'To ensure you recorded your recovery phrase before the raw words are wiped from memory, click [I Wrote Down My Seed — Proceed to 2-Word Test →].',
            bullets: [
                'This quick check guarantees you can always recover your account.',
                'Click the highlighted button to continue.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 260
        },
        {
            id: 'wallet_step8_verify_and_unlock',
            chapter: 1,
            stepIndex: 8,
            totalChapterSteps: 9,
            tab: 'OPERATIONS',
            mode: 'ACTION',
            targetSelector: '[data-tour-target="mod1-verify-submit-btn"]',
            fallbackSelector: '[role="dialog"] button[type="submit"]',
            chevronPlacement: 'top',
            actionHint: 'Click Verify & Unlock Vault',
            badge: 'Wallet • Step 9 of 9',
            title: 'Verify Your Seed & Log In to Your Vault',
            description:
                'We have filled in the two requested words from your sandbox phrase. Click [Verify & Unlock Sovereign Vault ✓] to complete sign-up and move directly to the Fiat Bridge & SILO Fee Shield!',
            bullets: [
                'Once verified, your wallet unlocks in the top-right header (`UNLOCKED`).',
                'Click the highlighted [Verify & Unlock Sovereign Vault ✓] button.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 320
        }
    ],
    2: [
        {
            id: 'silo_step0_demonstrate_fiat_onramp',
            chapter: 2,
            stepIndex: 0,
            totalChapterSteps: 13,
            tab: 'DEX',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod2silo-fiat-onramp-panel"]',
            fallbackSelector: '[data-testid="fiat-step1-calculator-card"]',
            badge: 'SILO & Fiat • Step 1 of 13',
            title: 'Step 1: Instant Bank / Card vs. Bank Wire Settlement',
            description:
                'The Fiat Bridge lets you buy SILO, KAS, BTC, ETH, SOL, USDC, or 24/7 Wall Street assets directly with USD while keeping 100% self-custody:',
            bullets: [
                'Instant Bank / Card (Stripe Onramp & ACH): Link your checking or savings account (Mod-10 ABA verified) or use a card for immediate purchase execution.',
                'Bank Wire (Bridge Virtual Account): Generates a dedicated commercial virtual account and wire memo for same-day wire settlement ($15 wire fee waived on orders ≥$2,500).',
                'Locked USD Input & Dynamic Shading: Switching tokens dynamically shades the card in that asset’s theme color without ever resetting your USD amount. Click [Next →] to create an order.'
            ],
            accentHex: '#18C6A5'
        },
        {
            id: 'silo_step1_click_generate_onramp_order',
            chapter: 2,
            stepIndex: 1,
            totalChapterSteps: 13,
            tab: 'DEX',
            mode: 'ACTION',
            targetSelector: '[data-testid="fiat-generate-pass-cta"]',
            fallbackSelector: '[data-tour-target="mod2silo-onramp-submit-btn"]',
            chevronPlacement: 'top',
            actionHint: 'Click Buy KAS / Generate Order',
            badge: 'SILO & Fiat • Step 2 of 13',
            title: 'Execute Your Direct Bank Purchase Order',
            description:
                'Click the highlighted [Buy KAS →] button at the bottom of the Fiat Bridge to lock your quote and generate your settlement receipt.',
            bullets: [
                'You can choose delivery directly to your Self-Custody Wallet (L1), Platform Balance ($0 Gas), or 1-Click Auto-Stake SILO.',
                'Click the highlighted purchase button to see your settlement receipt.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 320
        },
        {
            id: 'silo_step2_demonstrate_onramp_receipt',
            chapter: 2,
            stepIndex: 2,
            totalChapterSteps: 13,
            tab: 'DEX',
            mode: 'READ',
            targetSelector: '[data-testid="fiat-settlement-pass-card"]',
            fallbackSelector: '[data-tour-target="mod2silo-onramp-receipt-card"]',
            badge: 'SILO & Fiat • Step 3 of 13',
            title: 'Your 4-Stage Settlement Receipt & Printable Wire Slip PDF',
            description:
                'Here is your active settlement receipt with a real-time 4-stage progress tracker (1. Verified → 2. Cleared → 3. Executed → 4. Credited):',
            bullets: [
                'Automated Token Delivery: As soon as your ACH debit or bank wire clears, Perennia’s settlement engine delivers your tokens and stamps a HIFO cost-basis lot automatically.',
                '[Download Wire Slip PDF ↓]: Generates a clean, zero-PII PDF receipt containing your order reference ID, fee breakdown, and bank wire coordinates.',
                'Click [Next →] to see how selling crypto back to your bank account works.'
            ],
            accentHex: '#18C6A5'
        },
        {
            id: 'silo_step3_click_offramp_tab',
            chapter: 2,
            stepIndex: 3,
            totalChapterSteps: 13,
            tab: 'DEX',
            mode: 'ACTION',
            targetSelector: '[data-testid="fiat-offramp-tab-btn"]',
            fallbackSelector: '[data-tour="dex-workspace"] button',
            chevronPlacement: 'top',
            actionHint: 'Click Sell for USD',
            badge: 'SILO & Fiat • Step 4 of 13',
            title: 'Switch to Sell for USD (Bank Off-Ramp)',
            description:
                'Click the highlighted [Sell for USD] tab at the top of the Fiat Bridge to inspect direct crypto-to-bank payouts.',
            bullets: [
                'Sell from either your Self-Custody Wallet (1-click browser L1 signature) or your Platform Balance ($0 gas) straight to your bank via ACH or Same-Day Wire.',
                'Click the highlighted [Sell for USD] tab.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 260
        },
        {
            id: 'silo_step4_demonstrate_bank_rail_vault',
            chapter: 2,
            stepIndex: 4,
            totalChapterSteps: 13,
            tab: 'DEX',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod2silo-bank-rail-vault"]',
            fallbackSelector: '[data-testid="offramp-aba-input"]',
            badge: 'SILO & Fiat • Step 5 of 13',
            title: 'Encrypted Bank Rail Vault (Federal Reserve Mod-10 Verified)',
            description:
                'We have entered a sample 9-digit ABA routing number (111000614) to demonstrate instant institution recognition:',
            bullets: [
                'Mod-10 Checksum Verification: Perennia validates your 9-digit routing number locally and identifies your bank (JPMorgan Chase Bank, N.A. • MOD-10 VALID).',
                'AES-256-GCM Encrypted Vault: Saving your bank account encrypts your routing and account numbers so you can cash out any asset to USD in one click.',
                'Now let’s purchase and stake SILO tokens—click [Next →] to continue!'
            ],
            accentHex: '#3B82F6'
        },
        {
            id: 'silo_step5_click_swap_tab',
            chapter: 2,
            stepIndex: 5,
            totalChapterSteps: 13,
            tab: 'DEX',
            mode: 'ACTION',
            targetSelector: '[data-testid="dex-mode-swap-btn"]',
            fallbackSelector: '[data-tour-target="mod2silo-swap-tab-btn"]',
            chevronPlacement: 'bottom',
            actionHint: 'Click Swap Tab',
            badge: 'SILO & Fiat • Step 6 of 13',
            title: 'Step 2: Open the Swap Tab to Purchase SILO',
            description:
                'Click the highlighted [Swap] tab at the top of the Exchange to purchase SILO—Perennia’s native KRC-20 utility and fee-discount token.',
            bullets: [
                'You can buy SILO with USD in the Fiat modal or swap into SILO instantly from KAS or USDC.',
                'Click the highlighted [Swap] tab.'
            ],
            accentHex: '#F59E0B',
            advanceDelayMs: 260
        },
        {
            id: 'silo_step6_open_receive_selector',
            chapter: 2,
            stepIndex: 6,
            totalChapterSteps: 13,
            tab: 'DEX',
            mode: 'ACTION',
            targetSelector: '[data-testid="dex-receive-token-selector"]',
            fallbackSelector: '[data-tour="dex-workspace"] button',
            chevronPlacement: 'left',
            actionHint: 'Click Receive Token Selector',
            badge: 'SILO & Fiat • Step 7 of 13',
            title: 'Open the Asset Selector to Pick SILO',
            description:
                'In the Swap Station, your [You Pay] asset is set to KAS. Click the highlighted token selector button inside the [You Receive] box to choose SILO.',
            bullets: [
                'SILO is listed at the top of the Asset Selection drawer as Perennia’s native Ecosystem utility token.',
                'Click the highlighted token selector button.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 260
        },
        {
            id: 'silo_step7_select_silo_token',
            chapter: 2,
            stepIndex: 7,
            totalChapterSteps: 13,
            tab: 'DEX',
            mode: 'ACTION',
            targetSelector: '[data-testid="dex-select-token-SILO"]',
            fallbackSelector: '[data-testid^="dex-select-token-"]',
            chevronPlacement: 'top',
            actionHint: 'Click SILO Row',
            badge: 'SILO & Fiat • Step 8 of 13',
            title: 'Select SILO (Perennia Silo Utility KRC-20)',
            description:
                'Click the highlighted [SILO — Perennia Silo Utility (KRC-20)] row in the Asset Drawer to configure the KAS → SILO swap pair.',
            bullets: [
                'Selecting SILO binds it to the Receive panel and shades the card in SILO’s signature teal glow.',
                'Click the highlighted [SILO] row.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 280
        },
        {
            id: 'silo_step8_demonstrate_silo_quote',
            chapter: 2,
            stepIndex: 8,
            totalChapterSteps: 13,
            tab: 'DEX',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod2silo-swap-station-card"]',
            fallbackSelector: '[data-testid="dex-oracle-rate-readout"]',
            badge: 'SILO & Fiat • Step 9 of 13',
            title: 'Inspect Your KAS → SILO Purchase Quote',
            description:
                'We have entered 1,000 KAS in the [You Pay] box so you can see the live SILO conversion quote:',
            bullets: [
                'Live Oracle Rate: 1,000 KAS converts into ~3,928.57 SILO at the live oracle rate (1 KAS = 23.809524 SILO).',
                '1-Click Self-Custody or Platform Execution: Swaps from your Platform Balance execute with $0 gas; swaps from your L1 wallet use a 1-click local browser signature.',
                'Click [Next →] to execute your SILO token purchase!'
            ],
            accentHex: '#18C6A5'
        },
        {
            id: 'silo_step9_click_execute_silo_swap',
            chapter: 2,
            stepIndex: 9,
            totalChapterSteps: 13,
            tab: 'DEX',
            mode: 'ACTION',
            targetSelector: '[data-testid="dex-execute-swap-btn"]',
            fallbackSelector: '[data-tour="dex-workspace"] button',
            chevronPlacement: 'top',
            actionHint: 'Click Review & Execute KAS → SILO Swap',
            badge: 'SILO & Fiat • Step 10 of 13',
            title: 'Execute Your SILO Token Purchase',
            description:
                'Click the highlighted [Review & Execute KAS → SILO Swap] button at the bottom of the Swap Station to complete your SILO purchase.',
            bullets: [
                'Your purchased SILO tokens are credited immediately to your Sovereign Vault balance.',
                'Click the highlighted [Review & Execute KAS → SILO Swap] button.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 360
        },
        {
            id: 'silo_step10_click_liquidity_tab',
            chapter: 2,
            stepIndex: 10,
            totalChapterSteps: 13,
            tab: 'DEX',
            mode: 'ACTION',
            targetSelector: '[data-testid="dex-mode-lp-btn"]',
            fallbackSelector: '[data-tour-target="mod2silo-liquidity-tab-btn"]',
            chevronPlacement: 'bottom',
            actionHint: 'Click Liquidity Tab',
            badge: 'SILO & Fiat • Step 11 of 13',
            title: 'Step 3: Open Liquidity to Stake SILO & Lower Your Fees',
            description:
                'Your SILO purchase is confirmed! Now let’s stake SILO to unlock permanent protocol fee discounts. Click the highlighted [Liquidity] tab at the top of the Exchange.',
            bullets: [
                'The Liquidity workspace houses the Supply Liquidity card on the left and the 3-Tier SILO Fee Shield card on the right.',
                'Click the highlighted [Liquidity] tab.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 280
        },
        {
            id: 'silo_step11_click_stake_silo',
            chapter: 2,
            stepIndex: 11,
            totalChapterSteps: 13,
            tab: 'DEX',
            mode: 'ACTION',
            targetSelector: '[data-testid="silo-stake-submit-btn"]',
            fallbackSelector: '[data-testid="silo-staking-card"] button',
            chevronPlacement: 'top',
            actionHint: 'Click Stake SILO →',
            badge: 'SILO & Fiat • Step 12 of 13',
            title: 'How the 3-Tier SILO Fee Shield Works (1.50% → 0.75% → 0.25%)',
            description:
                'Look at the three visual fee tier pills at the top of the SILO Fee Tier card (`1.50%` at `0 SILO`, `0.75%` at `10k+ SILO`, and `0.25%` at `100k+ SILO`). We have pre-filled 15,000 SILO—click [Stake SILO →] to unlock the 0.75% fee tier:',
            bullets: [
                'Standard Tier (0 SILO): 1.50% base fee across swaps and 22:00 UTC settlements.',
                'Shield Tier (10k+ SILO): Cuts your protocol fee in half to 0.75%.',
                'Sovereign Tier (100k+ SILO): Slashes your protocol fee down to 0.25%. Click [Stake SILO →] now.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 360
        },
        {
            id: 'silo_step12_demonstrate_active_fee_shield',
            chapter: 2,
            stepIndex: 12,
            totalChapterSteps: 13,
            tab: 'DEX',
            mode: 'READ',
            targetSelector: '[data-testid="silo-staking-card"]',
            fallbackSelector: '[data-tour="dex-workspace"]',
            badge: 'SILO & Fiat • Step 13 of 13',
            title: 'Your 0.75% SILO Fee Shield Is Active!',
            description:
                'Look at the SILO Fee Tier card: the middle `0.75% (10k+ SILO)` pill is now highlighted in teal, and your header badge reads `0.75% Active Fee`.',
            bullets: [
                'Automatic Global Discount: Every swap and 22:00 UTC settlement across Perennia now automatically applies your 0.75% SILO Fee Shield.',
                '7-Day Unstake Cooldown: You can click [Unstake (7d)] on any staked position at any time to initiate the 7-day cooldown and withdraw your SILO.',
                'Click [Next →] below to head to Operations and set up your ASIC Workers!'
            ],
            accentHex: '#18C6A5'
        }
    ],
    3: [
        {
            id: 'workers_step0_click_add',
            chapter: 3,
            stepIndex: 0,
            totalChapterSteps: 10,
            tab: 'OPERATIONS',
            mode: 'ACTION',
            targetSelector: '[data-tour-target="mod2-add-worker-btn"]',
            fallbackSelector: '[data-tour="workers-panel"] button',
            chevronPlacement: 'right',
            actionHint: 'Click + Add Worker',
            badge: 'Workers • Step 1 of 10',
            title: 'Add Your First ASIC Worker',
            description:
                'You are starting on a clean blank slate with 0.00 TH/s. Click [+ Add Worker] in the left column to deploy your first ASIC worker card.',
            bullets: [
                'Each worker card represents a physical Kaspa ASIC miner in your fleet.',
                'Click the highlighted [+ Add Worker] button to create your worker card.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 280
        },
        {
            id: 'workers_step1_demonstrate_card',
            chapter: 3,
            stepIndex: 1,
            totalChapterSteps: 10,
            tab: 'OPERATIONS',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod2-active-worker-card"]',
            fallbackSelector: '[data-tour="workers-panel"]',
            badge: 'Workers • Step 2 of 10',
            title: 'Here Is Your New Worker Card',
            description:
                'Your worker card is now in position. Notice that its status dot is grey and its Live Hash is 0.00 TH/s because we have not bridged our Stratum credentials yet.',
            bullets: [
                'Worker Header: Displays your rig’s name, connection indicator, and selected ASIC hardware badge.',
                'Next, we will open the worker menu to name this rig, select our ASIC model, and copy our Stratum connection details.',
                'Click [Next →] below to continue.'
            ],
            accentHex: '#18C6A5'
        },
        {
            id: 'workers_step2_open_menu',
            chapter: 3,
            stepIndex: 2,
            totalChapterSteps: 10,
            tab: 'OPERATIONS',
            mode: 'ACTION',
            targetSelector: '[data-tour-target="mod2-worker-options-btn"]',
            fallbackSelector: 'button[aria-label="Worker Options"]',
            chevronPlacement: 'right',
            actionHint: 'Click [⋮] Worker Options',
            badge: 'Workers • Step 3 of 10',
            title: 'Open the Worker Setup Menu',
            description:
                'Click the [⋮] button in the top-right corner of your worker card to open its configuration drawer.',
            bullets: [
                'This drawer lets you rename the worker, choose your ASIC model, and copy your Stratum URL and Wallet.Worker identity.',
                'Click the highlighted [⋮] button on your worker card.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 240
        },
        {
            id: 'workers_step3_rename_worker',
            chapter: 3,
            stepIndex: 3,
            totalChapterSteps: 10,
            tab: 'OPERATIONS',
            mode: 'ACTION',
            targetSelector: '[data-tour-target="mod2-rename-worker-btn"]',
            fallbackSelector: '[role="menu"] button',
            chevronPlacement: 'right',
            actionHint: 'Click Rename Worker',
            badge: 'Workers • Step 4 of 10',
            title: 'Name Your Worker Card',
            description:
                'Click [Rename Worker] at the top of the menu to give your rig a clear name (such as "RIG-KS7-LITE").',
            bullets: [
                'Renaming your worker card automatically updates your Wallet.Worker username below.',
                'Click the highlighted [Rename Worker] button.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 280
        },
        {
            id: 'workers_step4_open_asic_picker',
            chapter: 3,
            stepIndex: 4,
            totalChapterSteps: 10,
            tab: 'OPERATIONS',
            mode: 'ACTION',
            targetSelector: '[data-tour-target="mod2-miner-type-btn"]',
            fallbackSelector: '[role="menu"] button',
            chevronPlacement: 'right',
            actionHint: 'Click Miner Type (Select ASIC)',
            badge: 'Workers • Step 5 of 10',
            title: 'Open the ASIC Hardware List',
            description:
                'Click [Miner Type (Select ASIC)] to open the hardware catalog and match your physical miner.',
            bullets: [
                'Perennia uses your ASIC model to assign the ideal Stratum port for your hashrate tier.',
                'Click the highlighted [Miner Type (Select ASIC)] row.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 260
        },
        {
            id: 'workers_step5_select_asic_model',
            chapter: 3,
            stepIndex: 5,
            totalChapterSteps: 10,
            tab: 'OPERATIONS',
            mode: 'ACTION',
            targetSelector: '[data-tour-target="mod2-asic-model-choice"]',
            fallbackSelector: '[role="menu"] button',
            chevronPlacement: 'right',
            actionHint: 'Click IceRiver KS7 Lite',
            badge: 'Workers • Step 6 of 10',
            title: 'Select Your ASIC Model',
            description:
                'Click the highlighted [IceRiver KS7 Lite] model in the catalog to bind its hardware profile and automatically configure Port :3334.',
            bullets: [
                'Port :3332 is tuned for <1 TH/s rigs (KS0 / KS0 Pro / Ultra), :3333 for 1–10 TH/s rigs, and :3334 for high-hashrate ASICs.',
                'Click the highlighted ASIC model in the list.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 360
        },
        {
            id: 'workers_step6_copy_stratum',
            chapter: 3,
            stepIndex: 6,
            totalChapterSteps: 10,
            tab: 'OPERATIONS',
            mode: 'ACTION',
            targetSelector: '[data-tour-target="mod2-copy-stratum-btn"]',
            fallbackSelector: '[role="menu"] button[title*="Stratum"]',
            chevronPlacement: 'right',
            actionHint: 'Click to Copy Stratum URL',
            badge: 'Workers • Step 7 of 10',
            title: 'Bridge Your Stratum URL & Wallet.Worker',
            description:
                'Click the highlighted [Stratum Address] box to copy your pool URL. Paste this URL and the Wallet.Worker string below it into your ASIC miner’s dashboard.',
            bullets: [
                'Stratum Address goes into your miner’s "Pool URL" field, and Wallet.Worker goes into the "User / Worker" field.',
                'Click the highlighted [Stratum Address] box to copy it and watch your worker come online.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 380
        },
        {
            id: 'workers_step7_demonstrate_worker_telemetry',
            chapter: 3,
            stepIndex: 7,
            totalChapterSteps: 10,
            tab: 'OPERATIONS',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod2-worker-telemetry-row"]',
            fallbackSelector: '[data-tour-target="mod2-active-worker-card"]',
            badge: 'Workers • Step 8 of 10',
            title: 'Worker Telemetry: Live Hashrate, Blocks & Shares',
            description:
                'Your worker is now online and hashing! Take a look at the three live telemetry counters along the bottom of your worker card:',
            bullets: [
                'Live Hash (4.20 TH/s): Displays the real-time hashrate your ASIC is delivering to the pool.',
                'Blocks (2): Tracks how many L1 Kaspa blocks this specific machine has hit.',
                'Shares (14,820): Counts the verified difficulty shares accepted from this worker. Click [Next →] to see your aggregate pool total.'
            ],
            accentHex: '#18C6A5'
        },
        {
            id: 'workers_step8_demonstrate_aggregate_hashrate',
            chapter: 3,
            stepIndex: 8,
            totalChapterSteps: 10,
            tab: 'OPERATIONS',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod2-master-pool-telemetry"]',
            fallbackSelector: '[data-tour="workers-panel"]',
            badge: 'Workers • Step 9 of 10',
            title: 'Your Aggregate Total Hashrate',
            description:
                'At the very top of the left column is your Master Pool Telemetry card, which sums the combined power of every active worker in your fleet.',
            bullets: [
                'Aggregate TH/s: Every worker you add stacks into this master hashrate readout (now showing 4.20 TH/s and 14,820 Verified Shares).',
                'This combined total is the exact pool of hashpower available for you to route across your Settlement Silos and Liquidity Plants.',
                'Click [Next →] to see how you can partition your hashrate into sectors.'
            ],
            accentHex: '#F59E0B'
        },
        {
            id: 'workers_step9_explain_sector_partitioning',
            chapter: 3,
            stepIndex: 9,
            totalChapterSteps: 10,
            tab: 'OPERATIONS',
            mode: 'READ',
            targetSelector: '[data-tour="bell-telemetry"]',
            fallbackSelector: '[data-tour="sector-matrix"]',
            badge: 'Workers • Step 10 of 10',
            title: 'Pool Distribution & 22:00 UTC Global Settlement',
            description:
                'Look at the Pool Distribution ring on the right sidebar. With 0 custom sectors created, 100.0% of your aggregate hashrate streams directly to your Kaspa wallet and pays out at 50 KAS.',
            bullets: [
                'Single-Sided Liquidity Routing: You can divide your aggregate hashrate into custom sectors—routing part of your mining power into USDC, BTC, ETH, SILO, 24/7 Wall Street Equities, or 50%-KAS Liquidity Plants.',
                'In the next section, we will click [+ Break Off Sector] to create your first sector and walk through the Configuration Center.',
                'Click [Next →] below to start the Sectors & Settlement tour.'
            ],
            accentHex: '#3B82F6'
        }
    ],
    4: [
        {
            id: 'settlement_step0_click_break_off',
            chapter: 4,
            stepIndex: 0,
            totalChapterSteps: 9,
            tab: 'OPERATIONS',
            mode: 'ACTION',
            targetSelector: '[data-tour-target="mod3-break-off-sector-btn"]',
            fallbackSelector: '[data-tour="workers-panel"] button',
            chevronPlacement: 'right',
            actionHint: 'Click + Break Off Sector',
            badge: 'Sectors • Step 1 of 9',
            title: 'Break Off Your First Sector',
            description:
                'Right now you have 0 custom sectors deployed, so 100% of your 4.20 TH/s hashrate is streaming directly to your Kaspa wallet at 50 KAS. Click [+ Break Off Sector] in the left column to create your first sector.',
            bullets: [
                'Each sector acts as an independent automated rule for its share of your mining hashrate.',
                'Click the highlighted [+ Break Off Sector] button to deploy a sector card.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 280
        },
        {
            id: 'settlement_step1_demonstrate_sector_card',
            chapter: 4,
            stepIndex: 1,
            totalChapterSteps: 9,
            tab: 'OPERATIONS',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod3-created-sector-card"]',
            fallbackSelector: '[data-testid="settlement-silos-section"]',
            badge: 'Sectors • Step 2 of 9',
            title: 'Here Is Your Sector Card',
            description:
                'Your new sector card is now live under Settlement Silos! Everything you need to monitor its queue and adjust its hashpower allocation is built right into this card.',
            bullets: [
                'Accrued Queue & Daily Yield: Shows the exact KAS waiting in queue (48.25 KAS), your active settlement mode, and your estimated daily yield.',
                'Work Share Slider & [MAX]: Drag the slider or type a % or TH/s value to resize this sector’s hashpower, or click [MAX] to snap 100% of your hashrate into this sector.',
                'Card Controls: Click the sector name to rename it, `[ ]` to toggle half/full card width, or the `[⚙]` gear icon to open the Configuration Center. Click [Next →] to continue.'
            ],
            accentHex: '#18C6A5'
        },
        {
            id: 'settlement_step2_click_sector_gear',
            chapter: 4,
            stepIndex: 2,
            totalChapterSteps: 9,
            tab: 'OPERATIONS',
            mode: 'ACTION',
            targetSelector: '[data-tour-target="mod3-sector-gear-btn"]',
            fallbackSelector: '[data-testid="settlement-silos-section"] button[title="Configure Parameters"]',
            chevronPlacement: 'top',
            actionHint: 'Click [⚙] Menu Gear',
            badge: 'Sectors • Step 3 of 9',
            title: 'Click the Menu Gear to Open the Configuration Center',
            description:
                'Click the highlighted [⚙] gear icon in the top-right corner of your sector card to open its Configuration Center.',
            bullets: [
                'Inside the Configuration Center, we will walk through each section step by step.',
                'Click the highlighted [⚙] gear icon on your sector card.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 280
        },
        {
            id: 'settlement_step3_config_identifier',
            chapter: 4,
            stepIndex: 3,
            totalChapterSteps: 9,
            tab: 'OPERATIONS',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod3-config-identifier"]',
            fallbackSelector: '#editSectorNameInput',
            badge: 'Sectors • Step 4 of 9',
            title: 'Configuration Center: Sector Identifier',
            description:
                'The first section at the top of the Configuration Center is your Sector Identifier. You can give each sector a custom name (such as "TEXAS-USDC-SILO" or "COLD-BTC-VAULT") to stay organized.',
            bullets: [
                'Your custom name updates both on the Sector card and in the Pool Distribution ring on the right.',
                'Click [Next →] below to inspect the Target Asset Route section.'
            ],
            accentHex: '#18C6A5'
        },
        {
            id: 'settlement_step4_config_target_asset',
            chapter: 4,
            stepIndex: 4,
            totalChapterSteps: 9,
            tab: 'OPERATIONS',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod3-config-target-asset-btn"]',
            fallbackSelector: 'button[aria-label="Target Asset Route"]',
            badge: 'Sectors • Step 5 of 9',
            title: 'Configuration Center: Target Asset Route',
            description:
                'Clicking the Target Asset Route box opens the universal asset selector so you can choose what currency this sector pays you in.',
            bullets: [
                'Single-Asset Settlement Silo: Select any L1 crypto (KAS, BTC, ETH, SOL), stablecoin (USDC), 24/7 Wall Street Equity (NVDA, SPY), Mineable KRC-20 (SILO), or Direct Bank USD.',
                'At the daily 22:00 UTC Global Settlement, your accrued KAS is automatically settled into your chosen asset.',
                'Click [Next →] to see how to transform a Silo into a Liquidity Plant.'
            ],
            accentHex: '#18C6A5'
        },
        {
            id: 'settlement_step5_config_plant_upgrade',
            chapter: 4,
            stepIndex: 5,
            totalChapterSteps: 9,
            tab: 'OPERATIONS',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod3-config-add-second-asset-btn"]',
            fallbackSelector: 'button[aria-label="Target Asset Route"]',
            badge: 'Sectors • Step 6 of 9',
            title: 'Configuration Center: Transform into a Liquidity Plant',
            description:
                'Directly below the Target Asset box is the [+ Add 2nd Asset] button, which upgrades a single-asset Silo into a Multi-Asset Liquidity Plant.',
            bullets: [
                '50% KAS Anchor: Liquidity Plants lock 50.0% of the sector in KAS and split the other 50.0% across 1 to 3 secondary assets.',
                'Compounding Pool Yield: Instead of a one-way payout, your mining yield compounds inside the pool’s liquidity reserves to earn trading fees.',
                'Click [Next →] to inspect the Destination Address section.'
            ],
            accentHex: '#3B82F6'
        },
        {
            id: 'settlement_step6_config_destination',
            chapter: 4,
            stepIndex: 6,
            totalChapterSteps: 9,
            tab: 'OPERATIONS',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod3-config-dest-wallet"]',
            fallbackSelector: '#destWallet',
            badge: 'Sectors • Step 7 of 9',
            title: 'Configuration Center: Destination Address',
            description:
                'The Destination Address field controls where your settled payouts are delivered on-chain.',
            bullets: [
                'Automatic Vault Binding: By default, Perennia pre-fills the matching L1 address derived from your 11-chain Sovereign Vault.',
                'Custom Cold Storage: You can also paste any external hardware wallet address for direct on-chain delivery.',
                'Click [Next →] to inspect the Accrued Queue Balance section.'
            ],
            accentHex: '#F59E0B'
        },
        {
            id: 'settlement_step7_config_reclaim',
            chapter: 4,
            stepIndex: 7,
            totalChapterSteps: 9,
            tab: 'OPERATIONS',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod3-config-reclaim-box"]',
            fallbackSelector: '#destWallet',
            badge: 'Sectors • Step 8 of 9',
            title: 'Configuration Center: Accrued Queue & Reclaim',
            description:
                'At the bottom of the Configuration Center is your Accrued Queue Balance and the [Reclaim to KAS Ledger] button.',
            bullets: [
                'No Lockup Before Settlement: While KAS is accumulating in a sector prior to the 22:00 UTC settlement bell, it remains 100% yours.',
                'Instant Reclaim: Clicking [Reclaim to KAS Ledger] immediately pulls your pending KAS out of the sector queue and credits it to your spendable KAS balance.',
                'Click [Next →] to save and close the Configuration Center.'
            ],
            accentHex: '#18C6A5'
        },
        {
            id: 'settlement_step8_click_update_protocol',
            chapter: 4,
            stepIndex: 8,
            totalChapterSteps: 9,
            tab: 'OPERATIONS',
            mode: 'ACTION',
            targetSelector: 'button[aria-label="Save"]',
            fallbackSelector: 'button[aria-label="Cancel"]',
            chevronPlacement: 'top',
            actionHint: 'Click Update Protocol',
            badge: 'Sectors • Step 9 of 9',
            title: 'Save & Close the Configuration Center',
            description:
                'Click the highlighted [Update Protocol] button at the bottom of the Configuration Center to save your sector settings and continue to the Exchange.',
            bullets: [
                'All sector updates apply immediately to your live hashpower routing.',
                'Click the highlighted [Update Protocol] button to complete the Sectors tour.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 280
        }
    ],
    5: [
        {
            id: 'exchange_step0_demonstrate_swap_station',
            chapter: 5,
            stepIndex: 0,
            totalChapterSteps: 10,
            tab: 'DEX',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod4-swap-station-card"]',
            fallbackSelector: '[data-tour="dex-workspace"]',
            badge: 'Exchange • Step 1 of 10',
            title: 'The 24/7 Wall St. & Crypto Swap Station',
            description:
                'The Perennia Exchange lets you trade 24/7 between L1 crypto, KRC-20 tokens, and tokenized Wall Street Equities & Commodities with dynamic token color shading.',
            bullets: [
                'You Pay (Top Box): Choose any crypto from your Platform Balance ($0 gas) or Self-Custody Wallet (1-click browser L1 signature).',
                'You Receive (Bottom Box): Dynamically shades in your selected token’s theme color and displays your live oracle conversion output.',
                'Click [Next →] below to open the universal Asset Selection drawer.'
            ],
            accentHex: '#F59E0B'
        },
        {
            id: 'exchange_step1_open_asset_drawer',
            chapter: 5,
            stepIndex: 1,
            totalChapterSteps: 10,
            tab: 'DEX',
            mode: 'ACTION',
            targetSelector: '[data-testid="dex-receive-token-selector"]',
            fallbackSelector: '[data-tour="dex-workspace"] button',
            chevronPlacement: 'left',
            actionHint: 'Click Asset Selector',
            badge: 'Exchange • Step 2 of 10',
            title: 'Open the Universal Asset Selection Drawer',
            description:
                'Click the highlighted token selector button inside the [You Receive] box to open the universal Asset Selection drawer.',
            bullets: [
                'Browse or search every supported crypto, stablecoin, equity, commodity, or paste any contract address.',
                'Click the highlighted token selector button.'
            ],
            accentHex: '#F59E0B',
            advanceDelayMs: 260
        },
        {
            id: 'exchange_step2_demonstrate_asset_drawer',
            chapter: 5,
            stepIndex: 2,
            totalChapterSteps: 10,
            tab: 'DEX',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod4-asset-modal-header"]',
            fallbackSelector: '[data-testid="dex-token-modal-search"]',
            badge: 'Exchange • Step 3 of 10',
            title: 'Universal Token Discovery & Category Filters',
            description:
                'At the top of the Asset Selection drawer is the universal search bar and four category filter tabs (All, Crypto, Equities, Gold/Debt).',
            bullets: [
                'Live Oracle Discovery: Typing any ticker or pasting an ERC-20, SPL, or KRC-20 contract queries our 5-node CEX quorum, DexScreener, and Kasplex in real time.',
                'Category Filters: Narrow the list to Crypto, 24/7 Wall Street Equities, or Physical Gold & US Treasury Bills.',
                'Click [Next →] to filter the drawer to Wall Street Equities.'
            ],
            accentHex: '#18C6A5'
        },
        {
            id: 'exchange_step3_click_equities_filter',
            chapter: 5,
            stepIndex: 3,
            totalChapterSteps: 10,
            tab: 'DEX',
            mode: 'ACTION',
            targetSelector: '[data-testid="dex-modal-cat-EQUITIES"]',
            fallbackSelector: '[data-testid="dex-token-modal-search"]',
            chevronPlacement: 'top',
            actionHint: 'Click Equities Tab',
            badge: 'Exchange • Step 4 of 10',
            title: 'Filter by 24/7 Wall Street Equities',
            description:
                'Click the highlighted [Equities] filter tab inside the drawer to view tokenized Wall Street equities and index funds.',
            bullets: [
                'Includes 24/7 Pyth Hermes oracle feeds for NVDA, SPY, QQQ, AAPL, TSLA, AMD, TSM, AVGO, and XLE.',
                'Click the highlighted [Equities] tab.'
            ],
            accentHex: '#F59E0B',
            advanceDelayMs: 240
        },
        {
            id: 'exchange_step4_select_nvda',
            chapter: 5,
            stepIndex: 4,
            totalChapterSteps: 10,
            tab: 'DEX',
            mode: 'ACTION',
            targetSelector: '[data-testid="dex-select-token-NVDA"]',
            fallbackSelector: '[data-testid^="dex-select-token-"]',
            chevronPlacement: 'top',
            actionHint: 'Click NVDA Row',
            badge: 'Exchange • Step 5 of 10',
            title: 'Select NVDA as Your Target Asset',
            description:
                'Click the highlighted [NVDA] row to select NVIDIA and close the drawer.',
            bullets: [
                'Selecting NVDA shades the Receive card in NVIDIA green and calculates your live conversion quote.',
                'Click the highlighted [NVDA] row.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 280
        },
        {
            id: 'exchange_step5_demonstrate_swap_quote',
            chapter: 5,
            stepIndex: 5,
            totalChapterSteps: 10,
            tab: 'DEX',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod4-swap-execution-panel"]',
            fallbackSelector: '[data-testid="dex-oracle-rate-readout"]',
            badge: 'Exchange • Step 6 of 10',
            title: 'Live Oracle Rate & SILO Fee Shield Readout',
            description:
                'Your KAS → NVDA pair is now loaded with a sample 1,000 KAS quote. Look at the compact telemetry panel below the Receive card:',
            bullets: [
                'Live Oracle Rate: Shows the exact real-time conversion ratio between KAS and NVDA.',
                'Active Fee Tier: Displays your active fee percentage (`0.75%` with your staked SILO Fee Shield).',
                'Click [Next →] to explore the 50%-KAS Liquidity Plant builder.'
            ],
            accentHex: '#F59E0B'
        },
        {
            id: 'exchange_step6_click_liquidity_tab',
            chapter: 5,
            stepIndex: 6,
            totalChapterSteps: 10,
            tab: 'DEX',
            mode: 'ACTION',
            targetSelector: '[data-testid="dex-mode-lp-btn"]',
            fallbackSelector: '[data-tour-target="mod4-liquidity-tab-btn"]',
            chevronPlacement: 'bottom',
            actionHint: 'Click Liquidity Tab',
            badge: 'Exchange • Step 7 of 10',
            title: 'Open the 50%-KAS Supply Liquidity Workspace',
            description:
                'Click the highlighted [Liquidity] tab at the top of the Exchange to see how you can supply multi-asset liquidity to the pool.',
            bullets: [
                'Liquidity providers earn 80% of pool settlement fees across all internal cross-pairs.',
                'Click the highlighted [Liquidity] tab.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 260
        },
        {
            id: 'exchange_step7_demonstrate_liquidity_plants',
            chapter: 5,
            stepIndex: 7,
            totalChapterSteps: 10,
            tab: 'DEX',
            mode: 'READ',
            targetSelector: '[data-testid="dex-liquidity-plant-card"]',
            fallbackSelector: '[data-tour-target="mod4-lp-provision-card"]',
            badge: 'Exchange • Step 8 of 10',
            title: 'Supplying 50%-KAS Multi-Asset Liquidity',
            description:
                'On the left is the Supply Liquidity card, which pairs a 50% KAS Anchor Deposit with any Paired Asset (or up to 3 additional assets via [+ Add Asset]):',
            bullets: [
                'Dynamic Asset Shading: Selecting any Paired Asset (USDC, NVDA, BTC, XAU) dynamically shades the card in that token’s color.',
                'Lock Duration Multipliers: Choose Flex (1x), 30d (1.2x), 90d (1.5x), or 365d (2.5x) yield weight.',
                'Click [Next →] to explore the P2P Atomic Orderbook.'
            ],
            accentHex: '#18C6A5'
        },
        {
            id: 'exchange_step8_click_p2p_tab',
            chapter: 5,
            stepIndex: 8,
            totalChapterSteps: 10,
            tab: 'DEX',
            mode: 'ACTION',
            targetSelector: '[data-testid="dex-mode-p2p-btn"]',
            fallbackSelector: '[data-tour="dex-workspace"] button',
            chevronPlacement: 'bottom',
            actionHint: 'Click P2P Tab',
            badge: 'Exchange • Step 9 of 10',
            title: 'Open the Atomic P2P Orderbook',
            description:
                'Click the highlighted [P2P] tab at the top of the Exchange to inspect zero-slippage peer-to-peer limit offers.',
            bullets: [
                'P2P offers let you set your exact ask price with zero AMM price impact.',
                'Click the highlighted [P2P] tab.'
            ],
            accentHex: '#3B82F6',
            advanceDelayMs: 260
        },
        {
            id: 'exchange_step9_demonstrate_p2p_orderbook',
            chapter: 5,
            stepIndex: 9,
            totalChapterSteps: 10,
            tab: 'DEX',
            mode: 'READ',
            targetSelector: '[data-testid="p2p-deploy-offer-card"]',
            fallbackSelector: '[data-testid="p2p-orderbook-panel"]',
            badge: 'Exchange • Step 10 of 10',
            title: 'How Atomic P2P Offers Work',
            description:
                'On the left is the Deploy P2P Offer card, and on the right is the live Open P2P Offers orderbook:',
            bullets: [
                'Zero-Custody PSBT Signing: When you deploy an offer, your browser signs a partial cryptographic envelope (`SIGHASH_SINGLE | ANYONECANPAY`) locking your exact input and required output.',
                'Dynamic Color Shading: The [You Offer] box shades in your sell token’s color, while the [You Require] box shades in your requested buy token’s color.',
                'Click [Next →] below to advance to the Multi-Chain Treasury!'
            ],
            accentHex: '#3B82F6'
        }
    ],
    6: [
        {
            id: 'treasury_step0_demonstrate_vault_summary',
            chapter: 6,
            stepIndex: 0,
            totalChapterSteps: 10,
            tab: 'TREASURY',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod5-vault-summary-card"]',
            fallbackSelector: '[data-tour="treasury-vault"]',
            badge: 'Treasury • Step 1 of 10',
            title: 'Total Vault Value & Three-Tier Accounting',
            description:
                'Welcome to your 11-Chain Sovereign Treasury. The master vault summary card separates your holdings into three transparent custody buckets:',
            bullets: [
                'Wallet Balance (On-Chain): Spendable coins and tokens sitting directly on their native L1 blockchains.',
                'Pending Settlement: Mining yield accrued in the pool awaiting the 22:00 UTC settlement sweep or direct withdrawal.',
                'Staked in Liquidity Pools: Capital working inside your 50%-KAS Liquidity Plants and SILO fee-discount vaults. Click [Next →] to continue.'
            ],
            accentHex: '#18C6A5'
        },
        {
            id: 'treasury_step1_open_airlock_drawer',
            chapter: 6,
            stepIndex: 1,
            totalChapterSteps: 10,
            tab: 'TREASURY',
            mode: 'ACTION',
            targetSelector: '[data-testid="cold-vault-btn-KAS"]',
            fallbackSelector: '[data-testid="network-row-KAS"] button',
            chevronPlacement: 'bottom',
            actionHint: 'Click [Cold Vault] on Kaspa Row',
            badge: 'Treasury • Step 2 of 10',
            title: 'Open the Per-Token [Cold Vault] Drawer',
            description:
                'Instead of a single global airlock, every chain and token row in your Perennia Wallet has its own dedicated `[Cold Vault]` button. Click `[Cold Vault]` on the Kaspa row to open its Cold Storage Auto-Sweep drawer.',
            bullets: [
                'Each asset (KAS, BTC, ETH, SOL, USDC, SILO) can have its own hardware wallet address and auto-sweep ceiling.',
                'Click the highlighted `[Cold Vault]` button on the Kaspa row.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 260
        },
        {
            id: 'treasury_step2_demonstrate_airlock_left',
            chapter: 6,
            stepIndex: 2,
            totalChapterSteps: 10,
            tab: 'TREASURY',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod5-airlock-left-panel"]',
            fallbackSelector: '[data-testid="cold-vault-drawer-KAS"]',
            badge: 'Treasury • Step 3 of 10',
            title: 'Per-Token Cold Storage Auto-Sweep Rules',
            description:
                'Here is the left panel of the token’s Cold Vault drawer, where you bind your hardware wallet address and set automatic overflow rules:',
            bullets: [
                'Chain-Validated Cold Address & QR Scanner: Paste your Tangem/Ledger cold address or click `[Scan QR]` to scan it with your camera.',
                'Hot Balance Ceiling & Auto-Sweep: Set a ceiling (such as 500 KAS) so any settled balance above your threshold automatically sweeps to cold storage.',
                'Click [Next →] to inspect the 1-Click Immediate Cold Sweep panel on the right.'
            ],
            accentHex: '#18C6A5'
        },
        {
            id: 'treasury_step3_demonstrate_airlock_right',
            chapter: 6,
            stepIndex: 3,
            totalChapterSteps: 10,
            tab: 'TREASURY',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod5-airlock-right-panel"]',
            fallbackSelector: '[data-testid="cold-vault-drawer-KAS"]',
            badge: 'Treasury • Step 4 of 10',
            title: '1-Click Immediate Cold Sweep',
            description:
                'On the right side of the Cold Vault drawer is your 1-Click Immediate Cold Sweep tool:',
            bullets: [
                'Sweep Queue or L1 Balance: Click `[MAX Queue]` or `[MAX L1]` to immediately dispatch funds to your saved Cold Wallet address.',
                'Per-Sub-Token Support: If a chain has sub-tokens (like SILO on Kaspa or USDC on Ethereum), you can switch between them right at the top of this drawer.',
                'Click [Next →] to close the Cold Vault drawer.'
            ],
            accentHex: '#3B82F6'
        },
        {
            id: 'treasury_step4_close_airlock_drawer',
            chapter: 6,
            stepIndex: 4,
            totalChapterSteps: 10,
            tab: 'TREASURY',
            mode: 'ACTION',
            targetSelector: '[data-testid="cold-vault-btn-KAS"]',
            fallbackSelector: '[data-testid="network-row-KAS"] button',
            chevronPlacement: 'bottom',
            actionHint: 'Click [Cold Vault] to Collapse',
            badge: 'Treasury • Step 5 of 10',
            title: 'Close the Cold Vault Drawer',
            description:
                'Click the highlighted `[Cold Vault]` button again to collapse the Cold Storage drawer.',
            bullets: [
                'Once saved, a `COLD AUTO-SWEEP` badge appears on that token’s row and runs automatically in the background.',
                'Click the highlighted `[Cold Vault]` button.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 260
        },
        {
            id: 'treasury_step5_open_kas_withdraw',
            chapter: 6,
            stepIndex: 5,
            totalChapterSteps: 10,
            tab: 'TREASURY',
            mode: 'ACTION',
            targetSelector: '[data-testid="withdraw-l1-btn-KAS"]',
            fallbackSelector: '[data-testid="network-row-KAS"] button',
            chevronPlacement: 'top',
            actionHint: 'Click [Send / Withdraw L1]',
            badge: 'Treasury • Step 6 of 10',
            title: 'Open the Kaspa L1 Transfer Drawer',
            description:
                'Every chain card in your Treasury has quick-action buttons for `[+ Buy with USD]`, `[Receive QR]`, `[Send / Withdraw L1]`, `[Cold Vault]`, `[Activity]`, and `[Compound UTXOs]`. Click `[Send / Withdraw L1]` on the Kaspa row.',
            bullets: [
                'You can send native KAS or any KRC-20 token (like SILO) held on your Kaspa address.',
                'Click the highlighted `[Send / Withdraw L1]` button.'
            ],
            accentHex: '#F59E0B',
            advanceDelayMs: 260
        },
        {
            id: 'treasury_step6_demonstrate_kas_withdraw',
            chapter: 6,
            stepIndex: 6,
            totalChapterSteps: 10,
            tab: 'TREASURY',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod5-kas-routing-drawer"]',
            fallbackSelector: '[data-testid="network-row-KAS"]',
            badge: 'Treasury • Step 7 of 10',
            title: 'Inside the Send / Withdraw L1 Drawer',
            description:
                'Here is the L1 Transfer & Withdrawal drawer. You have full control over which balance source is used for your transfer:',
            bullets: [
                'Select Asset (KAS or SILO): Choose between native KAS or any KRC-20 token held on your Kaspa address.',
                'Transfer Source Selector: Choose between Auto Route, spending directly from your On-Chain L1 UTXOs, or withdrawing from your Batch Settlement Queue.',
                'Click [Next →] to switch this drawer to your Live Activity & Payouts log.'
            ],
            accentHex: '#F59E0B'
        },
        {
            id: 'treasury_step7_click_kas_activity',
            chapter: 6,
            stepIndex: 7,
            totalChapterSteps: 10,
            tab: 'TREASURY',
            mode: 'ACTION',
            targetSelector: '[data-testid="activity-btn-KAS"]',
            fallbackSelector: '[data-testid="network-row-KAS"] button',
            chevronPlacement: 'top',
            actionHint: 'Click [Activity]',
            badge: 'Treasury • Step 8 of 10',
            title: 'Open the Live Activity & Payouts Log',
            description:
                'Click the highlighted `[Activity]` button on the Kaspa card to view your settled payouts and on-chain transaction history.',
            bullets: [
                'Every chain row maintains its own dedicated on-chain activity log and block explorer links.',
                'Click the highlighted `[Activity]` button.'
            ],
            accentHex: '#3B82F6',
            advanceDelayMs: 260
        },
        {
            id: 'treasury_step8_demonstrate_kas_activity',
            chapter: 6,
            stepIndex: 8,
            totalChapterSteps: 10,
            tab: 'TREASURY',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod5-kas-routing-drawer"]',
            fallbackSelector: '[data-testid="network-row-KAS"]',
            badge: 'Treasury • Step 9 of 10',
            title: 'Inside the Live Activity & Explorer Audit Trail',
            description:
                'Here is your Live Activity & Payouts feed. Every mining settlement and L1 transfer is recorded here with a direct link to its block explorer transaction.',
            bullets: [
                '1-Click Explorer Verification: Click any row to verify the transaction hash directly on kas.fyi, Etherscan, Mempool.space, or Solscan.',
                'Export CSV / JSON: Use the `[Export Activity CSV]` or `[Export JSON]` buttons in the top-right corner of the drawer for accounting and tax records.',
                'Click [Next →] to inspect the Perennia Wallet Multi-Chain bar.'
            ],
            accentHex: '#3B82F6'
        },
        {
            id: 'treasury_step9_multichain_derivations',
            chapter: 6,
            stepIndex: 9,
            totalChapterSteps: 10,
            tab: 'TREASURY',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod5-multichain-search-bar"]',
            fallbackSelector: '[data-testid="treasury-token-search-input"]',
            badge: 'Treasury • Step 10 of 10',
            title: 'Perennia Wallet & Multi-Chain Derivations',
            description:
                'Directly above your Kaspa card is the Perennia Wallet bar, which manages all 11 blockchains and custom tokens derived from your 24-word seed phrase.',
            bullets: [
                'Universal Token Search: Search any chain or add custom Web3 / KRC-20 tokens to your wallet, or jump straight into a swap.',
                'Organize & Manage Chains: Click [Organize] to drag-and-drop your preferred network order, or [Manage Chains] to toggle visibility across Bitcoin, Ethereum, Solana, Arbitrum, Base, Dogecoin, XRP, Polygon, Avalanche, Sui, TRON, and Zcash.',
                'Click [Next →] below to advance to the final section: the Tax Fortress & System Settings!'
            ],
            accentHex: '#18C6A5'
        }
    ],
    7: [
        {
            id: 'tax_step0_demonstrate_summary_cards',
            chapter: 7,
            stepIndex: 0,
            totalChapterSteps: 15,
            tab: 'TAX FORTRESS',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod6-summary-grid"]',
            fallbackSelector: '[data-testid="tax-fortress-view"]',
            badge: 'Tax Fortress • Step 1 of 15',
            title: 'Your Real-Time Tax & Cost-Basis Matrix',
            description:
                'Welcome to the Zero-PII Tax Fortress. Here are your four core tax telemetry cards, updated automatically every time a mining payout, bank purchase, or swap settles:',
            bullets: [
                'Gross Taxable Proceeds & Passive HIFO Cost Basis: Tracks your mining yield ($425.00) and matches any swaps against your highest cost-basis lots first ($90.00 HIFO basis) to legally minimize taxable gains.',
                'Effective Tax Rate & Tax Escrow Reserve: Calculates your estimated tax liability based on your jurisdiction and lets you hold your tax reserve in 100% USDC or a yield-earning 50/50 KAS/USDC LP position.',
                'Click [Next →] below to configure your tax jurisdiction.'
            ],
            accentHex: '#18C6A5'
        },
        {
            id: 'tax_step1_open_jurisdiction_drawer',
            chapter: 7,
            stepIndex: 1,
            totalChapterSteps: 15,
            tab: 'TAX FORTRESS',
            mode: 'ACTION',
            targetSelector: '[data-testid="configure-jurisdiction-btn"]',
            fallbackSelector: '[data-testid="tax-fortress-view"] button',
            chevronPlacement: 'bottom',
            actionHint: 'Click Configure Jurisdiction',
            badge: 'Tax Fortress • Step 2 of 15',
            title: 'Open the Jurisdiction & Profile Drawer',
            description:
                'Click the highlighted [[ Configure Jurisdiction & Profile ]] button to customize your tax authority, state, entity structure, and local PDF fields.',
            bullets: [
                'Supports all 50 US states (highlighting 0.0% state income tax states like Texas, Florida, Nevada, and Wyoming) plus major international regimes.',
                'Click the highlighted [[ Configure Jurisdiction & Profile ]] button.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 260
        },
        {
            id: 'tax_step2_demonstrate_jurisdiction_selectors',
            chapter: 7,
            stepIndex: 2,
            totalChapterSteps: 15,
            tab: 'TAX FORTRESS',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod6-jurisdiction-selectors"]',
            fallbackSelector: '[data-testid="jurisdiction-config-form"]',
            badge: 'Tax Fortress • Step 3 of 15',
            title: 'Jurisdiction, Entity Structure & CPA Override',
            description:
                'Inside the top half of the drawer, Perennia computes your composite effective tax rate automatically:',
            bullets: [
                'Country & US State: Select your jurisdiction (such as US-TX with 0.0% state income tax).',
                'Entity Structure & Filing Status: Selecting an LLC, S-Corp, or Partnership automatically applies the 20% IRS Sec. 199A QBI deduction; selecting C-Corp applies the flat 21% federal rate.',
                'CPA Custom Override: Use the slider below if your CPA gives you a specific withholding percentage. Click [Next →] to inspect the Zero-PII local vault fields.'
            ],
            accentHex: '#3B82F6'
        },
        {
            id: 'tax_step3_demonstrate_local_pii_fields',
            chapter: 7,
            stepIndex: 3,
            totalChapterSteps: 15,
            tab: 'TAX FORTRESS',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod6-local-pii-row"]',
            fallbackSelector: '#legalName',
            badge: 'Tax Fortress • Step 4 of 15',
            title: 'Zero-Server-PII Local Browser Encryption',
            description:
                'These three optional fields (Legal / Entity Name, TIN / EIN, and Domicile Address) are protected by Perennia’s Zero-PII architecture:',
            bullets: [
                '100% Local AES-256-GCM Storage: If you enter your name, EIN, or address here, they are encrypted locally inside your browser and are NEVER transmitted to Perennia’s servers.',
                'Local PDF Injection Only: Your browser uses these fields solely when stamping your downloadable Form 1099-DA and Form 8949 PDF worksheet.',
                'Click [Next →] to save your jurisdiction profile.'
            ],
            accentHex: '#F59E0B'
        },
        {
            id: 'tax_step4_save_jurisdiction_profile',
            chapter: 7,
            stepIndex: 4,
            totalChapterSteps: 15,
            tab: 'TAX FORTRESS',
            mode: 'ACTION',
            targetSelector: '[data-testid="save-tax-profile-btn"]',
            fallbackSelector: '[data-testid="jurisdiction-config-form"] button[type="submit"]',
            chevronPlacement: 'top',
            actionHint: 'Click Save Profile',
            badge: 'Tax Fortress • Step 5 of 15',
            title: 'Save Your Jurisdiction Profile',
            description:
                'Click the highlighted [Save US-TX Profile ✓] button to lock in your effective withholding rate and close the configuration drawer.',
            bullets: [
                'Only your non-identifiable jurisdiction code and effective rate percentage are synced for automated tax escrow routing.',
                'Click the highlighted [Save US-TX Profile ✓] button.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 280
        },
        {
            id: 'tax_step5_click_escrow_toggle',
            chapter: 7,
            stepIndex: 5,
            totalChapterSteps: 15,
            tab: 'TAX FORTRESS',
            mode: 'ACTION',
            targetSelector: '[data-testid="toggle-tax-escrow-btn"]',
            fallbackSelector: '[data-testid="tax-fortress-view"] button',
            chevronPlacement: 'left',
            actionHint: 'Click Escrow Toggle Switch',
            badge: 'Tax Fortress • Step 6 of 15',
            title: 'Configure Your Automated Tax Escrow Reserve',
            description:
                'Perennia can automatically set aside your estimated tax withholding percentage on every settlement. Click the highlighted toggle switch on the Tax Escrow card to choose your reserve mode.',
            bullets: [
                'You can choose between a 100% USDC Stable Reserve (zero volatility) or a 50/50 KAS/USDC Auto-LP position.',
                'Click the highlighted toggle switch.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 260
        },
        {
            id: 'tax_step6_demonstrate_escrow_modal',
            chapter: 7,
            stepIndex: 6,
            totalChapterSteps: 15,
            tab: 'TAX FORTRESS',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod6-escrow-modal-card"]',
            fallbackSelector: '[data-testid="confirm-tax-escrow-btn"]',
            badge: 'Tax Fortress • Step 7 of 15',
            title: 'Mode A (100% USDC Reserve) vs. Mode B (50/50 KAS/USDC Auto-LP)',
            description:
                'Inside the Tax Escrow configuration modal, you have complete control over how your tax reserve is held:',
            bullets: [
                'Mode A — 100% USDC Stable Reserve (Default): Converts withheld tax into pure USDC so the exact dollar value is preserved with zero market volatility or impermanent loss.',
                'Mode B — 50/50 KAS/USDC Auto-LP: Pairs withheld tax into a 0-day lockup LP position to earn pool trading fees (requires acknowledging Impermanent Loss risk).',
                'Click [Next →] to activate your Tax Escrow reserve.'
            ],
            accentHex: '#18C6A5'
        },
        {
            id: 'tax_step7_confirm_escrow_lp',
            chapter: 7,
            stepIndex: 7,
            totalChapterSteps: 15,
            tab: 'TAX FORTRESS',
            mode: 'ACTION',
            targetSelector: '[data-testid="confirm-tax-escrow-btn"]',
            fallbackSelector: 'button[data-testid="confirm-tax-escrow-btn"]',
            chevronPlacement: 'top',
            actionHint: 'Click Activate Tax Escrow',
            badge: 'Tax Fortress • Step 8 of 15',
            title: 'Activate Your Tax Escrow Reserve',
            description:
                'Click the highlighted [Activate 100% USDC Tax Escrow ✓] button to arm automated tax escrow routing.',
            bullets: [
                'Watch the Tax Escrow card light up teal with your exact live tax liability ($46.63 USD) and expose the instant [Withdraw Now] button.',
                'Click the highlighted activation button.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 280
        },
        {
            id: 'tax_step8_click_hifo_lots_tab',
            chapter: 7,
            stepIndex: 8,
            totalChapterSteps: 15,
            tab: 'TAX FORTRESS',
            mode: 'ACTION',
            targetSelector: '[data-testid="tax-mode-hifo-lots-btn"]',
            fallbackSelector: '[data-testid="tax-mode-executions-btn"]',
            chevronPlacement: 'top',
            actionHint: 'Click 02. Passive HIFO Lots',
            badge: 'Tax Fortress • Step 9 of 15',
            title: 'Open Your Passive HIFO Cost-Basis Lots',
            description:
                'Below your summary cards is the multi-mode tax ledger. Click [02. Passive HIFO Cost-Basis Lots] to inspect how your acquisition lots are tracked and ranked.',
            bullets: [
                'Every mining payout and direct bank purchase creates an immutable cost-basis lot stamped with the exact fair-market USD spot price at that second.',
                'Click the highlighted [02. Passive HIFO Cost-Basis Lots] tab.'
            ],
            accentHex: '#3B82F6',
            advanceDelayMs: 260
        },
        {
            id: 'tax_step9_demonstrate_hifo_table',
            chapter: 7,
            stepIndex: 9,
            totalChapterSteps: 15,
            tab: 'TAX FORTRESS',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod6-ledger-table-card"]',
            fallbackSelector: '[data-testid="tax-mode-hifo-lots-btn"]',
            badge: 'Tax Fortress • Step 10 of 15',
            title: 'Passive HIFO Lot Matching & Schedule D Dispositions',
            description:
                'Here is your Passive HIFO lot table. Notice how your open lots are automatically sorted from highest FMV cost basis ($0.1800) to lowest ($0.1500):',
            bullets: [
                'Automatic Tax Optimization: When you swap or off-ramp KAS, the engine automatically consumes your highest cost-basis lot first to minimize realized capital gains.',
                'Schedule D Term Tracking: Tracks exact holding days on every lot (Short-Term vs. Long-Term >365 days), which you can inspect in tab 03 (Schedule D Matched Dispositions).',
                'Click [Next →] to see how External Deposit Cost Basis protects you when depositing external crypto.'
            ],
            accentHex: '#3B82F6'
        },
        {
            id: 'tax_step10_click_external_basis_tab',
            chapter: 7,
            stepIndex: 10,
            totalChapterSteps: 15,
            tab: 'TAX FORTRESS',
            mode: 'ACTION',
            targetSelector: '[data-testid="tax-tab-external-btn"]',
            fallbackSelector: '[data-testid="tax-mode-disposals-btn"]',
            chevronPlacement: 'top',
            actionHint: 'Click 04. + External Deposit Cost Basis',
            badge: 'Tax Fortress • Step 11 of 15',
            title: 'Open External Deposit Cost Basis Registration',
            description:
                'What if you transfer BTC, KAS, ETH, or SOL into your Perennia Wallet from an external exchange or hardware wallet? Click [04. + External Deposit Cost Basis] to see how Perennia protects your Form 8949 taxes.',
            bullets: [
                'Without a cost-basis record, selling externally deposited crypto could be treated as a $0-cost-basis 100% capital gain.',
                'Click the highlighted [04. + External Deposit Cost Basis] tab.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 260
        },
        {
            id: 'tax_step11_demonstrate_external_basis_card',
            chapter: 7,
            stepIndex: 11,
            totalChapterSteps: 15,
            tab: 'TAX FORTRESS',
            mode: 'READ',
            targetSelector: '[data-testid="external-cost-basis-card"]',
            fallbackSelector: '[data-testid="tax-tab-external-btn"]',
            badge: 'Tax Fortress • Step 12 of 15',
            title: 'How External Deposit Cost Basis Protects Form 8949 Taxes',
            description:
                'Here is the External L1 Deposit Cost Basis registration form:',
            bullets: [
                'Register Historical Acquisition Basis: Enter the token ticker, deposited quantity, your original USD cost basis, and the original acquisition date.',
                'True Net Gain Calculation: Registering an OPEN HIFO lot ensures that when you swap or off-ramp that deposit for USD, Form 8949 and Schedule D only tax your true net gain (and respect Long-Term >365d holding periods).',
                'Click [Next →] to inspect the 1-Click PDF & CSV export tools.'
            ],
            accentHex: '#18C6A5'
        },
        {
            id: 'tax_step12_demonstrate_pdf_export_finish',
            chapter: 7,
            stepIndex: 12,
            totalChapterSteps: 15,
            tab: 'TAX FORTRESS',
            mode: 'READ',
            targetSelector: '[data-tour-target="mod6-export-buttons"]',
            fallbackSelector: '[data-testid="generate-1099-pdf-btn"]',
            badge: 'Tax Fortress • Step 13 of 15',
            title: '1-Click Local 1099-DA / 8949 PDF & CSV Export',
            description:
                'In the top-right corner of the Tax Fortress are your instant export tools for your CPA or tax filing software:',
            bullets: [
                'Generate 1099-DA / 8949 PDF ↓: Compiles a formatted IRS Form 1099-DA, Schedule D, and Form 8949 worksheet 100% locally inside your browser.',
                'Export HIFO CSV ↓: Downloads your complete execution and HIFO cost-basis ledger as a spreadsheet.',
                'Click [Next →] to inspect the System Parameters (⚙) gear in the top header.'
            ],
            accentHex: '#18C6A5'
        },
        {
            id: 'tax_step13_click_settings_gear',
            chapter: 7,
            stepIndex: 13,
            totalChapterSteps: 15,
            tab: 'TAX FORTRESS',
            mode: 'ACTION',
            targetSelector: '[data-testid="header-settings-btn"]',
            fallbackSelector: 'header button[aria-label="Settings"]',
            chevronPlacement: 'bottom',
            actionHint: 'Click [⚙] Settings Gear',
            badge: 'Settings & Guide • Step 14 of 15',
            title: 'Open System Parameters, Language & FX Guide (⚙)',
            description:
                'Finally, look at the top-right command header next to the [$ Buy Crypto] button. Click the highlighted [⚙] Settings gear icon to open System Parameters.',
            bullets: [
                'The Settings menu houses your Display Language (8 languages), Display Currency (9 live FX currencies), theme, decimal precision, encrypted .JSON backup, and the Interactive Tour launcher.',
                'Click the highlighted [⚙] Settings gear button.'
            ],
            accentHex: '#18C6A5',
            advanceDelayMs: 260
        },
        {
            id: 'tax_step14_settings_and_guide_finale',
            chapter: 7,
            stepIndex: 14,
            totalChapterSteps: 15,
            tab: 'TAX FORTRESS',
            mode: 'READ',
            targetSelector: '[data-testid="settings-modal-card"]',
            fallbackSelector: '[data-testid="settings-guide-section"]',
            badge: 'Settings & Guide • Step 15 of 15',
            title: 'Multi-Language, Live FX Currency & Accessing This Guide Anytime',
            description:
                'Here is your System Parameters modal. Everything you need to customize your workspace or revisit this walkthrough lives right here:',
            bullets: [
                'Interactive Platform Guide & Tour (Top Card): Relaunch the full interactive tour or jump to any individual chapter whenever you need a refresher.',
                'Display Language & Live FX Currency: Switch between 8 languages (EN, ES, DE, FR, PT, ZH, JA, KO) and 9 live FX currencies (USD, EUR, GBP, CAD, AUD, CHF, JPY, MXN, BRL).',
                'Theme, Precision & Encrypted Vault Backup (.JSON): Tune surface warmth, decimal precision, or export your encrypted vault file at any time. Click [Finish Tour ✓] below to return to the live Perennia platform!'
            ],
            accentHex: '#18C6A5'
        }
    ]
};