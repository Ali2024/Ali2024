import { getPool } from './index.js'
import { openTokens, sealTokens } from '../lib/crypto.js'

/**
 * Thin data-access helpers for the user / oauth_account / user_sites tables.
 * All "sites" logic stays scoped to the authenticated user_id; nothing here
 * can read another user's rows because every query filters by user_id.
 */

export async function findUserByGoogleId(googleId) {
  const { rows } = await getPool().query('SELECT * FROM users WHERE google_id = $1', [googleId])
  return rows[0] || null
}

export async function findUserByEmail(email) {
  const { rows } = await getPool().query('SELECT * FROM users WHERE email = $1', [String(email).toLowerCase()])
  return rows[0] || null
}

export async function findUserById(id) {
  const { rows } = await getPool().query('SELECT * FROM users WHERE id = $1', [id])
  return rows[0] || null
}

/** Upserts the Google profile and returns the stable user id. */
export async function upsertUser({ googleId, email, name, picture }) {
  const pool = getPool()
  const normalizedEmail = String(email || '').toLowerCase()
  const { rows } = await pool.query(
    `INSERT INTO users (google_id, email, name, picture)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (google_id) DO UPDATE SET
       email = EXCLUDED.email,
       name = EXCLUDED.name,
       picture = EXCLUDED.picture,
       updated_at = now()
     RETURNING *`,
    [googleId, normalizedEmail, name || '', picture || ''],
  )
  return rows[0]
}

export async function findAccountByUserId(userId) {
  const { rows } = await getPool().query('SELECT * FROM oauth_accounts WHERE user_id = $1', [userId])
  return rows[0] || null
}

/** Persists the (encrypted) Google token set for a user. */
export async function upsertOAuthAccount({ userId, googleId, email, name, picture, tokens }) {
  const pool = getPool()
  const encrypted = sealTokens(tokens || {})
  const accessToken = tokens?.access_token ? sealTokens({ value: tokens.access_token }) : ''
  const expiresAt = tokens?.expiry_date
    ? new Date(Number(tokens.expiry_date))
    : tokens?.expires_in
      ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
      : null

  const { rows } = await pool.query(
    `INSERT INTO oauth_accounts
       (user_id, google_id, email, name, picture, refresh_token_enc, access_token_enc,
        access_expires_at, scope, last_login_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (user_id) DO UPDATE SET
       google_id = EXCLUDED.google_id,
       email = EXCLUDED.email,
       name = EXCLUDED.name,
       picture = EXCLUDED.picture,
       refresh_token_enc = EXCLUDED.refresh_token_enc,
       access_token_enc = EXCLUDED.access_token_enc,
       access_expires_at = EXCLUDED.access_expires_at,
       scope = EXCLUDED.scope,
       last_login_at = now()`,
    [
      userId,
      googleId,
      String(email || '').toLowerCase(),
      name || '',
      picture || '',
      encrypted,           // whole token payload (incl. refresh_token), sealed
      accessToken,         // access token stored sealed too (paranoia, unused directly)
      expiresAt,
      tokens?.scope || '',
    ],
  )
  return rows[0]
}

/** Updates an account after Google silently refreshes the access token. */
export async function updateAccountTokens(userId, tokens) {
  if (!userId || !tokens) return
  const current = await findAccountByUserId(userId)
  // Merge so we don't lose the refresh_token if a refresh response omits it.
  const merged = { ...(current ? openTokens(current.refresh_token_enc) || {} : {}), ...tokens }
  await upsertOAuthAccount({
    userId,
    googleId: current?.google_id,
    email: current?.email,
    name: current?.name,
    picture: current?.picture,
    tokens: merged,
  })
}

/** Decrypts the current token set for the user (used to authorize Google calls). */
export async function getDecryptedTokens(userId) {
  const account = await findAccountByUserId(userId)
  if (!account) return null
  const tokens = openTokens(account.refresh_token_enc)
  return tokens && Object.keys(tokens).length ? tokens : null
}

// --- user_sites -----------------------------------------------------------

export async function listUserSites(userId) {
  const { rows } = await getPool().query(
    `SELECT site_url AS "siteUrl", permission_level AS "permissionLevel",
            last_synced_at AS "lastSyncedAt"
       FROM user_sites WHERE user_id = $1 ORDER BY site_url`,
    [userId],
  )
  return rows
}

export async function syncUserSites(userId, sites) {
  if (!sites || !sites.length) return
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Remove associations the account no longer has, keeping fresh records.
    await client.query('DELETE FROM user_sites WHERE user_id = $1', [userId])
    for (const site of sites) {
      await client.query(
        `INSERT INTO user_sites (user_id, site_url, permission_level)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, site_url) DO UPDATE SET
           permission_level = EXCLUDED.permission_level,
           last_synced_at = now()`,
        [userId, site.siteUrl, site.permissionLevel || 'Unknown'],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function isUserSite(userId, siteUrl) {
  const { rows } = await getPool().query(
    'SELECT 1 FROM user_sites WHERE user_id = $1 AND site_url = $2',
    [userId, siteUrl],
  )
  return rows.length > 0
}
