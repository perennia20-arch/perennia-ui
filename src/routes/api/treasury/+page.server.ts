import { perenniaKMS } from '$lib/server/kms';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    try {
        // Fetch the hardcoded native addresses from the secure server-side KMS
        const addresses = await perenniaKMS.getCorporateAddresses();

        return {
            status: 'online',
            addresses
        };
    } catch (error) {
        console.error('Failed to load corporate treasury matrix:', error);
        return {
            status: 'degraded',
            addresses: {
                KAS: 'kaspa:offline_configuration_pending',
                ETH: '',
                BTC: '',
                SOL: ''
            }
        };
    }
};