import type {
  ApiErrorBody,
  BatchSavePayload,
  BatchSaveResponse,
  ImageDetailResponse,
  ImageListResponse,
  ImageSummary,
  SessionResponse,
} from '@/types/api'
import { readActiveOperator } from '@/lib/operatorStorage'
import { getClientId } from '@/lib/clientIdentity'

const configuredBaseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
  '/api/v1'

export const API_BASE_URL = configuredBaseUrl.replace(/\/$/, '')

export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown> | undefined
  readonly requestId: string | undefined

  constructor(options: {
    status: number
    code: string
    message: string
    details?: Record<string, unknown>
    requestId?: string
  }) {
    super(options.message)
    this.name = 'ApiRequestError'
    this.status = options.status
    this.code = options.code
    this.details = options.details
    this.requestId = options.requestId
  }
}

function endpoint(path: string): string {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const operator = readActiveOperator()

  if (operator) {
    headers.set('X-Operator-Id', operator.id)
  }
  headers.set('X-Client-Id', getClientId())

  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(endpoint(path), {
    ...init,
    headers,
  })

  if (response.status === 304) {
    return undefined as T
  }

  const text = await response.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | null
    throw new ApiRequestError({
      status: response.status,
      code: errorBody?.error?.code ?? 'REQUEST_FAILED',
      message:
        errorBody?.error?.message ??
        `请求失败（HTTP ${response.status}）`,
      ...(errorBody?.error?.details
        ? { details: errorBody.error.details }
        : {}),
      ...(errorBody?.error?.requestId
        ? { requestId: errorBody.error.requestId }
        : {}),
    })
  }

  return body as T
}

export function resolveAssetUrl(url: string): string {
  const base = API_BASE_URL.startsWith('http')
    ? API_BASE_URL
    : window.location.origin
  return new URL(url, base).toString()
}

export function createSession(displayName: string): Promise<SessionResponse> {
  return request<SessionResponse>('/session', {
    method: 'POST',
    body: JSON.stringify({ displayName }),
  })
}

export function listImages(search = ''): Promise<ImageListResponse> {
  const query = new URLSearchParams()
  if (search.trim()) {
    query.set('q', search.trim())
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  return request<ImageListResponse>(`/images${suffix}`)
}

export function getImage(imageId: string): Promise<ImageDetailResponse> {
  return request<ImageDetailResponse>(`/images/${imageId}`)
}

export async function uploadImage(
  file: File,
  title: string,
): Promise<ImageSummary> {
  const form = new FormData()
  form.append('file', file)
  if (title.trim()) {
    form.append('title', title.trim())
  }

  return request<ImageSummary>('/images', {
    method: 'POST',
    body: form,
  })
}

export function saveBatch(
  imageId: string,
  payload: BatchSavePayload,
): Promise<BatchSaveResponse> {
  return request<BatchSaveResponse>(`/images/${imageId}/annotations/batch`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
