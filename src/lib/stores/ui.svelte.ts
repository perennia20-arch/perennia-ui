import { browser } from '$app/environment';
import type { SystemMode } from './type';

export interface DexSwapIntent {
    payTicker: string;
    receiveTicker: string;
    payAmount: string;
    reason?: 'bucket_boost' | 'manual_route' | 'phase2_kas_exit';
    timestamp: number;
}

export interface MicroConfirmationBadge {
    id: string;
    label: string;
    accentHex: string;
    timestamp: number;
}

class UiStore {
    hasEntered = $state(false);
    activeTab = $state('OPERATIONS');
    showWalletModal = $state(false);
    systemMode = $state<SystemMode>('base');
    adminModeActive = $state(false);
    adminTargetWallet = $state('');
    taxEvents = $state<any[]>([]);
    swapIntent = $state<DexSwapIntent | null>(null);

    // Tutorial & Onboarding Spotlight State
    showTutorialPrompt = $state(false);
    isTutorialActive = $state(false);
    tutorialStep = $state<number>(1);
    hasCheckedTourPrompt = $state(false);

    // Floating Micro-Confirmation Badges (Keyed by target element ID)
    microBadges = $state<Record<string, MicroConfirmationBadge>>({});

    get currentTourTargetSelector(): string {
        if (this.tutorialStep === 1) return '[data-tour="workers-panel"]';
        if (this.tutorialStep === 2) return '[data-tour="sector-matrix"]';
        if (this.tutorialStep === 3) return '[data-tour="dex-workspace"]';
        return '[data-tour="treasury-vault"]';
    }

    enterNexus() {
        this.hasEntered = true;
        this.activeTab = 'OPERATIONS';
        this.showWalletModal = true;
    }

    checkFirstTimeTutorialPrompt() {
        if (!browser || this.hasCheckedTourPrompt) return;
        this.hasCheckedTourPrompt = true;
        const completed = localStorage.getItem('perennia_tour_completed');
        if (!completed) {
            this.showTutorialPrompt = true;
        }
    }

    startTutorial(step: number = 1) {
        this.showTutorialPrompt = false;
        this.isTutorialActive = true;
        this.setTutorialStep(step);
    }

    setTutorialStep(step: number) {
        const clamped = Math.max(1, Math.min(4, step));
        this.tutorialStep = clamped;
        if (clamped === 1 || clamped === 2) {
            this.activeTab = 'OPERATIONS';
        } else if (clamped === 3) {
            this.activeTab = 'DEX';
        } else if (clamped === 4) {
            this.activeTab = 'TREASURY';
        }
    }

    toggleTutorialMode() {
        if (this.isTutorialActive) {
            this.completeTutorial();
        } else {
            this.startTutorial(1);
        }
    }

    dismissTutorialPrompt() {
        this.showTutorialPrompt = false;
        if (browser) {
            localStorage.setItem('perennia_tour_completed', 'true');
        }
    }

    completeTutorial() {
        this.isTutorialActive = false;
        this.showTutorialPrompt = false;
        if (browser) {
            localStorage.setItem('perennia_tour_completed', 'true');
        }
    }

    triggerMicroBadge(targetKey: string, label: string, accentHex: string = '#18C6A5') {
        const id = `${targetKey}_${Date.now()}`;
        this.microBadges = {
            ...this.microBadges,
            [targetKey]: {
                id,
                label,
                accentHex,
                timestamp: Date.now()
            }
        };
        setTimeout(() => {
            if (this.microBadges[targetKey]?.id === id) {
                const next = { ...this.microBadges };
                delete next[targetKey];
                this.microBadges = next;
            }
        }, 1700);
    }

    triggerBucketBoost(targetTicker: string, neededKasAmount?: number) {
        const cleanTarget = targetTicker.trim().toUpperCase();
        const formattedKas =
            typeof neededKasAmount === 'number' && neededKasAmount > 0
                ? Math.max(0.1, Number(neededKasAmount.toFixed(4))).toString()
                : '';
        this.swapIntent = {
            payTicker: 'KAS',
            receiveTicker: cleanTarget === 'KAS' ? 'USDC' : cleanTarget,
            payAmount: formattedKas,
            reason: 'bucket_boost',
            timestamp: Date.now()
        };
        this.activeTab = 'DEX';
    }

    routeToDexSwap(
        payTicker: string,
        receiveTicker: string,
        payAmount: string = '',
        reason: 'bucket_boost' | 'manual_route' | 'phase2_kas_exit' = 'manual_route'
    ) {
        this.swapIntent = {
            payTicker: payTicker.trim().toUpperCase(),
            receiveTicker: receiveTicker.trim().toUpperCase(),
            payAmount,
            reason,
            timestamp: Date.now()
        };
        this.activeTab = 'DEX';
    }

    clearSwapIntent() {
        this.swapIntent = null;
    }
}

export const ui = new UiStore();