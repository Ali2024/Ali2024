import 'dotenv/config'
import { runMigrations, closePool, getPool } from '../db/index.js'

// Standalone migration runner: `npm run db:migrate`
// Applies db/migrations/*.sql that have not run yet and exits.
// The same runner is invoked automatically on `npm run dev` / `npm start`.

async function main() {
  await runMigrations()
  const { rows } = await getPool().query(
    'SELECT name, applied_at FROM schema_migrations ORDER BY applied_at DESC',
  )
  console.log('Applied migrations:')
  for (const row of rows) console.log(`  - ${row.name} (${row.applied_at?.toISOString?.() || row.applied_at})`)
  await closePool()
}

main().catch((error) => {
  console.error('[db:migrate]', error?.message || error)
  process.exit(1)
})
