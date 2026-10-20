import type { FastifyInstance } from 'fastify'

import { parseInput, sessionSchema } from '../http/validation.js'
import { resolveOperator } from '../services/operators.js'

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/v1/session', async (request, reply) => {
    const input = parseInput(sessionSchema, request.body)
    const result = resolveOperator(app.db, input.displayName)
    return reply.code(result.created ? 201 : 200).send(result)
  })
}
