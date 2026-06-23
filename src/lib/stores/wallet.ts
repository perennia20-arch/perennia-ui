import { writable } from 'svelte/store';

export const isWalletConnected = writable<boolean>(false);
export const walletAddress = writable<string | null>(null);

// =====================================================================
// MISSING EXPORTS FOUND!
// These are the functions the Top Navigation bar was looking for.
// =====================================================================

export function connectWallet() {
    isWalletConnected.set(true);
    // Hardcoded to match your exact hardware logs so it auto-discovers your KS0 Ultra!
    walletAddress.set('kaspa:qz2sehqzx8xetzkhz2ycqflwf8dhusyxhj0myv4ez72k0n6vdaj827jexnyzz');
}

export function disconnectWallet() {
    isWalletConnected.set(false);
    walletAddress.set(null);
}