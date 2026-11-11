import { test, expect, type Page } from '@playwright/test';

const MASTER_TREASURY_KAS =
    'kaspa:qpra8t9ul8hd7n9pvw4td6ax3unlf2vyc2fz5t9p9yalhsnk7qkaknp24lpm7';

async function enterNexusHydrated(page: Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(async () => {
        const enterBtn = page.getByTestId('enter-nexus-btn');
        if (await enterBtn.isVisible()) {
            await enterBtn.click();
        }
        await expect(page.getByTestId('header-treasury-btn')).toBeVisible({
            timeout: 1500
        });
    }).toPass({ timeout: 15_000 });
}

test.describe.serial('Perennia v5 Live Production Gate — Unmocked SQL, Vault Lock & Treasury Integrity', () => {
    test('1. Locked Sovereign Vault strictly hides DIRECTOR tab inside awakened Nexus header even when localStorage caches Master Treasury address', async ({
        page,
        request
    }) => {
        const adminCheck = await request.get('/api/admin');
        expect([401, 403]).toContain(adminCheck.status());

        await page.addInitScript((treasuryAddr) => {
            localStorage.setItem('perennia_tour_completed', 'true');
            localStorage.setItem('perennia_non_cpa_acknowledged_v1', 'true');
            localStorage.setItem(
                'perennia_sovereign_payload',
                JSON.stringify({
                    version: 'perennia-vault-v4',
                    wallets: { kaspa: { address: treasuryAddr } },
                    vault: 'bG9ja2VkLXZhdWx0LWNpcGhlcnRleHQ='
                })
            );
            sessionStorage.removeItem('perennia_vault_unlocked');
        }, MASTER_TREASURY_KAS);

        await enterNexusHydrated(page);
        await expect(page.getByTestId('header-nav-DIRECTOR')).toHaveCount(0);
    });

    test('2. Live Ubuntu Treasury & Stripe Webhook endpoints enforce qpra8t9 Bech32m address and HMAC signature verification', async ({
        request
    }) => {
        const meRes = await request.get('/api/auth/me');
        const meBody = await meRes.json();
        expect(meBody.masterTreasuryAddress).toBe(MASTER_TREASURY_KAS);
        expect(JSON.stringify(meBody)).not.toContain('qpra0t9');
        expect(JSON.stringify(meBody)).not.toContain('qrc3ezl');

        const stripeGet = await request.get('/api/webhooks/stripe');
        expect(stripeGet.ok()).toBeTruthy();
        const stripeMeta = await stripeGet.json();
        expect(stripeMeta.online).toBe(true);
        expect(stripeMeta.signatureConfigured).toBe(true);
        expect(stripeMeta.achHoldEnforced).toBe(true);

        const forgedPost = await request.post('/api/webhooks/stripe', {
            headers: {
                'Content-Type': 'application/json',
                'Stripe-Signature': 't=1700000000,v1=0000000000000000000000000000000000000000000000000000000000000000'
            },
            data: { id: 'evt_forged_gate', type: 'payment_intent.succeeded' }
        });
        expect(forgedPost.status()).toBe(400);
    });

    test('3. Unmocked Ephemeral 24-Word Vault exercises live Schnorr Auth, zero-balance SILO SQL guard, HIFO lots & Cold Vault rules', async ({
        page
    }) => {
        await page.addInitScript(() => {
            localStorage.setItem('perennia_tour_completed', 'true');
            localStorage.setItem('perennia_non_cpa_acknowledged_v1', 'true');
        });

        await enterNexusHydrated(page);

        const newVaultBtn = page.getByRole('button', { name: /New 24-Word Vault/i });
        if (!(await newVaultBtn.isVisible())) {
            await page
                .getByRole('button', { name: /Unlock Vault|Connect Wallet/i })
                .first()
                .click();
        }
        await expect(newVaultBtn).toBeVisible({ timeout: 10_000 });
        await newVaultBtn.click();

        await page.getByPlaceholder('VAULT PASSWORD').fill('PerenniaLiveGatePass2026!');
        await page.getByPlaceholder('CONFIRM PASSWORD').fill('PerenniaLiveGatePass2026!');
        await page.getByRole('button', { name: /Generate 24-Word Seed/i }).click();

        const seedWords = page.locator('span.select-all.text-\\[\\#18C6A5\\]');
        await expect(seedWords).toHaveCount(24);
        const words = await seedWords.allInnerTexts();

        await page.getByRole('button', { name: /Proceed to 2-Word Test/i }).click();
        const idx1 =
            parseInt((await page.locator('label[for="verifyWord1"]').innerText()).replace(/\D/g, ''), 10) - 1;
        const idx2 =
            parseInt((await page.locator('label[for="verifyWord2"]').innerText()).replace(/\D/g, ''), 10) - 1;

        await page.locator('#verifyWord1').fill(words[idx1].trim());
        await page.locator('#verifyWord2').fill(words[idx2].trim());
        await page.getByRole('button', { name: /Verify & Unlock Sovereign Vault/i }).click();

        await expect
            .poll(async () => page.evaluate(() => sessionStorage.getItem('perennia_vault_unlocked')), {
                timeout: 15_000
            })
            .toBe('true');

        await expect(page.getByTestId('header-nav-DIRECTOR')).toHaveCount(0);

        const liveResults = await page.evaluate(async () => {
            const me = await fetch('/api/auth/me').then(async (r) => ({
                status: r.status,
                body: await r.json().catch(() => ({}))
            }));
            const postAction = async (action: string, payload: Record<string, unknown> = {}) => {
                const res = await fetch('/api/state/action', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action, payload })
                });
                const body = await res.json().catch(() => ({}));
                return { status: res.status, body };
            };

            const siloRead = await postAction('GET_SILO_STAKING');
            const siloZeroBalGuard = await postAction('STAKE_SILO', { ticker: 'SILO', amount: 15000 });
            const hifoRes = await fetch('/api/user/tax-events?bundle=hifo');
            const hifoRead = { status: hifoRes.status, body: await hifoRes.json().catch(() => ({})) };
            const coldRead = await postAction('GET_USER_COLD_VAULT_RULES');
            await fetch('/api/auth', { method: 'DELETE' });
            return { me, siloRead, siloZeroBalGuard, hifoRead, coldRead };
        });

        expect(liveResults.me.status, JSON.stringify(liveResults.me)).toBe(200);
        expect(liveResults.me.body.authenticated).toBe(true);
        expect(liveResults.me.body.isCorporateAdmin).toBe(false);
        expect(liveResults.siloRead.status, JSON.stringify(liveResults.siloRead)).toBe(200);
        expect(liveResults.siloZeroBalGuard.status, JSON.stringify(liveResults.siloZeroBalGuard)).not.toBe(500);
        expect(
            liveResults.siloZeroBalGuard.status >= 400 ||
                liveResults.siloZeroBalGuard.body?.success === false ||
                Boolean(liveResults.siloZeroBalGuard.body?.error)
        ).toBe(true);
        expect(liveResults.hifoRead.status, JSON.stringify(liveResults.hifoRead)).toBe(200);
        expect(liveResults.coldRead.status, JSON.stringify(liveResults.coldRead)).toBe(200);
    });
});
