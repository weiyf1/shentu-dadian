import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import Fastify, { type FastifyInstance } from 'fastify'

import { loadConfig, type AppConfig } from './config.js'
import { openDatabase } from './db/database.js'
import { seedDemoData } from './db/seed.js'
import { ApiError } from './errors.js'
import { annotationRoutes } from './routes/annotations.js'
import { healthRoutes } from './routes/health.js'
import { imageRoutes } from './routes/images.js'
import { sessionRoutes } from './routes/session.js'

export interface BuildAppOptions {
  config?: AppConfig
  databasePath?: string
  uploadsDir?: string
  seedDemoData?: boolean
  logger?: boolean
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig()
  const database = openDatabase(options.databasePath ?? config.databasePath)
  const uploadsDir = resolve(options.uploadsDir ?? config.uploadsDir)
  mkdirSync(uploadsDir, { recursive: true })

  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 1024 * 1024,
    genReqId(request) {
      const header = request.headers['x-request-id']
      const requestId = Array.isArray(header) ? header[0] : header
      return requestId && REQUEST_ID_PATTERN.test(requestId)
        ? requestId
        : randomUUID()
    },
  })

  app.decorate('db', database)

  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['X-Request-Id'],
  })

  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1,
      fields: 5,
    },
    throwFileSizeLimit: true,
  })

  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-Id', request.id)
  })

  if (options.seedDemoData) {
    await seedDemoData(database, uploadsDir)
  }

  app.setNotFoundHandler(async (request, reply) => {
    return reply.code(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} was not found`,
        requestId: request.id,
      },
    })
  })

  app.setErrorHandler(async (error, request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id,
          ...(error.details ? { details: error.details } : {}),
        },
      })
    }

    const errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String(error.code)
        : ''
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    if (errorCode === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(413).send({
        error: {
          code: 'IMAGE_TOO_LARGE',
          message: '图片不能超过 10 MB',
          requestId: request.id,
        },
      })
    }

    if (errorCode.startsWith('FST_')) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: errorMessage,
          requestId: request.id,
        },
      })
    }

    const reportedStatus =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : undefined
    const statusCode =
      reportedStatus !== undefined && reportedStatus >= 400 ? reportedStatus : 500

    if (statusCode >= 500) {
      request.log.error({ err: error }, 'Unhandled request error')
    }

    return reply.code(statusCode).send({
      error: {
        code: statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
        message: statusCode >= 500 ? 'Internal server error' : errorMessage,
        requestId: request.id,
      },
    })
  })

  await app.register(healthRoutes)
  await app.register(sessionRoutes)
  await app.register(annotationRoutes)
  await app.register(async (api) => {
    await imageRoutes(api, uploadsDir)
  })

  app.addHook('onClose', async () => {
    database.close()
  })

  return app
}
