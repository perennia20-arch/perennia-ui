import { env } from '$env/dynamic/private';
import { dbPool } from '$lib/server/db';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

export interface VaultEstate {
    HOT: {
        KAS: string;
        ETH: string;
        BTC: string;
        SOL: string;
    };
    COLD: {
        KAS: string;
        ETH: string;
        BTC: string;
        SOL: string;
    };
}

export interface DecryptedBankRailPayload {
    routingNumber: string;
    accountNumber: string;
    bankLabel: string;
    accountType: 'CHECKING' | 'SAVINGS';
    payoutMethod: 'ACH' | 'WIRE';
}

export function normalizeKaspaAddressStrict(raw: string | null | undefined): string {
    const clean = String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/^kaspa:/i, '')
        .trim();
    if (!clean) return '';
    return `kaspa:${clean}`;
}

export function normalizeKaspaBase32Strict(raw: string | null | undefined): string {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/^kaspa:/i, '')
        .trim();
}

export function resolveMasterTreasuryKasAddress(): string {
    const raw = (
        env.PERENNIA_MASTER_TREASURY_KAS ||
        env.MASTER_ADMIN_ADDRESS ||
        env.PERENNIA_COLD_KAS_ADDRESS ||
        ''
    ).trim();
    const normalized = normalizeKaspaAddressStrict(raw);
    if (!normalized || normalized.length < 60) {
        throw new Error(
            'CONFIG_HALT: PERENNIA_MASTER_TREASURY_KAS is not configured in .env. Failing closed (503).'
        );
    }
    return normalized;
}

export function resolveMasterTreasuryKasAddressOptional(): string | null {
    try {
        return resolveMasterTreasuryKasAddress();
    } catch {
        return null;
    }
}

export function isWalletMasterAdmin(candidateWallet: string | null | undefined): boolean {
    if (!candidateWallet) return false;
    const masterAddr = resolveMasterTreasuryKasAddressOptional();
    if (!masterAddr) return false;
    const cleanCandidate = normalizeKaspaBase32Strict(candidateWallet);
    const cleanMaster = normalizeKaspaBase32Strict(masterAddr);
    if (!cleanCandidate || !cleanMaster || cleanCandidate.length !== cleanMaster.length) {
        return false;
    }
    return crypto.timingSafeEqual(
        Buffer.from(cleanCandidate, 'utf8'),
        Buffer.from(cleanMaster, 'utf8')
    );
}

export function getKycMasterKeyStrict(): string {
    const configured = (env.KYC_MASTER_KEY || '').trim();
    if (configured.length < 32) {
        throw new Error(
            'CRITICAL_SECURITY_LOCKDOWN: KYC_MASTER_KEY (minimum 32 characters) must be configured in .env. Failing closed (503).'
        );
    }
    return configured;
}

export function deriveAes256Key(masterKey?: string): Buffer {
    const raw = masterKey ? masterKey.trim() : getKycMasterKeyStrict();
    if (raw.length < 32) {
        throw new Error(
            'CRITICAL_SECURITY_LOCKDOWN: Cipher key material is shorter than 32 characters.'
        );
    }
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
        return Buffer.from(raw, 'hex');
    }
    const rawBuf = Buffer.from(raw, 'utf8');
    return rawBuf.length === 32
        ? rawBuf
        : crypto.createHash('sha256').update(rawBuf).digest();
}

export function encryptBankRailRecordStrict(params: {
    routingNumber: string;
    accountNumber: string;
    bankLabel?: string;
    accountType?: 'CHECKING' | 'SAVINGS';
    payoutMethod?: 'ACH' | 'WIRE';
}): string {
    const keyBuf = deriveAes256Key();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
    const payload = JSON.stringify({
        routingNumber: params.routingNumber.trim(),
        accountNumber: params.accountNumber.trim(),
        bankLabel: (params.bankLabel || 'Primary Operating Account').trim(),
        accountType: params.accountType === 'SAVINGS' ? 'SAVINGS' : 'CHECKING',
        payoutMethod: params.payoutMethod === 'WIRE' ? 'WIRE' : 'ACH'
    });
    let encrypted = cipher.update(payload, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptBankRailRecordStrict(
    encryptedPayload: string
): DecryptedBankRailPayload | null {
    const keyBuf = deriveAes256Key();
    try {
        const parts = String(encryptedPayload || '').split(':');
        if (parts.length !== 3) return null;
        const [ivHex, authTagHex, encryptedHex] = parts;
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
        if (!routingNumber || !accountNumber) return null;
        const rawType = String(parsed.accountType || 'CHECKING').toUpperCase();
        const rawMethod = String(parsed.payoutMethod || 'ACH').toUpperCase();
        return {
            routingNumber,
            accountNumber,
            bankLabel: String(
                parsed.bankLabel || 'Primary Operating Account'
            ).trim(),
            accountType: rawType === 'SAVINGS' ? 'SAVINGS' : 'CHECKING',
            payoutMethod: rawMethod === 'WIRE' ? 'WIRE' : 'ACH'
        };
    } catch {
        return null;
    }
}

export class SovereignKMS {
    public async getCorporateAddresses(): Promise<VaultEstate['HOT']> {
        const fallbackKas = resolveMasterTreasuryKasAddressOptional() || '';
        const hotKasRaw = (
            env.PERENNIA_HOT_KAS_ADDRESS ||
            env.PERENNIA_TREASURY_KAS_ADDRESS ||
            fallbackKas
        ).trim();
        return {
            KAS: hotKasRaw ? normalizeKaspaAddressStrict(hotKasRaw) : 'Awaiting KAS Configuration',
            ETH: (env.PERENNIA_HOT_ETH_ADDRESS || '').trim() || 'Awaiting ETH Configuration',
            BTC: (env.PERENNIA_HOT_BTC_ADDRESS || '').trim() || 'Awaiting BTC Configuration',
            SOL: (env.PERENNIA_HOT_SOL_ADDRESS || '').trim() || 'Awaiting SOL Configuration'
        };
    }

    public async getColdStorageAddresses(): Promise<VaultEstate['COLD']> {
        let dbColdKas = '';
        let dbColdBtc = '';
        let dbColdEth = '';
        let dbColdSol = '';

        try {
            const res = await dbPool.query(
                `SELECT cold_kas_address, cold_btc_address, cold_eth_address, cold_sol_address
                 FROM system_treasury_config
                 WHERE config_id = 'PRIMARY'
                 LIMIT 1`
            );
            if (res.rows.length > 0) {
                const r = res.rows[0];
                dbColdKas = String(r.cold_kas_address || '').trim();
                dbColdBtc = String(r.cold_btc_address || '').trim();
                dbColdEth = String(r.cold_eth_address || '').trim();
                dbColdSol = String(r.cold_sol_address || '').trim();
            }
        } catch {
            // Fall back to .env if table query fails
        }

        const envColdKas =
            resolveMasterTreasuryKasAddressOptional() ||
            (env.PERENNIA_COLD_KAS_ADDRESS || '').trim();

        return {
            KAS: dbColdKas || envColdKas,
            ETH: dbColdEth || (env.PERENNIA_COLD_ETH_ADDRESS || '').trim(),
            BTC: dbColdBtc || (env.PERENNIA_COLD_BTC_ADDRESS || '').trim(),
            SOL: dbColdSol || (env.PERENNIA_COLD_SOL_ADDRESS || '').trim()
        };
    }

    public verifyMasterAdminKey(providedKey: string): boolean {
        const expectedKey = (
            env.PERENNIA_ADMIN_KEY ||
            env.INTERNAL_ADMIN_TOKEN ||
            ''
        ).trim();
        if (!expectedKey) {
            throw new Error(
                'CRITICAL_SECURITY_LOCKDOWN: PERENNIA_ADMIN_KEY is not configured in .env.'
            );
        }
        const cleanProvided = String(providedKey || '')
            .replace(/^Bearer\s+/i, '')
            .trim();
        const expectedBuffer = Buffer.from(expectedKey, 'utf8');
        const providedBuffer = Buffer.from(cleanProvided, 'utf8');
        if (expectedBuffer.length !== providedBuffer.length) {
            return false;
        }
        return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
    }
}

export const perenniaKMS = new SovereignKMS();