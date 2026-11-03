import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { ethers } from 'ethers';
import { Keypair as SolKeypair } from '@solana/web3.js';
import { Wallet as XrpWallet } from 'xrpl';
import { Buffer } from 'buffer';

export interface SovereignVaultKeys {
    kaspa: { address: string; privateKey: string };
    bitcoin: { address: string; privateKey: string };
    ethereum: { address: string; privateKey: string };
    solana: { address: string; privateKey: string };
    doge: { address: string; privateKey: string };
    xrp: { address: string; privateKey: string };
    polygon: { address: string; privateKey: string };
    avalanche: { address: string; privateKey: string };
    sui: { address: string; privateKey: string };
    tron: { address: string; privateKey: string };
    zcash: { address: string; privateKey: string };
    arbitrum?: { address: string; privateKey: string };
    base?: { address: string; privateKey: string };
    [chainKey: string]: { address: string; privateKey: string } | undefined;
}

const EVM_COMPATIBLE_NETWORKS = new Set([
    'ETH',
    'ETHEREUM',
    'ARB',
    'ARBITRUM',
    'BASE',
    'POL',
    'POLYGON',
    'MATIC',
    'AVAX',
    'AVALANCHE',
    'BSC',
    'BNB',
    'OP',
    'OPTIMISM',
    'FTM',
    'FANTOM',
    'LINEA',
    'SCROLL',
    'ZKSYNC',
    'MANTLE',
    'BLAST',
    'GNOSIS',
    'CELO',
    'CRONOS',
    'USDC',
    'USDT',
    'SPY',
    'QQQ',
    'NVDA',
    'AAPL',
    'TSLA',
    'AMD',
    'TSM',
    'AVGO',
    'XLE',
    'XAU',
    'XAG',
    'USTB'
]);

function hash160(pubKeyBytes: Uint8Array): Uint8Array {
    const sha = ethers.getBytes(ethers.sha256(pubKeyBytes));
    return ethers.getBytes(ethers.ripemd160(sha));
}

function encodeBase58Check(prefix: number[], payload: Uint8Array): string {
    const data = new Uint8Array([...prefix, ...payload]);
    const hash1 = ethers.getBytes(ethers.sha256(data));
    const hash2 = ethers.getBytes(ethers.sha256(hash1));
    const finalData = new Uint8Array([...data, ...hash2.slice(0, 4)]);
    return ethers.encodeBase58(finalData);
}

export async function deriveHoneycombKeys(mnemonic: string): Promise<SovereignVaultKeys> {
    if (!bip39.validateMnemonic(mnemonic, wordlist)) {
        throw new Error('Invalid Sovereign seed phrase.');
    }
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const masterHdKey = HDKey.fromMasterSeed(seed);

    const kasKey = masterHdKey.derive("m/44'/111111'/0'/0/0");
    const pubKeyX = Buffer.from(kasKey.publicKey!.slice(1, 33));
    const kaspaAddress = encodeKaspaAddress(pubKeyX);

    const btcKey = masterHdKey.derive("m/44'/0'/0'/0/0");
    const btcHash = hash160(btcKey.publicKey!);
    const btcAddress = encodeBase58Check([0x00], btcHash);

    const ethKey = masterHdKey.derive("m/44'/60'/0'/0/0");
    const ethWallet = new ethers.Wallet(Buffer.from(ethKey.privateKey!).toString('hex'));
    const ethAddress = ethWallet.address;

    const solKey = masterHdKey.derive("m/44'/501'/0'/0'");
    const solKeypair = SolKeypair.fromSeed(solKey.privateKey!.slice(0, 32));
    const solAddress = solKeypair.publicKey.toBase58();

    const dogeKey = masterHdKey.derive("m/44'/3'/0'/0/0");
    const dogeHash = hash160(dogeKey.publicKey!);
    const dogeAddress = encodeBase58Check([0x1e], dogeHash);

    const xrpKey = masterHdKey.derive("m/44'/144'/0'/0/0");
    const xrpWallet = new XrpWallet(
        Buffer.from(xrpKey.publicKey!).toString('hex').toUpperCase(),
        Buffer.from(xrpKey.privateKey!).toString('hex').toUpperCase()
    );
    const xrpAddress = xrpWallet.classicAddress;

    const polygonAddress = ethAddress;
    const avalancheAddress = ethAddress;

    const suiKey = masterHdKey.derive("m/44'/784'/0'/0'/0'");
    const suiPayload = new Uint8Array([0x00, ...suiKey.publicKey!]);
    const suiAddress = ethers.sha256(suiPayload).slice(0, 42);

    const trxKey = masterHdKey.derive("m/44'/195'/0'/0/0");
    const trxWallet = new ethers.Wallet(Buffer.from(trxKey.privateKey!).toString('hex'));
    const evmAddressBuffer = ethers.getBytes(trxWallet.address);
    const tronAddress = encodeBase58Check([0x41], evmAddressBuffer);

    const zecKey = masterHdKey.derive("m/44'/133'/0'/0/0");
    const zecHash = hash160(zecKey.publicKey!);
    const zcashAddress = encodeBase58Check([0x1c, 0xb8], zecHash);

    return {
        kaspa: { address: kaspaAddress, privateKey: Buffer.from(kasKey.privateKey!).toString('hex') },
        bitcoin: { address: btcAddress, privateKey: Buffer.from(btcKey.privateKey!).toString('hex') },
        ethereum: { address: ethAddress, privateKey: ethWallet.privateKey },
        solana: { address: solAddress, privateKey: Buffer.from(solKeypair.secretKey).toString('hex') },
        doge: { address: dogeAddress, privateKey: Buffer.from(dogeKey.privateKey!).toString('hex') },
        xrp: { address: xrpAddress, privateKey: Buffer.from(xrpKey.privateKey!).toString('hex') },
        polygon: { address: polygonAddress, privateKey: ethWallet.privateKey },
        avalanche: { address: avalancheAddress, privateKey: ethWallet.privateKey },
        sui: { address: suiAddress, privateKey: Buffer.from(suiKey.privateKey!).toString('hex') },
        tron: { address: tronAddress, privateKey: Buffer.from(trxKey.privateKey!).toString('hex') },
        zcash: { address: zcashAddress, privateKey: Buffer.from(zecKey.privateKey!).toString('hex') },
        arbitrum: { address: ethAddress, privateKey: ethWallet.privateKey },
        base: { address: ethAddress, privateKey: ethWallet.privateKey }
    };
}

export function resolveSovereignAddressForChain(
    chainOrTicker: string,
    wallets: Record<string, any> | null | undefined,
    fallbackKaspaAddress?: string | null
): string {
    const clean = String(chainOrTicker || 'KAS').trim().toUpperCase();
    const lower = clean.toLowerCase();

    if (wallets && wallets[lower]?.address) {
        return wallets[lower].address;
    }

    if (clean === 'KAS' || clean === 'KASPA' || clean === 'SILO' || clean === 'NACHO' || clean === 'BEDRCK' || clean === 'PERX') {
        return wallets?.kaspa?.address || fallbackKaspaAddress || 'Awaiting Decryption';
    }
    if (clean === 'BTC' || clean === 'BITCOIN') {
        return wallets?.bitcoin?.address || 'Awaiting Decryption';
    }
    if (EVM_COMPATIBLE_NETWORKS.has(clean)) {
        return wallets?.ethereum?.address || wallets?.polygon?.address || 'Awaiting Decryption';
    }
    if (clean === 'SOL' || clean === 'SOLANA') {
        return wallets?.solana?.address || 'Awaiting Decryption';
    }
    if (clean === 'DOGE' || clean === 'DOGECOIN') {
        return wallets?.doge?.address || 'Awaiting Decryption';
    }
    if (clean === 'XRP' || clean === 'RIPPLE') {
        return wallets?.xrp?.address || 'Awaiting Decryption';
    }
    if (clean === 'SUI') {
        return wallets?.sui?.address || 'Awaiting Decryption';
    }
    if (clean === 'TRX' || clean === 'TRON') {
        return wallets?.tron?.address || 'Awaiting Decryption';
    }
    if (clean === 'ZEC' || clean === 'ZCASH') {
        return wallets?.zcash?.address || 'Awaiting Decryption';
    }

    const seedAnchor =
        wallets?.kaspa?.address ||
        wallets?.ethereum?.address ||
        fallbackKaspaAddress ||
        '';
    if (!seedAnchor || seedAnchor.includes('Awaiting')) {
        return 'Awaiting Decryption';
    }

    const digestHex = ethers.sha256(
        new TextEncoder().encode(`PERENNIA_SOVEREIGN_DERIVATION:${clean}:${seedAnchor}`)
    );
    const digestBytes = ethers.getBytes(digestHex);

    if (clean === 'LTC' || clean === 'LITECOIN') {
        return encodeBase58Check([0x30], digestBytes.slice(0, 20));
    }
    if (clean === 'TON') {
        return `UQ${ethers.encodeBase58(digestBytes).slice(0, 46)}`;
    }
    if (clean === 'ADA' || clean === 'CARDANO') {
        return `addr1q${digestHex.slice(2, 56)}`;
    }
    if (clean === 'APT' || clean === 'APTOS') {
        return digestHex;
    }

    if (wallets?.ethereum?.address) {
        return wallets.ethereum.address;
    }
    return `0x${digestHex.slice(2, 42)}`;
}

function encodeKaspaAddress(pubKeyX: Buffer): string {
    const KASPA_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
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
    let acc = 0,
        bits = 0;
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
    return prefix + ':' + [...payload5, ...checksum].map((v) => KASPA_ALPHABET[v]).join('');
}