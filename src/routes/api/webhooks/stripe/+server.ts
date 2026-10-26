import { json, type RequestEvent } from '@sveltejs/kit';
import Stripe from 'stripe';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';

export const POST = async ({ request }: RequestEvent) => {
    const signature = request.headers.get('stripe-signature');
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
    if (!signature || !webhookSecret) {
        return json(
            { error: 'Missing cryptographic signature or server misconfiguration.' },
            { status: 401 }
        );
    }
    if (!env.STRIPE_SECRET_KEY) {
        return json(
            { error: 'STRIPE_SECRET_KEY is missing in .env file.' },
            { status: 500 }
        );
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
        apiVersion: '2023-10-16' as any
    });

    let event: Stripe.Event;
    try {
        const rawBody = await request.text();
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
        console.error(`Stripe Webhook Signature Verification Failed: ${err.message}`);
        return json({ error: 'Cryptographic mismatch' }, { status: 400 });
    }

    const eventId = String(
        event.id ||
            `${(event as any).type}:${(event as any).data?.object?.id || 'unknown'}:${(event as any).data?.object?.status || 'unknown'}`
    ).trim();

    if (eventId) {
        const idempotencyKey = `perennia:webhook:processed:${eventId}`;
        const lockAcquired = await redis.set(
            idempotencyKey,
            new Date().toISOString(),
            'EX',
            60 * 60 * 24 * 7,
            'NX'
        );
        if (!lockAcquired) {
            return json({
                success: true,
                idempotentReplay: true,
                message: 'Webhook event already processed.'
            });
        }
    }

    if ((event as any).type === 'crypto.onramp_session.updated') {
        const session = (event as any).data.object;
        const partnerOrderId = String(
            session.metadata?.partner_order_id || session.id || ''
        ).trim();
        const walletAddress =
            session.transaction_details?.wallet_addresses?.kaspa ||
            session.metadata?.wallet_address ||
            'unknown';
        const cleanWallet = String(walletAddress)
            .toLowerCase()
            .replace(/^kaspa:/i, '')
            .trim();
        const formattedWallet = `kaspa:${cleanWallet}`;
        const fiatAmount = (session.transaction_details?.source_amount || 0) / 100;
        const cryptoAmountStr =
            session.transaction_details?.destination_amount || '0';
        const cryptoAmount = parseFloat(cryptoAmountStr);
        const cryptoCurrency = (
            session.transaction_details?.destination_currency || 'KAS'
        ).toUpperCase();
        const txHash =
            session.transaction_details?.transaction_id || session.id || partnerOrderId;

        if (partnerOrderId) {
            const sessionKey = `perennia:fiat:onramp_session:${partnerOrderId}`;
            const existingRaw = await redis.get(sessionKey);
            const existingSession = existingRaw ? JSON.parse(existingRaw) : {};
            const updatedSession = {
                ...existingSession,
                sessionId: partnerOrderId,
                walletAddress: formattedWallet,
                fiatAmountUsd: fiatAmount || existingSession.fiatAmountUsd || 0,
                deliveredKas: cryptoAmount || existingSession.estimatedKas || 0,
                txHash,
                status:
                    session.status === 'fulfillment_complete'
                        ? 'COMPLETED'
                        : String(session.status || 'PROCESSING').toUpperCase(),
                updatedAt: new Date().toISOString()
            };
            await redis.set(sessionKey, JSON.stringify(updatedSession), 'EX', 3600 * 24);
        }

        if (session.status === 'fulfillment_complete') {
            const fulfillmentDedupeId = partnerOrderId || txHash || eventId;
            const fulfillmentLockKey = `perennia:webhook:processed:stripe_fulfill:${fulfillmentDedupeId}`;
            const fulfillmentLock = await redis.set(
                fulfillmentLockKey,
                new Date().toISOString(),
                'EX',
                60 * 60 * 24 * 30,
                'NX'
            );
            if (!fulfillmentLock) {
                return json({
                    success: true,
                    idempotentReplay: true,
                    message: 'Fulfillment already credited.'
                });
            }

            const executionSpot =
                cryptoAmount > 0 ? fiatAmount / cryptoAmount : 0;
            let client;
            try {
                client = await dbPool.connect();
                await client.query(
                    `INSERT INTO tax_ledger_events
                    (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution)
                    VALUES ($1, $2, 'FIAT_ONRAMP', $3, $4, $5)`,
                    [
                        cleanWallet,
                        cryptoCurrency,
                        fiatAmount,
                        cryptoAmount,
                        executionSpot
                    ]
                );
            } finally {
                if (client) client.release();
            }

            await redis.publish(
                'telemetry:updates',
                JSON.stringify({
                    fiat_event: true,
                    eventType: 'FIAT_ONRAMP',
                    status: 'COMPLETED',
                    wallet: cleanWallet,
                    sessionId: partnerOrderId || txHash,
                    assetTicker: cryptoCurrency,
                    amountTokens: cryptoAmount,
                    fiatAmountUsd: fiatAmount,
                    spotPrice: executionSpot,
                    txHash
                })
            );
        }
    }

    return json({ success: true, message: 'Compliance Webhook Acknowledged' });
};