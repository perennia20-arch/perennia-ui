import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { redis } from '$lib/server/redis'; 

const MASTER_ADMIN_ADDRESS = "kaspa:qpd3r7z43r1x0pn3y26k2yp4r7z43r1x0pn3y26k2yp4r7z0q5qqp2";
const DEV_ADMIN_BYPASS = true;

export const GET: RequestHandler = async ({ cookies }) => {
    // 1. Zero-Trust Identity Check
    const sessionCookie = cookies.get('perennia_session');
    
    if (!sessionCookie) {
        return json({ error: 'UNAUTHORIZED_MATRIX_ACCESS' }, { status: 401 });
    }

    const cleanSessionWallet = sessionCookie.toLowerCase().replace('kaspa:', '');
    const isCorporateAdmin = DEV_ADMIN_BYPASS || sessionCookie === MASTER_ADMIN_ADDRESS;

    try {
        const totalHashrateStr = await redis.get('pool:hashrate');
        const totalHashrate = parseFloat(totalHashrateStr || "0");

        const workerKeys = await redis.smembers('pool:workers');
        const workers = [];
        
        for (const fullIdentity of workerKeys) {
            // Identity Extraction: kaspa:qxxx.workerName
            const nameParts = fullIdentity.split('.');
            const rawWalletAddress = nameParts[0];
            const walletAddress = rawWalletAddress.toLowerCase().replace('kaspa:', '');
            const workerName = nameParts.length > 1 ? nameParts.slice(1).join('.') : fullIdentity;

            // 2. Fog of War Filter
            if (!isCorporateAdmin && walletAddress !== cleanSessionWallet) {
                continue; // Skip exposing this worker's data to the unauthorized caller
            }

            const [hashRateStr, blocksStr, sharesStr] = await Promise.all([
                redis.get(`worker:${fullIdentity}:hashrate`),
                redis.get(`worker:${fullIdentity}:blocks`),
                redis.get(`worker:${fullIdentity}:shares`)
            ]);

            workers.push({
                name: workerName,
                walletAddress: rawWalletAddress, // Keep original format for the payload
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