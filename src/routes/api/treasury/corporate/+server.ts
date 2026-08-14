import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { redis } from '$lib/server/redis'; 
import { perenniaKMS } from '$lib/server/kms';
import { env } from '$env/dynamic/private';

const nodeIp = env.UBUNTU_NODE_IP || '192.168.0.12';

export const GET: RequestHandler = async ({ url }) => {
    let kasAddr = url.searchParams.get('kas');
    let btcAddr = url.searchParams.get('btc');
    let ethAddr = url.searchParams.get('eth');
    let solAddr = url.searchParams.get('sol');
    const dogeAddr = url.searchParams.get('doge');
    const xrpAddr = url.searchParams.get('xrp');
    const polAddr = url.searchParams.get('pol');
    const avaxAddr = url.searchParams.get('avax');
    const suiAddr = url.searchParams.get('sui');
    const trxAddr = url.searchParams.get('trx');
    const zecAddr = url.searchParams.get('zec');

    const corporateAddrs = await perenniaKMS.getCorporateAddresses();
    const isMasterAdmin = kasAddr && kasAddr.toLowerCase() === corporateAddrs.KAS.toLowerCase();

    // ⚡ THE FIX: Explicit TypeScript Type Guards `(a): a is string` forces the compiler to 
    // recognize that these arrays strictly contain strings, completely eliminating the "possibly null" errors.
    const btcTargets = Array.from(new Set([btcAddr, isMasterAdmin ? corporateAddrs.BTC : null].filter((a): a is string => typeof a === 'string' && !a.includes('Awaiting'))));
    const ethTargets = Array.from(new Set([ethAddr, isMasterAdmin ? corporateAddrs.ETH : null].filter((a): a is string => typeof a === 'string' && !a.includes('Awaiting'))));
    const solTargets = Array.from(new Set([solAddr, isMasterAdmin ? corporateAddrs.SOL : null].filter((a): a is string => typeof a === 'string' && !a.includes('Awaiting'))));
    const kasTargets = Array.from(new Set([kasAddr, isMasterAdmin ? corporateAddrs.KAS : null].filter((a): a is string => typeof a === 'string' && !a.includes('Awaiting'))));

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

    try {
        // ====================================================================
        // 1. KASPA (Local Node Bridge -> Fallback to Official REST API)
        // ====================================================================
        for (const targetKas of kasTargets) {
            const formattedKas = targetKas.startsWith('kaspa:') ? targetKas : `kaspa:${targetKas}`;
            const cacheKey = `treasury:balance:${formattedKas.toLowerCase()}`;
            let localKasBal = 0;

            try {
                const cached = await redis.get(cacheKey);
                if (cached !== null && cached !== undefined) {
                    localKasBal = parseFloat(cached);
                }
            } catch (err) {
                console.warn("Redis read bypass:", err);
            }

            if (localKasBal === 0) {
                let fetched = false;

                try {
                    const localRes = await fetch(`http://${nodeIp}:8002/v1/balance?address=${formattedKas}`, {
                        signal: AbortSignal.timeout(2000)
                    });
                    if (localRes.ok) {
                        const localData = await localRes.json();
                        localKasBal = (localData.balanceKas || localData.balance || 0);
                        fetched = true;
                    }
                } catch {
                    // Local bridge offline
                }

                if (!fetched) {
                    try {
                        const publicRes = await fetch(`https://api.kaspa.org/addresses/${formattedKas}/balance`);
                        if (publicRes.ok) {
                            const publicData = await publicRes.json();
                            localKasBal = (publicData.balance || 0) / 100_000_000;
                            fetched = true;
                        }
                    } catch (e) {
                        console.error("Kaspa Public API Error:", e);
                    }
                }

                if (fetched && localKasBal > 0) {
                    try {
                        await redis.set(cacheKey, localKasBal.toString(), 'EX', 15);
                    } catch (err) {}
                }
            }
            kasBalance += localKasBal;
        }

        // ====================================================================
        // 2. BITCOIN (Mempool.space API)
        // ====================================================================
        for (const targetBtc of btcTargets) {
            try {
                const res = await fetch(`https://mempool.space/api/address/${targetBtc}`);
                if (res.ok) {
                    const data = await res.json();
                    const sats = (data.chain_stats?.funded_txo_sum || 0) - (data.chain_stats?.spent_txo_sum || 0);
                    btcBalance += sats / 100_000_000;
                }
            } catch (e) {
                console.error("BTC Scan Error:", e);
            }
        }

        // ====================================================================
        // 3. ETHEREUM (PublicNode RPC)
        // ====================================================================
        for (const targetEth of ethTargets) {
            try {
                const res = await fetch('https://ethereum-rpc.publicnode.com', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: [targetEth, 'latest'], id: 1 })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.result) {
                        const wei = BigInt(data.result);
                        ethBalance += Number(wei / 1000000000n) / 1000000000;
                    }
                }
            } catch (e) {
                console.error("ETH Scan Error:", e);
            }
        }

        // ====================================================================
        // 4. SOLANA (Mainnet RPC)
        // ====================================================================
        for (const targetSol of solTargets) {
            try {
                const res = await fetch('https://api.mainnet-beta.solana.com', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [targetSol] })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.result && data.result.value !== undefined) {
                        solBalance += data.result.value / 1e9;
                    }
                }
            } catch (e) {
                console.error("SOL Scan Error:", e);
            }
        }

        // ====================================================================
        // 5. DOGECOIN (Blockcypher API)
        // ====================================================================
        if (dogeAddr && !dogeAddr.includes('Awaiting')) {
            try {
                const res = await fetch(`https://api.blockcypher.com/v1/doge/main/addrs/${dogeAddr}/balance`);
                if (res.ok) {
                    const data = await res.json();
                    dogeBalance += (data.final_balance || 0) / 100_000_000;
                }
            } catch (e) {}
        }

        // ====================================================================
        // 6. XRP LEDGER (Ripple Data API v2)
        // ====================================================================
        if (xrpAddr && !xrpAddr.includes('Awaiting')) {
            try {
                const res = await fetch(`https://data.ripple.com/v2/accounts/${xrpAddr}/balances`);
                if (res.ok) {
                    const data = await res.json();
                    const xrpEntry = (data.balances || []).find((b: any) => b.currency === 'XRP');
                    if (xrpEntry) xrpBalance += parseFloat(xrpEntry.value || '0');
                }
            } catch (e) {}
        }

        // ====================================================================
        // 7. POLYGON (EVM PublicNode RPC)
        // ====================================================================
        if (polAddr && !polAddr.includes('Awaiting')) {
            try {
                const res = await fetch('https://polygon-bor-rpc.publicnode.com', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: [polAddr, 'latest'], id: 1 })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.result) polBalance += Number(BigInt(data.result) / 1000000000n) / 1000000000;
                }
            } catch (e) {}
        }

        // ====================================================================
        // 8. AVALANCHE C-CHAIN (EVM PublicNode RPC)
        // ====================================================================
        if (avaxAddr && !avaxAddr.includes('Awaiting')) {
            try {
                const res = await fetch('https://avalanche-c-chain-rpc.publicnode.com', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: [avaxAddr, 'latest'], id: 1 })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.result) avaxBalance += Number(BigInt(data.result) / 1000000000n) / 1000000000;
                }
            } catch (e) {}
        }

        // ====================================================================
        // 9. SUI NETWORK (Sui Mainnet RPC)
        // ====================================================================
        if (suiAddr && !suiAddr.includes('Awaiting')) {
            try {
                const res = await fetch('https://fullnode.mainnet.sui.io', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'suix_getBalance', params: [suiAddr, '0x2::sui::SUI'] })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.result?.totalBalance) suiBalance += parseFloat(data.result.totalBalance) / 1e9;
                }
            } catch (e) {}
        }

        // ====================================================================
        // 10. TRON (TronGrid Public API)
        // ====================================================================
        if (trxAddr && !trxAddr.includes('Awaiting')) {
            try {
                const res = await fetch(`https://api.trongrid.io/v1/accounts/${trxAddr}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.data && data.data.length > 0) trxBalance += (data.data[0].balance || 0) / 1_000_000;
                }
            } catch (e) {}
        }

        // ====================================================================
        // 11. ZCASH (Blockchair API)
        // ====================================================================
        if (zecAddr && !zecAddr.includes('Awaiting')) {
            try {
                const res = await fetch(`https://api.blockchair.com/zcash/dashboards/address/${zecAddr}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.data && data.data[zecAddr]) zecBalance += (data.data[zecAddr].address?.balance || 0) / 100_000_000;
                }
            } catch (e) {}
        }

        // ⚡ Ensure synthesized fees are ONLY appended to the actual Master Admin session
        if (isMasterAdmin) {
            const assetSymbols = ['KAS', 'BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'POL', 'AVAX', 'SUI', 'TRX', 'ZEC'];
            const syntheticFees: Record<string, number> = {};
            
            for (const sym of assetSymbols) {
                try {
                    const feeStr = await redis.get(`perennia:fees:batch_accumulated:${sym}`);
                    syntheticFees[sym] = feeStr ? parseFloat(feeStr) : 0;
                } catch (e) {
                    console.warn(`Redis fee fetch failed for ${sym}`);
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
        }

    } catch (e) {
        console.error("Treasury Multi-Chain API Hydration Error:", e);
    }

    return json({
        assets: [
            { symbol: 'KAS', address: kasAddr || (isMasterAdmin ? corporateAddrs.KAS : 'Awaiting Decryption'), balance: kasBalance },
            { symbol: 'BTC', address: btcAddr || (isMasterAdmin ? corporateAddrs.BTC : 'Awaiting Decryption'), balance: btcBalance },
            { symbol: 'ETH', address: ethAddr || (isMasterAdmin ? corporateAddrs.ETH : 'Awaiting Decryption'), balance: ethBalance },
            { symbol: 'SOL', address: solAddr || (isMasterAdmin ? corporateAddrs.SOL : 'Awaiting Decryption'), balance: solBalance },
            { symbol: 'DOGE', address: dogeAddr, balance: dogeBalance },
            { symbol: 'XRP', address: xrpAddr, balance: xrpBalance },
            { symbol: 'POL', address: polAddr, balance: polBalance },
            { symbol: 'AVAX', address: avaxAddr, balance: avaxBalance },
            { symbol: 'SUI', address: suiAddr, balance: suiBalance },
            { symbol: 'TRX', address: trxAddr, balance: trxBalance },
            { symbol: 'ZEC', address: zecAddr, balance: zecBalance }
        ]
    });
};