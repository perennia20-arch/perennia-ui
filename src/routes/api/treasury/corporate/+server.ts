import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { perenniaKMS } from '$lib/server/kms';
import pg from 'pg';

const { Pool } = pg;

// BARE-METAL POSTGRES CONNECTION
const pool = new Pool({
    user: 'postgres',
    host: '192.168.0.12',
    database: 'perennia',
    password: 'password', // Adjust to match bare-metal prod configuration
    port: 5432,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000, // 3s fast-fail timeout to prevent API hangs
});

pool.on('error', (err) => {
    console.error('🔥 POSTGRESQL FAULT:', err);
});

export const GET: RequestHandler = async () => {
    let client;
    let liveStreamingBalance = 0.00;
    let recentBlocks: Array<{ hash: string; worker: string; difficulty: number; timestamp: string }> = [];

    let corporateAddresses = {
        KAS: 'offline-kas-address',
        BTC: 'offline-btc-address',
        ETH: 'offline-eth-address',
        SOL: 'offline-sol-address'
    };

    try {
        corporateAddresses = await perenniaKMS.getCorporateAddresses();
    } catch (kmsErr) {
        console.error("⚠️ KMS Address Retrieval Failed:", kmsErr);
    }

    const mainWallet = corporateAddresses.KAS || '';

    // Non-destructive DB connection attempt
    try {
        client = await pool.connect();

        if (mainWallet && !mainWallet.includes('offline')) {
            try {
                const yieldRes = await client.query(
                    `SELECT streaming_balance_kas, total_yield_kas 
                     FROM yield_reservoirs 
                     WHERE wallet_address = $1`,
                    [mainWallet]
                );

                if (yieldRes.rows.length > 0) {
                    liveStreamingBalance = parseFloat(yieldRes.rows[0].streaming_balance_kas || 0) + parseFloat(yieldRes.rows[0].total_yield_kas || 0);
                }
            } catch (dbErr) {
                console.error("⚠️ PostgreSQL Yield Query Failed:", dbErr);
            }
        }

        try {
            const blockRes = await client.query(
                `SELECT block_hash, worker_id, network_diff, discovered_at 
                 FROM network_blocks 
                 ORDER BY discovered_at DESC 
                 LIMIT 5`
            );
            recentBlocks = blockRes.rows.map(row => ({
                hash: row.block_hash,
                worker: row.worker_id,
                difficulty: parseFloat(row.network_diff || 0),
                timestamp: row.discovered_at
            }));
        } catch (dbErr) {
            console.error("⚠️ PostgreSQL Block Query Failed:", dbErr);
        }

    } catch (connErr: any) {
        console.error("⚠️ PostgreSQL Connection Handshake Failed:", connErr.message);
    } finally {
        if (client) client.release();
    }

    const corporateEstate = {
        masterIdentity: "Perennia Holdings, LLC",
        timestamp: Date.now(),
        networkBlocks: recentBlocks,
        assets: [
            {
                symbol: 'KAS',
                name: 'Kaspa Native',
                address: mainWallet,
                balance: liveStreamingBalance, 
                network: 'kaspa-mainnet',
                color: '#18C6A5' 
            },
            {
                symbol: 'BTC',
                name: 'Bitcoin Vault',
                address: corporateAddresses.BTC,
                balance: 0.00, 
                network: 'bitcoin-segwit',
                color: '#F7931A'
            },
            {
                symbol: 'ETH',
                name: 'Ethereum Vault',
                address: corporateAddresses.ETH,
                balance: 0.00, 
                network: 'ethereum-mainnet',
                color: '#627EEA'
            },
            {
                symbol: 'SOL',
                name: 'Solana Vault',
                address: corporateAddresses.SOL,
                balance: 0.00, 
                network: 'solana-mainnet',
                color: '#14F195'
            }
        ]
    };

    return json(corporateEstate);
};