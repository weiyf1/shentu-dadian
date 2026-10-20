import { z, type ZodType } from 'zod'

import { badRequest } from '../errors.js'

export function parseInput<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)

  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }))
    throw badRequest('请求参数不合法', { fields })
  }

  return parsed.data
}

export function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100
}

export const uuidSchema = z.string().uuid('必须是有效的 UUID')

export const operatorIdSchema = z.string().uuid('操作人 ID 不合法')

export const sessionSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, '姓名不能为空')
    .max(30, '姓名不能超过 30 字'),
})

export const imageParamsSchema = z.object({
  imageId: uuidSchema,
})

export const annotationParamsSchema = z.object({
  annotationId: uuidSchema,
})

export const imageListQuerySchema = z.object({
  q: z.string().trim().max(50, '搜索词不能超过 50 字').default(''),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

const noteSchema = z
  .string()
  .trim()
  .min(1, '说明不能为空')
  .max(200, '说明不能超过 200 字')

const coordinateSchema = z
  .number()
  .finite('坐标必须是有限数值')
  .min(0, '坐标不能小于 0')
  .transform(roundCoordinate)

export const createAnnotationSchema = z.object({
  id: uuidSchema,
  x: coordinateSchema,
  y: coordinateSchema,
  note: noteSchema,
})

export const updateAnnotationSchema = z.object({
  note: noteSchema,
  version: z.number().int().positive(),
})

export const deleteAnnotationQuerySchema = z.object({
  version: z.coerce.number().int().positive(),
})

const batchCreateSchema = createAnnotationSchema
const batchUpdateSchema = z.object({
  id: uuidSchema,
  version: z.number().int().positive(),
  note: noteSchema,
})
const batchDeleteSchema = z.object({
  id: uuidSchema,
  version: z.number().int().positive(),
})

export const batchSaveSchema = z
  .object({
    baseRevision: z.number().int().positive().optional(),
    observedRevision: z.number().int().positive().optional(),
    creates: z.array(batchCreateSchema).default([]),
    updates: z.array(batchUpdateSchema).default([]),
    deletes: z.array(batchDeleteSchema).default([]),
  })
  .superRefine((value, context) => {
    const allIds = [
      ...value.creates.map((item) => item.id),
      ...value.updates.map((item) => item.id),
      ...value.deletes.map((item) => item.id),
    ]

    if (allIds.length === 0) {
      context.addIssue({
        code: 'custom',
        path: [],
        message: '至少需要一项标记变更',
      })
    }

    if (allIds.length > 50) {
      context.addIssue({
        code: 'custom',
        path: [],
        message: '单次最多提交 50 项变更',
      })
    }

    if (new Set(allIds).size !== allIds.length) {
      context.addIssue({
        code: 'custom',
        path: [],
        message: '同一个标记 ID 不能出现在多个变更集合中',
      })
    }
  })
