import type { DatabaseSync } from 'node:sqlite'

import { withImmediateTransaction } from '../db/transaction.js'
import { forbidden, notFound } from '../errors.js'
import type {
  ImageRecord,
  ImageSummary,
  ImageSummaryRecord,
  Operator,
} from '../domain/types.js'

function toImageSummary(record: ImageSummaryRecord): ImageSummary {
  return {
    id: record.id,
    title: record.title,
    width: record.width,
    height: record.height,
    imageUrl: `/api/v1/images/${record.id}/content`,
    revision: record.revision,
    annotationCount: Number(record.annotation_count),
    createdAt: record.created_at,
    lastAnnotatedAt: record.last_annotated_at,
    uploadedBy:
      record.uploaded_by_id &&
      record.uploaded_by_name &&
      record.uploaded_by_color
        ? {
            id: record.uploaded_by_id,
            displayName: record.uploaded_by_name,
            color: record.uploaded_by_color,
          }
        : null,
  }
}

export function getImageRecord(
  database: DatabaseSync,
  imageId: string,
): ImageRecord | undefined {
  return database
    .prepare(
      `SELECT id, title, file_name, original_name, mime_type, byte_size,
              checksum_sha256, width, height, revision,
              next_annotation_number, created_by_id, created_at
       FROM images
       WHERE id = ?`,
    )
    .get(imageId) as ImageRecord | undefined
}

export function getImageSummary(
  database: DatabaseSync,
  imageId: string,
): ImageSummary | undefined {
  const row = database
    .prepare(
      `SELECT
         i.id,
         i.title,
         i.width,
         i.height,
         i.revision,
         i.created_at,
         (SELECT COUNT(*) FROM annotations AS a WHERE a.image_id = i.id)
           AS annotation_count,
         (SELECT MAX(a.updated_at) FROM annotations AS a WHERE a.image_id = i.id)
           AS last_annotated_at,
         u.id AS uploaded_by_id,
         u.display_name AS uploaded_by_name,
         u.color AS uploaded_by_color
       FROM images AS i
       LEFT JOIN operators AS u ON u.id = i.created_by_id
       WHERE i.id = ?`,
    )
    .get(imageId) as ImageSummaryRecord | undefined

  return row ? toImageSummary(row) : undefined
}

export function listImageSummaries(
  database: DatabaseSync,
  query: { q: string; limit: number; offset: number },
): { items: ImageSummary[]; total: number } {
  const hasSearch = query.q.length > 0
  const searchPattern = `%${query.q}%`
  const rows = database
    .prepare(
      `SELECT
         i.id,
         i.title,
         i.width,
         i.height,
         i.revision,
         i.created_at,
         (SELECT COUNT(*) FROM annotations AS a WHERE a.image_id = i.id)
           AS annotation_count,
         (SELECT MAX(a.updated_at) FROM annotations AS a WHERE a.image_id = i.id)
           AS last_annotated_at,
         u.id AS uploaded_by_id,
         u.display_name AS uploaded_by_name,
         u.color AS uploaded_by_color
       FROM images AS i
       LEFT JOIN operators AS u ON u.id = i.created_by_id
       ${hasSearch ? 'WHERE i.title LIKE ?' : ''}
       ORDER BY i.created_at DESC, i.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(
      ...(hasSearch
        ? [searchPattern, query.limit, query.offset]
        : [query.limit, query.offset]),
    ) as unknown as ImageSummaryRecord[]

  const totalRow = database
    .prepare(
      `SELECT COUNT(*) AS count
       FROM images AS i
       ${hasSearch ? 'WHERE i.title LIKE ?' : ''}`,
    )
    .get(...(hasSearch ? [searchPattern] : [])) as { count: number }

  return {
    items: rows.map(toImageSummary),
    total: Number(totalRow.count),
  }
}

export function deleteImage(
  database: DatabaseSync,
  imageId: string,
  operator: Operator,
): ImageRecord {
  return withImmediateTransaction(database, () => {
    const image = getImageRecord(database, imageId)
    if (!image) {
      throw notFound('IMAGE_NOT_FOUND', '图片不存在')
    }

    if (image.created_by_id !== operator.id) {
      throw forbidden(
        'IMAGE_DELETE_FORBIDDEN',
        '只能删除自己上传的图片',
        {
          imageId,
          uploaderId: image.created_by_id,
          operatorId: operator.id,
        },
      )
    }

    database.prepare('DELETE FROM images WHERE id = ?').run(imageId)
    return image
  })
}
