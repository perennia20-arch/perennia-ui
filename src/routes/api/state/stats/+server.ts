import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { dbPool } from '$lib/server/db';
import {
    isWalletMasterAdmin,
    normalizeKaspaBase32Strict
} from '$lib/server/kms';

const KASPA_DIFF_CONSTANT = 4_294_967_296.0;

export const GET: RequestHandler = async ({ cookies, url }: RequestEvent) => {
    const sessionId = cookies.get('perennia_session');
    if (!sessionId) {
        return json({ error: 'UNAUTHORIZED_MATRIX_ACCESS' }, { status: 401 });
    }

    const sessionWalletRaw = await redis.get(`session:${sessionId}`);
    if (!sessionWalletRaw) {
        return json({ error: 'SESSION_EXPIRED' }, { status: 401 });
    }

    const isDirector = isWalletMasterAdmin(sessionWalletRaw);
    const requestedTarget = url.searchParams.get('target');
    const effectiveWallet =
        isDirector && requestedTarget && requestedTarget.trim()
            ? requestedTarget.trim()
            : sessionWalletRaw;

    const cleanSessionWallet = normalizeKaspaBase32Strict(effectiveWallet);
    const timeframe = String(url.searchParams.get('timeframe') || '1H')
        .trim()
        .toUpperCase();

    try {
        const workerKeys = await redis.smembers('pool:workers');
        const workers = [];
        let isolatedHashrate = 0;

        for (const fullIdentity of workerKeys) {
            const nameParts = fullIdentity.split('.');
            const rawWalletAddress = nameParts[0];
            const cleanWorkerWallet = rawWalletAddress
                .toLowerCase()
                .replace(/kaspa:/i, '')
                .trim();
            const workerName =
                nameParts.length > 1
                    ? nameParts.slice(1).join('.')
                    : fullIdentity;

            if (
                cleanWorkerWallet !== cleanSessionWallet &&
                !fullIdentity.toLowerCase().includes(cleanSessionWallet)
            ) {
                continue;
            }

            const [hashRateStr, blocksStr, sharesStr] = await Promise.all([
                redis.get(`worker:${fullIdentity}:hashrate`),
                redis.get(`worker:${fullIdentity}:blocks`),
                redis.get(`worker:${fullIdentity}:shares`)
            ]);

            const rate = parseFloat(hashRateStr || '0');
            isolatedHashrate += rate;

            workers.push({
                name: workerName,
                walletAddress: rawWalletAddress,
                fullIdentity,
                trackingRate: rate,
                blocksFound: parseInt(blocksStr || '0', 10),
                sharesContributed: parseInt(sharesStr || '0', 10)
            });
        }

        const currentThs = Number((isolatedHashrate / 1e12).toFixed(4));
        const nowSec = Math.floor(Date.now() / 1000);
        const windowSec =
            timeframe === '1H'
                ? 3600
                : timeframe === '7D'
                  ? 7 * 86400
                  : timeframe === '30D'
                    ? 30 * 86400
                    : 86400;
        const cutoffSec = nowSec - windowSec;

        const rawWalletHistory = await redis
            .lrange(`perennia:hashrate:history:${cleanSessionWallet}`, 0, -1)
            .catch(() => [] as string[]);

        let historyPoints: number[] = rawWalletHistory
            .map((s) => {
                try {
                    return JSON.parse(s);
                } catch {
                    return null;
                }
            })
            .filter((p) => p && Number(p.ts || 0) >= cutoffSec)
            .map((p) => Number(p.hashrateThs || 0));

        if (historyPoints.length < 2) {
            try {
                const bucketSeconds =
                    timeframe === '1H'
                        ? 120
                        : timeframe === '24H'
                          ? 1800
                          : timeframe === '7D'
                            ? 14400
                            : 86400;
                const dbRes = await dbPool.query(
                    `SELECT
                        FLOOR(EXTRACT(EPOCH FROM recorded_at) / $1) * $1 AS bucket_ts,
                        SUM(difficulty) AS total_diff
                     FROM micro_shares
                     WHERE is_valid = TRUE
                       AND LOWER(worker_identity) LIKE $2
                       AND recorded_at >= NOW() - ($3::text || ' seconds')::interval
                     GROUP BY bucket_ts
                     ORDER BY bucket_ts ASC
                     LIMIT 60`,
                    [
                        bucketSeconds,
                        `%${cleanSessionWallet}%`,
                        windowSec.toString()
                    ]
                );
                if (dbRes.rows.length >= 2) {
                    historyPoints = dbRes.rows.map((r) => {
                        const totalDiff = Number(r.total_diff || 0);
                        const hashes = totalDiff * KASPA_DIFF_CONSTANT;
                        return Number(
                            (hashes / bucketSeconds / 1e12).toFixed(4)
                        );
                    });
                }
            } catch {
                // Fall back to global Redis series or live worker rate
            }
        }

        if (historyPoints.length < 2) {
            const rawGlobal = await redis
                .lrange('perennia:hashrate:history:global', 0, -1)
                .catch(() => [] as string[]);
            const globalFiltered = rawGlobal
                .map((s) => {
                    try {
                        return JSON.parse(s);
                    } catch {
                        return null;
                    }
                })
                .filter((p) => p && Number(p.ts || 0) >= cutoffSec)
                .map((p) => Number(p.hashrateThs || 0));

            if (globalFiltered.length >= 2 && currentThs > 0) {
                historyPoints = globalFiltered;
            } else if (currentThs > 0) {
                const sampleCount =
                    timeframe === '1H'
                        ? 15
                        : timeframe === '24H'
                          ? 24
                          : timeframe === '7D'
                            ? 28
                            : 30;
                historyPoints = Array.from(
                    { length: sampleCount },
                    () => currentThs
                );
            }
        }

        if (currentThs > 0) {
            historyPoints = [...historyPoints.slice(-59), currentThs];
        }

        return json({
            status: 'ONLINE',
            timeframe,
            pool: { totalHashrate: isolatedHashrate },
            workers,
            hashrateHistoryThs: historyPoints
        });
    } catch (error) {
        console.error('Redis Telemetry Fetch Error:', error);
        return json(
            {
                error: 'Failed to read node telemetry.',
                timeframe,
                pool: { totalHashrate: 0 },
                workers: [],
                hashrateHistoryThs: []
            },
            { status: 500 }
        );
    }
};