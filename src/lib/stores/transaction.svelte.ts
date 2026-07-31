// ================================================================================
// PERENNIA SOVEREIGN TRANSACTION ENGINE // ZERO-TRUST // PURE SILICON
// ================================================================================
import { blake2b } from '@noble/hashes/blake2.js'; 
import { schnorr } from '@noble/curves/secp256k1.js';

// ============================================================================
// I. SVELTE 5 RUNES: ZERO-TRUST MEMORY VAULT
// ============================================================================
class TransactionEngineState {
    decryptedPrivateKeyHex = $state("");
    address = $state("");
    isBroadcasting = $state(false);
    lastTxId = $state("");
    error = $state("");

    get overlayClass() {
        return this.isBroadcasting 
            ? "fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0a] bg-opacity-95 font-mono text-white font-bold tracking-widest uppercase transition-none" 
            : "hidden";
    }
}
export const txState = new TransactionEngineState();

// ============================================================================
// II. BARE-METAL CONSTANTS & POLYMATH ENGINE
// ============================================================================
const SIGHASH_ALL = 1;
const TX_SIGNING_KEY = new TextEncoder().encode("TransactionSigningHash");
const KASPA_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const MASS_PER_INPUT = 150n;
const MASS_PER_OUTPUT = 50n;

function hexToBytes(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) throw new Error("ERR_INVALID_HEX_LENGTH");
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function writeUint16LE(val: number): Uint8Array {
    const arr = new Uint8Array(2);
    new DataView(arr.buffer).setUint16(0, val, true);
    return arr;
}

function writeUint32LE(val: number): Uint8Array {
    const arr = new Uint8Array(4);
    new DataView(arr.buffer).setUint32(0, val, true);
    return arr;
}

function writeBigUint64LE(val: bigint): Uint8Array {
    const arr = new Uint8Array(8);
    new DataView(arr.buffer).setBigUint64(0, val, true);
    return arr;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
    const totalLen = arrays.reduce((acc, arr) => acc + arr.length, 0);
    const res = new Uint8Array(totalLen);
    let offset = 0;
    for (const arr of arrays) {
        res.set(arr, offset);
        offset += arr.length;
    }
    return res;
}

// ============================================================================
// III. NATIVE BASE32 DECODER & SCRIPT COMPILER (P2PKH & P2SH)
// ============================================================================
function decodeAddressToPayload(address: string): { version: number, hash: Uint8Array } {
    const parts = address.split(':');
    if (parts.length !== 2) throw new Error("ERR_INVALID_ADDRESS_FORMAT");
    
    // TN12 & Mainnet agnostic logic (base32 is purely the right-hand payload)
    const base32 = parts[1];
    const decoded = new Uint8Array(base32.length - 8);
    
    for (let i = 0; i < base32.length - 8; i++) {
        const val = KASPA_CHARSET.indexOf(base32[i]);
        if (val === -1) throw new Error("ERR_INVALID_BASE32_CHAR");
        decoded[i] = val;
    }
    
    const out: number[] = [];
    let val = 0;
    let bits = 0;
    for (let i = 0; i < decoded.length; i++) {
        val = (val << 5) | decoded[i];
        bits += 5;
        while (bits >= 8) {
            bits -= 8;
            out.push((val >> bits) & 0xff);
        }
    }
    
    // Version: 0x00 (P2PKH), 0x08 (P2SH Covenant)
    return { 
        version: out[0], 
        hash: new Uint8Array(out.slice(1, 33)) 
    };
}

function createScriptPublicKey(address: string): string {
    const { version, hash } = decodeAddressToPayload(address);
    if (version === 0) {
        return `20${bytesToHex(hash)}ac`; // P2PKH: OP_BLAKE2B (Push 32, Pubkey, CheckSig)
    } else if (version === 8) {
        return `aa20${bytesToHex(hash)}87`; // P2SH: OP_HASH256 (aa) Push32 (20) <hash> OP_EQUAL (87)
    }
    throw new Error(`ERR_UNSUPPORTED_ADDRESS_VERSION: ${version}`);
}

// ============================================================================
// IV. SOVEREIGN EXECUTION & COVENANT PIPELINE
// ============================================================================
export async function executeSovereignTransaction(destinationAddress: string, amountKas: number): Promise<string> {
    if (!txState.decryptedPrivateKeyHex) throw new Error("ERR_VAULT_LOCKED");
    txState.isBroadcasting = true;
    txState.error = "";

    try {
        const privKeyBytes = hexToBytes(txState.decryptedPrivateKeyHex);
        const myPubKeyBytes = schnorr.getPublicKey(privKeyBytes);
        const sourceScriptHex = `20${bytesToHex(myPubKeyBytes)}ac`;

        // 1. Memory-Mapped UTXO Fetch
        const utxoRes = await fetch(`/api/utxos`);
        if (!utxoRes.ok) throw new Error("ERR_UTXO_PROXY_UNREACHABLE");
        const utxoData = await utxoRes.json();
        const utxos = Array.isArray(utxoData) ? utxoData : utxoData.utxos || [];

        // 2. Mass Optimizer (Largest UTXOs first) & Output Allocation
        const targetSompi = BigInt(Math.floor(amountKas * 1e8));
        const sortedUtxos = [...utxos].sort((a, b) => {
            const amtA = BigInt(a.amount ?? a.utxoEntry?.amount ?? 0);
            const amtB = BigInt(b.amount ?? b.utxoEntry?.amount ?? 0);
            return amtA < amtB ? 1 : (amtA > amtB ? -1 : 0);
        });
        
        let gathered = 0n;
        let fee = 0n;
        const selectedUtxos = [];

        for (const u of sortedUtxos) {
            selectedUtxos.push(u);
            const amt = BigInt(u.amount ?? u.utxoEntry?.amount);
            gathered += amt;
            
            const currentMass = BigInt(selectedUtxos.length) * MASS_PER_INPUT + 2n * MASS_PER_OUTPUT;
            fee = currentMass; 

            if (gathered >= targetSompi + fee) break;
        }

        if (gathered < targetSompi + fee) {
            throw new Error(`ERR_INSUFFICIENT_MASS: Required ${targetSompi + fee}, Available ${gathered}`);
        }

        const change = gathered - targetSompi - fee;
        
        // ⚡ Dynamically compile output ScriptPublicKey based on Address Version (P2PKH vs P2SH)
        let destScriptHex = destinationAddress; 
        if (destinationAddress.includes("kaspa") || destinationAddress.includes("kaspatest")) {
            destScriptHex = createScriptPublicKey(destinationAddress);
        }

        // 3. Strict JSON Type Assembly
        const txInputs = selectedUtxos.map(u => {
            const txId = u.outpoint?.transactionId ?? u.transactionId;
            const index = u.outpoint?.index ?? u.index;
            return {
                previousOutpoint: {
                    transactionId: txId,
                    index: Number(index)
                },
                signatureScript: "",
                sequence: 0,
                sigOpCount: 1
            };
        });

        const txOutputs = [
            {
                amount: Number(targetSompi),
                scriptPublicKey: destScriptHex
            }
        ];

        if (change > 0n) {
            txOutputs.push({
                amount: Number(change),
                scriptPublicKey: sourceScriptHex
            });
        }

        const tx = {
            version: 0,
            inputs: txInputs,
            outputs: txOutputs,
            lockTime: 0,
            subnetworkId: "0000000000000000000000000000000000000000",
            gas: 0,
            payload: "",
            mass: 0,
            storageMass: 0
        };

        // 4. BIP-143 Hash Cascades
        const prevOutsHash = blake2b(concatBytes(...tx.inputs.map(i => concatBytes(
            hexToBytes(i.previousOutpoint.transactionId),
            writeUint32LE(i.previousOutpoint.index)
        ))), { dkLen: 32 });

        const sequencesHash = blake2b(concatBytes(...tx.inputs.map(i => writeBigUint64LE(BigInt(i.sequence)))), { dkLen: 32 });
        const sigOpCountsHash = blake2b(concatBytes(...tx.inputs.map(i => new Uint8Array([i.sigOpCount]))), { dkLen: 32 });

        const outputsHash = blake2b(concatBytes(...tx.outputs.map(o => {
            const spkBytes = hexToBytes(o.scriptPublicKey);
            return concatBytes(
                writeBigUint64LE(BigInt(o.amount)),
                writeUint16LE(0), // Script Version
                writeBigUint64LE(BigInt(spkBytes.length)),
                spkBytes
            );
        })), { dkLen: 32 });

        const subnetworkIdBytes = new Uint8Array(20); 
        const payloadHash = new Uint8Array(32); 

        // 5. Schnorr Cryptographic Pipeline Execution
        for (let i = 0; i < tx.inputs.length; i++) {
            const input = tx.inputs[i];
            const utxo = selectedUtxos[i];
            const spkHex = typeof utxo.scriptPublicKey === 'string' 
                ? utxo.scriptPublicKey 
                : (utxo.scriptPublicKey?.scriptPublicKey ?? utxo.utxoEntry?.scriptPublicKey?.scriptPublicKey);
            const amt = BigInt(utxo.amount ?? utxo.utxoEntry?.amount);
            const spkBytes = hexToBytes(spkHex);
            
            const sigHashData = concatBytes(
                writeUint16LE(tx.version),
                prevOutsHash,
                sequencesHash,
                sigOpCountsHash,
                hexToBytes(input.previousOutpoint.transactionId),
                writeUint32LE(input.previousOutpoint.index),
                writeUint16LE(0), // Script Version
                writeBigUint64LE(BigInt(spkBytes.length)),
                spkBytes,
                writeBigUint64LE(amt),
                writeBigUint64LE(BigInt(input.sequence)),
                new Uint8Array([input.sigOpCount]),
                outputsHash,
                writeBigUint64LE(BigInt(tx.lockTime)),
                subnetworkIdBytes,
                writeBigUint64LE(BigInt(tx.gas)),
                payloadHash,
                new Uint8Array([SIGHASH_ALL])
            );

            // Domain-Keyed Blake2b Hash
            const sighash = blake2b(sigHashData, { dkLen: 32, key: TX_SIGNING_KEY });
            const signature = schnorr.sign(sighash, privKeyBytes);
            
            // ⚡ COVENANT AWARE SIGHASH ASSEMBLY
            const isCovenant = spkHex.startsWith("aa20") && spkHex.endsWith("87");
            
            if (isCovenant) {
                // P2SH Covenant Input Spending (Requires Execution Arguments + Compiled Script)
                const redeemScript = `20${bytesToHex(myPubKeyBytes)}ac`; 
                const signaturePush = `41${bytesToHex(signature)}01`;
                const slippageArg = "0105"; // Example Introspection Argument: OP_PUSH1 0x05 (5% Max Slippage)
                const redeemScriptPush = `22${redeemScript}`; // 0x22 (34 bytes to push)
                
                input.signatureScript = `${signaturePush}${slippageArg}${redeemScriptPush}`;
            } else {
                // Standard P2PKH Input Spending: 0x41 (Push 65 Bytes) + 64-byte Sig + 0x01 (SIGHASH_ALL)
                input.signatureScript = `41${bytesToHex(signature)}01`;
            }
        }

        // 6. Push finalized payload to Blind Proxy Node Mempool
        const broadcastRes = await fetch('/api/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction: tx })
        });

        if (!broadcastRes.ok) {
            const errText = await broadcastRes.text();
            throw new Error(`ERR_BROADCAST_REJECTED: ${errText}`);
        }

        const resData = await broadcastRes.json();
        txState.lastTxId = resData.transactionId || resData.id;
        return txState.lastTxId;

    } catch (e: any) {
        txState.error = e.message;
        throw e;
    } finally {
        txState.isBroadcasting = false;
    }
}

// ============================================================================
// V. PHASE 1.5 - P2SH BURN TEST HARNESS (SWEEP)
// ============================================================================
export async function executeTestCovenantSweep(
    p2shAddress: string, 
    redeemScriptHex: string, 
    destinationAddress: string
): Promise<string> {
    txState.isBroadcasting = true;
    txState.error = "";

    try {
        // 1. Fetch UTXOs locked in the P2SH contract
        const utxoRes = await fetch(`/api/utxos?address=${encodeURIComponent(p2shAddress)}`);
        if (!utxoRes.ok) throw new Error("ERR_UTXO_PROXY_UNREACHABLE");
        const utxoData = await utxoRes.json();
        const utxos = Array.isArray(utxoData) ? utxoData : utxoData.entries || utxoData.utxos || [];

        if (utxos.length === 0) throw new Error("NO_FUNDS_IN_COVENANT");

        // 2. We'll just sweep the first UTXO for the test
        const utxo = utxos[0];
        const amt = BigInt(utxo.amount ?? utxo.utxoEntry?.amount);
        
        const fee = 2000n; // Basic flat fee
        if (amt <= fee) throw new Error("UTXO_TOO_SMALL_FOR_FEE");
        const sweepAmount = amt - fee;

        // 3. Output Assembly (Sending back to User's Address)
        let destScriptHex = destinationAddress; 
        if (destinationAddress.includes("kaspa") || destinationAddress.includes("kaspatest")) {
            const { version, hash } = decodeAddressToPayload(destinationAddress);
            if (version === 0) destScriptHex = `20${bytesToHex(hash)}ac`;
            else if (version === 8) destScriptHex = `aa20${bytesToHex(hash)}87`;
        }

        const txId = utxo.outpoint?.transactionId ?? utxo.transactionId;
        const index = utxo.outpoint?.index ?? utxo.index;

        // 4. Assemble the magic Signature Script (The Unlocking Mechanism)
        // For our test script (Push(0x42) OP_EQUAL), we must satisfy it by pushing 0x42 to the stack.
        // Format: [Unlocking Argument Push] + [Length of RedeemScript] + [RedeemScript]
        const unlockArgPush = "0142"; // OP_PUSH1 0x42
        const redeemScriptLenHex = (redeemScriptHex.length / 2).toString(16).padStart(2, '0');
        const signatureScript = `${unlockArgPush}${redeemScriptLenHex}${redeemScriptHex}`;

        const tx = {
            version: 0,
            inputs: [{
                previousOutpoint: { transactionId: txId, index: Number(index) },
                signatureScript: signatureScript,
                sequence: 0,
                sigOpCount: 1 // Standard input footprint
            }],
            outputs: [{
                amount: Number(sweepAmount),
                scriptPublicKey: destScriptHex
            }],
            lockTime: 0,
            subnetworkId: "0000000000000000000000000000000000000000",
            gas: 0,
            payload: "",
            mass: 0,
            storageMass: 0
        };

        // 5. Broadcast directly (No Hash Cascades / Schnorr needed because it's a pure math lock!)
        const broadcastRes = await fetch('/api/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction: tx })
        });

        if (!broadcastRes.ok) {
            const errText = await broadcastRes.text();
            throw new Error(`ERR_BROADCAST_REJECTED: ${errText}`);
        }

        const resData = await broadcastRes.json();
        txState.lastTxId = resData.transactionId || resData.id;
        return txState.lastTxId;

    } catch (e: any) {
        txState.error = e.message;
        throw e;
    } finally {
        txState.isBroadcasting = false;
    }
}