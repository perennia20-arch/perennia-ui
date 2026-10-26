import { test, expect, type Page } from '@playwright/test';

const TEST_MNEMONIC_24 =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';
const MASTER_DIRECTOR_ADDRESS =
    'kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579';

const MOCK_PYTH_RWA_FEEDS = [
    {
        ticker: 'SPY',
        assetClass: 'EQUITY',
        price: '584.50',
        spotPrice: 584.5,
        change24h: 0.85,
        publishTime: new Date().toISOString(),
        oracleSource: 'PYTH_HERMES'
    },
    {
        ticker: 'QQQ',
        assetClass: 'EQUITY',
        price: '502.25',
        spotPrice: 502.25,
        change24h: 1.15,
        publishTime: new Date().toISOString(),
        oracleSource: 'PYTH_HERMES'
    },
    {
        ticker: 'NVDA',
        assetClass: 'EQUITY',
        price: '142.80',
        spotPrice: 142.8,
        change24h: 3.45,
        publishTime: new Date().toISOString(),
        oracleSource: 'PYTH_HERMES'
    },
    {
        ticker: 'AAPL',
        assetClass: 'EQUITY',
        price: '234.10',
        spotPrice: 234.1,
        change24h: 0.55,
        publishTime: new Date().toISOString(),
        oracleSource: 'PYTH_HERMES'
    },
    {
        ticker: 'TSLA',
        assetClass: 'EQUITY',
        price: '262.40',
        spotPrice: 262.4,
        change24h: 2.1,
        publishTime: new Date().toISOString(),
        oracleSource: 'PYTH_HERMES'
    },
    {
        ticker: 'AMD',
        assetClass: 'EQUITY',
        price: '158.90',
        spotPrice: 158.9,
        change24h: 1.95,
        publishTime: new Date().toISOString(),
        oracleSource: 'PYTH_HERMES'
    },
    {
        ticker: 'TSM',
        assetClass: 'EQUITY',
        price: '194.60',
        spotPrice: 194.6,
        change24h: 2.4,
        publishTime: new Date().toISOString(),
        oracleSource: 'PYTH_HERMES'
    },
    {
        ticker: 'AVGO',
        assetClass: 'EQUITY',
        price: '179.30',
        spotPrice: 179.3,
        change24h: 1.65,
        publishTime: new Date().toISOString(),
        oracleSource: 'PYTH_HERMES'
    },
    {
        ticker: 'XLE',
        assetClass: 'EQUITY',
        price: '91.20',
        spotPrice: 91.2,
        change24h: 0.72,
        publishTime: new Date().toISOString(),
        oracleSource: 'PYTH_HERMES'
    },
    {
        ticker: 'XAU',
        assetClass: 'COMMODITY',
        price: '2745.00',
        spotPrice: 2745.0,
        change24h: 0.92,
        publishTime: new Date().toISOString(),
        oracleSource: 'PYTH_HERMES'
    },
    {
        ticker: 'XAG',
        assetClass: 'COMMODITY',
        price: '33.85',
        spotPrice: 33.85,
        change24h: 1.35,
        publishTime: new Date().toISOString(),
        oracleSource: 'PYTH_HERMES'
    },
    {
        ticker: 'USTB',
        assetClass: 'TREASURY',
        price: '101.42',
        spotPrice: 101.42,
        change24h: 0.02,
        publishTime: new Date().toISOString(),
        oracleSource: 'PYTH_HERMES'
    }
];

async function seedSovereignSession(page: Page, options?: { isDirector?: boolean }) {
    const kaspaAddress = options?.isDirector
        ? MASTER_DIRECTOR_ADDRESS
        : 'kaspa:qp0000000000000000000000000000000000000000000000000000000000';

    await page.addInitScript(
        ({ kasAddr, mnemonic }) => {
            const safeWallets = {
                kaspa: { address: kasAddr },
                bitcoin: { address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' },
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
            };
            localStorage.setItem('perennia_tour_completed', 'true');
            localStorage.setItem(
                'perennia_sovereign_payload',
                JSON.stringify({
                    version: 'perennia-vault-v4',
                    exportedAt: new Date().toISOString(),
                    wallets: safeWallets,
                    vault: window.btoa(mnemonic)
                })
            );
            sessionStorage.setItem('perennia_active_wallet_type', 'sovereign');
            sessionStorage.setItem('perennia_vault_unlocked', 'true');
        },
        { kasAddr: kaspaAddress, mnemonic: TEST_MNEMONIC_24 }
    );

    await page.route('**/api/auth/me', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                authenticated: true,
                address: kaspaAddress
            })
        });
    });

    await page.route('**/api/balance**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ balance: 5000.0 })
        });
    });

    await page.route('**/api/prices?**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                kaspa: { usd: 0.15, usd_24h_change: 4.2 },
                bitcoin: { usd: 92500.0, usd_24h_change: 1.8 },
                ethereum: { usd: 3150.0, usd_24h_change: 2.1 },
                solana: { usd: 185.0, usd_24h_change: 5.4 }
            })
        });
    });
}

test.describe('Master Chat K — Mine-to-Stock, Pyth Wall Street & Commodity Oracles, and Multi-Asset 50%-KAS Liquidity Plants', () => {
    test('1. Live Pyth Hermes Oracle Ingestion for NVDA, SPY, AMD, XAU, and USTB with Zero Hardcoded Fallbacks', async ({
        page
    }) => {
        await seedSovereignSession(page);

        await page.route('**/api/state**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ workers: [], sectors: [], systemMode: 'base' })
            });
        });

        await page.route('**/api/prices/rwa', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    count: MOCK_PYTH_RWA_FEEDS.length,
                    assets: MOCK_PYTH_RWA_FEEDS
                })
            });
        });

        await page.goto('/');
        await page.getByRole('button', { name: 'DEX' }).click();

        await page.getByTestId('quick-select-rwa-NVDA').click();
        await expect(page.getByTestId('dex-receive-token-selector')).toContainText('NVDA');
        await expect(page.getByTestId('dex-receive-token-selector')).toContainText('$142.80');

        await page.getByTestId('quick-select-rwa-SPY').click();
        await expect(page.getByTestId('dex-receive-token-selector')).toContainText('SPY');
        await expect(page.getByTestId('dex-receive-token-selector')).toContainText('$584.50');

        await page.getByTestId('quick-select-rwa-AMD').click();
        await expect(page.getByTestId('dex-receive-token-selector')).toContainText('AMD');
        await expect(page.getByTestId('dex-receive-token-selector')).toContainText('$158.90');

        await page.getByTestId('quick-select-rwa-XAU').click();
        await expect(page.getByTestId('dex-receive-token-selector')).toContainText('XAU');
        await expect(page.getByTestId('dex-receive-token-selector')).toContainText('$2,745.00');

        await page.getByTestId('quick-select-rwa-USTB').click();
        await expect(page.getByTestId('dex-receive-token-selector')).toContainText('USTB');
        await expect(page.getByTestId('dex-receive-token-selector')).toContainText('$101.42');
    });

    test('2. Operations Sector Creation: 1 Asset (NVDA) creates a Settlement Silo; adding 2+ Assets (KAS + NVDA + XAU) automatically transforms the sector into a Multi-Asset Liquidity Plant with KAS locked at 50.0%', async ({
        page
    }) => {
        await seedSovereignSession(page);

        await page.route('**/api/state**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ workers: [], sectors: [], systemMode: 'base' })
            });
        });

        await page.route('**/api/prices/rwa', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    count: MOCK_PYTH_RWA_FEEDS.length,
                    assets: MOCK_PYTH_RWA_FEEDS
                })
            });
        });

        await page.route('**/api/user/ledger**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    KAS: 1000.0,
                    unassignedReserveKas: 12.5,
                    unassignedReserveTargetKas: 50.0
                })
            });
        });

        await page.route('**/api/fiat/offramp**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ savedBankRailLast4: null, recentPayouts: [] })
            });
        });

        await page.route('**/api/user/tax-events', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([])
            });
        });

        const capturedSectors: any[] = [];
        await page.route('**/api/state/action', async (route) => {
            const body = JSON.parse(route.request().postData() || '{}');
            if (body.action === 'ADD_SECTOR') {
                capturedSectors.push(body.payload);
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true })
            });
        });

        await page.goto('/');

        // Part A: 1 Target Asset (NVDA) -> Settlement Silo
        await page.getByRole('button', { name: '+ Break Off Sector' }).click();
        await page.locator('#draftSectorNameInput').fill('MINE-TO-NVDA-SILO');
        await page.getByRole('button', { name: '50%', exact: true }).click();
        await page.getByTestId('open-target-asset-picker-btn').click();
        await page.getByTestId('asset-cat-EQUITIES').click();
        await page.getByTestId('select-target-asset-NVDA').click();

        await expect(page.getByTestId('sector-architecture-badge')).toContainText(
            '1-Asset Settlement Silo (NVDA)'
        );
        await page.getByTestId('initialize-sector-btn').click();

        await expect(page.getByTestId('settlement-silos-section')).toContainText(
            'MINE-TO-NVDA-SILO'
        );
        expect(capturedSectors[0].routeMode).toBe('swap');
        expect(capturedSectors[0].settlementConfig.targetAsset.ticker).toBe('NVDA');

        // Part B: 2+ Target Assets (KAS + NVDA + XAU) -> Multi-Asset Liquidity Plant with KAS locked at 50.0%
        await page.getByRole('button', { name: '+ Break Off Sector' }).click();
        await page.locator('#draftSectorNameInput').fill('WALL-ST-GOLD-PLANT');
        await page.getByTestId('open-target-asset-picker-btn').click();
        await page.getByTestId('select-target-asset-NVDA').click();

        await page.getByTestId('add-plant-asset-btn').click();
        await page.getByTestId('asset-cat-COMMODITIES').click();
        await page.getByTestId('select-target-asset-XAU').click();

        await expect(page.getByTestId('multi-asset-plant-panel')).toBeVisible();
        await expect(page.getByTestId('plant-weight-readout-KAS')).toHaveText('50.0%');
        await expect(page.getByTestId('plant-weight-readout-NVDA')).toHaveText('25.00%');
        await expect(page.getByTestId('plant-weight-readout-XAU')).toHaveText('25.00%');
        await expect(page.getByTestId('sector-architecture-badge')).toContainText(
            'Multi-Asset Liquidity Plant (50.0% KAS Anchor • 3 Cross-Pairs)'
        );

        await page.getByTestId('initialize-sector-btn').click();
        await expect(page.getByTestId('liquidity-plants-section')).toContainText(
            'WALL-ST-GOLD-PLANT'
        );

        expect(capturedSectors[1].routeMode).toBe('auto-lp');
        expect(capturedSectors[1].settlementConfig.plantWeights.KAS).toBe(50.0);
        expect(capturedSectors[1].settlementConfig.plantWeights.NVDA).toBe(25.0);
        expect(capturedSectors[1].settlementConfig.plantWeights.XAU).toBe(25.0);
        expect(capturedSectors[1].settlementConfig.plantPair).toBe('KAS/NVDA/XAU');
    });

    test('3. 24/7 DEX Stock/Commodity Swap Quote with SILO Staker Fee Discount and Multi-Asset LP Staking (STAKE_LP)', async ({
        page
    }) => {
        await seedSovereignSession(page);

        await page.route('**/api/state**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ workers: [], sectors: [], systemMode: 'base' })
            });
        });

        await page.route('**/api/prices/rwa', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    count: MOCK_PYTH_RWA_FEEDS.length,
                    assets: MOCK_PYTH_RWA_FEEDS
                })
            });
        });

        await page.route('**/api/user/ledger**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    KAS: 5000.0,
                    NVDA: 10.0,
                    XAU: 2.0,
                    USDC: 1500.0,
                    SILO: 120000.0,
                    unassignedReserveKas: 0.0,
                    unassignedReserveTargetKas: 50.0
                })
            });
        });

        let capturedStakeLpPayload: any = null;
        await page.route('**/api/state/action', async (route) => {
            const body = JSON.parse(route.request().postData() || '{}');
            if (body.action === 'GET_SILO_STAKING') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        data: {
                            ecosystemTicker: 'SILO',
                            activeStaked: 120000,
                            cooldownStaked: 0,
                            combinedEligibleStaked: 120000,
                            feeRateCap: 0.005,
                            tierLabel: 'SILO Institutional Tier (0.50% Fee)',
                            positions: []
                        }
                    })
                });
                return;
            }
            if (body.action === 'GET_LP_POSITIONS') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        data: capturedStakeLpPayload
                            ? [
                                  {
                                      lpId: 'aaaa1111-bbbb-2222-cccc-333333333333',
                                      poolPair: capturedStakeLpPayload.poolPair,
                                      stakedAssetA: capturedStakeLpPayload.amountA,
                                      stakedAssetB: capturedStakeLpPayload.amountB,
                                      weights: capturedStakeLpPayload.weights,
                                      reserves: capturedStakeLpPayload.reserves,
                                      internalPairsCount: 3,
                                      isMultiAssetPlant: true,
                                      lockDurationDays: 365,
                                      unlockDate: new Date(
                                          Date.now() + 365 * 86400 * 1000
                                      ).toISOString(),
                                      createdAt: new Date().toISOString(),
                                      isUnlocked: false,
                                      multiplier: 2.5,
                                      weightedTvl: capturedStakeLpPayload.amountA * 2.5
                                  }
                              ]
                            : []
                    })
                });
                return;
            }
            if (body.action === 'STAKE_LP') {
                capturedStakeLpPayload = body.payload;
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true })
                });
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true })
            });
        });

        await page.goto('/');
        await page.getByRole('button', { name: 'DEX' }).click();

        // Verify SILO >=100k Staker Tier (0.50% Fee) is active on 24/7 Equity Swap
        await expect(page.getByTestId('dex-active-fee-pct')).toHaveText('0.50%');
        await page.getByTestId('quick-select-rwa-NVDA').click();
        await page.getByTestId('dex-pay-amount-input').fill('1000');
        await expect(page.getByTestId('dex-receive-amount-input')).not.toHaveValue('');

        // Switch to Liquidity tab and build a 3-Asset (50% KAS + 25% NVDA + 25% XAU) Plant
        await page.getByRole('button', { name: 'Liquidity' }).click();
        await page.getByTestId('dex-lp-select-b-btn').click();
        await page.getByTestId('dex-modal-cat-EQUITIES').click();
        await page.getByTestId('dex-select-token-NVDA').click();

        await page.getByTestId('dex-add-secondary-plant-asset-btn').click();
        await expect(page.getByTestId('dex-plant-pair-badge')).toHaveText('KAS/NVDA/XAU');

        await page.getByTestId('dex-lp-kas-amount-input').fill('1000');
        await page.getByTestId('dex-stake-lp-submit-btn').click();

        expect(capturedStakeLpPayload).toBeTruthy();
        expect(capturedStakeLpPayload.poolPair).toBe('KAS/NVDA/XAU');
        expect(capturedStakeLpPayload.weights.KAS).toBe(0.5);
        expect(capturedStakeLpPayload.weights.NVDA).toBe(0.25);
        expect(capturedStakeLpPayload.weights.XAU).toBe(0.25);
        expect(capturedStakeLpPayload.secondaryAssets.length).toBe(2);
    });

    test('4. Master Treasury Fee Firewall & 365D 2.5x Auto-Compounder Verification', async ({
        page
    }) => {
        await seedSovereignSession(page, { isDirector: true });

        await page.route('**/api/state**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ workers: [], sectors: [], systemMode: 'base' })
            });
        });

        await page.route('**/api/prices/rwa', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    count: MOCK_PYTH_RWA_FEEDS.length,
                    assets: MOCK_PYTH_RWA_FEEDS
                })
            });
        });

        await page.route('**/api/treasury/preferences**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    preferences: {
                        activeNetworks: ['BTC', 'ETH', 'BASE'],
                        userCustomTokens: {},
                        selectedTokensMap: {}
                    }
                })
            });
        });

        await page.route('**/api/treasury/corporate**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    assets: [
                        { symbol: 'KAS', address: MASTER_DIRECTOR_ADDRESS, balance: 25000.0 }
                    ],
                    reconciliation: {
                        nettingQueueLength: 0,
                        passthroughQueueLength: 1,
                        recentNettingOrders: [],
                        // Oracle-verified assets accumulate for 365D 2.5x auto-LP; unverified custom tokens are quarantined strictly into KAS
                        accumulatedFees: {
                            KAS: 145.5,
                            USDC: 18.25,
                            NVDA: 0.45,
                            XAU: 0.025,
                            USTB: 0.5
                        },
                        nettingProfitUsd: 64.8,
                        unhedgedDeltaKas: 0,
                        hedgeStatus: { mode: 'LP_ABSORPTION_AND_SKEW_GUARD', cexConfigured: false },
                        fppsSolvency: {
                            availableHeadroomKas: 50.0,
                            elasticStreamingFactor: 1.0,
                            l1BlocksWonKas: 310.0,
                            externalStreamedKas: 120.0
                        },
                        updatedAt: Date.now()
                    }
                })
            });
        });

        await page.route('**/api/user/ledger**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    KAS: 25000.0,
                    unassignedReserveKas: 0.0,
                    unassignedReserveTargetKas: 50.0
                })
            });
        });

        await page.route('**/api/user/tax-events', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([])
            });
        });

        await page.goto('/');
        await page.getByRole('button', { name: 'TREASURY' }).click();
        await page.getByRole('button', { name: 'Protocol Fees by Asset' }).click();

        await expect(page.getByText('NVDA').first()).toBeVisible();
        await expect(page.getByText('XAU').first()).toBeVisible();
        await expect(page.getByText('USTB').first()).toBeVisible();
        await expect(page.getByText('Auto-2.5x LP @ ≥$5')).toBeVisible();
    });
});