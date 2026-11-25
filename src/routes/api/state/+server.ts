import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import {
    isWalletMasterAdmin,
    normalizeKaspaBase32Strict,
    normalizeKaspaAddressStrict
} from '$lib/server/kms';
import {
    KAS_DECIMALS,
    LIVE_PRICING_UNAVAILABLE_MESSAGE,
    ORACLE_E8_DECIMALS,
    normalizeAllocationBps,
    parseDecimalToAtomic,
    type EpochPayoutOutboxItem,
    type MatureAccrualSnapshot,
    type SolvencyProofSnapshot,
    type ThermostatValveRecord,
    type U128Str,
    type VaultLockRecord
} from '$lib/crypto/atomicMath';

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

function normalizeSectorAllocations(rawSectors: unknown[]): Array<Record<string, unknown>> {
    return rawSectors.map((item) => {
        if (!item || typeof item !== 'object') return {};
        const sector = item as Record<string, unknown>;
        let allocationBps = 0;
        try {
            allocationBps = normalizeAllocationBps({
                allocationBps: sector.allocationBps,
                allocationPercentage: sector.allocationPercentage
            });
        } catch {
            allocationBps = 0;
        }
        return {
            ...sector,
            allocationBps,
            /** @deprecated Batch 3 UI shim; use `allocationBps` (`0..=10_000`). */
            allocationPercentage: Math.round(allocationBps / 100)
        };
    });
}

async function callUpstreamStateAction(
    rustBackendUrl: string,
    internalToken: string,
    prefixedWallet: string,
    action: string,
    payload: Record<string, unknown> = {}
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json'
        };
        if (internalToken) {
            headers.Authorization = `Bearer ${internalToken}`;
        }
        const res = await fetch(`${rustBackendUrl.replace(/\/+$/, '')}/v1/state/action`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                wallet: prefixedWallet,
                action,
                payload
            }),
            signal: AbortSignal.timeout(3500)
        });
        const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
        return {
            ok: res.ok && Boolean(body?.success),
            status: res.status,
            data:
                body?.data && typeof body.data === 'object'
                    ? (body.data as Record<string, unknown>)
                    : null
        };
    } catch {
        return { ok: false, status: 503, data: null };
    }
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

    const rustBackendUrl =
        env.RUST_BACKEND_URL ||
        `http://${env.UBUNTU_NODE_IP || '127.0.0.1'}:8002`;
    const internalToken = String(
        env.INTERNAL_ADMIN_TOKEN || env.PERENNIA_ADMIN_KEY || ''
    )
        .trim()
        .replace(/^['"]|['"]$/g, '');

    try {
        await ensureUserCommandCenterTable().catch(() => {});

        const [
            ccRes,
            workersRes,
            epochRaw,
            diffRaw,
            rewardRaw,
            daaRaw,
            kasSpotRaw,
            forgeUnlocked,
            accrualRes,
            vaultLocksRes,
            valvesRes,
            solvencyRes
        ] = await Promise.all([
            dbPool
                .query(
                    `SELECT layout_state FROM user_command_centers WHERE wallet_address = $1 OR wallet_address = $2 ORDER BY last_updated DESC NULLS LAST LIMIT 1`,
                    [prefixedWallet, cleanWallet]
                )
                .catch(() => ({ rows: [] as Record<string, unknown>[] })),
            dbPool
                .query(
                    `SELECT worker_id, worker_name, hardware_model, current_hashrate, valid_shares, rejected_shares, blocks_found, last_seen
                     FROM worker_profiles
                     WHERE LOWER(REPLACE(TRIM(wallet_address), 'kaspa:', '')) = $1
                     ORDER BY last_seen DESC NULLS LAST`,
                    [cleanWallet]
                )
                .catch(() => ({ rows: [] as Record<string, unknown>[] })),
            redis.get('perennia:settlement:epoch_telemetry').catch(() => null),
            redis.get('oracle:network_difficulty').catch(() => null),
            redis.get('oracle:block_reward').catch(() => null),
            redis.get('pool:virtual_daa_score').catch(() => null),
            redis.get('oracle:spot:KAS_USDC').catch(() => null),
            isForgePubliclyUnlocked(),
            callUpstreamStateAction(
                rustBackendUrl,
                internalToken,
                prefixedWallet,
                'GET_MATURE_ACCRUAL_AND_OUTBOX'
            ),
            callUpstreamStateAction(
                rustBackendUrl,
                internalToken,
                prefixedWallet,
                'GET_VAULT_LOCKS'
            ),
            callUpstreamStateAction(
                rustBackendUrl,
                internalToken,
                prefixedWallet,
                'GET_THERMOSTAT_VALVES'
            ),
            callUpstreamStateAction(
                rustBackendUrl,
                internalToken,
                prefixedWallet,
                'GET_SOLVENCY_PROOF'
            )
        ]);

        const savedState: Record<string, unknown> =
            ccRes.rows.length > 0 &&
            ccRes.rows[0].layout_state &&
            typeof ccRes.rows[0].layout_state === 'object'
                ? (ccRes.rows[0].layout_state as Record<string, unknown>)
                : {};

        let workers: Array<Record<string, unknown>> = Array.isArray(savedState.workers)
            ? [...(savedState.workers as Array<Record<string, unknown>>)]
            : [];
        const sectors = normalizeSectorAllocations(
            Array.isArray(savedState.sectors) ? savedState.sectors : []
        );
        const customTokens: unknown[] = Array.isArray(savedState.customTokens)
            ? [...savedState.customTokens]
            : [];
        const systemMode = String(savedState.systemMode || 'SOVEREIGN');

        if (workersRes.rows.length > 0) {
            const dbWorkersByName = new Map<string, Record<string, unknown>>();
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
                    ? new Date(String(dbMatch.last_seen)).getTime()
                    : 0;
                const isOnline =
                    liveHashTh > 0 && Date.now() - lastSeenMs < 5 * 60 * 1000;

                return {
                    ...w,
                    hashRate: liveHashTh,
                    stratumUrl:
                        w.stratumUrl || resolveAutoStratumEndpoint(liveHashTh),
                    walletWorker: `${prefixedWallet}.${String(w.name || dbMatch.worker_name)}`,
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
                    ? new Date(String(dbRow.last_seen)).getTime()
                    : 0;

                workers.push({
                    id: String(
                        dbRow.worker_id || wName.toUpperCase().slice(0, 8)
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

        let epochTelemetry: unknown = null;
        if (epochRaw) {
            try {
                epochTelemetry = JSON.parse(epochRaw);
            } catch {
                epochTelemetry = null;
            }
        }

        let kasOracleUsdE8: U128Str | null = null;
        if (kasSpotRaw) {
            try {
                const parsedE8 = parseDecimalToAtomic(kasSpotRaw.trim(), ORACLE_E8_DECIMALS, 'floor');
                if (parsedE8 > 0n) {
                    kasOracleUsdE8 = parsedE8.toString();
                }
            } catch {
                kasOracleUsdE8 = null;
            }
        }

        let blockRewardSompi: U128Str | undefined;
        let blockRewardKasLegacy: number | undefined;
        if (rewardRaw) {
            try {
                const rewardSompi = parseDecimalToAtomic(rewardRaw.trim(), KAS_DECIMALS, 'floor');
                if (rewardSompi > 0n) {
                    blockRewardSompi = rewardSompi.toString();
                    blockRewardKasLegacy = Number(rewardRaw.trim()) || undefined;
                }
            } catch {
                blockRewardSompi = undefined;
            }
        }

        const networkDifficulty = diffRaw ? Number(diffRaw) || 0 : 0;
        const engineOnline =
            accrualRes.ok || vaultLocksRes.ok || valvesRes.ok || solvencyRes.ok;
        const oracleOnline =
            kasOracleUsdE8 !== null &&
            accrualRes.status !== 503 &&
            solvencyRes.status !== 503;

        const matureAccrual = (accrualRes.data?.accrual ?? null) as MatureAccrualSnapshot | null;
        const payoutOutbox = Array.isArray(accrualRes.data?.outbox)
            ? (accrualRes.data.outbox as EpochPayoutOutboxItem[])
            : [];
        const vaultLocks = Array.isArray(vaultLocksRes.data?.vaults)
            ? (vaultLocksRes.data.vaults as VaultLockRecord[])
            : [];
        const thermostatValves = Array.isArray(valvesRes.data?.valves)
            ? (valvesRes.data.valves as ThermostatValveRecord[])
            : [];
        const solvencyProof = (solvencyRes.data ?? null) as SolvencyProofSnapshot | null;

        return json({
            wallet: prefixedWallet,
            isCorporateAdmin: isDirector,
            forgePublicEnabled: Boolean(forgeUnlocked || isDirector),
            systemMode,
            workers,
            sectors,
            customTokens,
            matureAccrual,
            payoutOutbox,
            vaultLocks,
            thermostatValves,
            solvencyProof,
            kasOracleUsdE8,
            engineOnline,
            oracleOnline,
            livePricingUnavailable: !oracleOnline,
            pricingStatusMessage: oracleOnline ? null : LIVE_PRICING_UNAVAILABLE_MESSAGE,
            epochTelemetry,
            networkDifficulty: networkDifficulty > 0 ? networkDifficulty : undefined,
            blockRewardSompi,
            /** @deprecated Batch 2/3 shim; prefer `blockRewardSompi` (`U128Str`). */
            blockRewardKas: blockRewardKasLegacy,
            virtualDaaScore: daaRaw ? parseInt(daaRaw, 10) || 0 : 0
        });
    } catch (err: unknown) {
        console.error('State Hydration Error:', err);
        return json(
            {
                error:
                    err instanceof Error
                        ? err.message
                        : 'Failed to load command center state.'
            },
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

        const nextSectors = Array.isArray(body.sectors)
            ? normalizeSectorAllocations(body.sectors)
            : normalizeSectorAllocations(
                  Array.isArray(prevLayout.sectors) ? prevLayout.sectors : []
              );

        const nextLayout = {
            ...prevLayout,
            workers: Array.isArray(body.workers)
                ? body.workers
                : prevLayout.workers || [],
            sectors: nextSectors,
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
    } catch (err: unknown) {
        console.error('State Persistence Error:', err);
        return json(
            {
                error:
                    err instanceof Error
                        ? err.message
                        : 'Failed to persist command center state.'
            },
            { status: 500 }
        );
    }
};
