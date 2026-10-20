export interface Operator {
  id: string
  displayName: string
  color: string
  createdAt: string
}

export interface ImageSummary {
  id: string
  title: string
  width: number
  height: number
  imageUrl: string
  revision: number
  annotationCount: number
  createdAt: string
  lastAnnotatedAt: string | null
}

export interface Annotation {
  id: string
  number: number
  x: number
  y: number
  note: string
  author: {
    id: string
    displayName: string
    color: string
  }
  version: number
  createdAt: string
  updatedAt: string
}

export interface LocalAnnotation extends Annotation {
  isNew?: boolean
}

export interface ImageListResponse {
  items: ImageSummary[]
  total: number
}

export interface ImageDetailResponse {
  image: ImageSummary
  annotations: Annotation[]
}

export interface SessionResponse {
  operator: Operator
  created: boolean
}

export interface BatchCreate {
  id: string
  x: number
  y: number
  note: string
}

export interface BatchUpdate {
  id: string
  version: number
  note: string
}

export interface BatchDelete {
  id: string
  version: number
}

export interface BatchSavePayload {
  baseRevision: number
  creates: BatchCreate[]
  updates: BatchUpdate[]
  deletes: BatchDelete[]
}

export interface BatchSaveResponse {
  imageRevision: number
  annotations: Annotation[]
  savedAt: string
}

export interface ApiErrorBody {
  error?: {
    code?: string
    message?: string
    requestId?: string
    details?: Record<string, unknown>
  }
}
