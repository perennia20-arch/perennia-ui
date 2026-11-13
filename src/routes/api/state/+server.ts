import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import {
    isWalletMasterAdmin,
    normalizeKaspaBase32Strict,
    normalizeKaspaAddressStrict
} from '$lib/server/kms';

async function isForgePubliclyUnlocked(): Promise<boolean> {
    const envFlag = String(env.FEATURE_FORGE_PUBLIC || '')
        .trim()
        .toLowerCase();
    if (envFlag === 'true' || envFlag === '1' || envFlag === 'public') {
        return true;
    }
    try {
        const redisFlag = await redis.get('feature:forge:public');
        if (redisFlag) {
            const clean = redisFlag.trim().toLowerCase();
            return (
                clean === '1' ||
                clean === 'true' ||
                clean === 'enabled' ||
                clean === 'public'
            );
        }
    } catch {
        // Ignore transient Redis error
    }
    return false;
}

async function ensureUserCommandCenterTable() {
    await dbPool.query(`
        CREATE TABLE IF NOT EXISTS user_command_centers (
            wallet_address VARCHAR(255) PRIMARY KEY,
            layout_state JSONB NOT NULL DEFAULT '{"workers":[],"sectors":[],"customTokens":[]}'::jsonb,
            last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

function resolveAutoStratumEndpoint(hashrateTh: number): string {
    if (hashrateTh > 10.0) {
        return 'stratum+tcp://pool.perennia.io:3334';
    }
    if (hashrateTh >= 1.0) {
        return 'stratum+tcp://pool.perennia.io:3333';
    }
    return 'stratum+tcp://pool.perennia.io:3332';
}

export const GET: RequestHandler = async ({ cookies, url }: RequestEvent) => {
    const sessionId = cookies.get('perennia_session');
    if (!sessionId) {
        return json({ error: 'UNAUTHORIZED_SESSION' }, { status: 401 });
    }

    const sessionWallet = await redis.get(`session:${sessionId}`);
    if (!sessionWallet) {
        return json({ error: 'SESSION_EXPIRED' }, { status: 401 });
    }

    const isDirector = isWalletMasterAdmin(sessionWallet);
    const requestedTarget = url.searchParams.get('target');
    const effectiveWalletRaw =
        isDirector && requestedTarget && requestedTarget.trim()
            ? requestedTarget.trim()
            : sessionWallet;

    const cleanWallet = normalizeKaspaBase32Strict(effectiveWalletRaw);
    const prefixedWallet = normalizeKaspaAddressStrict(effectiveWalletRaw);

    try {
        await ensureUserCommandCenterTable().catch(() => {});

        const [
            ccRes,
            workersRes,
            reservoirRes,
            epochRaw,
            diffRaw,
            rewardRaw, daaRaw, forgeUnlocked] = await Promise.all([
            dbPool
                .query(
                    `SELECT layout_state FROM user_command_centers WHERE wallet_address = $1 OR wallet_address = $2 ORDER BY last_updated DESC NULLS LAST LIMIT 1`,
                    [prefixedWallet, cleanWallet]
                )
                .catch(() => ({ rows: [] as any[] })),
            dbPool
                .query(
                    `SELECT worker_id, worker_name, hardware_model, current_hashrate, valid_shares, rejected_shares, blocks_found, last_seen
                     FROM worker_profiles
                     WHERE LOWER(REPLACE(TRIM(wallet_address), 'kaspa:', '')) = $1
                     ORDER BY last_seen DESC NULLS LAST`,
                    [cleanWallet]
                )
                .catch(() => ({ rows: [] as any[] })),
            dbPool
                .query(
                    `SELECT streaming_balance_kas, total_yield_kas, COALESCE(lp_tokens, '{}'::jsonb) AS lp_tokens
                     FROM yield_reservoirs
                     WHERE wallet_address = $1 OR wallet_address = $2
                     ORDER BY streaming_balance_kas DESC
                     LIMIT 1`,
                    [prefixedWallet, cleanWallet]
                )
                .catch(() => ({ rows: [] as any[] })),
            redis.get('perennia:settlement:epoch_telemetry').catch(() => null),
            redis.get('oracle:network_difficulty').catch(() => null),
            redis.get('oracle:block_reward').catch(() => null), redis.get('pool:virtual_daa_score').catch(() => null),
            isForgePubliclyUnlocked()
        ]);

        const savedState: Record<string, any> =
            ccRes.rows.length > 0 &&
            ccRes.rows[0].layout_state &&
            typeof ccRes.rows[0].layout_state === 'object'
                ? ccRes.rows[0].layout_state
                : {};

        let workers: any[] = Array.isArray(savedState.workers)
            ? [...savedState.workers]
            : [];
        const sectors: any[] = Array.isArray(savedState.sectors)
            ? [...savedState.sectors]
            : [];
        const customTokens: any[] = Array.isArray(savedState.customTokens)
            ? [...savedState.customTokens]
            : [];
        const systemMode = String(savedState.systemMode || 'SOVEREIGN');

        if (workersRes.rows.length > 0) {
            const dbWorkersByName = new Map<string, any>();
            for (const row of workersRes.rows) {
                const name = String(row.worker_name || 'Rig').trim();
                dbWorkersByName.set(name.toLowerCase(), row);
            }

            const seenNames = new Set<string>();
            workers = workers.map((w) => {
                const key = String(w.name || '').trim().toLowerCase();
                const dbMatch = dbWorkersByName.get(key);
                if (!dbMatch) return w;
                seenNames.add(key);
                const liveHashTh = Number(dbMatch.current_hashrate || 0) / 1e12;
                const validShares = Number(dbMatch.valid_shares || 0);
                const rejectedShares = Number(dbMatch.rejected_shares || 0);
                const totalShares = validShares + rejectedShares;
                const acceptancePct =
                    totalShares > 0
                        ? Number(((validShares / totalShares) * 100).toFixed(2))
                        : 100.0;
                const lastSeenMs = dbMatch.last_seen
                    ? new Date(dbMatch.last_seen).getTime()
                    : 0;
                const isOnline =
                    liveHashTh > 0 && Date.now() - lastSeenMs < 5 * 60 * 1000;

                return {
                    ...w,
                    hashRate: liveHashTh,
                    stratumUrl:
                        w.stratumUrl || resolveAutoStratumEndpoint(liveHashTh),
                    walletWorker: `${prefixedWallet}.${w.name || dbMatch.worker_name}`,
                    hardwareType:
                        w.hardwareType ||
                        dbMatch.hardware_model ||
                        'IceRiver KS',
                    sharesContributed: validShares,
                    validShares,
                    rejectedShares,
                    acceptancePct,
                    lastShareTimestamp: lastSeenMs || Date.now(),
                    blocksFound: Number(dbMatch.blocks_found || 0),
                    isOnline
                };
            });

            for (const [key, dbRow] of dbWorkersByName.entries()) {
                if (seenNames.has(key)) continue;
                const wName = String(dbRow.worker_name || 'Rig').trim();
                const liveHashTh = Number(dbRow.current_hashrate || 0) / 1e12;
                const validShares = Number(dbRow.valid_shares || 0);
                const rejectedShares = Number(dbRow.rejected_shares || 0);
                const totalShares = validShares + rejectedShares;
                const acceptancePct =
                    totalShares > 0
                        ? Number(((validShares / totalShares) * 100).toFixed(2))
                        : 100.0;
                const lastSeenMs = dbRow.last_seen
                    ? new Date(dbRow.last_seen).getTime()
                    : 0;

                workers.push({
                    id: String(
                        dbRow.worker_id ||
                            wName.toUpperCase().slice(0, 8)
                    ),
                    type: 'physical',
                    name: wName,
                    stratumUrl: resolveAutoStratumEndpoint(liveHashTh),
                    walletWorker: `${prefixedWallet}.${wName}`,
                    hashRate: liveHashTh,
                    isOnline:
                        liveHashTh > 0 &&
                        Date.now() - lastSeenMs < 5 * 60 * 1000,
                    hardwareType: dbRow.hardware_model || 'IceRiver KS',
                    sharesContributed: validShares,
                    validShares,
                    rejectedShares,
                    acceptancePct,
                    lastShareTimestamp: lastSeenMs || Date.now(),
                    blocksFound: Number(dbRow.blocks_found || 0)
                });
            }
        }

        const streamingBalanceKas = Number(
            reservoirRes.rows[0]?.streaming_balance_kas || 0
        );
        const totalYieldKas = Number(
            reservoirRes.rows[0]?.total_yield_kas || 0
        );

        let epochTelemetry: any = null;
        if (epochRaw) {
            try {
                epochTelemetry = JSON.parse(epochRaw);
            } catch {
                epochTelemetry = null;
            }
        }

        const networkDifficulty = diffRaw ? parseFloat(diffRaw) || 0 : 0;
        const blockRewardKas = rewardRaw ? parseFloat(rewardRaw) || 0 : 0;

        return json({
            wallet: prefixedWallet,
            isCorporateAdmin: isDirector,
            forgePublicEnabled: Boolean(forgeUnlocked || isDirector),
            systemMode,
            workers,
            sectors,
            customTokens,
            streamingBalanceKas,
            totalYieldKas,
            epochTelemetry,
            networkDifficulty: networkDifficulty > 0 ? networkDifficulty : undefined,
            blockRewardKas: blockRewardKas > 0 ? blockRewardKas : undefined, virtualDaaScore: daaRaw ? parseInt(daaRaw, 10) || 0 : 0
        });
    } catch (err: any) {
        console.error('State Hydration Error:', err);
        return json(
            { error: err?.message || 'Failed to load command center state.' },
            { status: 500 }
        );
    }
};

export const POST: RequestHandler = async ({
    request,
    cookies,
    url
}: RequestEvent) => {
    const sessionId = cookies.get('perennia_session');
    if (!sessionId) {
        return json({ error: 'UNAUTHORIZED_SESSION' }, { status: 401 });
    }

    const sessionWallet = await redis.get(`session:${sessionId}`);
    if (!sessionWallet) {
        return json({ error: 'SESSION_EXPIRED' }, { status: 401 });
    }

    const isDirector = isWalletMasterAdmin(sessionWallet);

    try {
        const body = await request.json().catch(() => ({}));
        const requestedTarget =
            url.searchParams.get('target') || body.targetWallet || '';
        const effectiveWalletRaw =
            isDirector && String(requestedTarget).trim()
                ? String(requestedTarget).trim()
                : sessionWallet;

        const cleanWallet = normalizeKaspaBase32Strict(effectiveWalletRaw);
        const prefixedWallet = normalizeKaspaAddressStrict(effectiveWalletRaw);

        await ensureUserCommandCenterTable();

        const existingRes = await dbPool.query(
            `SELECT layout_state FROM user_command_centers WHERE wallet_address = $1 OR wallet_address = $2 LIMIT 1`,
            [prefixedWallet, cleanWallet]
        );
        const prevLayout =
            existingRes.rows.length > 0 &&
            existingRes.rows[0].layout_state &&
            typeof existingRes.rows[0].layout_state === 'object'
                ? existingRes.rows[0].layout_state
                : {};

        const nextLayout = {
            ...prevLayout,
            workers: Array.isArray(body.workers)
                ? body.workers
                : prevLayout.workers || [],
            sectors: Array.isArray(body.sectors)
                ? body.sectors
                : prevLayout.sectors || [],
            customTokens: Array.isArray(body.customTokens)
                ? body.customTokens
                : prevLayout.customTokens || [],
            systemMode: String(
                body.systemMode || prevLayout.systemMode || 'SOVEREIGN'
            )
        };

        await dbPool.query(
            `INSERT INTO user_command_centers (wallet_address, layout_state, last_updated)
             VALUES ($1, $2, CURRENT_TIMESTAMP)
             ON CONFLICT (wallet_address) DO UPDATE SET
                layout_state = EXCLUDED.layout_state,
                last_updated = CURRENT_TIMESTAMP`,
            [prefixedWallet, nextLayout]
        );

        await redis
            .publish(
                'telemetry:updates',
                JSON.stringify({
                    layout_state_update: true,
                    wallet: cleanWallet,
                    state: nextLayout
                })
            )
            .catch(() => {});

        return json({
            success: true,
            wallet: prefixedWallet,
            state: nextLayout
        });
    } catch (err: any) {
        console.error('State Persistence Error:', err);
        return json(
            { error: err?.message || 'Failed to persist command center state.' },
            { status: 500 }
        );
    }
};