import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import {
    isWalletMasterAdmin,
    normalizeKaspaAddressStrict,
    resolveMasterTreasuryKasAddressOptional
} from '$lib/server/kms';

export const GET: RequestHandler = async ({ cookies }: RequestEvent) => {
    const sessionId = cookies.get('perennia_session');
    if (!sessionId) {
        return json(
            {
                authenticated: false,
                isCorporateAdmin: false,
                masterTreasuryAddress: resolveMasterTreasuryKasAddressOptional()
            },
            { status: 401 }
        );
    }

    try {
        const rawAddress = await redis.get(`session:${sessionId}`);
        if (!rawAddress) {
            return json(
                {
                    authenticated: false,
                    isCorporateAdmin: false,
                    masterTreasuryAddress: resolveMasterTreasuryKasAddressOptional()
                },
            { status: 401 }
        );
        }

        const address = normalizeKaspaAddressStrict(rawAddress);
        const isCorporateAdmin = isWalletMasterAdmin(address);
        const masterTreasuryAddress = resolveMasterTreasuryKasAddressOptional();

        return json({
            authenticated: true,
            address,
            isCorporateAdmin,
            masterTreasuryAddress
        });
    } catch (e) {
        console.error('Redis Session Verification Fault:', e);
        return json(
            {
                authenticated: false,
                isCorporateAdmin: false,
                error: 'Matrix Sync Pending'
            },
            { status: 500 }
        );
    }
};