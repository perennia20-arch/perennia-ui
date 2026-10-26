import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';

const MASTER_ADMIN_ADDRESS =
    'kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579';

function normalizeKaspaAddress(addr: string): string {
    const clean = addr.trim().toLowerCase().replace(/^kaspa:/i, '').trim();
    return `kaspa:${clean}`;
}

export const GET: RequestHandler = async ({ url }: RequestEvent) => {
    let client;
    try {
        client = await dbPool.connect();
        await client.query(`
            CREATE TABLE IF NOT EXISTS p2p_orders (
                id VARCHAR(50) PRIMARY KEY,
                seller VARCHAR(255) NOT NULL,
                sell_token VARCHAR(20) NOT NULL,
                sell_amount DOUBLE PRECISION NOT NULL,
                buy_token VARCHAR(20) NOT NULL,
                buy_amount DOUBLE PRECISION NOT NULL,
                rate VARCHAR(50) NOT NULL,
                seller_psbt TEXT,
                status VARCHAR(20) DEFAULT 'open',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        const requestedId = url.searchParams.get('id')?.trim();
        if (requestedId) {
            const singleRes = await client.query(
                `SELECT * FROM p2p_orders WHERE id = $1 LIMIT 1`,
                [requestedId]
            );
            if (singleRes.rows.length === 0) {
                return json({ error: 'P2P order not found' }, { status: 404 });
            }
            const row = singleRes.rows[0];
            return json({
                id: row.id,
                seller: row.seller,
                sellToken: row.sell_token,
                sellAmount: row.sell_amount,
                buyToken: row.buy_token,
                buyAmount: row.buy_amount,
                rate: row.rate,
                sellerPsbt: row.seller_psbt,
                status: row.status,
                createdAt: row.created_at
            });
        }

        const res = await client.query(
            `SELECT * FROM p2p_orders WHERE status = 'open' ORDER BY created_at DESC`
        );
        const orders = res.rows.map((row) => ({
            id: row.id,
            seller: row.seller,
            sellToken: row.sell_token,
            sellAmount: row.sell_amount,
            buyToken: row.buy_token,
            buyAmount: row.buy_amount,
            rate: row.rate,
            sellerPsbt: row.seller_psbt,
            status: row.status,
            createdAt: row.created_at
        }));
        return json(orders);
    } catch (e) {
        console.error('P2P Fetch Error:', e);
        return json({ error: 'Failed to fetch orderbook' }, { status: 500 });
    } finally {
        if (client) client.release();
    }
};

export const POST: RequestHandler = async ({ request, cookies }: RequestEvent) => {
    const sessionId = cookies.get('perennia_session');
    if (!sessionId) {
        return json({ error: 'Unauthorized to post P2P orders' }, { status: 401 });
    }
    const sessionAddress = await redis.get(`session:${sessionId}`);
    if (!sessionAddress) {
        return json({ error: 'Session expired' }, { status: 401 });
    }
    const normalizedCaller = normalizeKaspaAddress(sessionAddress);
    const cleanCaller = normalizedCaller.replace(/^kaspa:/i, '');

    let client;
    try {
        const body = await request.json();
        client = await dbPool.connect();

        if (String(body.action || '').toUpperCase() === 'COMPLETE_P2P_FILL') {
            const orderId = String(body.orderId || body.id || '').trim();
            const txId = String(body.txId || body.transactionId || '').trim();
            if (!orderId || !txId) {
                return json(
                    { error: 'Missing orderId or broadcast txId for P2P fill completion.' },
                    { status: 400 }
                );
            }
            const existing = await client.query(
                `SELECT * FROM p2p_orders WHERE id = $1 LIMIT 1`,
                [orderId]
            );
            if (existing.rows.length === 0) {
                return json({ error: 'P2P order not found' }, { status: 404 });
            }
            const row = existing.rows[0];
            await client.query(
                `UPDATE p2p_orders SET status = 'filled' WHERE id = $1`,
                [orderId]
            );
            await client
                .query(
                    `INSERT INTO pending_transactions (tx_id, wallet_address, amount_kas, action_type, status)
                     VALUES ($1, $2, $3, 'P2P_ATOMIC_SWAP', 'PENDING')
                     ON CONFLICT (tx_id) DO NOTHING`,
                    [txId, normalizedCaller, Number(row.sell_amount || 0)]
                )
                .catch(() => {});

            const kasSpotStr = await redis.get('oracle:spot:KAS_USDC');
            const kasSpot = kasSpotStr ? parseFloat(kasSpotStr) || 0.12 : 0.12;
            const sellAmt = Number(row.sell_amount || 0);
            const grossUsd = sellAmt * kasSpot;

            await client
                .query(`ALTER TABLE tax_ledger_events ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(255)`)
                .catch(() => {});
            await client
                .query(
                    `INSERT INTO tax_ledger_events
                     (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash)
                     VALUES ($1, $2, 'DEX_SWAP', $3, $4, $5, $6)`,
                    [
                        cleanCaller,
                        String(row.sell_token || 'KAS').toUpperCase(),
                        grossUsd,
                        sellAmt,
                        kasSpot,
                        txId
                    ]
                )
                .catch(() => {});

            return json({
                success: true,
                orderId,
                txId,
                status: 'filled'
            });
        }

        if (!body.sellerPsbt) {
            return json(
                { error: 'Cryptographic PSBT payload required for trustless settlement' },
                { status: 400 }
            );
        }

        await client.query(
            `
            INSERT INTO p2p_orders (id, seller, sell_token, sell_amount, buy_token, buy_amount, rate, seller_psbt)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
            [
                body.id,
                normalizedCaller,
                body.sellToken,
                body.sellAmount,
                body.buyToken,
                body.buyAmount,
                body.rate,
                body.sellerPsbt
            ]
        );
        return json({ success: true, id: body.id });
    } catch (e) {
        console.error('P2P Create/Fill Error:', e);
        return json({ error: 'Failed to process P2P order' }, { status: 500 });
    } finally {
        if (client) client.release();
    }
};

export const DELETE: RequestHandler = async ({ request, cookies, url }: RequestEvent) => {
    const sessionId = cookies.get('perennia_session');
    if (!sessionId) {
        return json({ error: 'Unauthorized to cancel P2P orders' }, { status: 401 });
    }
    const sessionAddress = await redis.get(`session:${sessionId}`);
    if (!sessionAddress) {
        return json({ error: 'Session expired' }, { status: 401 });
    }
    const normalizedCaller = normalizeKaspaAddress(sessionAddress);
    const cleanCaller = normalizedCaller.replace(/^kaspa:/i, '');
    const isDirector =
        normalizedCaller === normalizeKaspaAddress(MASTER_ADMIN_ADDRESS);

    let orderId = url.searchParams.get('id') || '';
    if (!orderId) {
        try {
            const body = await request.json();
            orderId = String(body.id || body.orderId || '').trim();
        } catch {
            orderId = '';
        }
    }
    if (!orderId) {
        return json({ error: 'Missing order ID to cancel' }, { status: 400 });
    }

    let client;
    try {
        client = await dbPool.connect();
        const existing = await client.query(
            `SELECT id, seller, status FROM p2p_orders WHERE id = $1 LIMIT 1`,
            [orderId]
        );
        if (existing.rows.length === 0) {
            return json({ error: 'P2P order not found' }, { status: 404 });
        }
        const row = existing.rows[0];
        const cleanSeller = String(row.seller || '')
            .trim()
            .toLowerCase()
            .replace(/^kaspa:/i, '');
        if (!isDirector && cleanSeller !== cleanCaller) {
            return json(
                { error: 'FORBIDDEN: Only the maker may cancel this P2P offer.' },
                { status: 403 }
            );
        }
        await client.query(
            `UPDATE p2p_orders SET status = 'cancelled' WHERE id = $1`,
            [orderId]
        );
        return json({ success: true, cancelledId: orderId });
    } catch (e) {
        console.error('P2P Cancel Error:', e);
        return json({ error: 'Failed to cancel P2P order' }, { status: 500 });
    } finally {
        if (client) client.release();
    }
};