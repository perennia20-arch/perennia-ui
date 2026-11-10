import { test, expect } from '@playwright/test';

const MASTER_TREASURY_KAS =
    'kaspa:qpra8t9ul8hd7n9pvw4td6ax3unlf2vyc2fz5t9p9yalhsnk7qkaknp24lpm7';

test.describe.serial('Perennia v5 Live Production Gate — Unmocked SQL, Vault Lock & Treasury Integrity', () => {
    test('1. Locked Sovereign Vault strictly hides DIRECTOR tab even when localStorage caches Master Treasury address', async ({
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

        await page.goto('/');
        const enterBtn = page.getByTestId('enter-nexus-btn');
        if (await enterBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
            await enterBtn.click();
        }
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

        await page.goto('/');
        const enterBtn = page.getByTestId('enter-nexus-btn');
        if (await enterBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
            await enterBtn.click();
        }

        await page.getByRole('button', { name: /New 24-Word Vault/i }).click();
        await page.getByPlaceholder('VAULT PASSWORD').fill('PerenniaLiveGatePass2026!');
        await page.getByPlaceholder('CONFIRM PASSWORD').fill('PerenniaLiveGatePass2026!');
        await page.getByRole('button', { name: /Generate 24-Word Seed/i }).click();

        const seedWords = page.locator('span.select-all.text-\\[\\#18C6A5\\]');
        await expect(seedWords).toHaveCount(24);
        const words = await seedWords.allInnerTexts();

        await page.getByRole('button', { name: /Proceed to 2-Word Test/i }).click();
        const idx1 = parseInt((await page.locator('label[for="verifyWord1"]').innerText()).replace(/\D/g, ''), 10) - 1;
        const idx2 = parseInt((await page.locator('label[for="verifyWord2"]').innerText()).replace(/\D/g, ''), 10) - 1;

        await page.locator('#verifyWord1').fill(words[idx1].trim());
        await page.locator('#verifyWord2').fill(words[idx2].trim());
        await page.getByRole('button', { name: /Verify & Unlock Sovereign Vault/i }).click();

        await expect(page.getByRole('button', { name: 'Disconnect' })).toBeVisible({ timeout: 15000 });
        await expect(page.getByTestId('header-nav-DIRECTOR')).toHaveCount(0);

        const liveResults = await page.evaluate(async (coldDest) => {
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
            const siloZeroBalGuard = await postAction('STAKE_SILO', { amount: 15000 });
            const hifoRead = await postAction('GET_HIFO_TAX_LOTS');
            const coldSave = await postAction('SAVE_USER_COLD_VAULT_RULE', {
                asset: 'KAS',
                coldDestinationAddress: coldDest,
                overflowCeiling: 1000,
                autoSweepEnabled: false
            });
            const coldRead = await postAction('GET_USER_COLD_VAULT_RULES');
            return { siloRead, siloZeroBalGuard, hifoRead, coldSave, coldRead };
        }, MASTER_TREASURY_KAS);

        expect(liveResults.siloRead.status).toBe(200);
        expect(liveResults.siloZeroBalGuard.status).not.toBe(500);
        expect(
            liveResults.siloZeroBalGuard.status >= 400 ||
                liveResults.siloZeroBalGuard.body?.success === false
        ).toBe(true);
        expect(liveResults.hifoRead.status).toBe(200);
        expect(liveResults.coldSave.status).toBe(200);
        expect(liveResults.coldRead.status).toBe(200);

        await page.getByRole('button', { name: 'Disconnect' }).click();
    });
});
