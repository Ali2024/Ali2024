import 'dotenv/config'
import { getPool, dbConfigured, closePool, connectionString } from '../db/index.js'
import { encryptionConfigured, getKey } from '../lib/crypto.js'
import { oauthConfigured } from '../lib/google.js'

// Diagnostic helper: `npm run db:check`
// Prints whether PostgreSQL, the encryption key and Google OAuth are ready.

async function main() {
  console.log('=== Searchlight configuration check ===')
  console.log(`DATABASE_URL set           : ${dbConfigured ? 'yes' : 'no'}`)
  if (dbConfigured) {
    try {
      const { rows } = await getPool().query(
        "SELECT current_database() AS db, version() AS version, (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM schema_migrations)::int AS migrations",
      )
      console.log(`PostgreSQL reachable        : yes`)
      console.log(`Database                    : ${rows[0]?.db}`)
      console.log(`Users in DB                 : ${rows[0]?.users}`)
      console.log(`Migrations applied          : ${rows[0]?.migrations}`)
    } catch (error) {
      console.log(`PostgreSQL reachable        : NO (${error?.message || error})`)
    }
  } else {
    console.log(`Connection string expected  : ${connectionString} (set DATABASE_URL to enable)`)
  }
  console.log(`ENCRYPTION_KEY set          : ${encryptionConfigured ? 'yes' : 'no'}`)
  if (encryptionConfigured) {
    try {
      getKey()
      console.log(`AES-256 key valid           : yes`)
    } catch (error) {
      console.log(`AES-256 key valid           : NO (${error?.message || error})`)
    }
  }
  console.log(`Google OAuth configured     : ${oauthConfigured ? 'yes' : 'no'}`)
  console.log(`READY for real multi-user   : ${dbConfigured && encryptionConfigured && oauthConfigured ? 'yes' : 'no'}`)
  await closePool().catch(() => {})
}

main().catch((error) => {
  console.error('[db:check]', error?.message || error)
  process.exit(1)
})
