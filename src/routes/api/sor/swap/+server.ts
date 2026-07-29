import { json, type RequestEvent } from '@sveltejs/kit';
import { sorEngine } from '$lib/server/sor';
import { chronos } from '$lib/server/chronos';
import { Buffer } from 'buffer';

// Helper to convert Kaspa address to scriptPublicKey
function mockAddressToScriptPubKey(address: string): string {
    const cleanAddress = address.replace('kaspa:', '');
    return "20" + Buffer.from(cleanAddress).toString('hex').substring(0, 64) + "ac"; 
}

export const POST = async ({ request, fetch }: RequestEvent) => {
    try {
        const body = await request.json().catch(() => ({}));
        const { wallet, payAsset, receiveAsset, amount, slippageTolerance } = body;

        if (!wallet || !payAsset || !receiveAsset || !amount) {
            return json({ error: 'Bad Request', message: 'Invalid payload.' }, { status: 400 });
        }

        // 1. Acquire Atomic Lua Mutex Lock from the Rust Engine
        const lockRes = await fetch('http://127.0.0.1:8082/v1/sor/lock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                wallet: wallet,
                payAsset: payAsset,
                receiveAsset: receiveAsset,
                amount: amount,
                slippageTolerance: slippageTolerance || 0.05
            })
        });

        if (!lockRes.ok) {
            const errData = await lockRes.json().catch(() => ({ error: "Collision" }));
            return json({ 
                error: 'Slippage/Lock Rejected', 
                message: errData.error 
            }, { status: 422 });
        }
        
        const lockData = await lockRes.json();

        // 2. Execute Smart Order Router Matrix
        const sorPlan = await sorEngine.calculateSplitFill({
            payAsset,
            receiveAsset,
            amount
        });

        if (sorPlan.legs.length === 0) {
            return json({ error: 'Liquidity Exhausted', message: 'No routing paths currently available.' }, { status: 422 });
        }

        // Override unified rate with the exact cryptographically locked rate from the Rust engine
        sorPlan.unifiedRate = lockData.executed_rate || sorPlan.unifiedRate;

        // 3. Fetch User's Live UTXOs via the internal DAG proxy
        const utxoRes = await fetch(`/api/utxos?address=${encodeURIComponent(wallet)}`);
        if (!utxoRes.ok) throw new Error("Failed to fetch UTXO outpoints from DAG.");
        const utxoData = await utxoRes.json();
        
        // Map Kaspa wRPC UTXO formats to the expected Chronos structure
        const formattedUtxos = (utxoData.entries || []).map((u: any) => ({
            transactionId: u.outpoint?.transactionId || u.transactionId,
            index: u.outpoint?.index || u.index,
            amount: Number(u.utxoEntry?.amount || u.amount || 0),
            scriptPublicKey: u.utxoEntry?.scriptPublicKey?.scriptPublicKey || u.scriptPublicKey || ""
        }));

        // 4. Assemble the Atomic PSBT
        const userScriptPubKey = mockAddressToScriptPubKey(wallet);
        
        const psbt = await chronos.constructAtomicSwapPSBT(
            wallet,
            userScriptPubKey,
            sorPlan,
            formattedUtxos
        );

        // 5. Return the Unsigned Transaction Payload to the Client
        return json({
            unified_rate: sorPlan.unifiedRate,
            estimated_output: sorPlan.estimatedOutput,
            transaction_uuid: lockData.transaction_uuid,
            legs: sorPlan.legs,
            psbt: psbt 
        }, { status: 200 });

    } catch (error: any) {
        console.error('SOR Assembly Fault:', error.message || error);
        return json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
    }
};