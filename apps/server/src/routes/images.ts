import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { writeFile, unlink } from 'node:fs/promises'
import { basename, extname, isAbsolute, relative, resolve } from 'node:path'

import type { FastifyInstance } from 'fastify'
import sharp, { type Metadata } from 'sharp'

import { ApiError, badRequest, notFound } from '../errors.js'
import {
  imageListQuerySchema,
  imageParamsSchema,
  parseInput,
} from '../http/validation.js'
import { requireOperator } from '../http/operator.js'
import { listAnnotations } from '../services/annotations.js'
import {
  getImageRecord,
  getImageSummary,
  listImageSummaries,
} from '../services/images.js'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const IMAGE_FORMATS = {
  jpeg: { mimeType: 'image/jpeg', extension: 'jpg' },
  png: { mimeType: 'image/png', extension: 'png' },
  webp: { mimeType: 'image/webp', extension: 'webp' },
} as const

type SupportedFormat = keyof typeof IMAGE_FORMATS

function isSupportedFormat(format: string | undefined): format is SupportedFormat {
  return format !== undefined && format in IMAGE_FORMATS
}

function safeTitleFromFilename(filename: string): string {
  const base = basename(filename, extname(filename)).trim()
  return (base || '未命名图片').slice(0, 80)
}

function resolveUploadPath(uploadsDir: string, fileName: string): string {
  const path = resolve(uploadsDir, fileName)
  const pathFromUploads = relative(uploadsDir, path)

  if (pathFromUploads.startsWith('..') || isAbsolute(pathFromUploads)) {
    throw new Error('Invalid upload path')
  }

  return path
}

export async function imageRoutes(
  app: FastifyInstance,
  uploadsDir: string,
): Promise<void> {
  app.get('/api/v1/images', async (request) => {
    const query = parseInput(imageListQuerySchema, request.query)
    return listImageSummaries(app.db, query)
  })

  app.post(
    '/api/v1/images',
    { preHandler: requireOperator },
    async (request, reply) => {
      let fileBuffer: Buffer | undefined
      let originalName = 'upload'
      let declaredMimeType = ''
      let titleField: string | undefined

      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (part.fieldname !== 'file' || fileBuffer !== undefined) {
            part.file.resume()
            continue
          }

          fileBuffer = await part.toBuffer()
          originalName = part.filename || 'upload'
          declaredMimeType = part.mimetype
        } else if (part.fieldname === 'title') {
          titleField = String(part.value)
        }
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        throw badRequest('请选择要上传的图片文件')
      }

      if (fileBuffer.length > MAX_IMAGE_BYTES) {
        throw new ApiError(413, 'IMAGE_TOO_LARGE', '图片不能超过 10 MB')
      }

      let metadata: Metadata
      try {
        metadata = await sharp(fileBuffer, { failOn: 'error' }).metadata()
      } catch {
        throw new ApiError(
          415,
          'UNSUPPORTED_IMAGE_TYPE',
          '文件不是有效的 JPG、PNG 或 WebP 图片',
        )
      }

      if (!isSupportedFormat(metadata.format)) {
        throw new ApiError(
          415,
          'UNSUPPORTED_IMAGE_TYPE',
          '只支持 JPG、PNG 或 WebP 图片',
        )
      }

      const formatInfo = IMAGE_FORMATS[metadata.format]
      const normalizedDeclaredMimeType =
        declaredMimeType === 'image/jpg' ? 'image/jpeg' : declaredMimeType
      if (
        normalizedDeclaredMimeType.startsWith('image/') &&
        normalizedDeclaredMimeType !== formatInfo.mimeType
      ) {
        throw new ApiError(
          415,
          'UNSUPPORTED_IMAGE_TYPE',
          '文件类型与图片内容不一致',
        )
      }

      let pipeline = sharp(fileBuffer, { failOn: 'error' }).rotate()
      if (metadata.format === 'jpeg') {
        pipeline = pipeline.jpeg({ quality: 90 })
      } else if (metadata.format === 'png') {
        pipeline = pipeline.png({ compressionLevel: 9 })
      } else {
        pipeline = pipeline.webp({ quality: 90 })
      }

      const normalized = await pipeline.toBuffer({ resolveWithObject: true })
      const imageId = randomUUID()
      const fileName = `${imageId}.${formatInfo.extension}`
      const filePath = resolveUploadPath(uploadsDir, fileName)

      let title: string
      if (titleField !== undefined) {
        title = titleField.trim()
        if (title.length === 0 || title.length > 80) {
          throw badRequest('图片标题长度必须为 1～80 字')
        }
      } else {
        title = safeTitleFromFilename(originalName)
      }

      const checksum = createHash('sha256')
        .update(normalized.data)
        .digest('hex')

      await writeFile(filePath, normalized.data, { flag: 'wx' })

      try {
        app.db
          .prepare(
            `INSERT INTO images (
              id, title, file_name, original_name, mime_type, byte_size,
              checksum_sha256, width, height, created_by_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            imageId,
            title,
            fileName,
            basename(originalName).slice(0, 255),
            formatInfo.mimeType,
            normalized.data.length,
            checksum,
            normalized.info.width,
            normalized.info.height,
            request.operator!.id,
          )
      } catch (error) {
        await unlink(filePath).catch(() => undefined)
        throw error
      }

      const summary = getImageSummary(app.db, imageId)
      if (!summary) {
        throw new Error('Failed to read uploaded image')
      }

      return reply.code(201).send(summary)
    },
  )

  app.get('/api/v1/images/:imageId', async (request, reply) => {
    const { imageId } = parseInput(imageParamsSchema, request.params)
    const image = getImageSummary(app.db, imageId)
    if (!image) {
      throw notFound('IMAGE_NOT_FOUND', '图片不存在')
    }

    return reply.send({
      image,
      annotations: listAnnotations(app.db, imageId),
    })
  })

  app.get('/api/v1/images/:imageId/content', async (request, reply) => {
    const { imageId } = parseInput(imageParamsSchema, request.params)
    const image = getImageRecord(app.db, imageId)
    if (!image) {
      throw notFound('IMAGE_NOT_FOUND', '图片不存在')
    }

    const filePath = resolveUploadPath(uploadsDir, image.file_name)
    if (!existsSync(filePath)) {
      throw notFound('IMAGE_NOT_FOUND', '图片文件不存在')
    }

    const etag = `"${image.checksum_sha256 ?? image.id}"`
    const ifNoneMatch = request.headers['if-none-match']

    if (
      ifNoneMatch === '*' ||
      (typeof ifNoneMatch === 'string' &&
        ifNoneMatch
          .split(',')
          .map((value) => value.trim())
          .includes(etag))
    ) {
      return reply.code(304).send()
    }

    return reply
      .header('Content-Type', image.mime_type)
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .header('ETag', etag)
      .send(createReadStream(filePath))
  })
}
