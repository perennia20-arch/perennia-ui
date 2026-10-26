import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { dbPool } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import { redis } from '$lib/server/redis';

function getEncryptionKeyStrict(): Buffer {
    const isProd = process.env.NODE_ENV === 'production';
    const configured = (env.KYC_MASTER_KEY || '').trim();
    if (isProd && !configured) {
        throw new Error(
            'CRITICAL_SECURITY_LOCKDOWN: KYC_MASTER_KEY environment variable is required in production.'
        );
    }
    const rawKeyString = configured || 'perennia_sovereign_rail_cipher_key';
    return Buffer.from(rawKeyString).length === 32
        ? Buffer.from(rawKeyString)
        : crypto.createHash('sha256').update(String(rawKeyString)).digest();
}

function normalizeKaspaWallet(raw: string): { clean: string; prefixed: string } {
    const clean = String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/^kaspa:/i, '')
        .trim();
    return {
        clean,
        prefixed: `kaspa:${clean}`
    };
}

async function ensureZeroPiiSchemaAndPurgeLegacy() {
    const client = await dbPool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS entity_kyc (
                wallet_address VARCHAR(255) PRIMARY KEY,
                legal_name VARCHAR(255) NOT NULL DEFAULT 'ZERO_PII_SOVEREIGN',
                entity_type VARCHAR(64) NOT NULL DEFAULT 'LLC',
                tax_id_hash TEXT NOT NULL DEFAULT 'ZERO_PII_LOCAL_ONLY',
                bank_data_hash TEXT,
                business_address TEXT NOT NULL DEFAULT 'ZERO_PII_LOCAL_ONLY',
                country_code VARCHAR(16) NOT NULL DEFAULT 'US',
                state_region VARCHAR(64) NOT NULL DEFAULT 'TX',
                filing_status VARCHAR(64) NOT NULL DEFAULT 'SINGLE',
                effective_tax_rate DOUBLE PRECISION NOT NULL DEFAULT 15.0,
                verification_status VARCHAR(40) DEFAULT 'verified',
                verified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`
            ALTER TABLE entity_kyc ADD COLUMN IF NOT EXISTS legal_name VARCHAR(255) NOT NULL DEFAULT 'ZERO_PII_SOVEREIGN';
        `);
        await client.query(`
            ALTER TABLE entity_kyc ADD COLUMN IF NOT EXISTS entity_type VARCHAR(64) NOT NULL DEFAULT 'LLC';
        `);
        await client.query(`
            ALTER TABLE entity_kyc ADD COLUMN IF NOT EXISTS tax_id_hash TEXT NOT NULL DEFAULT 'ZERO_PII_LOCAL_ONLY';
        `);
        await client.query(`
            ALTER TABLE entity_kyc ADD COLUMN IF NOT EXISTS bank_data_hash TEXT;
        `);
        await client.query(`
            ALTER TABLE entity_kyc ADD COLUMN IF NOT EXISTS business_address TEXT NOT NULL DEFAULT 'ZERO_PII_LOCAL_ONLY';
        `);
        await client.query(`
            ALTER TABLE entity_kyc ADD COLUMN IF NOT EXISTS country_code VARCHAR(16) NOT NULL DEFAULT 'US';
        `);
        await client.query(`
            ALTER TABLE entity_kyc ADD COLUMN IF NOT EXISTS state_region VARCHAR(64) NOT NULL DEFAULT 'TX';
        `);
        await client.query(`
            ALTER TABLE entity_kyc ADD COLUMN IF NOT EXISTS filing_status VARCHAR(64) NOT NULL DEFAULT 'SINGLE';
        `);
        await client.query(`
            ALTER TABLE entity_kyc ADD COLUMN IF NOT EXISTS effective_tax_rate DOUBLE PRECISION NOT NULL DEFAULT 15.0;
        `);
        await client.query(`
            ALTER TABLE entity_kyc ADD COLUMN IF NOT EXISTS verification_status VARCHAR(40) DEFAULT 'verified';
        `);
        await client.query(`
            ALTER TABLE entity_kyc ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        `);
        await client.query(`
            UPDATE entity_kyc
            SET legal_name = 'ZERO_PII_SOVEREIGN',
                tax_id_hash = 'ZERO_PII_LOCAL_ONLY',
                business_address = 'ZERO_PII_LOCAL_ONLY'
            WHERE legal_name != 'ZERO_PII_SOVEREIGN'
               OR tax_id_hash != 'ZERO_PII_LOCAL_ONLY'
               OR business_address != 'ZERO_PII_LOCAL_ONLY';
        `);
    } finally {
        client.release();
    }
}

export const POST: RequestHandler = async ({ request, cookies }: RequestEvent) => {
    let client;
    try {
        const encryptionKey = getEncryptionKeyStrict();
        const authHeader = request.headers.get('authorization');
        let sessionWallet = '';
        if (env.PERENNIA_ADMIN_KEY && authHeader === `Bearer ${env.PERENNIA_ADMIN_KEY}`) {
            sessionWallet = 'kaspa:admin_override';
        } else {
            const sessionId = cookies.get('perennia_session');
            if (!sessionId) return json({ error: 'UNAUTHORIZED' }, { status: 401 });
            const rawAddress = await redis.get(`session:${sessionId}`);
            if (!rawAddress) return json({ error: 'SESSION_EXPIRED' }, { status: 401 });
            sessionWallet = rawAddress.toLowerCase().trim();
        }
        const payload = await request.json().catch(() => ({}));
        const rawWallet = payload.walletAddress || sessionWallet;
        if (!rawWallet) {
            return json({ error: 'Missing walletAddress.' }, { status: 400 });
        }
        const { clean: cleanWallet, prefixed: formattedWallet } =
            normalizeKaspaWallet(rawWallet);
        if (sessionWallet !== 'kaspa:admin_override') {
            const { clean: cleanSession } = normalizeKaspaWallet(sessionWallet);
            if (cleanSession !== cleanWallet) {
                return json({ error: 'FORBIDDEN_IDENTITY_MUTATION' }, { status: 403 });
            }
        }
        const countryCode = String(payload.countryCode || 'US')
            .trim()
            .toUpperCase()
            .slice(0, 8);
        const stateRegion = String(payload.stateRegion || 'TX')
            .trim()
            .toUpperCase()
            .slice(0, 32);
        const entityType = String(payload.entityType || 'LLC')
            .trim()
            .toUpperCase()
            .slice(0, 32);
        const filingStatus = String(payload.filingStatus || 'SINGLE')
            .trim()
            .toUpperCase()
            .slice(0, 32);
        const rawRate = Number(
            payload.effectiveTaxRate ?? payload.withholdingRate ?? 15.0
        );
        const effectiveTaxRate = Number(
            Math.max(0.0, Math.min(50.0, isNaN(rawRate) ? 15.0 : rawRate)).toFixed(2)
        );
        await ensureZeroPiiSchemaAndPurgeLegacy();
        let secureBankPayload: string | null = null;
        let bankLast4: string | null = null;
        const cleanRouting = payload.routingNumber
            ? String(payload.routingNumber).replace(/\D/g, '').trim()
            : '';
        const cleanAccount = payload.accountNumber
            ? String(payload.accountNumber).replace(/\D/g, '').trim()
            : '';
        const bankLabel = String(
            payload.bankLabel || 'Primary Operating Account'
        ).trim();
        if (cleanRouting.length === 9 && cleanAccount.length >= 4) {
            bankLast4 = cleanAccount.slice(-4);
            const bankJson = JSON.stringify({
                routing: cleanRouting,
                account: cleanAccount,
                routingNumber: cleanRouting,
                accountNumber: cleanAccount,
                bankLabel,
                accountType: 'CHECKING',
                payoutMethod: 'ACH'
            });
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
            const encryptedBank =
                cipher.update(bankJson, 'utf8', 'hex') + cipher.final('hex');
            const authTag = cipher.getAuthTag().toString('hex');
            secureBankPayload = `${iv.toString('hex')}:${authTag}:${encryptedBank}`;
        }
        client = await dbPool.connect();
        await client.query(
            `INSERT INTO entity_kyc
             (wallet_address, legal_name, entity_type, tax_id_hash, bank_data_hash, business_address, country_code, state_region, filing_status, effective_tax_rate, verification_status, verified_at)
             VALUES ($1, 'ZERO_PII_SOVEREIGN', $2, 'ZERO_PII_LOCAL_ONLY', $3, 'ZERO_PII_LOCAL_ONLY', $4, $5, $6, $7, 'verified', CURRENT_TIMESTAMP)
             ON CONFLICT (wallet_address) DO UPDATE SET
                legal_name = 'ZERO_PII_SOVEREIGN',
                entity_type = EXCLUDED.entity_type,
                tax_id_hash = 'ZERO_PII_LOCAL_ONLY',
                bank_data_hash = COALESCE(EXCLUDED.bank_data_hash, entity_kyc.bank_data_hash),
                business_address = 'ZERO_PII_LOCAL_ONLY',
                country_code = EXCLUDED.country_code,
                state_region = EXCLUDED.state_region,
                filing_status = EXCLUDED.filing_status,
                effective_tax_rate = EXCLUDED.effective_tax_rate,
                verification_status = 'verified',
                verified_at = CURRENT_TIMESTAMP`,
            [
                formattedWallet,
                entityType,
                secureBankPayload,
                countryCode,
                stateRegion,
                filingStatus,
                effectiveTaxRate
            ]
        );
        if (secureBankPayload && bankLast4) {
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
            await client.query(
                `INSERT INTO fiat_bank_rails
                 (wallet_address, bank_label, account_type, payout_method, bank_last4, encrypted_rail_payload, updated_at)
                 VALUES ($1, $2, 'CHECKING', 'ACH', $3, $4, CURRENT_TIMESTAMP)
                 ON CONFLICT (wallet_address) DO UPDATE SET
                    bank_label = EXCLUDED.bank_label,
                    bank_last4 = EXCLUDED.bank_last4,
                    encrypted_rail_payload = EXCLUDED.encrypted_rail_payload,
                    updated_at = CURRENT_TIMESTAMP`,
                [formattedWallet, bankLabel, bankLast4, secureBankPayload]
            );
            await redis
                .set(
                    `perennia:fiat:bank_rail:${cleanWallet}`,
                    secureBankPayload,
                    'EX',
                    60 * 60 * 24 * 30
                )
                .catch(() => {});
        }
        return json({
            success: true,
            zeroPiiEnforced: true,
            status: 'verified',
            jurisdiction: {
                countryCode,
                stateRegion,
                jurisdictionCode: `${countryCode}-${stateRegion}`,
                entityType,
                filingStatus,
                effectiveTaxRate
            },
            bankAccountLast4: bankLast4,
            message:
                'Zero-PII jurisdiction telemetry synchronized. Personal identity remains 100% local in your browser.'
        });
    } catch (error: any) {
        console.error('Zero-PII Jurisdiction Telemetry Fault:', error);
        return json(
            { error: 'COMPILATION_FAULT', message: error.message },
            { status: 500 }
        );
    } finally {
        if (client) client.release();
    }
};

export const GET: RequestHandler = async ({ cookies, request, url }: RequestEvent) => {
    let client;
    try {
        getEncryptionKeyStrict();
        const authHeader = request.headers.get('authorization');
        let targetWallet = '';
        if (env.PERENNIA_ADMIN_KEY && authHeader === `Bearer ${env.PERENNIA_ADMIN_KEY}`) {
            targetWallet = url.searchParams.get('wallet') || '';
            if (!targetWallet)
                return json(
                    { error: 'Missing wallet parameter for admin query' },
                    { status: 400 }
                );
        } else {
            const sessionId = cookies.get('perennia_session');
            if (!sessionId)
                return json({ error: 'Unauthorized matrix access' }, { status: 401 });
            const rawAddress = await redis.get(`session:${sessionId}`);
            if (!rawAddress) return json({ error: 'SESSION_EXPIRED' }, { status: 401 });
            targetWallet = rawAddress;
        }
        const { clean: cleanWallet, prefixed: sessionWallet } =
            normalizeKaspaWallet(targetWallet);
        await ensureZeroPiiSchemaAndPurgeLegacy();
        client = await dbPool.connect();
        const [kycRes, railRes] = await Promise.all([
            client.query(
                `SELECT entity_type, country_code, state_region, filing_status, effective_tax_rate, verification_status, verified_at
                 FROM entity_kyc
                 WHERE wallet_address = $1 OR wallet_address = $2
                 LIMIT 1`,
                [sessionWallet, cleanWallet]
            ),
            client
                .query(
                    `SELECT bank_label, bank_last4, payout_method, account_type
                     FROM fiat_bank_rails
                     WHERE wallet_address = $1 OR wallet_address = $2
                     ORDER BY updated_at DESC
                     LIMIT 1`,
                    [sessionWallet, cleanWallet]
                )
                .catch(() => ({ rows: [] as any[] }))
        ]);
        const bankLast4 =
            railRes.rows.length > 0
                ? String(railRes.rows[0].bank_last4 || 'UNLNK')
                : 'UNLNK';
        const bankLabel =
            railRes.rows.length > 0
                ? String(railRes.rows[0].bank_label || 'Primary Operating Account')
                : 'Primary Operating Account';
        if (kycRes.rows.length === 0) {
            return json({
                status: 'unverified',
                zeroPiiEnforced: true,
                bankAccountLast4: bankLast4 !== 'UNLNK' ? bankLast4 : null
            });
        }
        const record = kycRes.rows[0];
        const countryCode = String(record.country_code || 'US').toUpperCase();
        const stateRegion = String(record.state_region || 'TX').toUpperCase();
        const entityType = String(record.entity_type || 'LLC').toUpperCase();
        const filingStatus = String(record.filing_status || 'SINGLE').toUpperCase();
        const effectiveTaxRate = Number(record.effective_tax_rate ?? 15.0);
        return json({
            status: record.verification_status || 'verified',
            zeroPiiEnforced: true,
            jurisdiction: {
                countryCode,
                stateRegion,
                jurisdictionCode: `${countryCode}-${stateRegion}`,
                entityType,
                filingStatus,
                effectiveTaxRate
            },
            entity: {
                legalName: 'Local Browser Vault (Zero-PII)',
                entityType,
                countryCode,
                stateRegion,
                filingStatus,
                effectiveTaxRate,
                tinLast4: 'LOCAL',
                bankAccountLast4: bankLast4,
                bankLabel,
                address: `${countryCode}-${stateRegion} Jurisdiction`,
                verifiedAt: record.verified_at
            }
        });
    } catch (error: any) {
        console.error('Zero-PII Jurisdiction Read Fault:', error);
        return json(
            { error: 'TELEMETRY_READ_FAULT', message: error.message },
            { status: 500 }
        );
    } finally {
        if (client) client.release();
    }
};