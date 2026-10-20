import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

import type { Operator } from '../domain/types.js'

interface OperatorRecord {
  id: string
  display_name: string
  color: string
  created_at: string
}

const OPERATOR_COLORS = [
  '#2563EB',
  '#059669',
  '#D97706',
  '#7C3AED',
  '#DB2777',
  '#0891B2',
]

function toOperator(record: OperatorRecord): Operator {
  return {
    id: record.id,
    displayName: record.display_name,
    color: record.color,
    createdAt: record.created_at,
  }
}

function colorForName(displayName: string): string {
  const hash = Array.from(displayName).reduce(
    (total, character) => total + (character.codePointAt(0) ?? 0),
    0,
  )
  return OPERATOR_COLORS[hash % OPERATOR_COLORS.length] ?? OPERATOR_COLORS[0]!
}

export function findOperatorById(
  database: DatabaseSync,
  operatorId: string,
): Operator | undefined {
  const row = database
    .prepare(
      'SELECT id, display_name, color, created_at FROM operators WHERE id = ?',
    )
    .get(operatorId) as OperatorRecord | undefined

  return row ? toOperator(row) : undefined
}

export function resolveOperator(
  database: DatabaseSync,
  displayName: string,
): { operator: Operator; created: boolean } {
  const candidate: OperatorRecord = {
    id: randomUUID(),
    display_name: displayName,
    color: colorForName(displayName),
    created_at: new Date().toISOString(),
  }

  const result = database
    .prepare(
      `INSERT OR IGNORE INTO operators (id, display_name, color, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .run(
      candidate.id,
      candidate.display_name,
      candidate.color,
      candidate.created_at,
    )

  const row = database
    .prepare(
      `SELECT id, display_name, color, created_at
       FROM operators
       WHERE display_name = ? COLLATE NOCASE`,
    )
    .get(displayName) as OperatorRecord | undefined

  if (!row) {
    throw new Error('Failed to resolve operator')
  }

  return {
    operator: toOperator(row),
    created: result.changes === 1,
  }
}
