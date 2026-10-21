import { fileURLToPath } from 'node:url'

import { defineConfig } from '@playwright/test'

const webDirectory = fileURLToPath(new URL('.', import.meta.url))
const serverDirectory = fileURLToPath(new URL('../server', import.meta.url))
const e2eDatabase = fileURLToPath(
  new URL('../server/data/e2e.db', import.meta.url),
)
const e2eUploads = fileURLToPath(
  new URL('../server/data/e2e-uploads', import.meta.url),
)

const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
)

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/known-failure/**'],
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    channel: 'msedge',
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node --import tsx src/server.ts',
      cwd: serverDirectory,
      url: 'http://127.0.0.1:3011/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...inheritedEnvironment,
        PORT: '3011',
        DATABASE_PATH: e2eDatabase,
        UPLOADS_DIR: e2eUploads,
      },
    },
    {
      command: 'node ./node_modules/vite/bin/vite.js',
      cwd: webDirectory,
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...inheritedEnvironment,
        VITE_DEV_HOST: '127.0.0.1',
        VITE_DEV_PORT: '5174',
        VITE_DEV_STRICT: 'true',
        VITE_API_PROXY_TARGET: 'http://127.0.0.1:3011',
      },
    },
  ],
})
