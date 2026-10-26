import { produce } from 'sveltekit-sse';
import { redis } from '$lib/server/redis';
import type { RequestEvent } from '@sveltejs/kit';

export function GET({ cookies }: RequestEvent) {
    const sessionId = cookies.get('perennia_session');
    return produce(async function start({ emit }) {
        if (!sessionId) {
            emit('message', JSON.stringify({ error: "UNAUTHORIZED_MATRIX_ACCESS" }));
            return function stop() {};
        }
        const sessionWalletRaw = await redis.get(`session:${sessionId}`);
        if (!sessionWalletRaw) {
            emit('message', JSON.stringify({ error: "SESSION_EXPIRED" }));
            return function stop() {};
        }
        const sessionWallet = sessionWalletRaw.toLowerCase().trim();
        const cleanSessionWallet = sessionWallet.replace(/kaspa:/i, '').trim();

        try {
            const initialEpochRaw = await redis.get('perennia:settlement:epoch_telemetry');
            if (initialEpochRaw) {
                const parsedEpoch = JSON.parse(initialEpochRaw);
                emit('message', JSON.stringify({
                    epoch_telemetry_update: true,
                    epoch: parsedEpoch
                }));
            }
        } catch (e) {
            console.warn("Initial epoch telemetry read bypassed:", e);
        }

        const subscriber = redis.duplicate();
        subscriber.on('error', (err) => {
            console.error('SSE Redis Subscriber Error:', err);
        });
        await subscriber.subscribe('telemetry:updates');
        subscriber.on('message', (channel, message) => {
            if (channel === 'telemetry:updates') {
                try {
                    const parsed = JSON.parse(message);
                    if (parsed.epoch_telemetry_update) {
                        emit('message', message);
                        return;
                    }
                    if (parsed.yield_update) {
                        const payloadWalletClean = (parsed.wallet || '').toLowerCase().replace(/kaspa:/i, '').trim();
                        if (payloadWalletClean === cleanSessionWallet) {
                            emit('message', message);
                        }
                        return;
                    }
                    if (parsed.layout_state_update) {
                        const payloadWalletClean = (parsed.wallet || '').toLowerCase().replace(/kaspa:/i, '').trim();
                        if (payloadWalletClean === cleanSessionWallet) {
                            emit('message', message);
                        }
                        return;
                    }
                    if (parsed.workers && Array.isArray(parsed.workers)) {
                        let isolatedHashrate = 0;
                        parsed.workers = parsed.workers.filter((w: any) => {
                            const rawIdentity = (w.walletAddress || w.fullIdentity || '').toLowerCase();
                            const cleanWorkerWallet = rawIdentity.split('.')[0].replace(/kaspa:/i, '').trim();
                            if (cleanWorkerWallet === cleanSessionWallet || rawIdentity.includes(cleanSessionWallet)) {
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
                    emit('message', JSON.stringify(parsed));
                } catch (e) {
                    console.warn("Failed to partition telemetry payload.");
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