import { browser } from '$app/environment';
import { ui } from '$lib/stores/ui.svelte';
import { operations } from '$lib/stores/operations.svelte';

class IdentityStore {
    isWalletConnected = $state(false);
    activeAddress = $state<string | null>(null);
    activeWalletType = $state<'sovereign' | null>(null);
    sovereignKeys = $state<any>(null);
    isConnecting = $state(false);
    walletMessage = $state('');
    isVaultUnlockPending = $state(false);
    pendingTransactionDetails = $state<any>(null);
    isVaultUnlocked = $state(false);
	isWatchOnly = $state(false);
    forgePublicEnabled = $state(false);
    masterTreasuryAddress = $state<string>('');
    serverVerifiedAdmin = $state<boolean>(false);
    serverAuthenticatedAddress = $state<string | null>(null);

    get isCorporateAdmin(): boolean {
        if (!this.isWalletConnected || !this.isVaultUnlocked) return false;
        if (!this.serverVerifiedAdmin) return false;
        if (this.activeAddress && this.serverAuthenticatedAddress) {
            return (
                this.normalizeKaspaAddress(this.activeAddress) ===
                this.normalizeKaspaAddress(this.serverAuthenticatedAddress)
            );
        }
        return true;
    }

    get canAccessForge(): boolean {
        return Boolean(this.forgePublicEnabled || this.isCorporateAdmin);
    }

    get isReadOnlySession(): boolean {
        return this.isWalletConnected && !this.isVaultUnlocked;
    }

    normalizeKaspaAddress(addr: string | null | undefined): string | null {
        if (!addr) return null;
        const clean = addr.trim().toLowerCase();
        if (!clean) return null;
        if (clean.startsWith('kaspa:')) return clean;
        return `kaspa:${clean}`;
    }

    hexToBytes(hex: string): Uint8Array {
        if (hex.length % 2 !== 0) throw new Error('ERR_INVALID_HEX_LENGTH');
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        }
        return bytes;
    }

    bytesToHex(bytes: Uint8Array): string {
        return Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    }

    async syncServerAdminClearance(): Promise<void> {
        if (!browser) return;
        try {
            const [meRes, fiatRes] = await Promise.all([
                fetch('/api/auth/me'),
                fetch('/api/fiat/offramp')
            ]);
            if (meRes.ok) {
                const meData = await meRes.json();
                this.serverVerifiedAdmin = Boolean(
                    meData.authenticated && meData.isCorporateAdmin
                );
                this.serverAuthenticatedAddress =
                    meData.authenticated && meData.address
                        ? this.normalizeKaspaAddress(meData.address)
                        : null;
                if (meData.masterTreasuryAddress) {
                    this.masterTreasuryAddress =
                        this.normalizeKaspaAddress(meData.masterTreasuryAddress) || '';
                }
            } else if (meRes.status === 401 || meRes.status === 403) {
                this.serverVerifiedAdmin = false;
        this.serverAuthenticatedAddress = null;
        if (ui.activeTab === 'DIRECTOR') {
            ui.activeTab = 'OPERATIONS';
        }
                this.serverAuthenticatedAddress = null;
            }
            if (fiatRes.ok) {
                const fiatData = await fiatRes.json();
                if (fiatData.masterTreasuryKasAddress) {
                    this.masterTreasuryAddress =
                        this.normalizeKaspaAddress(
                            fiatData.masterTreasuryKasAddress
                        ) || this.masterTreasuryAddress;
                }
            }
        } catch {
            // Ignore transient network errors during clearance sync
        }
    }

    authorizeSovereignVault(vaultPayload: any) {
        this.sovereignKeys = vaultPayload.wallets;
        this.activeAddress = this.normalizeKaspaAddress(
            vaultPayload.wallets.kaspa.address
        );
        this.activeWalletType = 'sovereign';
        this.isVaultUnlocked = true;
		this.isWatchOnly = false;
		if (browser) {
			sessionStorage.removeItem('perennia_watch_only_address');
            sessionStorage.setItem('perennia_active_wallet_type', 'sovereign');
            sessionStorage.setItem('perennia_vault_unlocked', 'true');
            localStorage.setItem(
                'perennia_sovereign_payload',
                JSON.stringify(vaultPayload)
            );
        }
        this.isWalletConnected = true;
        this.syncServerAdminClearance();
        ui.checkFirstTimeTutorialPrompt();
    }

    hydrateStoredSovereignSession(authenticatedAddress?: string | null): boolean {
        if (!browser) return false;
        const normalizedAuth = this.normalizeKaspaAddress(authenticatedAddress);
        const rawPayload = localStorage.getItem('perennia_sovereign_payload');
        const unlockedInTab =
            sessionStorage.getItem('perennia_vault_unlocked') === 'true';
        if (rawPayload) {
            try {
                const parsed = JSON.parse(rawPayload);
                const vaultKaspaAddr = this.normalizeKaspaAddress(
                    parsed?.wallets?.kaspa?.address
                );
                if (
                    vaultKaspaAddr &&
                    (!normalizedAuth || vaultKaspaAddr === normalizedAuth)
                ) {
                    this.sovereignKeys = parsed.wallets;
                    this.activeAddress = vaultKaspaAddr;
                    this.activeWalletType = 'sovereign';
                    this.syncServerAdminClearance();
                    if (unlockedInTab) {
                        this.isVaultUnlocked = true;
                        this.isWalletConnected = true;
                        sessionStorage.setItem(
                            'perennia_active_wallet_type',
                            'sovereign'
                        );
                        ui.checkFirstTimeTutorialPrompt();
                        return true;
                    } else {
                        this.isVaultUnlocked = false;
                        this.isWalletConnected = false;
                        ui.showWalletModal = true;
                        return false;
                    }
                }
            } catch {
                // Ignore malformed local payload
            }
        }
        if (normalizedAuth) {
            this.activeAddress = normalizedAuth;
            this.activeWalletType = 'sovereign';
            this.syncServerAdminClearance();
            if (unlockedInTab) {
                this.isVaultUnlocked = true;
                this.isWalletConnected = true;
                sessionStorage.setItem('perennia_active_wallet_type', 'sovereign');
                ui.checkFirstTimeTutorialPrompt();
                return true;
            } else {
                this.isVaultUnlocked = false;
                this.isWalletConnected = false;
                ui.showWalletModal = true;
                return false;
            }
        }
        return false;
    }

    requestVaultAuthorization(transactionDetails: any) {
        this.pendingTransactionDetails = transactionDetails;
        this.isVaultUnlockPending = true;
        ui.showWalletModal = true;
    }

    connectWatchOnlyKaspa(rawAddr: string): boolean {
		const norm = this.normalizeKaspaAddress(rawAddr);
		if (!norm || norm.length < 60) return false;
		this.sovereignKeys = { kaspa: { address: norm } };
		this.activeAddress = norm;
		this.activeWalletType = 'sovereign';
		this.isVaultUnlocked = false;
		this.isWatchOnly = true;
		this.isWalletConnected = true;
		this.serverVerifiedAdmin = false;
		if (browser) { sessionStorage.setItem('perennia_watch_only_address', norm); sessionStorage.removeItem('perennia_vault_unlocked'); }
		return true;
	}
	disconnect() {
		this.isWatchOnly = false;
		if (browser) sessionStorage.removeItem('perennia_watch_only_address');
        fetch('/api/auth', { method: 'DELETE' }).catch(() => {});
        this.activeAddress = null;
        this.isWalletConnected = false;
        this.activeWalletType = null;
        this.sovereignKeys = null;
        this.isVaultUnlocked = false;
        this.isVaultUnlockPending = false;
        this.pendingTransactionDetails = null;
        this.serverVerifiedAdmin = false;
        operations.purge();
        if (browser) {
            sessionStorage.removeItem('perennia_active_wallet_type');
            sessionStorage.removeItem('perennia_vault_unlocked');
        }
    }
}

export const identity = new IdentityStore();