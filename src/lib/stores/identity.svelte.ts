import { browser } from '$app/environment';
import { ui } from '$lib/stores/ui.svelte';
import { operations } from '$lib/stores/operations.svelte';

const MASTER_ADMIN_ADDRESS = "kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579";
const DEV_ADMIN_BYPASS = false;

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

    get isCorporateAdmin() {
        return (
            DEV_ADMIN_BYPASS ||
            (this.activeAddress &&
                this.activeAddress.toLowerCase() === MASTER_ADMIN_ADDRESS.toLowerCase())
        );
    }

    get isReadOnlySession() {
        return this.isWalletConnected && !this.isVaultUnlocked;
    }

    normalizeKaspaAddress(addr: string | null | undefined): string | null {
        if (!addr) return null;
        const clean = addr.trim().toLowerCase();
        if (clean.startsWith('kaspa:')) return clean;
        return `kaspa:${clean}`;
    }

    hexToBytes(hex: string): Uint8Array {
        if (hex.length % 2 !== 0) throw new Error("ERR_INVALID_HEX_LENGTH");
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

    authorizeSovereignVault(vaultPayload: any) {
        this.sovereignKeys = vaultPayload.wallets;
        this.activeAddress = this.normalizeKaspaAddress(vaultPayload.wallets.kaspa.address);
        this.activeWalletType = 'sovereign';
        this.isVaultUnlocked = true;

        if (browser) {
            sessionStorage.setItem('perennia_active_wallet_type', 'sovereign');
            sessionStorage.setItem('perennia_vault_unlocked', 'true');
            localStorage.setItem('perennia_sovereign_payload', JSON.stringify(vaultPayload));
        }

        this.isWalletConnected = true;
        ui.checkFirstTimeTutorialPrompt();
    }

    hydrateStoredSovereignSession(authenticatedAddress?: string | null): boolean {
        if (!browser) return false;

        const normalizedAuth = this.normalizeKaspaAddress(authenticatedAddress);
        const rawPayload = localStorage.getItem('perennia_sovereign_payload');
        const unlockedInTab = sessionStorage.getItem('perennia_vault_unlocked') === 'true';

        if (rawPayload) {
            try {
                const parsed = JSON.parse(rawPayload);
                const vaultKaspaAddr = this.normalizeKaspaAddress(
                    parsed?.wallets?.kaspa?.address
                );

                if (vaultKaspaAddr && (!normalizedAuth || vaultKaspaAddr === normalizedAuth)) {
                    this.sovereignKeys = parsed.wallets;
                    this.activeAddress = vaultKaspaAddr;
                    this.activeWalletType = 'sovereign';

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
            } catch {
                // Ignore malformed localStorage payload
            }
        }

        if (normalizedAuth) {
            this.activeAddress = normalizedAuth;
            this.activeWalletType = 'sovereign';

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

    disconnect() {
        fetch('/api/auth', { method: 'DELETE' }).catch(() => {});
        this.activeAddress = null;
        this.isWalletConnected = false;
        this.activeWalletType = null;
        this.sovereignKeys = null;
        this.isVaultUnlocked = false;
        this.isVaultUnlockPending = false;
        this.pendingTransactionDetails = null;
        operations.purge();

        if (browser) {
            sessionStorage.removeItem('perennia_active_wallet_type');
            sessionStorage.removeItem('perennia_vault_unlocked');
        }
    }
}

export const identity = new IdentityStore();