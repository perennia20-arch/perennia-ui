import { json, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';

export interface HifoTaxLotRecord {
    lotId: string;
    assetTicker: string;
    acquiredAt: string;
    kasSompi: number;
    initialTokens: number;
    remainingSompi: number;
    remainingTokens: number;
    fmvUsdPerToken: number;
    totalCostBasisUsd: number;
    remainingCostBasisUsd: number;
    sourceEventType: string;
    sourceTxHash: string;
    status: 'OPEN' | 'DEPLETED';
    holdingDays: number;
    isLongTerm: boolean;
}

export interface HifoDisposalMatchRecord {
    matchId: string;
    lotId: string;
    assetTicker: string;
    disposedSompi: number;
    disposedTokens: number;
    acquiredAt: string;
    disposedAt: string;
    holdingPeriodDays: number;
    isLongTerm: boolean;
    costBasisUsd: number;
    grossProceedsUsd: number;
    realizedGainLossUsd: number;
    disposalTxHash: string;
}

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

function computePassiveHifoFromEvents(
    chronologicalEvents: any[],
    existingDbLots: any[],
    existingDbMatches: any[]
): {
    lots: HifoTaxLotRecord[];
    disposalMatches: HifoDisposalMatchRecord[];
    eventHifoOverlay: Map<
        string,
        {
            costBasisUsd: number;
            realizedGainLossUsd: number;
            holdingPeriod: 'SHORT_TERM' | 'LONG_TERM' | 'MIXED_TERM';
        }
    >;
} {
    const nowMs = Date.now();
    const eventHifoOverlay = new Map<
        string,
        {
            costBasisUsd: number;
            realizedGainLossUsd: number;
            holdingPeriod: 'SHORT_TERM' | 'LONG_TERM' | 'MIXED_TERM';
        }
    >();

    if (existingDbLots.length > 0) {
        const mappedLots: HifoTaxLotRecord[] = existingDbLots.map((r) => {
            const acqMs = new Date(r.acquired_at).getTime();
            const holdingDays = Math.max(
                0,
                Math.floor((nowMs - acqMs) / (1000 * 86400))
            );
            const remTokens = Number(r.remaining_tokens || 0);
            const fmv = Number(r.fmv_usd_per_token || 0);
            return {
                lotId: String(r.lot_id),
                assetTicker: String(r.asset_ticker || 'KAS').toUpperCase(),
                acquiredAt: new Date(r.acquired_at).toISOString(),
                kasSompi: Number(r.kas_sompi || 0),
                initialTokens: Number(r.initial_tokens || 0),
                remainingSompi: Number(r.remaining_sompi || 0),
                remainingTokens: remTokens,
                fmvUsdPerToken: fmv,
                totalCostBasisUsd: Number(r.total_cost_basis_usd || 0),
                remainingCostBasisUsd: remTokens * fmv,
                sourceEventType: String(r.source_event_type || 'YIELD'),
                sourceTxHash: String(r.source_tx_hash || ''),
                status:
                    r.status === 'DEPLETED' || remTokens <= 1e-8
                        ? 'DEPLETED'
                        : 'OPEN',
                holdingDays,
                isLongTerm: holdingDays > 365
            };
        });

        const mappedMatches: HifoDisposalMatchRecord[] = existingDbMatches.map((m) => ({
            matchId: String(m.match_id),
            lotId: String(m.lot_id),
            assetTicker: String(m.asset_ticker || 'KAS').toUpperCase(),
            disposedSompi: Number(m.disposed_sompi || 0),
            disposedTokens: Number(m.disposed_tokens || 0),
            acquiredAt: new Date(m.acquired_at).toISOString(),
            disposedAt: new Date(m.disposed_at).toISOString(),
            holdingPeriodDays: Number(m.holding_period_days || 0),
            isLongTerm: Boolean(m.is_long_term),
            costBasisUsd: Number(m.cost_basis_usd || 0),
            grossProceedsUsd: Number(m.gross_proceeds_usd || 0),
            realizedGainLossUsd: Number(m.realized_gain_loss_usd || 0),
            disposalTxHash: String(m.disposal_tx_hash || '')
        }));

        return {
            lots: mappedLots,
            disposalMatches: mappedMatches,
            eventHifoOverlay
        };
    }

    const simulatedLots: HifoTaxLotRecord[] = [];
    const simulatedMatches: HifoDisposalMatchRecord[] = [];

    for (let i = 0; i < chronologicalEvents.length; i++) {
        const ev = chronologicalEvents[i];
        const evId = String(ev.event_id || `ev_${i}`);
        const evType = String(ev.event_type || '').toUpperCase();
        const ticker = String(ev.asset_ticker || 'KAS').toUpperCase();
        const qty = Math.max(0, Number(ev.amount_tokens || 0));
        const grossUsd = Math.max(0, Number(ev.gross_proceeds_usd || 0));
        const spot =
            Number(ev.spot_price_at_execution || 0) > 0
                ? Number(ev.spot_price_at_execution)
                : qty > 0
                  ? grossUsd / qty
                  : 0;
        const recordedIso = ev.recorded_at
            ? new Date(ev.recorded_at).toISOString()
            : new Date().toISOString();
        const recordedMs = new Date(recordedIso).getTime();
        const txHash = String(ev.tx_hash || evId.slice(0, 12));

        if ((evType === 'YIELD' || evType === 'FIAT_ONRAMP') && qty > 0) {
            const holdingDays = Math.max(
                0,
                Math.floor((nowMs - recordedMs) / (1000 * 86400))
            );
            const sompi = Math.round(qty * 1e8);
            simulatedLots.push({
                lotId: `LOT-${evId.slice(0, 8).toUpperCase()}`,
                assetTicker: ticker,
                acquiredAt: recordedIso,
                kasSompi: sompi,
                initialTokens: qty,
                remainingSompi: sompi,
                remainingTokens: qty,
                fmvUsdPerToken: spot,
                totalCostBasisUsd: grossUsd,
                remainingCostBasisUsd: grossUsd,
                sourceEventType: evType,
                sourceTxHash: txHash,
                status: 'OPEN',
                holdingDays,
                isLongTerm: holdingDays > 365
            });
            eventHifoOverlay.set(evId, {
                costBasisUsd: grossUsd,
                realizedGainLossUsd: 0,
                holdingPeriod: holdingDays > 365 ? 'LONG_TERM' : 'SHORT_TERM'
            });
        } else if (
            (evType === 'DEX_SWAP' ||
                evType === 'FIAT_OFFRAMP' ||
                evType === 'PASSTHROUGH_SETTLED' ||
                evType === 'OTC_SETTLEMENT') &&
            qty > 0
        ) {
            const candidateLots = simulatedLots
                .filter((l) => l.status === 'OPEN' && l.remainingTokens > 1e-8)
                .sort((a, b) => {
                    if (Math.abs(b.fmvUsdPerToken - a.fmvUsdPerToken) > 1e-9) {
                        return b.fmvUsdPerToken - a.fmvUsdPerToken;
                    }
                    return (
                        new Date(a.acquiredAt).getTime() -
                        new Date(b.acquiredAt).getTime()
                    );
                });

            let remToDispose = qty;
            let matchedBasisUsd = 0;
            let hasLt = false;
            let hasSt = false;

            for (const lot of candidateLots) {
                if (remToDispose <= 1e-8) break;
                const consumed = Math.min(remToDispose, lot.remainingTokens);
                const consumedSompi = Math.round(consumed * 1e8);
                lot.remainingTokens = Math.max(0, lot.remainingTokens - consumed);
                lot.remainingSompi = Math.round(lot.remainingTokens * 1e8);
                lot.remainingCostBasisUsd = lot.remainingTokens * lot.fmvUsdPerToken;
                if (lot.remainingTokens <= 1e-8) {
                    lot.status = 'DEPLETED';
                }

                const holdDays = Math.max(
                    0,
                    Math.floor(
                        (recordedMs - new Date(lot.acquiredAt).getTime()) /
                            (1000 * 86400)
                    )
                );
                const isLt = holdDays > 365;
                if (isLt) hasLt = true;
                else hasSt = true;

                const sliceBasisUsd = consumed * lot.fmvUsdPerToken;
                const sliceProceedsUsd =
                    qty > 0 ? grossUsd * (consumed / qty) : consumed * spot;
                const sliceGainLoss = sliceProceedsUsd - sliceBasisUsd;
                matchedBasisUsd += sliceBasisUsd;
                remToDispose = Math.max(0, remToDispose - consumed);

                simulatedMatches.push({
                    matchId: `MATCH-${evId.slice(0, 6).toUpperCase()}-${lot.lotId.slice(-4)}`,
                    lotId: lot.lotId,
                    assetTicker: lot.assetTicker,
                    disposedSompi: consumedSompi,
                    disposedTokens: consumed,
                    acquiredAt: lot.acquiredAt,
                    disposedAt: recordedIso,
                    holdingPeriodDays: holdDays,
                    isLongTerm: isLt,
                    costBasisUsd: sliceBasisUsd,
                    grossProceedsUsd: sliceProceedsUsd,
                    realizedGainLossUsd: sliceGainLoss,
                    disposalTxHash: txHash
                });
            }

            if (remToDispose > 1e-8) {
                matchedBasisUsd +=
                    qty > 0 ? grossUsd * (remToDispose / qty) : remToDispose * spot;
                hasSt = true;
            }

            const holdingPeriod: 'SHORT_TERM' | 'LONG_TERM' | 'MIXED_TERM' =
                hasLt && !hasSt
                    ? 'LONG_TERM'
                    : hasLt && hasSt
                      ? 'MIXED_TERM'
                      : 'SHORT_TERM';

            eventHifoOverlay.set(evId, {
                costBasisUsd: matchedBasisUsd,
                realizedGainLossUsd: grossUsd - matchedBasisUsd,
                holdingPeriod
            });
        }
    }

    simulatedLots.sort((a, b) => b.fmvUsdPerToken - a.fmvUsdPerToken);
    simulatedMatches.sort(
        (a, b) =>
            new Date(b.disposedAt).getTime() - new Date(a.disposedAt).getTime()
    );

    return {
        lots: simulatedLots,
        disposalMatches: simulatedMatches,
        eventHifoOverlay
    };
}

export const GET = async ({ cookies, url }: RequestEvent) => {
    const wantHifoBundle = url.searchParams.get('bundle') === 'hifo';
    const sessionId = cookies.get('perennia_session');
    if (!sessionId) {
        return wantHifoBundle
            ? json({
                  events: [],
                  hifoLots: [],
                  disposalMatches: [],
                  hifoSummary: null
              })
            : json([]);
    }
    const sessionWalletRaw = await redis.get(`session:${sessionId}`);
    if (!sessionWalletRaw) {
        return wantHifoBundle
            ? json({
                  events: [],
                  hifoLots: [],
                  disposalMatches: [],
                  hifoSummary: null
              })
            : json([]);
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
        await client
            .query(
                `ALTER TABLE tax_ledger_events ADD COLUMN IF NOT EXISTS cost_basis_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0`
            )
            .catch(() => {});
        await client
            .query(
                `ALTER TABLE tax_ledger_events ADD COLUMN IF NOT EXISTS realized_gain_loss_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0`
            )
            .catch(() => {});
        await client
            .query(
                `ALTER TABLE tax_ledger_events ADD COLUMN IF NOT EXISTS holding_period VARCHAR(32) NOT NULL DEFAULT 'SHORT_TERM'`
            )
            .catch(() => {});

        const [res, l1QueueRes, dbLotsRes, dbMatchesRes] = await Promise.all([
            client.query(
                `SELECT * FROM tax_ledger_events
                 WHERE wallet_address = $1 OR wallet_address = $2
                 ORDER BY recorded_at DESC
                 LIMIT 250`,
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
                .catch(() => ({ rows: [] as any[] })),
            client
                .query(
                    `SELECT * FROM hifo_tax_lots
                     WHERE wallet_address = $1 OR wallet_address = $2
                     ORDER BY fmv_usd_per_token DESC, acquired_at ASC
                     LIMIT 500`,
                    [cleanWallet, prefixedWallet]
                )
                .catch(() => ({ rows: [] as any[] })),
            client
                .query(
                    `SELECT * FROM hifo_disposal_matches
                     WHERE wallet_address = $1 OR wallet_address = $2
                     ORDER BY disposed_at DESC
                     LIMIT 500`,
                    [cleanWallet, prefixedWallet]
                )
                .catch(() => ({ rows: [] as any[] }))
        ]);

        const chronologicalRows = [...res.rows].reverse();
        const { lots, disposalMatches, eventHifoOverlay } =
            computePassiveHifoFromEvents(
                chronologicalRows,
                dbLotsRes.rows,
                dbMatchesRes.rows
            );

        const l1PayoutMap = new Map<string, any>();
        for (const qRow of l1QueueRes.rows) {
            if (qRow.payout_id) {
                l1PayoutMap.set(String(qRow.payout_id), qRow);
            }
            if (qRow.tx_hash) {
                l1PayoutMap.set(String(qRow.tx_hash), qRow);
            }
        }

        const events = res.rows.map((row, idx) => {
            const evId = String(row.event_id || `ev_${idx}`);
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

            const amountTokens = Number(row.amount_tokens || 0);
            const grossUsd = Number(row.gross_proceeds_usd || 0);
            const overlay = eventHifoOverlay.get(evId);
            const dbBasis = Number(row.cost_basis_usd || 0);
            const dbGainLoss = Number(row.realized_gain_loss_usd || 0);
            const resolvedCostBasisUsd =
                dbBasis > 0 ? dbBasis : (overlay?.costBasisUsd ?? grossUsd);
            const resolvedRealizedGainLossUsd =
                dbBasis > 0
                    ? dbGainLoss
                    : (overlay?.realizedGainLossUsd ?? 0);
            const resolvedHoldingPeriod =
                row.holding_period || overlay?.holdingPeriod || 'SHORT_TERM';

            return {
                id: evId,
                timestamp: new Date(row.recorded_at).toLocaleString(),
                recordedAtIso: new Date(row.recorded_at).toISOString(),
                type: displayType,
                rawEventType: row.event_type,
                asset: {
                    ticker,
                    color
                },
                amount: amountTokens,
                kasSompi: Math.round(amountTokens * 1e8),
                usdValueAtTime: grossUsd,
                costBasisUsd: resolvedCostBasisUsd,
                realizedGainLossUsd: resolvedRealizedGainLossUsd,
                holdingPeriod: resolvedHoldingPeriod,
                spotPriceAtExecution: Number(row.spot_price_at_execution || 0),
                txHash: resolvedTxHash,
                payoutAddress,
                explorerUrl,
                l1Status:
                    linkedQueue?.status ||
                    (isQueuedId ? 'QUEUED_FOR_L1_DISPATCH' : 'DISPATCHED_ONCHAIN')
            };
        });

        if (wantHifoBundle) {
            const openCostBasisUsd = lots
                .filter((l) => l.status === 'OPEN')
                .reduce((s, l) => s + l.remainingCostBasisUsd, 0);
            const openKasTokens = lots
                .filter((l) => l.status === 'OPEN' && l.assetTicker === 'KAS')
                .reduce((s, l) => s + l.remainingTokens, 0);
            const shortTermGainLossUsd = disposalMatches
                .filter((m) => !m.isLongTerm)
                .reduce((s, m) => s + m.realizedGainLossUsd, 0);
            const longTermGainLossUsd = disposalMatches
                .filter((m) => m.isLongTerm)
                .reduce((s, m) => s + m.realizedGainLossUsd, 0);
            const totalMatchedCostBasisUsd = disposalMatches.reduce(
                (s, m) => s + m.costBasisUsd,
                0
            );
            const totalMatchedProceedsUsd = disposalMatches.reduce(
                (s, m) => s + m.grossProceedsUsd,
                0
            );

            return json({
                events,
                hifoLots: lots,
                disposalMatches,
                hifoSummary: {
                    accountingMethod: 'PASSIVE_HIFO_NO_WASH',
                    openCostBasisUsd,
                    openKasTokens,
                    totalMatchedCostBasisUsd,
                    totalMatchedProceedsUsd,
                    shortTermGainLossUsd,
                    longTermGainLossUsd,
                    netRealizedGainLossUsd:
                        shortTermGainLossUsd + longTermGainLossUsd
                }
            });
        }

        return json(events);
    } catch (error) {
        console.error('Tax Events API Fault:', error);
        return wantHifoBundle
            ? json({
                  events: [],
                  hifoLots: [],
                  disposalMatches: [],
                  hifoSummary: null
              })
            : json([]);
    } finally {
        if (client) client.release();
    }
};