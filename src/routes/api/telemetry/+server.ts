import { json } from '@sveltejs/kit';
import { redis } from '$lib/server/redis'; // ⚡ Leverages the resilient connection pool

export async function GET() {
    try {
        // ⚡ STATELESS FIX: O(1) Fetch utilizing the active multiplexed connection. 
        // Eliminates the TCP port exhaustion that crashes Windows via the createClient loop.
        const rawData = await redis.get('perennia:telemetry');

        if (!rawData) {
            return json({ totalHashrate: 0, workers: [] });
        }

        return json(JSON.parse(rawData));
    } catch (error) {
        console.error("Backend Error:", error);
        return json({ totalHashrate: 0, workers: [], error: 'Telemetry unavailable' }, { status: 500 });
    }
}