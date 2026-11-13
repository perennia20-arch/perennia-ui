import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import { validateKaspaBech32mAddress } from '$lib/crypto/kaspaAddress';
import {
    isWalletMasterAdmin,
    resolveMasterTreasuryKasAddressOptional,
    normalizeKaspaAddressStrict,
    normalizeKaspaBase32Strict,
    perenniaKMS
} from '$lib/server/kms';

function resolveStratumTierEndpoint(hashrateTh: number): {
    tier: number;
    externalPort: number;
    internalPort: number;
    initialDifficulty: number;
    stratumUrl: string;
} {
    const host = (env.PUBLIC_STRATUM_HOST || 'pool.perennia.io').trim();
    if (hashrateTh > 10.0) {
        return {
            tier: 3,
            externalPort: 3334,
            internalPort: 6553,
            initialDifficulty: 1024.0,
            stratumUrl: `stratum+tcp://${host}:3334`
        };
    }
    if (hashrateTh >= 1.0) {
        return {
            tier: 2,
            externalPort: 3333,
            internalPort: 6552,
            initialDifficulty: 256.0,
            stratumUrl: `stratum+tcp://${host}:3333`
        };
    }
    return {
        tier: 1,
        externalPort: 3332,
        internalPort: 6551,
        initialDifficulty: 1.0,
        stratumUrl: `stratum+tcp://${host}:3332`
    };
}

let workerSchemaVerified = false;

async function ensureWorkerProfilesSchema() {
    if (workerSchemaVerified) return;

    await dbPool.query(`
        CREATE TABLE IF NOT EXISTS worker_profiles (
            worker_identity VARCHAR(255) PRIMARY KEY,
            worker_id VARCHAR(255),
            wallet_address VARCHAR(255) NOT NULL,
            worker_name VARCHAR(128) NOT NULL DEFAULT 'Rig01',
            hardware_model VARCHAR(128) NOT NULL DEFAULT 'IceRiver KS',
            hashrate_ths DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            current_hashrate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            valid_shares BIGINT NOT NULL DEFAULT 0,
            rejected_shares BIGINT NOT NULL DEFAULT 0,
            acceptance_pct DOUBLE PRECISION NOT NULL DEFAULT 100.0,
            blocks_found BIGINT NOT NULL DEFAULT 0,
            stratum_port INTEGER NOT NULL DEFAULT 3332,
            last_share_ts BIGINT NOT NULL DEFAULT 0,
            streak_started_ts BIGINT NOT NULL DEFAULT 0,
            effective_fee_rate DOUBLE PRECISION NOT NULL DEFAULT 0.01,
            status VARCHAR(32) NOT NULL DEFAULT 'online',
            last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `);

    const alterMigrations = [
        `ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS worker_identity VARCHAR(255)`,
        `ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS worker_id VARCHAR(255)`,
        `ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS hardware_model VARCHAR(128) NOT NULL DEFAULT 'IceRiver KS'`,
        `ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS hashrate_ths DOUBLE PRECISION NOT NULL DEFAULT 0.0`,
        `ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS current_hashrate DOUBLE PRECISION NOT NULL DEFAULT 0.0`,
        `ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS stratum_port INTEGER NOT NULL DEFAULT 3332`,
        `ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`,
        `ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'online'`,
        `ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`
    ];

    for (const stmt of alterMigrations) {
        await dbPool.query(stmt).catch(() => {});
    }

    await dbPool
        .query(
            `UPDATE worker_profiles
             SET worker_id = worker_identity
             WHERE worker_id IS NULL AND worker_identity IS NOT NULL`
        )
        .catch(() => {});

    await dbPool
        .query(
            `CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_profiles_identity_uniq
             ON worker_profiles (worker_identity)`
        )
        .catch(() => {});

    workerSchemaVerified = true;
}

async function hasDirectorClearance(
    request: Request,
    sessionWallet: string | null
): Promise<boolean> {
    const authHeader = request.headers.get('authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
        try {
            if (perenniaKMS.verifyMasterAdminKey(authHeader)) {
                return true;
            }
        } catch {
            // Fall through to session check
        }
    }
    return isWalletMasterAdmin(sessionWallet);
}

export const GET: RequestHandler = async ({ cookies, url }: RequestEvent) => {
    const sessionId = cookies.get('perennia_session');
    const sessionWallet = sessionId
        ? await redis.get(`session:${sessionId}`).catch(() => null)
        : null;
    const requestedWallet =
        url.searchParams.get('wallet') || sessionWallet || '';
    const cleanWallet = normalizeKaspaBase32Strict(requestedWallet);
    const boundCoinbaseRaw =
        (await redis
            .get('perennia:stratum:mining_address')
            .catch(() => null)) ||
        (env.PERENNIA_HOT_KAS_ADDRESS || '').trim() ||
        resolveMasterTreasuryKasAddressOptional() ||
        '';
    const poolCoinbaseAddress = boundCoinbaseRaw
        ? normalizeKaspaAddressStrict(boundCoinbaseRaw)
        : null;

    let workers: any[] = [];
    const allowPublicLookup = url.searchParams.get('publicWorkers') === '1' && cleanWallet.length >= 55; if (cleanWallet && (sessionWallet || allowPublicLookup)) { const cleanSession = sessionWallet ? normalizeKaspaBase32Strict(sessionWallet) : ''; const isDirector = sessionWallet ? isWalletMasterAdmin(sessionWallet) : false; if (allowPublicLookup || cleanWallet === cleanSession || isDirector) {
            try {
                await ensureWorkerProfilesSchema();
                const res = await dbPool.query(
                    `SELECT COALESCE(worker_id, worker_identity) AS worker_id,
                            worker_identity,
                            wallet_address,
                            worker_name,
                            COALESCE(hardware_model, 'IceRiver KS') AS hardware_model,
                            CASE
                                WHEN COALESCE(current_hashrate, 0) > 0 THEN current_hashrate
                                ELSE COALESCE(hashrate_ths, 0) * 1e12
                            END AS current_hashrate,
                            COALESCE(hashrate_ths, 0) AS hashrate_ths,
                            valid_shares,
                            rejected_shares,
                            blocks_found,
                            COALESCE(stratum_port, 3332) AS stratum_port,
                            COALESCE(last_seen, updated_at) AS last_seen
                     FROM worker_profiles
                     WHERE LOWER(REPLACE(TRIM(wallet_address), 'kaspa:', '')) = $1
                     ORDER BY COALESCE(last_seen, updated_at) DESC NULLS LAST`,
                    [cleanWallet]
                );
                workers = res.rows;
            } catch {
                workers = [];
            }
        }
    }

    return json({
        online: Boolean(poolCoinbaseAddress),
        poolCoinbaseAddress,
        tiers: [
            resolveStratumTierEndpoint(0.4),
            resolveStratumTierEndpoint(4.0),
            resolveStratumTierEndpoint(20.0)
        ],
        workers
    });
};

export const POST: RequestHandler = async ({
    request,
    cookies
}: RequestEvent) => {
    const sessionId = cookies.get('perennia_session');
    const sessionWallet = sessionId
        ? await redis.get(`session:${sessionId}`).catch(() => null)
        : null;
    const isDirector = await hasDirectorClearance(request, sessionWallet);

    if (!sessionWallet && !isDirector) {
        return json(
            {
                error: 'UNAUTHORIZED: Active Sovereign session required to bind Stratum workers.'
            },
            { status: 401 }
        );
    }

    try {
        const body = await request.json().catch(() => ({}));
        const action = String(body.action || 'BIND_WORKER')
            .trim()
            .toUpperCase();

        if (
            action === 'SET_POOL_COINBASE' ||
            action === 'REBIND_COINBASE_WALLET'
        ) {
            if (!isDirector) {
                return json(
                    {
                        error: 'FORBIDDEN: Only the Master Treasury Director may rebind the Stratum pool coinbase address.'
                    },
                    { status: 403 }
                );
            }
            const rawCoinbase = String(
                body.miningAddress || body.coinbaseAddress || body.wallet || ''
            ).trim();
            const prefixedCandidate = normalizeKaspaAddressStrict(rawCoinbase);
            const bech32Check = validateKaspaBech32mAddress(prefixedCandidate);
            if (!bech32Check.valid) {
                return json(
                    {
                        error: `INVALID_KASPA_ADDRESS: ${bech32Check.error || 'Provide a valid Bech32m Kaspa address for the Stratum coinbase wallet.'}`
                    },
                    { status: 400 }
                );
            }
            const prefixedCoinbase = bech32Check.normalized;
            await redis.set(
                'perennia:stratum:mining_address',
                prefixedCoinbase
            );
            await dbPool
                .query(
                    `UPDATE system_treasury_config
                     SET cold_kas_address = $1,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE config_id = 'PRIMARY'`,
                    [prefixedCoinbase]
                )
                .catch(() => {});
            return json({
                success: true,
                action: 'SET_POOL_COINBASE',
                poolCoinbaseAddress: prefixedCoinbase
            });
        }

        const rawWallet = String(
            body.wallet || body.walletAddress || sessionWallet || ''
        ).trim();
        const candidatePrefixed = normalizeKaspaAddressStrict(rawWallet);
        const walletValidation = validateKaspaBech32mAddress(candidatePrefixed);
        if (!walletValidation.valid) {
            return json(
                {
                    error: `INVALID_KASPA_ADDRESS: ${walletValidation.error || 'Valid Kaspa miner payout address is required.'}`
                },
                { status: 400 }
            );
        }

        const prefixedWallet = walletValidation.normalized;
        const cleanWallet = normalizeKaspaBase32Strict(prefixedWallet);

        if (
            !isDirector &&
            sessionWallet &&
            cleanWallet !== normalizeKaspaBase32Strict(sessionWallet)
        ) {
            return json(
                {
                    error: 'FORBIDDEN: Cannot bind a Stratum worker to another miner wallet.'
                },
                { status: 403 }
            );
        }

        const rawWorkerName = String(
            body.workerName || body.name || 'Rig01'
        ).trim();
        const sanitizedWorkerName =
            rawWorkerName.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) ||
            'Rig01';
        const hardwareModel =
            String(
                body.hardwareModel || body.hardwareType || 'IceRiver KS'
            )
                .trim()
                .slice(0, 80) || 'IceRiver KS';
        const estimatedHashrateTh = Math.max(
            0,
            Number(body.estimatedHashrateTh ?? body.hashRate ?? 0.4)
        );
        const tierSpec = resolveStratumTierEndpoint(estimatedHashrateTh);
        const workerId = `${prefixedWallet}.${sanitizedWorkerName}`;

        await ensureWorkerProfilesSchema();
        await dbPool.query(
            `INSERT INTO worker_profiles (
                 worker_identity,
                 worker_id,
                 wallet_address,
                 worker_name,
                 hardware_model,
                 hashrate_ths,
                 current_hashrate,
                 stratum_port,
                 last_seen,
                 updated_at
             )
             VALUES ($1, $1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             ON CONFLICT (worker_identity) DO UPDATE SET
                worker_id = EXCLUDED.worker_id,
                wallet_address = EXCLUDED.wallet_address,
                worker_name = EXCLUDED.worker_name,
                hardware_model = EXCLUDED.hardware_model,
                hashrate_ths = CASE
                    WHEN worker_profiles.hashrate_ths > 0 THEN worker_profiles.hashrate_ths
                    ELSE EXCLUDED.hashrate_ths
                END,
                current_hashrate = CASE
                    WHEN worker_profiles.current_hashrate > 0 THEN worker_profiles.current_hashrate
                    ELSE EXCLUDED.current_hashrate
                END,
                stratum_port = EXCLUDED.stratum_port,
                last_seen = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP`,
            [
                workerId,
                prefixedWallet,
                sanitizedWorkerName,
                hardwareModel,
                estimatedHashrateTh,
                estimatedHashrateTh * 1e12,
                tierSpec.externalPort
            ]
        );

        await redis
            .set(
                `stratum:worker:${cleanWallet}.${sanitizedWorkerName.toLowerCase()}`,
                JSON.stringify({
                    workerId,
                    walletAddress: prefixedWallet,
                    workerName: sanitizedWorkerName,
                    hardwareModel,
                    tier: tierSpec.tier,
                    stratumUrl: tierSpec.stratumUrl,
                    boundAt: new Date().toISOString()
                }),
                'EX',
                60 * 60 * 24 * 30
            )
            .catch(() => {});

        return json({
            success: true,
            workerId,
            walletAddress: prefixedWallet,
            workerName: sanitizedWorkerName,
            hardwareModel,
            ...tierSpec
        });
    } catch (err: any) {
        console.error('Stratum Bind Fault:', err);
        return json(
            { error: err?.message || 'Failed to bind Stratum worker.' },
            { status: 500 }
        );
    }
};