import type { Operator } from '@/types/api'

const OPERATOR_STORAGE_KEY = 'shentu.operator'

function isOperator(value: unknown): value is Operator {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.displayName === 'string' &&
    typeof candidate.color === 'string' &&
    typeof candidate.createdAt === 'string'
  )
}

export function readStoredOperator(): Operator | null {
  try {
    const raw = localStorage.getItem(OPERATOR_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isOperator(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeStoredOperator(operator: Operator): void {
  localStorage.setItem(OPERATOR_STORAGE_KEY, JSON.stringify(operator))
}

export function clearStoredOperator(): void {
  localStorage.removeItem(OPERATOR_STORAGE_KEY)
}
