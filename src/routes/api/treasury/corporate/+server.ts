import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { perenniaKMS } from '$lib/server/kms';

export const GET: RequestHandler = async () => {
    try {
        // 1. Securely fetch the derived public addresses from the KMS
        const corporateAddresses = await perenniaKMS.getCorporateAddresses();

        // 2. LIVE TELEMETRY: Fetch the real Kaspa network balance for the derived address
        let liveKaspaBalance = 0.00;
        try {
            if (!corporateAddresses.KAS.includes('offline')) {
                const kaspaApiRes = await fetch(`https://api.kaspa.org/addresses/${corporateAddresses.KAS}/balance`);
                if (kaspaApiRes.ok) {
                    const balanceData = await kaspaApiRes.json();
                    liveKaspaBalance = (balanceData.balance || 0) / 100000000; // Convert Sompi to KAS
                }
            }
        } catch (e) {
            console.warn("⚠️ Kaspa Public API Unreachable. Defaulting to 0.");
        }

        // 3. Construct the exact JSON payload the TreasuryView UI expects
        const corporateEstate = {
            masterIdentity: "Perennia Holdings, LLC",
            timestamp: Date.now(),
            assets: [
                {
                    symbol: 'KAS',
                    name: 'Kaspa Native',
                    address: corporateAddresses.KAS,
                    balance: liveKaspaBalance, 
                    network: 'kaspa-mainnet',
                    color: '#18C6A5' 
                },
                {
                    symbol: 'BTC',
                    name: 'Bitcoin Vault',
                    address: corporateAddresses.BTC,
                    balance: 0.00, // Awaiting native BTC RPC wiring
                    network: 'bitcoin-segwit',
                    color: '#F7931A'
                },
                {
                    symbol: 'ETH',
                    name: 'Ethereum Vault',
                    address: corporateAddresses.ETH,
                    balance: 0.00, // Awaiting Infura/EVM RPC wiring
                    network: 'ethereum-mainnet',
                    color: '#627EEA'
                },
                {
                    symbol: 'SOL',
                    name: 'Solana Vault',
                    address: corporateAddresses.SOL,
                    balance: 0.00, // Awaiting Solana RPC wiring
                    network: 'solana-mainnet',
                    color: '#14F195'
                }
            ]
        };

        return json(corporateEstate);
        
    } catch (error) {
        console.error("🚨 Corporate Treasury API Error:", error);
        return json({ error: 'Failed to access Corporate KMS.' }, { status: 500 });
    }
};