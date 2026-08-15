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

// ⚡ INFRASTRUCTURE HARDENING
const rustBackendUrl = env.RUST_BACKEND_URL || `http://${env.UBUNTU_NODE_IP || '192.168.0.12'}:8002`;

export class SmartOrderRouter {
    public async calculateSplitFill(req: SwapPayload, wallet: string = "kaspa:qpd3r7z43r1x0pn3y26k2yp4r7z43r1x0pn3y26k2yp4r7z0q5qqp2", utxos?: any[], systemMode: string = "base"): Promise<SorExecutionPlan> {
        try {
            const res = await fetch(`${rustBackendUrl}/v1/sor/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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