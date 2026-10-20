import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { parseInput } from '../http/validation.js'

const eventsQuerySchema = z.object({
  clientId: z.string().max(100).optional(),
})

export async function realtimeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/events', async (request, reply) => {
    const query = parseInput(eventsQuerySchema, request.query)
    app.events.subscribe(request, reply, query.clientId ?? null)
  })
}
