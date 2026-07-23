import { get } from 'svelte/store';
import { walletAddress, sovereignKeys, activeWalletType } from '$lib/stores/wallet';
import { schnorr } from '@noble/curves/secp256k1';
import { Buffer } from 'buffer';

// Ensure buffer is polyfilled for Vite/Browser Native cryptography
if (typeof window !== 'undefined') {
    (window as any).Buffer = (window as any).Buffer || Buffer;
}

const SOMPI_PER_KASPA = 100000000;
const MASS_PER_INPUT = 150;
const MASS_PER_OUTPUT = 50;
const BASE_MASS = 100;
const MINIMUM_FEE_PER_MASS = 1;

interface UTXO {
    outpoint: { transactionId: string; index: number };
    utxoEntry: { 
        amount: string | number; 
        scriptPublicKey: any; // Node returns an object: { version: number, scriptPublicKey: string }
        blockDaaScore: string | number; 
        isCoinbase: boolean 
    };
}

export async function fetchUtxos(address: string): Promise<UTXO[]> {
    const res = await fetch(`/api/utxos?address=${encodeURIComponent(address)}`);
    if (!res.ok) throw new Error("Failed to fetch UTXOs from local L1 Node.");
    const data = await res.json();
    return data.entries || [];
}

export function calculateFee(inputCount: number, outputCount: number): number {
    const mass = BASE_MASS + (inputCount * MASS_PER_INPUT) + (outputCount * MASS_PER_OUTPUT);
    return mass * MINIMUM_FEE_PER_MASS;
}

export function selectUtxos(utxos: UTXO[], targetAmountSompi: number): { selected: UTXO[], fee: number, change: number } {
    const sorted = [...utxos].sort((a, b) => Number(b.utxoEntry.amount) - Number(a.utxoEntry.amount));
    
    let selected: UTXO[] = [];
    let accumulated = 0;
    let requiredFee = calculateFee(0, 2);

    for (const utxo of sorted) {
        selected.push(utxo);
        accumulated += Number(utxo.utxoEntry.amount);
        requiredFee = calculateFee(selected.length, 2);

        if (accumulated >= targetAmountSompi + requiredFee) {
            break;
        }
    }

    if (accumulated < targetAmountSompi + requiredFee) {
        throw new Error("INSUFFICIENT FUNDS: UTXO matrix cannot satisfy target + network mass fees.");
    }

    const change = accumulated - targetAmountSompi - requiredFee;
    return { selected, fee: requiredFee, change };
}

export async function forgeAndBroadcastKaspaTransaction(toAddress: string, amountKas: number) {
    throw new Error("Execution halted. Run DEV FIRE to test the pipeline directly.");
}

export async function executeMainnetBurnerTest(targetAddress: string, amountKas: number) {
    console.log("%c========================================================", "color: #14b8a6; font-weight: bold;");
    console.log("%c=> ENGINEERING DIRECTIVE 6: LIVE MAINNET BURNER TEST <=", "color: #14b8a6; font-weight: bold;");
    console.log("%c========================================================", "color: #14b8a6; font-weight: bold;");
    
    try {
        const senderAddress = get(walletAddress);
        const activeType = get(activeWalletType);

        if (activeType !== 'kasware' || !senderAddress) {
            throw new Error("TEST ABORTED: Burner extension not connected.");
        }

        if (!senderAddress.startsWith('kaspa:')) {
            throw new Error(`TEST ABORTED: Strict mainnet prefix missing on address: ${senderAddress}`);
        }

        const amountSompi = Math.floor(amountKas * 100000000);
        
        console.log(`[1/4] Fetching Mainnet UTXOs for: ${senderAddress}...`);
        const utxos = await fetchUtxos(senderAddress);
        
        if (!utxos || utxos.length === 0) {
            throw new Error("L1 NODE REJECTION: Zero UTXOs found. Burner wallet is empty or node is syncing.");
        }
        console.log(`[+] SUCCESS: Found ${utxos.length} available UTXOs.`);

        console.log(`[2/4] Executing UTXO Mass / Fee Calculations...`);
        const { selected, fee, change } = selectUtxos(utxos, amountSompi);
        console.log(`[+] Inputs Selected: ${selected.length}`);
        console.log(`[+] Network Fee: ${fee / 100000000} KAS`);
        console.log(`[+] Change Output: ${change / 100000000} KAS`);

        // ⚡ THE FIX: Extract the object exactly as the node provided it, without casting to String
        const scriptObj = utxos[0].utxoEntry.scriptPublicKey;

        // ⚡ FIX: Strictly cast all numerical fields to Integers for Rust Serde Deserialization
        const inputs = selected.map(utxo => ({
            previousOutpoint: {
                transactionId: utxo.outpoint.transactionId,
                index: Number(utxo.outpoint.index)
            },
            signatureScript: "", 
            sequence: 0,
            sigOpCount: 1
        }));

        const outputs = [
            {
                amount: amountSompi,
                scriptPublicKey: scriptObj
            }
        ];

        if (change > 0) {
            outputs.push({
                amount: change,
                scriptPublicKey: scriptObj
            });
        }

        // ⚡ FIX: SubnetworkID must be EXACTLY 40 hex characters (20 bytes)
        // ⚡ FIX: gas and lockTime remain native integers (0)
        const rawTransaction = {
            version: 0,
            inputs,
            outputs,
            lockTime: 0,
            subnetworkId: "0000000000000000000000000000000000000000",
            gas: 0,
            payload: ""
        };

        console.log(`[3/4] Bypassing Kasware Extension to test Mempool Validator directly...`);
        
        // Native Dummy Signature Forge
        const ephemeralPrivKey = "b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef";

        for (let i = 0; i < rawTransaction.inputs.length; i++) {
            const sighashBuffer = Buffer.from("0000000000000000000000000000000000000000000000000000000000000000", 'hex'); 
            const signature = schnorr.sign(sighashBuffer, ephemeralPrivKey);
            const kaspaSignature = Buffer.concat([Buffer.from(signature), Buffer.from([0x01])]);
            const lengthHex = kaspaSignature.length.toString(16).padStart(2, '0');
            rawTransaction.inputs[i].signatureScript = `${lengthHex}${kaspaSignature.toString('hex')}`;
        }

        console.log(`[4/4] Routing Signed Payload to Blind Proxy (/api/broadcast)...`);
        const response = await fetch('/api/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rawTransaction)
        });

        const data = await response.json();
        
        // If it throws a Signature Verification Error, the pipeline is a complete success!
        if (data.error && data.error.toLowerCase().includes("signature")) {
            console.log("%c========================================================", "color: #10b981; font-weight: bold;");
            console.log("%c[+] PROXY VERIFIED: NODE PARSED JSON AND REJECTED INVALID SIGNATURE", "color: #10b981; font-weight: bold;");
            console.log(`%c[+] MEMPOOL MESSAGE: ${data.error}`, "color: #10b981; font-weight: bold;");
            console.log("%c========================================================", "color: #10b981; font-weight: bold;");
            return true;
        } else if (data.error) {
            throw new Error(`NODE ERROR: ${data.error}`);
        } else {
            console.log("Broadcasted:", data);
            return data.transactionId || data.submitTransactionResponse?.transactionId;
        }

    } catch (error: any) {
        console.log("%c========================================================", "color: #ef4444; font-weight: bold;");
        console.log("%c[-] TEST FAILED: PIPELINE RUPTURE", "color: #ef4444; font-weight: bold;");
        console.error(error.message || error);
        console.log("%c========================================================", "color: #ef4444; font-weight: bold;");
    }
}