import { json, type RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const MASTER_ADMIN_ADDRESS = "kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579";
const DEV_ADMIN_BYPASS = false;
const nodeIp = env.UBUNTU_NODE_IP || '192.168.0.12';

// ============================================================================
// L1 DEX SWAP ROUTER: Physical UTXO -> Synthetic Asset
// Requires User Signature (PSBT)
// ============================================================================
export const POST = async ({ request, fetch, cookies, url }: RequestEvent) => {
    try {
        const rawCookie = cookies.get('perennia_session');
        if (!rawCookie) {
            return json({ error: 'UNAUTHORIZED_ROUTING_ATTEMPT' }, { status: 401 });
        }

        const sessionCookie = decodeURIComponent(rawCookie);

        const body = await request.json().catch(() => ({}));
        const { wallet, payAsset, receiveAsset, amount, slippageTolerance, systemMode } = body;

        if (!wallet || !payAsset || !receiveAsset || !amount) {
            return json({ error: 'Bad Request', message: 'Invalid payload.' }, { status: 400 });
        }

        const isCorpAdmin = DEV_ADMIN_BYPASS || sessionCookie.toLowerCase() === MASTER_ADMIN_ADDRESS.toLowerCase();
        if (!isCorpAdmin && wallet.toLowerCase() !== sessionCookie.toLowerCase()) {
            return json({ error: 'FORBIDDEN_ROUTING_TARGET' }, { status: 403 });
        }

        const baseUrl = `${url.protocol}//${url.host}`;
        const utxoRes = await fetch(`${baseUrl}/api/utxos?address=${encodeURIComponent(wallet)}`, {
            headers: { cookie: request.headers.get('cookie') || '' }
        });
        
        if (!utxoRes.ok) throw new Error("Failed to fetch UTXO outpoints from DAG.");
        const utxoData = await utxoRes.json();
        
        const formattedUtxos = (utxoData.entries || []).map((u: any) => ({
            transactionId: u.outpoint?.transactionId || u.transactionId,
            index: u.outpoint?.index || u.index,
            amount: Number(u.utxoEntry?.amount || u.amount || 0),
            scriptPublicKey: u.utxoEntry?.scriptPublicKey?.scriptPublicKey || u.scriptPublicKey || ""
        }));

        // Fire to the Rust Engine for PSBT Construction and Waterfall Routing
        const rustRes = await fetch(`http://${nodeIp}:8002/v1/sor/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                wallet, 
                payAsset, 
                receiveAsset, 
                amount, 
                slippageTolerance: slippageTolerance || 0.05, 
                utxos: formattedUtxos,
                systemMode: systemMode || 'base'
            })
        });

        if (!rustRes.ok) {
            const errData = await rustRes.json().catch(() => ({ error: "Rust Backend Rejected Execution" }));
            return json({ error: 'Slippage/Lock Rejected', message: errData.error }, { status: 422 });
        }

        const rustData = await rustRes.json();

        // ⚡ NOTE: We DO NOT increment the Redis synthetic balance here anymore.
        // The balance will only increment once the transaction is broadcasted successfully
        // via the /api/broadcast endpoint, ensuring absolute zero-trust ledger safety.

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