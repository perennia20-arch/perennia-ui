import { env } from '$env/dynamic/private';

export class SovereignKMS {
    public async getCorporateAddresses() {
        return {
            // Instantly pulls your address from .env, bypassing the C++ crash entirely!
            KAS: env.PERENNIA_TREASURY_KAS_ADDRESS || 'kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579',
            ETH: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F",      // EVM liquidity silo
            BTC: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfJH754GL",      // Bitcoin cold-tier root
            SOL: "HN7cAB1wJe3D1v6K18u1nC9Wvy98aV3X45kv5FgvV61a"     // Solana treasury anchor
        };
    }
}

export const perenniaKMS = new SovereignKMS();