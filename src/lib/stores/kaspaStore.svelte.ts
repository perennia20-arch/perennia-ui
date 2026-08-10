const MASTER_ADMIN_ADDRESS = "kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579";

// Create a reactive state object using Svelte 5 runes
export const walletState = $state({
    address: "kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579", 
    devAdminBypass: false
});

// Derived state for routing
export function getIsCorporateAdmin() {
    return walletState.devAdminBypass || walletState.address.toLowerCase() === MASTER_ADMIN_ADDRESS.toLowerCase();
}