import {defineConfig, devices} from '@playwright/test';

export default defineConfig({
  testDir: './browser-demo-checks',
  fullyParallel: false,
  workers: 1,
  maxFailures: process.env.CI ? 3 : undefined,
  timeout: 45000,
  expect: {timeout: 8000},
  outputDir: 'test-results/demo',
  reporter: process.env.CI ? [['list'], ['html', {open: 'never', outputFolder: 'playwright-report/demo'}]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:19440',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {}),
      args: ['--no-sandbox'],
    },
  },
  projects: [
    {name: 'escritorio', use: {viewport: {width: 1440, height: 1000}}},
    {name: 'movil', use: {...devices['Pixel 7'], viewport: {width: 390, height: 844}}},
    {name: 'movil-estrecho', use: {...devices['Pixel 7'], viewport: {width: 360, height: 780}}},
  ],
  webServer: {
    command: 'node browser-demo-checks/static-server.mjs',
    url: 'http://127.0.0.1:19440',
    reuseExistingServer: false,
    timeout: 10000,
  },
});
