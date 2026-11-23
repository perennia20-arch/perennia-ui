import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { dbPool } from '$lib/server/db';
import {
    isWalletMasterAdmin,
    normalizeKaspaAddressStrict,
    normalizeKaspaBase32Strict
} from '$lib/server/kms';
import {
    ensureCommunityBucketsSchema,
    listCommunityBuckets,
    resolveBucketEscrowAddress
} from '$lib/server/communityBuckets';
import crypto from 'node:crypto';

async function resolveCallerWallet(cookies: RequestEvent['cookies'], locals: any): Promise<string> {
    if (locals?.walletAddress) return String(locals.walletAddress);
    const sid = cookies.get('perennia_session');
    if (!sid) return '';
    return (await redis.get(`session:${sid}`).catch(() => null)) || '';
}

export const GET: RequestHandler = async ({ url, cookies, locals }: RequestEvent) => {
    try {
        const sessionWallet = await resolveCallerWallet(cookies, locals);
        const queryWallet = url.searchParams.get('wallet') || sessionWallet || '';
        const data = await listCommunityBuckets(queryWallet);
        return json({ success: true, ...data });
    } catch (err: any) {
        return json({ error: err?.message || 'Failed to load settlement buckets.' }, { status: 500 });
    }
};

export const POST: RequestHandler = async ({ request, cookies, locals }: RequestEvent) => {
    const callerRaw = await resolveCallerWallet(cookies, locals);
    if (!callerRaw) {
        return json({ error: 'UNAUTHORIZED: Connect and unlock your Sovereign Wallet first.' }, { status: 401 });
    }
    const cleanCaller = normalizeKaspaBase32Strict(callerRaw);
    const prefCaller = normalizeKaspaAddressStrict(cleanCaller);

    try {
        await ensureCommunityBucketsSchema();
        const body = await request.json().catch(() => ({}));
        const action = String(body.action || 'TOGGLE_VISIBILITY').trim().toUpperCase();

        if (action === 'CREATE_BUCKET') {
            const targetAsset = String(body.targetAsset || 'USDC').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
            if (!targetAsset || targetAsset === 'KAS') {
                return json({ error: 'Choose a non-KAS target asset for a Settlement Bucket.' }, { status: 400 });
            }
            const visibility = String(body.visibility || 'PUBLIC').toUpperCase() === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC';
            const targetKas = Math.max(25, Math.min(1_000_000, Number(body.targetKas || 500)));
            const label = String(body.label || `${targetAsset} Community Bucket`).trim().slice(0, 96);
            const bucketId = `BUCKET-${targetAsset}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
            const cycleId = `${bucketId}-CYC-1`;
            const escrow = resolveBucketEscrowAddress();

            await dbPool.query(
                `INSERT INTO settlement_buckets (bucket_id, target_asset, label, creator_wallet, escrow_address, visibility, target_kas)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [bucketId, targetAsset, label, prefCaller, escrow, visibility, targetKas]
            );
            await dbPool.query(
                `INSERT INTO bucket_cycles (cycle_id, bucket_id, cycle_number, target_asset, target_kas, status)
                 VALUES ($1, $2, 1, $3, $4, 'OPEN')`,
                [cycleId, bucketId, targetAsset, targetKas]
            );
            const snapshot = await listCommunityBuckets(prefCaller);
            return json({ success: true, bucketId, visibility, buckets: snapshot.buckets });
        }

        if (action === 'TOGGLE_VISIBILITY' || action === 'SET_VISIBILITY') {
            const bucketId = String(body.bucketId || '').trim();
            const existing = await dbPool.query(
                `SELECT creator_wallet, visibility FROM settlement_buckets WHERE bucket_id = $1 LIMIT 1`,
                [bucketId]
            );
            if (existing.rows.length === 0) {
                return json({ error: 'Bucket not found.' }, { status: 404 });
            }
            const row = existing.rows[0];
            const creatorClean = normalizeKaspaBase32Strict(String(row.creator_wallet || ''));
            const defaultEscrowClean = normalizeKaspaBase32Strict(resolveBucketEscrowAddress());
            const canModify =
                cleanCaller === creatorClean ||
                isWalletMasterAdmin(prefCaller) ||
                false;
            if (!canModify) {
                return json({ error: 'FORBIDDEN: Only the bucket creator may change Public/Private visibility.' }, { status: 403 });
            }
            const nextVis = body.visibility
                ? String(body.visibility).toUpperCase() === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC'
                : String(row.visibility).toUpperCase() === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC';

            await dbPool.query(
                `UPDATE settlement_buckets
                 SET visibility = $2,
                     creator_wallet = CASE WHEN $4 THEN $3 ELSE creator_wallet END,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE bucket_id = $1`,
                [bucketId, nextVis, prefCaller, false]
            );
            const snapshot = await listCommunityBuckets(prefCaller);
            return json({ success: true, bucketId, visibility: nextVis, buckets: snapshot.buckets });
        }

        if (action === 'DELETE_BUCKET' && isWalletMasterAdmin(prefCaller)) {
            const bucketId = String(body.bucketId || '').trim();
            await dbPool.query(
                `DELETE FROM settlement_buckets WHERE bucket_id = $1 AND creator_wallet = $2 AND bucket_id NOT IN ('BUCKET-USDC','BUCKET-BTC','BUCKET-ETH','BUCKET-SOL','BUCKET-SILO')`,
                [bucketId, prefCaller]
            );
            return json({ success: true, deletedBucketId: bucketId });
        }

        return json({ error: `Unsupported bucket action: ${action}` }, { status: 400 });
    } catch (err: any) {
        return json({ error: err?.message || 'Bucket mutation failed.' }, { status: 500 });
    }
};
