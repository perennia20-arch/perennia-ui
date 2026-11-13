import { test, expect } from '@playwright/test';

const VALID_KAS = 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e';
const TEST_SEED = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

test('Trade Buy/Sell Fiat tab, Thumbprint/Face ID login, and Tangem hardware integration', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.addInitScript(() => { (window as any).__perenniaMockBiometrics = true; });
  await page.route('**/api/auth/challenge', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'perennia-biometric-auth-nonce' }) });
  });
  await page.route('**/api/auth', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByTestId('enter-nexus-btn').click();

  // 1. Pair Tangem Card & Log In Cold Mode from WalletModal
  await page.getByTestId('wallet-tangem-btn').click();
  await page.getByTestId('tangem-kaspa-input').fill(VALID_KAS);
  await page.getByTestId('tangem-connect-cold-btn').click();

  // 2. Verify Mine -> Payout Splits 1-tap Use Tangem fills payout address
  await page.getByTestId('ops-new-split-btn').click();
  const useTangemBtn = page.getByTestId('split-use-tangem-btn');
  await expect(useTangemBtn).toBeVisible();
  await useTangemBtn.click();
  await expect(useTangemBtn).toContainText('✓ Tangem');
  await page.keyboard.press('Escape');

  // 3. Verify Trade -> Buy / Sell (Fiat) tab mounts & updates live without errors
  await page.getByTestId('header-nav-DEX').click();
  const fiatTabBtn = page.getByTestId('dex-mode-fiat-btn');
  await expect(fiatTabBtn).toContainText('Buy / Sell');
  await fiatTabBtn.click();
  await expect(page.getByTestId('fiat-bridge-panel')).toBeVisible();
  const usdInput = page.getByTestId('fiat-onramp-usd-input');
  await expect(usdInput).toBeVisible();
  await usdInput.fill('250');
  await expect(page.getByTestId('fiat-onramp-fee-breakdown')).toBeVisible();
  await expect(page.getByTestId('fiat-generate-pass-cta')).toBeVisible();
  await page.getByTestId('fiat-offramp-tab-btn').click();
  await expect(page.getByTestId('fiat-bridge-panel')).toBeVisible();

  // 4. Verify Wallet -> Tangem Cold Card bar & Auto-Sweep
  await page.getByTestId('header-treasury-btn').click();
  await expect(page.getByTestId('treasury-tangem-bar')).toBeVisible();
  await page.getByTestId('tangem-sweep-10000').click();

  // 5. Import Sovereign Vault with Biometrics enabled, lock session, then Log In via Thumbprint!
  await page.getByTestId('treasury-tangem-card-btn').click();
  await page.locator('button', { hasText: '← Back' }).click();
  await page.locator('button', { hasText: /Import|Restore/i }).first().click();
  const pwInputs = page.locator('input[type="password"]');
  await pwInputs.nth(0).fill('SovereignPass123!');
  await pwInputs.nth(1).fill('SovereignPass123!');
  await page.locator('textarea').first().fill(TEST_SEED);
  await page.locator('button', { hasText: /Import|Restore|Secure/i }).last().click();
  await expect(page.getByTestId('treasury-tangem-bar')).toBeVisible();
  // Simulate returning session (reload clears in-memory session while keeping encrypted vault + IndexedDB bio key)
  await page.reload();
  const enterBtn = page.getByTestId('enter-nexus-btn');
  if (await enterBtn.isVisible().catch(() => false)) await enterBtn.click();
  const bioBtn = page.getByTestId('biometric-unlock-btn');
  if (!(await bioBtn.isVisible().catch(() => false))) {
    await page.locator('header button', { hasText: /Log In|Unlock|Wallet|Connect/i }).first().click();
  }
  await expect(bioBtn).toBeVisible();
  await bioBtn.click();
  await expect(bioBtn).toBeHidden({ timeout: 10000 });
  expect(pageErrors).toEqual([]);
});
