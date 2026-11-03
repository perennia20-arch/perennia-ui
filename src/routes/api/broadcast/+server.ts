import { json, type RequestEvent } from '@sveltejs/kit';
import { createRequire } from 'module';
import { env } from '$env/dynamic/private';
import { redis } from '$lib/server/redis';
import { dbPool } from '$lib/server/db';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const LUA_PROMOTE_PENDING_SWAP = `
local order = redis.call('GET', KEYS[1])
if order then
    redis.call('DEL', KEYS[1])
    redis.call('RPUSH', KEYS[2], order)
    return order
end
return nil
`;

function normalizeKaspaBase32(addr: string): string {
    return addr.trim().toLowerCase().replace(/^kaspa:/i, '').trim();
}

function sanitizeTransactionForRest(rawTx: any) {
    const cloned = JSON.parse(JSON.stringify(rawTx));
    const inputs = (cloned.inputs || []).map((inp: any) => ({
        previousOutpoint: {
            transactionId: inp.previousOutpoint?.transactionId || inp.transactionId,
            index: Number(inp.previousOutpoint?.index ?? inp.index ?? 0)
        },
        signatureScript: inp.signatureScript || '',
        sequence: Number(inp.sequence ?? 0),
        sigOpCount: Number(inp.sigOpCount ?? 1)
    }));
    const outputs = (cloned.outputs || []).map((out: any) => {
        const rawSpk =
            typeof out.scriptPublicKey === 'string'
                ? out.scriptPublicKey
                : out.scriptPublicKey?.scriptPublicKey || '';
        const spkVersion =
            typeof out.scriptPublicKey === 'object' && out.scriptPublicKey !== null
                ? Number(out.scriptPublicKey.version ?? 0)
                : 0;
        return {
            amount: Number(out.amount ?? out.value ?? 0),
            scriptPublicKey: {
                version: spkVersion,
                scriptPublicKey: rawSpk
            }
        };
    });
    return {
        transaction: {
            version: Number(cloned.version ?? 0),
            inputs,
            outputs,
            lockTime: Number(cloned.lockTime ?? 0),
            subnetworkId:
                cloned.subnetworkId || '0000000000000000000000000000000000000000',
            gas: Number(cloned.gas ?? 0),
            payload: cloned.payload || ''
        }
    };
}

function sanitizeTransactionForWrpc(rawTx: any) {
    const cloned = JSON.parse(JSON.stringify(rawTx));
    if (Array.isArray(cloned.outputs)) {
        for (const output of cloned.outputs) {
            delete output._metadata;
        }
    }
    return cloned;
}

async function broadcastViaLocalRustNode(
    tx: any,
    rustBackendUrl: string
): Promise<string> {
    const sanitized = sanitizeTransactionForRest(tx);
    const endpoint = `${rustBackendUrl.replace(/\/+$/, '')}/v1/broadcast`;
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitized),
        signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(
            `Local Rust gRPC broadcast rejected (${res.status}): ${errText}`
        );
    }
    const data = await res.json();
    const txId = data.transactionId || data.id;
    if (!txId) {
        throw new Error('Local Rust gRPC node returned no transactionId');
    }
    return String(txId);
}

async function broadcastViaWrpc(tx: any, wrpcUrl: string): Promise<string> {
    const cleanTx = sanitizeTransactionForWrpc(tx);
    return new Promise((resolve, reject) => {
        let isResolved = false;
        const ws = new WebSocket(wrpcUrl);
        const timeout = setTimeout(() => {
            if (isResolved) return;
            isResolved = true;
            ws.terminate();
            reject(new Error('wRPC connection timed out'));
        }, 5000);
        ws.on('open', () => {
            const rpcPayload = {
                id: 2,
                method: 'submitTransaction',
                params: { transaction: cleanTx, allowOrphan: false }
            };
            ws.send(JSON.stringify(rpcPayload));
        });
        ws.on('message', (data: any) => {
            if (isResolved) return;
            isResolved = true;
            clearTimeout(timeout);
            ws.terminate();
            try {
                const response = JSON.parse(data.toString());
                if (response.error) {
                    reject(new Error(response.error.message || 'wRPC rejected transaction'));
                    return;
                }
                const txId = response.params?.transactionId || response.transactionId;
                if (!txId) {
                    reject(new Error('wRPC returned no transactionId'));
                    return;
                }
                resolve(String(txId));
            } catch (err: any) {
                reject(new Error(`Failed to parse wRPC response: ${err.message}`));
            }
        });
        ws.on('close', (code: number) => {
            if (isResolved) return;
            isResolved = true;
            clearTimeout(timeout);
            reject(new Error(`Node closed wRPC socket with code ${code}`));
        });
        ws.on('error', (err: Error) => {
            if (isResolved) return;
            isResolved = true;
            clearTimeout(timeout);
            reject(err);
        });
    });
}

async function broadcastViaRest(tx: any, restBaseUrl: string): Promise<string> {
    const restPayload = sanitizeTransactionForRest(tx);
    const endpoint = `${restBaseUrl.replace(/\/+$/, '')}/transactions`;
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(restPayload),
        signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Kaspa REST node rejected payload (${res.status}): ${errText}`);
    }
    const data = await res.json();
    const txId = data.transactionId || data.id;
    if (!txId) {
        throw new Error('Kaspa REST node returned no transactionId');
    }
    return String(txId);
}

async function finalizeBroadcastAccounting(
    sessionWallet: string,
    transactionId: string,
    fallbackOutputKas: number
): Promise<{ promotedSwap: boolean; swapOrder: any | null }> {
    const cleanWallet = normalizeKaspaBase32(sessionWallet);
    const prefixedWallet = `kaspa:${cleanWallet}`;
    const pendingSwapKey = `perennia:pending_swap:${cleanWallet}`;
    let promotedSwap = false;
    let swapOrder: any | null = null;
    try {
        const promotedRaw = await redis.eval(
            LUA_PROMOTE_PENDING_SWAP,
            2,
            pendingSwapKey,
            'perennia:sor:netting_queue'
        );
        if (promotedRaw && typeof promotedRaw === 'string') {
            promotedSwap = true;
            try {
                swapOrder = JSON.parse(promotedRaw);
            } catch {
                swapOrder = null;
            }
            console.log(
                `🟢 [Sovereign Broadcast Hook] Promoted pending swap for ${prefixedWallet} (TX: ${transactionId}) into Liquidity Pool netting queue.`
            );
        }
    } catch (redisErr) {
        console.error('Failed to promote pending swap in Redis:', redisErr);
    }
    const amountKas =
        swapOrder && typeof swapOrder.amount_kas === 'number' && swapOrder.amount_kas > 0
            ? swapOrder.amount_kas
            : fallbackOutputKas;
    const actionType = promotedSwap ? 'SOVEREIGN_SWAP' : 'SOVEREIGN_TRANSFER';
    let client;
    try {
        client = await dbPool.connect();
        await client.query(
            `INSERT INTO pending_transactions (tx_id, wallet_address, amount_kas, action_type, status)
             VALUES ($1, $2, $3, $4, 'PENDING')
             ON CONFLICT (tx_id) DO NOTHING`,
            [transactionId, prefixedWallet, amountKas, actionType]
        );
        if (promotedSwap && swapOrder) {
            const targetAsset = String(swapOrder.target_asset || 'USDC').toUpperCase();
            const estimatedOutput = Number(swapOrder.estimated_output || 0);
            const spotPrice = Number(swapOrder.spot_price || 0);
            const grossUsd =
                targetAsset === 'USDC' || targetAsset === 'USDT' || targetAsset === 'USD'
                    ? estimatedOutput
                    : amountKas * spotPrice;
            if (grossUsd > 0 && estimatedOutput > 0) {
                await client.query(
                    `INSERT INTO tax_ledger_events
                     (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution)
                     VALUES ($1, $2, 'DEX_SWAP', $3, $4, $5)`,
                    [cleanWallet, targetAsset, grossUsd, estimatedOutput, spotPrice]
                );
            }
        }
    } catch (dbErr) {
        console.error('Failed to log transaction in PostgreSQL:', dbErr);
    } finally {
        if (client) client.release();
    }
    return { promotedSwap, swapOrder };
}

export async function POST({ request, cookies }: RequestEvent) {
    const sessionId = cookies.get('perennia_session');
    if (!sessionId) {
        return json({ error: 'UNAUTHORIZED_BROADCAST_ATTEMPT' }, { status: 401 });
    }
    const sessionWallet = await redis.get(`session:${sessionId}`);
    if (!sessionWallet) {
        return json({ error: 'SESSION_EXPIRED' }, { status: 401 });
    }
    let payload: any;
    try {
        const rawBody = await request.json();
        payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    } catch {
        return json({ error: 'INVALID_PAYLOAD_FORMAT' }, { status: 400 });
    }
    let tx = payload?.transaction || payload;
    if (typeof tx === 'string') {
        try {
            tx = JSON.parse(tx);
        } catch {
            return json({ error: 'MALFORMED_TRANSACTION_JSON_STRING' }, { status: 400 });
        }
    }
    if (!tx || !Array.isArray(tx.inputs) || !Array.isArray(tx.outputs)) {
        return json({ error: 'MALFORMED_TRANSACTION_PAYLOAD' }, { status: 400 });
    }

    const rustBackendUrl =
        env.RUST_BACKEND_URL || `http://${env.UBUNTU_NODE_IP || '127.0.0.1'}:8002`;
    const kaspaRestUrl = env.KASPA_REST_URL || 'https://api.kaspa.org';
    const wrpcUrl =
        env.KASPA_WRPC_URL ||
        (env.KASPA_NODE_IP ? `ws://${env.KASPA_NODE_IP}:18110` : '');

    let transactionId = '';
    let lastError = '';

    try {
        transactionId = await broadcastViaLocalRustNode(tx, rustBackendUrl);
    } catch (grpcErr: any) {
        lastError = grpcErr.message || 'Local Rust gRPC broadcast failed';
        console.warn(
            `⚠️ [Perennia Proxy] Local Rust gRPC broadcast failed (${lastError}). Checking local wRPC / REST fallback...`
        );
        if (wrpcUrl) {
            try {
                transactionId = await broadcastViaWrpc(tx, wrpcUrl);
            } catch (wrpcErr: any) {
                lastError = `${lastError} | wRPC: ${wrpcErr.message}`;
            }
        }
        if (!transactionId) {
            try {
                transactionId = await broadcastViaRest(tx, kaspaRestUrl);
            } catch (restErr: any) {
                lastError = `${lastError} | REST: ${restErr.message}`;
            }
        }
    }

    if (!transactionId) {
        console.error(
            '❌ [Perennia Proxy] Broadcast failed across all transports:',
            lastError
        );
        return json(
            { error: lastError || 'Node rejected transaction broadcast' },
            { status: 422 }
        );
    }

    const outputAmountSompi = Number(
        tx.outputs[0]?.amount ?? tx.outputs[0]?.value ?? 0
    );
    const outputAmountKas = outputAmountSompi / 1e8;
    const { promotedSwap } = await finalizeBroadcastAccounting(
        sessionWallet,
        transactionId,
        outputAmountKas
    );
    return json(
        {
            success: true,
            transactionId,
            promotedSwap
        },
        { status: 200 }
    );
}