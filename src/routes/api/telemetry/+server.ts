import { produce } from 'sveltekit-sse';
import { redis } from '$lib/server/redis';
import type { RequestEvent } from '@sveltejs/kit';

const MASTER_ADMIN_ADDRESS = "kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579";

export function GET({ cookies, url }: RequestEvent) {
    let rawCookie = cookies.get('perennia_session');
    if (!rawCookie) {
        rawCookie = url.searchParams.get('address') ?? undefined;
    }

    return produce(async function start({ emit }) {
        if (!rawCookie) {
            emit('message', JSON.stringify({ error: "UNAUTHORIZED_MATRIX_ACCESS" }));
            return function stop() {};
        }

        const rawSession = decodeURIComponent(rawCookie);
        const sessionWallet = rawSession.toLowerCase().trim();
        
        const isCorporateAdmin = sessionWallet === MASTER_ADMIN_ADDRESS.toLowerCase();
        const cleanSessionWallet = sessionWallet.replace('kaspa:', '').trim();

        const subscriber = redis.duplicate();
        
        subscriber.on('error', (err) => {
            console.error('🔴 SSE Redis Subscriber Error:', err);
        });

        await subscriber.subscribe('telemetry:updates');

        subscriber.on('message', (channel, message) => {
            if (channel === 'telemetry:updates') {
                
                let partitionedMessage = message;
                
                try {
                    const parsed = JSON.parse(message);

                    // Svelte Layout State Matrix Override
                    if (parsed.layout_state_update) {
                        if (parsed.wallet === cleanSessionWallet || isCorporateAdmin) {
                            const { error } = emit('message', message);
                            if (error) { subscriber.unsubscribe(); subscriber.quit(); }
                        }
                        return; // Prevent it from being scrubbed as normal telemetry
                    }
                    
                    // The Fog of War Partitioning Engine (Standard Hashrate Telemetry)
                    if (!isCorporateAdmin) {
                        if (parsed.workers && Array.isArray(parsed.workers)) {
                            let isolatedHashrate = 0;
                            
                            parsed.workers = parsed.workers.filter((w: any) => {
                                const identityBase = (w.walletAddress || w.fullIdentity || '').toLowerCase();
                                if (identityBase.includes(cleanSessionWallet)) {
                                    isolatedHashrate += (w.trackingRate || w.hashrate || w.hashRate || 0);
                                    return true;
                                }
                                return false;
                            });

                            if (parsed.pool) {
                                parsed.pool.totalHashrate = isolatedHashrate;
                            } else {
                                parsed.totalHashrate = isolatedHashrate;
                            }
                        }
                        partitionedMessage = JSON.stringify(parsed);
                    }
                } catch (e) {
                    console.warn("Failed to parse/partition telemetry payload.");
                }

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

export const POST = GET;