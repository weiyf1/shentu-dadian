import type { FastifyInstance } from 'fastify'

import {
  annotationParamsSchema,
  batchSaveSchema,
  createAnnotationSchema,
  deleteAnnotationQuerySchema,
  imageParamsSchema,
  parseInput,
  updateAnnotationSchema,
} from '../http/validation.js'
import { requireOperator } from '../http/operator.js'
import {
  createAnnotation,
  deleteAnnotation,
  saveBatch,
  updateAnnotation,
} from '../services/annotations.js'

export async function annotationRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/api/v1/images/:imageId/annotations',
    { preHandler: requireOperator },
    async (request, reply) => {
      const { imageId } = parseInput(imageParamsSchema, request.params)
      const input = parseInput(createAnnotationSchema, request.body)
      const result = createAnnotation(
        app.db,
        imageId,
        request.operator!,
        input,
      )

      return reply.code(result.created ? 201 : 200).send({
        annotation: result.annotation,
        imageRevision: result.imageRevision,
      })
    },
  )

  app.patch(
    '/api/v1/annotations/:annotationId',
    { preHandler: requireOperator },
    async (request) => {
      const { annotationId } = parseInput(
        annotationParamsSchema,
        request.params,
      )
      const input = parseInput(updateAnnotationSchema, request.body)
      return updateAnnotation(app.db, annotationId, request.operator!, input)
    },
  )

  app.delete(
    '/api/v1/annotations/:annotationId',
    { preHandler: requireOperator },
    async (request) => {
      const { annotationId } = parseInput(
        annotationParamsSchema,
        request.params,
      )
      const query = parseInput(deleteAnnotationQuerySchema, request.query)
      return deleteAnnotation(app.db, annotationId, query.version)
    },
  )

  app.post(
    '/api/v1/images/:imageId/annotations/batch',
    { preHandler: requireOperator },
    async (request) => {
      const { imageId } = parseInput(imageParamsSchema, request.params)
      const input = parseInput(batchSaveSchema, request.body)
      return saveBatch(app.db, imageId, request.operator!, input)
    },
  )
}
