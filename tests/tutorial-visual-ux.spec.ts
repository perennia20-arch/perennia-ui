import { test, expect } from '@playwright/test';
test('Tutorial spotlight features live UI without covering mobile or desktop screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await page.getByTestId('enter-nexus-btn').click();
  await page.getByTestId('wallet-modal-tour-launch-btn').click();
  const card = page.getByTestId('tutorial-floating-card'), spot = page.getByTestId('tutorial-spotlight-cutout');
  for (const ch of [1, 2, 3, 4, 5, 6, 7]) {
    if (ch > 1) await card.getByRole('button', { name: ch === 2 ? 'SILO' : ch === 3 ? 'Workers' : ch === 4 ? 'Sectors' : ch === 5 ? 'Exchange' : ch === 6 ? 'Treasury' : 'Tax' }).click();
    await expect(spot).toBeVisible(); await expect(card).toBeVisible();
    const cb = await card.boundingBox(), sb = await spot.boundingBox();
    expect((cb?.height || 999) < 235).toBeTruthy(); expect((sb?.width || 0) >= 24).toBeTruthy();
  }
  await page.setViewportSize({ width: 1600, height: 1000 }); await page.waitForTimeout(250);
  await expect(spot).toBeVisible();
});
