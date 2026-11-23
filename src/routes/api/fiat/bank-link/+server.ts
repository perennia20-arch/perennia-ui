import { json, type RequestHandler } from '@sveltejs/kit';
import Stripe from 'stripe';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import {
encryptBankRailRecordStrict,
getKycMasterKeyStrict,
normalizeKaspaAddressStrict,
normalizeKaspaBase32Strict
} from '$lib/server/kms';

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
let w = String((locals as any)?.walletAddress || '');
if (!w) {
const s = cookies.get('perennia_session');
if (s) w = (await redis.get(`session:${s}`).catch(() => '')) || '';
}
if (!w) return json({ error: 'UNAUTHORIZED: Unlock your Sovereign Wallet first.' }, { status: 401 });

const cw = normalizeKaspaBase32Strict(w);
const pw = normalizeKaspaAddressStrict(cw);
const sk = String(env.STRIPE_SECRET_KEY || '').trim();
const pk = String(env.PUBLIC_STRIPE_KEY || '').trim();
if (sk.length < 30) return json({ error: 'STRIPE_NOT_CONFIGURED' }, { status: 503 });

await dbPool.query(`ALTER TABLE fiat_bank_rails ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(128)`).catch(() => {});
await dbPool.query(`ALTER TABLE fiat_bank_rails ADD COLUMN IF NOT EXISTS stripe_payment_method_id VARCHAR(128)`).catch(() => {});

const stripe = new Stripe(sk, { apiVersion: '2024-06-20' as any });
if (String(env.ALLOW_DIRECT_STRIPE_PI || "").toLowerCase() !== "true") return json({ error: "Direct bank ACH debit is disabled; use Hosted Crypto Onramp." }, { status: 503 }); const body = await request.json().catch(() => ({}));

try {
if (String(body.action || 'CREATE').toUpperCase().startsWith('CREATE')) {
const ex = await dbPool
.query(`SELECT stripe_customer_id FROM fiat_bank_rails WHERE wallet_address=$1 OR wallet_address=$2 LIMIT 1`, [pw, cw])
.catch(() => ({ rows: [] as any[] }));
let cid = String(ex.rows[0]?.stripe_customer_id || '');
if (cid) {
const c = await stripe.customers.retrieve(cid).catch(() => null);
if (!c || (c as any).deleted) cid = '';
}
if (!cid) {
const created = await stripe.customers.create({
name: `Perennia Sovereign (${cw.slice(0, 10)})`,
metadata: { wallet_address: pw }
});
cid = created.id;
}
const si = await stripe.setupIntents.create({
customer: cid,
payment_method_types: ['us_bank_account'],
payment_method_options: {
us_bank_account: { financial_connections: { permissions: ['payment_method'] } }
},
metadata: { wallet_address: pw }
} as any);
return json({ success: true, setupIntentId: si.id, clientSecret: si.client_secret, customerId: cid, publishableKey: pk });
}

getKycMasterKeyStrict();
const si = await stripe.setupIntents.retrieve(String(body.setupIntentId || ''), { expand: ['payment_method'] });
if (si.metadata?.wallet_address && si.metadata.wallet_address !== pw) {
return json({ error: 'FORBIDDEN: Wallet mismatch.' }, { status: 403 });
}
if (si.status !== 'succeeded') {
return json({ error: `Bank verification incomplete (status: ${si.status}).` }, { status: 400 });
}
const pm: any =
typeof si.payment_method === 'object'
? si.payment_method
: await stripe.paymentMethods.retrieve(String(si.payment_method || ''));
const ub = pm?.us_bank_account || {};
const label = String(ub.bank_name || 'Verified ACH Bank').trim();
const last4 = String(ub.last4 || '0000').replace(/\D/g, '').slice(-4) || '0000';
const acctType: 'CHECKING' | 'SAVINGS' =
String(ub.account_type || '').toUpperCase() === 'SAVINGS' ? 'SAVINGS' : 'CHECKING';
const rn = String(ub.routing_number || '').replace(/\D/g, '');
if (rn.length !== 9) return json({ error: "Full 9-digit routing number unavailable." }, { status: 400 }); const enc = encryptBankRailRecordStrict({
routingNumber: rn,
accountNumber: `000000${last4}`,
bankLabel: label,
accountType: acctType,
payoutMethod: 'ACH'
});
const cid = typeof si.customer === 'string' ? si.customer : String((si.customer as any)?.id || '');

await dbPool.query(
`INSERT INTO fiat_bank_rails (wallet_address,bank_label,account_type,payout_method,bank_last4,encrypted_rail_payload,stripe_customer_id,stripe_payment_method_id,updated_at)
 VALUES ($1,$2,$3,'ACH',$4,$5,$6,$7,CURRENT_TIMESTAMP)
 ON CONFLICT (wallet_address) DO UPDATE SET
   bank_label=EXCLUDED.bank_label, account_type=EXCLUDED.account_type, payout_method='ACH',
   bank_last4=EXCLUDED.bank_last4, encrypted_rail_payload=EXCLUDED.encrypted_rail_payload,
   stripe_customer_id=EXCLUDED.stripe_customer_id, stripe_payment_method_id=EXCLUDED.stripe_payment_method_id,
   updated_at=CURRENT_TIMESTAMP`,
[pw, label, acctType, last4, enc, cid || null, pm.id]
);
await redis.set(`perennia:fiat:bank_rail:${cw}`, enc, 'EX', 2592000).catch(() => {});
return json({ success: true, stripeVerified: true, bankLabel: label, bankLast4: last4, accountType: acctType });
} catch (e: any) {
return json({ error: e?.message || 'Stripe bank verification failed.' }, { status: 400 });
}
};
export const GET: RequestHandler = async ({ url, cookies, locals }) => {
	if (url.searchParams.get('pk') === '1') return json({ publishableKey: (env.PUBLIC_STRIPE_KEY || '').trim() });
	let w = String((locals as any)?.walletAddress || '');
	if (!w) { const s = cookies.get('perennia_session'); if (s) w = (await redis.get(`session:${s}`).catch(() => '')) || ''; }
	if (!w) return json({ authenticated: false, stripeVerifiedAch: false });
	const cw = normalizeKaspaBase32Strict(w), pw = normalizeKaspaAddressStrict(cw);
	const q = await dbPool.query(`SELECT bank_label,account_type,bank_last4,stripe_customer_id,stripe_payment_method_id FROM fiat_bank_rails WHERE wallet_address=$1 OR wallet_address=$2 ORDER BY updated_at DESC LIMIT 1`, [pw, cw]).catch(() => ({ rows: [] as any[] }));
	const row = q.rows[0];
	return json({ authenticated: true, publishableKey: String(env.PUBLIC_STRIPE_KEY || '').trim(), stripeVerifiedAch: Boolean(row?.stripe_customer_id && row?.stripe_payment_method_id), bankLabel: row?.bank_label || null, bankLast4: row?.bank_last4 || null, accountType: row?.account_type || 'CHECKING' });
};
