import { json, type RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { redis } from '$lib/server/redis';

const MASTER_ADMIN_ADDRESS = "kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579";
const DEV_ADMIN_BYPASS = false;
const rustBackendUrl = env.RUST_BACKEND_URL || `http://${env.UBUNTU_NODE_IP || '192.168.0.12'}:8002`;

export const POST = async ({ request, fetch, cookies, url }: RequestEvent) => {
    try {
        const sessionId = cookies.get('perennia_session');
        if (!sessionId) {
            return json({ error: 'UNAUTHORIZED_ROUTING_ATTEMPT' }, { status: 401 });
        }
        const sessionWalletRaw = await redis.get(`session:${sessionId}`);
        if (!sessionWalletRaw) {
            return json({ error: 'SESSION_EXPIRED' }, { status: 401 });
        }
        const sessionCookie = sessionWalletRaw;
        const body = await request.json().catch(() => ({}));
        const { wallet, payAsset, receiveAsset, amount, slippageTolerance, systemMode } = body;
        if (!wallet || !payAsset || !receiveAsset || !amount) {
            return json({ error: 'Bad Request', message: 'Invalid payload.' }, { status: 400 });
        }
        const isCorpAdmin = DEV_ADMIN_BYPASS || sessionCookie.toLowerCase() === MASTER_ADMIN_ADDRESS.toLowerCase();
        if (!isCorpAdmin && wallet.toLowerCase() !== sessionCookie.toLowerCase()) {
            return json({ error: 'FORBIDDEN_ROUTING_TARGET' }, { status: 403 });
        }
        let formattedUtxos: any[] = [];
        if (String(payAsset).trim().toUpperCase() === 'KAS') {
            try {
                const baseUrl = `${url.protocol}//${url.host}`;
                const utxoRes = await fetch(`${baseUrl}/api/utxos?address=${encodeURIComponent(wallet)}`, {
                    headers: { cookie: request.headers.get('cookie') || '' }
                });
                if (utxoRes.ok) {
                    const utxoData = await utxoRes.json();
                    formattedUtxos = (utxoData.entries || []).map((u: any) => ({
                        transactionId: u.outpoint?.transactionId || u.transactionId,
                        index: Number(u.outpoint?.index ?? u.index ?? 0),
                        amount: Number(u.utxoEntry?.amount || u.amount || 0),
                        scriptPublicKey: u.utxoEntry?.scriptPublicKey?.scriptPublicKey || u.scriptPublicKey || ""
                    }));
                }
            } catch (utxoErr) {
                console.warn('UTXO pre-fetch warning (continuing for internal ledger evaluation):', utxoErr);
            }
        }
        const rustRes = await fetch(`${rustBackendUrl}/v1/sor/execute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${env.INTERNAL_ADMIN_TOKEN || env.PERENNIA_ADMIN_KEY || ''}`
            },
            body: JSON.stringify({
                wallet,
                payAsset: String(payAsset).trim().toUpperCase(),
                receiveAsset: String(receiveAsset).trim().toUpperCase(),
                amount: Number(amount),
                slippageTolerance: Number(slippageTolerance || 0.05),
                utxos: formattedUtxos,
                systemMode: systemMode || 'base'
            })
        });
        if (!rustRes.ok) {
            const errData = await rustRes.json().catch(() => ({ error: "Rust Backend Rejected Execution" }));
            return json({ error: errData.error || 'Slippage/Lock Rejected', message: errData.error }, { status: 422 });
        }
        const rustData = await rustRes.json();
        return json({
            unified_rate: rustData.unifiedRate,
            estimated_output: rustData.estimatedOutput,
            transaction_uuid: rustData.transaction_uuid,
            legs: rustData.legs,
            psbt: rustData.psbt,
            formattedUtxos: rustData.formattedUtxos
        }, { status: 200 });
    } catch (error: any) {
        console.error('DEX Swap Assembly Fault:', error.message || error);
        return json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
    }
};