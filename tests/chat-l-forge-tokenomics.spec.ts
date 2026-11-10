import { test, expect, type Page } from '@playwright/test';
import { Buffer } from 'node:buffer';

const TEST_MNEMONIC_24 =
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art';
const TEST_VAULT_PASSWORD = 'PerenniaSovereignVaultPassword2026!';
const MASTER_DIRECTOR_ADDRESS =
    'kaspa:qpra8t9ul8hd7n9pvw4td6ax3unlf2vyc2fz5t9p9yalhsnk7qkaknp24lpm7';
const KASPA_BURN_ADDRESS =
    'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e';

async function seedUnlockedSovereignSession(
    page: Page,
    options?: { isDirector?: boolean }
) {
    const kaspaAddress = options?.isDirector
        ? MASTER_DIRECTOR_ADDRESS
        : 'kaspa:qpra8t9ul8hd7n9pvw4td6ax3unlf2vyc2fz5t9p9yalhsnk7qkaknp24lpm7';

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
                address: kaspaAddress,
                isCorporateAdmin: Boolean(options?.isDirector),
                masterTreasuryAddress: MASTER_DIRECTOR_ADDRESS
            })
        });
    });

    await page.route('**/api/balance**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                balance: 4250.5
            })
        });
    });

    await page.route('**/api/prices/rwa**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                count: 4,
                assets: [
                    { ticker: 'SPY', assetClass: 'EQUITY', price: '585.40', spotPrice: 585.4, change24h: 0.85 },
                    { ticker: 'NVDA', assetClass: 'EQUITY', price: '142.80', spotPrice: 142.8, change24h: 2.4 },
                    { ticker: 'XAU', assetClass: 'COMMODITY', price: '2745.00', spotPrice: 2745.0, change24h: 0.6 },
                    { ticker: 'USTB', assetClass: 'TREASURY', price: '104.25', spotPrice: 104.25, change24h: 0.05 }
                ]
            })
        });
    });

    await page.route('**/api/prices**', async (route) => {
        if (route.request().url().includes('/api/prices/rwa')) {
            await route.fallback();
            return;
        }
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
            const existingRaw = localStorage.getItem('perennia_sovereign_payload');
            const parsed = existingRaw ? JSON.parse(existingRaw) : {};
            parsed.vault = window.btoa(binary);
            localStorage.setItem('perennia_sovereign_payload', JSON.stringify(parsed));
        },
        { seedPhrase: mnemonic, pass: password }
    );
}

test.describe('Chat L — The Sovereign Forge v5: Modular Tokenomics Studio, Multi-Wallet Cap Tables, Proof-of-Lock, Auto-Burns & Mineable KRC-20s', () => {
    test('1. Deliverables L1, L3 & L5: Builds Multi-Wallet Cap Table with 1-Click CSV Bech32m Validation, configures Auto-Burn + Chromatic Emissions + Zero-Rug 365D LP, and executes chained client-side Deploy + Fan-Out Transfers', async ({
        page
    }) => {
        await seedUnlockedSovereignSession(page, { isDirector: true });

        await page.route('**/api/state', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ workers: [], sectors: [], systemMode: 'base' })
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
                        block_score: '99123456'
                    }
                })
            });
        });

        await page.route('https://api.kasplex.org/v1/krc20/token/**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    message: 'successful',
                    result: [{ tick: 'BEDRCK', max: '0', state: 'unused' }]
                })
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
                            amount: 500_000_000_000,
                            scriptPublicKey:
                                '205f0b7f6e5d4c3b2a1908f7e6d5c4b3a291807f6e5d4c3b2a1908f7e6d5c4b3a2ac'
                        }
                    ]
                })
            });
        });

        const broadcastedPayloads: string[] = [];
        let txCounter = 0;
        await page.route('**/api/broadcast', async (route) => {
            txCounter += 1;
            const body = JSON.parse(route.request().postData() || '{}');
            const tx = body.transaction || body;
            const decodedPayload = Buffer.from(tx.payload || '', 'hex').toString('utf8');
            broadcastedPayloads.push(decodedPayload);
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    transactionId: `${txCounter
                        .toString()
                        .padStart(2, '0')}b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0`
                })
            });
        });

        let registeredTokenomicsPayload: any = null;
        await page.route('**/api/state/action', async (route) => {
            const body = JSON.parse(route.request().postData() || '{}');
            if (body.action === 'REGISTER_FORGE_TOKENOMICS') {
                registeredTokenomicsPayload = body.payload;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    data: {
                        ticker: body.payload?.ticker || 'BEDRCK',
                        kasFeeFirewallEnforced: true
                    }
                })
            });
        });

        await page.goto('/');
        await upgradeVaultToWebCryptoAesGcm(page, TEST_MNEMONIC_24, TEST_VAULT_PASSWORD);
        await page.getByRole('button', { name: 'FORGE' }).click();

        await expect(page.getByTestId('forge-view')).toBeVisible();
        await page.getByTestId('krc20-deploy-ticker-input').fill('BEDRCK');
        await page.getByTestId('krc20-check-ticker-btn').click();
        await expect(page.getByTestId('krc20-ticker-status-badge')).toContainText(
            'TICKER "BEDRCK" IS AVAILABLE FOR DEPLOYMENT'
        );

        // Load 4-Tranche Institutional Cap Table & test CSV import with Bech32m checksum validation
        await page.getByTestId('cap-table-load-template-btn').click();
        await expect(page.getByTestId('cap-table-row-0')).toBeVisible();
        await expect(page.getByTestId('cap-table-checksum-badge-0')).toContainText(
            'PROOF-OF-LOCK'
        );

        await page.getByTestId('cap-table-toggle-csv-btn').click();
        await page
            .getByTestId('cap-table-csv-textarea')
            .fill(
                `address,amount,label,cliff_days,linear_days\n${MASTER_DIRECTOR_ADDRESS},3150000,Founders Vault,180,365\n${MASTER_DIRECTOR_ADDRESS},1050000,Early Syndicate,90,180`
            );
        await page.getByTestId('cap-table-csv-import-btn').click();
        await expect(page.getByTestId('cap-table-csv-feedback')).toContainText(
            'Verified & imported 2 Bech32m Cap Table rows'
        );

        // Configure Deflationary Auto-Burn (75 bps), Chromatic Halving, Zero-Rug 90% LP & Mineable Vault
        await page.getByTestId('monetary-burn-bps-input').fill('75');
        await expect(page.getByTestId('supply-curve-svg')).toBeVisible();
        await expect(page.getByTestId('zero-rug-lp-badge')).toContainText(
            '365D 2.5x LP'
        );
        await page.getByTestId('mineable-vault-toggle').click();
        await page.getByTestId('mineable-vault-funded-input').fill('4200000');

        // Execute Chained Deploy + Fan-Out Transfers
        await page.getByTestId('krc20-deploy-submit-btn').click();
        const authDialog = page.getByRole('dialog');
        await expect(authDialog).toBeVisible();
        await expect(authDialog).toContainText('Deploy & Fan-Out Cap Table (BEDRCK)');

        await page
            .getByTestId('wallet-authorize-password-input')
            .fill(TEST_VAULT_PASSWORD);
        await page.getByTestId('wallet-authorize-submit-btn').click();

        await expect(page.getByTestId('forge-receipt-card')).toBeVisible();
        await expect(page.getByTestId('forge-fanout-receipts-list')).toContainText(
            'Founders Vault: 3,150,000 BEDRCK'
        );

        // Verify chained inscriptions: 1st TX is "op":"deploy", 2nd & 3rd TXs are "op":"transfer"
        expect(broadcastedPayloads.length).toBe(3);
        expect(broadcastedPayloads[0]).toContain('"op":"deploy"');
        expect(broadcastedPayloads[0]).toContain('"tick":"BEDRCK"');
        expect(broadcastedPayloads[1]).toContain('"op":"transfer"');
        expect(broadcastedPayloads[1]).toContain('"cov":"SILVERSCRIPT_PROOF_OF_LOCK_V1"');
        expect(broadcastedPayloads[2]).toContain('"op":"transfer"');

        expect(registeredTokenomicsPayload).toBeTruthy();
        expect(registeredTokenomicsPayload.ticker).toBe('BEDRCK');
        expect(registeredTokenomicsPayload.monetaryPolicy.burnRateBps).toBe(75);
        expect(registeredTokenomicsPayload.monetaryPolicy.burnAddress).toBe(
            KASPA_BURN_ADDRESS
        );
    });

    test('2. Deliverables L2 & L5: Inspects NACHO in Mode 02, renders Verifiable "PROOF-OF-LOCK" Supply Gauge, and binds a Retroactive Ecosystem Upgrade (Auto-Burn + Proof-of-Lock + Mineable Vault)', async ({
        page
    }) => {
        await seedUnlockedSovereignSession(page, { isDirector: true });

        await page.route('**/api/state', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ workers: [], sectors: [], systemMode: 'base' })
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
                        op_fee_mint: '100000000'
                    }
                })
            });
        });

        await page.route('https://api.kasplex.org/v1/krc20/token/**', async (route) => {
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
        });

        await page.route('**/api/krc20/market**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ price: { usd: 0.00018 } })
            });
        });

        let capturedRetroAction: any = null;
        await page.route('**/api/state/action', async (route) => {
            const body = JSON.parse(route.request().postData() || '{}');
            if (body.action === 'RETROACTIVE_FORGE_UPGRADE') {
                capturedRetroAction = body;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: true,
                    data: {
                        vestingSchedules: [
                            {
                                vestingId: 'vest-nacho-1',
                                tokenTicker: 'NACHO',
                                beneficiaryAddress: MASTER_DIRECTOR_ADDRESS,
                                label: 'NACHO Community Proof-of-Lock Vault',
                                totalAllocated: 12_500_000,
                                unlockedAmount: 500_000,
                                remainingLocked: 12_000_000,
                                cliffDays: 90,
                                linearDays: 365,
                                dailyUnlockRate: 34246.57,
                                vprogStateRoot:
                                    '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
                                status: 'LOCKED'
                            }
                        ],
                        monetaryPolicy: {
                            tokenTicker: 'NACHO',
                            burnRateBps: 100,
                            burnAddress: KASPA_BURN_ADDRESS,
                            totalBurnedTokens: 450_000
                        },
                        proofOfLockSummary: {
                            lockedVestingSupply: 12_000_000,
                            unlockedVestedSupply: 500_000,
                            reserveLockedSupply: 0,
                            miningVaultLockedSupply: 2_500_000,
                            totalLockedSupply: 14_500_000,
                            burnedSupply: 450_000,
                            daily2200UtcUnlockRate: 34246.57,
                            burnAddress: KASPA_BURN_ADDRESS
                        }
                    }
                })
            });
        });

        await page.goto('/');
        await page.getByRole('button', { name: 'FORGE' }).click();
        await page.getByTestId('forge-mode-krc20_mint').click();

        await page.getByTestId('krc20-mint-inspect-btn').click();
        await expect(page.getByTestId('proof-of-lock-supply-gauge')).toBeVisible();
        await expect(page.getByTestId('proof-of-lock-locked-amount')).toContainText(
            '14,500,000'
        );
        await expect(page.getByTestId('proof-of-lock-burned-amount')).toContainText(
            '450,000'
        );
        await expect(page.getByTestId('vesting-covenant-row').first()).toContainText(
            '90D Cliff / 365D Linear'
        );

        // Open Retroactive Upgrade Foundry & bind upgrade to NACHO
        await page.getByTestId('toggle-retroactive-foundry-btn').click();
        await expect(page.getByTestId('retroactive-upgrade-foundry-card')).toBeVisible();
        await page.getByTestId('retro-burn-bps-input').fill('100');
        await page.getByTestId('retro-vesting-amount-input').fill('12000000');
        await page.getByTestId('submit-retroactive-upgrade-btn').click();

        await expect(page.getByTestId('retro-upgrade-status-banner')).toContainText(
            'Retroactive KCC-20 SilverScript Upgrade bound to NACHO'
        );
        expect(capturedRetroAction?.action).toBe('RETROACTIVE_FORGE_UPGRADE');
        expect(capturedRetroAction?.payload?.ticker).toBe('NACHO');
        expect(capturedRetroAction?.payload?.protocolFeeKas).toBe(1.5);
    });

    test('3. Deliverable L4: Provisions a Proof-of-Hashrate Mineable KRC-20 Syndicate Sector (BEDRCK) in Operations synchronized to the 22:00 UTC Bell', async ({
        page
    }) => {
        await seedUnlockedSovereignSession(page, { isDirector: true });

        await page.route('**/api/state**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ workers: [], sectors: [], systemMode: 'base' })
            });
        });

        await page.route('**/api/user/ledger**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    KAS: 500.0,
                    unassignedReserveKas: 15.0,
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

        let addedSectorPayload: any = null;
        await page.route('**/api/state/action', async (route) => {
            const body = JSON.parse(route.request().postData() || '{}');
            if (body.action === 'GET_FORGE_TOKENOMICS') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        success: true,
                        data: {
                            allMineableVaults: [
                                {
                                    vaultId: 'vault-bedrck-1',
                                    tokenTicker: 'BEDRCK',
                                    vaultLabel: 'Bedrock Sovereign Mining Vault',
                                    totalFundedTokens: 10_000_000,
                                    remainingVaultTokens: 9_800_000,
                                    dailyEmissionTokens: 27_397,
                                    distributedTokens: 200_000,
                                    minHashrateThs: 0.1,
                                    syndicateSectorEnabled: true,
                                    activeMinersCount: 12,
                                    status: 'ACTIVE'
                                }
                            ]
                        }
                    })
                });
                return;
            }
            if (body.action === 'ADD_SECTOR') {
                addedSectorPayload = body.payload;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true })
            });
        });

        await page.goto('/');
        await page.getByRole('button', { name: '+ Break Off Sector' }).click();
        await page.getByTestId('open-target-asset-picker-btn').click();
        await page.getByTestId('asset-cat-MINEABLE').click();
        await page.getByTestId('select-target-asset-BEDRCK').click();

        await expect(page.getByTestId('sector-architecture-badge')).toContainText(
            'Proof-of-Hashrate Mineable KRC-20 Syndicate (BEDRCK)'
        );
        await expect(page.getByTestId('mineable-syndicate-banner')).toContainText(
            'Syndicate Hashpower Pledge Active'
        );

        await page.getByTestId('initialize-sector-btn').click();
        await expect(
            page.getByTestId('sector-card-SYNDICATE-BEDRCK')
        ).toBeVisible();
        await expect(
            page.getByTestId('sector-card-SYNDICATE-BEDRCK')
        ).toContainText('Proof-of-Hashrate Syndicate Sector');

        expect(addedSectorPayload).toBeTruthy();
        expect(addedSectorPayload.settlementConfig.targetAsset.ticker).toBe('BEDRCK');
        expect(addedSectorPayload.settlementConfig.isMineableKrc20).toBe(true);
    });
});