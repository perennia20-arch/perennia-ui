import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const MASTER_ADMIN_ADDRESS =
    'kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579';

function normalizeKaspaBase32(addr: string): string {
    return addr.trim().toLowerCase().replace(/^kaspa:/i, '').trim();
}

async function isAuthorizedDirector(
    request: Request,
    cookies: RequestEvent['cookies']
): Promise<boolean> {
    const authHeader = request.headers.get('authorization') || '';
    if (env.PERENNIA_ADMIN_KEY && authHeader.startsWith('Bearer ')) {
        const expected = Buffer.from(`Bearer ${env.PERENNIA_ADMIN_KEY}`);
        const provided = Buffer.from(authHeader);
        if (
            expected.length === provided.length &&
            crypto.timingSafeEqual(expected, provided)
        ) {
            return true;
        }
    }

    const sessionId = cookies.get('perennia_session');
    if (!sessionId) return false;

    const sessionWallet = await redis.get(`session:${sessionId}`);
    if (!sessionWallet) return false;

    const cleanSession = normalizeKaspaBase32(sessionWallet);
    const cleanMaster = normalizeKaspaBase32(
        env.MASTER_ADMIN_ADDRESS || MASTER_ADMIN_ADDRESS
    );

    return cleanSession === cleanMaster;
}

export const GET: RequestHandler = async ({ request, cookies }: RequestEvent) => {
    const authorized = await isAuthorizedDirector(request, cookies);
    if (!authorized) {
        return json(
            { error: 'FORBIDDEN: Master Director clearance required.' },
            { status: 403 }
        );
    }

    try {
        const boundAddress = await redis.get('perennia:stratum:mining_address');
        return json({
            kaspaAddress:
                boundAddress ||
                env.PERENNIA_TREASURY_KAS_ADDRESS ||
                MASTER_ADMIN_ADDRESS
        });
    } catch {
        return json(
            { error: 'STRATUM REDIS ERROR: CANNOT READ MINING ADDRESS' },
            { status: 500 }
        );
    }
};

export const POST: RequestHandler = async ({ request, cookies }: RequestEvent) => {
    const authorized = await isAuthorizedDirector(request, cookies);
    if (!authorized) {
        return json(
            {
                error: 'FORBIDDEN: Only the Master Director may rebind the Stratum coinbase address.'
            },
            { status: 403 }
        );
    }

    try {
        const body = await request.json();
        const { kaspaAddress } = body;

        if (!kaspaAddress || typeof kaspaAddress !== 'string') {
            return json({ error: 'INVALID PAYLOAD: MISSING ADDRESS' }, { status: 400 });
        }

        const cleanAddress = kaspaAddress.trim().toLowerCase();
        if (!cleanAddress.startsWith('kaspa:')) {
            return json(
                { error: 'INVALID FORMAT: MISSING "kaspa:" PREFIX' },
                { status: 400 }
            );
        }
        if (cleanAddress.length < 60) {
            return json(
                { error: 'INVALID FORMAT: ADDRESS LENGTH INCORRECT' },
                { status: 400 }
            );
        }

        try {
            await redis.set('perennia:stratum:mining_address', cleanAddress);
        } catch (redisErr) {
            console.warn('Redis unreachable for stratum bind', redisErr);
            return json(
                { error: 'STRATUM REDIS ERROR: CANNOT BIND MINING ADDRESS' },
                { status: 500 }
            );
        }

        return json(
            {
                success: true,
                kaspaAddress: cleanAddress,
                message: 'STRATUM SUCCESSFULLY BOUND'
            },
            { status: 200 }
        );
    } catch (err: any) {
        console.error('Stratum Binding API Error:', err);
        return json(
            { error: 'CRITICAL BACKEND FAULT. STRATUM OFFLINE.' },
            { status: 500 }
        );
    }
};