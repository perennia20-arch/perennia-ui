import { json, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { redis } from '$lib/server/redis';
import { dbPool } from '$lib/server/db';
import {
    isWalletMasterAdmin,
    normalizeKaspaBase32Strict,
    resolveMasterTreasuryKasAddressOptional
} from '$lib/server/kms';
import {
    executeOrQueueL1Dispatch,
    computeReservoirHmac
} from '$lib/server/l1Dispatcher';
import { blake2b } from '@noble/hashes/blake2.js';
import crypto from 'node:crypto';

const KASPA_BURN_ADDRESS =
    'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e';
const KASPA_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const KASPA_ADDR_VERSION_P2PK_SCHNORR = 0x00;
const KASPA_ADDR_VERSION_P2PK_ECDSA = 0x01;
const KASPA_ADDR_VERSION_P2SH = 0x08;
const CANONICAL_GENESIS_ANCHOR_EPOCH_SEC = 1_767_225_600;

const GATED_FORGE_ACTIONS = new Set([
    'COMPILE_SILVERSCRIPT_COVENANT',
    'REGISTER_FORGE_TOKENOMICS',
    'RETROACTIVE_FORGE_UPGRADE',
    'FUND_MINEABLE_KRC20_VAULT'
]);

const LUA_ATOMIC_DEBIT_TOKEN_LEDGER = `
local asset = ARGV[1]
local req = tonumber(ARGV[2])
local primary = tonumber(redis.call('HGET', KEYS[1], asset) or '0')
if primary >= req then
    redis.call('HINCRBYFLOAT', KEYS[1], asset, -req)
    return {1, tostring(0)}
end
if asset == 'KAS' then
    local unassigned = tonumber(redis.call('HGET', KEYS[1], 'Unassigned KAS') or '0')
    if (primary + unassigned) >= req then
        local from_unassigned = req - primary
        if primary > 0 then
            redis.call('HSET', KEYS[1], 'KAS', '0')
        end
        redis.call('HINCRBYFLOAT', KEYS[1], 'Unassigned KAS', -from_unassigned)
        return {1, tostring(from_unassigned)}
    end
end
return {0, tostring(0)}
`;

function isLocalOrLanRequest(url: URL, request: Request): boolean {
    const hostCandidates = [
        url.hostname,
        request.headers.get('x-forwarded-host') || '',
        request.headers.get('host') || ''
    ]
        .map((h) => h.split(':')[0].trim().toLowerCase())
        .filter(Boolean);
    return hostCandidates.some(
        (h) =>
            h === 'localhost' ||
            h === '127.0.0.1' ||
            h === '192.168.50.100' ||
            h.startsWith('192.168.50.')
    );
}

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
        // Ignore Redis error
    }
    return false;
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function writeBigUint64LE(val: bigint): Uint8Array {
    const arr = new Uint8Array(8);
    new DataView(arr.buffer).setBigUint64(0, val, true);
    return arr;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
    const totalLen = arrays.reduce((acc, arr) => acc + arr.length, 0);
    const res = new Uint8Array(totalLen);
    let offset = 0;
    for (const arr of arrays) {
        res.set(arr, offset);
        offset += arr.length;
    }
    return res;
}

function kaspaPolymod(values: number[]): bigint {
    let c = 1n;
    for (const v of values) {
        const c0 = c >> 35n;
        c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(v);
        if (c0 & 1n) c ^= 0x98f2bc8e61n;
        if (c0 & 2n) c ^= 0x79b76d99e2n;
        if (c0 & 4n) c ^= 0xf33e5fb3c4n;
        if (c0 & 8n) c ^= 0xae2eabe2a8n;
        if (c0 & 16n) c ^= 0x1e4f43e470n;
    }
    return c ^ 1n;
}

function encodeKaspaBech32mWithVersion(
    versionByte: number,
    payload32: Uint8Array
): string {
    const prefix = 'kaspa';
    const prefixValues = prefix
        .split('')
        .map((c) => c.charCodeAt(0) & 31)
        .concat([0]);
    const payload = [versionByte & 0xff, ...payload32.slice(0, 32)];
    let acc = 0;
    let bits = 0;
    const payload5: number[] = [];
    for (const byte of payload) {
        acc = (acc << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            payload5.push((acc >> bits) & 31);
        }
    }
    if (bits > 0) payload5.push((acc << (5 - bits)) & 31);
    const mod = kaspaPolymod([
        ...prefixValues,
        ...payload5,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
    ]);
    const checksum = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
        Number((mod >> BigInt(5 * (7 - i))) & 31n)
    );
    return (
        prefix +
        ':' +
        [...payload5, ...checksum].map((v) => KASPA_CHARSET[v]).join('')
    );
}

function decodeKaspaAddressVersionAndHash(rawAddress: string): {
    version: number;
    hash32: Uint8Array;
    normalized: string;
} {
    const formatted = rawAddress.trim().toLowerCase().startsWith('kaspa:')
        ? rawAddress.trim().toLowerCase()
        : `kaspa:${rawAddress.trim().toLowerCase()}`;
    const parts = formatted.split(':');
    if (parts.length !== 2) throw new Error('Invalid Kaspa address format');
    const base32 = parts[1];
    if (base32.length < 55 || base32.length > 75) {
        throw new Error('Invalid Kaspa address length');
    }
    const words: number[] = [];
    for (let i = 0; i < base32.length; i++) {
        const idx = KASPA_CHARSET.indexOf(base32[i]);
        if (idx === -1) throw new Error('Invalid Bech32m character');
        words.push(idx);
    }
    const prefixValues = 'kaspa'
        .split('')
        .map((c) => c.charCodeAt(0) & 31)
        .concat([0]);
    if (kaspaPolymod([...prefixValues, ...words]) !== 0n) {
        throw new Error('Bech32m checksum failed');
    }
    const dataWords = words.slice(0, words.length - 8);
    const out: number[] = [];
    let val = 0;
    let bits = 0;
    for (let i = 0; i < dataWords.length; i++) {
        val = (val << 5) | dataWords[i];
        bits += 5;
        while (bits >= 8) {
            bits -= 8;
            out.push((val >> bits) & 0xff);
        }
    }
    if (out.length < 33) throw new Error('Decoded payload too short');
    const version = out[0];
    if (
        version !== KASPA_ADDR_VERSION_P2PK_SCHNORR &&
        version !== KASPA_ADDR_VERSION_P2PK_ECDSA &&
        version !== KASPA_ADDR_VERSION_P2SH
    ) {
        throw new Error(`Unsupported version byte: ${version}`);
    }
    return {
        version,
        hash32: new Uint8Array(out.slice(1, 33)),
        normalized: formatted
    };
}

function compileServerSilverScriptVault(params: {
    ticker: string;
    tokenStandard?: string;
    label?: string;
    beneficiaryAddress: string;
    totalAllocation: number;
    decimals?: number;
    cliffDays: number;
    linearDays: number;
    anchorTimestampSec?: number;
    charterSha256Hex?: string;
}) {
    const cleanTicker = String(params.ticker || 'SILO').trim().toUpperCase();
    const tokenStandard =
        String(params.tokenStandard || 'KRC-20').trim().toUpperCase() ===
        'KCC-20'
            ? 'KCC-20'
            : 'KRC-20';
    const label =
        String(params.label || 'Genesis Tranche').trim() || 'Genesis Tranche';
    const cliffDays = Math.max(0, Math.floor(Number(params.cliffDays || 0)));
    const linearDays = Math.max(0, Math.floor(Number(params.linearDays || 0)));
    const totalAllocation = Math.max(
        0,
        Math.floor(Number(params.totalAllocation || 0))
    );
    const decimals = Math.max(
        0,
        Math.min(18, Math.floor(Number(params.decimals ?? 8)))
    );
    const baseAnchorSec =
        params.anchorTimestampSec && params.anchorTimestampSec > 0
            ? Math.floor(params.anchorTimestampSec)
            : CANONICAL_GENESIS_ANCHOR_EPOCH_SEC;
    const cliffTimestamp = baseAnchorSec + cliffDays * 86_400;
    let beneficiaryPubkeyBytes: Uint8Array = new Uint8Array(32);
    let ownerScheme = KASPA_ADDR_VERSION_P2PK_SCHNORR;
    let normalizedBeneficiary = String(params.beneficiaryAddress || '')
        .trim()
        .toLowerCase();
    try {
        const dec = decodeKaspaAddressVersionAndHash(normalizedBeneficiary);
        beneficiaryPubkeyBytes = new Uint8Array(dec.hash32);
        ownerScheme = dec.version;
        normalizedBeneficiary = dec.normalized;
    } catch {
        const fallbackDigest = blake2b(
            new TextEncoder().encode(
                `PERENNIA_BENEFICIARY:${normalizedBeneficiary}`
            ),
            { dkLen: 32 }
        );
        beneficiaryPubkeyBytes = new Uint8Array(fallbackDigest);
        normalizedBeneficiary = encodeKaspaBech32mWithVersion(
            KASPA_ADDR_VERSION_P2PK_SCHNORR,
            beneficiaryPubkeyBytes
        );
    }
    const beneficiaryPubkeyHex = bytesToHex(beneficiaryPubkeyBytes);
    const silverscriptSource = [
        `pragma silverscript ^1.0.0;`,
        ``,
        `// Perennia Sovereign Forge — L1 UTXO Proof-of-Lock & ${tokenStandard} Covenant`,
        `// Ticker: ${cleanTicker} | Tranche: ${label} | 22:00 UTC Daily Release`,
        `contract ProofOfLockVault(`,
        `    pubkey beneficiary,`,
        `    int cliffTimestamp,`,
        `    int linearDays,`,
        `    int totalAllocation`,
        `) {`,
        `    // Constructor Bindings:`,
        `    // beneficiary     = 0x${beneficiaryPubkeyHex}`,
        `    // cliffTimestamp  = ${cliffTimestamp} (${cliffDays}d cliff)`,
        `    // linearDays      = ${linearDays} (${linearDays}d linear vesting)`,
        `    // totalAllocation = ${totalAllocation} ${cleanTicker}`,
        `    entrypoint function unlockTranche(sig beneficiarySig, int currentEpochTs, int claimAmount) {`,
        `        require(checkSig(beneficiarySig, beneficiary));`,
        `        require(tx.time >= cliffTimestamp);`,
        `        require(currentEpochTs >= cliffTimestamp);`,
        ``,
        `        int elapsedSeconds = currentEpochTs - cliffTimestamp;`,
        `        int linearDurationSeconds = linearDays * 86400;`,
        `        int maxVested = totalAllocation;`,
        `        if (linearDurationSeconds > 0 && elapsedSeconds < linearDurationSeconds) {`,
        `            maxVested = (totalAllocation * elapsedSeconds) / linearDurationSeconds;`,
        `        }`,
        `        require(claimAmount > 0 && claimAmount <= maxVested);`,
        ``,
        `        bytes32 expectedSpk = new ScriptPublicKeyP2PK(beneficiary);`,
        `        require(tx.outputs[0].scriptPublicKey == expectedSpk);`,
        `    }`,
        `}`
    ].join('\n');
    const silAstDigest = new Uint8Array(
        blake2b(new TextEncoder().encode(silverscriptSource), {
            dkLen: 32
        })
    );
    const redeemScriptBytes = concatBytes(
        new Uint8Array([0x20]),
        beneficiaryPubkeyBytes,
        new Uint8Array([0xac, 0x08]),
        writeBigUint64LE(BigInt(cliffTimestamp)),
        new Uint8Array([0xb1, 0x75, 0x08]),
        writeBigUint64LE(BigInt(linearDays)),
        new Uint8Array([0x75, 0x08]),
        writeBigUint64LE(BigInt(totalAllocation)),
        new Uint8Array([0x75, 0x20]),
        silAstDigest,
        new Uint8Array([0x75, 0x51])
    );
    const scriptHashBytes = new Uint8Array(
        blake2b(redeemScriptBytes, { dkLen: 32 })
    );
    const scriptHashHex = bytesToHex(scriptHashBytes);
    const covenantAddress = encodeKaspaBech32mWithVersion(
        KASPA_ADDR_VERSION_P2SH,
        scriptHashBytes
    );
    const covenantSpkHex = `a9${scriptHashHex}87`;
    const extSeed = `${cleanTicker}:${params.charterSha256Hex || 'PERENNIA_KCC20_CHARTER_V1'}`;
    const extension32 = new Uint8Array(
        blake2b(new TextEncoder().encode(extSeed), { dkLen: 32 })
    );
    const totalBaseUnits =
        BigInt(totalAllocation) * 10n ** BigInt(Math.min(10, decimals));
    const packedState = concatBytes(
        writeBigUint64LE(totalBaseUnits),
        beneficiaryPubkeyBytes,
        new Uint8Array([ownerScheme & 0xff]),
        new Uint8Array([cliffDays > 0 || linearDays > 0 ? 0x01 : 0x00]),
        scriptHashBytes,
        extension32
    );
    const stateRootBytes = new Uint8Array(
        blake2b(packedState, {
            dkLen: 32,
            key: new TextEncoder().encode('KCC20StateCommitment')
        })
    );
    const covenantIdBytes = new Uint8Array(
        blake2b(
            concatBytes(
                new TextEncoder().encode(`KCC-20:${cleanTicker}:`),
                stateRootBytes
            ),
            { dkLen: 32 }
        )
    );
    return {
        contractName: 'ProofOfLockVault',
        ticker: cleanTicker,
        tokenStandard,
        label,
        beneficiaryAddress: normalizedBeneficiary,
        beneficiaryPubkeyHex,
        cliffDays,
        cliffTimestamp,
        linearDays,
        totalAllocation,
        silverscriptSource,
        redeemScriptHex: bytesToHex(redeemScriptBytes),
        scriptHashHex,
        covenantAddress,
        covenantSpkHex,
        kcc20PackedHex: bytesToHex(packedState),
        kcc20StateRootHex: bytesToHex(stateRootBytes),
        kcc20CovenantIdHex: bytesToHex(covenantIdBytes)
    };
}

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

async function ensureStateAuxiliaryTables() {
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
                covenant_address VARCHAR(255) NOT NULL DEFAULT '',
                silverscript_source TEXT NOT NULL DEFAULT '',
                redeem_script_hex TEXT NOT NULL DEFAULT '',
                kcc20_state_commitment VARCHAR(128) NOT NULL DEFAULT '',
                token_standard VARCHAR(32) NOT NULL DEFAULT 'KRC-20',
                lock_tx_hash VARCHAR(255),
                status VARCHAR(32) NOT NULL DEFAULT 'LOCKED',
                last_bell_unlocked_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
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
                token_standard VARCHAR(32) NOT NULL DEFAULT 'KRC-20',
                kcc20_covenant_id VARCHAR(128) NOT NULL DEFAULT '',
                kcc20_state_root VARCHAR(128) NOT NULL DEFAULT '',
                silverscript_charter_source TEXT NOT NULL DEFAULT '',
                covenant_vault_address VARCHAR(255) NOT NULL DEFAULT '',
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

async function queryLiveHotWalletAirlockTelemetry() {
    await ensureStateAuxiliaryTables().catch(() => {});
    const defaultColdKas = resolveMasterTreasuryKasAddressOptional() || '';
    const hotSignerAddress = (
        env.PERENNIA_HOT_KAS_ADDRESS ||
        env.PERENNIA_TREASURY_KAS_ADDRESS ||
        defaultColdKas
    ).trim();

    const cfgRes = await dbPool
        .query(
            `SELECT * FROM system_treasury_config WHERE config_id = 'PRIMARY' LIMIT 1`
        )
        .catch(() => ({ rows: [] as any[] }));
    const cfg = cfgRes.rows[0] || {};
    const hotCeilingKas = Number(cfg.hot_ceiling_kas ?? 5000.0);
    const minRunwayKas = Number(cfg.min_runway_kas ?? 250.0);
    const fppsMaxFloatKas = Number(cfg.fpps_max_float_kas ?? 50.0);
    const poolFeeRate = Number(cfg.pool_fee_rate ?? 0.01);
    const outflowBreakerTripped = Boolean(cfg.outflow_breaker_tripped);
    const coldKasAddress = String(cfg.cold_kas_address || defaultColdKas);

    let hotBalanceKas = 0;
    if (hotSignerAddress && hotSignerAddress.startsWith('kaspa:')) {
        const cachedStr = await redis
            .get(`treasury:balance:${hotSignerAddress.toLowerCase()}`)
            .catch(() => null);
        if (cachedStr) {
            const parsed = parseFloat(cachedStr);
            if (Number.isFinite(parsed) && parsed >= 0) {
                hotBalanceKas = parsed;
            }
        }
        if (hotBalanceKas <= 0) {
            try {
                const kaspaRestUrl = (
                    env.KASPA_REST_URL || 'https://api.kaspa.org'
                ).replace(/\/+$/, '');
                const balRes = await fetch(
                    `${kaspaRestUrl}/addresses/${encodeURIComponent(hotSignerAddress)}/balance`,
                    { signal: AbortSignal.timeout(3500) }
                );
                if (balRes.ok) {
                    const balData = await balRes.json();
                    hotBalanceKas = (Number(balData?.balance) || 0) / 1e8;
                }
            } catch {
                hotBalanceKas = 0;
            }
        }
    }

    const outflowRes = await dbPool
        .query(
            `SELECT COALESCE(SUM(amount_tokens), 0.0) AS outflow_24h
             FROM l1_payout_queue
             WHERE asset_ticker = 'KAS'
               AND status = 'DISPATCHED_ONCHAIN'
               AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'`
        )
        .catch(() => ({ rows: [{ outflow_24h: 0 }] }));
    const trailing24hOutflowKas = Number(outflowRes.rows[0]?.outflow_24h || 0);
    const hourlyBurn = Math.max(0, trailing24hOutflowKas / 24.0);
    const runwayHoursRemaining =
        hourlyBurn > 0.01
            ? Number((hotBalanceKas / hourlyBurn).toFixed(1))
            : hotBalanceKas > 0
              ? Number(
                    (
                        hotBalanceKas /
                        Math.max(0.4, minRunwayKas / 24.0)
                    ).toFixed(1)
                )
              : 0;

    const lowRunwayBreakerTripped =
        outflowBreakerTripped ||
        (minRunwayKas > 0 && hotBalanceKas > 0 && hotBalanceKas < minRunwayKas);

    return {
        hotSignerAddress,
        coldVaultAddress: coldKasAddress,
        coldBtcAddress: String(cfg.cold_btc_address || env.PERENNIA_COLD_BTC_ADDRESS || ''),
        coldEthAddress: String(cfg.cold_eth_address || env.PERENNIA_COLD_ETH_ADDRESS || ''),
        coldSolAddress: String(cfg.cold_sol_address || env.PERENNIA_COLD_SOL_ADDRESS || ''),
        hotBalanceKas: Number(hotBalanceKas.toFixed(4)),
        hotCeilingKas,
        minRunwayKas,
        fppsMaxFloatKas,
        poolFeeRate,
        poolFeeRatePct: Number((poolFeeRate * 100).toFixed(2)),
        runwayHoursRemaining,
        trailing24hOutflowKas,
        lowRunwayBreakerTripped,
        outflowBreakerTripped,
        status: outflowBreakerTripped
            ? 'PAUSED_BY_DIRECTOR'
            : lowRunwayBreakerTripped
              ? 'LOW_RUNWAY_ALERT'
              : 'ARMED_NOMINAL'
    };
}

async function queryForgeBundleFromPostgres(
    tickerOpt?: string | null,
    includeAllMineableVaults = true
) {
    await ensureStateAuxiliaryTables();
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
                const cliffDays = Number(r.cliff_days || 0);
                const linearDays = Number(r.linear_days || 0);
                const tokenStandard = String(r.token_standard || 'KRC-20');
                lockedVestingSupply += remLocked;
                unlockedVestedSupply += unlocked;
                if (remLocked > 0) dailyUnlockTotal += dailyRate;
                let covenantAddress = String(r.covenant_address || '');
                let silverscriptSource = String(r.silverscript_source || '');
                let redeemScriptHex = String(r.redeem_script_hex || '');
                let kcc20StateCommitment = String(
                    r.kcc20_state_commitment || r.vprog_state_root || ''
                );
                if (!covenantAddress || !silverscriptSource) {
                    const compiled = compileServerSilverScriptVault({
                        ticker: cleanTicker,
                        tokenStandard,
                        label: String(r.label || 'Genesis Tranche'),
                        beneficiaryAddress: String(r.beneficiary_address || ''),
                        totalAllocation: totalAlloc,
                        cliffDays,
                        linearDays
                    });
                    covenantAddress = compiled.covenantAddress;
                    silverscriptSource = compiled.silverscriptSource;
                    redeemScriptHex = compiled.redeemScriptHex;
                    if (!kcc20StateCommitment) {
                        kcc20StateCommitment = compiled.kcc20StateRootHex;
                    }
                }
                vestingSchedules.push({
                    vestingId: r.vesting_id,
                    tokenTicker: r.token_ticker,
                    tokenStandard,
                    beneficiaryAddress: r.beneficiary_address,
                    creatorAddress: r.creator_address,
                    label: r.label,
                    totalAllocated: totalAlloc,
                    unlockedAmount: unlocked,
                    remainingLocked: remLocked,
                    claimedAmount: Number(r.claimed_amount || 0),
                    cliffDays,
                    linearDays,
                    cliffUnlockAt: r.cliff_unlock_at
                        ? new Date(r.cliff_unlock_at).toISOString()
                        : null,
                    fullUnlockAt: r.full_unlock_at
                        ? new Date(r.full_unlock_at).toISOString()
                        : null,
                    dailyUnlockRate: dailyRate,
                    covenantRule: r.covenant_rule,
                    vprogStateRoot: r.vprog_state_root,
                    covenantAddress,
                    silverscriptSource,
                    redeemScriptHex,
                    kcc20StateCommitment,
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
                    tokenStandard: p.token_standard || 'KRC-20',
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
                    kcc20CovenantId: p.kcc20_covenant_id || '',
                    kcc20StateRoot: p.kcc20_state_root || '',
                    silverscriptCharterSource:
                        p.silverscript_charter_source || '',
                    covenantVaultAddress: p.covenant_vault_address || '',
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
                    remainingVaultTokens: Number(
                        mv.remaining_vault_tokens || 0
                    ),
                    dailyEmissionTokens: Number(mv.daily_emission_tokens || 0),
                    distributedTokens: Number(mv.distributed_tokens || 0),
                    minHashrateThs: Number(mv.min_hashrate_ths || 0.1),
                    syndicateSectorEnabled: Boolean(
                        mv.syndicate_sector_enabled
                    ),
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
                    remainingVaultTokens: Number(
                        mv.remaining_vault_tokens || 0
                    ),
                    dailyEmissionTokens: Number(mv.daily_emission_tokens || 0),
                    distributedTokens: Number(mv.distributed_tokens || 0),
                    minHashrateThs: Number(mv.min_hashrate_ths || 0.1),
                    syndicateSectorEnabled: Boolean(
                        mv.syndicate_sector_enabled
                    ),
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
                    lockedVestingSupply +
                    reserveLockedSupply +
                    miningVaultLockedSupply,
                burnedSupply,
                daily2200UtcUnlockRate: dailyUnlockTotal,
                burnAddress: KASPA_BURN_ADDRESS
            }
        };
    } finally {
        client.release();
    }
}

export const POST: RequestHandler = async ({
    request,
    cookies,
    url
}: RequestEvent) => {
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

        let cleanWallet = normalizeKaspaBase32Strict(sessionWalletRaw);
        const isCorpAdmin = isWalletMasterAdmin(sessionWalletRaw);
        if (isCorpAdmin && payload.targetWallet) {
            cleanWallet = normalizeKaspaBase32Strict(payload.targetWallet);
        }
        const prefixedWallet = `kaspa:${cleanWallet}`;
        const action = String(payload.action || '').toUpperCase();
        const reqPayload = payload.payload || {};

        if (action === 'SET_FORGE_PUBLIC_FLAG') {
            if (!isCorpAdmin) {
                return json(
                    {
                        success: false,
                        error: 'FORBIDDEN: Only the Master Treasury wallet may toggle feature:forge:public.'
                    },
                    { status: 403 }
                );
            }
            const enablePublic = Boolean(reqPayload.enabled);
            await redis.set(
                'feature:forge:public',
                enablePublic ? '1' : '0'
            );
            return json(
                {
                    success: true,
                    data: { forgePublicEnabled: enablePublic }
                },
                { status: 200 }
            );
        }

        if (
            action === 'UPDATE_SYSTEM_TREASURY_CONFIG' ||
            action === 'UPDATE_BOOTSTRAP_FLOAT_CAPS'
        ) {
            if (!isCorpAdmin) {
                return json(
                    {
                        success: false,
                        error: 'FORBIDDEN: Only the Master Treasury Director may modulate system treasury ceilings or float caps.'
                    },
                    { status: 403 }
                );
            }
        }

        if (GATED_FORGE_ACTIONS.has(action)) {
            const localOrLan = isLocalOrLanRequest(url, request);
            const forgeUnlocked = await isForgePubliclyUnlocked();
            if (!isCorpAdmin && !localOrLan && !forgeUnlocked) {
                return json(
                    {
                        success: false,
                        error: 'FORGE_STEALTH_LOCK: Sovereign Forge is restricted to Master Treasury Stealth Mode in v1.0.'
                    },
                    { status: 403 }
                );
            }
        }

        if (action === 'ADD_CUSTOM_TOKEN') {
            const rawTicker = String(
                reqPayload.ticker || reqPayload.symbol || ''
            )
                .trim()
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '')
                .slice(0, 12);
            if (rawTicker.length >= 2) {
                const spotPrice = Number(
                    reqPayload.spotPrice ?? reqPayload.price ?? 0
                );
                const change24h = Number(
                    reqPayload.change24h ?? reqPayload.delta ?? 0
                );
                const pipe = redis.pipeline();
                pipe.sadd('oracle:dynamic_tickers', rawTicker);
                if (Number.isFinite(spotPrice) && spotPrice > 0) {
                    pipe.set(
                        `oracle:spot:${rawTicker}_USDC`,
                        String(spotPrice),
                        'EX',
                        30
                    );
                }
                if (Number.isFinite(change24h)) {
                    pipe.set(
                        `oracle:change24h:${rawTicker}_USDC`,
                        String(change24h),
                        'EX',
                        300
                    );
                }
                await pipe.exec().catch(() => {});
            }
        }

        const rustBackendUrl =
            env.RUST_BACKEND_URL ||
            `http://${env.UBUNTU_NODE_IP || '127.0.0.1'}:8002`;

        let rustRejectionStatus: number | null = null;
        let rustRejectionBody: Record<string, unknown> | null = null;

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
            if (rustRes.status >= 400 && rustRes.status < 500) {
                rustRejectionStatus = rustRes.status;
                const rawErr = await rustRes.text().catch(() => '');
                if (rawErr.trim()) {
                    try {
                        const parsed = JSON.parse(rawErr);
                        rustRejectionBody =
                            parsed && typeof parsed === 'object'
                                ? parsed
                                : { success: false, error: String(parsed) };
                    } catch {
                        rustRejectionBody = { success: false, error: rawErr.trim() };
                    }
                }
            }
        } catch {
            // Fall through to direct PostgreSQL handling when Rust node is unreachable
        }

        if (
            action === 'GET_SYSTEM_TREASURY_CONFIG' ||
            action === 'UPDATE_SYSTEM_TREASURY_CONFIG'
        ) {
            await ensureStateAuxiliaryTables();
            if (action === 'UPDATE_SYSTEM_TREASURY_CONFIG') {
                const curRes = await dbPool.query(
                    `SELECT * FROM system_treasury_config WHERE config_id = 'PRIMARY' LIMIT 1`
                );
                const cur = curRes.rows[0] || {};
                const hotCeilingKas = Math.max(
                    50,
                    Number(reqPayload.hotCeilingKas ?? cur.hot_ceiling_kas ?? 5000)
                );
                const minRunwayKas = Math.max(
                    0,
                    Number(reqPayload.minRunwayKas ?? cur.min_runway_kas ?? 250)
                );
                const fppsMaxFloatKas = Math.max(
                    1,
                    Number(
                        reqPayload.fppsMaxFloatKas ?? cur.fpps_max_float_kas ?? 50
                    )
                );
                const poolFeeRate = Math.min(
                    0.25,
                    Math.max(
                        0,
                        Number(
                            reqPayload.poolFeeRate ??
                                (reqPayload.poolFeeRatePct !== undefined
                                    ? Number(reqPayload.poolFeeRatePct) / 100
                                    : cur.pool_fee_rate ?? 0.01)
                        )
                    )
                );
                const outflowBreakerTripped = Boolean(
                    reqPayload.outflowBreakerTripped ??
                        reqPayload.lowRunwayBreakerTripped ??
                        cur.outflow_breaker_tripped ??
                        false
                );
                const coldKasAddress = String(
                    reqPayload.coldKasAddress ??
                        cur.cold_kas_address ??
                        resolveMasterTreasuryKasAddressOptional() ??
                        ''
                ).trim();
                const coldBtcAddress = String(
                    reqPayload.coldBtcAddress ?? cur.cold_btc_address ?? ''
                ).trim();
                const coldEthAddress = String(
                    reqPayload.coldEthAddress ?? cur.cold_eth_address ?? ''
                ).trim();
                const coldSolAddress = String(
                    reqPayload.coldSolAddress ?? cur.cold_sol_address ?? ''
                ).trim();

                await dbPool.query(
                    `INSERT INTO system_treasury_config
                     (config_id, hot_ceiling_kas, min_runway_kas, fpps_max_float_kas, pool_fee_rate, outflow_breaker_tripped, cold_kas_address, cold_btc_address, cold_eth_address, cold_sol_address, updated_by, updated_at)
                     VALUES ('PRIMARY', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
                     ON CONFLICT (config_id) DO UPDATE SET
                        hot_ceiling_kas = EXCLUDED.hot_ceiling_kas,
                        min_runway_kas = EXCLUDED.min_runway_kas,
                        fpps_max_float_kas = EXCLUDED.fpps_max_float_kas,
                        pool_fee_rate = EXCLUDED.pool_fee_rate,
                        outflow_breaker_tripped = EXCLUDED.outflow_breaker_tripped,
                        cold_kas_address = EXCLUDED.cold_kas_address,
                        cold_btc_address = EXCLUDED.cold_btc_address,
                        cold_eth_address = EXCLUDED.cold_eth_address,
                        cold_sol_address = EXCLUDED.cold_sol_address,
                        updated_by = EXCLUDED.updated_by,
                        updated_at = CURRENT_TIMESTAMP`,
                    [
                        hotCeilingKas,
                        minRunwayKas,
                        fppsMaxFloatKas,
                        poolFeeRate,
                        outflowBreakerTripped,
                        coldKasAddress,
                        coldBtcAddress,
                        coldEthAddress,
                        coldSolAddress,
                        prefixedWallet
                    ]
                );
            }

            const nodeAirlock = await queryLiveHotWalletAirlockTelemetry();
            const floatRes = await dbPool
                .query(
                    `SELECT * FROM fiat_float_ledger WHERE ledger_id IN ('BOOTSTRAP_PRIMARY', 'PRIMARY_FLOAT') ORDER BY updated_at DESC LIMIT 1`
                )
                .catch(() => ({ rows: [] as any[] }));
            return json(
                {
                    success: true,
                    data: {
                        nodeAirlock,
                        fiatFloat: floatRes.rows[0] || null
                    }
                },
                { status: 200 }
            );
        }

        if (
            action === 'GET_USER_COLD_VAULT_RULES' ||
            action === 'GET_COLD_VAULT_AIRLOCK'
        ) {
            await ensureStateAuxiliaryTables();
            const rowsRes = await dbPool.query(
                `SELECT asset_ticker, network, cold_destination_address, vault_label,
                        overflow_ceiling, auto_sweep_enabled, last_sweep_txid,
                        last_sweep_amount, last_sweep_at, updated_at
                 FROM user_cold_vault_rules
                 WHERE wallet_address = $1 OR wallet_address = $2
                 ORDER BY asset_ticker ASC`,
                [prefixedWallet, cleanWallet]
            );
            const rulesByAsset: Record<string, any> = {};
            const rules: any[] = [];
            for (const r of rowsRes.rows) {
                const ticker = String(r.asset_ticker || 'KAS').toUpperCase();
                const entry = {
                    assetTicker: ticker,
                    network: String(r.network || ticker).toUpperCase(),
                    coldDestinationAddress: String(
                        r.cold_destination_address || ''
                    ),
                    vaultLabel: String(
                        r.vault_label || 'Perennia Cold Vault'
                    ),
                    overflowCeiling: Number(r.overflow_ceiling ?? 500),
                    autoSweepEnabled: Boolean(r.auto_sweep_enabled),
                    lastSweepTxid: r.last_sweep_txid || null,
                    lastSweepAmount: Number(r.last_sweep_amount || 0),
                    lastSweepAt: r.last_sweep_at
                        ? new Date(r.last_sweep_at).toISOString()
                        : null,
                    updatedAt: r.updated_at
                        ? new Date(r.updated_at).toISOString()
                        : null
                };
                rulesByAsset[ticker] = entry;
                rules.push(entry);
            }
            const nodeAirlock = await queryLiveHotWalletAirlockTelemetry();
            return json(
                {
                    success: true,
                    data: {
                        rulesByAsset,
                        rules,
                        clientVault: rulesByAsset['KAS'] || null,
                        nodeAirlock
                    }
                },
                { status: 200 }
            );
        }

        if (
            action === 'SAVE_USER_COLD_VAULT_RULE' ||
            action === 'REGISTER_COLD_VAULT_AIRLOCK' ||
            action === 'SAVE_COLD_VAULT_AIRLOCK'
        ) {
            await ensureStateAuxiliaryTables();
            const ticker = String(
                reqPayload.assetTicker || reqPayload.ticker || 'KAS'
            )
                .trim()
                .toUpperCase();
            const network = String(reqPayload.network || ticker)
                .trim()
                .toUpperCase();
            const coldDest = String(
                reqPayload.coldDestinationAddress ||
                    reqPayload.coldKaspaAddress ||
                    ''
            ).trim();
            if (coldDest.length < 12) {
                return json(
                    {
                        success: false,
                        error: `Invalid Cold Wallet destination address for ${ticker}.`
                    },
                    { status: 400 }
                );
            }
            if (network === 'KAS') {
                try {
                    decodeKaspaAddressVersionAndHash(coldDest);
                } catch (err: any) {
                    return json(
                        {
                            success: false,
                            error: `INVALID_KASPA_ADDRESS: ${err.message}`
                        },
                        { status: 400 }
                    );
                }
            }
            const vaultLabel = String(
                reqPayload.vaultLabel ||
                    reqPayload.cardLabel ||
                    'Perennia Cold Vault'
            ).trim();
            const overflowCeiling = Math.max(
                0.0001,
                Number(
                    reqPayload.overflowCeiling ??
                        reqPayload.overflowThresholdKas ??
                        500
                )
            );
            const autoSweepEnabled = reqPayload.autoSweepEnabled !== false;

            await dbPool.query(
                `INSERT INTO user_cold_vault_rules
                 (wallet_address, asset_ticker, network, cold_destination_address, vault_label, overflow_ceiling, auto_sweep_enabled, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
                 ON CONFLICT (wallet_address, asset_ticker) DO UPDATE SET
                    network = EXCLUDED.network,
                    cold_destination_address = EXCLUDED.cold_destination_address,
                    vault_label = EXCLUDED.vault_label,
                    overflow_ceiling = EXCLUDED.overflow_ceiling,
                    auto_sweep_enabled = EXCLUDED.auto_sweep_enabled,
                    updated_at = CURRENT_TIMESTAMP`,
                [
                    prefixedWallet,
                    ticker,
                    network,
                    coldDest,
                    vaultLabel,
                    overflowCeiling,
                    autoSweepEnabled
                ]
            );

            return json(
                {
                    success: true,
                    data: {
                        assetTicker: ticker,
                        network,
                        coldDestinationAddress: coldDest,
                        vaultLabel,
                        overflowCeiling,
                        autoSweepEnabled
                    }
                },
                { status: 200 }
            );
        }

        if (action === 'DELETE_USER_COLD_VAULT_RULE') {
            await ensureStateAuxiliaryTables();
            const ticker = String(
                reqPayload.assetTicker || reqPayload.ticker || 'KAS'
            )
                .trim()
                .toUpperCase();
            await dbPool.query(
                `DELETE FROM user_cold_vault_rules WHERE (wallet_address = $1 OR wallet_address = $2) AND asset_ticker = $3`,
                [prefixedWallet, cleanWallet, ticker]
            );
            return json(
                {
                    success: true,
                    data: { deletedAssetTicker: ticker }
                },
                { status: 200 }
            );
        }

        if (
            action === 'SWEEP_TOKEN_TO_COLD_VAULT_NOW' ||
            action === 'SWEEP_TO_COLD_VAULT_NOW' ||
            action === 'WITHDRAW_SYNTHETIC_ASSET'
        ) {
            await ensureStateAuxiliaryTables();
            const ticker = String(
                reqPayload.assetTicker ||
                    reqPayload.ticker ||
                    reqPayload.asset ||
                    'KAS'
            )
                .trim()
                .toUpperCase();
            const amount = Number(
                reqPayload.amount ??
                    reqPayload.amountTokens ??
                    reqPayload.amountKas ??
                    0
            );
            if (!Number.isFinite(amount) || amount <= 0) {
                return json(
                    {
                        success: false,
                        error: 'Sweep/withdrawal amount must be greater than 0.'
                    },
                    { status: 400 }
                );
            }

            let destination = String(
                reqPayload.coldDestinationAddress ||
                    reqPayload.coldKaspaAddress ||
                    reqPayload.destination ||
                    reqPayload.destinationAddress ||
                    ''
            ).trim();

            if (!destination) {
                const ruleRes = await dbPool.query(
                    `SELECT cold_destination_address FROM user_cold_vault_rules
                     WHERE (wallet_address = $1 OR wallet_address = $2) AND asset_ticker = $3
                     LIMIT 1`,
                    [prefixedWallet, cleanWallet, ticker]
                );
                destination = String(
                    ruleRes.rows[0]?.cold_destination_address || ''
                ).trim();
            }

            if (!destination) {
                return json(
                    {
                        success: false,
                        error: `Save a Cold Storage destination address for ${ticker} before sweeping.`
                    },
                    { status: 400 }
                );
            }

            const userLedgerKey = `dev:sor:treasury:balances:${cleanWallet}`;
            const debitRes = (await redis.eval(
                LUA_ATOMIC_DEBIT_TOKEN_LEDGER,
                1,
                userLedgerKey,
                ticker,
                amount.toString()
            )) as [number, string];

            if (!debitRes || Number(debitRes[0]) !== 1) {
                return json(
                    {
                        success: false,
                        error: `INSUFFICIENT_BALANCE: Insufficient ${ticker} in batch settlement queue to sweep ${amount.toFixed(4)} ${ticker}.`
                    },
                    { status: 400 }
                );
            }

            const fromUnassigned = parseFloat(debitRes[1] || '0') || 0;
            if (fromUnassigned > 1e-9 && ticker === 'KAS') {
                const resRow = await dbPool.query(
                    `SELECT streaming_balance_kas, total_yield_kas, COALESCE(lp_tokens, '{}'::jsonb) AS lp_tokens
                     FROM yield_reservoirs
                     WHERE wallet_address = $1 OR wallet_address = $2
                     LIMIT 1`,
                    [prefixedWallet, cleanWallet]
                );
                if (resRow.rows.length > 0) {
                    const r = resRow.rows[0];
                    const nextStream = Math.max(
                        0,
                        Number(r.streaming_balance_kas || 0) - fromUnassigned
                    );
                    const totalY = Number(r.total_yield_kas || 0);
                    const newHmac = computeReservoirHmac(
                        prefixedWallet,
                        nextStream,
                        totalY,
                        r.lp_tokens
                    );
                    await dbPool.query(
                        `UPDATE yield_reservoirs
                         SET streaming_balance_kas = $3,
                             row_hmac_sig = $4,
                             last_updated = CURRENT_TIMESTAMP
                         WHERE wallet_address = $1 OR wallet_address = $2`,
                        [prefixedWallet, cleanWallet, nextStream, newHmac]
                    );
                }
            }

            try {
                const dispatchRes = await executeOrQueueL1Dispatch({
                    wallet: prefixedWallet,
                    destinationAddress: destination,
                    asset: ticker,
                    amount,
                    sourceType:
                        action === 'WITHDRAW_SYNTHETIC_ASSET'
                            ? 'ledger_withdrawal'
                            : 'cold_airlock_sweep'
                });

                await dbPool
                    .query(
                        `UPDATE user_cold_vault_rules
                         SET last_sweep_txid = $3,
                             last_sweep_amount = $4,
                             last_sweep_at = CURRENT_TIMESTAMP,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE (wallet_address = $1 OR wallet_address = $2) AND asset_ticker = $5`,
                        [
                            prefixedWallet,
                            cleanWallet,
                            dispatchRes.txHash,
                            amount,
                            ticker
                        ]
                    )
                    .catch(() => {});

                return json(
                    {
                        success: true,
                        transaction_id: dispatchRes.txHash,
                        data: dispatchRes
                    },
                    { status: 200 }
                );
            } catch (dispatchErr: any) {
                await redis
                    .hincrbyfloat(userLedgerKey, ticker, amount)
                    .catch(() => {});
                return json(
                    {
                        success: false,
                        error:
                            dispatchErr?.message ||
                            `Failed to dispatch ${ticker} to Cold Vault.`
                    },
                    { status: 503 }
                );
            }
        }

        if (action === 'ADD_CUSTOM_TOKEN' || action === 'REMOVE_CUSTOM_TOKEN') {
            const rawTicker = String(
                reqPayload.ticker || reqPayload.symbol || ''
            )
                .trim()
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '')
                .slice(0, 12);
            if (rawTicker.length < 2) {
                return json(
                    {
                        success: false,
                        error: 'Invalid custom token ticker.'
                    },
                    { status: 400 }
                );
            }
            const client = await dbPool.connect();
            try {
                const existingRes = await client.query(
                    `SELECT layout_state FROM user_command_centers WHERE wallet_address = $1 OR wallet_address = $2 LIMIT 1`,
                    [prefixedWallet, cleanWallet]
                );
                const stateObj: Record<string, any> =
                    existingRes.rows.length > 0 &&
                    existingRes.rows[0].layout_state &&
                    typeof existingRes.rows[0].layout_state === 'object'
                        ? existingRes.rows[0].layout_state
                        : { workers: [], sectors: [], customTokens: [] };
                const currentCustom: any[] = Array.isArray(
                    stateObj.customTokens
                )
                    ? stateObj.customTokens
                    : [];
                if (action === 'REMOVE_CUSTOM_TOKEN') {
                    stateObj.customTokens = currentCustom.filter(
                        (t) =>
                            String(t?.ticker || t?.symbol || '').toUpperCase() !==
                            rawTicker
                    );
                } else {
                    const tokenEntry = {
                        ticker: rawTicker,
                        symbol: rawTicker,
                        name: String(reqPayload.name || rawTicker).trim(),
                        assetClass: String(
                            reqPayload.assetClass || 'DeFi'
                        ).trim(),
                        network: String(reqPayload.network || 'ETH')
                            .trim()
                            .toUpperCase(),
                        spotPrice: Number(
                            reqPayload.spotPrice ?? reqPayload.price ?? 0
                        ),
                        delta: Number(
                            reqPayload.change24h ?? reqPayload.delta ?? 0
                        ),
                        contract: String(
                            reqPayload.contract || rawTicker
                        ).trim(),
                        imgUrl: String(reqPayload.imgUrl || '').trim(),
                        theme: reqPayload.theme || {
                            hex: '#18C6A5',
                            pastel: '#99f6e4'
                        }
                    };
                    const filtered = currentCustom.filter(
                        (t) =>
                            String(t?.ticker || t?.symbol || '').toUpperCase() !==
                            rawTicker
                    );
                    stateObj.customTokens = [...filtered, tokenEntry];
                }
                await client.query(
                    `INSERT INTO user_command_centers (wallet_address, layout_state, last_updated)
                     VALUES ($1, $2, CURRENT_TIMESTAMP)
                     ON CONFLICT (wallet_address) DO UPDATE SET layout_state = EXCLUDED.layout_state, last_updated = CURRENT_TIMESTAMP`,
                    [prefixedWallet, stateObj]
                );
                return json(
                    {
                        success: true,
                        data: {
                            ticker: rawTicker,
                            customTokens: stateObj.customTokens
                        }
                    },
                    { status: 200 }
                );
            } finally {
                client.release();
            }
        }

        if (action === 'COMPILE_SILVERSCRIPT_COVENANT') {
            const compiled = compileServerSilverScriptVault({
                ticker: reqPayload.ticker || 'SILO',
                tokenStandard: reqPayload.tokenStandard || 'KCC-20',
                label: reqPayload.label || 'Genesis Tranche',
                beneficiaryAddress:
                    reqPayload.beneficiaryAddress ||
                    reqPayload.address ||
                    prefixedWallet,
                totalAllocation: Number(
                    reqPayload.totalAllocation ??
                        reqPayload.amount ??
                        1_000_000
                ),
                decimals: Number(reqPayload.decimals ?? 8),
                cliffDays: Number(reqPayload.cliffDays ?? 90),
                linearDays: Number(reqPayload.linearDays ?? 365),
                charterSha256Hex: reqPayload.charterSha256
            });
            return json({ success: true, data: compiled }, { status: 200 });
        }

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
            await ensureStateAuxiliaryTables();
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
                        error: 'KRC-20 / KCC-20 ticker must be 4 to 6 alphabetic characters.'
                    },
                    { status: 400 }
                );
            }
            const tokenStandard =
                String(reqPayload.tokenStandard || 'KRC-20')
                    .trim()
                    .toUpperCase() === 'KCC-20'
                    ? 'KCC-20'
                    : 'KRC-20';
            const decimals = Math.max(
                0,
                Math.min(18, Math.floor(Number(reqPayload.decimals ?? 8)))
            );
            const maxSupply = Math.max(
                1,
                Number(reqPayload.maxSupply || 21_000_000)
            );
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
                        const cleanBen = rawAddr
                            .toLowerCase()
                            .replace(/^kaspa:/i, '');
                        const prefixedBen = `kaspa:${cleanBen}`;
                        const label =
                            String(row.label || 'Genesis Allocation').trim() ||
                            'Genesis Allocation';
                        const cliffDays = Math.max(
                            0,
                            Math.floor(
                                Number(row.cliffDays ?? row.cliff_days ?? 0)
                            )
                        );
                        const linearDays = Math.max(
                            0,
                            Math.floor(
                                Number(row.linearDays ?? row.linear_days ?? 0)
                            )
                        );
                        const isLocked = cliffDays > 0 || linearDays > 0;
                        const effLinearDays = isLocked
                            ? Math.max(1, linearDays)
                            : 0;
                        const dailyRate =
                            effLinearDays > 0
                                ? amount / effLinearDays
                                : amount;
                        const initialUnlocked = isLocked ? 0 : amount;
                        const status = isLocked ? 'LOCKED' : 'UNLOCKED';
                        const compiledVault = compileServerSilverScriptVault({
                            ticker: rawTicker,
                            tokenStandard,
                            label,
                            beneficiaryAddress: prefixedBen,
                            totalAllocation: amount,
                            decimals,
                            cliffDays,
                            linearDays: effLinearDays
                        });
                        const vprogStateRoot =
                            String(row.vprogStateRoot || '').trim() ||
                            compiledVault.kcc20StateRootHex;
                        const covenantAddress =
                            String(row.covenantAddress || '').trim() ||
                            compiledVault.covenantAddress;
                        const silverscriptSource =
                            String(row.silverscriptSource || '').trim() ||
                            compiledVault.silverscriptSource;
                        const redeemScriptHex =
                            String(row.redeemScriptHex || '').trim() ||
                            compiledVault.redeemScriptHex;
                        const kcc20StateCommitment =
                            String(row.kcc20StateCommitment || '').trim() ||
                            compiledVault.kcc20StateRootHex;

                        await client.query(
                            `INSERT INTO forge_vesting_schedules
                             (token_ticker, beneficiary_address, creator_address, label, total_allocated,
                              unlocked_amount, claimed_amount, cliff_days, linear_days,
                              cliff_unlock_at, full_unlock_at, daily_unlock_rate, covenant_rule,
                              vprog_state_root, covenant_address, silverscript_source, redeem_script_hex,
                              kcc20_state_commitment, token_standard, lock_tx_hash, status)
                             VALUES ($1, $2, $3, $4, $5, $6, 0.0, $7, $8,
                                     CURRENT_TIMESTAMP + make_interval(days => $7),
                                     CURRENT_TIMESTAMP + make_interval(days => $9),
                                     $10, 'SILVERSCRIPT_PROOF_OF_LOCK_V1', $11, $12, $13, $14, $15, $16, $17, $18)`,
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
                                covenantAddress,
                                silverscriptSource,
                                redeemScriptHex,
                                kcc20StateCommitment,
                                tokenStandard,
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
                    const charterVault = compileServerSilverScriptVault({
                        ticker: rawTicker,
                        tokenStandard,
                        label: 'Chronos Monetary Policy Reserve',
                        beneficiaryAddress: prefixedWallet,
                        totalAllocation:
                            reserveLockedTokens > 0
                                ? reserveLockedTokens
                                : maxSupply,
                        decimals,
                        cliffDays: 0,
                        linearDays: halvingIntervalDays,
                        charterSha256Hex: charterSha256
                    });
                    await client.query(
                        `INSERT INTO forge_monetary_policies
                         (token_ticker, creator_address, max_supply, burn_rate_bps, burn_address,
                          emission_schedule_type, daily_emission_rate, halving_interval_days,
                          reserve_locked_tokens, zero_rug_lp_pct, zero_rug_lock_days,
                          is_retroactive_upgrade, charter_sha256, token_standard,
                          kcc20_covenant_id, kcc20_state_root, silverscript_charter_source,
                          covenant_vault_address, anchor_tx_hash, updated_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, CURRENT_TIMESTAMP)
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
                            token_standard = EXCLUDED.token_standard,
                            kcc20_covenant_id = EXCLUDED.kcc20_covenant_id,
                            kcc20_state_root = EXCLUDED.kcc20_state_root,
                            silverscript_charter_source = EXCLUDED.silverscript_charter_source,
                            covenant_vault_address = EXCLUDED.covenant_vault_address,
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
                            tokenStandard,
                            charterVault.kcc20CovenantIdHex,
                            charterVault.kcc20StateRootHex,
                            charterVault.silverscriptSource,
                            charterVault.covenantAddress,
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
                    const syndicateEnabled =
                        mv.syndicateSectorEnabled !== false;
                    const vaultLabel =
                        String(
                            mv.vaultLabel ||
                                'Proof-of-Hashrate Mining Vault'
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
                        tokenStandard,
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

        if (rustRejectionStatus !== null) {
            return json(
                rustRejectionBody || {
                    success: false,
                    error: 'Rust state engine rejected the action.'
                },
                { status: rustRejectionStatus }
            );
        }

        return json(
            { error: 'Rust state engine rejected the action.' },
            { status: 500 }
        );
    } catch (e) {
        console.error('🔴 State Action Fault:', e);
        return json({ error: 'Failed to process action' }, { status: 500 });
    }
};