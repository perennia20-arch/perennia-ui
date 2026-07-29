import { redis } from '$lib/server/redis';

// ⚡ CORE PROTOCOL CONSTANTS
const PERENNIA_TREASURY_MARGIN = 0.015; 
const KASPLEX_MAX_POOL_IMPACT = 0.02;   

// Minimum Bridge values to prevent 3rd party API rejections
const MIN_CHAINGE_USD_EQUIV = 15.00;
const MIN_CHANGENOW_USD_EQUIV = 50.00;

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
}

export class SmartOrderRouter {
    
    public async calculateSplitFill(req: SwapPayload): Promise<SorExecutionPlan> {
        let remainingAmount = req.amount;
        const legs: WaterfallLeg[] = [];
        let totalEstimatedOutput = 0;

        const pair = `${req.payAsset}_${req.receiveAsset}`.toUpperCase();

        // 1. Fetch Global Spot Rate 
        const spotRateStr = await redis.get(`oracle:spot:${pair}`) || "1.0";
        const spotRate = parseFloat(spotRateStr);

        // Required mathematical bridge minimums
        const minChaingeTokens = MIN_CHAINGE_USD_EQUIV / spotRate;
        const minChangeNowTokens = MIN_CHANGENOW_USD_EQUIV / spotRate;

        // ==========================================================
        // TIER 1: PERENNIA TREASURY (0% Cost, 100% Spread Capture)
        // ==========================================================
        const treasuryBalanceStr = await redis.hget('dev:sor:treasury:balances:admin', req.receiveAsset) || "0";
        const treasuryAvailable = parseFloat(treasuryBalanceStr);

        if (treasuryAvailable > 0 && remainingAmount > 0) {
            const fillable = Math.min(treasuryAvailable, remainingAmount);
            const treasuryRate = spotRate * (1 - PERENNIA_TREASURY_MARGIN); 
            const output = fillable * treasuryRate;
            
            legs.push({
                tier: 1,
                provider: 'Perennia Treasury',
                filledAmount: fillable,
                executionRate: treasuryRate,
                marginCaptured: fillable * spotRate * PERENNIA_TREASURY_MARGIN
            });

            remainingAmount -= fillable;
            totalEstimatedOutput += output;
        }

        // ==========================================================
        // TIER 2: KASPLEX KRC-20 POOLS (Decentralized Overflow)
        // ==========================================================
        if (remainingAmount > 0) {
            const kasplexDepthStr = await redis.get(`dev:sor:depth:${pair}`) || "0";
            const kasplexDepth = parseFloat(kasplexDepthStr);

            const tier2Fee = 0.003; 
            
            if (kasplexDepth > 0) {
                const safeKasplexFill = Math.min(kasplexDepth * KASPLEX_MAX_POOL_IMPACT, remainingAmount);
                
                if (safeKasplexFill > 0) {
                    const tier2Rate = spotRate * (1 - tier2Fee);
                    const output = safeKasplexFill * tier2Rate;

                    legs.push({
                        tier: 2,
                        provider: 'Kasplex KRC-20',
                        filledAmount: safeKasplexFill,
                        executionRate: tier2Rate,
                        marginCaptured: 0 
                    });

                    remainingAmount -= safeKasplexFill;
                    totalEstimatedOutput += output;
                }
            }
        }

        // ==========================================================
        // TIER 3: CHAINGE FINANCE (Cross-Chain AMM)
        // ==========================================================
        if (remainingAmount > 0 && remainingAmount >= minChaingeTokens) {
            const chaingeDepthStr = await redis.get(`chainge:depth:${pair}`) || "500000.0";
            const chaingeDepth = parseFloat(chaingeDepthStr);
            const tier3Fee = 0.005; 

            const safeChaingeFill = Math.min(chaingeDepth * 0.05, remainingAmount);
            
            if (safeChaingeFill >= minChaingeTokens) {
                const tier3Rate = spotRate * (1 - tier3Fee);
                const output = safeChaingeFill * tier3Rate;

                legs.push({
                    tier: 3,
                    provider: 'Chainge AMM',
                    filledAmount: safeChaingeFill,
                    executionRate: tier3Rate,
                    marginCaptured: 0
                });

                remainingAmount -= safeChaingeFill;
                totalEstimatedOutput += output;
            }
        }

        // ==========================================================
        // TIER 4: CHANGENOW (The Whale Route)
        // ==========================================================
        if (remainingAmount >= minChangeNowTokens) {
            const tier4Rate = spotRate * 0.985; // Fixed 1.5% haircut
            const output = remainingAmount * tier4Rate;

            legs.push({
                tier: 4,
                provider: 'ChangeNOW Aggregator',
                filledAmount: remainingAmount,
                executionRate: tier4Rate,
                marginCaptured: 0
            });

            totalEstimatedOutput += output;
            remainingAmount = 0;
        }

        // ⚡ ASSEMBLE UNIFIED EXECUTION PRICE
        const unifiedRate = req.amount > 0 ? (totalEstimatedOutput / req.amount) : 0;

        return {
            totalAmount: req.amount - remainingAmount, // Amount we can fulfill 
            unifiedRate,
            legs,
            estimatedOutput: totalEstimatedOutput
        };
    }
}

export const sorEngine = new SmartOrderRouter();