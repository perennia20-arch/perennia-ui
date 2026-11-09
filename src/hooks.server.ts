import { json, type Handle } from '@sveltejs/kit';
import { chronos } from '$lib/server/chronos';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const globalNode = globalThis as unknown as { __chronosStarted: boolean };
if (!globalNode.__chronosStarted) {
    try {
        console.log('⚙️ SvelteKit Enterprise Server Bootstrapping...');
        chronos.start();
        globalNode.__chronosStarted = true;
    } catch (bootErr) {
        console.warn('⚠️ Chronos bootstrap notice:', bootErr);
    }
}

const TRUSTED_ORIGINS = new Set([
    'https://perennia.io',
    'https://www.perennia.io',
    'https://pool.perennia.io',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
    'http://localhost:4173',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173'
]);

const PUBLIC_API_PREFIXES = [
    '/api/auth/invite/verify',
    '/api/auth/verify',
    '/api/auth/challenge',
    '/api/auth/me',
    '/api/auth',
    '/api/health',
    '/api/webhooks',
    '/api/prices',
    '/api/telemetry'
];

const WEBHOOK_BYPASS_PREFIXES = [
    '/api/webhooks/stripe',
    '/api/webhooks/transak'
];

function resolveAllowedOrigin(
    requestOrigin: string | null,
    currentOrigin: string
): string {
    if (!requestOrigin) {
        return currentOrigin || 'https://perennia.io';
    }
    const clean = requestOrigin.trim().replace(/\/+$/, '');
    if (
        clean === currentOrigin ||
        TRUSTED_ORIGINS.has(clean) ||
        /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/i.test(
            clean
        )
    ) {
        return clean;
    }
    return 'https://perennia.io';
}

function isOriginTrustedForCsrf(
    requestOrigin: string | null,
    currentOrigin: string
): boolean {
    if (!requestOrigin) return true;
    const clean = requestOrigin.trim().replace(/\/+$/, '');
    return (
        clean === currentOrigin ||
        TRUSTED_ORIGINS.has(clean) ||
        /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(:\d+)?$/i.test(
            clean
        )
    );
}

function isPublicApiRoute(pathname: string): boolean {
    return PUBLIC_API_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
}

function isWebhookRoute(pathname: string): boolean {
    return WEBHOOK_BYPASS_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
}

function hasValidInternalBearerToken(authHeader: string | null): boolean {
    if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
    const candidates = [
        env.INTERNAL_ADMIN_TOKEN
            ? `Bearer ${env.INTERNAL_ADMIN_TOKEN.trim()}`
            : '',
        env.PERENNIA_ADMIN_KEY ? `Bearer ${env.PERENNIA_ADMIN_KEY.trim()}` : ''
    ].filter(Boolean);
    if (candidates.length === 0) return false;
    const providedBuf = Buffer.from(authHeader);
    return candidates.some((expected) => {
        const expectedBuf = Buffer.from(expected);
        return (
            expectedBuf.length === providedBuf.length &&
            crypto.timingSafeEqual(expectedBuf, providedBuf)
        );
    });
}

function resolveClientIp(event: Parameters<Handle>[0]['event']): string {
    const forwarded = event.request.headers.get('x-forwarded-for');
    if (forwarded) {
        const first = forwarded.split(',')[0]?.trim();
        if (first) return first;
    }
    const realIp = event.request.headers.get('x-real-ip')?.trim();
    if (realIp) return realIp;
    try {
        return event.getClientAddress() || '127.0.0.1';
    } catch {
        return '127.0.0.1';
    }
}

export const handle: Handle = async ({ event, resolve }) => {
    event.locals.redis = redis;
    const requestOrigin = event.request.headers.get('origin');
    const allowedOrigin = resolveAllowedOrigin(
        requestOrigin,
        event.url.origin
    );
    const pathname = event.url.pathname;

    if (pathname.startsWith('/api') && event.request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': allowedOrigin,
                'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
                'Access-Control-Allow-Headers':
                    'Content-Type, Authorization, Stripe-Signature, X-Webhook-Signature, X-Bridge-Signature, X-Perennia-Sandbox',
                'Access-Control-Allow-Credentials': 'true',
                Vary: 'Origin'
            }
        });
    }

    const isMutatingMethod =
        event.request.method === 'POST' ||
        event.request.method === 'PUT' ||
        event.request.method === 'PATCH' ||
        event.request.method === 'DELETE';

    if (
        pathname.startsWith('/api') &&
        isMutatingMethod &&
        !isWebhookRoute(pathname) &&
        requestOrigin &&
        !isOriginTrustedForCsrf(requestOrigin, event.url.origin)
    ) {
        return json(
            {
                error: 'CSRF_ORIGIN_REJECTED',
                message: `Origin ${requestOrigin} is not authorized for https://perennia.io API mutations.`
            },
            { status: 403 }
        );
    }

    const clientIp = resolveClientIp(event);
    if (pathname.startsWith('/api') && !isWebhookRoute(pathname)) {
        try {
            const isIpBlacklisted = await redis.sismember(
                'perennia:firewall:blacklisted_ips',
                clientIp
            );
            if (isIpBlacklisted === 1) {
                return json(
                    {
                        error: 'FIREWALL_BLACKLISTED_IP',
                        message:
                            'Access denied by Perennia Security Firewall: IP address is blacklisted.'
                    },
                    { status: 403 }
                );
            }
        } catch {
            // Continue if Redis check fails transiently
        }
    }

    const sessionId = event.cookies.get('perennia_session');
    const inviteToken = event.cookies.get('perennia_beta_invite');
    const authHeader = event.request.headers.get('authorization');
    let isAuthorized = hasValidInternalBearerToken(authHeader);

    if (sessionId) {
        const sessionWallet = await redis
            .get(`session:${sessionId}`)
            .catch(() => null);
        if (sessionWallet) {
            const cleanWallet = sessionWallet
                .trim()
                .toLowerCase()
                .replace(/^kaspa:/i, '');
            const prefixedWallet = `kaspa:${cleanWallet}`;
            try {
                const [blkClean, blkPrefixed] = await Promise.all([
                    redis.sismember(
                        'perennia:firewall:blacklisted_wallets',
                        cleanWallet
                    ),
                    redis.sismember(
                        'perennia:firewall:blacklisted_wallets',
                        prefixedWallet
                    )
                ]);
                if (blkClean === 1 || blkPrefixed === 1) {
                    return json(
                        {
                            error: 'FIREWALL_BLACKLISTED_WALLET',
                            message:
                                'Access denied by Perennia Security Firewall: Wallet address is blacklisted.'
                        },
                        { status: 403 }
                    );
                }
            } catch {
                // Ignore transient Redis error
            }
            event.locals.walletAddress = sessionWallet;
            (event.locals as any).user = { address: sessionWallet };
            isAuthorized = true;
        }
    }

    if (!isAuthorized && inviteToken) {
        const validInvite = await redis
            .get(`beta_invite:${inviteToken}`)
            .catch(() => null);
        if (validInvite) {
            isAuthorized = true;
        }
    }

    const enforceStrictApiGate =
        String(env.ENFORCE_BETA_INVITE_GATE || '').toLowerCase() === 'true';

    if (
        enforceStrictApiGate &&
        pathname.startsWith('/api') &&
        !isPublicApiRoute(pathname) &&
        !isAuthorized
    ) {
        return json(
            {
                error: 'BETA_INVITE_REQUIRED',
                message:
                    'Valid beta invite code or authenticated Sovereign Vault session required.'
            },
            {
                status: 403,
                headers: {
                    'Access-Control-Allow-Origin': allowedOrigin,
                    'Access-Control-Allow-Credentials': 'true',
                    Vary: 'Origin'
                }
            }
        );
    }

    const response = await resolve(event);
    try {
        if (pathname.startsWith('/api')) {
            response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
            response.headers.set('Access-Control-Allow-Credentials', 'true');
            response.headers.set('Vary', 'Origin');
        }
        response.headers.set('X-Content-Type-Options', 'nosniff');
        response.headers.set('X-Frame-Options', 'DENY');
        response.headers.set(
            'Referrer-Policy',
            'strict-origin-when-cross-origin'
        );
        if (
            event.url.protocol === 'https:' ||
            process.env.NODE_ENV === 'production'
        ) {
            response.headers.set(
                'Strict-Transport-Security',
                'max-age=31536000; includeSubDomains'
            );
        }
    } catch {
        // Ignore immutable headers on static/redirect responses
    }
    return response;
};