import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { redis } from '$lib/server/redis'; 

export const GET: RequestHandler = async () => {
    try {
        const totalHashrateStr = await redis.get('pool:hashrate');
        const totalHashrate = parseFloat(totalHashrateStr || "0");

        const workerKeys = await redis.smembers('pool:workers');
        const workers = [];
        
        for (const fullIdentity of workerKeys) {
            const [hashRateStr, blocksStr, sharesStr] = await Promise.all([
                redis.get(`worker:${fullIdentity}:hashrate`),
                redis.get(`worker:${fullIdentity}:blocks`),
                redis.get(`worker:${fullIdentity}:shares`)
            ]);

            // ⚡ Identity Extraction: kaspa:qxxx.workerName
            const nameParts = fullIdentity.split('.');
            const walletAddress = nameParts[0];
            const workerName = nameParts.length > 1 ? nameParts.slice(1).join('.') : fullIdentity;

            workers.push({
                name: workerName,
                walletAddress: walletAddress,
                fullIdentity: fullIdentity,
                trackingRate: parseFloat(hashRateStr || "0"),
                blocksFound: parseInt(blocksStr || "0", 10),
                sharesContributed: parseInt(sharesStr || "0", 10)
            });
        }

        return json({
            status: "ONLINE",
            pool: { totalHashrate },
            workers: workers
        });
        
    } catch (error) {
        console.error("🚨 Redis Telemetry Fetch Error:", error);
        return json({ error: 'Failed to read node telemetry.', pool: { totalHashrate: 0 }, workers: [] }, { status: 500 });
    }
};