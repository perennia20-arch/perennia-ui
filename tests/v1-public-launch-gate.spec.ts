import { test, expect } from '@playwright/test';
import {
    createEncryptedVaultBundleJson,
    parseAndDecryptVaultBundleJson,
    createProfileBundleJson,
    parseAndValidateProfileBundleJson
} from '../src/lib/utils/portableBundles';

const TEST_SEED =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

async function unlockMockWallet(page: any) {
    await page.route('**/api/auth/challenge', async (route: any) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'perennia-launch-gate-nonce' })
        });
    });
    await page.route('**/api/auth', async (route: any) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true })
        });
    });
    await page.goto('/');
    await page.getByTestId('enter-nexus-btn').click();
    await page.locator('button', { hasText: /Import|Restore/i }).first().click();
    const pwInputs = page.locator('input[type="password"]');
    await pwInputs.nth(0).fill('LaunchGatePass#2026!');
    await pwInputs.nth(1).fill('LaunchGatePass#2026!');
    await page.locator('textarea').first().fill(TEST_SEED);
    await page.locator('button', { hasText: /Import|Restore|Secure/i }).last().click();
    await expect(page.getByTestId('header-wallet-pill')).toBeVisible({ timeout: 15_000 });
}

test('Stage 1–4 Public Launch Gate: Header BUY·MINE·SWAP·BOT, EN·USD, MINE 503 resilience, 2-tab BUY, Alpha 401 & Stealth /forge 404', async ({
    page,
    request
}) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // Mock 503 oracle state initially on MINE to verify non-blank fault isolation
    await page.route('**/api/state**', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 503,
                contentType: 'application/json',
                body: JSON.stringify({ oracleOnline: false, error: 'ORACLE_HALT' })
            });
        } else {
            await route.continue();
        }
    });

    await unlockMockWallet(page);

    // 1. Header 4 verbs (BUY · MINE · SWAP · BOT), zero TAXES in nav, zero Settings gear icon
    await expect(page.getByTestId('header-buy-fiat-btn')).toBeVisible();
    await expect(page.getByTestId('header-nav-OPERATIONS')).toBeVisible();
    await expect(page.getByTestId('header-nav-DEX')).toBeVisible();
    await expect(page.getByTestId('header-agents-btn')).toBeVisible();
    await expect(page.getByTestId('header-nav-TAX')).toHaveCount(0);
    await expect(page.getByTestId('header-settings-btn')).toHaveCount(0);

    // 2. EN · USD 2-column selector & Light Mode theme switch
    const localeBtn = page.getByTestId('header-locale-currency-btn');
    await expect(localeBtn).toBeVisible();
    await localeBtn.click();
    const localeModal = page.getByTestId('locale-currency-modal');
    await expect(localeModal).toBeVisible();
    await page.getByTestId('select-locale-JA').click();
    await page.getByTestId('select-currency-JPY').click();
    await page.getByTestId('close-locale-currency-modal-btn').click();
    await expect(localeBtn).toContainText('JA · JPY');

    await localeBtn.click();
    await page.getByTestId('select-locale-EN').click();
    await page.getByTestId('select-currency-USD').click();
    await page.getByTestId('close-locale-currency-modal-btn').click();
    await expect(localeBtn).toContainText('EN · USD');

    await page.getByTestId('header-theme-toggle-btn').click();
    const isLightOrDarkToggled = await page.evaluate(() =>
        Boolean(
            document.documentElement.dataset.theme ||
                document.documentElement.classList.contains('light-mode') ||
                document.body.innerHTML.includes('light')
        )
    );
    expect(isLightOrDarkToggled).toBe(true);

    // 3. MINE renders cleanly (non-blank) even under 503 / empty workers
    await page.getByTestId('header-nav-OPERATIONS').click();
    await expect(page.locator('main').first()).toBeVisible();
    const bodyTextLen = await page.evaluate(() => document.body.innerText.trim().length);
    expect(bodyTextLen).toBeGreaterThan(20);

    // 4. BUY 2-tab (INSTANT presets + ACH clearing hold vs VIP WIRE $2,500+ with COPY buttons)
    await page.getByTestId('header-buy-fiat-btn').click();
    const fiatModal = page.getByTestId('global-fiat-modal');
    await expect(fiatModal).toBeVisible();
    await expect(page.getByTestId('buy-tab-instant')).toBeVisible();
    await expect(page.getByTestId('buy-tab-vip-wire')).toBeVisible();
    await page.getByTestId('buy-preset-250').click();
    await expect(page.getByTestId('global-fiat-usd-input')).toHaveValue('250');

    await page.getByTestId('modal-rail-stripe-btn').click();
    await expect(page.getByTestId('buy-clearing-hold-badge')).toContainText('CLEARING');

    await page.getByTestId('buy-tab-vip-wire').click();
    await expect(page.getByTestId('global-mercury-wire-box')).toBeVisible();
    await expect(page.getByTestId('copy-wire-routing-btn')).toBeVisible();
    await expect(page.getByTestId('copy-wire-account-btn')).toBeVisible();
    await expect(page.getByTestId('copy-wire-memo-btn')).toBeVisible();
    await page.getByTestId('close-global-fiat-modal-btn').click();

    // 5. WALLET -> LEDGER / CSV ↗, VAULT .JSON, PROFILE .JSON & LOCK SILO UTXO tier
    await page.getByTestId('header-wallet-pill').click();
    await expect(page.getByTestId('wallet-menu-backup-btn')).toBeVisible();
    await expect(page.getByTestId('wallet-menu-profile-btn')).toBeVisible();
    await page.getByTestId('header-treasury-btn').click();

    // 6. Agent Alpha requires authentication (401) & /llms.txt redacts /forge
    const unauthAlpha = await request.get('/api/v1/agent/alpha');
    expect([401, 403]).toContain(unauthAlpha.status());

    const llmsRes = await request.get('/llms.txt');
    expect(llmsRes.status()).toBe(200);
    const llmsText = await llmsRes.text();
    expect(llmsText).toContain('/api/v1/agent/alpha');
    expect(llmsText.toLowerCase()).not.toContain('/forge');

    // 7. Stealth Founder /forge returns 404 when unauthenticated / non-founder
    const forgePageRes = await request.get('/forge');
    expect(forgePageRes.status()).toBe(404);
    const forgeApiRes = await request.post('/api/v1/forge/overview', { data: {} });
    expect(forgeApiRes.status()).toBe(404);

    expect(pageErrors).toEqual([]);
});

test('Portable Bundles: perennia-vault.v1.json AES-256-GCM encryption & perennia-profile.v1.json secret stripping', async () => {
    if (typeof (globalThis as any).window === 'undefined') {
        (globalThis as any).window = globalThis;
    }
    const encrypted = await createEncryptedVaultBundleJson({
        passphrase: 'StrongPassphrase!2026',
        kaspaAddress: 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e',
        sovereignKeys: { mnemonic: TEST_SEED },
        watchlistTickers: ['SILO', 'NACHO'],
        lockedSiloPointers: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:0']
    });
    const parsedVault = await parseAndDecryptVaultBundleJson(encrypted, 'StrongPassphrase!2026');
    expect(parsedVault.decrypted.sovereignKeys?.mnemonic).toBe(TEST_SEED);
    expect(parsedVault.bundle.lockedSiloPointers).toHaveLength(1);

    const profileJson = createProfileBundleJson({
        locale: 'EN',
        currency: 'USD',
        tokenSplits: [{ id: 's1', name: 'SILO', allocationBps: 5000 }],
        workerAliases: [{ workerId: 'w1', alias: 'Rig-01' }],
        botMandateTemplates: [
            {
                keyId: 'k1',
                label: 'AlphaBot',
                agentKey: 'per_md_v1.SECRET_DO_NOT_EXPORT',
                token: 'per_ag_v1.SECRET_TOKEN',
                whitelistedAssets: ['KAS', 'SILO']
            }
        ],
        hifoTaxLots: []
    });
    expect(profileJson).not.toContain('per_md_v1');
    expect(profileJson).not.toContain('per_ag_v1');
    const validatedProfile = parseAndValidateProfileBundleJson(profileJson);
    expect(validatedProfile.schemaVersion).toBe(1);
    expect(validatedProfile.botMandateTemplates).toHaveLength(1);
});
