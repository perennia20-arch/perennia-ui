import crypto from 'node:crypto';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { computeReservoirHmac } from '$lib/server/l1Dispatcher';
import { normalizeKaspaAddressStrict, normalizeKaspaBase32Strict } from '$lib/server/kms';

const FALLBACK_SPOTS: Record<string, number> = {
KAS: 0.15, USDC: 1.0, USDT: 1.0, BTC: 92000, ETH: 3200, SOL: 185, SILO: 0.0063, NVDA: 140, SPY: 590, XAU: 2680
};

export async function resolveSpotUsd(ticker: string): Promise<number> {
const t = ticker.trim().toUpperCase();
if (t === 'USD' || t === 'USDC' || t === 'USDT') return 1.0;
try {
const raw = (await redis.get(`oracle:spot:${t}_USDC`).catch(() => null)) ||
(await redis.hget('perennia:oracle:spots', t).catch(() => null)) ||
(await redis.get(`perennia:price:${t}`).catch(() => null));
if (raw && Number(raw) > 0) return Number(raw);
} catch {}
try {
const dbRes = await dbPool.query(`SELECT price_usd FROM rwa_oracle_feeds WHERE ticker=$1 AND price_usd>0 ORDER BY updated_at DESC LIMIT 1`, [t]);
if (dbRes.rows[0]?.price_usd > 0) return Number(dbRes.rows[0].price_usd);
} catch {}
if (t === 'SILO') {
const kas = await resolveSpotUsd('KAS');
if (kas > 0) return Number((kas / 23.809524).toFixed(6));
}
return FALLBACK_SPOTS[t] || 1.0;
}

export async function recordBucketSettlementTaxAndHifo(params: {
client: any; cleanWallet: string; prefixedWallet: string; disposedKas: number;
kasSpotUsd: number; targetAsset: string; acquiredTokens: number; targetSpotUsd: number; txHash: string;
}) {
const grossUsd = Number((params.disposedKas * params.kasSpotUsd).toFixed(4));
const cleanTarget = params.targetAsset.trim().toUpperCase();
let matchedBasisUsd = 0;
let remKas = Math.max(0, Number(params.disposedKas || 0));

if (remKas > 0) {
const openLots = await params.client.query(
`SELECT lot_id, acquired_at, remaining_tokens, fmv_usd_per_token FROM hifo_tax_lots
 WHERE (wallet_address=$1 OR wallet_address=$2) AND asset_ticker='KAS' AND status='OPEN' AND remaining_tokens > 1e-8
 ORDER BY fmv_usd_per_token DESC, acquired_at ASC FOR UPDATE`,
[params.prefixedWallet, params.cleanWallet]
).catch(() => ({ rows: [] as any[] }));

for (const lot of openLots.rows) {
if (remKas <= 1e-8) break;
const avail = Number(lot.remaining_tokens || 0);
const fmv = Number(lot.fmv_usd_per_token || params.kasSpotUsd);
const used = Math.min(remKas, avail);
const left = Math.max(0, Number((avail - used).toFixed(8)));
const basis = Number((used * fmv).toFixed(4));
const proc = Number((used * params.kasSpotUsd).toFixed(4));
const holdDays = Math.max(0, Math.floor((Date.now() - new Date(lot.acquired_at).getTime()) / 86400000));
matchedBasisUsd += basis;
remKas = Number((remKas - used).toFixed(8));

await params.client.query(
`UPDATE hifo_tax_lots SET remaining_tokens=$2, remaining_sompi=$3, status=$4 WHERE lot_id=$1`,
[lot.lot_id, left, Math.round(left * 1e8), left <= 1e-8 ? 'DEPLETED' : 'OPEN']
).catch(() => {});
await params.client.query(
`INSERT INTO hifo_disposal_matches (wallet_address,lot_id,asset_ticker,disposed_sompi,disposed_tokens,acquired_at,disposed_at,holding_period_days,is_long_term,cost_basis_usd,gross_proceeds_usd,realized_gain_loss_usd,disposal_tx_hash)
 VALUES ($1,$2,'KAS',$3,$4,$5,CURRENT_TIMESTAMP,$6,$7,$8,$9,$10,$11)`,
[params.prefixedWallet, lot.lot_id, Math.round(used * 1e8), used, lot.acquired_at, holdDays, holdDays > 365, basis, proc, Number((proc - basis).toFixed(4)), `${params.txHash}-KAS`]
).catch(() => {});
}
if (remKas > 1e-8) matchedBasisUsd += Number((remKas * params.kasSpotUsd).toFixed(4));
const gainLoss = Number((grossUsd - matchedBasisUsd).toFixed(4));
await params.client.query(
`INSERT INTO tax_ledger_events (wallet_address,asset_ticker,event_type,gross_proceeds_usd,amount_tokens,spot_price_at_execution,tx_hash,payout_address,cost_basis_usd,realized_gain_loss_usd,holding_period)
 VALUES ($1,'KAS','DEX_SWAP',$2,$3,$4,$5,$1,$6,$7,'SHORT_TERM')`,
[params.prefixedWallet, grossUsd, params.disposedKas, params.kasSpotUsd, `${params.txHash}-KAS`, Number(matchedBasisUsd.toFixed(4)), gainLoss]
).catch(() => {});
}

if (params.acquiredTokens > 0) {
const sompiEq = Math.max(0, Math.round(params.acquiredTokens * 1e8));
await params.client.query(
`INSERT INTO tax_ledger_events (wallet_address,asset_ticker,event_type,gross_proceeds_usd,amount_tokens,spot_price_at_execution,tx_hash,payout_address,cost_basis_usd,realized_gain_loss_usd,holding_period)
 VALUES ($1,$2,'YIELD',$3,$4,$5,$6,$1,$3,0.0,'SHORT_TERM')`,
[params.prefixedWallet, cleanTarget, grossUsd, params.acquiredTokens, params.targetSpotUsd, params.txHash]
).catch(() => {});
await params.client.query(
`INSERT INTO hifo_tax_lots (wallet_address,asset_ticker,acquired_at,kas_sompi,initial_tokens,remaining_sompi,remaining_tokens,fmv_usd_per_token,total_cost_basis_usd,source_event_type,source_tx_hash,status)
 VALUES ($1,$2,CURRENT_TIMESTAMP,$3,$4,$3,$4,$5,$6,'BUCKET_SETTLEMENT',$7,'OPEN')`,
[params.prefixedWallet, cleanTarget, sompiEq, params.acquiredTokens, params.targetSpotUsd, grossUsd, params.txHash]
).catch(() => {});
}
}
export async function creditUserReservoirToken(
client: any, cleanWallet: string, prefixedWallet: string, ticker: string, addTokens: number
) {
const cleanT = ticker.trim().toUpperCase();
const normClean = normalizeKaspaBase32Strict(cleanWallet || prefixedWallet);
const normPref = normalizeKaspaAddressStrict(normClean);
await redis.hincrbyfloat(`dev:sor:treasury:balances:${normClean}`, cleanT, addTokens).catch(() => {});
const resRow = await client.query(
`SELECT wallet_address, streaming_balance_kas, total_yield_kas, COALESCE(lp_tokens, '{}'::jsonb) AS lp_tokens
 FROM yield_reservoirs WHERE wallet_address=$1 OR wallet_address=$2 LIMIT 1`,
[normPref, normClean]
).catch(() => ({ rows: [] as any[] }));
const row = resRow.rows[0];
const pk = row?.wallet_address || normPref;
const sKas = Number(row?.streaming_balance_kas || 0);
const yKas = Number(row?.total_yield_kas || 0);
const lp: Record<string, number> = { ...(row?.lp_tokens || {}) };
lp[cleanT] = Number((Number(lp[cleanT] || 0) + addTokens).toFixed(8));
const sig = computeReservoirHmac(normPref, sKas, yKas, lp);
await client.query(
`INSERT INTO yield_reservoirs (wallet_address,streaming_balance_kas,total_yield_kas,lp_tokens,row_hmac_sig,last_updated)
 VALUES ($1,$2,$3,$4::jsonb,$5,CURRENT_TIMESTAMP)
 ON CONFLICT (wallet_address) DO UPDATE SET lp_tokens=EXCLUDED.lp_tokens, row_hmac_sig=EXCLUDED.row_hmac_sig, last_updated=CURRENT_TIMESTAMP`,
[pk, sKas, yKas, JSON.stringify(lp), sig]
);
}

export async function executeFounderSeedAndClear(params: { adminWallet: string; asset: string; targetBatchUsd?: number }) {
const targetAsset = String(params.asset || 'USDC').trim().toUpperCase();
if (!targetAsset || targetAsset === 'KAS' || targetAsset === 'USD') {
throw new Error('Seed & Clear requires a non-KAS target reserve asset.');
}
const kasSpotUsd = await resolveSpotUsd('KAS');
const targetSpotUsd = await resolveSpotUsd(targetAsset);
const requestedBatchUsd = Math.max(10, Number(params.targetBatchUsd || 50));
const client = await dbPool.connect();
try {
await client.query('BEGIN');
const ccRes = await client.query(`SELECT wallet_address, layout_state FROM user_command_centers FOR UPDATE`);
const pendingMiners: Array<{ rawWallet: string; cleanWallet: string; prefixedWallet: string; kasAmt: number; layout: any }> = [];
let userQueuedKas = 0;
for (const r of ccRes.rows) {
const rawW = String(r.wallet_address || ''), cleanW = normalizeKaspaBase32Strict(rawW);
if (!cleanW) continue;
const layout = r.layout_state || { workers: [], sectors: [] };
let wKas = 0;
for (const sec of Array.isArray(layout.sectors) ? layout.sectors : []) {
const p = Math.max(0, Number(sec?.pendingKaspa || 0));
const mode = String(sec?.routeMode || 'hold').toLowerCase();
const tick = String(sec?.settlementConfig?.targetAsset?.ticker || '').trim().toUpperCase();
if (p > 0 && mode !== 'auto-lp' && tick === targetAsset) { wKas += p; sec.pendingKaspa = 0; }
}
if (wKas > 0) { userQueuedKas += wKas; pendingMiners.push({ rawWallet: rawW, cleanWallet: cleanW, prefixedWallet: `kaspa:${cleanW}`, kasAmt: wKas, layout }); }
}

const openCycleRows = await client.query(
`SELECT cycle_id, bucket_id, cycle_number, target_kas FROM bucket_cycles WHERE UPPER(target_asset)=$1 AND status='OPEN' AND total_filled_kas > 0 FOR UPDATE`,
[targetAsset]
).catch(() => ({ rows: [] as any[] }));
const openBuckets: any[] = [];
for (const cyc of openCycleRows.rows) {
const cRows = await client.query(`SELECT contribution_id, contributor_wallet, amount_kas FROM bucket_contributions WHERE cycle_id=$1 AND status='held' ORDER BY contribution_id ASC FOR UPDATE`, [cyc.cycle_id]);
let cycKas = 0;
const mapped: any[] = [];
for (const cr of cRows.rows) {
const amt = Math.max(0, Number(cr.amount_kas || 0)), cw = normalizeKaspaBase32Strict(String(cr.contributor_wallet || ''));
if (amt > 0 && cw) { cycKas += amt; mapped.push({ id: Number(cr.contribution_id), cleanWallet: cw, prefixedWallet: `kaspa:${cw}`, amountKas: amt }); }
}
if (cycKas > 0) { userQueuedKas += cycKas; openBuckets.push({ cycleId: String(cyc.cycle_id), bucketId: String(cyc.bucket_id), cycleNumber: Number(cyc.cycle_number || 1), targetKas: Number(cyc.target_kas || 500), cycleTotalKas: cycKas, contributions: mapped }); }
}

const userQueuedUsd = Number((userQueuedKas * kasSpotUsd).toFixed(4));
const effectiveBatchUsd = Math.max(requestedBatchUsd, userQueuedUsd + 15);
const founderFillUsd = Number((effectiveBatchUsd - userQueuedUsd).toFixed(4));
const externalWholesaleSwapUsd = Number((0.5 * founderFillUsd + userQueuedUsd).toFixed(4));
const internallyNettedKasUsd = Number((0.5 * founderFillUsd).toFixed(4));
const fixedBridgeUsd = targetAsset === 'BTC' ? 1.902 : ['ETH', 'USDC', 'USDT'].includes(targetAsset) ? 0.752 : 0.172;
const bridgeCostUsd = Math.min(externalWholesaleSwapUsd * 0.15, fixedBridgeUsd + externalWholesaleSwapUsd * 0.0035);
const wholesaleTargetUsdOut = Math.max(0, externalWholesaleSwapUsd - bridgeCostUsd);

let userPayoutUsdTotal = 0, userFeeCapturedUsd = 0;
const batchTxPrefix = `SEED-${targetAsset}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

for (const m of pendingMiners) {
const gUsd = m.kasAmt * kasSpotUsd, fUsd = Math.max(0.01, gUsd * 0.001), nUsd = Math.max(0, gUsd - fUsd);
const outTokens = Number((nUsd / targetSpotUsd).toFixed(8));
userPayoutUsdTotal += nUsd; userFeeCapturedUsd += fUsd;
await client.query(`UPDATE user_command_centers SET layout_state=$2, last_updated=CURRENT_TIMESTAMP WHERE wallet_address=$1`, [m.rawWallet, JSON.stringify(m.layout)]);
if (outTokens > 0) {
await creditUserReservoirToken(client, m.cleanWallet, m.prefixedWallet, targetAsset, outTokens);
await recordBucketSettlementTaxAndHifo({ client, cleanWallet: m.cleanWallet, prefixedWallet: m.prefixedWallet, disposedKas: m.kasAmt, kasSpotUsd, targetAsset, acquiredTokens: outTokens, targetSpotUsd, txHash: `${batchTxPrefix}-${m.cleanWallet.slice(-6).toUpperCase()}` });
}
}

for (const bc of openBuckets) {
const cycGrossUsd = bc.cycleTotalKas * kasSpotUsd, cycFeeUsd = cycGrossUsd * 0.0025, cycNetUsd = Math.max(0, cycGrossUsd - cycFeeUsd);
const cycTotalTokens = Number((cycNetUsd / targetSpotUsd).toFixed(8));
const cycSwapRate = bc.cycleTotalKas > 0 ? Number((cycTotalTokens / bc.cycleTotalKas).toFixed(8)) : 0;
const cycSwapTx = `${batchTxPrefix}-${bc.bucketId}`;
userPayoutUsdTotal += cycNetUsd; userFeeCapturedUsd += cycFeeUsd;
for (const c of bc.contributions) {
const dispersedAmt = Number(((cycTotalTokens * c.amountKas) / bc.cycleTotalKas).toFixed(8));
const dispTx = `${cycSwapTx}-${c.id}`;
await client.query(`UPDATE bucket_contributions SET status='dispersed', dispersed_amount=$2, dispersed_tx_hash=$3, updated_at=CURRENT_TIMESTAMP WHERE contribution_id=$1`, [c.id, dispersedAmt, dispTx]);
if (dispersedAmt > 0) {
await creditUserReservoirToken(client, c.cleanWallet, c.prefixedWallet, targetAsset, dispersedAmt);
await recordBucketSettlementTaxAndHifo({ client, cleanWallet: c.cleanWallet, prefixedWallet: c.prefixedWallet, disposedKas: c.amountKas, kasSpotUsd, targetAsset, acquiredTokens: dispersedAmt, targetSpotUsd, txHash: dispTx });
}
}
await client.query(`UPDATE bucket_cycles SET status='DISPERSED', swap_rate=$2, total_dispersed_tokens=$3, swap_tx_hash=$4, closed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE cycle_id=$1`, [bc.cycleId, cycSwapRate, cycTotalTokens, cycSwapTx]);
await client.query(`UPDATE settlement_buckets SET completed_swaps=completed_swaps+1, total_volume_settled_kas=total_volume_settled_kas+$2, total_volume_settled_usd=total_volume_settled_usd+$3, last_dispersal_rate=$4, last_dispersed_tokens=$5, last_dispersed_tx_hash=$6, last_dispersed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE bucket_id=$1`, [bc.bucketId, bc.cycleTotalKas, Number(cycGrossUsd.toFixed(2)), cycSwapRate, cycTotalTokens, cycSwapTx]);
await client.query(`INSERT INTO bucket_cycles (cycle_id,bucket_id,cycle_number,target_asset,target_kas,status) VALUES ($1,$2,$3,$4,$5,'OPEN') ON CONFLICT (cycle_id) DO NOTHING`, [`${bc.bucketId}-CYC-${bc.cycleNumber + 1}`, bc.bucketId, bc.cycleNumber + 1, targetAsset, bc.targetKas]);
}

const lpEndingKasUsd = internallyNettedKasUsd;
const lpEndingTargetUsd = Math.max(0, wholesaleTargetUsdOut - userPayoutUsdTotal);
const lpEndingTvlUsd = Number((lpEndingKasUsd + lpEndingTargetUsd).toFixed(2));
const lpKasAmount = Number((lpEndingKasUsd / kasSpotUsd).toFixed(6));
const lpTargetAmount = Number((lpEndingTargetUsd / targetSpotUsd).toFixed(8));
const prefAdmin = normalizeKaspaAddressStrict(normalizeKaspaBase32Strict(params.adminWallet || ''));
const lpUuid = crypto.randomUUID();

const colsRes = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='liquidity_providers'`);
const colSet = new Set(colsRes.rows.map((x: any) => String(x.column_name)));
const ic: string[] = [], iv: any[] = [];
const push = (c: string, v: any) => { if (colSet.has(c)) { ic.push(c); iv.push(v); } };
push('lp_id', lpUuid); push('wallet_address', prefAdmin); push('pool_pair', `KAS/${targetAsset}`);
push('staked_asset_a', lpKasAmount); push('staked_asset_b', lpTargetAmount); push('lock_duration_days', 0);
push('weights_json', JSON.stringify({ KAS: 0.5, [targetAsset]: 0.5 }));
push('reserves_json', JSON.stringify({ KAS: lpKasAmount, [targetAsset]: lpTargetAmount }));
if (ic.length >= 3) await client.query(`INSERT INTO liquidity_providers (${ic.join(',')}) VALUES (${ic.map((_, i) => `$${i + 1}`).join(',')})`, iv);

await redis.incrbyfloat('perennia:treasury:dark_pool_lp_vault_usd', lpEndingTvlUsd).catch(() => {});
await client.query('COMMIT');
await redis.publish('telemetry:updates', JSON.stringify({ bucket_event: true, asset: targetAsset, cycleDispersed: true })).catch(() => {});
const kasWt = lpEndingTvlUsd > 0 ? Number(((lpEndingKasUsd / lpEndingTvlUsd) * 100).toFixed(1)) : 50.0;
return {
success: true, lpId: lpUuid, asset: targetAsset, autoAdminLpMode: '50_50_LOCKED', manualSeedFormula: '0.5F + U',
clearedMinersCount: pendingMiners.length + openBuckets.reduce((a, b) => a + b.contributions.length, 0),
userQueuedUsd: Number(userQueuedUsd.toFixed(2)), founderFillUsd: Number(founderFillUsd.toFixed(2)),
externalWholesaleSwapUsd: Number(externalWholesaleSwapUsd.toFixed(2)), internallyNettedKasUsd: Number(internallyNettedKasUsd.toFixed(2)),
userFeeCapturedUsd: Number(userFeeCapturedUsd.toFixed(2)), lpEndingKasUsd: Number(lpEndingKasUsd.toFixed(2)),
lpEndingTargetUsd: Number(lpEndingTargetUsd.toFixed(2)), lpEndingTvlUsd,
lpWeightsPct: { KAS: kasWt, [targetAsset]: Number((100 - kasWt).toFixed(1)) }
};
} catch (err) {
await client.query('ROLLBACK').catch(() => {});
throw err;
} finally {
client.release();
}
}