import { defineConfig, devices } from '@playwright/test';

declare const process: {
    env: Record<string, string | undefined>;
};

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';

export default defineConfig({
    testDir: './tests',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: 0,
    workers: 1,
    timeout: 90_000,
    expect: {
        timeout: 15_000
    },
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: BASE_URL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        viewport: { width: 1440, height: 900 },
        permissions: ['clipboard-read', 'clipboard-write']
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] }
        }
    ],
    webServer: {
        command: 'npm run dev -- --host 127.0.0.1 --port 5173',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000
    }
});