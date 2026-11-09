import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import crypto from 'node:crypto';

const INVITE_COOKIE_NAME = 'perennia_beta_invite';
const INVITE_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

async function ensureInviteCodesTable(): Promise<void> {
    await dbPool.query(`
        CREATE TABLE IF NOT EXISTS invite_codes (
            code VARCHAR(64) PRIMARY KEY,
            is_used BOOLEAN NOT NULL DEFAULT FALSE,
            used_by VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `);
}

export const GET: RequestHandler = async ({ cookies }: RequestEvent) => {
    const inviteToken = cookies.get(INVITE_COOKIE_NAME);
    const sessionId = cookies.get('perennia_session');

    if (sessionId) {
        const sessionWallet = await redis.get(`session:${sessionId}`).catch(() => null);
        if (sessionWallet) {
            return json({ verified: true, source: 'session' });
        }
    }

    if (inviteToken) {
        const storedCode = await redis.get(`beta_invite:${inviteToken}`).catch(() => null);
        if (storedCode) {
            return json({ verified: true, source: 'invite_cookie' });
        }
    }

    return json({ verified: false }, { status: 200 });
};

export const POST: RequestHandler = async ({ request, cookies }: RequestEvent) => {
    try {
        const body = await request.json().catch(() => ({}));
        const rawCode = String(body.code || '').trim();
        if (!rawCode) {
            return json({ error: 'ACCESS PROTOCOL REQUIRED' }, { status: 400 });
        }

        await ensureInviteCodesTable().catch(() => {});

        const configuredMasterCode = String(env.MASTER_BETA_INVITE_CODE || '').trim();
        const isMasterCode =
            configuredMasterCode.length >= 6 &&
            rawCode.toUpperCase() === configuredMasterCode.toUpperCase();

        if (!isMasterCode) {
            const client = await dbPool.connect();
            try {
                const res = await client.query(
                    'SELECT code, is_used FROM invite_codes WHERE UPPER(code) = UPPER($1) AND is_used = false LIMIT 1',
                    [rawCode]
                );
                if (res.rows.length === 0) {
                    return json(
                        { error: 'INVALID OR BURNED PROTOCOL CODE' },
                        { status: 403 }
                    );
                }
            } finally {
                client.release();
            }
        }

        const inviteToken = crypto.randomBytes(24).toString('hex');
        await redis.set(
            `beta_invite:${inviteToken}`,
            rawCode.toUpperCase(),
            'EX',
            INVITE_TTL_SECONDS
        );

        cookies.set(INVITE_COOKIE_NAME, inviteToken, {
            path: '/',
            httpOnly: true,
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production',
            maxAge: INVITE_TTL_SECONDS
        });

        return json({
            success: true,
            verified: true
        });
    } catch (e) {
        console.error('Invite Verification Fault:', e);
        return json({ error: 'DATABASE ROUTING FAULT' }, { status: 500 });
    }
};