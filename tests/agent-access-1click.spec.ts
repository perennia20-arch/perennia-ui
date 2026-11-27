import { test, expect } from '@playwright/test';

const TEST_SEED =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

interface MockMandate {
    keyId: string;
    mode: string;
    label: string;
    whitelistedAssets: string[];
    allowSwaps: boolean;
    allowBucketUpdates: boolean;
    scopes: string[];
    maxSlippageBps: number;
    cap24hSompi: string;
    cap24hUsdMicros: string;
    spent24hSompi: string;
    spent24hUsdMicros: string;
    isRevoked: boolean;
    isExpired: boolean;
}

function makeFakeMandateToken(keyId: string, claimsObj: Record<string, unknown>): string {
    const b64 = Buffer.from(JSON.stringify({ keyId, ...claimsObj }), 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    const mac = 'a'.repeat(64);
    return `per_md_v1.${b64}.${mac}`;
}

test('AgentAccessCard 1-click noun-verb grid, HTTP clipboard fallback, /llms.txt, REVOKE, and KILL ALL', async ({
    page,
    context
}) => {
    const pageErrors: string[] = [];
    const dialogMessages: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('dialog', (dialog) => {
        dialogMessages.push(dialog.message());
        dialog.dismiss().catch(() => null);
    });

    await page.addInitScript(() => {
        (window as any).__perenniaMockBiometrics = true;
        (window as any).__copiedLog = [] as string[];

        // Simulate insecure HTTP origin where navigator.clipboard is unavailable
        Object.defineProperty(navigator, 'clipboard', {
            value: undefined,
            configurable: true
        });

        document.execCommand = ((cmd: string) => {
            if (cmd !== 'copy') return false;
            const active = document.activeElement as HTMLTextAreaElement | HTMLInputElement | null;
            const val = active?.value ?? '';
            if (!val) return false;
            (window as any).__copiedLog.push(val);
            return true;
        }) as typeof document.execCommand;
    });

    let seq = 0;
    let mandatesStore: MockMandate[] = [];
    const postPayloads: Array<Record<string, unknown>> = [];

    await page.route('**/api/auth/challenge', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'perennia-agent-e2e-nonce' })
        });
    });

    await page.route('**/api/auth', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true })
        });
    });

    await page.route('**/api/state**', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    workers: [],
                    sectors: [],
                    oracleOnline: true,
                    kasOracleUsdE8: '5000000'
                })
            });
        } else {
            await route.continue();
        }
    });

    await page.route('**/api/agent/mandates', async (route) => {
        const method = route.request().method().toUpperCase();
        if (method === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    ok: true,
                    mandates: mandatesStore,
                    liveFills: [],
                    dryRunLogs: []
                })
            });
            return;
        }

        if (method === 'POST') {
            const body = JSON.parse(route.request().postData() || '{}') as Record<string, unknown>;
            postPayloads.push(body);
            seq += 1;
            const keyId = `mdk_test_${seq}`;
            const scopes = Array.isArray(body.scopes) ? (body.scopes as string[]) : ['READ'];
            const assets = Array.isArray(body.whitelistedAssets)
                ? (body.whitelistedAssets as string[])
                : ['KAS'];
            const capUsd = String(body.cap24hUsdMicros ?? '0');
            const capSompi = String(body.cap24hSompi ?? '1');
            const slippageBps = Number(body.maxSlippageBps ?? 50);
            const label = String(body.label ?? `Bot ${seq}`);
            const hasSpend = scopes.some((s) => s === 'SWAP' || s === 'PAIR' || s === 'BOOST');
            const token = makeFakeMandateToken(keyId, {
                scopes,
                allowSwaps: hasSpend,
                allowBucketUpdates: scopes.includes('SPLIT'),
                cap24hUsdMicros: hasSpend ? capUsd : '1'
            });
            const created: MockMandate = {
                keyId,
                mode: 'MODE_B',
                label,
                whitelistedAssets: assets,
                allowSwaps: hasSpend,
                allowBucketUpdates: scopes.includes('SPLIT'),
                scopes,
                maxSlippageBps: slippageBps,
                cap24hSompi: capSompi,
                cap24hUsdMicros: capUsd,
                spent24hSompi: '0',
                spent24hUsdMicros: '0',
                isRevoked: false,
                isExpired: false
            };
            mandatesStore = [created, ...mandatesStore];
            await route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify({
                    ok: true,
                    secretDisplayedOnce: true,
                    agentKey: token,
                    mandate: created
                })
            });
            return;
        }

        if (method === 'DELETE') {
            const body = JSON.parse(route.request().postData() || '{}') as Record<string, unknown>;
            if (body.revokeAllForWallet) {
                const revoked = mandatesStore.map((m) => m.keyId);
                mandatesStore = [];
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true, revokedKeyIds: revoked })
                });
                return;
            }
            const targetId = String(body.keyId || '');
            mandatesStore = mandatesStore.filter((m) => m.keyId !== targetId);
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ok: true, revokedKeyIds: [targetId] })
            });
            return;
        }

        await route.continue();
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByTestId('enter-nexus-btn').click();
    await page.locator('button', { hasText: /Import|Restore/i }).first().click();
    const pwInputs = page.locator('input[type="password"]');
    await pwInputs.nth(0).fill('ComplicatedVaultPass#2026!');
    await pwInputs.nth(1).fill('ComplicatedVaultPass#2026!');
    await page.locator('textarea').first().fill(TEST_SEED);
    await page.locator('button', { hasText: /Import|Restore|Secure/i }).last().click();

    // Open AGENTS modal
    await page.getByTestId('header-agents-btn').click();
    const modal = page.getByTestId('agent-modal');
    await expect(modal).toBeVisible();

    // Clutter & tooltip discipline checks
    await expect(modal).not.toContainText('VAULT SLEEVE');
    await expect(modal).not.toContainText('Re-Verify Gateway');
    await expect(modal).not.toContainText('MCP Setup');
    await expect(modal).not.toContainText('per_md_v1');
    expect(await modal.locator('[title]').count()).toBe(0);
    await expect(page.getByTestId('agent-footer-llms-btn')).toBeVisible();
    await expect(modal).toContainText('COLD VAULT LOCKED');

    // Capability pills: toggling SWAP off -> READ + SPLIT only auto-sets/dims DAILY ($) to 0
    const limitInput = page.getByTestId('agent-limit-input');
    await expect(limitInput).toBeEnabled();
    await expect(limitInput).toHaveValue('100');

    await page.getByTestId('agent-scope-SWAP').click();
    await expect(limitInput).toBeDisabled();
    await expect(limitInput).toHaveValue('0');

    await page.getByTestId('agent-scope-SPLIT').click();
    await expect(limitInput).toBeDisabled();
    await expect(limitInput).toHaveValue('0');

    // Enable PAIR + BOOST + SWAP -> DAILY ($) restores 100 and becomes editable
    await page.getByTestId('agent-scope-PAIR').click();
    await expect(limitInput).toBeEnabled();
    await expect(limitInput).toHaveValue('100');
    await page.getByTestId('agent-scope-BOOST').click();
    await page.getByTestId('agent-scope-SWAP').click();
    await limitInput.fill('250');

    // SLIP pills: 0.5% | 1.0% | 2.0%
    await page.getByTestId('agent-slip-200').click();
    await expect(page.getByTestId('agent-slip-200')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('agent-slip-50').click();
    await expect(page.getByTestId('agent-slip-50')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('agent-slip-100').click();
    await expect(page.getByTestId('agent-slip-100')).toHaveAttribute('aria-pressed', 'true');

    // ASSETS: ALL toggle + custom '+' ticker input
    await page.getByTestId('agent-asset-ALL').click();
    for (const tick of ['KAS', 'USDC', 'USDT', 'SILO', 'BTC', 'ETH', 'SOL']) {
        await expect(page.getByTestId(`agent-asset-${tick}`)).toHaveAttribute(
            'aria-pressed',
            'true'
        );
    }
    await page.getByTestId('agent-asset-ALL').click();
    await expect(page.getByTestId('agent-asset-KAS')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('agent-asset-USDC')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('agent-asset-USDC').click();

    const customInput = page.getByTestId('agent-custom-ticker-input');
    await page.getByTestId('agent-custom-ticker-add-btn').click();
    await expect(customInput).toBeFocused();
    await customInput.fill('nacho');
    await page.getByTestId('agent-custom-ticker-add-btn').click();
    await expect(page.getByTestId('agent-asset-NACHO')).toBeVisible();

    await customInput.fill('perx');
    await customInput.press('Enter');
    await expect(page.getByTestId('agent-asset-PERX')).toBeVisible();
    await page.getByTestId('agent-asset-PERX').click();
    await expect(page.getByTestId('agent-asset-PERX')).toHaveCount(0);

    // CREATE Bot 1
    await page.getByTestId('agent-create-btn').click();
    const readyCard = page.getByTestId('agent-ready-card');
    await expect(readyCard).toBeVisible();
    await expect(modal).not.toContainText('per_md_v1');
    await expect(page.getByTestId('agent-footer-llms-btn')).toHaveCount(0);
    await expect(page.getByTestId('agent-active-badge')).toHaveText('1 ACTIVE');

    expect(postPayloads[0]).toMatchObject({
        label: 'Bot 1',
        scopes: ['READ', 'SWAP', 'PAIR', 'BOOST'],
        maxSlippageBps: 100,
        whitelistedAssets: ['KAS', 'USDC', 'NACHO'],
        cap24hUsdMicros: '250000000'
    });

    const row1 = page.getByTestId('agent-key-row-mdk_test_1');
    await expect(row1).toBeVisible();
    await expect(page.getByTestId('agent-key-summary-mdk_test_1')).toContainText(
        'BOT 1 · $0/$250 · READ · SWAP · PAIR · BOOST · KAS, USDC, NACHO'
    );

    // Ensure ACTIVE row fits cleanly inside the modal viewport without clipping off-screen
    const row1Box = await row1.boundingBox();
    expect(Boolean(row1Box && row1Box.y + row1Box.height <= 900)).toBe(true);

    // Clipboard tests under insecure HTTP context fallback
    await page.getByTestId('agent-copy-ai-btn').click();
    await expect(page.getByTestId('agent-copy-ai-btn')).toContainText('✓');
    await page.getByTestId('agent-copy-mcp-btn').click();
    await expect(page.getByTestId('agent-copy-mcp-btn')).toContainText('✓');
    await page.getByTestId('agent-copy-key-btn').click();
    await expect(page.getByTestId('agent-copy-key-btn')).toContainText('✓');

    const copiedLog = await page.evaluate(() => (window as any).__copiedLog as string[]);
    expect(copiedLog).toHaveLength(3);
    const [aiText, mcpText, rawKeyText] = copiedLog;
    expect(rawKeyText).toMatch(/^per_md_v1\./);
    expect(aiText).toContain(rawKeyText);
    expect(aiText).toContain('READ, SWAP, PAIR, BOOST');
    expect(aiText).toContain('$250');
    expect(aiText).toContain('1.0%');
    expect(aiText).toContain('KAS, USDC, NACHO');
    expect(aiText).toContain('https://perennia.io/llms.txt');
    expect(aiText).toContain('/api/v1/agent/mcp');
    expect(aiText).toContain('/api/v1/agent/me/telemetry');

    const parsedMcp = JSON.parse(mcpText);
    expect(parsedMcp?.mcpServers?.perennia?.headers?.Authorization).toBe(`Bearer ${rawKeyText}`);

    // LLMS.TXT ↗ opens /llms.txt in a new tab
    const [llmsPage] = await Promise.all([
        context.waitForEvent('page'),
        page.getByTestId('agent-ready-llms-btn').click()
    ]);
    await llmsPage.waitForLoadState('domcontentloaded');
    expect(llmsPage.url()).toMatch(/\/llms\.txt$/);
    const llmsBody = await llmsPage.locator('body').innerText();
    expect(llmsBody).toContain('# Perennia');
    expect(llmsBody).toContain('/api/v1/agent/mcp');
    await llmsPage.close();

    // DONE hides READY card & restores footer LLMS.TXT ↗
    await page.getByTestId('agent-ready-done-btn').click();
    await expect(readyCard).toHaveCount(0);
    await expect(page.getByTestId('agent-footer-llms-btn')).toBeVisible();

    // Create Bot 2 (READ + SPLIT only, DAILY auto-0, SLIP 2.0%)
    await page.getByTestId('agent-scope-SWAP').click();
    await page.getByTestId('agent-scope-PAIR').click();
    await page.getByTestId('agent-scope-BOOST').click();
    await page.getByTestId('agent-scope-SPLIT').click();
    await expect(limitInput).toBeDisabled();
    await expect(limitInput).toHaveValue('0');
    await page.getByTestId('agent-slip-200').click();
    await page.getByTestId('agent-create-btn').click();

    await expect(page.getByTestId('agent-active-badge')).toHaveText('2 ACTIVE');
    await expect(page.getByTestId('agent-key-summary-mdk_test_2')).toContainText(
        'BOT 2 · $0/$0 · READ · SPLIT · KAS, USDC, NACHO'
    );
    expect(postPayloads[1]).toMatchObject({
        label: 'Bot 2',
        scopes: ['READ', 'SPLIT'],
        maxSlippageBps: 200,
        cap24hUsdMicros: '0'
    });

    // REVOKE Bot 1 without any window.confirm
    await page.getByTestId('agent-revoke-mdk_test_1').click();
    await expect(page.getByTestId('agent-key-row-mdk_test_1')).toHaveCount(0);
    await expect(page.getByTestId('agent-active-badge')).toHaveText('1 ACTIVE');

    // Create Bot 3 then KILL ALL
    await page.getByTestId('agent-create-btn').click();
    await expect(page.getByTestId('agent-active-badge')).toHaveText('2 ACTIVE');
    await page.getByTestId('agent-kill-all-btn').click();
    await expect(page.getByTestId('agent-active-badge')).toHaveCount(0);
    await expect(page.getByTestId('agent-active-list')).toHaveCount(0);

    expect(dialogMessages).toEqual([]);
    expect(pageErrors).toEqual([]);
});
