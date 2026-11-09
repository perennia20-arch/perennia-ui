import { identity } from '$lib/stores/identity.svelte';
import { treasury } from '$lib/stores/treasury.svelte';
import { ui } from '$lib/stores/ui.svelte';
export const MASTER_ADMIN_ADDRESS =
    'kaspa:qpra0t9ul8hd7m7pw4td6ax3unlf2vyc2fzit9p9yulhsnk7quakmpj4lpw7';
export const walletState = $state({
    address: '',
    devAdminBypass: false
});
export function getIsCorporateAdmin(): boolean {
    return Boolean(identity.isCorporateAdmin || walletState.devAdminBypass);
}
export interface UniversalL1SigningRequest {
    intentType: 'DEX_SWAP' | 'FIAT_OFFRAMP' | 'L1_TRANSFER';
    payAsset: string;
    network?: string;
    contractAddress?: string;
    decimals?: number;
    payAmount: number | string;
    destinationAddress: string;
    receiveAsset?: string;
    estimatedReceiveAmount?: number | string;
    fiatAmountUsd?: number | string;
    payoutMethod?: 'ach' | 'wire' | 'ACH' | 'WIRE';
    bankLabel?: string;
    accountType?: 'CHECKING' | 'SAVINGS';
    routingNumber?: string;
    accountNumber?: string;
    externalCostBasisUsd?: number;
    orderId?: string;
    psbtData?: any;
}
export function resolveSigningMetadataForAsset(
    rawTicker: string,
    explicitNetwork?: string,
    explicitContract?: string
): {
    ticker: string;
    cleanTicker: string;
    network: string;
    contractAddress?: string;
    decimals: number;
    isNativeKas: boolean;
    actionType: 'SEND_KAS' | 'SEND_KRC20' | 'SEND_L1';
} {
    const cleanTicker = String(rawTicker || 'KAS')
        .trim()
        .toUpperCase();
    const assetObj = treasury.getAsset(cleanTicker);
    const network = String(
        explicitNetwork || assetObj.network || cleanTicker
    )
        .trim()
        .toUpperCase();
    const contractAddress = explicitContract || assetObj.contract;
    const decimals =
        cleanTicker === 'USDC' || cleanTicker === 'USDT'
            ? 6
            : cleanTicker === 'KAS' ||
                cleanTicker === 'BTC' ||
                cleanTicker === 'DOGE' ||
                cleanTicker === 'ZEC' ||
                network === 'KAS'
              ? 8
              : cleanTicker === 'SOL' || cleanTicker === 'SUI'
                ? 9
                : cleanTicker === 'XRP' || cleanTicker === 'TRX'
                  ? 6
                  : 18;
    const actionType: 'SEND_KAS' | 'SEND_KRC20' | 'SEND_L1' =
        cleanTicker === 'KAS'
            ? 'SEND_KAS'
            : network === 'KAS' && cleanTicker !== 'KAS'
              ? 'SEND_KRC20'
              : 'SEND_L1';
    return {
        ticker: cleanTicker,
        cleanTicker,
        network,
        contractAddress,
        decimals,
        isNativeKas: cleanTicker === 'KAS',
        actionType
    };
}
export function requestUniversalL1Signature(
    req: UniversalL1SigningRequest
): void {
    const meta = resolveSigningMetadataForAsset(
        req.payAsset,
        req.network,
        req.contractAddress
    );
    if (req.intentType === 'FIAT_OFFRAMP') {
        identity.requestVaultAuthorization({
            actionType: 'FIAT_OFFRAMP',
            l1SignSubType: meta.actionType,
            payAsset: meta.cleanTicker,
            network: meta.network,
            contractAddress: meta.contractAddress,
            decimals: req.decimals ?? meta.decimals,
            payAmount: String(req.payAmount),
            destinationAddress: req.destinationAddress,
            fiatAmount:
                req.fiatAmountUsd !== undefined
                    ? String(req.fiatAmountUsd)
                    : undefined,
            sourceMode:
                meta.cleanTicker === 'KAS'
                    ? 'onchain_kas'
                    : 'direct_wholesale_deposit',
            payoutMethod: (req.payoutMethod || 'ach').toLowerCase(),
            bankLabel: req.bankLabel || 'Primary Operating Account',
            accountType: req.accountType || 'CHECKING',
            routingNumber: req.routingNumber,
            accountNumber: req.accountNumber,
            externalCostBasisUsd: req.externalCostBasisUsd,
            orderId: req.orderId
        });
        return;
    }
    if (req.intentType === 'DEX_SWAP') {
        const hasKaspaPsbt = Boolean(
            req.psbtData?.psbt &&
                Array.isArray(req.psbtData.psbt.inputs) &&
                req.psbtData.psbt.inputs.length > 0
        );
        identity.requestVaultAuthorization({
            actionType: hasKaspaPsbt ? 'SWAP' : meta.actionType,
            swapContext: {
                isDexSwap: true,
                payAsset: meta.cleanTicker,
                payAmount: Number(req.payAmount),
                receiveAsset: req.receiveAsset || 'USDC',
                estimatedReceiveAmount: Number(
                    req.estimatedReceiveAmount || 0
                ),
                orderId: req.orderId
            },
            payAsset: meta.cleanTicker,
            receiveAsset: req.receiveAsset,
            network: meta.network,
            contractAddress: meta.contractAddress,
            decimals: req.decimals ?? meta.decimals,
            payAmount: String(req.payAmount),
            destinationAddress: req.destinationAddress,
            psbtData: req.psbtData
        });
        return;
    }
    identity.requestVaultAuthorization({
        actionType: meta.actionType,
        payAsset: meta.cleanTicker,
        network: meta.network,
        contractAddress: meta.contractAddress,
        decimals: req.decimals ?? meta.decimals,
        payAmount: String(req.payAmount),
        destinationAddress: req.destinationAddress
    });
    ui.showWalletModal = true;
}