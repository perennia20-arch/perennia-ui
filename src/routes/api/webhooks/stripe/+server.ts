import { json, type RequestEvent } from '@sveltejs/kit';
import Stripe from 'stripe';
import { dbPool } from '$lib/server/db';
import { env } from '$env/dynamic/private';

export const POST = async ({ request }: RequestEvent) => {
    const signature = request.headers.get('stripe-signature');
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

    if (!signature || !webhookSecret) {
        return json({ error: 'Missing cryptographic signature or server misconfiguration.' }, { status: 401 });
    }

    if (!env.STRIPE_SECRET_KEY) {
        return json({ error: 'STRIPE_SECRET_KEY is missing in .env file.' }, { status: 500 });
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
        apiVersion: '2023-10-16' as any,
    });

    let event: Stripe.Event;

    try {
        // Stripe strictly requires the raw text body for HMAC verification
        const rawBody = await request.text();
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
        console.error(`Stripe Webhook Signature Verification Failed: ${err.message}`);
        return json({ error: 'Cryptographic mismatch' }, { status: 400 });
    }

    // ⚡ Execute Compliance Ledger Logging on successful settlement
    // Bypass TypeScript's strict enum checking for event.type since Crypto Onramp is in beta
    if ((event as any).type === 'crypto.onramp_session.updated') {
        
        const session = (event as any).data.object;

        if (session.status === 'fulfillment_complete') {
            const walletAddress = session.transaction_details?.wallet_addresses?.kaspa || 'unknown';
            const formattedWallet = walletAddress.startsWith('kaspa:') ? walletAddress : `kaspa:${walletAddress}`;
            
            // Stripe amounts are in minor units (cents). Convert to float.
            const fiatAmount = (session.transaction_details?.source_amount || 0) / 100;
            const cryptoAmountStr = session.transaction_details?.destination_amount || "0";
            const cryptoAmount = parseFloat(cryptoAmountStr);
            const cryptoCurrency = (session.transaction_details?.destination_currency || 'KAS').toUpperCase();

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
                        cryptoAmount > 0 ? fiatAmount / cryptoAmount : 0
                    ]
                );
            } finally {
                if (client) client.release();
            }
        }
    }

    return json({ success: true, message: 'Compliance Webhook Acknowledged' });
};