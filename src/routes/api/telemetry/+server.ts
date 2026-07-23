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

        // ⚡ BRUTAL EFFICIENCY: Stream raw string byte-for-byte directly to bypass Node.js JSON parsing overhead.
        return new Response(rawData, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate'
            }
        });
    } catch (error) {
        console.error("Backend Error:", error);
        return json({ totalHashrate: 0, workers: [], error: 'Telemetry unavailable' }, { status: 500 });
    }
}