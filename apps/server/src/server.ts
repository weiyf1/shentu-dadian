import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

import { buildApp } from './app.js'
import { loadConfig } from './config.js'

if (existsSync('.env')) {
  loadEnvFile('.env')
}

const config = loadConfig()
const app = await buildApp({
  config,
  logger: true,
  seedDemoData: true,
})

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, 'Shutting down')
  await app.close()
  process.exit(0)
}

process.once('SIGINT', () => {
  void shutdown('SIGINT')
})
process.once('SIGTERM', () => {
  void shutdown('SIGTERM')
})

try {
  await app.listen({ host: config.host, port: config.port })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
