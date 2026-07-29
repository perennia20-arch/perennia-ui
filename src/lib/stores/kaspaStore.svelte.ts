// src/lib/stores/kaspaStore.svelte.ts

const MASTER_ADMIN_ADDRESS = "kaspa:your_master_address_here";

// Create a reactive state object using Svelte 5 runes
export const walletState = $state({
    // Hardcoding a dummy address temporarily so you can see the button render
    address: "kaspa:qyp0xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", 
    devAdminBypass: true
});

// Derived state for routing
export function getIsCorporateAdmin() {
    return walletState.devAdminBypass || walletState.address === MASTER_ADMIN_ADDRESS;
}