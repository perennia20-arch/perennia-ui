import { json, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';

function buildExplorerTxUrl(asset: string, txHash: string): string {
    const cleanAsset = String(asset || 'KAS')
        .trim()
        .toUpperCase();
    const cleanTx = String(txHash || '').trim();
    if (!cleanTx) return '#';
    switch (cleanAsset) {
        case 'KAS':
            return `https://kas.fyi/transaction/${cleanTx}`;
        case 'BTC':
            return `https://mempool.space/tx/${cleanTx}`;
        case 'ETH':
        case 'USDC':
        case 'USDT':
            return `https://etherscan.io/tx/${cleanTx}`;
        case 'SOL':
            return `https://solscan.io/tx/${cleanTx}`;
        case 'POL':
            return `https://polygonscan.com/tx/${cleanTx}`;
        case 'AVAX':
            return `https://snowtrace.io/tx/${cleanTx}`;
        case 'ARB':
            return `https://arbiscan.io/tx/${cleanTx}`;
        case 'BASE':
            return `https://basescan.org/tx/${cleanTx}`;
        case 'XRP':
            return `https://xrpscan.com/tx/${cleanTx}`;
        case 'DOGE':
            return `https://blockchair.com/dogecoin/transaction/${cleanTx}`;
        case 'SUI':
            return `https://suiscan.xyz/mainnet/tx/${cleanTx}`;
        case 'TRX':
            return `https://tronscan.org/#/transaction/${cleanTx}`;
        case 'ZEC':
            return `https://blockchair.com/zcash/transaction/${cleanTx}`;
        default:
            return `https://kas.fyi/transaction/${cleanTx}`;
    }
}

function buildAddressExplorerUrl(asset: string, address: string): string {
    const cleanAsset = String(asset || 'KAS')
        .trim()
        .toUpperCase();
    const cleanAddr = String(address || '').trim();
    if (!cleanAddr || cleanAddr.includes('Awaiting')) return '#';
    switch (cleanAsset) {
        case 'KAS':
            return `https://kas.fyi/address/${cleanAddr.startsWith('kaspa:') ? cleanAddr : `kaspa:${cleanAddr}`}`;
        case 'BTC':
            return `https://mempool.space/address/${cleanAddr}`;
        case 'ETH':
        case 'USDC':
        case 'USDT':
            return `https://etherscan.io/address/${cleanAddr}`;
        case 'SOL':
            return `https://solscan.io/account/${cleanAddr}`;
        case 'DOGE':
            return `https://blockchair.com/dogecoin/address/${cleanAddr}`;
        case 'XRP':
            return `https://xrpscan.com/account/${cleanAddr}`;
        case 'POL':
            return `https://polygonscan.com/address/${cleanAddr}`;
        case 'AVAX':
            return `https://snowtrace.io/address/${cleanAddr}`;
        case 'ARB':
            return `https://arbiscan.io/address/${cleanAddr}`;
        case 'BASE':
            return `https://basescan.org/address/${cleanAddr}`;
        case 'SUI':
            return `https://suiscan.xyz/mainnet/account/${cleanAddr}`;
        case 'TRX':
            return `https://tronscan.org/#/address/${cleanAddr}`;
        case 'ZEC':
            return `https://blockchair.com/zcash/address/${cleanAddr}`;
        default:
            return `https://kas.fyi/address/${cleanAddr}`;
    }
}

export const GET = async ({ cookies }: RequestEvent) => {
    const sessionId = cookies.get('perennia_session');
    if (!sessionId) {
        return json([]);
    }
    const sessionWalletRaw = await redis.get(`session:${sessionId}`);
    if (!sessionWalletRaw) {
        return json([]);
    }
    const sessionWallet = sessionWalletRaw;
    const cleanWallet = sessionWallet.toLowerCase().replace(/^kaspa:/i, '').trim();
    const prefixedWallet = `kaspa:${cleanWallet}`;

    let client;
    try {
        client = await dbPool.connect();
        await client
            .query(`ALTER TABLE tax_ledger_events ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(255)`)
            .catch(() => {});
        await client
            .query(
                `ALTER TABLE tax_ledger_events ADD COLUMN IF NOT EXISTS payout_address VARCHAR(255)`
            )
            .catch(() => {});

        const [res, l1QueueRes] = await Promise.all([
            client.query(
                `SELECT * FROM tax_ledger_events
                 WHERE wallet_address = $1 OR wallet_address = $2
                 ORDER BY recorded_at DESC
                 LIMIT 200`,
                [cleanWallet, prefixedWallet]
            ),
            client
                .query(
                    `SELECT payout_id, tx_hash, explorer_url, destination_address, status
                     FROM l1_payout_queue
                     WHERE wallet_address = $1 OR wallet_address = $2
                     ORDER BY created_at DESC
                     LIMIT 100`,
                    [prefixedWallet, cleanWallet]
                )
                .catch(() => ({ rows: [] as any[] }))
        ]);

        const l1PayoutMap = new Map<string, any>();
        for (const qRow of l1QueueRes.rows) {
            if (qRow.payout_id) {
                l1PayoutMap.set(String(qRow.payout_id), qRow);
            }
            if (qRow.tx_hash) {
                l1PayoutMap.set(String(qRow.tx_hash), qRow);
            }
        }

        const events = res.rows.map((row) => {
            const ticker = String(row.asset_ticker || 'KAS').toUpperCase();
            let color = '#18C6A5';
            if (ticker === 'BTC') color = '#F7931A';
            else if (ticker === 'ETH') color = '#627EEA';
            else if (ticker === 'SOL') color = '#14F195';
            else if (ticker === 'USD') color = '#10B981';
            else if (ticker === 'USDC' || ticker === 'USDT') color = '#3B82F6';
            else if (ticker === 'POL') color = '#8247E5';
            else if (ticker === 'AVAX') color = '#E84142';
            else if (ticker === 'ARB') color = '#28A0F0';
            else if (ticker === 'BASE') color = '#0052FF';

            let displayType = row.event_type;
            if (row.event_type === 'YIELD') displayType = 'Epoch L1 Payout';
            else if (row.event_type === 'L1_WITHDRAWAL') displayType = 'L1 Withdrawal';
            else if (row.event_type === 'L1_REFUND') displayType = 'L1 Payout Refund';
            else if (row.event_type === 'FIAT_ONRAMP') displayType = 'Fiat On-Ramp';
            else if (row.event_type === 'FIAT_OFFRAMP') displayType = 'Fiat Off-Ramp';
            else if (row.event_type === 'FIAT_REFUND') displayType = 'Fiat Refund';
            else if (row.event_type === 'DEX_SWAP') displayType = 'DEX Swap';
            else if (row.event_type === 'PASSTHROUGH_SETTLED')
                displayType = '3rd-Party Pass-Through';
            else if (row.event_type === 'PASSTHROUGH_REFUND')
                displayType = 'Pass-Through Refund';
            else if (row.event_type === 'OTC_SETTLEMENT') displayType = 'OTC Settlement';
            else if (row.event_type === 'TAX_ESCROW_LP')
                displayType = 'Tax Escrow Auto-LP';

            const rawDbTxHash = String(row.tx_hash || '').trim();
            const linkedQueue = rawDbTxHash ? l1PayoutMap.get(rawDbTxHash) : null;
            const resolvedTxHash =
                (linkedQueue?.tx_hash && String(linkedQueue.tx_hash).trim()) ||
                rawDbTxHash ||
                String(row.event_id || '')
                    .split('-')[0]
                    .toUpperCase();

            const payoutAddress =
                row.payout_address ||
                linkedQueue?.destination_address ||
                prefixedWallet;

            const isQueuedId = resolvedTxHash.startsWith('PER-L1-');
            const explorerUrl =
                !isQueuedId && resolvedTxHash.length >= 12
                    ? buildExplorerTxUrl(ticker, resolvedTxHash)
                    : buildAddressExplorerUrl(ticker, payoutAddress);

            return {
                timestamp: new Date(row.recorded_at).toLocaleString(),
                type: displayType,
                rawEventType: row.event_type,
                asset: {
                    ticker,
                    color
                },
                amount: Number(row.amount_tokens || 0),
                usdValueAtTime: Number(row.gross_proceeds_usd || 0),
                spotPriceAtExecution: Number(row.spot_price_at_execution || 0),
                txHash: resolvedTxHash,
                payoutAddress,
                explorerUrl,
                l1Status:
                    linkedQueue?.status ||
                    (isQueuedId ? 'QUEUED_FOR_L1_DISPATCH' : 'DISPATCHED_ONCHAIN')
            };
        });

        return json(events);
    } catch (error) {
        console.error('Tax Events API Fault:', error);
        return json([]);
    } finally {
        if (client) client.release();
    }
};