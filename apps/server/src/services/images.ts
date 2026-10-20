import type { DatabaseSync } from 'node:sqlite'

import type {
  ImageRecord,
  ImageSummary,
  ImageSummaryRecord,
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
           AS last_annotated_at
       FROM images AS i
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
           AS last_annotated_at
       FROM images AS i
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
