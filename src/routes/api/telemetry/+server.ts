import { produce } from 'sveltekit-sse';
import { redis } from '$lib/server/redis';
import type { RequestEvent } from '@sveltejs/kit';
import type Redis from 'ioredis';

type TelemetryClientListener = (rawMessage: string, parsedMessage: any) => void;

interface TelemetryMultiplexerHub {
    subscriber: Redis | null;
    initPromise: Promise<void> | null;
    listeners: Set<TelemetryClientListener>;
}

const globalHubHolder = globalThis as unknown as {
    __perenniaTelemetryHub?: TelemetryMultiplexerHub;
};

const telemetryHub: TelemetryMultiplexerHub =
    globalHubHolder.__perenniaTelemetryHub || {
        subscriber: null,
        initPromise: null,
        listeners: new Set<TelemetryClientListener>()
    };

globalHubHolder.__perenniaTelemetryHub = telemetryHub;

async function ensureSharedTelemetrySubscriber(): Promise<void> {
    if (telemetryHub.subscriber) {
        return;
    }
    if (telemetryHub.initPromise) {
        return telemetryHub.initPromise;
    }

    telemetryHub.initPromise = (async () => {
        const sub = redis.duplicate();
        sub.on('error', (err) => {
            console.error('SSE Shared Redis Subscriber Error:', err);
        });
        sub.on('message', (channel: string, message: string) => {
            if (channel !== 'telemetry:updates' || telemetryHub.listeners.size === 0) {
                return;
            }
            try {
                const parsed = JSON.parse(message);
                for (const listener of telemetryHub.listeners) {
                    try {
                        listener(message, parsed);
                    } catch {
                        // Isolate individual client stream errors
                    }
                }
            } catch {
                console.warn('Failed to parse shared telemetry:updates payload.');
            }
        });
        await sub.subscribe('telemetry:updates');
        telemetryHub.subscriber = sub;
    })().catch((err) => {
        telemetryHub.subscriber = null;
        telemetryHub.initPromise = null;
        throw err;
    });

    return telemetryHub.initPromise;
}

export function GET({ cookies }: RequestEvent) {
    const sessionId = cookies.get('perennia_session');
    return produce(async function start({ emit }) {
        if (!sessionId) {
            emit('message', JSON.stringify({ error: 'UNAUTHORIZED_MATRIX_ACCESS' }));
            return function stop() {};
        }
        const sessionWalletRaw = await redis.get(`session:${sessionId}`);
        if (!sessionWalletRaw) {
            emit('message', JSON.stringify({ error: 'SESSION_EXPIRED' }));
            return function stop() {};
        }
        const sessionWallet = sessionWalletRaw.toLowerCase().trim();
        const cleanSessionWallet = sessionWallet.replace(/kaspa:/i, '').trim();

        try {
            const initialEpochRaw = await redis.get(
                'perennia:settlement:epoch_telemetry'
            );
            if (initialEpochRaw) {
                const parsedEpoch = JSON.parse(initialEpochRaw);
                emit(
                    'message',
                    JSON.stringify({
                        epoch_telemetry_update: true,
                        epoch: parsedEpoch
                    })
                );
            }
        } catch (e) {
            console.warn('Initial epoch telemetry read bypassed:', e);
        }

        try {
            await ensureSharedTelemetrySubscriber();
        } catch (err) {
            console.error('Failed to initialize shared SSE subscriber:', err);
            emit('message', JSON.stringify({ error: 'TELEMETRY_BUS_UNAVAILABLE' }));
            return function stop() {};
        }

        const clientListener: TelemetryClientListener = (rawMessage, parsed) => {
            if (parsed.epoch_telemetry_update) {
                emit('message', rawMessage);
                return;
            }
            if (parsed.yield_update) {
                const payloadWalletClean = (parsed.wallet || '')
                    .toLowerCase()
                    .replace(/kaspa:/i, '')
                    .trim();
                if (payloadWalletClean === cleanSessionWallet) {
                    emit('message', rawMessage);
                }
                return;
            }
            if (parsed.layout_state_update) {
                const payloadWalletClean = (parsed.wallet || '')
                    .toLowerCase()
                    .replace(/kaspa:/i, '')
                    .trim();
                if (payloadWalletClean === cleanSessionWallet) {
                    emit('message', rawMessage);
                }
                return;
            }
            if (parsed.fiat_event || parsed.l1_event) {
                const payloadWalletClean = (parsed.wallet || '')
                    .toLowerCase()
                    .replace(/kaspa:/i, '')
                    .trim();
                if (!payloadWalletClean || payloadWalletClean === cleanSessionWallet) {
                    emit('message', rawMessage);
                }
                return;
            }
            if (parsed.workers && Array.isArray(parsed.workers)) {
                let isolatedHashrate = 0;
                const filteredWorkers = parsed.workers.filter((w: any) => {
                    const rawIdentity = (
                        w.walletAddress ||
                        w.fullIdentity ||
                        ''
                    ).toLowerCase();
                    const cleanWorkerWallet = rawIdentity
                        .split('.')[0]
                        .replace(/kaspa:/i, '')
                        .trim();
                    if (
                        cleanWorkerWallet === cleanSessionWallet ||
                        rawIdentity.includes(cleanSessionWallet)
                    ) {
                        isolatedHashrate +=
                            w.trackingRate || w.hashrate || w.hashRate || 0;
                        return true;
                    }
                    return false;
                });
                const partitionedPayload = {
                    ...parsed,
                    workers: filteredWorkers,
                    ...(parsed.pool
                        ? {
                              pool: {
                                  ...parsed.pool,
                                  totalHashrate: isolatedHashrate
                              }
                          }
                        : { totalHashrate: isolatedHashrate })
                };
                emit('message', JSON.stringify(partitionedPayload));
                return;
            }
            emit('message', rawMessage);
        };

        telemetryHub.listeners.add(clientListener);

        return function stop() {
            telemetryHub.listeners.delete(clientListener);
        };
    });
}

export const POST = GET;