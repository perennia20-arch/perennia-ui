import { json, type RequestEvent } from '@sveltejs/kit';

// ========================================================
// ⚖️ PERENNIA SETTLEMENT LEDGER
// Hardware mines 100% continuously to avoid stratum disconnects.
// SvelteKit automatically shaves the 1.5% routing fee mathematically.
// STRICT RULE: No simulated data! Only processes active verified hashrate.
// ========================================================

// 👇 PASTE YOUR NEW TANGEM CARD'S KASPA RECEIVE ADDRESS HERE 👇
const TREASURY_WALLET = "kaspa:q...paste_your_new_tangem_address_here..."; 
const TREASURY_FEE_DECIMAL = 0.015; // 1.5%

export async function POST({ request }: RequestEvent) {
    try {
        const body = await request.json();
        const { walletAddress, workers, silos, currentKasPrice } = body;

        if (!walletAddress || !workers || !silos) {
            return json({ success: false, error: 'Missing parameters' }, { status: 400 });
        }

        let updatedSilos = JSON.parse(JSON.stringify(silos));
        let transactions: any[] = [];
        let totalTreasuryFee = 0;

        // Based on Kaspa emission math: KAS generated per TH/s roughly per second
        // Note: In full prod, this multiplier is fetched dynamically from the Node.
        const kasPerThsPerSecond = 0.000297; 

        for (let silo of updatedSilos) {
            // Only aggregate hashrate for workers actively verified by the telemetry node
            const activeWorkers = workers.filter((w: any) => w.assignedSiloId === silo.id && w.isOnline && w.hashRate > 0);
            const siloHashrate = activeWorkers.reduce((acc: number, w: any) => acc + w.hashRate, 0);

            if (siloHashrate > 0) {
                // 1. Calculate Gross Yield
                const grossYield = siloHashrate * kasPerThsPerSecond;

                // 2. THE LEDGER SPLIT (Zero hardware downtime)
                const treasuryCut = grossYield * TREASURY_FEE_DECIMAL;
                const userNetYield = grossYield - treasuryCut;
                
                totalTreasuryFee += treasuryCut;

                // 3. Process the Net Yield based on Silo Settlement Config
                const targetAssetPrice = silo.settlementConfig.targetAsset.priceUsd || 1;
                const convertedYieldAmount = userNetYield * (currentKasPrice / targetAssetPrice);

                if (silo.settlementConfig.mode === 'stream' && silo.settlementConfig.streamMode === 'realtime') {
                    if (silo.settlementConfig.autoPayout) {
                        transactions.push({
                            id: Math.random().toString(36).substring(2, 9),
                            asset: silo.settlementConfig.targetAsset,
                            amount: convertedYieldAmount,
                            usdValueAtTime: convertedYieldAmount * targetAssetPrice,
                            timestamp: new Date().toISOString(),
                            siloName: silo.name
                        });
                    }
                } else if (silo.settlementConfig.mode === 'threshold') {
                    // Accumulate inside the silo
                    silo.pendingKaspa = (silo.pendingKaspa || 0) + userNetYield;

                    // Execute threshold payout
                    if (silo.pendingKaspa >= silo.settlementConfig.threshold && silo.settlementConfig.autoPayout) {
                        const payoutAmount = silo.pendingKaspa * (currentKasPrice / targetAssetPrice);
                        transactions.push({
                            id: Math.random().toString(36).substring(2, 9),
                            asset: silo.settlementConfig.targetAsset,
                            amount: payoutAmount,
                            usdValueAtTime: payoutAmount * targetAssetPrice,
                            timestamp: new Date().toISOString(),
                            siloName: silo.name
                        });
                        silo.pendingKaspa = 0; // Reset
                    }
                }
            }
        }

        // Output Treasury route log for internal audit.
        // The daemon will read this log and fire the batch transaction to the Treasury Wallet.
        if (totalTreasuryFee > 0) {
            // console.log(`[LEDGER] Routed ${totalTreasuryFee} KAS to ${TREASURY_WALLET}`);
        }

        return json({ 
            success: true, 
            updatedSilos, 
            transactions,
            treasuryLog: { address: TREASURY_WALLET, amount: totalTreasuryFee }
        });

    } catch (error) {
        return json({ success: false, error: 'Settlement Ledger Fault' }, { status: 500 });
    }
}