import { browser } from '$app/environment';
import { ui } from '$lib/stores/ui.svelte';
import { ops, type YieldSector, type WorkerNode } from '$lib/stores/operations.svelte';

export type TutorialTabTarget =
    | 'OPERATIONS'
    | 'DEX'
    | 'TREASURY'
    | 'TAX'
    | 'FORGE'
    | 'DIRECTOR';

export interface TutorialStep {
    id: string;
    chapter: string;
    stepNumber: number;
    title: string;
    subtitle: string;
    description: string;
    bullets: string[];
    tab: TutorialTabTarget;
    targetSelector?: string;
    fallbackSelector?: string;
    highlightPadding?: number;
    cardPosition?: 'top-right' | 'bottom-right' | 'bottom-left' | 'center';
    ctaLabel?: string;
}

export interface TutorialBoundingBox {
    top: number;
    left: number;
    width: number;
    height: number;
    found: boolean;
}

export interface TutorialStateSnapshot {
    activeTab: string;
    sectors: YieldSector[];
    workers: WorkerNode[];
}

export interface TutorialWireInstructionsPreview {
    beneficiaryName: string;
    bankName: string;
    routingNumber: string;
    accountNumber: string;
    accountType: string;
    wireMemo: string;
    settlementTarget: string;
    targetAsset: string;
}

export const TUTORIAL_WIRE_PREVIEW: TutorialWireInstructionsPreview = {
    beneficiaryName: 'Perennia LLC — Bridge Virtual FBO',
    bankName: 'Lead Bank / Column N.A. (Bridge Virtual Account Rail)',
    routingNumber: '101019644',
    accountNumber: '8804921044',
    accountType: 'DEDICATED PUSH-WIRE VIRTUAL ACCOUNT',
    wireMemo: 'PER-ONRAMP-DEMO01',
    settlementTarget: 'L1_KAS',
    targetAsset: 'KAS'
};

export const TUTORIAL_STEPS: TutorialStep[] = [
    {
        id: 'stratum-telemetry-overview',
        chapter: '01 • BARE-METAL STRATUM ENGINE',
        stepNumber: 1,
        title: 'Zero-Allocation Kaspa Stratum Telemetry',
        subtitle: 'Live ASIC Hashrate, VarDiff & Time-Weighted Loyalty Decay',
        description:
            'Perennia LLC operates a bare-metal Rust Stratum engine connected directly to Rusty-Kaspa (kaspad) via gRPC. Active miners start at a 1.00% pool fee that steps down by 0.05% per consecutive week of hashing to a 0.50% floor, protected by a 2-hour disconnect grace window.',
        bullets: [
            'Tiered ports for GPU (:6551), Home ASICs (:6552), and Industrial Farms (:6553)',
            'Automatic -0.05%/week pool fee decay down to 0.50% with a 2-hour grace buffer',
            'Active Stratum streak miners unlock the 0.10% wholesale swap fee floor across the DEX'
        ],
        tab: 'OPERATIONS',
        targetSelector: '[data-testid="pool-distribution-sidebar"]',
        fallbackSelector: 'main',
        highlightPadding: 10,
        cardPosition: 'bottom-right',
        ctaLabel: 'Next: Dynamic Yield Buckets →'
    },
    {
        id: 'dynamic-buckets-and-dex-boost',
        chapter: '02 • DYNAMIC SETTLEMENT BUCKETS',
        stepNumber: 2,
        title: 'Live ChangeNOW Thresholds & DEX Boost',
        subtitle: 'Anchor + Layer Clearing & 22:00 UTC Global Settlement Bell',
        description:
            'Instead of static 50 KAS assumptions, each multi-asset settlement bucket queries live ChangeNOW minimum bridge thresholds plus network gas and protocol spread so every conversion is 100% profitable.',
        bullets: [
            'Click [Boost +XX.X KAS in DEX] on any filling bucket to route the exact shortfall into the DEX',
            'Incoming DEX swaps act as the Anchor order and immediately sweep layered miner buckets on top',
            'Unconverted KAS can be claimed directly to your Platform Balance at any time with 0 gas'
        ],
        tab: 'OPERATIONS',
        targetSelector: '[data-testid="global-pool-buckets-list"]',
        fallbackSelector: '[data-testid="pool-distribution-sidebar"]',
        highlightPadding: 8,
        cardPosition: 'bottom-left',
        ctaLabel: 'Next: Smart Order Router & Fiat Bridge →'
    },
    {
        id: 'fiat-bridge-and-wholesale-floor',
        chapter: '03 • NON-CUSTODIAL FIAT & SOR BRIDGE',
        stepNumber: 3,
        title: '0.10% Wholesale Floor & Cheapest KAS',
        subtitle: 'Direct Self-Custody Delivery & ABA Mod-10 Verification',
        description:
            'Perennia LLC never takes custody of customer swap principal. All swaps and on-ramp conversions enforce a strict 0.10% hard profit floor on top of rail costs for active miners, monthly pass subscribers, and the kickoff promo cohort (0.15% standard public tier).',
        bullets: [
            'Instant 9-digit Federal Reserve ABA Mod-10 routing checksum verification',
            'Direct delivery to your self-custody Kaspa L1 wallet or 1-click SILO auto-staking',
            'Downloadable PDF wire slips and ACH settlement receipts compiled locally in your browser'
        ],
        tab: 'DEX',
        targetSelector: '[data-testid="fiat-bridge-panel"]',
        fallbackSelector: 'main',
        highlightPadding: 10,
        cardPosition: 'bottom-right',
        ctaLabel: 'Next: 11-Chain Sovereign Vault →'
    },
    {
        id: 'sovereign-treasury-and-airlock',
        chapter: '04 • 11-CHAIN HONEYCOMB & COLD AIRLOCK',
        stepNumber: 4,
        title: 'Client-Side Key Derivation & Cold Storage Airlock',
        subtitle: 'WebCrypto AES-256-GCM Vault & Automated Overflow Sweeps',
        description:
            'Your 24-word BIP-39 mnemonic derives native keys across 11 blockchains (KAS, BTC, ETH, SOL, XRP, DOGE, POL, AVAX, SUI, TRX, ZEC) 100% locally in your browser. Configure per-token Cold Storage Airlock rules to automatically sweep excess balances to your hardware wallet.',
        bullets: [
            'Zero private keys or seed phrases ever leave your browser memory',
            'HMAC-SHA256 row signatures protect your platform yield reservoir against tampering',
            '60-second Chronos Airlock daemon automatically dispatches overflow above your ceiling'
        ],
        tab: 'TREASURY',
        targetSelector: '[data-testid="treasury-vault-view"]',
        fallbackSelector: 'main',
        highlightPadding: 10,
        cardPosition: 'bottom-right',
        ctaLabel: 'Next: Passive HIFO Tax Fortress →'
    },
    {
        id: 'passive-hifo-tax-fortress',
        chapter: '05 • PASSIVE HIFO TAX FORTRESS',
        stepNumber: 5,
        title: 'Automated HIFO Lot Matching & Corporate Vouchers',
        subtitle: 'Local Form 8949 / 1099-DA PDF Compiler & IRC §162/§179 Vouchers',
        description:
            'Every mining reward, on-ramp purchase, and DEX swap is logged with its exact Fair Market Value (FMV) in USD. Disposals automatically consume your highest cost-basis lots first (Passive HIFO) to minimize taxable gains.',
        bullets: [
            'Compile IRS Form 8949, Schedule D, and 1099-DA worksheets into PDFs locally in your browser',
            'Generate Perennia LLC corporate expense vouchers for ASIC hardware (§179) and power (§162)',
            'Export full audit-ready CSV ledgers with on-chain transaction hashes'
        ],
        tab: 'TAX',
        targetSelector: '[data-testid="tax-fortress-view"]',
        fallbackSelector: 'main',
        highlightPadding: 10,
        cardPosition: 'bottom-right',
        ctaLabel: 'Complete Walkthrough ✓'
    }
];

export function captureTutorialSnapshot(): TutorialStateSnapshot {
    return {
        activeTab: ui.activeTab || 'OPERATIONS',
        sectors: JSON.parse(JSON.stringify(ops.sectors || [])),
        workers: JSON.parse(JSON.stringify(ops.workers || []))
    };
}

export function restoreTutorialSnapshot(
    snapshot: TutorialStateSnapshot | null
): void {
    if (!snapshot) return;
    if (snapshot.activeTab) {
        ui.activeTab = snapshot.activeTab as any;
    }
}

export function measureTargetBoundingRect(
    targetSelector?: string,
    fallbackSelector?: string,
    padding = 8
): TutorialBoundingBox {
    if (!browser) {
        return { top: 0, left: 0, width: 0, height: 0, found: false };
    }

    let el: Element | null = null;
    if (targetSelector) {
        el = document.querySelector(targetSelector);
    }
    if (!el && fallbackSelector) {
        el = document.querySelector(fallbackSelector);
    }

    if (!el) {
        return { top: 0, left: 0, width: 0, height: 0, found: false };
    }

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        return { top: 0, left: 0, width: 0, height: 0, found: false };
    }

    return {
        top: Math.max(8, rect.top - padding),
        left: Math.max(8, rect.left - padding),
        width: Math.min(window.innerWidth - 16, rect.width + padding * 2),
        height: Math.min(window.innerHeight - 16, rect.height + padding * 2),
        found: true
    };
}

export async function syncTutorialStepDom(
    step: TutorialStep
): Promise<TutorialBoundingBox> {
    if (!browser) {
        return { top: 0, left: 0, width: 0, height: 0, found: false };
    }

    if (step.tab && ui.activeTab !== step.tab) {
        ui.activeTab = step.tab as any;
    }

    await new Promise((resolve) => setTimeout(resolve, 120));

    const targetEl =
        (step.targetSelector
            ? document.querySelector(step.targetSelector)
            : null) ||
        (step.fallbackSelector
            ? document.querySelector(step.fallbackSelector)
            : null);

    if (
        targetEl &&
        typeof (targetEl as HTMLElement).scrollIntoView === 'function'
    ) {
        try {
            (targetEl as HTMLElement).scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        } catch {
            // Ignore scrollIntoView notice
        }
    }

    await new Promise((resolve) => setTimeout(resolve, 140));

    return measureTargetBoundingRect(
        step.targetSelector,
        step.fallbackSelector,
        step.highlightPadding ?? 8
    );
}