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
  uploadedBy: {
    id: string
    displayName: string
    color: string
  } | null
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

export interface ImageRecord {
  id: string
  title: string
  file_name: string
  original_name: string | null
  mime_type: string
  byte_size: number
  checksum_sha256: string | null
  width: number
  height: number
  revision: number
  next_annotation_number: number
  created_by_id: string | null
  created_at: string
}

export interface ImageSummaryRecord {
  id: string
  title: string
  width: number
  height: number
  revision: number
  annotation_count: number
  created_at: string
  last_annotated_at: string | null
  uploaded_by_id: string | null
  uploaded_by_name: string | null
  uploaded_by_color: string | null
}

export interface AnnotationRecord {
  id: string
  image_id: string
  author_id: string
  updated_by_id: string | null
  number: number
  x: number
  y: number
  note: string
  version: number
  created_at: string
  updated_at: string
}

export interface AnnotationViewRecord extends AnnotationRecord {
  author_name: string
  author_color: string
}
