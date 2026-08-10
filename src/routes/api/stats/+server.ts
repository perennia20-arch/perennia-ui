import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { redis } from '$lib/server/redis'; 

const MASTER_ADMIN_ADDRESS = "kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579";
const DEV_ADMIN_BYPASS = false;

export const GET: RequestHandler = async ({ cookies }) => {
    const rawCookie = cookies.get('perennia_session');
    
    if (!rawCookie) {
        return json({ error: 'UNAUTHORIZED_MATRIX_ACCESS' }, { status: 401 });
    }

    // ⚡ FIX: Decode cookie
    const sessionCookie = decodeURIComponent(rawCookie);
    const cleanSessionWallet = sessionCookie.toLowerCase().replace('kaspa:', '');
    const isCorporateAdmin = DEV_ADMIN_BYPASS || sessionCookie.toLowerCase() === MASTER_ADMIN_ADDRESS.toLowerCase();

    try {
        const totalHashrateStr = await redis.get('pool:hashrate');
        const totalHashrate = parseFloat(totalHashrateStr || "0");

        const workerKeys = await redis.smembers('pool:workers');
        const workers = [];
        
        for (const fullIdentity of workerKeys) {
            const nameParts = fullIdentity.split('.');
            const rawWalletAddress = nameParts[0];
            const walletAddress = rawWalletAddress.toLowerCase().replace('kaspa:', '');
            const workerName = nameParts.length > 1 ? nameParts.slice(1).join('.') : fullIdentity;

            if (!isCorporateAdmin && walletAddress !== cleanSessionWallet) {
                continue; 
            }

            const [hashRateStr, blocksStr, sharesStr] = await Promise.all([
                redis.get(`worker:${fullIdentity}:hashrate`),
                redis.get(`worker:${fullIdentity}:blocks`),
                redis.get(`worker:${fullIdentity}:shares`)
            ]);

            workers.push({
                name: workerName,
                walletAddress: rawWalletAddress, 
                fullIdentity: fullIdentity,
                trackingRate: parseFloat(hashRateStr || "0"),
                blocksFound: parseInt(blocksStr || "0", 10),
                sharesContributed: parseInt(sharesStr || "0", 10)
            });
        }

        return json({ status: "ONLINE", pool: { totalHashrate }, workers: workers });
        
    } catch (error) {
        console.error("🚨 Redis Telemetry Fetch Error:", error);
        return json({ error: 'Failed to read node telemetry.', pool: { totalHashrate: 0 }, workers: [] }, { status: 500 });
    }
};