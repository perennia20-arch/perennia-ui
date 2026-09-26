import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { dbPool } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import Stripe from 'stripe';

// Ensure Stripe is initialized securely
const stripe = new Stripe(env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2023-10-16' as any,
});

const rawKeyString = env.KYC_MASTER_KEY || '12345678901234567890123456789012';
const ENCRYPTION_KEY = Buffer.from(rawKeyString).length === 32 ? Buffer.from(rawKeyString) : crypto.createHash('sha256').update(String(rawKeyString)).digest();

// POST: Initiates or Completes the KYC Pipeline
export const POST: RequestHandler = async ({ request, url }) => {
    let client;
    try {
        const payload = await request.json();
        const { walletAddress, entityType, tin, address, verificationSessionId } = payload;

        if (!walletAddress) {
            return json({ error: 'Missing mandatory compliance fields.' }, { status: 400 });
        }

        const formattedWallet = walletAddress.toLowerCase().startsWith('kaspa:') ? walletAddress.toLowerCase() : `kaspa:${walletAddress.toLowerCase()}`;

        // ====================================================================
        // PHASE 1: STRIPE IDENTITY VERIFICATION INITIALIZATION
        // ====================================================================
        if (!verificationSessionId && !tin) {
            // Generate a Stripe Identity session for the user to upload their Govt ID
            const verificationSession = await stripe.identity.verificationSessions.create({
                type: 'document',
                metadata: {
                    wallet_address: formattedWallet,
                    entity_type: entityType || 'Individual'
                }
            });

            return json({ 
                success: true, 
                requiresAction: true,
                clientSecret: verificationSession.client_secret,
                sessionId: verificationSession.id
            });
        }

        // ====================================================================
        // PHASE 2: COMPLIANCE FINALIZATION & AES-256-GCM WAL ENCRYPTION
        // ====================================================================
        if (!verificationSessionId || !tin || !entityType || !address) {
            return json({ error: 'Missing completion data payload.' }, { status: 400 });
        }

        // 1. Verify the Stripe Identity session actually succeeded
        const session = await stripe.identity.verificationSessions.retrieve(verificationSessionId);
        
        if (session.status !== 'verified') {
            return json({ error: 'Identity verification not successfully completed with provider.' }, { status: 403 });
        }

        // 2. Extract the mathematically verified Legal Name directly from the Govt ID
        // This prevents the user from typing a fake name in the UI.
        let legalName = 'Verified Entity';
        if (session.verified_outputs && session.verified_outputs.first_name && session.verified_outputs.last_name) {
            legalName = `${session.verified_outputs.first_name} ${session.verified_outputs.last_name}`;
        }

        // 3. Encrypt the highly sensitive TIN/SSN via AES-256-GCM before database insertion
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
        
        let encryptedTin = cipher.update(tin, 'utf8', 'hex');
        encryptedTin += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        
        const secureTinPayload = `${iv.toString('hex')}:${authTag}:${encryptedTin}`;

        client = await dbPool.connect();

        // 4. Lock the Verified Entity into the Postgres Master WAL
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
        return json({ error: 'COMPLIANCE_FAULT', message: error.message }, { status: 500 });
    } finally {
        if (client) client.release();
    }
};

// GET: Decrypts and retrieves the active user's KYC profile
export const GET: RequestHandler = async ({ cookies }) => {
    const rawCookie = cookies.get('perennia_session');
    
    if (!rawCookie) {
        return json({ error: 'Unauthorized matrix access' }, { status: 401 });
    }

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
        
        // Decrypt the TIN for the UI masking
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