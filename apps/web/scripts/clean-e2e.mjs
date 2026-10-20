import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const dataDirectory = new URL('../../server/data/', import.meta.url)

for (const fileName of ['e2e.db', 'e2e.db-wal', 'e2e.db-shm']) {
  await rm(fileURLToPath(new URL(fileName, dataDirectory)), {
    force: true,
  })
}

await rm(
  fileURLToPath(new URL('e2e-uploads', dataDirectory)),
  { recursive: true, force: true },
)
