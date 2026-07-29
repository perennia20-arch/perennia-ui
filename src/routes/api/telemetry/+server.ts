import { produce } from 'sveltekit-sse';
import { redis } from '$lib/server/redis';

export function GET() {
    return produce(async function start({ emit }) {
        // Clone the connection so it can be dedicated purely to subscription blocking
        const subscriber = redis.duplicate();
        
        subscriber.on('error', (err) => {
            console.error('🔴 SSE Redis Subscriber Error:', err);
        });

        await subscriber.subscribe('telemetry:updates');

        subscriber.on('message', (channel, message) => {
            if (channel === 'telemetry:updates') {
                const { error } = emit('message', message);
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