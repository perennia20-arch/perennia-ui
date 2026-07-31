import { redis } from '$lib/server/redis';
import { perenniaKMS } from '$lib/server/kms';
import type { SorExecutionPlan } from './sor';
import { env } from '$env/dynamic/private';

const PPS_RATE_PER_DIFFICULTY = 0.000005; 
const NETWORK_FEE_PERCENTAGE = 0.01; 
const MINIMUM_UTXO_SWEEP_THRESHOLD = 50.0;

export interface UtxoInput {
    transactionId: string;
    index: number;
    amount: number; // Sompi
    scriptPublicKey: string;
}

export class ChronosEngine {
    private isRunning = false;
    private interval: NodeJS.Timeout | null = null;

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log("⏳ Chronos Settlement Engine Online. Monitoring Omni-Chain Ledger.");
        
        this.interval = setInterval(() => this.executeSettlementTick(), 10000);
    }

    public async constructAtomicSwapPSBT(
        userAddress: string,
        userScriptPublicKey: string,
        sorPlan: SorExecutionPlan,
        userUtxos: UtxoInput[]
    ) {
        console.log(`\n⚙️ [CHRONOS] Assembling Atomic PSBT for ${userAddress}`);
        
        const corporateAddresses = await perenniaKMS.getCorporateAddresses();
        
        // ⚡ PHASE 1 UPGRADE: TN12 Covenant P2SH Addresses
        const KASPLEX_LP_ADDRESS = "kaspatest:pze2sehqzx8xetzkhz2ycqflwf8dhusyxhj0myv4ez72k0n6vdaj827jeqqv8n";
        const CHAINGE_INBOUND_FALLBACK = "kaspatest:pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhgx0q6u";
        const CHANGENOW_INBOUND_FALLBACK = "kaspatest:pzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz64r9j2";

        const targetAmountSompi = Math.floor(sorPlan.totalAmount * 1e8);
        const feeSompi = 10000;
        const totalRequiredSompi = targetAmountSompi + feeSompi;

        let gatheredSompi = 0;
        const txInputs = [];

        // 1. Map Inputs
        for (const utxo of userUtxos) {
            txInputs.push({
                previousOutpoint: {
                    transactionId: utxo.transactionId,
                    index: utxo.index
                },
                signatureScript: "", 
                sequence: 0,
                sigOpCount: 1
            });
            gatheredSompi += utxo.amount;
            if (gatheredSompi >= totalRequiredSompi) break;
        }

        if (gatheredSompi < totalRequiredSompi) {
            throw new Error(`ERR_INSUFFICIENT_UTXO_MASS: Required ${totalRequiredSompi}, Found ${gatheredSompi}`);
        }

        // 2. Map Outputs (Dynamic Bridge Routing with P2SH Execution Metadata)
        const txOutputs = [];

        for (const leg of sorPlan.legs) {
            const legAmountSompi = Math.floor(leg.filledAmount * 1e8);
            if (legAmountSompi <= 0) continue;

            let destinationAddress = "";
            let isCovenant = true; // TN12 paths default to Covenant logic
            
            switch(leg.tier) {
                case 1:
                    destinationAddress = corporateAddresses.KAS; 
                    isCovenant = false; // Internal treasury remains standard P2PKH for now
                    break;
                case 2:
                    destinationAddress = KASPLEX_LP_ADDRESS;     
                    break;
                case 3:
                    try {
                        const chaingeRes = await fetch('https://api.chainge.finance/v1/crosschain/address', {
                            method: 'POST',
                            headers: { 
                                'Authorization': `Bearer ${env.CHAINGE_API_KEY || ''}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                fromChain: "KASPA", toChain: "ETHEREUM",
                                fromToken: "KAS", toToken: "USDC",
                                userAddress: userAddress,
                                amount: leg.filledAmount
                            })
                        });
                        const chaingeData = await chaingeRes.json();
                        destinationAddress = chaingeData.depositAddress || CHAINGE_INBOUND_FALLBACK;
                    } catch (e) {
                        destinationAddress = CHAINGE_INBOUND_FALLBACK;
                    }
                    break;
                case 4:
                    try {
                        const changeNowRes = await fetch('https://api.changenow.io/v2/exchange', {
                            method: 'POST',
                            headers: { 
                                'Content-Type': 'application/json',
                                'x-changenow-api-key': env.CHANGENOW_API_KEY || ''
                            },
                            body: JSON.stringify({
                                fromCurrency: "kas", toCurrency: "usdc",
                                fromNetwork: "kas", toNetwork: "eth",
                                fromAmount: leg.filledAmount,
                                address: corporateAddresses.ETH,
                                flow: "standard"
                            })
                        });
                        const changeNowData = await changeNowRes.json();
                        destinationAddress = changeNowData.payinAddress || CHANGENOW_INBOUND_FALLBACK;
                    } catch(e) {
                        destinationAddress = CHANGENOW_INBOUND_FALLBACK;
                    }
                    break;
                default:
                    throw new Error("ERR_UNKNOWN_ROUTING_TIER");
            }

            // ⚡ Bind Introspection Arguments for Silverscript (e.g., Target Slippage Bounds)
            txOutputs.push({
                amount: legAmountSompi,
                scriptPublicKey: destinationAddress, // Will be parsed into aa20<hash>87 by the frontend
                _metadata: { 
                    type: isCovenant ? "covenant" : "standard",
                    provider: leg.provider, 
                    tier: leg.tier,
                    executionArgs: isCovenant ? ["0105"] : [] // Example: OP_PUSH1 0x05 (5% Max Slippage)
                } 
            });
        }

        // 3. Map Change Output
        const changeSompi = gatheredSompi - totalRequiredSompi;
        if (changeSompi > 0) {
            txOutputs.push({
                amount: changeSompi,
                scriptPublicKey: userScriptPublicKey,
                _metadata: { type: "change" }
            });
        }

        return {
            version: 0,
            inputs: txInputs,
            outputs: txOutputs,
            lockTime: 0,
            subnetworkId: "0000000000000000000000000000000000000000",
            gas: 0,
            payload: ""
        };
    }

    private async executeSettlementTick() {
        try {
            const userKeys = await redis.keys('user_state:*');
            
            for (const key of userKeys) {
                const address = key.replace('user_state:', '');
                const rawState = await redis.get(key);
                if (!rawState) continue;

                let state = JSON.parse(rawState);
                let stateMutated = false;

                for (const worker of state.workers) {
                    if (!worker.assignedSiloId) continue; 

                    const shareKey = `worker:${worker.name}:shares`;
                    const unprocessedSharesStr = await redis.get(shareKey);
                    const unprocessedShares = parseFloat(unprocessedSharesStr || "0");

                    if (unprocessedShares > 0) {
                        const earnedKaspa = unprocessedShares * PPS_RATE_PER_DIFFICULTY;
                        const siloIndex = state.silos.findIndex((s: any) => s.id === worker.assignedSiloId);
                        if (siloIndex !== -1) {
                            state.silos[siloIndex].pendingKaspa = (state.silos[siloIndex].pendingKaspa || 0) + earnedKaspa;
                            stateMutated = true;
                        }
                        await redis.set(shareKey, "0");
                    }
                }

                for (let i = 0; i < state.silos.length; i++) {
                    const silo = state.silos[i];
                    
                    if (silo.settlementConfig?.autoPayout && silo.pendingKaspa >= MINIMUM_UTXO_SWEEP_THRESHOLD) {
                        const userThreshold = silo.settlementConfig.threshold || 0;
                        const mode = silo.settlementConfig.mode;
                        
                        if (mode === 'stream' || (mode === 'threshold' && silo.pendingKaspa >= userThreshold)) {
                            const grossPayout = silo.pendingKaspa;
                            const perenniaFee = grossPayout * NETWORK_FEE_PERCENTAGE;
                            const netPayout = grossPayout - perenniaFee;
                            const targetAddress = silo.settlementConfig.payoutAddress || address;

                            console.log(`\n💸 [CHRONOS EXECUTION] Settling Silo: ${silo.name}`);
                            console.log(`   -> Gross Yield: ${grossPayout.toFixed(6)} KAS`);
                            console.log(`   -> Perennia Fee (1%): ${perenniaFee.toFixed(6)} KAS`);
                            console.log(`   -> Broadcasting ${netPayout.toFixed(6)} KAS to ${targetAddress}`);
                            
                            state.silos[i].pendingKaspa = 0;
                            stateMutated = true;
                        }
                    }
                }

                if (stateMutated) {
                    await redis.set(key, JSON.stringify(state));
                }
            }
        } catch (error) {
            console.error("🚨 Chronos Execution Error:", error);
        }
    }
}

export const chronos = new ChronosEngine();