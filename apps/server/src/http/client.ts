import type { FastifyRequest } from 'fastify'

export function getRequestClientId(
  request: FastifyRequest,
): string | null {
  const header = request.headers['x-client-id']
  const value = Array.isArray(header) ? header[0] : header
  if (!value || value.length > 100) return null
  return value
}
