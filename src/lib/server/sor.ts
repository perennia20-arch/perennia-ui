export interface SwapPayload {
    payAsset: string;
    receiveAsset: string;
    amount: number;
}

export interface WaterfallLeg {
    tier: number;
    provider: string;
    filledAmount: number;
    executionRate: number;
    marginCaptured: number;
}

export interface SorExecutionPlan {
    totalAmount: number;
    unifiedRate: number;
    legs: WaterfallLeg[];
    estimatedOutput: number;
    transaction_uuid?: string;
    psbt?: any;
}

export class SmartOrderRouter {
    public async calculateSplitFill(req: SwapPayload, wallet: string = "kaspa:qpd3r7z43r1x0pn3y26k2yp4r7z43r1x0pn3y26k2yp4r7z0q5qqp2", utxos?: any[]): Promise<SorExecutionPlan> {
        try {
            // ⚡ Defer physical modeling & PSBT construction directly to the Rust Engine on Port 8002
            const res = await fetch('http://127.0.0.1:8002/v1/sor/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet,
                    payAsset: req.payAsset,
                    receiveAsset: req.receiveAsset,
                    amount: req.amount,
                    slippageTolerance: 0.05,
                    utxos: utxos || null
                })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(`Rust SOR Engine Rejected Payload: ${err.error || 'Unknown Error'}`);
            }

            return await res.json();
        } catch (e: any) {
            console.warn(`⚠️ Rust SOR Engine Unreachable/Failed: ${e.message}. Executing Fallback Simulation...`);
            // Safe generic fallback to prevent chronos loop crash if Rust engine momentarily drops
            return {
                totalAmount: req.amount,
                unifiedRate: 1.0,
                legs: [{
                    tier: 1,
                    provider: 'Perennia Treasury Fallback',
                    filledAmount: req.amount,
                    executionRate: 1.0,
                    marginCaptured: 0
                }],
                estimatedOutput: req.amount,
                transaction_uuid: 'fallback_offline_tx'
            };
        }
    }
}

export const sorEngine = new SmartOrderRouter();