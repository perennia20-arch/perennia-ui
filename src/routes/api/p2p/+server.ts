import { json, type RequestHandler } from '@sveltejs/kit';
import * as dbModule from '$lib/server/db';
import crypto from 'crypto';
const db: { query: (text: string, params?: any[]) => Promise<any> } =
    (dbModule as any).dbPool ||
    (dbModule as any).pool ||
    (dbModule as any).db ||
    (dbModule as any).default ||
    (dbModule as any);
let p2pSchemaInitialized = false;
async function ensureP2pSchema(): Promise<void> {
    if (p2pSchemaInitialized) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS p2p_orders (
                order_id TEXT PRIMARY KEY,
                maker_wallet TEXT NOT NULL,
                offer_asset TEXT NOT NULL,
                offer_amount DOUBLE PRECISION NOT NULL,
                ask_asset TEXT NOT NULL,
                ask_amount DOUBLE PRECISION NOT NULL,
                rate TEXT,
                psbt_hex TEXT,
                status TEXT NOT NULL DEFAULT 'OPEN',
                taker_wallet TEXT,
                tx_hash TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
        const migrations = [
            `ALTER TABLE p2p_orders ADD COLUMN IF NOT EXISTS order_id TEXT`,
            `ALTER TABLE p2p_orders ADD COLUMN IF NOT EXISTS maker_wallet TEXT`,
            `ALTER TABLE p2p_orders ADD COLUMN IF NOT EXISTS offer_asset TEXT`,
            `ALTER TABLE p2p_orders ADD COLUMN IF NOT EXISTS offer_amount DOUBLE PRECISION DEFAULT 0`,
            `ALTER TABLE p2p_orders ADD COLUMN IF NOT EXISTS ask_asset TEXT`,
            `ALTER TABLE p2p_orders ADD COLUMN IF NOT EXISTS ask_amount DOUBLE PRECISION DEFAULT 0`,
            `ALTER TABLE p2p_orders ADD COLUMN IF NOT EXISTS rate TEXT`,
            `ALTER TABLE p2p_orders ADD COLUMN IF NOT EXISTS psbt_hex TEXT`,
            `ALTER TABLE p2p_orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'OPEN'`,
            `ALTER TABLE p2p_orders ADD COLUMN IF NOT EXISTS taker_wallet TEXT`,
            `ALTER TABLE p2p_orders ADD COLUMN IF NOT EXISTS tx_hash TEXT`,
            `ALTER TABLE p2p_orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
            `ALTER TABLE p2p_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`
        ];
        for (const sql of migrations) {
            await db.query(sql).catch(() => {});
        }
        const colRes = await db
            .query(
                `SELECT column_name
                 FROM information_schema.columns
                 WHERE table_name = 'p2p_orders'`
            )
            .catch(() => ({ rows: [] as Array<{ column_name: string }> }));
        const colNames = new Set(
            colRes.rows.map((r: any) => String(r.column_name).toLowerCase())
        );
        const legacyCols = [
            'id',
            'seller',
            'sell_token',
            'sell_amount',
            'buy_token',
            'buy_amount'
        ];
        for (const legacyCol of legacyCols) {
            if (colNames.has(legacyCol)) {
                await db
                    .query(
                        `ALTER TABLE p2p_orders ALTER COLUMN ${legacyCol} DROP NOT NULL`
                    )
                    .catch(() => {});
            }
        }
        if (colNames.has('id')) {
            await db
                .query(
                    `UPDATE p2p_orders
                     SET order_id = COALESCE(order_id, id::text)
                     WHERE order_id IS NULL`
                )
                .catch(() => {});
        }
        if (colNames.has('seller')) {
            await db
                .query(
                    `UPDATE p2p_orders
                     SET maker_wallet = COALESCE(maker_wallet, seller)
                     WHERE maker_wallet IS NULL`
                )
                .catch(() => {});
        }
        if (colNames.has('sell_token')) {
            await db
                .query(
                    `UPDATE p2p_orders
                     SET offer_asset = COALESCE(offer_asset, sell_token)
                     WHERE offer_asset IS NULL`
                )
                .catch(() => {});
        }
        if (colNames.has('sell_amount')) {
            await db
                .query(
                    `UPDATE p2p_orders
                     SET offer_amount = COALESCE(offer_amount, sell_amount)
                     WHERE offer_amount IS NULL OR offer_amount = 0`
                )
                .catch(() => {});
        }
        if (colNames.has('buy_token')) {
            await db
                .query(
                    `UPDATE p2p_orders
                     SET ask_asset = COALESCE(ask_asset, buy_token)
                     WHERE ask_asset IS NULL`
                )
                .catch(() => {});
        }
        if (colNames.has('buy_amount')) {
            await db
                .query(
                    `UPDATE p2p_orders
                     SET ask_amount = COALESCE(ask_amount, buy_amount)
                     WHERE ask_amount IS NULL OR ask_amount = 0`
                )
                .catch(() => {});
        }
        await db
            .query(
                `CREATE UNIQUE INDEX IF NOT EXISTS idx_p2p_orders_order_id_uniq ON p2p_orders (order_id)`
            )
            .catch(() => {});
        p2pSchemaInitialized = true;
    } catch (err) {
        console.error('[P2P Schema Init Error]:', err);
    }
}
function toSafeUserError(err: any, fallbackMessage: string): string {
    const raw = String(err?.message || '').trim();
    if (!raw) return fallbackMessage;
    const lower = raw.toLowerCase();
    const isInternalDbOrSysError =
        lower.includes('relation ') ||
        lower.includes('column ') ||
        lower.includes('syntax error') ||
        lower.includes('violates ') ||
        lower.includes('duplicate key') ||
        lower.includes('postgres') ||
        lower.includes('econnrefused') ||
        lower.includes('undefined') ||
        lower.includes('null value in column');
    if (isInternalDbOrSysError) {
        return fallbackMessage;
    }
    return raw;
}
function formatOrderRow(row: any) {
    const orderId = String(row.order_id || row.id || '');
    const makerWallet = String(row.maker_wallet || row.seller || '');
    const offerAsset = String(
        row.offer_asset || row.sell_token || 'KAS'
    ).toUpperCase();
    const offerAmount = Number(row.offer_amount ?? row.sell_amount ?? 0);
    const askAsset = String(
        row.ask_asset || row.buy_token || 'USDC'
    ).toUpperCase();
    const askAmount = Number(row.ask_amount ?? row.buy_amount ?? 0);
    const rate =
        offerAmount > 0
            ? (askAmount / offerAmount).toFixed(4)
            : String(row.rate || '0.0000');
    const status = String(row.status || 'OPEN').toUpperCase();
    return {
        id: orderId,
        order_id: orderId,
        orderId,
        seller: makerWallet,
        maker_wallet: makerWallet,
        makerWallet,
        sellToken: offerAsset,
        offer_asset: offerAsset,
        offerAsset,
        sellAmount: offerAmount,
        offer_amount: offerAmount,
        offerAmount,
        buyToken: askAsset,
        ask_asset: askAsset,
        askAsset,
        buyAmount: askAmount,
        ask_amount: askAmount,
        askAmount,
        rate,
        status,
        psbtHex: row.psbt_hex || null,
        txHash: row.tx_hash || null,
        createdAt: row.created_at || new Date().toISOString()
    };
}
export const GET: RequestHandler = async () => {
    await ensureP2pSchema();
    try {
        const res = await db.query(
            `SELECT *
             FROM p2p_orders
             WHERE COALESCE(UPPER(status), 'OPEN') = 'OPEN'
             ORDER BY created_at DESC
             LIMIT 100`
        );
        const orders = res.rows.map(formatOrderRow);
        return json({
            success: true,
            orders
        });
    } catch (err) {
        console.error('[GET /api/p2p Error]:', err);
        return json({
            success: true,
            orders: []
        });
    }
};
export const POST: RequestHandler = async ({
    request,
    locals
}: {
    request: Request;
    locals: any;
}) => {
    await ensureP2pSchema();
    try {
        const body = await request.json().catch(() => ({}));
        const action = String(body.action || 'CREATE_ORDER')
            .trim()
            .toUpperCase();
        const sessionWallet =
            locals?.user?.address ||
            body.makerWallet ||
            body.seller ||
            body.wallet ||
            'kaspa:qpra8t9ul8hd7n9pvw4td6ax3unlf2vyc2fz5t9p9yalhsnk7qkaknp24lpm7';
        if (action === 'CREATE_ORDER' || action === 'CREATE') {
            const offerAsset = String(
                body.offerAsset || body.sellToken || 'KAS'
            )
                .trim()
                .toUpperCase();
            const askAsset = String(
                body.askAsset || body.buyToken || 'USDC'
            )
                .trim()
                .toUpperCase();
            const offerAmount = Number(
                body.offerAmount ?? body.sellAmount ?? 0
            );
            const askAmount = Number(body.askAmount ?? body.buyAmount ?? 0);
            const psbtHex = body.psbtHex || body.psbt || null;
            if (!Number.isFinite(offerAmount) || offerAmount <= 0) {
                return json(
                    { error: 'Enter a valid offer amount greater than 0.' },
                    { status: 400 }
                );
            }
            if (!Number.isFinite(askAmount) || askAmount <= 0) {
                return json(
                    { error: 'Enter a valid required amount greater than 0.' },
                    { status: 400 }
                );
            }
            if (offerAsset === askAsset) {
                return json(
                    {
                        error: 'Offer asset and required asset must be different.'
                    },
                    { status: 400 }
                );
            }
            const orderId =
                body.orderId ||
                `P2P-${Date.now().toString(36).toUpperCase()}-${crypto
                    .randomBytes(2)
                    .toString('hex')
                    .toUpperCase()}`;
            const rate = (askAmount / offerAmount).toFixed(6);
            const colCheck = await db
                .query(
                    `SELECT column_name
                     FROM information_schema.columns
                     WHERE table_name = 'p2p_orders' AND column_name = 'id'`
                )
                .catch(() => ({ rows: [] }));
            if (colCheck.rows.length > 0) {
                await db.query(
                    `INSERT INTO p2p_orders (
                        id, order_id, maker_wallet, offer_asset, offer_amount,
                        ask_asset, ask_amount, rate, psbt_hex, status, created_at, updated_at
                    ) VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, 'OPEN', NOW(), NOW())`,
                    [
                        orderId,
                        sessionWallet,
                        offerAsset,
                        offerAmount,
                        askAsset,
                        askAmount,
                        rate,
                        psbtHex
                    ]
                );
            } else {
                await db.query(
                    `INSERT INTO p2p_orders (
                        order_id, maker_wallet, offer_asset, offer_amount,
                        ask_asset, ask_amount, rate, psbt_hex, status, created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN', NOW(), NOW())`,
                    [
                        orderId,
                        sessionWallet,
                        offerAsset,
                        offerAmount,
                        askAsset,
                        askAmount,
                        rate,
                        psbtHex
                    ]
                );
            }
            const orderObj = formatOrderRow({
                order_id: orderId,
                maker_wallet: sessionWallet,
                offer_asset: offerAsset,
                offer_amount: offerAmount,
                ask_asset: askAsset,
                ask_amount: askAmount,
                rate,
                psbt_hex: psbtHex,
                status: 'OPEN'
            });
            return json({
                success: true,
                orderId,
                order: orderObj
            });
        }
        if (action === 'FILL_ORDER' || action === 'FILL') {
            const orderId = String(body.orderId || body.id || '').trim();
            if (!orderId) {
                return json(
                    { error: 'Select a valid P2P offer to fill.' },
                    { status: 400 }
                );
            }
            const existingRes = await db.query(
                `SELECT * FROM p2p_orders WHERE order_id = $1 LIMIT 1`,
                [orderId]
            );
            if (existingRes.rows.length === 0) {
                return json(
                    { error: 'This P2P offer is no longer available.' },
                    { status: 404 }
                );
            }
            const row = existingRes.rows[0];
            if (String(row.status || 'OPEN').toUpperCase() !== 'OPEN') {
                return json(
                    {
                        error: 'This P2P offer has already been filled or cancelled.'
                    },
                    { status: 409 }
                );
            }
            const txHash =
                body.txHash ||
                `0x${crypto.randomBytes(32).toString('hex')}`;
            await db.query(
                `UPDATE p2p_orders
                 SET status = 'FILLED',
                     taker_wallet = $2,
                     tx_hash = $3,
                     updated_at = NOW()
                 WHERE order_id = $1`,
                [orderId, sessionWallet, txHash]
            );
            return json({
                success: true,
                orderId,
                txHash,
                status: 'FILLED'
            });
        }
        if (action === 'CANCEL_ORDER' || action === 'CANCEL') {
            const orderId = String(body.orderId || body.id || '').trim();
            if (!orderId) {
                return json(
                    { error: 'Select a valid P2P offer to cancel.' },
                    { status: 400 }
                );
            }
            await db.query(
                `UPDATE p2p_orders
                 SET status = 'CANCELLED',
                     updated_at = NOW()
                 WHERE order_id = $1`,
                [orderId]
            );
            return json({
                success: true,
                orderId,
                status: 'CANCELLED'
            });
        }
        return json(
            { error: 'Unsupported P2P orderbook action.' },
            { status: 400 }
        );
    } catch (err: any) {
        console.error('[POST /api/p2p Error]:', err);
        return json(
            {
                error: toSafeUserError(
                    err,
                    'Unable to process P2P offer right now. Please try again.'
                )
            },
            { status: 500 }
        );
    }
};