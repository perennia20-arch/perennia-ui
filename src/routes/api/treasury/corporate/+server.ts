import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import {
    isWalletMasterAdmin,
    normalizeKaspaAddressStrict,
    perenniaKMS
} from '$lib/server/kms';

const FEE_TRACKED_TICKERS = [
    'KAS',
    'USDC',
    'USDT',
    'BTC',
    'ETH',
    'SOL',
    'SILO',
    'XRP',
    'DOGE',
    'POL',
    'AVAX',
    'ARB',
    'BASE'
] as const;

async function fetchKaspaBalance(address: string): Promise<number> {
    const formatted = normalizeKaspaAddressStrict(address);
    if (!formatted || formatted.length < 60) return 0;

    const cacheKey = `treasury:balance:${formatted.toLowerCase()}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached !== null) {
        const parsed = parseFloat(cached);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }

    const rustBackendUrl =
        env.RUST_BACKEND_URL ||
        `http://${env.UBUNTU_NODE_IP || '127.0.0.1'}:8002`;

    try {
        const rustRes = await fetch(
            `${rustBackendUrl}/v1/balance?address=${encodeURIComponent(formatted)}`,
            { signal: AbortSignal.timeout(3500) }
        );
        if (rustRes.ok) {
            const data = await rustRes.json();
            const bal = Number(data?.balanceKas ?? data?.balance ?? 0);
            if (Number.isFinite(bal) && bal >= 0) {
                await redis
                    .set(cacheKey, String(bal), 'EX', 15)
                    .catch(() => {});
                return bal;
            }
        }
    } catch {
        // Fall through to KASPA_REST_URL
    }

    try {
        const restUrl = (
            env.KASPA_REST_URL || 'https://api.kaspa.org'
        ).replace(/\/+$/, '');
        const res = await fetch(
            `${restUrl}/addresses/${encodeURIComponent(formatted)}/balance`,
            { signal: AbortSignal.timeout(4000) }
        );
        if (res.ok) {
            const data = await res.json();
            const bal = (Number(data?.balance) || 0) / 1e8;
            if (Number.isFinite(bal) && bal >= 0) {
                await redis
                    .set(cacheKey, String(bal), 'EX', 15)
                    .catch(() => {});
                return bal;
            }
        }
    } catch {
        // Ignore upstream timeout
    }

    return 0;
}

async function fetchEvmNativeBalance(
    chain: 'ETH' | 'POL' | 'AVAX',
    address: string
): Promise<number> {
    const clean = address.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(clean)) return 0;

    const cacheKey = `treasury:balance:${chain}:${clean.toLowerCase()}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached !== null) {
        const parsed = parseFloat(cached);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }

    const rpcUrl =
        chain === 'POL'
            ? env.POL_RPC_URL || 'https://polygon-bor-rpc.publicnode.com'
            : chain === 'AVAX'
              ? env.AVAX_RPC_URL ||
                'https://avalanche-c-chain-rpc.publicnode.com'
              : env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com';

    try {
        const res = await fetch(rpcUrl, {
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
        if (res.ok) {
            const data = await res.json();
            if (data?.result && typeof data.result === 'string') {
                const wei = BigInt(data.result);
                const bal = Number(wei) / 1e18;
                if (Number.isFinite(bal) && bal >= 0) {
                    await redis
                        .set(cacheKey, String(bal), 'EX', 20)
                        .catch(() => {});
                    return bal;
                }
            }
        }
    } catch {
        // Ignore RPC timeout
    }
    return 0;
}

async function fetchBitcoinBalance(address: string): Promise<number> {
    const clean = address.trim();
    if (!clean || clean.includes('Awaiting')) return 0;

    const cacheKey = `treasury:balance:BTC:${clean}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached !== null) {
        const parsed = parseFloat(cached);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }

    try {
        const res = await fetch(
            `https://mempool.space/api/address/${encodeURIComponent(clean)}`,
            { signal: AbortSignal.timeout(4000) }
        );
        if (res.ok) {
            const data = await res.json();
            const funded = Number(data?.chain_stats?.funded_txo_sum || 0);
            const spent = Number(data?.chain_stats?.spent_txo_sum || 0);
            const bal = Math.max(0, funded - spent) / 1e8;
            await redis.set(cacheKey, String(bal), 'EX', 20).catch(() => {});
            return bal;
        }
    } catch {
        // Ignore mempool.space timeout
    }
    return 0;
}

async function fetchSolanaBalance(address: string): Promise<number> {
    const clean = address.trim();
    if (!clean || clean.includes('Awaiting') || clean.length < 32) return 0;

    const cacheKey = `treasury:balance:SOL:${clean}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached !== null) {
        const parsed = parseFloat(cached);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }

    const rpcUrl = env.SOL_RPC_URL || 'https://solana-rpc.publicnode.com';
    try {
        const res = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getBalance',
                params: [clean]
            }),
            signal: AbortSignal.timeout(4000)
        });
        if (res.ok) {
            const data = await res.json();
            const lamports = Number(data?.result?.value || 0);
            const bal = lamports / 1e9;
            await redis.set(cacheKey, String(bal), 'EX', 20).catch(() => {});
            return bal;
        }
    } catch {
        // Ignore Solana RPC timeout
    }
    return 0;
}

async function fetchXrplBalance(address: string): Promise<number> {
    const clean = address.trim();
    if (!clean || !clean.startsWith('r')) return 0;

    const cacheKey = `treasury:balance:XRP:${clean}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached !== null) {
        const parsed = parseFloat(cached);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }

    try {
        const res = await fetch('https://xrplcluster.com', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                method: 'account_info',
                params: [
                    {
                        account: clean,
                        ledger_index: 'validated'
                    }
                ]
            }),
            signal: AbortSignal.timeout(4000)
        });
        if (res.ok) {
            const data = await res.json();
            const drops = Number(
                data?.result?.account_data?.Balance || 0
            );
            const bal = drops / 1e6;
            await redis.set(cacheKey, String(bal), 'EX', 20).catch(() => {});
            return bal;
        }
    } catch {
        // Ignore XRPL timeout
    }
    return 0;
}

async function fetchSuiBalance(address: string): Promise<number> {
    const clean = address.trim();
    if (!/^0x[0-9a-fA-F]{60,64}$/.test(clean)) return 0;

    const cacheKey = `treasury:balance:SUI:${clean.toLowerCase()}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached !== null) {
        const parsed = parseFloat(cached);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }

    try {
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
            const bal = mist / 1e9;
            await redis.set(cacheKey, String(bal), 'EX', 20).catch(() => {});
            return bal;
        }
    } catch {
        // Ignore Sui RPC timeout
    }
    return 0;
}

async function fetchTronBalance(address: string): Promise<number> {
    const clean = address.trim();
    if (!clean.startsWith('T') || clean.length !== 34) return 0;

    const cacheKey = `treasury:balance:TRX:${clean}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached !== null) {
        const parsed = parseFloat(cached);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }

    try {
        const res = await fetch(
            `https://api.trongrid.io/v1/accounts/${encodeURIComponent(clean)}`,
            { signal: AbortSignal.timeout(4000) }
        );
        if (res.ok) {
            const data = await res.json();
            const sun = Number(data?.data?.[0]?.balance || 0);
            const bal = sun / 1e6;
            await redis.set(cacheKey, String(bal), 'EX', 20).catch(() => {});
            return bal;
        }
    } catch {
        // Ignore TronGrid timeout
    }
    return 0;
}

async function fetchBlockchairBalance(
    chain: 'dogecoin' | 'zcash',
    ticker: 'DOGE' | 'ZEC',
    address: string
): Promise<number> {
    const clean = address.trim();
    if (!clean || clean.includes('Awaiting')) return 0;

    const cacheKey = `treasury:balance:${ticker}:${clean}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached !== null) {
        const parsed = parseFloat(cached);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }

    try {
        const res = await fetch(
            `https://api.blockchair.com/${chain}/dashboards/address/${encodeURIComponent(clean)}`,
            { signal: AbortSignal.timeout(4000) }
        );
        if (res.ok) {
            const data = await res.json();
            const sats = Number(
                data?.data?.[clean]?.address?.balance || 0
            );
            const bal = sats / 1e8;
            await redis.set(cacheKey, String(bal), 'EX', 30).catch(() => {});
            return bal;
        }
    } catch {
        // Ignore Blockchair timeout
    }
    return 0;
}

export const GET: RequestHandler = async ({ url, cookies }: RequestEvent) => {
    const sessionId = cookies.get('perennia_session');
    if (!sessionId) {
        return json(
            { error: 'UNAUTHORIZED: Active Sovereign session required.' },
            { status: 401 }
        );
    }

    const sessionWallet = await redis.get(`session:${sessionId}`);
    if (!sessionWallet) {
        return json({ error: 'SESSION_EXPIRED' }, { status: 401 });
    }

    const isDirector = isWalletMasterAdmin(sessionWallet);
    const includeCorporateReconciliation =
        isDirector && url.searchParams.get('corporate') === 'true';

    const corpHot = await perenniaKMS.getCorporateAddresses();

    const kasAddr =
        url.searchParams.get('kas')?.trim() ||
        normalizeKaspaAddressStrict(sessionWallet) ||
        corpHot.KAS;
    const btcAddr = url.searchParams.get('btc')?.trim() || '';
    const ethAddr = url.searchParams.get('eth')?.trim() || '';
    const solAddr = url.searchParams.get('sol')?.trim() || '';
    const dogeAddr = url.searchParams.get('doge')?.trim() || '';
    const xrpAddr = url.searchParams.get('xrp')?.trim() || '';
    const polAddr = url.searchParams.get('pol')?.trim() || ethAddr;
    const avaxAddr = url.searchParams.get('avax')?.trim() || ethAddr;
    const suiAddr = url.searchParams.get('sui')?.trim() || '';
    const trxAddr = url.searchParams.get('trx')?.trim() || '';
    const zecAddr = url.searchParams.get('zec')?.trim() || '';

    const [
        kasBal,
        btcBal,
        ethBal,
        solBal,
        dogeBal,
        xrpBal,
        polBal,
        avaxBal,
        suiBal,
        trxBal,
        zecBal
    ] = await Promise.all([
        kasAddr && !kasAddr.includes('Awaiting')
            ? fetchKaspaBalance(kasAddr)
            : Promise.resolve(0),
        btcAddr ? fetchBitcoinBalance(btcAddr) : Promise.resolve(0),
        ethAddr ? fetchEvmNativeBalance('ETH', ethAddr) : Promise.resolve(0),
        solAddr ? fetchSolanaBalance(solAddr) : Promise.resolve(0),
        dogeAddr
            ? fetchBlockchairBalance('dogecoin', 'DOGE', dogeAddr)
            : Promise.resolve(0),
        xrpAddr ? fetchXrplBalance(xrpAddr) : Promise.resolve(0),
        polAddr ? fetchEvmNativeBalance('POL', polAddr) : Promise.resolve(0),
        avaxAddr ? fetchEvmNativeBalance('AVAX', avaxAddr) : Promise.resolve(0),
        suiAddr ? fetchSuiBalance(suiAddr) : Promise.resolve(0),
        trxAddr ? fetchTronBalance(trxAddr) : Promise.resolve(0),
        zecAddr
            ? fetchBlockchairBalance('zcash', 'ZEC', zecAddr)
            : Promise.resolve(0)
    ]);

    const assets = [
        { symbol: 'KAS', address: kasAddr, balance: kasBal },
        { symbol: 'BTC', address: btcAddr, balance: btcBal },
        { symbol: 'ETH', address: ethAddr, balance: ethBal },
        { symbol: 'SOL', address: solAddr, balance: solBal },
        { symbol: 'DOGE', address: dogeAddr, balance: dogeBal },
        { symbol: 'XRP', address: xrpAddr, balance: xrpBal },
        { symbol: 'POL', address: polAddr, balance: polBal },
        { symbol: 'AVAX', address: avaxAddr, balance: avaxBal },
        { symbol: 'SUI', address: suiAddr, balance: suiBal },
        { symbol: 'TRX', address: trxAddr, balance: trxBal },
        { symbol: 'ZEC', address: zecAddr, balance: zecBal }
    ];

    let reconciliation: any = null;

    if (includeCorporateReconciliation) {
        const feeKeys = FEE_TRACKED_TICKERS.map(
            (t) => `perennia:fees:batch_accumulated:${t}`
        );

        const [
            nettingLen,
            passthroughLen,
            rawNettingOrders,
            feeValues,
            nettingProfitStr,
            unhedgedDeltaStr,
            hedgeStatusRaw,
            fppsSolvencyRaw
        ] = await Promise.all([
            redis.llen('perennia:sor:netting_queue').catch(() => 0),
            redis
                .llen('perennia:sor:third_party_passthrough_queue')
                .catch(() => 0),
            redis
                .lrange('perennia:sor:netting_queue', 0, 24)
                .catch(() => [] as string[]),
            redis.mget(...feeKeys).catch(() => [] as (string | null)[]),
            redis.get('perennia:treasury:netting_profit_usd').catch(() => '0'),
            redis.get('perennia:treasury:unhedged_delta_kas').catch(() => '0'),
            redis.get('perennia:treasury:hedge_status').catch(() => null),
            redis.get('perennia:pool:fpps_solvency').catch(() => null)
        ]);

        const accumulatedFees: Record<string, number> = {};
        FEE_TRACKED_TICKERS.forEach((ticker, idx) => {
            const val = parseFloat(String(feeValues?.[idx] || '0'));
            accumulatedFees[ticker] =
                Number.isFinite(val) && val > 0 ? Number(val.toFixed(8)) : 0;
        });

        const recentNettingOrders = (rawNettingOrders || [])
            .map((raw) => {
                try {
                    return JSON.parse(raw);
                } catch {
                    return null;
                }
            })
            .filter(Boolean);

        let hedgeStatus = null;
        if (hedgeStatusRaw) {
            try {
                hedgeStatus = JSON.parse(hedgeStatusRaw);
            } catch {
                hedgeStatus = null;
            }
        }

        let fppsSolvency = null;
        if (fppsSolvencyRaw) {
            try {
                fppsSolvency = JSON.parse(fppsSolvencyRaw);
            } catch {
                fppsSolvency = null;
            }
        }

        reconciliation = {
            nettingQueueLength: Number(nettingLen || 0),
            passthroughQueueLength: Number(passthroughLen || 0),
            recentNettingOrders,
            accumulatedFees,
            nettingProfitUsd: parseFloat(String(nettingProfitStr || '0')) || 0,
            unhedgedDeltaKas: parseFloat(String(unhedgedDeltaStr || '0')) || 0,
            hedgeStatus,
            fppsSolvency,
            updatedAt: Date.now()
        };
    }

    return json({
        success: true,
        assets,
        reconciliation
    });
};