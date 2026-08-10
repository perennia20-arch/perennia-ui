import { json, type RequestEvent } from '@sveltejs/kit';

const MASTER_ADMIN_ADDRESS = "kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579";
const DEV_ADMIN_BYPASS = false;

export const POST = async ({ request, fetch, cookies, url }: RequestEvent) => {
    try {
        const rawCookie = cookies.get('perennia_session');
        if (!rawCookie) {
            return json({ error: 'UNAUTHORIZED_ROUTING_ATTEMPT' }, { status: 401 });
        }

        // ⚡ FIX: Decode cookie
        const sessionCookie = decodeURIComponent(rawCookie);

        const body = await request.json().catch(() => ({}));
        const { wallet, payAsset, receiveAsset, amount, slippageTolerance } = body;

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

        const rustRes = await fetch('http://127.0.0.1:8002/v1/sor/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet, payAsset, receiveAsset, amount, slippageTolerance: slippageTolerance || 0.05, utxos: formattedUtxos })
        });

        if (!rustRes.ok) {
            const errData = await rustRes.json().catch(() => ({ error: "Rust Backend Rejected Execution" }));
            return json({ error: 'Slippage/Lock Rejected', message: errData.error }, { status: 422 });
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
        console.error('SOR Assembly Fault:', error.message || error);
        return json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
    }
};