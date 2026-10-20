import type { DatabaseSync } from 'node:sqlite'

import {
  badRequest,
  conflict,
  forbidden,
  notFound,
} from '../errors.js'
import { roundCoordinate } from '../http/validation.js'
import type {
  Annotation,
  AnnotationRecord,
  AnnotationViewRecord,
  ImageRecord,
  Operator,
} from '../domain/types.js'
import { withImmediateTransaction } from '../db/transaction.js'
import { getImageRecord } from './images.js'

const ANNOTATION_VIEW_SELECT = `
  SELECT
    a.id,
    a.image_id,
    a.author_id,
    a.updated_by_id,
    a.number,
    a.x,
    a.y,
    a.note,
    a.version,
    a.created_at,
    a.updated_at,
    o.display_name AS author_name,
    o.color AS author_color
  FROM annotations AS a
  JOIN operators AS o ON o.id = a.author_id
`

export interface AnnotationCreateInput {
  id: string
  x: number
  y: number
  note: string
}

export interface AnnotationUpdateInput {
  note: string
  version: number
}

export interface BatchInput {
  baseRevision?: number | undefined
  observedRevision?: number | undefined
  creates: AnnotationCreateInput[]
  updates: Array<AnnotationUpdateInput & { id: string }>
  deletes: Array<{ id: string; version: number }>
}

export interface BatchChangeSet {
  created: string[]
  updated: string[]
  deleted: string[]
}

function toAnnotation(record: AnnotationViewRecord): Annotation {
  return {
    id: record.id,
    number: record.number,
    x: record.x,
    y: record.y,
    note: record.note,
    author: {
      id: record.author_id,
      displayName: record.author_name,
      color: record.author_color,
    },
    version: record.version,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  }
}

export function listAnnotations(
  database: DatabaseSync,
  imageId: string,
): Annotation[] {
  const rows = database
    .prepare(
      `${ANNOTATION_VIEW_SELECT}
       WHERE a.image_id = ?
       ORDER BY a.number ASC`,
    )
    .all(imageId) as unknown as AnnotationViewRecord[]

  return rows.map(toAnnotation)
}

export function getAnnotationById(
  database: DatabaseSync,
  annotationId: string,
): Annotation | undefined {
  const row = database
    .prepare(`${ANNOTATION_VIEW_SELECT} WHERE a.id = ?`)
    .get(annotationId) as AnnotationViewRecord | undefined

  return row ? toAnnotation(row) : undefined
}

export function getAnnotationRecord(
  database: DatabaseSync,
  annotationId: string,
): AnnotationRecord | undefined {
  return database
    .prepare(
      `SELECT id, image_id, author_id, updated_by_id, number, x, y, note,
              version, created_at, updated_at
       FROM annotations
       WHERE id = ?`,
    )
    .get(annotationId) as AnnotationRecord | undefined
}

function annotationCount(database: DatabaseSync, imageId: string): number {
  const row = database
    .prepare('SELECT COUNT(*) AS count FROM annotations WHERE image_id = ?')
    .get(imageId) as { count: number }
  return Number(row.count)
}

function validateCoordinates(
  image: ImageRecord,
  x: number,
  y: number,
): void {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    throw badRequest('标记坐标超出图片范围')
  }
}

function sameCoordinates(a: number, b: number): boolean {
  return roundCoordinate(a) === roundCoordinate(b)
}

export function createAnnotation(
  database: DatabaseSync,
  imageId: string,
  operator: Operator,
  input: AnnotationCreateInput,
): { annotation: Annotation; imageRevision: number; created: boolean } {
  return withImmediateTransaction(database, () => {
    const image = getImageRecord(database, imageId)
    if (!image) {
      throw notFound('IMAGE_NOT_FOUND', '图片不存在')
    }

    validateCoordinates(image, input.x, input.y)

    const existing = getAnnotationRecord(database, input.id)
    if (existing) {
      const isSameCreate =
        existing.image_id === imageId &&
        existing.author_id === operator.id &&
        existing.note === input.note &&
        sameCoordinates(existing.x, input.x) &&
        sameCoordinates(existing.y, input.y)

      if (isSameCreate) {
        const annotation = getAnnotationById(database, input.id)
        if (!annotation) {
          throw new Error('Failed to read idempotent annotation')
        }
        return {
          annotation,
          imageRevision: image.revision,
          created: false,
        }
      }

      throw conflict(
        'ANNOTATION_ID_CONFLICT',
        '该标记 ID 已被其他内容使用',
        { annotationId: input.id },
      )
    }

    if (annotationCount(database, imageId) >= 50) {
      throw conflict('ANNOTATION_LIMIT_REACHED', '每张图最多添加 50 个标记')
    }

    const number = image.next_annotation_number
    database
      .prepare(
        `INSERT INTO annotations (
          id, image_id, author_id, number, x, y, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        imageId,
        operator.id,
        number,
        input.x,
        input.y,
        input.note,
      )

    database
      .prepare(
        `UPDATE images
         SET revision = revision + 1, next_annotation_number = ?
         WHERE id = ?`,
      )
      .run(number + 1, imageId)

    const annotation = getAnnotationById(database, input.id)
    if (!annotation) {
      throw new Error('Failed to read created annotation')
    }

    return {
      annotation,
      imageRevision: image.revision + 1,
      created: true,
    }
  })
}

export function updateAnnotation(
  database: DatabaseSync,
  annotationId: string,
  operator: Operator,
  input: AnnotationUpdateInput,
): { annotation: Annotation; imageRevision: number } {
  return withImmediateTransaction(database, () => {
    const record = getAnnotationRecord(database, annotationId)
    if (!record) {
      throw notFound('ANNOTATION_NOT_FOUND', '标记不存在')
    }

    const image = getImageRecord(database, record.image_id)
    if (!image) {
      throw notFound('IMAGE_NOT_FOUND', '图片不存在')
    }

    if (record.author_id !== operator.id) {
      throw forbidden(
        'ANNOTATION_EDIT_FORBIDDEN',
        '只能修改自己创建的标记说明',
        {
          annotationId,
          authorId: record.author_id,
          operatorId: operator.id,
        },
      )
    }

    if (record.version !== input.version) {
      throw conflict(
        'ANNOTATION_CONFLICT',
        '该标记已被其他同事修改，请刷新后重试',
        {
          annotationId,
          currentVersion: record.version,
          currentNote: record.note,
          currentImageRevision: image.revision,
        },
      )
    }

    const result = database
      .prepare(
        `UPDATE annotations
         SET note = ?,
             version = version + 1,
             updated_by_id = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND version = ?`,
      )
      .run(input.note, operator.id, annotationId, input.version)

    if (result.changes !== 1) {
      throw conflict(
        'ANNOTATION_CONFLICT',
        '该标记已被其他同事修改，请刷新后重试',
        {
          annotationId,
          currentVersion: record.version,
          currentNote: record.note,
          currentImageRevision: image.revision,
        },
      )
    }

    database
      .prepare('UPDATE images SET revision = revision + 1 WHERE id = ?')
      .run(record.image_id)

    const annotation = getAnnotationById(database, annotationId)
    if (!annotation) {
      throw new Error('Failed to read updated annotation')
    }

    return {
      annotation,
      imageRevision: image.revision + 1,
    }
  })
}

export function deleteAnnotation(
  database: DatabaseSync,
  annotationId: string,
  operator: Operator,
  version: number,
): { deletedId: string; imageRevision: number } {
  return withImmediateTransaction(database, () => {
    const record = getAnnotationRecord(database, annotationId)
    if (!record) {
      throw notFound('ANNOTATION_NOT_FOUND', '标记不存在')
    }

    const image = getImageRecord(database, record.image_id)
    if (!image) {
      throw notFound('IMAGE_NOT_FOUND', '图片不存在')
    }

    if (record.author_id !== operator.id) {
      throw forbidden(
        'ANNOTATION_DELETE_FORBIDDEN',
        '只能删除自己创建的标记',
        {
          annotationId,
          authorId: record.author_id,
          operatorId: operator.id,
        },
      )
    }

    if (record.version !== version) {
      throw conflict(
        'ANNOTATION_CONFLICT',
        '该标记已被其他同事修改，请刷新后重试',
        {
          annotationId,
          currentVersion: record.version,
          currentNote: record.note,
          currentImageRevision: image.revision,
        },
      )
    }

    database
      .prepare('DELETE FROM annotations WHERE id = ? AND version = ?')
      .run(annotationId, version)
    database
      .prepare('UPDATE images SET revision = revision + 1 WHERE id = ?')
      .run(record.image_id)

    return {
      deletedId: annotationId,
      imageRevision: image.revision + 1,
    }
  })
}

export function saveBatch(
  database: DatabaseSync,
  imageId: string,
  operator: Operator,
  input: BatchInput,
): {
  imageRevision: number
  annotations: Annotation[]
  savedAt: string
  concurrentChanges: boolean
  changed: BatchChangeSet
} {
  return withImmediateTransaction(database, () => {
    const image = getImageRecord(database, imageId)
    if (!image) {
      throw notFound('IMAGE_NOT_FOUND', '图片不存在')
    }

    const observedRevision = input.observedRevision ?? input.baseRevision
    const concurrentChanges =
      observedRevision !== undefined && observedRevision !== image.revision

    const updates = input.updates.map((item) => {
      const record = getAnnotationRecord(database, item.id)
      if (!record || record.image_id !== imageId) {
        throw conflict(
          'ANNOTATION_DELETED',
          '该标记已被其他同事删除',
          {
            annotationId: item.id,
            currentImageRevision: image.revision,
          },
        )
      }
      if (record.author_id !== operator.id) {
        throw forbidden(
          'ANNOTATION_EDIT_FORBIDDEN',
          '只能修改自己创建的标记说明',
          {
            annotationId: item.id,
            authorId: record.author_id,
            operatorId: operator.id,
          },
        )
      }
      if (record.version !== item.version) {
        throw conflict(
          'ANNOTATION_CONFLICT',
          '该标记已被其他同事修改，请刷新后重试',
          {
            annotationId: item.id,
            currentVersion: record.version,
            currentNote: record.note,
            currentImageRevision: image.revision,
          },
        )
      }
      return item
    })

    const deletes = input.deletes.map((item) => {
      const record = getAnnotationRecord(database, item.id)
      if (!record || record.image_id !== imageId) {
        throw conflict(
          'ANNOTATION_DELETED',
          '该标记已被其他同事删除',
          {
            annotationId: item.id,
            currentImageRevision: image.revision,
          },
        )
      }
      if (record.author_id !== operator.id) {
        throw forbidden(
          'ANNOTATION_DELETE_FORBIDDEN',
          '只能删除自己创建的标记',
          {
            annotationId: item.id,
            authorId: record.author_id,
            operatorId: operator.id,
          },
        )
      }
      if (record.version !== item.version) {
        throw conflict(
          'ANNOTATION_CONFLICT',
          '该标记已被其他同事修改，请刷新后重试',
          {
            annotationId: item.id,
            currentVersion: record.version,
            currentNote: record.note,
            currentImageRevision: image.revision,
          },
        )
      }
      return item
    })

    const creates: AnnotationCreateInput[] = []
    for (const item of input.creates) {
      const existing = getAnnotationRecord(database, item.id)
      if (existing) {
        const isSameCreate =
          existing.image_id === imageId &&
          existing.author_id === operator.id &&
          existing.note === item.note &&
          sameCoordinates(existing.x, item.x) &&
          sameCoordinates(existing.y, item.y)

        if (isSameCreate) {
          continue
        }

        throw conflict(
          'ANNOTATION_ID_CONFLICT',
          '该标记 ID 已被其他内容使用',
          { annotationId: item.id },
        )
      }

      validateCoordinates(image, item.x, item.y)
      creates.push(item)
    }

    const currentCount = annotationCount(database, imageId)
    const finalCount = currentCount + creates.length - deletes.length
    if (finalCount > 50) {
      throw conflict('ANNOTATION_LIMIT_REACHED', '每张图最多添加 50 个标记', {
        currentCount,
        finalCount,
      })
    }

    for (const item of deletes) {
      database
        .prepare('DELETE FROM annotations WHERE id = ? AND version = ?')
        .run(item.id, item.version)
    }

    for (const item of updates) {
      database
        .prepare(
          `UPDATE annotations
           SET note = ?,
               version = version + 1,
               updated_by_id = ?,
               updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND version = ?`,
        )
        .run(item.note, operator.id, item.id, item.version)
    }

    let nextNumber = image.next_annotation_number
    for (const item of creates) {
      database
        .prepare(
          `INSERT INTO annotations (
            id, image_id, author_id, number, x, y, note
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          item.id,
          imageId,
          operator.id,
          nextNumber,
          item.x,
          item.y,
          item.note,
        )
      nextNumber += 1
    }

    const changed =
      creates.length + updates.length + deletes.length > 0

    if (changed) {
      database
        .prepare(
          `UPDATE images
           SET revision = revision + 1, next_annotation_number = ?
           WHERE id = ?`,
        )
        .run(nextNumber, imageId)
    }

    return {
      imageRevision: changed ? image.revision + 1 : image.revision,
      annotations: listAnnotations(database, imageId),
      savedAt: new Date().toISOString(),
      concurrentChanges,
      changed: {
        created: creates.map((item) => item.id),
        updated: updates.map((item) => item.id),
        deleted: deletes.map((item) => item.id),
      },
    }
  })
}
