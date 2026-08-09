import { json } from '@sveltejs/kit';
import { dbPool } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
    let client;
    try {
        client = await dbPool.connect();
        
        // ⚡ JIT Table Creation: Ensures the table exists without you needing to run manual SQL
        await client.query(`
            CREATE TABLE IF NOT EXISTS p2p_orders (
                id VARCHAR(50) PRIMARY KEY,
                seller VARCHAR(255) NOT NULL,
                sell_token VARCHAR(20) NOT NULL,
                sell_amount DOUBLE PRECISION NOT NULL,
                buy_token VARCHAR(20) NOT NULL,
                buy_amount DOUBLE PRECISION NOT NULL,
                rate VARCHAR(50) NOT NULL,
                status VARCHAR(20) DEFAULT 'open',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Fetch the global orderbook
        const res = await client.query(`SELECT * FROM p2p_orders WHERE status = 'open' ORDER BY created_at DESC`);
        
        // Map database columns to the frontend expectations
        const orders = res.rows.map(row => ({
            id: row.id,
            seller: row.seller,
            sellToken: row.sell_token,
            sellAmount: row.sell_amount,
            buyToken: row.buy_token,
            buyAmount: row.buy_amount,
            rate: row.rate,
            status: row.status
        }));
        
        return json(orders);
    } catch (e) {
        console.error("P2P Fetch Error:", e);
        return json({ error: 'Failed to fetch orderbook' }, { status: 500 });
    } finally {
        if (client) client.release();
    }
};

export const POST: RequestHandler = async ({ request, cookies }) => {
    // ⚡ Zero-Trust Guard: Only authenticated users can post to the orderbook
    const session = cookies.get('perennia_session');
    if (!session) return json({ error: 'Unauthorized to post P2P orders' }, { status: 401 });

    let client;
    try {
        const order = await request.json();
        client = await dbPool.connect();
        
        await client.query(`
            INSERT INTO p2p_orders (id, seller, sell_token, sell_amount, buy_token, buy_amount, rate)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [order.id, session.toLowerCase(), order.sellToken, order.sellAmount, order.buyToken, order.buyAmount, order.rate]);
        
        return json({ success: true });
    } catch (e) {
        console.error("P2P Create Error:", e);
        return json({ error: 'Failed to post order' }, { status: 500 });
    } finally {
        if (client) client.release();
    }
};

export const PATCH: RequestHandler = async ({ request, cookies }) => {
    // ⚡ Zero-Trust Guard: Must be authenticated to fill an order
    const session = cookies.get('perennia_session');
    if (!session) return json({ error: 'Unauthorized to execute P2P orders' }, { status: 401 });

    let client;
    try {
        const { id, status } = await request.json();
        client = await dbPool.connect();
        
        // Update the order status in the database to remove it from the open orderbook
        await client.query(`
            UPDATE p2p_orders SET status = $1 WHERE id = $2
        `, [status, id]);
        
        return json({ success: true, transactionId: `OTC_EXEC_${crypto.randomUUID().split('-')[0].toUpperCase()}` });
    } catch (e) {
        console.error("P2P Update Error:", e);
        return json({ error: 'Failed to update order status' }, { status: 500 });
    } finally {
        if (client) client.release();
    }
};