import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
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
        // 1. BITCOIN (Mempool.space API)
        if (btcAddr && !btcAddr.includes('Awaiting')) {
            const res = await fetch(`https://mempool.space/api/address/${btcAddr}`);
            if (res.ok) {
                const data = await res.json();
                const sats = data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum;
                btcBalance = sats / 100_000_000;
            }
        }

        // 2. KASPA (Official REST API)
        if (kasAddr && !kasAddr.includes('Awaiting')) {
            const res = await fetch(`https://api.kaspa.org/addresses/${kasAddr}/balance`);
            if (res.ok) {
                const data = await res.json();
                kasBalance = (data.balance || 0) / 100_000_000;
            }
        }

        // 3. ETHEREUM (PublicNode RPC)
        if (ethAddr && !ethAddr.includes('Awaiting')) {
            const res = await fetch('https://ethereum-rpc.publicnode.com', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: [ethAddr, 'latest'], id: 1 })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.result) {
                    const wei = BigInt(data.result);
                    ethBalance = Number(wei / 1000000000n) / 1000000000;
                }
            }
        }

        // 4. SOLANA (Mainnet RPC)
        if (solAddr && !solAddr.includes('Awaiting')) {
            const res = await fetch('https://api.mainnet-beta.solana.com', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [solAddr] })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.result && data.result.value !== undefined) {
                    solBalance = data.result.value / 1e9;
                }
            }
        }

        // 5. DOGECOIN (Blockcypher / SoChain API)
        if (dogeAddr && !dogeAddr.includes('Awaiting')) {
            const res = await fetch(`https://api.blockcypher.com/v1/doge/main/addrs/${dogeAddr}/balance`);
            if (res.ok) {
                const data = await res.json();
                dogeBalance = (data.final_balance || 0) / 100_000_000;
            }
        }

        // 6. POLYGON (EVM PublicNode RPC)
        if (polAddr && !polAddr.includes('Awaiting')) {
            const res = await fetch('https://polygon-bor-rpc.publicnode.com', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: [polAddr, 'latest'], id: 1 })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.result) {
                    const wei = BigInt(data.result);
                    polBalance = Number(wei / 1000000000n) / 1000000000;
                }
            }
        }

        // 7. AVALANCHE C-CHAIN (EVM PublicNode RPC)
        if (avaxAddr && !avaxAddr.includes('Awaiting')) {
            const res = await fetch('https://avalanche-c-chain-rpc.publicnode.com', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBalance', params: [avaxAddr, 'latest'], id: 1 })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.result) {
                    const wei = BigInt(data.result);
                    avaxBalance = Number(wei / 1000000000n) / 1000000000;
                }
            }
        }

    } catch (e) {
        console.error("Treasury Multi-Chain API Hydration Error:", e);
    }

    return json({
        assets: [
            { symbol: 'KAS', address: kasAddr, balance: kasBalance },
            { symbol: 'BTC', address: btcAddr, balance: btcBalance },
            { symbol: 'ETH', address: ethAddr, balance: ethBalance },
            { symbol: 'SOL', address: solAddr, balance: solBalance },
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