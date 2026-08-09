// src/lib/stores/kaspaStore.svelte.ts

const MASTER_ADMIN_ADDRESS = "kaspa:qpd3r7z43r1x0pn3y26k2yp4r7z43r1x0pn3y26k2yp4r7z0q5qqp2";

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