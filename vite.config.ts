import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [
        tailwindcss(),
        sveltekit()
    ],
    server: {
        host: true, 
        port: 5173,
        strictPort: true,
        fs: {
            allow: ['..']
        }
    },
    build: {
        target: 'esnext' 
    },
    ssr: {
        external: [
            '@kaspa/core-lib', 
            'secp256k1',       
            'bip39',
            'bip32',
            'tiny-secp256k1',
            'ethers',
            'bitcoinjs-lib',
            '@solana/web3.js',
            'ed25519-hd-key',
            'ioredis'
        ]
    },
    optimizeDeps: {
        exclude: ['@kaspa/core-lib', 'secp256k1', 'tiny-secp256k1']
    }
});