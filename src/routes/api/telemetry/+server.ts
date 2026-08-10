import { produce } from 'sveltekit-sse';
import { redis } from '$lib/server/redis';
import type { RequestEvent } from '@sveltejs/kit';

const MASTER_ADMIN_ADDRESS = "kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579";
const DEV_ADMIN_BYPASS = false; 

export function GET({ cookies, url }: RequestEvent) {
    // 1. Zero-Trust Identity Lock - Support Cookie OR URL Param (Fixes the Async Race Condition)
    let rawCookie = cookies.get('perennia_session');
    if (!rawCookie) {
        rawCookie = url.searchParams.get('address');
    }

    return produce(async function start({ emit }) {
        if (!rawCookie) {
            emit('message', JSON.stringify({ error: "UNAUTHORIZED_MATRIX_ACCESS" }));
            return function stop() {};
        }

        const rawSession = decodeURIComponent(rawCookie);
        const sessionWallet = rawSession.toLowerCase().trim();
        
        const isCorporateAdmin = DEV_ADMIN_BYPASS || sessionWallet === MASTER_ADMIN_ADDRESS.toLowerCase();
        const cleanSessionWallet = sessionWallet.replace('kaspa:', '').trim();

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
                        
                        if (parsed.workers && Array.isArray(parsed.workers)) {
                            let isolatedHashrate = 0;
                            
                            // Scrub unowned hardware from the payload
                            parsed.workers = parsed.workers.filter((w: any) => {
                                const identityBase = (w.walletAddress || w.fullIdentity || '').toLowerCase();
                                if (identityBase.includes(cleanSessionWallet)) {
                                    isolatedHashrate += (w.trackingRate || w.hashrate || w.hashRate || 0);
                                    return true;
                                }
                                return false;
                            });

                            // ⚡ UPGRADE: Rewrite the total hashrate so the user only sees their own physical equipment's hash output
                            if (parsed.pool) {
                                parsed.pool.totalHashrate = isolatedHashrate;
                            } else {
                                parsed.totalHashrate = isolatedHashrate;
                            }
                        }
                        
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