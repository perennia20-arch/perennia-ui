import { json, type RequestEvent } from '@sveltejs/kit';
import crypto from 'crypto';
import { Buffer } from 'buffer';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';

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
        if (!secret) {
            return json(
                { error: 'Server misconfiguration: Webhook secret absent.' },
                { status: 500 }
            );
        }

        const parts = token.split('.');
        if (parts.length !== 3) {
            return json({ error: 'Invalid JWT structure' }, { status: 400 });
        }

        const [headerB64, payloadB64, signatureB64] = parts;
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(`${headerB64}.${payloadB64}`);
        const expectedSignature = hmac
            .digest('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const expectedBuffer = Buffer.from(expectedSignature);
        const providedBuffer = Buffer.from(signatureB64);

        if (
            expectedBuffer.length !== providedBuffer.length ||
            !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
        ) {
            return json(
                { error: 'Cryptographic signature mismatch. Payload rejected.' },
                { status: 401 }
            );
        }

        const payloadStr = decodeBase64Url(payloadB64);
        const claims = JSON.parse(payloadStr);
        const { eventID, webhookData } = claims;

        const partnerOrderId = String(webhookData?.partnerOrderId || '').trim();
        const rawWallet = String(webhookData?.walletAddress || 'unknown').trim();
        const cleanWallet = rawWallet.toLowerCase().replace(/^kaspa:/i, '').trim();
        const formattedWallet = `kaspa:${cleanWallet}`;
        const fiatAmount = Number(webhookData?.fiatAmount || 0);
        const cryptoAmount = Number(webhookData?.cryptoAmount || 0);
        const cryptoCurrency = String(webhookData?.cryptoCurrency || 'KAS').toUpperCase();
        const txHash = String(
            webhookData?.transactionHash || webhookData?.id || partnerOrderId
        );

        const rawEventIdentifier = String(
            webhookData?.id || partnerOrderId || txHash || crypto.createHash('sha256').update(payloadStr).digest('hex')
        ).trim();
        const dedupeEventId = `transak:${eventID || 'EVENT'}:${rawEventIdentifier}:${webhookData?.status || 'STATUS'}`;
        const idempotencyKey = `perennia:webhook:processed:${dedupeEventId}`;

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
                message: 'Webhook event already processed'
            });
        }

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
                status: eventID === 'ORDER_COMPLETED' ? 'COMPLETED' : String(eventID || 'PROCESSING'),
                updatedAt: new Date().toISOString()
            };
            await redis.set(sessionKey, JSON.stringify(updatedSession), 'EX', 3600 * 24);
        }

        if (eventID === 'ORDER_COMPLETED') {
            const fulfillDedupeId = partnerOrderId || txHash || rawEventIdentifier;
            const fulfillLockKey = `perennia:webhook:processed:transak_fulfill:${fulfillDedupeId}`;
            const fulfillLock = await redis.set(
                fulfillLockKey,
                new Date().toISOString(),
                'EX',
                60 * 60 * 24 * 30,
                'NX'
            );
            if (!fulfillLock) {
                return json({
                    success: true,
                    idempotentReplay: true,
                    message: 'Order completion already credited'
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

        return json({ success: true, message: 'Webhook processed successfully' });
    } catch (e: any) {
        console.error('Transak Webhook Fault:', e);
        return json(
            { error: 'Internal routing error', details: e.message },
            { status: 500 }
        );
    }
};