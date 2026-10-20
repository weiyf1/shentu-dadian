import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const apiProxy = {
  '/api': {
    target:
      process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3001',
    changeOrigin: true,
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    host: process.env.VITE_DEV_HOST ?? '127.0.0.1',
    port: Number(process.env.VITE_DEV_PORT ?? 5173),
    strictPort: process.env.VITE_DEV_STRICT === 'true',
    proxy: apiProxy,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    proxy: apiProxy,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
