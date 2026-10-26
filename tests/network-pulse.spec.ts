import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Redis from 'ioredis';
import pkg from 'pg';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { HDKey } from '@scure/bip32';
import { blake2b } from '@noble/hashes/blake2.js';
import { schnorr } from '@noble/curves/secp256k1.js';

const { Pool } = pkg;

function loadDotEnvIfNeeded() {
	const envPath = path.resolve(process.cwd(), '.env');
	if (!fs.existsSync(envPath)) return;
	const lines = fs.readFileSync(envPath, 'utf-8').split(/\r?\n/);
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eqIdx = trimmed.indexOf('=');
		if (eqIdx === -1) continue;
		const key = trimmed.slice(0, eqIdx).trim();
		let val = trimmed.slice(eqIdx + 1).trim();
		if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
			val = val.slice(1, -1);
		}
		if (!process.env[key]) {
			process.env[key] = val;
		}
	}
}

loadDotEnvIfNeeded();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const REDIS_URL = process.env.REDIS_URL || 'redis://192.168.50.100:6379';
const DATABASE_URL =
	process.env.DATABASE_URL || 'postgres://postgres:password@192.168.50.100:5432/perennia';

const MASTER_TREASURY_ADDRESS =
	'kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579';
const PRIMARY_PERSONAL_VAULT =
	'kaspa:qrsmsx90uctxg5lnjra64vad98kwuhq7xxhk0f7q5g245tyerxznj21vwe0hx';

const HARD_RESERVE_CAPS: Record<string, number> = {
	BTC: 0.00003076,
	ETH: 0.001045052,
	SOL: 0.026152459,
	USDC: 25.0
};

const ROTATING_SEAT_COUNT = 3;
const VIRTUAL_DAY_HOURS = 24;
const SEAT_STEP_TIMEOUT_MS = 10000;
const HTTP_REQ_TIMEOUT_MS = 5000;
const KASPA_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const TX_SIGNING_KEY = new TextEncoder().encode('TransactionSigningHash');
const SIGHASH_ALL = 1;
const BASE_COMPUTE_MASS = 200n;
const MASS_PER_INPUT = 1200n;
const MASS_PER_OUTPUT = 450n;
const STORAGE_MASS_PARAMETER = 1_000_000_000_000n;
const FEE_PER_GRAM = 110n;
const MIN_CHANGE_SOMPI = 10_000_000n;

type Persona = 'MINER' | 'LP_FARMER' | 'SPOT_TRADER' | 'P2P_TRADER' | 'RED_TEAM_AND_OTC';

interface BotIdentity {
	id: string;
	index: number;
	persona: Persona;
	isFundedL1: boolean;
	mnemonic: string;
	privateKeyHex: string;
	address: string;
	cleanAddress: string;
	workerName: string;
}

interface SeatContext {
	seatId: string;
	context: BrowserContext;
	page: Page;
}

interface PulseStats {
	startedAt: number;
	virtualDay: number;
	virtualHour: number;
	activeTargetUsers: number;
	totalLogins: number;
	totalLogouts: number;
	validTxCount: number;
	rejectedTxCount: number;
	securityGuardsVerified: number;
	totalFeesCapturedUsd: number;
	houseFeesCapturedUsd: number;
	lpFeesCapturedUsd: number;
	byCategory: Record<
		string,
		{
			valid: number;
			rejected: number;
			feesCapturedUsd: number;
			lastTxId: string;
			lastActor: string;
		}
	>;
	seats: Record<
		string,
		{
			activeBot: string;
			persona: string;
			address: string;
			status: string;
			lastAction: string;
			updatedAt: number;
		}
	>;
}

function withSeatTimeout<T>(promise: Promise<T>, ms: number, fallbackValue: T): Promise<T> {
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve(fallbackValue), ms);
		promise
			.then((val) => {
				clearTimeout(timer);
				resolve(val);
			})
			.catch(() => {
				clearTimeout(timer);
				resolve(fallbackValue);
			});
	});
}

function hexToBytes(hex: string): Uint8Array {
	const clean = hex.trim().replace(/^0x/i, '');
	if (clean.length % 2 !== 0) throw new Error('ERR_INVALID_HEX_LENGTH');
	const bytes = new Uint8Array(clean.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

function normalizeKaspaAddress(addr: string): string {
	const clean = addr.trim().toLowerCase().replace(/^kaspa:/i, '');
	return `kaspa:${clean}`;
}

function cleanKaspaBase32(addr: string): string {
	return addr.trim().toLowerCase().replace(/^kaspa:/i, '');
}

function encodeKaspaAddress(pubKeyX: Uint8Array): string {
	const polymod = (values: number[]) => {
		let c = 1n;
		for (const v of values) {
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
	const prefix = 'kaspa';
	const prefixValues = prefix
		.split('')
		.map((c) => c.charCodeAt(0) & 31)
		.concat([0]);
	const payload = [0, ...Array.from(pubKeyX)];
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
	const mod = polymod([...prefixValues, ...payload5, 0, 0, 0, 0, 0, 0, 0, 0]);
	const checksum = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => Number((mod >> BigInt(5 * (7 - i))) & 31n));
	return (
		prefix +
		':' +
		[...payload5, ...checksum].map((v) => KASPA_CHARSET[v]).join('')
	);
}

function decodeAddressToPubkey(address: string): Uint8Array {
	const formatted = normalizeKaspaAddress(address);
	const parts = formatted.split(':');
	if (parts.length !== 2) throw new Error('ERR_INVALID_ADDRESS_FORMAT');
	const base32 = parts[1];
	const decoded = new Uint8Array(base32.length - 8);
	for (let i = 0; i < base32.length - 8; i++) {
		const val = KASPA_CHARSET.indexOf(base32[i]);
		if (val === -1) throw new Error('ERR_INVALID_BASE32_CHAR');
		decoded[i] = val;
	}
	const out: number[] = [];
	let val = 0;
	let bits = 0;
	for (let i = 0; i < decoded.length; i++) {
		val = (val << 5) | decoded[i];
		bits += 5;
		while (bits >= 8) {
			bits -= 8;
			out.push((val >> bits) & 0xff);
		}
	}
	return new Uint8Array(out.slice(1, 33));
}

function writeUint16LE(val: number): Uint8Array {
	const arr = new Uint8Array(2);
	new DataView(arr.buffer).setUint16(0, val, true);
	return arr;
}

function writeUint32LE(val: number): Uint8Array {
	const arr = new Uint8Array(4);
	new DataView(arr.buffer).setUint32(0, val, true);
	return arr;
}

function writeBigUint64LE(val: bigint): Uint8Array {
	const arr = new Uint8Array(8);
	new DataView(arr.buffer).setBigUint64(0, val, true);
	return arr;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
	const totalLen = arrays.reduce((acc, arr) => acc + arr.length, 0);
	const res = new Uint8Array(totalLen);
	let offset = 0;
	for (const arr of arrays) {
		res.set(arr, offset);
		offset += arr.length;
	}
	return res;
}

function calculateComputeMass(numInputs: number, numOutputs: number, payloadByteLen = 0): bigint {
	return (
		BASE_COMPUTE_MASS +
		BigInt(numInputs) * MASS_PER_INPUT +
		BigInt(numOutputs) * MASS_PER_OUTPUT +
		BigInt(payloadByteLen)
	);
}

function calculateStorageMass(inputAmounts: bigint[], outputAmounts: bigint[]): bigint {
	if (inputAmounts.length === 0 || outputAmounts.length === 0) return 0n;
	let harmonicOuts = 0n;
	for (const v of outputAmounts) {
		harmonicOuts += v > 0n ? STORAGE_MASS_PARAMETER / v : STORAGE_MASS_PARAMETER;
	}
	if (outputAmounts.length === 1 || inputAmounts.length >= outputAmounts.length) {
		let sumIns = 0n;
		for (const v of inputAmounts) sumIns += v;
		const meanIns = sumIns / BigInt(inputAmounts.length);
		if (meanIns <= 0n) return harmonicOuts;
		const arithmeticIns = BigInt(inputAmounts.length) * (STORAGE_MASS_PARAMETER / meanIns);
		return harmonicOuts > arithmeticIns ? harmonicOuts - arithmeticIns : 0n;
	} else {
		let harmonicIns = 0n;
		for (const v of inputAmounts) {
			if (v > 0n) harmonicIns += STORAGE_MASS_PARAMETER / v;
		}
		return harmonicOuts > harmonicIns ? harmonicOuts - harmonicIns : 0n;
	}
}

function buildSignedKaspaTransfer(
	privateKeyHex: string,
	destinationAddress: string,
	amountKas: number,
	rawUtxos: any[]
): { tx: any; feeSompi: bigint } {
	const privKeyBytes = hexToBytes(privateKeyHex);
	const myPubKeyBytes = schnorr.getPublicKey(privKeyBytes);
	const sourceScriptHex = `20${bytesToHex(myPubKeyBytes)}ac`;
	const targetSompi = BigInt(Math.floor(amountKas * 1e8));
	if (targetSompi <= 0n) {
		throw new Error('Transfer amount must be > 0 sompi');
	}

	const sortedUtxos = [...rawUtxos].sort((a, b) => {
		const amtA = BigInt(a.amount ?? a.utxoEntry?.amount ?? 0);
		const amtB = BigInt(b.amount ?? b.utxoEntry?.amount ?? 0);
		return amtA < amtB ? 1 : amtA > amtB ? -1 : 0;
	});

	let gathered = 0n;
	let fee = 0n;
	const selectedUtxos: any[] = [];
	const inputAmounts: bigint[] = [];

	for (const u of sortedUtxos) {
		selectedUtxos.push(u);
		const amt = BigInt(u.amount ?? u.utxoEntry?.amount ?? 0);
		inputAmounts.push(amt);
		gathered += amt;

		const computeMassTwo = calculateComputeMass(selectedUtxos.length, 2, 0);
		const provisionalFee = computeMassTwo * FEE_PER_GRAM;
		const provisionalChange =
			gathered > targetSompi + provisionalFee ? gathered - (targetSompi + provisionalFee) : 0n;
		const provisionalOutputs =
			provisionalChange >= MIN_CHANGE_SOMPI ? [targetSompi, provisionalChange] : [targetSompi];

		const computeMass = calculateComputeMass(selectedUtxos.length, provisionalOutputs.length, 0);
		const storageMass = calculateStorageMass(inputAmounts, provisionalOutputs);
		const effectiveMass = computeMass > storageMass ? computeMass : storageMass;
		fee = effectiveMass * FEE_PER_GRAM;

		if (gathered >= targetSompi + fee) break;
	}

	if (gathered < targetSompi + fee) {
		throw new Error(`ERR_INSUFFICIENT_MASS: Required ${targetSompi + fee}, Available ${gathered}`);
	}

	const change = gathered - targetSompi - fee;
	const destPubKey = decodeAddressToPubkey(destinationAddress);
	const destScriptHex = `20${bytesToHex(destPubKey)}ac`;

	const txInputs = selectedUtxos.map((u) => ({
		previousOutpoint: {
			transactionId: u.outpoint?.transactionId ?? u.transactionId,
			index: Number(u.outpoint?.index ?? u.index ?? 0)
		},
		signatureScript: '',
		sequence: 0,
		sigOpCount: 1
	}));

	const txOutputs: any[] = [
		{
			amount: Number(targetSompi),
			scriptPublicKey: destScriptHex
		}
	];

	if (change >= MIN_CHANGE_SOMPI) {
		txOutputs.push({
			amount: Number(change),
			scriptPublicKey: sourceScriptHex
		});
	}

	const tx = {
		version: 0,
		inputs: txInputs,
		outputs: txOutputs,
		lockTime: 0,
		subnetworkId: '0000000000000000000000000000000000000000',
		gas: 0,
		payload: '',
		mass: 0,
		storageMass: 0
	};

	const prevOutsHash = blake2b(
		concatBytes(
			...tx.inputs.map((i) =>
				concatBytes(
					hexToBytes(i.previousOutpoint.transactionId),
					writeUint32LE(i.previousOutpoint.index)
				)
			)
		),
		{ dkLen: 32, key: TX_SIGNING_KEY }
	);
	const sequencesHash = blake2b(
		concatBytes(...tx.inputs.map((i) => writeBigUint64LE(BigInt(i.sequence)))),
		{ dkLen: 32, key: TX_SIGNING_KEY }
	);
	const sigOpCountsHash = blake2b(
		concatBytes(...tx.inputs.map((i) => new Uint8Array([i.sigOpCount]))),
		{ dkLen: 32, key: TX_SIGNING_KEY }
	);
	const outputsHash = blake2b(
		concatBytes(
			...tx.outputs.map((o) => {
				const spkBytes = hexToBytes(o.scriptPublicKey);
				return concatBytes(
					writeBigUint64LE(BigInt(o.amount)),
					writeUint16LE(0),
					writeBigUint64LE(BigInt(spkBytes.length)),
					spkBytes
				);
			})
		),
		{ dkLen: 32, key: TX_SIGNING_KEY }
	);

	const subnetworkIdBytes = new Uint8Array(20);
	const payloadHash = new Uint8Array(32);

	for (let i = 0; i < tx.inputs.length; i++) {
		const input = tx.inputs[i];
		const utxo = selectedUtxos[i];
		const spkHex =
			typeof utxo.scriptPublicKey === 'string'
				? utxo.scriptPublicKey
				: (utxo.scriptPublicKey?.scriptPublicKey ??
					utxo.utxoEntry?.scriptPublicKey?.scriptPublicKey ??
					sourceScriptHex);
		const amt = BigInt(utxo.amount ?? utxo.utxoEntry?.amount ?? 0);
		const spkBytes = hexToBytes(spkHex);

		const sigHashData = concatBytes(
			writeUint16LE(tx.version),
			prevOutsHash,
			sequencesHash,
			sigOpCountsHash,
			hexToBytes(input.previousOutpoint.transactionId),
			writeUint32LE(input.previousOutpoint.index),
			writeUint16LE(0),
			writeBigUint64LE(BigInt(spkBytes.length)),
			spkBytes,
			writeBigUint64LE(amt),
			writeBigUint64LE(BigInt(input.sequence)),
			new Uint8Array([input.sigOpCount]),
			outputsHash,
			writeBigUint64LE(BigInt(tx.lockTime)),
			subnetworkIdBytes,
			writeBigUint64LE(BigInt(tx.gas)),
			payloadHash,
			new Uint8Array([SIGHASH_ALL])
		);

		const sighash = blake2b(sigHashData, { dkLen: 32, key: TX_SIGNING_KEY });
		const signature = schnorr.sign(sighash, privKeyBytes);
		input.signatureScript = `41${bytesToHex(signature)}01`;
	}

	privKeyBytes.fill(0);
	return { tx, feeSompi: fee };
}

function assignPersona(index: number): Persona {
	const personas: Persona[] = [
		'MINER',
		'LP_FARMER',
		'SPOT_TRADER',
		'P2P_TRADER',
		'RED_TEAM_AND_OTC'
	];
	return personas[(index - 1) % personas.length];
}

function deriveBotFromMnemonic(
	id: string,
	index: number,
	mnemonic: string,
	isFundedL1: boolean
): BotIdentity {
	const seed = bip39.mnemonicToSeedSync(mnemonic);
	const masterHdKey = HDKey.fromMasterSeed(seed);
	const kasKey = masterHdKey.derive("m/44'/111111'/0'/0/0");
	const privateKeyHex = bytesToHex(kasKey.privateKey!);
	const pubKeyX = schnorr.getPublicKey(kasKey.privateKey!);
	const address = normalizeKaspaAddress(encodeKaspaAddress(pubKeyX));
	return {
		id,
		index,
		persona: assignPersona(index),
		isFundedL1,
		mnemonic,
		privateKeyHex,
		address,
		cleanAddress: cleanKaspaBase32(address),
		workerName: `ASIC-${id.replace(/[^A-Za-z0-9]/g, '')}`
	};
}

function loadAndExpandBotFleet(totalTarget = 100): BotIdentity[] {
	const fleetPath = path.resolve(process.cwd(), 'tests', 'bot-fleet-20.json');
	const fleet: BotIdentity[] = [];

	if (fs.existsSync(fleetPath)) {
		const raw = JSON.parse(fs.readFileSync(fleetPath, 'utf-8'));
		const entries: any[] = Array.isArray(raw) ? raw : raw.bots || raw.nodes || [];

		for (let i = 0; i < entries.length; i++) {
			const item = entries[i];
			const index = i + 1;
			const id = item.id || item.name || `Node-${String(index).padStart(2, '0')}`;
			const mnemonic = item.mnemonic || item.seedPhrase || item.phrase || '';
			const rawPriv =
				item.privateKey ||
				item.privateKeyHex ||
				item.kaspaPrivateKey ||
				item.wallets?.kaspa?.privateKey ||
				'';
			const rawAddr =
				item.address ||
				item.kaspaAddress ||
				item.wallet ||
				item.wallets?.kaspa?.address ||
				'';

			if (rawAddr.toLowerCase().includes(cleanKaspaBase32(PRIMARY_PERSONAL_VAULT))) {
				throw new Error(
					'CRITICAL SAFETY HALT: Primary Personal Vault detected in bot fleet file!'
				);
			}

			if (rawPriv) {
				const cleanPriv = rawPriv.trim().replace(/^0x/i, '');
				const pubKeyX = schnorr.getPublicKey(hexToBytes(cleanPriv));
				const derivedAddr = rawAddr
					? normalizeKaspaAddress(rawAddr)
					: normalizeKaspaAddress(encodeKaspaAddress(pubKeyX));
				const fallbackEntropy = crypto
					.createHash('sha256')
					.update(`perennia-bot-seed-${id}-${cleanPriv}`)
					.digest();
				const resolvedMnemonic =
					mnemonic && bip39.validateMnemonic(mnemonic, wordlist)
						? mnemonic
						: bip39.entropyToMnemonic(fallbackEntropy, wordlist);

				fleet.push({
					id,
					index,
					persona: assignPersona(index),
					isFundedL1: true,
					mnemonic: resolvedMnemonic,
					privateKeyHex: cleanPriv,
					address: derivedAddr,
					cleanAddress: cleanKaspaBase32(derivedAddr),
					workerName: `ASIC-${id.replace(/[^A-Za-z0-9]/g, '')}`
				});
			} else if (mnemonic && bip39.validateMnemonic(mnemonic, wordlist)) {
				fleet.push(deriveBotFromMnemonic(id, index, mnemonic, true));
			}
		}
	}

	for (let idx = fleet.length + 1; idx <= totalTarget; idx++) {
		const id = `Node-${String(idx).padStart(2, '0')}`;
		const deterministicEntropy = crypto
			.createHash('sha256')
			.update(`PERENNIA_ORGANIC_SCALING_FLEET_V5_${id}`)
			.digest();
		const mnemonic = bip39.entropyToMnemonic(deterministicEntropy, wordlist);
		fleet.push(deriveBotFromMnemonic(id, idx, mnemonic, idx <= 20));
	}

	return fleet;
}

function createSignedTransakJwt(payloadObj: any, secret: string): string {
	const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
	const payloadB64 = Buffer.from(JSON.stringify(payloadObj))
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
	const signatureB64 = crypto
		.createHmac('sha256', secret)
		.update(`${headerB64}.${payloadB64}`)
		.digest('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
	return `${headerB64}.${payloadB64}.${signatureB64}`;
}

test.describe('Perennia Sovereign Network Pulse Daemon (3 Rotating Seats -> 20..100 Users)', () => {
	test('Perpetual 24-Cycle Virtual Day with Multi-Asset Solvency, Red-Team Guards & Profit Telemetry', async ({
		browser
	}) => {
		test.setTimeout(0);

		const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });
		const dbPool = new Pool({
			connectionString: DATABASE_URL,
			max: 15,
			idleTimeoutMillis: 30000
		});

		const allBots = loadAndExpandBotFleet(100);
		expect(allBots.length).toBe(100);

		const stats: PulseStats = {
			startedAt: Date.now(),
			virtualDay: 1,
			virtualHour: 1,
			activeTargetUsers: 20,
			totalLogins: 0,
			totalLogouts: 0,
			validTxCount: 0,
			rejectedTxCount: 0,
			securityGuardsVerified: 0,
			totalFeesCapturedUsd: 0,
			houseFeesCapturedUsd: 0,
			lpFeesCapturedUsd: 0,
			byCategory: {
				AUTH_HANDSHAKE: {
					valid: 0,
					rejected: 0,
					feesCapturedUsd: 0,
					lastTxId: '',
					lastActor: ''
				},
				SECTOR_ROUTING: {
					valid: 0,
					rejected: 0,
					feesCapturedUsd: 0,
					lastTxId: '',
					lastActor: ''
				},
				DARK_POOL_SWAP: {
					valid: 0,
					rejected: 0,
					feesCapturedUsd: 0,
					lastTxId: '',
					lastActor: ''
				},
				LP_PROVISION: {
					valid: 0,
					rejected: 0,
					feesCapturedUsd: 0,
					lastTxId: '',
					lastActor: ''
				},
				P2P_ATOMIC_0X83: {
					valid: 0,
					rejected: 0,
					feesCapturedUsd: 0,
					lastTxId: '',
					lastActor: ''
				},
				L1_SOVEREIGN_TX: {
					valid: 0,
					rejected: 0,
					feesCapturedUsd: 0,
					lastTxId: '',
					lastActor: ''
				},
				SECURITY_GUARD: {
					valid: 0,
					rejected: 0,
					feesCapturedUsd: 0,
					lastTxId: '',
					lastActor: ''
				},
				OTC_AND_WEBHOOK: {
					valid: 0,
					rejected: 0,
					feesCapturedUsd: 0,
					lastTxId: '',
					lastActor: ''
				},
				EPOCH_2200_BELL: {
					valid: 0,
					rejected: 0,
					feesCapturedUsd: 0,
					lastTxId: '',
					lastActor: ''
				}
			},
			seats: {}
		};

		async function recordOutcome(
			category: keyof PulseStats['byCategory'],
			valid: boolean,
			actor: string,
			txRef: string,
			detail = '',
			feeCapturedUsd = 0,
			houseShareUsd = 0,
			lpShareUsd = 0
		) {
			const bucket = stats.byCategory[category];
			if (valid) {
				stats.validTxCount += 1;
				bucket.valid += 1;
				bucket.lastTxId = txRef;
				bucket.lastActor = actor;
				if (category === 'SECURITY_GUARD') {
					stats.securityGuardsVerified += 1;
				}
				if (feeCapturedUsd > 0) {
					stats.totalFeesCapturedUsd += feeCapturedUsd;
					stats.houseFeesCapturedUsd += houseShareUsd;
					stats.lpFeesCapturedUsd += lpShareUsd;
					bucket.feesCapturedUsd += feeCapturedUsd;
				}
			} else {
				stats.rejectedTxCount += 1;
				bucket.rejected += 1;
			}

			const eventEntry = JSON.stringify({
				ts: Date.now(),
				virtualDay: stats.virtualDay,
				virtualHour: stats.virtualHour,
				category,
				valid,
				actor,
				txRef,
				detail,
				feeCapturedUsd,
				runningTotalFeesUsd: stats.totalFeesCapturedUsd
			});

			await redis
				.multi()
				.lpush('perennia:pulse:tx_log', eventEntry)
				.ltrim('perennia:pulse:tx_log', 0, 299)
				.set('perennia:pulse:telemetry', JSON.stringify(stats))
				.exec()
				.catch(() => {});
		}

		async function getOraclePrices(): Promise<Record<string, number>> {
			const [kas, btc, eth, sol] = await Promise.all([
				redis.get('oracle:spot:KAS_USDC'),
				redis.get('oracle:spot:BTC_USDC'),
				redis.get('oracle:spot:ETH_USDC'),
				redis.get('oracle:spot:SOL_USDC')
			]);
			return {
				KAS: parseFloat(kas || '0.0385') || 0.0385,
				BTC: parseFloat(btc || '85000') || 85000,
				ETH: parseFloat(eth || '2800') || 2800,
				SOL: parseFloat(sol || '160') || 160,
				USDC: 1.0
			};
		}

		async function compoundTreasuryIntoLpPool() {
			try {
				const [poolFeeKasStr, nettingProfitUsdStr, expressUsdStr] = await Promise.all([
					redis.get('perennia:fees:batch_accumulated:KAS'),
					redis.get('perennia:treasury:netting_profit_usd'),
					redis.get('perennia:treasury:express_premiums_usd')
				]);
				const prices = await getOraclePrices();
				const poolFeeKas = parseFloat(poolFeeKasStr || '0') || 0;
				const usdFees =
					(parseFloat(nettingProfitUsdStr || '0') || 0) +
					(parseFloat(expressUsdStr || '0') || 0);
				const targetHouseKasStake = Math.max(10.0, poolFeeKas + usdFees / (prices.KAS || 0.0385));

				const existingRes = await dbPool.query(
					`SELECT lp_id FROM liquidity_providers WHERE wallet_address = $1 AND pool_pair = 'KAS/USDC' LIMIT 1`,
					[MASTER_TREASURY_ADDRESS]
				);
				if (existingRes.rows.length > 0) {
					await dbPool.query(
						`UPDATE liquidity_providers
						 SET staked_asset_a = GREATEST(staked_asset_a, $1),
						     lock_duration_days = 365
						 WHERE lp_id = $2`,
						[targetHouseKasStake, existingRes.rows[0].lp_id]
					);
				} else {
					await dbPool.query(
						`INSERT INTO liquidity_providers (wallet_address, pool_pair, staked_asset_a, staked_asset_b, lock_duration_days, unlock_date)
						 VALUES ($1, 'KAS/USDC', $2, 1.0, 365, CURRENT_TIMESTAMP + INTERVAL '365 days')`,
						[MASTER_TREASURY_ADDRESS, targetHouseKasStake]
					);
				}
			} catch {
				// Ignore transient DB lock
			}
		}

		async function reconcileReserveCapsOnBoot() {
			const prices = await getOraclePrices();

			await redis
				.multi()
				.set('oracle:gas_fee_usd:USDC', '0.00')
				.set('oracle:gas_fee_usd:SOL', '0.00')
				.set('oracle:gas_fee_usd:ETH', '0.00')
				.set('oracle:gas_fee_usd:BTC', '0.00')
				.set('perennia:pulse:telemetry', JSON.stringify(stats))
				.exec()
				.catch(() => {});

			await dbPool
				.query(
					`UPDATE p2p_orders SET status = 'expired'
					 WHERE status = 'open' AND (created_at < CURRENT_TIMESTAMP - INTERVAL '10 minutes' OR buy_amount > 0.5)`
				)
				.catch(() => {});

			await compoundTreasuryIntoLpPool();

			const keys = await redis.keys('dev:sor:treasury:balances:*');
			if (keys.length === 0) return;

			const pipe = redis.pipeline();
			for (const k of keys) pipe.hgetall(k);
			const res = await pipe.exec();
			if (!res) return;

			const assetSums: Record<string, number> = { BTC: 0, ETH: 0, SOL: 0, USDC: 0 };
			for (const [, hash] of res) {
				if (hash && typeof hash === 'object') {
					for (const ticker of ['BTC', 'ETH', 'SOL', 'USDC']) {
						const val = parseFloat((hash as Record<string, string>)[ticker] || '0');
						if (!isNaN(val) && val > 0) assetSums[ticker] += val;
					}
				}
			}

			const updatePipe = redis.pipeline();
			let rebalanced = false;

			for (const ticker of ['BTC', 'ETH', 'SOL', 'USDC']) {
				const maxAllowed = HARD_RESERVE_CAPS[ticker] * 0.65;
				if (assetSums[ticker] > maxAllowed && assetSums[ticker] > 0) {
					const scaleFactor = maxAllowed / assetSums[ticker];
					for (let idx = 0; idx < keys.length; idx++) {
						const key = keys[idx];
						const hash = res[idx]?.[1] as Record<string, string> | undefined;
						if (!hash) continue;
						const oldBal = parseFloat(hash[ticker] || '0');
						if (!isNaN(oldBal) && oldBal > 0) {
							const newBal = Number((oldBal * scaleFactor).toFixed(8));
							const convertedDiff = oldBal - newBal;
							const kasEquivalent = Number(
								((convertedDiff * (prices[ticker] || 1.0)) / (prices.KAS || 0.0385)).toFixed(6)
							);
							updatePipe.hset(key, ticker, newBal.toString());
							if (kasEquivalent > 0) {
								updatePipe.hincrbyfloat(key, 'KAS', kasEquivalent);
							}
							rebalanced = true;
						}
					}
				}
			}

			if (rebalanced) {
				await updatePipe.exec().catch(() => {});
			}
		}

		async function getLiveSyntheticSupply(): Promise<Record<string, number>> {
			const totals: Record<string, number> = { KAS: 0, BTC: 0, ETH: 0, SOL: 0, USDC: 0 };
			try {
				const keys = await redis.keys('dev:sor:treasury:balances:*');
				if (keys.length > 0) {
					const pipe = redis.pipeline();
					for (const k of keys) pipe.hgetall(k);
					const results = await pipe.exec();
					if (results) {
						for (const [, hash] of results) {
							if (hash && typeof hash === 'object') {
								for (const [asset, valStr] of Object.entries(hash as Record<string, string>)) {
									const val = parseFloat(valStr || '0');
									if (!isNaN(val) && val > 0) {
										const ticker = asset === 'Unassigned KAS' ? 'KAS' : asset.toUpperCase();
										totals[ticker] = (totals[ticker] || 0) + val;
									}
								}
							}
						}
					}
				}
				const lpRes = await dbPool.query(
					`SELECT pool_pair, COALESCE(SUM(staked_asset_a), 0) AS sum_a, COALESCE(SUM(staked_asset_b), 0) AS sum_b
					 FROM liquidity_providers WHERE wallet_address != $1 GROUP BY pool_pair`,
					[MASTER_TREASURY_ADDRESS]
				);
				for (const row of lpRes.rows) {
					const [assetA, assetB] = String(row.pool_pair || 'KAS/USDC').split('/');
					if (assetA) totals[assetA] = (totals[assetA] || 0) + parseFloat(row.sum_a || '0');
					if (assetB) totals[assetB] = (totals[assetB] || 0) + parseFloat(row.sum_b || '0');
				}
			} catch {
				// Ignore transient read fault
			}
			return totals;
		}

		async function pickSafeTargetAsset(): Promise<{
			asset: 'USDC' | 'BTC' | 'ETH' | 'SOL';
			nearCap: boolean;
		}> {
			const supply = await getLiveSyntheticSupply();
			const candidates: Array<'USDC' | 'BTC' | 'ETH' | 'SOL'> = ['USDC', 'SOL', 'ETH', 'BTC'];
			let bestAsset: 'USDC' | 'BTC' | 'ETH' | 'SOL' = 'USDC';
			let lowestUtilization = Infinity;

			for (const ticker of candidates) {
				const cap = HARD_RESERVE_CAPS[ticker] || 1;
				const current = supply[ticker] || 0;
				const util = current / cap;
				if (util < lowestUtilization) {
					lowestUtilization = util;
					bestAsset = ticker;
				}
			}
			return { asset: bestAsset, nearCap: lowestUtilization >= 0.78 };
		}

		async function simulateStratumShareAndYield(bot: BotIdentity): Promise<number> {
			const prices = await getOraclePrices();
			const fullIdentity = `${bot.address}.${bot.workerName}`;
			const simulatedHashrate = 14.5 * 1e12;
			const microYieldKas = bot.isFundedL1 ? 0.25 : 0.15;
			const poolFeeKas = microYieldKas * 0.01;
			const poolFeeUsd = poolFeeKas * (prices.KAS || 0.0385);

			await redis
				.multi()
				.sadd('pool:workers', fullIdentity)
				.set(`worker:${fullIdentity}:hashrate`, simulatedHashrate.toString())
				.incrby(`worker:${fullIdentity}:shares`, 64)
				.incrbyfloat(`worker:${fullIdentity}:unpaid_yield`, microYieldKas)
				.incrbyfloat('perennia:fees:batch_accumulated:KAS', poolFeeKas)
				.exec()
				.catch(() => {});

			return poolFeeUsd;
		}

		async function loginBotOnSeat(seat: SeatContext, bot: BotIdentity): Promise<boolean> {
			stats.seats[seat.seatId] = {
				activeBot: bot.id,
				persona: bot.persona,
				address: bot.address,
				status: 'LOGGING_IN',
				lastAction: 'Requesting Zero-Trust Challenge',
				updatedAt: Date.now()
			};

			await seat.context.clearCookies().catch(() => {});

			const challengeRes = await seat.page.request.post(`${FRONTEND_URL}/api/auth/challenge`, {
				data: { address: bot.address },
				timeout: HTTP_REQ_TIMEOUT_MS
			});
			if (!challengeRes.ok()) {
				await recordOutcome('AUTH_HANDSHAKE', false, bot.id, 'CHALLENGE_FAIL');
				return false;
			}
			const { message } = await challengeRes.json();
			const msgBuf = new TextEncoder().encode(message);
			const msgHash = blake2b(msgBuf, { dkLen: 32 });
			const sigBytes = schnorr.sign(msgHash, hexToBytes(bot.privateKeyHex));
			const signature = bytesToHex(sigBytes);

			const authRes = await seat.page.request.post(`${FRONTEND_URL}/api/auth`, {
				data: {
					address: bot.address,
					signature,
					message,
					provider: 'sovereign'
				},
				timeout: HTTP_REQ_TIMEOUT_MS
			});

			if (!authRes.ok()) {
				await recordOutcome('AUTH_HANDSHAKE', false, bot.id, 'AUTH_REJECTED');
				return false;
			}

			await seat.page
				.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded', timeout: HTTP_REQ_TIMEOUT_MS })
				.catch(() => {});

			await seat.page
				.evaluate(
					({ address }) => {
						const safePayload = {
							wallets: {
								kaspa: { address },
								bitcoin: { address: 'Awaiting Configuration' },
								ethereum: { address: 'Awaiting Configuration' },
								solana: { address: 'Awaiting Configuration' }
							},
							vault: ''
						};
						localStorage.setItem('perennia_sovereign_payload', JSON.stringify(safePayload));
						sessionStorage.setItem('perennia_active_wallet_type', 'sovereign');
					},
					{ address: bot.address }
				)
				.catch(() => {});

			const enterBtn = seat.page.locator('button:has-text("Enter Nexus")');
			if (await enterBtn.isVisible({ timeout: 800 }).catch(() => false)) {
				await enterBtn.click({ timeout: 1000 }).catch(() => {});
			}

			const meRes = await seat.page.request.get(`${FRONTEND_URL}/api/auth/me`, {
				timeout: HTTP_REQ_TIMEOUT_MS
			});
			const meData = await meRes.json().catch(() => ({ authenticated: false }));
			if (!meData.authenticated) {
				await recordOutcome('AUTH_HANDSHAKE', false, bot.id, 'SESSION_VERIFY_FAIL');
				return false;
			}

			stats.totalLogins += 1;
			await recordOutcome(
				'AUTH_HANDSHAKE',
				true,
				bot.id,
				`SESSION_${bot.cleanAddress.slice(0, 10)}`,
				'Schnorr Zero-Trust Session Verified'
			);
			return true;
		}

		async function logoutBotOnSeat(seat: SeatContext, bot: BotIdentity) {
			stats.seats[seat.seatId] = {
				activeBot: bot.id,
				persona: bot.persona,
				address: bot.address,
				status: 'LOGGING_OUT',
				lastAction: 'Purging Session & Rotating Seat',
				updatedAt: Date.now()
			};

			await seat.page.request
				.delete(`${FRONTEND_URL}/api/auth`, { timeout: HTTP_REQ_TIMEOUT_MS })
				.catch(() => {});
			await seat.page
				.evaluate(() => {
					sessionStorage.clear();
					localStorage.removeItem('perennia_sovereign_payload');
				})
				.catch(() => {});
			await seat.context.clearCookies().catch(() => {});
			stats.totalLogouts += 1;
		}

		async function switchUiTab(page: Page, tabName: 'DEX' | 'OPERATIONS' | 'TREASURY') {
			const navBtn = page.locator(`nav button:has-text("${tabName}")`).first();
			if (await navBtn.isVisible({ timeout: 800 }).catch(() => false)) {
				await navBtn.click({ timeout: 1000 }).catch(() => {});
			}
		}

		async function executeMinerPersona(seat: SeatContext, bot: BotIdentity) {
			await switchUiTab(seat.page, 'OPERATIONS');
			const stratumFeeUsd = await simulateStratumShareAndYield(bot);

			const stateRes = await seat.page.request.get(`${FRONTEND_URL}/api/state`, {
				timeout: HTTP_REQ_TIMEOUT_MS
			});
			const currentState = stateRes.ok() ? await stateRes.json() : { workers: [], sectors: [] };
			const existingWorkers: any[] = currentState.workers || [];
			const existingSectors: any[] = currentState.sectors || [];

			if (!existingWorkers.some((w) => w.name === bot.workerName)) {
				await seat.page.request.post(`${FRONTEND_URL}/api/state/action`, {
					data: {
						action: 'ADD_WORKER',
						payload: {
							id: `WRK-${bot.id}`,
							type: 'physical',
							name: bot.workerName,
							stratumUrl: 'stratum+tcp://192.168.50.100:6552',
							walletWorker: `${bot.address}.${bot.workerName}`,
							hashRate: 14.5,
							isOnline: true,
							hardwareType: 'IceRiver KS5L',
							sharesContributed: 64,
							blocksFound: 0
						}
					},
					timeout: HTTP_REQ_TIMEOUT_MS
				});
			}

			const { asset: safeTargetAsset } = await pickSafeTargetAsset();
			const themeMap: Record<string, { hex: string; pastel: string }> = {
				KAS: { hex: '#18C6A5', pastel: '#99f6e4' },
				USDC: { hex: '#3B82F6', pastel: '#bfdbfe' },
				BTC: { hex: '#F7931A', pastel: '#fcd34d' },
				ETH: { hex: '#627EEA', pastel: '#c7d2fe' },
				SOL: { hex: '#14F195', pastel: '#a7f3d0' }
			};

			const minerCohortIdx = Math.floor((bot.index - 1) / 5);
			const isAutoLp = minerCohortIdx % 2 === 1;

			if (existingSectors.length === 0) {
				const targetTicker = safeTargetAsset;
				const newSector = {
					id: `SEC-${bot.id}-${isAutoLp ? 'PLANT' : 'SILO'}`,
					name: isAutoLp
						? `${bot.id} KAS/${targetTicker} Plant`
						: `${bot.id} ${targetTicker} Silo`,
					allocationPercentage: 70.0,
					routeMode: isAutoLp ? 'auto-lp' : 'swap',
					settlementConfig: {
						targetAsset: {
							ticker: targetTicker,
							name: targetTicker,
							assetClass: targetTicker === 'USDC' ? 'Stablecoin' : 'Native L1',
							spotPrice: 1.0,
							theme: themeMap[targetTicker] || themeMap.USDC
						},
						payoutAddress: bot.address,
						autoPayout: true,
						mode: 'epoch',
						threshold: 5.0,
						appointmentDate: '',
						appointmentTime: '22:00'
					},
					pendingKaspa: 0.0,
					width: 6
				};

				const secRes = await seat.page.request.post(`${FRONTEND_URL}/api/state/action`, {
					data: { action: 'ADD_SECTOR', payload: newSector },
					timeout: HTTP_REQ_TIMEOUT_MS
				});
				const secData = await secRes.json().catch(() => ({}));
				await recordOutcome(
					'SECTOR_ROUTING',
					secRes.ok() && secData.success !== false,
					bot.id,
					newSector.id,
					`Deployed ${newSector.routeMode} -> ${targetTicker} (1% Pool Fee)`,
					stratumFeeUsd,
					stratumFeeUsd,
					0
				);
			} else {
				const targetSec = existingSectors[0];
				const nextPct = targetSec.allocationPercentage === 70.0 ? 75.0 : 70.0;
				const updRes = await seat.page.request.post(`${FRONTEND_URL}/api/state/action`, {
					data: {
						action: 'UPDATE_SECTOR_ALLOCATION',
						payload: { id: targetSec.id, allocationPercentage: nextPct }
					},
					timeout: HTTP_REQ_TIMEOUT_MS
				});
				const updData = await updRes.json().catch(() => ({}));
				await recordOutcome(
					'SECTOR_ROUTING',
					updRes.ok() && updData.success !== false,
					bot.id,
					targetSec.id,
					`Streamed 14.5 TH/s & Routed ${nextPct}% (1% Pool Fee)`,
					stratumFeeUsd,
					stratumFeeUsd,
					0
				);
			}
		}

		async function executeSpotTraderPersona(seat: SeatContext, bot: BotIdentity) {
			await switchUiTab(seat.page, 'DEX');
			const stratumFeeUsd = await simulateStratumShareAndYield(bot);

			const ledgerRes = await seat.page.request.get(
				`${FRONTEND_URL}/api/user/ledger?wallet=${encodeURIComponent(bot.address)}`,
				{ timeout: HTTP_REQ_TIMEOUT_MS }
			);
			const balances: Record<string, number> = ledgerRes.ok() ? await ledgerRes.json() : {};
			const supply = await getLiveSyntheticSupply();
			const prices = await getOraclePrices();

			const unhedgedStr = await redis.get('perennia:treasury:unhedged_delta_kas');
			const unhedgedSigned = parseFloat(unhedgedStr || '0') || 0;

			for (const asset of ['USDC', 'SOL', 'ETH', 'BTC'] as const) {
				const botHolding = Number(balances[asset] || 0);
				const cap = HARD_RESERVE_CAPS[asset];
				const globalUtil = (supply[asset] || 0) / cap;
				const minSellUnit = (0.04 * prices.KAS) / (prices[asset] || 1);

				if (
					botHolding > minSellUnit &&
					(unhedgedSigned < -1.0 || globalUtil >= 0.7 || Math.random() < 0.4)
				) {
					const sellAmt = Number((botHolding * 0.45).toFixed(8));
					if (sellAmt > 0) {
						const mode =
							unhedgedSigned < -1.0
								? 'base'
								: stats.virtualHour % 4 === 0
									? 'overclocked'
									: 'base';
						const feeRate =
							mode === 'overclocked' ? 0.025 : unhedgedSigned < -1.0 ? 0.0015 : 0.015;
						const grossUsd = sellAmt * (prices[asset] || 1.0);
						const swapFeeUsd = grossUsd * feeRate;
						const houseCut = mode === 'overclocked' ? swapFeeUsd : swapFeeUsd * 0.2;
						const lpCut = mode === 'overclocked' ? 0 : swapFeeUsd * 0.8;

						const swapRes = await seat.page.request.post(`${FRONTEND_URL}/api/sor/swap`, {
							data: {
								wallet: bot.address,
								payAsset: asset,
								receiveAsset: 'KAS',
								amount: sellAmt,
								slippageTolerance: 0.05,
								systemMode: mode
							},
							timeout: HTTP_REQ_TIMEOUT_MS
						});
						const swapData = await swapRes.json().catch(() => ({}));
						const discountTag =
							unhedgedSigned < -1.0 ? '0.15% Drain Discount' : mode;
						await recordOutcome(
							'DARK_POOL_SWAP',
							swapRes.ok(),
							bot.id,
							swapData.transaction_uuid || 'REBALANCE_TO_KAS',
							`Swapped ${sellAmt} ${asset} -> KAS (${discountTag})`,
							swapFeeUsd + stratumFeeUsd,
							houseCut + stratumFeeUsd,
							lpCut
						);
						return;
					}
				}
			}

			const { asset: targetAsset, nearCap } = await pickSafeTargetAsset();
			if (nearCap) return;

			const kasLedger = Number(balances.KAS || 0);
			if (kasLedger < 0.25) {
				await redis.hincrbyfloat(
					`dev:sor:treasury:balances:${bot.cleanAddress}`,
					'Unassigned KAS',
					0.35
				);
				await dbPool
					.query(
						`INSERT INTO yield_reservoirs (wallet_address, streaming_balance_kas, total_yield_kas)
						 VALUES ($1, 0.35, 0.35)
						 ON CONFLICT (wallet_address) DO UPDATE SET
						 streaming_balance_kas = yield_reservoirs.streaming_balance_kas + 0.35,
						 total_yield_kas = yield_reservoirs.total_yield_kas + 0.35`,
						[bot.address]
					)
					.catch(() => {});
			}

			const capRemainingTarget = Math.max(
				0,
				HARD_RESERVE_CAPS[targetAsset] * 0.85 - (supply[targetAsset] || 0)
			);
			const maxKasForCap = (capRemainingTarget * (prices[targetAsset] || 1)) / (prices.KAS || 0.0385);
			const swapKasAmt = Number(Math.min(0.22, maxKasForCap * 0.25).toFixed(4));

			if (swapKasAmt >= 0.02) {
				const mode = stats.virtualHour % 4 === 0 ? 'overclocked' : 'base';
				const feeRate = mode === 'overclocked' ? 0.025 : 0.015;
				const grossUsd = swapKasAmt * (prices.KAS || 0.0385);
				const swapFeeUsd = grossUsd * feeRate;
				const houseCut = mode === 'overclocked' ? swapFeeUsd : swapFeeUsd * 0.2;
				const lpCut = mode === 'overclocked' ? 0 : swapFeeUsd * 0.8;

				const swapRes = await seat.page.request.post(`${FRONTEND_URL}/api/sor/swap`, {
					data: {
						wallet: bot.address,
						payAsset: 'KAS',
						receiveAsset: targetAsset,
						amount: swapKasAmt,
						slippageTolerance: 0.05,
						systemMode: mode
					},
					timeout: HTTP_REQ_TIMEOUT_MS
				});
				const swapData = await swapRes.json().catch(() => ({}));
				await recordOutcome(
					'DARK_POOL_SWAP',
					swapRes.ok() && !swapData.psbt,
					bot.id,
					swapData.transaction_uuid || 'SOR_SWAP',
					`Swapped ${swapKasAmt} KAS -> ${targetAsset} (${mode})`,
					swapFeeUsd + stratumFeeUsd,
					houseCut + stratumFeeUsd,
					lpCut
				);
			}
		}

		async function executeLpFarmerPersona(seat: SeatContext, bot: BotIdentity) {
			await switchUiTab(seat.page, 'DEX');
			const stratumFeeUsd = await simulateStratumShareAndYield(bot);

			const posRes = await seat.page.request.post(`${FRONTEND_URL}/api/state/action`, {
				data: { action: 'GET_LP_POSITIONS', payload: {} },
				timeout: HTTP_REQ_TIMEOUT_MS
			});
			const posData = posRes.ok() ? await posRes.json() : { data: [] };
			const positions: any[] = Array.isArray(posData.data) ? posData.data : [];

			const unlocked = positions.filter((p) => p.isUnlocked);
			if (unlocked.length >= 3) {
				const targetLp = unlocked[unlocked.length - 1];
				const wRes = await seat.page.request.post(`${FRONTEND_URL}/api/state/action`, {
					data: {
						action: 'WITHDRAW_LP',
						payload: { lpId: targetLp.lpId }
					},
					timeout: HTTP_REQ_TIMEOUT_MS
				});
				const wData = await wRes.json().catch(() => ({}));
				await recordOutcome(
					'LP_PROVISION',
					wRes.ok() && wData.success !== false,
					bot.id,
					targetLp.lpId,
					`Withdrew matured LP (${targetLp.poolPair})`,
					stratumFeeUsd,
					stratumFeeUsd,
					0
				);
				return;
			}

			const ledgerRes = await seat.page.request.get(
				`${FRONTEND_URL}/api/user/ledger?wallet=${encodeURIComponent(bot.address)}`,
				{ timeout: HTTP_REQ_TIMEOUT_MS }
			);
			const balances: Record<string, number> = ledgerRes.ok() ? await ledgerRes.json() : {};
			const kasBal = Number(balances.KAS || 0);

			for (const quoteAsset of ['SOL', 'ETH', 'BTC', 'USDC'] as const) {
				const quoteBal = Number(balances[quoteAsset] || 0);
				if (kasBal >= 0.04 && quoteBal > 0) {
					const stakeKas = Number(Math.min(0.05, kasBal * 0.4).toFixed(4));
					const stakeQuote = Number((quoteBal * 0.45).toFixed(8));
					if (stakeKas > 0 && stakeQuote > 0) {
						const lockDays = bot.index % 3 === 0 ? 30 : 0;
						const poolPair = `KAS/${quoteAsset}`;
						const stakeRes = await seat.page.request.post(`${FRONTEND_URL}/api/state/action`, {
							data: {
								action: 'STAKE_LP',
								payload: {
									poolPair,
									amountA: stakeKas,
									amountB: stakeQuote,
									lockDurationDays: lockDays
								}
							},
							timeout: HTTP_REQ_TIMEOUT_MS
						});
						const stakeJson = await stakeRes.json().catch(() => ({}));
						if (stakeRes.ok() && stakeJson.success) {
							await recordOutcome(
								'LP_PROVISION',
								true,
								bot.id,
								`LP_${poolPair}_${lockDays}D`,
								`Staked ${stakeKas} KAS + ${stakeQuote} ${quoteAsset} (${lockDays}d)`,
								stratumFeeUsd,
								stratumFeeUsd,
								0
							);
							return;
						}
					}
				}
			}

			await executeSpotTraderPersona(seat, bot);
		}

		async function executeP2pAndL1Persona(seat: SeatContext, bot: BotIdentity) {
			await switchUiTab(seat.page, 'DEX');

			if (!bot.isFundedL1) {
				await executeSpotTraderPersona(seat, bot);
				return;
			}

			const prices = await getOraclePrices();
			const utxoRes = await seat.page.request.get(
				`${FRONTEND_URL}/api/utxos?address=${encodeURIComponent(bot.address)}`,
				{ timeout: HTTP_REQ_TIMEOUT_MS }
			);
			if (!utxoRes.ok()) {
				await executeSpotTraderPersona(seat, bot);
				return;
			}
			const utxoJson = await utxoRes.json().catch(() => ({ entries: [] }));
			const rawEntries: any[] = Array.isArray(utxoJson.entries) ? utxoJson.entries : [];
			const formattedUtxos = rawEntries
				.map((u: any) => ({
					transactionId: u.outpoint?.transactionId || u.transactionId,
					index: Number(u.outpoint?.index ?? u.index ?? 0),
					amount: Number(u.utxoEntry?.amount || u.amount || 0),
					scriptPublicKey:
						u.utxoEntry?.scriptPublicKey?.scriptPublicKey || u.scriptPublicKey || ''
				}))
				.filter((u) => u.amount > 0 && u.scriptPublicKey);

			const totalSompi = formattedUtxos.reduce((acc, u) => acc + u.amount, 0);
			const totalKasOnChain = totalSompi / 1e8;

			if (totalKasOnChain < 1.0) {
				await executeSpotTraderPersona(seat, bot);
				return;
			}

			const p2pRes = await seat.page.request.get(`${FRONTEND_URL}/api/p2p`, {
				timeout: HTTP_REQ_TIMEOUT_MS
			});
			const openOrders: any[] = p2pRes.ok() ? await p2pRes.json() : [];
			const fillableOrder = openOrders.find(
				(o) =>
					cleanKaspaBase32(o.seller || '') !== bot.cleanAddress &&
					Number(o.buyAmount || 0) <= Math.min(0.5, totalKasOnChain - 0.4)
			);

			if (fillableOrder) {
				const fillRes = await seat.page.request.post(`${FRONTEND_URL}/api/state/action`, {
					data: {
						action: 'BROADCAST_ATOMIC_SWAP',
						payload: {
							orderId: fillableOrder.id,
							buyerUtxos: formattedUtxos,
							buyerPrivateKeyHex: bot.privateKeyHex
						}
					},
					timeout: HTTP_REQ_TIMEOUT_MS
				});
				const fillData = await fillRes.json().catch(() => ({}));
				if (fillRes.ok() && fillData.success && fillData.transaction_id) {
					const l1FeeUsd = 0.00025 * (prices.KAS || 0.0385);
					await recordOutcome(
						'P2P_ATOMIC_0X83',
						true,
						bot.id,
						fillData.transaction_id,
						`Filled 0x83 Atomic Swap ${fillableOrder.id}`,
						l1FeeUsd,
						l1FeeUsd,
						0
					);
					return;
				} else {
					await dbPool
						.query(`UPDATE p2p_orders SET status = 'expired' WHERE id = $1`, [fillableOrder.id])
						.catch(() => {});
				}
			}

			if (openOrders.length < 4 && totalKasOnChain >= 1.2) {
				const sellAmount = 0.25;
				const buyAmount = 0.25;
				const signRes = await seat.page.request.post(`${FRONTEND_URL}/api/state/action`, {
					data: {
						action: 'SIGN_P2P_OFFER',
						payload: {
							sellAmount,
							buyAmount,
							utxos: formattedUtxos,
							privateKeyHex: bot.privateKeyHex
						}
					},
					timeout: HTTP_REQ_TIMEOUT_MS
				});
				const signData = await signRes.json().catch(() => ({}));
				if (signRes.ok() && signData.success && signData.signed_psbt_hex) {
					const orderId = `ORD-${Date.now().toString(36).toUpperCase()}-${bot.id}`;
					const postOrderRes = await seat.page.request.post(`${FRONTEND_URL}/api/p2p`, {
						data: {
							id: orderId,
							sellToken: 'KAS',
							sellAmount,
							buyToken: 'KAS',
							buyAmount,
							rate: '1.0000',
							sellerPsbt: signData.signed_psbt_hex
						},
						timeout: HTTP_REQ_TIMEOUT_MS
					});
					await recordOutcome(
						'P2P_ATOMIC_0X83',
						postOrderRes.ok(),
						bot.id,
						orderId,
						`Signed & posted 0x83 Maker Offer (${sellAmount} KAS)`
					);
					return;
				}
			}

			await executeSpotTraderPersona(seat, bot);
		}

		async function executeRedTeamAndOtcPersona(seat: SeatContext, bot: BotIdentity) {
			await switchUiTab(seat.page, 'TREASURY');
			const stratumFeeUsd = await simulateStratumShareAndYield(bot);
			const prices = await getOraclePrices();
			const peerBot = allBots.find((b) => b.cleanAddress !== bot.cleanAddress) || allBots[0];

			const checkRound = (stats.virtualHour + bot.index) % 5;

			if (checkRound === 0) {
				const spoofRes = await seat.page.request.post(`${FRONTEND_URL}/api/auth`, {
					data: {
						address: bot.address,
						signature: '00'.repeat(64),
						message: 'spoof',
						provider: 'kasware'
					},
					timeout: HTTP_REQ_TIMEOUT_MS
				});
				const blockedSpoof = spoofRes.status() === 403;
				await recordOutcome(
					'SECURITY_GUARD',
					blockedSpoof,
					bot.id,
					'GUARD_KASWARE_403',
					'Blocked external KasWare wallet spoofing (403)',
					stratumFeeUsd,
					stratumFeeUsd,
					0
				);
			} else if (checkRound === 1) {
				const [snoopLedger, snoopUtxos] = await Promise.all([
					seat.page.request.get(
						`${FRONTEND_URL}/api/user/ledger?wallet=${encodeURIComponent(peerBot.address)}`,
						{ timeout: HTTP_REQ_TIMEOUT_MS }
					),
					seat.page.request.get(
						`${FRONTEND_URL}/api/utxos?address=${encodeURIComponent(peerBot.address)}`,
						{ timeout: HTTP_REQ_TIMEOUT_MS }
					)
				]);
				const isolated = snoopLedger.status() === 403 && snoopUtxos.status() === 403;
				await recordOutcome(
					'SECURITY_GUARD',
					isolated,
					bot.id,
					'GUARD_CROSS_WALLET_403',
					`Blocked cross-wallet snooping on ${peerBot.id} (403)`,
					stratumFeeUsd,
					stratumFeeUsd,
					0
				);
			} else if (checkRound === 2) {
				const exploitSector = {
					id: `EXPLOIT-${bot.id}`,
					name: 'Exploit 150% Silo',
					allocationPercentage: 150.0,
					routeMode: 'hold',
					settlementConfig: {
						targetAsset: {
							ticker: 'KAS',
							name: 'Kaspa',
							assetClass: 'Native L1',
							spotPrice: prices.KAS,
							theme: { hex: '#18C6A5', pastel: '#99f6e4' }
						},
						payoutAddress: bot.address,
						autoPayout: true,
						mode: 'epoch',
						threshold: 10.0,
						appointmentDate: '',
						appointmentTime: '22:00'
					},
					pendingKaspa: 0,
					width: 6
				};
				const exploitRes = await seat.page.request.post(`${FRONTEND_URL}/api/state/action`, {
					data: { action: 'ADD_SECTOR', payload: exploitSector },
					timeout: HTTP_REQ_TIMEOUT_MS
				});
				const exploitJson = await exploitRes.json().catch(() => ({}));
				const exploitBlocked = !exploitRes.ok() || exploitJson.success === false;
				await recordOutcome(
					'SECURITY_GUARD',
					exploitBlocked,
					bot.id,
					'GUARD_SECTOR_150PCT',
					'Blocked >100% sector allocation exploit rollback',
					stratumFeeUsd,
					stratumFeeUsd,
					0
				);
			} else if (checkRound === 3) {
				const [custodyRes, offrampRes] = await Promise.all([
					seat.page.request.post(`${FRONTEND_URL}/api/state/action`, {
						data: {
							action: 'WITHDRAW_SYNTHETIC_ASSET',
							payload: {
								asset: 'SOL',
								amount: 0.0001,
								destination: 'So11111111111111111111111111111111111111112'
							}
						},
						timeout: HTTP_REQ_TIMEOUT_MS
					}),
					seat.page.request.post(`${FRONTEND_URL}/api/fiat/offramp`, {
						data: {
							wallet: bot.address,
							amountKas: 10,
							payoutMethod: 'wire',
							preFlightOnly: true
						},
						timeout: HTTP_REQ_TIMEOUT_MS
					})
				]);
				const custodyJson = await custodyRes.json().catch(() => ({}));
				const custodyBlocked = !custodyRes.ok() || custodyJson.success === false;
				const offrampGuarded = offrampRes.status() === 503 || offrampRes.status() === 400;
				await recordOutcome(
					'SECURITY_GUARD',
					custodyBlocked && offrampGuarded,
					bot.id,
					'GUARD_PHASE2_CUSTODY',
					'Verified Phase-2 Multi-Chain & Fiat Wire Guards',
					stratumFeeUsd,
					stratumFeeUsd,
					0
				);
			} else {
				const badLockRes = await seat.page.request.post(`${FRONTEND_URL}/api/state/action`, {
					data: {
						action: 'STAKE_LP',
						payload: {
							poolPair: 'KAS/USDC',
							amountA: 0.01,
							amountB: 0.01,
							lockDurationDays: 7
						}
					},
					timeout: HTTP_REQ_TIMEOUT_MS
				});
				const badLockJson = await badLockRes.json().catch(() => ({}));
				const badLockBlocked = !badLockRes.ok() || badLockJson.success === false;
				await recordOutcome(
					'SECURITY_GUARD',
					badLockBlocked,
					bot.id,
					'GUARD_LP_LOCK_DURATION',
					'Blocked non-standard LP lock duration exploit (7d)',
					stratumFeeUsd,
					stratumFeeUsd,
					0
				);
			}
		}

		async function trigger2200UtcMasterEpochBell() {
			const nowSecs = Math.floor(Date.now() / 1000);
			const dayStart = nowSecs - (nowSecs % 86400);
			const todayBell = dayStart + 22 * 3600;
			const currentEpochBellTs = nowSecs >= todayBell ? todayBell : todayBell - 86400;

			await redis.set(
				'perennia:chronos:last_epoch_bell_ts',
				String(Math.max(1, currentEpochBellTs - 86400))
			);

			let bellProcessed = false;
			for (let attempt = 0; attempt < 10; attempt++) {
				await new Promise((r) => setTimeout(r, 1200));
				const updatedBellStr = await redis.get('perennia:chronos:last_epoch_bell_ts');
				if (updatedBellStr && Number(updatedBellStr) >= currentEpochBellTs) {
					bellProcessed = true;
					break;
				}
			}

			await recordOutcome(
				'EPOCH_2200_BELL',
				bellProcessed,
				'CHRONOS_MASTER',
				`BELL_${currentEpochBellTs}`,
				bellProcessed
					? '22:00 UTC Jerusalem Standard Bell Evaluated & Cleared Armed Buckets'
					: 'Awaiting Chronos daemon tick'
			);
		}

		await reconcileReserveCapsOnBoot();

		const seats: SeatContext[] = [];
		for (let i = 1; i <= ROTATING_SEAT_COUNT; i++) {
			const seatId = `Seat-0${i}`;
			const context = await browser.newContext({
				viewport: { width: 1440, height: 900 }
			});
			const page = await context.newPage();
			seats.push({ seatId, context, page });
		}

		const maxDays = Number(process.env.PULSE_MAX_DAYS || '0');

		try {
			while (maxDays === 0 || stats.virtualDay <= maxDays) {
				for (let hour = 1; hour <= VIRTUAL_DAY_HOURS; hour++) {
					stats.virtualHour = hour;
					stats.activeTargetUsers = hour <= 6 ? 20 : hour <= 14 ? 50 : 100;

					await compoundTreasuryIntoLpPool();

					const activeCohort = allBots.slice(0, stats.activeTargetUsers);
					const rotationsThisHour = Math.min(activeCohort.length, ROTATING_SEAT_COUNT * 3);
					const offset = ((hour - 1) * rotationsThisHour) % activeCohort.length;
					const hourQueue: BotIdentity[] = [];
					for (let k = 0; k < rotationsThisHour; k++) {
						hourQueue.push(activeCohort[(offset + k) % activeCohort.length]);
					}

					let cursor = 0;
					await Promise.all(
						seats.map(async (seat) => {
							while (cursor < hourQueue.length) {
								const bot = hourQueue[cursor++];
								if (!bot) break;

								const loggedIn = await withSeatTimeout(
									loginBotOnSeat(seat, bot),
									SEAT_STEP_TIMEOUT_MS,
									false
								);
								if (loggedIn) {
									stats.seats[seat.seatId] = {
										activeBot: bot.id,
										persona: bot.persona,
										address: bot.address,
										status: 'ACTING',
										lastAction: `Executing ${bot.persona} workflow`,
										updatedAt: Date.now()
									};

									const actTask =
										bot.persona === 'MINER'
											? executeMinerPersona(seat, bot)
											: bot.persona === 'LP_FARMER'
												? executeLpFarmerPersona(seat, bot)
												: bot.persona === 'SPOT_TRADER'
													? executeSpotTraderPersona(seat, bot)
													: bot.persona === 'P2P_TRADER'
														? executeP2pAndL1Persona(seat, bot)
														: executeRedTeamAndOtcPersona(seat, bot);

									await withSeatTimeout(actTask, SEAT_STEP_TIMEOUT_MS, undefined);
									await withSeatTimeout(
										logoutBotOnSeat(seat, bot),
										SEAT_STEP_TIMEOUT_MS,
										undefined
									);
								}
							}
						})
					);

					if (hour === VIRTUAL_DAY_HOURS) {
						await trigger2200UtcMasterEpochBell();
					}
				}
				stats.virtualDay += 1;
			}
		} finally {
			for (const seat of seats) {
				await seat.context.close().catch(() => {});
			}
			await redis.quit().catch(() => {});
			await dbPool.end().catch(() => {});
		}
	});
});