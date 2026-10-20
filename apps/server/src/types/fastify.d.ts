import type { DatabaseSync } from 'node:sqlite'

import type { Operator } from '../domain/types.js'
import type { ImageEventHub } from '../realtime/event-hub.js'

declare module 'fastify' {
  interface FastifyInstance {
    db: DatabaseSync
    events: ImageEventHub
  }

  interface FastifyRequest {
    operator?: Operator
  }
}

export {}
