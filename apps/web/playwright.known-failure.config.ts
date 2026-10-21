import { defineConfig } from '@playwright/test'

import baseConfig from './playwright.config'

export default defineConfig({
  ...baseConfig,
  testDir: './e2e/known-failure',
  testMatch: '**/*.spec.ts',
  testIgnore: [],
  reporter: [['list']],
})
