const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const fullDateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '暂无'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '暂无' : dateTimeFormatter.format(date)
}

export function formatFullDateTime(value: string | null | undefined): string {
  if (!value) return '暂无'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '暂无'
    : fullDateTimeFormatter.format(date)
}

export function formatDimensions(width: number, height: number): string {
  return `${width.toLocaleString('zh-CN')} × ${height.toLocaleString('zh-CN')}`
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
