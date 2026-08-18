import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { redis } from '$lib/server/redis'; 

export const GET: RequestHandler = async ({ cookies }) => {
    const rawCookie = cookies.get('perennia_session');
    
    if (!rawCookie) {
        return json({ error: 'UNAUTHORIZED_MATRIX_ACCESS' }, { status: 401 });
    }

    const sessionCookie = decodeURIComponent(rawCookie);
    const cleanSessionWallet = sessionCookie.toLowerCase().replace(/kaspa:/i, '').trim();

    try {
        const workerKeys = await redis.smembers('pool:workers');
        const workers = [];
        let isolatedHashrate = 0;
        
        for (const fullIdentity of workerKeys) {
            const nameParts = fullIdentity.split('.');
            const rawWalletAddress = nameParts[0];
            const cleanWorkerWallet = rawWalletAddress.toLowerCase().replace(/kaspa:/i, '').trim();
            const workerName = nameParts.length > 1 ? nameParts.slice(1).join('.') : fullIdentity;

            if (cleanWorkerWallet !== cleanSessionWallet && !fullIdentity.toLowerCase().includes(cleanSessionWallet)) {
                continue; 
            }

            const [hashRateStr, blocksStr, sharesStr] = await Promise.all([
                redis.get(`worker:${fullIdentity}:hashrate`),
                redis.get(`worker:${fullIdentity}:blocks`),
                redis.get(`worker:${fullIdentity}:shares`)
            ]);

            const rate = parseFloat(hashRateStr || "0");
            isolatedHashrate += rate;

            workers.push({
                name: workerName,
                walletAddress: rawWalletAddress, 
                fullIdentity: fullIdentity,
                trackingRate: rate,
                blocksFound: parseInt(blocksStr || "0", 10),
                sharesContributed: parseInt(sharesStr || "0", 10)
            });
        }

        return json({ status: "ONLINE", pool: { totalHashrate: isolatedHashrate }, workers: workers });
        
    } catch (error) {
        console.error("Redis Telemetry Fetch Error:", error);
        return json({ error: 'Failed to read node telemetry.', pool: { totalHashrate: 0 }, workers: [] }, { status: 500 });
    }
};