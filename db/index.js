import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const defaultConnectionString = 'postgres://searchlight:searchlight@localhost:5432/searchlight'

// A running PostgreSQL is mandatory for real multi-user mode. When DATABASE_URL
// is absent the app still boots but reports itself as "not configured" so the
// UI clearly explains what to set, instead of silently losing sessions or
// tokens across requests.
export const connectionString = process.env.DATABASE_URL || defaultConnectionString
export const dbConfigured = Boolean(process.env.DATABASE_URL)

let _pool = null

export function getPool() {
  if (!dbConfigured) {
    throw new Error(
      'PostgreSQL is not configured. Set DATABASE_URL in your environment (see .env.example).',
    )
  }
  if (!_pool) {
    _pool = new pg.Pool({ connectionString })
    // Avoid crashing the whole process on an idle client / connection issue;
    // request handlers surface connection errors themselves.
    _pool.on('error', (error) => {
      console.error('[db] unexpected error on idle PostgreSQL client:', error?.message || error)
    })
  }
  return _pool
}

export async function closePool() {
  if (!_pool) return
  await _pool.end().catch(() => {})
  _pool = null
}

const migrationsDir = path.join(__dirname, 'migrations')

/**
 * Applies every *.sql file under db/migrations (sorted) that has not yet been
 * applied, tracking them in a `schema_migrations` table so it is idempotent.
 * Called automatically at server boot and by `npm run db:migrate`.
 */
export async function runMigrations() {
  const pool = getPool()
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (' +
      'id SERIAL PRIMARY KEY, ' +
      'name TEXT NOT NULL UNIQUE, ' +
      'applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
  )

  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const existing = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file])
    if (existing.rowCount) continue

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
      await client.query('COMMIT')
      console.log(`[db] applied migration ${file}`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw new Error(`Migration "${file}" failed: ${error?.message || error}`)
    } finally {
      client.release()
    }
  }
}
