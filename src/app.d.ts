declare var process: {
    env: Record<string, string | undefined>;
};

declare namespace App {
    interface Locals {
        redis: import('ioredis').Redis;
        walletAddress?: string;
    }
}

interface Window {
    kasware: any;
    solflare: any;
    ethereum: any;
}

declare module 'qrcode' {
    export interface QRCodeToDataURLOptions {
        margin?: number;
        width?: number;
        scale?: number;
        color?: {
            dark?: string;
            light?: string;
        };
        errorCorrectionLevel?: 'low' | 'medium' | 'quartile' | 'high' | 'L' | 'M' | 'Q' | 'H';
    }
    export function toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
    const QRCode: {
        toDataURL: typeof toDataURL;
    };
    export default QRCode;
}

declare module 'qrcode/lib/index.js' {
    import QRCode, { toDataURL, type QRCodeToDataURLOptions } from 'qrcode';
    export { toDataURL, type QRCodeToDataURLOptions };
    export default QRCode;
}

declare module '@scure/bip39/wordlists/english' {
    export const wordlist: string[];
}