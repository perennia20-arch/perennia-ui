import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
    plugins: [
        sveltekit(),
        tailwindcss(),
        nodePolyfills({
            include: ['buffer', 'crypto', 'stream', 'util'],
            globals: { Buffer: true, global: true, process: true }
        })
    ],
    // ⚡ THE FIREWALL: Explicitly protects your Node.js backend APIs from being corrupted by frontend browser polyfills
    ssr: {
        external: ['crypto', 'node:crypto', 'buffer', 'node:buffer', 'stream', 'util', 'pg']
    }
});