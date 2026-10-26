import { json, type RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { redis } from '$lib/server/redis';
import { dbPool } from '$lib/server/db';
import crypto from 'node:crypto';

const KASPA_BURN_ADDRESS =
    'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e';

function containsForbiddenPrivateKey(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') return false;
    if (Array.isArray(obj)) {
        return obj.some(containsForbiddenPrivateKey);
    }
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        const lower = k.toLowerCase();
        if (
            (lower === 'privatekeyhex' ||
                lower === 'buyerprivatekeyhex' ||
                lower === 'private_key' ||
                lower === 'mnemonic' ||
                lower === 'seedphrase') &&
            typeof v === 'string' &&
            v.trim().length > 0
        ) {
            return true;
        }
        if (containsForbiddenPrivateKey(v)) return true;
    }
    return false;
}

async function ensureForgeTablesExist() {
    const client = await dbPool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS forge_vesting_schedules (
                vesting_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                token_ticker VARCHAR(32) NOT NULL,
                beneficiary_address VARCHAR(255) NOT NULL,
                creator_address VARCHAR(255) NOT NULL,
                label VARCHAR(128) NOT NULL DEFAULT 'Genesis Tranche',
                total_allocated DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                unlocked_amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                claimed_amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                cliff_days INTEGER NOT NULL DEFAULT 0,
                linear_days INTEGER NOT NULL DEFAULT 365,
                cliff_unlock_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                full_unlock_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                daily_unlock_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                covenant_rule VARCHAR(64) NOT NULL DEFAULT 'TIMELOCK_ESCROW_COVENANT',
                vprog_state_root VARCHAR(128) NOT NULL DEFAULT '',
                lock_tx_hash VARCHAR(255),
                status VARCHAR(32) NOT NULL DEFAULT 'LOCKED',
                last_bell_unlocked_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_forge_vesting_ticker ON forge_vesting_schedules (token_ticker, status);
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS forge_monetary_policies (
                policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                token_ticker VARCHAR(32) UNIQUE NOT NULL,
                creator_address VARCHAR(255) NOT NULL,
                max_supply DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                burn_rate_bps INTEGER NOT NULL DEFAULT 0,
                burn_address VARCHAR(255) NOT NULL DEFAULT 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e',
                total_burned_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                emission_schedule_type VARCHAR(48) NOT NULL DEFAULT 'CHROMATIC_HALVING',
                daily_emission_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                halving_interval_days INTEGER NOT NULL DEFAULT 365,
                reserve_locked_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                reserve_emitted_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                zero_rug_lp_pct DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                zero_rug_lock_days INTEGER NOT NULL DEFAULT 365,
                is_retroactive_upgrade BOOLEAN NOT NULL DEFAULT FALSE,
                charter_sha256 VARCHAR(128) NOT NULL DEFAULT '',
                anchor_tx_hash VARCHAR(255),
                last_bell_processed_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS forge_mineable_vaults (
                vault_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                token_ticker VARCHAR(32) UNIQUE NOT NULL,
                creator_address VARCHAR(255) NOT NULL,
                vault_label VARCHAR(128) NOT NULL DEFAULT 'Proof-of-Hashrate Mining Vault',
                total_funded_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                remaining_vault_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                daily_emission_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                distributed_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                min_hashrate_ths DOUBLE PRECISION NOT NULL DEFAULT 0.1,
                syndicate_sector_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                active_miners_count INTEGER NOT NULL DEFAULT 0,
                status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
                funding_tx_hash VARCHAR(255),
                last_bell_distributed_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
    } finally {
        client.release();
    }
}

async function queryForgeBundleFromPostgres(
    tickerOpt?: string | null,
    includeAllMineableVaults = true
) {
    await ensureForgeTablesExist();
    const client = await dbPool.connect();
    try {
        const vestingSchedules: any[] = [];
        let monetaryPolicy: any = null;
        let mineableVault: any = null;
        const allMineableVaults: any[] = [];
        let lockedVestingSupply = 0;
        let unlockedVestedSupply = 0;
        let dailyUnlockTotal = 0;
        let burnedSupply = 0;
        let reserveLockedSupply = 0;

        if (tickerOpt && tickerOpt.trim()) {
            const cleanTicker = tickerOpt.trim().toUpperCase();
            const vestRes = await client.query(
                `SELECT * FROM forge_vesting_schedules WHERE token_ticker = $1 ORDER BY created_at ASC`,
                [cleanTicker]
            );
            for (const r of vestRes.rows) {
                const totalAlloc = Number(r.total_allocated || 0);
                const unlocked = Number(r.unlocked_amount || 0);
                const remLocked = Math.max(0, totalAlloc - unlocked);
                const dailyRate = Number(r.daily_unlock_rate || 0);
                lockedVestingSupply += remLocked;
                unlockedVestedSupply += unlocked;
                if (remLocked > 0) dailyUnlockTotal += dailyRate;
                vestingSchedules.push({
                    vestingId: r.vesting_id,
                    tokenTicker: r.token_ticker,
                    beneficiaryAddress: r.beneficiary_address,
                    creatorAddress: r.creator_address,
                    label: r.label,
                    totalAllocated: totalAlloc,
                    unlockedAmount: unlocked,
                    remainingLocked: remLocked,
                    claimedAmount: Number(r.claimed_amount || 0),
                    cliffDays: Number(r.cliff_days || 0),
                    linearDays: Number(r.linear_days || 0),
                    cliffUnlockAt: r.cliff_unlock_at
                        ? new Date(r.cliff_unlock_at).toISOString()
                        : null,
                    fullUnlockAt: r.full_unlock_at
                        ? new Date(r.full_unlock_at).toISOString()
                        : null,
                    dailyUnlockRate: dailyRate,
                    covenantRule: r.covenant_rule,
                    vprogStateRoot: r.vprog_state_root,
                    lockTxHash: r.lock_tx_hash,
                    status: r.status
                });
            }

            const polRes = await client.query(
                `SELECT * FROM forge_monetary_policies WHERE token_ticker = $1 LIMIT 1`,
                [cleanTicker]
            );
            if (polRes.rows.length > 0) {
                const p = polRes.rows[0];
                burnedSupply = Number(p.total_burned_tokens || 0);
                reserveLockedSupply = Math.max(
                    0,
                    Number(p.reserve_locked_tokens || 0) -
                        Number(p.reserve_emitted_tokens || 0)
                );
                monetaryPolicy = {
                    policyId: p.policy_id,
                    tokenTicker: p.token_ticker,
                    creatorAddress: p.creator_address,
                    maxSupply: Number(p.max_supply || 0),
                    burnRateBps: Number(p.burn_rate_bps || 0),
                    burnAddress: p.burn_address || KASPA_BURN_ADDRESS,
                    totalBurnedTokens: burnedSupply,
                    emissionScheduleType: p.emission_schedule_type,
                    dailyEmissionRate: Number(p.daily_emission_rate || 0),
                    halvingIntervalDays: Number(p.halving_interval_days || 365),
                    reserveLockedTokens: Number(p.reserve_locked_tokens || 0),
                    reserveEmittedTokens: Number(p.reserve_emitted_tokens || 0),
                    remainingReserveTokens: reserveLockedSupply,
                    zeroRugLpPct: Number(p.zero_rug_lp_pct || 0),
                    zeroRugLockDays: Number(p.zero_rug_lock_days || 365),
                    isRetroactiveUpgrade: Boolean(p.is_retroactive_upgrade),
                    charterSha256: p.charter_sha256,
                    anchorTxHash: p.anchor_tx_hash
                };
            }

            const mvRes = await client.query(
                `SELECT * FROM forge_mineable_vaults WHERE token_ticker = $1 LIMIT 1`,
                [cleanTicker]
            );
            if (mvRes.rows.length > 0) {
                const mv = mvRes.rows[0];
                mineableVault = {
                    vaultId: mv.vault_id,
                    tokenTicker: mv.token_ticker,
                    creatorAddress: mv.creator_address,
                    vaultLabel: mv.vault_label,
                    totalFundedTokens: Number(mv.total_funded_tokens || 0),
                    remainingVaultTokens: Number(mv.remaining_vault_tokens || 0),
                    dailyEmissionTokens: Number(mv.daily_emission_tokens || 0),
                    distributedTokens: Number(mv.distributed_tokens || 0),
                    minHashrateThs: Number(mv.min_hashrate_ths || 0.1),
                    syndicateSectorEnabled: Boolean(mv.syndicate_sector_enabled),
                    activeMinersCount: Number(mv.active_miners_count || 0),
                    status: mv.status,
                    fundingTxHash: mv.funding_tx_hash
                };
            }
        }

        if (includeAllMineableVaults) {
            const allRes = await client.query(
                `SELECT * FROM forge_mineable_vaults WHERE status = 'ACTIVE' AND remaining_vault_tokens > 0 ORDER BY remaining_vault_tokens DESC LIMIT 100`
            );
            for (const mv of allRes.rows) {
                allMineableVaults.push({
                    vaultId: mv.vault_id,
                    tokenTicker: mv.token_ticker,
                    creatorAddress: mv.creator_address,
                    vaultLabel: mv.vault_label,
                    totalFundedTokens: Number(mv.total_funded_tokens || 0),
                    remainingVaultTokens: Number(mv.remaining_vault_tokens || 0),
                    dailyEmissionTokens: Number(mv.daily_emission_tokens || 0),
                    distributedTokens: Number(mv.distributed_tokens || 0),
                    minHashrateThs: Number(mv.min_hashrate_ths || 0.1),
                    syndicateSectorEnabled: Boolean(mv.syndicate_sector_enabled),
                    activeMinersCount: Number(mv.active_miners_count || 0),
                    status: mv.status,
                    fundingTxHash: mv.funding_tx_hash
                });
            }
        }

        const miningVaultLockedSupply = Number(
            mineableVault?.remainingVaultTokens || 0
        );

        return {
            vestingSchedules,
            monetaryPolicy,
            mineableVault,
            allMineableVaults,
            proofOfLockSummary: {
                lockedVestingSupply,
                unlockedVestedSupply,
                reserveLockedSupply,
                miningVaultLockedSupply,
                totalLockedSupply:
                    lockedVestingSupply + reserveLockedSupply + miningVaultLockedSupply,
                burnedSupply,
                daily2200UtcUnlockRate: dailyUnlockTotal,
                burnAddress: KASPA_BURN_ADDRESS
            }
        };
    } finally {
        client.release();
    }
}

export async function POST({ request, cookies }: RequestEvent) {
    const sessionId = cookies.get('perennia_session');
    if (!sessionId) {
        return json({ error: 'UNAUTHORIZED_STATE_ACTION' }, { status: 401 });
    }
    const sessionWalletRaw = await redis.get(`session:${sessionId}`);
    if (!sessionWalletRaw) {
        return json({ error: 'SESSION_EXPIRED' }, { status: 401 });
    }

    try {
        const payload = await request.json();
        if (containsForbiddenPrivateKey(payload)) {
            return json(
                {
                    success: false,
                    error: 'ZERO_TRUST_VIOLATION: Client private keys must never leave browser memory.'
                },
                { status: 400 }
            );
        }

        const sessionWallet = sessionWalletRaw;
        let cleanWallet = sessionWallet.toLowerCase().replace(/^kaspa:/i, '').trim();
        const isCorpAdmin =
            env.MASTER_ADMIN_ADDRESS &&
            sessionWallet.toLowerCase() === env.MASTER_ADMIN_ADDRESS.toLowerCase();
        if (isCorpAdmin && payload.targetWallet) {
            cleanWallet = payload.targetWallet
                .toLowerCase()
                .replace(/^kaspa:/i, '')
                .trim();
        }
        const prefixedWallet = `kaspa:${cleanWallet}`;

        const rustBackendUrl =
            env.RUST_BACKEND_URL || `http://${env.UBUNTU_NODE_IP || '127.0.0.1'}:8002`;

        try {
            const rustRes = await fetch(`${rustBackendUrl}/v1/state/action`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${env.INTERNAL_ADMIN_TOKEN || env.PERENNIA_ADMIN_KEY || ''}`
                },
                body: JSON.stringify({
                    wallet: cleanWallet,
                    action: payload.action,
                    payload: payload.payload
                }),
                keepalive: true,
                signal: AbortSignal.timeout(5500)
            });

            if (rustRes.ok) {
                const data = await rustRes.json();
                return json(data, { status: 200 });
            }
        } catch {
            // Fallback to direct PostgreSQL + Redis execution for Forge tokenomics actions when Rust node is unreachable
        }

        const action = String(payload.action || '').toUpperCase();
        const reqPayload = payload.payload || {};

        if (action === 'GET_FORGE_TOKENOMICS') {
            const bundle = await queryForgeBundleFromPostgres(
                reqPayload.ticker || reqPayload.tokenTicker,
                reqPayload.includeAllMineableVaults ?? true
            );
            return json({ success: true, data: bundle }, { status: 200 });
        }

        if (
            action === 'REGISTER_FORGE_TOKENOMICS' ||
            action === 'RETROACTIVE_FORGE_UPGRADE'
        ) {
            await ensureForgeTablesExist();
            const isRetro =
                action === 'RETROACTIVE_FORGE_UPGRADE' ||
                Boolean(reqPayload.isRetroactiveUpgrade);
            const rawTicker = String(
                reqPayload.ticker || reqPayload.tokenTicker || ''
            )
                .trim()
                .toUpperCase();
            if (rawTicker.length < 4 || rawTicker.length > 6) {
                return json(
                    {
                        success: false,
                        error: 'KRC-20 ticker must be 4 to 6 alphabetic characters.'
                    },
                    { status: 400 }
                );
            }
            const maxSupply = Math.max(1, Number(reqPayload.maxSupply || 21_000_000));
            const deployTxHash =
                String(
                    reqPayload.deployTxHash || reqPayload.anchorTxHash || ''
                ).trim() || null;

            const protocolFeeKas = Math.max(
                0,
                Math.min(500, Number(reqPayload.protocolFeeKas ?? 1.5))
            );
            if (protocolFeeKas > 0) {
                await redis
                    .incrbyfloat(
                        'perennia:fees:batch_accumulated:KAS',
                        protocolFeeKas
                    )
                    .catch(() => {});
            }

            const client = await dbPool.connect();
            let insertedVestingCount = 0;
            try {
                if (Array.isArray(reqPayload.capTable)) {
                    for (const row of reqPayload.capTable) {
                        const rawAddr = String(
                            row.address || row.beneficiaryAddress || ''
                        ).trim();
                        const amount = Math.max(
                            0,
                            Number(row.amount ?? row.totalAllocated ?? 0)
                        );
                        if (!rawAddr || amount <= 0) continue;
                        const cleanBen = rawAddr.toLowerCase().replace(/^kaspa:/i, '');
                        const prefixedBen = `kaspa:${cleanBen}`;
                        const label =
                            String(row.label || 'Genesis Allocation').trim() ||
                            'Genesis Allocation';
                        const cliffDays = Math.max(
                            0,
                            Math.floor(Number(row.cliffDays ?? row.cliff_days ?? 0))
                        );
                        const linearDays = Math.max(
                            0,
                            Math.floor(Number(row.linearDays ?? row.linear_days ?? 0))
                        );
                        const isLocked = cliffDays > 0 || linearDays > 0;
                        const effLinearDays = isLocked ? Math.max(1, linearDays) : 0;
                        const dailyRate =
                            effLinearDays > 0 ? amount / effLinearDays : amount;
                        const initialUnlocked = isLocked ? 0 : amount;
                        const status = isLocked ? 'LOCKED' : 'UNLOCKED';
                        const vprogStateRoot =
                            String(row.vprogStateRoot || '').trim() ||
                            crypto
                                .createHash('sha256')
                                .update(
                                    `TIMELOCK_ESCROW_COVENANT:${rawTicker}:${prefixedBen}:${amount}:${cliffDays}:${effLinearDays}`
                                )
                                .digest('hex');

                        await client.query(
                            `INSERT INTO forge_vesting_schedules
                             (token_ticker, beneficiary_address, creator_address, label, total_allocated,
                              unlocked_amount, claimed_amount, cliff_days, linear_days,
                              cliff_unlock_at, full_unlock_at, daily_unlock_rate, covenant_rule,
                              vprog_state_root, lock_tx_hash, status)
                             VALUES ($1, $2, $3, $4, $5, $6, 0.0, $7, $8,
                                     CURRENT_TIMESTAMP + make_interval(days => $7),
                                     CURRENT_TIMESTAMP + make_interval(days => $9),
                                     $10, 'TIMELOCK_ESCROW_COVENANT', $11, $12, $13)`,
                            [
                                rawTicker,
                                prefixedBen,
                                prefixedWallet,
                                label,
                                amount,
                                initialUnlocked,
                                cliffDays,
                                effLinearDays,
                                cliffDays + effLinearDays,
                                dailyRate,
                                vprogStateRoot,
                                row.txHash || deployTxHash,
                                status
                            ]
                        );
                        insertedVestingCount++;
                    }
                }

                if (reqPayload.monetaryPolicy) {
                    const mp = reqPayload.monetaryPolicy;
                    const burnRateBps = Math.max(
                        0,
                        Math.min(2000, Math.floor(Number(mp.burnRateBps ?? 50)))
                    );
                    const emissionScheduleType = String(
                        mp.emissionScheduleType || 'CHROMATIC_HALVING'
                    )
                        .trim()
                        .toUpperCase();
                    const dailyEmissionRate = Math.max(
                        0,
                        Number(mp.dailyEmissionRate || 0)
                    );
                    const halvingIntervalDays = Math.max(
                        30,
                        Math.floor(Number(mp.halvingIntervalDays || 365))
                    );
                    const reserveLockedTokens = Math.max(
                        0,
                        Number(mp.reserveLockedTokens || 0)
                    );
                    const zeroRugLpPct = Math.max(
                        0,
                        Math.min(100, Number(mp.zeroRugLpPct || 0))
                    );
                    const zeroRugLockDays = Math.max(
                        30,
                        Math.floor(Number(mp.zeroRugLockDays || 365))
                    );
                    const charterSha256 =
                        String(mp.charterSha256 || '').trim() ||
                        crypto
                            .createHash('sha256')
                            .update(
                                `MONETARY_CHARTER:${rawTicker}:${maxSupply}:${burnRateBps}:${emissionScheduleType}:${dailyEmissionRate}:${zeroRugLpPct}`
                            )
                            .digest('hex');

                    await client.query(
                        `INSERT INTO forge_monetary_policies
                         (token_ticker, creator_address, max_supply, burn_rate_bps, burn_address,
                          emission_schedule_type, daily_emission_rate, halving_interval_days,
                          reserve_locked_tokens, zero_rug_lp_pct, zero_rug_lock_days,
                          is_retroactive_upgrade, charter_sha256, anchor_tx_hash, updated_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
                         ON CONFLICT (token_ticker) DO UPDATE SET
                            burn_rate_bps = EXCLUDED.burn_rate_bps,
                            emission_schedule_type = EXCLUDED.emission_schedule_type,
                            daily_emission_rate = EXCLUDED.daily_emission_rate,
                            halving_interval_days = EXCLUDED.halving_interval_days,
                            reserve_locked_tokens = forge_monetary_policies.reserve_locked_tokens + EXCLUDED.reserve_locked_tokens,
                            zero_rug_lp_pct = EXCLUDED.zero_rug_lp_pct,
                            zero_rug_lock_days = EXCLUDED.zero_rug_lock_days,
                            is_retroactive_upgrade = EXCLUDED.is_retroactive_upgrade,
                            charter_sha256 = EXCLUDED.charter_sha256,
                            anchor_tx_hash = COALESCE(EXCLUDED.anchor_tx_hash, forge_monetary_policies.anchor_tx_hash),
                            updated_at = CURRENT_TIMESTAMP`,
                        [
                            rawTicker,
                            prefixedWallet,
                            maxSupply,
                            burnRateBps,
                            KASPA_BURN_ADDRESS,
                            emissionScheduleType,
                            dailyEmissionRate,
                            halvingIntervalDays,
                            reserveLockedTokens,
                            zeroRugLpPct,
                            zeroRugLockDays,
                            isRetro,
                            charterSha256,
                            deployTxHash
                        ]
                    );
                }

                if (reqPayload.mineableVault) {
                    const mv = reqPayload.mineableVault;
                    const enabled = mv.enabled !== false;
                    const fundedTokens = Math.max(
                        0,
                        Number(mv.totalFundedTokens ?? mv.fundedTokens ?? 0)
                    );
                    const dailyEmission = Math.max(
                        0,
                        Number(mv.dailyEmissionTokens ?? fundedTokens / 365)
                    );
                    const minHashrateThs = Math.max(
                        0.01,
                        Number(mv.minHashrateThs ?? 0.1)
                    );
                    const syndicateEnabled = mv.syndicateSectorEnabled !== false;
                    const vaultLabel =
                        String(
                            mv.vaultLabel || 'Proof-of-Hashrate Mining Vault'
                        ).trim() || 'Proof-of-Hashrate Mining Vault';

                    if (enabled && fundedTokens > 0) {
                        await client.query(
                            `INSERT INTO forge_mineable_vaults
                             (token_ticker, creator_address, vault_label, total_funded_tokens,
                              remaining_vault_tokens, daily_emission_tokens, distributed_tokens,
                              min_hashrate_ths, syndicate_sector_enabled, status, funding_tx_hash, updated_at)
                             VALUES ($1, $2, $3, $4, $4, $5, 0.0, $6, $7, 'ACTIVE', $8, CURRENT_TIMESTAMP)
                             ON CONFLICT (token_ticker) DO UPDATE SET
                                total_funded_tokens = forge_mineable_vaults.total_funded_tokens + EXCLUDED.total_funded_tokens,
                                remaining_vault_tokens = forge_mineable_vaults.remaining_vault_tokens + EXCLUDED.remaining_vault_tokens,
                                daily_emission_tokens = EXCLUDED.daily_emission_tokens,
                                min_hashrate_ths = EXCLUDED.min_hashrate_ths,
                                syndicate_sector_enabled = EXCLUDED.syndicate_sector_enabled,
                                status = 'ACTIVE',
                                funding_tx_hash = COALESCE(EXCLUDED.funding_tx_hash, forge_mineable_vaults.funding_tx_hash),
                                updated_at = CURRENT_TIMESTAMP`,
                            [
                                rawTicker,
                                prefixedWallet,
                                vaultLabel,
                                fundedTokens,
                                dailyEmission,
                                minHashrateThs,
                                syndicateEnabled,
                                deployTxHash
                            ]
                        );
                    }
                }
            } finally {
                client.release();
            }

            const bundle = await queryForgeBundleFromPostgres(rawTicker, true);
            return json(
                {
                    success: true,
                    transaction_id: deployTxHash,
                    data: {
                        ticker: rawTicker,
                        isRetroactiveUpgrade: isRetro,
                        insertedVestingCount,
                        protocolFeeKas,
                        kasFeeFirewallEnforced: true,
                        tokenomics: bundle
                    }
                },
                { status: 200 }
            );
        }

        return json({ error: 'Rust state engine rejected the action.' }, { status: 500 });
    } catch (e) {
        console.error('🔴 State Action Fault:', e);
        return json({ error: 'Failed to process action' }, { status: 500 });
    }
}