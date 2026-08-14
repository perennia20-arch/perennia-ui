import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { dbPool } from '$lib/server/db';
import { env } from '$env/dynamic/private';

const rawKeyString = env.KYC_MASTER_KEY || '12345678901234567890123456789012';
const ENCRYPTION_KEY = Buffer.from(rawKeyString).length === 32 ? Buffer.from(rawKeyString) : crypto.createHash('sha256').update(String(rawKeyString)).digest();

export const POST: RequestHandler = async ({ request }) => {
    let client;
    try {
        const { walletAddress, legalName, entityType, tin, address } = await request.json();

        if (!walletAddress || !legalName || !entityType || !tin || !address) {
            return json({ error: 'Missing mandatory compliance fields.' }, { status: 400 });
        }

        // ⚡ THE FIX: Standardize the wallet format before insertion
        const formattedWallet = walletAddress.toLowerCase().startsWith('kaspa:') ? walletAddress.toLowerCase() : `kaspa:${walletAddress.toLowerCase()}`;

        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
        
        let encryptedTin = cipher.update(tin, 'utf8', 'hex');
        encryptedTin += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        
        const secureTinPayload = `${iv.toString('hex')}:${authTag}:${encryptedTin}`;

        client = await dbPool.connect();

        await client.query(
            `INSERT INTO entity_kyc 
            (wallet_address, legal_name, entity_type, tax_id_hash, business_address, verification_status, verified_at)
            VALUES ($1, $2, $3, $4, $5, 'verified', CURRENT_TIMESTAMP)
            ON CONFLICT (wallet_address) DO UPDATE SET
            legal_name = EXCLUDED.legal_name,
            entity_type = EXCLUDED.entity_type,
            tax_id_hash = EXCLUDED.tax_id_hash,
            business_address = EXCLUDED.business_address,
            verification_status = 'verified',
            verified_at = CURRENT_TIMESTAMP`,
            [formattedWallet, legalName, entityType, secureTinPayload, address]
        );

        return json({ success: true, message: 'Entity verified and cryptographically secured.' });

    } catch (error: any) {
        console.error("KYC Matrix Fault:", error);
        return json({ error: 'DATABASE_FAULT', message: error.message }, { status: 500 });
    } finally {
        if (client) client.release();
    }
};

export const GET: RequestHandler = async ({ cookies }) => {
    const rawCookie = cookies.get('perennia_session');
    
    if (!rawCookie) {
        return json({ error: 'Unauthorized matrix access' }, { status: 401 });
    }

    // ⚡ THE FIX: Standardize the retrieval format to match the POST route exactly
    const decodedCookie = decodeURIComponent(rawCookie).toLowerCase().trim();
    const sessionWallet = decodedCookie.startsWith('kaspa:') ? decodedCookie : `kaspa:${decodedCookie}`;

    let client;
    
    try {
        client = await dbPool.connect();
        
        const res = await client.query(`SELECT * FROM entity_kyc WHERE wallet_address = $1`, [sessionWallet]);
        
        if (res.rows.length === 0) {
            return json({ status: 'unverified' });
        }
        
        const record = res.rows[0];
        
        const [ivHex, authTagHex, encryptedHex] = record.tax_id_hash.split(':');
        
        const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
        
        let decryptedTin = decipher.update(encryptedHex, 'hex', 'utf8');
        decryptedTin += decipher.final('utf8');
        
        return json({ 
            status: record.verification_status,
            entity: {
                legalName: record.legal_name,
                entityType: record.entity_type,
                tinLast4: decryptedTin.slice(-4),
                address: record.business_address,
                verifiedAt: record.verified_at
            }
        });
        
    } catch (error: any) {
        console.error("KYC Decryption Verification Fault:", error);
        return json({ error: 'DECRYPTION_FAULT', message: error.message }, { status: 500 });
    } finally {
        if (client) client.release();
    }
};