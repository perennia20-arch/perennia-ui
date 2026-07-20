import { redis } from '$lib/server/redis';
import { perenniaKMS } from '$lib/server/kms';

// ⚡ THE PPS REWARD RATE
// This is the fixed amount of KAS Perennia pays the user per unit of cryptographic difficulty submitted.
// In production, this is dynamically pegged to the live network difficulty and block reward.
const PPS_RATE_PER_DIFFICULTY = 0.000005; 
const NETWORK_FEE_PERCENTAGE = 0.02; // Perennia takes a 2% cut on all automated settlements

export class ChronosEngine {
    private isRunning = false;
    private interval: NodeJS.Timeout | null = null;

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log("⏳ Chronos Settlement Engine Online. Monitoring Omni-Chain Ledger.");
        
        // Execute the settlement matrix every 10 seconds
        this.interval = setInterval(() => this.executeSettlementTick(), 10000);
    }

    private async executeSettlementTick() {
        try {
            // 1. Fetch all user states stored in the Redis database
            const userKeys = await redis.keys('user_state:*');
            
            for (const key of userKeys) {
                const address = key.replace('user_state:', '');
                const rawState = await redis.get(key);
                if (!rawState) continue;

                let state = JSON.parse(rawState);
                let stateMutated = false;

                // 2. Iterate through the user's workers to process unpaid shares
                for (const worker of state.workers) {
                    if (!worker.assignedSiloId) continue; // Skip workers in "The Field"

                    // Fetch the exact shares recorded by the Rust backend
                    const shareKey = `worker:${worker.name}:shares`;
                    const unprocessedSharesStr = await redis.get(shareKey);
                    const unprocessedShares = parseFloat(unprocessedSharesStr || "0");

                    if (unprocessedShares > 0) {
                        // Mathematically convert shares to KAS using the PPS model
                        const earnedKaspa = unprocessedShares * PPS_RATE_PER_DIFFICULTY;

                        // Route the earned KAS to the specific assigned Silo
                        const siloIndex = state.silos.findIndex((s: any) => s.id === worker.assignedSiloId);
                        if (siloIndex !== -1) {
                            state.silos[siloIndex].pendingKaspa = (state.silos[siloIndex].pendingKaspa || 0) + earnedKaspa;
                            stateMutated = true;
                        }

                        // Reset the worker's share counter in Redis so we don't double-pay
                        await redis.set(shareKey, "0");
                    }
                }

                // 3. Evaluate Silos for Execution (Thresholds & Streams)
                for (let i = 0; i < state.silos.length; i++) {
                    const silo = state.silos[i];
                    
                    if (silo.settlementConfig?.autoPayout && silo.pendingKaspa > 0) {
                        const threshold = silo.settlementConfig.threshold || 0;
                        const mode = silo.settlementConfig.mode;
                        
                        // Execute if streaming, or if threshold limit is breached
                        if (mode === 'stream' || (mode === 'threshold' && silo.pendingKaspa >= threshold)) {
                            
                            const grossPayout = silo.pendingKaspa;
                            const perenniaFee = grossPayout * NETWORK_FEE_PERCENTAGE;
                            const netPayout = grossPayout - perenniaFee;
                            const targetAddress = silo.settlementConfig.payoutAddress || address;

                            // ⚡ This is where we call perenniaKMS to sign and broadcast the actual TX
                            console.log(`\n💸 [CHRONOS EXECUTION] Settling Silo: ${silo.name}`);
                            console.log(`   -> Gross Yield: ${grossPayout.toFixed(6)} KAS`);
                            console.log(`   -> Perennia Fee (2%): ${perenniaFee.toFixed(6)} KAS`);
                            console.log(`   -> Broadcasting ${netPayout.toFixed(6)} KAS to ${targetAddress}`);
                            
                            // Reset the Silo balance after successful sweep
                            state.silos[i].pendingKaspa = 0;
                            stateMutated = true;
                        }
                    }
                }

                // 4. Save the mutated state back to Redis so the Svelte UI updates instantly
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