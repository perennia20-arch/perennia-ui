import { schnorr } from '@noble/curves/secp256k1.js';
import type { SovereignVaultKeys } from '$lib/crypto/honeycomb';
import {
    hexToBytes,
    bytesToHex,
    decodeAddressToScript,
    resolveKasplexProtocolInfo
} from '$lib/crypto/kaspaAddress';
import {
    compileSilverScriptProofOfLockVault,
    type CapTableEntry,
    type CapTableFanoutReceipt,
    type ForgeTokenStandard
} from '$lib/crypto/silverscript';
import {
    getChainExplorerTxUrl,
    signAndBroadcastNonKaspaL1Transfer
} from '$lib/crypto/multiChainSigner';
import {
    KAS_DECIMALS,
    MIN_CHANGE_SOMPI,
    NATIVE_SUBNETWORK_ID_HEX,
    POST_TOCCATA_TX_VERSION,
    RELAY_FEE_PER_GRAM_SOMPI,
    SIGHASH_ALL,
    SIGHASH_SINGLE_ANYONECANPAY,
    computeKaspaTxV1InputSighash,
    computePostToccataMassAndFee,
    computePostToccataStorageMass,
    normalizeSubnetworkIdHex,
    parseDecimalToAtomic,
    parseKasDecimalToSompi,
    parseSompiU64,
    signSorPskt,
    signVaultCancelPskt,
    type Kip20CovenantBinding,
    type PostToccataTxOutput,
    type PostToccataTransactionV1,
    type PsktPayload
} from '$lib/crypto/atomicMath';

export * from '$lib/crypto/kaspaAddress';
export * from '$lib/crypto/silverscript';
export * from '$lib/crypto/multiChainSigner';
export * from '$lib/crypto/atomicMath';

class TransactionEngineState {
    decryptedPrivateKeyHex = $state('');
    address = $state('');
    isBroadcasting = $state(false);
    lastTxId = $state('');
    lastExplorerUrl = $state('');
    lastFanoutReceipts = $state<CapTableFanoutReceipt[]>([]);
    error = $state('');
    get overlayClass() {
        return this.isBroadcasting
            ? 'fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--bg-overlay)] font-mono text-[var(--text-primary)] font-bold tracking-widest uppercase transition-none'
            : 'hidden';
    }
}

export const txState = new TransactionEngineState();

function extractUtxoSpk(u: any, fallbackHex?: string): { version: number; scriptPublicKey: string } {
    const raw = u?.scriptPublicKey ?? u?.utxoEntry?.scriptPublicKey;
    if (typeof raw === 'string') {
        return { version: 0, scriptPublicKey: raw };
    }
    if (raw && typeof raw === 'object') {
        return {
            version: Number(raw.version ?? 0),
            scriptPublicKey: String(raw.scriptPublicKey ?? fallbackHex ?? '')
        };
    }
    return { version: 0, scriptPublicKey: String(fallbackHex ?? '') };
}

function readUtxoAmountSompi(u: any): bigint {
    return parseSompiU64(u?.amount ?? u?.utxoEntry?.amount ?? '0', 'utxo.amount');
}

function wipePrivateKeyState(privKeyBytes: Uint8Array) {
    if (privKeyBytes.length > 0) privKeyBytes.fill(0);
    txState.decryptedPrivateKeyHex = '0'.repeat(64);
    txState.decryptedPrivateKeyHex = '';
}

async function postSignedTransactionToProxy(
    tx: PostToccataTransactionV1,
    errPrefix = 'ERR_BROADCAST_REJECTED'
): Promise<string> {
    const broadcastRes = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: tx })
    });
    if (!broadcastRes.ok) {
        const errData = await broadcastRes.json().catch(() => ({}));
        throw new Error(`${errPrefix}: ${errData.error || 'Node refused payload'}`);
    }
    const resData = await broadcastRes.json();
    const txId = String(resData.transactionId || resData.id || '');
    if (!txId) {
        throw new Error(`${errPrefix}: Missing transactionId in broadcast response`);
    }
    return txId;
}

/**
 * Signs and broadcasts a `BUILD_VAULT_CANCEL_PSKT` Path A owner cancellation PSKT locally.
 */
export async function signAndBroadcastVaultCancelPskt(params: {
    pskt: PsktPayload;
    redeemScriptHex?: string;
    feeBreakdown?: { storageMass?: number | string };
}): Promise<string> {
    if (!txState.decryptedPrivateKeyHex) throw new Error('ERR_VAULT_LOCKED');
    txState.isBroadcasting = true;
    txState.error = '';
    const keySnapshot = txState.decryptedPrivateKeyHex;
    txState.decryptedPrivateKeyHex = '0'.repeat(64);
    txState.decryptedPrivateKeyHex = '';
    try {
        const signedTx = signVaultCancelPskt({
            pskt: params.pskt,
            privateKeyHex: keySnapshot,
            redeemScriptHex: params.redeemScriptHex,
            storageMass: params.feeBreakdown?.storageMass
        });
        const txId = await postSignedTransactionToProxy(
            signedTx,
            'ERR_VAULT_CANCEL_BROADCAST_REJECTED'
        );
        txState.lastTxId = txId;
        txState.lastExplorerUrl = getChainExplorerTxUrl('KAS', txId);
        return txId;
    } catch (e: any) {
        txState.error = e?.message || 'Vault cancellation broadcast failed';
        throw e;
    } finally {
        txState.isBroadcasting = false;
        txState.decryptedPrivateKeyHex = '0'.repeat(64);
        txState.decryptedPrivateKeyHex = '';
    }
}

/**
 * Signs and broadcasts an unsigned `:8002` `POST /v1/sor/execute` PSKT locally.
 */
export async function signAndBroadcastSorPskt(params: {
    pskt: PsktPayload;
    formattedUtxos?: any[];
}): Promise<string> {
    if (!txState.decryptedPrivateKeyHex) throw new Error('ERR_VAULT_LOCKED');
    txState.isBroadcasting = true;
    txState.error = '';
    const keySnapshot = txState.decryptedPrivateKeyHex;
    txState.decryptedPrivateKeyHex = '0'.repeat(64);
    txState.decryptedPrivateKeyHex = '';
    try {
        const signedTx = signSorPskt({
            pskt: params.pskt,
            privateKeyHex: keySnapshot,
            formattedUtxos: params.formattedUtxos
        });
        const txId = await postSignedTransactionToProxy(
            signedTx,
            'ERR_SOR_BROADCAST_REJECTED'
        );
        txState.lastTxId = txId;
        txState.lastExplorerUrl = getChainExplorerTxUrl('KAS', txId);
        return txId;
    } catch (e: any) {
        txState.error = e?.message || 'Swap broadcast failed';
        throw e;
    } finally {
        txState.isBroadcasting = false;
        txState.decryptedPrivateKeyHex = '0'.repeat(64);
        txState.decryptedPrivateKeyHex = '';
    }
}

export async function executeSovereignPSBT(
    unsignedTx: any,
    utxoReferenceData: any[]
): Promise<string> {
    if (!txState.decryptedPrivateKeyHex) throw new Error('ERR_VAULT_LOCKED');
    txState.isBroadcasting = true;
    txState.error = '';
    let privKeyBytes: Uint8Array = new Uint8Array(0);
    try {
        privKeyBytes = hexToBytes(txState.decryptedPrivateKeyHex);
        const rawTx = JSON.parse(JSON.stringify(unsignedTx));
        const inputAmounts: bigint[] = [];
        const inputSpks: Array<{ version: number; scriptPublicKey: string }> = [];

        const txInputs = (rawTx.inputs || []).map((input: any, i: number) => {
            const utxo = utxoReferenceData.find(
                (u) =>
                    (u.transactionId ?? u.outpoint?.transactionId) ===
                        input.previousOutpoint.transactionId &&
                    Number(u.index ?? u.outpoint?.index ?? 0) ===
                        Number(input.previousOutpoint.index)
            );
            if (!utxo) throw new Error(`ERR_MISSING_UTXO_REFERENCE_FOR_INPUT_${i}`);
            const spk = extractUtxoSpk(utxo);
            const amt = readUtxoAmountSompi(utxo);
            inputAmounts.push(amt);
            inputSpks.push(spk);
            return {
                previousOutpoint: {
                    transactionId: input.previousOutpoint.transactionId,
                    index: Number(input.previousOutpoint.index)
                },
                signatureScript: '',
                sequence: Number(input.sequence ?? 0),
                sigOpCount: Math.max(1, Number(input.sigOpCount ?? 1))
            };
        });

        const outputAmounts: bigint[] = [];
        const txOutputs: PostToccataTxOutput[] = (rawTx.outputs || []).map(
            (output: any, idx: number) => {
                delete output._metadata;
                const amt = parseSompiU64(output.amount ?? output.value, `psbt.outputs[${idx}].amount`);
                outputAmounts.push(amt);
                const spk = extractUtxoSpk(output);
                const cov = output.covenant as Kip20CovenantBinding | undefined;
                return {
                    amount: amt.toString(),
                    scriptPublicKey: spk,
                    ...(cov ? { covenant: cov } : {})
                };
            }
        );

        const storageMass =
            rawTx.storageMass !== undefined && rawTx.storageMass !== null
                ? parseSompiU64(rawTx.storageMass, 'storageMass')
                : computePostToccataStorageMass(inputAmounts, outputAmounts);

        const tx: PostToccataTransactionV1 = {
            version: POST_TOCCATA_TX_VERSION,
            inputs: txInputs,
            outputs: txOutputs,
            lockTime: Number(rawTx.lockTime ?? 0),
            subnetworkId: normalizeSubnetworkIdHex(rawTx.subnetworkId),
            gas: Number(rawTx.gas ?? 0),
            payload: String(rawTx.payload ?? ''),
            storageMass: storageMass.toString()
        };

        for (let i = 0; i < tx.inputs.length; i += 1) {
            const sighash = computeKaspaTxV1InputSighash(
                tx,
                i,
                inputSpks[i].scriptPublicKey,
                inputAmounts[i],
                SIGHASH_ALL,
                inputSpks[i].version
            );
            const signature = schnorr.sign(sighash, privKeyBytes);
            tx.inputs[i].signatureScript = `41${bytesToHex(signature)}01`;
        }

        wipePrivateKeyState(privKeyBytes);
        const txId = await postSignedTransactionToProxy(tx, 'ERR_BROADCAST_REJECTED');
        txState.lastTxId = txId;
        txState.lastExplorerUrl = getChainExplorerTxUrl('KAS', txId);
        return txId;
    } catch (e: any) {
        txState.error = e.message;
        throw e;
    } finally {
        wipePrivateKeyState(privKeyBytes);
        txState.isBroadcasting = false;
    }
}

export async function signClientP2pOffer(
    sellAmountKas: number | string,
    buyAmountKas: number | string,
    utxos: any[]
): Promise<string> {
    if (!txState.decryptedPrivateKeyHex) throw new Error('ERR_VAULT_LOCKED');
    txState.isBroadcasting = true;
    txState.error = '';
    let privKeyBytes: Uint8Array = new Uint8Array(0);
    try {
        privKeyBytes = hexToBytes(txState.decryptedPrivateKeyHex);
        const myPubKeyBytes = schnorr.getPublicKey(privKeyBytes);
        const sellerScriptHex = `20${bytesToHex(myPubKeyBytes)}ac`;
        const targetSellSompi = parseKasDecimalToSompi(sellAmountKas, 'floor');
        const targetBuySompi = parseKasDecimalToSompi(buyAmountKas, 'floor');
        if (targetSellSompi <= 0n || targetBuySompi <= 0n) {
            throw new Error('ERR_INVALID_P2P_AMOUNTS');
        }
        const sortedUtxos = [...(utxos || [])].sort((a, b) => {
            const amtA = readUtxoAmountSompi(a);
            const amtB = readUtxoAmountSompi(b);
            return amtA < amtB ? 1 : amtA > amtB ? -1 : 0;
        });

        let gatheredSompi = 0n;
        let networkFeeSompi = 0n;
        const usedUtxos: Array<{
            transactionId: string;
            index: number;
            amount: string;
            scriptPublicKey: string;
        }> = [];
        const inputAmounts: bigint[] = [];
        const txInputs: PostToccataTransactionV1['inputs'] = [];

        for (const u of sortedUtxos) {
            const amt = readUtxoAmountSompi(u);
            if (amt <= 0n) continue;
            const txId = String(u.transactionId ?? u.outpoint?.transactionId);
            const index = Number(u.index ?? u.outpoint?.index ?? 0);
            const spk = extractUtxoSpk(u, sellerScriptHex);
            usedUtxos.push({
                transactionId: txId,
                index,
                amount: amt.toString(),
                scriptPublicKey: spk.scriptPublicKey
            });
            txInputs.push({
                previousOutpoint: {
                    transactionId: txId,
                    index
                },
                signatureScript: '',
                sequence: 0,
                sigOpCount: 1
            });
            inputAmounts.push(amt);
            gatheredSompi += amt;
            const massInfo = computePostToccataMassAndFee({
                inputSompi: inputAmounts,
                outputSompi: [targetBuySompi],
                feePerGramSompi: RELAY_FEE_PER_GRAM_SOMPI
            });
            networkFeeSompi = massInfo.networkFeeSompi;
            if (gatheredSompi >= targetSellSompi + networkFeeSompi) break;
        }

        const totalRequired = targetSellSompi + networkFeeSompi;
        if (gatheredSompi < totalRequired) {
            throw new Error(
                `ERR_INSUFFICIENT_MASS: Required ${totalRequired} sompi to lock P2P offer, found ${gatheredSompi} sompi.`
            );
        }

        const outputAmounts: bigint[] = [targetBuySompi];
        const txOutputs: PostToccataTxOutput[] = [
            {
                amount: targetBuySompi.toString(),
                scriptPublicKey: { version: 0, scriptPublicKey: sellerScriptHex }
            }
        ];
        if (gatheredSompi >= totalRequired + MIN_CHANGE_SOMPI) {
            const changeSompi = gatheredSompi - totalRequired;
            outputAmounts.push(changeSompi);
            txOutputs.push({
                amount: changeSompi.toString(),
                scriptPublicKey: { version: 0, scriptPublicKey: sellerScriptHex }
            });
        }
        while (txOutputs.length < txInputs.length) {
            outputAmounts.push(0n);
            txOutputs.push({
                amount: '0',
                scriptPublicKey: { version: 0, scriptPublicKey: sellerScriptHex }
            });
        }

        const finalMass = computePostToccataMassAndFee({
            inputSompi: inputAmounts,
            outputSompi: outputAmounts,
            feePerGramSompi: RELAY_FEE_PER_GRAM_SOMPI
        });

        const tx: PostToccataTransactionV1 = {
            version: POST_TOCCATA_TX_VERSION,
            inputs: txInputs,
            outputs: txOutputs,
            lockTime: 0,
            subnetworkId: NATIVE_SUBNETWORK_ID_HEX,
            gas: 0,
            payload: '',
            storageMass: finalMass.storageMass.toString()
        };

        for (let i = 0; i < tx.inputs.length; i += 1) {
            const u = usedUtxos[i];
            const sighash = computeKaspaTxV1InputSighash(
                tx,
                i,
                u.scriptPublicKey,
                parseSompiU64(u.amount, `usedUtxos[${i}].amount`),
                SIGHASH_SINGLE_ANYONECANPAY
            );
            const sig = schnorr.sign(sighash, privKeyBytes);
            tx.inputs[i].signatureScript = `41${bytesToHex(sig)}83`;
        }
        wipePrivateKeyState(privKeyBytes);
        const psbtJson = {
            version: tx.version,
            inputs: tx.inputs,
            outputs: tx.outputs,
            storageMass: tx.storageMass,
            used_utxos: usedUtxos
        };
        return bytesToHex(new TextEncoder().encode(JSON.stringify(psbtJson)));
    } catch (e: any) {
        txState.error = e.message;
        throw e;
    } finally {
        wipePrivateKeyState(privKeyBytes);
        txState.isBroadcasting = false;
    }
}

export async function executeClientP2pFill(
    orderId: string,
    buyerUtxos: any[]
): Promise<string> {
    if (!txState.decryptedPrivateKeyHex) throw new Error('ERR_VAULT_LOCKED');
    txState.isBroadcasting = true;
    txState.error = '';
    let privKeyBytes: Uint8Array = new Uint8Array(0);
    try {
        privKeyBytes = hexToBytes(txState.decryptedPrivateKeyHex);
        const myPubKeyBytes = schnorr.getPublicKey(privKeyBytes);
        const buyerScriptHex = `20${bytesToHex(myPubKeyBytes)}ac`;
        const orderRes = await fetch(`/api/p2p?id=${encodeURIComponent(orderId)}`);
        if (!orderRes.ok) {
            throw new Error('P2P order not found or already filled.');
        }
        const orderData = await orderRes.json();
        const sellerPsbtHex = String(orderData.sellerPsbt || '').trim();
        if (!sellerPsbtHex) {
            throw new Error('P2P order is missing seller cryptographic PSBT.');
        }
        const sellerPsbtJsonStr = new TextDecoder().decode(hexToBytes(sellerPsbtHex));
        const sellerPsbt = JSON.parse(sellerPsbtJsonStr);
        const finalInputs: PostToccataTransactionV1['inputs'] = [...(sellerPsbt.inputs || [])];
        const finalOutputs: PostToccataTxOutput[] = (sellerPsbt.outputs || []).map(
            (out: any, idx: number) => ({
                amount: parseSompiU64(out.amount ?? out.value ?? '0', `sellerPsbt.outputs[${idx}].amount`).toString(),
                scriptPublicKey: extractUtxoSpk(out),
                ...(out.covenant ? { covenant: out.covenant } : {})
            })
        );
        const allUtxos: any[] = [...(sellerPsbt.used_utxos || [])];
        const targetBuyerSompi = parseKasDecimalToSompi(
            orderData.buyAmountAtomic
                ? '0'
                : (orderData.buyAmount ?? '0'),
            'floor'
        );
        const resolvedTargetBuyerSompi = orderData.buyAmountAtomic
            ? parseSompiU64(orderData.buyAmountAtomic, 'orderData.buyAmountAtomic')
            : targetBuyerSompi;
        const sellerProceedsSompi = orderData.sellAmountAtomic
            ? parseSompiU64(orderData.sellAmountAtomic, 'orderData.sellAmountAtomic')
            : parseKasDecimalToSompi(orderData.sellAmount ?? '0', 'floor');

        let gatheredSompi = 0n;
        const buyerInputIndices: number[] = [];
        const inputAmounts: bigint[] = allUtxos.map((u) => readUtxoAmountSompi(u));
        const baseOutputAmounts: bigint[] = finalOutputs.map((o) =>
            parseSompiU64(o.amount, 'finalOutput.amount')
        );

        let networkFeeSompi = 0n;
        for (const u of buyerUtxos || []) {
            const amt = readUtxoAmountSompi(u);
            if (amt <= 0n) continue;
            const txId = String(u.transactionId ?? u.outpoint?.transactionId);
            const index = Number(u.index ?? u.outpoint?.index ?? 0);
            const spk = extractUtxoSpk(u, buyerScriptHex);
            buyerInputIndices.push(finalInputs.length);
            finalInputs.push({
                previousOutpoint: {
                    transactionId: txId,
                    index
                },
                signatureScript: '',
                sequence: 0,
                sigOpCount: 1
            });
            allUtxos.push({
                transactionId: txId,
                index,
                amount: amt.toString(),
                scriptPublicKey: spk.scriptPublicKey
            });
            inputAmounts.push(amt);
            gatheredSompi += amt;
            const massInfo = computePostToccataMassAndFee({
                inputSompi: inputAmounts,
                outputSompi: [...baseOutputAmounts, sellerProceedsSompi],
                feePerGramSompi: RELAY_FEE_PER_GRAM_SOMPI
            });
            networkFeeSompi = massInfo.networkFeeSompi;
            if (gatheredSompi >= resolvedTargetBuyerSompi + networkFeeSompi) break;
        }

        const totalRequired = resolvedTargetBuyerSompi + networkFeeSompi;
        if (gatheredSompi < totalRequired) {
            throw new Error(
                `ERR_INSUFFICIENT_MASS: Required ${totalRequired} sompi to fill P2P offer, available ${gatheredSompi} sompi.`
            );
        }

        finalOutputs.push({
            amount: sellerProceedsSompi.toString(),
            scriptPublicKey: { version: 0, scriptPublicKey: buyerScriptHex }
        });
        if (gatheredSompi >= totalRequired + MIN_CHANGE_SOMPI) {
            finalOutputs.push({
                amount: (gatheredSompi - totalRequired).toString(),
                scriptPublicKey: { version: 0, scriptPublicKey: buyerScriptHex }
            });
        }

        const finalMass = computePostToccataMassAndFee({
            inputSompi: inputAmounts,
            outputSompi: finalOutputs.map((o) => parseSompiU64(o.amount, 'finalOutputs.amount')),
            feePerGramSompi: RELAY_FEE_PER_GRAM_SOMPI
        });

        const tx: PostToccataTransactionV1 = {
            version: POST_TOCCATA_TX_VERSION,
            inputs: finalInputs,
            outputs: finalOutputs,
            lockTime: 0,
            subnetworkId: NATIVE_SUBNETWORK_ID_HEX,
            gas: 0,
            payload: '',
            storageMass: finalMass.storageMass.toString()
        };

        for (const buyerIdx of buyerInputIndices) {
            const u = allUtxos[buyerIdx];
            const spk = extractUtxoSpk(u, buyerScriptHex);
            const sighash = computeKaspaTxV1InputSighash(
                tx,
                buyerIdx,
                spk.scriptPublicKey,
                readUtxoAmountSompi(u),
                SIGHASH_ALL,
                spk.version
            );
            const sig = schnorr.sign(sighash, privKeyBytes);
            tx.inputs[buyerIdx].signatureScript = `41${bytesToHex(sig)}01`;
        }
        wipePrivateKeyState(privKeyBytes);
        const txId = await postSignedTransactionToProxy(tx, 'ERR_P2P_BROADCAST_REJECTED');
        await fetch('/api/p2p', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'COMPLETE_P2P_FILL',
                orderId,
                txId
            })
        }).catch(() => {});
        txState.lastTxId = txId;
        txState.lastExplorerUrl = getChainExplorerTxUrl('KAS', txId);
        return txId;
    } catch (e: any) {
        txState.error = e.message;
        throw e;
    } finally {
        wipePrivateKeyState(privKeyBytes);
        txState.isBroadcasting = false;
    }
}

export async function executeSovereignKrc20Transfer(
    ticker: string,
    destinationAddress: string,
    amountTokens: number | string
): Promise<string> {
    if (!txState.decryptedPrivateKeyHex) throw new Error('ERR_VAULT_LOCKED');
    const cleanTicker = ticker.trim().toUpperCase();
    const formattedDest = destinationAddress.trim().toLowerCase().startsWith('kaspa:')
        ? destinationAddress.trim().toLowerCase()
        : `kaspa:${destinationAddress.trim().toLowerCase()}`;
    const baseUnits = parseDecimalToAtomic(amountTokens, KAS_DECIMALS, 'floor').toString();
    const inscriptionJson = JSON.stringify({
        p: 'krc-20',
        op: 'transfer',
        tick: cleanTicker,
        amt: baseUnits,
        to: formattedDest
    });
    const payloadHex = bytesToHex(new TextEncoder().encode(inscriptionJson));
    const meRes = await fetch('/api/auth/me');
    if (!meRes.ok) throw new Error('ERR_LOST_SESSION');
    const { address: myAddress } = await meRes.json();
    const utxoFetchRes = await fetch(
        `/api/utxos?address=${encodeURIComponent(myAddress)}`
    );
    if (!utxoFetchRes.ok) throw new Error('ERR_UTXO_PROXY_UNREACHABLE');
    const utxoData = await utxoFetchRes.json();
    const utxos = Array.isArray(utxoData) ? utxoData : utxoData.entries || [];
    return executeSovereignKrc20Envelope(
        {
            version: POST_TOCCATA_TX_VERSION,
            inputs: [],
            outputs: [],
            lockTime: 0,
            subnetworkId: NATIVE_SUBNETWORK_ID_HEX,
            gas: 0,
            payload: payloadHex
        },
        utxos,
        formattedDest
    );
}

async function signAndBroadcastSingleKrc20EnvelopeWithKey(
    privKeyBytes: Uint8Array,
    unsignedTx: any,
    availableUtxos: any[],
    explicitRecipientAddress?: string
): Promise<{ txId: string; remainingUtxos: any[] }> {
    const myPubKeyBytes = schnorr.getPublicKey(privKeyBytes);
    const selfScriptHex = `20${bytesToHex(myPubKeyBytes)}ac`;
    const payloadHex = String(unsignedTx?.payload || '');
    const payloadBytes = payloadHex ? hexToBytes(payloadHex) : new Uint8Array(0);
    let parsedEnvelope: any = null;
    if (payloadBytes.length > 0) {
        try {
            const decodedStr = new TextDecoder().decode(payloadBytes);
            parsedEnvelope = JSON.parse(decodedStr);
        } catch {
            parsedEnvelope = null;
        }
    }
    const isKrc20Deploy =
        (parsedEnvelope?.p === 'krc-20' || parsedEnvelope?.p === 'kcc-20') &&
        parsedEnvelope?.op === 'deploy';
    const isKrc20Mint =
        (parsedEnvelope?.p === 'krc-20' || parsedEnvelope?.p === 'kcc-20') &&
        parsedEnvelope?.op === 'mint';
    const carrierSompi = 30_000_000n;
    const destScriptHex = explicitRecipientAddress
        ? decodeAddressToScript(explicitRecipientAddress)
        : selfScriptHex;
    let kasplexFeeScriptHex = '';
    let kasplexFeeSompi = 0n;
    if (isKrc20Deploy || isKrc20Mint) {
        const info = await resolveKasplexProtocolInfo();
        const candidateFeeAddr = String(
            unsignedTx?.kasplexFeeAddress || info.feeAddress || ''
        ).trim();
        if (candidateFeeAddr && candidateFeeAddr.toLowerCase().includes('kaspa:')) {
            try {
                kasplexFeeScriptHex = decodeAddressToScript(candidateFeeAddr);
                kasplexFeeSompi = isKrc20Deploy
                    ? info.opFeeDeploySompi
                    : info.opFeeMintSompi;
            } catch {
                kasplexFeeScriptHex = '';
                kasplexFeeSompi = 0n;
            }
        }
    }
    const sortedUtxos = [...availableUtxos].sort((a, b) => {
        const amtA = readUtxoAmountSompi(a);
        const amtB = readUtxoAmountSompi(b);
        return amtA < amtB ? 1 : amtA > amtB ? -1 : 0;
    });
    const totalWalletSompi = sortedUtxos.reduce(
        (sum, u) => sum + readUtxoAmountSompi(u),
        0n
    );
    const includeKasplexFeeOutput =
        Boolean(kasplexFeeScriptHex) &&
        kasplexFeeSompi > 0n &&
        totalWalletSompi >= carrierSompi + kasplexFeeSompi + 500_000n;
    const targetOutputSompi =
        carrierSompi + (includeKasplexFeeOutput ? kasplexFeeSompi : 0n);

    let gathered = 0n;
    let fee = 0n;
    const selectedUtxos: any[] = [];
    const inputAmounts: bigint[] = [];
    const consumedKeys = new Set<string>();
    const baseOutAmounts =
        includeKasplexFeeOutput && kasplexFeeScriptHex
            ? [carrierSompi, kasplexFeeSompi]
            : [carrierSompi];

    for (const u of sortedUtxos) {
        const amt = readUtxoAmountSompi(u);
        if (amt <= 0n) continue;
        selectedUtxos.push(u);
        inputAmounts.push(amt);
        const uTxId = u.outpoint?.transactionId ?? u.transactionId;
        const uIdx = Number(u.outpoint?.index ?? u.index ?? 0);
        consumedKeys.add(`${uTxId}:${uIdx}`);
        gathered += amt;

        const provisionalMass = computePostToccataMassAndFee({
            inputSompi: inputAmounts,
            outputSompi: [...baseOutAmounts, MIN_CHANGE_SOMPI],
            payloadByteLen: payloadBytes.length,
            feePerGramSompi: RELAY_FEE_PER_GRAM_SOMPI
        });
        fee = provisionalMass.networkFeeSompi;
        if (gathered >= targetOutputSompi + fee) break;
    }
    if (gathered < targetOutputSompi + fee) {
        throw new Error(
            `ERR_INSUFFICIENT_MASS: Required ${targetOutputSompi + fee} sompi for protocol envelope, available ${gathered} sompi.`
        );
    }

    const changeSompi = gathered - targetOutputSompi - fee;
    const txInputs = selectedUtxos.map((u) => ({
        previousOutpoint: {
            transactionId: u.outpoint?.transactionId ?? u.transactionId,
            index: Number(u.outpoint?.index ?? u.index ?? 0)
        },
        signatureScript: '',
        sequence: 0,
        sigOpCount: 1
    }));
    const outputAmounts: bigint[] = [carrierSompi];
    const txOutputs: PostToccataTxOutput[] = [
        {
            amount: carrierSompi.toString(),
            scriptPublicKey: { version: 0, scriptPublicKey: destScriptHex }
        }
    ];
    if (includeKasplexFeeOutput && kasplexFeeScriptHex) {
        outputAmounts.push(kasplexFeeSompi);
        txOutputs.push({
            amount: kasplexFeeSompi.toString(),
            scriptPublicKey: { version: 0, scriptPublicKey: kasplexFeeScriptHex }
        });
    }
    let changeOutputIndex = -1;
    if (changeSompi >= MIN_CHANGE_SOMPI) {
        changeOutputIndex = txOutputs.length;
        outputAmounts.push(changeSompi);
        txOutputs.push({
            amount: changeSompi.toString(),
            scriptPublicKey: { version: 0, scriptPublicKey: selfScriptHex }
        });
    }

    const finalMass = computePostToccataMassAndFee({
        inputSompi: inputAmounts,
        outputSompi: outputAmounts,
        payloadByteLen: payloadBytes.length,
        feePerGramSompi: RELAY_FEE_PER_GRAM_SOMPI
    });

    const normalizedSubnet = normalizeSubnetworkIdHex(unsignedTx?.subnetworkId);
    const normalizedLockTime = Math.max(0, Number(unsignedTx?.lockTime ?? 0));
    const normalizedGas = Math.max(0, Number(unsignedTx?.gas ?? 0));
    const tx: PostToccataTransactionV1 = {
        version: POST_TOCCATA_TX_VERSION,
        inputs: txInputs,
        outputs: txOutputs,
        lockTime: normalizedLockTime,
        subnetworkId: normalizedSubnet,
        gas: normalizedGas,
        payload: payloadHex,
        storageMass: finalMass.storageMass.toString()
    };

    for (let i = 0; i < tx.inputs.length; i += 1) {
        const u = selectedUtxos[i];
        const spk = extractUtxoSpk(u, selfScriptHex);
        const amt = inputAmounts[i];
        const sighash = computeKaspaTxV1InputSighash(
            tx,
            i,
            spk.scriptPublicKey,
            amt,
            SIGHASH_ALL,
            spk.version
        );
        const sig = schnorr.sign(sighash, privKeyBytes);
        tx.inputs[i].signatureScript = `41${bytesToHex(sig)}01`;
    }

    const txId = await postSignedTransactionToProxy(tx, 'ERR_KRC20_BROADCAST_REJECTED');
    const remainingUtxos = sortedUtxos.filter((u) => {
        const uTxId = u.outpoint?.transactionId ?? u.transactionId;
        const uIdx = Number(u.outpoint?.index ?? u.index ?? 0);
        return !consumedKeys.has(`${uTxId}:${uIdx}`);
    });
    if (changeOutputIndex >= 0 && changeSompi >= MIN_CHANGE_SOMPI) {
        remainingUtxos.push({
            transactionId: txId,
            index: changeOutputIndex,
            amount: changeSompi.toString(),
            scriptPublicKey: selfScriptHex
        });
    }
    return { txId, remainingUtxos };
}

export async function executeSovereignKrc20Envelope(
    unsignedTx: any,
    utxos: any[],
    explicitRecipientAddress?: string
): Promise<string> {
    if (!txState.decryptedPrivateKeyHex) throw new Error('ERR_VAULT_LOCKED');
    txState.isBroadcasting = true;
    txState.error = '';
    let privKeyBytes: Uint8Array = new Uint8Array(0);
    try {
        privKeyBytes = hexToBytes(txState.decryptedPrivateKeyHex);
        let resolvedUtxos = Array.isArray(utxos) ? [...utxos] : [];
        if (resolvedUtxos.length === 0) {
            const meRes = await fetch('/api/auth/me');
            if (meRes.ok) {
                const { address: myAddress } = await meRes.json();
                if (myAddress) {
                    const utxoFetchRes = await fetch(
                        `/api/utxos?address=${encodeURIComponent(myAddress)}`
                    );
                    if (utxoFetchRes.ok) {
                        const utxoData = await utxoFetchRes.json();
                        resolvedUtxos = Array.isArray(utxoData)
                            ? utxoData
                            : utxoData.entries || [];
                    }
                }
            }
        }
        const { txId } = await signAndBroadcastSingleKrc20EnvelopeWithKey(
            privKeyBytes,
            unsignedTx,
            resolvedUtxos,
            explicitRecipientAddress
        );
        wipePrivateKeyState(privKeyBytes);
        txState.lastTxId = txId;
        txState.lastExplorerUrl = getChainExplorerTxUrl('KAS', txId);
        return txId;
    } catch (e: any) {
        txState.error = e.message;
        throw e;
    } finally {
        wipePrivateKeyState(privKeyBytes);
        txState.isBroadcasting = false;
    }
}

export async function executeSovereignKrc20DeployWithCapTableFanout(params: {
    deployPsbt: any;
    utxos: any[];
    ticker: string;
    decimals: number;
    capTable: CapTableEntry[];
}): Promise<{ deployTxId: string; fanoutReceipts: CapTableFanoutReceipt[] }> {
    if (!txState.decryptedPrivateKeyHex) throw new Error('ERR_VAULT_LOCKED');
    txState.isBroadcasting = true;
    txState.error = '';
    txState.lastFanoutReceipts = [];
    let privKeyBytes: Uint8Array = new Uint8Array(0);
    try {
        privKeyBytes = hexToBytes(txState.decryptedPrivateKeyHex);
        let currentUtxos = Array.isArray(params.utxos) ? [...params.utxos] : [];
        if (currentUtxos.length === 0) {
            const meRes = await fetch('/api/auth/me');
            if (meRes.ok) {
                const { address: myAddress } = await meRes.json();
                if (myAddress) {
                    const utxoFetchRes = await fetch(
                        `/api/utxos?address=${encodeURIComponent(myAddress)}`
                    );
                    if (utxoFetchRes.ok) {
                        const utxoData = await utxoFetchRes.json();
                        currentUtxos = Array.isArray(utxoData)
                            ? utxoData
                            : utxoData.entries || [];
                    }
                }
            }
        }
        const deployResult = await signAndBroadcastSingleKrc20EnvelopeWithKey(
            privKeyBytes,
            params.deployPsbt,
            currentUtxos
        );
        const deployTxId = deployResult.txId;
        currentUtxos = deployResult.remainingUtxos;
        const cleanTicker = params.ticker.trim().toUpperCase();
        const clampedDec = Math.max(0, Math.min(18, Math.floor(params.decimals || 8)));
        const fanoutReceipts: CapTableFanoutReceipt[] = [];
        const validAllocations = (params.capTable || []).filter(
            (row) => row.checksumValid && row.amount > 0
        );
        for (const entry of validAllocations) {
            const baseUnits = parseDecimalToAtomic(entry.amount, clampedDec, 'floor').toString();
            const isTimelocked = entry.cliffDays > 0 || entry.linearDays > 0;
            const entryStandard: ForgeTokenStandard =
                entry.tokenStandard === 'KCC-20' ? 'KCC-20' : 'KRC-20';
            const compiledVault = compileSilverScriptProofOfLockVault({
                ticker: cleanTicker,
                tokenStandard: entryStandard,
                label: entry.label,
                beneficiaryAddress: entry.address,
                totalAllocation: entry.amount,
                decimals: clampedDec,
                cliffDays: entry.cliffDays,
                linearDays: entry.linearDays
            });
            const resolvedCovenantAddress =
                entry.covenantAddress || compiledVault.covenantAddress;
            const resolvedStateRoot =
                entry.kcc20StateCommitment ||
                entry.vprogStateRoot ||
                compiledVault.kcc20State.stateRootHex;
            const lockTimeMs =
                entry.cliffDays > 0
                    ? Date.now() + entry.cliffDays * 86_400_000
                    : 0;
            const l1TargetAddress =
                isTimelocked && resolvedCovenantAddress
                    ? resolvedCovenantAddress
                    : entry.address;
            const transferEnvelopeObj: Record<string, any> = {
                p: entryStandard === 'KCC-20' ? 'kcc-20' : 'krc-20',
                op: 'transfer',
                tick: cleanTicker,
                amt: baseUnits,
                to: l1TargetAddress,
                ...(isTimelocked || entryStandard === 'KCC-20'
                    ? {
                          cov: 'SILVERSCRIPT_PROOF_OF_LOCK_V1',
                          vault: resolvedCovenantAddress,
                          beneficiary: entry.address,
                          cliff_d: entry.cliffDays,
                          lin_d: entry.linearDays,
                          kcc20_root: resolvedStateRoot.slice(0, 32)
                      }
                    : {})
            };
            const transferPayloadHex = bytesToHex(
                new TextEncoder().encode(JSON.stringify(transferEnvelopeObj))
            );
            const fanoutRes = await signAndBroadcastSingleKrc20EnvelopeWithKey(
                privKeyBytes,
                {
                    version: POST_TOCCATA_TX_VERSION,
                    inputs: [],
                    outputs: [],
                    lockTime: lockTimeMs,
                    subnetworkId: NATIVE_SUBNETWORK_ID_HEX,
                    gas: 0,
                    payload: transferPayloadHex
                },
                currentUtxos,
                l1TargetAddress
            );
            currentUtxos = fanoutRes.remainingUtxos;
            fanoutReceipts.push({
                label: entry.label,
                recipientAddress: entry.address,
                covenantAddress: isTimelocked ? resolvedCovenantAddress : undefined,
                amountTokens: entry.amount,
                cliffDays: entry.cliffDays,
                linearDays: entry.linearDays,
                txId: fanoutRes.txId,
                explorerUrl: getChainExplorerTxUrl('KAS', fanoutRes.txId),
                isTimelockedCovenant: isTimelocked,
                tokenStandard: entryStandard,
                kcc20StateCommitment: resolvedStateRoot
            });
        }
        wipePrivateKeyState(privKeyBytes);
        txState.lastTxId = deployTxId;
        txState.lastExplorerUrl = getChainExplorerTxUrl('KAS', deployTxId);
        txState.lastFanoutReceipts = fanoutReceipts;
        return { deployTxId, fanoutReceipts };
    } catch (e: any) {
        txState.error = e.message;
        throw e;
    } finally {
        wipePrivateKeyState(privKeyBytes);
        txState.isBroadcasting = false;
    }
}

export async function executeMultiChainL1Transfer(params: {
    asset: string;
    network?: string;
    destinationAddress: string;
    amount: number;
    contractAddress?: string;
    decimals?: number;
    keys: SovereignVaultKeys;
}): Promise<{ txId: string; explorerUrl: string }> {
    const cleanAsset = String(params.asset || 'KAS')
        .trim()
        .toUpperCase();
    const cleanNetwork = String(params.network || cleanAsset)
        .trim()
        .toUpperCase();
    const dest = String(params.destinationAddress || '').trim();
    const amount = Number(params.amount || 0);
    if (!dest || isNaN(amount) || amount <= 0) {
        throw new Error('ERR_INVALID_L1_TRANSFER_PARAMETERS');
    }
    if (cleanAsset === 'KAS') {
        txState.decryptedPrivateKeyHex = params.keys.kaspa.privateKey.replace(/^0x/i, '');
        const txId = await executeSovereignTransaction(dest, amount);
        const explorerUrl = getChainExplorerTxUrl('KAS', txId);
        txState.lastExplorerUrl = explorerUrl;
        return { txId, explorerUrl };
    }
    if (cleanNetwork === 'KAS' && cleanAsset !== 'KAS') {
        txState.decryptedPrivateKeyHex = params.keys.kaspa.privateKey.replace(/^0x/i, '');
        const txId = await executeSovereignKrc20Transfer(cleanAsset, dest, amount);
        const explorerUrl = getChainExplorerTxUrl('KAS', txId);
        txState.lastExplorerUrl = explorerUrl;
        return { txId, explorerUrl };
    }
    txState.isBroadcasting = true;
    txState.error = '';
    try {
        const res = await signAndBroadcastNonKaspaL1Transfer({
            cleanAsset,
            cleanNetwork,
            dest,
            amount,
            contractAddress: params.contractAddress,
            decimals: params.decimals,
            keys: params.keys
        });
        txState.lastTxId = res.txId;
        txState.lastExplorerUrl = res.explorerUrl;
        return res;
    } catch (e: any) {
        txState.error = e.message;
        throw e;
    } finally {
        txState.isBroadcasting = false;
    }
}

export async function executeSovereignTransaction(
    destinationAddress: string,
    amountKas: number | string
): Promise<string> {
    if (!txState.decryptedPrivateKeyHex) throw new Error('ERR_VAULT_LOCKED');
    txState.isBroadcasting = true;
    txState.error = '';
    let privKeyBytes: Uint8Array = new Uint8Array(0);
    try {
        privKeyBytes = hexToBytes(txState.decryptedPrivateKeyHex);
        const myPubKeyBytes = schnorr.getPublicKey(privKeyBytes);
        const sourceScriptHex = `20${bytesToHex(myPubKeyBytes)}ac`;
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok) throw new Error('ERR_LOST_SESSION');
        const { address: myAddress } = await meRes.json();
        const utxoFetchRes = await fetch(
            `/api/utxos?address=${encodeURIComponent(myAddress)}`
        );
        if (!utxoFetchRes.ok) throw new Error('ERR_UTXO_PROXY_UNREACHABLE');
        const utxoData = await utxoFetchRes.json();
        const utxos = Array.isArray(utxoData) ? utxoData : utxoData.entries || [];
        const targetSompi = parseKasDecimalToSompi(amountKas, 'floor');
        if (targetSompi <= 0n) {
            throw new Error(
                'ERR_INVALID_AMOUNT: Transfer amount must be greater than 0 sompi.'
            );
        }
        const sortedUtxos = [...utxos].sort((a, b) => {
            const amtA = readUtxoAmountSompi(a);
            const amtB = readUtxoAmountSompi(b);
            return amtA < amtB ? 1 : amtA > amtB ? -1 : 0;
        });
        let gathered = 0n;
        let fee = 0n;
        let finalStorageMass = 0n;
        const selectedUtxos: any[] = [];
        const inputAmounts: bigint[] = [];
        for (const u of sortedUtxos) {
            const amt = readUtxoAmountSompi(u);
            if (amt <= 0n) continue;
            selectedUtxos.push(u);
            inputAmounts.push(amt);
            gathered += amt;

            const provisionalMass1 = computePostToccataMassAndFee({
                inputSompi: inputAmounts,
                outputSompi: [targetSompi, MIN_CHANGE_SOMPI],
                feePerGramSompi: RELAY_FEE_PER_GRAM_SOMPI
            });
            const provisionalChange =
                gathered > targetSompi + provisionalMass1.networkFeeSompi
                    ? gathered - (targetSompi + provisionalMass1.networkFeeSompi)
                    : 0n;
            const provisionalOutputs =
                provisionalChange >= MIN_CHANGE_SOMPI
                    ? [targetSompi, provisionalChange]
                    : [targetSompi];
            const mass2 = computePostToccataMassAndFee({
                inputSompi: inputAmounts,
                outputSompi: provisionalOutputs,
                feePerGramSompi: RELAY_FEE_PER_GRAM_SOMPI
            });
            fee = mass2.networkFeeSompi;
            finalStorageMass = mass2.storageMass;
            if (gathered >= targetSompi + fee) break;
        }
        if (gathered < targetSompi + fee) {
            throw new Error(
                `ERR_INSUFFICIENT_MASS: Required ${targetSompi + fee}, Available ${gathered}`
            );
        }
        const change = gathered - targetSompi - fee;
        const destScriptHex = decodeAddressToScript(destinationAddress);
        const txInputs = selectedUtxos.map((u) => {
            const txId = u.outpoint?.transactionId ?? u.transactionId;
            const index = u.outpoint?.index ?? u.index;
            return {
                previousOutpoint: {
                    transactionId: txId,
                    index: Number(index)
                },
                signatureScript: '',
                sequence: 0,
                sigOpCount: 1
            };
        });
        const outputAmounts: bigint[] = [targetSompi];
        const txOutputs: PostToccataTxOutput[] = [
            {
                amount: targetSompi.toString(),
                scriptPublicKey: { version: 0, scriptPublicKey: destScriptHex }
            }
        ];
        if (change >= MIN_CHANGE_SOMPI) {
            outputAmounts.push(change);
            txOutputs.push({
                amount: change.toString(),
                scriptPublicKey: { version: 0, scriptPublicKey: sourceScriptHex }
            });
        }
        finalStorageMass = computePostToccataStorageMass(inputAmounts, outputAmounts);
        const tx: PostToccataTransactionV1 = {
            version: POST_TOCCATA_TX_VERSION,
            inputs: txInputs,
            outputs: txOutputs,
            lockTime: 0,
            subnetworkId: NATIVE_SUBNETWORK_ID_HEX,
            gas: 0,
            payload: '',
            storageMass: finalStorageMass.toString()
        };
        for (let i = 0; i < tx.inputs.length; i += 1) {
            const utxo = selectedUtxos[i];
            const spk = extractUtxoSpk(utxo, sourceScriptHex);
            const amt = inputAmounts[i];
            const sighash = computeKaspaTxV1InputSighash(
                tx,
                i,
                spk.scriptPublicKey,
                amt,
                SIGHASH_ALL,
                spk.version
            );
            const signature = schnorr.sign(sighash, privKeyBytes);
            tx.inputs[i].signatureScript = `41${bytesToHex(signature)}01`;
        }
        wipePrivateKeyState(privKeyBytes);
        const txId = await postSignedTransactionToProxy(tx, 'ERR_BROADCAST_REJECTED');
        txState.lastTxId = txId;
        txState.lastExplorerUrl = getChainExplorerTxUrl('KAS', txId);
        return txId;
    } catch (e: any) {
        txState.error = e.message;
        throw e;
    } finally {
        wipePrivateKeyState(privKeyBytes);
        txState.isBroadcasting = false;
    }
}

export async function executeSovereignUtxoCompound(): Promise<{
    txId: string;
    compoundedCount: number;
}> {
    if (!txState.decryptedPrivateKeyHex) throw new Error('ERR_VAULT_LOCKED');
    txState.isBroadcasting = true;
    txState.error = '';
    let privKeyBytes: Uint8Array = new Uint8Array(0);
    try {
        privKeyBytes = hexToBytes(txState.decryptedPrivateKeyHex);
        const myPubKeyBytes = schnorr.getPublicKey(privKeyBytes);
        const selfScriptHex = `20${bytesToHex(myPubKeyBytes)}ac`;
        const meRes = await fetch('/api/auth/me');
        if (!meRes.ok) throw new Error('ERR_LOST_SESSION');
        const { address: myAddress } = await meRes.json();
        const utxoFetchRes = await fetch(
            `/api/utxos?address=${encodeURIComponent(myAddress)}`
        );
        if (!utxoFetchRes.ok) throw new Error('ERR_UTXO_PROXY_UNREACHABLE');
        const utxoData = await utxoFetchRes.json();
        const utxos = Array.isArray(utxoData) ? utxoData : utxoData.entries || [];
        if (utxos.length < 2) {
            throw new Error(
                'UTXO_COMPOUND_UNNECESSARY: At least 2 UTXOs are required to compound.'
            );
        }
        const sortedUtxos = [...utxos].sort((a, b) => {
            const amtA = readUtxoAmountSompi(a);
            const amtB = readUtxoAmountSompi(b);
            return amtA < amtB ? -1 : amtA > amtB ? 1 : 0;
        });
        const selectedUtxos = sortedUtxos.slice(0, 80);
        let gathered = 0n;
        const inputAmounts: bigint[] = [];
        for (const u of selectedUtxos) {
            const amt = readUtxoAmountSompi(u);
            inputAmounts.push(amt);
            gathered += amt;
        }
        const pass1 = computePostToccataMassAndFee({
            inputSompi: inputAmounts,
            outputSompi: [gathered > 10_000n ? gathered - 10_000n : 1n],
            feePerGramSompi: RELAY_FEE_PER_GRAM_SOMPI
        });
        if (gathered <= pass1.networkFeeSompi) {
            throw new Error(
                'ERR_INSUFFICIENT_MASS: Selected UTXO sum cannot cover compounding network fee.'
            );
        }
        const pass2 = computePostToccataMassAndFee({
            inputSompi: inputAmounts,
            outputSompi: [gathered - pass1.networkFeeSompi],
            feePerGramSompi: RELAY_FEE_PER_GRAM_SOMPI
        });
        if (gathered <= pass2.networkFeeSompi) {
            throw new Error(
                'ERR_INSUFFICIENT_MASS: Selected UTXO sum cannot cover effective storage mass fee.'
            );
        }
        const finalOutputSompi = gathered - pass2.networkFeeSompi;
        const txInputs = selectedUtxos.map((u) => {
            const txId = u.outpoint?.transactionId ?? u.transactionId;
            const index = u.outpoint?.index ?? u.index;
            return {
                previousOutpoint: {
                    transactionId: txId,
                    index: Number(index)
                },
                signatureScript: '',
                sequence: 0,
                sigOpCount: 1
            };
        });
        const txOutputs: PostToccataTxOutput[] = [
            {
                amount: finalOutputSompi.toString(),
                scriptPublicKey: { version: 0, scriptPublicKey: selfScriptHex }
            }
        ];
        const finalStorageMass = computePostToccataStorageMass(inputAmounts, [
            finalOutputSompi
        ]);
        const tx: PostToccataTransactionV1 = {
            version: POST_TOCCATA_TX_VERSION,
            inputs: txInputs,
            outputs: txOutputs,
            lockTime: 0,
            subnetworkId: NATIVE_SUBNETWORK_ID_HEX,
            gas: 0,
            payload: '',
            storageMass: finalStorageMass.toString()
        };
        for (let i = 0; i < tx.inputs.length; i += 1) {
            const utxo = selectedUtxos[i];
            const spk = extractUtxoSpk(utxo, selfScriptHex);
            const amt = inputAmounts[i];
            const sighash = computeKaspaTxV1InputSighash(
                tx,
                i,
                spk.scriptPublicKey,
                amt,
                SIGHASH_ALL,
                spk.version
            );
            const signature = schnorr.sign(sighash, privKeyBytes);
            tx.inputs[i].signatureScript = `41${bytesToHex(signature)}01`;
        }
        wipePrivateKeyState(privKeyBytes);
        const txId = await postSignedTransactionToProxy(tx, 'ERR_BROADCAST_REJECTED');
        txState.lastTxId = txId;
        txState.lastExplorerUrl = getChainExplorerTxUrl('KAS', txId);
        return { txId, compoundedCount: selectedUtxos.length };
    } catch (e: any) {
        txState.error = e.message;
        throw e;
    } finally {
        wipePrivateKeyState(privKeyBytes);
        txState.isBroadcasting = false;
    }
}
