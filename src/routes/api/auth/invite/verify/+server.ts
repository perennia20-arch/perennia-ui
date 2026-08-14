import { json, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';

export const POST = async ({ request }: RequestEvent) => {
    try {
        const { code } = await request.json();
        if (!code) return json({ error: 'ACCESS PROTOCOL REQUIRED' }, { status: 400 });

        const client = await dbPool.connect();
        try {
            const res = await client.query('SELECT * FROM invite_codes WHERE code = $1 AND is_used = false', [code.trim()]);
            if (res.rows.length === 0) {
                return json({ error: 'INVALID OR BURNED PROTOCOL CODE' }, { status: 403 });
            }
            return json({ success: true });
        } finally {
            client.release();
        }
    } catch (e) {
        return json({ error: 'DATABASE ROUTING FAULT' }, { status: 500 });
    }
};