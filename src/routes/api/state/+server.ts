import { json, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';

const MASTER_ADMIN_ADDRESS = "kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579";
const DEV_ADMIN_BYPASS = false;

// ============================================================================
// GLOBAL POSTGRES STATE SYNCHRONIZATION
// ============================================================================
export async function GET({ url, cookies }: RequestEvent) {
    const rawCookie = cookies.get('perennia_session');

    if (!rawCookie) {
        return json({ workers: [], sectors: [], systemMode: 'base' }, { status: 200 });
    }

    const sessionWallet = decodeURIComponent(rawCookie);
    const cleanWallet = sessionWallet.toLowerCase().replace('kaspa:', '').trim();
    const isCorpAdmin = DEV_ADMIN_BYPASS || sessionWallet.toLowerCase() === MASTER_ADMIN_ADDRESS.toLowerCase();
    const targetWalletParam = url.searchParams.get('target');

    let client;
    try {
        client = await dbPool.connect();

        let queryWallet = cleanWallet;

        // ⚡ TARGETED ADMIN OVERRIDE (Replaces Global Memory-Intensive View)
        if (isCorpAdmin && targetWalletParam) {
            queryWallet = targetWalletParam.toLowerCase().replace('kaspa:', '').trim();
        }

        const res = await client.query('SELECT layout_state FROM user_command_centers WHERE wallet_address = $1', [queryWallet]);
        if (res.rows.length > 0) {
            const state = res.rows[0].layout_state;
            if (!state.systemMode) state.systemMode = 'base';
            return json(state, { status: 200 });
        }
    } catch (e) {
        console.error("🔴 State Fetch Fault:", e);
    } finally {
        if (client) client.release();
    }

    return json({ workers: [], sectors: [], systemMode: 'base' }, { status: 200 });
}