import { json, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';

const MASTER_ADMIN_ADDRESS =
    'kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579';
const DEV_ADMIN_BYPASS = false;

async function readLiveEpochAndConsensusTelemetry() {
    let epochTelemetry = null;
    let networkDifficulty = 0;
    let blockRewardKas = 0;
    let unhedgedDeltaKas = 0;
    let forgePublicEnabled =
        String(env.FEATURE_FORGE_PUBLIC || '')
            .trim()
            .toLowerCase() === 'true' ||
        String(env.FEATURE_FORGE_PUBLIC || '').trim() === '1';

    try {
        const [
            rawEpoch,
            netDiffStr,
            blockRewardStr,
            unhedgedStr,
            forgeFlagStr
        ] = await Promise.all([
            redis.get('perennia:settlement:epoch_telemetry'),
            redis.get('pool:network_diff'),
            redis.get('pool:block_reward'),
            redis.get('perennia:treasury:unhedged_delta_kas'),
            redis.get('feature:forge:public')
        ]);
        if (rawEpoch) {
            epochTelemetry = JSON.parse(rawEpoch);
        }
        if (netDiffStr) {
            networkDifficulty = parseFloat(netDiffStr) || 0;
        }
        if (blockRewardStr) {
            blockRewardKas = parseFloat(blockRewardStr) || 0;
        }
        if (unhedgedStr) {
            unhedgedDeltaKas = parseFloat(unhedgedStr) || 0;
        }
        if (forgeFlagStr !== null && forgeFlagStr !== undefined) {
            const cleanFlag = forgeFlagStr.trim().toLowerCase();
            forgePublicEnabled =
                cleanFlag === '1' ||
                cleanFlag === 'true' ||
                cleanFlag === 'enabled' ||
                cleanFlag === 'public';
        }
    } catch (e) {
        console.warn('Redis epoch/consensus telemetry read bypassed:', e);
    }
    return {
        epochTelemetry,
        networkDifficulty,
        blockRewardKas,
        unhedgedDeltaKas,
        forgePublicEnabled
    };
}

export async function GET({ url, cookies }: RequestEvent) {
    const sessionId = cookies.get('perennia_session');
    const {
        epochTelemetry,
        networkDifficulty,
        blockRewardKas,
        unhedgedDeltaKas,
        forgePublicEnabled
    } = await readLiveEpochAndConsensusTelemetry();

    if (!sessionId) {
        return json(
            {
                workers: [],
                sectors: [],
                customTokens: [],
                systemMode: 'base',
                epochTelemetry,
                networkDifficulty,
                blockRewardKas,
                unhedgedDeltaKas,
                forgePublicEnabled
            },
            { status: 200 }
        );
    }

    const sessionWalletRaw = await redis.get(`session:${sessionId}`);
    if (!sessionWalletRaw) {
        return json(
            {
                workers: [],
                sectors: [],
                customTokens: [],
                systemMode: 'base',
                epochTelemetry,
                networkDifficulty,
                blockRewardKas,
                unhedgedDeltaKas,
                forgePublicEnabled
            },
            { status: 200 }
        );
    }

    const sessionWallet = sessionWalletRaw;
    const cleanWallet = sessionWallet.toLowerCase().replace(/kaspa:/i, '').trim();
    const prefixedWallet = `kaspa:${cleanWallet}`;
    const isCorpAdmin =
        DEV_ADMIN_BYPASS ||
        sessionWallet.trim().toLowerCase() === MASTER_ADMIN_ADDRESS.toLowerCase();
    const targetWalletParam = url.searchParams.get('target');

    let client;
    try {
        client = await dbPool.connect();
        let queryWalletClean = cleanWallet;
        let queryWalletPrefixed = prefixedWallet;
        if (isCorpAdmin && targetWalletParam) {
            queryWalletClean = targetWalletParam
                .toLowerCase()
                .replace(/kaspa:/i, '')
                .trim();
            queryWalletPrefixed = `kaspa:${queryWalletClean}`;
        }
        const res = await client.query(
            'SELECT layout_state FROM user_command_centers WHERE wallet_address = $1 OR wallet_address = $2',
            [queryWalletClean, queryWalletPrefixed]
        );
        if (res.rows.length > 0) {
            let bestState = res.rows[0].layout_state;
            for (const row of res.rows) {
                if (
                    row.layout_state?.sectors &&
                    row.layout_state.sectors.length > 0
                ) {
                    bestState = row.layout_state;
                    break;
                }
            }
            if (!bestState.systemMode) bestState.systemMode = 'base';
            if (!Array.isArray(bestState.workers)) bestState.workers = [];
            if (!Array.isArray(bestState.sectors)) bestState.sectors = [];
            if (!Array.isArray(bestState.customTokens)) {
                bestState.customTokens = [];
            } else if (bestState.customTokens.length > 0) {
                const pipe = redis.pipeline();
                for (const ct of bestState.customTokens) {
                    const tick = String(ct?.ticker || ct?.symbol || '')
                        .trim()
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, '');
                    if (tick.length >= 2) {
                        pipe.sadd('oracle:dynamic_tickers', tick);
                    }
                }
                await pipe.exec().catch(() => {});
            }
            return json(
                {
                    ...bestState,
                    epochTelemetry,
                    networkDifficulty,
                    blockRewardKas,
                    unhedgedDeltaKas,
                    forgePublicEnabled
                },
                { status: 200 }
            );
        }
    } catch (e) {
        console.error('State Fetch Fault:', e);
    } finally {
        if (client) client.release();
    }

    return json(
        {
            workers: [],
            sectors: [],
            customTokens: [],
            systemMode: 'base',
            epochTelemetry,
            networkDifficulty,
            blockRewardKas,
            unhedgedDeltaKas,
            forgePublicEnabled
        },
        { status: 200 }
    );
}