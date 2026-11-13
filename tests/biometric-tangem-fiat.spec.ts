import { test, expect } from '@playwright/test';

const TEST_SEED = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

test('3-Mode Fingerprint/Both/Password unlock + Settings control, Header gear right of wallet, Worker Blocks/Shares non-overlap, and zero Tangem branding', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.addInitScript(() => { (window as any).__perenniaMockBiometrics = true; });
  await page.route('**/api/auth/challenge', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'perennia-bio-nonce' }) });
  });
  await page.route('**/api/auth', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.route('**/api/state**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          workers: [{ id: 'W1', type: 'physical', name: 'KS7lite2', stratumUrl: 'stratum+tcp://perennia.io:3333', walletWorker: 'kaspa:test.KS7lite2', hashRate: 4.02, isOnline: true, hardwareType: 'IceRiver KS7 Lite', sharesContributed: 119495600, validShares: 119495600, rejectedShares: 0, acceptancePct: 100, blocksFound: 1842 }],
          sectors: []
        })
      });
    } else { await route.continue(); }
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByTestId('enter-nexus-btn').click();

  // 1. Verify zero Tangem trial button in WalletModal & Import Wallet in Fingerprint-only mode
  await expect(page.getByTestId('wallet-tangem-btn')).toHaveCount(0);
  await page.locator('button', { hasText: /Import|Restore/i }).first().click();
  await page.getByTestId('setup-mode-fingerprint').click();
  const pwInputs = page.locator('input[type="password"]');
  await pwInputs.nth(0).fill('ComplicatedVaultPass#2026!');
  await pwInputs.nth(1).fill('ComplicatedVaultPass#2026!');
  await page.locator('textarea').first().fill(TEST_SEED);
  await page.locator('button', { hasText: /Import|Restore|Secure/i }).last().click();

  // 2. Verify Settings Gear is positioned strictly to the RIGHT of Wallet pill in header
  const gearBtn = page.getByTestId('header-settings-btn');
  const walletPill = page.locator('header').locator('button', { hasText: /kaspa:|0x|Wallet/i }).last();
  const gearBox = await gearBtn.boundingBox();
  const walletBox = await walletPill.boundingBox();
  expect(gearBox && walletBox && gearBox.x > walletBox.x + walletBox.width - 2).toBe(true);

  // 3. Verify Worker Blocks (1,842) and Shares (119.50M) do NOT overlap
  const blocksCol = page.getByTestId('worker-col-blocks').first();
  const sharesCol = page.getByTestId('worker-col-shares').first();
  await expect(sharesCol).toContainText('119.50M');
  const bBox = await blocksCol.boundingBox();
  const sBox = await sharesCol.boundingBox();
  expect(bBox && sBox && bBox.x + bBox.width <= sBox.x).toBe(true);

  // 4. Verify Trade Buy / Sell tab works & Wallet has zero Tangem bar
  await page.getByTestId('header-nav-DEX').click();
  await page.getByTestId('dex-mode-fiat-btn').click();
  await expect(page.getByTestId('fiat-bridge-panel')).toBeVisible();
  await page.getByTestId('header-treasury-btn').click();
  await expect(page.getByTestId('treasury-tangem-bar')).toHaveCount(0);

  // 5. Reload -> Verify Fingerprint-Only mode hides password field & unlocks in 1 tap!
  await page.reload();
  const enterBtn = page.getByTestId('enter-nexus-btn');
  if (await enterBtn.isVisible().catch(() => false)) await enterBtn.click();
  const bioUnlockBtn = page.getByTestId('biometric-unlock-btn');
  if (!(await bioUnlockBtn.isVisible().catch(() => false))) {
    await page.getByTestId('header-unlock-vault-btn').click();
  }
  await expect(bioUnlockBtn).toBeVisible();
  await expect(page.getByTestId('vault-unlock-password-input')).toHaveCount(0);
  await bioUnlockBtn.click();
  await expect(bioUnlockBtn).toBeHidden({ timeout: 10000 });

  // 6. Open Settings (⚙) -> Switch mode to BOTH -> Reload -> Verify BOTH Password + Fingerprint required
  await page.getByTestId('header-settings-btn').click();
  await expect(page.getByTestId('settings-vault-auth-section')).toBeVisible();
  await page.getByTestId('settings-auth-mode-both').click();
  await expect(page.getByTestId('settings-auth-feedback')).toContainText('Both');
  await page.reload();
  if (await enterBtn.isVisible().catch(() => false)) await enterBtn.click();
  if (!(await page.getByTestId('unlock-both-mode-badge').isVisible().catch(() => false))) {
    await page.getByTestId('header-unlock-vault-btn').click();
  }
  await expect(page.getByTestId('unlock-both-mode-badge')).toBeVisible();
  await page.getByTestId('vault-unlock-password-input').fill('ComplicatedVaultPass#2026!');
  await page.getByTestId('vault-unlock-submit-btn').click();
  await expect(page.getByTestId('unlock-both-mode-badge')).toBeHidden({ timeout: 10000 });

  // 7. Open Settings (⚙) -> Switch mode to PASSWORD -> Reload -> Verify Password-only
  await page.getByTestId('header-settings-btn').click();
  await page.getByTestId('settings-auth-mode-password').click();
  await page.reload();
  if (await enterBtn.isVisible().catch(() => false)) await enterBtn.click();
  if (!(await page.getByTestId('vault-unlock-password-input').isVisible().catch(() => false))) {
    await page.getByTestId('header-unlock-vault-btn').click();
  }
  await expect(page.getByTestId('biometric-unlock-btn')).toHaveCount(0);
  await expect(page.getByTestId('vault-unlock-password-input')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
