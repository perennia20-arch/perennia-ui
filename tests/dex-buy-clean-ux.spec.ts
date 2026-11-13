import { test, expect } from '@playwright/test';
test('Mine Payout Splits, Liquidity tab, Slippage-only gear, and clean Buy/Sell', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.route('**/api/dex/lp**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [{ tickerA: 'KAS', tickerB: 'USDC', kas_amount: '250.50', token_amount: '40.12', usd_value: '80.24', isLocked: false }] }) });
    } else { await route.continue(); }
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByTestId('enter-nexus-btn').click();
  await page.getByTestId('wallet-watch-only-btn').click();
  await page.getByTestId('watch-only-address-input').fill('kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e');
  await page.getByTestId('watch-only-connect-btn').click();
  await expect(page.locator('main')).toContainText('Payout Splits');
  await page.getByTestId('header-nav-DEX').click();
  await page.getByTestId('dex-settings-btn').click();
  const slipModal = page.getByTestId('dex-slippage-modal');
  await expect(slipModal).toBeVisible();
  await expect(slipModal).not.toContainText('Liquidity Sources');
  await expect(slipModal).not.toContainText('Oracle');
  await page.getByTestId('slippage-pill-0.1').click();
  await expect(slipModal).toBeHidden();
  await page.getByTestId('dex-mode-lp-btn').click();
  await expect(page.getByTestId('dex-supply-lp-btn')).toBeVisible();
  await expect(page.getByTestId('swap-view')).toContainText('Your Pools');
  await page.getByTestId('dex-mode-fiat-btn').click();
  const swapView = page.getByTestId('swap-view');
  await expect(swapView).not.toContainText('MoonPay');
  await expect(swapView).not.toContainText('Coinbase');
  await expect(swapView).not.toContainText('Gross-Up');
  await expect(swapView).not.toContainText('Mercury');
  await page.getByTestId('header-nav-OPERATIONS').click();
  await expect(page.locator('main')).toContainText('Payout Splits');
  await page.locator('header button', { hasText: /^Buy$/i }).first().click();
  const buyModal = page.getByTestId('global-fiat-modal');
  await expect(buyModal).toBeVisible();
  await expect(buyModal).not.toContainText('MoonPay');
  await expect(buyModal).not.toContainText('Coinbase');
  await expect(buyModal).not.toContainText('Mercury');
  expect(pageErrors).toEqual([]);
});
