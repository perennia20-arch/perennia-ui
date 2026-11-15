import crypto from 'node:crypto';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';

const FALLBACK_SPOTS: Record<string, number> = {
    KAS: 0.15, USDC: 1.0, USDT: 1.0, BTC: 92000, ETH: 3200, SOL: 185, SILO: 0.0063, NVDA: 140, SPY: 590, XAU: 2680
};

function computeHmac(prefixedWallet: string, streamKas: number, totalYieldKas: number, lpTokens: Record<string, number>): string {
    const secret = process.env.LEDGER_HMAC_SECRET || 'perennia_sovereign_hmac_fallback_secret';
    const sorted = Object.keys(lpTokens || {}).sort().reduce((acc: Record<string, number>, k) => {
        acc[k] = Number(Number(lpTokens[k] || 0).toFixed(8));
        return acc;
    }, {});
    const payload = `${prefixedWallet.toLowerCase()}|${Number(streamKas || 0).toFixed(8)}|${Number(totalYieldKas || 0).toFixed(8)}|${JSON.stringify(sorted)}`;
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

async function resolveSpotUsd(ticker: string): Promise<number> {
    const t = ticker.trim().toUpperCase();
    if (t === 'USD' || t === 'USDC' || t === 'USDT') return 1.0;
    try {
        const raw = await redis.hget('perennia:oracle:spots', t) || await redis.get(`perennia:price:${t}`);
        if (raw && Number(raw) > 0) return Number(raw);
    } catch {}
    return FALLBACK_SPOTS[t] || 1.0;
}

export async function creditUserReservoirToken(
    client: any,
    cleanWallet: string,
    prefixedWallet: string,
    ticker: string,
    addTokens: number
) {
    const cleanT = ticker.trim().toUpperCase();
    await redis.hincrbyfloat(`dev:sor:treasury:balances:${cleanWallet}`, cleanT, addTokens).catch(() => {});
    const resRow = await client.query(
        `SELECT wallet_address, streaming_balance_kas, total_yield_kas, COALESCE(lp_tokens, '{}'::jsonb) AS lp_tokens
         FROM yield_reservoirs WHERE wallet_address = $1 OR wallet_address = $2 LIMIT 1`,
        [prefixedWallet, cleanWallet]
    ).catch(() => ({ rows: [] as any[] }));
    const row = resRow.rows[0];
    const pk = row?.wallet_address || prefixedWallet;
    const sKas = Number(row?.streaming_balance_kas || 0);
    const yKas = Number(row?.total_yield_kas || 0);
    const lp: Record<string, number> = { ...(row?.lp_tokens || {}) };
    lp[cleanT] = Number((Number(lp[cleanT] || 0) + addTokens).toFixed(8));
    const sig = computeHmac(prefixedWallet, sKas, yKas, lp);
    if (row) {
        await client.query(`UPDATE yield_reservoirs SET lp_tokens = $2::jsonb, hmac_signature = $3, updated_at = CURRENT_TIMESTAMP WHERE wallet_address = $1`, [pk, JSON.stringify(lp), sig]);
    } else {
        await client.query(
            `INSERT INTO yield_reservoirs (wallet_address, streaming_balance_kas, total_yield_kas, lp_tokens, hmac_signature) VALUES ($1, 0, 0, $2::jsonb, $3)
             ON CONFLICT (wallet_address) DO UPDATE SET lp_tokens = EXCLUDED.lp_tokens, hmac_signature = EXCLUDED.hmac_signature`,
            [prefixedWallet, JSON.stringify(lp), sig]
        );
    }
}

export async function executeFounderSeedAndClear(params: {
    adminWallet: string;
    asset: string;
    targetBatchUsd?: number;
}) {
    const targetAsset = String(params.asset || 'USDC').trim().toUpperCase();
    if (!targetAsset || targetAsset === 'KAS' || targetAsset === 'USD') {
        throw new Error('Seed & Clear requires a non-KAS target reserve asset.');
    }
    const kasSpotUsd = await resolveSpotUsd('KAS');
    const targetSpotUsd = await resolveSpotUsd(targetAsset);
    const requestedBatchUsd = Math.max(50, Number(params.targetBatchUsd || 500));

    const client = await dbPool.connect();
    try {
        await client.query('BEGIN');

        // 1. Discover queued miner splits for targetAsset (strictly excluding auto-lp 50/50 sectors)
        const ccRes = await client.query(`SELECT wallet_address, layout_state FROM user_command_centers FOR UPDATE`);
        const pendingMiners: Array<{ rawWallet: string; cleanWallet: string; prefixedWallet: string; kasAmt: number; layout: any }> = [];
        let userQueuedKas = 0;

        for (const r of ccRes.rows) {
            const rawW = String(r.wallet_address || '');
            const cleanW = rawW.toLowerCase().replace(/^kaspa:/, '').trim();
            if (!cleanW) continue;
            const layout = r.layout_state || { workers: [], sectors: [] };
            const sectors: any[] = Array.isArray(layout.sectors) ? layout.sectors : [];
            let wKas = 0;
            for (const sec of sectors) {
                const p = Math.max(0, Number(sec?.pendingKaspa || 0));
                const mode = String(sec?.routeMode || 'hold').toLowerCase();
                const tick = String(sec?.settlementConfig?.targetAsset?.ticker || '').trim().toUpperCase();
                if (p > 0 && mode !== 'auto-lp' && tick === targetAsset) {
                    wKas += p;
                    sec.pendingKaspa = 0;
                }
            }
            if (wKas > 0) {
                userQueuedKas += wKas;
                pendingMiners.push({ rawWallet: rawW, cleanWallet: cleanW, prefixedWallet: `kaspa:${cleanW}`, kasAmt: wKas, layout });
            }
        }

        // 2. Compute 0.5F + U Pre-Auto-Balancer Math
        const userQueuedUsd = Number((userQueuedKas * kasSpotUsd).toFixed(4));
        const effectiveBatchUsd = Math.max(requestedBatchUsd, userQueuedUsd + 50);
        const founderFillUsd = Number((effectiveBatchUsd - userQueuedUsd).toFixed(4));
        const externalWholesaleSwapUsd = Number((0.5 * founderFillUsd + userQueuedUsd).toFixed(4));
        const internallyNettedKasUsd = Number((0.5 * founderFillUsd).toFixed(4));

        const fixedBridgeUsd = targetAsset === 'BTC' ? 1.902 : ['ETH', 'USDC', 'USDT'].includes(targetAsset) ? 0.752 : 0.172;
        const bridgeCostUsd = Math.min(externalWholesaleSwapUsd * 0.15, fixedBridgeUsd + externalWholesaleSwapUsd * 0.0035);
        const wholesaleTargetUsdOut = Math.max(0, externalWholesaleSwapUsd - bridgeCostUsd);

        // 3. Clear queued miners internally at 0.10% wholesale floor against pre-skewed inventory
        let userPayoutUsdTotal = 0;
        let userFeeCapturedUsd = 0;
        for (const m of pendingMiners) {
            const gUsd = m.kasAmt * kasSpotUsd;
            const fUsd = Math.max(0.01, gUsd * 0.001);
            const nUsd = Math.max(0, gUsd - fUsd);
            const outTokens = Number((nUsd / targetSpotUsd).toFixed(8));
            userPayoutUsdTotal += nUsd;
            userFeeCapturedUsd += fUsd;
            await client.query(`UPDATE user_command_centers SET layout_state = $2, last_updated = CURRENT_TIMESTAMP WHERE wallet_address = $1`, [m.rawWallet, JSON.stringify(m.layout)]);
            if (outTokens > 0) {
                await creditUserReservoirToken(client, m.cleanWallet, m.prefixedWallet, targetAsset, outTokens);
            }
        }

        // 4. Land remaining inventory as balanced 50/50 Founder Dark Pool LP position
        const lpEndingKasUsd = internallyNettedKasUsd;
        const lpEndingTargetUsd = Math.max(0, wholesaleTargetUsdOut - userPayoutUsdTotal);
        const lpEndingTvlUsd = Number((lpEndingKasUsd + lpEndingTargetUsd).toFixed(2));
        const lpKasAmount = Number((lpEndingKasUsd / kasSpotUsd).toFixed(6));
        const lpTargetAmount = Number((lpEndingTargetUsd / targetSpotUsd).toFixed(8));

        const cleanAdmin = String(params.adminWallet || '').toLowerCase().replace(/^kaspa:/, '').trim();
        const prefAdmin = `kaspa:${cleanAdmin}`;
        const lpId = `LP-SEED-${targetAsset}-${Date.now().toString(36).toUpperCase()}`;

        await client.query(`
            CREATE TABLE IF NOT EXISTS liquidity_providers (
                lp_id TEXT PRIMARY KEY,
                wallet_address TEXT NOT NULL,
                pool_pair TEXT NOT NULL,
                staked_asset_a DOUBLE PRECISION DEFAULT 0,
                staked_asset_b DOUBLE PRECISION DEFAULT 0,
                weights JSONB DEFAULT '{}'::jsonb,
                reserves JSONB DEFAULT '{}'::jsonb,
                lock_duration_days INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);
        const colsRes = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'liquidity_providers'`);
        const colSet = new Set(colsRes.rows.map((x: any) => String(x.column_name)));
        const insertCols: string[] = [];
        const insertVals: any[] = [];
        const pushCol = (c: string, v: any) => { if (colSet.has(c)) { insertCols.push(c); insertVals.push(v); } };

        pushCol('lp_id', lpId);
        pushCol('wallet_address', prefAdmin);
        pushCol('pool_pair', `KAS/${targetAsset}`);
        pushCol('staked_asset_a', lpKasAmount);
        pushCol('staked_asset_b', lpTargetAmount);
        pushCol('kas_amount', lpKasAmount);
        pushCol('token_amount', lpTargetAmount);
        pushCol('usd_value', lpEndingTvlUsd);
        pushCol('weighted_tvl', lpEndingTvlUsd);
        pushCol('lock_duration_days', 0);
        pushCol('weights', JSON.stringify({ KAS: 0.5, [targetAsset]: 0.5 }));
        pushCol('reserves', JSON.stringify({ KAS: lpKasAmount, [targetAsset]: lpTargetAmount }));

        if (insertCols.length >= 3) {
            const ph = insertCols.map((_, i) => `$${i + 1}`).join(', ');
            await client.query(`INSERT INTO liquidity_providers (${insertCols.join(', ')}) VALUES (${ph})`, insertVals);
        }

        await redis.incrbyfloat('perennia:treasury:dark_pool_lp_vault_usd', lpEndingTvlUsd).catch(() => {});
        await client.query('COMMIT');

        const kasWt = lpEndingTvlUsd > 0 ? Number(((lpEndingKasUsd / lpEndingTvlUsd) * 100).toFixed(1)) : 50.0;
        return {
            success: true,
            lpId,
            asset: targetAsset,
            autoAdminLpMode: '50_50_LOCKED',
            manualSeedFormula: '0.5F + U',
            clearedMinersCount: pendingMiners.length,
            userQueuedUsd: Number(userQueuedUsd.toFixed(2)),
            founderFillUsd: Number(founderFillUsd.toFixed(2)),
            externalWholesaleSwapUsd: Number(externalWholesaleSwapUsd.toFixed(2)),
            internallyNettedKasUsd: Number(internallyNettedKasUsd.toFixed(2)),
            userFeeCapturedUsd: Number(userFeeCapturedUsd.toFixed(2)),
            lpEndingKasUsd: Number(lpEndingKasUsd.toFixed(2)),
            lpEndingTargetUsd: Number(lpEndingTargetUsd.toFixed(2)),
            lpEndingTvlUsd,
            lpWeightsPct: { KAS: kasWt, [targetAsset]: Number((100 - kasWt).toFixed(1)) }
        };
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}