import type { FastifyReply, FastifyRequest } from 'fastify'

import { ApiError } from '../errors.js'
import { operatorIdSchema } from './validation.js'
import { findOperatorById } from '../services/operators.js'

export async function requireOperator(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const header = request.headers['x-operator-id']
  const rawOperatorId = Array.isArray(header) ? header[0] : header
  const parsed = operatorIdSchema.safeParse(rawOperatorId)

  if (!parsed.success) {
    throw new ApiError(
      400,
      'OPERATOR_REQUIRED',
      '请先输入姓名并获取操作人身份',
    )
  }

  const operator = findOperatorById(request.server.db, parsed.data)
  if (!operator) {
    throw new ApiError(
      400,
      'OPERATOR_REQUIRED',
      '操作人身份已失效，请重新输入姓名',
    )
  }

  request.operator = operator
}
