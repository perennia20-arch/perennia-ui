import { secp256k1 } from '@noble/curves/secp256k1.js';
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
import { Buffer } from 'buffer';
import type { SovereignVaultKeys } from '$lib/crypto/honeycomb';
import { hexToBytes, bytesToHex } from './kaspaAddress';

const ERC20_TRANSFER_ABI = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address owner) view returns (uint8)'
];

export const EVM_CLIENT_CHAINS: Record<
    string,
    {
        rpcUrl: string;
        chainId: number;
        explorerTxBase: string;
        explorerAddressBase: string;
        isToken?: boolean;
        contractAddress?: string;
        decimals?: number;
    }
> = {
    ETH: {
        rpcUrl: 'https://ethereum-rpc.publicnode.com',
        chainId: 1,
        explorerTxBase: 'https://etherscan.io/tx/',
        explorerAddressBase: 'https://etherscan.io/address/'
    },
    USDC: {
        rpcUrl: 'https://ethereum-rpc.publicnode.com',
        chainId: 1,
        explorerTxBase: 'https://etherscan.io/tx/',
        explorerAddressBase: 'https://etherscan.io/address/',
        isToken: true,
        contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        decimals: 6
    },
    USDT: {
        rpcUrl: 'https://ethereum-rpc.publicnode.com',
        chainId: 1,
        explorerTxBase: 'https://etherscan.io/tx/',
        explorerAddressBase: 'https://etherscan.io/address/',
        isToken: true,
        contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        decimals: 6
    },
    POL: {
        rpcUrl: 'https://polygon-bor-rpc.publicnode.com',
        chainId: 137,
        explorerTxBase: 'https://polygonscan.com/tx/',
        explorerAddressBase: 'https://polygonscan.com/address/'
    },
    AVAX: {
        rpcUrl: 'https://avalanche-c-chain-rpc.publicnode.com',
        chainId: 43114,
        explorerTxBase: 'https://snowtrace.io/tx/',
        explorerAddressBase: 'https://snowtrace.io/address/'
    },
    ARB: {
        rpcUrl: 'https://arbitrum-one-rpc.publicnode.com',
        chainId: 42161,
        explorerTxBase: 'https://arbiscan.io/tx/',
        explorerAddressBase: 'https://arbiscan.io/address/'
    },
    BASE: {
        rpcUrl: 'https://base-rpc.publicnode.com',
        chainId: 8453,
        explorerTxBase: 'https://basescan.org/tx/',
        explorerAddressBase: 'https://basescan.org/address/'
    }
};

export function getChainExplorerTxUrl(assetOrNetwork: string, txHash: string): string {
    const cleanAsset = String(assetOrNetwork || 'KAS')
        .trim()
        .toUpperCase();
    const cleanTx = String(txHash || '').trim();
    if (!cleanTx) return '#';
    if (EVM_CLIENT_CHAINS[cleanAsset]) {
        return `${EVM_CLIENT_CHAINS[cleanAsset].explorerTxBase}${cleanTx}`;
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

export function getChainExplorerAddressUrl(assetOrNetwork: string, address: string): string {
    const cleanAsset = String(assetOrNetwork || 'KAS')
        .trim()
        .toUpperCase();
    const cleanAddr = String(address || '').trim();
    if (!cleanAddr || cleanAddr.includes('Awaiting')) return '#';
    if (EVM_CLIENT_CHAINS[cleanAsset]) {
        return `${EVM_CLIENT_CHAINS[cleanAsset].explorerAddressBase}${cleanAddr}`;
    }
    switch (cleanAsset) {
        case 'KAS':
            return `https://kas.fyi/address/${cleanAddr.startsWith('kaspa:') ? cleanAddr : `kaspa:${cleanAddr}`}`;
        case 'BTC':
            return `https://mempool.space/address/${cleanAddr}`;
        case 'SOL':
            return `https://solscan.io/account/${cleanAddr}`;
        case 'XRP':
            return `https://xrpscan.com/account/${cleanAddr}`;
        case 'DOGE':
            return `https://blockchair.com/dogecoin/address/${cleanAddr}`;
        case 'SUI':
            return `https://suiscan.xyz/mainnet/account/${cleanAddr}`;
        case 'TRX':
            return `https://tronscan.org/#/address/${cleanAddr}`;
        case 'ZEC':
            return `https://blockchair.com/zcash/address/${cleanAddr}`;
        default:
            return `https://kas.fyi/address/${cleanAddr}`;
    }
}

export async function signAndBroadcastNonKaspaL1Transfer(params: {
    cleanAsset: string;
    cleanNetwork: string;
    dest: string;
    amount: number;
    contractAddress?: string;
    decimals?: number;
    keys: SovereignVaultKeys;
}): Promise<{ txId: string; explorerUrl: string }> {
    const { cleanAsset, cleanNetwork, dest, amount } = params;

    if (EVM_CLIENT_CHAINS[cleanAsset] || EVM_CLIENT_CHAINS[cleanNetwork]) {
        const chainSpec =
            EVM_CLIENT_CHAINS[cleanAsset] || EVM_CLIENT_CHAINS[cleanNetwork];
        if (!ethers.isAddress(dest)) {
            throw new Error(`Invalid EVM destination address: ${dest}`);
        }
        const provider = new ethers.JsonRpcProvider(
            chainSpec.rpcUrl,
            chainSpec.chainId
        );
        const evmPrivKey = params.keys.ethereum.privateKey;
        const wallet = new ethers.Wallet(evmPrivKey, provider);
        const tokenContract = params.contractAddress || chainSpec.contractAddress;
        const isErc20 = Boolean(chainSpec.isToken || params.contractAddress);
        let txHash = '';
        if (isErc20 && tokenContract && ethers.isAddress(tokenContract)) {
            const decimals = params.decimals ?? chainSpec.decimals ?? 6;
            const contract = new ethers.Contract(
                tokenContract,
                ERC20_TRANSFER_ABI,
                wallet
            );
            const rawUnits = ethers.parseUnits(amount.toFixed(decimals), decimals);
            const tx = await contract.transfer(dest, rawUnits);
            txHash = String(tx.hash);
        } else {
            const rawWei = ethers.parseEther(amount.toFixed(18));
            const tx = await wallet.sendTransaction({
                to: dest,
                value: rawWei
            });
            txHash = String(tx.hash);
        }
        const explorerUrl = getChainExplorerTxUrl(cleanNetwork, txHash);
        return { txId: txHash, explorerUrl };
    }

    if (cleanAsset === 'SOL' || cleanNetwork === 'SOL') {
        const secretBytes = hexToBytes(params.keys.solana.privateKey);
        const keypair =
            secretBytes.length === 64
                ? SolKeypair.fromSecretKey(secretBytes)
                : SolKeypair.fromSeed(secretBytes.slice(0, 32));
        const toPubkey = new PublicKey(dest);
        const lamports = Math.floor(amount * 1e9);
        if (lamports <= 0) throw new Error('Invalid SOL transfer amount.');
        const connection = new Connection(
            'https://api.mainnet-beta.solana.com',
            'confirmed'
        );
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
        secretBytes.fill(0);
        const sig = await connection.sendRawTransaction(tx.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed'
        });
        const explorerUrl = getChainExplorerTxUrl('SOL', sig);
        return { txId: sig, explorerUrl };
    }

    if (cleanAsset === 'BTC' || cleanNetwork === 'BTC') {
        const privBytes = hexToBytes(params.keys.bitcoin.privateKey);
        const pubKeyCompressed = secp256k1.getPublicKey(privBytes, true);
        const sourceAddr = params.keys.bitcoin.address;
        const p2pkh = bitcoin.payments.p2pkh({
            pubkey: Buffer.from(pubKeyCompressed),
            network: bitcoin.networks.bitcoin
        });
        const p2wpkh = bitcoin.payments.p2wpkh({
            pubkey: Buffer.from(pubKeyCompressed),
            network: bitcoin.networks.bitcoin
        });
        const utxoRes = await fetch(
            `https://mempool.space/api/address/${sourceAddr}/utxo`
        );
        if (!utxoRes.ok) {
            throw new Error(
                `Failed to query Bitcoin UTXOs from mempool.space (${utxoRes.status}).`
            );
        }
        const utxos = await utxoRes.json();
        if (!Array.isArray(utxos) || utxos.length === 0) {
            throw new Error(`No spendable Bitcoin UTXOs found on ${sourceAddr}.`);
        }
        const targetSats = BigInt(Math.floor(amount * 1e8));
        if (targetSats < 546n) {
            throw new Error('BTC transfer amount is below the 546 satoshi dust limit.');
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
                const rawRes = await fetch(
                    `https://mempool.space/api/tx/${u.txid}/hex`
                );
                const rawHex = (await rawRes.text()).trim();
                psbt.addInput({
                    hash: u.txid,
                    index: Number(u.vout),
                    nonWitnessUtxo: Buffer.from(rawHex, 'hex')
                });
            }
            if (gatheredSats >= targetSats + feeSats) break;
        }
        if (gatheredSats < targetSats + feeSats) {
            throw new Error(
                `Insufficient BTC UTXO balance: required ${targetSats + feeSats} sats, available ${gatheredSats} sats.`
            );
        }
        psbt.addOutput({
            address: dest,
            value: targetSats
        });
        const changeSats = gatheredSats - targetSats - feeSats;
        if (changeSats >= 546n) {
            psbt.addOutput({
                address: sourceAddr || p2pkh.address!,
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
        const rawTxHex = psbt.extractTransaction().toHex();
        const broadcastRes = await fetch('https://mempool.space/api/tx', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: rawTxHex
        });
        if (!broadcastRes.ok) {
            const errText = await broadcastRes.text();
            throw new Error(`mempool.space rejected BTC transaction: ${errText}`);
        }
        const txId = (await broadcastRes.text()).trim();
        const explorerUrl = getChainExplorerTxUrl('BTC', txId);
        return { txId, explorerUrl };
    }

    if (cleanAsset === 'XRP' || cleanNetwork === 'XRP') {
        const xrpPrivHex = params.keys.xrp.privateKey.replace(/^0x/i, '').toUpperCase();
        const pubBytes = secp256k1.getPublicKey(hexToBytes(xrpPrivHex), true);
        const wallet = new XrplWallet(
            bytesToHex(pubBytes).toUpperCase(),
            xrpPrivHex
        );
        const client = new XrplClient('wss://xrplcluster.com');
        await client.connect();
        try {
            const prepared = await client.autofill({
                TransactionType: 'Payment',
                Account: wallet.classicAddress,
                Amount: xrpToDrops(amount.toFixed(6)),
                Destination: dest
            });
            const signed = wallet.sign(prepared);
            const submitRes = await client.submitAndWait(signed.tx_blob);
            const txHash = signed.hash || (submitRes.result as any)?.hash;
            if (!txHash) {
                throw new Error('XRPL node returned no transaction hash.');
            }
            const explorerUrl = getChainExplorerTxUrl('XRP', txHash);
            return { txId: txHash, explorerUrl };
        } finally {
            await client.disconnect().catch(() => {});
        }
    }

    throw new Error(
        `Direct browser-side L1 signing for ${cleanAsset} requires routing through the Sovereign L1 Dispatcher.`
    );
}