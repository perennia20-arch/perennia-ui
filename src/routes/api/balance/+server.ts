// WINDOWS (FRONTEND): C:\Users\send2\perennia-v5\perennia-frontend\src\routes\api\balance\+server.ts
import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { redis } from '$lib/server/redis';

const BALANCE_CACHE_TTL_SECS = 15;
const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

const KNOWN_SPL_MINTS: Record<string, { ticker: string; name: string }> = {
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
        ticker: 'USDC',
        name: 'USD Coin (Solana SPL)'
    },
    Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: {
        ticker: 'USDT',
        name: 'Tether USD (Solana SPL)'
    },
    XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W: {
        ticker: 'SPY',
        name: 'S&P 500 Index (SPL)'
    },
    Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ: {
        ticker: 'QQQ',
        name: 'Nasdaq 100 Index (SPL)'
    },
    Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh: {
        ticker: 'NVDA',
        name: 'NVIDIA Corp. (SPL)'
    },
    XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp: {
        ticker: 'AAPL',
        name: 'Apple Inc. (SPL)'
    },
    XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB: {
        ticker: 'TSLA',
        name: 'Tesla Inc. (SPL)'
    }
};

interface EvmTokenCheckSpec {
    ticker: string;
    network: 'ETH' | 'BASE' | 'ARB' | 'POL' | 'AVAX';
    contract: string;
    decimals: number;
}

const DEFAULT_EVM_TOKEN_CHECKS: EvmTokenCheckSpec[] = [
    {
        ticker: 'USDC',
        network: 'ETH',
        contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6
    },
    {
        ticker: 'USDC',
        network: 'BASE',
        contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        decimals: 6
    },
    {
        ticker: 'USDC',
        network: 'ARB',
        contract: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        decimals: 6
    },
    {
        ticker: 'USDC',
        network: 'POL',
        contract: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
        decimals: 6
    },
    {
        ticker: 'USDT',
        network: 'ETH',
        contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        decimals: 6
    },
    {
        ticker: 'XAU',
        network: 'ETH',
        contract: '0x45804880De22913dAFE09f4980848ECE6EcbAf78',
        decimals: 18
    }
];

function normalizeKaspaAddress(raw: string): string {
    const clean = raw.trim().toLowerCase().replace(/^kaspa:/i, '').trim();
    return `kaspa:${clean}`;
}

function getEvmRpcUrl(chain: 'ETH' | 'BASE' | 'ARB' | 'POL' | 'AVAX'): string {
    switch (chain) {
        case 'BASE':
            return env.BASE_RPC_URL || 'https://base-rpc.publicnode.com';
        case 'ARB':
            return env.ARB_RPC_URL || 'https://arbitrum-one-rpc.publicnode.com';
        case 'POL':
            return env.POL_RPC_URL || 'https://polygon-bor-rpc.publicnode.com';
        case 'AVAX':
            return (
                env.AVAX_RPC_URL ||
                'https://avalanche-c-chain-rpc.publicnode.com'
            );
        default:
            return env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com';
    }
}

async function fetchKaspaNativeBalance(rawAddress: string): Promise<{
    balanceKas: number;
    source: string;
}> {
    const formattedAddress = normalizeKaspaAddress(rawAddress);
    const cacheKey = `treasury:balance:${formattedAddress}`;

    try {
        const cached = await redis.get(cacheKey);
        if (cached !== null && cached !== undefined) {
            const parsed = parseFloat(cached);
            if (Number.isFinite(parsed) && parsed >= 0) {
                return { balanceKas: parsed, source: 'redis_cache' };
            }
        }
    } catch {
        // Proceed to local Rust node
    }

    const rustBackendUrl = (
        env.RUST_BACKEND_URL ||
        `http://${env.UBUNTU_NODE_IP || '127.0.0.1'}:8002`
    ).replace(/\/+$/, '');

    try {
        const localRes = await fetch(
            `${rustBackendUrl}/v1/balance?address=${encodeURIComponent(formattedAddress)}`,
            { signal: AbortSignal.timeout(3000) }
        );
        if (localRes.ok) {
            const localData = await localRes.json();
            const resolvedBalance = Number(
                localData.balanceKas ?? localData.balance ?? NaN
            );
            if (Number.isFinite(resolvedBalance) && resolvedBalance >= 0) {
                await redis
                    .set(
                        cacheKey,
                        resolvedBalance.toString(),
                        'EX',
                        BALANCE_CACHE_TTL_SECS
                    )
                    .catch(() => {});
                return {
                    balanceKas: resolvedBalance,
                    source: localData.source || 'local_rust_node'
                };
            }
        }
    } catch {
        // Fall through to Kaspa REST fallback
    }

    const kaspaRestUrl = (
        env.KASPA_REST_URL || 'https://api.kaspa.org'
    ).replace(/\/+$/, '');

    const res = await fetch(
        `${kaspaRestUrl}/addresses/${encodeURIComponent(formattedAddress)}/balance`,
        { signal: AbortSignal.timeout(4500) }
    );
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(
            `Kaspa REST fallback returned HTTP ${res.status}${errText ? `: ${errText}` : ''}`
        );
    }
    const data = await res.json();
    const rawSompi = Number(data?.balance);
    if (!Number.isFinite(rawSompi) || rawSompi < 0) {
        throw new Error('Malformed balance payload from Kaspa REST fallback.');
    }
    const balanceKas = rawSompi / 100_000_000;
    await redis
        .set(cacheKey, balanceKas.toString(), 'EX', BALANCE_CACHE_TTL_SECS)
        .catch(() => {});

    return { balanceKas, source: 'rest_fallback' };
}

async function fetchKaspaKrc20Balances(rawAddress: string): Promise<
    Array<{
        ticker: string;
        balance: number;
        decimals: number;
        network: 'KAS';
        contract: string;
    }>
> {
    const formattedAddress = normalizeKaspaAddress(rawAddress);
    if (formattedAddress.length < 58) return [];
    const cacheKey = `treasury:krc20_list:${formattedAddress}`;

    try {
        const cached = await redis.get(cacheKey);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch {
        // Ignore Redis cache error
    }

    try {
        const res = await fetch(
            `https://api.kasplex.org/v1/krc20/address/${encodeURIComponent(formattedAddress)}/tokenlist`,
            {
                headers: { accept: 'application/json' },
                signal: AbortSignal.timeout(4000)
            }
        );
        if (!res.ok) return [];
        const data = await res.json();
        const resultList = Array.isArray(data?.result) ? data.result : [];
        const tokens: Array<{
            ticker: string;
            balance: number;
            decimals: number;
            network: 'KAS';
            contract: string;
        }> = [];

        for (const item of resultList) {
            const ticker = String(item?.tick || '')
                .trim()
                .toUpperCase();
            const decimals = Number(item?.dec ?? 8);
            const rawBal = Number(item?.balance || 0);
            if (!ticker || !Number.isFinite(rawBal) || rawBal <= 0) continue;
            const balance = rawBal / Math.pow(10, decimals);
            tokens.push({
                ticker,
                balance: Number(balance.toFixed(8)),
                decimals,
                network: 'KAS',
                contract: ticker
            });
        }

        await redis
            .set(cacheKey, JSON.stringify(tokens), 'EX', BALANCE_CACHE_TTL_SECS)
            .catch(() => {});
        return tokens;
    } catch {
        return [];
    }
}

async function fetchBitcoinBalanceAndFees(btcAddress: string): Promise<{
    balanceBtc: number;
    utxoCount: number;
    feeEstimates: {
        fastestFeeSatVb: number;
        halfHourFeeSatVb: number;
        hourFeeSatVb: number;
    };
}> {
    const clean = btcAddress.trim();
    const defaultFees = {
        fastestFeeSatVb: 12,
        halfHourFeeSatVb: 8,
        hourFeeSatVb: 5
    };
    if (!clean || clean.includes('Awaiting')) {
        return { balanceBtc: 0, utxoCount: 0, feeEstimates: defaultFees };
    }

    const cacheKey = `treasury:btc_bundle:${clean}`;
    try {
        const cached = await redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch {
        // Ignore cache read error
    }

    const [addrRes, feeRes] = await Promise.allSettled([
        fetch(
            `https://mempool.space/api/address/${encodeURIComponent(clean)}`,
            {
                signal: AbortSignal.timeout(4000)
            }
        ),
        fetch('https://mempool.space/api/v1/fees/recommended', {
            signal: AbortSignal.timeout(3500)
        })
    ]);

    let balanceBtc = 0;
    let utxoCount = 0;
    let feeEstimates = { ...defaultFees };

    if (addrRes.status === 'fulfilled' && addrRes.value.ok) {
        try {
            const data = await addrRes.value.json();
            const funded = Number(data?.chain_stats?.funded_txo_sum || 0);
            const spent = Number(data?.chain_stats?.spent_txo_sum || 0);
            const mempoolFunded = Number(
                data?.mempool_stats?.funded_txo_sum || 0
            );
            const mempoolSpent = Number(
                data?.mempool_stats?.spent_txo_sum || 0
            );
            const netSats = Math.max(
                0,
                funded - spent + (mempoolFunded - mempoolSpent)
            );
            balanceBtc = netSats / 1e8;
            const fundedCount = Number(
                data?.chain_stats?.funded_txo_count || 0
            );
            const spentCount = Number(data?.chain_stats?.spent_txo_count || 0);
            utxoCount = Math.max(0, fundedCount - spentCount);
        } catch {
            balanceBtc = 0;
        }
    } else {
        try {
            const bsRes = await fetch(
                `https://blockstream.info/api/address/${encodeURIComponent(clean)}`,
                { signal: AbortSignal.timeout(4000) }
            );
            if (bsRes.ok) {
                const bsData = await bsRes.json();
                const funded = Number(bsData?.chain_stats?.funded_txo_sum || 0);
                const spent = Number(bsData?.chain_stats?.spent_txo_sum || 0);
                balanceBtc = Math.max(0, funded - spent) / 1e8;
            }
        } catch {
            balanceBtc = 0;
        }
    }

    if (feeRes.status === 'fulfilled' && feeRes.value.ok) {
        try {
            const fData = await feeRes.value.json();
            feeEstimates = {
                fastestFeeSatVb: Number(fData?.fastestFee || 12),
                halfHourFeeSatVb: Number(fData?.halfHourFee || 8),
                hourFeeSatVb: Number(fData?.hourFee || 5)
            };
        } catch {
            // Keep default fee estimates
        }
    }

    const bundle = { balanceBtc, utxoCount, feeEstimates };
    await redis
        .set(cacheKey, JSON.stringify(bundle), 'EX', BALANCE_CACHE_TTL_SECS)
        .catch(() => {});
    return bundle;
}

async function fetchEvmNativeBalance(
    chain: 'ETH' | 'BASE' | 'ARB' | 'POL' | 'AVAX',
    evmAddress: string
): Promise<number> {
    const clean = evmAddress.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(clean)) return 0;

    const cacheKey = `treasury:evm_native:${chain}:${clean.toLowerCase()}`;
    try {
        const cached = await redis.get(cacheKey);
        if (cached !== null) {
            const parsed = parseFloat(cached);
            if (Number.isFinite(parsed) && parsed >= 0) return parsed;
        }
    } catch {
        // Ignore cache error
    }

    try {
        const res = await fetch(getEvmRpcUrl(chain), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_getBalance',
                params: [clean, 'latest']
            }),
            signal: AbortSignal.timeout(4000)
        });
        if (!res.ok) return 0;
        const data = await res.json();
        const hexResult = String(data?.result || '0x0');
        if (!hexResult.startsWith('0x')) return 0;
        const wei = BigInt(hexResult);
        const bal = Number(wei) / 1e18;
        if (Number.isFinite(bal) && bal >= 0) {
            await redis
                .set(cacheKey, String(bal), 'EX', BALANCE_CACHE_TTL_SECS)
                .catch(() => {});
            return bal;
        }
    } catch {
        // Ignore RPC timeout
    }
    return 0;
}

async function fetchErc20TokenBalance(
    spec: EvmTokenCheckSpec,
    evmAddress: string
): Promise<number> {
    const cleanOwner = evmAddress.trim();
    const cleanContract = spec.contract.trim();
    if (
        !/^0x[0-9a-fA-F]{40}$/.test(cleanOwner) ||
        !/^0x[0-9a-fA-F]{40}$/.test(cleanContract)
    ) {
        return 0;
    }

    const cacheKey = `treasury:erc20:${spec.network}:${cleanContract.toLowerCase()}:${cleanOwner.toLowerCase()}`;
    try {
        const cached = await redis.get(cacheKey);
        if (cached !== null) {
            const parsed = parseFloat(cached);
            if (Number.isFinite(parsed) && parsed >= 0) return parsed;
        }
    } catch {
        // Ignore cache error
    }

    const paddedAddress = cleanOwner
        .toLowerCase()
        .replace(/^0x/, '')
        .padStart(64, '0');
    const callData = `0x70a08231${paddedAddress}`;

    try {
        const res = await fetch(getEvmRpcUrl(spec.network), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_call',
                params: [
                    {
                        to: cleanContract,
                        data: callData
                    },
                    'latest'
                ]
            }),
            signal: AbortSignal.timeout(4000)
        });
        if (!res.ok) return 0;
        const data = await res.json();
        const hexResult = String(data?.result || '0x0');
        if (!hexResult.startsWith('0x') || hexResult === '0x') return 0;
        const rawUnits = BigInt(hexResult);
        const bal = Number(rawUnits) / Math.pow(10, spec.decimals);
        if (Number.isFinite(bal) && bal >= 0) {
            await redis
                .set(cacheKey, String(bal), 'EX', BALANCE_CACHE_TTL_SECS)
                .catch(() => {});
            return bal;
        }
    } catch {
        // Ignore ERC-20 call error
    }
    return 0;
}

async function fetchSolanaNativeAndSplBalances(solAddress: string): Promise<{
    balanceSol: number;
    splTokens: Array<{
        ticker: string;
        name: string;
        mint: string;
        balance: number;
        decimals: number;
        network: 'SOL';
    }>;
}> {
    const clean = solAddress.trim();
    if (!clean || clean.includes('Awaiting') || clean.length < 32) {
        return { balanceSol: 0, splTokens: [] };
    }

    const cacheKey = `treasury:sol_bundle:${clean}`;
    try {
        const cached = await redis.get(cacheKey);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch {
        // Ignore cache error
    }

    const rpcUrl = env.SOL_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const [balRes, splRes] = await Promise.allSettled([
        fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getBalance',
                params: [clean, { commitment: 'confirmed' }]
            }),
            signal: AbortSignal.timeout(4000)
        }),
        fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'getTokenAccountsByOwner',
                params: [
                    clean,
                    { programId: SPL_TOKEN_PROGRAM_ID },
                    { encoding: 'jsonParsed', commitment: 'confirmed' }
                ]
            }),
            signal: AbortSignal.timeout(4500)
        })
    ]);

    let balanceSol = 0;
    if (balRes.status === 'fulfilled' && balRes.value.ok) {
        try {
            const bData = await balRes.value.json();
            const lamports = Number(bData?.result?.value || 0);
            if (Number.isFinite(lamports) && lamports >= 0) {
                balanceSol = lamports / 1e9;
            }
        } catch {
            balanceSol = 0;
        }
    }

    const splTokens: Array<{
        ticker: string;
        name: string;
        mint: string;
        balance: number;
        decimals: number;
        network: 'SOL';
    }> = [];

    if (splRes.status === 'fulfilled' && splRes.value.ok) {
        try {
            const sData = await splRes.value.json();
            const accounts = Array.isArray(sData?.result?.value)
                ? sData.result.value
                : [];
            for (const acc of accounts) {
                const parsedInfo = acc?.account?.data?.parsed?.info;
                const mint = String(parsedInfo?.mint || '').trim();
                const tokenAmount = parsedInfo?.tokenAmount;
                const uiAmount = Number(
                    tokenAmount?.uiAmount ?? tokenAmount?.uiAmountString ?? 0
                );
                const decimals = Number(tokenAmount?.decimals ?? 6);
                if (!mint || !Number.isFinite(uiAmount) || uiAmount <= 0) {
                    continue;
                }
                const known = KNOWN_SPL_MINTS[mint];
                const ticker =
                    known?.ticker || `SPL-${mint.slice(0, 4).toUpperCase()}`;
                const name = known?.name || `SPL Token (${mint.slice(0, 8)}...)`;
                splTokens.push({
                    ticker,
                    name,
                    mint,
                    balance: uiAmount,
                    decimals,
                    network: 'SOL'
                });
            }
        } catch {
            // Ignore SPL parse error
        }
    }

    const bundle = { balanceSol, splTokens };
    await redis
        .set(cacheKey, JSON.stringify(bundle), 'EX', BALANCE_CACHE_TTL_SECS)
        .catch(() => {});
    return bundle;
}

async function fetchSecondaryL1Balance(
    ticker: 'DOGE' | 'XRP' | 'TRX' | 'SUI' | 'ZEC',
    address: string
): Promise<number> {
    const clean = address.trim();
    if (!clean || clean.includes('Awaiting')) return 0;

    const cacheKey = `treasury:sec_l1:${ticker}:${clean}`;
    try {
        const cached = await redis.get(cacheKey);
        if (cached !== null) {
            const parsed = parseFloat(cached);
            if (Number.isFinite(parsed) && parsed >= 0) return parsed;
        }
    } catch {
        // Ignore cache error
    }

    let resolved = 0;
    try {
        if (ticker === 'XRP' && clean.startsWith('r')) {
            const res = await fetch('https://xrplcluster.com', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    method: 'account_info',
                    params: [{ account: clean, ledger_index: 'validated' }]
                }),
                signal: AbortSignal.timeout(4000)
            });
            if (res.ok) {
                const data = await res.json();
                const drops = Number(
                    data?.result?.account_data?.Balance || 0
                );
                if (Number.isFinite(drops) && drops > 0) {
                    resolved = drops / 1e6;
                }
            }
        } else if (ticker === 'SUI' && /^0x[0-9a-fA-F]{60,64}$/.test(clean)) {
            const res = await fetch('https://fullnode.mainnet.sui.io:443', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'suix_getBalance',
                    params: [clean, '0x2::sui::SUI']
                }),
                signal: AbortSignal.timeout(4000)
            });
            if (res.ok) {
                const data = await res.json();
                const mist = Number(data?.result?.totalBalance || 0);
                if (Number.isFinite(mist) && mist > 0) {
                    resolved = mist / 1e9;
                }
            }
        } else if (ticker === 'TRX' && clean.startsWith('T')) {
            const res = await fetch(
                `https://api.trongrid.io/v1/accounts/${encodeURIComponent(clean)}`,
                { signal: AbortSignal.timeout(4000) }
            );
            if (res.ok) {
                const data = await res.json();
                const sun = Number(data?.data?.[0]?.balance || 0);
                if (Number.isFinite(sun) && sun > 0) {
                    resolved = sun / 1e6;
                }
            }
        } else if (ticker === 'DOGE' || ticker === 'ZEC') {
            const chainSlug = ticker === 'DOGE' ? 'dogecoin' : 'zcash';
            const res = await fetch(
                `https://api.blockchair.com/${chainSlug}/dashboards/address/${encodeURIComponent(clean)}`,
                { signal: AbortSignal.timeout(4000) }
            );
            if (res.ok) {
                const data = await res.json();
                const sats = Number(
                    data?.data?.[clean]?.address?.balance || 0
                );
                if (Number.isFinite(sats) && sats > 0) {
                    resolved = sats / 1e8;
                }
            }
        }
    } catch {
        resolved = 0;
    }

    await redis
        .set(cacheKey, String(resolved), 'EX', 25)
        .catch(() => {});
    return resolved;
}

async function executeMultiChainBalanceScan(params: {
    kas?: string;
    btc?: string;
    eth?: string;
    sol?: string;
    doge?: string;
    xrp?: string;
    trx?: string;
    sui?: string;
    zec?: string;
    customErc20s?: EvmTokenCheckSpec[];
}) {
    const chains: Record<string, number> = {};
    const tokens: Record<string, number> = {};
    const tokenDetails: Array<{
        ticker: string;
        network: string;
        balance: number;
        contract?: string;
        decimals?: number;
    }> = [];
    let krc20Tokens: Array<{
        ticker: string;
        balance: number;
        decimals: number;
        network: 'KAS';
        contract: string;
    }> = [];
    let btcFeeEstimates = {
        fastestFeeSatVb: 12,
        halfHourFeeSatVb: 8,
        hourFeeSatVb: 5
    };
    let kasSource = 'local_rust_node';

    const tasks: Promise<void>[] = [];

    if (params.kas && !params.kas.includes('Awaiting')) {
        tasks.push(
            (async () => {
                try {
                    const [nativeKas, krcList] = await Promise.all([
                        fetchKaspaNativeBalance(params.kas!),
                        fetchKaspaKrc20Balances(params.kas!)
                    ]);
                    chains.KAS = nativeKas.balanceKas;
                    kasSource = nativeKas.source;
                    krc20Tokens = krcList;
                    for (const krc of krcList) {
                        tokens[krc.ticker] =
                            (tokens[krc.ticker] || 0) + krc.balance;
                        tokenDetails.push({
                            ticker: krc.ticker,
                            network: 'KAS',
                            balance: krc.balance,
                            contract: krc.contract,
                            decimals: krc.decimals
                        });
                    }
                } catch {
                    chains.KAS = 0;
                }
            })()
        );
    }

    if (params.btc && !params.btc.includes('Awaiting')) {
        tasks.push(
            (async () => {
                const btcBundle = await fetchBitcoinBalanceAndFees(params.btc!);
                chains.BTC = btcBundle.balanceBtc;
                btcFeeEstimates = btcBundle.feeEstimates;
            })()
        );
    }

    if (params.eth && /^0x[0-9a-fA-F]{40}$/.test(params.eth.trim())) {
        const evmAddr = params.eth.trim();
        tasks.push(
            (async () => {
                const [ethBal, baseBal, arbBal, polBal, avaxBal] =
                    await Promise.all([
                        fetchEvmNativeBalance('ETH', evmAddr),
                        fetchEvmNativeBalance('BASE', evmAddr),
                        fetchEvmNativeBalance('ARB', evmAddr),
                        fetchEvmNativeBalance('POL', evmAddr),
                        fetchEvmNativeBalance('AVAX', evmAddr)
                    ]);
                chains.ETH = ethBal;
                chains.BASE = baseBal;
                chains.ARB = arbBal;
                chains.POL = polBal;
                chains.AVAX = avaxBal;

                const tokenSpecs = [
                    ...DEFAULT_EVM_TOKEN_CHECKS,
                    ...(params.customErc20s || [])
                ];
                const tokenBals = await Promise.all(
                    tokenSpecs.map(async (spec) => ({
                        spec,
                        balance: await fetchErc20TokenBalance(spec, evmAddr)
                    }))
                );

                for (const { spec, balance } of tokenBals) {
                    if (balance > 0) {
                        tokens[spec.ticker] = Number(
                            ((tokens[spec.ticker] || 0) + balance).toFixed(8)
                        );
                        tokenDetails.push({
                            ticker: spec.ticker,
                            network: spec.network,
                            balance,
                            contract: spec.contract,
                            decimals: spec.decimals
                        });
                    }
                }
            })()
        );
    }

    if (params.sol && !params.sol.includes('Awaiting')) {
        tasks.push(
            (async () => {
                const solBundle = await fetchSolanaNativeAndSplBalances(
                    params.sol!
                );
                chains.SOL = solBundle.balanceSol;
                for (const spl of solBundle.splTokens) {
                    tokens[spl.ticker] = Number(
                        ((tokens[spl.ticker] || 0) + spl.balance).toFixed(8)
                    );
                    tokenDetails.push({
                        ticker: spl.ticker,
                        network: 'SOL',
                        balance: spl.balance,
                        contract: spl.mint,
                        decimals: spl.decimals
                    });
                }
            })()
        );
    }

    if (params.doge && !params.doge.includes('Awaiting')) {
        tasks.push(
            (async () => {
                chains.DOGE = await fetchSecondaryL1Balance(
                    'DOGE',
                    params.doge!
                );
            })()
        );
    }

    if (params.xrp && !params.xrp.includes('Awaiting')) {
        tasks.push(
            (async () => {
                chains.XRP = await fetchSecondaryL1Balance('XRP', params.xrp!);
            })()
        );
    }

    if (params.trx && !params.trx.includes('Awaiting')) {
        tasks.push(
            (async () => {
                chains.TRX = await fetchSecondaryL1Balance('TRX', params.trx!);
            })()
        );
    }

    if (params.sui && !params.sui.includes('Awaiting')) {
        tasks.push(
            (async () => {
                chains.SUI = await fetchSecondaryL1Balance('SUI', params.sui!);
            })()
        );
    }

    if (params.zec && !params.zec.includes('Awaiting')) {
        tasks.push(
            (async () => {
                chains.ZEC = await fetchSecondaryL1Balance('ZEC', params.zec!);
            })()
        );
    }

    await Promise.allSettled(tasks);

    const primaryKasBalance = Number(chains.KAS ?? 0);

    return {
        success: true,
        balance: primaryKasBalance,
        balanceKas: primaryKasBalance,
        source: kasSource,
        chains,
        tokens,
        tokenDetails,
        krc20Tokens,
        btcFeeEstimates,
        timestamp: Date.now()
    };
}

export const GET: RequestHandler = async ({ url }: RequestEvent) => {
    const rawAddress = url.searchParams.get('address');
    const kasParam = url.searchParams.get('kas') || rawAddress || '';
    const btcParam = url.searchParams.get('btc') || '';
    const ethParam = url.searchParams.get('eth') || '';
    const solParam = url.searchParams.get('sol') || '';
    const dogeParam = url.searchParams.get('doge') || '';
    const xrpParam = url.searchParams.get('xrp') || '';
    const trxParam = url.searchParams.get('trx') || '';
    const suiParam = url.searchParams.get('sui') || '';
    const zecParam = url.searchParams.get('zec') || '';

    const hasMultiChainParams = Boolean(
        url.searchParams.get('kas') ||
            btcParam ||
            ethParam ||
            solParam ||
            dogeParam ||
            xrpParam ||
            trxParam ||
            suiParam ||
            zecParam
    );

    if (!kasParam && !hasMultiChainParams) {
        return json({ error: 'Address parameter missing' }, { status: 400 });
    }

    // Fast path for single Kaspa address lookup while also returning KRC-20 balances if requested
    if (!hasMultiChainParams && rawAddress) {
        try {
            const includeKrc20 = url.searchParams.get('krc20') !== 'false';
            const [kasRes, krc20Tokens] = await Promise.all([
                fetchKaspaNativeBalance(rawAddress),
                includeKrc20
                    ? fetchKaspaKrc20Balances(rawAddress)
                    : Promise.resolve([])
            ]);
            return json({
                balance: kasRes.balanceKas,
                balanceKas: kasRes.balanceKas,
                source: kasRes.source,
                krc20Tokens
            });
        } catch (e: any) {
            return json(
                {
                    error: 'L1_BALANCE_UNAVAILABLE',
                    details:
                        e.message ||
                        'Both local kaspad gRPC and fallback REST endpoints failed.'
                },
                { status: 502 }
            );
        }
    }

    const customErc20Param = url.searchParams.get('erc20') || '';
    const customErc20s: EvmTokenCheckSpec[] = [];
    if (customErc20Param) {
        for (const item of customErc20Param.split(',')) {
            const [ticker, network, contract, decStr] = item.trim().split(':');
            if (ticker && network && contract && contract.startsWith('0x')) {
                customErc20s.push({
                    ticker: ticker.toUpperCase(),
                    network: network.toUpperCase() as any,
                    contract,
                    decimals: Number(decStr || 18)
                });
            }
        }
    }

    const scanResult = await executeMultiChainBalanceScan({
        kas: kasParam || undefined,
        btc: btcParam || undefined,
        eth: ethParam || undefined,
        sol: solParam || undefined,
        doge: dogeParam || undefined,
        xrp: xrpParam || undefined,
        trx: trxParam || undefined,
        sui: suiParam || undefined,
        zec: zecParam || undefined,
        customErc20s
    });

    return json(scanResult);
};

export const POST: RequestHandler = async ({ request }: RequestEvent) => {
    try {
        const body = await request.json().catch(() => ({}));
        const addresses = body.addresses || body;
        const customErc20s: EvmTokenCheckSpec[] = Array.isArray(
            body.customErc20s
        )
            ? body.customErc20s
            : [];

        const scanResult = await executeMultiChainBalanceScan({
            kas: addresses.kas || addresses.kaspa || addresses.address,
            btc: addresses.btc || addresses.bitcoin,
            eth: addresses.eth || addresses.ethereum,
            sol: addresses.sol || addresses.solana,
            doge: addresses.doge || addresses.dogecoin,
            xrp: addresses.xrp || addresses.ripple,
            trx: addresses.trx || addresses.tron,
            sui: addresses.sui,
            zec: addresses.zec || addresses.zcash,
            customErc20s
        });

        return json(scanResult);
    } catch (err: any) {
        return json(
            {
                error:
                    err?.message ||
                    'Failed to scan multi-chain on-chain balances.'
            },
            { status: 500 }
        );
    }
};