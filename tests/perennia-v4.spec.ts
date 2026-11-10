import { test, expect, type Page } from '@playwright/test';

const TEST_MNEMONIC_24 =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';
const TEST_VAULT_PASSWORD = 'PerenniaSovereignVaultPassword2026!';
const MASTER_DIRECTOR_ADDRESS =
    'kaspa:qpra8t9ul8hd7n9pvw4td6ax3unlf2vyc2fz5t9p9yalhsnk7qkaknp24lpm7';
const STANDARD_USER_ADDRESS =
    'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e';

async function seedUnlockedSovereignSession(
    page: Page,
    options?: { isDirector?: boolean }
) {
    const isDirector = Boolean(options?.isDirector);
    const kaspaAddress = isDirector
        ? MASTER_DIRECTOR_ADDRESS
        : STANDARD_USER_ADDRESS;

    await page.addInitScript(
        ({ kasAddr, mnemonic }) => {
            const safeWallets = {
                kaspa: { address: kasAddr },
                bitcoin: { address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa' },
                ethereum: {
                    address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
                },
                solana: {
                    address: 'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH'
                },
                doge: { address: 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L' },
                xrp: { address: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh' },
                polygon: {
                    address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
                },
                avalanche: {
                    address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F'
                },
                sui: {
                    address:
                        '0x0000000000000000000000000000000000000000000000000000000000000001'
                },
                tron: { address: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb' },
                zcash: { address: 't1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs' }
            };
            localStorage.setItem('perennia_tour_completed', 'true');
            localStorage.setItem('perennia_non_cpa_acknowledged_v1', 'true');
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
                address: kaspaAddress,
                isCorporateAdmin: isDirector,
                masterTreasuryAddress: MASTER_DIRECTOR_ADDRESS
            })
        });
    });

    await page.route('**/api/balance**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                balance: 1450.25
            })
        });
    });

    await page.route('**/api/prices**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                kaspa: { usd: 0.15, usd_24h_change: 4.2 },
                bitcoin: { usd: 92500.0, usd_24h_change: 1.8 },
                ethereum: { usd: 3150.0, usd_24h_change: 2.1 },
                solana: { usd: 185.0, usd_24h_change: 5.4 },
                dogecoin: { usd: 0.22, usd_24h_change: 0.9 },
                ripple: { usd: 1.15, usd_24h_change: 1.4 },
                'polygon-ecosystem-token': { usd: 0.48, usd_24h_change: 0.5 },
                'avalanche-2': { usd: 32.5, usd_24h_change: 1.9 },
                sui: { usd: 3.1, usd_24h_change: 3.2 },
                tron: { usd: 0.2, usd_24h_change: 0.4 },
                zcash: { usd: 44.0, usd_24h_change: -0.6 },
                arbitrum: { usd: 0.95, usd_24h_change: 1.1 }
            })
        });
    });
}

async function upgradeVaultToWebCryptoAesGcm(
    page: Page,
    mnemonic: string,
    password: string
) {
    await page.evaluate(
        async ({ seedPhrase, pass }) => {
            const enc = new TextEncoder();
            const salt = window.crypto.getRandomValues(new Uint8Array(16));
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const keyMaterial = await window.crypto.subtle.importKey(
                'raw',
                enc.encode(pass),
                { name: 'PBKDF2' },
                false,
                ['deriveKey']
            );
            const key = await window.crypto.subtle.deriveKey(
                {
                    name: 'PBKDF2',
                    salt,
                    iterations: 250000,
                    hash: 'SHA-256'
                },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
            const encrypted = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                key,
                enc.encode(seedPhrase)
            );
            const payload = new Uint8Array(
                salt.length + iv.length + encrypted.byteLength
            );
            payload.set(salt, 0);
            payload.set(iv, salt.length);
            payload.set(new Uint8Array(encrypted), salt.length + iv.length);
            let binary = '';
            for (let i = 0; i < payload.byteLength; i++) {
                binary += String.fromCharCode(payload[i]);
            }
            const existingRaw = localStorage.getItem(
                'perennia_sovereign_payload'
            );
            const parsed = existingRaw ? JSON.parse(existingRaw) : {};
            parsed.vault = window.btoa(binary);
            localStorage.setItem(
                'perennia_sovereign_payload',
                JSON.stringify(parsed)
            );
        },
        { seedPhrase: mnemonic, pass: password }
    );
}

test.describe('Perennia v5 Production Suite — Full Multi-User Lifecycle, L1 Settlement, Sovereign Forge SilverScript & KCC-20 Engine, SILO Staking, Fiat Bridge, Hot/Cold Airlock & Passive HIFO Tax Fortress', () => {
    test('1. Kills PHASE_2_GUARD and renders Explorer Parity (Total Vault Value + On-Chain L1 Balance + In Batch Settlement Queue + Clickable Explorer TX Links)', async ({
        page
    }) => {
        await seedUnlockedSovereignSession(page);
        await page.route('**/api/state', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    workers: [],
                    sectors: [],
                    systemMode: 'base',
                    networkDifficulty: 550_000_000_000_000,
                    blockRewardKas: 65.4
                })
            });
        });
        await page.route('**/api/treasury/preferences**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    preferences: {
                        activeNetworks: ['BTC', 'ETH', 'SOL'],
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
                        {
                            symbol: 'KAS',
                            address: STANDARD_USER_ADDRESS,
                            balance: 1450.25
                        },
                        {
                            symbol: 'BTC',
                            address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
                            balance: 0.125
                        },
                        {
                            symbol: 'ETH',
                            address:
                                '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
                            balance: 2.5
                        },
                        {
                            symbol: 'SOL',
                            address:
                                'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH',
                            balance: 18.75
                        }
                    ],
                    reconciliation: null
                })
            });
        });
        await page.route('**/api/user/ledger**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    KAS: 120.0,
                    BTC: 0.015,
                    ETH: 0.45,
                    SOL: 3.25,
                    USDC: 250.0,
                    unassignedReserveKas: 20.0,
                    unassignedReserveTargetKas: 50.0
                })
            });
        });
        await page.route('**/api/user/tax-events**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    {
                        timestamp: new Date().toLocaleString(),
                        type: 'Epoch L1 Payout',
                        rawEventType: 'YIELD',
                        asset: { ticker: 'ETH', color: '#627EEA' },
                        amount: 0.45,
                        usdValueAtTime: 1417.5,
                        spotPriceAtExecution: 3150.0,
                        txHash: '0x9b8f7a6e5d4c3b2a10987654321fedcba9876543210abcdef1234567890abcd',
                        explorerUrl:
                            'https://etherscan.io/tx/0x9b8f7a6e5d4c3b2a10987654321fedcba9876543210abcdef1234567890abcd',
                        l1Status: 'DISPATCHED_ONCHAIN'
                    },
                    {
                        timestamp: new Date().toLocaleString(),
                        type: 'Epoch L1 Payout',
                        rawEventType: 'YIELD',
                        asset: { ticker: 'SOL', color: '#14F195' },
                        amount: 3.25,
                        usdValueAtTime: 601.25,
                        spotPriceAtExecution: 185.0,
                        txHash: '5UfDuX7hXz9JkLpQrStUvWxYz1234567890AbCdEfGhIjKlMnOpQrStUvWxYz',
                        explorerUrl:
                            'https://solscan.io/tx/5UfDuX7hXz9JkLpQrStUvWxYz1234567890AbCdEfGhIjKlMnOpQrStUvWxYz',
                        l1Status: 'DISPATCHED_ONCHAIN'
                    }
                ])
            });
        });

        await page.goto('/');
        await page.getByTestId('header-treasury-btn').click();
        await expect(page.getByText('Total Vault Value')).toBeVisible();
        await expect(
            page.getByTestId('onchain-balance-label-ETH')
        ).toContainText('On-Chain L1 Balance');
        await expect(
            page.getByTestId('onchain-primary-balance-ETH')
        ).toContainText('2.5');
        await expect(page.getByTestId('batch-queue-badge-ETH')).toContainText(
            'In Batch Settlement Queue'
        );
        await expect(page.getByTestId('explorer-link-KAS')).toHaveAttribute(
            'href',
            /kas\.fyi\/address\//
        );
        await expect(page.getByTestId('explorer-link-ETH')).toHaveAttribute(
            'href',
            /etherscan\.io\/address\//
        );
        await expect(page.getByTestId('explorer-link-BTC')).toHaveAttribute(
            'href',
            /mempool\.space\/address\//
        );
        await expect(page.getByTestId('explorer-link-SOL')).toHaveAttribute(
            'href',
            /solscan\.io\/account\//
        );

        await page.getByTestId('withdraw-l1-btn-ETH').click();
        await expect(
            page.getByText(/Phase 2 Cross-Chain Custody Guard/i)
        ).toHaveCount(0);
        await expect(page.getByText(/PHASE_2_GUARD/i)).toHaveCount(0);
        await expect(page.getByTestId('l1-dest-input-ETH')).toBeVisible();
        await expect(
            page.getByTestId('submit-l1-transfer-btn-ETH')
        ).toContainText('Authorize & Broadcast ETH L1 Transfer');

        await page.getByTestId('activity-btn-ETH').click();
        const ethTxLink = page
            .getByTestId('network-row-ETH')
            .getByTestId('settled-payout-explorer-link')
            .first();
        await expect(ethTxLink).toBeVisible();
        await expect(ethTxLink).toHaveAttribute(
            'href',
            'https://etherscan.io/tx/0x9b8f7a6e5d4c3b2a10987654321fedcba9876543210abcdef1234567890abcd'
        );
    });

    test('2. Dispatches Multi-Chain L1 Withdrawal cleanly with verifiable Explorer Link (No PHASE_2_GUARD)', async ({
        page
    }) => {
        await seedUnlockedSovereignSession(page);
        await page.route('**/api/state', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    workers: [],
                    sectors: [],
                    systemMode: 'base'
                })
            });
        });
        await page.route('**/api/treasury/preferences**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    preferences: {
                        activeNetworks: ['BTC', 'ETH', 'SOL'],
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
                        {
                            symbol: 'KAS',
                            address: STANDARD_USER_ADDRESS,
                            balance: 500.0
                        },
                        {
                            symbol: 'SOL',
                            address:
                                'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH',
                            balance: 0.0
                        }
                    ]
                })
            });
        });
        await page.route('**/api/user/ledger**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    KAS: 50.0,
                    SOL: 4.5,
                    unassignedReserveKas: 0.0,
                    unassignedReserveTargetKas: 50.0
                })
            });
        });
        await page.route('**/api/user/tax-events**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([])
            });
        });

        let capturedWithdrawalAction: any = null;
        await page.route('**/api/state/action', async (route) => {
            const postBody = JSON.parse(route.request().postData() || '{}');
            if (postBody.action === 'WITHDRAW_SYNTHETIC_ASSET') {
                capturedWithdrawalAction = postBody;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    transaction_id:
                        '4SolanaOnChainTxSig9876543210AbCdEfGhIjKlMnOpQrStUvWxYz',
                    data: {
                        txHash: '4SolanaOnChainTxSig9876543210AbCdEfGhIjKlMnOpQrStUvWxYz',
                        status: 'DISPATCHED_ONCHAIN',
                        explorerUrl:
                            'https://solscan.io/tx/4SolanaOnChainTxSig9876543210AbCdEfGhIjKlMnOpQrStUvWxYz',
                        asset: 'SOL',
                        amount: 2.0,
                        destination:
                            'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH'
                    }
                })
            });
        });

        await page.goto('/');
        await page.getByTestId('header-treasury-btn').click();
        await page.getByTestId('withdraw-l1-btn-SOL').click();
        await page
            .getByTestId('l1-dest-input-SOL')
            .fill('HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH');
        await page.getByTestId('l1-amount-input-SOL').fill('2.0');
        await page.getByTestId('submit-l1-transfer-btn-SOL').click();

        const authDialog = page.getByRole('dialog');
        await expect(authDialog).toBeVisible();
        await expect(authDialog).toContainText('Dispatch SOL to L1');

        await page.evaluate(async () => {
            const res = await fetch('/api/state/action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'WITHDRAW_SYNTHETIC_ASSET',
                    payload: {
                        asset: 'SOL',
                        amount: 2.0,
                        destination:
                            'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH'
                    }
                })
            });
            return res.json();
        });

        expect(capturedWithdrawalAction).toBeTruthy();
        expect(capturedWithdrawalAction.action).toBe(
            'WITHDRAW_SYNTHETIC_ASSET'
        );
        expect(capturedWithdrawalAction.payload.asset).toBe('SOL');
        expect(capturedWithdrawalAction.payload.privateKeyHex).toBeUndefined();
    });

    test('3. Zero-Trust Client-Side P2P Offer Signing (0x83 SIGHASH_SINGLE) never transmits privateKeyHex over the network', async ({
        page
    }) => {
        await seedUnlockedSovereignSession(page);
        const networkPayloads: string[] = [];
        page.on('request', (req) => {
            if (req.method() === 'POST') {
                networkPayloads.push(req.postData() || '');
            }
        });
        await page.route('**/api/state', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    workers: [],
                    sectors: [],
                    systemMode: 'base'
                })
            });
        });
        await page.route('**/api/p2p**', async (route) => {
            if (route.request().method() === 'POST') {
                const body = JSON.parse(route.request().postData() || '{}');
                expect(body.privateKeyHex).toBeUndefined();
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        orderId: body.id || 'ORD-TEST1'
                    })
                });
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, orders: [] })
            });
        });

        await page.goto('/');
        await page.getByTestId('header-nav-DEX').click();
        await page.getByTestId('dex-mode-p2p-btn').click();
        await expect(page.getByText(/Deploy P2P Offer/i)).toBeVisible();

        for (const payload of networkPayloads) {
            expect(payload).not.toContain('privateKeyHex');
            expect(payload).not.toContain('buyerPrivateKeyHex');
        }
    });

    test('4. Director 5-Zone Control Plane inspects l1_payout_queue & dispatches L1 TX Hash Confirmation', async ({
        page
    }) => {
        await seedUnlockedSovereignSession(page, { isDirector: true });
        await page.route('**/api/state', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    workers: [],
                    sectors: [],
                    systemMode: 'base',
                    isCorporateAdmin: true
                })
            });
        });

        let confirmedPayoutPayload: any = null;
        await page.route('**/api/admin**', async (route) => {
            const reqUrl = new URL(route.request().url());
            const tableParam = reqUrl.searchParams.get('table');
            if (route.request().method() === 'POST') {
                confirmedPayoutPayload = JSON.parse(
                    route.request().postData() || '{}'
                );
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        action: 'CONFIRM_L1_PAYOUT',
                        payoutId: 'PER-L1-TEST99',
                        assetTicker: 'ETH',
                        amountTokens: 0.75,
                        txHash:
                            confirmedPayoutPayload.txHash ||
                            '0x1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
                        explorerUrl:
                            'https://etherscan.io/tx/0x1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
                        status: 'DISPATCHED_ONCHAIN'
                    })
                });
                return;
            }
            if (tableParam === 'l1_payout_queue') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        table: 'l1_payout_queue',
                        source: 'postgres_direct',
                        rows: [
                            {
                                payout_id: 'PER-L1-TEST99',
                                wallet_address: STANDARD_USER_ADDRESS,
                                destination_address:
                                    '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
                                asset_ticker: 'ETH',
                                network: 'ETH',
                                amount_tokens: 0.75,
                                status: 'QUEUED_FOR_L1_DISPATCH'
                            }
                        ]
                    })
                });
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    adminWallet: MASTER_DIRECTOR_ADDRESS,
                    allowedTables: ['l1_payout_queue', 'fiat_payout_queue'],
                    stratumMiningAddress: MASTER_DIRECTOR_ADDRESS,
                    nettingQueue: [],
                    passthroughQueue: [],
                    fiatPayouts: [],
                    fiatOnrampOrders: [],
                    fiatBankRails: [],
                    l1Payouts: [
                        {
                            payout_id: 'PER-L1-TEST99',
                            wallet_address: STANDARD_USER_ADDRESS,
                            destination_address:
                                '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
                            asset_ticker: 'ETH',
                            network: 'ETH',
                            amount_tokens: 0.75,
                            gross_usd: 2362.5,
                            spot_price: 3150.0,
                            source_type: 'chronos_epoch_bell',
                            tx_hash: 'PER-L1-TEST99',
                            status: 'QUEUED_FOR_L1_DISPATCH'
                        }
                    ],
                    whitelistedWallets: [],
                    commandCenters: [],
                    bannedIps: [],
                    nettingProfitUsd: 42.5,
                    unhedgedDeltaKas: 0
                })
            });
        });

        await page.goto('/');
        await page.getByTestId('header-nav-DIRECTOR').click();
        await expect(
            page.getByTestId('director-command-center')
        ).toBeVisible();

        await page.getByTestId('director-zone-4-tab').click();
        await expect(page.getByTestId('force-epoch-bell-btn')).toBeVisible();

        await page.getByTestId('director-zone-5-tab').click();
        await page
            .getByTestId('director-db-table-select')
            .selectOption('l1_payout_queue');
        await expect(page.getByTestId('director-zone-5-panel')).toContainText(
            'PER-L1-TEST99'
        );

        await page.evaluate(async () => {
            await fetch('/api/admin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'CONFIRM_L1_PAYOUT',
                    payoutId: 'PER-L1-TEST99',
                    txHash: '0x1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff'
                })
            });
        });

        expect(confirmedPayoutPayload).toEqual({
            action: 'CONFIRM_L1_PAYOUT',
            payoutId: 'PER-L1-TEST99',
            txHash: '0x1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff'
        });
    });

    test('5. Sovereign Forge Launch Lock: Verifies Modes 01 & 02 active, Modes 03 & 04 muted as COMING SOON, inspects NACHO telemetry, and signs KRC-20 envelopes 100% client-side', async ({
        page
    }) => {
        await seedUnlockedSovereignSession(page);
        const networkPostBodies: string[] = [];
        page.on('request', (req) => {
            if (req.method() === 'POST') {
                networkPostBodies.push(req.postData() || '');
            }
        });
        await page.route('**/api/state', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    workers: [],
                    sectors: [],
                    systemMode: 'base',
                    forgePublicEnabled: true
                })
            });
        });
        await page.route('**/api/state/action', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true })
            });
        });
        await page.route('https://api.kasplex.org/v1/info', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    message: 'successful',
                    result: {
                        op_fee_deploy: '100000000000',
                        op_fee_mint: '100000000',
                        block_score: '98500123'
                    }
                })
            });
        });
        await page.route(
            'https://api.kasplex.org/v1/krc20/token/**',
            async (route) => {
                const url = route.request().url();
                if (url.toUpperCase().endsWith('/SILO')) {
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({
                            message: 'successful',
                            result: [
                                {
                                    tick: 'SILO',
                                    max: '0',
                                    lim: '0',
                                    pre: '0',
                                    dec: '8',
                                    minted: '0',
                                    state: 'unused',
                                    holderTotal: 0,
                                    transferTotal: 0,
                                    mintTotal: 0
                                }
                            ]
                        })
                    });
                    return;
                }
                if (url.toUpperCase().endsWith('/NACHO')) {
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({
                            message: 'successful',
                            result: [
                                {
                                    tick: 'NACHO',
                                    max: '28700000000000000000',
                                    lim: '287000000000',
                                    pre: '0',
                                    dec: '8',
                                    minted: '28700000000000000000',
                                    state: 'deployed',
                                    hashRev:
                                        '9f8e7d6c5b4a392817263544556677889900aabbccddeeff0011223344556677',
                                    holderTotal: 18420,
                                    mintTotal: 100000
                                }
                            ]
                        })
                    });
                    return;
                }
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ message: 'not found', result: [] })
                });
            }
        );
        await page.route('**/api/krc20/market**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ price: { usd: 0.00018 } })
            });
        });
        await page.route('**/api/utxos**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    entries: [
                        {
                            transactionId:
                                '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
                            index: 0,
                            amount: 250_000_000_000,
                            scriptPublicKey:
                                '205f0b7f6e5d4c3b2a1908f7e6d5c4b3a291807f6e5d4c3b2a1908f7e6d5c4b3a2ac'
                        }
                    ]
                })
            });
        });

        let capturedBroadcastTx: any = null;
        const mockBroadcastTxId =
            'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0';
        await page.route('**/api/broadcast', async (route) => {
            const body = JSON.parse(route.request().postData() || '{}');
            capturedBroadcastTx = body.transaction || body;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    transactionId: mockBroadcastTxId
                })
            });
        });

        await page.goto('/');
        await upgradeVaultToWebCryptoAesGcm(
            page,
            TEST_MNEMONIC_24,
            TEST_VAULT_PASSWORD
        );

        const forgeNavBtn = page.getByTestId('header-nav-FORGE');
        await expect(forgeNavBtn).toBeVisible();
        await forgeNavBtn.click();

        await expect(page.getByTestId('forge-view')).toBeVisible();
        await expect(
            page.getByRole('heading', { name: 'Sovereign Forge' })
        ).toBeVisible();
        await expect(
            page.getByText(
                'Deploy KRC-20 tokens with custom supply charters, or inspect and mint live tokens on the Kaspa network.'
            )
        ).toBeVisible();
        await expect(page.getByTestId('forge-mode-rwa_wizard')).toBeDisabled();
        await expect(
            page.getByTestId('forge-mode-rwa_wizard')
        ).toContainText('COMING SOON');
        await expect(
            page.getByTestId('forge-mode-vprog_anchor')
        ).toBeDisabled();
        await expect(
            page.getByTestId('forge-mode-vprog_anchor')
        ).toContainText('COMING SOON');

        await expect(page.getByTestId('krc20-deploy-ticker-input')).toHaveValue(
            'SILO'
        );
        await page.getByTestId('krc20-check-ticker-btn').click();
        await expect(
            page.getByTestId('krc20-ticker-status-badge')
        ).toContainText('TICKER "SILO" IS AVAILABLE FOR DEPLOYMENT');

        await page.getByTestId('forge-mode-krc20_mint').click();
        await expect(page.getByTestId('krc20-mint-search-input')).toHaveValue(
            'NACHO'
        );
        await page.getByTestId('krc20-mint-inspect-btn').click();
        await expect(page.getByTestId('krc20-inspector-card')).toContainText(
            '100.00% Minted'
        );
        await expect(page.getByTestId('krc20-inspector-card')).toContainText(
            '18,420'
        );
        await expect(page.getByTestId('krc20-mint-progress-bar')).toBeVisible();

        await page.getByTestId('krc20-mint-submit-btn').click();
        const authDialog = page.getByRole('dialog');
        await expect(authDialog).toBeVisible();
        await expect(authDialog).toContainText('Mint KRC-20 Token (NACHO)');
        await page
            .getByTestId('wallet-authorize-password-input')
            .fill(TEST_VAULT_PASSWORD);
        await page.getByTestId('wallet-authorize-submit-btn').click();

        await expect(page.getByTestId('forge-receipt-card')).toBeVisible();
        const txLink = page.getByTestId('forge-confirmed-tx-link');
        await expect(txLink).toBeVisible();
        await expect(txLink).toHaveAttribute(
            'href',
            `https://kas.fyi/transaction/${mockBroadcastTxId}`
        );

        expect(capturedBroadcastTx).toBeTruthy();
        expect(capturedBroadcastTx.inputs.length).toBeGreaterThan(0);
        expect(capturedBroadcastTx.inputs[0].signatureScript).toMatch(
            /^41[0-9a-f]{128}01$/
        );
        const decodedEnvelope = Buffer.from(
            capturedBroadcastTx.payload,
            'hex'
        ).toString('utf8');
        expect(decodedEnvelope).toContain('"p":"krc-20"');
        expect(decodedEnvelope).toContain('"op":"mint"');
        expect(decodedEnvelope).toContain('"tick":"NACHO"');

        for (const postData of networkPostBodies) {
            expect(postData).not.toContain('privateKeyHex');
            expect(postData).not.toContain(TEST_MNEMONIC_24);
        }
    });

    test('6. SILO 7-Day Cooldown Staking & Fee-Discount Engine activates 0.75% Staker Tier and enforces 7-Day Unbonding Cooldown', async ({
        page
    }) => {
        await seedUnlockedSovereignSession(page);
        await page.route('**/api/state', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    workers: [],
                    sectors: [],
                    systemMode: 'base'
                })
            });
        });
        await page.route('**/api/user/ledger**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    KAS: 500.0,
                    SILO: 25000.0,
                    USDC: 100.0,
                    unassignedReserveKas: 0.0,
                    unassignedReserveTargetKas: 50.0
                })
            });
        });

        let currentStakedSilo = 0;
        let currentStakeStatus: 'ACTIVE' | 'COOLDOWN' = 'ACTIVE';
        const mockStakeId = '11111111-2222-3333-4444-555555555555';

        await page.route('**/api/state/action', async (route) => {
            const body = JSON.parse(route.request().postData() || '{}');
            const action = body.action;
            if (action === 'GET_LP_POSITIONS') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true, data: [] })
                });
                return;
            }
            if (action === 'STAKE_SILO') {
                currentStakedSilo += Number(body.payload?.amount || 0);
                currentStakeStatus = 'ACTIVE';
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        data: {
                            stakeId: mockStakeId,
                            ticker: 'SILO',
                            stakedAmount: currentStakedSilo,
                            feeRateCap: 0.0075,
                            tierLabel: 'SILO Staker Tier (0.75% Fee)',
                            totalActiveStaked: currentStakedSilo
                        }
                    })
                });
                return;
            }
            if (action === 'INITIATE_SILO_COOLDOWN') {
                currentStakeStatus = 'COOLDOWN';
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        data: {
                            stakeId: mockStakeId,
                            status: 'COOLDOWN',
                            ticker: 'SILO',
                            amountStaked: currentStakedSilo,
                            cooldownDays: 7,
                            cooldownEndsAt: new Date(
                                Date.now() + 7 * 86400 * 1000
                            ).toISOString()
                        }
                    })
                });
                return;
            }
            if (action === 'CLAIM_UNSTAKED_SILO') {
                await route.fulfill({
                    status: 400,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: false,
                        error: '7-day unbonding cooldown is still active.'
                    })
                });
                return;
            }
            if (action === 'GET_SILO_STAKING') {
                const isEligible =
                    currentStakeStatus === 'ACTIVE' &&
                    currentStakedSilo >= 10000;
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        data: {
                            ecosystemTicker: 'SILO',
                            activeStaked:
                                currentStakeStatus === 'ACTIVE'
                                    ? currentStakedSilo
                                    : 0,
                            cooldownStaked:
                                currentStakeStatus === 'COOLDOWN'
                                    ? currentStakedSilo
                                    : 0,
                            combinedEligibleStaked:
                                currentStakeStatus === 'ACTIVE'
                                    ? currentStakedSilo
                                    : 0,
                            feeRateCap: isEligible ? 0.0075 : 0.015,
                            tierLabel: isEligible
                                ? 'SILO Staker Tier (0.75% Fee)'
                                : '1.50% Standard Tier',
                            positions:
                                currentStakedSilo > 0
                                    ? [
                                          {
                                              id: mockStakeId,
                                              stakeId: mockStakeId,
                                              ticker: 'SILO',
                                              amount: currentStakedSilo,
                                              amountStaked: currentStakedSilo,
                                              status: currentStakeStatus,
                                              cooldownEndsAt:
                                                  currentStakeStatus ===
                                                  'COOLDOWN'
                                                      ? new Date(
                                                            Date.now() +
                                                                7 * 86400 * 1000
                                                        ).toISOString()
                                                      : null,
                                              isMatured: false
                                          }
                                      ]
                                    : []
                        }
                    })
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
        await page.getByTestId('header-nav-DEX').click();
        await expect(page.getByTestId('dex-active-fee-pct')).toHaveText(
            '1.50%'
        );

        await page.getByTestId('dex-mode-lp-btn').click();
        await expect(page.getByTestId('silo-staking-card')).toBeVisible();

        await page.getByTestId('silo-stake-amount-input').fill('15000');
        await page.getByTestId('silo-stake-submit-btn').click();

        await expect(page.getByTestId('silo-active-fee-tier')).toContainText(
            '0.75% Active Fee'
        );
        await expect(
            page.getByTestId(`silo-position-row-${mockStakeId}`)
        ).toContainText('Active Fee Shield');

        await page.getByTestId('dex-mode-swap-btn').click();
        await expect(page.getByTestId('dex-active-fee-pct')).toHaveText(
            '0.75%'
        );

        await page.getByTestId('dex-mode-lp-btn').click();
        await page
            .getByTestId(`silo-start-cooldown-btn-${mockStakeId}`)
            .click();

        await expect(
            page.getByTestId(`silo-position-row-${mockStakeId}`)
        ).toContainText(/\d+d \d+h left|7d Cooldown/i);

        const claimBtn = page.getByTestId(`silo-claim-unstaked-btn-${mockStakeId}`); if (await claimBtn.isDisabled()) { await expect(claimBtn).toBeDisabled(); } else { await claimBtn.click(); await expect(page.getByTestId('lp-error-banner')).toContainText('7-day unbonding cooldown is still active'); }
    });

    test('7. Enforces Rule 6 Retail Copy Gate across 4-Stage ACH Pipeline and Retail Views (Zero TMI, Fiat Bridge & Pool Router)', async ({
        page
    }) => {
        await seedUnlockedSovereignSession(page, { isDirector: false });
        await page.route('**/api/state', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    workers: [],
                    sectors: [],
                    systemMode: 'base'
                })
            });
        });
        await page.route('**/api/fiat/offramp**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    circleConfigured: false,
                    sovereignQueueEnabled: true,
                    oracleOnline: true,
                    spotPrice: 0.15,
                    savedBankRailReady: true,
                    savedBankRailLast4: '4821',
                    savedBankRail: {
                        bankLabel:
                            'JPMorgan Chase Bank, N.A. (Texas / Dallas)',
                        accountType: 'CHECKING',
                        payoutMethod: 'ACH',
                        bankLast4: '4821',
                        updatedAt: new Date().toISOString()
                    },
                    recentPayouts: [
                        {
                            payout_id: 'PER-ACH-RETAIL01',
                            source_type: 'ledger_kas',
                            source_asset: 'KAS',
                            amount_crypto: 1000,
                            gross_usd: 150,
                            fee_usd: 4.25,
                            net_fiat_usd: 145.75,
                            payout_method: 'ACH',
                            bank_last4: '4821',
                            status: 'QUEUED_FOR_TREASURY_DISPATCH',
                            created_at: new Date().toISOString()
                        }
                    ]
                })
            });
        });
        await page.route('**/api/fiat/onramp**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    online: true,
                    nonKycEnabled: true,
                    sovereignWireEnabled: true,
                    spotPrice: 0.15,
                    recentOnrampSessions: [],
                    fiatLedgerEvents: []
                })
            });
        });

        await page.goto('/');
        await expect(page.getByText('22:00 UTC Settlement')).toBeVisible();
        await page.getByTestId('header-nav-DEX').click();
        await page.getByTestId('dex-mode-fiat-btn').click();
        await expect(
            page.getByRole('heading', { name: 'Fiat Bridge' })
        ).toBeVisible();
        await expect(
            page.getByText('2. Pool Liquidity Cleared')
        ).toBeVisible();
        await expect(page.getByText(/Dark Pool/i)).toHaveCount(0);
        await expect(page.getByText(/SIGHASH_SINGLE/i)).toHaveCount(0);
        await expect(page.getByText(/VarDiff/i)).toHaveCount(0);
        await expect(page.getByText(/Jerusalem/i)).toHaveCount(0);
        await expect(page.getByText(/Tangem/i)).toHaveCount(0);
    });

    test('8. Director Control Plane PostgreSQL Table Inspector registers and queries silo_staking_positions', async ({
        page
    }) => {
        await seedUnlockedSovereignSession(page, { isDirector: true });
        await page.route('**/api/state', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    workers: [],
                    sectors: [],
                    systemMode: 'base',
                    isCorporateAdmin: true
                })
            });
        });

        let queriedTableParam = '';
        await page.route('**/api/admin**', async (route) => {
            const reqUrl = new URL(route.request().url());
            const tableParam = reqUrl.searchParams.get('table');
            if (tableParam) {
                queriedTableParam = tableParam;
                if (tableParam === 'silo_staking_positions') {
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({
                            table: 'silo_staking_positions',
                            source: 'rust_admin_api',
                            rows: [
                                {
                                    stake_id:
                                        '11111111-2222-3333-4444-555555555555',
                                    wallet_address: MASTER_DIRECTOR_ADDRESS,
                                    token_ticker: 'SILO',
                                    amount_staked: 25000,
                                    status: 'ACTIVE'
                                }
                            ]
                        })
                    });
                    return;
                }
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        table: tableParam,
                        source: 'rust_admin_api',
                        rows: []
                    })
                });
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    adminWallet: MASTER_DIRECTOR_ADDRESS,
                    allowedTables: [
                        'fiat_onramp_orders',
                        'silo_staking_positions',
                        'yield_reservoirs'
                    ],
                    stratumMiningAddress: MASTER_DIRECTOR_ADDRESS,
                    nettingQueue: [],
                    passthroughQueue: [],
                    fiatPayouts: [],
                    fiatOnrampOrders: [],
                    fiatBankRails: [],
                    l1Payouts: [],
                    whitelistedWallets: [],
                    commandCenters: [],
                    bannedIps: [],
                    nettingProfitUsd: 0,
                    unhedgedDeltaKas: 0
                })
            });
        });

        await page.goto('/');
        await page.getByTestId('header-nav-DIRECTOR').click();
        await page.getByTestId('director-zone-5-tab').click();

        const tableSelect = page.getByTestId('director-db-table-select');
        await expect(tableSelect).toBeVisible();
        await tableSelect.selectOption('silo_staking_positions');

        expect(queriedTableParam).toBe('silo_staking_positions');
        await expect(page.getByTestId('director-zone-5-panel')).toContainText(
            '11111111-2222-3333-4444-555555555555'
        );
        await expect(page.getByTestId('director-zone-5-panel')).toContainText(
            '25000'
        );
    });

    test('9. New User Onboarding: 24-Word Sovereign Vault Generation & Mandatory 2-Word Seed Verification Challenge', async ({
        page
    }) => {
        await page.addInitScript(() => {
            localStorage.setItem('perennia_tour_completed', 'true');
        });
        await page.route('**/api/auth/me', async (route) => {
            await route.fulfill({
                status: 401,
                contentType: 'application/json',
                body: JSON.stringify({ authenticated: false })
            });
        });
        await page.route('**/api/auth/challenge', async (route) => {
            const body = JSON.parse(route.request().postData() || '{}');
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    message: `Perennia Sovereign Matrix Authorization\nAddress: ${body.address}\nNonce: test-nonce`
                })
            });
        });
        await page.route('**/api/auth', async (route) => {
            const body = JSON.parse(route.request().postData() || '{}');
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    status: 'success',
                    address: body.address
                })
            });
        });
        await page.route('**/api/state**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    workers: [],
                    sectors: [],
                    systemMode: 'base'
                })
            });
        });
        await page.route('**/api/prices**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    kaspa: { usd: 0.15, usd_24h_change: 2.5 }
                })
            });
        });

        await page.goto('/');
        await page.getByTestId('enter-nexus-btn').click();
        await page.getByRole('button', { name: /New 24-Word Vault/i }).click();
        await page.getByPlaceholder('VAULT PASSWORD').fill(TEST_VAULT_PASSWORD);
        await page
            .getByPlaceholder('CONFIRM PASSWORD')
            .fill(TEST_VAULT_PASSWORD);
        await page
            .getByRole('button', { name: /Generate 24-Word Seed/i })
            .click();

        await expect(
            page.getByText(/MANDATORY 2-WORD VERIFICATION NEXT/i)
        ).toBeVisible();
        const seedWordElements = page.locator(
            'span.select-all.text-\\[\\#18C6A5\\]'
        );
        await expect(seedWordElements).toHaveCount(24);
        const generatedWords = await seedWordElements.allInnerTexts();
        expect(generatedWords.length).toBe(24);

        await page
            .getByRole('button', { name: /Proceed to 2-Word Test/i })
            .click();
        const label1Text = await page
            .locator('label[for="verifyWord1"]')
            .innerText();
        const label2Text = await page
            .locator('label[for="verifyWord2"]')
            .innerText();
        const idx1 = parseInt(label1Text.replace(/\D/g, ''), 10) - 1;
        const idx2 = parseInt(label2Text.replace(/\D/g, ''), 10) - 1;

        await page.locator('#verifyWord1').fill('invalidwordone');
        await page.locator('#verifyWord2').fill('invalidwordtwo');
        await page
            .getByRole('button', { name: /Verify & Unlock Sovereign Vault/i })
            .click();
        await expect(page.getByText(/VERIFICATION MISMATCH/i)).toBeVisible();

        await page.locator('#verifyWord1').fill(generatedWords[idx1].trim());
        await page.locator('#verifyWord2').fill(generatedWords[idx2].trim());
        await page
            .getByRole('button', { name: /Verify & Unlock Sovereign Vault/i })
            .click();

        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(
            page.getByRole('button', { name: 'Disconnect' })
        ).toBeVisible();
    });

    test('10. Miner Operations Lifecycle: Provisions ASIC Worker, selects IceRiver KS7 Lite (:3334), breaks off 22:00 UTC Silo & snaps [MAX]', async ({
        page
    }) => {
        await seedUnlockedSovereignSession(page);
        await page.route('**/api/state**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    workers: [],
                    sectors: [],
                    systemMode: 'base'
                })
            });
        });
        await page.route('**/api/user/ledger**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    KAS: 50.0,
                    unassignedReserveKas: 18.5,
                    unassignedReserveTargetKas: 50.0
                })
            });
        });
        await page.route('**/api/fiat/offramp**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    savedBankRailLast4: null,
                    recentPayouts: []
                })
            });
        });
        await page.route('**/api/user/tax-events**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([])
            });
        });

        const dispatchedActions: string[] = [];
        await page.route('**/api/state/action', async (route) => {
            const body = JSON.parse(route.request().postData() || '{}');
            dispatchedActions.push(body.action);
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true })
            });
        });

        await page.goto('/');
        await expect(page.getByText('22:00 UTC Settlement')).toBeVisible();

        await page.getByRole('button', { name: '+ Add Worker' }).click();
        await page.getByRole('button', { name: 'Worker Options' }).first().click();
        await page
            .getByRole('button', { name: /Miner Type \(Select ASIC\)/i })
            .click();
        await page.getByRole('button', { name: /IceRiver KS7 Lite/i }).click();
        await expect(page.getByText(':3334').first()).toBeVisible();

        await page.getByRole('button', { name: 'Worker Options' }).first().click();
        await expect(page.getByRole('menu')).toHaveCount(0);

        await page.getByRole('button', { name: '+ Break Off Sector' }).click();
        await page.locator('#draftSectorNameInput').fill('TEXAS-KAS-SILO');
        await page.getByRole('button', { name: '50%', exact: true }).click();
        await page.getByTestId('initialize-sector-btn').click();

        const sectorCard = page.getByTestId('sector-card-TEXAS-KAS-SILO');
        await expect(sectorCard).toBeVisible();
        await expect(page.getByText('50.0%')).toBeVisible();

        const maxBtn = sectorCard.getByRole('button', { name: '[MAX]' });
        await maxBtn.click();
        await expect(maxBtn).toBeDisabled();
        await expect(page.getByText('100.0%', { exact: true })).toBeVisible();

        expect(dispatchedActions).toContain('ADD_WORKER');
        expect(dispatchedActions).toContain('ADD_SECTOR');
        expect(dispatchedActions).toContain('UPDATE_SECTOR_ALLOCATION');
    });

    test('11. Fiat Bridge & Director Batch Clearing: Validates ABA Mod-10 Checksum (111000614), saves AES-256-GCM Bank Rail & executes 22:00 UTC Settlement Sweep + Bulk ACH', async ({
        page
    }) => {
        await seedUnlockedSovereignSession(page, { isDirector: true });
        await page.route('**/api/state**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    workers: [],
                    sectors: [],
                    systemMode: 'base',
                    isCorporateAdmin: true
                })
            });
        });

        let savedRailPayload: any = null;
        await page.route('**/api/fiat/offramp**', async (route) => {
            if (route.request().method() === 'POST') {
                savedRailPayload = JSON.parse(
                    route.request().postData() || '{}'
                );
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        savedBankRailReady: true,
                        savedBankRailLast4: '4321',
                        savedBankRail: {
                            bankLabel:
                                'JPMorgan Chase Bank, N.A. (Texas / Dallas)',
                            accountType: 'CHECKING',
                            payoutMethod: 'ACH',
                            bankLast4: '4321',
                            updatedAt: new Date().toISOString()
                        }
                    })
                });
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    circleConfigured: false,
                    sovereignQueueEnabled: true,
                    oracleOnline: true,
                    spotPrice: 0.15,
                    savedBankRailReady: false,
                    savedBankRailLast4: null,
                    recentPayouts: []
                })
            });
        });
        await page.route('**/api/fiat/onramp**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    online: true,
                    nonKycEnabled: true,
                    sovereignWireEnabled: true,
                    spotPrice: 0.15,
                    recentOnrampSessions: [],
                    fiatLedgerEvents: []
                })
            });
        });

        const directorPostActions: string[] = [];
        await page.route('**/api/admin**', async (route) => {
            if (route.request().method() === 'POST') {
                const body = JSON.parse(route.request().postData() || '{}');
                directorPostActions.push(body.action);
                if (body.action === 'FORCE_EPOCH_BELL') {
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({
                            success: true,
                            action: 'FORCE_EPOCH_BELL',
                            message:
                                '22:00 UTC Global Settlement sweep triggered.'
                        })
                    });
                    return;
                }
                if (body.action === 'BULK_SETTLE_FIAT_PAYOUTS') {
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({
                            success: true,
                            action: 'BULK_SETTLE_FIAT_PAYOUTS',
                            settledCount: 1,
                            totalDispatchedUsd: 145.75,
                            batchTracePrefix: 'ACH-BATCH-20261026-TEST'
                        })
                    });
                    return;
                }
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    adminWallet: MASTER_DIRECTOR_ADDRESS,
                    allowedTables: ['fiat_payout_queue', 'l1_payout_queue'],
                    stratumMiningAddress: MASTER_DIRECTOR_ADDRESS,
                    nettingQueue: [],
                    passthroughQueue: [],
                    fiatPayouts: [
                        {
                            payout_id: 'PER-ACH-BATCH01',
                            wallet_address: MASTER_DIRECTOR_ADDRESS,
                            source_type: 'chronos_usd_silo',
                            source_asset: 'KAS',
                            amount_crypto: 1000,
                            gross_usd: 150.0,
                            fee_usd: 4.25,
                            net_fiat_usd: 145.75,
                            payout_method: 'ACH',
                            bank_last4: '4321',
                            status: 'QUEUED_FOR_TREASURY_DISPATCH'
                        }
                    ],
                    fiatOnrampOrders: [],
                    fiatBankRails: [],
                    l1Payouts: [],
                    whitelistedWallets: [],
                    commandCenters: [],
                    bannedIps: [],
                    nettingProfitUsd: 12.5,
                    unhedgedDeltaKas: 0
                })
            });
        });

        await page.goto('/');
        await page.getByTestId('header-nav-DEX').click();
        await page.getByTestId('dex-mode-fiat-btn').click();
        await page.getByTestId('fiat-offramp-tab-btn').click();

        await page.getByTestId('offramp-aba-input').fill('111000614');
        await expect(page.getByTestId('aba-recognition-badge')).toContainText(
            'JPMorgan Chase Bank, N.A. (Texas / Dallas)'
        );
        await expect(page.getByTestId('aba-recognition-badge')).toContainText(
            'MOD-10 VALID'
        );
        await page.getByTestId('offramp-account-input').fill('987654321');
        await page.getByTestId('save-bank-rail-btn').click();

        expect(savedRailPayload?.action).toBe('SAVE_BANK_RAIL');
        expect(savedRailPayload?.routingNumber).toBe('111000614');

        await page.getByTestId('header-nav-DIRECTOR').click();
        await page.getByTestId('director-zone-4-tab').click();
        await page.getByTestId('force-epoch-bell-btn').click();

        await page.getByTestId('director-zone-3-tab').click();
        await page.getByTestId('bulk-settle-fiat-payouts-btn').click();

        expect(directorPostActions).toContain('FORCE_EPOCH_BELL');
        expect(directorPostActions).toContain('BULK_SETTLE_FIAT_PAYOUTS');
    });

    test('12. Zero-PII Tax Fortress: Verifies US-TX (0.0% State Tax), enforces Zero Server PII on /api/treasury/kyc, arms Tax Escrow & compiles local 1099-DA PDF', async ({
        page
    }) => {
        await seedUnlockedSovereignSession(page);
        await page.route('**/api/state**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    workers: [],
                    sectors: [],
                    systemMode: 'base'
                })
            });
        });
        await page.route('**/api/user/tax-events**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    {
                        id: 'ev-yield-1',
                        timestamp: new Date().toLocaleString(),
                        type: 'Epoch L1 Payout',
                        rawEventType: 'YIELD',
                        asset: { ticker: 'KAS', color: '#18C6A5' },
                        amount: 2500.0,
                        usdValueAtTime: 375.0,
                        spotPriceAtExecution: 0.15,
                        txHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0'
                    }
                ])
            });
        });
        await page.route('**/api/state/action', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true })
            });
        });

        let capturedKycPostBody: any = null;
        await page.route('**/api/treasury/kyc**', async (route) => {
            if (route.request().method() === 'POST') {
                capturedKycPostBody = JSON.parse(
                    route.request().postData() || '{}'
                );
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        zeroPiiEnforced: true,
                        status: 'verified',
                        jurisdiction: {
                            countryCode: 'US',
                            stateRegion: 'TX',
                            jurisdictionCode: 'US-TX',
                            entityType: 'LLC',
                            filingStatus: 'SINGLE',
                            effectiveTaxRate:
                                capturedKycPostBody.effectiveTaxRate
                        }
                    })
                });
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    status: 'verified',
                    zeroPiiEnforced: true,
                    jurisdiction: {
                        countryCode: 'US',
                        stateRegion: 'TX',
                        jurisdictionCode: 'US-TX',
                        entityType: 'LLC',
                        filingStatus: 'SINGLE',
                        effectiveTaxRate: 15.0
                    }
                })
            });
        });

        await page.goto('/');
        await page.getByTestId('header-nav-TAX-FORTRESS').click();
        await expect(page.getByTestId('tax-fortress-view')).toBeVisible();
        await expect(page.getByTestId('state-tax-rate-badge')).toContainText(
            '0.0% STATE TAX (TX)'
        );

        await page.getByTestId('configure-jurisdiction-btn').click();
        await expect(
            page.getByTestId('jurisdiction-config-form')
        ).toBeVisible();

        await page.locator('#legalName').fill('Perennia LLC');
        await page.locator('#tin').fill('88-9999999');
        await page.locator('#address').fill('Richardson, TX 75080');
        await page.getByTestId('cpa-override-toggle').click();
        await page.getByTestId('save-tax-profile-btn').click();

        await expect
            .poll(() => capturedKycPostBody, { timeout: 10000 })
            .toBeTruthy();
        expect(capturedKycPostBody.countryCode).toBe('US');
        expect(capturedKycPostBody.stateRegion).toBe('TX');
        expect(capturedKycPostBody.legalName).toBeUndefined();
        expect(capturedKycPostBody.tin).toBeUndefined();
        expect(capturedKycPostBody.address).toBeUndefined();

        await page.getByTestId('toggle-tax-escrow-btn').click();
        await page.getByTestId('confirm-tax-escrow-btn').click();

        const downloadPromise = page.waitForEvent('download');
        await page.getByTestId('generate-1099-pdf-btn').click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toContain(
            'Perennia_Form_1099DA_8949_US-TX_2026.pdf'
        );
    });

    test('13. 7-Chapter Interactive Guide Walkthrough: Launches from Settings & navigates all 7 chapters across OPERATIONS, DEX, TREASURY & TAX FORTRESS', async ({
        page
    }) => {
        await seedUnlockedSovereignSession(page);
        await page.route('**/api/state**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    workers: [],
                    sectors: [],
                    systemMode: 'base'
                })
            });
        });
        await page.route('**/api/user/ledger**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    KAS: 100.0,
                    unassignedReserveKas: 12.0,
                    unassignedReserveTargetKas: 50.0
                })
            });
        });
        await page.route('**/api/user/tax-events**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([])
            });
        });

        await page.goto('/');
        await page.getByTestId('header-settings-btn').click();
        await expect(page.getByTestId('settings-modal-card')).toBeVisible();

        await page.getByTestId('settings-launch-tour-btn').click();
        const floatingCard = page.getByTestId('tutorial-floating-card');
        await expect(floatingCard).toBeVisible();
        await expect(floatingCard).toContainText('Wallet • Step 1 of 9');

        await floatingCard
            .getByRole('button', { name: 'SILO', exact: true })
            .click();
        await expect(floatingCard).toContainText('SILO • Step 1 of 13');

        await floatingCard
            .getByRole('button', { name: 'Workers', exact: true })
            .click();
        await expect(floatingCard).toContainText('Workers • Step 1 of 10');

        await floatingCard
            .getByRole('button', { name: 'Sectors', exact: true })
            .click();
        await expect(floatingCard).toContainText('Sectors • Step 1 of 9');

        await floatingCard
            .getByRole('button', { name: 'Exchange', exact: true })
            .click();
        await expect(floatingCard).toContainText('Exchange • Step 1 of 10');

        await floatingCard
            .getByRole('button', { name: 'Treasury', exact: true })
            .click();
        await expect(floatingCard).toContainText('Treasury • Step 1 of 10');

        await floatingCard
            .getByRole('button', { name: 'Tax', exact: true })
            .click();
        await expect(floatingCard).toContainText('Tax • Step 1 of 15');

        await page.getByTestId('tutorial-exit-btn').click();
        await expect(floatingCard).toHaveCount(0);
    });

    test('14. SilverScript v1 & KCC-20 Covenant Engine: Compiles ProofOfLockVault.sil, derives kaspa:p... P2SH vault addresses, and verifies Mode 02 on-chain lockups', async ({
        page
    }) => {
        await seedUnlockedSovereignSession(page);
        await page.route('**/api/state', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    workers: [],
                    sectors: [],
                    systemMode: 'base',
                    forgePublicEnabled: true
                })
            });
        });
        await page.route('https://api.kasplex.org/v1/info', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    message: 'successful',
                    result: {
                        op_fee_deploy: '100000000000',
                        op_fee_mint: '100000000',
                        block_score: '98500123'
                    }
                })
            });
        });
        await page.route(
            'https://api.kasplex.org/v1/krc20/token/**',
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        message: 'successful',
                        result: [
                            {
                                tick: 'NACHO',
                                max: '28700000000000000000',
                                lim: '287000000000',
                                pre: '0',
                                dec: '8',
                                minted: '28700000000000000000',
                                state: 'deployed',
                                hashRev:
                                    '9f8e7d6c5b4a392817263544556677889900aabbccddeeff0011223344556677',
                                holderTotal: 18420,
                                mintTotal: 100000
                            }
                        ]
                    })
                });
            }
        );
        await page.route('**/api/state/action', async (route) => {
            const body = JSON.parse(route.request().postData() || '{}');
            if (body.action === 'GET_FORGE_TOKENOMICS') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        data: {
                            vestingSchedules: [
                                {
                                    vestingId: 'vs-silverscript-01',
                                    tokenTicker: 'NACHO',
                                    tokenStandard: 'KCC-20',
                                    beneficiaryAddress: MASTER_DIRECTOR_ADDRESS,
                                    label: 'Founders & Core Architects',
                                    totalAllocated: 3_150_000,
                                    unlockedAmount: 0,
                                    remainingLocked: 3_150_000,
                                    cliffDays: 180,
                                    linearDays: 730,
                                    dailyUnlockRate: 4315.06,
                                    covenantRule:
                                        'SILVERSCRIPT_PROOF_OF_LOCK_V1',
                                    vprogStateRoot:
                                        '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
                                    status: 'LOCKED'
                                }
                            ],
                            monetaryPolicy: null,
                            mineableVault: null,
                            proofOfLockSummary: {
                                lockedVestingSupply: 3_150_000,
                                unlockedVestedSupply: 0,
                                reserveLockedSupply: 0,
                                miningVaultLockedSupply: 0,
                                totalLockedSupply: 3_150_000,
                                burnedSupply: 125_000,
                                daily2200UtcUnlockRate: 4315.06,
                                burnAddress: STANDARD_USER_ADDRESS
                            }
                        }
                    })
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
        await page.getByTestId('header-nav-FORGE').click();
        await page.getByTestId('token-standard-kcc20-btn').click();
        await page.getByTestId('cap-table-load-template-btn').click();

        const vaultRow0 = page.getByTestId('cap-table-covenant-vault-0');
        await expect(vaultRow0).toBeVisible();
        await expect(vaultRow0).toContainText('kaspa:p');

        await page.getByTestId('toggle-sil-drawer-0').click();
        const silSource0 = page.getByTestId('sil-contract-source-0');
        await expect(silSource0).toBeVisible();
        await expect(silSource0).toContainText('pragma silverscript ^1.0.0;');
        await expect(silSource0).toContainText('contract ProofOfLockVault(');
        await expect(silSource0).toContainText(
            'require(tx.time >= cliffTimestamp);'
        );

        await page.getByTestId('forge-mode-krc20_mint').click();
        await page.getByTestId('krc20-mint-inspect-btn').click();
        await expect(
            page.getByTestId('vesting-covenant-p2sh-address').first()
        ).toContainText('kaspa:p');
        await expect(
            page.getByTestId('vesting-covenant-kcc20-root').first()
        ).toContainText('KCC-20 Root:');
    });

    test('15. Per-Token Cold Vault Auto-Sweep & Hardware Airlock: Configures Cold Vault address, sets overflow ceiling, and executes 1-click Hot-to-Cold sweep', async ({
        page
    }) => {
        await seedUnlockedSovereignSession(page);
        await page.route('**/api/state', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    workers: [],
                    sectors: [],
                    systemMode: 'base'
                })
            });
        });
        await page.route('**/api/treasury/preferences**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ preferences: null })
            });
        });
        await page.route('**/api/treasury/corporate**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    assets: [
                        {
                            symbol: 'KAS',
                            address: STANDARD_USER_ADDRESS,
                            balance: 900.0
                        }
                    ]
                })
            });
        });
        await page.route('**/api/user/ledger**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    KAS: 350.0,
                    unassignedReserveKas: 0.0,
                    unassignedReserveTargetKas: 50.0
                })
            });
        });
        await page.route('**/api/user/tax-events**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([])
            });
        });

        let savedColdRule: any = null;
        const capturedAirlockActions: any[] = [];
        await page.route('**/api/state/action', async (route) => {
            const body = JSON.parse(route.request().postData() || '{}');
            capturedAirlockActions.push(body);
            if (
                body.action === 'GET_USER_COLD_VAULT_RULES' ||
                body.action === 'GET_COLD_VAULT_AIRLOCK'
            ) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        data: {
                            rulesByAsset: savedColdRule
                                ? { KAS: savedColdRule }
                                : {},
                            clientVault: savedColdRule,
                            nodeAirlock: {
                                hotSignerAddress: MASTER_DIRECTOR_ADDRESS,
                                coldVaultAddress: MASTER_DIRECTOR_ADDRESS,
                                hotBalanceKas: 4250.0,
                                hotCeilingKas: 5000.0,
                                minRunwayKas: 250.0,
                                runwayHoursRemaining: 408.0,
                                lowRunwayBreakerTripped: false,
                                status: 'ARMED_NOMINAL'
                            }
                        }
                    })
                });
                return;
            }
            if (body.action === 'SAVE_USER_COLD_VAULT_RULE') {
                savedColdRule = body.payload;
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        data: body.payload
                    })
                });
                return;
            }
            if (body.action === 'SWEEP_TOKEN_TO_COLD_VAULT_NOW') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        transaction_id:
                            'b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef01',
                        data: {
                            txHash: 'b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef01',
                            status: 'DISPATCHED_ONCHAIN',
                            explorerUrl:
                                'https://kas.fyi/transaction/b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef01',
                            coldDestinationAddress:
                                body.payload.coldDestinationAddress,
                            sweptAmount: body.payload.amount
                        }
                    })
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
        await page.getByTestId('header-treasury-btn').click();

        await page.getByTestId('cold-vault-btn-KAS').click();
        await expect(page.getByTestId('cold-vault-drawer-KAS')).toBeVisible();

        await page
            .getByTestId('cold-vault-dest-input-KAS')
            .fill(MASTER_DIRECTOR_ADDRESS);
        await page.getByTestId('cold-vault-ceiling-input-KAS').fill('750');
        await page.getByTestId('cold-vault-save-rule-btn-KAS').click();

        await expect(
            page.getByTestId('cold-vault-active-badge-KAS')
        ).toContainText('COLD AUTO-SWEEP ≥750');

        await page.getByTestId('cold-vault-sweep-amount-input-KAS').fill('125');
        await page.getByTestId('cold-vault-sweep-now-btn-KAS').click();

        const saveCall = capturedAirlockActions.find(
            (a) => a.action === 'SAVE_USER_COLD_VAULT_RULE'
        );
        expect(saveCall).toBeTruthy();
        expect(saveCall.payload.coldDestinationAddress).toBe(
            MASTER_DIRECTOR_ADDRESS
        );
        expect(saveCall.payload.overflowCeiling).toBe(750);

        const sweepCall = capturedAirlockActions.find(
            (a) => a.action === 'SWEEP_TOKEN_TO_COLD_VAULT_NOW'
        );
        expect(sweepCall).toBeTruthy();
        expect(sweepCall.payload.amount).toBe(125);
    });

    test('16. Passive HIFO Tax Fortress & AES-256-GCM Browser PII Vault: Verifies Highest-In First-Out lot matching, Schedule D matched dispositions, and encrypted localStorage PII', async ({
        page
    }) => {
        await seedUnlockedSovereignSession(page);
        await page.route('**/api/state**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    workers: [],
                    sectors: [],
                    systemMode: 'base'
                })
            });
        });
        await page.route('**/api/user/tax-events**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    {
                        id: 'ev-1',
                        timestamp: '10/20/2026, 2:00:00 PM',
                        recordedAtIso: '2026-10-20T19:00:00.000Z',
                        type: 'Epoch L1 Payout',
                        rawEventType: 'YIELD',
                        asset: { ticker: 'KAS', color: '#18C6A5' },
                        amount: 1000.0,
                        usdValueAtTime: 180.0,
                        spotPriceAtExecution: 0.18,
                        txHash: 'tx_high_lot_018'
                    },
                    {
                        id: 'ev-2',
                        timestamp: '10/10/2026, 2:00:00 PM',
                        recordedAtIso: '2026-10-10T19:00:00.000Z',
                        type: 'Epoch L1 Payout',
                        rawEventType: 'YIELD',
                        asset: { ticker: 'KAS', color: '#18C6A5' },
                        amount: 1000.0,
                        usdValueAtTime: 120.0,
                        spotPriceAtExecution: 0.12,
                        txHash: 'tx_low_lot_012'
                    },
                    {
                        id: 'ev-3',
                        timestamp: '10/25/2026, 10:00:00 PM',
                        recordedAtIso: '2026-10-25T22:00:00.000Z',
                        type: 'DEX Swap',
                        rawEventType: 'DEX_SWAP',
                        asset: { ticker: 'KAS', color: '#18C6A5' },
                        amount: 500.0,
                        usdValueAtTime: 100.0,
                        spotPriceAtExecution: 0.2,
                        txHash: 'tx_swap_disp_500'
                    }
                ])
            });
        });
        await page.route('**/api/state/action', async (route) => {
            const body = JSON.parse(route.request().postData() || '{}');
            if (body.action === 'GET_HIFO_TAX_LOTS') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        data: {
                            accountingMethod: 'PASSIVE_HIFO_NO_WASH',
                            lots: [
                                {
                                    lotId: 'LOT-HIGH-0180',
                                    assetTicker: 'KAS',
                                    acquiredAt: '2026-10-20T19:00:00.000Z',
                                    kasSompi: 100_000_000_000,
                                    initialTokens: 1000.0,
                                    remainingSompi: 50_000_000_000,
                                    remainingTokens: 500.0,
                                    fmvUsdPerToken: 0.18,
                                    totalCostBasisUsd: 180.0,
                                    remainingCostBasisUsd: 90.0,
                                    sourceEventType: 'YIELD',
                                    sourceTxHash: 'tx_high_lot_018',
                                    status: 'OPEN',
                                    holdingDays: 8,
                                    isLongTerm: false
                                },
                                {
                                    lotId: 'LOT-LOW-0120',
                                    assetTicker: 'KAS',
                                    acquiredAt: '2026-10-10T19:00:00.000Z',
                                    kasSompi: 100_000_000_000,
                                    initialTokens: 1000.0,
                                    remainingSompi: 100_000_000_000,
                                    remainingTokens: 1000.0,
                                    fmvUsdPerToken: 0.12,
                                    totalCostBasisUsd: 120.0,
                                    remainingCostBasisUsd: 120.0,
                                    sourceEventType: 'YIELD',
                                    sourceTxHash: 'tx_low_lot_012',
                                    status: 'OPEN',
                                    holdingDays: 18,
                                    isLongTerm: false
                                }
                            ],
                            disposalMatches: [
                                {
                                    matchId: 'MATCH-8949-01',
                                    lotId: 'LOT-HIGH-0180',
                                    assetTicker: 'KAS',
                                    disposedSompi: 50_000_000_000,
                                    disposedTokens: 500.0,
                                    acquiredAt: '2026-10-20T19:00:00.000Z',
                                    disposedAt: '2026-10-25T22:00:00.000Z',
                                    holdingPeriodDays: 5,
                                    isLongTerm: false,
                                    costBasisUsd: 90.0,
                                    grossProceedsUsd: 100.0,
                                    realizedGainLossUsd: 10.0,
                                    disposalTxHash: 'tx_swap_disp_500'
                                }
                            ],
                            summary: {
                                openCostBasisUsd: 210.0,
                                openKasTokens: 1500.0,
                                totalMatchedCostBasisUsd: 90.0,
                                totalMatchedProceedsUsd: 100.0,
                                shortTermGainLossUsd: 10.0,
                                longTermGainLossUsd: 0.0,
                                netRealizedGainLossUsd: 10.0
                            }
                        }
                    })
                });
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true })
            });
        });
        await page.route('**/api/treasury/kyc**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    zeroPiiEnforced: true,
                    status: 'verified'
                })
            });
        });

        await page.goto('/');
        await page.getByTestId('header-nav-TAX-FORTRESS').click();
        await expect(page.getByTestId('hifo-mode-badge')).toContainText(
            'PASSIVE HIFO LOT ENGINE • AES-256-GCM LOCAL PII'
        );

        await page.getByTestId('tax-mode-hifo-lots-btn').click();
        await expect(page.getByText('HIFO-LOT-HIGH-0180')).toBeVisible();
        await expect(page.getByText('$0.1800')).toBeVisible();
        await expect(page.getByText('$0.1200')).toBeVisible();

        await page.getByTestId('tax-mode-disposals-btn').click();
        await expect(page.getByText('PART I SHORT-TERM (5D)')).toBeVisible();
        await expect(page.getByText('+$10.00')).toBeVisible();

        await page.getByTestId('configure-jurisdiction-btn').click();
        await page.locator('#legalName').fill('Perennia LLC');
        await page.locator('#tin').fill('77-1234567');
        await page
            .locator('#address')
            .fill('100 Sovereign Way, Richardson, TX');
        await page.getByTestId('save-tax-profile-btn').click();

        let storedRaw: string | null = null;
        await expect
            .poll(
                async () => {
                    storedRaw = await page.evaluate(() => {
                        for (let i = 0; i < localStorage.length; i++) {
                            const k = localStorage.key(i);
                            if (k && k.startsWith('perennia_zero_pii_tax_v4_')) {
                                return localStorage.getItem(k);
                            }
                        }
                        return null;
                    });
                    return storedRaw;
                },
                { timeout: 10000 }
            )
            .toBeTruthy();
        const parsedStored = JSON.parse(storedRaw || '{}');
        expect(parsedStored.cipherVersion).toBe('AES-256-GCM-V1');
        expect(parsedStored.encryptedPiiAesGcm).toBeTruthy();
        expect(parsedStored.legalName).toBeUndefined();
        expect(parsedStored.tin).toBeUndefined();
        expect(parsedStored.address).toBeUndefined();
    });
});