import { json, type RequestEvent } from '@sveltejs/kit';
import crypto from 'crypto';
import { Buffer } from 'buffer';
import { dbPool } from '$lib/server/db';
import { env } from '$env/dynamic/private';

// Helper to safely Base64URL decode without external dependencies
function decodeBase64Url(str: string) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return Buffer.from(str, 'base64').toString('utf-8');
}

export const POST = async ({ request }: RequestEvent) => {
    try {
        const body = await request.json();
        
        if (!body || !body.data) {
            return json({ error: 'Missing webhook payload' }, { status: 400 });
        }

        const token = body.data;
        const secret = env.TRANSAK_API_SECRET;

        // Strict Configuration Enforcement
        if (!secret) {
            return json({ error: 'Server misconfiguration: Webhook secret absent.' }, { status: 500 });
        }

        // 1. Zero-Dependency JWT Signature Verification (HS256)
        const parts = token.split('.');
        if (parts.length !== 3) {
            return json({ error: 'Invalid JWT structure' }, { status: 400 });
        }

        const [headerB64, payloadB64, signatureB64] = parts;
        
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(`${headerB64}.${payloadB64}`);
        const expectedSignature = hmac.digest('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        // Cryptographic execution lock
        if (signatureB64 !== expectedSignature) {
            return json({ error: 'Cryptographic signature mismatch. Payload rejected.' }, { status: 401 });
        }

        // 2. Decode the Verified Payload
        const payloadStr = decodeBase64Url(payloadB64);
        const claims = JSON.parse(payloadStr);
        const { eventID, webhookData } = claims;

        // 3. Process the Event (Establish Tax Cost Basis)
        if (eventID === 'ORDER_COMPLETED') {
            const walletAddress = webhookData.walletAddress;
            const fiatAmount = webhookData.fiatAmount;
            const cryptoAmount = webhookData.cryptoAmount;
            const cryptoCurrency = webhookData.cryptoCurrency;
            
            const formattedWallet = walletAddress.startsWith('kaspa:') ? walletAddress : `kaspa:${walletAddress}`;

            let client;
            try {
                client = await dbPool.connect();
                await client.query(
                    `INSERT INTO tax_ledger_events 
                    (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution)
                    VALUES ($1, $2, 'FIAT_ONRAMP', $3, $4, $5)`,
                    [
                        formattedWallet.toLowerCase(),
                        cryptoCurrency,
                        fiatAmount,
                        cryptoAmount,
                        fiatAmount / cryptoAmount
                    ]
                );
            } finally {
                if (client) client.release();
            }
        }

        return json({ success: true, message: 'Webhook processed successfully' });

    } catch (e: any) {
        console.error("Transak Webhook Fault:", e);
        return json({ error: 'Internal routing error', details: e.message }, { status: 500 });
    }
};