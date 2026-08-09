import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { HDKey } from '@scure/bip32';
import { ethers } from 'ethers';
import { Keypair as SolKeypair } from '@solana/web3.js';
import createHash from 'create-hash';
import bs58check from 'bs58check';
import { Wallet as XrpWallet } from 'xrpl';
// ⚡ NOTE: @kaspa/core-lib has been completely removed to bypass WASM crashes

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
}

export async function deriveHoneycombKeys(mnemonic: string): Promise<SovereignVaultKeys> {
    if (!bip39.validateMnemonic(mnemonic, wordlist)) {
        throw new Error('Invalid 24-word Sovereign seed phrase.');
    }

    const seed = await bip39.mnemonicToSeed(mnemonic);
    const masterHdKey = HDKey.fromMasterSeed(seed);

    // 1. KASPA (m/44'/111111'/0'/0/0) - Pure JS Bech32m Derivation (No WASM)
    const kasKey = masterHdKey.derive("m/44'/111111'/0'/0/0");
    const pubKeyX = Buffer.from(kasKey.publicKey!.slice(1, 33)); // Extract 32-byte X coordinate
    const kaspaAddress = encodeKaspaAddress(pubKeyX);

    // 2. BITCOIN (m/44'/0'/0'/0/0)
    const btcKey = masterHdKey.derive("m/44'/0'/0'/0/0");
    const btcAddress = `bc1q${Buffer.from(btcKey.publicKey!.slice(1, 21)).toString('hex')}`;

    // 3. ETHEREUM (m/44'/60'/0'/0/0)
    const ethKey = masterHdKey.derive("m/44'/60'/0'/0/0");
    const ethWallet = new ethers.Wallet(Buffer.from(ethKey.privateKey!).toString('hex'));
    const ethAddress = ethWallet.address;

    // 4. SOLANA (m/44'/501'/0'/0')
    const solKey = masterHdKey.derive("m/44'/501'/0'/0'");
    const solKeypair = SolKeypair.fromSeed(solKey.privateKey!.slice(0, 32));
    const solAddress = solKeypair.publicKey.toBase58();

    // 5. DOGECOIN (m/44'/3'/0'/0/0) - Base58Check with Prefix 0x1E
    const dogeKey = masterHdKey.derive("m/44'/3'/0'/0/0");
    const dogeHash = createHash('ripemd160').update(createHash('sha256').update(Buffer.from(dogeKey.publicKey!)).digest()).digest();
    const dogeAddress = bs58check.encode(Buffer.concat([Buffer.from([0x1E]), dogeHash]));

    // 6. XRP LEDGER (m/44'/144'/0'/0/0) - Native XRPL Derivation
    const xrpKey = masterHdKey.derive("m/44'/144'/0'/0/0");
    const xrpWallet = new XrpWallet(Buffer.from(xrpKey.publicKey!).toString('hex').toUpperCase(), Buffer.from(xrpKey.privateKey!).toString('hex').toUpperCase());
    const xrpAddress = xrpWallet.classicAddress;

    // 7 & 8. POLYGON & AVALANCHE (EVM Inheritance)
    const polygonAddress = ethAddress;
    const avalancheAddress = ethAddress;

    // 9. SUI NETWORK (m/44'/784'/0'/0'/0')
    const suiKey = masterHdKey.derive("m/44'/784'/0'/0'/0'");
    const suiAddress = `0x${createHash('sha256').update(Buffer.from(suiKey.publicKey!)).digest('hex').slice(0, 40)}`;

    // 10. TRON (m/44'/195'/0'/0/0) - Base58Check with Prefix 0x41
    const trxKey = masterHdKey.derive("m/44'/195'/0'/0/0");
    const trxWallet = new ethers.Wallet(Buffer.from(trxKey.privateKey!).toString('hex'));
    const evmAddressBuffer = Buffer.from(trxWallet.address.slice(2), 'hex');
    const tronAddress = bs58check.encode(Buffer.concat([Buffer.from([0x41]), evmAddressBuffer]));

    // 11. ZCASH (m/44'/133'/0'/0/0) - Base58Check with Prefix 0x1CB8 (t1)
    const zecKey = masterHdKey.derive("m/44'/133'/0'/0/0");
    const zecHash = createHash('ripemd160').update(createHash('sha256').update(Buffer.from(zecKey.publicKey!)).digest()).digest();
    const zcashAddress = bs58check.encode(Buffer.concat([Buffer.from([0x1C, 0xB8]), zecHash]));

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
        zcash: { address: zcashAddress, privateKey: Buffer.from(zecKey.privateKey!).toString('hex') }
    };
}

// --- KASPA BECH32M ENCODER (Bypasses @kaspa/core-lib WASM) ---
function encodeKaspaAddress(pubKeyX: Buffer): string {
    const KASPA_ALPHABET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    
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

    const prefix = "kaspa";
    const prefixValues = prefix.split('').map(c => c.charCodeAt(0) & 31).concat([0]);
    const payload = [0, ...pubKeyX]; // Version byte 0 for P2PK-Schnorr

    let acc = 0, bits = 0;
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
    const checksum = [0, 1, 2, 3, 4, 5, 6, 7].map(i => Number((mod >> BigInt(5 * (7 - i))) & 31n));

    return prefix + ":" + [...payload5, ...checksum].map(v => KASPA_ALPHABET[v]).join('');
}