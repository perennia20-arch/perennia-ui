import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { recordManualBucketContribution } from '$lib/server/communityBuckets';

export const POST: RequestHandler = async ({ request, cookies, locals }: RequestEvent) => {
    let sessionWallet = (locals as any)?.walletAddress || '';
    if (!sessionWallet) {
        const sid = cookies.get('perennia_session');
        if (sid) sessionWallet = (await redis.get(`session:${sid}`).catch(() => null)) || '';
    }
    if (!sessionWallet) {
        return json({ error: 'UNAUTHORIZED: Unlock your Sovereign Wallet to contribute KAS.' }, { status: 401 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const bucketId = String(body.bucketId || '').trim();
        const mode = String(body.mode || 'contribute').toLowerCase() === 'fill_remainder'
            ? 'fill_remainder'
            : 'contribute';
        const amountKas = Number(body.amountKas || 0);
        const txHash = String(body.txHash || '').trim();
        if (!bucketId || !txHash) {
            return json({ error: 'bucketId and signed L1 txHash are required.' }, { status: 400 });
        }
        const isSandboxRequest = request.headers.get('x-perennia-sandbox') === 'true';
        const result = await recordManualBucketContribution({
            bucketId,
            contributorWallet: sessionWallet,
            requestedAmountKas: amountKas,
            mode,
            txHash,
            isSandboxRequest
        });
        return json(result);
    } catch (err: any) {
        const msg = String(err?.message || 'Contribution failed.');
        const status = msg.startsWith('FORBIDDEN')
            ? 403
            : msg.startsWith('BUCKET_NOT_FOUND')
              ? 404
              : 400;
        return json({ error: msg }, { status });
    }
};
