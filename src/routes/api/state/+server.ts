import { json, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';

const MASTER_ADMIN_ADDRESS = "kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579";
const DEV_ADMIN_BYPASS = false;

async function readLiveEpochAndConsensusTelemetry() {
    let epochTelemetry = null;
    let networkDifficulty = 0;
    let blockRewardKas = 0;
    let unhedgedDeltaKas = 0;

    try {
        const [rawEpoch, netDiffStr, blockRewardStr, unhedgedStr] = await Promise.all([
            redis.get('perennia:settlement:epoch_telemetry'),
            redis.get('pool:network_diff'),
            redis.get('pool:block_reward'),
            redis.get('perennia:treasury:unhedged_delta_kas')
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
    } catch (e) {
        console.warn("Redis epoch/consensus telemetry read bypassed:", e);
    }

    return { epochTelemetry, networkDifficulty, blockRewardKas, unhedgedDeltaKas };
}

export async function GET({ url, cookies }: RequestEvent) {
    const sessionId = cookies.get('perennia_session');
    const { epochTelemetry, networkDifficulty, blockRewardKas, unhedgedDeltaKas } =
        await readLiveEpochAndConsensusTelemetry();

    if (!sessionId) {
        return json(
            {
                workers: [],
                sectors: [],
                systemMode: 'base',
                epochTelemetry,
                networkDifficulty,
                blockRewardKas,
                unhedgedDeltaKas
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
                systemMode: 'base',
                epochTelemetry,
                networkDifficulty,
                blockRewardKas,
                unhedgedDeltaKas
            },
            { status: 200 }
        );
    }

    const sessionWallet = sessionWalletRaw;
    const cleanWallet = sessionWallet.toLowerCase().replace(/kaspa:/i, '').trim();
    const prefixedWallet = `kaspa:${cleanWallet}`;
    const isCorpAdmin = DEV_ADMIN_BYPASS || sessionWallet.toLowerCase() === MASTER_ADMIN_ADDRESS.toLowerCase();
    const targetWalletParam = url.searchParams.get('target');

    let client;
    try {
        client = await dbPool.connect();
        let queryWalletClean = cleanWallet;
        let queryWalletPrefixed = prefixedWallet;
        if (isCorpAdmin && targetWalletParam) {
            queryWalletClean = targetWalletParam.toLowerCase().replace(/kaspa:/i, '').trim();
            queryWalletPrefixed = `kaspa:${queryWalletClean}`;
        }

        const res = await client.query(
            'SELECT layout_state FROM user_command_centers WHERE wallet_address = $1 OR wallet_address = $2',
            [queryWalletClean, queryWalletPrefixed]
        );

        if (res.rows.length > 0) {
            let bestState = res.rows[0].layout_state;
            for (const row of res.rows) {
                if (row.layout_state.sectors && row.layout_state.sectors.length > 0) {
                    bestState = row.layout_state;
                    break;
                }
            }
            if (!bestState.systemMode) bestState.systemMode = 'base';
            if (!bestState.workers) bestState.workers = [];
            if (!bestState.sectors) bestState.sectors = [];

            return json(
                {
                    ...bestState,
                    epochTelemetry,
                    networkDifficulty,
                    blockRewardKas,
                    unhedgedDeltaKas
                },
                { status: 200 }
            );
        }
    } catch (e) {
        console.error("State Fetch Fault:", e);
    } finally {
        if (client) client.release();
    }

    return json(
        {
            workers: [],
            sectors: [],
            systemMode: 'base',
            epochTelemetry,
            networkDifficulty,
            blockRewardKas,
            unhedgedDeltaKas
        },
        { status: 200 }
    );
}