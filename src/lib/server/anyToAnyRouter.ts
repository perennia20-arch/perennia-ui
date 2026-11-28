import { redis } from '$lib/server/redis';
import { dbPool } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import { normalizeKaspaAddressStrict } from '$lib/server/kms';
import { executeOrQueueL1Dispatch } from '$lib/server/l1Dispatcher';
import {
	formatAtomicToDecimal,
	parseDecimalToAtomic,
	parseSompiU64
} from '$lib/crypto/atomicMath';

type QueryableClient = {
	query: (text: string, values?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
};

const KNOWN_SYNTHETIC_RWAS = new Set([
'NVDA','SPY','QQQ','AAPL','MSFT','TSLA','AMZN','GOOGL','META','AMD','TSM','AVGO','XLE','COIN','MSTR',
'XAU','XAG','WTI','USTB','TLT','SGOV','SHY','IEF','BND','AGG','BIL','TIP','LQD','HYG','MUB','GOVT',
'VGSH','VGIT','VGLT','GLD','SLV','USO','UNG','PPLT','DBA','VOO','IVV','VTI','DIA','IWM','XLK','XLF','XLV'
]);
const KNOWN_KASPA_KRC20 = new Set(['SILO','PERX','BEDRCK','NACHO','KASPY','KASPER','ZEAL','KANGO','KONAN','SOMPS']);
const DYNAMIC_SYNTHETIC_RWAS = new Set<string>();
const DYNAMIC_KASPA_KRC20 = new Set<string>();
const inflightSpotDiscoveries = new Map<string, Promise<number>>();

function applyDiscoveredClassification(clean: string, meta: any): void {
if (!clean || !meta || typeof meta !== 'object') return;
const cls = String(meta.assetClass || '').trim().toUpperCase();
const net = String(meta.network || '').trim().toUpperCase();
const sources: string[] = Array.isArray(meta.sources) ? meta.sources.map((s: any) => String(s)) : [];
if (meta.isKrc20 === true || (net === 'KAS' && ['ECOSYSTEM','KRC20','PERENNIA_FORGE'].includes(cls))) {
DYNAMIC_KASPA_KRC20.add(clean); DYNAMIC_SYNTHETIC_RWAS.delete(clean); return;
}
if (meta.isKrc20 === false && (['TOKENIZED ASSET','EQUITY','ETF','BOND','TREASURY','COMMODITY','RWA','MUTUALFUND'].includes(cls) || sources.some((s) => /Yahoo Finance|Pyth RWA/i.test(s)))) {
DYNAMIC_SYNTHETIC_RWAS.add(clean);
}
}
async function syncDynamicAssetMetaFromRedis(ticker: string): Promise<void> {
const clean = String(ticker || '').trim().toUpperCase();
if (!clean || ['KAS','USD','USDC','USDT'].includes(clean)) return;
try { const raw = await redis.get(`oracle:dynamic_meta:${clean}`); if (raw) applyDiscoveredClassification(clean, JSON.parse(raw)); } catch {}
}
async function discoverExactTickerOnDemandUsd(clean: string): Promise<number> {
if (!/^[A-Z0-9.-]{2,14}$/.test(clean)) return 0;
const ex = inflightSpotDiscoveries.get(clean); if (ex) return ex;
const job = (async () => {
try {
const port = String(process.env.PORT || '3000').trim() || '3000';
const res = await fetch(`http://127.0.0.1:${port}/api/prices?discover=${encodeURIComponent(clean)}&register=1`, {
headers: { accept: 'application/json', 'x-perennia-internal-sor': '1' }, signal: AbortSignal.timeout(5500)
});
if (!res.ok) return 0;
const data = await res.json().catch(() => null);
if (!data?.success) return 0;
const cands: any[] = [...(data?.asset ? [data.asset] : []), ...(Array.isArray(data?.matches) ? data.matches : [])];
const exact = cands.find((i) => String(i?.ticker || '').trim().toUpperCase() === clean && Number(i?.spotPrice || 0) > 0);
if (!exact) return 0;
applyDiscoveredClassification(clean, exact);
const spot = Number(exact.spotPrice);
if (Number.isFinite(spot) && spot > 0) { await redis.set(`oracle:spot:${clean}_USDC`, String(spot), 'EX', 90).catch(() => {}); return spot; }
return 0;
} catch { return 0; } finally { inflightSpotDiscoveries.delete(clean); }
})();
inflightSpotDiscoveries.set(clean, job);
return job;
}

const CHANGENOW_CHAIN_MAP: Record<string, { ticker: string; network: string }> = {
	KAS: { ticker: 'kas', network: 'kas' },
	BTC: { ticker: 'btc', network: 'btc' },
	ETH: { ticker: 'eth', network: 'eth' },
	USDC: { ticker: 'usdc', network: 'eth' },
	USDT: { ticker: 'usdt', network: 'eth' },
	SOL: { ticker: 'sol', network: 'sol' },
	XRP: { ticker: 'xrp', network: 'xrp' },
	DOGE: { ticker: 'doge', network: 'doge' },
	SUI: { ticker: 'sui', network: 'sui' },
	ADA: { ticker: 'ada', network: 'ada' },
	AVAX: { ticker: 'avax', network: 'cchain' },
	TON: { ticker: 'ton', network: 'ton' },
	ZEC: { ticker: 'zec', network: 'zec' },
	BNB: { ticker: 'bnb', network: 'bsc' },
	POL: { ticker: 'pol', network: 'matic' },
	MATIC: { ticker: 'matic', network: 'matic' }
};

let settledLegsSchemaReady: Promise<void> | null = null;

async function ensureSettledOnchainLegsSchema(): Promise<void> {
	if (!settledLegsSchemaReady) {
		settledLegsSchemaReady = dbPool
			.query(`
				CREATE TABLE IF NOT EXISTS sor_settled_onchain_legs (
					tx_id TEXT NOT NULL,
					pay_asset TEXT NOT NULL,
					wallet_address TEXT NOT NULL,
					receive_asset TEXT NOT NULL,
					pay_amount NUMERIC(28, 8) NOT NULL,
					gross_usd NUMERIC(20, 6) NOT NULL,
					settlement_address TEXT,
					changenow_exchange_id TEXT,
					verification_state TEXT NOT NULL DEFAULT 'VERIFIED',
					created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
					PRIMARY KEY (tx_id, pay_asset)
				);
			`)
			.then(() => undefined)
			.catch((err) => {
				settledLegsSchemaReady = null;
				throw err;
			});
	}
	return settledLegsSchemaReady;
}

export function isSyntheticRwaAsset(ticker: string): boolean { const clean = String(ticker || '').trim().toUpperCase(); return KNOWN_SYNTHETIC_RWAS.has(clean) || DYNAMIC_SYNTHETIC_RWAS.has(clean); }
export function isKaspaNativeOrKrc20(ticker: string): boolean { const clean = String(ticker || '').trim().toUpperCase(); return clean === 'KAS' || KNOWN_KASPA_KRC20.has(clean) || DYNAMIC_KASPA_KRC20.has(clean); }

export function resolveMasterKaspaTreasuryAddress(): string {
	const candidates = [
		env.PERENNIA_HOT_WALLET_1_ADDRESS,
		env.HOT_WALLET_1_ADDRESS,
		env.PERENNIA_HOT_KAS_ADDRESS,
		env.PERENNIA_MASTER_TREASURY_KAS_ADDRESS,
		env.MASTER_TREASURY_ADDRESS,
		'kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579'
	];
	for (const raw of candidates) {
		const trimmed = String(raw || '').trim();
		if (!trimmed) continue;
		try {
			const normalized = normalizeKaspaAddressStrict(trimmed);
			if (normalized && normalized.startsWith('kaspa:')) return normalized;
		} catch {
			if (trimmed.startsWith('kaspa:') && trimmed.length >= 48) return trimmed;
		}
	}
	return 'kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579';
}

function resolveConfiguredNativeVaultAddress(ticker: string): string {
	const clean = String(ticker || '').trim().toUpperCase();
	if (isKaspaNativeOrKrc20(clean)) return resolveMasterKaspaTreasuryAddress();

	const evmVault = String(
		env.PERENNIA_HOT_ETH_ADDRESS ||
			env.PERENNIA_CORP_EVM_ADDRESS ||
			env.PERENNIA_COLD_ETH_ADDRESS ||
			''
	).trim();

	if (['ETH', 'USDC', 'USDT', 'AVAX', 'BNB', 'POL', 'MATIC', 'ARB', 'OP', 'BASE'].includes(clean)) {
		return /^0x[a-fA-F0-9]{40}$/.test(evmVault) ? evmVault : '';
	}
	if (clean === 'BTC') {
		const addr = String(env.PERENNIA_HOT_BTC_ADDRESS || env.PERENNIA_COLD_BTC_ADDRESS || '').trim();
		return /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/.test(addr) && !addr.includes('wholesalerouter') ? addr : '';
	}
	if (clean === 'SOL') {
		const addr = String(env.PERENNIA_HOT_SOL_ADDRESS || env.PERENNIA_COLD_SOL_ADDRESS || '').trim();
		return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr) ? addr : '';
	}
	if (clean === 'XRP') {
		const addr = String(env.PERENNIA_HOT_XRP_ADDRESS || env.PERENNIA_COLD_XRP_ADDRESS || '').trim();
		return /^r[1-9A-HJ-NP-Za-km-z]{24,35}$/.test(addr) ? addr : '';
	}
	if (clean === 'DOGE') {
		const addr = String(env.PERENNIA_HOT_DOGE_ADDRESS || env.PERENNIA_COLD_DOGE_ADDRESS || '').trim();
		return /^D[5-9A-HJ-NP-U][1-9A-HJ-NP-Za-km-z]{32}$/.test(addr) ? addr : '';
	}
	if (clean === 'SUI') {
		const addr = String(env.PERENNIA_HOT_SUI_ADDRESS || env.PERENNIA_COLD_SUI_ADDRESS || '').trim();
		return /^0x[a-fA-F0-9]{64}$/.test(addr) ? addr : '';
	}
	if (clean === 'ADA') {
		const addr = String(env.PERENNIA_HOT_ADA_ADDRESS || env.PERENNIA_COLD_ADA_ADDRESS || '').trim();
		return /^addr1[a-z0-9]{50,110}$/.test(addr) ? addr : '';
	}
	if (clean === 'TON') {
		const addr = String(env.PERENNIA_HOT_TON_ADDRESS || env.PERENNIA_COLD_TON_ADDRESS || '').trim();
		return addr.length >= 46 ? addr : '';
	}
	if (clean === 'ZEC') {
		const addr = String(env.PERENNIA_HOT_ZEC_ADDRESS || env.PERENNIA_COLD_ZEC_ADDRESS || '').trim();
		return /^t1[a-zA-Z0-9]{33}$/.test(addr) ? addr : '';
	}
	return '';
}

export async function resolveOffHoursAwareSpotUsd(ticker: string): Promise<number> {
const clean = String(ticker || '').trim().toUpperCase();
if (!clean) return 0;
if (clean === 'USD') return 1.0;
if (clean === 'USDC' || clean === 'USDT') {
const depeg = await redis.get(`oracle:depeg_halt:${clean}`).catch(() => null);
if (depeg === '1' || String(depeg || '').toLowerCase() === 'true') return 0;
const parityRaw = await redis.get(`oracle:spot:${clean}_USD`).catch(() => null);
const parity = parityRaw ? parseFloat(parityRaw) : 1.0;
return Number.isFinite(parity) && parity > 0.99 && parity < 1.01 ? parity : 1.0;
}
await syncDynamicAssetMetaFromRedis(clean);
for (const k of [`oracle:spot:${clean}_USD`, `krc20:spot:${clean}_USD`, `oracle:last_close:${clean}_USDC`]) {
const raw = await redis.get(k).catch(() => null);
if (raw) { const val = parseFloat(raw); if (Number.isFinite(val) && val > 0) { await redis.set(`oracle:spot:${clean}_USDC`, String(val), 'EX', 120).catch(() => {}); return val; } }
}
try {
const dbRes = await dbPool.query(`SELECT price_usd FROM rwa_oracle_feeds WHERE ticker = $1 AND price_usd > 0 ORDER BY updated_at DESC LIMIT 1`, [clean]);
if (dbRes.rows.length > 0) { const p = Number(dbRes.rows[0].price_usd || 0); if (Number.isFinite(p) && p > 0) { DYNAMIC_SYNTHETIC_RWAS.add(clean); await redis.set(`oracle:spot:${clean}_USDC`, String(p), 'EX', 120).catch(() => {}); return p; } }
} catch {}
const disc = await discoverExactTickerOnDemandUsd(clean);
return disc > 0 ? disc : 0;
}
export async function prewarmSorSpotCache(tickers: string[], resolveSpotFn: (ticker: string) => Promise<number>): Promise<void> {
const unique = Array.from(new Set(tickers.map((t) => String(t || '').trim().toUpperCase()).filter(Boolean)));
await Promise.all(unique.map(async (t) => {
await syncDynamicAssetMetaFromRedis(t);
const p = await resolveSpotFn(t).catch(() => 0);
if (Number.isFinite(p) && p > 0) await redis.set(`oracle:spot:${t}_USDC`, String(p), 'EX', 90).catch(() => {});
await syncDynamicAssetMetaFromRedis(t);
}));
}
export async function prepareAnyToAnyInboundLeg(params: {
cleanWallet: string; prefixedWallet: string; payAsset: string; receiveAsset: string; amount: number;
resolveSpotUsd: (ticker: string) => Promise<number>; deliveryMode?: string; destinationAddress?: string;
}): Promise<{ status: number; payload: Record<string, any> }> {
const pay = String(params.payAsset || '').trim().toUpperCase();
const rec = String(params.receiveAsset || '').trim().toUpperCase();
const [paySpot, recSpot] = await Promise.all([params.resolveSpotUsd(pay), params.resolveSpotUsd(rec)]);
await Promise.all([syncDynamicAssetMetaFromRedis(pay), syncDynamicAssetMetaFromRedis(rec)]);
if (isSyntheticRwaAsset(pay)) {
return { status: 400, payload: { error: `${pay} settles directly from your Perennia Vault balance rather than an external blockchain.` } };
}
	if (paySpot <= 0 || recSpot <= 0) {
		return {
			status: 503,
			payload: {
				error: `ORACLE_HALT: Live oracle spot price for ${paySpot <= 0 ? pay : rec} is offline.`
			}
		};
	}

	const grossUsd = params.amount * paySpot;
	if (grossUsd < 1.0) {
		return {
			status: 400,
			payload: {
				error: `ANTI_DUST_FLOOR: Minimum swap value is $1.00 USD (submitted $${grossUsd.toFixed(2)} USD).`
			}
		};
	}

	const masterKasAddress = resolveMasterKaspaTreasuryAddress();

	if (isKaspaNativeOrKrc20(pay)) {
		await redis
			.set(
				`sor:inbound_intent:${params.cleanWallet}:${pay}`,
				JSON.stringify({
					settlementAddress: masterKasAddress,
					changenowExchangeId: null,
					expectedAmount: params.amount,
					receiveAsset: rec,
					createdAt: Date.now()
				}),
				'EX',
				1800
			)
			.catch(() => {});

		return {
			status: 200,
			payload: {
				success: true,
				settlementAddress: masterKasAddress,
				network: 'KAS',
				bridgeMode: 'DIRECT_KASPA_SOVEREIGN',
				changenowExchangeId: null
			}
		};
	}

	const apiKey = String(env.CHANGENOW_API_KEY || '').trim();
	const fromSpec = CHANGENOW_CHAIN_MAP[pay];

	if (apiKey && fromSpec) {
		try {
			const bridgeRes = await fetch('https://api.changenow.io/v2/exchange', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'x-changenow-api-key': apiKey
				},
				body: JSON.stringify({
					fromCurrency: fromSpec.ticker,
					toCurrency: 'kas',
					fromNetwork: fromSpec.network,
					toNetwork: 'kas',
					fromAmount: String(params.amount),
					address: masterKasAddress,
					flow: 'standard'
				}),
				signal: AbortSignal.timeout(7000)
			});
			const bridgeData = await bridgeRes.json().catch(() => ({}));
			const payinAddress = String(bridgeData?.payinAddress || '').trim();
			const exchangeId = String(bridgeData?.id || '').trim();

			if (bridgeRes.ok && payinAddress && exchangeId) {
				await redis
					.set(
						`sor:inbound_intent:${params.cleanWallet}:${pay}`,
						JSON.stringify({
							settlementAddress: payinAddress,
							changenowExchangeId: exchangeId,
							expectedAmount: params.amount,
							receiveAsset: rec,
							createdAt: Date.now()
						}),
						'EX',
						1800
					)
					.catch(() => {});

				return {
					status: 200,
					payload: {
						success: true,
						settlementAddress: payinAddress,
						network: pay,
						bridgeMode: 'CHANGENOW_V2_ANCHOR',
						changenowExchangeId: exchangeId
					}
				};
			}
		} catch {
			// Fall through to native corporate vault check
		}
	}

	const nativeCorpVault = resolveConfiguredNativeVaultAddress(pay);
	if (nativeCorpVault) {
		await redis
			.set(
				`sor:inbound_intent:${params.cleanWallet}:${pay}`,
				JSON.stringify({
					settlementAddress: nativeCorpVault,
					changenowExchangeId: null,
					expectedAmount: params.amount,
					receiveAsset: rec,
					createdAt: Date.now()
				}),
				'EX',
				1800
			)
			.catch(() => {});

		return {
			status: 200,
			payload: {
				success: true,
				settlementAddress: nativeCorpVault,
				network: pay,
				bridgeMode: 'DIRECT_CORP_VAULT',
				changenowExchangeId: null
			}
		};
	}

	return {
		status: 422,
		payload: {
			error: `Cross-chain inbound route for ${params.amount} ${pay} ($${grossUsd.toFixed(2)}) is below bridge minimum or lacks an active ${pay} deposit vault.`
		}
	};
}

function isPlausibleChainTxId(asset: string, txId: string): boolean {
	const clean = String(asset || '').trim().toUpperCase();
	const hash = String(txId || '').trim();
	if (hash.length < 24 || /mock|fake|test_invalid/i.test(hash)) return false;

	if (['ETH', 'USDC', 'USDT', 'AVAX', 'BNB', 'POL', 'MATIC', 'ARB', 'OP', 'BASE'].includes(clean)) {
		return /^0x[a-fA-F0-9]{64}$/.test(hash);
	}
	if (isKaspaNativeOrKrc20(clean) || ['BTC', 'DOGE', 'ZEC', 'XRP', 'ADA'].includes(clean)) {
		return /^[a-fA-F0-9]{64}$/.test(hash);
	}
	if (clean === 'SOL') {
		return /^[1-9A-HJ-NP-Za-km-z]{64,92}$/.test(hash);
	}
	return hash.length >= 32;
}

export async function verifyAndLockInboundOnchainLeg(
	client: QueryableClient,
	params: {
		txId: string;
		cleanWallet: string;
		prefixedWallet: string;
		payAsset: string;
		receiveAsset: string;
		amount: number;
		grossUsd: number;
		changenowExchangeId?: string | null;
		settlementAddress?: string | null;
	}
): Promise<{ ok: true; verificationState: string } | { ok: false; status: number; error: string }> {
	const pay = String(params.payAsset || '').trim().toUpperCase();
	const cleanTxId = String(params.txId || '').trim();

	if (!cleanTxId || !isPlausibleChainTxId(pay, cleanTxId)) {
		return {
			ok: false,
			status: 400,
			error: `INVALID_ONCHAIN_TX_ID: Submitted ${pay} transaction hash is malformed.`
		};
	}

	await ensureSettledOnchainLegsSchema();

	const intentRaw = await redis
		.get(`sor:inbound_intent:${params.cleanWallet}:${pay}`)
		.catch(() => null);
	let trustedSettlementAddr = '';
	let expectedExchangeId = String(params.changenowExchangeId || '').trim();
	if (intentRaw) {
		try {
			const parsed = JSON.parse(intentRaw);
			if (parsed?.settlementAddress) {
				trustedSettlementAddr = String(parsed.settlementAddress);
			}
			if (!expectedExchangeId && parsed?.changenowExchangeId) {
				expectedExchangeId = String(parsed.changenowExchangeId);
			}
		} catch {
			// Ignore malformed cache
		}
	}

	let verificationState = '';

if (pay === 'KAS') {
const targetKasAddr = trustedSettlementAddr || resolveMasterKaspaTreasuryAddress();
let kasVerified = false;
for (let attempt = 0; attempt < 8; attempt++) {
try {
const res = await fetch(
`https://api.kaspa.org/transactions/${encodeURIComponent(cleanTxId)}?inputs=false&outputs=true`,
{ signal: AbortSignal.timeout(2500) }
);
if (res.ok) {
const txData = await res.json().catch(() => null);
const outputs = Array.isArray(txData?.outputs) ? txData.outputs : [];
if (outputs.length > 0) {
let paidSompi = 0n;
for (const out of outputs) {
if (String(out?.script_public_key_address || '').trim() === targetKasAddr) {
paidSompi += parseSompiU64(String(out?.amount ?? '0'));
}
}
if (paidSompi <= 0n) {
return { ok: false, status: 403, error: `ONCHAIN_RECIPIENT_MISMATCH: Kaspa tx ${cleanTxId.slice(0, 12)}... did not pay Perennia vault.` };
}
const expectedSompi = parseDecimalToAtomic(params.amount.toFixed(8), 8, 'floor');
const minAcceptableSompi = (expectedSompi * 9800n) / 10_000n;
const bufferSompi = 5_000_000n;
if (paidSompi + bufferSompi < minAcceptableSompi) {
return { ok: false, status: 422, error: `UNDERPAID_ONCHAIN_TX: Expected ${params.amount.toFixed(4)} KAS, found ${formatAtomicToDecimal(paidSompi, 8)} KAS.` };
}
verificationState = 'KASPA_L1_OUTPUT_VERIFIED';
kasVerified = true;
break;
}
}
} catch {}
if (attempt < 7) await new Promise((r) => setTimeout(r, 650));
}
if (!kasVerified) {
return { ok: false, status: 422, error: `UNVERIFIED_KASPA_L1_TX: Kaspa tx ${cleanTxId.slice(0, 12)}... is not yet confirmed on L1.` };
}
} else if (expectedExchangeId) {
if (!env.CHANGENOW_API_KEY) {
return { ok: false, status: 503, error: 'BRIDGE_VERIFIER_OFFLINE: Missing bridge verification key.' };
}
const cnRes = await fetch(
`https://api.changenow.io/v2/exchange/by-id?id=${encodeURIComponent(expectedExchangeId)}`,
{ headers: { 'x-changenow-api-key': String(env.CHANGENOW_API_KEY).trim() }, signal: AbortSignal.timeout(3500) }
).catch(() => null);
if (!cnRes || !cnRes.ok) {
return { ok: false, status: 503, error: `BRIDGE_VERIFICATION_UNAVAILABLE: Unable to verify order ${expectedExchangeId}.` };
}
const cnData = await cnRes.json().catch(() => null);
const st = String(cnData?.status || '').toLowerCase();
if (st === 'failed' || st === 'refunded' || st === 'expired') {
return { ok: false, status: 422, error: `BRIDGE_ORDER_REJECTED: Cross-chain order ${expectedExchangeId} status is ${st}.` };
}
if (st !== 'finished') {
return { ok: false, status: 202, error: `BRIDGE_SETTLEMENT_PENDING: Cross-chain deposit (${expectedExchangeId}) is currently '${st || 'confirming'}'.` };
}
verificationState = 'BRIDGE_FINISHED_VERIFIED';
} else if (pay === 'BTC' && trustedSettlementAddr) {
const btcRes = await fetch(`https://mempool.space/api/tx/${encodeURIComponent(cleanTxId)}`, { signal: AbortSignal.timeout(3500) }).catch(() => null);
if (!btcRes || !btcRes.ok) {
return { ok: false, status: 422, error: `UNVERIFIED_BTC_TX: Bitcoin tx ${cleanTxId.slice(0, 12)}... not found on mempool.` };
}
const btcData = await btcRes.json().catch(() => null);
let paidSats = 0n;
for (const vout of Array.isArray(btcData?.vout) ? btcData.vout : []) {
if (String(vout?.scriptpubkey_address || '').trim() === trustedSettlementAddr) paidSats += parseSompiU64(String(vout?.value ?? '0'));
}
const expectedSats = parseDecimalToAtomic(params.amount.toFixed(8), 8, 'floor');
if (paidSats < (expectedSats * 9800n) / 10_000n) {
return { ok: false, status: 422, error: `UNDERPAID_BTC_TX: Expected ${params.amount} BTC to Perennia vault.` };
}
verificationState = 'BTC_L1_OUTPUT_VERIFIED';
} else {
return { ok: false, status: 422, error: `UNVERIFIED_EXTERNAL_L1_TX: Direct unbridged ${pay} L1 settlement requires verified bridge receipt.` };
}
	const lockRes = await client.query(
		`INSERT INTO sor_settled_onchain_legs (
			tx_id, pay_asset, wallet_address, receive_asset, pay_amount,
			gross_usd, settlement_address, changenow_exchange_id, verification_state
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (tx_id, pay_asset) DO NOTHING
		RETURNING tx_id`,
		[
			cleanTxId,
			pay,
			params.prefixedWallet,
			String(params.receiveAsset || '').trim().toUpperCase(),
			params.amount,
			params.grossUsd,
			trustedSettlementAddr || resolveConfiguredNativeVaultAddress(pay) || null,
			expectedExchangeId || null,
			verificationState
		]
	);

	if (!lockRes.rows || lockRes.rows.length === 0) {
		return {
			ok: false,
			status: 409,
			error: `DUPLICATE_ONCHAIN_TX: Transaction ${cleanTxId.slice(0, 14)}... has already been settled.`
		};
	}

	return { ok: true, verificationState };
}

export async function consumeHifoLotsOnDisposal(
	client: QueryableClient,
	prefixedWallet: string,
	cleanWallet: string,
	payAsset: string,
	disposeTokens: number,
	grossProceedsUsd: number
): Promise<{ costBasisUsd: number; realizedGainLossUsd: number; holdingPeriod: 'SHORT_TERM' | 'LONG_TERM' }> {
	try {
		const lotsRes = await client.query(
			`SELECT ctid::text AS row_ctid, remaining_tokens, remaining_sompi, fmv_usd_per_token
			 FROM hifo_tax_lots
			 WHERE wallet_address IN ($1, $2)
			   AND asset_ticker = $3
			   AND remaining_tokens > 0
			 ORDER BY fmv_usd_per_token DESC`,
			[prefixedWallet, cleanWallet, payAsset]
		);

		if (!lotsRes.rows || lotsRes.rows.length === 0) {
			return { costBasisUsd: grossProceedsUsd, realizedGainLossUsd: 0.0, holdingPeriod: 'SHORT_TERM' };
		}

		let remToDispose = disposeTokens;
		let accumulatedBasisUsd = 0;

		for (const lot of lotsRes.rows) {
			if (remToDispose <= 1e-9) break;
			const avail = Number(lot.remaining_tokens || 0);
			if (avail <= 0) continue;
			const fmv = Number(lot.fmv_usd_per_token || 0);
			const take = Math.min(avail, remToDispose);
			const newRemTokens = Math.max(0, avail - take);
			const ratio = avail > 0 ? newRemTokens / avail : 0;
			const newRemSompi = Math.round(Number(lot.remaining_sompi || 0) * ratio);

			accumulatedBasisUsd += take * fmv;
			remToDispose -= take;

			await client.query(
				`UPDATE hifo_tax_lots
				 SET remaining_tokens = $1,
				     remaining_sompi = $2
				 WHERE ctid = $3::tid`,
				[newRemTokens, newRemSompi, lot.row_ctid]
			);
		}

		if (remToDispose > 1e-6 && disposeTokens > 0) {
			const fallbackSpot = grossProceedsUsd / disposeTokens;
			accumulatedBasisUsd += remToDispose * fallbackSpot;
		}

		const costBasisUsd = Number(accumulatedBasisUsd.toFixed(6));
		const realizedGainLossUsd = Number((grossProceedsUsd - costBasisUsd).toFixed(6));
		return { costBasisUsd, realizedGainLossUsd, holdingPeriod: 'SHORT_TERM' };
	} catch {
		return { costBasisUsd: grossProceedsUsd, realizedGainLossUsd: 0.0, holdingPeriod: 'SHORT_TERM' };
	}
}

export async function maybeDispatchOutboundSwapL1(params: {
	prefixedWallet: string;
	cleanWallet: string;
	receiveAsset: string;
	estimatedOutput: number;
	receiveSpot: number;
	destinationAddress?: string;
}): Promise<{
	dispatched: boolean;
	status: string;
	txHash: string;
	explorerUrl: string;
	fallbackCreditedToVault: boolean;
}> {
	const rec = String(params.receiveAsset || '').trim().toUpperCase();
await syncDynamicAssetMetaFromRedis(rec);
const dest = isSyntheticRwaAsset(rec) ? '' : String(params.destinationAddress || '').trim() || (isKaspaNativeOrKrc20(rec) ? params.prefixedWallet : '');

	if (dest) {
		try {
			const dispatchRes = await executeOrQueueL1Dispatch({
				wallet: params.prefixedWallet,
				destinationAddress: dest,
				asset: rec,
				amount: params.estimatedOutput,
				sourceType: 'SOR_ANY_TO_ANY_SWAP',
				spotPrice: params.receiveSpot
			});
			if (dispatchRes.success) {
				return {
					dispatched: true,
					status: dispatchRes.status,
					txHash: dispatchRes.txHash,
					explorerUrl: dispatchRes.explorerUrl,
					fallbackCreditedToVault: false
				};
			}
		} catch {
			// Fall through to queued L1 status
		}
	}

	return {
		dispatched: false,
		status: 'QUEUED_FOR_L1_DISPATCH',
		txHash: '',
		explorerUrl: '',
		fallbackCreditedToVault: false
	};
}
