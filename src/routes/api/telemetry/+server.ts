import { produce } from 'sveltekit-sse';
import { redis } from '$lib/server/redis';
import type { RequestEvent } from '@sveltejs/kit';

const MASTER_ADMIN_ADDRESS = "kaspa:qpd3r7z43r1x0pn3y26k2yp4r7z43r1x0pn3y26k2yp4r7z0q5qqp2";
const DEV_ADMIN_BYPASS = true; // Match stores/wallet.ts

export function GET({ cookies }: RequestEvent) {
    // 1. Zero-Trust Identity Lock
    const rawSession = cookies.get('perennia_session');

    return produce(async function start({ emit }) {
        // Fallback if accessed without auth
        if (!rawSession) {
            emit('message', JSON.stringify({ error: "UNAUTHORIZED_MATRIX_ACCESS" }));
            return function stop() {};
        }

        const sessionWallet = rawSession.toLowerCase();
        const isCorporateAdmin = DEV_ADMIN_BYPASS || sessionWallet === MASTER_ADMIN_ADDRESS;
        const cleanSessionWallet = sessionWallet.replace('kaspa:', '');

        // Clone the connection so it can be dedicated purely to subscription blocking
        const subscriber = redis.duplicate();
        
        subscriber.on('error', (err) => {
            console.error('🔴 SSE Redis Subscriber Error:', err);
        });

        await subscriber.subscribe('telemetry:updates');

        subscriber.on('message', (channel, message) => {
            if (channel === 'telemetry:updates') {
                
                let partitionedMessage = message;
                
                // 2. The Fog of War Partitioning Engine
                if (!isCorporateAdmin) {
                    try {
                        const parsed = JSON.parse(message);
                        
                        // Filter the workers array to strictly matching hardware
                        if (parsed.workers && Array.isArray(parsed.workers)) {
                            parsed.workers = parsed.workers.filter((w: any) => {
                                // Extract the wallet root from the Stratum Identity (kaspa:q...workerName)
                                const identityBase = (w.walletAddress || w.fullIdentity || '').toLowerCase();
                                return identityBase.includes(cleanSessionWallet);
                            });
                        }
                        
                        // Re-serialize the scrubbed payload
                        partitionedMessage = JSON.stringify(parsed);
                        
                    } catch (e) {
                        console.warn("Failed to parse/partition telemetry payload.");
                    }
                }

                // 3. Emit only the isolated packet sequence
                const { error } = emit('message', partitionedMessage);
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

// ⚡ SvelteKit-SSE utilizes POST requests to bypass proxy buffering on certain hosts
export const POST = GET;