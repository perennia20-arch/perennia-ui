// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

declare const process: {
    env: Record<string, string | undefined>;
};

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim();
const liveMode = process.env.PLAYWRIGHT_LIVE_MODE === 'true';
const httpCredentials =
    process.env.PLAYWRIGHT_HTTP_USER && process.env.PLAYWRIGHT_HTTP_PASS
        ? {
              username: process.env.PLAYWRIGHT_HTTP_USER,
              password: process.env.PLAYWRIGHT_HTTP_PASS
          }
        : undefined;

export default defineConfig({
    testDir: './tests',
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: 0,
    workers: 1,
    reporter: [['list'], ['html', { open: 'never' }]],
    timeout: 60_000,
    expect: {
        timeout: 10_000
    },
    use: {
        baseURL: externalBaseUrl || 'http://localhost:5173',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        viewport: { width: 1600, height: 960 },
        ...(httpCredentials ? { httpCredentials } : {}),
        extraHTTPHeaders: liveMode
            ? {}
            : {
                  'x-perennia-sandbox': 'true'
              }
    },
    projects: [
        {
            name: 'perennia-chromium-rehearsal',
            use: { ...devices['Desktop Chrome'] }
        }
    ],
    ...(externalBaseUrl
        ? {}
        : {
              webServer: {
                  command: 'npm run dev',
                  url: 'http://localhost:5173',
                  reuseExistingServer: true,
                  timeout: 60_000,
                  env: {
                      SANDBOX_MODE: 'true',
                      NODE_ENV: 'development'
                  }
              }
          })
});
