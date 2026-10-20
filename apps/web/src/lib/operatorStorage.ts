import type { Operator } from '@/types/api'

const LEGACY_OPERATOR_KEY = 'shentu.operator'
export const OPERATOR_DIRECTORY_KEY = 'shentu.operators.v2'
const ACTIVE_OPERATOR_KEY = 'shentu.activeOperator.v3'
const LEGACY_ACTIVE_OPERATOR_KEY = 'shentu.activeOperatorId.v2'

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

export function readOperatorDirectory(): Operator[] {
  try {
    const raw = localStorage.getItem(OPERATOR_DIRECTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed.filter(isOperator)
  } catch {
    return []
  }
}

export function saveOperatorToDirectory(operator: Operator): Operator[] {
  const operators = readOperatorDirectory()
  const next = [
    ...operators.filter((item) => item.id !== operator.id),
    operator,
  ]
  localStorage.setItem(OPERATOR_DIRECTORY_KEY, JSON.stringify(next))
  return next
}

export function removeOperatorFromDirectory(operatorId: string): Operator[] {
  const next = readOperatorDirectory().filter(
    (operator) => operator.id !== operatorId,
  )
  localStorage.setItem(OPERATOR_DIRECTORY_KEY, JSON.stringify(next))
  return next
}

export function writeActiveOperator(operator: Operator): void {
  sessionStorage.setItem(ACTIVE_OPERATOR_KEY, JSON.stringify(operator))
  saveOperatorToDirectory(operator)
}

export function clearActiveOperator(): void {
  sessionStorage.removeItem(ACTIVE_OPERATOR_KEY)
  sessionStorage.removeItem(LEGACY_ACTIVE_OPERATOR_KEY)
}

export function readActiveOperator(): Operator | null {
  try {
    const activeRaw = sessionStorage.getItem(ACTIVE_OPERATOR_KEY)
    if (activeRaw) {
      const parsed: unknown = JSON.parse(activeRaw)
      if (isOperator(parsed)) return parsed
    }

    const legacyActiveId = sessionStorage.getItem(
      LEGACY_ACTIVE_OPERATOR_KEY,
    )
    if (legacyActiveId) {
      const operator = readOperatorDirectory().find(
        (item) => item.id === legacyActiveId,
      )
      if (operator) {
        sessionStorage.setItem(
          ACTIVE_OPERATOR_KEY,
          JSON.stringify(operator),
        )
        sessionStorage.removeItem(LEGACY_ACTIVE_OPERATOR_KEY)
        return operator
      }
    }

    const legacyRaw = localStorage.getItem(LEGACY_OPERATOR_KEY)
    if (legacyRaw) {
      const parsed: unknown = JSON.parse(legacyRaw)
      if (isOperator(parsed)) {
        sessionStorage.setItem(
          ACTIVE_OPERATOR_KEY,
          JSON.stringify(parsed),
        )
        saveOperatorToDirectory(parsed)
        localStorage.removeItem(LEGACY_OPERATOR_KEY)
        return parsed
      }
      localStorage.removeItem(LEGACY_OPERATOR_KEY)
    }

    return null
  } catch {
    return null
  }
}
