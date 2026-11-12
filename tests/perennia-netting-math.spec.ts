import { test, expect, type APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { blake2b } from '@noble/hashes/blake2.js';
import { schnorr } from '@noble/curves/secp256k1.js';

const COHORT_SIZE = 60;
const KASPA_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const LAB_TAG = 'PERENNIA_NETTING_MATH_V5';
const SSH_HOST = process.env.SWARM_SSH_HOST || 'perennia@192.168.50.100';

interface MathSeat {
	seatIndex: number;
	privateKeyBytes: Uint8Array;
	kaspaAddress: string;
	gateCookie: string;
	sessionCookie: string;
}

function loadLocalDotEnv(): Record<string, string> {
	const parsed: Record<string, string> = {};
	for (const candidate of [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '..', '.env')]) {
		if (!fs.existsSync(candidate)) continue;
		for (const rawLine of fs.readFileSync(candidate, 'utf8').split(/\r?\n/)) {
			const trimmed = rawLine.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			const eq = trimmed.indexOf('=');
			if (eq <= 0) continue;
			const k = trimmed.slice(0, eq).trim();
			const v = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
			if (k && !(k in parsed)) parsed[k] = v;
		}
	}
	return parsed;
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

function deriveMathSeat(seatIndex: number): MathSeat {
	const seed = `perennia-v5-netting-math-seat-${seatIndex.toString().padStart(4, '0')}`;
	const privateKeyBytes = blake2b(new TextEncoder().encode(seed), { dkLen: 32 });
	const pubKeyX = schnorr.getPublicKey(privateKeyBytes);
	return {
		seatIndex,
		privateKeyBytes,
		kaspaAddress: encodeKaspaAddress(pubKeyX),
		gateCookie: '',
		sessionCookie: ''
	};
}

function cookieHeaders(seat: MathSeat, withSession = true): Record<string, string> {
	const parts = [seat.gateCookie, withSession ? seat.sessionCookie : ''].filter(Boolean);
	return parts.length ? { Cookie: parts.join('; ') } : {};
}

async function prewarmAndAuthenticate(ctx: APIRequestContext, seat: MathSeat): Promise<void> {
	const gateRes = await ctx.get('/');
	expect(gateRes.ok()).toBe(true);
	const gateSet = gateRes.headers()['set-cookie'] || '';
	const gMatch = gateSet.match(/perennia_gate=[^;\s,]+/);
	if (gMatch) seat.gateCookie = gMatch[0];

	const chRes = await ctx.post('/api/auth/challenge', {
		headers: cookieHeaders(seat, false),
		data: { address: seat.kaspaAddress }
	});
	expect(chRes.ok()).toBe(true);
	const { message } = await chRes.json();
	const sigHex = bytesToHex(schnorr.sign(blake2b(new TextEncoder().encode(message), { dkLen: 32 }), seat.privateKeyBytes));

	const authRes = await ctx.post('/api/auth', {
		headers: cookieHeaders(seat, false),
		data: { address: seat.kaspaAddress, signature: sigHex, message, provider: 'sovereign' }
	});
	expect(authRes.ok()).toBe(true);
	const setCookie = authRes.headers()['set-cookie'] || '';
	const sMatch = setCookie.match(/perennia_session=[^;\s,]+/);
	const gMatch2 = setCookie.match(/perennia_gate=[^;\s,]+/);
	if (gMatch2) seat.gateCookie = gMatch2[0];
	if (sMatch) seat.sessionCookie = sMatch[0];
	expect(seat.sessionCookie.length).toBeGreaterThan(20);
}

function ensurePatchedRustDaemonLive(): void {
	const sh = [
		'code=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:8002/v1/admin/netting-cycle || echo 000)',
		'if [ "$code" = "404" ] || [ "$code" = "000" ]; then',
		'  pid=$(systemctl show -p MainPID --value perennia-stratum)',
		'  [ "$pid" -gt 1 ] && kill -9 "$pid" && sleep 4',
		'fi',
		'curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:8002/v1/admin/netting-cycle'
	].join('\n');
	const status = execFileSync('ssh', ['-o', 'BatchMode=yes', SSH_HOST, 'bash -s'], {
		input: sh,
		encoding: 'utf8',
		timeout: 20_000
	}).trim();
	expect(status, 'Patched /v1/admin/netting-cycle route must be active (401 without token)').toBe('401');
}

function callUbuntuRustAdmin(routePath: string, payload: Record<string, unknown> = {}): any {
	const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
	const py = [
		'import base64, pathlib, urllib.request',
		'env_txt = (pathlib.Path.home() / "perennia-v5-backend/.env").read_text(encoding="utf-8")',
		'tok = ""',
		'for ln in env_txt.splitlines():',
		'    s = ln.strip()',
		'    if s.startswith("INTERNAL_ADMIN_TOKEN=") or s.startswith("PERENNIA_ADMIN_KEY="):',
		'        v = s.split("=", 1)[1].strip().strip("\'\\"")',
		'        if v:',
		'            tok = v',
		'            break',
		`raw = base64.b64decode("${b64}")`,
		`req = urllib.request.Request("http://127.0.0.1:8002${routePath}", data=raw, headers={"Content-Type": "application/json", "Authorization": f"Bearer {tok}"}, method="POST")`,
		'with urllib.request.urlopen(req, timeout=30) as resp:',
		'    print(resp.read().decode("utf-8"))'
	].join('\n');
	const rawOut = execFileSync('ssh', ['-o', 'BatchMode=yes', SSH_HOST, 'python3 -'], {
		input: py,
		encoding: 'utf8',
		timeout: 40_000
	});
	return JSON.parse(rawOut.trim());
}

function readEpochTelemetryUpdatedAt(): number {
	const sh = `redis-cli --raw GET perennia:settlement:epoch_telemetry | python3 -c 'import json,sys; s=sys.stdin.read().strip(); print(json.loads(s).get(updatedAt,0) if s.startswith({) else 0)'`;
	try {
		return Number(execFileSync('ssh', ['-o', 'BatchMode=yes', SSH_HOST, 'bash -s'], { input: sh, encoding: 'utf8', timeout: 10_000 }).trim()) || 0;
	} catch { return 0; }
}

async function syncToFresh10sSweepWindow(wallets: string[]): Promise<void> {
	// Drain any straggler queue items and align right after a 10s daemon tick so all concurrent swaps land in one window
	callUbuntuRustAdmin('/v1/admin/netting-cycle', {});
	const initialTs = readEpochTelemetryUpdatedAt();
	if (initialTs > 0) {
		const deadline = Date.now() + 11_500;
		while (Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, 400));
			const cur = readEpochTelemetryUpdatedAt();
			if (cur > initialTs) break;
		}
	}
	const check = callUbuntuRustAdmin('/v1/admin/netting-lab', {
		labCohortTag: LAB_TAG,
		action: 'INSPECT_COHORT',
		wallets: wallets.slice(0, 2)
	});
	if ((check?.redis?.nettingQueueLen || 0) > 0) {
		callUbuntuRustAdmin('/v1/admin/netting-cycle', {});
	}
}

function buildSiloSector(
	id: string,
	ticker: string,
	routeMode: 'swap' | 'auto-lp' | 'hold',
	pendingKaspa: number,
	payoutAddress: string,
	spotPrice: number
) {
	return {
		id,
		name: `MATH-${routeMode.toUpperCase()}-${ticker}-${id}`,
		allocationPercentage: 50.0,
		routeMode,
		settlementConfig: {
			targetAsset: {
				ticker,
				name: ticker,
				assetClass: ticker === 'USDC' || ticker === 'USD' ? 'Stablecoin' : 'Native L1',
				spotPrice,
				theme: { hex: '#18C6A5', pastel: '#99f6e4' }
			},
			payoutAddress,
			autoPayout: true,
			mode: 'epoch',
			threshold: 50.0,
			appointmentDate: '',
			appointmentTime: '22:00'
		},
		pendingKaspa,
		width: 6
	};
}

test.describe.serial('Perennia v5 — Multi-User Dark Pool Crossing, 10s Sweep & 22:00 UTC Pooled Epoch Math', () => {
	const seats: MathSeat[] = Array.from({ length: COHORT_SIZE }, (_, i) => deriveMathSeat(i + 1));
	const lpAnchorSeat: MathSeat = deriveMathSeat(900);
	const allLabWallets: string[] = [...seats.map((s) => s.kaspaAddress), lpAnchorSeat.kaspaAddress];
	const contexts: APIRequestContext[] = [];
	let baselineRedis: Record<string, unknown> = {};
	let kasSpotUsd = 0.15;

	test.beforeAll(async ({ playwright, baseURL }) => {
		test.setTimeout(240_000);
		ensurePatchedRustDaemonLive();

		const seedRes = callUbuntuRustAdmin('/v1/admin/netting-lab', {
			labCohortTag: LAB_TAG,
			action: 'SEED_COHORT',
			lpAnchorWallet: lpAnchorSeat.kaspaAddress,
			seats: seats.map((s, idx) => ({
				wallet: s.kaspaAddress,
				balances: idx < 20 ? { KAS: 12_000, USDC: 100 } : { KAS: 500, USDC: 2_000 }
			}))
		});
		expect(seedRes.success).toBe(true);
		baselineRedis = seedRes.baseline || {};
		kasSpotUsd = Number(seedRes.kasSpotUsd || 0.15);

		const httpCredentials =
			process.env.PLAYWRIGHT_HTTP_USER && process.env.PLAYWRIGHT_HTTP_PASS
				? { username: process.env.PLAYWRIGHT_HTTP_USER, password: process.env.PLAYWRIGHT_HTTP_PASS }
				: undefined;

		for (let i = 0; i < seats.length; i++) {
			const ctx = await playwright.request.newContext({
				baseURL,
				...(httpCredentials ? { httpCredentials } : {})
			});
			contexts.push(ctx);
		}
		// Authenticate all 60 seats in waves of 20 over https://perennia.io
		for (let w = 0; w < seats.length; w += 20) {
			await Promise.all(
				seats.slice(w, w + 20).map((seat, j) => prewarmAndAuthenticate(contexts[w + j], seat))
			);
		}
	});

	test.afterAll(async () => {
		try {
			callUbuntuRustAdmin('/v1/admin/netting-lab', {
				labCohortTag: LAB_TAG,
				action: 'TEARDOWN_COHORT',
				wallets: allLabWallets,
				restoreBaseline: baselineRedis
			});
		} finally {
			for (const ctx of contexts) {
				await ctx.dispose();
			}
		}
	});

	test('1. Balanced 40-User Opposing Swap Wave (20 Sellers vs. 20 Buyers) Crosses ~100% Inside 10s Dark Pool With 0 External Orders', async () => {
		test.setTimeout(120_000);
		await syncToFresh10sSweepWindow(allLabWallets);

		const quoteRes = await contexts[0].get('/api/sor/swap?payAsset=KAS&receiveAsset=USDC&amount=200', {
			headers: cookieHeaders(seats[0])
		});
		expect(quoteRes.ok()).toBe(true);
		const quoteJson = await quoteRes.json();
		kasSpotUsd = Number(quoteJson.paySpotUsd || kasSpotUsd || 0.15);
		const usdcSpotUsd = Number(quoteJson.receiveSpotUsd || 1.0);

		const perUserUsd = 25.0;
		const sellKasAmount = Number((perUserUsd / kasSpotUsd).toFixed(4));
		const buyUsdcAmount = Number((perUserUsd / usdcSpotUsd).toFixed(4));

		const sellers = seats.slice(0, 20);
		const buyers = seats.slice(20, 40);

		const swapResponses = await Promise.all([
			...sellers.map((seat, i) =>
				contexts[i].post('/api/sor/swap', {
					headers: cookieHeaders(seat),
					data: {
						wallet: seat.kaspaAddress,
						payAsset: 'KAS',
						receiveAsset: 'USDC',
						amount: sellKasAmount,
						slippageTolerance: 0.02,
						systemMode: 'base'
					}
				})
			),
			...buyers.map((seat, i) =>
				contexts[20 + i].post('/api/sor/swap', {
					headers: cookieHeaders(seat),
					data: {
						wallet: seat.kaspaAddress,
						payAsset: 'USDC',
						receiveAsset: 'KAS',
						amount: buyUsdcAmount,
						slippageTolerance: 0.02,
						systemMode: 'base'
					}
				})
			)
		]);

		let sumSwapFeesUsd = 0;
		for (const res of swapResponses) {
			expect(res.ok(), `Swap failed with status ${res.status()}`).toBe(true);
			const body = await res.json();
			expect(body.success).toBe(true);
			expect(body.legs?.[0]?.provider).toBe('Perennia 50%-KAS Liquidity Pool');
			const wf = body.dynamicHurdleWaterfall;
			expect(
				Math.abs(wf.perenniaLpCompound60Usd + wf.perenniaLiquidReserve40Usd - wf.perenniaTotalCutUsd)
			).toBeLessThan(0.01);
			sumSwapFeesUsd += Number(body.feeUsd || 0);
		}

		// Wait up to 11.5s for the live 10-second Chronos daemon to sweep perennia:sor:netting_queue automatically
		let state = callUbuntuRustAdmin('/v1/admin/netting-lab', {
			labCohortTag: LAB_TAG,
			action: 'INSPECT_COHORT',
			wallets: allLabWallets.slice(0, 40)
		});
		const preSweepQueued = Number(state.redis?.nettingQueueLen || 0);
		const pollDeadline = Date.now() + 11_500;
		while (Number(state.redis?.nettingQueueLen || 0) > 0 && Date.now() < pollDeadline) {
			await new Promise((r) => setTimeout(r, 600));
			state = callUbuntuRustAdmin('/v1/admin/netting-lab', {
				labCohortTag: LAB_TAG,
				action: 'INSPECT_COHORT',
				wallets: allLabWallets.slice(0, 40)
			});
		}
		if (Number(state.redis?.nettingQueueLen || 0) > 0) {
			callUbuntuRustAdmin('/v1/admin/netting-cycle', {});
			state = callUbuntuRustAdmin('/v1/admin/netting-lab', {
				labCohortTag: LAB_TAG,
				action: 'INSPECT_COHORT',
				wallets: allLabWallets.slice(0, 40)
			});
		}

		const batch = state.redis?.lastNettingBatch;
		expect(state.redis?.nettingQueueLen).toBe(0);
		expect(batch).toBeTruthy();
		expect(Number(batch.ordersPopped)).toBe(40);
		expect(Number(batch.offsetEfficiencyPct)).toBeGreaterThan(97.0);
		expect(Number(batch.finalResidualUsd)).toBeLessThan(5.0);
		expect(Number(batch.externalTicketsStaged)).toBe(0);
		expect(Number(batch.spreadSavedUsd)).toBeGreaterThan(4.5);

		for (const seat of [...sellers, ...buyers]) {
			const r = state.reservoirs?.[seat.kaspaAddress];
			expect(r, `Missing reservoir for ${seat.kaspaAddress}`).toBeTruthy();
			expect(r.hmacValid).toBe(true);
			expect(r.quarantined).toBe(false);
		}

		console.log(
			`\n[WAVE 1 — BALANCED 40-USER 10S CROSS] QueuedBefore10sTick=${preSweepQueued} | Popped=${batch.ordersPopped} | ` +
				`Gross=$${batch.totalGrossUsd} | InternalOffset=$${batch.internalDarkPoolOffsetUsd} (${batch.offsetEfficiencyPct}%) | ` +
				`Residual=$${batch.finalResidualUsd} | ExternalTickets=${batch.externalTicketsStaged} | ` +
				`SwapFees=$${sumSwapFeesUsd.toFixed(2)} + SpreadSaved=$${batch.spreadSavedUsd}`
		);
	});

	test('2. Imbalanced 32-Actor Flow (18 Buyers vs. 6 Sellers + 8 Miner Silos) Offsets Miner Silos First & Stages 1 Residual Ticket', async () => {
		test.setTimeout(120_000);

		// Seed 8 Miner Swap Silos (Seats 40..47) holding $25.00 worth of pendingKaspa -> USDC each (~$200 total)
		const minerSeats = seats.slice(40, 48);
		const pendingPerMinerKas = Number((25.0 / kasSpotUsd).toFixed(4));
		callUbuntuRustAdmin('/v1/admin/netting-lab', {
			labCohortTag: LAB_TAG,
			action: 'SEED_COHORT',
			seats: minerSeats.map((m, idx) => ({
				wallet: m.kaspaAddress,
				balances: { KAS: 100, USDC: 0 },
				sectors: [
					buildSiloSector(`SILO-M-${40 + idx}`, 'USDC', 'swap', pendingPerMinerKas, m.kaspaAddress, 1.0)
				]
			}))
		});

		await syncToFresh10sSweepWindow(allLabWallets);

		const sixSellers = seats.slice(0, 6);
		const eighteenBuyers = seats.slice(20, 38);
		const sell30Kas = Number((30.0 / kasSpotUsd).toFixed(4));

		const wave2Res = await Promise.all([
			...sixSellers.map((seat, i) =>
				contexts[i].post('/api/sor/swap', {
					headers: cookieHeaders(seat),
					data: {
						wallet: seat.kaspaAddress,
						payAsset: 'KAS',
						receiveAsset: 'USDC',
						amount: sell30Kas,
						slippageTolerance: 0.02,
						systemMode: 'base'
					}
				})
			),
			...eighteenBuyers.map((seat, i) =>
				contexts[20 + i].post('/api/sor/swap', {
					headers: cookieHeaders(seat),
					data: {
						wallet: seat.kaspaAddress,
						payAsset: 'USDC',
						receiveAsset: 'KAS',
						amount: 30.0,
						slippageTolerance: 0.02,
						systemMode: 'base'
					}
				})
			)
		]);
		for (const r of wave2Res) expect(r.ok()).toBe(true);

		const cycleRes = callUbuntuRustAdmin('/v1/admin/netting-cycle', {});
		expect(cycleRes.success).toBe(true);
		const batch = cycleRes.batchReceipt;

		expect(Number(batch.ordersPopped)).toBe(24);
		expect(Number(batch.userToUserCrossedUsd)).toBeGreaterThan(340.0);
		expect(Number(batch.minerSilosCrossedCount)).toBe(8);
		expect(Number(batch.minerSiloCrossedUsd)).toBeGreaterThan(190.0);
		expect(Number(batch.offsetEfficiencyPct)).toBeGreaterThan(78.0);
		expect(Number(batch.finalResidualUsd)).toBeGreaterThan(140.0);
		expect(Number(batch.finalResidualUsd)).toBeLessThan(180.0);
		expect(Number(batch.externalTicketsStaged)).toBe(1);

		const inspect2 = callUbuntuRustAdmin('/v1/admin/netting-lab', {
			labCohortTag: LAB_TAG,
			action: 'INSPECT_COHORT',
			wallets: minerSeats.map((m) => m.kaspaAddress)
		});
		for (const m of minerSeats) {
			const r = inspect2.reservoirs?.[m.kaspaAddress];
			expect(r?.hmacValid).toBe(true);
			expect(Number(r?.lpTokens?.USDC || 0)).toBeGreaterThan(24.0);
			const secs = inspect2.sectorsByWallet?.[m.kaspaAddress] || [];
			expect(Number(secs[0]?.pendingKaspa || 0)).toBeLessThan(0.01);
		}
		const staged = (inspect2.redis?.passthroughQueue || []).find(
			(t: any) => t.batch_id === batch.batchId
		);
		expect(staged).toBeTruthy();
		expect(staged.type).toBe('NET_RESIDUAL_AUTOBALANCE');
		expect(staged.orders_consolidated).toBe(24);

		console.log(
			`\n[WAVE 2 — IMBALANCED 32-ACTOR + MINER SILO OFFSET] Swaps=${batch.ordersPopped} | ` +
				`PeerCrossed=$${batch.userToUserCrossedUsd} | MinerSilosCrossed=${batch.minerSilosCrossedCount} ($${batch.minerSiloCrossedUsd}) | ` +
				`TotalInternalOffset=$${batch.internalDarkPoolOffsetUsd} (${batch.offsetEfficiencyPct}%) | ` +
				`SingleExternalResidual=$${batch.finalResidualUsd} (Tickets=${batch.externalTicketsStaged})`
		);
	});

	test('3. 22:00 UTC Epoch Bell Pools 18 Sub-Threshold Swap Miners Together, Mints 4 Auto-LP Positions, Holds KAS & Preserves Sub-Min Dust', async ({
		request,
		baseURL
	}) => {
		test.setTimeout(120_000);

		const usdMiners = seats.slice(34, 46); // 12 miners x $3.00 = $36.00 pooled (> $25.28 USD min, though $3.00 solo < $25.28!)
		const usdcMiners = seats.slice(46, 52); // 6 miners x $6.00 = $36.00 pooled (> ChangeNOW USDC min)
		const autoLpMiners = seats.slice(52, 56); // 4 miners x $12.00 auto-lp (50/50 KAS/USDC LP position)
		const holdKasMiners = seats.slice(56, 58); // 2 miners x 50 KAS native hold (0% swap fee)
		const dustSiloMiners = seats.slice(58, 60); // 2 miners x $0.50 SILO = $1.00 pooled (< $3.50 SILO min -> stays FILLING!)

		const kasForUsd = (usd: number) => Number((usd / kasSpotUsd).toFixed(4));

		callUbuntuRustAdmin('/v1/admin/netting-lab', {
			labCohortTag: LAB_TAG,
			action: 'SEED_COHORT',
			seats: [
				...usdMiners.map((s, i) => ({
					wallet: s.kaspaAddress,
					balances: { KAS: 10 },
					sectors: [buildSiloSector(`EP-USD-${i}`, 'USD', 'swap', kasForUsd(3.0), s.kaspaAddress, 1.0)]
				})),
				...usdcMiners.map((s, i) => ({
					wallet: s.kaspaAddress,
					balances: { KAS: 10 },
					sectors: [buildSiloSector(`EP-USDC-${i}`, 'USDC', 'swap', kasForUsd(6.0), s.kaspaAddress, 1.0)]
				})),
				...autoLpMiners.map((s, i) => ({
					wallet: s.kaspaAddress,
					balances: { KAS: 10 },
					sectors: [buildSiloSector(`EP-LP-${i}`, 'USDC', 'auto-lp', kasForUsd(12.0), s.kaspaAddress, 1.0)]
				})),
				...holdKasMiners.map((s, i) => ({
					wallet: s.kaspaAddress,
					balances: { KAS: 10 },
					sectors: [buildSiloSector(`EP-HOLD-${i}`, 'KAS', 'hold', 50.0, s.kaspaAddress, kasSpotUsd)]
				})),
				...dustSiloMiners.map((s, i) => ({
					wallet: s.kaspaAddress,
					balances: { KAS: 10 },
					sectors: [buildSiloSector(`EP-DUST-${i}`, 'SILO', 'swap', kasForUsd(0.5), s.kaspaAddress, 0.05)]
				}))
			]
		});

		const beforeLp = callUbuntuRustAdmin('/v1/admin/netting-lab', {
			labCohortTag: LAB_TAG,
			action: 'INSPECT_COHORT',
			wallets: allLabWallets
		});

		// Trigger 22:00 UTC Global Settlement Bell via HTTPS /api/admin if local ADMIN_TOKEN present, else Rust admin API
		const dotEnv = loadLocalDotEnv();
		const adminToken = (
			process.env.PERENNIA_ADMIN_KEY ||
			dotEnv.PERENNIA_ADMIN_KEY ||
			process.env.INTERNAL_ADMIN_TOKEN ||
			dotEnv.INTERNAL_ADMIN_TOKEN ||
			''
		).trim();

		let bellResult: any = null;
		if (adminToken) {
			await request.get('/');
			const origin = new URL(baseURL || 'https://perennia.io').origin;
			const httpBell = await request.post('/api/admin', {
				headers: { Authorization: `Bearer ${adminToken}`, Origin: origin },
				data: { action: 'FORCE_EPOCH_BELL' }
			});
			if (httpBell.ok()) {
				const bJson = await httpBell.json();
				bellResult = bJson.epochTelemetry;
			}
		}
		if (!bellResult) {
			const rustBell = callUbuntuRustAdmin('/v1/admin/epoch-bell', {});
			expect(rustBell.success).toBe(true);
			bellResult = rustBell.epochTelemetry;
		}

		const netSummary = bellResult?.netting || {};
		expect(netSummary.pooledBucketsCleared).toEqual(expect.arrayContaining(['USD', 'USDC']));
		expect(netSummary.pooledBucketsCleared).not.toContain('SILO');
		expect(Number(netSummary.settledSectorsCount)).toBeGreaterThanOrEqual(24);

		const afterEpoch = callUbuntuRustAdmin('/v1/admin/netting-lab', {
			labCohortTag: LAB_TAG,
			action: 'INSPECT_COHORT',
			wallets: allLabWallets
		});

		for (const s of usdMiners) {
			expect(Number(afterEpoch.reservoirs?.[s.kaspaAddress]?.lpTokens?.USDC || 0)).toBeGreaterThan(2.9);
			expect(Number(afterEpoch.sectorsByWallet?.[s.kaspaAddress]?.[0]?.pendingKaspa || 0)).toBe(0);
		}
		for (const s of usdcMiners) {
			expect(Number(afterEpoch.reservoirs?.[s.kaspaAddress]?.lpTokens?.USDC || 0)).toBeGreaterThan(5.85);
			expect(Number(afterEpoch.sectorsByWallet?.[s.kaspaAddress]?.[0]?.pendingKaspa || 0)).toBe(0);
		}
		for (const s of holdKasMiners) {
			expect(Number(afterEpoch.reservoirs?.[s.kaspaAddress]?.streamingKas || 0)).toBeCloseTo(60.0, 2);
			expect(Number(afterEpoch.sectorsByWallet?.[s.kaspaAddress]?.[0]?.pendingKaspa || 0)).toBe(0);
		}
		for (const s of dustSiloMiners) {
			// Sub-threshold $1.00 pooled SILO bucket (< $3.50 min) must remain preserved in pendingKaspa
			expect(Number(afterEpoch.sectorsByWallet?.[s.kaspaAddress]?.[0]?.pendingKaspa || 0)).toBeGreaterThan(0);
		}

		expect(Number(afterEpoch.lpPositionsCount) - Number(beforeLp.lpPositionsCount)).toBe(4);
		expect(Number(afterEpoch.hifoLotCount)).toBeGreaterThanOrEqual(20);

		for (const w of Object.keys(afterEpoch.reservoirs || {})) {
			expect(afterEpoch.reservoirs[w].hmacValid).toBe(true);
			expect(afterEpoch.reservoirs[w].quarantined).toBe(false);
		}

		console.log(
			`\n[WAVE 3 — 22:00 UTC POOLED EPOCH BELL] ClearedBuckets=${JSON.stringify(netSummary.pooledBucketsCleared)} | ` +
				`SettledSectors=${netSummary.settledSectorsCount} (12 Sub-Min USD + 6 USDC + 4 Auto-LP + 2 Hold KAS) | ` +
				`SweptKas=${netSummary.totalSweptKas} | DustPreserved=2/2 SILO | AllReservoirHMACs=VALID\n`
		);
	});
});