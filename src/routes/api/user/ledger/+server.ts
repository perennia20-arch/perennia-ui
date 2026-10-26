import { json, type RequestEvent } from '@sveltejs/kit';
import { redis } from '../../../../lib/server/redis';
import { dbPool } from '$lib/server/db';
import { env } from '$env/dynamic/private';

const MASTER_ADMIN_ADDRESS =
    'kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579';
const DEV_ADMIN_BYPASS = false;
const DEFAULT_UNASSIGNED_RESERVE_TARGET_KAS = 50.0;

function normalizeKaspaBase32(addr: string): string {
    return addr.trim().toLowerCase().replace(/^kaspa:/i, '').trim();
}

export const GET = async ({ url, cookies, request, setHeaders }: RequestEvent) => {
    const wallet = url.searchParams.get('wallet');
    if (!wallet) {
        return json(
            { error: 'Bad Request', message: 'Missing wallet parameter.' },
            { status: 400 }
        );
    }

    let sessionWallet = '';
    const authHeader = request.headers.get('authorization');
    if (env.PERENNIA_ADMIN_KEY && authHeader === `Bearer ${env.PERENNIA_ADMIN_KEY}`) {
        sessionWallet = MASTER_ADMIN_ADDRESS;
    } else {
        const sessionId = cookies.get('perennia_session');
        if (!sessionId) return json({ error: 'UNAUTHORIZED' }, { status: 401 });
        const rawAddress = await redis.get(`session:${sessionId}`);
        if (!rawAddress) return json({ error: 'SESSION_EXPIRED' }, { status: 401 });
        sessionWallet = rawAddress;
    }

    const cleanWallet = normalizeKaspaBase32(wallet);
    const cleanSession = normalizeKaspaBase32(sessionWallet);
    const cleanMasterAdmin = normalizeKaspaBase32(MASTER_ADMIN_ADDRESS);
    const isCorpAdmin = DEV_ADMIN_BYPASS || cleanSession === cleanMasterAdmin;

    if (!isCorpAdmin && cleanWallet !== cleanSession) {
        return json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    setHeaders({
        'Cache-Control': 'no-store, no-cache, must-revalidate'
    });

    const defaultBalances: Record<string, number> = {
        KAS: 0.0,
        BTC: 0.0,
        ETH: 0.0,
        SOL: 0.0,
        unassignedReserveKas: 0.0,
        unassignedReserveTargetKas: DEFAULT_UNASSIGNED_RESERVE_TARGET_KAS
    };

    try {
        const key = `dev:sor:treasury:balances:${cleanWallet}`;
        const rawData = await redis.hgetall(key);
        const treasuryAddrRaw =
            env.PERENNIA_TREASURY_KAS_ADDRESS ||
            env.PERENNIA_HOT_KAS_ADDRESS ||
            MASTER_ADMIN_ADDRESS;
        const cleanTreasury = normalizeKaspaBase32(treasuryAddrRaw);
        const isTreasurySelf = cleanWallet === cleanTreasury;

        let authoritativeUnassignedKas = 0.0;
        let dbSynced = false;

        if (!isTreasurySelf) {
            try {
                const res = await dbPool.query(
                    `SELECT COALESCE(SUM(GREATEST(0.0, streaming_balance_kas)), 0.0) AS total_streaming
                     FROM yield_reservoirs
                     WHERE LOWER(REPLACE(TRIM(wallet_address), 'kaspa:', '')) = $1`,
                    [cleanWallet]
                );
                if (res.rows.length > 0) {
                    authoritativeUnassignedKas = Math.max(
                        0.0,
                        parseFloat(res.rows[0].total_streaming || '0') || 0.0
                    );
                    dbSynced = true;
                }
            } catch {
                dbSynced = false;
            }
        }

        if (isTreasurySelf) {
            if (rawData && rawData['Unassigned KAS'] !== undefined) {
                await redis.hdel(key, 'Unassigned KAS').catch(() => {});
            }
        } else if (dbSynced) {
            const currentRedisUnassigned = parseFloat(rawData?.['Unassigned KAS'] || '0');
            if (
                isNaN(currentRedisUnassigned) ||
                Math.abs(currentRedisUnassigned - authoritativeUnassignedKas) > 1e-8
            ) {
                await redis
                    .hset(key, 'Unassigned KAS', authoritativeUnassignedKas.toString())
                    .catch(() => {});
            }
        }

        const balances: Record<string, number> = { ...defaultBalances };
        if (rawData && Object.keys(rawData).length > 0) {
            for (const [asset, value] of Object.entries(rawData)) {
                if (asset === 'Unassigned KAS') {
                    continue;
                }
                const parsed = parseFloat(value);
                if (!isNaN(parsed)) {
                    if (parsed < 0) {
                        await redis.hset(key, asset, '0').catch(() => {});
                    }
                    const clamped = Math.max(0.0, parsed);
                    balances[asset] = (balances[asset] || 0.0) + clamped;
                }
            }
        }

        const finalUnassignedKas = isTreasurySelf
            ? 0.0
            : dbSynced
              ? authoritativeUnassignedKas
              : Math.max(0.0, parseFloat(rawData?.['Unassigned KAS'] || '0') || 0.0);

        balances.KAS = Math.max(0.0, (balances.KAS || 0.0) + finalUnassignedKas);
        balances.unassignedReserveKas = finalUnassignedKas;
        balances.unassignedReserveTargetKas = DEFAULT_UNASSIGNED_RESERVE_TARGET_KAS;

        return json(balances);
    } catch (error) {
        console.error('Ledger API Redis Socket Error:', error);
        return json(defaultBalances, { status: 500 });
    }
};