import { test, expect } from '@playwright/test';
test('Clean Swap, Providers modal, crash-proof Liquidity, Mine countdown, and simple Buy modal', async ({ page }) => {
  await page.route('**/api/dex/lp**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [{ id: 'lp-1', tickerA: 'KAS', tickerB: 'USDC', kas_amount: '250.50', token_amount: '40.12', usd_value: '80.24', isLocked: false }] }) });
    } else { await route.continue(); }
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByTestId('enter-nexus-btn').click();
  await page.getByTestId('wallet-watch-only-btn').click();
  await page.getByTestId('watch-only-address-input').fill('kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e');
  await page.getByTestId('watch-only-connect-btn').click();
  await expect(page.locator('header')).toContainText('MINE • BUY • TRADE');
  await expect(page.locator('header')).not.toContainText('DAG NODE ONLINE');
  await expect(page.locator('main')).not.toContainText('22:00');
  await expect(page.locator('main')).not.toContainText('CST');
  await page.getByTestId('header-nav-DEX').click();
  await expect(page.getByTestId('dex-quote-summary-toggle')).toBeHidden();
  await expect(page.locator('[data-testid="swap-view"]')).not.toContainText('Wholesale Floor');
  await page.getByTestId('dex-settings-btn').click();
  await expect(page.getByTestId('dex-providers-modal')).toBeVisible();
  await page.getByTestId('provider-toggle-p2pBook').click();
  await page.getByTestId('slippage-pill-0.1').click();
  await page.getByTestId('close-dex-providers-btn').click();
  await page.getByTestId('dex-mode-lp-btn').click();
  await expect(page.getByTestId('dex-supply-lp-btn')).toBeVisible();
  await page.locator('header button', { hasText: /^Buy$/i }).first().click();
  await expect(page.getByTestId('global-fiat-modal')).toBeVisible();
  await expect(page.getByTestId('global-fiat-quick-tokens')).toBeVisible();
  await expect(page.getByTestId('global-fiat-modal')).not.toContainText('Routing #');
});
