import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const LUA_ATOMIC_DEBIT_FIAT_LEDGER = `
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

export interface DecryptedBankRail {
    routingNumber: string;
    accountNumber: string;
    bankLabel: string;
    accountType: 'CHECKING' | 'SAVINGS';
    payoutMethod: 'ACH' | 'WIRE';
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

function encryptBankRailRecord(
    routingNumber: string,
    accountNumber: string,
    masterKey: string,
    bankLabel = 'Primary Operating Account',
    accountType: 'CHECKING' | 'SAVINGS' = 'CHECKING',
    payoutMethod: 'ACH' | 'WIRE' = 'ACH'
): string {
    const iv = crypto.randomBytes(12);
    const keyBuf = deriveCipherKey(masterKey);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
    const payload = JSON.stringify({
        routingNumber,
        accountNumber,
        bankLabel,
        accountType,
        payoutMethod
    });
    let encrypted = cipher.update(payload, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptBankRailRecord(
    encryptedPayload: string,
    masterKey: string
): DecryptedBankRail | null {
    const isProd = process.env.NODE_ENV === 'production';
    const candidateKeys = isProd
        ? [masterKey]
        : [
              masterKey,
              'perennia_sovereign_rail_cipher_key',
              '12345678901234567890123456789012'
          ];
    for (const candidate of candidateKeys) {
        try {
            const parts = encryptedPayload.split(':');
            if (parts.length !== 3) continue;
            const [ivHex, authTagHex, encryptedHex] = parts;
            const keyBuf = deriveCipherKey(candidate);
            const decipher = crypto.createDecipheriv(
                'aes-256-gcm',
                keyBuf,
                Buffer.from(ivHex, 'hex')
            );
            decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
            let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            const parsed = JSON.parse(decrypted);
            const routing = String(parsed.routingNumber || parsed.routing || '').trim();
            const account = String(parsed.accountNumber || parsed.account || '').trim();
            if (routing && account) {
                const rawType = String(parsed.accountType || 'CHECKING').toUpperCase();
                const rawMethod = String(parsed.payoutMethod || 'ACH').toUpperCase();
                return {
                    routingNumber: routing,
                    accountNumber: account,
                    bankLabel: String(
                        parsed.bankLabel || 'Primary Operating Account'
                    ).trim(),
                    accountType: rawType === 'SAVINGS' ? 'SAVINGS' : 'CHECKING',
                    payoutMethod: rawMethod === 'WIRE' ? 'WIRE' : 'ACH'
                };
            }
        } catch {
            // Continue in non-prod
        }
    }
    return null;
}

async function ensureFiatOfframpTables() {
    const client = await dbPool.connect();
    try {
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
    } finally {
        client.release();
    }
}

async function loadSavedBankRailForWallet(
    cleanWallet: string,
    prefixedWallet: string,
    masterKey: string
): Promise<{
    decrypted: DecryptedBankRail | null;
    meta: {
        bankLabel: string;
        accountType: 'CHECKING' | 'SAVINGS';
        payoutMethod: 'ACH' | 'WIRE';
        bankLast4: string;
        updatedAt: string;
    } | null;
}> {
    await ensureFiatOfframpTables().catch(() => {});
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
            const decrypted = decryptBankRailRecord(
                String(row.encrypted_rail_payload || ''),
                masterKey
            );
            const bankLabel = String(
                row.bank_label || decrypted?.bankLabel || 'Primary Operating Account'
            );
            const accountType: 'CHECKING' | 'SAVINGS' =
                String(
                    row.account_type || decrypted?.accountType || 'CHECKING'
                ).toUpperCase() === 'SAVINGS'
                    ? 'SAVINGS'
                    : 'CHECKING';
            const payoutMethod: 'ACH' | 'WIRE' =
                String(
                    row.payout_method || decrypted?.payoutMethod || 'ACH'
                ).toUpperCase() === 'WIRE'
                    ? 'WIRE'
                    : 'ACH';
            const bankLast4 = String(
                row.bank_last4 || decrypted?.accountNumber?.slice(-4) || ''
            );
            if (row.encrypted_rail_payload) {
                await redis
                    .set(
                        `perennia:fiat:bank_rail:${cleanWallet}`,
                        String(row.encrypted_rail_payload),
                        'EX',
                        60 * 60 * 24 * 30
                    )
                    .catch(() => {});
            }
            return {
                decrypted: decrypted
                    ? {
                          ...decrypted,
                          bankLabel,
                          accountType,
                          payoutMethod
                      }
                    : null,
                meta: bankLast4
                    ? {
                          bankLabel,
                          accountType,
                          payoutMethod,
                          bankLast4,
                          updatedAt: row.updated_at
                              ? new Date(row.updated_at).toISOString()
                              : new Date().toISOString()
                      }
                    : null
            };
        }
    } catch {
        // Fallback to Redis
    }
    const cachedRail = await redis.get(`perennia:fiat:bank_rail:${cleanWallet}`);
    if (cachedRail) {
        const decrypted = decryptBankRailRecord(cachedRail, masterKey);
        if (decrypted?.accountNumber) {
            const bankLast4 = decrypted.accountNumber.slice(-4);
            try {
                await dbPool.query(
                    `INSERT INTO fiat_bank_rails (wallet_address, bank_label, account_type, payout_method, bank_last4, encrypted_rail_payload, updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
                     ON CONFLICT (wallet_address) DO UPDATE SET
                        bank_label = EXCLUDED.bank_label,
                        account_type = EXCLUDED.account_type,
                        payout_method = EXCLUDED.payout_method,
                        bank_last4 = EXCLUDED.bank_last4,
                        encrypted_rail_payload = EXCLUDED.encrypted_rail_payload,
                        updated_at = CURRENT_TIMESTAMP`,
                    [
                        prefixedWallet,
                        decrypted.bankLabel,
                        decrypted.accountType,
                        decrypted.payoutMethod,
                        bankLast4,
                        cachedRail
                    ]
                );
            } catch {
                // Ignore sync error
            }
            return {
                decrypted,
                meta: {
                    bankLabel: decrypted.bankLabel,
                    accountType: decrypted.accountType,
                    payoutMethod: decrypted.payoutMethod,
                    bankLast4,
                    updatedAt: new Date().toISOString()
                }
            };
        }
    }
    return { decrypted: null, meta: null };
}

async function persistBankRailForWallet(
    cleanWallet: string,
    prefixedWallet: string,
    routingNumber: string,
    accountNumber: string,
    bankLabel: string,
    accountType: 'CHECKING' | 'SAVINGS',
    payoutMethod: 'ACH' | 'WIRE',
    masterKey: string
) {
    const encrypted = encryptBankRailRecord(
        routingNumber,
        accountNumber,
        masterKey,
        bankLabel,
        accountType,
        payoutMethod
    );
    const bankLast4 = accountNumber.slice(-4);
    await ensureFiatOfframpTables();
    await dbPool.query(
        `INSERT INTO fiat_bank_rails
         (wallet_address, bank_label, account_type, payout_method, bank_last4, encrypted_rail_payload, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
         ON CONFLICT (wallet_address) DO UPDATE SET
            bank_label = EXCLUDED.bank_label,
            account_type = EXCLUDED.account_type,
            payout_method = EXCLUDED.payout_method,
            bank_last4 = EXCLUDED.bank_last4,
            encrypted_rail_payload = EXCLUDED.encrypted_rail_payload,
            updated_at = CURRENT_TIMESTAMP`,
        [prefixedWallet, bankLabel, accountType, payoutMethod, bankLast4, encrypted]
    );
    await dbPool
        .query(`DELETE FROM fiat_bank_rails WHERE wallet_address = $1`, [cleanWallet])
        .catch(() => {});
    await redis.set(
        `perennia:fiat:bank_rail:${cleanWallet}`,
        encrypted,
        'EX',
        60 * 60 * 24 * 30
    );
    return {
        bankLabel,
        accountType,
        payoutMethod,
        bankLast4,
        updatedAt: new Date().toISOString()
    };
}

export const GET: RequestHandler = async ({ cookies, locals }: RequestEvent) => {
    try {
        const masterKey = getMasterKeyStrict();
        const sessionId = cookies.get('perennia_session');
        let sessionWallet = (locals as any).walletAddress || '';
        if (!sessionWallet && sessionId) {
            sessionWallet = (await redis.get(`session:${sessionId}`)) || '';
        }
        const circleConfigured = Boolean(
            env.CIRCLE_API_KEY && env.CIRCLE_API_KEY.trim() !== ''
        );
        const spotStr = await redis.get('oracle:spot:KAS_USDC');
        const spotPrice = spotStr ? parseFloat(spotStr) : 0;
        let savedBankRailLast4: string | null = null;
        let savedBankRail: {
            bankLabel: string;
            accountType: 'CHECKING' | 'SAVINGS';
            payoutMethod: 'ACH' | 'WIRE';
            bankLast4: string;
            updatedAt: string;
        } | null = null;
        let recentPayouts: any[] = [];
        if (sessionWallet) {
            const cleanWallet = sessionWallet
                .toLowerCase()
                .replace(/^kaspa:/i, '')
                .trim();
            const prefixedWallet = `kaspa:${cleanWallet}`;
            const loaded = await loadSavedBankRailForWallet(
                cleanWallet,
                prefixedWallet,
                masterKey
            );
            if (loaded.meta) {
                savedBankRail = loaded.meta;
                savedBankRailLast4 = loaded.meta.bankLast4;
            }
            try {
                await ensureFiatOfframpTables();
                const res = await dbPool.query(
                    `SELECT payout_id, source_type, source_asset, amount_crypto, gross_usd, fee_usd, net_fiat_usd, payout_method, bank_last4, tx_id, trace_id, status, created_at, updated_at
                     FROM fiat_payout_queue
                     WHERE wallet_address = $1 OR wallet_address = $2
                     ORDER BY created_at DESC
                     LIMIT 25`,
                    [prefixedWallet, cleanWallet]
                );
                recentPayouts = res.rows;
            } catch {
                recentPayouts = [];
            }
        }
        return json({
            circleConfigured,
            sovereignQueueEnabled: true,
            oracleOnline: spotPrice > 0,
            spotPrice,
            savedBankRailReady: Boolean(savedBankRailLast4),
            savedBankRailLast4,
            savedBankRail,
            phase2GuardActive: false,
            recentPayouts
        });
    } catch (err: any) {
        return json(
            { error: err.message || 'Fiat gateway configuration error.' },
            { status: 500 }
        );
    }
};

export const POST: RequestHandler = async ({ request, cookies, locals }: RequestEvent) => {
    const sessionId = cookies.get('perennia_session');
    let sessionWallet = (locals as any).walletAddress || '';
    if (!sessionWallet && sessionId) {
        sessionWallet = (await redis.get(`session:${sessionId}`)) || '';
    }
    if (!sessionWallet) {
        return json(
            { error: 'UNAUTHORIZED: Active Sovereign session required for fiat off-ramp.' },
            { status: 401 }
        );
    }
    try {
        const masterKey = getMasterKeyStrict();
        const body = await request.json();
        const {
            action,
            saveRailOnly,
            wallet,
            amountKas,
            kasAmount,
            amountAsset,
            sourceMode = 'onchain_kas',
            sourceAsset = 'KAS',
            txId: providedTxId,
            signedPsbt,
            systemMode,
            payoutMethod = 'ach',
            bankLabel,
            accountType = 'CHECKING',
            routingNumber,
            accountNumber,
            preFlightOnly
        } = body;

        const activeWallet = (wallet || sessionWallet).trim();
        const cleanWallet = activeWallet.toLowerCase().replace(/^kaspa:/i, '').trim();
        const prefixedWallet = `kaspa:${cleanWallet}`;

        const normalizedAccountType: 'CHECKING' | 'SAVINGS' =
            String(accountType || 'CHECKING').toUpperCase() === 'SAVINGS'
                ? 'SAVINGS'
                : 'CHECKING';
        const normalizedPayoutMethod: 'ACH' | 'WIRE' =
            String(payoutMethod || 'ach').toUpperCase() === 'WIRE' ? 'WIRE' : 'ACH';
        const normalizedBankLabel =
            String(bankLabel || 'Primary Operating Account').trim() ||
            'Primary Operating Account';

        let resolvedRouting = routingNumber
            ? String(routingNumber).replace(/\D/g, '').trim()
            : '';
        let resolvedAccount = accountNumber
            ? String(accountNumber).replace(/\D/g, '').trim()
            : '';

        if (
            String(action || '').toUpperCase() === 'SAVE_BANK_RAIL' ||
            Boolean(saveRailOnly)
        ) {
            if (
                !resolvedRouting ||
                resolvedRouting.length !== 9 ||
                !resolvedAccount ||
                resolvedAccount.length < 4
            ) {
                return json(
                    {
                        error:
                            'BANK_ROUTING_REQUIRED: Please enter a valid 9-digit ABA Routing Number and Bank Account Number (minimum 4 digits).'
                    },
                    { status: 400 }
                );
            }
            const savedMeta = await persistBankRailForWallet(
                cleanWallet,
                prefixedWallet,
                resolvedRouting,
                resolvedAccount,
                normalizedBankLabel,
                normalizedAccountType,
                normalizedPayoutMethod,
                masterKey
            );
            return json({
                success: true,
                savedBankRailReady: true,
                savedBankRailLast4: savedMeta.bankLast4,
                savedBankRail: savedMeta
            });
        }

        if (resolvedRouting && resolvedAccount) {
            if (resolvedRouting.length !== 9 || resolvedAccount.length < 4) {
                return json(
                    {
                        error:
                            'BANK_ROUTING_REQUIRED: Please enter a valid 9-digit ABA Routing Number and Bank Account Number to route USD settlement.'
                    },
                    { status: 400 }
                );
            }
            await persistBankRailForWallet(
                cleanWallet,
                prefixedWallet,
                resolvedRouting,
                resolvedAccount,
                normalizedBankLabel,
                normalizedAccountType,
                normalizedPayoutMethod,
                masterKey
            );
        } else {
            const loaded = await loadSavedBankRailForWallet(
                cleanWallet,
                prefixedWallet,
                masterKey
            );
            if (loaded.decrypted) {
                resolvedRouting = loaded.decrypted.routingNumber;
                resolvedAccount = loaded.decrypted.accountNumber;
            }
        }

        const cleanSourceMode = String(sourceMode || 'onchain_kas').toLowerCase();
        const isLedgerUsdc =
            cleanSourceMode === 'ledger_usdc' ||
            String(sourceAsset || '').toUpperCase() === 'USDC';
        const isLedgerKas = cleanSourceMode === 'ledger_kas';
        const resolvedAssetTicker = isLedgerUsdc ? 'USDC' : 'KAS';
        const parsedAmountCrypto = Number(amountAsset ?? amountKas ?? kasAmount);

        if (!parsedAmountCrypto || parsedAmountCrypto <= 0) {
            return json(
                { error: `Invalid ${resolvedAssetTicker} off-ramp amount specified.` },
                { status: 400 }
            );
        }
        if (
            !resolvedRouting ||
            resolvedRouting.length < 9 ||
            !resolvedAccount ||
            resolvedAccount.length < 4
        ) {
            return json(
                {
                    error:
                        'BANK_ROUTING_REQUIRED: Please enter a valid 9-digit ABA Routing Number and Bank Account Number to route USD settlement.'
                },
                { status: 400 }
            );
        }

        const spotStr = await redis.get('oracle:spot:KAS_USDC');
        const kasSpotPrice = spotStr ? parseFloat(spotStr) : 0;
        if (!isLedgerUsdc && (!kasSpotPrice || kasSpotPrice <= 0)) {
            return json(
                {
                    error: 'ORACLE_HALT: Live KAS/USDC spot price is synchronizing from the oracle array.'
                },
                { status: 503 }
            );
        }

        const executionSpotPrice = isLedgerUsdc ? 1.0 : kasSpotPrice;
        const grossUsd = parsedAmountCrypto * executionSpotPrice;
        const isWhale = grossUsd >= 2000.0;
        const spreadRate = isLedgerUsdc
            ? isWhale
                ? 0.0025
                : 0.005
            : systemMode === 'overclocked'
              ? 0.025
              : isWhale
                ? 0.005
                : 0.015;
        const railFeeUsd = isWhale
            ? 0.0
            : normalizedPayoutMethod === 'ACH'
              ? 2.0
              : 15.0;
        const feeUsd = grossUsd * spreadRate + railFeeUsd;
        const netUsdNumeric = Math.max(0, grossUsd - feeUsd);

        if (netUsdNumeric <= 0) {
            return json(
                {
                    error: 'Off-ramp amount insufficient to cover bank rail and protocol settlement fees.'
                },
                { status: 400 }
            );
        }

        const netFiatPayout = netUsdNumeric.toFixed(2);
        const userLedgerKey = `dev:sor:treasury:balances:${cleanWallet}`;

        if (isLedgerKas || isLedgerUsdc) {
            const rawLedger = await redis.hgetall(userLedgerKey);
            const primaryBal = parseFloat(rawLedger?.[resolvedAssetTicker] || '0') || 0;
            const unassignedBal =
                resolvedAssetTicker === 'KAS'
                    ? parseFloat(rawLedger?.['Unassigned KAS'] || '0') || 0
                    : 0;
            const totalAvailableLedger = primaryBal + unassignedBal;
            if (totalAvailableLedger + 1e-8 < parsedAmountCrypto) {
                return json(
                    {
                        error: `INSUFFICIENT_LEDGER_BALANCE: Requested ${parsedAmountCrypto.toFixed(4)} ${resolvedAssetTicker}, but Internal Treasury Ledger has ${totalAvailableLedger.toFixed(4)} ${resolvedAssetTicker}.`
                    },
                    { status: 400 }
                );
            }
        }

        if (preFlightOnly) {
            return json({
                success: true,
                preFlightVerified: true,
                sourceMode: cleanSourceMode,
                sourceAsset: resolvedAssetTicker,
                grossUsd: Number(grossUsd.toFixed(2)),
                feeUsd: Number(feeUsd.toFixed(2)),
                netFiatPayout: parseFloat(netFiatPayout),
                spotPrice: executionSpotPrice,
                bankAccountLast4: resolvedAccount.slice(-4),
                bankLabel: normalizedBankLabel,
                accountType: normalizedAccountType
            });
        }

        let settlementTxId = providedTxId ? String(providedTxId).trim() : '';
        if (isLedgerKas || isLedgerUsdc) {
            const debitRes = (await redis.eval(
                LUA_ATOMIC_DEBIT_FIAT_LEDGER,
                1,
                userLedgerKey,
                resolvedAssetTicker,
                parsedAmountCrypto.toString()
            )) as [number, string];

            if (!debitRes || Number(debitRes[0]) !== 1) {
                return json(
                    {
                        error: `Atomic ledger debit failed: Insufficient ${resolvedAssetTicker} in Internal Treasury Ledger.`
                    },
                    { status: 400 }
                );
            }
            const fromUnassigned = parseFloat(debitRes[1] || '0') || 0;
            if (fromUnassigned > 1e-9) {
                try {
                    await dbPool.query(
                        `UPDATE yield_reservoirs
                         SET streaming_balance_kas = GREATEST(0.0, streaming_balance_kas - $1),
                             last_updated = CURRENT_TIMESTAMP
                         WHERE LOWER(REPLACE(TRIM(wallet_address), 'kaspa:', '')) = $2 OR wallet_address = $3`,
                        [fromUnassigned, cleanWallet, prefixedWallet]
                    );
                } catch {
                    // Ignore reservoir sync error
                }
            }
            settlementTxId = `LEDGER-FIAT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        } else {
            if (!settlementTxId && signedPsbt) {
                const kaspaRestUrl = (
                    env.KASPA_REST_URL || 'https://api.kaspa.org'
                ).replace(/\/+$/, '');
                const broadcastRes = await fetch(`${kaspaRestUrl}/transactions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(
                        typeof signedPsbt === 'string'
                            ? JSON.parse(signedPsbt)
                            : signedPsbt
                    )
                });
                if (!broadcastRes.ok) {
                    const errText = await broadcastRes.text();
                    return json(
                        { error: `L1 Node rejected off-ramp transaction: ${errText}` },
                        { status: 502 }
                    );
                }
                const broadcastData = await broadcastRes.json();
                settlementTxId = broadcastData.transactionId || '';
            }
            if (!settlementTxId) {
                return json(
                    {
                        error: 'Missing L1 settlement transaction ID or signed PSBT payload.'
                    },
                    { status: 400 }
                );
            }
        }

        const circleConfigured = Boolean(
            env.CIRCLE_API_KEY && env.CIRCLE_API_KEY.trim() !== ''
        );
        let wireReferenceId = `PER-ACH-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
        let dispatchStatus = 'QUEUED_FOR_TREASURY_DISPATCH';
        let traceId: string | null = null;

        if (circleConfigured) {
            const circleRes = await fetch('https://api.circle.com/v1/payouts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${env.CIRCLE_API_KEY!.trim()}`
                },
                body: JSON.stringify({
                    idempotencyKey: crypto.randomUUID(),
                    amount: {
                        amount: netFiatPayout,
                        currency: 'USD'
                    },
                    destination: {
                        type: normalizedPayoutMethod === 'ACH' ? 'ach' : 'wire',
                        name: prefixedWallet,
                        routingNumber: resolvedRouting,
                        accountNumber: resolvedAccount
                    }
                })
            });
            if (circleRes.ok) {
                const circleData = await circleRes.json();
                wireReferenceId = circleData?.data?.id || wireReferenceId;
                traceId = circleData?.data?.trackingRef || wireReferenceId;
                dispatchStatus = 'CIRCLE_DISPATCHED';
            } else {
                const circleErr = await circleRes.text();
                console.warn(
                    `Circle API returned non-200 (${circleErr}); routing payout to Sovereign Treasury Dispatch Queue.`
                );
            }
        }

        const payoutRecord = {
            payoutId: wireReferenceId,
            walletAddress: prefixedWallet,
            sourceType: cleanSourceMode,
            sourceAsset: resolvedAssetTicker,
            amountCrypto: parsedAmountCrypto,
            grossUsd: Number(grossUsd.toFixed(2)),
            feeUsd: Number(feeUsd.toFixed(2)),
            netFiatUsd: parseFloat(netFiatPayout),
            payoutMethod: normalizedPayoutMethod,
            bankLast4: resolvedAccount.slice(-4),
            txId: settlementTxId,
            traceId,
            status: dispatchStatus,
            createdAt: new Date().toISOString()
        };

        try {
            await ensureFiatOfframpTables();
            await dbPool.query(
                `INSERT INTO fiat_payout_queue
                 (payout_id, wallet_address, source_type, source_asset, amount_crypto, gross_usd, fee_usd, net_fiat_usd, payout_method, bank_last4, tx_id, trace_id, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
                [
                    payoutRecord.payoutId,
                    payoutRecord.walletAddress,
                    payoutRecord.sourceType,
                    payoutRecord.sourceAsset,
                    payoutRecord.amountCrypto,
                    payoutRecord.grossUsd,
                    payoutRecord.feeUsd,
                    payoutRecord.netFiatUsd,
                    payoutRecord.payoutMethod,
                    payoutRecord.bankLast4,
                    payoutRecord.txId,
                    payoutRecord.traceId,
                    payoutRecord.status
                ]
            );
        } catch (dbErr) {
            console.warn('Fiat payout queue DB insert warning:', dbErr);
        }

        await redis.lpush('perennia:fiat:payout_queue', JSON.stringify(payoutRecord));
        await redis.ltrim('perennia:fiat:payout_queue', 0, 199);

        try {
            await dbPool.query(
                `INSERT INTO tax_ledger_events (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash)
                 VALUES ($1, $2, 'FIAT_OFFRAMP', $3, $4, $5, $6)`,
                [
                    cleanWallet,
                    resolvedAssetTicker,
                    grossUsd,
                    parsedAmountCrypto,
                    executionSpotPrice,
                    settlementTxId
                ]
            );
        } catch {
            // Ignore optional tx_hash column notice
        }

        if (resolvedAssetTicker === 'KAS') {
            await redis.rpush(
                'perennia:sor:netting_queue',
                JSON.stringify({
                    wallet: prefixedWallet,
                    direction: 'SELL_KAS',
                    amount_kas: parsedAmountCrypto,
                    spot_price: executionSpotPrice,
                    fee_captured_usd: feeUsd,
                    target_asset: 'USD',
                    estimated_output: parseFloat(netFiatPayout)
                })
            );
        } else {
            await redis.incrbyfloat('perennia:treasury:netting_profit_usd', feeUsd);
        }

        await redis.publish(
            'telemetry:updates',
            JSON.stringify({
                fiat_event: true,
                eventType: 'FIAT_OFFRAMP',
                wallet: cleanWallet,
                payout: payoutRecord
            })
        );

        return json({
            success: true,
            txId: settlementTxId,
            wireReferenceId,
            traceId,
            status: dispatchStatus,
            sourceMode: cleanSourceMode,
            sourceAsset: resolvedAssetTicker,
            grossUsd: Number(grossUsd.toFixed(2)),
            feeUsd: Number(feeUsd.toFixed(2)),
            netFiatPayout: parseFloat(netFiatPayout),
            spotPrice: executionSpotPrice,
            bankAccountLast4: resolvedAccount.slice(-4)
        });
    } catch (err: any) {
        console.error('🚨 [FIAT OFFRAMP ERROR]:', err);
        return json(
            { error: err.message || 'Internal Fiat Off-Ramp execution failure.' },
            { status: 500 }
        );
    }
};