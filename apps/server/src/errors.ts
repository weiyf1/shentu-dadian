export class ApiError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details: Record<string, unknown> | undefined

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export function badRequest(
  message: string,
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError(400, 'VALIDATION_ERROR', message, details)
}

export function notFound(code: string, message: string): ApiError {
  return new ApiError(404, code, message)
}

export function conflict(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError(409, code, message, details)
}
