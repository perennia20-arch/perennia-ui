import { recordBucketSettlementTaxAndHifo } from '$lib/server/seedAndNetting';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import {
    isWalletMasterAdmin,
    normalizeKaspaAddressStrict,
    normalizeKaspaBase32Strict,
    resolveMasterTreasuryKasAddressOptional
} from '$lib/server/kms';
import { executeOrQueueL1Dispatch } from '$lib/server/l1Dispatcher';
import {
    LIVE_PRICING_UNAVAILABLE_MESSAGE,
    parseDecimalToAtomic,
    parseSompiU64
} from '$lib/crypto/atomicMath';
import crypto from 'node:crypto';

const BATCH_FEE_RATE = 0.0025;
const DEFAULT_ESCROW_KAS =
    'kaspa:qpra8t9ul8hd7n9pvw4td6ax3unlf2vyc2fz5t9p9yalhsnk7qkaknp24lpm7';

const SEED_BUCKETS = [
    { id: 'BUCKET-USDC', asset: 'USDC', label: 'USDC Community Bucket', targetKas: 500 },
    { id: 'BUCKET-BTC', asset: 'BTC', label: 'Bitcoin L1 Bucket', targetKas: 1500 },
    { id: 'BUCKET-ETH', asset: 'ETH', label: 'Ethereum L1 Bucket', targetKas: 1000 },
    { id: 'BUCKET-SOL', asset: 'SOL', label: 'Solana L1 Bucket', targetKas: 600 },
    { id: 'BUCKET-SILO', asset: 'SILO', label: 'SILO Ecosystem Bucket', targetKas: 250 }
] as const;

let schemaReady = false;

export function resolveBucketEscrowAddress(): string {
    return resolveMasterTreasuryKasAddressOptional() || DEFAULT_ESCROW_KAS;
}

export async function resolveBucketSpotUsd(ticker: string): Promise<number> {
    const clean = ticker.trim().toUpperCase();
    if (clean === 'USDC' || clean === 'USDT' || clean === 'USD') return 1.0;
    const cached = await redis.get(`oracle:spot:${clean}_USDC`).catch(() => null);
    if (cached) {
        const v = parseFloat(cached);
        if (Number.isFinite(v) && v > 0) return v;
    }
    try {
        const dbRes = await dbPool.query(
            `SELECT price_usd FROM rwa_oracle_feeds WHERE ticker = $1 AND price_usd > 0 ORDER BY updated_at DESC LIMIT 1`,
            [clean]
        );
        if (dbRes.rows.length > 0 && Number(dbRes.rows[0].price_usd) > 0) {
            return Number(dbRes.rows[0].price_usd);
        }
    } catch {}
    if (clean === 'SILO') {
        const kas = await resolveBucketSpotUsd('KAS');
        if (kas > 0) return Number((kas / 23.809524).toFixed(6));
    }
    return 0;
}

export async function ensureCommunityBucketsSchema(): Promise<void> {
    if (schemaReady) return;
    const client = await dbPool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS settlement_buckets (
                bucket_id VARCHAR(96) PRIMARY KEY,
                target_asset VARCHAR(32) NOT NULL,
                label VARCHAR(128) NOT NULL,
                creator_wallet VARCHAR(255) NOT NULL,
                escrow_address VARCHAR(255) NOT NULL,
                visibility VARCHAR(16) NOT NULL DEFAULT 'PUBLIC',
                target_kas DOUBLE PRECISION NOT NULL DEFAULT 500.0,
                completed_swaps INTEGER NOT NULL DEFAULT 0,
                total_volume_settled_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                total_volume_settled_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                last_dispersal_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                last_dispersed_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                last_dispersed_tx_hash VARCHAR(255),
                last_dispersed_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS bucket_cycles (
                cycle_id VARCHAR(96) PRIMARY KEY,
                bucket_id VARCHAR(96) NOT NULL REFERENCES settlement_buckets(bucket_id) ON DELETE CASCADE,
                cycle_number INTEGER NOT NULL DEFAULT 1,
                target_asset VARCHAR(32) NOT NULL,
                target_kas DOUBLE PRECISION NOT NULL DEFAULT 500.0,
                mining_filled_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                manual_filled_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                total_filled_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                contributor_count INTEGER NOT NULL DEFAULT 0,
                status VARCHAR(24) NOT NULL DEFAULT 'OPEN',
                swap_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                total_dispersed_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                swap_tx_hash VARCHAR(255),
                opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                closed_at TIMESTAMPTZ,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS bucket_contributions (
                contribution_id BIGSERIAL PRIMARY KEY,
                cycle_id VARCHAR(96) NOT NULL REFERENCES bucket_cycles(cycle_id) ON DELETE CASCADE,
                bucket_id VARCHAR(96) NOT NULL REFERENCES settlement_buckets(bucket_id) ON DELETE CASCADE,
                contributor_wallet VARCHAR(255) NOT NULL,
                source_type VARCHAR(16) NOT NULL CHECK (source_type IN ('mining', 'manual')),
                amount_kas DOUBLE PRECISION NOT NULL CHECK (amount_kas > 0),
                tx_hash VARCHAR(255) NOT NULL,
                share_bps INTEGER NOT NULL DEFAULT 0,
                status VARCHAR(16) NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'swapping', 'dispersed')),
                dispersed_amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                dispersed_tx_hash VARCHAR(255),
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_bucket_cycles_bucket_status ON bucket_cycles(bucket_id, status);
            CREATE INDEX IF NOT EXISTS idx_bucket_contrib_cycle ON bucket_contributions(cycle_id, status);
            CREATE INDEX IF NOT EXISTS idx_bucket_contrib_wallet ON bucket_contributions(contributor_wallet, created_at DESC);
        `);

        const escrow = resolveBucketEscrowAddress();
        for (const sb of SEED_BUCKETS) {
            await client.query(
                `INSERT INTO settlement_buckets (bucket_id, target_asset, label, creator_wallet, escrow_address, visibility, target_kas)
                 VALUES ($1, $2, $3, $4, $5, 'PUBLIC', $6)
                 ON CONFLICT (bucket_id) DO NOTHING`,
                [sb.id, sb.asset, sb.label, escrow, escrow, sb.targetKas]
            );
            const openRes = await client.query(
                `SELECT cycle_id FROM bucket_cycles WHERE bucket_id = $1 AND status = 'OPEN' LIMIT 1`,
                [sb.id]
            );
            if (openRes.rows.length === 0) {
                const cId = `${sb.id}-CYC-1`;
                await client.query(
                    `INSERT INTO bucket_cycles (cycle_id, bucket_id, cycle_number, target_asset, target_kas, status)
                     VALUES ($1, $2, 1, $3, $4, 'OPEN')
                     ON CONFLICT (cycle_id) DO NOTHING`,
                    [cId, sb.id, sb.asset, sb.targetKas]
                );
            }
        }
        schemaReady = true;
    } finally {
        client.release();
    }
}

export async function recomputeCycleShares(client: any, cycleId: string): Promise<{
    miningKas: number;
    manualKas: number;
    totalKas: number;
    contributorCount: number;
}> {
    const rowsRes = await client.query(
        `SELECT contribution_id, contributor_wallet, source_type, amount_kas
         FROM bucket_contributions
         WHERE cycle_id = $1
         ORDER BY amount_kas DESC, contribution_id ASC`,
        [cycleId]
    );
    let miningKas = 0;
    let manualKas = 0;
    const wallets = new Set<string>();
    for (const r of rowsRes.rows) {
        const amt = Math.max(0, Number(r.amount_kas || 0));
        if (r.source_type === 'mining') miningKas += amt;
        else manualKas += amt;
        wallets.add(String(r.contributor_wallet || '').toLowerCase());
    }
    const totalKas = miningKas + manualKas;
    if (rowsRes.rows.length > 0 && totalKas > 0) {
        let assignedBps = 0;
        const bpsList = rowsRes.rows.map((r: any) => {
            const bps = Math.floor((Number(r.amount_kas || 0) / totalKas) * 10000);
            assignedBps += bps;
            return { id: r.contribution_id, bps };
        });
        const remainder = Math.max(0, 10000 - assignedBps);
        if (bpsList.length > 0 && remainder > 0) {
            bpsList[0].bps += remainder;
        }
        for (const item of bpsList) {
            await client.query(
                `UPDATE bucket_contributions SET share_bps = $2, updated_at = CURRENT_TIMESTAMP WHERE contribution_id = $1`,
                [item.id, item.bps]
            );
        }
    }
    await client.query(
        `UPDATE bucket_cycles
         SET mining_filled_kas = $2,
             manual_filled_kas = $3,
             total_filled_kas = $4,
             contributor_count = $5,
             updated_at = CURRENT_TIMESTAMP
         WHERE cycle_id = $1`,
        [cycleId, Number(miningKas.toFixed(6)), Number(manualKas.toFixed(6)), Number(totalKas.toFixed(6)), wallets.size]
    );
    return { miningKas, manualKas, totalKas, contributorCount: wallets.size };
}

export async function syncActiveMiningStreamsToOpenCycles(): Promise<void> {
    await ensureCommunityBucketsSchema();
    const client = await dbPool.connect();
    try {
        const ccRes = await client
            .query(`SELECT wallet_address, layout_state FROM user_command_centers`)
            .catch(() => ({ rows: [] as any[] }));
        const miningMap = new Map<string, Map<string, number>>();
        for (const row of ccRes.rows) {
            const cleanW = normalizeKaspaBase32Strict(String(row.wallet_address || ''));
            if (!cleanW) continue;
            const prefW = `kaspa:${cleanW}`;
            const sectors: any[] = Array.isArray(row.layout_state?.sectors) ? row.layout_state.sectors : [];
            for (const sec of sectors) {
                const pending = Math.max(0, Number(sec?.pendingKaspa || 0));
                if (pending <= 0.0001) continue;
                const tick = String(sec?.settlementConfig?.targetAsset?.ticker || '').trim().toUpperCase();
                if (!tick || tick === 'KAS' || tick === 'USD') continue;
                const bId = `BUCKET-${tick}`;
                if (!miningMap.has(bId)) miningMap.set(bId, new Map());
                const wMap = miningMap.get(bId)!;
                wMap.set(prefW, (wMap.get(prefW) || 0) + pending);
            }
        }
        for (const [bucketId, wMap] of miningMap.entries()) {
            const cycRes = await client.query(
                `SELECT cycle_id, target_kas FROM bucket_cycles WHERE bucket_id = $1 AND status = 'OPEN' LIMIT 1`,
                [bucketId]
            );
            if (cycRes.rows.length === 0) continue;
            const cycleId = String(cycRes.rows[0].cycle_id);
            for (const [wallet, amtKas] of wMap.entries()) {
                const streamTx = `MINING-STREAM-${cycleId}-${wallet.slice(-10)}`;
                const existing = await client.query(
                    `SELECT contribution_id FROM bucket_contributions
                     WHERE cycle_id = $1 AND contributor_wallet = $2 AND source_type = 'mining' AND status = 'held'
                     LIMIT 1`,
                    [cycleId, wallet]
                );
                if (existing.rows.length > 0) {
                    await client.query(
                        `UPDATE bucket_contributions SET amount_kas = $2, updated_at = CURRENT_TIMESTAMP WHERE contribution_id = $1`,
                        [existing.rows[0].contribution_id, Number(amtKas.toFixed(6))]
                    );
                } else {
                    await client.query(
                        `INSERT INTO bucket_contributions (cycle_id, bucket_id, contributor_wallet, source_type, amount_kas, tx_hash, status)
                         VALUES ($1, $2, $3, 'mining', $4, $5, 'held')`,
                        [cycleId, bucketId, wallet, Number(amtKas.toFixed(6)), streamTx]
                    );
                }
            }
            await recomputeCycleShares(client, cycleId);
        }
    } finally {
        client.release();
    }
}

export async function listCommunityBuckets(viewerWallet?: string | null) {
    await syncActiveMiningStreamsToOpenCycles().catch(() => {});
    await ensureCommunityBucketsSchema();

    const cleanViewer = viewerWallet ? normalizeKaspaBase32Strict(viewerWallet) : '';
    const prefViewer = cleanViewer ? `kaspa:${cleanViewer}` : '';
    const kasSpotUsd = await resolveBucketSpotUsd('KAS');

    const [bucketsRes, openCyclesRes, heldContribRes, recentDispersedRes] = await Promise.all([
        dbPool.query(`SELECT * FROM settlement_buckets ORDER BY completed_swaps DESC, bucket_id ASC`),
        dbPool.query(`SELECT * FROM bucket_cycles WHERE status = 'OPEN'`),
        dbPool.query(`SELECT * FROM bucket_contributions WHERE status = 'held' ORDER BY amount_kas DESC`),
        dbPool.query(
            `SELECT cycle_id, bucket_id, cycle_number, total_filled_kas, swap_rate, total_dispersed_tokens, swap_tx_hash, closed_at
             FROM bucket_cycles
             WHERE status = 'DISPERSED'
             ORDER BY closed_at DESC NULLS LAST
             LIMIT 30`
        )
    ]);

    const cycleByBucket = new Map<string, any>();
    for (const c of openCyclesRes.rows) cycleByBucket.set(String(c.bucket_id), c);

    const contribsByCycle = new Map<string, any[]>();
    for (const row of heldContribRes.rows) {
        const cId = String(row.cycle_id);
        if (!contribsByCycle.has(cId)) contribsByCycle.set(cId, []);
        contribsByCycle.get(cId)!.push(row);
    }

    const lastDispersedByBucket = new Map<string, any>();
    for (const d of recentDispersedRes.rows) {
        const bId = String(d.bucket_id);
        if (!lastDispersedByBucket.has(bId)) lastDispersedByBucket.set(bId, d);
    }

    let userPastDispersals: Record<string, any> = {};
    if (prefViewer) {
        const pastRes = await dbPool.query(
            `SELECT DISTINCT ON (bucket_id) bucket_id, cycle_id, amount_kas, share_bps, dispersed_amount, dispersed_tx_hash, updated_at
             FROM bucket_contributions
             WHERE (contributor_wallet = $1 OR contributor_wallet = $2) AND status = 'dispersed'
             ORDER BY bucket_id, updated_at DESC`,
            [prefViewer, cleanViewer]
        );
        for (const pr of pastRes.rows) userPastDispersals[String(pr.bucket_id)] = pr;
    }

    const out = [];
    for (const b of bucketsRes.rows) {
        const visibility = String(b.visibility || 'PUBLIC').toUpperCase();
        const creatorClean = normalizeKaspaBase32Strict(String(b.creator_wallet || ''));
        const isCreator = Boolean(cleanViewer && creatorClean && cleanViewer === creatorClean);
        if (visibility === 'PRIVATE' && !isCreator && !isWalletMasterAdmin(prefViewer)) {
            continue;
        }

        const bucketId = String(b.bucket_id);
        const asset = String(b.target_asset || 'USDC').toUpperCase();
        const assetSpotUsd = (await resolveBucketSpotUsd(asset)) || 1.0;
        const cyc = cycleByBucket.get(bucketId);
        const cycleId = cyc ? String(cyc.cycle_id) : `${bucketId}-CYC-1`;
        const targetKas = Math.max(1, Number(cyc?.target_kas ?? b.target_kas ?? 500));
        const miningFilledKas = Math.max(0, Number(cyc?.mining_filled_kas ?? 0));
        const manualFilledKas = Math.max(0, Number(cyc?.manual_filled_kas ?? 0));
        const filledKas = Number((miningFilledKas + manualFilledKas).toFixed(6));
        const remainingKas = Number(Math.max(0, targetKas - filledKas).toFixed(6));
        const fillPct = Number(Math.min(100, (filledKas / targetKas) * 100).toFixed(2));
        const miningSegmentPct = Number(Math.min(100, (miningFilledKas / targetKas) * 100).toFixed(2));
        const manualSegmentPct = Number(Math.min(100 - miningSegmentPct, (manualFilledKas / targetKas) * 100).toFixed(2));

        const contribs = contribsByCycle.get(cycleId) || [];
        let yourMiningKas = 0;
        let yourManualKas = 0;
        for (const c of contribs) {
            const cw = normalizeKaspaBase32Strict(String(c.contributor_wallet || ''));
            if (cleanViewer && cw === cleanViewer) {
                if (c.source_type === 'mining') yourMiningKas += Number(c.amount_kas || 0);
                else yourManualKas += Number(c.amount_kas || 0);
            }
        }
        const yourContributionKas = Number((yourMiningKas + yourManualKas).toFixed(6));
        const yourShareBps = filledKas > 0 ? Math.round((yourContributionKas / filledKas) * 10000) : 0;
        const yourSharePct = Number((yourShareBps / 100).toFixed(2));

        const netConversionRatio =
            assetSpotUsd > 0 ? (kasSpotUsd * (1 - BATCH_FEE_RATE)) / assetSpotUsd : 0;
        const estPayoutTokens = Number((yourContributionKas * netConversionRatio).toFixed(6));
        const estPayoutUsd = Number((estPayoutTokens * assetSpotUsd).toFixed(2));

        const openedMs = cyc?.opened_at ? new Date(cyc.opened_at).getTime() : Date.now() - 3600_000;
        const elapsedHrs = Math.max(0.25, (Date.now() - openedMs) / 3_600_000);
        const fillVelocityKasPerHr = filledKas > 0 ? Number((filledKas / elapsedHrs).toFixed(2)) : 0;
        const etaHrs = fillVelocityKasPerHr > 0 && remainingKas > 0 ? remainingKas / fillVelocityKasPerHr : null;
        const estEtaLabel =
            remainingKas <= 0
                ? 'Ready to Swap'
                : etaHrs === null
                  ? 'Awaiting Fill'
                  : etaHrs < 1
                    ? `~${Math.max(1, Math.round(etaHrs * 60))}m`
                    : `~${etaHrs.toFixed(1)}h`;

        const lastCycle = lastDispersedByBucket.get(bucketId);
        const userLast = userPastDispersals[bucketId] || null;

        out.push({
            bucketId,
            cycleId,
            cycleNumber: Number(cyc?.cycle_number ?? 1),
            targetAsset: asset,
            label: String(b.label || `${asset} Bucket`),
            creatorWallet: String(b.creator_wallet || ''),
            isCreator: Boolean(isCreator || isWalletMasterAdmin(prefViewer)),
            escrowAddress: String(b.escrow_address || resolveBucketEscrowAddress()),
            visibility,
            targetKas,
            miningFilledKas: Number(miningFilledKas.toFixed(4)),
            manualFilledKas: Number(manualFilledKas.toFixed(4)),
            filledKas: Number(filledKas.toFixed(4)),
            remainingKas: Number(remainingKas.toFixed(4)),
            fillPct,
            miningSegmentPct,
            manualSegmentPct,
            contributorCount: Number(cyc?.contributor_count ?? 0),
            fillVelocityKasPerHr,
            estEtaLabel,
            kasSpotUsd,
            targetSpotUsd: assetSpotUsd,
            unitRateTokensPerKas: Number(netConversionRatio.toFixed(8)),
            yourPosition: {
                yourMiningKas: Number(yourMiningKas.toFixed(4)),
                yourManualKas: Number(yourManualKas.toFixed(4)),
                yourContributionKas: Number(yourContributionKas.toFixed(4)),
                yourShareBps,
                yourSharePct,
                estPayoutTokens,
                estPayoutUsd,
                lastDispersed: userLast
                    ? {
                          cycleId: String(userLast.cycle_id),
                          contributedKas: Number(userLast.amount_kas || 0),
                          shareBps: Number(userLast.share_bps || 0),
                          dispersedAmount: Number(userLast.dispersed_amount || 0),
                          dispersedTxHash: String(userLast.dispersed_tx_hash || '')
                      }
                    : null
            },
            stats: {
                completedSwaps: Number(b.completed_swaps || 0),
                totalVolumeSettledKas: Number(Number(b.total_volume_settled_kas || 0).toFixed(2)),
                totalVolumeSettledUsd: Number(Number(b.total_volume_settled_usd || 0).toFixed(2)),
                lastDispersalRate: Number(Number(b.last_dispersal_rate || 0).toFixed(8)),
                lastDispersedTokens: Number(Number(b.last_dispersed_tokens || 0).toFixed(6)),
                lastDispersedTxHash: b.last_dispersed_tx_hash || lastCycle?.swap_tx_hash || null,
                lastDispersedAt: b.last_dispersed_at
                    ? new Date(b.last_dispersed_at).toISOString()
                    : lastCycle?.closed_at
                      ? new Date(lastCycle.closed_at).toISOString()
                      : null
            },
            participants: contribs.slice(0, 12).map((c: any) => ({
                walletShort:
                    String(c.contributor_wallet || '').slice(0, 12) +
                    '...' +
                    String(c.contributor_wallet || '').slice(-4),
                sourceType: c.source_type,
                amountKas: Number(Number(c.amount_kas || 0).toFixed(4)),
                shareBps: Number(c.share_bps || 0),
                sharePct: Number((Number(c.share_bps || 0) / 100).toFixed(2)),
                status: c.status
            }))
        });
    }
    return { kasSpotUsd, buckets: out };
}

export async function verifyManualContributionTx(params: {
    txHash: string;
    contributorWallet: string;
    amountKas: number;
    escrowAddress: string;
    isSandboxRequest: boolean;
}): Promise<{ ok: boolean; error?: string }> {
    if (String(params.txHash || '').trim().toUpperCase().startsWith('RESERVOIR:')) return { ok: true };
	const cleanHash = String(params.txHash || '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(cleanHash)) {
        return { ok: false, error: 'INVALID_TX_HASH: Sovereign L1 KAS 64-hex transaction hash required.' };
    }
    const dup = await dbPool.query(
        `SELECT 1 FROM bucket_contributions WHERE LOWER(tx_hash) = $1 AND source_type = 'manual' LIMIT 1`,
        [cleanHash]
    );
    if (dup.rows.length > 0) {
        return { ok: false, error: 'DUPLICATE_TX_HASH: This L1 transaction has already been credited to a bucket.' };
    }
    if (params.isSandboxRequest || String(env.SANDBOX_MODE || '').toLowerCase() === 'true') {
        return { ok: true };
    }
    const cleanW = normalizeKaspaBase32Strict(params.contributorWallet);
    const prefW = `kaspa:${cleanW}`;
    const localTx = await dbPool
        .query(
            `SELECT tx_id FROM pending_transactions WHERE LOWER(tx_id) = $1 AND (wallet_address = $2 OR wallet_address = $3) LIMIT 1`,
            [cleanHash, prefW, cleanW]
        )
        .catch(() => ({ rows: [] as any[] }));
    if (localTx.rows.length > 0) {
        return { ok: true };
    }
    const kaspaRest = (env.KASPA_REST_URL || 'https://api.kaspa.org').replace(/\/+$/, '');
    try {
        const res = await fetch(`${kaspaRest}/transactions/${encodeURIComponent(cleanHash)}`, {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(6000)
        });
        if (!res.ok) {
            return { ok: false, error: `L1_TX_NOT_FOUND: Transaction ${cleanHash.slice(0, 16)}... not found on Kaspa DAG.` };
        }
        const txData = await res.json();
        const outputs = Array.isArray(txData?.outputs) ? txData.outputs : [];
        const expectedEscrow = params.escrowAddress.trim().toLowerCase();
        let paidSompi = 0n;
        for (const o of outputs) {
            const addr = String(o?.script_public_key_address || o?.address || '').trim().toLowerCase();
            if (addr === expectedEscrow) paidSompi += parseSompiU64(String(o?.amount ?? '0'));
        }
        const expectedSompi = parseDecimalToAtomic(params.amountKas.toFixed(8), 8, 'floor');
        if (paidSompi < (expectedSompi * 9700n) / 10_000n) {
            return { ok: false, error: 'L1_OUTPUT_MISMATCH: Transaction output did not pay the bucket escrow address.' };
        }
        return { ok: true };
    } catch {
        return { ok: false, error: 'L1_VERIFICATION_UNAVAILABLE: Could not verify Kaspa L1 transaction.' };
    }
}

export async function recordManualBucketContribution(params: {
    bucketId: string;
    contributorWallet: string;
    requestedAmountKas: number;
    mode: 'contribute' | 'fill_remainder';
    txHash: string;
    isSandboxRequest: boolean;
}) {
    await ensureCommunityBucketsSchema();
    const cleanWallet = normalizeKaspaBase32Strict(params.contributorWallet);
    if (!cleanWallet || cleanWallet.length < 55) {
        throw new Error('INVALID_WALLET: Valid Sovereign Kaspa address required.');
    }
    const prefixedWallet = normalizeKaspaAddressStrict(cleanWallet);

    const client = await dbPool.connect();
    try {
        await client.query('BEGIN');
        const bRes = await client.query(
            `SELECT * FROM settlement_buckets WHERE bucket_id = $1 FOR UPDATE`,
            [params.bucketId]
        );
        if (bRes.rows.length === 0) {
            throw new Error(`BUCKET_NOT_FOUND: Bucket ${params.bucketId} does not exist.`);
        }
        const bucket = bRes.rows[0];
        const visibility = String(bucket.visibility || 'PUBLIC').toUpperCase();
        const creatorClean = normalizeKaspaBase32Strict(String(bucket.creator_wallet || ''));
        if (visibility === 'PRIVATE' && cleanWallet !== creatorClean && !isWalletMasterAdmin(prefixedWallet)) {
            throw new Error('FORBIDDEN_PRIVATE_BUCKET: This bucket is set to Private (Creator Miners Only).');
        }

        const cRes = await client.query(
            `SELECT * FROM bucket_cycles WHERE bucket_id = $1 AND status = 'OPEN' ORDER BY cycle_number DESC LIMIT 1 FOR UPDATE`,
            [params.bucketId]
        );
        if (cRes.rows.length === 0) {
            throw new Error('NO_OPEN_CYCLE: Bucket has no open cycle.');
        }
        const cycle = cRes.rows[0];
        const cycleId = String(cycle.cycle_id);
        const targetKas = Math.max(1, Number(cycle.target_kas || bucket.target_kas || 500));
        const currentFilled = Math.max(0, Number(cycle.total_filled_kas || 0));
        const remainingBefore = Math.max(0, Number((targetKas - currentFilled).toFixed(6)));
        if (remainingBefore <= 1e-6) {
            throw new Error('CYCLE_ALREADY_FULL: Bucket cycle is already at 100% capacity.');
        }

        const effectiveKas =
            params.mode === 'fill_remainder'
                ? remainingBefore
                : Math.min(remainingBefore, Math.max(0, Number(params.requestedAmountKas || 0)));
        if (!Number.isFinite(effectiveKas) || effectiveKas <= 0) {
            throw new Error('INVALID_AMOUNT: Contribution amount must be greater than 0 KAS.');
        }

        const txCheck = await verifyManualContributionTx({
            txHash: params.txHash,
            contributorWallet: prefixedWallet,
            amountKas: effectiveKas,
            escrowAddress: String(bucket.escrow_address || resolveBucketEscrowAddress()),
            isSandboxRequest: params.isSandboxRequest
        });
        if (!txCheck.ok) {
            throw new Error(txCheck.error || 'TX_VERIFICATION_FAILED');
        }

        await client.query(
            `INSERT INTO bucket_contributions
             (cycle_id, bucket_id, contributor_wallet, source_type, amount_kas, tx_hash, status)
             VALUES ($1, $2, $3, 'manual', $4, $5, 'held')`,
            [cycleId, params.bucketId, prefixedWallet, Number(effectiveKas.toFixed(6)), params.txHash.trim().toLowerCase()]
        );

        const totals = await recomputeCycleShares(client, cycleId);
        let cycleDispersed = false;
        let dispersalReceipt: any = null;

        if (totals.totalKas + 1e-5 >= targetKas) {
            cycleDispersed = true;
            await client.query(
                `UPDATE bucket_cycles SET status = 'SWAPPING', updated_at = CURRENT_TIMESTAMP WHERE cycle_id = $1`,
                [cycleId]
            );
            await client.query(
                `UPDATE bucket_contributions SET status = 'swapping', updated_at = CURRENT_TIMESTAMP WHERE cycle_id = $1`,
                [cycleId]
            );

            const targetAsset = String(bucket.target_asset || 'USDC').toUpperCase();
            const kasSpot = await resolveBucketSpotUsd('KAS');
            const targetSpot = await resolveBucketSpotUsd(targetAsset);
            if (!(kasSpot > 0) || !(targetSpot > 0)) {
                throw new Error(LIVE_PRICING_UNAVAILABLE_MESSAGE);
            }
            const grossUsd = totals.totalKas * kasSpot;
            const netUsd = grossUsd * (1 - BATCH_FEE_RATE);
            const totalTargetTokens = Number((netUsd / targetSpot).toFixed(8));
            const swapRate = totals.totalKas > 0 ? Number((totalTargetTokens / totals.totalKas).toFixed(8)) : 0;
            const swapTxHash = `SWAP-${targetAsset}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

            const heldRows = await client.query(
                `SELECT contribution_id, contributor_wallet, amount_kas, share_bps
                 FROM bucket_contributions
                 WHERE cycle_id = $1
                 ORDER BY contribution_id ASC`,
                [cycleId]
            );

            const participantPayouts: any[] = [];
            for (const hr of heldRows.rows) {
                const cWalletPref = normalizeKaspaAddressStrict(String(hr.contributor_wallet || ''));
                const cWalletClean = normalizeKaspaBase32Strict(cWalletPref);
                const rowKas = Number(hr.amount_kas || 0);
                const dispersedAmt = Number(((totalTargetTokens * rowKas) / totals.totalKas).toFixed(8));
                let dispTx = `${swapTxHash}-${hr.contribution_id}`;

                if (cWalletClean && dispersedAmt > 0) {
                    const l1Res = await executeOrQueueL1Dispatch({
                        wallet: cWalletPref,
                        destinationAddress: cWalletPref,
                        asset: targetAsset,
                        amount: dispersedAmt,
                        sourceType: 'community_bucket_dispersal',
                        idempotencyKey: dispTx,
                        spotPrice: targetSpot
                    }).catch(() => null);
                    if (l1Res?.txHash) dispTx = l1Res.txHash;
                }

                await client.query(
                    `UPDATE bucket_contributions
                     SET status = 'dispersed',
                         dispersed_amount = $2,
                         dispersed_tx_hash = $3,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE contribution_id = $1`,
                    [hr.contribution_id, dispersedAmt, dispTx]
                );
                if (cWalletClean && dispersedAmt > 0) { await recordBucketSettlementTaxAndHifo({ client, cleanWallet: cWalletClean, prefixedWallet: cWalletPref, disposedKas: rowKas, kasSpotUsd: kasSpot, targetAsset, acquiredTokens: dispersedAmt, targetSpotUsd: targetSpot, txHash: dispTx }); }
				participantPayouts.push({
                    wallet: cWalletPref,
                    contributedKas: rowKas,
                    shareBps: Number(hr.share_bps || 0),
                    dispersedAmount: dispersedAmt,
                    dispersedTxHash: dispTx
                });
            }

            await client.query(
                `UPDATE bucket_cycles
                 SET status = 'DISPERSED',
                     swap_rate = $2,
                     total_dispersed_tokens = $3,
                     swap_tx_hash = $4,
                     closed_at = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE cycle_id = $1`,
                [cycleId, swapRate, totalTargetTokens, swapTxHash]
            );

            await client.query(
                `UPDATE settlement_buckets
                 SET completed_swaps = completed_swaps + 1,
                     total_volume_settled_kas = total_volume_settled_kas + $2,
                     total_volume_settled_usd = total_volume_settled_usd + $3,
                     last_dispersal_rate = $4,
                     last_dispersed_tokens = $5,
                     last_dispersed_tx_hash = $6,
                     last_dispersed_at = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE bucket_id = $1`,
                [params.bucketId, totals.totalKas, Number(grossUsd.toFixed(2)), swapRate, totalTargetTokens, swapTxHash]
            );

            const nextNum = Number(cycle.cycle_number || 1) + 1;
            const nextCycleId = `${params.bucketId}-CYC-${nextNum}`;
            await client.query(
                `INSERT INTO bucket_cycles (cycle_id, bucket_id, cycle_number, target_asset, target_kas, status)
                 VALUES ($1, $2, $3, $4, $5, 'OPEN')`,
                [nextCycleId, params.bucketId, nextNum, targetAsset, targetKas]
            );

            dispersalReceipt = {
                settledCycleId: cycleId,
                nextCycleId,
                targetAsset,
                settledKas: Number(totals.totalKas.toFixed(4)),
                settledUsd: Number(grossUsd.toFixed(2)),
                totalDispersedTokens: totalTargetTokens,
                swapRate,
                swapTxHash,
                participantPayouts
            };
        }

        await client.query('COMMIT');
        await redis
            .publish(
                'telemetry:updates',
                JSON.stringify({ bucket_event: true, bucketId: params.bucketId, cycleDispersed })
            )
            .catch(() => {});

        const updatedSnapshot = await listCommunityBuckets(prefixedWallet);
        return {
            success: true,
            contributedKas: Number(effectiveKas.toFixed(6)),
            cycleId,
            cycleDispersed,
            dispersalReceipt,
            buckets: updatedSnapshot.buckets
        };
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}
