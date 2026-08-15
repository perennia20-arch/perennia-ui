// src/routes/api/state/action/+server.ts
import { json, type RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const MASTER_ADMIN_ADDRESS = "kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579";
const DEV_ADMIN_BYPASS = false;

// ⚡ INFRASTRUCTURE HARDENING
const rustBackendUrl = env.RUST_BACKEND_URL || `http://${env.UBUNTU_NODE_IP || '192.168.0.12'}:8002`;

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

        if (isCorpAdmin && payload.targetWallet) {
            cleanWallet = payload.targetWallet.toLowerCase().replace('kaspa:', '').trim();
        }

        const rustRes = await fetch(`${rustBackendUrl}/v1/state/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                wallet: cleanWallet,
                action: payload.action,
                payload: payload.payload
            }),
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