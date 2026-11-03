import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { dbPool } from '$lib/server/db';
import {
    isWalletMasterAdmin,
    normalizeKaspaBase32Strict,
    normalizeKaspaAddressStrict
} from '$lib/server/kms';

export const GET: RequestHandler = async ({ url, cookies }: RequestEvent) => {
    const sessionId = cookies.get('perennia_session');
    if (!sessionId) {
        return json(
            { error: 'UNAUTHORIZED: Active Sovereign session required.' },
            { status: 401 }
        );
    }

    const sessionWallet = await redis.get(`session:${sessionId}`);
    if (!sessionWallet) {
        return json({ error: 'SESSION_EXPIRED' }, { status: 401 });
    }

    const requestedWallet = url.searchParams.get('wallet') || sessionWallet;
    const cleanSession = normalizeKaspaBase32Strict(sessionWallet);
    const cleanRequested = normalizeKaspaBase32Strict(requestedWallet);

    if (!cleanRequested) {
        return json({ error: 'INVALID_WALLET_ADDRESS' }, { status: 400 });
    }

    const isDirector = isWalletMasterAdmin(sessionWallet);
    if (cleanRequested !== cleanSession && !isDirector) {
        return json(
            {
                error: 'FORBIDDEN: Cannot inspect batch settlement ledger for another wallet.'
            },
            { status: 403 }
        );
    }

    const prefixedWallet = normalizeKaspaAddressStrict(cleanRequested);
    const userLedgerKey = `dev:sor:treasury:balances:${cleanRequested}`;

    try {
        const [rawRedisBalances, reservoirRes, coldRuleRes] = await Promise.all([
            redis.hgetall(userLedgerKey).catch(() => ({} as Record<string, string>)),
            dbPool
                .query(
                    `SELECT streaming_balance_kas, COALESCE(lp_tokens, '{}'::jsonb) AS lp_tokens
                     FROM yield_reservoirs
                     WHERE wallet_address = $1 OR wallet_address = $2
                     ORDER BY streaming_balance_kas DESC
                     LIMIT 1`,
                    [prefixedWallet, cleanRequested]
                )
                .catch(() => ({ rows: [] as any[] })),
            dbPool
                .query(
                    `SELECT overflow_ceiling
                     FROM user_cold_vault_rules
                     WHERE (wallet_address = $1 OR wallet_address = $2)
                       AND asset_ticker = 'KAS'
                     LIMIT 1`,
                    [prefixedWallet, cleanRequested]
                )
                .catch(() => ({ rows: [] as any[] }))
        ]);

        const balances: Record<string, number> = {};
        let redisPrimaryKas = 0;
        let redisUnassignedKas = 0;

        for (const [rawKey, rawVal] of Object.entries(rawRedisBalances || {})) {
            const parsed = parseFloat(String(rawVal || '0'));
            if (!Number.isFinite(parsed) || parsed <= 0) continue;

            if (rawKey === 'Unassigned KAS') {
                redisUnassignedKas = parsed;
                continue;
            }

            const ticker = rawKey.trim().toUpperCase();
            if (ticker === 'KAS') {
                redisPrimaryKas += parsed;
            } else {
                balances[ticker] = Number(parsed.toFixed(8));
            }
        }

        let dbStreamingKas = 0;
        if (reservoirRes.rows.length > 0) {
            const row = reservoirRes.rows[0];
            dbStreamingKas = Math.max(0, Number(row.streaming_balance_kas || 0));
            const lpTokens = row.lp_tokens;
            if (lpTokens && typeof lpTokens === 'object') {
                for (const [k, v] of Object.entries(lpTokens)) {
                    const ticker = k.trim().toUpperCase();
                    const amt = Number(v || 0);
                    if (Number.isFinite(amt) && amt > 0) {
                        balances[ticker] = Math.max(
                            balances[ticker] || 0,
                            Number(amt.toFixed(8))
                        );
                    }
                }
            }
        }

        const effectiveUnassignedKas = Math.max(
            redisUnassignedKas,
            dbStreamingKas
        );

        if (dbStreamingKas > redisUnassignedKas + 1e-6) {
            await redis
                .hset(
                    userLedgerKey,
                    'Unassigned KAS',
                    dbStreamingKas.toFixed(8)
                )
                .catch(() => {});
        }

        const totalBatchKas = Number(
            (redisPrimaryKas + effectiveUnassignedKas).toFixed(8)
        );
        balances['KAS'] = totalBatchKas;

        const targetReserveCeilingKas = Number(
            coldRuleRes.rows[0]?.overflow_ceiling ?? 500.0
        );

        return json({
            ...balances,
            unassignedReserveKas: Number(effectiveUnassignedKas.toFixed(8)),
            unassignedReserveTargetKas: targetReserveCeilingKas
        });
    } catch (err: any) {
        console.error('User Ledger Hydration Fault:', err);
        return json(
            { error: err?.message || 'Failed to read user settlement ledger.' },
            { status: 500 }
        );
    }
};