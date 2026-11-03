import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import {
    isWalletMasterAdmin,
    normalizeKaspaAddressStrict,
    normalizeKaspaBase32Strict
} from '$lib/server/kms';

export const GET: RequestHandler = async ({ url, cookies }: RequestEvent) => {
    const sessionId = cookies.get('perennia_session');
    const sessionWallet = sessionId
        ? await redis.get(`session:${sessionId}`).catch(() => null)
        : null;

    const requestedAddr = url.searchParams.get('address') || sessionWallet || '';
    const cleanRequested = normalizeKaspaBase32Strict(requestedAddr);

    if (!cleanRequested || cleanRequested.length < 55) {
        return json(
            {
                error: 'INVALID_KASPA_ADDRESS: A valid Kaspa Bech32m address is required to query UTXOs.'
            },
            { status: 400 }
        );
    }

    if (sessionWallet) {
        const cleanSession = normalizeKaspaBase32Strict(sessionWallet);
        const isDirector = isWalletMasterAdmin(sessionWallet);
        if (cleanRequested !== cleanSession && !isDirector) {
            return json(
                {
                    error: 'FORBIDDEN: Cannot query UTXO set for an unassociated wallet.'
                },
                { status: 403 }
            );
        }
    }

    const formattedAddress = normalizeKaspaAddressStrict(cleanRequested);
    const rustBackendUrl =
        env.RUST_BACKEND_URL ||
        `http://${env.UBUNTU_NODE_IP || '127.0.0.1'}:8002`;

    try {
        const rustRes = await fetch(
            `${rustBackendUrl}/v1/utxos?address=${encodeURIComponent(formattedAddress)}`,
            {
                headers: { accept: 'application/json' },
                signal: AbortSignal.timeout(4500)
            }
        );

        if (rustRes.ok) {
            const rustData = await rustRes.json();
            const entries = Array.isArray(rustData)
                ? rustData
                : Array.isArray(rustData?.entries)
                  ? rustData.entries
                  : [];
            return json(entries);
        }
    } catch {
        // Fall through to configured Kaspa REST indexer
    }

    const kaspaRestUrl = (env.KASPA_REST_URL || 'https://api.kaspa.org').replace(
        /\/+$/,
        ''
    );

    try {
        const restRes = await fetch(
            `${kaspaRestUrl}/addresses/${encodeURIComponent(formattedAddress)}/utxos`,
            {
                headers: { accept: 'application/json' },
                signal: AbortSignal.timeout(6000)
            }
        );

        if (!restRes.ok) {
            const errText = await restRes.text().catch(() => '');
            return json(
                {
                    error: `UTXO_INDEXER_REJECTED (${restRes.status}): ${errText || 'Upstream Kaspa indexer rejected UTXO query.'}`
                },
                { status: 503 }
            );
        }

        const restData = await restRes.json();
        const entries = Array.isArray(restData)
            ? restData
            : Array.isArray(restData?.entries)
              ? restData.entries
              : [];

        return json(entries);
    } catch (err: any) {
        console.error('UTXO Lookup Fault:', err);
        return json(
            {
                error:
                    err?.message ||
                    'UTXO_INDEXER_OFFLINE: Both local kaspad gRPC and upstream Kaspa REST indexer are unreachable.'
            },
            { status: 503 }
        );
    }
};