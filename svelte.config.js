import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
    preprocess: vitePreprocess(),
    compilerOptions: {
        runes: true,
        warningFilter: (warning) => !warning.code.startsWith('a11y')
    },
    kit: {
        adapter: adapter({
            out: 'build',
            precompress: true,
            envPrefix: ''
        }),
        csrf: {
            checkOrigin: false
        }
    }
};

export default config;