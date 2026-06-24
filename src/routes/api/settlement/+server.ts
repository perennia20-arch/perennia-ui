import { json, type RequestEvent } from '@sveltejs/kit';

const NETWORK_TOTAL_TH = 350000; 
const REWARD_PER_SEC = 104; 

async function executeSilverScriptSwap(walletAddress: string, kasAmount: number, targetAssetTicker: string) {
    console.log(`\n🔒 [SILVERSCRIPT SECURE RPC] Executing Smart Contract...`);
    console.log(`➡️  Intercepting ${kasAmount.toFixed(6)} KAS.`);
    console.log(`➡️  Routing to DEX. Swapping for ${targetAssetTicker}.`);
    console.log(`➡️  Destination Wallet: ${walletAddress}`);
    await new Promise(res => setTimeout(res, 1200));
    const txHash = `0x${Math.random().toString(36).substring(2, 15)}...ss_swap`;
    console.log(`✅  Contract Success! TxHash: ${txHash}\n`);
    return txHash;
}

export async function POST({ request }: RequestEvent) {
    try {
        const { walletAddress, workers, silos, currentKasPrice } = await request.json();
        if (!walletAddress) return json({ success: false, error: 'Unauthorized.' }, { status: 401 });
        
        let executedTransactions: any[] = [];
        let updatedSilos: any[] = [];

        for (const silo of silos) {
            if (silo.assignedPlantId) { updatedSilos.push(silo); continue; }

            const siloWorkers = workers.filter((w: any) => w.assignedSiloId === silo.id);
            const siloHashTh = siloWorkers.reduce((sum: number, w: any) => sum + w.hashRate, 0);
            let newPending = silo.pendingKaspa || 0;

            if (siloHashTh > 0) {
                const myShare = siloHashTh / NETWORK_TOTAL_TH;
                newPending += myShare * REWARD_PER_SEC;
            }

            if (silo.settlementConfig.autoPayout) {
                let shouldSettle = false;
                if (silo.settlementConfig.mode === 'stream' && silo.settlementConfig.streamMode === 'realtime') shouldSettle = true;
                else if (silo.settlementConfig.mode === 'threshold' && newPending >= silo.settlementConfig.threshold) shouldSettle = true;

                if (shouldSettle && newPending > 0) {
                    const settledAmount = newPending;
                    newPending = 0;
                    const targetAsset = silo.settlementConfig.targetAsset;
                    const usdValue = settledAmount * currentKasPrice;
                    const targetPrice = targetAsset.ticker === 'KAS' ? currentKasPrice : targetAsset.priceUsd;
                    
                    let txHash = targetAsset.ticker === 'KAS' ? '0x' + Math.random().toString(36).substring(2, 15) + '...kas' : await executeSilverScriptSwap(walletAddress, settledAmount, targetAsset.ticker);

                    executedTransactions.push({
                        id: Math.random().toString(36).substring(2, 9).toUpperCase(),
                        timestamp: new Date().toISOString(), type: silo.settlementConfig.mode === 'stream' ? 'Stream' : 'Yield',
                        asset: targetAsset, amount: usdValue / targetPrice, usdValueAtTime: usdValue, txHash: txHash
                    });
                }
            }
            updatedSilos.push({ ...silo, pendingKaspa: newPending });
        }
        return json({ success: true, updatedSilos, transactions: executedTransactions });
    } catch (error: any) {
        return json({ success: false, error: 'Server Error' }, { status: 500 });
    }
}