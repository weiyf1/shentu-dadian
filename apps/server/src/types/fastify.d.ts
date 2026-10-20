import type { DatabaseSync } from 'node:sqlite'

import type { Operator } from '../domain/types.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: DatabaseSync
  }

  interface FastifyRequest {
    operator?: Operator
  }
}

export {}
