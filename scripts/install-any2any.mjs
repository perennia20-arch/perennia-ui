import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const log = [];

function findFile(dir, targetName) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules' || entry.name === '.svelte-kit' || entry.name === '.git') continue;
			const hit = findFile(full, targetName);
			if (hit) return hit;
		} else if (entry.name === targetName) {
			return full;
		}
	}
	return null;
}

function backupAndWrite(filePath, content) {
	const bak = `${filePath}.any2any.bak`;
	if (!fs.existsSync(bak) && fs.existsSync(filePath)) {
		fs.copyFileSync(filePath, bak);
	}
	fs.writeFileSync(filePath, content, 'utf8');
}

// 1. Write src/lib/server/anyToAnyRouter.ts
const routerPath = path.join(root, 'src/lib/server/anyToAnyRouter.ts');
const routerCode = `import { redis } from '$lib/server/redis';
import { dbPool } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import { normalizeKaspaAddressStrict } from '$lib/server/kms';
import { computeReservoirHmac, executeOrQueueL1Dispatch } from '$lib/server/l1Dispatcher';

type QueryableClient = {
	query: (text: string, values?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
};

const KNOWN_SYNTHETIC_RWAS = new Set([
	'NVDA', 'SPY', 'QQQ', 'AAPL', 'MSFT', 'TSLA', 'AMZN', 'GOOGL', 'META',
	'AMD', 'COIN', 'MSTR', 'XAU', 'XAG', 'WTI', 'USTB', 'TLT', 'GLD', 'SLV'
]);

const KNOWN_KASPA_KRC20 = new Set([
	'SILO', 'PERX', 'BEDRCK', 'NACHO', 'KASPY', 'KASPER', 'ZEAL', 'KANGO', 'KONAN', 'SOMPS'
]);

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
			.query(\`
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
			\`)
			.then(() => undefined)
			.catch((err) => {
				settledLegsSchemaReady = null;
				throw err;
			});
	}
	return settledLegsSchemaReady;
}

export function isSyntheticRwaAsset(ticker: string): boolean {
	return KNOWN_SYNTHETIC_RWAS.has(String(ticker || '').trim().toUpperCase());
}

export function isKaspaNativeOrKrc20(ticker: string): boolean {
	const clean = String(ticker || '').trim().toUpperCase();
	return clean === 'KAS' || KNOWN_KASPA_KRC20.has(clean);
}

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
	if (clean === 'USD' || clean === 'USDC' || clean === 'USDT') {
		await redis.set(\`oracle:spot:\${clean}_USDC\`, '1', 'EX', 300).catch(() => {});
		return 1.0;
	}

	const altKeys = [
		\`oracle:spot:\${clean}_USD\`,
		\`krc20:spot:\${clean}_USD\`,
		\`oracle:last_close:\${clean}_USDC\`
	];
	for (const k of altKeys) {
		const raw = await redis.get(k).catch(() => null);
		if (raw) {
			const val = parseFloat(raw);
			if (Number.isFinite(val) && val > 0) {
				await redis.set(\`oracle:spot:\${clean}_USDC\`, String(val), 'EX', 120).catch(() => {});
				return val;
			}
		}
	}

	try {
		const dbRes = await dbPool.query(
			\`SELECT price_usd
			 FROM rwa_oracle_feeds
			 WHERE ticker = $1
			   AND price_usd > 0
			 ORDER BY updated_at DESC
			 LIMIT 1\`,
			[clean]
		);
		if (dbRes.rows.length > 0) {
			const price = Number(dbRes.rows[0].price_usd || 0);
			if (Number.isFinite(price) && price > 0) {
				await redis.set(\`oracle:spot:\${clean}_USDC\`, String(price), 'EX', 120).catch(() => {});
				return price;
			}
		}
	} catch {
		// Continue to ecosystem token fallbacks
	}

	if (clean === 'PERX' || clean === 'BEDRCK') {
		const kasRaw = await redis.get('oracle:spot:KAS_USDC').catch(() => null);
		const kasUsd = kasRaw ? parseFloat(kasRaw) : 0;
		if (Number.isFinite(kasUsd) && kasUsd > 0) {
			const ratio = clean === 'PERX' ? 0.1 : 0.01;
			const derived = Number((kasUsd * ratio).toFixed(6));
			await redis.set(\`oracle:spot:\${clean}_USDC\`, String(derived), 'EX', 60).catch(() => {});
			return derived;
		}
	}

	return 0;
}

export async function prewarmSorSpotCache(
	tickers: string[],
	resolveSpotFn: (ticker: string) => Promise<number>
): Promise<void> {
	const unique = Array.from(
		new Set(tickers.map((t) => String(t || '').trim().toUpperCase()).filter(Boolean))
	);
	await Promise.all(
		unique.map(async (t) => {
			const p = await resolveSpotFn(t).catch(() => 0);
			if (Number.isFinite(p) && p > 0) {
				await redis.set(\`oracle:spot:\${t}_USDC\`, String(p), 'EX', 90).catch(() => {});
			}
		})
	);
}

export async function prepareAnyToAnyInboundLeg(params: {
	cleanWallet: string;
	prefixedWallet: string;
	payAsset: string;
	receiveAsset: string;
	amount: number;
	resolveSpotUsd: (ticker: string) => Promise<number>;
	deliveryMode?: string;
	destinationAddress?: string;
}): Promise<{ status: number; payload: Record<string, any> }> {
	const pay = String(params.payAsset || '').trim().toUpperCase();
	const rec = String(params.receiveAsset || '').trim().toUpperCase();

	if (isSyntheticRwaAsset(pay)) {
		return {
			status: 400,
			payload: {
				error: \`\${pay} settles directly from your Perennia Vault balance rather than an external blockchain.\`
			}
		};
	}

	const [paySpot, recSpot] = await Promise.all([
		params.resolveSpotUsd(pay),
		params.resolveSpotUsd(rec)
	]);
	if (paySpot <= 0 || recSpot <= 0) {
		return {
			status: 503,
			payload: {
				error: \`ORACLE_HALT: Live oracle spot price for \${paySpot <= 0 ? pay : rec} is offline.\`
			}
		};
	}

	const grossUsd = params.amount * paySpot;
	if (grossUsd < 1.0) {
		return {
			status: 400,
			payload: {
				error: \`ANTI_DUST_FLOOR: Minimum swap value is $1.00 USD (submitted $\${grossUsd.toFixed(2)} USD).\`
			}
		};
	}

	const masterKasAddress = resolveMasterKaspaTreasuryAddress();

	if (isKaspaNativeOrKrc20(pay)) {
		await redis
			.set(
				\`sor:inbound_intent:\${params.cleanWallet}:\${pay}\`,
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
						\`sor:inbound_intent:\${params.cleanWallet}:\${pay}\`,
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
				\`sor:inbound_intent:\${params.cleanWallet}:\${pay}\`,
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
			error: \`Cross-chain inbound route for \${params.amount} \${pay} ($\${grossUsd.toFixed(2)}) is below bridge minimum or lacks an active \${pay} deposit vault.\`
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
			error: \`INVALID_ONCHAIN_TX_ID: Submitted \${pay} transaction hash is malformed.\`
		};
	}

	await ensureSettledOnchainLegsSchema();

	const intentRaw = await redis
		.get(\`sor:inbound_intent:\${params.cleanWallet}:\${pay}\`)
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

	let verificationState = 'BROADCAST_LOCKED';

	if (pay === 'KAS') {
		const targetKasAddr = trustedSettlementAddr || resolveMasterKaspaTreasuryAddress();
		for (let attempt = 0; attempt < 5; attempt++) {
			try {
				const res = await fetch(
					\`https://api.kaspa.org/transactions/\${encodeURIComponent(cleanTxId)}?inputs=false&outputs=true\`,
					{ signal: AbortSignal.timeout(2200) }
				);
				if (res.ok) {
					const txData = await res.json().catch(() => null);
					const outputs = Array.isArray(txData?.outputs) ? txData.outputs : [];
					if (outputs.length > 0) {
						let paidSompi = 0;
						for (const out of outputs) {
							const outAddr = String(out?.script_public_key_address || '').trim();
							if (outAddr === targetKasAddr) {
								paidSompi += Number(out?.amount || 0);
							}
						}
						const paidKas = paidSompi / 1e8;
						if (paidKas <= 0) {
							return {
								ok: false,
								status: 403,
								error: \`ONCHAIN_RECIPIENT_MISMATCH: Kaspa tx \${cleanTxId.slice(0, 12)}... did not pay Perennia settlement vault.\`
							};
						}
						if (paidKas + 0.05 < params.amount * 0.98) {
							return {
								ok: false,
								status: 422,
								error: \`UNDERPAID_ONCHAIN_TX: Expected \${params.amount.toFixed(4)} KAS, found \${paidKas.toFixed(4)} KAS.\`
							};
						}
						verificationState = 'KASPA_L1_OUTPUT_VERIFIED';
						break;
					}
				}
			} catch {
				// Indexer catching up to 10-BPS broadcast
			}
			if (attempt < 4) {
				await new Promise((r) => setTimeout(r, 450));
			}
		}
	} else if (expectedExchangeId && env.CHANGENOW_API_KEY) {
		try {
			const cnRes = await fetch(
				\`https://api.changenow.io/v2/exchange/by-id?id=\${encodeURIComponent(expectedExchangeId)}\`,
				{
					headers: { 'x-changenow-api-key': String(env.CHANGENOW_API_KEY).trim() },
					signal: AbortSignal.timeout(2500)
				}
			);
			if (cnRes.ok) {
				const cnData = await cnRes.json().catch(() => null);
				const st = String(cnData?.status || '').toLowerCase();
				if (st === 'failed' || st === 'refunded') {
					return {
						ok: false,
						status: 422,
						error: \`BRIDGE_ORDER_REJECTED: Cross-chain exchange \${expectedExchangeId} status is \${st}.\`
					};
				}
				verificationState = \`BRIDGE_\${st.toUpperCase() || 'ACTIVE'}\`;
			}
		} catch {
			// Keep broadcast lock active
		}
	}

	const lockRes = await client.query(
		\`INSERT INTO sor_settled_onchain_legs (
			tx_id, pay_asset, wallet_address, receive_asset, pay_amount,
			gross_usd, settlement_address, changenow_exchange_id, verification_state
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (tx_id, pay_asset) DO NOTHING
		RETURNING tx_id\`,
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
			error: \`DUPLICATE_ONCHAIN_TX: Transaction \${cleanTxId.slice(0, 14)}... has already been settled.\`
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
			\`SELECT ctid::text AS row_ctid, remaining_tokens, remaining_sompi, fmv_usd_per_token
			 FROM hifo_tax_lots
			 WHERE wallet_address IN ($1, $2)
			   AND asset_ticker = $3
			   AND remaining_tokens > 0
			 ORDER BY fmv_usd_per_token DESC\`,
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
				\`UPDATE hifo_tax_lots
				 SET remaining_tokens = $1,
				     remaining_sompi = $2
				 WHERE ctid = $3::tid\`,
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
	const dest =
		String(params.destinationAddress || '').trim() ||
		(isKaspaNativeOrKrc20(rec) ? params.prefixedWallet : '');

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
			// Fallback below credits internal reservoir so user value is never dropped
		}
	}

	const client = await dbPool.connect();
	try {
		await client.query('BEGIN');
		const r = await client.query(
			\`SELECT wallet_address, streaming_balance_kas, total_yield_kas, lp_tokens
			 FROM yield_reservoirs
			 WHERE wallet_address IN ($1, $2)
			 ORDER BY (wallet_address = $1) DESC
			 LIMIT 1
			 FOR UPDATE\`,
			[params.prefixedWallet, params.cleanWallet]
		);
		const row = r.rows[0];
		let streamKas = Number(row?.streaming_balance_kas || 0);
		const totalYieldKas = Number(row?.total_yield_kas || 0);
		const lpTokens: Record<string, number> = { ...(row?.lp_tokens || {}) };
		if (rec === 'KAS') {
			streamKas += params.estimatedOutput;
		} else {
			lpTokens[rec] = Number(lpTokens[rec] || 0) + params.estimatedOutput;
		}
		const targetPk = row?.wallet_address || params.prefixedWallet;
		const newHmac = computeReservoirHmac(params.prefixedWallet, streamKas, totalYieldKas, lpTokens);
		await client.query(
			\`INSERT INTO yield_reservoirs (
				wallet_address, streaming_balance_kas, total_yield_kas, lp_tokens, row_hmac_sig, last_updated
			) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
			ON CONFLICT (wallet_address) DO UPDATE SET
				streaming_balance_kas = EXCLUDED.streaming_balance_kas,
				lp_tokens = EXCLUDED.lp_tokens,
				row_hmac_sig = EXCLUDED.row_hmac_sig,
				last_updated = CURRENT_TIMESTAMP\`,
			[targetPk, streamKas, totalYieldKas, JSON.stringify(lpTokens), newHmac]
		);
		await client.query('COMMIT');
		await redis
			.hincrbyfloat(\`dev:sor:treasury:balances:\${params.cleanWallet}\`, rec, params.estimatedOutput)
			.catch(() => {});
	} catch {
		await client.query('ROLLBACK').catch(() => {});
	} finally {
		client.release();
	}

	return {
		dispatched: false,
		status: 'CREDITED_TO_VAULT_FALLBACK',
		txHash: '',
		explorerUrl: '',
		fallbackCreditedToVault: true
	};
}
`;
fs.writeFileSync(routerPath, routerCode, 'utf8');
log.push('WROTE: src/lib/server/anyToAnyRouter.ts');

// 2. Patch /api/sor/swap/+server.ts
const sorPath = path.join(root, 'src/routes/api/sor/swap/+server.ts');
let sor = fs.readFileSync(sorPath, 'utf8');

if (!sor.includes("from '$lib/server/anyToAnyRouter'")) {
	const impAnchor = "import { computeReservoirHmac } from '$lib/server/l1Dispatcher';";
	if (!sor.includes(impAnchor)) throw new Error('Missing +server.ts import anchor');
	sor = sor.replace(
		impAnchor,
		() =>
			`${impAnchor}\nimport {\n\tisSyntheticRwaAsset,\n\tprepareAnyToAnyInboundLeg,\n\tprewarmSorSpotCache,\n\tresolveOffHoursAwareSpotUsd,\n\tverifyAndLockInboundOnchainLeg,\n\tconsumeHifoLotsOnDisposal,\n\tmaybeDispatchOutboundSwapL1\n} from '$lib/server/anyToAnyRouter';`
	);

	const siloRx = /if\s*\(\s*clean\s*===\s*'SILO'\s*\)\s*\{\s*const\s+kasSpot\s*=\s*await\s+resolveStrictSpotPriceUsd\('KAS'\);\s*if\s*\(\s*kasSpot\s*>\s*0\s*\)\s*\{\s*return\s+Number\(\(kasSpot\s*\/\s*23\.809524\)\.toFixed\(6\)\);\s*\}\s*\}\s*return\s+0;/;
	if (!siloRx.test(sor)) throw new Error('Missing +server.ts SILO spot anchor');
	sor = sor.replace(
		siloRx,
		() => `if (clean === 'SILO') {
		const kasSpot = await resolveStrictSpotPriceUsd('KAS');
		if (kasSpot > 0) {
			const siloSpot = Number((kasSpot / 23.809524).toFixed(6));
			await redis.set('oracle:spot:SILO_USDC', String(siloSpot), 'EX', 60).catch(() => {});
			return siloSpot;
		}
	}
	const extendedSpot = await resolveOffHoursAwareSpotUsd(clean);
	if (extendedSpot > 0) return extendedSpot;
	return 0;`
	);

	const rustStartRx = /const\s+rustBackendUrl\s*=\s*resolveRustBackendUrl\(\);\s*if\s*\(\s*!killSwitches\.darkPoolPaused\s*\)\s*\{/;
	if (!rustStartRx.test(sor)) throw new Error('Missing +server.ts rustBackendUrl anchor');
	sor = sor.replace(
		rustStartRx,
		() => `const actionMode = String(body.action || '').trim().toUpperCase();
		const fundingSource = String(body.fundingSource || body.funding_source || 'LEDGER').trim().toUpperCase();
		const isOnchainFunded = fundingSource === 'ONCHAIN_L1';
		const requestedDeliveryMode = String(body.deliveryMode || body.delivery_mode || 'LEDGER').trim().toUpperCase();
		const requestedDestinationAddress = String(body.destinationAddress || body.destination_address || '').trim();
		const shouldDispatchOutboundL1 =
			requestedDeliveryMode === 'ONCHAIN_L1' &&
			!isSyntheticRwaAsset(receiveAsset) &&
			receiveAsset !== 'USD';

		await prewarmSorSpotCache([payAsset, receiveAsset, 'KAS'], resolveStrictSpotPriceUsd);

		if (actionMode === 'PREPARE_INBOUND' || body.prepareInbound === true) {
			const prep = await prepareAnyToAnyInboundLeg({
				cleanWallet,
				prefixedWallet,
				payAsset,
				receiveAsset,
				amount,
				resolveSpotUsd: resolveStrictSpotPriceUsd,
				deliveryMode: requestedDeliveryMode,
				destinationAddress: requestedDestinationAddress
			});
			return json(prep.payload, { status: prep.status });
		}

		const rustBackendUrl = resolveRustBackendUrl();
		if (!killSwitches.darkPoolPaused && !isOnchainFunded) {`
	);

	sor = sor.replace(
		/if\s*\(\s*rustRes\.ok\s*&&\s*rustData\?\.success\s*\)\s*\{/,
		() => 'if (rustRes.ok && rustData?.success && rustData?.ledgerSettled) {'
	);

	const ledgerMutRx = /const\s+availablePayBal\s*=\s*Math\.max\(redisPayBal,\s*dbPayBal\);[\s\S]*?\.hincrbyfloat\(ledgerKey,\s*receiveAsset,\s*estimatedOutput\)\s*\.catch\(\(\)\s*=>\s*\{\}\);/;
	if (!ledgerMutRx.test(sor)) throw new Error('Missing +server.ts ledger mutation anchor');
	sor = sor.replace(
		ledgerMutRx,
		() => `const availablePayBal = Math.max(redisPayBal, dbPayBal);
			let hifoDisposal: { costBasisUsd: number; realizedGainLossUsd: number; holdingPeriod: 'SHORT_TERM' | 'LONG_TERM' } = {
				costBasisUsd: grossUsd,
				realizedGainLossUsd: 0.0,
				holdingPeriod: 'SHORT_TERM'
			};

			if (isOnchainFunded) {
				const verifiedLeg = await verifyAndLockInboundOnchainLeg(client, {
					txId: String(body.onchainTxId || body.onchain_tx_id || ''),
					cleanWallet,
					prefixedWallet,
					payAsset,
					receiveAsset,
					amount,
					grossUsd,
					changenowExchangeId: body.changenowExchangeId ?? null,
					settlementAddress: body.settlementAddress ?? null
				});
				if (!verifiedLeg.ok) {
					await client.query('ROLLBACK').catch(() => {});
					return json({ error: verifiedLeg.error }, { status: verifiedLeg.status });
				}
			} else {
				if (availablePayBal + 1e-8 < amount) {
					await client.query('ROLLBACK').catch(() => {});
					return json(
						{
							error: \`INSUFFICIENT_BALANCE: Requested \${amount.toFixed(4)} \${payAsset}, available \${availablePayBal.toFixed(4)} \${payAsset}.\`
						},
						{ status: 422 }
					);
				}
				if (payAsset === 'KAS') {
					streamKas = Math.max(0, streamKas - amount);
				} else {
					lpTokens[payAsset] = Math.max(0, Number(lpTokens[payAsset] || 0) - amount);
				}
				hifoDisposal = await consumeHifoLotsOnDisposal(
					client,
					prefixedWallet,
					cleanWallet,
					payAsset,
					amount,
					grossUsd
				);
			}

			if (!shouldDispatchOutboundL1) {
				if (receiveAsset === 'KAS') {
					streamKas += estimatedOutput;
				} else {
					lpTokens[receiveAsset] = Number(lpTokens[receiveAsset] || 0) + estimatedOutput;
				}
			}

			const targetPk = row?.wallet_address || prefixedWallet;
			const newHmac = computeReservoirHmac(prefixedWallet, streamKas, totalYieldKas, lpTokens);
			if (!isOnchainFunded || !shouldDispatchOutboundL1) {
				await client.query(
					\`INSERT INTO yield_reservoirs (
						wallet_address, streaming_balance_kas, total_yield_kas,
						lp_tokens, row_hmac_sig, last_updated
					) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
					ON CONFLICT (wallet_address) DO UPDATE SET
						streaming_balance_kas = EXCLUDED.streaming_balance_kas,
						lp_tokens = EXCLUDED.lp_tokens,
						row_hmac_sig = EXCLUDED.row_hmac_sig,
						last_updated = CURRENT_TIMESTAMP\`,
					[targetPk, streamKas, totalYieldKas, JSON.stringify(lpTokens), newHmac]
				);
			}

			if (!isOnchainFunded) {
				await redis
					.hset(ledgerKey, payAsset, String(Math.max(0, availablePayBal - amount)))
					.catch(() => {});
			}
			if (!shouldDispatchOutboundL1) {
				await redis
					.hincrbyfloat(ledgerKey, receiveAsset, estimatedOutput)
					.catch(() => {});
			}`
	);

	const taxRx = /VALUES\s*\(\$1,\s*\$2,\s*'DEX_SWAP',\s*\$3,\s*\$4,\s*\$5,\s*\$6,\s*\$3,\s*0\.0,\s*'SHORT_TERM'\)\s*`\s*,\s*\[cleanWallet,\s*payAsset,\s*grossUsd,\s*amount,\s*paySpot,\s*txUuid\]/;
	if (taxRx.test(sor)) {
		sor = sor.replace(
			taxRx,
			() => `VALUES ($1, $2, 'DEX_SWAP', $3, $4, $5, $6, $7, $8, $9)\`,
				[cleanWallet, payAsset, grossUsd, amount, paySpot, txUuid, hifoDisposal.costBasisUsd, hifoDisposal.realizedGainLossUsd, hifoDisposal.holdingPeriod]`
		);
	}

	const retRx = /return\s+json\(\{\s*success:\s*true,\s*transaction_uuid:\s*txUuid,/;
	if (!retRx.test(sor)) throw new Error('Missing +server.ts return json anchor');
	sor = sor.replace(
		retRx,
		() => `const outboundDispatch = shouldDispatchOutboundL1
			? await maybeDispatchOutboundSwapL1({
					prefixedWallet,
					cleanWallet,
					receiveAsset,
					estimatedOutput,
					receiveSpot,
					destinationAddress: requestedDestinationAddress
				})
			: null;

		return json({
			success: true,
			fundingSource,
			deliveryMode: shouldDispatchOutboundL1 ? 'ONCHAIN_L1' : 'LEDGER',
			inboundOnchainTxId: isOnchainFunded ? String(body.onchainTxId || body.onchain_tx_id || '') : null,
			outboundDispatch,
			transaction_uuid: txUuid,`
	);

	backupAndWrite(sorPath, sor);
	log.push('PATCHED: src/routes/api/sor/swap/+server.ts');
} else {
	log.push('ALREADY PATCHED: +server.ts');
}

// 3. Patch WalletModal.svelte
const wmPath = findFile(path.join(root, 'src'), 'WalletModal.svelte');
let wm = fs.readFileSync(wmPath, 'utf8');
if (!wm.includes("action: 'PREPARE_INBOUND'")) {
	const wmRx = /let\s+settlementAddress\s*=\s*String\([\s\S]*?onchainTxId:\s*txId\s*\}\)/;
	if (!wmRx.test(wm)) throw new Error('Missing WalletModal DEX_SWAP anchor');
	wm = wm.replace(
		wmRx,
		() => `identity.walletMessage = \`Verifying \${meta.ticker} \u2192 \${receiveAsset} Route & Deposit Vault...\`;
			const prepRes = await fetch('/api/sor/swap', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'PREPARE_INBOUND',
					wallet: identity.activeAddress,
					payAsset: meta.ticker,
					receiveAsset,
					amount: payAmountNum,
					deliveryMode: (details as any).deliveryMode || 'LEDGER',
					destinationAddress: (details as any).outboundAddress || ''
				})
			});
			const prepData = await prepRes.json().catch(() => ({}));
			if (!prepRes.ok || prepData.error) {
				privateKey = '0'.repeat(64);
				throw new Error(
					prepData.error || \`Unable to prepare \${meta.ticker} \u2192 \${receiveAsset} route.\`
				);
			}
			const settlementAddress = String(prepData.settlementAddress || '').trim();
			const preparedChangenowId = prepData.changenowExchangeId || null;
			if (!settlementAddress) {
				privateKey = '0'.repeat(64);
				throw new Error(\`Settlement deposit address for \${meta.ticker} is unavailable.\`);
			}

			identity.walletMessage = \`Signing & Broadcasting \${meta.ticker} L1 Swap Leg Locally...\`;
			privateKey = '0'.repeat(64);
			const { txId, explorerUrl } = await executeMultiChainL1Transfer({
				asset: meta.ticker,
				network: meta.network,
				destinationAddress: settlementAddress,
				amount: payAmountNum,
				contractAddress: meta.contractAddress,
				decimals: details.decimals ?? meta.decimals,
				keys
			});

			identity.walletMessage = \`Settling \${meta.ticker} \u2192 \${receiveAsset} via Smart Order Router...\`;
			const swapRes = await fetch('/api/sor/swap', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					wallet: identity.activeAddress,
					payAsset: meta.ticker,
					receiveAsset,
					payAmount: payAmountNum,
					amount: payAmountNum,
					executionMode: 'INSTANT_SOR',
					fundingSource: 'ONCHAIN_L1',
					onchainTxId: txId,
					changenowExchangeId: preparedChangenowId,
					settlementAddress,
					deliveryMode: (details as any).deliveryMode || 'LEDGER',
					destinationAddress: (details as any).outboundAddress || ''
				})`
	);
	backupAndWrite(wmPath, wm);
	log.push('PATCHED: WalletModal.svelte');
} else {
	log.push('ALREADY PATCHED: WalletModal.svelte');
}

// 4. Patch SwapView.svelte
const svPath = findFile(path.join(root, 'src'), 'SwapView.svelte');
let sv = fs.readFileSync(svPath, 'utf8');
if (sv.includes("if (useOnChain && payTicker !== 'KAS')")) {
	sv = sv.replace("if (useOnChain && payTicker !== 'KAS')", () => 'if (useOnChain)');
	sv = sv.replace(
		/(intentType:\s*'DEX_SWAP'[\s\S]{0,380}?destinationAddress:\s*)([^,\n\}]+)/,
		(_, prefix) => `${prefix}''`
	);
	backupAndWrite(svPath, sv);
	log.push('PATCHED: SwapView.svelte');
} else {
	log.push('ALREADY PATCHED: SwapView.svelte');
}

// 5. Inspect steering reject branches for non-KAS pairs
const stMatch = sor.match(/async function resolveTokenSteeringDecision[\s\S]*?return\s*\{[\s\S]*?steeringExplanation[\s\S]*?\};\s*\}/);
if (stMatch) {
	const rejects = stMatch[0].match(/allowed:\s*false[\s\S]{0,120}/g) || [];
	log.push(`STEERING_REJECT_BRANCHES: ${rejects.length}`);
	rejects.forEach((r, i) => log.push(`  [${i + 1}] ${r.replace(/\s+/g, ' ').slice(0, 95)}`));
}

console.log(log.join('\n'));
// ANY2ANY_INSTALLER_EOF