import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { env } from '$env/dynamic/private';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { ethers } from 'ethers';
import {
    Connection,
    Keypair as SolKeypair,
    PublicKey,
    SystemProgram,
    Transaction as SolTransaction
} from '@solana/web3.js';
import * as bitcoin from 'bitcoinjs-lib';
import { Client as XrplClient, Wallet as XrplWallet, xrpToDrops } from 'xrpl';
import { blake2b } from '@noble/hashes/blake2.js';
import { schnorr, secp256k1 } from '@noble/curves/secp256k1.js';

const ERC20_ABI = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address owner) view returns (uint256)'
];

export interface EvmChainDispatchSpec {
    rpcUrl: string;
    chainId: number;
    networkLabel: string;
    explorerTxBase: string;
    isToken?: boolean;
    contractAddress?: string;
    solanaMintAddress?: string;
    arbitrumContractAddress?: string;
    decimals?: number;
}

export const EVM_CHAIN_CONFIG: Record<string, EvmChainDispatchSpec> = {
    ETH: {
        rpcUrl: 'https://ethereum-rpc.publicnode.com',
        chainId: 1,
        networkLabel: 'ETH',
        explorerTxBase: 'https://etherscan.io/tx/'
    },
    USDC: {
        rpcUrl: 'https://ethereum-rpc.publicnode.com',
        chainId: 1,
        networkLabel: 'ETH',
        explorerTxBase: 'https://etherscan.io/tx/',
        isToken: true,
        contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6
    },
    USDT: {
        rpcUrl: 'https://ethereum-rpc.publicnode.com',
        chainId: 1,
        networkLabel: 'ETH',
        explorerTxBase: 'https://etherscan.io/tx/',
        isToken: true,
        contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        decimals: 6
    },
    POL: {
        rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
        chainId: 137,
        networkLabel: 'POL',
        explorerTxBase: 'https://polygonscan.com/tx/'
    },
    AVAX: {
        rpcUrl: 'https://avalanche-c-chain-rpc.publicnode.com',
        chainId: 43114,
        networkLabel: 'AVAX',
        explorerTxBase: 'https://snowtrace.io/tx/'
    },
    ARB: {
        rpcUrl: 'https://arbitrum-one-rpc.publicnode.com',
        chainId: 42161,
        networkLabel: 'ARB',
        explorerTxBase: 'https://arbiscan.io/tx/'
    },
    BASE: {
        rpcUrl: 'https://base-rpc.publicnode.com',
        chainId: 8453,
        networkLabel: 'BASE',
        explorerTxBase: 'https://basescan.org/tx/'
    },
    SPY: {
        rpcUrl: 'https://base-rpc.publicnode.com',
        chainId: 8453,
        networkLabel: 'BASE',
        explorerTxBase: 'https://basescan.org/tx/',
        isToken: true,
        contractAddress: '0x1e2C4fb7eDE391d116E6B41cD0608260e8801D59',
        arbitrumContractAddress: '0x1e2C4fb7eDE391d116E6B41cD0608260e8801D59',
        solanaMintAddress: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W',
        decimals: 18
    },
    QQQ: {
        rpcUrl: 'https://base-rpc.publicnode.com',
        chainId: 8453,
        networkLabel: 'BASE',
        explorerTxBase: 'https://basescan.org/tx/',
        isToken: true,
        contractAddress: '0x9695e2b96ea7b38596fb62eefb1e5f2b670b6c0f',
        arbitrumContractAddress: '0x9695e2b96ea7b38596fb62eefb1e5f2b670b6c0f',
        solanaMintAddress: 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ',
        decimals: 18
    },
    NVDA: {
        rpcUrl: 'https://base-rpc.publicnode.com',
        chainId: 8453,
        networkLabel: 'BASE',
        explorerTxBase: 'https://basescan.org/tx/',
        isToken: true,
        contractAddress: '0x76B812B06B89D93f7E43A40A806C7c7D9E086058',
        arbitrumContractAddress: '0x76B812B06B89D93f7E43A40A806C7c7D9E086058',
        solanaMintAddress: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh',
        decimals: 18
    },
    AAPL: {
        rpcUrl: 'https://base-rpc.publicnode.com',
        chainId: 8453,
        networkLabel: 'BASE',
        explorerTxBase: 'https://basescan.org/tx/',
        isToken: true,
        contractAddress: '0x49f6b65cb1de6b10eaf75e7c03ca029c306d0357',
        arbitrumContractAddress: '0x49f6b65cb1de6b10eaf75e7c03ca029c306d0357',
        solanaMintAddress: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp',
        decimals: 18
    },
    TSLA: {
        rpcUrl: 'https://base-rpc.publicnode.com',
        chainId: 8453,
        networkLabel: 'BASE',
        explorerTxBase: 'https://basescan.org/tx/',
        isToken: true,
        contractAddress: '0x16dad506d7db8da01c87581c87ca897a012a1535',
        arbitrumContractAddress: '0x16dad506d7db8da01c87581c87ca897a012a1535',
        solanaMintAddress: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB',
        decimals: 18
    },
    AMD: {
        rpcUrl: 'https://base-rpc.publicnode.com',
        chainId: 8453,
        networkLabel: 'BASE',
        explorerTxBase: 'https://basescan.org/tx/',
        isToken: true,
        contractAddress: '0x2f95862b045670cd22bee3114c39763a4a08beeb',
        arbitrumContractAddress: '0x2f95862b045670cd22bee3114c39763a4a08beeb',
        decimals: 18
    },
    TSM: {
        rpcUrl: 'https://base-rpc.publicnode.com',
        chainId: 8453,
        networkLabel: 'BASE',
        explorerTxBase: 'https://basescan.org/tx/',
        isToken: true,
        contractAddress: '0x69145a36d62e91113b86b2e5b88f68f7f781c08d',
        arbitrumContractAddress: '0x69145a36d62e91113b86b2e5b88f68f7f781c08d',
        decimals: 18
    },
    AVGO: {
        rpcUrl: 'https://base-rpc.publicnode.com',
        chainId: 8453,
        networkLabel: 'BASE',
        explorerTxBase: 'https://basescan.org/tx/',
        isToken: true,
        contractAddress: '0x72b021217ca3fe68922a19aaf990109cb9d84e9a',
        arbitrumContractAddress: '0x72b021217ca3fe68922a19aaf990109cb9d84e9a',
        decimals: 18
    },
    XLE: {
        rpcUrl: 'https://base-rpc.publicnode.com',
        chainId: 8453,
        networkLabel: 'BASE',
        explorerTxBase: 'https://basescan.org/tx/',
        isToken: true,
        contractAddress: '0x277b69923f8886d886c920d3616c2182f9d59c9c',
        arbitrumContractAddress: '0x277b69923f8886d886c920d3616c2182f9d59c9c',
        decimals: 18
    },
    XAU: {
        rpcUrl: 'https://ethereum-rpc.publicnode.com',
        chainId: 1,
        networkLabel: 'ETH',
        explorerTxBase: 'https://etherscan.io/tx/',
        isToken: true,
        contractAddress: '0x45804880De22913dAFE09f4980848ECE6EcbAf78',
        decimals: 18
    },
    XAG: {
        rpcUrl: 'https://ethereum-rpc.publicnode.com',
        chainId: 1,
        networkLabel: 'ETH',
        explorerTxBase: 'https://etherscan.io/tx/',
        isToken: true,
        contractAddress: '0xf2fb02c32b055c805e7238d628e5e9dadef27437',
        decimals: 18
    },
    USTB: {
        rpcUrl: 'https://ethereum-rpc.publicnode.com',
        chainId: 1,
        networkLabel: 'ETH',
        explorerTxBase: 'https://etherscan.io/tx/',
        isToken: true,
        contractAddress: '0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a',
        arbitrumContractAddress: '0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a',
        decimals: 18
    }
};

const KASPA_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const TX_SIGNING_KEY = new TextEncoder().encode('TransactionSigningHash');
const SIGHASH_ALL = 1;
const FEE_PER_GRAM = 110n;
const MIN_CHANGE_SOMPI = 10_000_000n;

export function normalizeKaspaBase32(addr: string): string {
    return String(addr || '')
        .trim()
        .toLowerCase()
        .replace(/^kaspa:/i, '')
        .trim();
}

export function buildExplorerTxUrl(asset: string, txHash: string): string {
    const cleanAsset = String(asset || 'KAS')
        .trim()
        .toUpperCase();
    const cleanTx = String(txHash || '').trim();
    if (!cleanTx || cleanTx.startsWith('PER-L1-')) return '#';
    if (EVM_CHAIN_CONFIG[cleanAsset]) {
        return `${EVM_CHAIN_CONFIG[cleanAsset].explorerTxBase}${cleanTx}`;
    }
    switch (cleanAsset) {
        case 'KAS':
            return `https://kas.fyi/transaction/${cleanTx}`;
        case 'BTC':
            return `https://mempool.space/tx/${cleanTx}`;
        case 'SOL':
            return `https://solscan.io/tx/${cleanTx}`;
        case 'XRP':
            return `https://xrpscan.com/tx/${cleanTx}`;
        case 'DOGE':
            return `https://blockchair.com/dogecoin/transaction/${cleanTx}`;
        case 'SUI':
            return `https://suiscan.xyz/mainnet/tx/${cleanTx}`;
        case 'TRX':
            return `https://tronscan.org/#/transaction/${cleanTx}`;
        case 'ZEC':
            return `https://blockchair.com/zcash/transaction/${cleanTx}`;
        default:
            return `https://kas.fyi/transaction/${cleanTx}`;
    }
}

export async function ensureL1PayoutQueueSchema() {
    const client = await dbPool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS l1_payout_queue (
                payout_id VARCHAR(80) PRIMARY KEY,
                wallet_address VARCHAR(255) NOT NULL,
                destination_address VARCHAR(255) NOT NULL,
                asset_ticker VARCHAR(32) NOT NULL,
                network VARCHAR(32) NOT NULL,
                amount_tokens DOUBLE PRECISION NOT NULL,
                gross_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                spot_price DOUBLE PRECISION NOT NULL DEFAULT 0.0,
                source_type VARCHAR(40) NOT NULL DEFAULT 'ledger_withdrawal',
                tx_hash VARCHAR(255),
                explorer_url TEXT,
                queue_reason TEXT,
                status VARCHAR(40) NOT NULL DEFAULT 'QUEUED_FOR_L1_DISPATCH',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_l1_payout_wallet ON l1_payout_queue (wallet_address, created_at DESC);
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS idempotent_payout_batches (
                batch_id VARCHAR(96) PRIMARY KEY,
                idempotency_key VARCHAR(128) UNIQUE NOT NULL,
                deterministic_txid VARCHAR(128),
                signed_tx_json JSONB,
                total_sompi BIGINT NOT NULL DEFAULT 0,
                recipient_manifest JSONB NOT NULL DEFAULT '[]'::jsonb,
                state VARCHAR(48) NOT NULL DEFAULT 'QUEUED',
                daa_score BIGINT,
                retry_count INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
    } finally {
        client.release();
    }
}

function getLedgerHmacSecret(): string {
    const secret = (env.LEDGER_HMAC_SECRET || env.KYC_MASTER_KEY || '').trim();
    if (secret.length < 32) {
        throw new Error(
            'CRITICAL_SECURITY_LOCKDOWN: LEDGER_HMAC_SECRET or KYC_MASTER_KEY (min 32 chars) must be configured in .env.'
        );
    }
    return secret;
}

export function canonicalizeLpTokensForHmac(lpTokens: Record<string, any> | null | undefined): string {
    if (!lpTokens || typeof lpTokens !== 'object') return '{}';
    const pairs: Array<[string, number]> = [];
    for (const [k, v] of Object.entries(lpTokens)) {
        const amt = Math.round((Number(v) || 0) * 1e8) / 1e8;
        if (amt > 1e-8) {
            pairs.push([k.trim().toUpperCase(), amt]);
        }
    }
    pairs.sort((a, b) => a[0].localeCompare(b[0]));
    return `{${pairs.map(([k, v]) => `${k}:${v.toFixed(8)}`).join(',')}}`;
}

export function computeReservoirHmac(
    walletAddress: string,
    streamingBalanceKas: number,
    totalYieldKas: number,
    lpTokens: Record<string, any> | null | undefined
): string {
    const secret = getLedgerHmacSecret();
    const cleanWallet = normalizeKaspaBase32(walletAddress);
    const canonicalLp = canonicalizeLpTokensForHmac(lpTokens);
    const sKas = (Math.round(Math.max(0, streamingBalanceKas) * 1e8) / 1e8).toFixed(8);
    const tKas = (Math.round(Math.max(0, totalYieldKas) * 1e8) / 1e8).toFixed(8);
    const preimage = `PERENNIA_RESERVOIR_V1|kaspa:${cleanWallet}|${sKas}|${tKas}|${canonicalLp}`;
    return crypto.createHmac('sha256', secret).update(preimage).digest('hex');
}

export async function verifyWalletLedgerInvariantOrQuarantine(
    walletAddress: string,
    assetTicker: string
): Promise<void> {
    const cleanWallet = normalizeKaspaBase32(walletAddress);
    const prefixedWallet = `kaspa:${cleanWallet}`;

    const sysRes = await dbPool
        .query(
            `SELECT outflow_breaker_tripped FROM system_treasury_config WHERE config_id = 'PRIMARY' LIMIT 1`
        )
        .catch(() => ({ rows: [] as any[] }));
    if (sysRes.rows[0]?.outflow_breaker_tripped === true) {
        throw new Error(
            'CIRCUIT_BREAKER_TRIPPED: Director has paused automated L1 outflows.'
        );
    }

    const resRow = await dbPool
        .query(
            `SELECT wallet_address, streaming_balance_kas, total_yield_kas,
                    COALESCE(lp_tokens, '{}'::jsonb) AS lp_tokens,
                    COALESCE(verified_onchain_credits_kas, 0.0) AS verified_onchain_credits_kas,
                    COALESCE(row_hmac_sig, '') AS row_hmac_sig,
                    COALESCE(quarantined, FALSE) AS quarantined,
                    quarantine_reason
             FROM yield_reservoirs
             WHERE wallet_address = $1 OR wallet_address = $2
             ORDER BY streaming_balance_kas DESC
             LIMIT 1`,
            [prefixedWallet, cleanWallet]
        )
        .catch(() => ({ rows: [] as any[] }));

    if (resRow.rows.length === 0) {
        return;
    }

    const row = resRow.rows[0];
    if (row.quarantined === true) {
        throw new Error(
            `WALLET_QUARANTINED: Automated L1 payouts are suspended for ${prefixedWallet} (${row.quarantine_reason || 'Ledger invariant mismatch'}).`
        );
    }

    const streamingKas = Number(row.streaming_balance_kas || 0);
    const totalYieldKas = Number(row.total_yield_kas || 0);
    const verifiedCreditsKas = Number(row.verified_onchain_credits_kas || 0);
    const lpTokens = row.lp_tokens || {};
    const storedHmac = String(row.row_hmac_sig || '').trim();
    const expectedHmac = computeReservoirHmac(
        prefixedWallet,
        streamingKas,
        totalYieldKas,
        lpTokens
    );

    if (!storedHmac) {
        await dbPool
            .query(
                `UPDATE yield_reservoirs
                 SET row_hmac_sig = $3,
                     verified_onchain_credits_kas = GREATEST(verified_onchain_credits_kas, total_yield_kas, streaming_balance_kas)
                 WHERE wallet_address = $1 OR wallet_address = $2`,
                [prefixedWallet, cleanWallet, expectedHmac]
            )
            .catch(() => {});
    } else {
        const storedBuf = Buffer.from(storedHmac);
        const expectedBuf = Buffer.from(expectedHmac);
        if (
            storedBuf.length !== expectedBuf.length ||
            !crypto.timingSafeEqual(storedBuf, expectedBuf)
        ) {
            const reason = 'HMAC row signature mismatch on yield_reservoirs';
            await dbPool
                .query(
                    `UPDATE yield_reservoirs
                     SET quarantined = TRUE,
                         quarantine_reason = $3,
                         quarantined_at = CURRENT_TIMESTAMP
                     WHERE wallet_address = $1 OR wallet_address = $2`,
                    [prefixedWallet, cleanWallet, reason]
                )
                .catch(() => {});
            throw new Error(`LEDGER_HMAC_VIOLATION: ${reason}`);
        }
    }

    if (assetTicker.trim().toUpperCase() === 'KAS') {
        const onrampRes = await dbPool
            .query(
                `SELECT COALESCE(SUM(delivered_kas), 0.0) AS total_onramp
                 FROM fiat_onramp_orders
                 WHERE (wallet_address = $1 OR wallet_address = $2)
                   AND status = 'COMPLETED'`,
                [prefixedWallet, cleanWallet]
            )
            .catch(() => ({ rows: [{ total_onramp: 0 }] }));
        const settledOnrampKas = Number(onrampRes.rows[0]?.total_onramp || 0);
        const redisUnassignedStr = await redis
            .hget(`dev:sor:treasury:balances:${cleanWallet}`, 'Unassigned KAS')
            .catch(() => '0');
        const redisUnassignedKas = parseFloat(redisUnassignedStr || '0') || 0;
        const maxVerifiedCeiling =
            Math.max(totalYieldKas, verifiedCreditsKas) + settledOnrampKas + 1.0;

        if (
            streamingKas > maxVerifiedCeiling ||
            redisUnassignedKas > maxVerifiedCeiling
        ) {
            const reason = `Redis/Reservoir balance (${Math.max(streamingKas, redisUnassignedKas).toFixed(4)} KAS) exceeds verified credits ceiling (${maxVerifiedCeiling.toFixed(4)} KAS)`;
            await dbPool
                .query(
                    `UPDATE yield_reservoirs
                     SET quarantined = TRUE,
                         quarantine_reason = $3,
                         quarantined_at = CURRENT_TIMESTAMP
                     WHERE wallet_address = $1 OR wallet_address = $2`,
                    [prefixedWallet, cleanWallet, reason]
                )
                .catch(() => {});
            throw new Error(`SOLVENCY_INVARIANT_VIOLATION: ${reason}`);
        }
    }
}

function hexToBytes(hex: string): Uint8Array {
    const clean = hex.trim().replace(/^0x/i, '');
    if (clean.length % 2 !== 0) throw new Error('ERR_INVALID_HEX_LENGTH');
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

function writeUint16LE(val: number): Uint8Array {
    const arr = new Uint8Array(2);
    new DataView(arr.buffer).setUint16(0, val, true);
    return arr;
}

function writeUint32LE(val: number): Uint8Array {
    const arr = new Uint8Array(4);
    new DataView(arr.buffer).setUint32(0, val, true);
    return arr;
}

function writeBigUint64LE(val: bigint): Uint8Array {
    const arr = new Uint8Array(8);
    new DataView(arr.buffer).setBigUint64(0, val, true);
    return arr;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
    const totalLen = arrays.reduce((acc, arr) => acc + arr.length, 0);
    const res = new Uint8Array(totalLen);
    let offset = 0;
    for (const arr of arrays) {
        res.set(arr, offset);
        offset += arr.length;
    }
    return res;
}

function decodeKaspaAddressToVersionAndHash(address: string): {
    version: number;
    hash32: Uint8Array;
} {
    const formatted = address.trim().toLowerCase().startsWith('kaspa:')
        ? address.trim().toLowerCase()
        : `kaspa:${address.trim().toLowerCase()}`;
    const parts = formatted.split(':');
    if (parts.length !== 2) throw new Error('ERR_INVALID_KASPA_ADDRESS');
    const base32 = parts[1];
    if (base32.length < 10) throw new Error('ERR_KASPA_ADDRESS_TOO_SHORT');
    const decoded = new Uint8Array(base32.length - 8);
    for (let i = 0; i < base32.length - 8; i++) {
        const val = KASPA_CHARSET.indexOf(base32[i]);
        if (val === -1) throw new Error('ERR_INVALID_BASE32_CHAR');
        decoded[i] = val;
    }
    const out: number[] = [];
    let val = 0;
    let bits = 0;
    for (let i = 0; i < decoded.length; i++) {
        val = (val << 5) | decoded[i];
        bits += 5;
        while (bits >= 8) {
            bits -= 8;
            out.push((val >> bits) & 0xff);
        }
    }
    return {
        version: out[0] ?? 0,
        hash32: new Uint8Array(out.slice(1, 33))
    };
}

function encodeKaspaAddressFromPubkey(pubKeyX: Uint8Array): string {
    const polymod = (values: number[]) => {
        let c = 1n;
        for (const v of values) {
            const c0 = c >> 35n;
            c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(v);
            if (c0 & 1n) c ^= 0x98f2bc8e61n;
            if (c0 & 2n) c ^= 0x79b76d99e2n;
            if (c0 & 4n) c ^= 0xf33e5fb3c4n;
            if (c0 & 8n) c ^= 0xae2eabe2a8n;
            if (c0 & 16n) c ^= 0x1e4f43e470n;
        }
        return c ^ 1n;
    };
    const prefix = 'kaspa';
    const prefixValues = prefix
        .split('')
        .map((c) => c.charCodeAt(0) & 31)
        .concat([0]);
    const payload = [0, ...pubKeyX];
    let acc = 0;
    let bits = 0;
    const payload5: number[] = [];
    for (const byte of payload) {
        acc = (acc << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            bits -= 5;
            payload5.push((acc >> bits) & 31);
        }
    }
    if (bits > 0) payload5.push((acc << (5 - bits)) & 31);
    const mod = polymod([...prefixValues, ...payload5, 0, 0, 0, 0, 0, 0, 0, 0]);
    const checksum = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
        Number((mod >> BigInt(5 * (7 - i))) & 31n)
    );
    return (
        prefix +
        ':' +
        [...payload5, ...checksum].map((v) => KASPA_CHARSET[v]).join('')
    );
}

async function dispatchKaspaOrKrc20OnChain(
    asset: string,
    destinationAddress: string,
    amountTokens: number,
    idempotencyKey: string
): Promise<string> {
    const cleanAsset = asset.trim().toUpperCase();
    const rustBackendUrl =
        env.RUST_BACKEND_URL || `http://${env.UBUNTU_NODE_IP || '127.0.0.1'}:8002`;
    const internalToken = env.INTERNAL_ADMIN_TOKEN || env.PERENNIA_ADMIN_KEY || '';

    if (cleanAsset === 'KAS') {
        try {
            const rustRes = await fetch(`${rustBackendUrl}/v1/state/action`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${internalToken}`
                },
                body: JSON.stringify({
                    wallet: 'kaspa:treasury_master',
                    action: 'DISPATCH_OTC_UTXOS',
                    payload: {
                        destination: destinationAddress,
                        amount: amountTokens,
                        asset: 'KAS'
                    }
                }),
                signal: AbortSignal.timeout(10000)
            });
            if (rustRes.ok) {
                const rustData = await rustRes.json().catch(() => ({}));
                if (
                    rustData.success &&
                    rustData.transaction_id &&
                    !String(rustData.transaction_id).startsWith('PER-L1-')
                ) {
                    return String(rustData.transaction_id);
                }
            }
        } catch {
            // Fall through to direct signing if configured locally
        }
    }

    const privKeyRaw = (
        env.PERENNIA_HOT_KAS_PRIVATE_KEY ||
        env.PERENNIA_TREASURY_PRIVATE_KEY ||
        ''
    ).trim();
    if (!privKeyRaw) {
        throw new Error(
            'PERENNIA_HOT_KAS_PRIVATE_KEY not configured for Kaspa/KRC-20 L1 dispatch.'
        );
    }

    const privKeyBytes = hexToBytes(privKeyRaw);
    const pubKeyX = schnorr.getPublicKey(privKeyBytes);
    const sourceAddress =
        env.PERENNIA_HOT_KAS_ADDRESS ||
        env.PERENNIA_TREASURY_KAS_ADDRESS ||
        encodeKaspaAddressFromPubkey(pubKeyX);
    const formattedSource = sourceAddress.startsWith('kaspa:')
        ? sourceAddress
        : `kaspa:${sourceAddress}`;
    const sourceScriptHex = `20${bytesToHex(pubKeyX)}ac`;

    const kaspaRestUrl = (env.KASPA_REST_URL || 'https://api.kaspa.org').replace(
        /\/+$/,
        ''
    );
    const utxoRes = await fetch(
        `${kaspaRestUrl}/addresses/${encodeURIComponent(formattedSource)}/utxos`,
        { signal: AbortSignal.timeout(8000) }
    );
    if (!utxoRes.ok) {
        privKeyBytes.fill(0);
        throw new Error(`Kaspa REST UTXO query failed (${utxoRes.status}).`);
    }
    const utxos = await utxoRes.json();
    if (!Array.isArray(utxos) || utxos.length === 0) {
        privKeyBytes.fill(0);
        throw new Error('Treasury Kaspa hot wallet has 0 available UTXOs.');
    }

    const isKrc20 = cleanAsset !== 'KAS';
    let payloadHex = '';
    let targetSompi = BigInt(Math.floor(amountTokens * 1e8));
    let destScriptHex = sourceScriptHex;

    const formattedDest = destinationAddress.trim().toLowerCase().startsWith('kaspa:')
        ? destinationAddress.trim().toLowerCase()
        : `kaspa:${destinationAddress.trim().toLowerCase()}`;
    const { version: destVer, hash32: destPub } =
        decodeKaspaAddressToVersionAndHash(formattedDest);
    destScriptHex =
        destVer === 0x08
            ? `a9${bytesToHex(destPub)}87`
            : `20${bytesToHex(destPub)}ac`;

    if (isKrc20) {
        const krc20BaseUnits = BigInt(Math.round(amountTokens * 1e8)).toString();
        const krc20Inscription = JSON.stringify({
            p: 'krc-20',
            op: 'transfer',
            tick: cleanAsset,
            amt: krc20BaseUnits,
            to: formattedDest
        });
        payloadHex = bytesToHex(new TextEncoder().encode(krc20Inscription));
        targetSompi = 30_000_000n;
    }

    const payloadBytes = payloadHex ? hexToBytes(payloadHex) : new Uint8Array(0);
    const sortedUtxos = [...utxos].sort((a: any, b: any) => {
        const amtA = BigInt(a.utxoEntry?.amount ?? a.amount ?? 0);
        const amtB = BigInt(b.utxoEntry?.amount ?? b.amount ?? 0);
        return amtA < amtB ? 1 : amtA > amtB ? -1 : 0;
    });

    let gathered = 0n;
    let fee = 0n;
    const selected: any[] = [];
    for (const u of sortedUtxos) {
        selected.push(u);
        const amt = BigInt(u.utxoEntry?.amount ?? u.amount ?? 0);
        gathered += amt;
        const computeMass =
            200n +
            BigInt(selected.length) * 1200n +
            2n * 450n +
            BigInt(payloadBytes.length);
        fee = computeMass * FEE_PER_GRAM;
        if (gathered >= targetSompi + fee) break;
    }

    if (gathered < targetSompi + fee) {
        privKeyBytes.fill(0);
        throw new Error(
            `Insufficient Treasury KAS mass for ${cleanAsset} dispatch: required ${targetSompi + fee} sompi, available ${gathered} sompi.`
        );
    }

    const changeSompi = gathered - targetSompi - fee;
    const txInputs = selected.map((u: any) => ({
        previousOutpoint: {
            transactionId: u.outpoint?.transactionId ?? u.transactionId,
            index: Number(u.outpoint?.index ?? u.index ?? 0)
        },
        signatureScript: '',
        sequence: 0,
        sigOpCount: 1
    }));

    const txOutputs: Array<{ amount: number; scriptPublicKey: string }> = [
        {
            amount: Number(targetSompi),
            scriptPublicKey: destScriptHex
        }
    ];
    if (changeSompi >= MIN_CHANGE_SOMPI) {
        txOutputs.push({
            amount: Number(changeSompi),
            scriptPublicKey: sourceScriptHex
        });
    }

    const prevOutsHash = blake2b(
        concatBytes(
            ...txInputs.map((i) =>
                concatBytes(
                    hexToBytes(i.previousOutpoint.transactionId),
                    writeUint32LE(i.previousOutpoint.index)
                )
            )
        ),
        { dkLen: 32, key: TX_SIGNING_KEY }
    );
    const sequencesHash = blake2b(
        concatBytes(...txInputs.map((i) => writeBigUint64LE(BigInt(i.sequence)))),
        { dkLen: 32, key: TX_SIGNING_KEY }
    );
    const sigOpCountsHash = blake2b(
        concatBytes(...txInputs.map((i) => new Uint8Array([i.sigOpCount]))),
        { dkLen: 32, key: TX_SIGNING_KEY }
    );
    const outputsHash = blake2b(
        concatBytes(
            ...txOutputs.map((o) => {
                const spkBytes = hexToBytes(o.scriptPublicKey);
                return concatBytes(
                    writeBigUint64LE(BigInt(o.amount)),
                    writeUint16LE(0),
                    writeBigUint64LE(BigInt(spkBytes.length)),
                    spkBytes
                );
            })
        ),
        { dkLen: 32, key: TX_SIGNING_KEY }
    );
    const payloadHash =
        payloadBytes.length === 0
            ? new Uint8Array(32)
            : blake2b(
                  concatBytes(writeBigUint64LE(BigInt(payloadBytes.length)), payloadBytes),
                  { dkLen: 32, key: TX_SIGNING_KEY }
              );

    for (let i = 0; i < txInputs.length; i++) {
        const inp = txInputs[i];
        const u = selected[i];
        const spkHex =
            u.utxoEntry?.scriptPublicKey?.scriptPublicKey ??
            u.scriptPublicKey?.scriptPublicKey ??
            u.scriptPublicKey;
        const spkBytes = hexToBytes(spkHex);
        const amt = BigInt(u.utxoEntry?.amount ?? u.amount ?? 0);
        const sigHashData = concatBytes(
            writeUint16LE(0),
            prevOutsHash,
            sequencesHash,
            sigOpCountsHash,
            hexToBytes(inp.previousOutpoint.transactionId),
            writeUint32LE(inp.previousOutpoint.index),
            writeUint16LE(0),
            writeBigUint64LE(BigInt(spkBytes.length)),
            spkBytes,
            writeBigUint64LE(amt),
            writeBigUint64LE(BigInt(inp.sequence)),
            new Uint8Array([inp.sigOpCount]),
            outputsHash,
            writeBigUint64LE(0n),
            new Uint8Array(20),
            writeBigUint64LE(0n),
            payloadHash,
            new Uint8Array([SIGHASH_ALL])
        );
        const sighash = blake2b(sigHashData, { dkLen: 32, key: TX_SIGNING_KEY });
        const sig = schnorr.sign(sighash, privKeyBytes);
        inp.signatureScript = `41${bytesToHex(sig)}01`;
    }
    privKeyBytes.fill(0);

    const restPayload = {
        transaction: {
            version: 0,
            inputs: txInputs,
            outputs: txOutputs.map((o) => ({
                amount: o.amount,
                scriptPublicKey: {
                    version: 0,
                    scriptPublicKey: o.scriptPublicKey
                }
            })),
            lockTime: 0,
            subnetworkId: '0000000000000000000000000000000000000000',
            gas: 0,
            payload: payloadHex
        }
    };

    const batchId = `BATCH-${crypto
        .createHash('sha256')
        .update(idempotencyKey)
        .digest('hex')
        .slice(0, 16)
        .toUpperCase()}`;

    await dbPool
        .query(
            `INSERT INTO idempotent_payout_batches
             (batch_id, idempotency_key, signed_tx_json, total_sompi, recipient_manifest, state, updated_at)
             VALUES ($1, $2, $3, $4, $5, 'IN_FLIGHT', CURRENT_TIMESTAMP)
             ON CONFLICT (idempotency_key) DO UPDATE SET
                signed_tx_json = EXCLUDED.signed_tx_json,
                state = 'IN_FLIGHT',
                updated_at = CURRENT_TIMESTAMP`,
            [
                batchId,
                idempotencyKey,
                JSON.stringify(restPayload),
                Number(targetSompi),
                JSON.stringify([{ address: formattedDest, sompi: Number(targetSompi) }])
            ]
        )
        .catch(() => {});

    const broadcastRes = await fetch(`${kaspaRestUrl}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(restPayload),
        signal: AbortSignal.timeout(10000)
    });
    if (!broadcastRes.ok) {
        const errBody = await broadcastRes.text();
        await dbPool
            .query(
                `UPDATE idempotent_payout_batches
                 SET state = 'FAILED_BROADCAST',
                     retry_count = retry_count + 1,
                     last_error = $2,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE idempotency_key = $1`,
                [idempotencyKey, errBody]
            )
            .catch(() => {});
        throw new Error(
            `Kaspa L1 broadcast rejected (${broadcastRes.status}): ${errBody}`
        );
    }

    const broadcastData = await broadcastRes.json();
    const txId = String(broadcastData.transactionId || broadcastData.id || '');
    if (!txId) throw new Error('Kaspa node returned no transactionId.');

    await dbPool
        .query(
            `UPDATE idempotent_payout_batches
             SET deterministic_txid = $2,
                 state = 'CONFIRMED',
                 updated_at = CURRENT_TIMESTAMP
             WHERE idempotency_key = $1`,
            [idempotencyKey, txId]
        )
        .catch(() => {});

    return txId;
}

async function dispatchEvmOnChain(
    asset: string,
    destinationAddress: string,
    amountTokens: number
): Promise<string> {
    const cleanAsset = asset.trim().toUpperCase();
    const cfg = EVM_CHAIN_CONFIG[cleanAsset];
    if (!cfg) {
        throw new Error(`Unsupported EVM asset: ${cleanAsset}`);
    }
    const hotEthKey = (env.PERENNIA_HOT_ETH_PRIVATE_KEY || '').trim();
    if (!hotEthKey) {
        throw new Error(
            `PERENNIA_HOT_ETH_PRIVATE_KEY not configured for ${cleanAsset} L1 dispatch.`
        );
    }
    if (!ethers.isAddress(destinationAddress.trim())) {
        throw new Error(
            `Invalid EVM destination address for ${cleanAsset}: ${destinationAddress}`
        );
    }
    const rpcOverride =
        cfg.networkLabel === 'POL'
            ? env.POL_RPC_URL
            : cfg.networkLabel === 'AVAX'
              ? env.AVAX_RPC_URL
              : cfg.networkLabel === 'ARB'
                ? env.ARB_RPC_URL
                : cfg.networkLabel === 'BASE'
                  ? env.BASE_RPC_URL
                  : env.ETH_RPC_URL;
    const provider = new ethers.JsonRpcProvider(rpcOverride || cfg.rpcUrl, cfg.chainId);
    const wallet = new ethers.Wallet(hotEthKey, provider);
    if (cfg.isToken && cfg.contractAddress) {
        const decimals = cfg.decimals ?? 18;
        const contract = new ethers.Contract(cfg.contractAddress, ERC20_ABI, wallet);
        const rawUnits = ethers.parseUnits(
            amountTokens.toFixed(Math.min(decimals, 8)),
            decimals
        );
        const tx = await contract.transfer(destinationAddress.trim(), rawUnits);
        return String(tx.hash);
    } else {
        const rawWei = ethers.parseEther(amountTokens.toFixed(18));
        const tx = await wallet.sendTransaction({
            to: destinationAddress.trim(),
            value: rawWei
        });
        return String(tx.hash);
    }
}

async function dispatchSolanaOnChain(
    destinationAddress: string,
    amountSol: number
): Promise<string> {
    const hotSolKey = (env.PERENNIA_HOT_SOL_PRIVATE_KEY || '').trim();
    if (!hotSolKey) {
        throw new Error('PERENNIA_HOT_SOL_PRIVATE_KEY not configured for SOL L1 dispatch.');
    }
    const secretBytes =
        hotSolKey.length === 128 || hotSolKey.length === 64
            ? hexToBytes(hotSolKey)
            : (() => {
                  const n = ethers.decodeBase58(hotSolKey);
                  const hex = n.toString(16).padStart(128, '0');
                  return hexToBytes(hex);
              })();
    const keypair =
        secretBytes.length === 64
            ? SolKeypair.fromSecretKey(secretBytes)
            : SolKeypair.fromSeed(secretBytes.slice(0, 32));
    const toPubkey = new PublicKey(destinationAddress.trim());
    const lamports = Math.floor(amountSol * 1e9);
    if (lamports <= 0) throw new Error('Invalid SOL lamports amount.');
    const rpcUrl = env.SOL_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    const tx = new SolTransaction({
        recentBlockhash: blockhash,
        feePayer: keypair.publicKey
    }).add(
        SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey,
            lamports
        })
    );
    tx.sign(keypair);
    const rawTx = tx.serialize();
    const signature = await connection.sendRawTransaction(rawTx, {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
    });
    return String(signature);
}

async function dispatchBitcoinOnChain(
    destinationAddress: string,
    amountBtc: number
): Promise<string> {
    const hotBtcKey = (env.PERENNIA_HOT_BTC_PRIVATE_KEY || '').trim();
    if (!hotBtcKey) {
        throw new Error('PERENNIA_HOT_BTC_PRIVATE_KEY not configured for BTC L1 dispatch.');
    }
    const privBytes = hexToBytes(hotBtcKey);
    const pubKeyCompressed = secp256k1.getPublicKey(privBytes, true);
    const p2wpkh = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(pubKeyCompressed),
        network: bitcoin.networks.bitcoin
    });
    const p2pkh = bitcoin.payments.p2pkh({
        pubkey: Buffer.from(pubKeyCompressed),
        network: bitcoin.networks.bitcoin
    });
    const sourceAddr =
        env.PERENNIA_HOT_BTC_ADDRESS || p2wpkh.address || p2pkh.address;
    if (!sourceAddr) {
        privBytes.fill(0);
        throw new Error('Unable to derive Treasury BTC hot wallet address.');
    }
    const utxoRes = await fetch(
        `https://mempool.space/api/address/${sourceAddr}/utxo`,
        { signal: AbortSignal.timeout(8000) }
    );
    if (!utxoRes.ok) {
        privBytes.fill(0);
        throw new Error(`mempool.space UTXO lookup failed (${utxoRes.status}).`);
    }
    const utxos = await utxoRes.json();
    if (!Array.isArray(utxos) || utxos.length === 0) {
        privBytes.fill(0);
        throw new Error(`Treasury BTC hot wallet (${sourceAddr}) has 0 available UTXOs.`);
    }
    const targetSats = BigInt(Math.floor(amountBtc * 1e8));
    if (targetSats < 546n) {
        privBytes.fill(0);
        throw new Error('BTC transfer amount is below the 546 satoshi dust threshold.');
    }
    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });
    let gatheredSats = 0n;
    const feeSats = 1500n;
    for (const u of utxos) {
        const val = BigInt(u.value || 0);
        if (val <= 0n) continue;
        gatheredSats += val;
        if (sourceAddr.startsWith('bc1') && p2wpkh.output) {
            psbt.addInput({
                hash: u.txid,
                index: Number(u.vout),
                witnessUtxo: {
                    script: p2wpkh.output,
                    value: val
                }
            });
        } else {
            const rawTxRes = await fetch(`https://mempool.space/api/tx/${u.txid}/hex`);
            const rawTxHex = await rawTxRes.text();
            psbt.addInput({
                hash: u.txid,
                index: Number(u.vout),
                nonWitnessUtxo: Buffer.from(rawTxHex.trim(), 'hex')
            });
        }
        if (gatheredSats >= targetSats + feeSats) break;
    }
    if (gatheredSats < targetSats + feeSats) {
        privBytes.fill(0);
        throw new Error(
            `Insufficient BTC UTXO mass: required ${targetSats + feeSats} sats, available ${gatheredSats} sats.`
        );
    }
    psbt.addOutput({
        address: destinationAddress.trim(),
        value: targetSats
    });
    const changeSats = gatheredSats - targetSats - feeSats;
    if (changeSats >= 546n) {
        psbt.addOutput({
            address: sourceAddr,
            value: changeSats
        });
    }
    const signer = {
        publicKey: Buffer.from(pubKeyCompressed),
        sign: (hash: Uint8Array) => {
            const sig = secp256k1.sign(hash, privBytes);
            return Buffer.from(sig.toCompactRawBytes());
        }
    };
    psbt.signAllInputs(signer as any);
    psbt.finalizeAllInputs();
    privBytes.fill(0);
    const rawHex = psbt.extractTransaction().toHex();
    const broadcastRes = await fetch('https://mempool.space/api/tx', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: rawHex,
        signal: AbortSignal.timeout(10000)
    });
    if (!broadcastRes.ok) {
        const errText = await broadcastRes.text();
        throw new Error(`Bitcoin broadcast rejected: ${errText}`);
    }
    const txId = (await broadcastRes.text()).trim();
    return txId;
}

async function dispatchXrplOnChain(
    destinationAddress: string,
    amountXrp: number
): Promise<string> {
    const hotXrpKey = (
        env.PERENNIA_HOT_XRP_PRIVATE_KEY ||
        env.PERENNIA_HOT_ETH_PRIVATE_KEY ||
        ''
    ).trim();
    if (!hotXrpKey) {
        throw new Error('PERENNIA_HOT_XRP_PRIVATE_KEY not configured for XRP L1 dispatch.');
    }
    const client = new XrplClient(env.XRP_RPC_URL || 'wss://xrplcluster.com');
    await client.connect();
    try {
        const cleanHex = hotXrpKey.replace(/^0x/i, '').toUpperCase();
        const pubBytes = secp256k1.getPublicKey(hexToBytes(cleanHex), true);
        const wallet = new XrplWallet(bytesToHex(pubBytes).toUpperCase(), cleanHex);
        const paymentTx: any = {
            TransactionType: 'Payment',
            Account: wallet.classicAddress,
            Amount: xrpToDrops(amountXrp.toFixed(6)),
            Destination: destinationAddress.trim()
        };
        const prepared = await client.autofill(paymentTx);
        const signed = wallet.sign(prepared);
        const result = await client.submitAndWait(signed.tx_blob);
        const txHash = signed.hash || (result.result as any)?.hash;
        if (!txHash) throw new Error('XRPL submit returned no transaction hash.');
        return String(txHash);
    } finally {
        await client.disconnect().catch(() => {});
    }
}

export async function executeOrQueueL1Dispatch(params: {
    wallet: string;
    destinationAddress: string;
    asset: string;
    amount: number;
    sourceType?: string;
    spotPrice?: number;
}): Promise<{
    success: boolean;
    status: 'DISPATCHED_ONCHAIN' | 'QUEUED_FOR_L1_DISPATCH';
    payoutId: string;
    txHash: string;
    explorerUrl: string;
    asset: string;
    network: string;
    contractAddress?: string;
    amount: number;
    destinationAddress: string;
    queueReason?: string;
}> {
    await ensureL1PayoutQueueSchema().catch(() => {});
    const cleanWallet = normalizeKaspaBase32(params.wallet);
    const prefixedWallet = `kaspa:${cleanWallet}`;
    const cleanAsset = String(params.asset || 'KAS')
        .trim()
        .toUpperCase();
    const amount = Number(params.amount || 0);
    const destinationAddress = String(
        params.destinationAddress || prefixedWallet
    ).trim();
    const sourceType = String(params.sourceType || 'ledger_withdrawal').trim();

    await verifyWalletLedgerInvariantOrQuarantine(prefixedWallet, cleanAsset);

    let spotPrice = Number(params.spotPrice || 0);
    if (!spotPrice || spotPrice <= 0) {
        if (cleanAsset === 'USDC' || cleanAsset === 'USDT' || cleanAsset === 'USD') {
            spotPrice = 1.0;
        } else {
            const spotStr = await redis.get(`oracle:spot:${cleanAsset}_USDC`);
            spotPrice = spotStr ? parseFloat(spotStr) || 0 : 0;
            if (!spotPrice || spotPrice <= 0) {
                try {
                    const dbSpot = await dbPool.query(
                        `SELECT price_usd FROM rwa_oracle_feeds WHERE ticker = $1 AND price_usd > 0 AND updated_at >= CURRENT_TIMESTAMP - INTERVAL '15 minutes' ORDER BY updated_at DESC LIMIT 1`,
                        [cleanAsset]
                    );
                    if (dbSpot.rows.length > 0) {
                        spotPrice = Number(dbSpot.rows[0].price_usd || 0);
                    }
                } catch {
                    // Continue
                }
            }
        }
    }

    if (!Number.isFinite(spotPrice) || spotPrice <= 0) {
        throw new Error(
            `ORACLE_HALT: Live oracle price feed for ${cleanAsset} is offline. Failing closed.`
        );
    }

    const grossUsd = Number((amount * spotPrice).toFixed(2));
    const evmCfg = EVM_CHAIN_CONFIG[cleanAsset];
    const network = evmCfg ? evmCfg.networkLabel : cleanAsset;
    const contractAddress = evmCfg?.contractAddress;
    const payoutId = `PER-L1-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    let dispatchedTxHash = '';
    let queueReason = '';

    try {
        if (cleanAsset === 'KAS') {
            dispatchedTxHash = await dispatchKaspaOrKrc20OnChain(
                'KAS',
                destinationAddress,
                amount,
                payoutId
            );
        } else if (evmCfg) {
            dispatchedTxHash = await dispatchEvmOnChain(
                cleanAsset,
                destinationAddress,
                amount
            );
        } else if (cleanAsset === 'SOL') {
            dispatchedTxHash = await dispatchSolanaOnChain(
                destinationAddress,
                amount
            );
        } else if (cleanAsset === 'BTC') {
            dispatchedTxHash = await dispatchBitcoinOnChain(
                destinationAddress,
                amount
            );
        } else if (cleanAsset === 'XRP') {
            dispatchedTxHash = await dispatchXrplOnChain(
                destinationAddress,
                amount
            );
        } else if (
            destinationAddress.toLowerCase().startsWith('kaspa:') ||
            cleanAsset.length <= 6
        ) {
            dispatchedTxHash = await dispatchKaspaOrKrc20OnChain(
                cleanAsset,
                destinationAddress,
                amount,
                payoutId
            );
        } else {
            throw new Error(
                `Hot wallet key for ${cleanAsset} is not yet configured; routing to Sovereign L1 Payout Queue.`
            );
        }
    } catch (dispatchErr: any) {
        queueReason =
            dispatchErr?.message ||
            `Hot wallet key or UTXO mass pending for ${cleanAsset}; queued for L1 dispatch.`;
    }

    const status: 'DISPATCHED_ONCHAIN' | 'QUEUED_FOR_L1_DISPATCH' = dispatchedTxHash
        ? 'DISPATCHED_ONCHAIN'
        : 'QUEUED_FOR_L1_DISPATCH';
    const resolvedTxHash = dispatchedTxHash || payoutId;
    const explorerUrl = buildExplorerTxUrl(
        cleanAsset,
        dispatchedTxHash || destinationAddress
    );

    const record = {
        payoutId,
        walletAddress: prefixedWallet,
        destinationAddress,
        assetTicker: cleanAsset,
        network,
        contractAddress: contractAddress || null,
        amountTokens: amount,
        grossUsd,
        spotPrice,
        sourceType,
        txHash: resolvedTxHash,
        explorerUrl,
        queueReason: queueReason || null,
        status,
        createdAt: new Date().toISOString()
    };

    try {
        await dbPool.query(
            `INSERT INTO l1_payout_queue
             (payout_id, wallet_address, destination_address, asset_ticker, network, amount_tokens, gross_usd, spot_price, source_type, tx_hash, explorer_url, queue_reason, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT (payout_id) DO UPDATE SET
                tx_hash = EXCLUDED.tx_hash,
                status = EXCLUDED.status,
                updated_at = CURRENT_TIMESTAMP`,
            [
                record.payoutId,
                record.walletAddress,
                record.destinationAddress,
                record.assetTicker,
                record.network,
                record.amountTokens,
                record.grossUsd,
                record.spotPrice,
                record.sourceType,
                record.txHash,
                record.explorerUrl,
                record.queueReason,
                record.status
            ]
        );
        await dbPool.query(
            `INSERT INTO tax_ledger_events
             (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash, payout_address)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                cleanWallet,
                cleanAsset,
                sourceType === 'chronos_epoch_bell' || sourceType === 'yield_settle'
                    ? 'YIELD'
                    : 'L1_WITHDRAWAL',
                grossUsd,
                amount,
                spotPrice,
                resolvedTxHash,
                destinationAddress
            ]
        );
    } catch (dbErr) {
        console.warn('L1 payout queue DB logging notice:', dbErr);
    }

    await redis
        .lpush('perennia:l1:payout_queue', JSON.stringify(record))
        .catch(() => {});
    await redis.ltrim('perennia:l1:payout_queue', 0, 199).catch(() => {});
    await redis
        .publish(
            'telemetry:updates',
            JSON.stringify({
                l1_event: true,
                fiat_event: true,
                eventType:
                    status === 'DISPATCHED_ONCHAIN'
                        ? 'L1_DISPATCHED'
                        : 'L1_QUEUED',
                wallet: cleanWallet,
                payout: record
            })
        )
        .catch(() => {});

    return {
        success: true,
        status,
        payoutId,
        txHash: resolvedTxHash,
        explorerUrl,
        asset: cleanAsset,
        network,
        contractAddress,
        amount,
        destinationAddress,
        queueReason: queueReason || undefined
    };
}