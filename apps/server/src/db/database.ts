import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { migrate } from './migrations.js'

export function openDatabase(databasePath: string): DatabaseSync {
  const resolvedPath =
    databasePath === ':memory:' ? databasePath : resolve(databasePath)

  if (resolvedPath !== ':memory:') {
    mkdirSync(dirname(resolvedPath), { recursive: true })
  }

  const database = new DatabaseSync(resolvedPath)
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
  `)
  migrate(database)

  return database
}
