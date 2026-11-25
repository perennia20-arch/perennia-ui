import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Module from 'node:module';
import * as esbuild from 'esbuild';

const ROOT = process.cwd();
const SRC_ROOT = path.join(ROOT, 'src');

async function loadTsModule(relPath: string, mocks: Record<string, any> = {}): Promise<any> {
    const absPath = path.resolve(ROOT, relPath);
    const stubPkgs = new Set(['pdf-lib', 'stripe', 'ethers', '@solana/web3.js', 'bitcoinjs-lib', 'xrpl']);

    const mockPlugin: esbuild.Plugin = {
        name: 'pw-sl1-b46-mocks',
        setup(build) {
            build.onResolve({ filter: /^\$lib\// }, (args) => {
                if (Object.prototype.hasOwnProperty.call(mocks, args.path)) {
                    return { path: args.path, namespace: 'mock-mod' };
                }
                const target = path.resolve(SRC_ROOT, 'lib', args.path.slice('$lib/'.length));
                for (const ext of ['', '.ts', '.js', '/index.ts', '/index.js']) {
                    const candidate = target + ext;
                    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                        return { path: candidate };
                    }
                }
                return { path: target };
            });

            build.onResolve({ filter: /^\$(env|app)\// }, (args) => {
                return { path: args.path, namespace: 'mock-mod' };
            });

            build.onResolve({ filter: /^@sveltejs\/kit$/ }, (args) => {
                return { path: args.path, namespace: 'mock-mod' };
            });

            build.onResolve({ filter: /.*/ }, (args) => {
                if (stubPkgs.has(args.path)) {
                    return { path: args.path, namespace: 'mock-mod' };
                }
                return undefined;
            });

            build.onLoad({ filter: /.*/, namespace: 'mock-mod' }, (args) => {
                (globalThis as any).__pwB46Mocks = (globalThis as any).__pwB46Mocks || {};
                const key = args.path;
                if (Object.prototype.hasOwnProperty.call(mocks, key)) {
                    (globalThis as any).__pwB46Mocks[key] = mocks[key];
                } else if (key === '@sveltejs/kit') {
                    (globalThis as any).__pwB46Mocks[key] = {
                        json: (data: any, init?: ResponseInit) =>
                            new Response(JSON.stringify(data), {
                                status: init?.status ?? 200,
                                headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) }
                            })
                    };
                } else if (key === '$env/dynamic/private') {
                    (globalThis as any).__pwB46Mocks[key] = { env: {} };
                } else if (key === '$app/environment') {
                    (globalThis as any).__pwB46Mocks[key] = { browser: false, dev: true };
                } else {
                    (globalThis as any).__pwB46Mocks[key] = new Proxy(function () {}, {
                        get: (_t, prop) => (prop === '__esModule' ? true : () => ({})),
                        construct: () => ({})
                    });
                }
                return {
                    contents: `module.exports = globalThis.__pwB46Mocks[${JSON.stringify(key)}];`,
                    loader: 'js'
                };
            });
        }
    };

    const result = await esbuild.build({
        entryPoints: [absPath],
        write: false,
        bundle: true,
        absWorkingDir: ROOT,
        platform: 'node',
        format: 'cjs',
        target: 'node20',
        plugins: [mockPlugin],
        logLevel: 'silent'
    });

    const code = result.outputFiles[0].text;
    const mod = new (Module as any)(absPath);
    mod.filename = absPath;
    mod.paths = (Module as any)._nodeModulePaths(path.dirname(absPath));
    mod._compile(code, absPath);
    return mod.exports;
}

function walkFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...walkFiles(full));
        } else if (entry.isFile()) {
            out.push(full);
        }
    }
    return out;
}

test.describe('Sovereign L1 Batch 4-6 Integration & Repo-Wide Invariants', () => {
    test('dexHelpers atomic U128Str formatting and fee estimation without 0.15 fallbacks', async () => {
        const dex = await loadTsModule('src/lib/components/dex/dexHelpers.ts', {
            '$lib/stores/ui.svelte': { ui: {} },
            '$lib/stores/identity.svelte': { identity: {} }
        });

        expect(dex.dexAtomicDecimals('KAS')).toBe(8);
        expect(dex.dexAtomicDecimals('USDC')).toBe(6);
        expect(dex.dexAtomicDecimals('SOL')).toBe(9);
        expect(dex.dexAtomicDecimals('ETH')).toBe(18);
        expect(dex.buildNonCustodialSwapAmountAtomic('125.5', 'KAS')).toBe('12550000000');
        expect(dex.buildNonCustodialSwapAmountAtomic('250.123456', 'USDC')).toBe('250123456');

        // Fallback leg gas for unknown ticker must not be 0.15
        expect(dex.estimateModeledLegGasUsd('UNKNOWN_TOKEN')).not.toBe(0.15);
        expect(dex.estimateModeledLegGasUsd('UNKNOWN_TOKEN')).toBe(0.12);

        const quoteDisp = dex.formatSorQuoteDisplay(
            {
                routeType: 'L1_COW_ATOMIC_PSKT',
                estimatedOutputAtomic: '3731250',
                minOutputAtomic: '3710000',
                protocolFeeAtomic: '2500000',
                networkFeeSompi: '10000',
                grossUsdMicros: '3750000',
                netUsdMicros: '3731250',
                feeBps: 50,
                feeTierLabel: 'Peer CoW Match'
            },
            'KAS',
            'USDC'
        );
        expect(quoteDisp.livePricingUnavailable).toBe(false);
        expect(quoteDisp.estimatedOutDecimal).toBe('3.73125');
        expect(quoteDisp.feePctLabel).toBe('0.50%');

        const unavailableDisp = dex.formatSorQuoteDisplay(null, 'KAS', 'USDC');
        expect(unavailableDisp.livePricingUnavailable).toBe(true);
        expect(unavailableDisp.feeTierLabel).toBe('Live pricing unavailable');
    });

    test('onramp and offramp enforce 422 NON_CUSTODIAL_L1_ONLY and fail closed 503 when oracle offline', async () => {
        const validKasWallet = 'kaspa:' + 'q'.repeat(61);
        const mockRedis = {
            get: async (key: string) => {
                if (key === 'session:sess-1') return validKasWallet;
                return null;
            },
            set: async () => 'OK',
            del: async () => 1,
            eval: async () => 'OK'
        };
        const mockDb = {
            query: async () => ({ rows: [] }),
            connect: async () => ({
                query: async () => ({ rows: [] }),
                release: () => {}
            })
        };
        const mockKms = {
            getKycMasterKeyStrict: () => '00'.repeat(32),
            encryptBankRailRecordStrict: (x: unknown) => JSON.stringify(x),
            decryptBankRailRecordStrict: () => ({}),
            resolveMasterTreasuryKasAddress: async () => validKasWallet,
            isWalletMasterAdmin: () => false,
            normalizeKaspaAddressStrict: (w: string) => (w.startsWith('kaspa:') ? w : `kaspa:${w}`),
            normalizeKaspaBase32Strict: (w: string) => w.replace(/^kaspa:/, ''),
            perenniaKMS: {}
        };
        const mockDispatcher = {
            executeOrQueueL1Dispatch: async () => ({ success: true, txId: 'mock-tx' })
        };

        const onramp = await loadTsModule('src/routes/api/fiat/onramp/+server.ts', {
            '$env/dynamic/private': { env: {} },
            '$lib/server/redis': { redis: mockRedis },
            '$lib/server/db': { dbPool: mockDb },
            '$lib/server/kms': mockKms,
            '$lib/server/l1Dispatcher': mockDispatcher
        });

        const offramp = await loadTsModule('src/routes/api/fiat/offramp/+server.ts', {
            '$env/dynamic/private': { env: {} },
            '$lib/server/redis': { redis: mockRedis },
            '$lib/server/db': { dbPool: mockDb },
            '$lib/server/kms': mockKms
        });

        const origFetch = globalThis.fetch;
        globalThis.fetch = (async () =>
            new Response(JSON.stringify({ error: 'oracle offline' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            })) as typeof fetch;

        try {
            // Custodial LEDGER_KAS & AUTO_STAKE_SILO rejected 422 on onramp
            const ledgerRes = await onramp.POST({
                request: new Request('http://localhost/api/fiat/onramp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        walletAddress: validKasWallet,
                        fiatAmountUsd: 100,
                        targetAsset: 'KAS',
                        settlementTarget: 'LEDGER_KAS'
                    })
                }),
                cookies: { get: () => 'sess-1' } as any,
                locals: {}
            } as any);
            expect(ledgerRes.status).toBe(422);
            const ledgerBody = await ledgerRes.json();
            expect(ledgerBody.error).toBe('NON_CUSTODIAL_L1_ONLY');

            const autoSiloRes = await onramp.POST({
                request: new Request('http://localhost/api/fiat/onramp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        walletAddress: validKasWallet,
                        fiatAmountUsd: 100,
                        targetAsset: 'SILO',
                        settlementTarget: 'AUTO_STAKE_SILO'
                    })
                }),
                cookies: { get: () => 'sess-1' } as any,
                locals: {}
            } as any);
            expect(autoSiloRes.status).toBe(422);

            // Fail-closed 503 on onramp POST when live pricing unavailable
            const onramp503 = await onramp.POST({
                request: new Request('http://localhost/api/fiat/onramp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        walletAddress: validKasWallet,
                        fiatAmountUsd: 100,
                        targetAsset: 'KAS',
                        settlementTarget: 'L1_KAS'
                    })
                }),
                cookies: { get: () => 'sess-1' } as any,
                locals: {}
            } as any);
            expect(onramp503.status).toBe(503);
            const onramp503Body = await onramp503.json();
            expect(onramp503Body.livePricingUnavailable).toBe(true);
            expect(onramp503Body.uiMessage).toBe('Live pricing unavailable');

            // Custodial ledger_kas rejected 422 on offramp
            const offrampCustodial = await offramp.POST({
                request: new Request('http://localhost/api/fiat/offramp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        wallet: validKasWallet,
                        sourceMode: 'ledger_kas',
                        sourceAsset: 'KAS',
                        fiatAmount: 100,
                        amountKas: 1000
                    })
                }),
                cookies: { get: () => 'sess-1' } as any,
                locals: {}
            } as any);
            expect(offrampCustodial.status).toBe(422);
            const offrampCustodialBody = await offrampCustodial.json();
            expect(offrampCustodialBody.error).toBe('NON_CUSTODIAL_L1_ONLY');

            const offramp503 = await offramp.POST({
                request: new Request('http://localhost/api/fiat/offramp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        wallet: validKasWallet,
                        sourceMode: 'onchain_kas',
                        sourceAsset: 'KAS',
                        fiatAmount: 100,
                        amountKas: 1000,
                        routingNumber: '021000021',
                        accountNumber: '123456789'
                    })
                }),
                cookies: { get: () => 'sess-1' } as any,
                locals: {}
            } as any);
            expect(offramp503.status).toBe(503);
            const offramp503Body = await offramp503.json();
            expect(offramp503Body.livePricingUnavailable).toBe(true);
            expect(offramp503Body.uiMessage).toBe('Live pricing unavailable');
        } finally {
            globalThis.fetch = origFetch;
        }
    });

    test('/api/admin rejects yield_reservoirs and /api/user/ledger enforces nonCustodialL1Only', async () => {
        const adminWallet = 'kaspa:' + 'p'.repeat(61);
        const queries: string[] = [];
        const mockRedis = {
            get: async (key: string) => (key === 'session:admin-sess' ? adminWallet : null),
            set: async () => 'OK',
            keys: async () => [],
            del: async () => 1
        };
        const queryFn = async (sql: string) => {
            queries.push(sql);
            return { rows: [] };
        };
        const mockDb = {
            query: queryFn,
            connect: async () => ({
                query: queryFn,
                release: () => {}
            })
        };
        const mockKms = {
            getKycMasterKeyStrict: () => '00'.repeat(32),
            decryptBankRailRecordStrict: () => ({}),
            resolveMasterTreasuryKasAddress: async () => adminWallet,
            resolveMasterTreasuryKasAddressOptional: async () => adminWallet,
            isWalletMasterAdmin: () => true,
            normalizeKaspaBase32Strict: (w: string) => w.replace(/^kaspa:/, ''),
            normalizeKaspaAddressStrict: (w: string) => (w.startsWith('kaspa:') ? w : `kaspa:${w}`),
            perenniaKMS: {}
        };

        const adminRoute = await loadTsModule('src/routes/api/admin/+server.ts', {
            '$env/dynamic/private': { env: {} },
            '$lib/server/redis': { redis: mockRedis },
            '$lib/server/db': { dbPool: mockDb },
            '$lib/server/kms': mockKms,
            '$lib/server/l1Dispatcher': {
                buildExplorerTxUrl: (_t: string, tx: string) => `https://kas.fyi/tx/${tx}`,
                executeOrQueueL1Dispatch: async () => ({ success: true })
            },
            '$lib/server/seedAndNetting': {
                executeFounderSeedAndClear: async () => ({ success: true })
            }
        });

        const origFetch = globalThis.fetch;
        globalThis.fetch = (async () =>
            new Response('[]', {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            })) as typeof fetch;

        try {
            const rejectedRes = await adminRoute.GET({
                url: new URL('http://localhost/api/admin?table=yield_reservoirs'),
                request: new Request('http://localhost/api/admin?table=yield_reservoirs'),
                cookies: { get: () => 'admin-sess' } as any,
                locals: {}
            } as any);
            expect(rejectedRes.status).toBe(400);

            for (const table of [
                'stratum_mature_accruals',
                'epoch_payout_outbox',
                'vault_locks',
                'thermostat_valves',
                'settlement_receipts',
                'solvency_circuit_events'
            ]) {
                const okRes = await adminRoute.GET({
                    url: new URL(`http://localhost/api/admin?table=${table}`),
                    request: new Request(`http://localhost/api/admin?table=${table}`),
                    cookies: { get: () => 'admin-sess' } as any,
                    locals: {}
                } as any);
                expect(okRes.status).toBe(200);
            }
        } finally {
            globalThis.fetch = origFetch;
        }

        const ledgerQueries: string[] = [];
        const userLedger = await loadTsModule('src/routes/api/user/ledger/+server.ts', {
            '$lib/server/redis': { redis: mockRedis },
            '$lib/server/db': {
                dbPool: {
                    query: async (sql: string) => {
                        ledgerQueries.push(sql);
                        return { rows: [{ overflow_ceiling: 750 }] };
                    }
                }
            },
            '$lib/server/kms': mockKms
        });

        const ledgerRes = await userLedger.GET({
            url: new URL(`http://localhost/api/user/ledger?wallet=${adminWallet}`),
            cookies: { get: () => 'admin-sess' } as any,
            locals: {}
        } as any);
        expect(ledgerRes.status).toBe(200);
        const ledgerBody = await ledgerRes.json();
        expect(ledgerBody.nonCustodialL1Only).toBe(true);
        expect(ledgerBody.unassignedReserveKas).toBe(0);
        expect(ledgerQueries.join('\n')).not.toContain('yield_reservoirs');
        expect(queries.join('\n')).not.toContain('yield_reservoirs');
    });

    test('l1Dispatcher buildAndSignPostToccataKaspaTx emits Post-Toccata Transaction v1', async () => {
        const atomicMath = await loadTsModule('src/lib/crypto/atomicMath.ts');
        const l1 = await loadTsModule('src/lib/server/l1Dispatcher.ts', {
            '$env/dynamic/private': { env: {} },
            '$lib/server/db': { dbPool: { query: async () => ({ rows: [] }) } },
            '$lib/server/redis': { redis: { get: async () => null, set: async () => 'OK' } },
            '$lib/server/kms': { perenniaKMS: {} }
        });

        const privKeyBytes = crypto.randomBytes(32);
        const scriptHex = '20' + 'aa'.repeat(32) + 'ac';
        const { transaction, gatheredSompi, feeSompi } = l1.buildAndSignPostToccataKaspaTx({
            utxos: [
                {
                    outpoint: { transactionId: '11'.repeat(32), index: 0 },
                    utxoEntry: { amount: '500000000' }
                }
            ],
            privKeyBytes,
            sourceScriptHex: scriptHex,
            destScriptHex: '20' + 'bb'.repeat(32) + 'ac',
            targetSompi: 200_000_000n
        });

        expect(gatheredSompi).toBe(500_000_000n);
        expect(feeSompi > 0n).toBe(true);
        expect(transaction.version).toBe(1);
        expect(transaction.subnetworkId).toBe(atomicMath.NATIVE_SUBNETWORK_ID_HEX);
        expect(BigInt(String(transaction.storageMass)) > 0n).toBe(true);
        expect(transaction.outputs.length).toBeGreaterThanOrEqual(1);
        for (const out of transaction.outputs) {
            expect(typeof out.amount === 'string' && /^[0-9]+$/.test(out.amount)).toBe(true);
        }

        const sanitized = atomicMath.validateAndSanitizePostToccataBroadcastTx(transaction);
        expect(sanitized.transaction.version).toBe(1);
        expect(BigInt(String(sanitized.transaction.storageMass)) > 0n).toBe(true);
    });

    test('Batch 4-6 UI components enforce fail-closed UX, clean WalletModal signing, and zero blur/jargon', () => {
        const swapView = fs.readFileSync(path.join(SRC_ROOT, 'lib/views/SwapView.svelte'), 'utf8');
        const fiatPanel = fs.readFileSync(path.join(SRC_ROOT, 'lib/components/dex/FiatBridgePanel.svelte'), 'utf8');
        const dbExplorer = fs.readFileSync(path.join(SRC_ROOT, 'lib/components/director/DbExplorerTab.svelte'), 'utf8');
        const directorView = fs.readFileSync(path.join(SRC_ROOT, 'lib/views/DirectorView.svelte'), 'utf8');
        const walletModal = fs.readFileSync(path.join(SRC_ROOT, 'lib/components/WalletModal.svelte'), 'utf8');
        const layout = fs.readFileSync(path.join(SRC_ROOT, 'routes/+layout.svelte'), 'utf8');

        expect(swapView).toContain('LIVE_PRICING_UNAVAILABLE_MESSAGE');
        expect(swapView).not.toContain('/api/user/ledger');
        expect(swapView).toMatch(/disabled=\{isExecuting \|\|[\s\n]+livePricingUnavailable/);

        expect(fiatPanel).toContain('LIVE_PRICING_UNAVAILABLE_MESSAGE');
        expect(fiatPanel).not.toContain('LEDGER_KAS');
        expect(fiatPanel).not.toContain('AUTO_STAKE_SILO');

        expect(dbExplorer).not.toContain('yield_reservoirs');
        expect(dbExplorer).toContain('vault_locks');
        expect(directorView).toContain('Sovereign L1 Pool Solvency Guard');
        expect(directorView).toContain('livePricingUnavailable');

        expect(walletModal).toContain('signAndBroadcastSorPskt');
        expect(walletModal).toContain('signAndBroadcastVaultCancelPskt');
        expect(walletModal).not.toContain('WITHDRAW_SYNTHETIC_ASSET');
        expect(walletModal).not.toContain('isLedgerSale');

        expect(layout).toContain('operations.hydrateSovereignState(parsed)');
        expect(layout).toContain('treasury.markOracleUnavailable()');
        expect(layout).not.toContain('/api/user/ledger');
        expect(layout).not.toContain('LEDGER_KAS');
        expect(layout).not.toContain('AUTO_STAKE_SILO');
    });

    test('Repo-wide src/ invariant scan passes with zero legacy violations and pure LF endings', () => {
        const allSrcFiles = walkFiles(SRC_ROOT).filter((f) => /\.(ts|svelte|css)$/.test(f));
        const retiredActionPattern =
            /\b(CLAIM_PENDING_SECTOR_KAS|STAKE_LP|WITHDRAW_LP|STAKE_SILO|CLAIM_UNSTAKED_SILO|SWEEP_TOKEN_TO_COLD_VAULT_NOW|SWEEP_TO_COLD_VAULT_NOW|WITHDRAW_SYNTHETIC_ASSET|DISPATCH_L1_PAYOUT|DISPATCH_OTC_UTXOS)\b/;

        for (const abs of allSrcFiles) {
            const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
            const src = fs.readFileSync(abs, 'utf8');

            expect(src, `${rel} must not contain 0.15 fallback`).not.toMatch(/0\.15/);
            expect(src, `${rel} must not contain yield_reservoirs`).not.toContain('yield_reservoirs');
            expect(src, `${rel} must not contain computeReservoirHmac`).not.toContain('computeReservoirHmac');
            expect(src, `${rel} must not contain dev:sor:treasury:balances`).not.toContain('dev:sor:treasury:balances');
            expect(src, `${rel} must not contain backdrop-blur`).not.toMatch(/backdrop-blur/);
            expect(src, `${rel} must not contain backdrop-filter`).not.toMatch(/backdrop-filter/);
            expect(src, `${rel} must not use * 1e8 or / 1e8 float math`).not.toMatch(/[*/]\s*1e8\b/i);

            if (rel !== 'src/lib/crypto/atomicMath.ts') {
                expect(src, `${rel} must not reference retired 422 actions`).not.toMatch(retiredActionPattern);
            }
        }

        const batch36Files = [
            'src/lib/views/OperationsView.svelte',
            'src/lib/components/operations/operationsHelpers.ts',
            'src/lib/components/operations/SectorCard.svelte',
            'src/lib/components/operations/PoolDistributionSidebar.svelte',
            'src/lib/components/operations/SectorConfigModals.svelte',
            'src/lib/components/dex/dexHelpers.ts',
            'src/lib/views/SwapView.svelte',
            'src/lib/components/dex/LiquidityAndSiloPanel.svelte',
            'src/lib/components/dex/FiatBridgePanel.svelte',
            'src/routes/api/fiat/onramp/+server.ts',
            'src/routes/api/fiat/offramp/+server.ts',
            'src/routes/api/admin/+server.ts',
            'src/lib/components/director/DbExplorerTab.svelte',
            'src/lib/views/DirectorView.svelte',
            'src/routes/api/webhooks/stripe/+server.ts',
            'src/routes/api/user/ledger/+server.ts',
            'src/lib/server/l1Dispatcher.ts',
            'src/lib/server/anyToAnyRouter.ts',
            'src/lib/server/communityBuckets.ts',
            'src/lib/server/seedAndNetting.ts',
            'src/routes/api/otc/settle/+server.ts',
            'src/routes/api/treasury/corporate/+server.ts',
            'src/routes/+layout.svelte',
            'src/lib/components/WalletModal.svelte',
            'tests/sovereign-l1-batch3.spec.ts',
            'tests/sovereign-l1-batch4-6.spec.ts'
        ];

        for (const rel of batch36Files) {
            const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
            expect(raw.includes('\r\n'), `${rel} must have pure LF line endings`).toBe(false);
        }
    });
});
