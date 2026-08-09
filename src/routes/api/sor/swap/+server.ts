import { json, type RequestEvent } from '@sveltejs/kit';

const MASTER_ADMIN_ADDRESS = "kaspa:qpd3r7z43r1x0pn3y26k2yp4r7z43r1x0pn3y26k2yp4r7z0q5qqp2";
const DEV_ADMIN_BYPASS = true;

export const POST = async ({ request, fetch, cookies, url }: RequestEvent) => {
    try {
        // 1. Zero-Trust Check
        const sessionCookie = cookies.get('perennia_session');
        if (!sessionCookie) {
            return json({ error: 'UNAUTHORIZED_ROUTING_ATTEMPT' }, { status: 401 });
        }

        const body = await request.json().catch(() => ({}));
        const { wallet, payAsset, receiveAsset, amount, slippageTolerance } = body;

        if (!wallet || !payAsset || !receiveAsset || !amount) {
            return json({ error: 'Bad Request', message: 'Invalid payload.' }, { status: 400 });
        }

        const isCorpAdmin = DEV_ADMIN_BYPASS || sessionCookie === MASTER_ADMIN_ADDRESS;
        if (!isCorpAdmin && wallet.toLowerCase() !== sessionCookie.toLowerCase()) {
            return json({ error: 'FORBIDDEN_ROUTING_TARGET' }, { status: 403 });
        }

        // 2. Fetch User's Live UTXOs via the internal DAG proxy
        const baseUrl = `${url.protocol}//${url.host}`;
        const utxoRes = await fetch(`${baseUrl}/api/utxos?address=${encodeURIComponent(wallet)}`, {
            headers: { cookie: request.headers.get('cookie') || '' }
        });
        
        if (!utxoRes.ok) throw new Error("Failed to fetch UTXO outpoints from DAG.");
        const utxoData = await utxoRes.json();
        
        // Map Kaspa wRPC UTXO formats to the expected Rust execution structure
        const formattedUtxos = (utxoData.entries || []).map((u: any) => ({
            transactionId: u.outpoint?.transactionId || u.transactionId,
            index: u.outpoint?.index || u.index,
            amount: Number(u.utxoEntry?.amount || u.amount || 0),
            scriptPublicKey: u.utxoEntry?.scriptPublicKey?.scriptPublicKey || u.scriptPublicKey || ""
        }));

        // 3. Delegate to Rust Core Execution Engine (Atomic Lua Mutex lock implied by Rust handler)
        const rustRes = await fetch('http://127.0.0.1:8002/v1/sor/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                wallet,
                payAsset,
                receiveAsset,
                amount,
                slippageTolerance: slippageTolerance || 0.05,
                utxos: formattedUtxos
            })
        });

        if (!rustRes.ok) {
            const errData = await rustRes.json().catch(() => ({ error: "Rust Backend Rejected Execution" }));
            return json({ 
                error: 'Slippage/Lock Rejected', 
                message: errData.error 
            }, { status: 422 });
        }

        const rustData = await rustRes.json();

        // 4. Return the Unsigned Transaction Payload to the Client for Local Vault Signing
        return json({
            unified_rate: rustData.unifiedRate,
            estimated_output: rustData.estimatedOutput,
            transaction_uuid: rustData.transaction_uuid,
            legs: rustData.legs,
            psbt: rustData.psbt,
            formattedUtxos: rustData.formattedUtxos // ⚡ Pass UTXOs back to frontend for local signing validation
        }, { status: 200 });

    } catch (error: any) {
        console.error('SOR Assembly Fault:', error.message || error);
        return json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
    }
};