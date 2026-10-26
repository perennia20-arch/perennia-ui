// src/lib/server/sor.ts

import { env } from '$env/dynamic/private';

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
    public async calculateSplitFill(req: SwapPayload, wallet: string, utxos?: any[], systemMode: string = "base"): Promise<SorExecutionPlan> {
        
        if (!env.RUST_BACKEND_URL) {
            throw new Error("CRITICAL: RUST_BACKEND_URL is missing. L1 Routing Unavailable.");
        }

        try {
            const res = await fetch(`${env.RUST_BACKEND_URL}/v1/sor/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${env.INTERNAL_ADMIN_TOKEN || env.PERENNIA_ADMIN_KEY || ''}`
                },
                body: JSON.stringify({
                    wallet,
                    payAsset: req.payAsset,
                    receiveAsset: req.receiveAsset,
                    amount: req.amount,
                    slippageTolerance: 0.05,
                    utxos: utxos || null,
                    systemMode: systemMode
                })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(`Rust SOR Engine Rejected Payload: ${err.error || 'Unknown Error'}`);
            }

            return await res.json();
        } catch (e: any) {
            console.error(`🚨 FATAL: Rust SOR Engine Unreachable/Failed: ${e.message}`);
            throw new Error(`L1 Routing Unavailable: ${e.message}`);
        }
    }
}

export const sorEngine = new SmartOrderRouter();