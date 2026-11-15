import { test, expect } from '@playwright/test';
import { ethers } from 'ethers';
import { blake2b } from '@noble/hashes/blake2.js';
import { schnorr } from '@noble/curves/secp256k1.js';
import crypto from 'node:crypto';

const KASPA_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function encodeKaspaBech32m(pubKeyX: Uint8Array): string {
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
    const prefixValues = 'kaspa'.split('').map((c) => c.charCodeAt(0) & 31).concat([0]);
    const payload = [0x00, ...pubKeyX.slice(0, 32)];
    let acc = 0, bits = 0;
    const payload5: number[] = [];
    for (const byte of payload) {
        acc = (acc << 8) | byte;
        bits += 8;
        while (bits >= 5) { bits -= 5; payload5.push((acc >> bits) & 31); }
    }
    if (bits > 0) payload5.push((acc << (5 - bits)) & 31);
    const mod = polymod([...prefixValues, ...payload5, 0, 0, 0, 0, 0, 0, 0, 0]);
    const checksum = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => Number((mod >> BigInt(5 * (7 - i))) & 31n));
    return `kaspa:${[...payload5, ...checksum].map((v) => KASPA_CHARSET[v]).join('')}`;
}

test('Public Mine hides buckets, Swap enforces 0.20%/0.25%/0.50% anti-gouge tiers, Mobile Wallet renders full-width search + clean rows, and backstage pro-rata ledger settles 3:1', async ({ page, playwright, baseURL }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    const userSeed = ethers.Mnemonic.fromEntropy(crypto.randomBytes(16)).phrase;
    await page.addInitScript(() => {
        (window as any).__perenniaMockBiometrics = true;
        localStorage.setItem('perennia_tour_completed', 'true');
    });

    // Authenticate two API peers for backstage bucket ledger verification
    async function createAuthPeer() {
        const priv = new Uint8Array(blake2b(crypto.randomBytes(32), { dkLen: 32 }));
        const addr = encodeKaspaBech32m(schnorr.getPublicKey(priv));
        const api = await playwright.request.newContext({
            baseURL: baseURL || 'http://localhost:4180',
            extraHTTPHeaders: { 'x-perennia-sandbox': 'true' }
        });
        const ch = await (await api.post('/api/auth/challenge', { data: { address: addr } })).json();
        const sig = bytesToHex(schnorr.sign(blake2b(new TextEncoder().encode(ch.message), { dkLen: 32 }), priv));
        const auth = await api.post('/api/auth', { data: { address: addr, signature: sig, message: ch.message, provider: 'sovereign' } });
        expect(auth.ok()).toBe(true);
        return { api, addr };
    }

    const peerA = await createAuthPeer();
    const peerB = await createAuthPeer();
    let createdBucketId = '';

    try {
        // 1. Desktop Login & Verify Public Bucket Scoreboard is Removed from Mine
        await page.setViewportSize({ width: 1440, height: 920 });
        await page.goto('/');
        await page.getByTestId('enter-nexus-btn').click();

        await page.getByRole('button', { name: /Import 12 \/ 24 Words/i }).click();
        await page.getByTestId('setup-mode-fingerprint').click();
        await page.locator('textarea').first().fill(userSeed);
        const pwInputs = page.locator('input[type="password"]');
        await pwInputs.nth(0).fill('SovereignVault#2026!');
        await pwInputs.nth(1).fill('SovereignVault#2026!');
        await page.getByRole('button', { name: /^Import$/i }).click();

        await expect(page.getByTestId('community-buckets-panel')).toHaveCount(0);

        // 2. Verify Anti-Gouge Directional Swap Pricing in Trade -> Swap
        await page.locator('button:visible', { hasText: /^Trade$/i }).first().click();
        await expect(page.getByTestId('swap-view')).toBeVisible();

        const payInput = page.getByTestId('dex-pay-amount-input');
        await payInput.fill('200'); // ~$30 KAS -> BTC (Dark Pool Major = 0.50%)
        await expect(page.getByTestId('dex-active-fee-pct')).toHaveText('0.50%');

        // Flip to BTC -> KAS (Inbound Buy-KAS Tier = 0.20%)
        await page.getByTestId('swap-flip-assets-btn').click();
        await payInput.fill('0.005');
        await expect(page.getByTestId('dex-active-fee-pct')).toHaveText('0.20%');

        // Flip back to KAS -> BTC at >= $2,500 volume (25,000 KAS = ~$3,750 -> 0.25% Volume Tier)
        await page.getByTestId('swap-flip-assets-btn').click();
        await payInput.fill('250000');
        await expect(page.getByTestId('dex-active-fee-pct')).toHaveText('0.25%');

        // 3. Verify Mobile Phone Wallet Layout (390x844 iPhone viewport)
        await page.setViewportSize({ width: 390, height: 844 });
        const directWalletBtn = page.locator('button:visible, a:visible').filter({ hasText: /Wallet|Treasury/i }).first();
        if ((await directWalletBtn.count()) > 0) {
            await directWalletBtn.click();
        } else {
            const menuBtn = page.locator('button:visible').filter({ hasText: /Menu|☰/i }).or(page.locator('[data-testid*="menu" i]:visible, [aria-label*="menu" i]:visible')).first();
            if ((await menuBtn.count()) > 0) await menuBtn.click();
            await page.locator('button:visible, a:visible').filter({ hasText: /Wallet|Treasury/i }).first().click();
        }

        const searchInput = page.getByTestId('treasury-token-search-input');
        await expect(searchInput).toBeVisible();
        const searchBox = await searchInput.boundingBox();
        expect(searchBox).not.toBeNull();
        expect(searchBox!.width).toBeGreaterThanOrEqual(260);
        expect(searchBox!.x).toBeLessThanOrEqual(64);

        // Secondary chain row (BTC) starts clean & collapsed on mobile, expands smoothly on tap
        const btcRow = page.getByTestId('network-row-BTC');
        await expect(btcRow).toBeVisible();
        const btcBuyBtn = page.getByTestId('buy-with-usd-btn-BTC');
        await expect(btcBuyBtn).toBeHidden();

        await btcRow.locator('[role="button"]').first().click();
        await expect(btcBuyBtn).toBeVisible();

        const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
        expect(noOverflow).toBe(true);

        // 4. Verify Backstage Bucket Settlement Ledger (Private 403 + 75%/25% 3:1 Pro-Rata Dispersal)
        const createRes = await peerA.api.post('/api/buckets', {
            data: { action: 'CREATE_BUCKET', targetAsset: 'NVDA', targetKas: 400, visibility: 'PRIVATE' }
        });
        const createData = await createRes.json();
        const nvdaBucket = (createData.buckets || []).find((b: any) => b.targetAsset === 'NVDA' && b.creatorWallet);
        expect(nvdaBucket).toBeTruthy();
        createdBucketId = nvdaBucket.bucketId;

        const blocked = await peerB.api.post('/api/buckets/contribute', {
            data: { bucketId: createdBucketId, amountKas: 100, mode: 'contribute', txHash: crypto.randomBytes(32).toString('hex') }
        });
        expect(blocked.status()).toBe(403);

        await peerA.api.post('/api/buckets', { data: { action: 'TOGGLE_VISIBILITY', bucketId: createdBucketId } });
        await peerA.api.post('/api/buckets/contribute', {
            data: { bucketId: createdBucketId, amountKas: 100, mode: 'contribute', txHash: crypto.randomBytes(32).toString('hex') }
        });
        await peerB.api.post('/api/buckets/contribute', {
            data: { bucketId: createdBucketId, amountKas: 100, mode: 'contribute', txHash: crypto.randomBytes(32).toString('hex') }
        });
        const fillRes = await peerA.api.post('/api/buckets/contribute', {
            data: { bucketId: createdBucketId, amountKas: 200, mode: 'fill_remainder', txHash: crypto.randomBytes(32).toString('hex') }
        });
        const fillData = await fillRes.json();
        expect(fillData.cycleDispersed).toBe(true);

        const ledA = await (await peerA.api.get(`/api/user/ledger?wallet=${encodeURIComponent(peerA.addr)}`)).json();
        const ledB = await (await peerB.api.get(`/api/user/ledger?wallet=${encodeURIComponent(peerB.addr)}`)).json();
        expect(Number(ledA.NVDA) / Number(ledB.NVDA)).toBeCloseTo(3.0, 4);
        expect(pageErrors).toEqual([]);
    } finally {
        if (createdBucketId) {
            await peerA.api.post('/api/buckets', { data: { action: 'DELETE_BUCKET', bucketId: createdBucketId } }).catch(() => {});
        }
        await peerA.api.dispose();
        await peerB.api.dispose();
    }
});