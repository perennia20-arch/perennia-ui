import { json, type RequestEvent } from '@sveltejs/kit';
import { createRequire } from 'module';
import { env } from '$env/dynamic/private';
import { redis } from '$lib/server/redis';
import { dbPool } from '$lib/server/db';
import {
    BroadcastValidationError,
    KAS_DECIMALS,
    USD_MICROS_DECIMALS,
    atomicToUsdMicrosFloor,
    formatAtomicToDecimal,
    parseDecimalToAtomic,
    parseSompiU64,
    validateAndSanitizePostToccataBroadcastTx,
    type PostToccataTransactionV1
} from '$lib/crypto/atomicMath';

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

class UpstreamConsensusRejectionError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = 'UpstreamConsensusRejectionError';
        this.status = status;
    }
}

function normalizeKaspaBase32(addr: string): string {
    return addr.trim().toLowerCase().replace(/^kaspa:/i, '').trim();
}

function buildRestWireTransaction(sanitizedTx: PostToccataTransactionV1) {
    return {
        transaction: {
            version: sanitizedTx.version,
            inputs: sanitizedTx.inputs.map((inp) => ({
                previousOutpoint: {
                    transactionId: inp.previousOutpoint.transactionId,
                    index: inp.previousOutpoint.index
                },
                signatureScript: inp.signatureScript,
                sequence: inp.sequence,
                sigOpCount: inp.sigOpCount
            })),
            outputs: sanitizedTx.outputs.map((out) => {
                const sompiBig = parseSompiU64(out.amount, 'output.amount');
                const safeNumeric =
                    sompiBig <= BigInt(Number.MAX_SAFE_INTEGER)
                        ? Number(sompiBig)
                        : out.amount;
                return {
                    amount: safeNumeric,
                    scriptPublicKey: {
                        version: out.scriptPublicKey.version,
                        scriptPublicKey: out.scriptPublicKey.scriptPublicKey
                    },
                    ...(out.covenant ? { covenant: out.covenant } : {})
                };
            }),
            lockTime: sanitizedTx.lockTime,
            subnetworkId: sanitizedTx.subnetworkId,
            gas: sanitizedTx.gas,
            payload: sanitizedTx.payload,
            storageMass: sanitizedTx.storageMass
        }
    };
}

async function broadcastViaLocalRustNode(
    sanitizedTx: PostToccataTransactionV1,
    rustBackendUrl: string
): Promise<{ txId: string; source: string }> {
    const endpoint = `${rustBackendUrl.replace(/\/+$/, '')}/v1/broadcast`;
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: sanitizedTx }),
        signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        if (res.status === 400 || res.status === 422) {
            throw new UpstreamConsensusRejectionError(
                422,
                `Local Rust node rejected transaction (${res.status}): ${errText}`
            );
        }
        throw new Error(
            `Local Rust gRPC broadcast failed (${res.status}): ${errText}`
        );
    }
    const data = await res.json();
    const txId = data.transactionId || data.id;
    if (!txId) {
        throw new Error('Local Rust gRPC node returned no transactionId');
    }
    return {
        txId: String(txId),
        source: String(data.source || 'kaspad_grpc')
    };
}

async function broadcastViaWrpc(
    sanitizedTx: PostToccataTransactionV1,
    wrpcUrl: string
): Promise<string> {
    const cleanTx = buildRestWireTransaction(sanitizedTx).transaction;
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
        ws.on('message', (data: unknown) => {
            if (isResolved) return;
            isResolved = true;
            clearTimeout(timeout);
            ws.terminate();
            try {
                const rawText =
                    typeof data === 'string'
                        ? data
                        : data instanceof Buffer
                          ? data.toString('utf8')
                          : String(data);
                const response = JSON.parse(rawText);
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
            } catch (err: unknown) {
                reject(
                    new Error(
                        `Failed to parse wRPC response: ${err instanceof Error ? err.message : 'parse error'}`
                    )
                );
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

async function broadcastViaRest(
    sanitizedTx: PostToccataTransactionV1,
    restBaseUrl: string
): Promise<string> {
    const restPayload = buildRestWireTransaction(sanitizedTx);
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
    firstOutputSompi: bigint
): Promise<{ promotedSwap: boolean; swapOrder: Record<string, unknown> | null }> {
    const cleanWallet = normalizeKaspaBase32(sessionWallet);
    const prefixedWallet = `kaspa:${cleanWallet}`;
    const pendingSwapKey = `perennia:pending_swap:${cleanWallet}`;
    let promotedSwap = false;
    let swapOrder: Record<string, unknown> | null = null;
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
                swapOrder = JSON.parse(promotedRaw) as Record<string, unknown>;
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

    let amountKasStr = formatAtomicToDecimal(firstOutputSompi, KAS_DECIMALS, KAS_DECIMALS);
    let amountSompi = firstOutputSompi;
    if (swapOrder) {
        try {
            if (swapOrder.amount_sompi !== undefined && swapOrder.amount_sompi !== null) {
                amountSompi = parseSompiU64(swapOrder.amount_sompi, 'swapOrder.amount_sompi');
                amountKasStr = formatAtomicToDecimal(amountSompi, KAS_DECIMALS, KAS_DECIMALS);
            } else if (
                typeof swapOrder.amount_kas === 'string' ||
                (typeof swapOrder.amount_kas === 'number' &&
                    Number.isFinite(swapOrder.amount_kas) &&
                    swapOrder.amount_kas > 0)
            ) {
                const parsedSompi = parseDecimalToAtomic(
                    swapOrder.amount_kas,
                    KAS_DECIMALS,
                    'floor'
                );
                if (parsedSompi > 0n) {
                    amountSompi = parsedSompi;
                    amountKasStr = formatAtomicToDecimal(amountSompi, KAS_DECIMALS, KAS_DECIMALS);
                }
            }
        } catch {
            // Retain validated firstOutputSompi on malformed queued telemetry
        }
    }

    const actionType = promotedSwap ? 'SOVEREIGN_SWAP' : 'SOVEREIGN_TRANSFER';
    let client;
    try {
        client = await dbPool.connect();
        await client.query(
            `INSERT INTO pending_transactions (tx_id, wallet_address, amount_kas, action_type, status)
             VALUES ($1, $2, $3, $4, 'PENDING')
             ON CONFLICT (tx_id) DO NOTHING`,
            [transactionId, prefixedWallet, amountKasStr, actionType]
        );
        if (promotedSwap && swapOrder) {
            const targetAsset = String(swapOrder.target_asset || 'USDC').toUpperCase();
            const estOutAtomic =
                swapOrder.estimated_output_atomic !== undefined
                    ? parseDecimalToAtomic(String(swapOrder.estimated_output_atomic), 0, 'floor')
                    : swapOrder.estimated_output !== undefined
                      ? parseDecimalToAtomic(
                            swapOrder.estimated_output as string | number,
                            KAS_DECIMALS,
                            'floor'
                        )
                      : 0n;
            const spotE8 =
                swapOrder.spot_price_e8 !== undefined
                    ? parseDecimalToAtomic(String(swapOrder.spot_price_e8), 0, 'floor')
                    : swapOrder.spot_price !== undefined
                      ? parseDecimalToAtomic(
                            swapOrder.spot_price as string | number,
                            KAS_DECIMALS,
                            'floor'
                        )
                      : 0n;

            let grossUsdMicros = 0n;
            if (targetAsset === 'USDC' || targetAsset === 'USDT' || targetAsset === 'USD') {
                grossUsdMicros =
                    swapOrder.estimated_output !== undefined
                        ? parseDecimalToAtomic(
                              swapOrder.estimated_output as string | number,
                              USD_MICROS_DECIMALS,
                              'floor'
                          )
                        : 0n;
            } else if (spotE8 > 0n && amountSompi > 0n) {
                grossUsdMicros = atomicToUsdMicrosFloor(amountSompi, KAS_DECIMALS, spotE8);
            }

            if (grossUsdMicros > 0n && estOutAtomic > 0n) {
                const grossUsdStr = formatAtomicToDecimal(
                    grossUsdMicros,
                    USD_MICROS_DECIMALS,
                    USD_MICROS_DECIMALS
                );
                const estOutStr = formatAtomicToDecimal(estOutAtomic, KAS_DECIMALS, KAS_DECIMALS);
                const spotStr = formatAtomicToDecimal(spotE8, KAS_DECIMALS, KAS_DECIMALS);
                await client.query(
                    `INSERT INTO tax_ledger_events
                     (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution)
                     VALUES ($1, $2, 'DEX_SWAP', $3, $4, $5)`,
                    [cleanWallet, targetAsset, grossUsdStr, estOutStr, spotStr]
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

    let payload: unknown;
    try {
        const rawBody = await request.json();
        payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
        if (
            payload &&
            typeof payload === 'object' &&
            typeof (payload as Record<string, unknown>).transaction === 'string'
        ) {
            payload = {
                ...(payload as Record<string, unknown>),
                transaction: JSON.parse(String((payload as Record<string, unknown>).transaction))
            };
        }
    } catch {
        return json({ error: 'INVALID_PAYLOAD_FORMAT' }, { status: 400 });
    }

    let sanitizedTx: PostToccataTransactionV1;
    let firstOutputSompi: bigint;
    try {
        const validated = validateAndSanitizePostToccataBroadcastTx(payload);
        sanitizedTx = validated.transaction;
        firstOutputSompi = validated.firstOutputSompi;
    } catch (err: unknown) {
        if (err instanceof BroadcastValidationError) {
            return json(
                {
                    success: false,
                    code: err.code,
                    error: err.message
                },
                { status: 400 }
            );
        }
        return json({ error: 'MALFORMED_TRANSACTION_PAYLOAD' }, { status: 400 });
    }

    const rustBackendUrl =
        env.RUST_BACKEND_URL || `http://${env.UBUNTU_NODE_IP || '127.0.0.1'}:8002`;
    const kaspaRestUrl = env.KASPA_REST_URL || 'https://api.kaspa.org';
    const wrpcUrl =
        env.KASPA_WRPC_URL ||
        (env.KASPA_NODE_IP ? `ws://${env.KASPA_NODE_IP}:18110` : '');

    let transactionId = '';
    let source = 'kaspad_grpc';
    let lastError = '';

    try {
        const res = await broadcastViaLocalRustNode(sanitizedTx, rustBackendUrl);
        transactionId = res.txId;
        source = res.source;
    } catch (grpcErr: unknown) {
        if (grpcErr instanceof UpstreamConsensusRejectionError) {
            return json(
                {
                    success: false,
                    error: grpcErr.message
                },
                { status: 422 }
            );
        }
        lastError =
            grpcErr instanceof Error ? grpcErr.message : 'Local Rust gRPC broadcast failed';
        console.warn(
            `⚠️ [Perennia Proxy] Local Rust gRPC broadcast failed (${lastError}). Checking local wRPC / REST fallback...`
        );
        if (wrpcUrl) {
            try {
                transactionId = await broadcastViaWrpc(sanitizedTx, wrpcUrl);
                source = 'wrpc_fallback';
            } catch (wrpcErr: unknown) {
                lastError = `${lastError} | wRPC: ${wrpcErr instanceof Error ? wrpcErr.message : 'failed'}`;
            }
        }
        if (!transactionId) {
            try {
                transactionId = await broadcastViaRest(sanitizedTx, kaspaRestUrl);
                source = 'rest_fallback';
            } catch (restErr: unknown) {
                lastError = `${lastError} | REST: ${restErr instanceof Error ? restErr.message : 'failed'}`;
            }
        }
    }

    if (!transactionId) {
        console.error(
            '❌ [Perennia Proxy] Broadcast failed across all transports:',
            lastError
        );
        return json(
            {
                success: false,
                error: lastError || 'Node rejected transaction broadcast'
            },
            { status: 422 }
        );
    }

    const { promotedSwap } = await finalizeBroadcastAccounting(
        sessionWallet,
        transactionId,
        firstOutputSompi
    );
    return json(
        {
            success: true,
            transactionId,
            source,
            promotedSwap
        },
        { status: 200 }
    );
}
