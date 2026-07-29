import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import pg from 'pg';
import crypto from 'crypto';
import { env } from '$env/dynamic/private';

const { Pool } = pg;
const nodeIp = env.UBUNTU_NODE_IP || '192.168.0.12';

// AES-GCM Encryption Configuration
// In production, load this from a secure .env variable
const ENCRYPTION_KEY = env.KYC_MASTER_KEY ? Buffer.from(env.KYC_MASTER_KEY, 'hex') : crypto.randomBytes(32);

const pool = new Pool({
    user: 'postgres',
    host: nodeIp,
    database: 'perennia',
    password: 'password',
    port: 5432,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000,
});

export const POST: RequestHandler = async ({ request }) => {
    let client;
    try {
        const { walletAddress, legalName, entityType, tin, address } = await request.json();

        if (!walletAddress || !legalName || !entityType || !tin || !address) {
            return json({ error: 'Missing mandatory compliance fields.' }, { status: 400 });
        }

        // Cryptographic TIN Encryption (AES-256-GCM)
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
        
        let encryptedTin = cipher.update(tin, 'utf8', 'hex');
        encryptedTin += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        
        // Format: iv:authTag:ciphertext
        const secureTinPayload = `${iv.toString('hex')}:${authTag}:${encryptedTin}`;

        client = await pool.connect();

        // Upsert the KYC Entity Record
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
            [walletAddress, legalName, entityType, secureTinPayload, address]
        );

        return json({ 
            success: true, 
            message: 'Entity verified and cryptographically secured.' 
        });

    } catch (error: any) {
        console.error("KYC Matrix Fault:", error);
        return json({ error: 'DATABASE_FAULT', message: error.message }, { status: 500 });
    } finally {
        if (client) client.release();
    }
};