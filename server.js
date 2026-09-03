import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import express from 'express'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import { createServer as createViteServer } from 'vite'

import { getPool, dbConfigured, runMigrations, closePool } from './db/index.js'
import {
  findUserById,
  upsertUser,
  upsertOAuthAccount,
  getDecryptedTokens,
  updateAccountTokens,
  listUserSites,
  syncUserSites,
} from './db/users.js'
import { encryptionConfigured } from './lib/crypto.js'
import {
  oauthConfigured,
  getAuthUrl,
  exchangeCodeForTokens,
  buildAuthorizedClient,
  listAccessibleSites,
  assertAccessibleSite,
  searchAnalyticsQuery,
  getGoogleApiError,
} from './lib/google.js'
import { readRange, aggregateRows, rowItem, shiftDate, metricChanges, buildInsights } from './lib/analytics.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = Number(process.env.PORT || 4173)
const isProduction = process.env.NODE_ENV === 'production'
const sessionSecret = process.env.SESSION_SECRET || 'searchlight-local-development-secret'

// Real, persistent, multi-user mode requires all three to be configured.
const isReady = oauthConfigured && dbConfigured && encryptionConfigured
const SESSION_COOKIE = 'searchlight.sid'
const MAX_SESSION_AGE_MS = 1000 * 60 * 60 * 24 * 30

// --- Express setup --------------------------------------------------------

app.set('trust proxy', 1)
app.use(express.json({ limit: '1mb' }))

// Session store: PostgreSQL (via connect-pg-simple) when the DB is present so
// sessions survive restarts and scale across instances. InMemoryStore is only a
// boot fallback for when DATABASE_URL is unset — auth is disabled in that case.
const sessionOptions = {
  name: SESSION_COOKIE,
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: MAX_SESSION_AGE_MS,
  },
}
if (dbConfigured) {
  const PgStore = connectPgSimple(session)
  sessionOptions.store = new PgStore({
    pool: getPool(),
    tableName: 'session',
    createTableIfMissing: false, // created by db/migrations
    pruneSessionInterval: 60 * 15, // seconds
  })
} else {
  // Never used for real auth; only lets the process boot so the UI can explain
  // that PostgreSQL must be configured.
  sessionOptions.store = new session.MemoryStore()
}
app.use(session(sessionOptions))

// --- Auth helpers ---------------------------------------------------------

function redirectError(res, message) {
  return res.redirect(`/?error=${encodeURIComponent(message)}`)
}

function unauthorized(res, message = 'برای ادامه ابتدا با حساب گوگل وارد شوید.') {
  return res.status(401).json({ error: 'AUTH_REQUIRED', message })
}

/**
 * requireUser loads the current user from Postgres based only on the id held in
 * the session. Every downstream call uses this user's own decrypted tokens, so
 * data is naturally isolated per user.
 */
async function requireUser(req, res, next) {
  const userId = req.session?.userId
  if (!userId) return unauthorized(res)
  try {
    const user = await findUserById(userId)
    if (!user) {
      req.session.destroy(() => res.clearCookie(SESSION_COOKIE))
      return unauthorized(res, 'نشست شما منقضی شده است؛ دوباره وارد شوید.')
    }
    req.user = user
    return next()
  } catch (error) {
    console.error('Could not load user from the database:', error?.message || error)
    return res.status(503).json({
      error: 'DB_UNAVAILABLE',
      message: 'داده‌پایه در دسترس نیست. اتصال PostgreSQL را بررسی کنید.',
    })
  }
}

/** Builds a Google OAuth client authorized with the current user's decrypted tokens. */
async function getAuthorizedClient(req) {
  const tokens = await getDecryptedTokens(req.user.id)
  if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
    const error = new Error('توکن دسترسی گوگل این حساب در دسترس نیست؛ دوباره وارد شوید.')
    error.statusCode = 401
    throw error
  }
  return buildAuthorizedClient(tokens, (freshTokens) => {
    updateAccountTokens(req.user.id, freshTokens).catch((error) => {
      console.error('Could not persist refreshed tokens for user', req.user?.id, ':', error?.message || error)
    })
  })
}

// --- Authentication routes ------------------------------------------------

app.get('/auth/google', (req, res) => {
  if (!isReady) {
    return res.redirect('/?error=server_not_configured')
  }
  const state = crypto.randomBytes(24).toString('hex')
  req.session.oauthState = state
  return res.redirect(`${getAuthUrl()}&state=${encodeURIComponent(state)}`)
})

app.get('/auth/google/callback', async (req, res) => {
  if (!isReady) return res.redirect('/?error=server_not_configured')
  if (!req.query.code || !req.query.state || req.query.state !== req.session.oauthState) {
    return res.redirect('/?error=oauth_state')
  }

  let tokens
  let profile
  try {
    // 1) Exchange the code and read the Google profile.
    const result = await exchangeCodeForTokens(String(req.query.code))
    tokens = result.tokens
    profile = result.profile

    // 2) Upsert the user row (multi-user safe).
    const user = await upsertUser({
      googleId: profile.id,
      email: profile.email || '',
      name: profile.name || profile.email?.split('@')[0] || 'کاربر گوگل',
      picture: profile.picture || '',
    })

    // 3) Persist the (encrypted) token set keyed to this user.
    await upsertOAuthAccount({
      userId: user.id,
      googleId: profile.id,
      email: profile.email || '',
      name: profile.name || '',
      picture: profile.picture || '',
      tokens,
    })

    // 4) The session only ever stores the user id — never tokens.
    req.session.userId = user.id
    delete req.session.oauthState
    return req.session.save((error) => {
      if (error) return res.redirect('/?error=session')
      return res.redirect('/')
    })
  } catch (error) {
    console.error('Google OAuth callback failed:', getGoogleApiError(error))
    return redirectError(res, 'ورود با گوگل ناموفق بود. تنظیمات OAuth و PostgreSQL را بررسی کنید.')
  }
})

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(SESSION_COOKIE)
    res.json({ ok: true })
  })
})

app.get('/api/auth/me', async (req, res) => {
  let user = null
  if (req.session?.userId && dbConfigured) {
    try {
      user = await findUserById(req.session.userId)
    } catch (error) {
      console.error('Could not load user for /api/auth/me:', error?.message || error)
    }
  }
  res.json({
    authenticated: Boolean(user && req.session.userId),
    configured: isReady,
    demoMode: false,
    // Tell the client *why* real data is off, so it can show a helpful hint.
    missing: {
      oauth: !oauthConfigured,
      database: !dbConfigured,
      encryption: !encryptionConfigured,
    },
    user: user
      ? { id: user.id, name: user.name, email: user.email, picture: user.picture }
      : null,
  })
})

// --- Search Console data (always scoped to req.user) ----------------------

app.get('/api/sites', requireUser, async (req, res) => {
  try {
    const auth = await getAuthorizedClient(req)
    const sites = await listAccessibleSites(auth)
    // Keep each user's property list in Postgres so associations are durable.
    try {
      await syncUserSites(req.user.id, sites)
    } catch (error) {
      console.error('Could not persist user sites:', error?.message || error)
    }
    const stored = await listUserSites(req.user.id)
    const syncedAtByUrl = Object.fromEntries(stored.map((s) => [s.siteUrl, s.lastSyncedAt]))
    res.json({
      sites: sites.map((site) => ({
        ...site,
        lastSyncedAt: syncedAtByUrl[site.siteUrl] || null,
      })),
    })
  } catch (error) {
    console.error('Could not list Search Console sites:', getGoogleApiError(error))
    res.status(error?.statusCode || error?.response?.status || 502).json({
      error: 'SEARCH_CONSOLE_ERROR',
      message: getGoogleApiError(error),
    })
  }
})

app.get('/api/dashboard', requireUser, async (req, res) => {
  const siteUrl = String(req.query.siteUrl || '')
  const range = readRange(req.query)
  if (range.invalid) {
    return res.status(400).json({
      error: 'INVALID_RANGE',
      message: 'بازه‌ی زمانی باید بین ۱ تا ۹۰ روز و با ترتیب درست باشد.',
    })
  }

  try {
    const auth = await getAuthorizedClient(req)
    // Authoritative check that this property belongs to THIS user's account.
    const site = await assertAccessibleSite(auth, siteUrl)
    const previousEndDate = shiftDate(range.startDate, -1)
    const previousStartDate = shiftDate(previousEndDate, -(range.days - 1))

    const [summaryRows, trendRows, queryRows, pageRows, deviceRows, previousRows] = await Promise.all([
      searchAnalyticsQuery(auth, siteUrl, range.startDate, range.endDate),
      searchAnalyticsQuery(auth, siteUrl, range.startDate, range.endDate, ['date'], 1000),
      searchAnalyticsQuery(auth, siteUrl, range.startDate, range.endDate, ['query'], 1000),
      searchAnalyticsQuery(auth, siteUrl, range.startDate, range.endDate, ['page'], 1000),
      searchAnalyticsQuery(auth, siteUrl, range.startDate, range.endDate, ['device'], 10),
      searchAnalyticsQuery(auth, siteUrl, previousStartDate, previousEndDate),
    ])

    const summary = aggregateRows(summaryRows)
    const previousSummary = aggregateRows(previousRows)
    const topQueries = queryRows.map((row) => rowItem(row, 'query')).slice(0, 8)
    const topPages = pageRows.map((row) => ({ ...rowItem(row, 'page'), page: row.keys?.[0] || '' })).slice(0, 8)
    const devices = deviceRows
      .map((row) => ({ ...rowItem(row, 'device'), device: String(row.keys?.[0] || '').toUpperCase() }))
      .sort((a, b) => b.impressions - a.impressions)
    const trend = trendRows
      .map((row) => ({
        date: row.keys?.[0] || '',
        clicks: Number(row.clicks || 0),
        impressions: Number(row.impressions || 0),
        ctr: Number(row.ctr || 0),
        position: Number(row.position || 0),
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return res.json({
      site,
      user: { id: req.user.id, email: req.user.email },
      range: { ...range, previousStartDate, previousEndDate },
      metrics: { ...summary, changes: metricChanges(summary, previousSummary) },
      trend,
      topQueries,
      topPages,
      devices,
      insights: buildInsights(summary, topQueries, topPages, devices, previousSummary),
      fetchedAt: new Date().toISOString(),
    })
  } catch (error) {
    const status = error.statusCode || error?.response?.status || 502
    console.error('Search Console dashboard request failed:', getGoogleApiError(error))
    return res.status(status).json({
      error: status === 403 ? 'PROPERTY_NOT_ACCESSIBLE' : 'SEARCH_CONSOLE_ERROR',
      message: getGoogleApiError(error),
    })
  }
})

app.get('/health', async (_req, res) => {
  let db = 'unconfigured'
  if (dbConfigured) {
    try {
      await getPool().query('SELECT 1')
      db = 'ok'
    } catch {
      db = 'unreachable'
    }
  }
  res.json({ ok: true, db, ready: isReady })
})

// --- Boot -----------------------------------------------------------------

async function start() {
  // Apply pending DB migrations before serving traffic.
  if (dbConfigured) {
    try {
      await runMigrations()
    } catch (error) {
      console.error('[startup] PostgreSQL migration failed — aborting startup.')
      console.error(error?.message || error)
      process.exit(1)
    }
  } else {
    console.warn('[startup] DATABASE_URL is not set — multi-user/persistence is disabled.')
  }

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0' },
      appType: 'spa',
    })
    app.use(vite.middlewares)
    app.use(async (req, res, next) => {
      if (req.originalUrl.startsWith('/api/') || req.originalUrl.startsWith('/auth/')) return next()
      try {
        const url = req.originalUrl
        const fs = await import('node:fs/promises')
        const template = await vite.transformIndexHtml(url, await fs.readFile(path.resolve(__dirname, 'index.html'), 'utf-8'))
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template)
      } catch (error) {
        vite.ssrFixStacktrace(error)
        next(error)
      }
    })
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')))
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next()
      return res.sendFile(path.resolve(__dirname, 'dist', 'index.html'))
    })
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Searchlight is running on http://0.0.0.0:${port}`)
    if (!isReady) {
      console.log(
        'Real data is disabled. Required to enable: ' +
          `${oauthConfigured ? '' : 'GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI '}` +
          `${dbConfigured ? '' : 'DATABASE_URL '}` +
          `${encryptionConfigured ? '' : 'ENCRYPTION_KEY '}` +
          '(see .env.example).',
      )
    }
  })
}

start().catch((error) => {
  console.error('Server failed to start:', error?.message || error)
  process.exit(1)
})

// Graceful shutdown: close the DB pool so in-flight writes finish cleanly.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    closePool()
      .catch(() => {})
      .finally(() => process.exit(0))
  })
}
