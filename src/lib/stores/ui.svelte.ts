import { browser } from '$app/environment';
import type { SystemMode, Worker, Sector } from './type';
import {
    CHAPTER_STEPS_REGISTRY,
    SANDBOX_WALLETS,
    SANDBOX_ONLINE_WORKER,
    SANDBOX_DEMO_SECTOR,
    SANDBOX_TAX_EVENTS,
    SANDBOX_TREASURY_PRICES,
    type TutorialRelayStepSpec
} from './tutorialRegistry';

export * from './tutorialRegistry';

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

interface LiveStateSnapshot {
    hasEntered: boolean;
    activeTab: string;
    showWalletModal: boolean;
    isWalletConnected: boolean;
    activeAddress: string | null;
    activeWalletType: 'sovereign' | null;
    sovereignKeys: any;
    isVaultUnlocked: boolean;
    workers: Worker[];
    sectors: Sector[];
    globalNetworkHashrate: number;
    globalNodeStatus: 'offline' | 'syncing' | 'connected' | 'unreachable';
    networkDifficulty: number;
    blockRewardKas: number;
    taxEvents: any[];
    assets: Array<{
        ticker: string;
        address: string;
        onChain: number;
        synthetic: number;
        lpStaked: number;
        spotPrice: number;
        delta: number;
    }>;
}

interface SandboxStoreRefs {
    identity: any;
    operations: any;
    treasury: any;
}

class UiStore {
    hasEntered = $state(false);
    activeTab = $state('OPERATIONS');
    showWalletModal = $state(false);
	walletInitialView = $state<string | null>(null);
    systemMode = $state<SystemMode>('base');
    adminModeActive = $state(false);
    adminTargetWallet = $state('');
    taxEvents = $state<any[]>([]);
    swapIntent = $state<DexSwapIntent | null>(null);

    // Global In-Context Fiat Purchase Modal State
    showFiatModal = $state(false);
    openBuyAfterAuth = $state(false);
    fiatModalTargetTicker = $state('KAS');
    fiatModalAutoStakeSilo = $state(false);
    fiatModalDefaultUsd = $state('250');

    showTutorialPrompt = $state(false);
    isTutorialActive = $state(false);
    isTutorialSandbox = $state(false);
    tutorialStep = $state<number>(1);
    tutorialChapter = $state<number>(1);
    tutorialSubStep = $state<number>(0);
    activeTourStepSpec = $state<TutorialRelayStepSpec | null>(null);
    hasCheckedTourPrompt = $state(false);
    microBadges = $state<Record<string, MicroConfirmationBadge>>({});

    private liveSnapshot: LiveStateSnapshot | null = null;
    private stores: SandboxStoreRefs | null = null;

    bindSandboxStores(refs: SandboxStoreRefs) {
        this.stores = refs;
    }

    get currentTourTargetSelector(): string {
        if (this.activeTourStepSpec?.targetSelector) {
            return this.activeTourStepSpec.targetSelector;
        }
        return '[data-tour="workers-panel"]';
    }

    openFiatModal(
        targetTicker: string = 'KAS',
        autoStakeSilo: boolean = false,
        defaultUsd: string = '250'
    ) {
        const cleanTicker = String(targetTicker || 'KAS')
            .trim()
            .toUpperCase();
        this.fiatModalTargetTicker = cleanTicker === 'USD' ? 'KAS' : cleanTicker;
        this.fiatModalAutoStakeSilo =
            this.fiatModalTargetTicker === 'SILO' ? Boolean(autoStakeSilo) : false;
        this.fiatModalDefaultUsd = String(defaultUsd || '250');
        this.showFiatModal = true;
    }

    closeFiatModal() {
        this.showFiatModal = false;
    }

    enterNexus() {
        this.hasEntered = true;
        this.activeTab = 'OPERATIONS';
        this.showWalletModal = false;
    }

    checkFirstTimeTutorialPrompt() {
        if (!browser || this.hasCheckedTourPrompt) return;
        this.hasCheckedTourPrompt = true;
        const completed = localStorage.getItem('perennia_tour_completed');
        if (!completed) {
            this.showTutorialPrompt = false;
        }
    }

    enterTutorialSandbox(forChapter: number = 1) {
        if (!this.stores) return;
        const { identity, operations, treasury } = this.stores;
        if (!this.isTutorialSandbox) {
            this.liveSnapshot = {
                hasEntered: this.hasEntered,
                activeTab: this.activeTab,
                showWalletModal: this.showWalletModal,
                isWalletConnected: identity.isWalletConnected,
                activeAddress: identity.activeAddress,
                activeWalletType: identity.activeWalletType,
                sovereignKeys: identity.sovereignKeys
                    ? JSON.parse(JSON.stringify(identity.sovereignKeys))
                    : null,
                isVaultUnlocked: identity.isVaultUnlocked,
                workers: JSON.parse(JSON.stringify(operations.workers || [])),
                sectors: JSON.parse(JSON.stringify(operations.sectors || [])),
                globalNetworkHashrate: operations.globalNetworkHashrate,
                globalNodeStatus: operations.globalNodeStatus,
                networkDifficulty: operations.networkDifficulty,
                blockRewardKas: operations.blockRewardKas,
                taxEvents: JSON.parse(JSON.stringify(this.taxEvents || [])),
                assets: (treasury.registry || []).map((a: any) => ({
                    ticker: a.ticker,
                    address: a.address,
                    onChain: a.onChain,
                    synthetic: a.synthetic,
                    lpStaked: a.lpStaked,
                    spotPrice: a.spotPrice,
                    delta: a.delta
                }))
            };
            this.isTutorialSandbox = true;
        }
        this.hasEntered = true;
        this.seedSandboxPricesAndBalances();
        this.taxEvents = JSON.parse(JSON.stringify(SANDBOX_TAX_EVENTS));
        if (forChapter === 1) {
            this.setSandboxPreWalletState();
            operations.workers = [];
            operations.sectors = [];
        } else if (forChapter === 2 || forChapter === 3) {
            this.activateSandboxWalletSession();
            operations.workers = [];
            operations.sectors = [];
        } else if (forChapter === 4) {
            this.activateSandboxWalletSession();
            operations.workers = [JSON.parse(JSON.stringify(SANDBOX_ONLINE_WORKER))];
            operations.sectors = [];
        } else {
            this.activateSandboxWalletSession();
            operations.workers = [JSON.parse(JSON.stringify(SANDBOX_ONLINE_WORKER))];
            operations.sectors = [JSON.parse(JSON.stringify(SANDBOX_DEMO_SECTOR))];
        }
    }

    seedSandboxPricesAndBalances() {
        if (!this.stores) return;
        const { operations, treasury } = this.stores;
        operations.globalNetworkHashrate = 1_180_000_000;
        operations.globalNodeStatus = 'connected';
        operations.networkDifficulty = 580_000_000_000_000;
        operations.blockRewardKas = 65.4;
        for (const item of SANDBOX_TREASURY_PRICES) {
            treasury.updateAsset(item.ticker, {
                spotPrice: item.spotPrice,
                delta: item.delta,
                onChain: item.onChain,
                synthetic: item.synthetic,
                lpStaked: item.lpStaked,
                address: item.address
            });
        }
    }

    seedSandboxFixtures() {
        this.seedSandboxPricesAndBalances();
    }

    setSandboxPreWalletState() {
        if (!this.stores) return;
        const { identity, operations } = this.stores;
        this.showWalletModal = false;
        identity.isConnecting = false;
        identity.walletMessage = '';
        identity.isWalletConnected = false;
        identity.activeAddress = null;
        identity.activeWalletType = null;
        identity.isVaultUnlocked = false;
        identity.isVaultUnlockPending = false;
        identity.pendingTransactionDetails = null;
        operations.workers = [];
        operations.sectors = [];
    }

    activateSandboxWalletSession() {
        if (!this.stores) return;
        const { identity } = this.stores;
        identity.isConnecting = false;
        identity.walletMessage = '';
        identity.sovereignKeys = JSON.parse(JSON.stringify(SANDBOX_WALLETS));
        identity.activeAddress = SANDBOX_WALLETS.kaspa.address;
        identity.activeWalletType = 'sovereign';
        identity.isVaultUnlocked = true;
        identity.isWalletConnected = true;
        identity.isVaultUnlockPending = false;
        identity.pendingTransactionDetails = null;
    }

    simulateSandboxWorkerOnline() {
        if (!this.stores) return;
        const { operations } = this.stores;
        if (!operations.workers || operations.workers.length === 0) {
            operations.workers = [JSON.parse(JSON.stringify(SANDBOX_ONLINE_WORKER))];
            return;
        }
        operations.workers = operations.workers.map((w: Worker, idx: number) =>
            idx === operations.workers.length - 1
                ? {
                      ...w,
                      isOnline: true,
                      hashRate: 4.2,
                      blocksFound: 2,
                      sharesContributed: 14820,
                      validShares: 14820,
                      hardwareType:
                          w.hardwareType && w.hardwareType !== 'Select Miner Type'
                              ? w.hardwareType
                              : 'IceRiver KS7 Lite',
                      stratumUrl: 'stratum+tcp://pool.perennia.io:3334'
                  }
                : w
        );
    }

    exitTutorialSandbox() {
        if (!this.isTutorialSandbox || !this.liveSnapshot || !this.stores) {
            this.isTutorialSandbox = false;
            return;
        }
        const { identity, operations, treasury } = this.stores;
        const snap = this.liveSnapshot;
        this.liveSnapshot = null;
        this.isTutorialSandbox = false;
        this.showWalletModal = false;
        identity.isConnecting = false;
        identity.walletMessage = '';
        identity.isVaultUnlockPending = false;
        identity.pendingTransactionDetails = null;
        identity.isWalletConnected = snap.isWalletConnected;
        identity.activeAddress = snap.activeAddress;
        identity.activeWalletType = snap.activeWalletType;
        identity.sovereignKeys = snap.sovereignKeys;
        identity.isVaultUnlocked = snap.isVaultUnlocked;
        operations.workers = snap.workers;
        operations.sectors = snap.sectors;
        operations.globalNetworkHashrate = snap.globalNetworkHashrate;
        operations.globalNodeStatus = snap.globalNodeStatus;
        operations.networkDifficulty = snap.networkDifficulty;
        operations.blockRewardKas = snap.blockRewardKas;
        this.taxEvents = snap.taxEvents;
        for (const savedAsset of snap.assets) {
            treasury.updateAsset(savedAsset.ticker, {
                address: savedAsset.address,
                onChain: savedAsset.onChain,
                synthetic: savedAsset.synthetic,
                lpStaked: savedAsset.lpStaked,
                spotPrice: savedAsset.spotPrice,
                delta: savedAsset.delta
            });
        }
        this.hasEntered = snap.hasEntered;
        this.activeTab = snap.activeTab;
    }

    private syncActiveSpecFromRegistry() {
        const chapSteps =
            CHAPTER_STEPS_REGISTRY[this.tutorialChapter] ||
            CHAPTER_STEPS_REGISTRY[1];
        const clampedIdx = Math.max(
            0,
            Math.min(chapSteps.length - 1, this.tutorialSubStep)
        );
        this.tutorialSubStep = clampedIdx;
        const spec = chapSteps[clampedIdx];
        this.activeTourStepSpec = spec;
        if (spec.tab && this.activeTab !== spec.tab) {
            this.activeTab = spec.tab;
        }
    }

    startTutorial(chapter: number = 1) {
        this.showTutorialPrompt = false;
        this.isTutorialActive = true;
        this.startChapter(chapter, 0);
    }

    startChapter(chapter: number, subStep: number = 0) {
        const clampedChapter = Math.max(1, Math.min(7, chapter));
        this.enterTutorialSandbox(clampedChapter);
        this.tutorialChapter = clampedChapter;
        this.tutorialStep = clampedChapter;
        this.tutorialSubStep = Math.max(0, subStep);
        this.syncActiveSpecFromRegistry();
    }

    registerActiveStepSpec(spec: TutorialRelayStepSpec) {
        this.activeTourStepSpec = spec;
        if (spec.tab && this.activeTab !== spec.tab) {
            this.activeTab = spec.tab;
        }
    }

    advanceTutorialSubStep(totalStepsInChapter?: number) {
        const chapSteps =
            CHAPTER_STEPS_REGISTRY[this.tutorialChapter] ||
            CHAPTER_STEPS_REGISTRY[1];
        const total = totalStepsInChapter ?? chapSteps.length;
        if (this.tutorialSubStep + 1 < total) {
            this.tutorialSubStep += 1;
            this.syncActiveSpecFromRegistry();
        } else if (this.tutorialChapter < 7) {
            this.startChapter(this.tutorialChapter + 1, 0);
        } else {
            this.completeTutorial();
        }
    }

    prevTutorialSubStep() {
        if (this.tutorialSubStep > 0) {
            this.tutorialSubStep -= 1;
            this.syncActiveSpecFromRegistry();
        } else if (this.tutorialChapter > 1) {
            const prevChap = this.tutorialChapter - 1;
            const prevSteps = CHAPTER_STEPS_REGISTRY[prevChap] || [];
            this.startChapter(prevChap, Math.max(0, prevSteps.length - 1));
        }
    }

    setTutorialStep(step: number) {
        const clamped = Math.max(1, Math.min(7, step));
        this.startChapter(clamped, 0);
    }

    toggleTutorialMode() {
        if (this.isTutorialActive) {
            this.completeTutorial();
        } else {
            this.showTutorialPrompt = false;
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
        this.activeTourStepSpec = null;
        this.exitTutorialSandbox();
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