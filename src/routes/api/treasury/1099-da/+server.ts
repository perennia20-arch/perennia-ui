import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import pg from 'pg';
import { env } from '$env/dynamic/private';

const { Pool } = pg;
const nodeIp = env.UBUNTU_NODE_IP || '192.168.0.12';

// BARE-METAL POSTGRES CONNECTION
const pool = new Pool({
    user: 'postgres',
    host: nodeIp,
    database: 'perennia',
    password: 'password', // Adjust to match bare-metal prod configuration
    port: 5432,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000,
});

export const POST: RequestHandler = async ({ request }) => {
    let client;
    try {
        const { walletAddress, taxYear = new Date().getFullYear() } = await request.json();

        if (!walletAddress) {
            return json({ error: 'Wallet Address Required' }, { status: 400 });
        }

        client = await pool.connect();

        // 1. Verify KYC & Entity Resolution Status
        const kycRes = await client.query(
            `SELECT * FROM entity_kyc WHERE wallet_address = $1 AND verification_status = 'verified'`,
            [walletAddress]
        );

        if (kycRes.rows.length === 0) {
            return json({ 
                error: 'KYC_NOT_VERIFIED', 
                message: 'Entity has not cleared the 1099-DA KYC pipeline.' 
            }, { status: 403 });
        }

        const kycProfile = kycRes.rows[0];

        // 2. Aggregate Gross Proceeds for the target Tax Year
        const proceedsRes = await client.query(
            `SELECT 
                SUM(gross_proceeds_usd) as total_gross_proceeds,
                SUM(amount_tokens) as total_kas_yielded
             FROM tax_ledger_events 
             WHERE wallet_address = $1 
             AND event_type = 'YIELD' 
             AND EXTRACT(YEAR FROM recorded_at) = $2`,
            [walletAddress, taxYear]
        );

        const totals = proceedsRes.rows[0];
        const totalGross = parseFloat(totals.total_gross_proceeds || '0');
        const totalKas = parseFloat(totals.total_kas_yielded || '0');

        // 3. Compile the U.S. Broker Regulatory Payload
        const pdfPayload = {
            formType: "1099-DA",
            taxYear,
            payer: {
                name: "Perennia Holdings, LLC",
                address: "Secure On-Chain Facility"
            },
            recipient: {
                name: kycProfile.legal_name,
                tinHash: kycProfile.tax_id_hash,
                address: kycProfile.business_address
            },
            financials: {
                grossProceeds: totalGross,
                costBasis: 0.00, // Voluntary tracking field
                asset: "Kaspa (KAS)",
                volume: totalKas
            },
            timestamp: new Date().toISOString()
        };

        return json({ 
            success: true, 
            message: '1099-DA Compiled Successfully',
            documentData: pdfPayload 
        });

    } catch (error: any) {
        console.error("1099-DA Compilation Fault:", error);
        return json({ error: 'COMPILATION_FAULT', message: error.message }, { status: 500 });
    } finally {
        if (client) client.release();
    }
};