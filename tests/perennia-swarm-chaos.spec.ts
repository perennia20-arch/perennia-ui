import { test, expect, type APIRequestContext, type Browser } from '@playwright/test';
import net from 'node:net';
import { blake2b } from '@noble/hashes/blake2.js';
import { schnorr } from '@noble/curves/secp256k1.js';

declare const process: { env: Record<string, string | undefined> };

const SWARM_USERS = Math.max(2, Number(process.env.SWARM_USERS || 100));
const SWARM_BROWSERS = Math.min(SWARM_USERS - 1, Math.max(1, Number(process.env.SWARM_BROWSERS || 8)));
const SWARM_OPS = Math.max(3, Number(process.env.SWARM_OPS || 8));
const SWARM_SEED = Number(process.env.SWARM_SEED || (Date.now() % 1_000_000_000));
const STRATUM_HOST = process.env.SWARM_STRATUM_HOST || '192.168.50.100';
const STRATUM_PORTS = [3331, 3332, 3333] as const;
const KASPA_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

const ABA_BANKS = [
	{ routing: '111000614', label: 'JPMorgan Chase Bank, N.A. (Texas / Dallas)', match: 'JPMorgan Chase' },
	{ routing: '021000021', label: 'JPMorgan Chase Bank, N.A. (New York)', match: 'JPMorgan Chase' },
	{ routing: '121145433', label: 'Column N.A. / Mercury Commercial Vault', match: 'Column' },
	{ routing: '111000025', label: 'Bank of America, N.A. (Texas / Dallas)', match: 'Bank of America' },
	{ routing: '111900659', label: 'Wells Fargo Bank, N.A. (Texas)', match: 'Wells Fargo' }
] as const;

const ASICS = [
	{ model: 'IceRiver KS0 Ultra', port: 3332 },
	{ model: 'IceRiver KS7 Lite', port: 3333 },
	{ model: 'Antminer KS5 Pro', port: 3331 }
] as const;

const ASSETS = [
	{ ticker: 'KAS', name: 'Kaspa', assetClass: 'Native L1', hex: '#18C6A5', spotPrice: 0.15 },
	{ ticker: 'USDC', name: 'USD Coin', assetClass: 'Stablecoin', hex: '#3B82F6', spotPrice: 1.0 },
	{ ticker: 'BTC', name: 'Bitcoin', assetClass: 'Native L1', hex: '#F7931A', spotPrice: 95000.0 },
	{ ticker: 'ETH', name: 'Ethereum', assetClass: 'Native L1', hex: '#627EEA', spotPrice: 3200.0 },
	{ ticker: 'SOL', name: 'Solana', assetClass: 'Native L1', hex: '#14F195', spotPrice: 180.0 },
	{ ticker: 'USD', name: 'Direct Bank ACH / Wire', assetClass: 'Stablecoin', hex: '#10B981', spotPrice: 1.0 }
] as const;

const TAX_PROFILES = [
	{ countryCode: 'US', stateRegion: 'TX', entityType: 'LLC', filingStatus: 'SINGLE', rate: 15.0 },
	{ countryCode: 'US', stateRegion: 'FL', entityType: 'S-CORP', filingStatus: 'MFJ', rate: 14.2 },
	{ countryCode: 'US', stateRegion: 'WY', entityType: 'LLC', filingStatus: 'SINGLE', rate: 15.0 },
	{ countryCode: 'PR', stateRegion: 'TX', entityType: 'LLC', filingStatus: 'SINGLE', rate: 4.0 }
] as const;

interface SwarmSeat {
	seatIndex: number;
	privateKeyBytes: Uint8Array;
	kaspaAddress: string;
	gateCookie: string;
	sessionCookie: string;
	workerIds: Set<string>;
	sectorIds: Set<string>;
	railSaved: boolean;
	seq: number;
}

interface MetricSample {
	action: string;
	status: number;
	latencyMs: number;
	guarded?: boolean;
	detail?: string;
}

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function encodeKaspaAddress(pubKeyX: Uint8Array): string {
	const polymod = (vals: number[]) => {
		let c = 1n;
		for (const v of vals) {
			const c0 = c >> 35n;
			c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(v);
			if (c0 & 1n) c ^= 0x98f2bc8e61n;
			if (c0 & 2n) c ^= 0x79b76d99e2n;
			if (c0 & 4n) c ^= 0xf33e5fb3c4n;
			if (c0 & 8n) c ^= 0xae2eabe2a8n;
			if (c0 & 16n) c ^= 0x1e4f43e470n;
		}
		return c ^ 1n;
	};
	const prefixVals = 'kaspa'.split('').map((c) => c.charCodeAt(0) & 31).concat([0]);
	const payload = [0, ...pubKeyX];
	let acc = 0;
	let bits = 0;
	const payload5: number[] = [];
	for (const byte of payload) {
		acc = (acc << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			bits -= 5;
			payload5.push((acc >> bits) & 31);
		}
	}
	if (bits > 0) payload5.push((acc << (5 - bits)) & 31);
	const mod = polymod([...prefixVals, ...payload5, 0, 0, 0, 0, 0, 0, 0, 0]);
	const checksum = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => Number((mod >> BigInt(5 * (7 - i))) & 31n));
	return 'kaspa:' + [...payload5, ...checksum].map((v) => KASPA_CHARSET[v]).join('');
}

function deriveSwarmSeat(seatIndex: number): SwarmSeat {
	const seedText = `perennia-v5-swarm-cohort-seat-${seatIndex.toString().padStart(4, '0')}`;
	const privateKeyBytes = blake2b(new TextEncoder().encode(seedText), { dkLen: 32 });
	const pubKeyX = schnorr.getPublicKey(privateKeyBytes);
	return {
		seatIndex,
		privateKeyBytes,
		kaspaAddress: encodeKaspaAddress(pubKeyX),
		gateCookie: '',
		sessionCookie: '',
		workerIds: new Set(),
		sectorIds: new Set(),
		railSaved: false,
		seq: 0
	};
}

function buildCookieHeader(seat: SwarmSeat, includeSession = true): Record<string, string> {
	const parts = [seat.gateCookie, includeSession ? seat.sessionCookie : ''].filter(Boolean);
	return parts.length ? { Cookie: parts.join('; ') } : {};
}

async function prewarmGate(ctx: APIRequestContext, seat: SwarmSeat): Promise<void> {
	const res = await ctx.get('/');
	expect(res.ok(), `Gate prewarm failed (${res.status()})`).toBe(true);
	const setCookie = res.headers()['set-cookie'] || '';
	const gateMatch = setCookie.match(/perennia_gate=[^;\s,]+/);
	if (gateMatch) seat.gateCookie = gateMatch[0];
}

async function authenticateSchnorr(
	ctx: APIRequestContext,
	seat: SwarmSeat,
	samples: MetricSample[]
): Promise<void> {
	const t0 = Date.now();
	const chRes = await ctx.post('/api/auth/challenge', {
		headers: buildCookieHeader(seat, false),
		data: { address: seat.kaspaAddress }
	});
	if (!chRes.ok()) {
		samples.push({ action: 'AUTH_SCHNORR', status: chRes.status(), latencyMs: Date.now() - t0, detail: 'challenge' });
		throw new Error(`Challenge failed (${chRes.status()}) for seat ${seat.seatIndex}`);
	}
	const { message } = await chRes.json();
	const sigHex = bytesToHex(schnorr.sign(blake2b(new TextEncoder().encode(message), { dkLen: 32 }), seat.privateKeyBytes));
	const authRes = await ctx.post('/api/auth', {
		headers: buildCookieHeader(seat, false),
		data: { address: seat.kaspaAddress, signature: sigHex, message, provider: 'sovereign' }
	});
	const setCookie = authRes.headers()['set-cookie'] || '';
	const sessMatch = setCookie.match(/perennia_session=[^;\s,]+/);
	const gateMatch = setCookie.match(/perennia_gate=[^;\s,]+/);
	if (gateMatch) seat.gateCookie = gateMatch[0];
	if (sessMatch) seat.sessionCookie = sessMatch[0];
	samples.push({ action: 'AUTH_SCHNORR', status: authRes.status(), latencyMs: Date.now() - t0 });
	expect(authRes.ok() && seat.sessionCookie.length > 20, `Schnorr auth failed seat ${seat.seatIndex}`).toBe(true);
}

function probeStratumTcp(host: string, port: number, workerFull: string): Promise<{ status: number; latencyMs: number }> {
	const t0 = Date.now();
	return new Promise((resolve) => {
		const sock = new net.Socket();
		let settled = false;
		let buf = '';
		const finish = (status: number) => {
			if (settled) return;
			settled = true;
			sock.destroy();
			resolve({ status, latencyMs: Date.now() - t0 });
		};
		sock.setTimeout(3000);
		sock.on('connect', () => {
			sock.write(
				`{"id":1,"method":"mining.subscribe","params":["PerenniaSwarm/5.0"]}\n` +
				`{"id":2,"method":"mining.authorize","params":["${workerFull}","x"]}\n`
			);
		});
		sock.on('data', (chunk) => {
			buf += chunk.toString('utf8');
			if (buf.includes('"id":1')) finish(200);
		});
		sock.on('timeout', () => finish(408));
		sock.on('error', () => finish(503));
		sock.connect(port,host);
	});
}

async function runProtocolActor(
	ctx: APIRequestContext,
	seat: SwarmSeat,
	peerSeat: SwarmSeat,
	rng: () => number,
	samples: MetricSample[]
): Promise<void> {
	const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

	await sleep(Math.floor(rng() * 1800));
	await authenticateSchnorr(ctx, seat, samples);

	const weightedPool = [
		'STATE_POLL', 'STATE_POLL',
		'WORKER_CHURN', 'WORKER_CHURN',
		'SILO_CHURN', 'SILO_CHURN',
		'STRATUM_TCP', 'STRATUM_TCP',
		'FIAT_ONRAMP', 'FIAT_ONRAMP',
		'FIAT_OFFRAMP', 'FIAT_OFFRAMP',
		'SOR_QUOTE', 'SOR_QUOTE',
		'TAX_FORTRESS',
		'RACE_BURST',
		'ADVERSARIAL_GUARD'
	] as const;

	for (let step = 0; step < SWARM_OPS; step++) {
		await sleep(25 + Math.floor(rng() * 160));
		const op = pick(weightedPool);
		const headers = buildCookieHeader(seat, true);

		if (op === 'STATE_POLL') {
			const t0 = Date.now();
			const res = await ctx.get('/api/state', { headers });
			samples.push({ action: 'STATE_POLL', status: res.status(), latencyMs: Date.now() - t0 });
			const t1 = Date.now();
			const bindRes = await ctx.get(`/api/stratum/bind?wallet=${encodeURIComponent(seat.kaspaAddress)}`, { headers });
			samples.push({ action: 'STRATUM_BIND_CHECK', status: bindRes.status(), latencyMs: Date.now() - t1 });
			if (bindRes.ok()) {
				const bJson = await bindRes.json();
				expect(bJson.poolCoinbaseAddress).not.toBe(seat.kaspaAddress);
			}
		} else if (op === 'WORKER_CHURN') {
			if (seat.workerIds.size >= 2) {
				const oldId = Array.from(seat.workerIds)[0];
				const tDel = Date.now();
				const delRes = await ctx.post('/api/state/action', {
					headers,
					data: { action: 'DELETE_WORKER', payload: { id: oldId } }
				});
				samples.push({ action: 'WORKER_DELETE', status: delRes.status(), latencyMs: Date.now() - tDel });
				if (delRes.ok()) seat.workerIds.delete(oldId);
			}
			const asic = pick(ASICS);
			const wId = `SWARM-W-${seat.seatIndex}-${++seat.seq}`;
			const wName = `RIG${seat.seatIndex}_${seat.seq}`;
			const clean = seat.kaspaAddress.replace(/^kaspa:/i, '');
			const t0 = Date.now();
			const res = await ctx.post('/api/state/action', {
				headers,
				data: {
					action: 'ADD_WORKER',
					payload: {
						id: wId,
						type: 'physical',
						name: wName,
						stratumUrl: `stratum+tcp://perennia.io:${asic.port}`,
						walletWorker: `kaspa:${clean}.${wName}`,
						hashRate: 0,
						isOnline: false,
						hardwareType: asic.model,
						sharesContributed: 0,
						validShares: 0,
						rejectedShares: 0,
						acceptancePct: 100.0,
						blocksFound: 0
					}
				}
			});
			samples.push({ action: 'WORKER_ADD', status: res.status(), latencyMs: Date.now() - t0 });
			if (res.ok()) seat.workerIds.add(wId);
		} else if (op === 'SILO_CHURN') {
			if (seat.sectorIds.size >= 2) {
				const oldSec = Array.from(seat.sectorIds)[0];
				const tDel = Date.now();
				const delRes = await ctx.post('/api/state/action', {
					headers,
					data: { action: 'DELETE_SECTOR', payload: { id: oldSec } }
				});
				samples.push({ action: 'SILO_DELETE', status: delRes.status(), latencyMs: Date.now() - tDel });
				if (delRes.ok()) seat.sectorIds.delete(oldSec);
			}
			const asset = pick(ASSETS);
			const sId = `SWARM-S-${seat.seatIndex}-${++seat.seq}`;
			const alloc = pick([15, 25, 35, 50]);
			const t0 = Date.now();
			const res = await ctx.post('/api/state/action', {
				headers,
				data: {
					action: 'ADD_SECTOR',
					payload: {
						id: sId,
						name: `SILO-${asset.ticker}-${seat.seatIndex}-${seat.seq}`,
						allocationPercentage: alloc,
						routeMode: asset.ticker === 'KAS' ? 'hold' : 'swap',
						settlementConfig: {
							targetAsset: {
								ticker: asset.ticker,
								name: asset.name,
								assetClass: asset.assetClass,
								spotPrice: asset.spotPrice,
								theme: { hex: asset.hex, pastel: '#99f6e4' }
							},
							payoutAddress: seat.kaspaAddress,
							autoPayout: true,
							mode: 'epoch',
							threshold: 50.0,
							appointmentDate: '',
							appointmentTime: '22:00'
						},
						pendingKaspa: 0.0,
						width: 6
					}
				}
			});
			samples.push({ action: 'SILO_ADD', status: res.status(), latencyMs: Date.now() - t0 });
			if (res.ok()) seat.sectorIds.add(sId);
		} else if (op === 'STRATUM_TCP') {
			const port = pick(STRATUM_PORTS);
			const res = await probeStratumTcp(STRATUM_HOST, port, `${seat.kaspaAddress}.SWARM${seat.seatIndex}`);
			samples.push({ action: 'STRATUM_TCP', status: res.status, latencyMs: res.latencyMs });
		} else if (op === 'FIAT_ONRAMP') {
			const tier = pick([
				{ usd: 100, extra: '&paymentMethod=card' },
				{ usd: 650, extra: '' },
				{ usd: 2500, extra: '&paymentMethod=ach' },
				{ usd: 125000, extra: '' }
			]);
			const qAsset = pick(['KAS', 'USDC', 'BTC', 'ETH'] as const);
			const t0 = Date.now();
			const res = await ctx.get(`/api/fiat/onramp?quoteAsset=${qAsset}&amountUsd=${tier.usd}${tier.extra}`, { headers });
			samples.push({ action: 'FIAT_ONRAMP_QUOTE', status: res.status(), latencyMs: Date.now() - t0 });
			if (res.ok() && tier.usd === 650) {
				const d = await res.json();
				expect(d.quote?.autoDefaultedToAch).toBe(true);
			}
		} else if (op === 'FIAT_OFFRAMP') {
			const bank = pick(ABA_BANKS);
			const acct = `880022${seat.seatIndex.toString().padStart(4, '0')}`;
			if (!seat.railSaved || rng() < 0.25) {
				const tSave = Date.now();
				const sRes = await ctx.post('/api/fiat/offramp', {
					headers,
					data: {
						action: 'SAVE_BANK_RAIL',
						wallet: seat.kaspaAddress,
						bankLabel: bank.label,
						accountType: 'CHECKING',
						payoutMethod: 'ACH',
						routingNumber: bank.routing,
						accountNumber: acct
					}
				});
				samples.push({ action: 'BANK_RAIL_SAVE', status: sRes.status(), latencyMs: Date.now() - tSave });
				if (sRes.ok()) seat.railSaved = true;
			}
			const grossUsd = pick([250, 500, 1000, 2500]);
			const sAsset = pick(['KAS', 'USDC', 'BTC', 'ETH'] as const);
			const tPre = Date.now();
			const pRes = await ctx.post('/api/fiat/offramp', {
				headers,
				data: {
					wallet: seat.kaspaAddress,
					grossUsd,
					sourceMode: 'onchain_kas',
					sourceAsset: sAsset,
					payoutMethod: 'ach',
					bankLabel: bank.label,
					accountType: 'CHECKING',
					routingNumber: bank.routing,
					accountNumber: acct,
					preFlightOnly: true
				}
			});
			samples.push({ action: 'FIAT_OFFRAMP_PREFLIGHT', status: pRes.status(), latencyMs: Date.now() - tPre });
		} else if (op === 'SOR_QUOTE') {
			const amt = pick([250, 500, 1500, 4000]);
			const t0 = Date.now();
			const res = await ctx.get(`/api/sor/swap?payAsset=KAS&receiveAsset=USDC&amount=${amt}`, { headers });
			samples.push({ action: 'SOR_QUOTE', status: res.status(), latencyMs: Date.now() - t0 });
			if (res.ok()) {
				const q = await res.json();
				expect(Number(q.estimatedOutput)).toBeGreaterThan(0);
			}
		} else if (op === 'TAX_FORTRESS') {
			const tax = pick(TAX_PROFILES);
			const t0 = Date.now();
			const res = await ctx.post('/api/treasury/kyc', {
				headers,
				data: {
					walletAddress: seat.kaspaAddress,
					countryCode: tax.countryCode,
					stateRegion: tax.stateRegion,
					entityType: tax.entityType,
					filingStatus: tax.filingStatus,
					effectiveTaxRate: tax.rate
				}
			});
			samples.push({ action: 'TAX_FORTRESS_SYNC', status: res.status(), latencyMs: Date.now() - t0 });
		} else if (op === 'RACE_BURST') {
			const tax = pick(TAX_PROFILES);
			const t0 = Date.now();
			const [r1, r2, r3] = await Promise.all([
				ctx.get('/api/state', { headers }),
				ctx.get('/api/fiat/offramp?quoteAsset=KAS&amountUsd=500', { headers }),
				ctx.post('/api/treasury/kyc', {
					headers,
					data: {
						walletAddress: seat.kaspaAddress,
						countryCode: tax.countryCode,
						stateRegion: tax.stateRegion,
						entityType: tax.entityType,
						filingStatus: tax.filingStatus,
						effectiveTaxRate: tax.rate
					}
				})
			]);
			const dt = Date.now() - t0;
			samples.push(
				{ action: 'RACE_BURST', status: r1.status(), latencyMs: dt },
				{ action: 'RACE_BURST', status: r2.status(), latencyMs: dt },
				{ action: 'RACE_BURST', status: r3.status(), latencyMs: dt }
			);
			if (rng() < 0.35) await authenticateSchnorr(ctx, seat, samples);
		} else if (op === 'ADVERSARIAL_GUARD') {
			const variant = Math.floor(rng() * 3);
			const t0 = Date.now();
			if (variant === 0) {
				const res = await ctx.post('/api/sor/l1_dispatch', {
					headers,
					data: { wallet: peerSeat.kaspaAddress, destinationAddress: peerSeat.kaspaAddress, asset: 'KAS', amount: 15 }
				});
				samples.push({ action: 'ADVERSARIAL_GUARD', status: res.status(), latencyMs: Date.now() - t0, guarded: res.status() === 403 });
				expect(res.status()).toBe(403);
			} else if (variant === 1) {
				const res = await ctx.post('/api/stratum/bind', {
					headers,
					data: { wallet: peerSeat.kaspaAddress, workerName: 'Hijack', hardwareModel: 'IceRiver KS0 Ultra', estimatedHashrateTh: 0.4 }
				});
				samples.push({ action: 'ADVERSARIAL_GUARD', status: res.status(), latencyMs: Date.now() - t0, guarded: res.status() === 403 });
				expect(res.status()).toBe(403);
			} else {
				const res = await ctx.post('/api/sor/swap', {
					headers: buildCookieHeader(seat, false),
					data: { payAsset: 'KAS', receiveAsset: 'USDC', amount: 500, slippageTolerance: 0.05, systemMode: 'base' }
				});
				samples.push({ action: 'ADVERSARIAL_GUARD', status: res.status(), latencyMs: Date.now() - t0, guarded: res.status() === 401 });
				expect(res.status()).toBe(401);
			}
		}
	}
}

async function runBrowserActor(
	browser: Browser,
	baseURL: string | undefined,
	httpCredentials: { username: string; password: string } | undefined,
	seat: SwarmSeat,
	rng: () => number,
	samples: MetricSample[]
): Promise<void> {
	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
	await sleep(Math.floor(rng() * 1400));

	const bCtx = await browser.newContext({
		baseURL,
		viewport: { width: 1440, height: 900 },
		...(httpCredentials ? { httpCredentials } : {})
	});
	try {
		const page = await bCtx.newPage();
		const leakedKeys: string[] = [];

		page.on('request', (req) => {
			if (req.method() === 'POST') {
				const body = req.postData() || '';
				if (body.includes('privateKeyHex') || body.includes('buyerPrivateKeyHex')) leakedKeys.push(req.url());
			}
		});

		await page.route('**/api/broadcast', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					success: true,
					transactionId: '0000000000000000000000000000000000000000000000000000000000000000',
					rehearsalZeroFeeGuard: true
				})
			});
		});

		await page.addInitScript(
			({ kasAddr }) => {
				localStorage.setItem('perennia_tour_completed', 'true');
				localStorage.setItem(
					'perennia_sovereign_payload',
					JSON.stringify({
						version: 'perennia-vault-v4',
						exportedAt: new Date().toISOString(),
						wallets: {
							kaspa: { address: kasAddr },
							bitcoin: { address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' },
							ethereum: { address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
							solana: { address: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH' },
							doge: { address: 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L' },
							xrp: { address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh' },
							polygon: { address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
							avalanche: { address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
							sui: { address: '0x0000000000000000000000000000000000000000000000000000000000000001' },
							tron: { address: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb' },
							zcash: { address: 't1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs' }
						},
						vault: window.btoa('swarm-rehearsal-vault')
					})
				);
				sessionStorage.setItem('perennia_active_wallet_type', 'sovereign');
				sessionStorage.setItem('perennia_vault_unlocked', 'true');
			},
			{ kasAddr: seat.kaspaAddress }
		);

		await prewarmGate(bCtx.request, seat);
		await authenticateSchnorr(bCtx.request, seat, samples);

		const tBoot = Date.now();
		await page.goto('/');
		await expect(page.getByText('UNLOCKED')).toBeVisible({ timeout: 25_000 });
		samples.push({ action: 'BROWSER_BOOT_UNLOCK', status: 200, latencyMs: Date.now() - tBoot });

		const tabs = ['FIAT_ABA', 'P2P_ZERO_TRUST', 'TAX_FORTRESS'].sort(() => rng() - 0.5);
		for (const tab of tabs) {
			const tTab = Date.now();
			if (tab === 'FIAT_ABA') {
				const bank = ABA_BANKS[Math.floor(rng() * ABA_BANKS.length)];
				await page.getByTestId('header-nav-DEX').click();
				await page.getByTestId('dex-mode-fiat-btn').click();
				await page.getByTestId('fiat-offramp-tab-btn').click();
				const editBtn = page.getByTestId('edit-bank-rail-btn');
				if (await editBtn.isVisible()) await editBtn.click();
				await page.getByTestId('offramp-aba-input').fill(bank.routing);
				await expect(page.getByTestId('aba-recognition-badge')).toContainText(bank.match);
				await expect(page.getByText(/Dark Pool/i)).toHaveCount(0);
			} else if (tab === 'P2P_ZERO_TRUST') {
				await page.getByTestId('header-nav-DEX').click();
				await page.getByTestId('dex-mode-p2p-btn').click();
				await expect(page.getByText(/Deploy P2P Offer/i)).toBeVisible();
			} else {
				await page.getByTestId('header-nav-TAX-FORTRESS').click();
				await expect(page.getByTestId('tax-fortress-view')).toBeVisible();
			}
			samples.push({ action: `BROWSER_${tab}`, status: 200, latencyMs: Date.now() - tTab });
		}
		expect(leakedKeys).toHaveLength(0);
	} finally {
		await bCtx.close();
	}
}

function percentile(sorted: number[], p: number): number {
	if (!sorted.length) return 0;
	const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
	return sorted[idx];
}

test.describe('Perennia v5 — Stochastic Concurrent Login & Random Event Swarm', () => {
	test(`Swarm Chaos (${SWARM_USERS} Users: ${SWARM_USERS - SWARM_BROWSERS} Protocol + ${SWARM_BROWSERS} Chromium UI)`, async ({
		playwright,
		browser,
		baseURL
	}) => {
		test.setTimeout(300_000);

		const httpCredentials =
			process.env.PLAYWRIGHT_HTTP_USER && process.env.PLAYWRIGHT_HTTP_PASS
				? { username: process.env.PLAYWRIGHT_HTTP_USER, password: process.env.PLAYWRIGHT_HTTP_PASS }
				: undefined;

		const seats = Array.from({ length: SWARM_USERS }, (_, i) => deriveSwarmSeat(i + 1));
		const protocolCount = SWARM_USERS - SWARM_BROWSERS;
		const protocolSeats = seats.slice(0, protocolCount);
		const browserSeats = seats.slice(protocolCount);

		const contexts: APIRequestContext[] = [];
		const samples: MetricSample[] = [];
		let cleanedWorkers = 0;
		let cleanedSectors = 0;
		const wallStart = Date.now();

		try {
			for (let i = 0; i < protocolSeats.length; i++) {
				const ctx = await playwright.request.newContext({
					baseURL,
					...(httpCredentials ? { httpCredentials } : {})
				});
				await prewarmGate(ctx, protocolSeats[i]);
				contexts.push(ctx);
			}

			await Promise.all([
				...protocolSeats.map((seat, idx) =>
					runProtocolActor(
						contexts[idx],
						seat,
						protocolSeats[(idx + 1) % protocolSeats.length],
						mulberry32(SWARM_SEED + seat.seatIndex * 7919),
						samples
					)
				),
				...browserSeats.map((seat) =>
					runBrowserActor(
						browser,
						baseURL,
						httpCredentials,
						seat,
						mulberry32(SWARM_SEED + seat.seatIndex * 104729),
						samples
					)
				)
			]);
		} finally {
			for (let i = 0; i < protocolSeats.length; i++) {
				const seat = protocolSeats[i];
				const ctx = contexts[i];
				if (!ctx) continue;
				const headers = buildCookieHeader(seat, true);
				if (seat.sessionCookie) {
					for (const sId of seat.sectorIds) {
						const r = await ctx.post('/api/state/action', {
							headers,
							data: { action: 'DELETE_SECTOR', payload: { id: sId } }
						}).catch(() => null);
						if (r?.ok()) cleanedSectors++;
					}
					for (const wId of seat.workerIds) {
						const r = await ctx.post('/api/state/action', {
							headers,
							data: { action: 'DELETE_WORKER', payload: { id: wId } }
						}).catch(() => null);
						if (r?.ok()) cleanedWorkers++;
					}
				}
				await ctx.dispose();
			}
		}

		const wallSec = ((Date.now() - wallStart) / 1000).toFixed(2);
		const latencies = samples.map((s) => s.latencyMs).sort((a, b) => a - b);
		const serverErrors = samples.filter((s) => s.status >= 500);
		const unexpected4xx = samples.filter((s) => s.status >= 400 && s.status < 500 && !s.guarded);

		const byAction = new Map<string, MetricSample[]>();
		for (const s of samples) {
			const arr = byAction.get(s.action) || [];
			arr.push(s);
			byAction.set(s.action, arr);
		}

		console.log(`\n==================== PERENNIA V5 SWARM SCORECARD ====================`);
		console.log(`Seed: ${SWARM_SEED} | Users: ${SWARM_USERS} (${protocolCount} API/TCP + ${SWARM_BROWSERS} UI) | Wall: ${wallSec}s`);
		console.log(`Total Events: ${samples.length} (${(samples.length / Number(wallSec)).toFixed(1)} ops/s)`);
		console.log(`Latency (ms): p50=${percentile(latencies, 50)} | p95=${percentile(latencies, 95)} | p99=${percentile(latencies, 99)} | max=${latencies[latencies.length - 1] || 0}`);
		console.log(`Teardown: Cleaned ${cleanedWorkers} workers, ${cleanedSectors} silos | 5xx=${serverErrors.length} | Unexpected4xx=${unexpected4xx.length}`);
		for (const [act, list] of Array.from(byAction.entries()).sort((a, b) => b[1].length - a[1].length)) {
			const lats = list.map((x) => x.latencyMs).sort((a, b) => a - b);
			const okCnt = list.filter((x) => (x.status >= 200 && x.status < 300) || x.guarded).length;
			console.log(`  - ${act.padEnd(23)} n=${String(list.length).padStart(4)} | pass=${String(okCnt).padStart(4)} | p50=${String(percentile(lats, 50)).padStart(4)}ms | p95=${String(percentile(lats, 95)).padStart(4)}ms`);
		}
		console.log(`=====================================================================\n`);

		expect(serverErrors, `5xx errors detected: ${JSON.stringify(serverErrors.slice(0, 5))}`).toHaveLength(0);
		expect(unexpected4xx, `Unexpected 4xx: ${JSON.stringify(unexpected4xx.slice(0, 5))}`).toHaveLength(0);
	});
});