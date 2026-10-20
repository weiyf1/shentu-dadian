import type { DatabaseSync } from 'node:sqlite'

export function withImmediateTransaction<T>(
  database: DatabaseSync,
  operation: () => T,
): T {
  database.exec('BEGIN IMMEDIATE')

  try {
    const result = operation()
    database.exec('COMMIT')
    return result
  } catch (error) {
    try {
      database.exec('ROLLBACK')
    } catch {
      // Preserve the original error if SQLite already rolled back.
    }
    throw error
  }
}
