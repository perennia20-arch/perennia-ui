import { test, expect } from '@playwright/test';
import esbuild from 'esbuild';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { compile } from 'svelte/compiler';
import { blake2b } from '@noble/hashes/blake2.js';
import { schnorr } from '@noble/curves/secp256k1.js';
import { bytesToHex, concatBytes, hexToBytes } from '../src/lib/crypto/kaspaAddress';
import {
    RELAY_FEE_PER_GRAM_SOMPI,
    computeKaspaTxV1InputSighash,
    computePostToccataMassAndFee,
    validateAndSanitizePostToccataBroadcastTx,
    type PsktPayload
} from '../src/lib/crypto/atomicMath';

const nodeRequire = createRequire(import.meta.url);

interface Batch3LoadOpts {
    fetchImpl?: typeof globalThis.fetch;
    browser?: boolean;
}

function createSvelteShimPlugin(repoSrc: string, opts: Batch3LoadOpts): esbuild.Plugin {
    return {
        name: 'batch3-svelte-loader',
        setup(build) {
            build.onResolve(
                {
                    filter: /^(\$app\/environment|\$lib\/stores\/(ui|identity|pwa|i18n|settings)\.svelte|\.\/identity\.svelte|\$lib\/crypto\/(honeycomb|silverscript|multiChainSigner)|\$lib\/utils\/vaultCrypto|svelte\/transition)$/
                },
                (args) => ({
                    path: args.path === './identity.svelte' ? '$lib/stores/identity.svelte' : args.path,
                    namespace: 'stub'
                })
            );

            build.onResolve({ filter: /^\$lib\// }, (args) => {
                const sub = args.path.slice('$lib/'.length);
                const candidates = [
                    path.join(repoSrc, 'lib', `${sub}.ts`),
                    path.join(repoSrc, 'lib', `${sub}.svelte.ts`),
                    path.join(repoSrc, 'lib', sub),
                    path.join(repoSrc, 'lib', sub, 'index.ts')
                ];
                for (const c of candidates) {
                    if (fs.existsSync(c)) return { path: c };
                }
                return { path: path.join(repoSrc, 'lib', sub) };
            });

            build.onLoad({ filter: /\.svelte$/, namespace: 'file' }, (args) => {
                const source = fs.readFileSync(args.path, 'utf8');
                const compiled = compile(source, {
                    filename: args.path,
                    generate: 'server',
                    css: 'injected'
                });
                return { contents: compiled.js.code, loader: 'js' };
            });

            build.onLoad({ filter: /\.svelte\.ts$/, namespace: 'file' }, (args) => {
                let code = fs.readFileSync(args.path, 'utf8');
                code = code.replace(/\$state\.raw\(/g, '(');
                code = code.replace(/\$state<[^>]+>\(/g, '(');
                code = code.replace(/\$state\(/g, '(');
                code = code.replace(/\$derived\.by<[^>]+>\(\s*\(\)\s*=>/g, '((() =>');
                code = code.replace(/\$derived\.by\(\s*\(\)\s*=>/g, '((() =>');
                code = code.replace(/\$derived<[^>]+>\(/g, '(');
                code = code.replace(/\$derived\(/g, '(');
                return { contents: code, loader: 'ts' };
            });

            build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => {
                switch (args.path) {
                    case '$app/environment':
                        return {
                            contents: `export const browser = ${Boolean(opts.browser)};`,
                            loader: 'js'
                        };
                    case '$lib/stores/ui.svelte':
                        return {
                            contents: `
                                export const ui = {
                                    isTutorialActive: false,
                                    adminModeActive: false,
                                    adminTargetWallet: '',
                                    showWalletModal: false,
                                    microBadges: {},
                                    taxEvents: [],
                                    syncSubOverlay() {},
                                    triggerMicroBadge() {},
                                    triggerBucketBoost() {}
                                };
                            `,
                            loader: 'js'
                        };
                    case '$lib/stores/identity.svelte':
                        return {
                            contents: `
                                export const identity = {
                                    isWalletConnected: true,
                                    isCorporateAdmin: false,
                                    isWatchOnly: false,
                                    activeAddress: 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e',
                                    sovereignKeys: {
                                        kaspa: { address: 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e' },
                                        ethereum: { address: '0x1111111111111111111111111111111111111111' }
                                    }
                                };
                            `,
                            loader: 'js'
                        };
                    case '$lib/stores/pwa.svelte':
                        return { contents: `export const pwa = { isMobile: false };`, loader: 'js' };
                    case 'svelte/transition':
                        return {
                            contents: `export function fade() { return {}; } export function slide() { return {}; }`,
                            loader: 'js'
                        };
                    case '$lib/crypto/honeycomb':
                        return {
                            contents: `
                                export async function deriveHoneycombKeys() {
                                    return globalThis.__BATCH3_DERIVED_KEYS__ || { kaspa: { address: '', privateKey: '' } };
                                }
                            `,
                            loader: 'js'
                        };
                    case '$lib/utils/vaultCrypto':
                        return {
                            contents: `
                                export async function decryptVault(pwd, cipher) {
                                    if (globalThis.__BATCH3_DECRYPT__) return globalThis.__BATCH3_DECRYPT__(pwd, cipher);
                                    return 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
                                }
                            `,
                            loader: 'js'
                        };
                    case '$lib/crypto/silverscript':
                        return {
                            contents: `export function compileSilverScriptProofOfLockVault() { return {}; }`,
                            loader: 'js'
                        };
                    case '$lib/crypto/multiChainSigner':
                        return {
                            contents: `
                                export function getChainExplorerTxUrl(asset, txid) { return 'https://explorer.kaspa.org/txs/' + txid; }
                                export function getChainExplorerAddressUrl(asset, addr) { return 'https://explorer.kaspa.org/addresses/' + addr; }
                                export async function signAndBroadcastNonKaspaL1Transfer() { return { txId: '0x1', explorerUrl: '' }; }
                            `,
                            loader: 'js'
                        };
                    default:
                        return { contents: `export default {};`, loader: 'js' };
                }
            });
        }
    };
}

async function bundleAndEval(relEntry: string, opts: Batch3LoadOpts = {}) {
    const absEntry = path.resolve(process.cwd(), relEntry);
    const repoSrc = path.resolve(process.cwd(), 'src');
    const svelteRuntime = await import('svelte');
    const svelteInternalServer = await import('svelte/internal/server');

    const result = await esbuild.build({
        entryPoints: [absEntry],
        bundle: true,
        write: false,
        platform: 'node',
        format: 'cjs',
        external: ['svelte', 'svelte/internal/*'],
        plugins: [createSvelteShimPlugin(repoSrc, opts)]
    });

    const mod = { exports: {} as Record<string, any> };
    const sandbox: Record<string, any> = {};
    for (const key of Object.getOwnPropertyNames(globalThis)) {
        if (key === 'global' || key === 'globalThis') continue;
        try {
            sandbox[key] = (globalThis as Record<string, any>)[key];
        } catch {
            // Skip restricted globals
        }
    }
    const sharedRequire = (id: string) => {
        if (id === 'svelte') return svelteRuntime;
        if (id === 'svelte/internal/server') return svelteInternalServer;
        return nodeRequire(id);
    };
    Object.assign(sandbox, {
        fetch: opts.fetchImpl ?? globalThis.fetch,
        module: mod,
        exports: mod.exports,
        require: sharedRequire
    });
    sandbox.global = sandbox;
    sandbox.globalThis = sandbox;
    vm.runInNewContext(result.outputFiles[0].text, sandbox, { filename: absEntry });
    return { exports: mod.exports, sandbox };
}

async function bundleOpsViewWithStore(opts: Batch3LoadOpts = {}) {
    const repoSrc = path.resolve(process.cwd(), 'src');
    const svelteRuntime = await import('svelte');
    const svelteInternalServer = await import('svelte/internal/server');

    const result = await esbuild.build({
        stdin: {
            contents: `
                export { default as OperationsView } from './src/lib/views/OperationsView.svelte';
                export { operations } from './src/lib/stores/operations.svelte';
            `,
            resolveDir: process.cwd(),
            loader: 'ts'
        },
        bundle: true,
        write: false,
        platform: 'node',
        format: 'cjs',
        external: ['svelte', 'svelte/internal/*'],
        plugins: [createSvelteShimPlugin(repoSrc, opts)]
    });

    const mod = { exports: {} as Record<string, any> };
    const sandbox: Record<string, any> = {};
    for (const key of Object.getOwnPropertyNames(globalThis)) {
        if (key === 'global' || key === 'globalThis') continue;
        try {
            sandbox[key] = (globalThis as Record<string, any>)[key];
        } catch {
            // Skip restricted globals
        }
    }
    const sharedRequire = (id: string) => {
        if (id === 'svelte') return svelteRuntime;
        if (id === 'svelte/internal/server') return svelteInternalServer;
        return nodeRequire(id);
    };
    Object.assign(sandbox, {
        fetch: opts.fetchImpl ?? globalThis.fetch,
        module: mod,
        exports: mod.exports,
        require: sharedRequire
    });
    sandbox.global = sandbox;
    sandbox.globalThis = sandbox;
    vm.runInNewContext(result.outputFiles[0].text, sandbox, {
        filename: path.resolve(process.cwd(), 'OperationsView.bundle.ts')
    });
    return { exports: mod.exports, sandbox };
}

async function loadStateRouteWithMocks(opts: {
    redisMap?: Map<string, string>;
    fetchImpl?: typeof globalThis.fetch;
}) {
    const absEntry = path.resolve(process.cwd(), 'src/routes/api/state/+server.ts');
    const repoSrc = path.resolve(process.cwd(), 'src');
    const stubPlugin: esbuild.Plugin = {
        name: 'batch3-state-route-stubs',
        setup(build) {
            build.onResolve(
                {
                    filter: /^(\$env\/dynamic\/private|@sveltejs\/kit|\$lib\/server\/(redis|db|kms))$/
                },
                (args) => ({ path: args.path, namespace: 'stub' })
            );
            build.onResolve({ filter: /^\$lib\// }, (args) => {
                const sub = args.path.slice('$lib/'.length);
                const candidates = [
                    path.join(repoSrc, 'lib', `${sub}.ts`),
                    path.join(repoSrc, 'lib', sub, 'index.ts')
                ];
                for (const c of candidates) {
                    if (fs.existsSync(c)) return { path: c };
                }
                return { path: path.join(repoSrc, 'lib', sub) };
            });
            build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => {
                switch (args.path) {
                    case '$env/dynamic/private':
                        return {
                            contents: `export const env = { RUST_BACKEND_URL: 'http://127.0.0.1:8002' };`,
                            loader: 'js'
                        };
                    case '@sveltejs/kit':
                        return {
                            contents: `
                                export function json(body, init = {}) {
                                    return new Response(JSON.stringify(body), {
                                        status: init.status ?? 200,
                                        headers: { 'content-type': 'application/json', ...(init.headers || {}) }
                                    });
                                }
                            `,
                            loader: 'js'
                        };
                    case '$lib/server/redis':
                        return {
                            contents: `
                                export const redis = {
                                    async get(k) { return globalThis.__STATE_REDIS__?.get(k) ?? null; },
                                    async set(k, v) { globalThis.__STATE_REDIS__?.set(k, String(v)); return 'OK'; },
                                    async publish() { return 0; }
                                };
                            `,
                            loader: 'js'
                        };
                    case '$lib/server/db':
                        return {
                            contents: `export const dbPool = { async query() { return { rows: [] }; } };`,
                            loader: 'js'
                        };
                    case '$lib/server/kms':
                        return {
                            contents: `
                                export function isWalletMasterAdmin() { return false; }
                                export function normalizeKaspaBase32Strict(w) { return String(w || '').replace(/^kaspa:/, ''); }
                                export function normalizeKaspaAddressStrict(w) {
                                    const clean = normalizeKaspaBase32Strict(w);
                                    return clean ? 'kaspa:' + clean : '';
                                }
                            `,
                            loader: 'js'
                        };
                    default:
                        return { contents: `export default {};`, loader: 'js' };
                }
            });
        }
    };

    const result = await esbuild.build({
        entryPoints: [absEntry],
        bundle: true,
        write: false,
        platform: 'node',
        format: 'cjs',
        plugins: [stubPlugin]
    });
    const mod = { exports: {} as Record<string, any> };
    const sandbox: Record<string, any> = {};
    for (const key of Object.getOwnPropertyNames(globalThis)) {
        if (key === 'global' || key === 'globalThis') continue;
        try {
            sandbox[key] = (globalThis as Record<string, any>)[key];
        } catch {
            // Skip restricted globals
        }
    }
    Object.assign(sandbox, {
        fetch: opts.fetchImpl ?? globalThis.fetch,
        __STATE_REDIS__: opts.redisMap ?? new Map<string, string>(),
        module: mod,
        exports: mod.exports,
        require: nodeRequire
    });
    sandbox.global = sandbox;
    sandbox.globalThis = sandbox;
    vm.runInNewContext(result.outputFiles[0].text, sandbox, { filename: absEntry });
    return mod.exports;
}

test.describe('Batch 3 — Operations, Vault Locks, Thermostat & Receipts UI', () => {
    test('operationsHelpers enforces integer allocationBps, whale U128Str formatting, fail-closed USD, and retail copy hygiene', async () => {
        const { exports: helpers } = await bundleAndEval(
            'src/lib/components/operations/operationsHelpers.ts'
        );

        expect(helpers.readSectorAllocationBps({ allocationBps: 3333, allocationPercentage: 25 })).toBe(3333);
        expect(helpers.readSectorAllocationBps({ allocationPercentage: 12.5 })).toBe(1250);
        expect(helpers.parsePctInputToBps('33.33', 10_000)).toBe(3333);
        expect(helpers.parsePctInputToBps('99', 5000)).toBe(5000);
        expect(helpers.formatBpsToPctDisplay(3333, 2, true)).toBe('33.33');
        expect(helpers.formatBpsToPctDisplay(2500, 2, true)).toBe('25');

        const sectors = [{ allocationBps: 4500 }, { allocationBps: 2500 }];
        expect(helpers.computeTotalAllocatedBps(sectors)).toBe(7000);
        expect(helpers.computeUnallocatedBps(sectors)).toBe(3000);
        expect(helpers.buildUpdateSectorAllocationPayload('sec-1', 3333)).toEqual({
            id: 'sec-1',
            sectorId: 'sec-1',
            allocationBps: 3333
        });

        // Whale U128Str formatting (> Number.MAX_SAFE_INTEGER)
        expect(helpers.formatSompiToKasDisplay('150000000000000000', 4, true)).toBe('1500000000');
        expect(helpers.formatUsdMicrosDisplay('150000000', 2, true)).toBe('150');
        expect(helpers.formatSettledAssetAmount('2500000', 'USDC', 6)).toBe('2.5');
        expect(helpers.computeFlushProgressBps('1250000000', '2500000000')).toBe(5000);

        // Clean USD formatting: empty string when oracle is offline (no card spam), $X.XX when online
        expect(helpers.formatSompiToUsdOrUnavailable('2500000000', null)).toBe('');
        expect(helpers.formatSompiToUsdOrUnavailable('2500000000', '0')).toBe('');
        expect(helpers.formatSompiToUsdOrUnavailable('2500000000', '12000000')).toBe('$3.00');
        expect(helpers.formatSectorDailyYieldLabel(25, 0, true)).toEqual({
            kasLabel: '~25.0 KAS/d',
            usdLabel: null
        });
        expect(helpers.formatSectorDailyYieldLabel(25, 3, false)).toEqual({
            kasLabel: '~25.0 KAS/d',
            usdLabel: '$3.00/d'
        });

        // Protocol jargon sanitizer
        expect(helpers.sanitizeRetailCopy('ORACLE_HALT: feed offline', 503)).toBe(
            'Live pricing unavailable'
        );
        const cleaned = helpers.sanitizeRetailCopy(
            'PSKT KIP-20 KIP-21 OpZkPrecompile 0x20 sompi DAA rejected'
        );
        expect(cleaned).not.toMatch(/PSKT|KIP-20|KIP-21|OpZkPrecompile|0x20|sompi|DAA/i);
        expect(helpers.formatSettlementTierLabel('L1_COW_ATOMIC_PSKT')).toBe('Direct Peer Match');
        expect(helpers.formatSettlementTierLabel('CROSS_CHAIN_OPSHA256_HTLC')).toBe(
            'Cross-Chain Atomic Fill'
        );

        // Wallet & Hashrate quick-fill helpers + 50/50 pair normalization
        expect(helpers.computeWalletQuickFillDecimal('10000000000000000', 8, 25)).toBe('25000000');
        expect(helpers.computeWalletQuickFillDecimal('10000000000000000', 8, 50)).toBe('50000000');
        expect(helpers.computeWalletQuickFillDecimal('10000000000000000', 8, 75)).toBe('75000000');
        expect(helpers.computeWalletQuickFillDecimal('10000000000000000', 8, 100)).toBe('100000000');
        expect(helpers.computeWalletQuickFillDecimal('0', 8, 50)).toBe('0');
        expect(helpers.computeWalletQuickFillDecimal(null, 6, 100)).toBe('0');

        expect(helpers.computeHashrateQuickFillPct(80, 25)).toBe(20);
        expect(helpers.computeHashrateQuickFillPct(80, 50)).toBe(40);
        expect(helpers.computeHashrateQuickFillPct(80, 75)).toBe(60);
        expect(helpers.computeHashrateQuickFillPct(80, 100)).toBe(80);

        const nonKasPair = helpers.normalizePlantTargets([
            { ticker: 'BTC', name: 'Bitcoin', assetClass: 'Crypto', spotPrice: 0, weightPct: 50, theme: { hex: '#f7931a', pastel: '#fde68a' } },
            { ticker: 'USDC', name: 'USD Coin', assetClass: 'Stablecoin', spotPrice: 1, weightPct: 50, theme: { hex: '#3B82F6', pastel: '#bfdbfe' } }
        ]);
        expect(nonKasPair.map((a: any) => `${a.ticker}:${a.weightPct}`)).toEqual(['BTC:50', 'USDC:50']);
    });

    test('Vault Lock registration, Path A BUILD_VAULT_CANCEL_PSKT local Schnorr signing, Thermostat upsert, and 503 bundle sync', async () => {
        const privKeyBytes = blake2b(new TextEncoder().encode('batch3-owner-key'), { dkLen: 32 });
        const privKeyHex = bytesToHex(privKeyBytes);
        const ownerPubkey = schnorr.getPublicKey(privKeyBytes);
        const triggerPubkey = schnorr.getPublicKey(
            blake2b(new TextEncoder().encode('batch3-trigger'), { dkLen: 32 })
        );
        const kip17Commitment = blake2b(new TextEncoder().encode('batch3-kip17'), { dkLen: 32 });
        const redeemScriptBytes = concatBytes(
            new Uint8Array([0x63, 0x20]),
            ownerPubkey,
            new Uint8Array([0xac, 0x67, 0x20]),
            kip17Commitment,
            new Uint8Array([0x75, 0x20]),
            triggerPubkey,
            new Uint8Array([0xac, 0x68])
        );
        const scriptHashHex = bytesToHex(blake2b(redeemScriptBytes, { dkLen: 32 }));
        const covenantSpkHex = `a9${scriptHashHex}87`;
        const refundSpkHex = `20${bytesToHex(ownerPubkey)}ac`;
        const inputSompi = 500_000_000n;
        const massInfo = computePostToccataMassAndFee({
            inputSompi: [inputSompi],
            outputSompi: [499_700_000n],
            extraSigScriptBytes: redeemScriptBytes.length,
            feePerGramSompi: RELAY_FEE_PER_GRAM_SOMPI
        });
        const cancelPskt: PsktPayload = {
            version: 1,
            subnetworkId: '0000000000000000000000000000000000000000',
            lockTime: 0,
            inputs: [
                {
                    previousOutpoint: { transactionId: '4'.repeat(64), index: 0 },
                    utxoEntry: {
                        amount: inputSompi.toString(),
                        scriptPublicKey: { version: 0, scriptPublicKey: covenantSpkHex }
                    },
                    redeemScriptHex: bytesToHex(redeemScriptBytes),
                    spendPath: 'PATH_A_24_7_USER_SOVEREIGNTY',
                    sequence: 0
                }
            ],
            outputs: [
                {
                    value: (inputSompi - massInfo.networkFeeSompi).toString(),
                    scriptPublicKey: { version: 0, scriptPublicKey: refundSpkHex }
                }
            ],
            payload: ''
        };

        let capturedBroadcastBody: any = null;
        const dispatchedActions: string[] = [];

        const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = String(input);
            if (url === '/api/broadcast') {
                capturedBroadcastBody = JSON.parse(String(init?.body || '{}'));
                validateAndSanitizePostToccataBroadcastTx(capturedBroadcastBody);
                return new Response(
                    JSON.stringify({ success: true, transactionId: 'f'.repeat(64) }),
                    { status: 200, headers: { 'content-type': 'application/json' } }
                );
            }
            const req = JSON.parse(String(init?.body || '{}'));
            dispatchedActions.push(req.action);
            if (req.action === 'BUILD_VAULT_CANCEL_PSKT') {
                return new Response(
                    JSON.stringify({
                        success: true,
                        data: {
                            vaultId: req.payload.vaultId,
                            spendPath: 'PATH_A_24_7_USER_SOVEREIGNTY',
                            pskt: cancelPskt,
                            feeBreakdown: {
                                totalInputSompi: inputSompi.toString(),
                                refundOutputSompi: (inputSompi - massInfo.networkFeeSompi).toString(),
                                networkFeeSompi: massInfo.networkFeeSompi.toString(),
                                effectiveMass: Number(massInfo.effectiveMass),
                                storageMass: Number(massInfo.storageMass),
                                computeGrams: Number(massInfo.computeGrams)
                            }
                        }
                    }),
                    { status: 200, headers: { 'content-type': 'application/json' } }
                );
            }
            if (req.action === 'GET_MATURE_ACCRUAL_AND_OUTBOX') {
                return new Response(
                    JSON.stringify({
                        success: true,
                        data: {
                            accrual: {
                                immatureSompi: '100000000',
                                unpaidMatureSompi: '1250000000',
                                lifetimeFlushedSompi: '7500000000',
                                lifetimePoolFeeSompi: '75000000',
                                poolFeeBps: 100,
                                lastMaturityDaa: '123456',
                                stage1FlushFloorSompi: '2500000000',
                                updatedAt: '2026-11-25T15:00:00Z'
                            },
                            outbox: [
                                {
                                    outboxKey: 'ob-1',
                                    epochId: '2026-11-25',
                                    destinationAddress: 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e',
                                    payoutSompi: '2500000000',
                                    houseFeeSompi: '25000000',
                                    networkFeeSompi: '20000',
                                    state: 'CONFIRMED',
                                    txid: 'e'.repeat(64),
                                    retryCount: 0,
                                    createdAt: '2026-11-25T15:00:00Z',
                                    updatedAt: '2026-11-25T15:00:00Z'
                                }
                            ]
                        }
                    }),
                    { status: 200, headers: { 'content-type': 'application/json' } }
                );
            }
            if (req.action === 'GET_VAULT_LOCKS') {
                return new Response(
                    JSON.stringify({
                        success: true,
                        data: {
                            vaults: [
                                {
                                    vaultId: 'vault-1',
                                    walletAddress: 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e',
                                    vaultKind: 'MINER_SILO',
                                    kip20CovenantId: 'a'.repeat(64),
                                    kip21SubnetworkId: '0000000000000000000000000000000000000000',
                                    covenantAddress: 'kaspa:pqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq6y9v2h',
                                    covenantSpkHex,
                                    redeemScriptHex: bytesToHex(redeemScriptBytes),
                                    ownerPubkeyHex: bytesToHex(ownerPubkey),
                                    chronosTriggerPubkeyHex: bytesToHex(triggerPubkey),
                                    targetAsset: 'USDC',
                                    targetNetwork: 'BASE',
                                    destinationAddress: '0x1111111111111111111111111111111111111111',
                                    refundKaspaAddress: 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e',
                                    thresholdSompi: '2500000000',
                                    feeBps: 50,
                                    makerSpreadBps: 0,
                                    confirmedUtxoSompi: '500000000',
                                    liveUtxoSompi: '500000000',
                                    liveUtxoCount: 1,
                                    confirmedDaaScore: '100',
                                    status: 'ACTIVE',
                                    updatedAt: '2026-11-25T15:00:00Z'
                                }
                            ]
                        }
                    }),
                    { status: 200, headers: { 'content-type': 'application/json' } }
                );
            }
            if (req.action === 'GET_THERMOSTAT_VALVES') {
                return new Response(
                    JSON.stringify({
                        success: true,
                        data: {
                            valves: [
                                {
                                    valveId: 'v-1',
                                    priorityOrder: 1,
                                    valveType: 'VALVE_1_ELECTRIC_BILL',
                                    targetAsset: 'USDC',
                                    targetNetwork: 'BASE',
                                    destinationAddress: '0x1111111111111111111111111111111111111111',
                                    targetCapSompi: '5000000000',
                                    targetCapUsdMicros: '150000000',
                                    filledEpochSompi: '2500000000',
                                    filledEpochUsdMicros: '75000000',
                                    isEnabled: true,
                                    updatedAt: '2026-11-25T15:00:00Z'
                                }
                            ]
                        }
                    }),
                    { status: 200, headers: { 'content-type': 'application/json' } }
                );
            }
            if (req.action === 'GET_SETTLEMENT_RECEIPTS') {
                return new Response(
                    JSON.stringify({
                        success: true,
                        data: {
                            receipts: [
                                {
                                    receiptId: 'rcpt-1',
                                    epochId: '2026-11-25',
                                    vaultId: 'vault-1',
                                    settlementTier: 'L1_COW_ATOMIC_PSKT',
                                    sourceSompi: '2500000000',
                                    houseFeeSompi: '12500000',
                                    networkFeeSompi: '20000',
                                    targetAsset: 'USDC',
                                    targetNetwork: 'BASE',
                                    settledAtomic: '3000000',
                                    oracleKasUsdE8: '12000000',
                                    kaspaL1Txid: 'b'.repeat(64),
                                    destinationTxid: '0x' + 'c'.repeat(64),
                                    status: 'CONFIRMED',
                                    settledAt: '2026-11-25T15:00:00Z'
                                }
                            ]
                        }
                    }),
                    { status: 200, headers: { 'content-type': 'application/json' } }
                );
            }
            return new Response(
                JSON.stringify({ success: true, data: { isSolvent: true, status: 'SOLVENT' } }),
                { status: 200, headers: { 'content-type': 'application/json' } }
            );
        }) as typeof fetch;

        const { exports: helpers, sandbox } = await bundleAndEval(
            'src/lib/components/operations/operationsHelpers.ts',
            { fetchImpl: mockFetch, browser: true }
        );
        sandbox.__BATCH3_DERIVED_KEYS__ = {
            kaspa: { address: 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e', privateKey: privKeyHex }
        };

        const vaultPayload = helpers.buildRegisterVaultLockPayload({
            vaultKind: 'MINER_SILO',
            targetAsset: 'USDC',
            destinationAddress: '0x1111111111111111111111111111111111111111',
            refundKaspaAddress: 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e',
            thresholdKasInput: '25.5'
        });
        expect(vaultPayload.thresholdSompi).toBe('2550000000');
        expect(vaultPayload.targetNetwork).toBe('ETH');

        const previewRes = await helpers.requestVaultCancelPreview('vault-1', undefined, mockFetch);
        expect(previewRes.ok).toBe(true);
        const signedBroadcast = await helpers.executeOwnerVaultCancelBroadcast({
            cancelPreview: previewRes.preview,
            redeemScriptHex: bytesToHex(redeemScriptBytes),
            vaultPassword: 'test-password',
            encryptedVaultB64: 'mock-cipher'
        });
        expect(signedBroadcast.txId).toBe('f'.repeat(64));
        expect(capturedBroadcastBody.transaction.version).toBe(1);
        expect(capturedBroadcastBody.transaction.inputs[0].sigOpCount).toBe(2);
        const sigScriptBytes = hexToBytes(capturedBroadcastBody.transaction.inputs[0].signatureScript);
        const sighash = computeKaspaTxV1InputSighash(
            capturedBroadcastBody.transaction,
            0,
            covenantSpkHex,
            inputSompi
        );
        expect(schnorr.verify(sigScriptBytes.slice(1, 65), sighash, ownerPubkey)).toBe(true);

        const bundle = await helpers.fetchSovereignOperationsBundle(undefined, mockFetch);
        expect(dispatchedActions).toContain('GET_MATURE_ACCRUAL_AND_OUTBOX');
        expect(dispatchedActions).toContain('GET_VAULT_LOCKS');
        expect(dispatchedActions).toContain('GET_THERMOSTAT_VALVES');
        expect(dispatchedActions).toContain('GET_SETTLEMENT_RECEIPTS');
        expect(dispatchedActions).toContain('GET_SOLVENCY_PROOF');
        expect(bundle.livePricingUnavailable).toBe(false);
        expect(bundle.vaults).toHaveLength(1);
        expect(bundle.receipts).toHaveLength(1);

        const valveDrafts = helpers.hydrateThermostatValveDrafts(
            bundle.valves,
            'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e'
        );
        expect(valveDrafts).toHaveLength(4);
        const upsertPayload = helpers.buildUpsertThermostatValvesPayload(valveDrafts);
        expect(upsertPayload.valves[0].targetCapSompi).toBe('5000000000');
        expect(upsertPayload.valves[0].targetCapUsdMicros).toBe('150000000');
        expect(helpers.computeValveFillProgressBps(bundle.valves[0])).toBe(5000);

        // Verify 503 fail-closed transition
        const offlineFetch = (async () =>
            new Response(JSON.stringify({ error: 'ORACLE_HALT: feed offline' }), {
                status: 503
            })) as typeof fetch;
        const offlineBundle = await helpers.fetchSovereignOperationsBundle(undefined, offlineFetch);
        expect(offlineBundle.livePricingUnavailable).toBe(true);

        // Verify invisible 80/20 fee math and shared wallet-first pair planner
        expect(helpers.computeLpMakerFeeUsdMicros('1000000')).toBe('800000');
        expect(helpers.computeTreasuryPairFeeUsdMicros('1000000')).toBe('200000');
        expect(helpers.isKaspaNativePairAsset('KAS')).toBe(true);
        expect(helpers.isKaspaNativePairAsset('SILO')).toBe(true);
        expect(helpers.isKaspaNativePairAsset('USDC')).toBe(false);
    });

    test('SSR renders Sovereign L1 Operations UI with live state and fail-closed 503 pricing unavailable state without protocol jargon', async () => {
        const { render } = await import('svelte/server');

        const { exports: opsViewMod } = await bundleAndEval('src/lib/views/OperationsView.svelte');
        const { exports: sidebarMod } = await bundleAndEval(
            'src/lib/components/operations/PoolDistributionSidebar.svelte'
        );
        const { exports: sectorCardMod } = await bundleAndEval(
            'src/lib/components/operations/SectorCard.svelte'
        );
        const { exports: modalsMod } = await bundleAndEval(
            'src/lib/components/operations/SectorConfigModals.svelte'
        );
        const { exports: pairPanelMod } = await bundleAndEval(
            'src/lib/components/dex/LiquidityAndSiloPanel.svelte'
        );

        // Live Sovereign state SSR check on Sidebar + SectorCard + Modals + OperationsView
        const sidebarHtmlOffline = render(sidebarMod.default, {
            props: {
                displayHashrate: 12.5,
                effortData: {
                    segments: [{ id: 's1', name: 'USDC-SPLIT', pct: 50, offset: 0, hex: '#18C6A5' }],
                    totalHash: 12.5
                },
                displayedBuckets: [
                    {
                        asset: 'USDC',
                        pendingKas: 10,
                        pendingUsd: 0,
                        minProfitableKas: 0,
                        minProfitableUsd: 0,
                        weightPct: 0,
                        participantCount: 0,
                        lpAvailableKasCapacity: 0,
                        lpCoveragePct: 0,
                        effectiveSpreadFloorPct: 0.1,
                        railCostUsd: 0,
                        status: 'PRICING_UNAVAILABLE',
                        lastClearedAt: 0,
                        lastClearType: 'NONE'
                    }
                ]
            }
        }).body;
        expect(sidebarHtmlOffline).toContain('Pending Splits');
        expect(sidebarHtmlOffline).toContain('sidebar-mature-accrual-card');
        expect(sidebarHtmlOffline).not.toContain('sidebar-solvency-badge');
        expect(sidebarHtmlOffline).not.toContain('100% Reserve Verified');
        expect(sidebarHtmlOffline).not.toContain('47.4');

        const sectorCardHtml = render(sectorCardMod.default, {
            props: {
                sector: {
                    id: 'sec-1',
                    name: 'USDC-SPLIT',
                    allocationBps: 3333,
                    allocationPercentage: 33.33,
                    routeMode: 'swap',
                    pendingKaspa: 0,
                    width: 6,
                    settlementConfig: {
                        targetAsset: {
                            ticker: 'USDC',
                            name: 'USD Coin',
                            assetClass: 'Stablecoin',
                            spotPrice: 0,
                            theme: { hex: '#3B82F6', pastel: '#bfdbfe' }
                        },
                        payoutAddress: '0x1111111111111111111111111111111111111111',
                        autoPayout: true,
                        mode: 'epoch',
                        threshold: 50,
                        appointmentDate: '',
                        appointmentTime: '17:00'
                    }
                },
                displayHashrate: 10,
                unallocatedPercentage: 66.67,
                dragSectorId: null,
                dropTargetSectorId: null,
                shimmerTargetId: null,
                mineableVaultMap: new Map(),
                savedBankRailLast4: null,
                savedBankRailMethod: 'ACH',
                livePricingUnavailable: true,
                resolveChainAddressForTicker: () => '0x1111111111111111111111111111111111111111',
                estimateSectorDailyKas: () => 25,
                estimateSectorDailyUsd: () => 0,
                onDragStart: () => {},
                onDragEnd: () => {},
                onDragOver: () => {},
                onDragLeave: () => {},
                onDrop: () => {},
                onToggleWidth: () => {},
                onDeleteSector: () => {},
                onInputPct: () => {},
                onInputHash: () => {},
                onSliderInput: () => {},
                onSliderChange: () => {},
                onCommitUpdate: () => {},
                onSnapMaxRemaining: () => {}
            }
        }).body;
        expect(sectorCardHtml).toContain('value="33.33"');
        expect(sectorCardHtml).toContain('~25.0 KAS/d');
        expect(sectorCardHtml).not.toContain('Lock Vault');
        expect(sectorCardHtml).not.toContain('sector-pair-swap-btn-sec-1');
        expect(sectorCardHtml).not.toContain('Live pricing unavailable');
        expect(sectorCardHtml).not.toContain('CLAIM_PENDING_SECTOR_KAS');

        const queuedPairHtml = render(sectorCardMod.default, {
            props: {
                sector: {
                    id: 'pair-q',
                    name: 'KAS / SILO',
                    allocationBps: 0,
                    allocationPercentage: 0,
                    routeMode: 'auto-lp',
                    pendingKaspa: 0,
                    width: 6,
                    settlementConfig: {
                        targetAsset: {
                            ticker: 'SILO',
                            name: 'Silo',
                            assetClass: 'DeFi',
                            spotPrice: 0.004,
                            theme: { hex: '#18C6A5', pastel: '#99f6e4' }
                        },
                        pairReserve: {
                            status: 'QUEUED',
                            baseTicker: 'KAS',
                            partnerTicker: 'SILO',
                            baseBalanceAtomic: '5000000000',
                            partnerBalanceAtomic: '0',
                            heldBaseAtomic: '5000000000',
                            queuedBaseAtomic: '5000000000',
                            targetPartnerAtomic: '100000000000',
                            accruedFeesUsdMicros: '0',
                            feeRateBps: 100,
                            updatedAt: 1700000000000
                        },
                        payoutAddress: 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e',
                        autoPayout: true,
                        mode: 'epoch',
                        threshold: 50,
                        appointmentDate: '',
                        appointmentTime: '17:00'
                    }
                },
                displayHashrate: 10,
                unallocatedPercentage: 50,
                dragSectorId: null,
                dropTargetSectorId: null,
                shimmerTargetId: null,
                mineableVaultMap: new Map(),
                savedBankRailLast4: null,
                savedBankRailMethod: 'ACH',
                livePricingUnavailable: false,
                resolveChainAddressForTicker: () => 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e',
                estimateSectorDailyKas: () => 50,
                estimateSectorDailyUsd: () => 6.5,
                onDragStart: () => {},
                onDragEnd: () => {},
                onDragOver: () => {},
                onDragLeave: () => {},
                onDrop: () => {},
                onToggleWidth: () => {},
                onDeleteSector: () => {},
                onInputPct: () => {},
                onInputHash: () => {},
                onSliderInput: () => {},
                onSliderChange: () => {},
                onCommitUpdate: () => {},
                onSnapMaxRemaining: () => {},
                onFundPair: () => {},
                onCancelOrWithdrawPair: async () => {}
            }
        }).body;
        const queuedText = queuedPairHtml.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
        expect(queuedText).toContain('KAS / SILO');
        expect(queuedPairHtml).toContain('pair-status-queued-pair-q');
        expect(queuedPairHtml).toContain('pair-cancel-btn-pair-q');
        expect(queuedText).toContain('CANCEL');
        expect(queuedText).not.toContain('50% KAS Pool Split');
        expect(queuedPairHtml).not.toContain('sector-pair-swap-btn-pair-q');

        const activePairHtml = render(sectorCardMod.default, {
            props: {
                sector: {
                    id: 'pair-a',
                    name: 'KAS / SILO',
                    allocationBps: 5000,
                    allocationPercentage: 50,
                    routeMode: 'auto-lp',
                    pendingKaspa: 0,
                    width: 6,
                    settlementConfig: {
                        targetAsset: {
                            ticker: 'SILO',
                            name: 'Silo',
                            assetClass: 'DeFi',
                            spotPrice: 0.004,
                            theme: { hex: '#18C6A5', pastel: '#99f6e4' }
                        },
                        pairReserve: {
                            status: 'ACTIVE',
                            baseTicker: 'KAS',
                            partnerTicker: 'SILO',
                            baseBalanceAtomic: '5000000000',
                            partnerBalanceAtomic: '100000000000',
                            heldBaseAtomic: '5000000000',
                            queuedBaseAtomic: '0',
                            targetPartnerAtomic: '100000000000',
                            accruedFeesUsdMicros: '1250000',
                            feeRateBps: 100,
                            updatedAt: 1700000000000
                        },
                        payoutAddress: 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e',
                        autoPayout: true,
                        mode: 'epoch',
                        threshold: 50,
                        appointmentDate: '',
                        appointmentTime: '17:00'
                    }
                },
                displayHashrate: 10,
                unallocatedPercentage: 50,
                dragSectorId: null,
                dropTargetSectorId: null,
                shimmerTargetId: null,
                mineableVaultMap: new Map(),
                savedBankRailLast4: null,
                savedBankRailMethod: 'ACH',
                livePricingUnavailable: false,
                resolveChainAddressForTicker: () => 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e',
                estimateSectorDailyKas: () => 50,
                estimateSectorDailyUsd: () => 6.5,
                onDragStart: () => {},
                onDragEnd: () => {},
                onDragOver: () => {},
                onDragLeave: () => {},
                onDrop: () => {},
                onToggleWidth: () => {},
                onDeleteSector: () => {},
                onInputPct: () => {},
                onInputHash: () => {},
                onSliderInput: () => {},
                onSliderChange: () => {},
                onCommitUpdate: () => {},
                onSnapMaxRemaining: () => {},
                onFundPair: () => {},
                onCancelOrWithdrawPair: async () => {}
            }
        }).body;
        const activeText = activePairHtml.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
        expect(activeText).toContain('KAS / SILO');
        expect(activeText).toContain('+$1.25');
        expect(activePairHtml).toContain('pair-fund-btn-pair-a');
        expect(activePairHtml).toContain('pair-withdraw-btn-pair-a');
        expect(activePairHtml).toContain('TH/s');
        expect(activeText).not.toContain('APY');
        const pairCardHtml = activePairHtml;

        const sectorCardHtmlOnline = render(sectorCardMod.default, {
            props: {
                sector: {
                    id: 'sec-1',
                    name: 'USDC-SPLIT',
                    allocationBps: 3333,
                    allocationPercentage: 33.33,
                    routeMode: 'swap',
                    pendingKaspa: 0,
                    width: 6,
                    settlementConfig: {
                        targetAsset: {
                            ticker: 'USDC',
                            name: 'USD Coin',
                            assetClass: 'Stablecoin',
                            spotPrice: 1,
                            theme: { hex: '#3B82F6', pastel: '#bfdbfe' }
                        },
                        payoutAddress: '0x1111111111111111111111111111111111111111',
                        autoPayout: true,
                        mode: 'epoch',
                        threshold: 50,
                        appointmentDate: '',
                        appointmentTime: '17:00'
                    }
                },
                displayHashrate: 10,
                unallocatedPercentage: 66.67,
                dragSectorId: null,
                dropTargetSectorId: null,
                shimmerTargetId: null,
                mineableVaultMap: new Map(),
                savedBankRailLast4: null,
                savedBankRailMethod: 'ACH',
                livePricingUnavailable: false,
                resolveChainAddressForTicker: () => '0x1111111111111111111111111111111111111111',
                estimateSectorDailyKas: () => 25,
                estimateSectorDailyUsd: () => 3.25,
                onDragStart: () => {},
                onDragEnd: () => {},
                onDragOver: () => {},
                onDragLeave: () => {},
                onDrop: () => {},
                onToggleWidth: () => {},
                onDeleteSector: () => {},
                onInputPct: () => {},
                onInputHash: () => {},
                onSliderInput: () => {},
                onSliderChange: () => {},
                onCommitUpdate: () => {},
                onSnapMaxRemaining: () => {},
                onOpenVaultLock: () => {}
            }
        }).body;
        expect(sectorCardHtmlOnline).toContain('~25.0 KAS/d');
        expect(sectorCardHtmlOnline).toContain('$3.25/d');

        // Clean MINE layout: +Split/+Pair action bar, mobile switcher, zero drawers or Lock Vault clutter
        const opsHtml = render(opsViewMod.default, { props: {} }).body;
        expect(opsHtml).toContain('ops-splits-action-bar');
        expect(opsHtml).toContain('ops-add-split-btn');
        expect(opsHtml).toContain('ops-add-pair-btn');
        expect(opsHtml).toContain('+ Split');
        expect(opsHtml).toContain('+ Pair');
        expect(opsHtml).not.toContain('sovereign-vault-locks-section');
        expect(opsHtml).not.toContain('sovereign-thermostat-section');
        expect(opsHtml).not.toContain('sovereign-receipts-section');
        expect(opsHtml).not.toContain('sidebar-solvency-badge');
        expect(opsHtml).not.toContain('100% Reserve Verified');
        expect(opsHtml).toContain('mobile-column-switcher');
        expect(opsHtml).toContain('mobile-col-tab-SPLITS');
        expect(opsHtml).toContain('mobile-col-tab-RIGS');
        expect(opsHtml).toContain('mobile-col-tab-REWARDS');
        expect(opsHtml).toContain('live-pricing-unavailable-banner');

        const baseModalProps = {
            isSectorModalOpen: true,
            draftSectorName: 'KAS / USDC',
            draftSectorPct: 50,
            draftSectorMax: 100,
            draftSelectedAssets: [
                { ticker: 'KAS', name: 'Kaspa', assetClass: 'Native L1', weightPct: 50, theme: { hex: '#18C6A5', pastel: '#99f6e4' } },
                { ticker: 'USDC', name: 'USD Coin', assetClass: 'Stablecoin', weightPct: 50, theme: { hex: '#3B82F6', pastel: '#bfdbfe' } }
            ],
            draftIsSyndicateSector: false,
            draftSettlementConfig: {
                targetAsset: {
                    ticker: 'USDC',
                    name: 'USD Coin',
                    assetClass: 'Stablecoin',
                    spotPrice: 0,
                    theme: { hex: '#3B82F6', pastel: '#bfdbfe' }
                },
                payoutAddress: '0x1111111111111111111111111111111111111111',
                autoPayout: true,
                mode: 'epoch',
                threshold: 50,
                appointmentDate: '',
                appointmentTime: '17:00'
            },
            settlementModalSilo: null,
            editSectorName: '',
            editSettlementParams: {
                targetAsset: {
                    ticker: 'KAS',
                    name: 'Kaspa',
                    assetClass: 'Native L1',
                    spotPrice: 0,
                    theme: { hex: '#18C6A5', pastel: '#99f6e4' }
                },
                payoutAddress: '',
                autoPayout: true,
                mode: 'epoch',
                threshold: 50,
                appointmentDate: '',
                appointmentTime: '17:00'
            },
            editSelectedAssets: [],
            isSigningSettlement: false,
            isVaultModalOpen: false,
            displayHashrate: 10,
            mineableVaultMap: new Map(),
            savedBankRailLast4: null,
            savedBankRailMethod: 'ACH',
            onUpdateDraftPct: () => {},
            onUpdateDraftHash: () => {},
            onCreateSector: async () => {},
            onSaveSettlementParams: async () => {},
            onEqualizeSecondaryWeights: () => {},
            onAdjustSecondaryPlantWeight: () => {},
            onRemoveAssetFromSector: () => {},
            onAddOrToggleAssetInSector: () => {}
        };

        const modalPairWalletHtml = render(modalsMod.default, {
            props: {
                ...baseModalProps,
                sectorModalMode: 'pair',
                pairFundMode: 'WALLET'
            }
        }).body;
        expect(modalPairWalletHtml).toContain('>PAIR<');
        expect(modalPairWalletHtml).toContain('pair-flow-panel');
        expect(modalPairWalletHtml).toContain('pair-base-select');
        expect(modalPairWalletHtml).toContain('pair-partner-select');
        expect(modalPairWalletHtml).not.toContain('(Optional)');
        expect(modalPairWalletHtml).not.toContain('80/20');
        expect(modalPairWalletHtml).not.toContain('pair-swap-modal');
        expect(modalPairWalletHtml).not.toMatch(/\bAPY\b/);
        expect(modalPairWalletHtml).toContain('pair-fee-rate-row');
        expect(modalPairWalletHtml).toContain('0.3%');
        expect(modalPairWalletHtml).toContain('1.0%');
        expect(modalPairWalletHtml).toContain('2.5%');
        expect(modalPairWalletHtml).toContain('pair-wallet-qf-25');
        expect(modalPairWalletHtml).toContain('pair-wallet-qf-100');
        expect(modalPairWalletHtml).toContain('pair-hashrate-slider-row');
        expect(modalPairWalletHtml).toContain('TH/s');
        expect(modalPairWalletHtml).toContain('>PAIR<');

        const swapPairHtml = render(pairPanelMod.default, {
            props: {
                mode: 'swap',
                baseTicker: 'KAS',
                partnerTicker: 'SILO',
                baseAmount: '',
                feeRateBps: 100
            }
        }).body;
        expect(swapPairHtml).toContain('pair-flow-panel');
        expect(swapPairHtml).toContain('dex-supply-lp-btn');
        expect(swapPairHtml).not.toContain('pair-hashrate-slider-row');
        expect(swapPairHtml).not.toMatch(/\bAPY\b/);

        const modalSplitHtml = render(modalsMod.default, {
            props: {
                ...baseModalProps,
                sectorModalMode: 'split',
                splitWalletBoostOpen: true,
                draftSelectedAssets: [
                    { ticker: 'USDC', name: 'USD Coin', assetClass: 'Stablecoin', weightPct: 100, theme: { hex: '#3B82F6', pastel: '#bfdbfe' } }
                ]
            }
        }).body;
        expect(modalSplitHtml).toContain('>SPLIT<');
        expect(modalSplitHtml).toContain('split-auto-title-badge');
        expect(modalSplitHtml).not.toContain('(Optional)');
        expect(modalSplitHtml).toContain('open-target-asset-picker-btn');
        expect(modalSplitHtml).toContain('Hashrate %');
        expect(modalSplitHtml).toContain('split-hashrate-qf-25');
        expect(modalSplitHtml).toContain('split-hashrate-qf-100');
        expect(modalSplitHtml).toContain('split-wallet-boost-toggle');
        expect(modalSplitHtml).toContain('split-wallet-boost-panel');
        expect(modalSplitHtml.indexOf('open-target-asset-picker-btn')).toBeLessThan(
            modalSplitHtml.indexOf('Hashrate %')
        );

        // Ensure zero protocol jargon leaks into rendered retail copy
        for (const rendered of [
            sidebarHtmlOffline,
            sectorCardHtml,
            pairCardHtml,
            queuedPairHtml,
            opsHtml,
            modalPairWalletHtml,
            swapPairHtml,
            modalSplitHtml
        ]) {
            const visibleText = rendered
                .replace(/<style[\s\S]*?<\/style>/gi, ' ')
                .replace(/<[^>]+>/g, ' ');
            expect(visibleText).not.toMatch(
                /\b(PSKT|KIP-20|KIP-21|OpZkPrecompile|0x20|sompi|ORACLE_HALT|DAA)\b/
            );
        }
    });

    test('GET /api/state returns live kasOracleUsd & oracleOnline: true from Redis spot price even when :8002 returns 503', async () => {
        const wallet = 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e';
        const liveRedis = new Map<string, string>([
            ['session:sess-live', wallet],
            ['oracle:spot:KAS_USDC', '0.026625000000000003'],
            ['oracle:change24h:KAS_USDC', '2.918']
        ]);
        const stateRoute = await loadStateRouteWithMocks({
            redisMap: liveRedis,
            fetchImpl: (async () =>
                new Response(JSON.stringify({ error: 'service unavailable' }), { status: 503 })) as typeof fetch
        });

        const liveRes = await stateRoute.GET({
            cookies: { get: (name: string) => (name === 'perennia_session' ? 'sess-live' : undefined) },
            url: new URL('http://localhost/api/state')
        });
        expect(liveRes.status).toBe(200);
        const liveBody = await liveRes.json();
        expect(liveBody.oracleOnline).toBe(true);
        expect(liveBody.livePricingUnavailable).toBe(false);
        expect(liveBody.kasOracleUsd).toBeCloseTo(0.026625, 8);
        expect(liveBody.kasOracleUsdE8).toBe('2662500');
        expect(liveBody.kasChange24h).toBeCloseTo(2.918, 3);

        // Missing Redis spot price must fail closed with null (zero 0.15 fallback)
        const offlineRedis = new Map<string, string>([['session:sess-offline', wallet]]);
        const offlineStateRoute = await loadStateRouteWithMocks({
            redisMap: offlineRedis,
            fetchImpl: (async () =>
                new Response(JSON.stringify({ error: 'service unavailable' }), { status: 503 })) as typeof fetch
        });
        const offlineRes = await offlineStateRoute.GET({
            cookies: { get: (name: string) => (name === 'perennia_session' ? 'sess-offline' : undefined) },
            url: new URL('http://localhost/api/state')
        });
        expect(offlineRes.status).toBe(200);
        const offlineBody = await offlineStateRoute.GET({
            cookies: { get: (name: string) => (name === 'perennia_session' ? 'sess-offline' : undefined) },
            url: new URL('http://localhost/api/state')
        }).then((r: Response) => r.json());
        expect(offlineRes.status).toBe(200);
        expect(offlineBody.oracleOnline).toBe(false);
        expect(offlineBody.livePricingUnavailable).toBe(true);
        expect(offlineBody.kasOracleUsd).toBeNull();
        expect(offlineBody.kasOracleUsdE8).toBeNull();
    });

    test('all 5 Batch 3 src/ files and spec preserve LF line endings and obey hard UI & non-custodial invariants', () => {
        const batch3Files = [
            'src/lib/components/operations/operationsHelpers.ts',
            'src/lib/views/OperationsView.svelte',
            'src/lib/components/operations/SectorCard.svelte',
            'src/lib/components/operations/PoolDistributionSidebar.svelte',
            'src/lib/components/operations/SectorConfigModals.svelte',
            'tests/sovereign-l1-batch3.spec.ts'
        ];
        for (const relPath of batch3Files) {
            const absPath = path.resolve(process.cwd(), relPath);
            const raw = fs.readFileSync(absPath, 'utf8');
            expect(raw.includes('\r'), `${relPath} must use LF line endings`).toBe(false);
            if (!relPath.startsWith('tests/')) {
                expect(raw, `${relPath} must retire CLAIM_PENDING_SECTOR_KAS`).not.toMatch(
                    /CLAIM_PENDING_SECTOR_KAS/
                );
                expect(raw, `${relPath} must not reference yield_reservoirs`).not.toMatch(
                    /yield_reservoirs/i
                );
                expect(raw, `${relPath} must not call /api/user/ledger`).not.toMatch(
                    /\/api\/user\/ledger/
                );
                expect(raw, `${relPath} must not contain 0.15 fallback`).not.toMatch(
                    /(?<![0-9.])0\.15(?![0-9])/
                );
                expect(raw, `${relPath} must not contain 47.4 fallback`).not.toMatch(
                    /(?<![0-9.])47\.4(?![0-9])/
                );
                expect(raw, `${relPath} must not use * 1e8 or / 1e8 float math`).not.toMatch(
                    /[*/]\s*1e8\b/
                );
                expect(raw, `${relPath} must not use backdrop-blur`).not.toMatch(
                    /backdrop-blur|backdrop-filter/i
                );
            }
        }
    });
});
