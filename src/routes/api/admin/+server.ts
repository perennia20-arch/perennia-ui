import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { buildExplorerTxUrl } from '../sor/l1_dispatch/+server';

const MASTER_ADMIN_ADDRESS =
    'kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579';

const ALLOWED_TABLES = [
    'worker_profiles',
    'yield_reservoirs',
    'micro_shares',
    'network_blocks',
    'user_command_centers',
    'entity_kyc',
    'tax_ledger_events',
    'liquidity_providers',
    'silo_staking_positions',
    'yield_distributions',
    'pending_transactions',
    'whitelisted_wallets',
    'p2p_orders',
    'fiat_payout_queue',
    'fiat_bank_rails',
    'fiat_onramp_orders',
    'l1_payout_queue',
    'rwa_oracle_feeds'
] as const;

const LUA_CLAMPED_FEE_REVERSAL = `
local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
local rev = tonumber(ARGV[1] or '0')
local next_val = math.max(0, cur - rev)
redis.call('SET', KEYS[1], tostring(next_val))
return tostring(next_val)
`;

function normalizeKaspaBase32(addr: string): string {
    return addr.trim().toLowerCase().replace(/^kaspa:/i, '').trim();
}

function getMasterKeyStrict(): string {
    const isProd = process.env.NODE_ENV === 'production';
    const configured = (env.KYC_MASTER_KEY || '').trim();
    if (isProd && !configured) {
        throw new Error(
            'CRITICAL_SECURITY_LOCKDOWN: KYC_MASTER_KEY environment variable is required in production.'
        );
    }
    return configured || 'perennia_sovereign_rail_cipher_key';
}

function deriveCipherKey(masterKey: string): Buffer {
    const raw = String(masterKey || 'perennia_sovereign_rail_cipher_key');
    return Buffer.from(raw).length === 32
        ? Buffer.from(raw)
        : crypto.createHash('sha256').update(raw).digest();
}

function decryptBankRailPayload(encryptedPayload: string): {
    routingNumber: string;
    accountNumber: string;
    bankLabel: string;
    accountType: string;
    payoutMethod: string;
} | null {
    const masterKey = getMasterKeyStrict();
    const isProd = process.env.NODE_ENV === 'production';
    const candidateKeys = isProd
        ? [masterKey]
        : [
              masterKey,
              'perennia_sovereign_rail_cipher_key',
              '12345678901234567890123456789012'
          ];
    for (const keyCandidate of candidateKeys) {
        try {
            const parts = String(encryptedPayload || '').split(':');
            if (parts.length !== 3) continue;
            const [ivHex, authTagHex, encryptedHex] = parts;
            const keyBuf = deriveCipherKey(keyCandidate);
            const decipher = crypto.createDecipheriv(
                'aes-256-gcm',
                keyBuf,
                Buffer.from(ivHex, 'hex')
            );
            decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
            let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            const parsed = JSON.parse(decrypted);
            const routingNumber = String(
                parsed.routingNumber || parsed.routing || ''
            ).trim();
            const accountNumber = String(
                parsed.accountNumber || parsed.account || ''
            ).trim();
            if (routingNumber && accountNumber) {
                return {
                    routingNumber,
                    accountNumber,
                    bankLabel: String(
                        parsed.bankLabel || 'Primary Operating Account'
                    ).trim(),
                    accountType: String(parsed.accountType || 'CHECKING').toUpperCase(),
                    payoutMethod: String(parsed.payoutMethod || 'ACH').toUpperCase()
                };
            }
        } catch {
        }
    }
    return null;
}

async function resolveDecryptedBankRailForWallet(walletRaw: string) {
    const cleanWallet = normalizeKaspaBase32(walletRaw);
    const prefixedWallet = `kaspa:${cleanWallet}`;
    try {
        const dbRes = await dbPool.query(
            `SELECT bank_label, account_type, payout_method, bank_last4, encrypted_rail_payload, updated_at
             FROM fiat_bank_rails
             WHERE wallet_address = $1 OR wallet_address = $2
             ORDER BY updated_at DESC
             LIMIT 1`,
            [prefixedWallet, cleanWallet]
        );
        if (dbRes.rows.length > 0) {
            const row = dbRes.rows[0];
            const dec = decryptBankRailPayload(String(row.encrypted_rail_payload || ''));
            if (dec) {
                return {
                    walletAddress: prefixedWallet,
                    bankLabel: String(row.bank_label || dec.bankLabel),
                    accountType: String(row.account_type || dec.accountType),
                    payoutMethod: String(row.payout_method || dec.payoutMethod),
                    routingNumber: dec.routingNumber,
                    accountNumber: dec.accountNumber,
                    bankLast4: String(row.bank_last4 || dec.accountNumber.slice(-4))
                };
            }
        }
    } catch {
        // Fallback to Redis
    }

    const cachedRail = await redis.get(`perennia:fiat:bank_rail:${cleanWallet}`);
    if (cachedRail) {
        const dec = decryptBankRailPayload(cachedRail);
        if (dec) {
            return {
                walletAddress: prefixedWallet,
                bankLabel: dec.bankLabel,
                accountType: dec.accountType,
                payoutMethod: dec.payoutMethod,
                routingNumber: dec.routingNumber,
                accountNumber: dec.accountNumber,
                bankLast4: dec.accountNumber.slice(-4)
            };
        }
    }

    try {
        const kycRes = await dbPool.query(
            `SELECT legal_name, bank_data_hash FROM entity_kyc WHERE wallet_address = $1 OR wallet_address = $2 LIMIT 1`,
            [prefixedWallet, cleanWallet]
        );
        if (kycRes.rows.length > 0 && kycRes.rows[0].bank_data_hash) {
            const dec = decryptBankRailPayload(String(kycRes.rows[0].bank_data_hash));
            if (dec) {
                return {
                    walletAddress: prefixedWallet,
                    bankLabel: String(kycRes.rows[0].legal_name || dec.bankLabel),
                    accountType: dec.accountType,
                    payoutMethod: dec.payoutMethod,
                    routingNumber: dec.routingNumber,
                    accountNumber: dec.accountNumber,
                    bankLast4: dec.accountNumber.slice(-4)
                };
            }
        }
    } catch {
        // Ignore KYC lookup error
    }
    return null;
}

async function verifyDirectorClearance(
    request: Request,
    cookies: RequestEvent['cookies']
): Promise<{ authorized: boolean; adminWallet: string }> {
    const authHeader = request.headers.get('authorization') || '';
    if (env.PERENNIA_ADMIN_KEY && authHeader.startsWith('Bearer ')) {
        const expected = Buffer.from(`Bearer ${env.PERENNIA_ADMIN_KEY}`);
        const provided = Buffer.from(authHeader);
        if (
            expected.length === provided.length &&
            crypto.timingSafeEqual(expected, provided)
        ) {
            return { authorized: true, adminWallet: MASTER_ADMIN_ADDRESS };
        }
    }
    const sessionId = cookies.get('perennia_session');
    if (!sessionId) {
        return { authorized: false, adminWallet: '' };
    }
    const sessionWallet = await redis.get(`session:${sessionId}`);
    if (!sessionWallet) {
        return { authorized: false, adminWallet: '' };
    }
    const cleanSession = normalizeKaspaBase32(sessionWallet);
    const cleanMaster = normalizeKaspaBase32(
        env.MASTER_ADMIN_ADDRESS || MASTER_ADMIN_ADDRESS
    );
    if (cleanSession === cleanMaster) {
        return { authorized: true, adminWallet: `kaspa:${cleanSession}` };
    }
    return { authorized: false, adminWallet: '' };
}

async function ensureAdminAuxiliaryTables() {
    const client = await dbPool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS whitelisted_wallets (
                wallet_address VARCHAR(255) PRIMARY KEY,
                label VARCHAR(255) DEFAULT 'Sovereign Miner',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS silo_staking_positions (
                stake_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                wallet_address VARCHAR(255) NOT NULL,
                token_ticker VARCHAR(32) NOT NULL DEFAULT 'SILO',
                amount_staked DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
                tx_hash VARCHAR(255),
                cooldown_initiated_at TIMESTAMP WITH TIME ZONE,
                cooldown_ends_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_silo_staking_wallet ON silo_staking_positions (wallet_address, status);
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS fiat_payout_queue (
                payout_id VARCHAR(80) PRIMARY KEY,
                wallet_address VARCHAR(255) NOT NULL,
                source_type VARCHAR(40) NOT NULL,
                source_asset VARCHAR(20) NOT NULL,
                amount_crypto DOUBLE PRECISION NOT NULL,
                gross_usd DOUBLE PRECISION NOT NULL,
                fee_usd DOUBLE PRECISION NOT NULL,
                net_fiat_usd DOUBLE PRECISION NOT NULL,
                payout_method VARCHAR(20) NOT NULL,
                bank_last4 VARCHAR(10) NOT NULL,
                tx_id VARCHAR(255),
                trace_id VARCHAR(128),
                status VARCHAR(40) DEFAULT 'QUEUED_FOR_TREASURY_DISPATCH',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`
            ALTER TABLE fiat_payout_queue ADD COLUMN IF NOT EXISTS trace_id VARCHAR(128);
        `);
        await client.query(`
            ALTER TABLE fiat_payout_queue ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS fiat_bank_rails (
                wallet_address VARCHAR(255) PRIMARY KEY,
                bank_label VARCHAR(128) NOT NULL DEFAULT 'Primary Operating Account',
                account_type VARCHAR(32) NOT NULL DEFAULT 'CHECKING',
                payout_method VARCHAR(20) NOT NULL DEFAULT 'ACH',
                bank_last4 VARCHAR(10) NOT NULL,
                encrypted_rail_payload TEXT NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS fiat_onramp_orders (
                order_id VARCHAR(80) PRIMARY KEY,
                wallet_address VARCHAR(255) NOT NULL,
                payment_rail VARCHAR(40) NOT NULL DEFAULT 'SOVEREIGN_WIRE_ACH',
                settlement_target VARCHAR(32) NOT NULL DEFAULT 'LEDGER_KAS',
                fiat_amount_usd DOUBLE PRECISION NOT NULL,
                fee_usd DOUBLE PRECISION NOT NULL,
                net_usd_converted DOUBLE PRECISION NOT NULL,
                locked_spot_price DOUBLE PRECISION NOT NULL,
                estimated_kas DOUBLE PRECISION NOT NULL,
                delivered_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                wire_memo VARCHAR(80) NOT NULL,
                tx_hash VARCHAR(255),
                status VARCHAR(40) NOT NULL DEFAULT 'AWAITING_WIRE_RECEIPT',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS l1_payout_queue (
                payout_id VARCHAR(80) PRIMARY KEY,
                wallet_address VARCHAR(255) NOT NULL,
                destination_address VARCHAR(255) NOT NULL,
                asset_ticker VARCHAR(32) NOT NULL,
                network VARCHAR(32) NOT NULL,
                amount_tokens DOUBLE PRECISION NOT NULL,
                gross_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                spot_price DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                source_type VARCHAR(40) NOT NULL DEFAULT 'ledger_withdrawal',
                tx_hash VARCHAR(255),
                explorer_url TEXT,
                queue_reason TEXT,
                status VARCHAR(40) NOT NULL DEFAULT 'QUEUED_FOR_L1_DISPATCH',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`
            ALTER TABLE tax_ledger_events ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(255);
        `);
        await client.query(`
            ALTER TABLE tax_ledger_events ADD COLUMN IF NOT EXISTS payout_address VARCHAR(255);
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS worker_profiles (
                worker_identity VARCHAR(255) PRIMARY KEY,
                wallet_address VARCHAR(255) NOT NULL DEFAULT '',
                worker_name VARCHAR(128) NOT NULL DEFAULT 'Rig',
                hashrate_ths DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                valid_shares BIGINT NOT NULL DEFAULT 0,
                rejected_shares BIGINT NOT NULL DEFAULT 0,
                acceptance_pct DOUBLE PRECISION NOT NULL DEFAULT 100.0,
                blocks_found BIGINT NOT NULL DEFAULT 0,
                last_share_ts BIGINT NOT NULL DEFAULT 0,
                status VARCHAR(32) NOT NULL DEFAULT 'online',
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
    } finally {
        client.release();
    }
}

export const GET: RequestHandler = async ({ request, cookies, url }: RequestEvent) => {
    try {
        getMasterKeyStrict();
    } catch (keyErr: any) {
        return json({ error: keyErr.message }, { status: 500 });
    }

    const clearance = await verifyDirectorClearance(request, cookies);
    if (!clearance.authorized) {
        return json(
            { error: 'FORBIDDEN: Master Director clearance required.' },
            { status: 403 }
        );
    }

    const rustBackendUrl =
        env.RUST_BACKEND_URL || `http://${env.UBUNTU_NODE_IP || '127.0.0.1'}:8002`;
    const internalToken = env.INTERNAL_ADMIN_TOKEN || env.PERENNIA_ADMIN_KEY || '';
    const requestedTable = url.searchParams.get('table');

    if (requestedTable) {
        if (!ALLOWED_TABLES.includes(requestedTable as any)) {
            return json(
                { error: `Table "${requestedTable}" is not authorized in the Director matrix.` },
                { status: 400 }
            );
        }
        await ensureAdminAuxiliaryTables().catch(() => {});
        try {
            const rustRes = await fetch(
                `${rustBackendUrl}/v1/admin/db/${encodeURIComponent(requestedTable)}`,
                {
                    headers: {
                        Authorization: `Bearer ${internalToken}`
                    },
                    signal: AbortSignal.timeout(4000)
                }
            );
            if (rustRes.ok) {
                const rows = await rustRes.json();
                return json({
                    table: requestedTable,
                    source: 'rust_admin_api',
                    rows: Array.isArray(rows) ? rows : []
                });
            }
        } catch {
        }

        let client;
        try {
            client = await dbPool.connect();
            const queryText = `SELECT row_to_json(t) AS data FROM (SELECT * FROM ${requestedTable} ORDER BY 1 DESC LIMIT 500) t`;
            const dbRes = await client.query(queryText);
            const rows = dbRes.rows.map((r) => r.data).filter(Boolean);
            return json({
                table: requestedTable,
                source: 'postgres_direct',
                rows
            });
        } catch (err: any) {
            return json(
                {
                    table: requestedTable,
                    rows: [],
                    error: err.message || 'Failed to query table.'
                },
                { status: 500 }
            );
        } finally {
            if (client) client.release();
        }
    }

    try {
        await ensureAdminAuxiliaryTables().catch(() => {});
        const [
            rawNettingQueue,
            rawPassthroughQueue,
            rawFiatQueueRedis,
            rawL1QueueRedis,
            stratumBoundAddr,
            fppsSolvencyRaw,
            hedgeStatusRaw,
            nettingProfitStr,
            unhedgedDeltaStr
        ] = await Promise.all([
            redis.lrange('perennia:sor:netting_queue', 0, 99),
            redis.lrange('perennia:sor:third_party_passthrough_queue', 0, 99),
            redis.lrange('perennia:fiat:payout_queue', 0, 99),
            redis.lrange('perennia:l1:payout_queue', 0, 99),
            redis.get('perennia:stratum:mining_address'),
            redis.get('perennia:pool:fpps_solvency'),
            redis.get('perennia:treasury:hedge_status'),
            redis.get('perennia:treasury:netting_profit_usd'),
            redis.get('perennia:treasury:unhedged_delta_kas')
        ]);

        const nettingQueue = (rawNettingQueue || [])
            .map((item) => {
                try {
                    return JSON.parse(item);
                } catch {
                    return null;
                }
            })
            .filter(Boolean);

        const passthroughQueue = (rawPassthroughQueue || [])
            .map((item) => {
                try {
                    return JSON.parse(item);
                } catch {
                    return null;
                }
            })
            .filter(Boolean);

        let fiatPayouts: any[] = [];
        let fiatOnrampOrders: any[] = [];
        let fiatBankRails: any[] = [];
        let l1Payouts: any[] = [];
        let whitelistedWallets: any[] = [];
        let commandCenters: any[] = [];

        let client;
        try {
            client = await dbPool.connect();
            const [fiatRes, onrampRes, bankRailsRes, l1Res, wlRes, ccRes] =
                await Promise.all([
                    client.query(
                        `SELECT * FROM fiat_payout_queue ORDER BY created_at DESC LIMIT 100`
                    ),
                    client.query(
                        `SELECT * FROM fiat_onramp_orders ORDER BY created_at DESC LIMIT 100`
                    ),
                    client.query(
                        `SELECT wallet_address, bank_label, account_type, payout_method, bank_last4, updated_at
                         FROM fiat_bank_rails
                         ORDER BY updated_at DESC
                         LIMIT 200`
                    ),
                    client.query(
                        `SELECT * FROM l1_payout_queue ORDER BY created_at DESC LIMIT 100`
                    ),
                    client.query(
                        `SELECT * FROM whitelisted_wallets ORDER BY created_at DESC LIMIT 200`
                    ),
                    client.query(
                        `SELECT wallet_address, last_updated,
                                jsonb_array_length(COALESCE(layout_state->'workers', '[]'::jsonb)) AS worker_count,
                                jsonb_array_length(COALESCE(layout_state->'sectors', '[]'::jsonb)) AS sector_count
                         FROM user_command_centers
                         ORDER BY last_updated DESC NULLS LAST
                         LIMIT 200`
                    )
                ]);
            fiatPayouts = fiatRes.rows;
            fiatOnrampOrders = onrampRes.rows;
            fiatBankRails = bankRailsRes.rows;
            l1Payouts = l1Res.rows;
            whitelistedWallets = wlRes.rows;
            commandCenters = ccRes.rows;
        } catch {
            fiatPayouts = (rawFiatQueueRedis || [])
                .map((item) => {
                    try {
                        return JSON.parse(item);
                    } catch {
                        return null;
                    }
                })
                .filter(Boolean);
            l1Payouts = (rawL1QueueRedis || [])
                .map((item) => {
                    try {
                        return JSON.parse(item);
                    } catch {
                        return null;
                    }
                })
                .filter(Boolean);
        } finally {
            if (client) client.release();
        }

        let bannedIps: {
            ip: string;
            elapsedSeconds: number;
            remainingSeconds: number;
        }[] = [];
        try {
            const shieldRes = await fetch(`${rustBackendUrl}/v1/admin/shield`, {
                headers: { Authorization: `Bearer ${internalToken}` },
                signal: AbortSignal.timeout(2500)
            });
            if (shieldRes.ok) {
                const shieldData = await shieldRes.json();
                if (Array.isArray(shieldData.bannedIps)) {
                    bannedIps = shieldData.bannedIps;
                }
            }
        } catch {
        }

        return json({
            adminWallet: clearance.adminWallet,
            allowedTables: ALLOWED_TABLES,
            stratumMiningAddress:
                stratumBoundAddr ||
                env.PERENNIA_TREASURY_KAS_ADDRESS ||
                MASTER_ADMIN_ADDRESS,
            nettingQueue,
            passthroughQueue,
            fiatPayouts,
            fiatOnrampOrders,
            fiatBankRails,
            l1Payouts,
            whitelistedWallets,
            commandCenters,
            bannedIps,
            nettingProfitUsd: nettingProfitStr ? parseFloat(nettingProfitStr) || 0 : 0,
            unhedgedDeltaKas: unhedgedDeltaStr ? parseFloat(unhedgedDeltaStr) || 0 : 0,
            fppsSolvency: fppsSolvencyRaw ? JSON.parse(fppsSolvencyRaw) : null,
            hedgeStatus: hedgeStatusRaw ? JSON.parse(hedgeStatusRaw) : null,
            timestamp: Date.now()
        });
    } catch (err: any) {
        return json(
            { error: err.message || 'Failed to load Director control plane telemetry.' },
            { status: 500 }
        );
    }
};

export const POST: RequestHandler = async ({ request, cookies }: RequestEvent) => {
    try {
        getMasterKeyStrict();
    } catch (keyErr: any) {
        return json({ error: keyErr.message }, { status: 500 });
    }

    const clearance = await verifyDirectorClearance(request, cookies);
    if (!clearance.authorized) {
        return json(
            { error: 'FORBIDDEN: Master Director clearance required.' },
            { status: 403 }
        );
    }

    const rustBackendUrl =
        env.RUST_BACKEND_URL || `http://${env.UBUNTU_NODE_IP || '127.0.0.1'}:8002`;
    const internalToken = env.INTERNAL_ADMIN_TOKEN || env.PERENNIA_ADMIN_KEY || '';

    try {
        const body = await request.json();
        const action = String(body.action || '').toUpperCase();
        await ensureAdminAuxiliaryTables().catch(() => {});

        if (action === 'FORCE_EPOCH_BELL') {
            await redis.set('perennia:chronos:last_epoch_bell_ts', '0');
            await redis.set('perennia:chronos:force_bell_now', '1');
            let epochTelemetry = null;
            try {
                const rustRes = await fetch(`${rustBackendUrl}/v1/admin/epoch-bell`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${internalToken}`
                    },
                    signal: AbortSignal.timeout(4500)
                });
                if (rustRes.ok) {
                    const rustData = await rustRes.json();
                    epochTelemetry = rustData.epochTelemetry || null;
                }
            } catch {
            }
            if (!epochTelemetry) {
                const rawEpoch = await redis.get('perennia:settlement:epoch_telemetry');
                if (rawEpoch) {
                    try {
                        epochTelemetry = JSON.parse(rawEpoch);
                    } catch {
                        epochTelemetry = null;
                    }
                }
            }
            return json({
                success: true,
                action: 'FORCE_EPOCH_BELL',
                epochTelemetry,
                message:
                    '22:00 UTC Global Settlement Bell sweep triggered across all eligible pool buckets.'
            });
        }

        if (action === 'CONFIRM_L1_PAYOUT' || action === 'REFUND_L1_PAYOUT') {
            const payoutId = String(body.payoutId || '').trim();
            if (!payoutId) {
                return json({ error: 'Missing payoutId.' }, { status: 400 });
            }
            let client;
            try {
                client = await dbPool.connect();
                const existing = await client.query(
                    `SELECT * FROM l1_payout_queue WHERE payout_id = $1 LIMIT 1`,
                    [payoutId]
                );
                if (existing.rows.length === 0) {
                    return json(
                        { error: `L1 payout record ${payoutId} not found.` },
                        { status: 404 }
                    );
                }
                const row = existing.rows[0];
                const cleanWallet = normalizeKaspaBase32(String(row.wallet_address || ''));
                const prefixedWallet = `kaspa:${cleanWallet}`;
                const assetTicker = String(row.asset_ticker || 'KAS').toUpperCase();
                const amountTokens = Math.max(0, Number(row.amount_tokens || 0));
                const grossUsd = Math.max(0, Number(row.gross_usd || 0));
                const spotPrice = Math.max(0, Number(row.spot_price || 0));

                if (action === 'CONFIRM_L1_PAYOUT') {
                    const resolvedTxHash =
                        String(body.txHash || '').trim() ||
                        `0x${crypto.randomBytes(32).toString('hex')}`;
                    const explorerUrl = buildExplorerTxUrl(assetTicker, resolvedTxHash);
                    await client.query(
                        `UPDATE l1_payout_queue
                         SET status = 'DISPATCHED_ONCHAIN',
                             tx_hash = $2,
                             explorer_url = $3,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE payout_id = $1`,
                        [payoutId, resolvedTxHash, explorerUrl]
                    );
                    await client.query(
                        `UPDATE tax_ledger_events
                         SET tx_hash = $2
                         WHERE tx_hash = $1`,
                        [payoutId, resolvedTxHash]
                    );
                    await client.query(
                        `INSERT INTO pending_transactions (tx_id, wallet_address, amount_kas, action_type, status)
                         VALUES ($1, $2, $3, 'L1_MULTI_CHAIN_PAYOUT', 'SETTLED')
                         ON CONFLICT (tx_id) DO UPDATE SET status = 'SETTLED'`,
                        [resolvedTxHash, prefixedWallet, amountTokens]
                    );
                    await redis.publish(
                        'telemetry:updates',
                        JSON.stringify({
                            l1_event: true,
                            fiat_event: true,
                            eventType: 'L1_DISPATCHED',
                            wallet: cleanWallet,
                            payoutId,
                            assetTicker,
                            amountTokens,
                            txHash: resolvedTxHash,
                            explorerUrl
                        })
                    );
                    return json({
                        success: true,
                        action: 'CONFIRM_L1_PAYOUT',
                        payoutId,
                        wallet: prefixedWallet,
                        assetTicker,
                        amountTokens,
                        txHash: resolvedTxHash,
                        explorerUrl,
                        status: 'DISPATCHED_ONCHAIN'
                    });
                } else {
                    if (
                        row.status === 'DISPATCHED_ONCHAIN' ||
                        row.status === 'REFUNDED_TO_LEDGER'
                    ) {
                        return json(
                            {
                                error: `L1 payout ${payoutId} is already ${row.status}.`
                            },
                            { status: 400 }
                        );
                    }
                    const userLedgerKey = `dev:sor:treasury:balances:${cleanWallet}`;
                    await redis.hincrbyfloat(userLedgerKey, assetTicker, amountTokens);
                    await client.query(
                        `UPDATE l1_payout_queue
                         SET status = 'REFUNDED_TO_LEDGER',
                             updated_at = CURRENT_TIMESTAMP
                         WHERE payout_id = $1`,
                        [payoutId]
                    );
                    await client.query(
                        `INSERT INTO tax_ledger_events (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash)
                         VALUES ($1, $2, 'L1_REFUND', $3, $4, $5, $6)`,
                        [
                            cleanWallet,
                            assetTicker,
                            grossUsd,
                            amountTokens,
                            spotPrice,
                            payoutId
                        ]
                    );
                    await redis.publish(
                        'telemetry:updates',
                        JSON.stringify({
                            l1_event: true,
                            fiat_event: true,
                            eventType: 'L1_REFUND',
                            wallet: cleanWallet,
                            payoutId,
                            assetTicker,
                            amountTokens
                        })
                    );
                    return json({
                        success: true,
                        action: 'REFUND_L1_PAYOUT',
                        payoutId,
                        wallet: prefixedWallet,
                        refundedAsset: assetTicker,
                        refundedAmount: amountTokens,
                        status: 'REFUNDED_TO_LEDGER'
                    });
                }
            } finally {
                if (client) client.release();
            }
        }

        if (action === 'BULK_SETTLE_FIAT_PAYOUTS') {
            const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const randHex = crypto.randomBytes(2).toString('hex').toUpperCase();
            const batchTracePrefix =
                String(body.batchTracePrefix || '').trim() ||
                `ACH-BATCH-${dateStamp}-${randHex}`;
            let settledCount = 0;
            let totalDispatchedUsd = 0;
            const settledRecords: Array<{
                payoutId: string;
                wallet: string;
                traceId: string;
                netFiatUsd: number;
            }> = [];
            let client;
            try {
                client = await dbPool.connect();
                const pendingRes = await client.query(
                    `SELECT payout_id, wallet_address, net_fiat_usd
                     FROM fiat_payout_queue
                     WHERE status = 'QUEUED_FOR_TREASURY_DISPATCH'
                     ORDER BY created_at ASC`
                );
                for (let i = 0; i < pendingRes.rows.length; i++) {
                    const row = pendingRes.rows[i];
                    const pid = String(row.payout_id || '');
                    const wAddr = String(row.wallet_address || '');
                    const netUsd = Number(row.net_fiat_usd || 0);
                    const traceId = `${batchTracePrefix}-${String(i + 1).padStart(3, '0')}`;
                    await client.query(
                        `UPDATE fiat_payout_queue
                         SET status = 'DISPATCHED_BY_DIRECTOR',
                             trace_id = $2,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE payout_id = $1 AND status = 'QUEUED_FOR_TREASURY_DISPATCH'`,
                        [pid, traceId]
                    );
                    settledCount += 1;
                    totalDispatchedUsd += netUsd;
                    settledRecords.push({
                        payoutId: pid,
                        wallet: normalizeKaspaBase32(wAddr),
                        traceId,
                        netFiatUsd: netUsd
                    });
                }
            } finally {
                if (client) client.release();
            }

            for (const rec of settledRecords) {
                await redis.publish(
                    'telemetry:updates',
                    JSON.stringify({
                        fiat_event: true,
                        eventType: 'FIAT_DISPATCHED',
                        wallet: rec.wallet,
                        payoutId: rec.payoutId,
                        traceId: rec.traceId,
                        netFiatUsd: rec.netFiatUsd
                    })
                );
            }
            return json({
                success: true,
                action: 'BULK_SETTLE_FIAT_PAYOUTS',
                settledCount,
                totalDispatchedUsd: Number(totalDispatchedUsd.toFixed(2)),
                batchTracePrefix
            });
        }

        if (action === 'BAN_IP' || action === 'UNBAN_IP') {
            const ip = String(body.ip || '').trim();
            if (!ip) {
                return json({ error: 'IP address is required.' }, { status: 400 });
            }
            const shieldMode = action === 'UNBAN_IP' ? 'UNBAN' : 'BAN';
            const res = await fetch(`${rustBackendUrl}/v1/admin/shield`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${internalToken}`
                },
                body: JSON.stringify({ ip, action: shieldMode })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                return json(
                    { error: errData.error || 'Failed to update Stratum IP Shield.' },
                    { status: 502 }
                );
            }
            return json(await res.json());
        }

        if (action === 'ADD_WHITELIST') {
            const rawWallet = String(body.wallet || '').trim();
            const label = String(body.label || 'Director Whitelisted').trim();
            const clean = normalizeKaspaBase32(rawWallet);
            if (clean.length < 55) {
                return json({ error: 'Invalid Kaspa wallet address.' }, { status: 400 });
            }
            const prefixed = `kaspa:${clean}`;
            let client;
            try {
                client = await dbPool.connect();
                await client.query(
                    `INSERT INTO whitelisted_wallets (wallet_address, label)
                     VALUES ($1, $2)
                     ON CONFLICT (wallet_address) DO UPDATE SET label = EXCLUDED.label`,
                    [prefixed, label]
                );
            } finally {
                if (client) client.release();
            }
            fetch(`${rustBackendUrl}/v1/admin/whitelist`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${internalToken}`
                },
                body: JSON.stringify({ wallet: prefixed, label })
            }).catch(() => {});
            return json({ success: true, wallet: prefixed, label });
        }

        if (action === 'REMOVE_WHITELIST') {
            const rawWallet = String(body.wallet || '').trim();
            const clean = normalizeKaspaBase32(rawWallet);
            const prefixed = `kaspa:${clean}`;
            let client;
            try {
                client = await dbPool.connect();
                await client.query(
                    `DELETE FROM whitelisted_wallets WHERE wallet_address = $1 OR wallet_address = $2`,
                    [prefixed, clean]
                );
            } finally {
                if (client) client.release();
            }
            fetch(`${rustBackendUrl}/v1/admin/whitelist`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${internalToken}`
                },
                body: JSON.stringify({ wallet: prefixed })
            }).catch(() => {});
            return json({ success: true, removed: prefixed });
        }

        if (action === 'DECRYPT_BANK_RAIL') {
            let targetWallet = String(body.wallet || '').trim();
            const payoutId = String(body.payoutId || '').trim();
            if (!targetWallet && payoutId) {
                const pRes = await dbPool.query(
                    `SELECT wallet_address FROM fiat_payout_queue WHERE payout_id = $1 LIMIT 1`,
                    [payoutId]
                );
                if (pRes.rows.length > 0) {
                    targetWallet = String(pRes.rows[0].wallet_address || '');
                }
            }
            if (!targetWallet) {
                return json(
                    { error: 'Missing wallet or payoutId to decrypt bank rail.' },
                    { status: 400 }
                );
            }
            const decrypted = await resolveDecryptedBankRailForWallet(targetWallet);
            if (!decrypted) {
                return json(
                    {
                        error: `No encrypted bank rail record found in vault for ${targetWallet}.`
                    },
                    { status: 404 }
                );
            }
            return json({
                success: true,
                payoutId: payoutId || null,
                bankRail: decrypted
            });
        }

        if (action === 'EXPORT_BATCH_ACH_CSV') {
            const pendingRes = await dbPool.query(
                `SELECT payout_id, wallet_address, source_type, source_asset, amount_crypto, gross_usd, fee_usd, net_fiat_usd, payout_method, bank_last4, created_at
                 FROM fiat_payout_queue
                 WHERE status = 'QUEUED_FOR_TREASURY_DISPATCH'
                 ORDER BY created_at ASC`
            );
            const header =
                'Payout_ID,Wallet_Address,Bank_Label,Account_Type,Payout_Method,ABA_Routing_Number,Account_Number,Net_USD_Amount,Gross_USD,Fee_USD,Source_Asset,Amount_Crypto,Created_At';
            const csvLines: string[] = [header];
            const batchRows: any[] = [];
            for (const r of pendingRes.rows) {
                const dec = await resolveDecryptedBankRailForWallet(
                    String(r.wallet_address || '')
                );
                const routingNumber = dec?.routingNumber || 'UNLINKED';
                const accountNumber = dec?.accountNumber || `*${r.bank_last4 || '0000'}`;
                const bankLabel = (dec?.bankLabel || 'Primary Operating Account').replace(
                    /,/g,
                    ' '
                );
                const accountType = dec?.accountType || 'CHECKING';
                const method = String(
                    r.payout_method || dec?.payoutMethod || 'ACH'
                ).toUpperCase();
                const netUsd = Number(r.net_fiat_usd || 0).toFixed(2);
                const grossUsd = Number(r.gross_usd || 0).toFixed(2);
                const feeUsd = Number(r.fee_usd || 0).toFixed(2);
                const amtCrypto = Number(r.amount_crypto || 0).toFixed(6);
                const createdIso = r.created_at
                    ? new Date(r.created_at).toISOString()
                    : new Date().toISOString();
                csvLines.push(
                    [
                        r.payout_id,
                        r.wallet_address,
                        bankLabel,
                        accountType,
                        method,
                        routingNumber,
                        accountNumber,
                        netUsd,
                        grossUsd,
                        feeUsd,
                        r.source_asset || 'KAS',
                        amtCrypto,
                        createdIso
                    ].join(',')
                );
                batchRows.push({
                    payoutId: r.payout_id,
                    walletAddress: r.wallet_address,
                    bankLabel,
                    accountType,
                    payoutMethod: method,
                    routingNumber,
                    accountNumber,
                    netFiatUsd: Number(netUsd)
                });
            }
            return json({
                success: true,
                count: batchRows.length,
                csvContent: csvLines.join('\n'),
                batchRows
            });
        }

        if (action === 'SETTLE_FIAT_PAYOUT') {
            const payoutId = String(body.payoutId || '').trim();
            if (!payoutId) {
                return json({ error: 'Missing payoutId.' }, { status: 400 });
            }
            const traceId =
                String(body.traceId || '').trim() ||
                `ACH-TRACE-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
            let walletAddress = '';
            let netFiatUsd = 0;
            let client;
            try {
                client = await dbPool.connect();
                const updated = await client.query(
                    `UPDATE fiat_payout_queue
                     SET status = 'DISPATCHED_BY_DIRECTOR',
                         trace_id = $2,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE payout_id = $1 AND status = 'QUEUED_FOR_TREASURY_DISPATCH'
                     RETURNING wallet_address, net_fiat_usd`,
                    [payoutId, traceId]
                );
                if (updated.rows.length === 0) {
                    return json(
                        {
                            error: `Fiat payout ${payoutId} not found or already finalized.`
                        },
                        { status: 400 }
                    );
                }
                walletAddress = String(updated.rows[0].wallet_address || '');
                netFiatUsd = Number(updated.rows[0].net_fiat_usd || 0);
            } finally {
                if (client) client.release();
            }

            const cleanWallet = normalizeKaspaBase32(walletAddress);
            await redis.publish(
                'telemetry:updates',
                JSON.stringify({
                    fiat_event: true,
                    eventType: 'FIAT_DISPATCHED',
                    wallet: cleanWallet,
                    payoutId,
                    traceId,
                    netFiatUsd
                })
            );
            return json({
                success: true,
                payoutId,
                traceId,
                status: 'DISPATCHED_BY_DIRECTOR'
            });
        }

        if (action === 'REFUND_FIAT_PAYOUT') {
            const payoutId = String(body.payoutId || '').trim();
            if (!payoutId) {
                return json({ error: 'Missing payoutId to refund.' }, { status: 400 });
            }
            let client;
            try {
                client = await dbPool.connect();
                const existing = await client.query(
                    `SELECT payout_id, wallet_address, source_asset, amount_crypto, gross_usd, fee_usd, status
                     FROM fiat_payout_queue
                     WHERE payout_id = $1
                     LIMIT 1`,
                    [payoutId]
                );
                if (existing.rows.length === 0) {
                    return json(
                        { error: `Fiat payout ${payoutId} not found.` },
                        { status: 404 }
                    );
                }
                const row = existing.rows[0];
                if (row.status !== 'QUEUED_FOR_TREASURY_DISPATCH') {
                    return json(
                        {
                            error: `Fiat payout ${payoutId} cannot be refunded from status ${row.status}.`
                        },
                        { status: 400 }
                    );
                }
                const cleanWallet = normalizeKaspaBase32(String(row.wallet_address || ''));
                const sourceAsset = String(row.source_asset || 'KAS').toUpperCase();
                const amountCrypto = Math.max(0, Number(row.amount_crypto || 0));
                const grossUsd = Math.max(0, Number(row.gross_usd || 0));
                const feeUsd = Math.max(0, Number(row.fee_usd || 0));
                if (!cleanWallet || amountCrypto <= 0) {
                    return json(
                        { error: 'Invalid wallet or crypto amount on fiat payout record.' },
                        { status: 400 }
                    );
                }
                const userLedgerKey = `dev:sor:treasury:balances:${cleanWallet}`;
                await redis.hincrbyfloat(userLedgerKey, sourceAsset, amountCrypto);
                if (feeUsd > 0) {
                    await redis
                        .eval(
                            LUA_CLAMPED_FEE_REVERSAL,
                            1,
                            'perennia:treasury:netting_profit_usd',
                            feeUsd.toString()
                        )
                        .catch(() => {});
                }
                await client.query(
                    `UPDATE fiat_payout_queue
                     SET status = 'REFUNDED_TO_LEDGER', updated_at = CURRENT_TIMESTAMP
                     WHERE payout_id = $1`,
                    [payoutId]
                );
                const spot = amountCrypto > 0 ? grossUsd / amountCrypto : 1.0;
                await client.query(
                    `INSERT INTO tax_ledger_events (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash)
                     VALUES ($1, $2, 'FIAT_REFUND', $3, $4, $5, $6)`,
                    [cleanWallet, sourceAsset, grossUsd, amountCrypto, spot, payoutId]
                );
                await redis.publish(
                    'telemetry:updates',
                    JSON.stringify({
                        fiat_event: true,
                        eventType: 'FIAT_REFUND',
                        wallet: cleanWallet,
                        payoutId,
                        assetTicker: sourceAsset,
                        amountTokens: amountCrypto
                    })
                );
                return json({
                    success: true,
                    payoutId,
                    status: 'REFUNDED_TO_LEDGER',
                    wallet: `kaspa:${cleanWallet}`,
                    refundedAsset: sourceAsset,
                    refundedAmount: amountCrypto
                });
            } finally {
                if (client) client.release();
            }
        }

        if (action === 'FULFILL_FIAT_ONRAMP' || action === 'CANCEL_FIAT_ONRAMP') {
            const orderId = String(body.orderId || '').trim();
            if (!orderId) {
                return json({ error: 'Missing orderId.' }, { status: 400 });
            }
            let client;
            try {
                client = await dbPool.connect();
                const existing = await client.query(
                    `SELECT * FROM fiat_onramp_orders WHERE order_id = $1 LIMIT 1`,
                    [orderId]
                );
                if (existing.rows.length === 0) {
                    return json(
                        { error: `Fiat on-ramp order ${orderId} not found.` },
                        { status: 404 }
                    );
                }
                const row = existing.rows[0];
                if (row.status === 'COMPLETED' || row.status === 'CANCELLED') {
                    return json(
                        {
                            error: `Fiat on-ramp order ${orderId} is already ${row.status}.`
                        },
                        { status: 400 }
                    );
                }
                const cleanWallet = normalizeKaspaBase32(String(row.wallet_address || ''));
                const prefixedWallet = `kaspa:${cleanWallet}`;
                if (action === 'CANCEL_FIAT_ONRAMP') {
                    await client.query(
                        `UPDATE fiat_onramp_orders
                         SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
                         WHERE order_id = $1`,
                        [orderId]
                    );
                    const sessionKey = `perennia:fiat:onramp_session:${orderId}`;
                    const rawSession = await redis.get(sessionKey);
                    if (rawSession) {
                        try {
                            const parsed = JSON.parse(rawSession);
                            parsed.status = 'CANCELLED';
                            await redis.set(sessionKey, JSON.stringify(parsed), 'EX', 86400);
                        } catch {
                        }
                    }
                    await redis.publish(
                        'telemetry:updates',
                        JSON.stringify({
                            fiat_event: true,
                            eventType: 'FIAT_ONRAMP',
                            status: 'CANCELLED',
                            wallet: cleanWallet,
                            sessionId: orderId
                        })
                    );
                    return json({
                        success: true,
                        orderId,
                        status: 'CANCELLED'
                    });
                }

                const fiatAmountUsd = Math.max(0, Number(row.fiat_amount_usd || 0));
                const feeUsd = Math.max(0, Number(row.fee_usd || 0));
                const netUsdConverted = Math.max(0, Number(row.net_usd_converted || 0));
                const lockedSpot = Math.max(0, Number(row.locked_spot_price || 0.12));
                const liveSpotStr = await redis.get('oracle:spot:KAS_USDC');
                const liveSpot = liveSpotStr ? parseFloat(liveSpotStr) || 0 : 0;
                const executionSpot =
                    liveSpot > 0 ? liveSpot : lockedSpot > 0 ? lockedSpot : 0.12;
                const deliveredKas = Number((netUsdConverted / executionSpot).toFixed(4));
                const settlementTarget =
                    String(
                        body.settlementTarget || row.settlement_target || 'LEDGER_KAS'
                    ).toUpperCase() === 'L1_KAS'
                        ? 'L1_KAS'
                        : 'LEDGER_KAS';
                let resolvedTxHash = String(body.txHash || '').trim();

                if (settlementTarget === 'L1_KAS') {
                    const rustRes = await fetch(`${rustBackendUrl}/v1/state/action`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${internalToken}`
                        },
                        body: JSON.stringify({
                            wallet: 'kaspa:treasury_master',
                            action: 'DISPATCH_OTC_UTXOS',
                            payload: {
                                destination: prefixedWallet,
                                amount: deliveredKas,
                                asset: 'KAS'
                            }
                        })
                    });
                    const rustData = await rustRes.json().catch(() => ({}));
                    if (!rustRes.ok || !rustData.success) {
                        return json(
                            {
                                error:
                                    rustData.error ||
                                    'L1 KAS dispatch from Master Treasury failed. Verify Treasury UTXO mass or select Internal Ledger fulfillment.'
                            },
                            { status: 502 }
                        );
                    }
                    resolvedTxHash =
                        rustData.transaction_id ||
                        resolvedTxHash ||
                        `L1-ONRAMP-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
                } else {
                    const userLedgerKey = `dev:sor:treasury:balances:${cleanWallet}`;
                    await redis.hincrbyfloat(userLedgerKey, 'KAS', deliveredKas);
                    if (!resolvedTxHash) {
                        resolvedTxHash = `LEDGER-ONRAMP-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
                    }
                }

                await client.query(
                    `UPDATE fiat_onramp_orders
                     SET status = 'COMPLETED',
                         delivered_kas = $2,
                         tx_hash = $3,
                         settlement_target = $4,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE order_id = $1`,
                    [orderId, deliveredKas, resolvedTxHash, settlementTarget]
                );
                await client.query(
                    `INSERT INTO tax_ledger_events (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash)
                     VALUES ($1, 'KAS', 'FIAT_ONRAMP', $2, $3, $4, $5)`,
                    [cleanWallet, fiatAmountUsd, deliveredKas, executionSpot, resolvedTxHash]
                );
                await redis.rpush(
                    'perennia:sor:netting_queue',
                    JSON.stringify({
                        wallet: 'kaspa:treasury_onramp_credit',
                        direction: 'BUY_KAS',
                        amount_kas: deliveredKas,
                        spot_price: executionSpot,
                        fee_captured_usd: feeUsd,
                        target_asset: 'USD',
                        estimated_output: deliveredKas
                    })
                );
                const sessionKey = `perennia:fiat:onramp_session:${orderId}`;
                const existingRaw = await redis.get(sessionKey);
                const existingSession = existingRaw ? JSON.parse(existingRaw) : {};
                const updatedSession = {
                    ...existingSession,
                    sessionId: orderId,
                    orderId,
                    walletAddress: prefixedWallet,
                    fiatAmountUsd,
                    deliveredKas,
                    spotPrice: executionSpot,
                    settlementTarget,
                    txHash: resolvedTxHash,
                    status: 'COMPLETED',
                    updatedAt: new Date().toISOString()
                };
                await redis.set(sessionKey, JSON.stringify(updatedSession), 'EX', 86400);
                await redis.publish(
                    'telemetry:updates',
                    JSON.stringify({
                        fiat_event: true,
                        eventType: 'FIAT_ONRAMP',
                        status: 'COMPLETED',
                        wallet: cleanWallet,
                        sessionId: orderId,
                        assetTicker: 'KAS',
                        amountTokens: deliveredKas,
                        fiatAmountUsd,
                        spotPrice: executionSpot,
                        txHash: resolvedTxHash
                    })
                );
                return json({
                    success: true,
                    orderId,
                    wallet: prefixedWallet,
                    deliveredKas,
                    spotPrice: executionSpot,
                    settlementTarget,
                    txHash: resolvedTxHash,
                    status: 'COMPLETED'
                });
            } finally {
                if (client) client.release();
            }
        }

        if (
            action === 'CONFIRM_PASSTHROUGH_FILL' ||
            action === 'REFUND_PASSTHROUGH_ORDER'
        ) {
            const queueKey = 'perennia:sor:third_party_passthrough_queue';
            const rawQueue = await redis.lrange(queueKey, 0, 199);
            const orderIndex =
                typeof body.orderIndex === 'number' && body.orderIndex >= 0
                    ? body.orderIndex
                    : -1;
            let matchedRaw: string | null = null;
            let matchedOrder: any = null;
            if (orderIndex >= 0 && orderIndex < rawQueue.length) {
                matchedRaw = rawQueue[orderIndex];
                try {
                    matchedOrder = JSON.parse(matchedRaw);
                } catch {
                    matchedOrder = null;
                }
            }
            if (!matchedOrder && body.wallet) {
                const targetClean = normalizeKaspaBase32(String(body.wallet));
                const targetTicker = String(body.targetAsset || '').trim().toUpperCase();
                for (const itemStr of rawQueue) {
                    try {
                        const parsed = JSON.parse(itemStr);
                        const itemClean = normalizeKaspaBase32(String(parsed.wallet || ''));
                        const itemTicker = String(parsed.target_asset || '')
                            .trim()
                            .toUpperCase();
                        if (
                            itemClean === targetClean &&
                            (!targetTicker || itemTicker === targetTicker)
                        ) {
                            matchedRaw = itemStr;
                            matchedOrder = parsed;
                            break;
                        }
                    } catch {
                        // Ignore malformed entry
                    }
                }
            }
            if (matchedRaw) {
                await redis.lrem(queueKey, 1, matchedRaw);
            }
            const effectiveOrder = matchedOrder || {
                wallet: body.wallet || '',
                destination_l1_address: body.destination || body.wallet || '',
                target_asset: body.targetAsset || 'CUSTOM',
                gross_kas: Number(body.grossKas || 0),
                upfront_fee_kas: Number(body.upfrontFeeKas || 0),
                net_passthrough_kas: Number(body.netPassthroughKas || 0),
                estimated_output: Number(body.estimatedOutput || 0),
                spot_price: Number(body.spotPrice || 0)
            };
            const cleanWallet = normalizeKaspaBase32(String(effectiveOrder.wallet || ''));
            const prefixedWallet = `kaspa:${cleanWallet}`;
            const targetAsset = String(effectiveOrder.target_asset || 'CUSTOM')
                .trim()
                .toUpperCase();
            const grossKas = Math.max(
                0,
                Number(
                    effectiveOrder.gross_kas ||
                        Number(effectiveOrder.net_passthrough_kas || 0) +
                            Number(effectiveOrder.upfront_fee_kas || 0)
                )
            );
            const upfrontFeeKas = Math.max(0, Number(effectiveOrder.upfront_fee_kas || 0));
            const estimatedOutput = Math.max(
                0,
                Number(effectiveOrder.estimated_output || 0)
            );
            const spotPrice = Math.max(0, Number(effectiveOrder.spot_price || 0));

            if (action === 'CONFIRM_PASSTHROUGH_FILL') {
                const resolvedTxHash =
                    String(body.txHash || '').trim() ||
                    `PT-FILL-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
                const kasSpotStr = await redis.get('oracle:spot:KAS_USDC');
                const kasSpot = kasSpotStr ? parseFloat(kasSpotStr) || 0.12 : 0.12;
                const grossUsd =
                    spotPrice > 0 && estimatedOutput > 0
                        ? estimatedOutput * spotPrice
                        : grossKas * kasSpot;
                let client;
                try {
                    client = await dbPool.connect();
                    await client.query(
                        `INSERT INTO pending_transactions (tx_id, wallet_address, amount_kas, action_type, status)
                         VALUES ($1, $2, $3, 'PASSTHROUGH_L1_FILL', 'SETTLED')
                         ON CONFLICT (tx_id) DO UPDATE SET status = 'SETTLED'`,
                        [resolvedTxHash, prefixedWallet, grossKas]
                    );
                    if (cleanWallet) {
                        await client.query(
                            `INSERT INTO tax_ledger_events (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash)
                             VALUES ($1, $2, 'PASSTHROUGH_SETTLED', $3, $4, $5, $6)`,
                            [
                                cleanWallet,
                                targetAsset,
                                grossUsd,
                                estimatedOutput > 0 ? estimatedOutput : grossKas,
                                spotPrice > 0 ? spotPrice : kasSpot,
                                resolvedTxHash
                            ]
                        );
                    }
                } finally {
                    if (client) client.release();
                }
                await redis.publish(
                    'telemetry:updates',
                    JSON.stringify({
                        fiat_event: true,
                        eventType: 'PASSTHROUGH_SETTLED',
                        wallet: cleanWallet,
                        assetTicker: targetAsset,
                        amountTokens: estimatedOutput,
                        txHash: resolvedTxHash
                    })
                );
                return json({
                    success: true,
                    action: 'CONFIRM_PASSTHROUGH_FILL',
                    wallet: prefixedWallet,
                    targetAsset,
                    grossKas,
                    estimatedOutput,
                    txHash: resolvedTxHash
                });
            } else {
                if (!cleanWallet || grossKas <= 0) {
                    return json(
                        {
                            error: 'Cannot refund pass-through order: missing miner wallet or gross_kas amount.'
                        },
                        { status: 400 }
                    );
                }
                const userLedgerKey = `dev:sor:treasury:balances:${cleanWallet}`;
                await redis.hincrbyfloat(userLedgerKey, 'KAS', grossKas);
                if (upfrontFeeKas > 0) {
                    await redis
                        .eval(
                            LUA_CLAMPED_FEE_REVERSAL,
                            1,
                            'perennia:fees:batch_accumulated:KAS',
                            upfrontFeeKas.toString()
                        )
                        .catch(() => {});
                }
                const kasSpotStr = await redis.get('oracle:spot:KAS_USDC');
                const kasSpot = kasSpotStr ? parseFloat(kasSpotStr) || 0.12 : 0.12;
                let client;
                try {
                    client = await dbPool.connect();
                    await client.query(
                        `INSERT INTO tax_ledger_events (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution)
                         VALUES ($1, 'KAS', 'PASSTHROUGH_REFUND', $2, $3, $4)`,
                        [cleanWallet, grossKas * kasSpot, grossKas, kasSpot]
                    );
                } finally {
                    if (client) client.release();
                }
                await redis.publish(
                    'telemetry:updates',
                    JSON.stringify({
                        fiat_event: true,
                        eventType: 'PASSTHROUGH_REFUND',
                        wallet: cleanWallet,
                        assetTicker: 'KAS',
                        amountTokens: grossKas
                    })
                );
                return json({
                    success: true,
                    action: 'REFUND_PASSTHROUGH_ORDER',
                    wallet: prefixedWallet,
                    refundedKas: grossKas,
                    reversedFeeKas: upfrontFeeKas
                });
            }
        }

        if (action === 'POP_PASSTHROUGH_QUEUE') {
            const popped = await redis.lpop('perennia:sor:third_party_passthrough_queue');
            return json({
                success: true,
                popped: popped ? JSON.parse(popped) : null
            });
        }

        return json({ error: `Unsupported Director action: ${action}` }, { status: 400 });
    } catch (err: any) {
        return json(
            { error: err.message || 'Director action execution failed.' },
            { status: 500 }
        );
    }
};