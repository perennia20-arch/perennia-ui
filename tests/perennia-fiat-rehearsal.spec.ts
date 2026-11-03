// tests/perennia-fiat-rehearsal.spec.ts
import { test, expect, type Page } from '@playwright/test';

const MASTER_TREASURY_WALLET =
    'kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579';

const MOCK_SANDBOX_VAULT_PAYLOAD = {
    version: 'perennia-vault-v4',
    exportedAt: '2026-10-31T18:00:00.000Z',
    wallets: {
        kaspa: { address: MASTER_TREASURY_WALLET },
        bitcoin: { address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' },
        ethereum: { address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
        solana: { address: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH' },
        doge: { address: 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L' },
        xrp: { address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh' },
        polygon: { address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
        avalanche: { address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F' },
        sui: {
            address:
                '0x0000000000000000000000000000000000000000000000000000000000000001'
        },
        tron: { address: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb' },
        zcash: { address: 't1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs' }
    },
    vault: 'U2FuZGJveFZhdWx0RW5jcnlwdGVkUGF5bG9hZA=='
};

async function bootstrapAuthenticatedSandboxSession(page: Page) {
    await page.addInitScript(
        ({ payload }) => {
            localStorage.setItem(
                'perennia_sovereign_payload',
                JSON.stringify(payload)
            );
            localStorage.setItem('perennia_tour_completed', 'true');
            localStorage.setItem('perennia_non_cpa_acknowledged_v1', 'true');
            sessionStorage.setItem('perennia_active_wallet_type', 'sovereign');
            sessionStorage.setItem('perennia_vault_unlocked', 'true');
        },
        { payload: MOCK_SANDBOX_VAULT_PAYLOAD }
    );

    await page.route('**/api/auth/me', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                authenticated: true,
                address: MASTER_TREASURY_WALLET
            })
        });
    });
}

test.describe('PERENNIA v1.0 — Two-Way Zero-Loss Fiat Rails & Full Ecosystem Rehearsal', () => {
    test('1. On-Ramp Cost-Plus API & 3-Step Funnel ($900 Basket, 0% Bundled USDC Waiver, $1,000 ACH & $2,500 Whale Wire)', async ({
        page,
        request
    }) => {
        // 1A. Verify Deterministic Cost-Plus API Quotes ($900 Instant Basket = $25 Total Fee, $8 Hard Cost, $17 Profit, $875 Net vs $43 Uphold)
        const kas500Res = await request.get(
            '/api/fiat/onramp?quoteAsset=KAS&amountUsd=500'
        );
        expect(
            kas500Res.ok(),
            `GET /api/fiat/onramp failed (${kas500Res.status()}): ${await kas500Res.text()}`
        ).toBeTruthy();
        const kas500Data = await kas500Res.json();
        expect(kas500Data.quote.feeUsd).toBe(10);
        expect(kas500Data.quote.hardCostUsd).toBe(1);
        expect(kas500Data.quote.guaranteedProfitUsd).toBe(9);
        expect(kas500Data.quote.netUsdConverted).toBe(490);
        expect(kas500Data.quote.competitorFeeUsd).toBe(17);
        expect(kas500Data.quote.guestSavingsUsd).toBe(7);

        const btc100Res = await request.get(
            '/api/fiat/onramp?quoteAsset=BTC&amountUsd=100'
        );
        const btc100Data = await btc100Res.json();
        expect(btc100Data.quote.feeUsd).toBe(7);
        expect(btc100Data.quote.hardCostUsd).toBe(4);
        expect(btc100Data.quote.guaranteedProfitUsd).toBe(3);
        expect(btc100Data.quote.netUsdConverted).toBe(93);
        expect(btc100Data.quote.competitorFeeUsd).toBe(9);

        const eth100Res = await request.get(
            '/api/fiat/onramp?quoteAsset=ETH&amountUsd=100'
        );
        const sol100Res = await request.get(
            '/api/fiat/onramp?quoteAsset=SOL&amountUsd=100'
        );
        const eth100Data = await eth100Res.json();
        const sol100Data = await sol100Res.json();
        expect(eth100Data.quote.feeUsd + sol100Data.quote.feeUsd).toBe(6);
        expect(
            eth100Data.quote.netUsdConverted + sol100Data.quote.netUsdConverted
        ).toBe(194);
        expect(
            eth100Data.quote.competitorFeeUsd +
                sol100Data.quote.competitorFeeUsd
        ).toBe(12);

        const usdc100Res = await request.get(
            '/api/fiat/onramp?quoteAsset=USDC&amountUsd=100'
        );
        const usdc100Data = await usdc100Res.json();
        expect(usdc100Data.quote.feeUsd).toBe(2);
        expect(usdc100Data.quote.netUsdConverted).toBe(98);
        expect(usdc100Data.quote.competitorFeeUsd).toBe(5);

        // Verify $900 Instant Basket Aggregate Totals
        const totalBasketFee =
            kas500Data.quote.feeUsd +
            btc100Data.quote.feeUsd +
            eth100Data.quote.feeUsd +
            sol100Data.quote.feeUsd +
            usdc100Data.quote.feeUsd;
        const totalBasketNet =
            kas500Data.quote.netUsdConverted +
            btc100Data.quote.netUsdConverted +
            eth100Data.quote.netUsdConverted +
            sol100Data.quote.netUsdConverted +
            usdc100Data.quote.netUsdConverted;
        const totalUpholdFee =
            kas500Data.quote.competitorFeeUsd +
            btc100Data.quote.competitorFeeUsd +
            eth100Data.quote.competitorFeeUsd +
            sol100Data.quote.competitorFeeUsd +
            usdc100Data.quote.competitorFeeUsd;
        expect(totalBasketFee).toBe(25);
        expect(totalBasketNet).toBe(875);
        expect(totalUpholdFee).toBe(43);

        // Verify 0% USDC Fee Waiver when bundled into a 1-click KAS/SILO auto-stake
        const bundledUsdcRes = await request.get(
            '/api/fiat/onramp?quoteAsset=USDC&amountUsd=500&bundledKasOrSilo=true'
        );
        const bundledUsdcData = await bundledUsdcRes.json();
        expect(bundledUsdcData.quote.feeUsd).toBe(0);
        expect(bundledUsdcData.quote.bundledUsdcFeeWaived).toBe(true);
        expect(bundledUsdcData.quote.netUsdConverted).toBe(500);

        // Verify $1,000 Post-Trade 4-Bucket USD Allocation (48.5% / 49.0% / 0.7% / 1.8%)
        const ach1000Res = await request.get(
            '/api/fiat/onramp?quoteAsset=KAS&amountUsd=1000'
        );
        const ach1000Data = await ach1000Res.json();
        expect(
            ach1000Data.postTradeAllocation.wholesaleApiFloatSweepUsd
        ).toBe(485);
        expect(
            ach1000Data.postTradeAllocation.chronosMinerSettlementUsd
        ).toBe(490);
        expect(
            ach1000Data.postTradeAllocation.llcTaxAndRailReserveUsd
        ).toBe(7);
        expect(
            ach1000Data.postTradeAllocation.netProfitAndRatchetUsd
        ).toBe(18);

        // Verify $2,500 Whale Wire ($15 Incoming Wire Fee Waived & >= $22 Net Profit)
        const whale2500Res = await request.get(
            '/api/fiat/onramp?quoteAsset=KAS&amountUsd=2500'
        );
        const whale2500Data = await whale2500Res.json();
        expect(whale2500Data.quote.whaleWireFeeWaived).toBe(true);
        expect(whale2500Data.quote.guaranteedProfitUsd).toBeGreaterThanOrEqual(
            22
        );

        // 1B. Walk Through the 3-Step On-Ramp UI Funnel
        await bootstrapAuthenticatedSandboxSession(page);
        await page.goto('/');
        await page.getByTestId('header-nav-DEX').click();
        await page.getByRole('button', { name: 'Fiat', exact: true }).click();

        const step1Card = page.getByTestId('fiat-step1-calculator-card');
        await expect(step1Card).toBeVisible();

        // Select $500 KAS Preset and verify competitor savings badge
        await page.getByTestId('fiat-preset-500').click();
        await page.getByTestId('fiat-asset-pill-KAS').click();
        await expect(
            page.getByTestId('fiat-competitor-savings-badge')
        ).toContainText(
            'You keep +$7.00 more than Uphold & Retail Exchange Apps.'
        );

        // Switch to $2,500+ Whale Wire preset
        await page.getByTestId('fiat-preset-2500').click();
        await page.getByTestId('fiat-lock-quote-cta').click();

        // Step 2: Select Direct to Self-Custody Wallet & Generate Settlement Pass
        await page.getByTestId('onramp-dest-self-custody-card').click();
        await page.getByTestId('fiat-generate-pass-cta').click();

        // Step 3: Verify Reserved Settlement Pass, Printable PDF Wire Slip & 4-Bucket Sweep
        const passCard = page.getByTestId('fiat-settlement-pass-card');
        await expect(passCard).toBeVisible();
        await expect(
            page.getByTestId('fiat-post-trade-sweep-card')
        ).toContainText('$1212.50');

        const downloadPromise = page.waitForEvent('download');
        await page.getByTestId('fiat-download-wire-slip-btn').click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toContain('Perennia_Wire_Slip_');

        // Trigger simulated ACH/Wire clearing webhook if order is awaiting receipt
        const simBtn = page.getByTestId('fiat-simulate-ach-clear-btn');
        if (await simBtn.isVisible()) {
            await simBtn.click();
        }
        await expect(passCard).toContainText('COMPLETED', {
            ignoreCase: true
        });
    });

    test('2. Off-Ramp Cost-Plus Tiers, Direct Wholesale API Deposit Address & Confirmation Lock', async ({
        page,
        request
    }) => {
        // 2A. Verify Off-Ramp Cost-Plus Tiers ($3,300 Volume = $47 Total Fee, $9 Hard Cost, $38 Net Profit vs $89 Retail)
        const kas500Res = await request.get(
            '/api/fiat/offramp?quoteAsset=KAS&amountUsd=500'
        );
        expect(
            kas500Res.ok(),
            `GET /api/fiat/offramp failed (${kas500Res.status()}): ${await kas500Res.text()}`
        ).toBeTruthy();
        const kas500Off = await kas500Res.json();
        expect(kas500Off.quote.feeUsd).toBe(9);
        expect(kas500Off.quote.netFiatPayout).toBe(491);
        expect(kas500Off.quote.competitorFeeUsd).toBe(15);
        expect(kas500Off.depositPreview.depositAddress).toBe(
            MASTER_TREASURY_WALLET
        );

        const btc100Off = await (
            await request.get('/api/fiat/offramp?quoteAsset=BTC&amountUsd=100')
        ).json();
        expect(btc100Off.quote.feeUsd).toBe(3);
        expect(btc100Off.quote.hardCostUsd).toBe(1);
        expect(btc100Off.quote.guaranteedProfitUsd).toBe(2);
        expect(btc100Off.quote.netFiatPayout).toBe(97);
        expect(btc100Off.quote.competitorFeeUsd).toBe(4);
        expect(btc100Off.depositPreview.depositAddress).toContain(
            'bc1qperenniawholesale'
        );

        const eth200Off = await (
            await request.get('/api/fiat/offramp?quoteAsset=ETH&amountUsd=200')
        ).json();
        expect(eth200Off.quote.feeUsd).toBe(5);
        expect(eth200Off.quote.hardCostUsd).toBe(2);
        expect(eth200Off.quote.guaranteedProfitUsd).toBe(3);
        expect(eth200Off.quote.netFiatPayout).toBe(195);
        expect(eth200Off.quote.competitorFeeUsd).toBe(7);

        const usdc1000Off = await (
            await request.get(
                '/api/fiat/offramp?quoteAsset=USDC&amountUsd=1000'
            )
        ).json();
        expect(usdc1000Off.quote.feeUsd).toBe(5);
        expect(usdc1000Off.quote.netFiatPayout).toBe(995);

        const whale2500Off = await (
            await request.get(
                '/api/fiat/offramp?quoteAsset=BTC&amountUsd=2500&payoutMethod=WIRE'
            )
        ).json();
        expect(whale2500Off.quote.feeUsd).toBe(30);
        expect(whale2500Off.quote.hardCostUsd).toBe(6);
        expect(whale2500Off.quote.guaranteedProfitUsd).toBe(24);
        expect(whale2500Off.quote.netFiatPayout).toBe(2470);
        expect(whale2500Off.quote.competitorFeeUsd).toBe(63);

        // Verify $3,300 Off-Ramp Basket ($500 KAS + $100 BTC + $200 ETH/SOL + $2,500 Whale Wire) = $47 Fee, $9 Hard Cost, $38 Profit vs $89 Retail
        const totalOfframpFee =
            kas500Off.quote.feeUsd +
            btc100Off.quote.feeUsd +
            eth200Off.quote.feeUsd +
            whale2500Off.quote.feeUsd;
        const totalOfframpHardCost = Math.round(
            kas500Off.quote.hardCostUsd +
                btc100Off.quote.hardCostUsd +
                eth200Off.quote.hardCostUsd +
                whale2500Off.quote.hardCostUsd
        );
        const totalOfframpProfit = Math.round(
            kas500Off.quote.guaranteedProfitUsd +
                btc100Off.quote.guaranteedProfitUsd +
                eth200Off.quote.guaranteedProfitUsd +
                whale2500Off.quote.guaranteedProfitUsd
        );
        const totalRetailOfframpCost =
            kas500Off.quote.competitorFeeUsd +
            btc100Off.quote.competitorFeeUsd +
            eth200Off.quote.competitorFeeUsd +
            whale2500Off.quote.competitorFeeUsd;

        expect(totalOfframpFee).toBe(47);
        expect(totalOfframpHardCost).toBe(9);
        expect(totalOfframpProfit).toBe(38);
        expect(totalRetailOfframpCost).toBe(89);

        // 2B. Walk Through the 3-Step Off-Ramp UI Funnel
        await bootstrapAuthenticatedSandboxSession(page);
        await page.goto('/');
        await page.getByTestId('header-nav-DEX').click();
        await page.getByRole('button', { name: 'Fiat', exact: true }).click();
        await page.getByTestId('fiat-offramp-tab-btn').click();

        await page.getByTestId('offramp-preset-100').click();
        await page.getByTestId('offramp-asset-pill-BTC').click();
        await expect(page.getByTestId('fiat-offramp-net-payout')).toContainText(
            '$97.00 USD'
        );
        await expect(
            page.getByTestId('fiat-offramp-savings-badge')
        ).toContainText(
            'You keep +$1.00 more than Uphold & Retail Exchange Apps.'
        );

        await page.getByTestId('fiat-offramp-lock-quote-cta').click();

        // Step 2: Verify Mod-10 ABA Checksum & Generate Off-Ramp Settlement Pass
        const abaInput = page.getByTestId('offramp-aba-input');
        if (await abaInput.isVisible()) {
            await abaInput.fill('111000614');
            await expect(page.getByTestId('aba-recognition-badge')).toContainText(
                'JPMorgan Chase Bank, N.A.'
            );
            await page.getByTestId('offramp-account-input').fill('8804921044');
        }

        await page.getByTestId('fiat-offramp-generate-pass-cta').click();

        // Step 3: Verify Direct Wholesale API Deposit Address & Confirmation Lock Progression
        const offrampPass = page.getByTestId(
            'fiat-offramp-settlement-pass-card'
        );
        await expect(offrampPass).toBeVisible();
        await expect(
            page.getByTestId('offramp-direct-deposit-address')
        ).toContainText('bc1qperenniawholesale');

        await page.getByTestId('fiat-simulate-offramp-confirm-btn').click();
        await expect(offrampPass).toContainText('Dispatched', {
            ignoreCase: true
        });
    });

    test('3. Chaos & Fail-Closed Circuit Breaker Tests (Gas Spike & API Timeout Protection)', async ({
        request
    }) => {
        // Simulate sudden L1 gas spike pushing Quoted_Guest_Fee above Competitor Ceiling on $100 BTC On-Ramp
        const gasSpikeOnramp = await request.get(
            '/api/fiat/onramp?quoteAsset=BTC&amountUsd=100&simulateGasSpikeUsd=15'
        );
        expect(gasSpikeOnramp.status()).toBe(503);
        const spikeBody = await gasSpikeOnramp.json();
        expect(spikeBody.circuitBreakerTripped).toBe(true);
        expect(spikeBody.error).toContain('CIRCUIT_BREAKER_TRIPPED');

        // Simulate Wholesale Exchange API Timeout on Off-Ramp
        const timeoutOfframp = await request.get(
            '/api/fiat/offramp?quoteAsset=ETH&amountUsd=200&simulateApiTimeout=true'
        );
        expect(timeoutOfframp.status()).toBe(503);
        const timeoutBody = await timeoutOfframp.json();
        expect(timeoutBody.circuitBreakerTripped).toBe(true);
        expect(timeoutBody.error).toContain('CIRCUIT_BREAKER_TRIPPED');
    });

    test('4. Full Ecosystem Reconciliation (Global Fiat Modal, 1-Click SILO Auto-Stake & Tax Fortress Escrow)', async ({
        page
    }) => {
        await bootstrapAuthenticatedSandboxSession(page);
        await page.goto('/');

        // 4A. Open Global [$ Buy Crypto] Modal from Header & Arm 1-Click SILO Auto-Stake
        await page.getByTestId('header-buy-fiat-btn').click();
        const globalModal = page.getByTestId('global-fiat-modal');
        await expect(globalModal).toBeVisible();

        await page.getByTestId('global-fiat-1click-silo-btn').click();
        await expect(
            page.getByTestId('global-fiat-competitor-savings-badge')
        ).toContainText('more than Uphold & Retail Exchange Apps.');
        await page.getByTestId('close-global-fiat-modal-btn').click();

        // 4B. Navigate to Tax Fortress and verify Mode A (100% USDC Default) vs Mode B (50/50 KAS/USDC LP Impermanent Loss Gate)
        await page.getByTestId('header-nav-TAX-FORTRESS').click();
        await expect(page.getByTestId('tax-fortress-view')).toBeVisible();

        await page.getByTestId('toggle-tax-escrow-btn').click();
        const confirmBtn = page.getByTestId('confirm-tax-escrow-btn');
        await expect(confirmBtn).toBeVisible();
        await expect(confirmBtn).toBeEnabled();

        // Switch to Mode B (50/50 KAS/USDC Auto-LP) -> button must disable until Impermanent Loss checkbox is checked
        await page.getByTestId('escrow-mode-lp-btn').click();
        await expect(confirmBtn).toBeDisabled();
        await page.getByTestId('escrow-il-ack-checkbox').check();
        await expect(confirmBtn).toBeEnabled();
        await confirmBtn.click();

        await expect(
            page.getByTestId('tax-escrow-balance-display')
        ).toBeVisible();
    });
});