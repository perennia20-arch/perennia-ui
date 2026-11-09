// WINDOWS (FRONTEND): C:\Users\send2\perennia-v5\perennia-frontend\tests\e2e\phase1-to-3-verification.spec.ts
import { test, expect, type Page } from '@playwright/test';

async function enterPlatformWorkspace(page: Page) {
    await page.goto('/', { waitUntil: 'networkidle' });

    const headerSettingsBtn = page.getByTestId('header-settings-btn');
    const enterBtn = page.getByRole('button', {
        name: /Enter Nexus|ENTER|LAUNCH/i
    });

    // Retry clicking "Enter Nexus" until Svelte hydration transitions into the workspace
    await expect(async () => {
        if (await enterBtn.isVisible()) {
            await enterBtn.click();
        }
        await expect(headerSettingsBtn).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15000 });

    // Dismiss Sovereign Matrix Vault modal ("Return to Operations Deck") if open
    const walletDialog = page.getByRole('dialog');
    if (await walletDialog.isVisible().catch(() => false)) {
        const closeWalletBtn = walletDialog
            .getByRole('button', {
                name: /Return to Operations Deck|Close|✕/i
            })
            .first();
        await closeWalletBtn.click();
        await expect(walletDialog).toBeHidden();
    }

    // Dismiss initial Tutorial Prompt if open
    const tutorialPrompt = page.getByTestId('tutorial-launch-modal');
    if (await tutorialPrompt.isVisible().catch(() => false)) {
        const skipTutorialBtn = tutorialPrompt
            .getByRole('button', { name: /Skip for Now|✕/i })
            .first();
        await skipTutorialBtn.click();
        await expect(tutorialPrompt).toBeHidden();
    }
}

test.describe('Phase 1–3: Live FX, 8-Language i18n, 7-Chapter Tour & Mainnet Readiness', () => {
    test('1. /api/prices/fx returns live or cached FX rates for all 9 supported currencies', async ({
        request
    }) => {
        const res = await request.get('/api/prices/fx');
        expect(res.status()).toBe(200);

        const data = await res.json();
        expect(data.success).toBe(true);
        expect(data.base).toBe('USD');
        expect(data.rates).toBeDefined();

        const expectedCurrencies = [
            'USD',
            'EUR',
            'GBP',
            'CAD',
            'AUD',
            'CHF',
            'JPY',
            'MXN',
            'BRL'
        ];
        for (const code of expectedCurrencies) {
            expect(typeof data.rates[code]).toBe('number');
            expect(data.rates[code]).toBeGreaterThan(0);
        }
        expect(data.rates.USD).toBe(1);
    });

    test('2. /api/health/readiness audits infrastructure, oracles, L1 airlock, and fiat gateways', async ({
        request
    }) => {
        const res = await request.post('/api/health/readiness');
        expect(res.status()).toBe(200);

        const report = await res.json();
        expect(report.success).toBe(true);
        expect(report.summary).toBeDefined();
        expect(report.summary.totalChecks).toBeGreaterThanOrEqual(8);
        expect(Array.isArray(report.checks)).toBe(true);

        const checkIds = report.checks.map((c: any) => c.id);
        expect(checkIds).toContain('postgres_wal');
        expect(checkIds).toContain('redis_cluster');
        expect(checkIds).toContain('rust_stratum_engine');
        expect(checkIds).toContain('kaspad_dag_consensus');
        expect(checkIds).toContain('spot_and_rwa_oracle');
        expect(checkIds).toContain('fx_currency_oracle');
        expect(checkIds).toContain('ledger_hmac_guard');
        expect(checkIds).toContain('hot_kas_l1_signer');
        expect(checkIds).toContain('stripe_fiat_onramp');
        expect(checkIds).toContain('bridge_wire_rail');
        expect(checkIds).toContain('changenow_v2_dropship');
    });

    test('3. Settings Modal switches across 8 languages, 9 FX currencies, and launches the 7-Chapter Tour', async ({
        page
    }) => {
        await enterPlatformWorkspace(page);

        await page.getByTestId('header-settings-btn').click();
        const settingsModal = page.getByTestId('settings-modal-card');
        await expect(settingsModal).toBeVisible();
        await expect(page.getByTestId('settings-guide-section')).toBeVisible();

        // Switch Language to Spanish (ES) and verify reactive header translation
        await page.getByTestId('settings-locale-btn-ES').click();
        await expect(page.getByTestId('header-nav-OPERATIONS')).toContainText(
            'OPERACIONES'
        );

        // Switch Language to German (DE) and verify reactive header translation
        await page.getByTestId('settings-locale-btn-DE').click();
        await expect(page.getByTestId('header-nav-OPERATIONS')).toContainText(
            'BETRIEB'
        );

        // Restore English (EN)
        await page.getByTestId('settings-locale-btn-EN').click();
        await expect(page.getByTestId('header-nav-OPERATIONS')).toContainText(
            'OPERATIONS'
        );

        // Switch Display Currency to EUR and verify live FX rate badge & Treasury symbol
        await page.getByTestId('settings-currency-btn-EUR').click();
        await expect(page.getByTestId('settings-fx-rate-badge')).toContainText(
            'EUR'
        );
        await expect(page.getByTestId('header-treasury-btn')).toContainText('€');

        // Restore USD
        await page.getByTestId('settings-currency-btn-USD').click();
        await expect(page.getByTestId('settings-fx-rate-badge')).toContainText(
            'USD'
        );

        // Launch Interactive Tour directly from Settings Modal
        await page.getByTestId('settings-launch-tour-btn').click();
        const floatingCard = page.getByTestId('tutorial-floating-card');
        await expect(floatingCard).toBeVisible();
        await expect(floatingCard).toContainText('Wallet • Step 1 of 9');

        // Exit Tour cleanly
        await page.getByTestId('tutorial-exit-btn').click();
        await expect(floatingCard).toBeHidden();
    });
});