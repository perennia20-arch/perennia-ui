// src/lib/stores/ui.svelte.ts
import type { SystemMode } from './types';

class UiStore {
    // Navigation & Modals
    activeTab = $state('DEX');
    showWalletModal = $state(false);
    
    // System Parameters
    systemMode = $state<SystemMode>('base');
    
    // Admin Impersonation
    adminModeActive = $state(false);
    adminTargetWallet = $state('');

    // Tax Fortress
    taxEvents = $state<any[]>([]);
}

export const ui = new UiStore();