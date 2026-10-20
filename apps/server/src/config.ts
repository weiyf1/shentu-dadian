import { resolve } from 'node:path'

export interface AppConfig {
  host: string
  port: number
  databasePath: string
  uploadsDir: string
  corsOrigins: string[]
}

const DEFAULT_CORS_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']

function parsePort(value: string | undefined): number {
  const port = Number(value ?? '3001')

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${value ?? ''}`)
  }

  return port
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const configuredOrigins = env.CORS_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  return {
    host: env.HOST?.trim() || '127.0.0.1',
    port: parsePort(env.PORT),
    databasePath: resolve(env.DATABASE_PATH?.trim() || 'data/app.db'),
    uploadsDir: resolve(env.UPLOADS_DIR?.trim() || 'data/uploads'),
    corsOrigins:
      configuredOrigins && configuredOrigins.length > 0
        ? configuredOrigins
        : DEFAULT_CORS_ORIGINS,
  }
}
