import { json, type RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const MASTER_ADMIN_ADDRESS = "kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579";
const DEV_ADMIN_BYPASS = false;

// ⚡ Point SvelteKit across the network to the Rust Daemon
const nodeIp = env.UBUNTU_NODE_IP || '192.168.0.12';

export async function POST({ request, cookies }: RequestEvent) {
    const rawCookie = cookies.get('perennia_session');
    
    if (!rawCookie) {
        return json({ error: 'UNAUTHORIZED_STATE_ACTION' }, { status: 401 });
    }

    try {
        const payload = await request.json();
        const sessionWallet = decodeURIComponent(rawCookie);
        let cleanWallet = sessionWallet.toLowerCase().replace('kaspa:', '').trim();

        const isCorpAdmin = DEV_ADMIN_BYPASS || sessionWallet.toLowerCase() === MASTER_ADMIN_ADDRESS.toLowerCase();

        // ⚡ GHOST FIX: If the Master Admin is interacting with a client's asset in Global View,
        // force the API to target the client's command center instead of the Admin's.
        if (isCorpAdmin && payload.targetWallet) {
            cleanWallet = payload.targetWallet.toLowerCase().replace('kaspa:', '').trim();
        }

        // Secure internal routing to the Rust Axum Endpoint on the headless node
        const rustRes = await fetch(`http://${nodeIp}:8002/v1/state/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                wallet: cleanWallet,
                action: payload.action,
                payload: payload.payload
            }),
            // ⚡ Guarantee the browser delivers the payload even if the user refreshes instantly
            keepalive: true
        });

        if (!rustRes.ok) {
            throw new Error("Rust state engine rejected the action.");
        }

        const data = await rustRes.json();
        return json(data, { status: 200 });

    } catch (e) {
        console.error("🔴 State Action Fault:", e);
        return json({ error: 'Failed to process action' }, { status: 500 });
    }
}