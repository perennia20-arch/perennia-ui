import { json, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';

const MASTER_ADMIN_ADDRESS = "kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579";
const DEV_ADMIN_BYPASS = false;

export async function GET({ url, cookies }: RequestEvent) {
    // ⚡ THE FIX: Prioritize the explicit active wallet from the frontend to prevent stale cookie mismatches
    const rawSession = url.searchParams.get('address') || cookies.get('perennia_session');

    if (!rawSession) {
        return json({ workers: [], sectors: [], systemMode: 'base' }, { status: 200 });
    }

    const sessionWallet = decodeURIComponent(rawSession);
    const cleanWallet = sessionWallet.toLowerCase().replace(/kaspa:/i, '').trim();
    const prefixedWallet = `kaspa:${cleanWallet}`;
    
    const isCorpAdmin = DEV_ADMIN_BYPASS || sessionWallet.toLowerCase() === MASTER_ADMIN_ADDRESS.toLowerCase();
    const targetWalletParam = url.searchParams.get('target');

    let client;
    try {
        client = await dbPool.connect();

        let queryWalletClean = cleanWallet;
        let queryWalletPrefixed = prefixedWallet;

        if (isCorpAdmin && targetWalletParam) {
            queryWalletClean = targetWalletParam.toLowerCase().replace(/kaspa:/i, '').trim();
            queryWalletPrefixed = `kaspa:${queryWalletClean}`;
        }

        const res = await client.query(
            'SELECT layout_state FROM user_command_centers WHERE wallet_address = $1 OR wallet_address = $2',
            [queryWalletClean, queryWalletPrefixed]
        );

        if (res.rows.length > 0) {
            let bestState = res.rows[0].layout_state;
            for (const row of res.rows) {
                if (row.layout_state.sectors && row.layout_state.sectors.length > 0) {
                    bestState = row.layout_state;
                    break;
                }
            }

            if (!bestState.systemMode) bestState.systemMode = 'base';
            if (!bestState.workers) bestState.workers = [];
            if (!bestState.sectors) bestState.sectors = [];
            return json(bestState, { status: 200 });
        }
    } catch (e) {
        console.error("State Fetch Fault:", e);
    } finally {
        if (client) client.release();
    }

    return json({ workers: [], sectors: [], systemMode: 'base' }, { status: 200 });
}