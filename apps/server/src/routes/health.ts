import type { FastifyInstance } from 'fastify'

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => {
    const databaseResult = app.db
      .prepare('SELECT COUNT(*) AS count FROM schema_migrations')
      .get() as { count: number } | undefined

    return {
      status: 'ok',
      database: {
        connected: databaseResult !== undefined,
        migrationCount: databaseResult?.count ?? 0,
      },
      timestamp: new Date().toISOString(),
    }
  })
}
