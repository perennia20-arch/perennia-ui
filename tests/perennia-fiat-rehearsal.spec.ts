import { test, expect, type Page } from '@playwright/test';
import { blake2b } from '@noble/hashes/blake2.js';
import { schnorr } from '@noble/curves/secp256k1.js';

const LIVE_MASTER_TREASURY_KAS =
    'kaspa:qpra8t9ul8hd7n9pvw4td6ax3unlf2vyc2fz5t9p9yalhsnk7qkaknp24lpm7';
const LIVE_BTC_DEPOSIT_ADDRESS = '1K8bdyeXxRbcHMs3NHFtWH62Dho3uqnW6u';
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

function deriveRehearsalSigner(seedLabel: string) {
    const privKey = new Uint8Array(
        blake2b(new TextEncoder().encode(seedLabel), { dkLen: 32 })
    );
    const pubKey = schnorr.getPublicKey(privKey);
    const address = encodeKaspaBech32mP2pk(pubKey);
    return { privKey, pubKey, address };
}

const REHEARSAL_SIGNER = deriveRehearsalSigner(
    'perennia-v5-fiat-rehearsal-retail-wallet-v1'
);
const REHEARSAL_WALLET = REHEARSAL_SIGNER.address;

const MOCK_SANDBOX_VAULT_PAYLOAD = {
    version: 'perennia-vault-v4',
    exportedAt: '2026-10-31T18:00:00.000Z',
    wallets: {
        kaspa: { address: REHEARSAL_WALLET },
        bitcoin: { address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' },
        ethereum: { address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
        solana: { address: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH' },
        doge: { address: 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L' },
        xrp: { address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh' },
        polygon: { address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
        avalanche: { address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
        sui: {
            address:
                '0x0000000000000000000000000000000000000000000000000000000000000001'
        },
        tron: { address: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb' },
        zcash: { address: 't1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs' }
    },
    vault: 'U2FuZGJveFZhdWx0RW5jcnlwdGVkUGF5bG9hZA=='
};

let rehearsalSessionToken = '';

async function bootstrapAuthenticatedSandboxSession(page: Page) {
    const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';

    if (rehearsalSessionToken) {
        await page.context().addCookies([
            {
                name: 'perennia_session',
                value: rehearsalSessionToken,
                url: baseURL,
                httpOnly: true,
                sameSite: 'Lax'
            }
        ]);
    }

    await page.setExtraHTTPHeaders({
        'x-perennia-sandbox': 'true'
    });

    await page.addInitScript(
        ({ payload }) => {
            localStorage.setItem(
                'perennia_sovereign_payload',
                JSON.stringify(payload)
            );
            localStorage.setItem('perennia_tour_completed', 'true');
            localStorage.setItem('perennia_non_cpa_acknowledged_v1', 'true');
            sessionStorage.setItem('perennia_active_wallet_type', 'sovereign');
            sessionStorage.setItem('perennia_vault_unlocked', 'true');
        },
        { payload: MOCK_SANDBOX_VAULT_PAYLOAD }
    );

    await page.route('**/api/auth/me', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                authenticated: true,
                address: REHEARSAL_WALLET,
                isCorporateAdmin: true,
                masterTreasuryAddress: LIVE_MASTER_TREASURY_KAS
            })
        });
    });
}

test.describe.serial('PERENNIA v5 — Two-Way Zero-Loss Gross-Up Fiat Rails & Full Ecosystem Rehearsal', () => {
    test.beforeAll(async ({ playwright }) => {
        const baseURL =
            process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';
        const api = await playwright.request.newContext({ baseURL, ...(process.env.PLAYWRIGHT_HTTP_USER && process.env.PLAYWRIGHT_HTTP_PASS ? { httpCredentials: { username: process.env.PLAYWRIGHT_HTTP_USER, password: process.env.PLAYWRIGHT_HTTP_PASS } } : {}) });
        try {
            const challengeRes = await api.post('/api/auth/challenge', {
                data: { address: REHEARSAL_WALLET }
            });
            expect(challengeRes.ok()).toBeTruthy();
            const { message } = await challengeRes.json();

            const msgHash = blake2b(new TextEncoder().encode(message), {
                dkLen: 32
            });
            const signature = bytesToHex(
                schnorr.sign(msgHash, REHEARSAL_SIGNER.privKey)
            );

            const authRes = await api.post('/api/auth', {
                data: {
                    address: REHEARSAL_WALLET,
                    signature,
                    message,
                    provider: 'sovereign'
                }
            });
            expect(authRes.ok()).toBeTruthy();

            const setCookie = authRes
                .headersArray()
                .find(
                    (h) =>
                        h.name.toLowerCase() === 'set-cookie' &&
                        h.value.includes('perennia_session=')
                );
            const match = setCookie?.value.match(/perennia_session=([^;]+)/);
            expect(match?.[1]).toBeTruthy();
            rehearsalSessionToken = match![1];
        } finally {
            await api.dispose();
        }
    });

    test.afterAll(async ({ playwright }) => {
        if (!rehearsalSessionToken) return;
        const baseURL =
            process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';
        const api = await playwright.request.newContext({ baseURL, ...(process.env.PLAYWRIGHT_HTTP_USER && process.env.PLAYWRIGHT_HTTP_PASS ? { httpCredentials: { username: process.env.PLAYWRIGHT_HTTP_USER, password: process.env.PLAYWRIGHT_HTTP_PASS } } : {}) });
        try {
            await api.delete('/api/auth', {
                headers: {
                    Cookie: `perennia_session=${rehearsalSessionToken}`
                }
            });
        } finally {
            await api.dispose();
        }
    });

    test('1. On-Ramp Zero-Loss Gross-Up API & 3-Step Funnel ($900 Basket, Bundled USDC, $1,000 ACH & $2,500 Whale ACH)', async ({
        page,
        request
    }) => {
        const kas500Res = await request.get(
            '/api/fiat/onramp?quoteAsset=KAS&amountUsd=500'
        );
        expect(
            kas500Res.ok(),
            `GET /api/fiat/onramp failed (${kas500Res.status()}): ${await kas500Res.text()}`
        ).toBeTruthy();
        const kas500Data = await kas500Res.json();
        expect(kas500Data.quote.feeUsd).toBe(8.32);
        expect(kas500Data.quote.hardCostUsd).toBe(4.07);
        expect(kas500Data.quote.guaranteedProfitUsd).toBe(4.25);
        expect(kas500Data.quote.netUsdConverted).toBe(500);
        expect(kas500Data.quote.competitorFeeUsd).toBe(17.5);
        expect(kas500Data.quote.guestSavingsUsd).toBe(9.18);

        const btc100Data = await (
            await request.get('/api/fiat/onramp?quoteAsset=BTC&amountUsd=100')
        ).json();
        const eth100Data = await (
            await request.get('/api/fiat/onramp?quoteAsset=ETH&amountUsd=100')
        ).json();
        const sol100Data = await (
            await request.get('/api/fiat/onramp?quoteAsset=SOL&amountUsd=100')
        ).json();
        const usdc100Data = await (
            await request.get('/api/fiat/onramp?quoteAsset=USDC&amountUsd=100')
        ).json();

        for (const item of [btc100Data, eth100Data, sol100Data, usdc100Data]) {
            expect(item.quote.feeUsd).toBe(3.33);
            expect(item.quote.hardCostUsd).toBe(0.83);
            expect(item.quote.guaranteedProfitUsd).toBe(2.5);
            expect(item.quote.netUsdConverted).toBe(100);
            expect(item.quote.competitorFeeUsd).toBe(3.99);
            expect(item.quote.guestSavingsUsd).toBe(0.66);
        }

        const totalBasketFee =
            kas500Data.quote.feeUsd +
            btc100Data.quote.feeUsd +
            eth100Data.quote.feeUsd +
            sol100Data.quote.feeUsd +
            usdc100Data.quote.feeUsd;
        const totalBasketNet =
            kas500Data.quote.netUsdConverted +
            btc100Data.quote.netUsdConverted +
            eth100Data.quote.netUsdConverted +
            sol100Data.quote.netUsdConverted +
            usdc100Data.quote.netUsdConverted;
        const totalUpholdFee =
            kas500Data.quote.competitorFeeUsd +
            btc100Data.quote.competitorFeeUsd +
            eth100Data.quote.competitorFeeUsd +
            sol100Data.quote.competitorFeeUsd +
            usdc100Data.quote.competitorFeeUsd;

        expect(totalBasketFee).toBeCloseTo(21.64, 2);
        expect(totalBasketNet).toBe(900);
        expect(totalUpholdFee).toBeCloseTo(33.46, 2);

        const bundledUsdcRes = await request.get(
            '/api/fiat/onramp?quoteAsset=USDC&amountUsd=500&bundledKasOrSilo=true'
        );
        const bundledUsdcData = await bundledUsdcRes.json();
        expect(bundledUsdcData.quote.bundledUsdcFeeWaived).toBe(true);
        expect(bundledUsdcData.quote.feeUsd).toBe(8.32);
        expect(bundledUsdcData.quote.netUsdConverted).toBe(500);

        const ach1000Res = await request.get(
            '/api/fiat/onramp?quoteAsset=KAS&amountUsd=1000'
        );
        const ach1000Data = await ach1000Res.json();
        expect(
            ach1000Data.postTradeAllocation.wholesaleApiFloatSweepUsd
        ).toBe(491.55);
        expect(
            ach1000Data.postTradeAllocation.chronosMinerSettlementUsd
        ).toBe(496.62);
        expect(
            ach1000Data.postTradeAllocation.llcTaxAndRailReserveUsd
        ).toBe(7.09);
        expect(
            ach1000Data.postTradeAllocation.netProfitAndRatchetUsd
        ).toBe(8.5);

        const whale2500Res = await request.get(
            '/api/fiat/onramp?quoteAsset=KAS&amountUsd=2500'
        );
        const whale2500Data = await whale2500Res.json();
        expect(whale2500Data.quote.autoDefaultedToAch).toBe(true);
        expect(whale2500Data.quote.feeUsd).toBe(26.25);
        expect(whale2500Data.quote.hardCostUsd).toBe(5);
        expect(whale2500Data.quote.guaranteedProfitUsd).toBe(21.25);
        expect(whale2500Data.quote.netUsdConverted).toBe(2500);
        expect(
            whale2500Data.postTradeAllocation.wholesaleApiFloatSweepUsd
        ).toBe(1225.23);

        await bootstrapAuthenticatedSandboxSession(page);
        await page.goto('/');
        await page.getByTestId('header-nav-DEX').click();
        await page.getByRole('button', { name: 'Fiat', exact: true }).click();

        const step1Card = page.getByTestId('fiat-step1-calculator-card');
        await expect(step1Card).toBeVisible();

        await page.getByTestId('fiat-onramp-usd-input').fill('500');
        await page.getByTestId('fiat-asset-pill-KAS').evaluate((el: HTMLElement) => el.click());
        await expect(
            page.getByTestId('fiat-competitor-savings-badge')
        ).toContainText(
            'Keep +$9.18 vs. MoonPay ($17.50 fee) & +$4.13 vs. Coinbase ($12.45 fee)'
        );

        await page.getByTestId('fiat-preset-2500').click();
        await page.getByTestId('fiat-lock-quote-cta').click();
        await page.getByTestId('onramp-dest-self-custody-card').click();

        const onrampAbaInput = page.locator('#onrampAbaInput');
        if (await onrampAbaInput.isVisible()) {
            await onrampAbaInput.fill('111000614');
            await page.locator('#onrampAcctInput').fill('8804921044');
        }

        const generatePassBtn = page.getByTestId('fiat-generate-pass-cta');
        await expect(generatePassBtn).toBeEnabled();
        await generatePassBtn.click();

        const passCard = page.getByTestId('fiat-settlement-pass-card');
        await expect(passCard).toBeVisible();
        await expect(
            page.getByTestId('fiat-post-trade-sweep-card')
        ).toContainText('$1225.23');

        const downloadPromise = page.waitForEvent('download');
        await page.getByTestId('fiat-download-wire-slip-btn').click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toContain(
            'Perennia_Purchase_Receipt_'
        );

        const simBtn = page.getByTestId('fiat-simulate-ach-clear-btn');
        if (await simBtn.isVisible()) {
            await simBtn.click();
        }
        await expect(passCard).toContainText('COMPLETED', {
            ignoreCase: true
        });
    });

    test('2. Off-Ramp Cost-Plus Tiers, Live Ubuntu Deposit Addresses & Confirmation Lock', async ({
        page,
        request
    }) => {
        const kas500Res = await request.get(
            '/api/fiat/offramp?quoteAsset=KAS&amountUsd=500'
        );
        expect(
            kas500Res.ok(),
            `GET /api/fiat/offramp failed (${kas500Res.status()}): ${await kas500Res.text()}`
        ).toBeTruthy();
        const kas500Off = await kas500Res.json();
        expect(kas500Off.quote.feeUsd).toBe(9);
        expect(kas500Off.quote.netFiatPayout).toBe(491);
        expect(kas500Off.quote.competitorFeeUsd).toBe(15);
        expect(kas500Off.depositPreview.depositAddress).toBe(
            LIVE_MASTER_TREASURY_KAS
        );

        const btc100Off = await (
            await request.get('/api/fiat/offramp?quoteAsset=BTC&amountUsd=100')
        ).json();
        expect(btc100Off.quote.feeUsd).toBe(3);
        expect(btc100Off.quote.hardCostUsd).toBe(1);
        expect(btc100Off.quote.guaranteedProfitUsd).toBe(2);
        expect(btc100Off.quote.netFiatPayout).toBe(97);
        expect(btc100Off.quote.competitorFeeUsd).toBe(4);
        expect(btc100Off.depositPreview.depositAddress).toBe(
            LIVE_BTC_DEPOSIT_ADDRESS
        );

        const eth200Off = await (
            await request.get('/api/fiat/offramp?quoteAsset=ETH&amountUsd=200')
        ).json();
        expect(eth200Off.quote.feeUsd).toBe(5);
        expect(eth200Off.quote.hardCostUsd).toBe(2);
        expect(eth200Off.quote.guaranteedProfitUsd).toBe(3);
        expect(eth200Off.quote.netFiatPayout).toBe(195);
        expect(eth200Off.quote.competitorFeeUsd).toBe(7);

        const usdc1000Off = await (
            await request.get(
                '/api/fiat/offramp?quoteAsset=USDC&amountUsd=1000'
            )
        ).json();
        expect(usdc1000Off.quote.feeUsd).toBe(5);
        expect(usdc1000Off.quote.netFiatPayout).toBe(995);

        const whale2500Off = await (
            await request.get(
                '/api/fiat/offramp?quoteAsset=BTC&amountUsd=2500&payoutMethod=WIRE'
            )
        ).json();
        expect(whale2500Off.quote.feeUsd).toBe(30);
        expect(whale2500Off.quote.hardCostUsd).toBe(6);
        expect(whale2500Off.quote.guaranteedProfitUsd).toBe(24);
        expect(whale2500Off.quote.netFiatPayout).toBe(2470);
        expect(whale2500Off.quote.competitorFeeUsd).toBe(63);

        const totalOfframpFee =
            kas500Off.quote.feeUsd +
            btc100Off.quote.feeUsd +
            eth200Off.quote.feeUsd +
            whale2500Off.quote.feeUsd;
        const totalOfframpHardCost = Math.round(
            kas500Off.quote.hardCostUsd +
                btc100Off.quote.hardCostUsd +
                eth200Off.quote.hardCostUsd +
                whale2500Off.quote.hardCostUsd
        );
        const totalOfframpProfit = Math.round(
            kas500Off.quote.guaranteedProfitUsd +
                btc100Off.quote.guaranteedProfitUsd +
                eth200Off.quote.guaranteedProfitUsd +
                whale2500Off.quote.guaranteedProfitUsd
        );
        const totalRetailOfframpCost =
            kas500Off.quote.competitorFeeUsd +
            btc100Off.quote.competitorFeeUsd +
            eth200Off.quote.competitorFeeUsd +
            whale2500Off.quote.competitorFeeUsd;

        expect(totalOfframpFee).toBe(47);
        expect(totalOfframpHardCost).toBe(9);
        expect(totalOfframpProfit).toBe(38);
        expect(totalRetailOfframpCost).toBe(89);

        await bootstrapAuthenticatedSandboxSession(page);
        await page.goto('/');
        await page.getByTestId('header-nav-DEX').click();
        await page.getByRole('button', { name: 'Fiat', exact: true }).click();
        await page.getByTestId('fiat-offramp-tab-btn').click();

        await page.getByTestId('offramp-preset-100').click();
        await page.getByTestId('offramp-asset-pill-BTC').evaluate((el: HTMLElement) => el.click()); await expect(page.getByTestId('fiat-offramp-step1-card')).toContainText('You Sell (BTC)');

        await expect(page.getByTestId('fiat-offramp-net-payout')).toContainText(
            '$97.25 USD'
        );
        await expect(
            page.getByTestId('fiat-offramp-savings-badge')
        ).toContainText('Save +$1.24 vs. MoonPay & +$0.24 vs. Coinbase');

        await page.getByTestId('fiat-offramp-lock-quote-cta').click();

        const editBankBtn = page.getByTestId('edit-bank-rail-btn');
        if (await editBankBtn.isVisible()) {
            await editBankBtn.click();
        }

        const abaInput = page.getByTestId('offramp-aba-input');
        await expect(abaInput).toBeVisible();
        await abaInput.fill('111000614');
        await expect(page.getByTestId('aba-recognition-badge')).toContainText(
            'JPMorgan Chase Bank, N.A.'
        );
        await page.getByTestId('offramp-account-input').fill('8804921044');

        const offrampSubmitBtn = page.getByTestId(
            'fiat-offramp-generate-pass-cta'
        );
        await expect(offrampSubmitBtn).toBeEnabled();
        await expect(offrampSubmitBtn).toHaveText(/Sell\s+0\.\d+\s+BTC/); await expect(offrampSubmitBtn).not.toContainText('0.0000'); await offrampSubmitBtn.click();

        const offrampPass = page.getByTestId(
            'fiat-offramp-settlement-pass-card'
        );
        await expect(offrampPass).toBeVisible();
        await expect(
            page.getByTestId('offramp-direct-deposit-address')
        ).toContainText(LIVE_BTC_DEPOSIT_ADDRESS);

        await page.getByTestId('fiat-simulate-offramp-confirm-btn').click();
        await expect(offrampPass).toContainText('Dispatched', {
            ignoreCase: true
        });
    });

    test('3. Chaos & Fail-Closed Circuit Breaker Tests (Gas Spike & API Timeout Protection)', async ({
        request
    }) => {
        const gasSpikeOnramp = await request.get(
            '/api/fiat/onramp?quoteAsset=BTC&amountUsd=100&simulateGasSpikeUsd=15'
        );
        expect(gasSpikeOnramp.status()).toBe(503);
        const spikeBody = await gasSpikeOnramp.json();
        expect(spikeBody.circuitBreakerTripped).toBe(true);
        expect(spikeBody.error).toContain('CIRCUIT_BREAKER_TRIPPED');

        const timeoutOfframp = await request.get(
            '/api/fiat/offramp?quoteAsset=ETH&amountUsd=200&simulateApiTimeout=true'
        );
        expect(timeoutOfframp.status()).toBe(503);
        const timeoutBody = await timeoutOfframp.json();
        expect(timeoutBody.circuitBreakerTripped).toBe(true);
        expect(timeoutBody.error).toContain('CIRCUIT_BREAKER_TRIPPED');
    });

    test('4. Full Ecosystem Reconciliation (Global Fiat Modal, 1-Click SILO Auto-Stake & Tax Fortress Escrow)', async ({
        page
    }) => {
        await bootstrapAuthenticatedSandboxSession(page);
        await page.goto('/');

        await page.getByTestId('header-buy-fiat-btn').click();
        const globalModal = page.getByTestId('global-fiat-modal');
        await expect(globalModal).toBeVisible();

        await page.getByTestId('global-fiat-1click-silo-btn').click();
        await expect(
            page.getByTestId('global-fiat-competitor-savings-badge')
        ).toContainText('Save +$12.22 vs. MoonPay & +$5.65 vs. Coinbase');

        await page.getByTestId('close-global-fiat-modal-btn').click();

        await page.getByTestId('header-nav-TAX-FORTRESS').click();
        await expect(page.getByTestId('tax-fortress-view')).toBeVisible();

        await page.getByTestId('toggle-tax-escrow-btn').click();
        const confirmBtn = page.getByTestId('confirm-tax-escrow-btn');
        await expect(confirmBtn).toBeVisible();
        await expect(confirmBtn).toBeEnabled();

        await page.getByTestId('escrow-mode-lp-btn').click();
        await expect(confirmBtn).toBeDisabled();

        await page.getByTestId('escrow-il-ack-checkbox').check();
        await expect(confirmBtn).toBeEnabled();
        await confirmBtn.click();

        await expect(
            page.getByTestId('tax-escrow-balance-display')
        ).toBeVisible();
    });
});