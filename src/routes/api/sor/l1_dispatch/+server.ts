import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
    executeOrQueueL1Dispatch,
    normalizeKaspaBase32
} from '$lib/server/l1Dispatcher';

async function isAuthorizedDispatcherCall(
    request: Request,
    cookies: RequestEvent['cookies']
): Promise<{ authorized: boolean; callerWallet: string }> {
    const providedAuth = request.headers.get('authorization') || '';
    const validCandidates = [
        env.PERENNIA_ADMIN_KEY ? `Bearer ${env.PERENNIA_ADMIN_KEY.trim()}` : '',
        env.INTERNAL_ADMIN_TOKEN ? `Bearer ${env.INTERNAL_ADMIN_TOKEN.trim()}` : ''
    ].filter(Boolean);

    if (providedAuth && validCandidates.length > 0) {
        const providedBuffer = Buffer.from(providedAuth);
        const matched = validCandidates.some((expected) => {
            const expectedBuffer = Buffer.from(expected);
            return (
                expectedBuffer.length === providedBuffer.length &&
                crypto.timingSafeEqual(expectedBuffer, providedBuffer)
            );
        });
        if (matched) {
            return { authorized: true, callerWallet: 'kaspa:internal_daemon' };
        }
    }

    const sessionId = cookies.get('perennia_session');
    if (sessionId) {
        const sessionWallet = await redis.get(`session:${sessionId}`);
        if (sessionWallet) {
            return { authorized: true, callerWallet: sessionWallet };
        }
    }

    return { authorized: false, callerWallet: '' };
}

export const POST: RequestHandler = async ({ request, cookies }: RequestEvent) => {
    const auth = await isAuthorizedDispatcherCall(request, cookies);
    if (!auth.authorized) {
        return json(
            {
                error: 'UNAUTHORIZED: Valid INTERNAL_ADMIN_TOKEN or Sovereign session required.'
            },
            { status: 401 }
        );
    }

    try {
        const body = await request.json().catch(() => ({}));
        const rawWallet = String(body.wallet || auth.callerWallet || '').trim();
        const asset = String(body.asset || body.targetAsset || 'KAS')
            .trim()
            .toUpperCase();
        const amount = Number(body.amount || body.amountTokens || 0);
        const destinationAddress = String(
            body.destination ||
                body.destinationAddress ||
                body.payoutAddress ||
                rawWallet
        ).trim();
        const sourceType = String(body.sourceType || 'ledger_withdrawal').trim();
        const spotPrice = Number(body.spotPrice || 0);

        if (!rawWallet || !destinationAddress || !Number.isFinite(amount) || amount <= 0) {
            return json(
                {
                    error: 'INVALID_DISPATCH_PAYLOAD: wallet, destinationAddress, and positive amount are required.'
                },
                { status: 400 }
            );
        }

        if (
            auth.callerWallet !== 'kaspa:internal_daemon' &&
            normalizeKaspaBase32(auth.callerWallet) !== normalizeKaspaBase32(rawWallet)
        ) {
            return json(
                { error: 'FORBIDDEN: Cannot dispatch L1 payout for another wallet.' },
                { status: 403 }
            );
        }

        const result = await executeOrQueueL1Dispatch({
            wallet: rawWallet,
            destinationAddress,
            asset,
            amount,
            sourceType,
            spotPrice: spotPrice > 0 ? spotPrice : undefined
        });

        return json(result, { status: 200 });
    } catch (err: any) {
        console.error('🚨 [L1 DISPATCHER FAULT]:', err);
        const message = err?.message || 'Multi-chain L1 settlement dispatch failed.';
        const status =
            message.includes('ORACLE_HALT') ||
            message.includes('CIRCUIT_BREAKER_TRIPPED') ||
            message.includes('CRITICAL_SECURITY_LOCKDOWN')
                ? 503
                : message.includes('WALLET_QUARANTINED') ||
                    message.includes('SOLVENCY_INVARIANT_VIOLATION') ||
                    message.includes('LEDGER_HMAC_VIOLATION')
                  ? 403
                  : 500;
        return json({ error: message }, { status });
    }
};