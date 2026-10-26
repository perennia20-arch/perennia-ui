
import { sveltekit } from '@sveltejs/kit/vite';

import tailwindcss from '@tailwindcss/vite';

import { defineConfig } from 'vite';

import { nodePolyfills } from 'vite-plugin-node-polyfills';



export default defineConfig({

    plugins: [

        sveltekit(),

        tailwindcss(),

        nodePolyfills({

            // ⚡ THE FIX: Only polyfill what the browser absolutely needs (Buffer).

            // Stripping 'crypto' prevents Vite from infecting the Node.js backend with crypto-browserify.

            include: ['buffer'],

            globals: { Buffer: true, global: true, process: true }

        })

    ],

    optimizeDeps: {

        include: [

            'xrpl', 

            'ethers', 

            '@solana/web3.js', 

            '@scure/bip32', 

            '@scure/bip39', 

            '@walletconnect/universal-provider'

        ]

    },

    build: {

        commonjsOptions: {

            transformMixedEsModules: true,

        }

    },

    // ⚡ THE FIREWALL: Explicitly protects your Node.js backend APIs

    ssr: {

        external: ['crypto', 'node:crypto', 'buffer', 'node:buffer', 'stream', 'util', 'pg', '@kaspa/core-lib', 'ioredis']

    }

});
