import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// ============================================================================
// OMNI-CHAIN HYDRATION PROXY
// ============================================================================
export const GET: RequestHandler = async ({ url }) => {
    // 1. Extract the four omni-chain addresses passed from the decrypted UI state
    const kasAddress = url.searchParams.get('kas');
    const btcAddress = url.searchParams.get('btc');
    const ethAddress = url.searchParams.get('eth');
    const solAddress = url.searchParams.get('sol');

    if (!kasAddress && !btcAddress && !ethAddress && !solAddress) {
        return json({ error: 'Vault parameters missing.' }, { status: 400 });
    }

    let balances = {
        kas: 0.00,
        btc: 0.00,
        eth: 0.00,
        sol: 0.00
    };

    // Construct promises conditionally based on provided addresses
    const fetchPromises = [];

    if (kasAddress) {
        fetchPromises.push(
            (async () => {
                try {
                    const res = await fetch(`https://api.kaspa.org/addresses/${kasAddress}/balance`, { signal: AbortSignal.timeout(5000) });
                    if (res.ok) {
                        const data = await res.json();
                        balances.kas = (data.balance || 0) / 100000000;
                    }
                } catch (e) {
                    console.error("KAS Fetch Error:", e);
                }
            })()
        );
    }

    if (btcAddress) {
        fetchPromises.push(
            (async () => {
                try {
                    const res = await fetch(`https://mempool.space/api/address/${btcAddress}`, { signal: AbortSignal.timeout(5000) });
                    if (res.ok) {
                        const data = await res.json();
                        const funded = data.chain_stats?.funded_txo_sum || 0;
                        const spent = data.chain_stats?.spent_txo_sum || 0;
                        balances.btc = (funded - spent) / 100000000;
                    }
                } catch (e) {
                    console.error("BTC Fetch Error:", e);
                }
            })()
        );
    }

    if (ethAddress) {
        fetchPromises.push(
            (async () => {
                try {
                    const res = await fetch('https://cloudflare-eth.com', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: "2.0",
                            method: "eth_getBalance",
                            params: [ethAddress, "latest"],
                            id: 1
                        }),
                        signal: AbortSignal.timeout(5000)
                    });
                    if (res.ok) {
                        const data = await res.json();
                        balances.eth = parseInt(data.result || "0x0", 16) / 1e18;
                    }
                } catch (e) {
                    console.error("ETH Fetch Error:", e);
                }
            })()
        );
    }

    if (solAddress) {
        fetchPromises.push(
            (async () => {
                try {
                    const res = await fetch('https://api.mainnet-beta.solana.com', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            jsonrpc: "2.0",
                            id: 1,
                            method: "getBalance",
                            params: [solAddress]
                        }),
                        signal: AbortSignal.timeout(5000)
                    });
                    if (res.ok) {
                        const data = await res.json();
                        balances.sol = (data.result?.value || 0) / 1000000000;
                    }
                } catch (e) {
                    console.error("SOL Fetch Error:", e);
                }
            })()
        );
    }

    // Await all concurrent fetches without short-circuiting on single failures
    await Promise.allSettled(fetchPromises);

    const corporateEstate = {
        masterIdentity: "Perennia Sovereign Vault",
        timestamp: Date.now(),
        networkBlocks: [], // Stubbed to prevent UI breaking from old PostgreSQL logic
        assets: [
            {
                symbol: 'KAS',
                name: 'Kaspa Native',
                address: kasAddress || 'Offline',
                balance: balances.kas, 
                network: 'kaspa-mainnet',
                color: '#18C6A5' 
            },
            {
                symbol: 'BTC',
                name: 'Bitcoin Vault',
                address: btcAddress || 'Offline',
                balance: balances.btc, 
                network: 'bitcoin-mainnet',
                color: '#F7931A'
            },
            {
                symbol: 'ETH',
                name: 'Ethereum Vault',
                address: ethAddress || 'Offline',
                balance: balances.eth, 
                network: 'ethereum-mainnet',
                color: '#627EEA'
            },
            {
                symbol: 'SOL',
                name: 'Solana Vault',
                address: solAddress || 'Offline',
                balance: balances.sol, 
                network: 'solana-mainnet',
                color: '#14F195'
            }
        ]
    };

    return json(corporateEstate);
};