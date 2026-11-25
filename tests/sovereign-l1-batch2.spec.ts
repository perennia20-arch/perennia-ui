import { test, expect } from '@playwright/test';
import esbuild from 'esbuild';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const nodeRequire = createRequire(import.meta.url);

interface LoadedModuleOptions {
    envVars?: Record<string, string>;
    browser?: boolean;
    redisMap?: Map<string, string>;
    dbRowsBySql?: (sql: string) => any[];
    prepareInboundResult?: { status: number; payload: Record<string, unknown> };
    offHoursSpot?: Record<string, number>;
    fetchImpl?: typeof globalThis.fetch;
}

async function loadSrcModule(relPath: string, opts: LoadedModuleOptions = {}) {
    const absEntry = path.resolve(process.cwd(), relPath);
    const repoSrc = path.resolve(process.cwd(), 'src');
    const executedQueries: string[] = [];

    const stubPlugin: esbuild.Plugin = {
        name: 'batch2-node-stubs',
        setup(build) {
            build.onResolve(
                {
                    filter: /^(\$env\/dynamic\/private|\$app\/environment|@sveltejs\/kit|\$lib\/server\/(redis|db|kms|anyToAnyRouter)|\.\/identity\.svelte)$/
                },
                (args) => ({
                    path: args.path,
                    namespace: 'stub'
                })
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

            build.onLoad({ filter: /\.svelte\.ts$/ }, (args) => {
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
                    case '$env/dynamic/private':
                        return {
                            contents: `export const env = globalThis.__BATCH2_ENV__ || {};`,
                            loader: 'js'
                        };
                    case '$app/environment':
                        return {
                            contents: `export const browser = Boolean(globalThis.__BATCH2_BROWSER__);`,
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
                                    async get(k) { return globalThis.__BATCH2_REDIS__?.get(k) ?? null; },
                                    async set(k, v) { globalThis.__BATCH2_REDIS__?.set(k, String(v)); return 'OK'; },
                                    async sismember() { return 0; },
                                    async hgetall() { return {}; },
                                    async smembers() { return []; }
                                };
                            `,
                            loader: 'js'
                        };
                    case '$lib/server/db':
                        return {
                            contents: `
                                export const dbPool = {
                                    async query(sql) {
                                        globalThis.__BATCH2_QUERIES__?.push(String(sql));
                                        const rows = globalThis.__BATCH2_DB__ ? globalThis.__BATCH2_DB__(String(sql)) : [];
                                        return { rows };
                                    }
                                };
                            `,
                            loader: 'js'
                        };
                    case '$lib/server/kms':
                        return {
                            contents: `
                                export function normalizeKaspaBase32Strict(w) {
                                    return String(w || '').trim().toLowerCase().replace(/^kaspa:/, '');
                                }
                                export function normalizeKaspaAddressStrict(w) {
                                    const clean = normalizeKaspaBase32Strict(w);
                                    return clean ? 'kaspa:' + clean : '';
                                }
                            `,
                            loader: 'js'
                        };
                    case '$lib/server/anyToAnyRouter':
                        return {
                            contents: `
                                export function isSyntheticRwaAsset(t) {
                                    return ['SPY','QQQ','NVDA','AAPL','TSLA','AMD','TSM','AVGO','XLE','XAU','XAG','USTB'].includes(String(t).toUpperCase());
                                }
                                export async function prewarmSorSpotCache() {}
                                export async function resolveOffHoursAwareSpotUsd(t) {
                                    return globalThis.__BATCH2_OFFHOURS__?.[String(t).toUpperCase()] ?? 0;
                                }
                                export async function prepareAnyToAnyInboundLeg() {
                                    return globalThis.__BATCH2_PREPARE__ || { status: 200, payload: { ok: true } };
                                }
                            `,
                            loader: 'js'
                        };
                    case './identity.svelte':
                        return {
                            contents: `
                                export const identity = {
                                    isCorporateAdmin: false,
                                    activeAddress: 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e'
                                };
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

    const bundledCode = result.outputFiles[0].text;
    const mod = { exports: {} as Record<string, any> };
    const sandboxGlobals: Record<string, any> = {};
    for (const key of Object.getOwnPropertyNames(globalThis)) {
        if (key === 'global' || key === 'globalThis') continue;
        try {
            sandboxGlobals[key] = (globalThis as Record<string, any>)[key];
        } catch {
            // Ignore restricted globals
        }
    }
    Object.assign(sandboxGlobals, {
        fetch: opts.fetchImpl ?? globalThis.fetch,
        __BATCH2_ENV__: opts.envVars ?? {},
        __BATCH2_BROWSER__: opts.browser ?? false,
        __BATCH2_REDIS__: opts.redisMap ?? new Map<string, string>(),
        __BATCH2_DB__: opts.dbRowsBySql ?? (() => []),
        __BATCH2_QUERIES__: executedQueries,
        __BATCH2_PREPARE__: opts.prepareInboundResult,
        __BATCH2_OFFHOURS__: opts.offHoursSpot ?? {},
        module: mod,
        exports: mod.exports,
        require: nodeRequire
    });
    sandboxGlobals.global = sandboxGlobals;
    sandboxGlobals.globalThis = sandboxGlobals;

    vm.runInNewContext(bundledCode, sandboxGlobals, { filename: absEntry });
    return { exports: mod.exports, executedQueries };
}

test.describe('Batch 2 — SOR, Fail-Closed Oracles, Operations/Treasury Stores & Agent Nonce Proxy', () => {
    test('src/lib/server/sor.ts maps decimals identically to sor.rs, fails closed on 503, and parses non-custodial PSKT responses', async () => {
        let capturedUrl = '';
        let capturedHeaders: Record<string, string> = {};
        let capturedBody: Record<string, any> = {};

        const { exports: sorMod } = await loadSrcModule('src/lib/server/sor.ts', {
            envVars: {
                RUST_BACKEND_URL: 'http://127.0.0.1:8002',
                INTERNAL_ADMIN_TOKEN: 'test-admin-secret'
            },
            fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
                capturedUrl = String(input);
                capturedHeaders = (init?.headers as Record<string, string>) || {};
                capturedBody = JSON.parse(String(init?.body || '{}'));
                return new Response(
                    JSON.stringify({
                        success: true,
                        transactionUuid: 'tx-uuid-001',
                        routeType: 'L1_COW_ATOMIC_PSKT',
                        amountInAtomic: '2500000000',
                        protocolFeeAtomic: '12500000',
                        networkFeeSompi: '20400',
                        estimatedOutputAtomic: '3731250',
                        minOutputAtomic: '3712593',
                        feeBps: 50,
                        feeTierLabel: '50 bps Dark Pool CoW Major Tier',
                        grossUsdMicros: '3750000',
                        netUsdMicros: '3731250',
                        payOracleUsdE8: '15000000',
                        receiveOracleUsdE8: '100000000',
                        kasOracleUsdE8: '15000000',
                        refundKaspaAddress: 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e',
                        tokenSteering: {
                            allowed: true,
                            rejectReason: null,
                            payState: 'AUTO_BALANCE',
                            receiveState: 'AUTO_BALANCE',
                            allowDarkPoolInternalClearing: true,
                            feeLegs: [{ asset: 'KAS', shareRatio: 1.0 }],
                            explanation: 'Balanced'
                        },
                        pskt: { version: 1, inputs: [], outputs: [] },
                        htlcCovenant: null,
                        formattedUtxos: []
                    }),
                    { status: 200, headers: { 'content-type': 'application/json' } }
                );
            }) as typeof fetch
        });

        expect(sorMod.atomicDecimalsForSorAsset('KAS')).toBe(8);
        expect(sorMod.atomicDecimalsForSorAsset('BTC')).toBe(8);
        expect(sorMod.atomicDecimalsForSorAsset('SILO')).toBe(8);
        expect(sorMod.atomicDecimalsForSorAsset('USDC')).toBe(6);
        expect(sorMod.atomicDecimalsForSorAsset('USDT')).toBe(6);
        expect(sorMod.atomicDecimalsForSorAsset('SOL')).toBe(9);
        expect(sorMod.atomicDecimalsForSorAsset('ETH')).toBe(18);
        expect(sorMod.atomicDecimalsForSorAsset('BASE')).toBe(18);

        const res = await sorMod.sorEngine.executeNonCustodialSwap({
            wallet: 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e',
            payAsset: 'KAS',
            receiveAsset: 'USDC',
            targetNetwork: 'BASE',
            amountAtomic: '2500000000',
            slippageBps: 50
        });

        expect(capturedUrl).toBe('http://127.0.0.1:8002/v1/sor/execute');
        expect(capturedHeaders.Authorization).toBe('Bearer test-admin-secret');
        expect(capturedBody.amountAtomic).toBe('2500000000');
        expect(capturedBody.slippageBps).toBe(50);
        expect(res.routeType).toBe('L1_COW_ATOMIC_PSKT');
        expect(res.estimatedOutputAtomic).toBe('3731250');

        // Verify 503 fail-closed behavior
        const { exports: sor503Mod } = await loadSrcModule('src/lib/server/sor.ts', {
            envVars: {
                RUST_BACKEND_URL: 'http://127.0.0.1:8002',
                INTERNAL_ADMIN_TOKEN: 'test-admin-secret'
            },
            fetchImpl: (async () =>
                new Response(JSON.stringify({ error: 'ORACLE_HALT: feed offline' }), {
                    status: 503
                })) as typeof fetch
        });

        let caught503: any = null;
        try {
            await sor503Mod.sorEngine.executeNonCustodialSwap({
                wallet: 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e',
                payAsset: 'KAS',
                receiveAsset: 'USDC',
                amountAtomic: '2500000000'
            });
        } catch (err) {
            caught503 = err;
        }
        expect(caught503).toBeTruthy();
        expect(caught503.status).toBe(503);
        expect(caught503.livePricingUnavailable).toBe(true);
        expect(caught503.message).toBe('Live pricing unavailable');
    });

    test('/api/sor/swap fails closed 503 when oracle is offline and proxies :8002 PSKT without yield_reservoirs SQL', async () => {
        const wallet = 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e';
        const emptyRedis = new Map<string, string>();
        const { exports: offlineSwap } = await loadSrcModule('src/routes/api/sor/swap/+server.ts', {
            envVars: {
                RUST_BACKEND_URL: 'http://127.0.0.1:8002',
                INTERNAL_ADMIN_TOKEN: 'test-admin-secret'
            },
            redisMap: emptyRedis
        });

        const getOfflineRes = await offlineSwap.GET({
            url: new URL('http://localhost/api/sor/swap?payAsset=KAS&receiveAsset=USDC&amount=100'),
            cookies: { get: () => undefined },
            locals: {}
        });
        expect(getOfflineRes.status).toBe(503);
        const getOfflineBody = await getOfflineRes.json();
        expect(getOfflineBody.livePricingUnavailable).toBe(true);
        expect(getOfflineBody.uiMessage).toBe('Live pricing unavailable');

        const postOfflineRes = await offlineSwap.POST({
            request: new Request('http://localhost/api/sor/swap', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    wallet,
                    payAsset: 'KAS',
                    receiveAsset: 'USDC',
                    amountAtomic: '2500000000'
                })
            }),
            cookies: { get: () => undefined },
            locals: {}
        });
        expect(postOfflineRes.status).toBe(503);
        expect((await postOfflineRes.json()).uiMessage).toBe('Live pricing unavailable');

        // Now populate live KAS & USDC oracle prices and verify non-custodial :8002 PSKT pass-through
        const liveRedis = new Map<string, string>([
            ['oracle:spot:KAS_USDC', '0.12000000'],
            ['oracle:spot:USDC_USDC', '1.00000000']
        ]);
        const { exports: liveSwap, executedQueries } = await loadSrcModule(
            'src/routes/api/sor/swap/+server.ts',
            {
                envVars: {
                    RUST_BACKEND_URL: 'http://127.0.0.1:8002',
                    INTERNAL_ADMIN_TOKEN: 'test-admin-secret'
                },
                redisMap: liveRedis,
                fetchImpl: (async () =>
                    new Response(
                        JSON.stringify({
                            success: true,
                            transactionUuid: 'sor-pskt-002',
                            routeType: 'CROSS_CHAIN_OPSHA256_HTLC',
                            amountInAtomic: '2500000000',
                            protocolFeeAtomic: '12500000',
                            networkFeeSompi: '18500',
                            estimatedOutputAtomic: '2985000',
                            minOutputAtomic: '2970075',
                            feeBps: 50,
                            feeTierLabel: '50 bps Dark Pool Major',
                            grossUsdMicros: '3000000',
                            netUsdMicros: '2985000',
                            payOracleUsdE8: '12000000',
                            receiveOracleUsdE8: '100000000',
                            kasOracleUsdE8: '12000000',
                            refundKaspaAddress: wallet,
                            tokenSteering: {
                                allowed: true,
                                rejectReason: null,
                                payState: 'AUTO_BALANCE',
                                receiveState: 'AUTO_BALANCE',
                                allowDarkPoolInternalClearing: true,
                                feeLegs: [{ asset: 'KAS', shareRatio: 1.0 }],
                                explanation: 'OK'
                            },
                            pskt: {
                                version: 1,
                                inputs: [{ previousOutpoint: { transactionId: 'a'.repeat(64), index: 0 } }],
                                outputs: [
                                    {
                                        amount: '2487500000',
                                        scriptPublicKey: { version: 0, scriptPublicKey: `20${'b'.repeat(64)}ac` },
                                        covenant: { authorizingInput: 0, covenantId: 'c'.repeat(64) }
                                    }
                                ]
                            },
                            htlcCovenant: { sha256HashlockHex: 'd'.repeat(64) },
                            formattedUtxos: []
                        }),
                        { status: 200, headers: { 'content-type': 'application/json' } }
                    )) as typeof fetch
            }
        );

        const getLiveRes = await liveSwap.GET({
            url: new URL('http://localhost/api/sor/swap?payAsset=KAS&receiveAsset=USDC&amount=25'),
            cookies: { get: () => undefined },
            locals: {}
        });
        expect(getLiveRes.status).toBe(200);
        const getLiveBody = await getLiveRes.json();
        expect(getLiveBody.amountInAtomic).toBe('2500000000');
        expect(getLiveBody.kasOracleUsdE8).toBe('12000000');
        expect(getLiveBody.grossUsdMicros).toBe('3000000');

        const postLiveRes = await liveSwap.POST({
            request: new Request('http://localhost/api/sor/swap', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    wallet,
                    payAsset: 'KAS',
                    receiveAsset: 'USDC',
                    amountAtomic: '2500000000'
                })
            }),
            cookies: { get: () => undefined },
            locals: {}
        });
        expect(postLiveRes.status).toBe(200);
        const postLiveBody = await postLiveRes.json();
        expect(postLiveBody.routeType).toBe('CROSS_CHAIN_OPSHA256_HTLC');
        expect(postLiveBody.pskt.version).toBe(1);
        expect(postLiveBody.htlcCovenant.sha256HashlockHex).toBe('d'.repeat(64));
        expect(executedQueries.some((q) => /yield_reservoirs/i.test(q))).toBe(false);
    });

    test('operations.svelte.ts and treasury.svelte.ts fail closed with zero 0.15 fallback or simulated capacity', async () => {
        const { exports: opsMod } = await loadSrcModule('src/lib/stores/operations.svelte.ts', {
            browser: false
        });

        const offlineThreshold = opsMod.computeDynamicProfitableThreshold('USDC', undefined);
        expect(offlineThreshold.livePricingUnavailable).toBe(true);
        expect(offlineThreshold.minProfitableSompi).toBe('0');
        expect(offlineThreshold.minProfitableKas).toBe(0);

        const liveThreshold = opsMod.computeDynamicProfitableThreshold('USDC', 0.1);
        expect(liveThreshold.livePricingUnavailable).toBe(false);
        expect(BigInt(liveThreshold.minProfitableSompi)).toBeGreaterThan(0n);

        expect(opsMod.operations.allGlobalPoolBuckets[0].lpAvailableKasCapacity).toBe(0);

        // Treasury store fails closed on 503
        const { exports: treasMod } = await loadSrcModule('src/lib/stores/treasury.svelte.ts', {
            browser: true,
            fetchImpl: (async (input: RequestInfo | URL) => {
                if (String(input).includes('/api/prices/rwa')) {
                    return new Response(JSON.stringify({ error: 'offline' }), { status: 503 });
                }
                return new Response(JSON.stringify({ error: 'Oracle Sync Pending' }), {
                    status: 503
                });
            }) as typeof fetch
        });

        const syncOk = await treasMod.treasury.syncSpotOraclePrices();
        expect(syncOk).toBe(false);
        expect(treasMod.treasury.spotOracleOnline).toBe(false);
        expect(treasMod.treasury.livePricingUnavailable).toBe(true);
        expect(treasMod.treasury.pricingStatusMessage).toBe('Live pricing unavailable');
        expect(treasMod.treasury.getAsset('KAS').spotPriceE8).toBe('0');
        expect(treasMod.treasury.getAsset('USDC').decimals).toBe(6);
        expect(treasMod.treasury.getAsset('ETH').decimals).toBe(18);
    });

    test('/api/v1/agent/[...path] forwards X-Agent-Nonce, validates malformed nonces, and returns 503 NODE_UNAVAILABLE offline', async () => {
        let forwardedHeaders: Record<string, string> = {};
        let forwardedUrl = '';

        const { exports: agentProxy } = await loadSrcModule(
            'src/routes/api/v1/agent/[...path]/+server.ts',
            {
                envVars: {
                    RUST_BACKEND_URL: 'http://127.0.0.1:8002'
                },
                fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
                    forwardedUrl = String(input);
                    forwardedHeaders = Object.fromEntries((init?.headers as Headers).entries());
                    return new Response(JSON.stringify({ success: true }), {
                        status: 200,
                        headers: { 'content-type': 'application/json' }
                    });
                }) as typeof fetch
            }
        );

        const validRes = await agentProxy.POST({
            params: { path: 'chronos/bid' },
            url: new URL('http://localhost/api/v1/agent/chronos/bid'),
            request: new Request('http://localhost/api/v1/agent/chronos/bid', {
                method: 'POST',
                headers: {
                    authorization: 'Bearer agk_test_key',
                    'x-agent-nonce': 'nonce-0123456789abcdef',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({ batchId: 'b1' })
            }),
            getClientAddress: () => '127.0.0.1'
        });

        expect(validRes.status).toBe(200);
        expect(forwardedUrl).toBe('http://127.0.0.1:8002/api/v1/agent/chronos/bid');
        expect(forwardedHeaders['x-agent-nonce']).toBe('nonce-0123456789abcdef');
        expect(forwardedHeaders['authorization']).toBe('Bearer agk_test_key');

        const badNonceRes = await agentProxy.POST({
            params: { path: 'chronos/bid' },
            url: new URL('http://localhost/api/v1/agent/chronos/bid'),
            request: new Request('http://localhost/api/v1/agent/chronos/bid', {
                method: 'POST',
                headers: {
                    authorization: 'Bearer agk_test_key',
                    'x-agent-nonce': 'bad',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({ batchId: 'b1' })
            }),
            getClientAddress: () => '127.0.0.1'
        });
        expect(badNonceRes.status).toBe(400);
        expect((await badNonceRes.json()).error).toBe('INVALID_INPUT');

        const { exports: offlineAgentProxy } = await loadSrcModule(
            'src/routes/api/v1/agent/[...path]/+server.ts',
            {
                envVars: { RUST_BACKEND_URL: 'http://127.0.0.1:8002' },
                fetchImpl: (async () => {
                    throw new Error('ECONNREFUSED');
                }) as typeof fetch
            }
        );
        const offlineRes = await offlineAgentProxy.GET({
            params: { path: 'chronos/rfq' },
            url: new URL('http://localhost/api/v1/agent/chronos/rfq'),
            request: new Request('http://localhost/api/v1/agent/chronos/rfq'),
            getClientAddress: () => '127.0.0.1'
        });
        expect(offlineRes.status).toBe(503);
        expect((await offlineRes.json()).error).toBe('NODE_UNAVAILABLE');
    });

    test('all 5 Batch 2 src/ files and spec preserve LF line endings and contain zero forbidden fallbacks or custodial patterns', () => {
        const batch2Files = [
            'src/lib/server/sor.ts',
            'src/routes/api/sor/swap/+server.ts',
            'src/lib/stores/operations.svelte.ts',
            'src/lib/stores/treasury.svelte.ts',
            'src/routes/api/v1/agent/[...path]/+server.ts',
            'tests/sovereign-l1-batch2.spec.ts'
        ];
        for (const relPath of batch2Files) {
            const absPath = path.resolve(process.cwd(), relPath);
            const raw = fs.readFileSync(absPath, 'utf8');
            expect(raw.includes('\r'), `${relPath} must use LF line endings`).toBe(false);
            if (!relPath.startsWith('tests/')) {
                expect(raw, `${relPath} must not reference yield_reservoirs`).not.toMatch(
                    /yield_reservoirs/i
                );
                expect(raw, `${relPath} must not reference dev:sor:treasury:balances`).not.toMatch(
                    /dev:sor:treasury:balances/
                );
                expect(raw, `${relPath} must not contain 0.15 fallback`).not.toMatch(
                    /(?<![0-9.])0\.15(?![0-9])/
                );
                expect(raw, `${relPath} must not use * 1e8 or / 1e8 float math`).not.toMatch(
                    /[*/]\s*1e8\b/
                );
            }
        }
    });
});
