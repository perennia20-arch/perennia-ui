import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { perenniaKMS } from '$lib/server/kms';
import { env } from '$env/dynamic/private';

const rustBackendUrl =
    env.RUST_BACKEND_URL || `http://${env.UBUNTU_NODE_IP || '192.168.0.12'}:8002`;

export const GET: RequestHandler = async ({ url }: RequestEvent) => {
    const kasAddr = url.searchParams.get('kas');
    const btcAddr = url.searchParams.get('btc');
    const ethAddr = url.searchParams.get('eth');
    const solAddr = url.searchParams.get('sol');
    const dogeAddr = url.searchParams.get('doge');
    const xrpAddr = url.searchParams.get('xrp');
    const polAddr = url.searchParams.get('pol');
    const avaxAddr = url.searchParams.get('avax');
    const suiAddr = url.searchParams.get('sui');
    const trxAddr = url.searchParams.get('trx');
    const zecAddr = url.searchParams.get('zec');
    const isCorporateView = url.searchParams.get('corporate') === 'true';

    const corporateAddrs = await perenniaKMS.getCorporateAddresses();
    const finalKas =
        isCorporateView && corporateAddrs.KAS && !corporateAddrs.KAS.includes('Awaiting')
            ? corporateAddrs.KAS
            : kasAddr;
    const finalBtc =
        isCorporateView && corporateAddrs.BTC && !corporateAddrs.BTC.includes('Awaiting')
            ? corporateAddrs.BTC
            : btcAddr;
    const finalEth =
        isCorporateView && corporateAddrs.ETH && !corporateAddrs.ETH.includes('Awaiting')
            ? corporateAddrs.ETH
            : ethAddr;
    const finalSol =
        isCorporateView && corporateAddrs.SOL && !corporateAddrs.SOL.includes('Awaiting')
            ? corporateAddrs.SOL
            : solAddr;

    const btcTargets = Array.from(
        new Set(
            [finalBtc].filter(
                (a): a is string =>
                    typeof a === 'string' && a.trim() !== '' && !a.includes('Awaiting')
            )
        )
    );
    const ethTargets = Array.from(
        new Set(
            [finalEth].filter(
                (a): a is string =>
                    typeof a === 'string' && a.trim() !== '' && !a.includes('Awaiting')
            )
        )
    );
    const solTargets = Array.from(
        new Set(
            [finalSol].filter(
                (a): a is string =>
                    typeof a === 'string' && a.trim() !== '' && !a.includes('Awaiting')
            )
        )
    );
    const kasTargets = Array.from(
        new Set(
            [finalKas].filter(
                (a): a is string =>
                    typeof a === 'string' && a.trim() !== '' && !a.includes('Awaiting')
            )
        )
    );

    let kasBalance = 0;
    let btcBalance = 0;
    let ethBalance = 0;
    let solBalance = 0;
    let dogeBalance = 0;
    let xrpBalance = 0;
    let polBalance = 0;
    let avaxBalance = 0;
    let suiBalance = 0;
    let trxBalance = 0;
    let zecBalance = 0;
    let reconciliation: any = null;

    try {
        for (const targetKas of kasTargets) {
            const formattedKas = targetKas.startsWith('kaspa:')
                ? targetKas
                : `kaspa:${targetKas}`;
            const cacheKey = `treasury:balance:${formattedKas.toLowerCase()}`;
            let localKasBal = 0;
            try {
                const cached = await redis.get(cacheKey);
                if (cached !== null && cached !== undefined) {
                    localKasBal = parseFloat(cached);
                }
            } catch (err) {
                console.warn('Redis read bypass:', err);
            }
            if (localKasBal === 0) {
                let fetched = false;
                try {
                    const localRes = await fetch(
                        `${rustBackendUrl}/v1/balance?address=${formattedKas}`,
                        {
                            signal: AbortSignal.timeout(2000)
                        }
                    );
                    if (localRes.ok) {
                        const localData = await localRes.json();
                        localKasBal = localData.balanceKas || localData.balance || 0;
                        fetched = true;
                    }
                } catch {
                    // Fallback to public explorer below
                }
                if (!fetched) {
                    try {
                        const publicRes = await fetch(
                            `https://api.kaspa.org/addresses/${formattedKas}/balance`
                        );
                        if (publicRes.ok) {
                            const publicData = await publicRes.json();
                            localKasBal = (publicData.balance || 0) / 100_000_000;
                            fetched = true;
                        }
                    } catch (e) {
                        console.error('Kaspa Public API Error:', e);
                    }
                }
                if (fetched && localKasBal > 0) {
                    try {
                        await redis.set(cacheKey, localKasBal.toString(), 'EX', 15);
                    } catch {
                        // Ignore Redis cache write error
                    }
                }
            }
            kasBalance += localKasBal;
        }

        for (const targetBtc of btcTargets) {
            try {
                const res = await fetch(`https://mempool.space/api/address/${targetBtc}`);
                if (res.ok) {
                    const data = await res.json();
                    const sats =
                        (data.chain_stats?.funded_txo_sum || 0) -
                        (data.chain_stats?.spent_txo_sum || 0);
                    btcBalance += sats / 100_000_000;
                }
            } catch {
                // Non-fatal
            }
        }

        for (const targetEth of ethTargets) {
            try {
                const res = await fetch('https://ethereum-rpc.publicnode.com', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'eth_getBalance',
                        params: [targetEth, 'latest'],
                        id: 1
                    })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.result) {
                        const wei = BigInt(data.result);
                        ethBalance += Number(wei / 1000000000n) / 1000000000;
                    }
                }
            } catch {
                // Non-fatal
            }
        }

        for (const targetSol of solTargets) {
            try {
                const res = await fetch('https://api.mainnet-beta.solana.com', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'getBalance',
                        params: [targetSol]
                    })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.result && data.result.value !== undefined) {
                        solBalance += data.result.value / 1e9;
                    }
                }
            } catch {
                // Non-fatal
            }
        }

        if (dogeAddr && !dogeAddr.includes('Awaiting')) {
            try {
                const res = await fetch(
                    `https://api.blockcypher.com/v1/doge/main/addrs/${dogeAddr}/balance`
                );
                if (res.ok) {
                    const data = await res.json();
                    dogeBalance += (data.final_balance || 0) / 100_000_000;
                }
            } catch {
                // Non-fatal
            }
        }

        if (xrpAddr && !xrpAddr.includes('Awaiting')) {
            try {
                const res = await fetch(
                    `https://data.ripple.com/v2/accounts/${xrpAddr}/balances`
                );
                if (res.ok) {
                    const data = await res.json();
                    const xrpEntry = (data.balances || []).find(
                        (b: any) => b.currency === 'XRP'
                    );
                    if (xrpEntry) xrpBalance += parseFloat(xrpEntry.value || '0');
                }
            } catch {
                // Non-fatal
            }
        }

        if (polAddr && !polAddr.includes('Awaiting')) {
            try {
                const res = await fetch('https://polygon-bor-rpc.publicnode.com', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'eth_getBalance',
                        params: [polAddr, 'latest'],
                        id: 1
                    })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.result)
                        polBalance += Number(BigInt(data.result) / 1000000000n) / 1000000000;
                }
            } catch {
                // Non-fatal
            }
        }

        if (avaxAddr && !avaxAddr.includes('Awaiting')) {
            try {
                const res = await fetch('https://avalanche-c-chain-rpc.publicnode.com', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        method: 'eth_getBalance',
                        params: [avaxAddr, 'latest'],
                        id: 1
                    })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.result)
                        avaxBalance += Number(BigInt(data.result) / 1000000000n) / 1000000000;
                }
            } catch {
                // Non-fatal
            }
        }

        if (suiAddr && !suiAddr.includes('Awaiting')) {
            try {
                const res = await fetch('https://fullnode.mainnet.sui.io', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'suix_getBalance',
                        params: [suiAddr, '0x2::sui::SUI']
                    })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.result?.totalBalance)
                        suiBalance += parseFloat(data.result.totalBalance) / 1e9;
                }
            } catch {
                // Non-fatal
            }
        }

        if (trxAddr && !trxAddr.includes('Awaiting')) {
            try {
                const res = await fetch(
                    `https://api.trongrid.io/v1/accounts/${trxAddr}`
                );
                if (res.ok) {
                    const data = await res.json();
                    if (data.data && data.data.length > 0)
                        trxBalance += (data.data[0].balance || 0) / 1_000_000;
                }
            } catch {
                // Non-fatal
            }
        }

        if (zecAddr && !zecAddr.includes('Awaiting')) {
            try {
                const res = await fetch(
                    `https://api.blockchair.com/zcash/dashboards/address/${zecAddr}`
                );
                if (res.ok) {
                    const data = await res.json();
                    if (data.data && data.data[zecAddr])
                        zecBalance +=
                            (data.data[zecAddr].address?.balance || 0) / 100_000_000;
                }
            } catch {
                // Non-fatal
            }
        }

        if (isCorporateView) {
            const assetSymbols = [
                'KAS',
                'USDC',
                'USDT',
                'BTC',
                'ETH',
                'SOL',
                'DOGE',
                'XRP',
                'POL',
                'AVAX',
                'SUI',
                'TRX',
                'ZEC',
                'ARB'
            ];
            const syntheticFees: Record<string, number> = {};
            for (const sym of assetSymbols) {
                try {
                    const feeStr = await redis.get(
                        `perennia:fees:batch_accumulated:${sym}`
                    );
                    syntheticFees[sym] = feeStr ? parseFloat(feeStr) : 0;
                } catch {
                    syntheticFees[sym] = 0;
                }
            }

            kasBalance += syntheticFees['KAS'] || 0;
            btcBalance += syntheticFees['BTC'] || 0;
            ethBalance += syntheticFees['ETH'] || 0;
            solBalance += syntheticFees['SOL'] || 0;
            dogeBalance += syntheticFees['DOGE'] || 0;
            xrpBalance += syntheticFees['XRP'] || 0;
            polBalance += syntheticFees['POL'] || 0;
            avaxBalance += syntheticFees['AVAX'] || 0;
            suiBalance += syntheticFees['SUI'] || 0;
            trxBalance += syntheticFees['TRX'] || 0;
            zecBalance += syntheticFees['ZEC'] || 0;

            try {
                const [
                    nettingQueueLen,
                    rawQueuePreview,
                    passthroughQueueLen,
                    nettingProfitStr,
                    unhedgedDeltaStr,
                    hedgeStatusRaw,
                    fppsSolvencyRaw
                ] = await Promise.all([
                    redis.llen('perennia:sor:netting_queue'),
                    redis.lrange('perennia:sor:netting_queue', 0, 19),
                    redis.llen('perennia:sor:third_party_passthrough_queue'),
                    redis.get('perennia:treasury:netting_profit_usd'),
                    redis.get('perennia:treasury:unhedged_delta_kas'),
                    redis.get('perennia:treasury:hedge_status'),
                    redis.get('perennia:pool:fpps_solvency')
                ]);

                const recentNettingOrders = (rawQueuePreview || [])
                    .map((item) => {
                        try {
                            return JSON.parse(item);
                        } catch {
                            return null;
                        }
                    })
                    .filter(Boolean);

                reconciliation = {
                    nettingQueueLength: Number(nettingQueueLen || 0),
                    passthroughQueueLength: Number(passthroughQueueLen || 0),
                    recentNettingOrders,
                    accumulatedFees: syntheticFees,
                    nettingProfitUsd: nettingProfitStr
                        ? parseFloat(nettingProfitStr) || 0
                        : 0,
                    unhedgedDeltaKas: unhedgedDeltaStr
                        ? parseFloat(unhedgedDeltaStr) || 0
                        : 0,
                    hedgeStatus: hedgeStatusRaw ? JSON.parse(hedgeStatusRaw) : null,
                    fppsSolvency: fppsSolvencyRaw ? JSON.parse(fppsSolvencyRaw) : null,
                    updatedAt: Date.now()
                };
            } catch (recErr) {
                console.warn('Corporate reconciliation telemetry read warning:', recErr);
            }
        }
    } catch (e) {
        console.error('Treasury Multi-Chain API Hydration Error:', e);
    }

    return json({
        assets: [
            {
                symbol: 'KAS',
                address: finalKas || 'Awaiting Configuration',
                balance: kasBalance
            },
            {
                symbol: 'BTC',
                address: finalBtc || 'Awaiting Configuration',
                balance: btcBalance
            },
            {
                symbol: 'ETH',
                address: finalEth || 'Awaiting Configuration',
                balance: ethBalance
            },
            {
                symbol: 'SOL',
                address: finalSol || 'Awaiting Configuration',
                balance: solBalance
            },
            {
                symbol: 'DOGE',
                address: dogeAddr || 'Awaiting Configuration',
                balance: dogeBalance
            },
            {
                symbol: 'XRP',
                address: xrpAddr || 'Awaiting Configuration',
                balance: xrpBalance
            },
            {
                symbol: 'POL',
                address: polAddr || 'Awaiting Configuration',
                balance: polBalance
            },
            {
                symbol: 'AVAX',
                address: avaxAddr || 'Awaiting Configuration',
                balance: avaxBalance
            },
            {
                symbol: 'SUI',
                address: suiAddr || 'Awaiting Configuration',
                balance: suiBalance
            },
            {
                symbol: 'TRX',
                address: trxAddr || 'Awaiting Configuration',
                balance: trxBalance
            },
            {
                symbol: 'ZEC',
                address: zecAddr || 'Awaiting Configuration',
                balance: zecBalance
            }
        ],
        reconciliation
    });
};