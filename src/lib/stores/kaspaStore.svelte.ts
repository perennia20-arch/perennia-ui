// src/lib/stores/kaspaStore.svelte.ts

const MASTER_ADMIN_ADDRESS = "kaspa:qz2sehqzx8xetzkhz2ycqflwf8dhusyxhj0myv4ez72k0n6vdaj827jexnyzz";

// Create a reactive state object using Svelte 5 runes
export const walletState = $state({
    address: "", 
    devAdminBypass: false
});

// Derived state for routing
export function getIsCorporateAdmin() {
    return walletState.devAdminBypass || walletState.address === MASTER_ADMIN_ADDRESS;
}