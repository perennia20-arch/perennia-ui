import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    compilerOptions: {
        runes: true,
        // ⚡ ENTERPRISE FILTER: Mutes all annoying accessibility warnings in the terminal
        warningFilter: (warning) => !warning.code.startsWith('a11y')
    },
    kit: {
        adapter: adapter({ out: 'build' })
    }
};

export default config;