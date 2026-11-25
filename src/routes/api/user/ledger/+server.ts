import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { dbPool } from '$lib/server/db';
import {
    isWalletMasterAdmin,
    normalizeKaspaBase32Strict,
    normalizeKaspaAddressStrict
} from '$lib/server/kms';

/**
 * Sovereign L1 endpoint: custodial internal balances are permanently retired.
 * Returns empty balances with the user's configured L1 overflow ceiling preference.
 */
export const GET: RequestHandler = async ({ url, cookies }: RequestEvent) => {
    const sessionId = cookies.get('perennia_session');
    if (!sessionId) {
        return json(
            { error: 'UNAUTHORIZED: Active Sovereign session required.' },
            { status: 401 }
        );
    }

    const sessionWallet = await redis.get(`session:${sessionId}`).catch(() => null);
    if (!sessionWallet) {
        return json({ error: 'SESSION_EXPIRED' }, { status: 401 });
    }

    const requestedWallet = url.searchParams.get('wallet') || sessionWallet;
    const cleanSession = normalizeKaspaBase32Strict(sessionWallet);
    const cleanRequested = normalizeKaspaBase32Strict(requestedWallet);

    if (!cleanRequested) {
        return json({ error: 'INVALID_WALLET_ADDRESS' }, { status: 400 });
    }

    const isDirector = isWalletMasterAdmin(sessionWallet);
    if (cleanRequested !== cleanSession && !isDirector) {
        return json(
            {
                error: 'FORBIDDEN: Cannot inspect settings for another wallet.'
            },
            { status: 403 }
        );
    }

    const prefixedWallet = normalizeKaspaAddressStrict(cleanRequested);
    const coldRuleRes = await dbPool
        .query(
            `SELECT overflow_ceiling
             FROM user_cold_vault_rules
             WHERE (wallet_address = $1 OR wallet_address = $2)
               AND asset_ticker = 'KAS'
             LIMIT 1`,
            [prefixedWallet, cleanRequested]
        )
        .catch(() => ({ rows: [] as any[] }));

    const targetReserveCeilingKas = Number(
        coldRuleRes.rows[0]?.overflow_ceiling ?? 500.0
    );

    return json({
        nonCustodialL1Only: true,
        unassignedReserveKas: 0,
        unassignedReserveTargetKas: targetReserveCeilingKas
    });
};
