import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import { blake2b } from '@noble/hashes/blake2.js';
import { schnorr } from '@noble/curves/secp256k1.js';

dotenv.config();

const KASPA_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function kaspaPolymod(values: number[]): bigint {
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
}

function encodeKaspaBech32mP2pk(pubKeyX: Uint8Array): string {
    const prefix = 'kaspa';
    const prefixValues = prefix
        .split('')
        .map((c) => c.charCodeAt(0) & 31)
        .concat([0]);
    const payload = [0x00, ...pubKeyX.slice(0, 32)];
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
    const mod = kaspaPolymod([
        ...prefixValues,
        ...payload5,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
    ]);
    const checksum = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
        Number((mod >> BigInt(5 * (7 - i))) & 31n)
    );
    return `${prefix}:${[...payload5, ...checksum].map((v) => KASPA_CHARSET[v]).join('')}`;
}

function deriveTestKeypair(seedLabel: string): {
    privKey: Uint8Array;
    pubKey: Uint8Array;
    address: string;
} {
    const privKey = new Uint8Array(
        blake2b(new TextEncoder().encode(seedLabel), { dkLen: 32 })
    );
    const pubKey = schnorr.getPublicKey(privKey);
    const address = encodeKaspaBech32mP2pk(pubKey);
    return { privKey, pubKey, address };
}

const PRIMARY_SIGNER = deriveTestKeypair(
    'perennia-v5-e2e-sor-stratum-primary-wallet-v1'
);
const ALT_SIGNER = deriveTestKeypair(
    'perennia-v5-e2e-sor-stratum-alt-wallet-v1'
);

const TEST_WALLET = PRIMARY_SIGNER.address;
const ALT_WALLET = ALT_SIGNER.address;

const ADMIN_KEY = (
    process.env.PERENNIA_ADMIN_KEY ||
    process.env.INTERNAL_ADMIN_TOKEN ||
    ''
)
    .trim()
    .replace(/^['"]|['"]$/g, '');

let sessionCookie = '';
let liveKasSpotUsd = 0.15;

test.describe.serial('Smart Order Router & Stratum Binding Automation (v5 Live Node)', () => {
	test.beforeEach(async ({ request }) => { await request.get('/'); });
    test.beforeAll(async ({ playwright }) => {
        const baseURL =
            process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';
        const api = await playwright.request.newContext({ baseURL, ...(process.env.PLAYWRIGHT_HTTP_USER && process.env.PLAYWRIGHT_HTTP_PASS ? { httpCredentials: { username: process.env.PLAYWRIGHT_HTTP_USER, password: process.env.PLAYWRIGHT_HTTP_PASS } } : {}) });

        try {
            // Verify strict Kaspa Bech32m charset compliance (no o/b/i/1 characters)
            for (const addr of [TEST_WALLET, ALT_WALLET]) {
                expect(addr.startsWith('kaspa:q')).toBe(true);
                const payloadPart = addr.split(':')[1];
                expect(payloadPart.length).toBeGreaterThanOrEqual(61);
                expect(
                    [...payloadPart].every((ch) => KASPA_CHARSET.includes(ch))
                ).toBe(true);
            }

            // Authenticate TEST_WALLET natively against live Ubuntu Redis via Schnorr challenge
            const challengeRes = await api.post('/api/auth/challenge', {
                data: { address: TEST_WALLET }
            });
            expect(
                challengeRes.ok(),
                `Challenge failed (${challengeRes.status()}): ${await challengeRes.text()}`
            ).toBeTruthy();
            const { message } = await challengeRes.json();

            const msgHash = blake2b(new TextEncoder().encode(message), {
                dkLen: 32
            });
            const signature = bytesToHex(
                schnorr.sign(msgHash, PRIMARY_SIGNER.privKey)
            );

            const authRes = await api.post('/api/auth', {
                data: {
                    address: TEST_WALLET,
                    signature,
                    message,
                    provider: 'sovereign'
                }
            });
            expect(
                authRes.ok(),
                `Auth failed (${authRes.status()}): ${await authRes.text()}`
            ).toBeTruthy();

            const setCookieHeader = authRes
                .headersArray()
                .find(
                    (h) =>
                        h.name.toLowerCase() === 'set-cookie' &&
                        h.value.includes('perennia_session=')
                );
            const match = setCookieHeader?.value.match(
                /perennia_session=([^;]+)/
            );
            expect(match?.[1], 'Missing perennia_session cookie').toBeTruthy();
            sessionCookie = `perennia_session=${match![1]}`;

            // Confirm session is active in Ubuntu Redis
            const meRes = await api.get('/api/auth/me', {
                headers: { Cookie: sessionCookie }
            });
            expect(meRes.ok()).toBeTruthy();
            const meData = await meRes.json();
            expect(meData.authenticated).toBe(true);
            expect(meData.address).toBe(TEST_WALLET);

            // Read live KAS spot price without mutating Ubuntu Redis oracle keys
            const pricesRes = await api.get('/api/prices');
            if (pricesRes.ok()) {
                const pricesData = await pricesRes.json();
                const parsedKas = Number(pricesData?.kaspa?.usd || 0);
                if (Number.isFinite(parsedKas) && parsedKas > 0) {
                    liveKasSpotUsd = parsedKas;
                }
            }
        } finally {
            await api.dispose();
        }
    });

    test.afterAll(async ({ playwright }) => {
        if (!sessionCookie) return;
        const baseURL =
            process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';
        const api = await playwright.request.newContext({ baseURL, ...(process.env.PLAYWRIGHT_HTTP_USER && process.env.PLAYWRIGHT_HTTP_PASS ? { httpCredentials: { username: process.env.PLAYWRIGHT_HTTP_USER, password: process.env.PLAYWRIGHT_HTTP_PASS } } : {}) });
        try {
            await api.delete('/api/auth', {
                headers: { Cookie: sessionCookie }
            });
        } finally {
            await api.dispose();
        }
    });

    test('Stratum: Reject Unauthenticated Worker Binding (401)', async ({
        request
    }) => {
        const res = await request.post('/api/stratum/bind', {
            data: {
                wallet: TEST_WALLET,
                workerName: 'Rig01'
            }
        });
        const data = await res.json().catch(() => ({}));
        expect(res.status()).toBe(401);
        expect(data.error).toContain('UNAUTHORIZED');
    });

    test('Stratum: Reject Invalid Kaspa Address Payload (400 INVALID_KASPA_ADDRESS)', async ({
        request
    }) => {
        const res = await request.post('/api/stratum/bind', {
            headers: { Cookie: sessionCookie },
            data: {
                wallet: 'kaspa:qshortaddress',
                workerName: 'Rig01'
            }
        });
        const data = await res.json().catch(() => ({}));
        expect(res.status()).toBe(400);
        expect(data.error).toContain('INVALID_KASPA_ADDRESS');
    });

    test('Stratum: Reject Cross-Wallet Worker Binding Without Director Clearance (403)', async ({
        request
    }) => {
        const res = await request.post('/api/stratum/bind', {
            headers: { Cookie: sessionCookie },
            data: {
                wallet: ALT_WALLET,
                workerName: 'Rig01'
            }
        });
        const data = await res.json().catch(() => ({}));
        expect(res.status()).toBe(403);
        expect(data.error).toContain('FORBIDDEN');
    });

    test('Stratum: Bind Worker via BIND_WORKER Without Overwriting Live Pool Coinbase', async ({
        request
    }) => {
        const res = await request.post('/api/stratum/bind', {
            headers: { Cookie: sessionCookie },
            data: {
                wallet: TEST_WALLET,
                workerName: 'KS7LiteE2E',
                hardwareModel: 'IceRiver KS7 Lite',
                estimatedHashrateTh: 4.2
            }
        });
        const data = await res.json().catch(() => ({}));
        expect(res.ok(), `API ERROR: ${JSON.stringify(data)}`).toBeTruthy();
        expect(data.success).toBe(true);
        expect(data.workerId).toBe(`${TEST_WALLET}.KS7LiteE2E`);
        expect(data.walletAddress).toBe(TEST_WALLET);
        expect(data.workerName).toBe('KS7LiteE2E');
        expect(data.hardwareModel).toBe('IceRiver KS7 Lite');
        expect(data.tier).toBe(2);
        expect(data.externalPort).toBe(3333);
        expect(data.initialDifficulty).toBe(256);
        expect(data.stratumUrl).toMatch(/^stratum\+tcp:\/\/.+:3333$/);

        // Verify worker_profiles persistence and confirm live poolCoinbaseAddress was NOT overwritten
        const statusRes = await request.get(
            `/api/stratum/bind?wallet=${encodeURIComponent(TEST_WALLET)}`,
            {
                headers: { Cookie: sessionCookie }
            }
        );
        expect(statusRes.ok()).toBeTruthy();
        const statusData = await statusRes.json();
        expect(statusData.poolCoinbaseAddress).not.toBe(TEST_WALLET);
        expect(
            Array.isArray(statusData.workers) &&
                statusData.workers.some(
                    (w: any) => w.worker_id === `${TEST_WALLET}.KS7LiteE2E`
                )
        ).toBe(true);
    });

    test('SOR Yield: Reject Unauthorized Execution (401)', async ({
        request
    }) => {
        const res = await request.post('/api/sor/yield_settle', {
            headers: { Authorization: 'Bearer INVALID_FORGED_KEY' },
            data: {
                wallet: TEST_WALLET,
                amountKas: 1000,
                targetAsset: 'USDC'
            }
        });
        expect(res.status()).toBe(401);
    });

    test('SOR Yield: Execute Settlement and Validate Whale Spread Pricing (0.50% Tier)', async ({
        request
    }) => {
        expect(
            ADMIN_KEY.length,
            'PERENNIA_ADMIN_KEY or INTERNAL_ADMIN_TOKEN must be set in .env'
        ).toBeGreaterThan(0);

        // Dynamically size KAS input to ~$3,000 USD at live oracle spot so >= $2,000 whale tier (0.50%) triggers
        const whaleKasAmount = Math.ceil(
            3000 / Math.max(0.01, liveKasSpotUsd)
        );

        const res = await request.post('/api/sor/yield_settle', {
            headers: { Authorization: `Bearer ${ADMIN_KEY}` },
            data: {
                wallet: TEST_WALLET,
                amountKas: whaleKasAmount,
                targetAsset: 'USDC'
            }
        });
        const data = await res.json().catch(() => ({}));
        expect(
            res.ok(),
            `Yield settle failed (${res.status()}): ${JSON.stringify(data)}`
        ).toBeTruthy();

        expect(data.success).toBe(true);
        expect(data.target_asset).toBe('USDC');

        const settledUsd = Number(data.settled_amount);
        const feeUsd = Number(data.treasury_fee);
        const grossUsd = settledUsd + feeUsd;

        expect(grossUsd).toBeGreaterThanOrEqual(2000);
        expect(feeUsd / grossUsd).toBeCloseTo(0.005, 5);
        expect(settledUsd / grossUsd).toBeCloseTo(0.995, 5);
        expect(data.l1_dispatch?.asset).toBe('USDC');
    });

    test('SOR Swap: Reject Unauthenticated Session (401)', async ({
        request
    }) => {
        const res = await request.post('/api/sor/swap', {
            data: {
                payAsset: 'KAS',
                receiveAsset: 'USDC',
                amount: 500,
                slippageTolerance: 0.05,
                systemMode: 'base'
            }
        });
        expect(res.status()).toBe(401);
    });

    test('SOR Swap & L1 Dispatch: Reject Cross-Wallet Manipulation', async ({
        request
    }) => {
        const dispatchRes = await request.post('/api/sor/l1_dispatch', {
            headers: { Cookie: sessionCookie },
            data: {
                wallet: ALT_WALLET,
                destinationAddress: ALT_WALLET,
                asset: 'KAS',
                amount: 25
            }
        });
        expect(dispatchRes.status()).toBe(403);

        const swapRes = await request.post('/api/sor/swap', {
            headers: { Cookie: sessionCookie },
            data: {
                wallet: ALT_WALLET,
                payAsset: 'KAS',
                receiveAsset: 'USDC',
                amount: 500,
                slippageTolerance: 0.05,
                systemMode: 'base'
            }
        });
        expect([403, 422]).toContain(swapRes.status());
    });

    test('SOR Swap: Authenticate Live Quote & Dispatch Slippage-Bounded Payload to Rust Engine', async ({
        request
    }) => {
        const quoteRes = await request.get(
            '/api/sor/swap?payAsset=KAS&receiveAsset=USDC&amount=500',
            {
                headers: { Cookie: sessionCookie }
            }
        );
        expect(quoteRes.ok()).toBeTruthy();
        const quoteData = await quoteRes.json();
        expect(quoteData.success).toBe(true);
        expect(Number(quoteData.paySpotUsd)).toBeGreaterThan(0);
        expect(Number(quoteData.estimatedOutput)).toBeGreaterThan(0);
        expect(quoteData.tokenSteering?.allowDarkPoolInternalClearing).toBe(
            true
        );

        const res = await request.post('/api/sor/swap', {
            headers: { Cookie: sessionCookie },
            data: {
                wallet: TEST_WALLET,
                payAsset: 'KAS',
                receiveAsset: 'USDC',
                amount: 500,
                slippageTolerance: 0.01,
                systemMode: 'base'
            }
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok()) {
            expect(data.unified_rate).toBeDefined();
            expect(data.estimated_output).toBeDefined();
            expect(data.transaction_uuid).toBeDefined();
            expect(Array.isArray(data.legs)).toBe(true);
        } else {
            expect(res.status()).toBe(422);
            expect(data.error).toContain('INSUFFICIENT_BALANCE');
        }
    });
});