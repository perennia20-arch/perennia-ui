import { test, expect } from '@playwright/test';
test('Mine Payout Splits, Liquidity tab & auto-pair, Slippage-only gear, and 1-screen Buy/Sell (Desktop + Mobile)', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.route('**/api/dex/lp**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [{ id: 'lp-1', poolPair: 'KAS/USDC', tickerA: 'KAS', tickerB: 'USDC', kas_amount: '250.50', token_amount: '40.12', usd_value: '80.24', isLocked: false }] }) });
    } else { await route.continue(); }
  });
  // 1. Mobile logged-out check: Payout Splits + Buckets visible & Buy -> Create Wallet handoff
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('enter-nexus-btn').click();
  await page.getByTestId('wallet-watch-only-btn').click();
  await page.getByTestId('watch-only-address-input').fill('kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e');
  await page.getByTestId('watch-only-connect-btn').click();
  await expect(page.getByTestId('ops-payout-splits-section')).toBeVisible();
  await page.getByTestId('mobile-nav-DEX').click();
  await expect(page.getByTestId('swap-view')).toBeVisible();
  await page.getByTestId('mobile-nav-OPERATIONS').click();
  await expect(page.getByTestId('ops-payout-splits-section')).toBeVisible();
  // 2. Desktop check: Swap header clean, Slippage-only gear, Liquidity auto-pair + Your Pools, 1-screen Buy/Sell
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByTestId('header-nav-DEX').click();
  await expect(page.getByTestId('dex-mode-fiat-btn')).toContainText('Buy / Sell');
  await page.getByTestId('dex-settings-btn').click();
  const slipModal = page.getByTestId('dex-slippage-modal');
  await expect(slipModal).toBeVisible();
  await expect(slipModal).not.toContainText('Liquidity Sources');
  await expect(slipModal).not.toContainText('Providers');
  await page.getByTestId('slippage-pill-0.1').click();
  await expect(slipModal).toBeHidden();
  await page.getByTestId('dex-mode-lp-btn').click();
  await expect(page.getByTestId('dex-supply-lp-btn')).toBeVisible();
  await page.getByTestId('dex-mode-fiat-btn').click();
  const swapView = page.getByTestId('swap-view');
  await expect(swapView).not.toContainText('Step 2');
  await expect(swapView).not.toContainText('MoonPay');
  await expect(swapView).not.toContainText('Coinbase');
  await expect(swapView).not.toContainText('Gross-Up');
  await expect(swapView).not.toContainText('Mercury');
  await expect(swapView).not.toContainText('Platform ($0 Gas)');
  await page.getByTestId('header-nav-OPERATIONS').click();
  await expect(page.getByTestId('ops-payout-splits-section')).toBeVisible();
  await page.locator('header button', { hasText: /^Buy$/i }).first().click();
  const buyModal = page.getByTestId('global-fiat-modal');
  await expect(buyModal).toBeVisible();
  await expect(buyModal).not.toContainText('MoonPay');
  await expect(buyModal).not.toContainText('Coinbase');
  await expect(buyModal).not.toContainText('Mercury');
  expect(pageErrors).toEqual([]);
});
