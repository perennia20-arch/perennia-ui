import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import Stripe from 'stripe';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
    getKycMasterKeyStrict,
    decryptBankRailRecordStrict,
    resolveMasterTreasuryKasAddress,
    resolveMasterTreasuryKasAddressOptional,
    isWalletMasterAdmin,
    normalizeKaspaBase32Strict,
    perenniaKMS
} from '$lib/server/kms';
import {
    buildExplorerTxUrl,
    computeReservoirHmac,
    executeOrQueueL1Dispatch
} from '$lib/server/l1Dispatcher';

const ALLOWED_TABLES = [
    'system_treasury_config',
    'user_cold_vault_rules',
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
    'fiat_float_ledger',
    'fiat_post_trade_sweeps',
    'l1_payout_queue',
    'rwa_oracle_feeds',
    'forge_vesting_schedules',
    'forge_monetary_policies',
    'forge_mineable_vaults',
    'idempotent_payout_batches',
    'client_cold_vault_registry',
    'treasury_airlock_sweeps',
    'hifo_tax_lots',
    'hifo_disposal_matches',
    'token_steering_matrix',
    'security_firewall_blacklist',
    'director_audit_log',
    'corporate_expense_vouchers',
    'corporate_owner_draws'
] as const;

const DEFAULT_RESERVE_WHITELIST_ASSETS: Array<{
    ticker: string;
    name: string;
    network: string;
    steeringState: string;
    isWhitelisted: boolean;
    targetWeightPct: number;
}> = [
    {
        ticker: 'KAS',
        name: 'Kaspa Native L1',
        network: 'KAS',
        steeringState: 'AUTO_BALANCE',
        isWhitelisted: true,
        targetWeightPct: 35.0
    },
    {
        ticker: 'USDC',
        name: 'USD Coin Reserve',
        network: 'ETH',
        steeringState: 'AUTO_BALANCE',
        isWhitelisted: true,
        targetWeightPct: 20.0
    },
    {
        ticker: 'USDT',
        name: 'Tether USD Reserve',
        network: 'ETH',
        steeringState: 'AUTO_BALANCE',
        isWhitelisted: true,
        targetWeightPct: 10.0
    },
    {
        ticker: 'BTC',
        name: 'Bitcoin L1 Reserve',
        network: 'BTC',
        steeringState: 'AUTO_BALANCE',
        isWhitelisted: true,
        targetWeightPct: 15.0
    },
    {
        ticker: 'ETH',
        name: 'Ethereum L1 Reserve',
        network: 'ETH',
        steeringState: 'AUTO_BALANCE',
        isWhitelisted: true,
        targetWeightPct: 10.0
    },
    {
        ticker: 'SOL',
        name: 'Solana L1 Reserve',
        network: 'SOL',
        steeringState: 'AUTO_BALANCE',
        isWhitelisted: true,
        targetWeightPct: 5.0
    },
    {
        ticker: 'SILO',
        name: 'Perennia Silo Utility (KRC-20)',
        network: 'KAS',
        steeringState: 'AUTO_BALANCE',
        isWhitelisted: true,
        targetWeightPct: 5.0
    }
];

const LUA_CLAMPED_FEE_REVERSAL = `
local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
local rev = tonumber(ARGV[1] or '0')
local next_val = math.max(0, cur - rev)
redis.call('SET', KEYS[1], tostring(next_val))
return tostring(next_val)
`;

function roundCents(val: number): number {
    return Math.round(val * 100) / 100;
}

function safeNormalizeBase32(walletRaw: string): string {
    try {
        return normalizeKaspaBase32Strict(walletRaw);
    } catch {
        return '';
    }
}

function matchesConfiguredAdminBearer(authHeader: string): boolean {
    if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
    try {
        if (perenniaKMS.verifyMasterAdminKey(authHeader)) {
            return true;
        }
    } catch {
        // Fall through to explicit constant-time env token comparison
    }
    const cleanAdminKey = String(env.PERENNIA_ADMIN_KEY || '')
        .trim()
        .replace(/^['"]|['"]$/g, '');
    const cleanInternalToken = String(env.INTERNAL_ADMIN_TOKEN || '')
        .trim()
        .replace(/^['"]|['"]$/g, '');
    const candidates = [
        cleanAdminKey ? `Bearer ${cleanAdminKey}` : '',
        cleanInternalToken ? `Bearer ${cleanInternalToken}` : ''
    ].filter(Boolean);

    const providedBuf = Buffer.from(authHeader.trim());
    return candidates.some((expected) => {
        const expectedBuf = Buffer.from(expected);
        return (
            expectedBuf.length === providedBuf.length &&
            crypto.timingSafeEqual(expectedBuf, providedBuf)
        );
    });
}

async function logDirectorAuditEvent(
    directorWallet: string,
    zone: string,
    actionType: string,
    targetEntity: string,
    details: Record<string, any>
): Promise<void> {
    try {
        await dbPool.query(
            `INSERT INTO director_audit_log (director_wallet, zone, action_type, target_entity, details_json)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                directorWallet || 'kaspa:director_master',
                zone,
                actionType,
                targetEntity,
                JSON.stringify(details || {})
            ]
        );
    } catch (err) {
        console.warn('Director audit log insert notice:', err);
    }
}

async function resolveDecryptedBankRailForWallet(walletRaw: string) {
    getKycMasterKeyStrict();
    const cleanWallet = safeNormalizeBase32(walletRaw);
    if (!cleanWallet) return null;
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
            const dec = decryptBankRailRecordStrict(
                String(row.encrypted_rail_payload || '')
            );
            if (dec) {
                return {
                    walletAddress: prefixedWallet,
                    bankLabel: String(row.bank_label || dec.bankLabel),
                    accountType: String(row.account_type || dec.accountType),
                    payoutMethod: String(row.payout_method || dec.payoutMethod),
                    routingNumber: dec.routingNumber,
                    accountNumber: dec.accountNumber,
                    bankLast4: String(
                        row.bank_last4 || dec.accountNumber.slice(-4)
                    )
                };
            }
        }
    } catch {
        // Fallback to Redis
    }
    const cachedRail = await redis
        .get(`perennia:fiat:bank_rail:${cleanWallet}`)
        .catch(() => null);
    if (cachedRail) {
        const dec = decryptBankRailRecordStrict(cachedRail);
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
            const dec = decryptBankRailRecordStrict(
                String(kycRes.rows[0].bank_data_hash)
            );
            if (dec) {
                return {
                    walletAddress: prefixedWallet,
                    bankLabel: String(
                        kycRes.rows[0].legal_name || dec.bankLabel
                    ),
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
    const masterAddress =
        resolveMasterTreasuryKasAddressOptional() ||
        resolveMasterTreasuryKasAddress();
    const authHeader = request.headers.get('authorization') || '';
    if (matchesConfiguredAdminBearer(authHeader)) {
        return { authorized: true, adminWallet: masterAddress };
    }
    const sessionId = cookies.get('perennia_session');
    if (!sessionId) {
        return { authorized: false, adminWallet: '' };
    }
    const sessionWallet = await redis
        .get(`session:${sessionId}`)
        .catch(() => null);
    if (!sessionWallet) {
        return { authorized: false, adminWallet: '' };
    }
    if (isWalletMasterAdmin(sessionWallet)) {
        const cleanSession = safeNormalizeBase32(sessionWallet);
        return {
            authorized: true,
            adminWallet: cleanSession
                ? `kaspa:${cleanSession}`
                : masterAddress
        };
    }
    return { authorized: false, adminWallet: '' };
}

async function ensureAdminAuxiliaryTables() {
    const client = await dbPool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS system_treasury_config (
                config_id VARCHAR(64) PRIMARY KEY DEFAULT 'PRIMARY',
                hot_ceiling_kas DOUBLE PRECISION NOT NULL DEFAULT 5000.0,
                min_runway_kas DOUBLE PRECISION NOT NULL DEFAULT 250.0,
                fpps_max_float_kas DOUBLE PRECISION NOT NULL DEFAULT 50.0,
                pool_fee_rate DOUBLE PRECISION NOT NULL DEFAULT 0.01,
                outflow_breaker_tripped BOOLEAN NOT NULL DEFAULT FALSE,
                cold_kas_address VARCHAR(255) NOT NULL DEFAULT '',
                cold_btc_address VARCHAR(255) NOT NULL DEFAULT '',
                cold_eth_address VARCHAR(255) NOT NULL DEFAULT '',
                cold_sol_address VARCHAR(255) NOT NULL DEFAULT '',
                updated_by VARCHAR(255) NOT NULL DEFAULT 'SYSTEM_BOOT',
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_cold_vault_rules (
                wallet_address VARCHAR(255) NOT NULL,
                asset_ticker VARCHAR(32) NOT NULL,
                network VARCHAR(32) NOT NULL DEFAULT 'KAS',
                cold_destination_address VARCHAR(255) NOT NULL,
                vault_label VARCHAR(128) NOT NULL DEFAULT 'Perennia Cold Vault',
                overflow_ceiling DOUBLE PRECISION NOT NULL DEFAULT 500.0,
                auto_sweep_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                last_sweep_txid VARCHAR(128),
                last_sweep_amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                last_sweep_at TIMESTAMP WITH TIME ZONE,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (wallet_address, asset_ticker)
            );
        `);
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
            CREATE TABLE IF NOT EXISTS fiat_payout_queue (
                payout_id VARCHAR(80) PRIMARY KEY,
                wallet_address VARCHAR(255) NOT NULL,
                source_type VARCHAR(64) NOT NULL,
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
                payment_rail VARCHAR(64) NOT NULL DEFAULT 'SOVEREIGN_WIRE_ACH',
                payment_method VARCHAR(32) NOT NULL DEFAULT 'ach',
                tier_name VARCHAR(32) NOT NULL DEFAULT 'RETAIL',
                tier_bps INTEGER NOT NULL DEFAULT 85,
                settlement_target VARCHAR(64) NOT NULL DEFAULT 'LEDGER_KAS',
                target_asset VARCHAR(32) NOT NULL DEFAULT 'KAS',
                quoted_principal_cents BIGINT NOT NULL DEFAULT 0,
                perennia_fee_cents BIGINT NOT NULL DEFAULT 250,
                stripe_gateway_fee_cents BIGINT NOT NULL DEFAULT 0,
                gross_charge_cents BIGINT NOT NULL DEFAULT 0,
                settled_net_cents BIGINT,
                fulfilled_principal_cents BIGINT,
                quarantine_reason TEXT,
                fiat_amount_usd DOUBLE PRECISION NOT NULL,
                fee_usd DOUBLE PRECISION NOT NULL,
                net_usd_converted DOUBLE PRECISION NOT NULL,
                locked_spot_price DOUBLE PRECISION NOT NULL,
                estimated_kas DOUBLE PRECISION NOT NULL,
                delivered_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                wire_memo VARCHAR(80) NOT NULL,
                tx_hash VARCHAR(255),
                status VARCHAR(64) NOT NULL DEFAULT 'AWAITING_WIRE_RECEIPT',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        const onrampAlters = [
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(32) NOT NULL DEFAULT 'ach';`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS tier_name VARCHAR(32) NOT NULL DEFAULT 'RETAIL';`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS tier_bps INTEGER NOT NULL DEFAULT 85;`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS quoted_principal_cents BIGINT NOT NULL DEFAULT 0;`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS perennia_fee_cents BIGINT NOT NULL DEFAULT 250;`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS stripe_gateway_fee_cents BIGINT NOT NULL DEFAULT 0;`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS gross_charge_cents BIGINT NOT NULL DEFAULT 0;`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS settled_net_cents BIGINT;`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS fulfilled_principal_cents BIGINT;`,
            `ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS quarantine_reason TEXT;`
        ];
        for (const stmt of onrampAlters) {
            await client.query(stmt).catch(() => {});
        }
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
            CREATE TABLE IF NOT EXISTS token_steering_matrix (
                ticker VARCHAR(32) PRIMARY KEY,
                asset_name VARCHAR(128) NOT NULL DEFAULT '',
                network VARCHAR(32) NOT NULL DEFAULT 'KAS',
                contract_address VARCHAR(255) NOT NULL DEFAULT '',
                steering_state VARCHAR(32) NOT NULL DEFAULT 'AUTO_BALANCE',
                is_whitelisted BOOLEAN NOT NULL DEFAULT TRUE,
                target_weight_pct DOUBLE PRECISION NOT NULL DEFAULT 10.0,
                actual_weight_pct DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                accumulated_fee_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                accumulated_fee_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                updated_by VARCHAR(255) NOT NULL DEFAULT 'SYSTEM_BOOT',
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        for (const item of DEFAULT_RESERVE_WHITELIST_ASSETS) {
            await client.query(
                `INSERT INTO token_steering_matrix
                 (ticker, asset_name, network, steering_state, is_whitelisted, target_weight_pct)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (ticker) DO NOTHING`,
                [
                    item.ticker,
                    item.name,
                    item.network,
                    item.steeringState,
                    item.isWhitelisted,
                    item.targetWeightPct
                ]
            );
        }
        await client.query(`
            CREATE TABLE IF NOT EXISTS security_firewall_blacklist (
                entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                entity_type VARCHAR(32) NOT NULL DEFAULT 'WALLET',
                target_value VARCHAR(255) UNIQUE NOT NULL,
                reason TEXT NOT NULL DEFAULT 'Director Firewall Block',
                active BOOLEAN NOT NULL DEFAULT TRUE,
                added_by VARCHAR(255) NOT NULL DEFAULT 'DIRECTOR',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS director_audit_log (
                audit_id BIGSERIAL PRIMARY KEY,
                director_wallet VARCHAR(255) NOT NULL,
                zone VARCHAR(64) NOT NULL DEFAULT 'ZONE_5',
                action_type VARCHAR(96) NOT NULL,
                target_entity VARCHAR(255) NOT NULL DEFAULT '',
                details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
    } finally {
        client.release();
    }
}

async function syncSteeringMatrixToRedis(rows: any[]): Promise<void> {
    try {
        const pipe = redis.pipeline();
        for (const r of rows) {
            const ticker = String(r.ticker || '').trim().toUpperCase();
            if (!ticker) continue;
            const state = String(r.steering_state || 'AUTO_BALANCE')
                .trim()
                .toUpperCase();
            const isWl =
                Boolean(r.is_whitelisted) &&
                state !== 'PASS_THROUGH' &&
                state !== 'BLACKLISTED';
            pipe.hset('perennia:steering:token_states', ticker, state);
            pipe.hset(
                'perennia:steering:target_weights',
                ticker,
                String(Number(r.target_weight_pct || 0))
            );
            pipe.hset(
                'perennia:steering:actual_weights',
                ticker,
                String(Number(r.actual_weight_pct || 0))
            );
            if (isWl) {
                pipe.sadd('perennia:steering:whitelist', ticker);
            } else {
                pipe.srem('perennia:steering:whitelist', ticker);
            }
            if (state === 'BLACKLISTED') {
                pipe.sadd('perennia:firewall:blacklisted_tokens', ticker);
            } else {
                pipe.srem('perennia:firewall:blacklisted_tokens', ticker);
            }
        }
        await pipe.exec();
    } catch {
        // Ignore transient Redis sync error
    }
}

export const GET: RequestHandler = async ({
    request,
    cookies,
    url
}: RequestEvent) => {
    try {
        getKycMasterKeyStrict();
        resolveMasterTreasuryKasAddress();
    } catch (keyErr: any) {
        return json({ error: keyErr.message }, { status: 503 });
    }
    const clearance = await verifyDirectorClearance(request, cookies);
    if (!clearance.authorized) {
        return json(
            { error: 'FORBIDDEN: Master Director clearance required.' },
            { status: 403 }
        );
    }

    const rustBackendUrl =
        env.RUST_BACKEND_URL ||
        `http://${env.UBUNTU_NODE_IP || '127.0.0.1'}:8002`;
    const internalToken = String(
        env.INTERNAL_ADMIN_TOKEN || env.PERENNIA_ADMIN_KEY || ''
    )
        .trim()
        .replace(/^['"]|['"]$/g, '');

    const requestedTarget = url.searchParams.get('target');
    if (requestedTarget === 'shield') {
        try {
            const shieldRes = await fetch(
                `${rustBackendUrl}/v1/admin/shield`,
                {
                    headers: { Authorization: `Bearer ${internalToken}` },
                    signal: AbortSignal.timeout(2500)
                }
            );
            if (shieldRes.ok) {
                return json(await shieldRes.json());
            }
        } catch {
            // Fall through
        }
        return json({ bannedIps: [], activeStrikeCounters: [] });
    }

    if (requestedTarget === 'whitelist') {
        await ensureAdminAuxiliaryTables().catch(() => {});
        const wlRes = await dbPool
            .query(
                `SELECT * FROM whitelisted_wallets ORDER BY created_at DESC LIMIT 200`
            )
            .catch(() => ({ rows: [] as any[] }));
        return json({ wallets: wlRes.rows });
    }

    const requestedTable = url.searchParams.get('table');
    if (requestedTable) {
        if (!ALLOWED_TABLES.includes(requestedTable as any)) {
            return json(
                {
                    error: `Table "${requestedTable}" is not authorized in the Director matrix.`
                },
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
            // Fallback to direct PostgreSQL query
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
            airlockStatusRaw,
            nettingProfitStr,
            unhedgedDeltaStr,
            graceShieldRaw,
            ksFiatRaw,
            ksExtDexRaw,
            ksDarkPoolRaw,
            ksBucketsRaw,
            maxGasCeilingRaw,
            epochTelemetryRaw,
            nodeSyncRaw,
            zkasSyncRaw,
            daaScoreRaw,
            networkDiffRaw,
            poolHashrateRaw,
            kasSpotRaw
        ] = await Promise.all([
            redis.lrange('perennia:sor:netting_queue', 0, 99),
            redis.lrange('perennia:sor:third_party_passthrough_queue', 0, 99),
            redis.lrange('perennia:fiat:payout_queue', 0, 99),
            redis.lrange('perennia:l1:payout_queue', 0, 99),
            redis.get('perennia:stratum:mining_address'),
            redis.get('perennia:pool:fpps_solvency'),
            redis.get('perennia:treasury:hedge_status'),
            redis.get('perennia:treasury:airlock_status'),
            redis.get('perennia:treasury:netting_profit_usd'),
            redis.get('perennia:treasury:unhedged_delta_kas'),
            redis.get('perennia:stratum:maintenance_grace_shield'),
            redis.get('perennia:killswitch:fiat_onramp'),
            redis.get('perennia:killswitch:external_dex'),
            redis.get('perennia:killswitch:dark_pool'),
            redis.get('perennia:killswitch:bucket_payouts'),
            redis.get('perennia:governor:max_gas_ceiling_usd'),
            redis.get('perennia:settlement:epoch_telemetry'),
            redis.get('perennia:node:sync_status'),
            redis.get('perennia:zkas:sync_status'),
            redis.get('pool:virtual_daa_score'),
            redis.get('pool:network_diff'),
            redis.get('pool:hashrate'),
            redis.get('oracle:spot:KAS_USDC')
        ]);

        const kasSpotUsd = kasSpotRaw ? parseFloat(kasSpotRaw) || 0.15 : 0.15;
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
        let systemConfig: any = null;
        let tokenSteeringMatrix: any[] = [];
        let securityBlacklist: any[] = [];
        let directorAuditLog: any[] = [];
        let floatLedger: any = null;
        let reservoirRows: any[] = [];
        let taxEventsRecent: any[] = [];

        let client;
        try {
            client = await dbPool.connect();
            const [
                fiatRes,
                onrampRes,
                bankRailsRes,
                l1Res,
                wlRes,
                ccRes,
                sysCfgRes,
                steeringRes,
                blacklistRes,
                auditRes,
                floatRes,
                resRows,
                taxRes
            ] = await Promise.all([
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
                    `SELECT wallet_address, last_updated, layout_state,
                            jsonb_array_length(COALESCE(layout_state->'workers', '[]'::jsonb)) AS worker_count,
                            jsonb_array_length(COALESCE(layout_state->'sectors', '[]'::jsonb)) AS sector_count
                     FROM user_command_centers
                     ORDER BY last_updated DESC NULLS LAST
                     LIMIT 200`
                ),
                client.query(
                    `SELECT * FROM system_treasury_config WHERE config_id = 'PRIMARY' LIMIT 1`
                ),
                client.query(
                    `SELECT * FROM token_steering_matrix ORDER BY is_whitelisted DESC, target_weight_pct DESC, ticker ASC`
                ),
                client.query(
                    `SELECT * FROM security_firewall_blacklist WHERE active = TRUE ORDER BY created_at DESC LIMIT 250`
                ),
                client.query(
                    `SELECT * FROM director_audit_log ORDER BY created_at DESC LIMIT 200`
                ),
                client.query(
                    `SELECT * FROM fiat_float_ledger WHERE ledger_id IN ('PRIMARY_FLOAT', 'BOOTSTRAP_PRIMARY') ORDER BY updated_at DESC LIMIT 1`
                ),
                client.query(
                    `SELECT wallet_address, streaming_balance_kas, total_yield_kas, verified_onchain_credits_kas, quarantined, quarantine_reason
                     FROM yield_reservoirs
                     ORDER BY last_updated DESC NULLS LAST
                     LIMIT 200`
                ),
                client.query(
                    `SELECT event_id, wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash, cost_basis_usd, realized_gain_loss_usd, holding_period, recorded_at
                     FROM tax_ledger_events
                     ORDER BY recorded_at DESC
                     LIMIT 200`
                )
            ]);
            fiatPayouts = fiatRes.rows;
            fiatOnrampOrders = onrampRes.rows;
            fiatBankRails = bankRailsRes.rows;
            l1Payouts = l1Res.rows;
            whitelistedWallets = wlRes.rows;
            commandCenters = ccRes.rows;
            systemConfig = sysCfgRes.rows[0] || null;
            tokenSteeringMatrix = steeringRes.rows;
            securityBlacklist = blacklistRes.rows;
            directorAuditLog = auditRes.rows;
            floatLedger = floatRes.rows[0] || null;
            reservoirRows = resRows.rows;
            taxEventsRecent = taxRes.rows;
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

        let totalReserveValueUsd = 0;
        const enrichedSteering = await Promise.all(
            tokenSteeringMatrix.map(async (item) => {
                const tick = String(item.ticker || 'KAS').toUpperCase();
                const [feeStr, spotStr] = await Promise.all([
                    redis
                        .get(`perennia:fees:batch_accumulated:${tick}`)
                        .catch(() => null),
                    tick === 'USDC' || tick === 'USDT' || tick === 'USD'
                        ? Promise.resolve('1.0')
                        : redis
                              .get(`oracle:spot:${tick}_USDC`)
                              .catch(() => null)
                ]);
                const accTokens =
                    (feeStr ? parseFloat(feeStr) || 0 : 0) +
                    Number(item.accumulated_fee_tokens || 0);
                const spot = spotStr
                    ? parseFloat(spotStr) || (tick === 'KAS' ? kasSpotUsd : 0)
                    : tick === 'KAS'
                      ? kasSpotUsd
                      : 0;
                const baselineReserveUsd =
                    tick === 'KAS'
                        ? Number(floatLedger?.local_kas_reserve_usd ?? 500)
                        : tick === 'USDC'
                          ? Number(
                                floatLedger?.master_treasury_usdc_reserve ?? 400
                            )
                          : 100;
                const valUsd = baselineReserveUsd + accTokens * spot;
                totalReserveValueUsd += valUsd;
                return {
                    ...item,
                    ticker: tick,
                    spotPriceUsd: spot,
                    accumulatedFeeTokens: Number(accTokens.toFixed(6)),
                    reserveValueUsd: roundCents(valUsd)
                };
            })
        );

        for (const item of enrichedSteering) {
            item.actual_weight_pct =
                totalReserveValueUsd > 0
                    ? Number(
                          (
                              (item.reserveValueUsd / totalReserveValueUsd) *
                              100
                          ).toFixed(2)
                      )
                    : Number(item.target_weight_pct || 0);
        }
        await syncSteeringMatrixToRedis(enrichedSteering);

        const institutionalWireQueue = fiatOnrampOrders.filter(
            (o) =>
                o.status !== 'COMPLETED' &&
                o.status !== 'CANCELLED' &&
                (Number(o.fiat_amount_usd || 0) >= 100_000 ||
                    Number(o.quoted_principal_cents || 0) >= 10_000_000 ||
                    String(o.tier_name || '').toUpperCase() ===
                        'INSTITUTIONAL_WIRE' ||
                    String(o.status || '').toUpperCase() ===
                        'AWAITING_INSTITUTIONAL_WIRE')
        );

        const quarantineQueue = fiatOnrampOrders.filter((o) =>
            String(o.status || '')
                .toUpperCase()
                .includes('QUARANTINE')
        );

        const pendingAchClears = fiatOnrampOrders.filter(
            (o) =>
                String(o.status || '').toUpperCase() ===
                    'ACH_PROCESSING_HOLD' ||
                (String(o.payment_method || '').toLowerCase() === 'ach' &&
                    o.status === 'AWAITING_WIRE_RECEIPT')
        );

        const ledgerDriftAlerts: Array<{
            wallet: string;
            dbStreamingKas: number;
            redisUnassignedKas: number;
            driftKas: number;
            quarantined: boolean;
            reason?: string;
        }> = [];
        for (const r of reservoirRows.slice(0, 40)) {
            const cleanW = safeNormalizeBase32(String(r.wallet_address || ''));
            if (!cleanW) continue;
            const redisUnassignedStr = await redis
                .hget(`dev:sor:treasury:balances:${cleanW}`, 'Unassigned KAS')
                .catch(() => null);
            const redisKas = redisUnassignedStr
                ? parseFloat(redisUnassignedStr) || 0
                : 0;
            const dbKas = Number(r.streaming_balance_kas || 0);
            const drift = Math.abs(redisKas - dbKas);
            if (Boolean(r.quarantined) || drift > 1.5) {
                ledgerDriftAlerts.push({
                    wallet: `kaspa:${cleanW}`,
                    dbStreamingKas: Number(dbKas.toFixed(4)),
                    redisUnassignedKas: Number(redisKas.toFixed(4)),
                    driftKas: Number(drift.toFixed(4)),
                    quarantined: Boolean(r.quarantined),
                    reason:
                        r.quarantine_reason ||
                        `Redis (${redisKas.toFixed(2)} KAS) vs Postgres (${dbKas.toFixed(2)} KAS) drift`
                });
            }
        }

        const dynamicBatchMap = new Map<
            string,
            {
                queueId: string;
                asset: string;
                queueType: string;
                pendingKas: number;
                pendingUsd: number;
                minThresholdKas: number;
                fillPct: number;
                participantCount: number;
                heldByDirector: boolean;
                statusPill: 'GREEN' | 'AMBER' | 'RED';
            }
        >();

        if (epochTelemetryRaw) {
            try {
                const parsedEpoch = JSON.parse(epochTelemetryRaw);
                const bucketsObj = parsedEpoch?.buckets || {};
                for (const [assetKey, bVal] of Object.entries(bucketsObj)) {
                    const b = bVal as any;
                    const tick = assetKey.trim().toUpperCase();
                    const pKas = Number(b.pendingKas || 0);
                    const minKas = Math.max(
                        1,
                        Number(b.minProfitableKas || 47.4)
                    );
                    const fillPct = Math.min(100, (pKas / minKas) * 100);
                    const heldRaw = await redis
                        .get(`perennia:governor:hold_queue:${tick}`)
                        .catch(() => null);
                    const held = heldRaw === '1';
                    const statusPill: 'GREEN' | 'AMBER' | 'RED' = held
                        ? 'RED'
                        : fillPct >= 100
                          ? 'GREEN'
                          : pKas > 0
                            ? 'AMBER'
                            : 'GREEN';
                    dynamicBatchMap.set(`BUCKET_${tick}`, {
                        queueId: `BUCKET_${tick}`,
                        asset: tick,
                        queueType: '22:00 UTC Settlement Bucket',
                        pendingKas: Number(pKas.toFixed(4)),
                        pendingUsd: roundCents(pKas * kasSpotUsd),
                        minThresholdKas: Number(minKas.toFixed(2)),
                        fillPct: Number(fillPct.toFixed(1)),
                        participantCount: Number(b.participantCount || 0),
                        heldByDirector: held,
                        statusPill
                    });
                }
            } catch {
                // Ignore malformed epoch telemetry
            }
        }

        for (const cc of commandCenters) {
            const sectors: any[] = Array.isArray(cc.layout_state?.sectors)
                ? cc.layout_state.sectors
                : [];
            for (const sec of sectors) {
                const pKas = Math.max(0, Number(sec?.pendingKaspa || 0));
                const tick = String(
                    sec?.settlementConfig?.targetAsset?.ticker || 'KAS'
                )
                    .trim()
                    .toUpperCase();
                const qKey = `BUCKET_${tick}`;
                const existing = dynamicBatchMap.get(qKey);
                if (existing) {
                    if (pKas > existing.pendingKas) {
                        existing.pendingKas = Number(pKas.toFixed(4));
                        existing.pendingUsd = roundCents(pKas * kasSpotUsd);
                        existing.fillPct = Number(
                            Math.min(
                                100,
                                (pKas / existing.minThresholdKas) * 100
                            ).toFixed(1)
                        );
                    }
                } else if (
                    pKas > 0 ||
                    Number(sec?.allocationPercentage || 0) > 0
                ) {
                    const heldRaw = await redis
                        .get(`perennia:governor:hold_queue:${tick}`)
                        .catch(() => null);
                    const held = heldRaw === '1';
                    const minKas = 50.0;
                    const fillPct = Math.min(100, (pKas / minKas) * 100);
                    dynamicBatchMap.set(qKey, {
                        queueId: qKey,
                        asset: tick,
                        queueType:
                            sec?.routeMode === 'auto-lp'
                                ? '50%-KAS Liquidity Plant Queue'
                                : 'Miner Sector Batch Queue',
                        pendingKas: Number(pKas.toFixed(4)),
                        pendingUsd: roundCents(pKas * kasSpotUsd),
                        minThresholdKas: minKas,
                        fillPct: Number(fillPct.toFixed(1)),
                        participantCount: 1,
                        heldByDirector: held,
                        statusPill: held
                            ? 'RED'
                            : fillPct >= 100
                              ? 'GREEN'
                              : pKas > 0
                                ? 'AMBER'
                                : 'GREEN'
                    });
                }
            }
        }

        const dynamicBatchQueues = Array.from(dynamicBatchMap.values()).sort(
            (a, b) => b.pendingKas - a.pendingKas
        );

        let bannedIps: {
            ip: string;
            elapsedSeconds: number;
            remainingSeconds: number;
        }[] = [];
        let activeStrikeCounters: {
            key: string;
            strikes: number;
            maxStrikes: number;
        }[] = [];
        try {
            const shieldRes = await fetch(
                `${rustBackendUrl}/v1/admin/shield`,
                {
                    headers: { Authorization: `Bearer ${internalToken}` },
                    signal: AbortSignal.timeout(2500)
                }
            );
            if (shieldRes.ok) {
                const shieldData = await shieldRes.json();
                if (Array.isArray(shieldData.bannedIps)) {
                    bannedIps = shieldData.bannedIps;
                }
                if (Array.isArray(shieldData.activeStrikeCounters)) {
                    activeStrikeCounters = shieldData.activeStrikeCounters;
                }
            }
        } catch {
            // Continue if Rust shield endpoint is unreachable
        }

        const defaultStratumAddr =
            stratumBoundAddr ||
            env.PERENNIA_HOT_KAS_ADDRESS ||
            env.PERENNIA_TREASURY_KAS_ADDRESS ||
            resolveMasterTreasuryKasAddressOptional() ||
            '';

        const isTrueFlag = (v: string | null) =>
            v === '1' || String(v || '').toLowerCase() === 'true';

        const completedOnramps = fiatOnrampOrders.filter(
            (o) => o.status === 'COMPLETED'
        );
        const totalGrossUpProfitUsd = roundCents(
            completedOnramps.reduce(
                (acc, o) =>
                    acc +
                    Number(
                        o.master_treasury_fee_usdc ??
                            o.guaranteed_profit_usd ??
                            o.fee_usd ??
                            0
                    ),
                0
            )
        );

        const lpCompoundVaultUsd = roundCents(
            Number(floatLedger?.dark_pool_lp_vault_usd ?? 0)
        );
        const liquidClearingReserveUsd = roundCents(
            Number(floatLedger?.master_treasury_usdc_reserve ?? 0) +
                Number(floatLedger?.commercial_checking_cleared_usd ?? 1500)
        );

        return json({
            adminWallet: clearance.adminWallet,
            allowedTables: ALLOWED_TABLES,
            stratumMiningAddress: defaultStratumAddr,
            systemConfig,
            nettingQueue,
            passthroughQueue,
            fiatPayouts,
            fiatOnrampOrders,
            fiatBankRails,
            l1Payouts,
            whitelistedWallets,
            commandCenters,
            bannedIps,
            activeStrikeCounters,
            nettingProfitUsd: nettingProfitStr
                ? parseFloat(nettingProfitStr) || 0
                : 0,
            unhedgedDeltaKas: unhedgedDeltaStr
                ? parseFloat(unhedgedDeltaStr) || 0
                : 0,
            fppsSolvency: fppsSolvencyRaw ? JSON.parse(fppsSolvencyRaw) : null,
            hedgeStatus: hedgeStatusRaw ? JSON.parse(hedgeStatusRaw) : null,
            airlockStatus: airlockStatusRaw
                ? JSON.parse(airlockStatusRaw)
                : null,
            triageExceptions: {
                institutionalWireCount: institutionalWireQueue.length,
                quarantineCount: quarantineQueue.length,
                ledgerDriftCount: ledgerDriftAlerts.length,
                totalExceptions:
                    institutionalWireQueue.length +
                    quarantineQueue.length +
                    ledgerDriftAlerts.length,
                institutionalWireQueue,
                quarantineQueue,
                ledgerDriftAlerts
            },
            tokenSteeringMatrix: enrichedSteering,
            treasurySplit6040: {
                perenniaLpCompound60Usd: lpCompoundVaultUsd,
                liquidClearingReserve40Usd: liquidClearingReserveUsd,
                targetLpSharePct: 60.0,
                targetLiquidSharePct: 40.0
            },
            fiatSettlementDesk: {
                totalGrossUpProfitUsd,
                pendingAchClears,
                quarantineQueue,
                institutionalWireQueue,
                taxLedgerEvents: taxEventsRecent,
                mercuryCheckingAccount: {
                    label: 'Perennia, LLC Mercury Checking (COLUMN NA-MERCURY ending in 9901)',
                    routingNumber: '121145433',
                    accountNumber: '580798008849901',
                    bankName: 'Column N.A.',
                    bankAddress:
                        '1 Letterman Drive, Building A, Suite A4-700, San Francisco, CA 94129'
                },
                stripeWebhookEndpoint: {
                    url: 'https://perennia.io/api/webhooks/stripe',
                    destinationId: 'we_1SZq78Rp3z9WFHwIL1koY',
                    apiVersion: '2026-10-28.acacia'
                }
            },
            stratumAndGovernor: {
                maintenanceGraceShield: isTrueFlag(graceShieldRaw),
                subsystemKillSwitches: {
                    fiatOnramp: isTrueFlag(ksFiatRaw),
                    externalDex: isTrueFlag(ksExtDexRaw),
                    darkPool: isTrueFlag(ksDarkPoolRaw),
                    bucketPayouts: isTrueFlag(ksBucketsRaw)
                },
                maxGasCeilingUsd: maxGasCeilingRaw
                    ? parseFloat(maxGasCeilingRaw) || 2.5
                    : 2.5,
                dynamicBatchQueues,
                consensusNodes: {
                    kaspadStatus: nodeSyncRaw || 'Online',
                    zkasStatus: zkasSyncRaw || 'Synced (Standby)',
                    virtualDaaScore: daaScoreRaw
                        ? parseInt(daaScoreRaw, 10) || 0
                        : 0,
                    networkDifficulty: networkDiffRaw
                        ? parseFloat(networkDiffRaw) || 0
                        : 0,
                    activeHashrateThs: poolHashrateRaw
                        ? Number(
                              (parseFloat(poolHashrateRaw) / 1e12).toFixed(4)
                          )
                        : 0
                }
            },
            securityBlacklist,
            directorAuditLog,
            timestamp: Date.now()
        });
    } catch (err: any) {
        return json(
            {
                error:
                    err.message ||
                    'Failed to load Director control plane telemetry.'
            },
            { status: 500 }
        );
    }
};

export const POST: RequestHandler = async ({
    request,
    cookies
}: RequestEvent) => {
    try {
        getKycMasterKeyStrict();
        resolveMasterTreasuryKasAddress();
    } catch (keyErr: any) {
        return json({ error: keyErr.message }, { status: 503 });
    }
    const clearance = await verifyDirectorClearance(request, cookies);
    if (!clearance.authorized) {
        return json(
            { error: 'FORBIDDEN: Master Director clearance required.' },
            { status: 403 }
        );
    }
    const rustBackendUrl =
        env.RUST_BACKEND_URL ||
        `http://${env.UBUNTU_NODE_IP || '127.0.0.1'}:8002`;
    const internalToken = String(
        env.INTERNAL_ADMIN_TOKEN || env.PERENNIA_ADMIN_KEY || ''
    )
        .trim()
        .replace(/^['"]|['"]$/g, '');

    try {
        const body = await request.json();
        await ensureAdminAuxiliaryTables().catch(() => {});

        let action = String(body.action || '').toUpperCase();
        if (body.target === 'shield' && body.ip) {
            action =
                String(body.action || 'BAN').toUpperCase() === 'UNBAN'
                    ? 'UNBAN_IP'
                    : 'BAN_IP';
        } else if (body.target === 'whitelist' && body.wallet && !action) {
            action = 'ADD_WHITELIST';
        }

        // ZONE 2: 5-State Token Steering Matrix Override
        if (
            action === 'SET_TOKEN_STEERING_STATE' ||
            action === 'UPSERT_STEERING_TOKEN'
        ) {
            const ticker = String(body.ticker || '')
                .trim()
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '')
                .slice(0, 16);
            const nextState = String(
                body.steeringState || body.state || 'AUTO_BALANCE'
            )
                .trim()
                .toUpperCase();
            const validStates = new Set([
                'AUTO_BALANCE',
                'ACCUMULATE',
                'FREEZE',
                'PASS_THROUGH',
                'BLACKLISTED'
            ]);
            if (!ticker || !validStates.has(nextState)) {
                return json(
                    {
                        error: 'Invalid ticker or steeringState (must be AUTO_BALANCE, ACCUMULATE, FREEZE, PASS_THROUGH, or BLACKLISTED).'
                    },
                    { status: 400 }
                );
            }
            const assetName = String(body.assetName || ticker).trim();
            const network = String(body.network || 'KAS')
                .trim()
                .toUpperCase();
            const contractAddress = String(
                body.contractAddress || ticker
            ).trim();
            const targetWeightPct = Math.max(
                0,
                Math.min(100, Number(body.targetWeightPct ?? 5.0))
            );
            const isWhitelisted =
                nextState === 'AUTO_BALANCE' ||
                nextState === 'ACCUMULATE' ||
                nextState === 'FREEZE';

            await dbPool.query(
                `INSERT INTO token_steering_matrix
                 (ticker, asset_name, network, contract_address, steering_state, is_whitelisted, target_weight_pct, updated_by, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
                 ON CONFLICT (ticker) DO UPDATE SET
                    asset_name = COALESCE(NULLIF(EXCLUDED.asset_name, ''), token_steering_matrix.asset_name),
                    network = COALESCE(NULLIF(EXCLUDED.network, ''), token_steering_matrix.network),
                    contract_address = COALESCE(NULLIF(EXCLUDED.contract_address, ''), token_steering_matrix.contract_address),
                    steering_state = EXCLUDED.steering_state,
                    is_whitelisted = EXCLUDED.is_whitelisted,
                    target_weight_pct = CASE WHEN $9::boolean THEN EXCLUDED.target_weight_pct ELSE token_steering_matrix.target_weight_pct END,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = CURRENT_TIMESTAMP`,
                [
                    ticker,
                    assetName,
                    network,
                    contractAddress,
                    nextState,
                    isWhitelisted,
                    targetWeightPct,
                    clearance.adminWallet,
                    body.targetWeightPct !== undefined
                ]
            );

            await redis.hset(
                'perennia:steering:token_states',
                ticker,
                nextState
            );
            if (body.targetWeightPct !== undefined) {
                await redis.hset(
                    'perennia:steering:target_weights',
                    ticker,
                    String(targetWeightPct)
                );
            }
            if (isWhitelisted) {
                await redis.sadd('perennia:steering:whitelist', ticker);
            } else {
                await redis.srem('perennia:steering:whitelist', ticker);
            }
            if (nextState === 'BLACKLISTED') {
                await redis.sadd(
                    'perennia:firewall:blacklisted_tokens',
                    ticker
                );
                await dbPool
                    .query(
                        `INSERT INTO security_firewall_blacklist (entity_type, target_value, reason, active, added_by)
                         VALUES ('TOKEN_CONTRACT', $1, $2, TRUE, $3)
                         ON CONFLICT (target_value) DO UPDATE SET active = TRUE, updated_at = CURRENT_TIMESTAMP`,
                        [
                            ticker,
                            'Blacklisted via Zone 2 Token Steering Matrix',
                            clearance.adminWallet
                        ]
                    )
                    .catch(() => {});
            } else {
                await redis.srem(
                    'perennia:firewall:blacklisted_tokens',
                    ticker
                );
            }

            await logDirectorAuditEvent(
                clearance.adminWallet,
                'ZONE_2_STEERING',
                'SET_TOKEN_STEERING_STATE',
                ticker,
                {
                    ticker,
                    steeringState: nextState,
                    isWhitelisted,
                    targetWeightPct
                }
            );

            return json({
                success: true,
                action: 'SET_TOKEN_STEERING_STATE',
                ticker,
                steeringState: nextState,
                isWhitelisted,
                targetWeightPct
            });
        }

        // ZONE 3: Release Adjusted Principal or Refund on Zero-Loss Quarantine Queue
        if (
            action === 'RELEASE_QUARANTINED_STRIPE_ORDER' ||
            action === 'REFUND_QUARANTINED_STRIPE_ORDER'
        ) {
            const orderId = String(body.orderId || '').trim();
            if (!orderId) {
                return json({ error: 'Missing orderId.' }, { status: 400 });
            }
            const ordRes = await dbPool.query(
                `SELECT * FROM fiat_onramp_orders WHERE order_id = $1 LIMIT 1`,
                [orderId]
            );
            if (ordRes.rows.length === 0) {
                return json(
                    { error: `Order ${orderId} not found.` },
                    { status: 404 }
                );
            }
            const ord = ordRes.rows[0];
            const cleanWallet = safeNormalizeBase32(
                String(ord.wallet_address || '')
            );
            const prefixedWallet = cleanWallet
                ? `kaspa:${cleanWallet}`
                : String(ord.wallet_address || '');
            const targetAsset = String(
                ord.target_asset || 'KAS'
            ).toUpperCase();

            if (action === 'REFUND_QUARANTINED_STRIPE_ORDER') {
                const piId = String(ord.stripe_payment_intent_id || '').trim();
                const rawStripeKey = (env.STRIPE_SECRET_KEY || '').trim();
                let refundId = `REFUND-QUARANTINE-${Date.now()}`;
                if (
                    piId.startsWith('pi_') &&
                    rawStripeKey &&
                    rawStripeKey.length >= 30 &&
                    !rawStripeKey.toLowerCase().includes('dummy')
                ) {
                    try {
                        const stripe = new Stripe(rawStripeKey, {
                            apiVersion: '2026-10-28.acacia' as any
                        });
                        const refund = await (stripe.refunds as any).create({
                            payment_intent: piId
                        });
                        refundId = refund.id;
                    } catch (refErr) {
                        console.warn(
                            'Stripe refund API notice (marking refunded in DB):',
                            refErr
                        );
                    }
                }
                await dbPool.query(
                    `UPDATE fiat_onramp_orders
                     SET status = 'REFUNDED_BY_DIRECTOR',
                         tx_hash = $2,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE order_id = $1`,
                    [orderId, refundId]
                );
                await logDirectorAuditEvent(
                    clearance.adminWallet,
                    'ZONE_3_FIAT_DESK',
                    'REFUND_QUARANTINED_STRIPE_ORDER',
                    orderId,
                    { orderId, wallet: prefixedWallet, refundId }
                );
                return json({
                    success: true,
                    action: 'REFUND_QUARANTINED_STRIPE_ORDER',
                    orderId,
                    refundId,
                    status: 'REFUNDED_BY_DIRECTOR'
                });
            }

            const quotedPrincipalCents = Number(
                ord.quoted_principal_cents ||
                    Math.round(Number(ord.net_usd_converted || 0) * 100)
            );
            const perenniaFeeCents = Math.max(
                250,
                Number(
                    ord.perennia_fee_cents ||
                        Math.round(
                            Number(ord.guaranteed_profit_usd || 2.5) * 100
                        )
                )
            );
            const settledNetCents =
                ord.settled_net_cents !== null &&
                ord.settled_net_cents !== undefined
                    ? Number(ord.settled_net_cents)
                    : quotedPrincipalCents + perenniaFeeCents;
            const safePrincipalCents = Math.max(
                0,
                Math.min(
                    quotedPrincipalCents,
                    settledNetCents - perenniaFeeCents
                )
            );
            if (safePrincipalCents <= 0) {
                return json(
                    {
                        error: 'ZERO_LOSS_LOCK: Settled net cents cannot cover Perennia fee floor. Issue a refund instead.'
                    },
                    { status: 422 }
                );
            }
            const safePrincipalUsd = roundCents(safePrincipalCents / 100);
            const perenniaFeeUsd = roundCents(perenniaFeeCents / 100);
            const spotStr = await redis
                .get(`oracle:spot:${targetAsset}_USDC`)
                .catch(() => null);
            const liveSpot =
                targetAsset === 'USDC' || targetAsset === 'USDT'
                    ? 1.0
                    : spotStr
                      ? parseFloat(spotStr) ||
                        Number(ord.target_spot_price || 0.15)
                      : Number(ord.target_spot_price || 0.15);
            const deliveredTokens = Number(
                (safePrincipalUsd / Math.max(0.0001, liveSpot)).toFixed(6)
            );
            const txHash = `QUARANTINE-RELEASE-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

            if (cleanWallet) {
                await redis.hincrbyfloat(
                    `dev:sor:treasury:balances:${cleanWallet}`,
                    targetAsset,
                    deliveredTokens
                );
            }

            await dbPool.query(
                `UPDATE fiat_onramp_orders
                 SET status = 'COMPLETED',
                     fulfilled_principal_cents = $2,
                     net_usd_converted = $3,
                     estimated_tokens = $4,
                     delivered_kas = $4,
                     master_treasury_fee_usdc = $5,
                     tx_hash = $6,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE order_id = $1`,
                [
                    orderId,
                    safePrincipalCents,
                    safePrincipalUsd,
                    deliveredTokens,
                    perenniaFeeUsd,
                    txHash
                ]
            );

            await logDirectorAuditEvent(
                clearance.adminWallet,
                'ZONE_3_FIAT_DESK',
                'RELEASE_QUARANTINED_STRIPE_ORDER',
                orderId,
                {
                    orderId,
                    wallet: prefixedWallet,
                    settledNetCents,
                    perenniaFeeCents,
                    safePrincipalCents,
                    deliveredTokens,
                    targetAsset
                }
            );

            return json({
                success: true,
                action: 'RELEASE_QUARANTINED_STRIPE_ORDER',
                orderId,
                safePrincipalUsd,
                perenniaFeeUsd,
                deliveredTokens,
                targetAsset,
                txHash,
                status: 'COMPLETED'
            });
        }

        // ZONE 3: Export IRS 1099-DA tax_ledger_events Audit CSV
        if (action === 'EXPORT_1099_DA_AUDIT_CSV') {
            const taxRes = await dbPool.query(
                `SELECT event_id, wallet_address, asset_ticker, event_type, gross_proceeds_usd,
                        amount_tokens, spot_price_at_execution, cost_basis_usd, realized_gain_loss_usd,
                        holding_period, tx_hash, recorded_at
                 FROM tax_ledger_events
                 ORDER BY recorded_at DESC
                 LIMIT 1000`
            );
            const header =
                'Event_ID,Wallet_Address,Asset_Ticker,Event_Type,Gross_Proceeds_USD,Cost_Basis_USD,Realized_Gain_Loss_USD,Holding_Period,Amount_Tokens,Spot_Price_USD,Tx_Hash,Recorded_At_UTC';
            const lines = [header];
            for (const r of taxRes.rows) {
                lines.push(
                    [
                        r.event_id,
                        r.wallet_address,
                        r.asset_ticker,
                        r.event_type,
                        Number(r.gross_proceeds_usd || 0).toFixed(2),
                        Number(r.cost_basis_usd || 0).toFixed(2),
                        Number(r.realized_gain_loss_usd || 0).toFixed(2),
                        r.holding_period || 'SHORT_TERM',
                        Number(r.amount_tokens || 0).toFixed(6),
                        Number(r.spot_price_at_execution || 0).toFixed(4),
                        r.tx_hash || '',
                        r.recorded_at
                            ? new Date(r.recorded_at).toISOString()
                            : ''
                    ].join(',')
                );
            }
            await logDirectorAuditEvent(
                clearance.adminWallet,
                'ZONE_3_FIAT_DESK',
                'EXPORT_1099_DA_AUDIT_CSV',
                'tax_ledger_events',
                { rowCount: taxRes.rows.length }
            );
            return json({
                success: true,
                count: taxRes.rows.length,
                csvContent: lines.join('\n')
            });
        }

        // ZONE 1 / ZONE 2: Reconcile Redis-to-PostgreSQL Ledger Drift
        if (action === 'RECONCILE_LEDGER_DRIFT') {
            const resRows = await dbPool.query(
                `SELECT wallet_address, streaming_balance_kas, total_yield_kas, COALESCE(lp_tokens, '{}'::jsonb) AS lp_tokens
                 FROM yield_reservoirs`
            );
            let reconciledCount = 0;
            for (const r of resRows.rows) {
                const cleanW = safeNormalizeBase32(
                    String(r.wallet_address || '')
                );
                if (!cleanW) continue;
                const prefixedW = `kaspa:${cleanW}`;
                const sKas = Math.max(0, Number(r.streaming_balance_kas || 0));
                const tKas = Math.max(sKas, Number(r.total_yield_kas || 0));
                const newHmac = computeReservoirHmac(
                    prefixedW,
                    sKas,
                    tKas,
                    r.lp_tokens
                );
                await dbPool.query(
                    `UPDATE yield_reservoirs
                     SET quarantined = FALSE,
                         quarantine_reason = NULL,
                         total_yield_kas = $2,
                         verified_onchain_credits_kas = GREATEST(verified_onchain_credits_kas, $2),
                         row_hmac_sig = $3,
                         last_updated = CURRENT_TIMESTAMP
                     WHERE wallet_address = $1`,
                    [r.wallet_address, tKas, newHmac]
                );
                await redis.hset(
                    `dev:sor:treasury:balances:${cleanW}`,
                    'Unassigned KAS',
                    sKas.toFixed(8)
                );
                reconciledCount++;
            }
            await logDirectorAuditEvent(
                clearance.adminWallet,
                'ZONE_1_TRIAGE',
                'RECONCILE_LEDGER_DRIFT',
                'yield_reservoirs',
                { reconciledCount }
            );
            return json({
                success: true,
                action: 'RECONCILE_LEDGER_DRIFT',
                reconciledCount
            });
        }

        // ZONE 4: Maintenance Grace Shield (pauses 2-hour disconnect timer globally)
        if (action === 'TOGGLE_MAINTENANCE_GRACE_SHIELD') {
            const curRaw = await redis.get(
                'perennia:stratum:maintenance_grace_shield'
            );
            const curActive =
                curRaw === '1' ||
                String(curRaw || '').toLowerCase() === 'true';
            const nextActive =
                body.enabled !== undefined ? Boolean(body.enabled) : !curActive;
            await redis.set(
                'perennia:stratum:maintenance_grace_shield',
                nextActive ? '1' : '0'
            );
            await logDirectorAuditEvent(
                clearance.adminWallet,
                'ZONE_4_STRATUM',
                'TOGGLE_MAINTENANCE_GRACE_SHIELD',
                'perennia:stratum:maintenance_grace_shield',
                { maintenanceGraceShield: nextActive }
            );
            return json({
                success: true,
                action: 'TOGGLE_MAINTENANCE_GRACE_SHIELD',
                maintenanceGraceShield: nextActive
            });
        }

        // ZONE 4: Independent Subsystem Kill-Switches
        if (action === 'TOGGLE_SUBSYSTEM_KILLSWITCH') {
            const subsystem = String(body.subsystem || '')
                .trim()
                .toLowerCase();
            const keyMap: Record<string, string> = {
                fiat_onramp: 'perennia:killswitch:fiat_onramp',
                fiatonramp: 'perennia:killswitch:fiat_onramp',
                external_dex: 'perennia:killswitch:external_dex',
                externaldex: 'perennia:killswitch:external_dex',
                dark_pool: 'perennia:killswitch:dark_pool',
                darkpool: 'perennia:killswitch:dark_pool',
                bucket_payouts: 'perennia:killswitch:bucket_payouts',
                bucketpayouts: 'perennia:killswitch:bucket_payouts'
            };
            const redisKey = keyMap[subsystem];
            if (!redisKey) {
                return json(
                    {
                        error: `Unknown subsystem "${subsystem}". Valid options: fiat_onramp, external_dex, dark_pool, bucket_payouts.`
                    },
                    { status: 400 }
                );
            }
            const curVal = await redis.get(redisKey);
            const curPaused =
                curVal === '1' ||
                String(curVal || '').toLowerCase() === 'true';
            const nextPaused =
                body.paused !== undefined ? Boolean(body.paused) : !curPaused;
            await redis.set(redisKey, nextPaused ? '1' : '0');

            await logDirectorAuditEvent(
                clearance.adminWallet,
                'ZONE_4_KILLSWITCH',
                'TOGGLE_SUBSYSTEM_KILLSWITCH',
                subsystem,
                { subsystem, paused: nextPaused }
            );

            return json({
                success: true,
                action: 'TOGGLE_SUBSYSTEM_KILLSWITCH',
                subsystem,
                paused: nextPaused
            });
        }

        // ZONE 4: Dynamic Pool Batch & Gas Governor (Flush Now / Hold / Max Gas Ceiling)
        if (action === 'GOVERN_DYNAMIC_QUEUE') {
            const subAction = String(
                body.governorAction || 'TOGGLE_HOLD'
            ).toUpperCase();
            if (subAction === 'SET_MAX_GAS_CEILING') {
                const ceilingUsd = Math.max(
                    0.05,
                    Number(body.maxGasCeilingUsd || 2.5)
                );
                await redis.set(
                    'perennia:governor:max_gas_ceiling_usd',
                    ceilingUsd.toFixed(2)
                );
                await logDirectorAuditEvent(
                    clearance.adminWallet,
                    'ZONE_4_GOVERNOR',
                    'SET_MAX_GAS_CEILING',
                    'max_gas_ceiling_usd',
                    { maxGasCeilingUsd: ceilingUsd }
                );
                return json({
                    success: true,
                    maxGasCeilingUsd: ceilingUsd
                });
            }

            const asset = String(body.asset || 'USDC')
                .trim()
                .toUpperCase();
            if (subAction === 'TOGGLE_HOLD') {
                const holdKey = `perennia:governor:hold_queue:${asset}`;
                const curHold = (await redis.get(holdKey)) === '1';
                const nextHold =
                    body.hold !== undefined ? Boolean(body.hold) : !curHold;
                await redis.set(holdKey, nextHold ? '1' : '0');
                await logDirectorAuditEvent(
                    clearance.adminWallet,
                    'ZONE_4_GOVERNOR',
                    nextHold ? 'HOLD_BATCH_QUEUE' : 'RESUME_BATCH_QUEUE',
                    asset,
                    { asset, heldByDirector: nextHold }
                );
                return json({
                    success: true,
                    asset,
                    heldByDirector: nextHold
                });
            }

            if (subAction === 'FLUSH_NOW') {
                await redis.set(`perennia:governor:hold_queue:${asset}`, '0');
                await redis.set('perennia:chronos:last_epoch_bell_ts', '0');
                await redis.set('perennia:chronos:force_bell_now', '1');
                try {
                    await fetch(`${rustBackendUrl}/v1/admin/epoch-bell`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${internalToken}`
                        },
                        signal: AbortSignal.timeout(4000)
                    });
                } catch {
                    // Continue
                }
                await logDirectorAuditEvent(
                    clearance.adminWallet,
                    'ZONE_4_GOVERNOR',
                    'FLUSH_BATCH_QUEUE_NOW',
                    asset,
                    { asset }
                );
                return json({
                    success: true,
                    asset,
                    flushed: true
                });
            }
        }

        // ZONE 5: Security Firewall Blacklist Add / Revoke
        if (
            action === 'ADD_FIREWALL_BLACKLIST' ||
            action === 'REVOKE_FIREWALL_BLACKLIST'
        ) {
            const entityType = String(body.entityType || 'WALLET')
                .trim()
                .toUpperCase();
            const rawTarget = String(body.targetValue || '').trim();
            if (!rawTarget) {
                return json(
                    { error: 'targetValue is required for firewall action.' },
                    { status: 400 }
                );
            }
            const normalizedTarget =
                entityType === 'TOKEN_CONTRACT'
                    ? rawTarget.toUpperCase()
                    : entityType === 'WALLET'
                      ? rawTarget.toLowerCase()
                      : rawTarget;
            const reason = String(
                body.reason || 'Manual Director Security Firewall Override'
            ).trim();

            if (action === 'ADD_FIREWALL_BLACKLIST') {
                await dbPool.query(
                    `INSERT INTO security_firewall_blacklist (entity_type, target_value, reason, active, added_by)
                     VALUES ($1, $2, $3, TRUE, $4)
                     ON CONFLICT (target_value) DO UPDATE SET
                        entity_type = EXCLUDED.entity_type,
                        reason = EXCLUDED.reason,
                        active = TRUE,
                        added_by = EXCLUDED.added_by,
                        updated_at = CURRENT_TIMESTAMP`,
                    [
                        entityType,
                        normalizedTarget,
                        reason,
                        clearance.adminWallet
                    ]
                );
                if (entityType === 'WALLET') {
                    const cleanW = safeNormalizeBase32(normalizedTarget);
                    if (cleanW) {
                        await redis.sadd(
                            'perennia:firewall:blacklisted_wallets',
                            cleanW,
                            `kaspa:${cleanW}`,
                            normalizedTarget
                        );
                    } else {
                        await redis.sadd(
                            'perennia:firewall:blacklisted_wallets',
                            normalizedTarget
                        );
                    }
                } else if (entityType === 'WORKER') {
                    await redis.sadd(
                        'perennia:firewall:blacklisted_workers',
                        normalizedTarget,
                        normalizedTarget.toLowerCase()
                    );
                } else if (entityType === 'TOKEN_CONTRACT') {
                    await redis.sadd(
                        'perennia:firewall:blacklisted_tokens',
                        normalizedTarget
                    );
                    await redis.hset(
                        'perennia:steering:token_states',
                        normalizedTarget,
                        'BLACKLISTED'
                    );
                    await dbPool
                        .query(
                            `UPDATE token_steering_matrix
                             SET steering_state = 'BLACKLISTED', is_whitelisted = FALSE, updated_at = CURRENT_TIMESTAMP
                             WHERE ticker = $1 OR contract_address = $1`,
                            [normalizedTarget]
                        )
                        .catch(() => {});
                } else if (entityType === 'IP') {
                    await redis.sadd(
                        'perennia:firewall:blacklisted_ips',
                        normalizedTarget
                    );
                    fetch(`${rustBackendUrl}/v1/admin/shield`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${internalToken}`
                        },
                        body: JSON.stringify({
                            ip: normalizedTarget,
                            action: 'BAN'
                        })
                    }).catch(() => {});
                }
            } else {
                await dbPool.query(
                    `UPDATE security_firewall_blacklist
                     SET active = FALSE, updated_at = CURRENT_TIMESTAMP
                     WHERE LOWER(target_value) = LOWER($1)`,
                    [normalizedTarget]
                );
                const cleanW = safeNormalizeBase32(normalizedTarget);
                await Promise.all([
                    cleanW
                        ? redis.srem(
                              'perennia:firewall:blacklisted_wallets',
                              cleanW,
                              `kaspa:${cleanW}`,
                              normalizedTarget
                          )
                        : redis.srem(
                              'perennia:firewall:blacklisted_wallets',
                              normalizedTarget
                          ),
                    redis.srem(
                        'perennia:firewall:blacklisted_workers',
                        normalizedTarget,
                        normalizedTarget.toLowerCase()
                    ),
                    redis.srem(
                        'perennia:firewall:blacklisted_tokens',
                        normalizedTarget.toUpperCase()
                    ),
                    redis.srem(
                        'perennia:firewall:blacklisted_ips',
                        normalizedTarget
                    )
                ]);
            }

            await logDirectorAuditEvent(
                clearance.adminWallet,
                'ZONE_5_FIREWALL',
                action,
                normalizedTarget,
                { entityType, targetValue: normalizedTarget, reason }
            );

            return json({
                success: true,
                action,
                entityType,
                targetValue: normalizedTarget
            });
        }

        if (action === 'UNQUARANTINE_WALLET') {
            const rawWallet = String(body.wallet || '').trim();
            const cleanWallet = safeNormalizeBase32(rawWallet);
            if (!cleanWallet) {
                return json(
                    { error: 'Missing valid Kaspa wallet to unquarantine.' },
                    { status: 400 }
                );
            }
            const prefixedWallet = `kaspa:${cleanWallet}`;
            const rowRes = await dbPool.query(
                `SELECT streaming_balance_kas, total_yield_kas, COALESCE(lp_tokens, '{}'::jsonb) AS lp_tokens
                 FROM yield_reservoirs
                 WHERE wallet_address = $1 OR wallet_address = $2
                 LIMIT 1`,
                [prefixedWallet, cleanWallet]
            );
            if (rowRes.rows.length === 0) {
                return json(
                    { error: 'Wallet reservoir not found.' },
                    { status: 404 }
                );
            }
            const r = rowRes.rows[0];
            const sKas = Number(r.streaming_balance_kas || 0);
            const tKas = Math.max(Number(r.total_yield_kas || 0), sKas);
            const newHmac = computeReservoirHmac(
                prefixedWallet,
                sKas,
                tKas,
                r.lp_tokens
            );
            await dbPool.query(
                `UPDATE yield_reservoirs
                 SET quarantined = FALSE,
                     quarantine_reason = NULL,
                     quarantined_at = NULL,
                     total_yield_kas = $3,
                     verified_onchain_credits_kas = GREATEST(verified_onchain_credits_kas, $3),
                     row_hmac_sig = $4,
                     last_updated = CURRENT_TIMESTAMP
                 WHERE wallet_address = $1 OR wallet_address = $2`,
                [prefixedWallet, cleanWallet, tKas, newHmac]
            );
            await logDirectorAuditEvent(
                clearance.adminWallet,
                'ZONE_1_TRIAGE',
                'UNQUARANTINE_WALLET',
                prefixedWallet,
                { streamingKas: sKas }
            );
            return json({
                success: true,
                action: 'UNQUARANTINE_WALLET',
                wallet: prefixedWallet
            });
        }

        if (action === 'FORCE_EPOCH_BELL') {
            await redis.set('perennia:chronos:last_epoch_bell_ts', '0');
            await redis.set('perennia:chronos:force_bell_now', '1');
            let epochTelemetry = null;
            try {
                const rustRes = await fetch(
                    `${rustBackendUrl}/v1/admin/epoch-bell`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${internalToken}`
                        },
                        signal: AbortSignal.timeout(4500)
                    }
                );
                if (rustRes.ok) {
                    const rustData = await rustRes.json();
                    epochTelemetry = rustData.epochTelemetry || null;
                }
            } catch {
                // Fallback to cached epoch telemetry
            }
            if (!epochTelemetry) {
                const rawEpoch = await redis.get(
                    'perennia:settlement:epoch_telemetry'
                );
                if (rawEpoch) {
                    try {
                        epochTelemetry = JSON.parse(rawEpoch);
                    } catch {
                        epochTelemetry = null;
                    }
                }
            }
            await logDirectorAuditEvent(
                clearance.adminWallet,
                'ZONE_4_STRATUM',
                'FORCE_EPOCH_BELL',
                '22:00_UTC_BELL',
                { triggeredAt: new Date().toISOString() }
            );
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
                const cleanWallet = safeNormalizeBase32(
                    String(row.wallet_address || '')
                );
                const prefixedWallet = `kaspa:${cleanWallet}`;
                const assetTicker = String(
                    row.asset_ticker || 'KAS'
                ).toUpperCase();
                const amountTokens = Math.max(
                    0,
                    Number(row.amount_tokens || 0)
                );
                const grossUsd = Math.max(0, Number(row.gross_usd || 0));
                const spotPrice = Math.max(0, Number(row.spot_price || 0));
                if (action === 'CONFIRM_L1_PAYOUT') {
                    const resolvedTxHash = String(body.txHash || '').trim();
                    if (!resolvedTxHash) {
                        return json(
                            {
                                error: 'TX_HASH_REQUIRED: Provide the verified on-chain transaction hash to confirm an L1 payout.'
                            },
                            { status: 400 }
                        );
                    }
                    const explorerUrl = buildExplorerTxUrl(
                        assetTicker,
                        resolvedTxHash
                    );
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
                    await logDirectorAuditEvent(
                        clearance.adminWallet,
                        'ZONE_4_GOVERNOR',
                        'CONFIRM_L1_PAYOUT',
                        payoutId,
                        { assetTicker, amountTokens, txHash: resolvedTxHash }
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
                    await redis.hincrbyfloat(
                        userLedgerKey,
                        assetTicker,
                        amountTokens
                    );
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
                    await logDirectorAuditEvent(
                        clearance.adminWallet,
                        'ZONE_4_GOVERNOR',
                        'REFUND_L1_PAYOUT',
                        payoutId,
                        { assetTicker, amountTokens }
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
            const dateStamp = new Date()
                .toISOString()
                .slice(0, 10)
                .replace(/-/g, '');
            const randHex = crypto
                .randomBytes(2)
                .toString('hex')
                .toUpperCase();
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
                        wallet: safeNormalizeBase32(wAddr),
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
            await logDirectorAuditEvent(
                clearance.adminWallet,
                'ZONE_3_FIAT_DESK',
                'BULK_SETTLE_FIAT_PAYOUTS',
                batchTracePrefix,
                { settledCount, totalDispatchedUsd }
            );
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
                return json(
                    { error: 'IP address is required.' },
                    { status: 400 }
                );
            }
            const shieldMode = action === 'UNBAN_IP' ? 'UNBAN' : 'BAN';
            if (shieldMode === 'BAN') {
                await redis.sadd('perennia:firewall:blacklisted_ips', ip);
            } else {
                await redis.srem('perennia:firewall:blacklisted_ips', ip);
            }
            await logDirectorAuditEvent(
                clearance.adminWallet,
                'ZONE_5_FIREWALL',
                action,
                ip,
                { ip, shieldMode }
            );
            const res = await fetch(`${rustBackendUrl}/v1/admin/shield`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${internalToken}`
                },
                body: JSON.stringify({ ip, action: shieldMode })
            }).catch(() => null);
            if (res && res.ok) {
                return json(await res.json());
            }
            return json({
                success: true,
                action: shieldMode === 'UNBAN' ? 'UNBANNED' : 'BANNED',
                ip
            });
        }

        if (action === 'ADD_WHITELIST') {
            const rawWallet = String(body.wallet || '').trim();
            const label = String(body.label || 'Director Whitelisted').trim();
            const clean = safeNormalizeBase32(rawWallet);
            if (clean.length < 55) {
                return json(
                    { error: 'Invalid Kaspa wallet address.' },
                    { status: 400 }
                );
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
            await logDirectorAuditEvent(
                clearance.adminWallet,
                'ZONE_5_FIREWALL',
                'ADD_WHITELIST',
                prefixed,
                { label }
            );
            return json({ success: true, wallet: prefixed, label });
        }

        if (action === 'REMOVE_WHITELIST') {
            const rawWallet = String(body.wallet || '').trim();
            const clean = safeNormalizeBase32(rawWallet);
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
            await logDirectorAuditEvent(
                clearance.adminWallet,
                'ZONE_5_FIREWALL',
                'REMOVE_WHITELIST',
                prefixed,
                {}
            );
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
                    {
                        error: 'Missing wallet or payoutId to decrypt bank rail.'
                    },
                    { status: 400 }
                );
            }
            const decrypted =
                await resolveDecryptedBankRailForWallet(targetWallet);
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
                const accountNumber =
                    dec?.accountNumber || `*${r.bank_last4 || '0000'}`;
                const bankLabel = (
                    dec?.bankLabel || 'Primary Operating Account'
                ).replace(/,/g, ' ');
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
            const cleanWallet = safeNormalizeBase32(walletAddress);
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
            await logDirectorAuditEvent(
                clearance.adminWallet,
                'ZONE_3_FIAT_DESK',
                'SETTLE_FIAT_PAYOUT',
                payoutId,
                { traceId, netFiatUsd }
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
                return json(
                    { error: 'Missing payoutId to refund.' },
                    { status: 400 }
                );
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
                const cleanWallet = safeNormalizeBase32(
                    String(row.wallet_address || '')
                );
                const sourceAsset = String(
                    row.source_asset || 'KAS'
                ).toUpperCase();
                const amountCrypto = Math.max(
                    0,
                    Number(row.amount_crypto || 0)
                );
                const grossUsd = Math.max(0, Number(row.gross_usd || 0));
                const feeUsd = Math.max(0, Number(row.fee_usd || 0));
                if (!cleanWallet || amountCrypto <= 0) {
                    return json(
                        {
                            error: 'Invalid wallet or crypto amount on fiat payout record.'
                        },
                        { status: 400 }
                    );
                }
                const userLedgerKey = `dev:sor:treasury:balances:${cleanWallet}`;
                await redis.hincrbyfloat(
                    userLedgerKey,
                    sourceAsset,
                    amountCrypto
                );
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
                    [
                        cleanWallet,
                        sourceAsset,
                        grossUsd,
                        amountCrypto,
                        spot,
                        payoutId
                    ]
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
                await logDirectorAuditEvent(
                    clearance.adminWallet,
                    'ZONE_3_FIAT_DESK',
                    'REFUND_FIAT_PAYOUT',
                    payoutId,
                    { sourceAsset, amountCrypto }
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

        if (
            action === 'FULFILL_FIAT_ONRAMP' ||
            action === 'CONFIRM_INSTITUTIONAL_WIRE' ||
            action === 'CANCEL_FIAT_ONRAMP'
        ) {
            const orderId = String(body.orderId || body.wireMemo || '').trim();
            if (!orderId) {
                return json({ error: 'Missing orderId.' }, { status: 400 });
            }
            let client;
            try {
                client = await dbPool.connect();
                const existing = await client.query(
                    `SELECT * FROM fiat_onramp_orders WHERE order_id = $1 OR wire_memo = $1 LIMIT 1`,
                    [orderId]
                );
                if (existing.rows.length === 0) {
                    return json(
                        { error: `Fiat on-ramp order ${orderId} not found.` },
                        { status: 404 }
                    );
                }
                const row = existing.rows[0];
                const resolvedOrderId = String(row.order_id);
                if (row.status === 'COMPLETED' || row.status === 'CANCELLED') {
                    return json(
                        {
                            error: `Fiat on-ramp order ${resolvedOrderId} is already ${row.status}.`
                        },
                        { status: 400 }
                    );
                }
                const cleanWallet = safeNormalizeBase32(
                    String(row.wallet_address || '')
                );
                const prefixedWallet = `kaspa:${cleanWallet}`;
                if (action === 'CANCEL_FIAT_ONRAMP') {
                    await client.query(
                        `UPDATE fiat_onramp_orders
                         SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
                         WHERE order_id = $1`,
                        [resolvedOrderId]
                    );
                    await logDirectorAuditEvent(
                        clearance.adminWallet,
                        'ZONE_3_FIAT_DESK',
                        'CANCEL_FIAT_ONRAMP',
                        resolvedOrderId,
                        { wallet: prefixedWallet }
                    );
                    return json({
                        success: true,
                        orderId: resolvedOrderId,
                        status: 'CANCELLED'
                    });
                }

                const targetAsset = String(
                    row.target_asset || 'KAS'
                ).toUpperCase();
                const fiatAmountUsd = Math.max(
                    0,
                    Number(row.fiat_amount_usd || 0)
                );
                const feeUsd = Math.max(0, Number(row.fee_usd || 0));
                const netUsdConverted = Math.max(
                    0,
                    Number(row.net_usd_converted || 0)
                );
                const lockedSpot = Math.max(
                    0,
                    Number(row.target_spot_price || row.locked_spot_price || 0)
                );
                const liveSpotStr = await redis.get(
                    `oracle:spot:${targetAsset}_USDC`
                );
                const liveSpot =
                    targetAsset === 'USDC' || targetAsset === 'USDT'
                        ? 1.0
                        : liveSpotStr
                          ? parseFloat(liveSpotStr) || 0
                          : 0;
                const executionSpot = liveSpot > 0 ? liveSpot : lockedSpot;
                if (executionSpot <= 0) {
                    return json(
                        {
                            error: `ORACLE_HALT: Live ${targetAsset}/USDC spot price is unavailable and order has no locked spot price.`
                        },
                        { status: 503 }
                    );
                }
                const deliveredTokens = Number(
                    (netUsdConverted / executionSpot).toFixed(4)
                );
                const settlementTarget =
                    String(
                        body.settlementTarget ||
                            row.settlement_target ||
                            'LEDGER_KAS'
                    ).toUpperCase() === 'L1_KAS'
                        ? 'L1_KAS'
                        : 'LEDGER_KAS';
                let resolvedTxHash = String(body.txHash || '').trim();
                if (settlementTarget === 'L1_KAS') {
                    const l1Res = await executeOrQueueL1Dispatch({
                        wallet: prefixedWallet,
                        destinationAddress: prefixedWallet,
                        asset: targetAsset,
                        amount: deliveredTokens,
                        sourceType: 'fiat_onramp_l1',
                        spotPrice: executionSpot
                    });
                    resolvedTxHash =
                        l1Res.txHash ||
                        resolvedTxHash ||
                        `L1-ONRAMP-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
                } else {
                    const userLedgerKey = `dev:sor:treasury:balances:${cleanWallet}`;
                    await redis.hincrbyfloat(
                        userLedgerKey,
                        targetAsset,
                        deliveredTokens
                    );
                    if (!resolvedTxHash) {
                        resolvedTxHash = `MERCURY-WIRE-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
                    }
                }
                await client.query(
                    `UPDATE fiat_onramp_orders
                     SET status = 'COMPLETED',
                         delivered_kas = $2,
                         estimated_tokens = $2,
                         tx_hash = $3,
                         settlement_target = $4,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE order_id = $1`,
                    [
                        resolvedOrderId,
                        deliveredTokens,
                        resolvedTxHash,
                        settlementTarget
                    ]
                );
                await client.query(
                    `INSERT INTO tax_ledger_events (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash, cost_basis_usd, realized_gain_loss_usd, holding_period)
                     VALUES ($1, $2, 'FIAT_ONRAMP', $3, $4, $5, $6, $3, 0.0, 'SHORT_TERM')`,
                    [
                        cleanWallet,
                        targetAsset,
                        fiatAmountUsd,
                        deliveredTokens,
                        executionSpot,
                        resolvedTxHash
                    ]
                );
                const unitBasisUsd =
                    deliveredTokens > 0
                        ? fiatAmountUsd / deliveredTokens
                        : executionSpot;
                const sompiAcquired = Math.round(deliveredTokens * 1e8);
                await client
                    .query(
                        `INSERT INTO hifo_tax_lots
                         (wallet_address, asset_ticker, kas_sompi, initial_tokens, remaining_sompi, remaining_tokens, fmv_usd_per_token, total_cost_basis_usd, source_event_type, source_tx_hash, status)
                         VALUES ($1, $2, $3, $4, $3, $4, $5, $6, 'FIAT_ONRAMP', $7, 'OPEN')`,
                        [
                            cleanWallet,
                            targetAsset,
                            sompiAcquired,
                            deliveredTokens,
                            unitBasisUsd,
                            fiatAmountUsd,
                            resolvedTxHash
                        ]
                    )
                    .catch(() => {});

                const lpCompound60 = roundCents(feeUsd * 0.6);
                const liquid40 = roundCents(Math.max(0, feeUsd - lpCompound60));
                await client
                    .query(
                        `UPDATE fiat_float_ledger
                         SET dark_pool_lp_vault_usd = dark_pool_lp_vault_usd + $1,
                             master_treasury_usdc_reserve = COALESCE(master_treasury_usdc_reserve, 0.0) + $2,
                             commercial_checking_cleared_usd = commercial_checking_cleared_usd + $3,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE ledger_id IN ('PRIMARY_FLOAT', 'BOOTSTRAP_PRIMARY')`,
                        [lpCompound60, liquid40, fiatAmountUsd]
                    )
                    .catch(() => {});

                await logDirectorAuditEvent(
                    clearance.adminWallet,
                    'ZONE_3_FIAT_DESK',
                    action,
                    resolvedOrderId,
                    {
                        wallet: prefixedWallet,
                        fiatAmountUsd,
                        deliveredTokens,
                        targetAsset,
                        txHash: resolvedTxHash
                    }
                );

                return json({
                    success: true,
                    orderId: resolvedOrderId,
                    wallet: prefixedWallet,
                    deliveredKas: deliveredTokens,
                    deliveredTokens,
                    targetAsset,
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
                const targetClean = safeNormalizeBase32(String(body.wallet));
                const targetTicker = String(body.targetAsset || '')
                    .trim()
                    .toUpperCase();
                for (const itemStr of rawQueue) {
                    try {
                        const parsed = JSON.parse(itemStr);
                        const itemClean = safeNormalizeBase32(
                            String(parsed.wallet || '')
                        );
                        const itemTicker = String(parsed.target_asset || '')
                            .trim()
                            .toUpperCase();
                        if (
                            itemClean &&
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
            const cleanWallet = safeNormalizeBase32(
                String(effectiveOrder.wallet || '')
            );
            const prefixedWallet = `kaspa:${cleanWallet}`;
            const targetAsset = String(
                effectiveOrder.target_asset || 'CUSTOM'
            )
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
            const upfrontFeeKas = Math.max(
                0,
                Number(effectiveOrder.upfront_fee_kas || 0)
            );
            const estimatedOutput = Math.max(
                0,
                Number(effectiveOrder.estimated_output || 0)
            );
            const spotPrice = Math.max(
                0,
                Number(effectiveOrder.spot_price || 0)
            );
            const kasSpotStr = await redis.get('oracle:spot:KAS_USDC');
            const kasSpot = kasSpotStr ? parseFloat(kasSpotStr) || 0 : 0;
            if (action === 'CONFIRM_PASSTHROUGH_FILL') {
                if (spotPrice <= 0 && kasSpot <= 0) {
                    return json(
                        {
                            error: 'ORACLE_HALT: Live KAS/USDC spot price is unavailable and order has no execution spot price.'
                        },
                        { status: 503 }
                    );
                }
                const resolvedTxHash =
                    String(body.txHash || '').trim() ||
                    `PT-FILL-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
                const grossUsd =
                    spotPrice > 0 && estimatedOutput > 0
                        ? estimatedOutput * spotPrice
                        : grossKas * kasSpot;
                const resolvedUnitSpot =
                    spotPrice > 0
                        ? spotPrice
                        : estimatedOutput > 0
                          ? grossUsd / estimatedOutput
                          : kasSpot;
                const finalQty =
                    estimatedOutput > 0 ? estimatedOutput : grossKas;
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
                            `INSERT INTO tax_ledger_events (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash, cost_basis_usd, realized_gain_loss_usd, holding_period)
                             VALUES ($1, $2, 'PASSTHROUGH_SETTLED', $3, $4, $5, $6, $3, 0.0, 'SHORT_TERM')`,
                            [
                                cleanWallet,
                                targetAsset,
                                grossUsd,
                                finalQty,
                                resolvedUnitSpot,
                                resolvedTxHash
                            ]
                        );
                    }
                } finally {
                    if (client) client.release();
                }
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
            const popped = await redis.lpop(
                'perennia:sor:third_party_passthrough_queue'
            );
            return json({
                success: true,
                popped: popped ? JSON.parse(popped) : null
            });
        }

        return json(
            { error: `Unsupported Director action: ${action}` },
            { status: 400 }
        );
    } catch (err: any) {
        return json(
            { error: err.message || 'Director action execution failed.' },
            { status: 500 }
        );
    }
};