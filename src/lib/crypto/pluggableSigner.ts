import QRCode from 'qrcode';
import { ethers } from 'ethers';
import { schnorr } from '@noble/curves/secp256k1.js';
import {
    validateKaspaBech32mAddress,
    encodeKaspaAddressFromPubkeyBytes
} from '$lib/crypto/kaspaAddress';

export type PluggableSignerMode = 'WEB_QR_AIRLOCK';

export interface ColdVaultCardDescriptor {
    coldKaspaAddress: string;
    coldDestinationAddress: string;
    network: string;
    cardPublicKeyHex: string;
    cardLabel: string;
    signerMode: PluggableSignerMode;
    cardUidHex?: string;
}

export interface MultiChainAddressValidationResult {
    valid: boolean;
    normalized: string;
    network: string;
    addressType?: string;
    error?: string;
}

export interface AirgappedQrSweepRequest {
    version: 'perennia-airlock-v1';
    intent: 'HOT_TO_COLD_OVERFLOW' | 'COLD_TO_HOT_REFILL' | 'AIRGAPPED_PSBT_SIGN';
    sourceAddress: string;
    destinationColdAddress: string;
    amountKas: number;
    amountSompi: string;
    sighashHex?: string;
    createdAtIso: string;
}

export interface AirgappedQrSignedResponse {
    version: 'perennia-airlock-v1';
    intent: 'AIRGAPPED_SIGNATURE';
    signerPubkeyHex: string;
    sighashHex: string;
    schnorrSignatureHex: string;
    signedTransactionJson?: Record<string, unknown>;
}

export interface HardwareEnvironmentCapabilities {
    webCameraQrSupported: boolean;
    barcodeDetectorSupported: boolean;
}

const EVM_TICKERS_AND_CHAINS = new Set([
    'ETH',
    'ETHEREUM',
    'USDC',
    'USDT',
    'POL',
    'POLYGON',
    'AVAX',
    'AVALANCHE',
    'ARB',
    'ARBITRUM',
    'BASE',
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

const KASPA_ECOSYSTEM_TICKERS = new Set([
    'KAS',
    'KASPA',
    'SILO',
    'NACHO',
    'BEDRCK',
    'PERX'
]);

function hexToBytes(hex: string): Uint8Array {
    const clean = hex.trim().replace(/^0x/i, '');
    if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
        throw new Error('ERR_INVALID_HEX_STRING');
    }
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

export function resolveCanonicalNetworkForTicker(
    assetOrNetwork: string,
    explicitNetwork?: string
): string {
    const cleanNet = String(explicitNetwork || '')
        .trim()
        .toUpperCase();
    const cleanAsset = String(assetOrNetwork || 'KAS')
        .trim()
        .toUpperCase();
    const target = cleanNet && cleanNet !== 'UNKNOWN' ? cleanNet : cleanAsset;

    if (KASPA_ECOSYSTEM_TICKERS.has(target) || KASPA_ECOSYSTEM_TICKERS.has(cleanAsset)) {
        return 'KAS';
    }
    if (target === 'BTC' || target === 'BITCOIN') return 'BTC';
    if (target === 'SOL' || target === 'SOLANA') return 'SOL';
    if (target === 'XRP' || target === 'RIPPLE') return 'XRP';
    if (target === 'DOGE' || target === 'DOGECOIN') return 'DOGE';
    if (target === 'SUI') return 'SUI';
    if (target === 'TRX' || target === 'TRON') return 'TRX';
    if (target === 'ZEC' || target === 'ZCASH') return 'ZEC';
    if (EVM_TICKERS_AND_CHAINS.has(target) || EVM_TICKERS_AND_CHAINS.has(cleanAsset)) {
        if (['POL', 'AVAX', 'ARB', 'BASE'].includes(target)) return target;
        return 'ETH';
    }
    return target || 'KAS';
}

export function validateColdVaultAddressForChain(
    assetOrNetwork: string,
    rawAddress: string,
    explicitNetwork?: string
): MultiChainAddressValidationResult {
    const network = resolveCanonicalNetworkForTicker(assetOrNetwork, explicitNetwork);
    const trimmed = String(rawAddress || '').trim();
    if (!trimmed) {
        return {
            valid: false,
            normalized: '',
            network,
            error: 'Address is empty.'
        };
    }

    if (network === 'KAS') {
        const candidate = trimmed.toLowerCase().startsWith('kaspa:')
            ? trimmed.toLowerCase()
            : `kaspa:${trimmed.toLowerCase()}`;
        const check = validateKaspaBech32mAddress(candidate);
        return {
            valid: check.valid,
            normalized: check.normalized,
            network: 'KAS',
            addressType: check.addressType
                ? `Kaspa ${check.addressType}`
                : 'Kaspa L1',
            error: check.error
        };
    }

    if (EVM_TICKERS_AND_CHAINS.has(network)) {
        if (!ethers.isAddress(trimmed)) {
            return {
                valid: false,
                normalized: trimmed,
                network,
                error: `Invalid ${network} EVM address (expected 0x... 40-hex format).`
            };
        }
        return {
            valid: true,
            normalized: ethers.getAddress(trimmed),
            network,
            addressType: `${network} EVM`
        };
    }

    if (network === 'BTC') {
        const lower = trimmed.toLowerCase();
        const isBech32 = /^bc1[ac-hj-np-z02-9]{25,87}$/.test(lower);
        const isLegacyOrP2sh = /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(trimmed);
        if (!isBech32 && !isLegacyOrP2sh) {
            return {
                valid: false,
                normalized: trimmed,
                network: 'BTC',
                error: 'Invalid Bitcoin mainnet address (expected bc1..., 1..., or 3...).'
            };
        }
        return {
            valid: true,
            normalized: isBech32 ? lower : trimmed,
            network: 'BTC',
            addressType: isBech32 ? 'Bitcoin SegWit/Taproot' : 'Bitcoin Legacy/P2SH'
        };
    }

    if (network === 'SOL') {
        const isSolBase58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed);
        if (!isSolBase58) {
            return {
                valid: false,
                normalized: trimmed,
                network: 'SOL',
                error: 'Invalid Solana base58 public key.'
            };
        }
        return {
            valid: true,
            normalized: trimmed,
            network: 'SOL',
            addressType: 'Solana SPL/L1'
        };
    }

    if (network === 'XRP') {
        const isXrpl = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(trimmed);
        if (!isXrpl) {
            return {
                valid: false,
                normalized: trimmed,
                network: 'XRP',
                error: 'Invalid XRPL classic address (expected r...).'
            };
        }
        return {
            valid: true,
            normalized: trimmed,
            network: 'XRP',
            addressType: 'XRP Ledger'
        };
    }

    if (network === 'DOGE') {
        const isDoge = /^[DA9][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(trimmed);
        if (!isDoge) {
            return {
                valid: false,
                normalized: trimmed,
                network: 'DOGE',
                error: 'Invalid Dogecoin mainnet address (expected D...).'
            };
        }
        return {
            valid: true,
            normalized: trimmed,
            network: 'DOGE',
            addressType: 'Dogecoin L1'
        };
    }

    if (network === 'SUI') {
        const isSui = /^0x[0-9a-fA-F]{60,64}$/.test(trimmed);
        if (!isSui) {
            return {
                valid: false,
                normalized: trimmed,
                network: 'SUI',
                error: 'Invalid Sui address (expected 0x followed by 64 hex chars).'
            };
        }
        return {
            valid: true,
            normalized: trimmed.toLowerCase(),
            network: 'SUI',
            addressType: 'Sui L1'
        };
    }

    if (network === 'TRX') {
        const isTron = /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(trimmed);
        if (!isTron) {
            return {
                valid: false,
                normalized: trimmed,
                network: 'TRX',
                error: 'Invalid TRON address (expected T... 34-char Base58).'
            };
        }
        return {
            valid: true,
            normalized: trimmed,
            network: 'TRX',
            addressType: 'TRON L1'
        };
    }

    if (network === 'ZEC') {
        const isZec = /^(t1|t3|zs1|u1)[a-zA-Z0-9]{25,95}$/.test(trimmed);
        if (!isZec) {
            return {
                valid: false,
                normalized: trimmed,
                network: 'ZEC',
                error: 'Invalid Zcash address (expected t1..., t3..., or shielded address).'
            };
        }
        return {
            valid: true,
            normalized: trimmed,
            network: 'ZEC',
            addressType: 'Zcash L1'
        };
    }

    if (trimmed.length < 12) {
        return {
            valid: false,
            normalized: trimmed,
            network,
            error: `Address is too short for ${network}.`
        };
    }

    return {
        valid: true,
        normalized: trimmed,
        network,
        addressType: `${network} L1`
    };
}

export async function detectHardwareSignerCapabilities(): Promise<HardwareEnvironmentCapabilities> {
    const isBrowser =
        typeof window !== 'undefined' && typeof navigator !== 'undefined';
    const webCameraQrSupported = Boolean(
        isBrowser &&
            navigator.mediaDevices &&
            typeof navigator.mediaDevices.getUserMedia === 'function'
    );
    const barcodeDetectorSupported = Boolean(
        isBrowser && 'BarcodeDetector' in window
    );
    return {
        webCameraQrSupported,
        barcodeDetectorSupported
    };
}

export function parseMultiChainColdVaultQrPayload(
    rawQrString: string,
    expectedAssetOrNetwork = 'KAS',
    explicitNetwork?: string
): ColdVaultCardDescriptor {
    const trimmed = String(rawQrString || '').trim();
    if (!trimmed) {
        throw new Error('QR_PAYLOAD_EMPTY: Scanned QR code contained no data.');
    }

    const targetNetwork = resolveCanonicalNetworkForTicker(
        expectedAssetOrNetwork,
        explicitNetwork
    );

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            throw new Error(
                'QR_JSON_MALFORMED: Unable to parse JSON cold vault payload.'
            );
        }

        const rawAddr = String(
            parsed.coldDestinationAddress ||
                parsed.coldKaspaAddress ||
                parsed.address ||
                parsed.kaspaAddress ||
                ''
        ).trim();
        const rawPubkey = String(
            parsed.cardPublicKeyHex || parsed.publicKey || parsed.pubkey || ''
        )
            .trim()
            .replace(/^0x/i, '')
            .toLowerCase();
        const label = String(
            parsed.vaultLabel ||
                parsed.cardLabel ||
                parsed.label ||
                'Perennia Cold Vault'
        ).trim();

        let candidateAddress = rawAddr;
        if (
            !candidateAddress &&
            targetNetwork === 'KAS' &&
            (rawPubkey.length === 64 || rawPubkey.length === 66)
        ) {
            const pubBytes = hexToBytes(
                rawPubkey.length === 66 ? rawPubkey.slice(2) : rawPubkey
            );
            candidateAddress = encodeKaspaAddressFromPubkeyBytes(pubBytes);
        }

        const validation = validateColdVaultAddressForChain(
            expectedAssetOrNetwork,
            candidateAddress,
            targetNetwork
        );
        if (!validation.valid) {
            throw new Error(
                `INVALID_COLD_ADDRESS: ${validation.error || 'Address validation failed.'}`
            );
        }

        return {
            coldKaspaAddress: validation.normalized,
            coldDestinationAddress: validation.normalized,
            network: validation.network,
            cardPublicKeyHex: rawPubkey.slice(-64),
            cardLabel: label || 'Perennia Cold Vault',
            signerMode: 'WEB_QR_AIRLOCK',
            cardUidHex: typeof parsed.uid === 'string' ? parsed.uid : undefined
        };
    }

    const strippedUri = trimmed
        .replace(
            /^(kaspa|bitcoin|ethereum|solana|xrpl|dogecoin|sui|tron|zcash):(\/\/)?/i,
            (match) => {
                if (match.toLowerCase().startsWith('kaspa')) return 'kaspa:';
                return '';
            }
        )
        .trim();

    const [addressPart, queryString] = strippedUri.split('?');
    let candidateAddress = addressPart.trim();
    if (targetNetwork !== 'KAS' && candidateAddress.includes('@')) {
        candidateAddress = candidateAddress.split('@')[0].trim();
    }

    let parsedLabel = 'Perennia Cold Vault';
    if (queryString) {
        const params = new URLSearchParams(queryString);
        const labelParam = params.get('label') || params.get('message');
        if (labelParam) {
            parsedLabel = labelParam.trim();
        }
    }

    if (targetNetwork === 'KAS' && /^[0-9a-fA-F]{64}$/.test(candidateAddress)) {
        const pubBytes = hexToBytes(candidateAddress);
        candidateAddress = encodeKaspaAddressFromPubkeyBytes(pubBytes);
    }

    const validation = validateColdVaultAddressForChain(
        expectedAssetOrNetwork,
        candidateAddress,
        targetNetwork
    );
    if (!validation.valid) {
        throw new Error(
            `INVALID_QR_ADDRESS: ${validation.error || `Scanned QR is not a valid ${targetNetwork} address.`}`
        );
    }

    return {
        coldKaspaAddress: validation.normalized,
        coldDestinationAddress: validation.normalized,
        network: validation.network,
        cardPublicKeyHex: '',
        cardLabel: parsedLabel,
        signerMode: 'WEB_QR_AIRLOCK'
    };
}

export function parseColdVaultQrPayload(rawQrString: string): ColdVaultCardDescriptor {
    return parseMultiChainColdVaultQrPayload(rawQrString, 'KAS', 'KAS');
}

export async function scanVideoFrameForQrPayload(
    videoEl: HTMLVideoElement
): Promise<string | null> {
    if (typeof window === 'undefined' || !videoEl || videoEl.readyState < 2) {
        return null;
    }
    const BarcodeDetectorCtor = (
        window as unknown as { BarcodeDetector?: any }
    ).BarcodeDetector;
    if (!BarcodeDetectorCtor) {
        throw new Error(
            'BARCODE_DETECTOR_UNSUPPORTED: This browser does not expose native BarcodeDetector. Paste your Cold Vault address directly.'
        );
    }
    const detector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
    const results = await detector.detect(videoEl);
    if (Array.isArray(results) && results.length > 0 && results[0]?.rawValue) {
        return String(results[0].rawValue).trim();
    }
    return null;
}

export function buildAirgappedFundingQrPayload(params: {
    intent: 'HOT_TO_COLD_OVERFLOW' | 'COLD_TO_HOT_REFILL' | 'AIRGAPPED_PSBT_SIGN';
    sourceAddress: string;
    destinationColdAddress: string;
    amountKas: number;
    sighashHex?: string;
}): AirgappedQrSweepRequest {
    const cleanSource = validateKaspaBech32mAddress(params.sourceAddress);
    const cleanDest = validateKaspaBech32mAddress(params.destinationColdAddress);
    if (!cleanDest.valid) {
        throw new Error(
            `INVALID_COLD_DESTINATION: ${cleanDest.error || 'Cold vault address failed Bech32m checksum.'}`
        );
    }
    const safeKas = Math.max(0, Number(params.amountKas || 0));
    if (safeKas <= 0) {
        throw new Error(
            'INVALID_SWEEP_AMOUNT: Sweep amount must be greater than 0 KAS.'
        );
    }
    const sompi = BigInt(Math.round(safeKas * 1e8)).toString();
    return {
        version: 'perennia-airlock-v1',
        intent: params.intent,
        sourceAddress: cleanSource.valid
            ? cleanSource.normalized
            : params.sourceAddress.trim(),
        destinationColdAddress: cleanDest.normalized,
        amountKas: Number(safeKas.toFixed(4)),
        amountSompi: sompi,
        sighashHex: params.sighashHex,
        createdAtIso: new Date().toISOString()
    };
}

export async function renderAirgappedQrDataUrl(
    payload: AirgappedQrSweepRequest | string
): Promise<string> {
    const serialized =
        typeof payload === 'string' ? payload : JSON.stringify(payload);
    return QRCode.toDataURL(serialized, {
        margin: 1,
        width: 240,
        errorCorrectionLevel: 'M',
        color: {
            dark: '#000000',
            light: '#ffffff'
        }
    });
}

export function verifyAirgappedQrSignature(
    response: AirgappedQrSignedResponse
): boolean {
    const pubBytes = hexToBytes(response.signerPubkeyHex);
    const msgBytes = hexToBytes(response.sighashHex);
    const sigBytes = hexToBytes(response.schnorrSignatureHex);
    if (
        pubBytes.length !== 32 ||
        msgBytes.length !== 32 ||
        sigBytes.length !== 64
    ) {
        return false;
    }
    return schnorr.verify(sigBytes, msgBytes, pubBytes);
}