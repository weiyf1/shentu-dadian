import type { DatabaseSync } from 'node:sqlite'

interface Migration {
  version: number
  name: string
  sql: string
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
      CREATE TABLE operators (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        color TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      CREATE TABLE images (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        file_name TEXT NOT NULL UNIQUE,
        width INTEGER NOT NULL CHECK (width > 0),
        height INTEGER NOT NULL CHECK (height > 0),
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      CREATE TABLE annotations (
        id TEXT PRIMARY KEY,
        image_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
        author_id TEXT NOT NULL REFERENCES operators(id) ON DELETE RESTRICT,
        x REAL NOT NULL CHECK (x >= 0),
        y REAL NOT NULL CHECK (y >= 0),
        note TEXT NOT NULL CHECK (length(trim(note)) BETWEEN 1 AND 200),
        version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      CREATE INDEX annotations_by_image_created
        ON annotations(image_id, created_at);
    `,
  },
  {
    version: 2,
    name: 'annotation_numbers_and_image_metadata',
    sql: `
      CREATE TABLE images_v2 (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 80),
        file_name TEXT NOT NULL UNIQUE,
        original_name TEXT,
        mime_type TEXT NOT NULL CHECK (
          mime_type IN ('image/jpeg', 'image/png', 'image/webp')
        ),
        byte_size INTEGER NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
        checksum_sha256 TEXT CHECK (
          checksum_sha256 IS NULL OR length(checksum_sha256) = 64
        ),
        width INTEGER NOT NULL CHECK (width > 0),
        height INTEGER NOT NULL CHECK (height > 0),
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
        next_annotation_number INTEGER NOT NULL DEFAULT 1
          CHECK (next_annotation_number > 0),
        created_by_id TEXT REFERENCES operators(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ) STRICT;

      INSERT INTO images_v2 (
        id, title, file_name, original_name, mime_type, byte_size,
        checksum_sha256, width, height, revision,
        next_annotation_number, created_by_id, created_at
      )
      SELECT
        id, title, file_name, NULL, 'image/jpeg', 0,
        NULL, width, height, revision, 1, NULL, created_at
      FROM images;

      CREATE TABLE annotations_v2 (
        id TEXT PRIMARY KEY,
        image_id TEXT NOT NULL REFERENCES images_v2(id) ON DELETE CASCADE,
        author_id TEXT NOT NULL REFERENCES operators(id) ON DELETE RESTRICT,
        updated_by_id TEXT REFERENCES operators(id) ON DELETE SET NULL,
        number INTEGER NOT NULL CHECK (number > 0),
        x REAL NOT NULL CHECK (x >= 0),
        y REAL NOT NULL CHECK (y >= 0),
        note TEXT NOT NULL CHECK (length(trim(note)) BETWEEN 1 AND 200),
        version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (image_id, number)
      ) STRICT;

      INSERT INTO annotations_v2 (
        id, image_id, author_id, updated_by_id, number,
        x, y, note, version, created_at, updated_at
      )
      SELECT
        id, image_id, author_id, NULL,
        ROW_NUMBER() OVER (PARTITION BY image_id ORDER BY created_at, id),
        x, y, note, version, created_at, updated_at
      FROM annotations;

      UPDATE images_v2
      SET next_annotation_number = COALESCE(
        (SELECT MAX(number) + 1 FROM annotations_v2 WHERE image_id = images_v2.id),
        1
      );

      DROP TABLE annotations;
      DROP TABLE images;

      ALTER TABLE images_v2 RENAME TO images;
      ALTER TABLE annotations_v2 RENAME TO annotations;

      CREATE INDEX images_by_created_at ON images(created_at);
      CREATE INDEX annotations_by_image_created ON annotations(image_id, created_at);
      CREATE INDEX annotations_by_image_updated ON annotations(image_id, updated_at);
      CREATE INDEX annotations_by_author ON annotations(author_id, created_at);

      CREATE TRIGGER annotations_bounds_insert
      BEFORE INSERT ON annotations
      FOR EACH ROW
      BEGIN
        SELECT CASE
          WHEN NEW.x < 0 OR NEW.y < 0
            OR NEW.x >= (SELECT width FROM images WHERE id = NEW.image_id)
            OR NEW.y >= (SELECT height FROM images WHERE id = NEW.image_id)
          THEN RAISE(ABORT, 'annotation_out_of_bounds')
        END;
      END;

      CREATE TRIGGER annotations_bounds_update
      BEFORE UPDATE OF x, y ON annotations
      FOR EACH ROW
      BEGIN
        SELECT CASE
          WHEN NEW.x < 0 OR NEW.y < 0
            OR NEW.x >= (SELECT width FROM images WHERE id = NEW.image_id)
            OR NEW.y >= (SELECT height FROM images WHERE id = NEW.image_id)
          THEN RAISE(ABORT, 'annotation_out_of_bounds')
        END;
      END;

      CREATE TRIGGER annotations_position_immutable
      BEFORE UPDATE OF x, y ON annotations
      FOR EACH ROW
      WHEN NEW.x <> OLD.x OR NEW.y <> OLD.y
      BEGIN
        SELECT RAISE(ABORT, 'annotation_position_immutable');
      END;
    `,
  },
]

export function migrate(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ) STRICT;
  `)

  const appliedRows = database
    .prepare('SELECT version FROM schema_migrations')
    .all() as Array<{ version: number }>
  const appliedVersions = new Set(appliedRows.map((row) => row.version))

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) {
      continue
    }

    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(migration.sql)
      database
        .prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
        .run(migration.version, migration.name)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  }
}
