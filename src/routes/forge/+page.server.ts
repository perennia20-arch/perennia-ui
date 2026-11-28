import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isWalletMasterAdmin } from '$lib/server/kms';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async ({ locals, cookies, setHeaders }) => {
    setHeaders({
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Robots-Tag': 'noindex, nofollow, noarchive'
    });

    const wallet = locals.walletAddress || null;
    const forgeCookie = cookies.get('perennia_forge_session') || '';
    const isFounderWallet = isWalletMasterAdmin(wallet);

    if (!isFounderWallet && !forgeCookie) {
        throw error(404, 'Not Found');
    }

    if (!isFounderWallet && forgeCookie) {
        const backendBase = (
            env.RUST_BACKEND_URL ||
            (env.UBUNTU_NODE_IP ? `http://${env.UBUNTU_NODE_IP}:8002` : 'http://127.0.0.1:8002')
        )
            .trim()
            .replace(/\/+$/, '');
        try {
            const verifyRes = await fetch(`${backendBase}/v1/forge/overview`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-forge-session': forgeCookie
                },
                body: '{}',
                signal: AbortSignal.timeout(5_000)
            });
            if (!verifyRes.ok) {
                throw error(404, 'Not Found');
            }
        } catch {
            throw error(404, 'Not Found');
        }
    }

    return {
        founderWallet: wallet || ''
    };
};
