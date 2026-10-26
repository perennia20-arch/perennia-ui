
// src/lib/server/kms.ts

import { env } from '$env/dynamic/private';

import { Buffer } from 'buffer';



// ============================================================================

// PERENNIA ENTERPRISE KEY MANAGEMENT SERVICE (KMS) & CUSTODY

// Architecture: Hot/Cold Wallet Segregation

// ============================================================================



export interface VaultEstate {

    HOT: {

        KAS: string;

        ETH: string;

        BTC: string;

        SOL: string;

    };

    COLD: {

        KAS: string;

        ETH: string;

        BTC: string;

        SOL: string;

    };

}



const MASTER_ADMIN_ADDRESS = "kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579";



export class SovereignKMS {

    /**

     * Retrieves the corporate treasury addresses. 

     * ⚡ THE FIX: "Awaiting" bypasses the RPC fetch entirely so you don't query Vitalik's burn wallet.

     */

    public async getCorporateAddresses(): Promise<VaultEstate['HOT']> {

        return {

            KAS: env.PERENNIA_HOT_KAS_ADDRESS || MASTER_ADMIN_ADDRESS,

            ETH: env.PERENNIA_HOT_ETH_ADDRESS || 'Awaiting ETH Configuration',

            BTC: env.PERENNIA_HOT_BTC_ADDRESS || 'Awaiting BTC Configuration',

            SOL: env.PERENNIA_HOT_SOL_ADDRESS || 'Awaiting SOL Configuration'

        };

    }



    /**

     * Retrieves the Multi-Sig Cold Storage parameters.

     * Safely defaults to empty strings if the user has not configured cold storage.

     */

    public async getColdStorageAddresses(): Promise<VaultEstate['COLD']> {

        return {

            KAS: env.PERENNIA_COLD_KAS_ADDRESS || '',

            ETH: env.PERENNIA_COLD_ETH_ADDRESS || '',

            BTC: env.PERENNIA_COLD_BTC_ADDRESS || '',

            SOL: env.PERENNIA_COLD_SOL_ADDRESS || ''

        };

    }



    /**

     * Security verification for high-value API commands.

     */

    public verifyMasterAdminKey(providedKey: string): boolean {

        const expectedKey = env.PERENNIA_ADMIN_KEY;

        if (!expectedKey) {

            throw new Error("CRITICAL: PERENNIA_ADMIN_KEY not configured. Administrative endpoints are locked.");

        }



        // Timing-attack protected comparison

        if (providedKey.length !== expectedKey.length) return false;



        const expectedBuffer = Buffer.from(expectedKey);

        const providedBuffer = Buffer.from(providedKey);



        try {

            const crypto = require('node:crypto');

            return crypto.timingSafeEqual(expectedBuffer, providedBuffer);

        } catch {

            return expectedKey === providedKey;

        }

    }

}



export const perenniaKMS = new SovereignKMS();
