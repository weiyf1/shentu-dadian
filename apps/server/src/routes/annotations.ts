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
import { getRequestClientId } from '../http/client.js'
import { requireOperator } from '../http/operator.js'
import { publishImageChanged } from '../realtime/publish.js'
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

      if (result.created) {
        publishImageChanged(app.events, app.db, {
          imageId,
          actor: request.operator!,
          sourceClientId: getRequestClientId(request),
          changed: {
            created: [result.annotation.id],
            updated: [],
            deleted: [],
          },
        })
      }

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
      const result = updateAnnotation(
        app.db,
        annotationId,
        request.operator!,
        input,
      )
      const annotation = request.server.db
        .prepare('SELECT image_id FROM annotations WHERE id = ?')
        .get(annotationId) as { image_id: string } | undefined
      if (annotation) {
        publishImageChanged(app.events, app.db, {
          imageId: annotation.image_id,
          actor: request.operator!,
          sourceClientId: getRequestClientId(request),
          changed: {
            created: [],
            updated: [annotationId],
            deleted: [],
          },
        })
      }
      return result
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
      const imageRow = app.db
        .prepare('SELECT image_id FROM annotations WHERE id = ?')
        .get(annotationId) as { image_id: string } | undefined
      const result = deleteAnnotation(
        app.db,
        annotationId,
        query.version,
      )
      if (imageRow) {
        publishImageChanged(app.events, app.db, {
          imageId: imageRow.image_id,
          actor: request.operator!,
          sourceClientId: getRequestClientId(request),
          changed: {
            created: [],
            updated: [],
            deleted: [annotationId],
          },
        })
      }
      return result
    },
  )

  app.post(
    '/api/v1/images/:imageId/annotations/batch',
    { preHandler: requireOperator },
    async (request) => {
      const { imageId } = parseInput(imageParamsSchema, request.params)
      const input = parseInput(batchSaveSchema, request.body)
      const result = saveBatch(app.db, imageId, request.operator!, input)
      const changedCount =
        result.changed.created.length +
        result.changed.updated.length +
        result.changed.deleted.length
      if (changedCount > 0) {
        publishImageChanged(app.events, app.db, {
          imageId,
          actor: request.operator!,
          sourceClientId: getRequestClientId(request),
          changed: result.changed,
        })
      }
      return result
    },
  )
}
