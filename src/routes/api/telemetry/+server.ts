import { produce } from 'sveltekit-sse';
import { redis } from '$lib/server/redis';

function createStream() {
    return produce(async function start({ emit }) {
        // Clone the connection so it can be dedicated purely to subscription blocking
        const subscriber = redis.duplicate();
        
        subscriber.on('error', (err) => {
            console.error('🔴 SSE Redis Subscriber Error:', err);
        });

        // ⚡ Aligned to match the Rust publisher channel exactly
        await subscriber.subscribe('pool_telemetry');

        subscriber.on('message', (channel, message) => {
            if (channel === 'pool_telemetry') {
                // ⚡ CHANGED: Broadcasting on 'telemetry' to match OperationsView.svelte
                const { error } = emit('telemetry', message);
                if (error) {
                    subscriber.unsubscribe();
                    subscriber.quit();
                }
            }
        });

        return function stop() {
            subscriber.unsubscribe();
            subscriber.quit();
        };
    });
}

// ⚡ Export BOTH methods to completely neutralize 405 routing errors
export const POST = createStream;
export const GET = createStream;