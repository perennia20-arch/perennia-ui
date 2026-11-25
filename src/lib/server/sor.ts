import { env } from '$env/dynamic/private';
import {
    LIVE_PRICING_UNAVAILABLE_MESSAGE,
    parseU128Str,
    toU128Str,
    type PsktPayload,
    type SorExecuteRequestV1,
    type SorExecuteResponseV1,
    type SorRouteType,
    type U128Str
} from '$lib/crypto/atomicMath';

export function atomicDecimalsForSorAsset(ticker: string): number {
    switch (ticker.trim().toUpperCase()) {
        case 'USDC':
        case 'USDT':
        case 'KUSDT':
        case 'USD':
        case 'XRP':
        case 'TRX':
        case 'ADA':
            return 6;
        case 'SOL':
        case 'SUI':
        case 'TON':
            return 9;
        case 'ETH':
        case 'ARB':
        case 'BASE':
        case 'POL':
        case 'AVAX':
        case 'LINK':
            return 18;
        default:
            return 8;
    }
}

export function resolveDefaultTargetNetworkForAsset(ticker: string): string {
    switch (ticker.trim().toUpperCase()) {
        case 'KAS':
        case 'SILO':
        case 'NACHO':
        case 'BEDRCK':
        case 'PERX':
        case 'KUSDT':
            return 'KAS';
        case 'BTC':
            return 'BTC';
        case 'SOL':
            return 'SOL';
        case 'ARB':
            return 'ARB';
        case 'BASE':
        case 'SPY':
        case 'QQQ':
        case 'NVDA':
        case 'AAPL':
        case 'TSLA':
        case 'AMD':
        case 'TSM':
        case 'AVGO':
        case 'XLE':
            return 'BASE';
        case 'POL':
            return 'POL';
        case 'AVAX':
            return 'AVAX';
        case 'SUI':
            return 'SUI';
        case 'XRP':
            return 'XRP';
        case 'DOGE':
            return 'DOGE';
        case 'TRX':
            return 'TRX';
        case 'ZEC':
            return 'ZEC';
        default:
            return 'ETH';
    }
}

export class SorUpstreamError extends Error {
    readonly status: number;
    readonly code: string;
    readonly livePricingUnavailable: boolean;

    constructor(
        status: number,
        code: string,
        message: string,
        livePricingUnavailable = false
    ) {
        super(message);
        this.name = 'SorUpstreamError';
        this.status = status;
        this.code = code;
        this.livePricingUnavailable = livePricingUnavailable;
    }
}

/** @deprecated Batch 4/6 compatibility alias; prefer `SorExecuteRequestV1`. */
export interface SwapPayload {
    payAsset: string;
    receiveAsset: string;
    amount?: number;
    amountAtomic?: U128Str;
    targetNetwork?: string;
    destinationAddress?: string;
    refundKaspaAddress?: string;
    slippageBps?: number;
}

/** @deprecated Legacy waterfall leg type kept only for compile compatibility. */
export interface WaterfallLeg {
    tier: number;
    provider: string;
    filledAmount: number;
    executionRate: number;
    marginCaptured: number;
}

/** @deprecated Batch 4/6 compatibility alias; prefer `SorExecuteResponseV1`. */
export interface SorExecutionPlan extends SorExecuteResponseV1 {
    transaction_uuid?: string;
}

const VALID_ROUTE_TYPES = new Set<SorRouteType>([
    'L1_COW_ATOMIC_PSKT',
    'CROSS_CHAIN_OPSHA256_HTLC',
    'TIER3_CHANGENOW_SPLIT_PSKT',
    'CROSS_CHAIN_DEPOSIT_INTENT'
]);

function resolveRustBackendBaseUrl(): string {
    const explicit = String(env.RUST_BACKEND_URL || '').trim();
    if (explicit) return explicit.replace(/\/+$/, '');
    const nodeIp = String(env.UBUNTU_NODE_IP || '').trim();
    if (nodeIp) return `http://${nodeIp}:8002`;
    return '';
}

function resolveInternalBearerToken(): string {
    return String(env.INTERNAL_ADMIN_TOKEN || env.PERENNIA_ADMIN_KEY || '')
        .trim()
        .replace(/^['"]|['"]$/g, '');
}

function sanitizeUpstreamErrorMessage(raw: string, status: number): string {
    if (status === 503 || /ORACLE_HALT|SERVICE_UNAVAILABLE|oracle/i.test(raw)) {
        return LIVE_PRICING_UNAVAILABLE_MESSAGE;
    }
    return raw.trim() || 'Smart Order Router rejected request.';
}

export class SmartOrderRouter {
    public async executeNonCustodialSwap(
        req: SorExecuteRequestV1
    ): Promise<SorExecuteResponseV1> {
        const rustBase = resolveRustBackendBaseUrl();
        if (!rustBase) {
            throw new SorUpstreamError(
                503,
                'SOR_BACKEND_UNCONFIGURED',
                LIVE_PRICING_UNAVAILABLE_MESSAGE,
                true
            );
        }

        const token = resolveInternalBearerToken();
        const enforceAuth =
            String(env.ENFORCE_INTERNAL_AUTH || 'true').trim().toLowerCase() !== 'false';
        if (enforceAuth && !token) {
            throw new SorUpstreamError(
                503,
                'INTERNAL_AUTH_UNCONFIGURED',
                LIVE_PRICING_UNAVAILABLE_MESSAGE,
                true
            );
        }

        const amountAtomicBig = parseU128Str(req.amountAtomic, 'amountAtomic');
        if (amountAtomicBig <= 0n) {
            throw new SorUpstreamError(
                400,
                'INVALID_AMOUNT_ATOMIC',
                'Swap amount must be greater than zero.'
            );
        }

        const payAsset = String(req.payAsset || '').trim().toUpperCase();
        const receiveAsset = String(req.receiveAsset || '').trim().toUpperCase();
        if (!payAsset || !receiveAsset || payAsset === receiveAsset) {
            throw new SorUpstreamError(
                400,
                'INVALID_PAIR',
                'Pay asset and receive asset must be valid and distinct.'
            );
        }

        const slippageBpsRaw = req.slippageBps ?? 50;
        if (
            !Number.isInteger(slippageBpsRaw) ||
            slippageBpsRaw < 0 ||
            slippageBpsRaw > 5000
        ) {
            throw new SorUpstreamError(
                400,
                'INVALID_SLIPPAGE_BPS',
                'slippageBps must be an integer between 0 and 5000.'
            );
        }

        const normalizedWallet = req.wallet.trim().toLowerCase().startsWith('kaspa:')
            ? req.wallet.trim().toLowerCase()
            : `kaspa:${req.wallet.trim().toLowerCase()}`;

        const wireBody: Record<string, unknown> = {
            wallet: normalizedWallet,
            payAsset,
            receiveAsset,
            targetNetwork: (
                req.targetNetwork || resolveDefaultTargetNetworkForAsset(receiveAsset)
            )
                .trim()
                .toUpperCase(),
            amountAtomic: amountAtomicBig.toString(),
            slippageBps: slippageBpsRaw,
            refundKaspaAddress: (req.refundKaspaAddress || normalizedWallet).trim()
        };

        if (req.minOutputAtomic !== undefined && req.minOutputAtomic !== null) {
            wireBody.minOutputAtomic = toU128Str(req.minOutputAtomic, 'minOutputAtomic');
        }
        if (req.destinationAddress) {
            wireBody.destinationAddress = req.destinationAddress.trim();
        }
        if (Array.isArray(req.utxos) && req.utxos.length > 0) {
            wireBody.utxos = req.utxos;
        }
        if (req.htlcSha256HashlockHex) {
            wireBody.htlcSha256HashlockHex = req.htlcSha256HashlockHex.trim();
        }
        if (req.counterpartyPubkeyHex) {
            wireBody.counterpartyPubkeyHex = req.counterpartyPubkeyHex.trim();
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'application/json'
        };
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        let res: Response;
        try {
            res = await fetch(`${rustBase}/v1/sor/execute`, {
                method: 'POST',
                headers,
                body: JSON.stringify(wireBody),
                signal: AbortSignal.timeout(9000)
            });
        } catch {
            throw new SorUpstreamError(
                503,
                'SOR_UPSTREAM_UNREACHABLE',
                LIVE_PRICING_UNAVAILABLE_MESSAGE,
                true
            );
        }

        const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        if (!res.ok || !data || data.success !== true) {
            const rawErr = String(data?.error || data?.message || '');
            const status = res.status === 503 || res.status >= 500 ? 503 : res.status;
            throw new SorUpstreamError(
                status,
                status === 503 ? 'LIVE_PRICING_UNAVAILABLE' : 'SOR_REJECTED',
                sanitizeUpstreamErrorMessage(rawErr, status),
                status === 503
            );
        }

        const routeTypeRaw = String(data.routeType || 'CROSS_CHAIN_DEPOSIT_INTENT');
        const routeType: SorRouteType = VALID_ROUTE_TYPES.has(routeTypeRaw as SorRouteType)
            ? (routeTypeRaw as SorRouteType)
            : 'CROSS_CHAIN_DEPOSIT_INTENT';

        const tokenSteeringRaw =
            data.tokenSteering && typeof data.tokenSteering === 'object'
                ? (data.tokenSteering as Record<string, unknown>)
                : {};

        return {
            success: true,
            transactionUuid: String(data.transactionUuid || ''),
            routeType,
            payAsset: String(data.payAsset || payAsset).toUpperCase(),
            receiveAsset: String(data.receiveAsset || receiveAsset).toUpperCase(),
            targetNetwork: String(
                data.targetNetwork ||
                    wireBody.targetNetwork ||
                    resolveDefaultTargetNetworkForAsset(receiveAsset)
            ).toUpperCase(),
            amountInAtomic: toU128Str(data.amountInAtomic ?? amountAtomicBig, 'amountInAtomic'),
            protocolFeeAtomic: toU128Str(data.protocolFeeAtomic ?? '0', 'protocolFeeAtomic'),
            networkFeeSompi: toU128Str(data.networkFeeSompi ?? '0', 'networkFeeSompi'),
            estimatedOutputAtomic: toU128Str(
                data.estimatedOutputAtomic ?? '0',
                'estimatedOutputAtomic'
            ),
            minOutputAtomic: toU128Str(data.minOutputAtomic ?? '0', 'minOutputAtomic'),
            feeBps: Number(data.feeBps ?? 50),
            feeTierLabel: String(data.feeTierLabel || ''),
            grossUsdMicros: toU128Str(data.grossUsdMicros ?? '0', 'grossUsdMicros'),
            netUsdMicros: toU128Str(data.netUsdMicros ?? '0', 'netUsdMicros'),
            payOracleUsdE8: toU128Str(data.payOracleUsdE8 ?? '0', 'payOracleUsdE8'),
            receiveOracleUsdE8: toU128Str(
                data.receiveOracleUsdE8 ?? '0',
                'receiveOracleUsdE8'
            ),
            kasOracleUsdE8: toU128Str(data.kasOracleUsdE8 ?? '0', 'kasOracleUsdE8'),
            refundKaspaAddress: String(data.refundKaspaAddress || normalizedWallet),
            tokenSteering: {
                allowed: Boolean(tokenSteeringRaw.allowed ?? true),
                rejectReason:
                    tokenSteeringRaw.rejectReason !== undefined &&
                    tokenSteeringRaw.rejectReason !== null
                        ? String(tokenSteeringRaw.rejectReason)
                        : null,
                payState: String(tokenSteeringRaw.payState || 'AUTO_BALANCE'),
                receiveState: String(tokenSteeringRaw.receiveState || 'AUTO_BALANCE'),
                allowDarkPoolInternalClearing: Boolean(
                    tokenSteeringRaw.allowDarkPoolInternalClearing ?? true
                ),
                feeLegs: Array.isArray(tokenSteeringRaw.feeLegs)
                    ? (tokenSteeringRaw.feeLegs as Array<{ asset: string; shareRatio: number }>)
                    : [],
                explanation: String(tokenSteeringRaw.explanation || '')
            },
            pskt: (data.pskt ?? null) as PsktPayload | null,
            htlcCovenant:
                data.htlcCovenant && typeof data.htlcCovenant === 'object'
                    ? (data.htlcCovenant as Record<string, unknown>)
                    : null,
            formattedUtxos: Array.isArray(data.formattedUtxos) ? data.formattedUtxos : []
        };
    }

    /** @deprecated Use `executeNonCustodialSwap` with `amountAtomic` (`U128Str`). */
    public async calculateSplitFill(
        req: SwapPayload,
        wallet: string,
        utxos?: unknown[]
    ): Promise<SorExecutionPlan> {
        const payDecimals = atomicDecimalsForSorAsset(req.payAsset);
        const amountAtomic =
            req.amountAtomic !== undefined
                ? toU128Str(req.amountAtomic, 'amountAtomic')
                : String(req.amount ?? '0');
        const resolvedAtomic =
            req.amountAtomic !== undefined
                ? amountAtomic
                : (() => {
                      const raw = String(req.amount ?? '0').trim();
                      const match = /^([0-9]+)(?:\.([0-9]+))?$/.exec(raw);
                      if (!match) {
                          throw new SorUpstreamError(400, 'INVALID_AMOUNT', 'Invalid swap amount.');
                      }
                      const scale = 10n ** BigInt(payDecimals);
                      const frac = (match[2] ?? '').slice(0, payDecimals).padEnd(payDecimals, '0');
                      return (BigInt(match[1]) * scale + BigInt(frac)).toString();
                  })();

        const plan = await this.executeNonCustodialSwap({
            wallet,
            payAsset: req.payAsset,
            receiveAsset: req.receiveAsset,
            targetNetwork: req.targetNetwork,
            amountAtomic: resolvedAtomic,
            slippageBps: req.slippageBps ?? 50,
            destinationAddress: req.destinationAddress,
            refundKaspaAddress: req.refundKaspaAddress,
            utxos
        });
        return {
            ...plan,
            transaction_uuid: plan.transactionUuid
        };
    }
}

export const sorEngine = new SmartOrderRouter();
