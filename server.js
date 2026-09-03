import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import express from 'express'
import session from 'express-session'
import { google } from 'googleapis'
import { createServer as createViteServer } from 'vite'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = Number(process.env.PORT || 4173)
const isProduction = process.env.NODE_ENV === 'production'
const isConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI,
)
const demoMode = process.env.DEMO_MODE === 'true'
const sessionSecret = process.env.SESSION_SECRET || 'searchlight-local-development-secret'

app.set('trust proxy', 1)
app.use(express.json({ limit: '1mb' }))
app.use(
  session({
    name: 'searchlight.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 24 * 14,
    },
  }),
)

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  )
}

function getAuthUrl() {
  const oauth2Client = createOAuthClient()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/webmasters.readonly',
    ],
  })
}

function getAuthorizedClient(req) {
  if (!req.session.tokens) return null

  const oauth2Client = createOAuthClient()
  oauth2Client.setCredentials(req.session.tokens)
  oauth2Client.on('tokens', (tokens) => {
    req.session.tokens = { ...req.session.tokens, ...tokens }
    req.session.save(() => {})
  })
  return oauth2Client
}

function requireAuth(req, res, next) {
  if (!req.session.tokens || !req.session.user) {
    return res.status(401).json({
      error: 'AUTH_REQUIRED',
      message: 'برای ادامه ابتدا با حساب گوگل وارد شوید.',
    })
  }
  next()
}

function getApiError(error) {
  return (
    error?.response?.data?.error?.message ||
    error?.errors?.[0]?.message ||
    error?.message ||
    'ارتباط با Google Search Console ناموفق بود.'
  )
}

function toDateString(date) {
  return date.toISOString().slice(0, 10)
}

function shiftDate(dateString, amount) {
  const date = new Date(`${dateString}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return toDateString(date)
}

function isDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false
  const date = new Date(`${value}T12:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && toDateString(date) === value
}

function defaultRange(days = 28) {
  // Search Console data is commonly delayed by a couple of days, so avoid
  // requesting today by default while still allowing a custom end date.
  const safeDays = Math.min(Math.max(Number(days) || 28, 7), 90)
  const endDate = shiftDate(toDateString(new Date()), -2)
  return {
    startDate: shiftDate(endDate, -(safeDays - 1)),
    endDate,
    days: safeDays,
  }
}

function readRange(query) {
  const fallback = defaultRange(query.days)
  const startDate = isDateString(query.startDate) ? query.startDate : fallback.startDate
  const endDate = isDateString(query.endDate) ? query.endDate : fallback.endDate

  if (startDate > endDate) {
    return { ...fallback, invalid: true }
  }

  const start = new Date(`${startDate}T12:00:00.000Z`)
  const end = new Date(`${endDate}T12:00:00.000Z`)
  const days = Math.round((end - start) / 86400000) + 1

  if (days < 1 || days > 90) return { ...fallback, invalid: true }
  return { startDate, endDate, days }
}

async function listAccessibleSites(auth) {
  const searchConsole = google.searchconsole({ version: 'v1', auth })
  const { data } = await searchConsole.sites.list()
  return (data.siteEntry || []).map((site) => ({
    siteUrl: site.siteUrl,
    permissionLevel: site.permissionLevel || 'Unknown',
  }))
}

async function assertAccessibleSite(auth, siteUrl) {
  if (!siteUrl || typeof siteUrl !== 'string' || siteUrl.length > 2048) {
    const error = new Error('یک property معتبر برای Search Console انتخاب کنید.')
    error.statusCode = 400
    throw error
  }

  const sites = await listAccessibleSites(auth)
  const selected = sites.find((site) => site.siteUrl === siteUrl)
  if (!selected) {
    const error = new Error('این property در حساب گوگل شما پیدا نشد یا دسترسی خواندن آن را ندارید.')
    error.statusCode = 403
    throw error
  }
  return selected
}

async function searchAnalyticsQuery(auth, siteUrl, startDate, endDate, dimensions = [], rowLimit = 1000) {
  const searchConsole = google.searchconsole({ version: 'v1', auth })
  const requestBody = {
    startDate,
    endDate,
    dataState: 'final',
    rowLimit,
  }
  if (dimensions.length) requestBody.dimensions = dimensions

  const { data } = await searchConsole.searchanalytics.query({
    siteUrl,
    requestBody,
  })
  return data.rows || []
}

function aggregateRows(rows) {
  if (!rows?.length) {
    return { clicks: 0, impressions: 0, ctr: 0, position: 0 }
  }
  if (rows.length === 1 && !rows[0].keys?.length) {
    return {
      clicks: Number(rows[0].clicks || 0),
      impressions: Number(rows[0].impressions || 0),
      ctr: Number(rows[0].ctr || 0),
      position: Number(rows[0].position || 0),
    }
  }

  const totals = rows.reduce(
    (result, row) => {
      const impressions = Number(row.impressions || 0)
      result.clicks += Number(row.clicks || 0)
      result.impressions += impressions
      result.weightedPosition += Number(row.position || 0) * (impressions || 1)
      return result
    },
    { clicks: 0, impressions: 0, weightedPosition: 0 },
  )

  return {
    clicks: totals.clicks,
    impressions: totals.impressions,
    ctr: totals.impressions ? totals.clicks / totals.impressions : 0,
    position: totals.impressions ? totals.weightedPosition / totals.impressions : 0,
  }
}

function rowItem(row, keyName) {
  return {
    [keyName]: row.keys?.[0] || '',
    clicks: Number(row.clicks || 0),
    impressions: Number(row.impressions || 0),
    ctr: Number(row.ctr || 0),
    position: Number(row.position || 0),
  }
}

function percentChange(current, previous) {
  if (!previous) return current ? null : 0
  return ((current - previous) / previous) * 100
}

function metricChanges(current, previous) {
  return {
    clicks: percentChange(current.clicks, previous.clicks),
    impressions: percentChange(current.impressions, previous.impressions),
    ctr: percentChange(current.ctr, previous.ctr),
    position: percentChange(current.position, previous.position),
  }
}

function buildInsights(summary, queryRows, pageRows, deviceRows, previousSummary) {
  if (!summary.impressions) {
    return [
      {
        id: 'no-data',
        tone: 'info',
        label: 'داده کافی نیست',
        title: 'برای این بازه داده‌ای ثبت نشده است',
        description: 'بازه‌ی زمانی را بزرگ‌تر کنید یا مطمئن شوید property انتخاب‌شده در Search Console فعال است.',
      },
    ]
  }

  const insights = []
  const lowCtrQuery = [...queryRows]
    .filter((row) => row.impressions >= 50 && row.position > 0 && row.position <= 12 && row.ctr < Math.max(summary.ctr * 0.8, 0.02))
    .sort((a, b) => b.impressions - a.impressions)[0]

  if (lowCtrQuery) {
    insights.push({
      id: 'ctr-opportunity',
      tone: 'warning',
      label: 'فرصت رشد',
      title: 'CTR یک عبارت مهم پایین است',
      description: `عبارت «${lowCtrQuery.query}» با ${formatCompact(lowCtrQuery.impressions)} نمایش، جایگاه ${formatPosition(lowCtrQuery.position)} دارد اما CTR آن ${formatPercent(lowCtrQuery.ctr)} است. عنوان و توضیحات نتیجه را بازنویسی کنید.`,
    })
  }

  const nearPageOne = [...queryRows]
    .filter((row) => row.impressions >= 30 && row.position >= 4 && row.position <= 15)
    .sort((a, b) => b.impressions - a.impressions)[0]

  if (nearPageOne) {
    insights.push({
      id: 'page-one',
      tone: 'success',
      label: 'سریع‌ترین برد',
      title: 'یک عبارت تا صفحه اول فاصله کمی دارد',
      description: `«${nearPageOne.query}» در جایگاه ${formatPosition(nearPageOne.position)} دیده می‌شود. با تقویت لینک‌سازی داخلی و کامل‌تر کردن محتوای همین صفحه، شانس رشد آن را بالا ببرید.`,
    })
  }

  const lowCtrPage = [...pageRows]
    .filter((row) => row.impressions >= 100 && row.ctr < Math.max(summary.ctr * 0.75, 0.015))
    .sort((a, b) => b.impressions - a.impressions)[0]

  if (lowCtrPage) {
    insights.push({
      id: 'page-snippet',
      tone: 'neutral',
      label: 'بهینه‌سازی اسنیپت',
      title: 'یک صفحه بازدید زیادی می‌گیرد اما کلیک کمی دارد',
      description: `${shortenUrl(lowCtrPage.page)} با ${formatCompact(lowCtrPage.impressions)} نمایش، CTR ${formatPercent(lowCtrPage.ctr)} دارد. عنوان، متا دیسکریپشن و تطابق آن با نیت جست‌وجو را بررسی کنید.`,
    })
  }

  const mobile = deviceRows.find((row) => row.device === 'MOBILE')
  const desktop = deviceRows.find((row) => row.device === 'DESKTOP')
  if (mobile && desktop && mobile.impressions > desktop.impressions * 1.4 && mobile.ctr < desktop.ctr * 0.8) {
    insights.push({
      id: 'mobile-gap',
      tone: 'warning',
      label: 'تجربه موبایل',
      title: 'شکاف CTR موبایل قابل توجه است',
      description: `موبایل ${formatPercent(mobile.ctr)} CTR دارد، در حالی که دسکتاپ ${formatPercent(desktop.ctr)} است. سرعت، خوانایی و جایگاه CTA را در موبایل بررسی کنید.`,
    })
  }

  if (previousSummary.impressions && previousSummary.clicks < summary.clicks) {
    insights.push({
      id: 'positive-trend',
      tone: 'success',
      label: 'روند مثبت',
      title: 'کلیک‌ها نسبت به دوره قبل رشد کرده‌اند',
      description: `کلیک‌های ارگانیک این دوره ${formatChange(percentChange(summary.clicks, previousSummary.clicks))} بیشتر شده است. صفحاتی را که بیشترین سهم را در این رشد داشته‌اند، به‌روزرسانی کنید.`,
    })
  }

  if (!insights.length) {
    insights.push({
      id: 'steady',
      tone: 'info',
      label: 'پایش',
      title: 'عملکرد پایدار است؛ روی کوئری‌های پربازدید تمرکز کنید',
      description: 'برای پیدا کردن فرصت‌های جدید، عبارت‌های جدول پایین را با نیت جست‌وجو و محتوای صفحات مقصد تطبیق دهید.',
    })
  }

  return insights.slice(0, 4)
}

function formatCompact(number) {
  return new Intl.NumberFormat('fa-IR', { notation: 'compact', maximumFractionDigits: 1 }).format(number)
}

function formatPercent(value) {
  return new Intl.NumberFormat('fa-IR', { style: 'percent', maximumFractionDigits: 1 }).format(value || 0)
}

function formatPosition(value) {
  return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(value || 0)
}

function formatChange(value) {
  if (value === null || value === undefined) return 'بدون سابقه کافی'
  return new Intl.NumberFormat('fa-IR', { style: 'percent', maximumFractionDigits: 1 }).format(value / 100)
}

// --- Authentication -------------------------------------------------------

app.get('/auth/google', (req, res) => {
  if (!isConfigured) {
    return res.redirect('/?error=oauth_not_configured')
  }

  const state = crypto.randomBytes(24).toString('hex')
  req.session.oauthState = state
  return res.redirect(`${getAuthUrl()}&state=${encodeURIComponent(state)}`)
})

app.get('/auth/google/callback', async (req, res) => {
  if (!isConfigured) return res.redirect('/?error=oauth_not_configured')

  if (!req.query.code || !req.query.state || req.query.state !== req.session.oauthState) {
    return res.redirect('/?error=oauth_state')
  }

  try {
    const oauth2Client = createOAuthClient()
    const { tokens } = await oauth2Client.getToken(String(req.query.code))
    oauth2Client.setCredentials(tokens)
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const { data: profile } = await oauth2.userinfo.get()

    req.session.tokens = tokens
    req.session.user = {
      id: profile.id,
      name: profile.name || profile.email?.split('@')[0] || 'کاربر گوگل',
      email: profile.email || '',
      picture: profile.picture || '',
    }
    delete req.session.oauthState

    req.session.save((error) => {
      if (error) return res.redirect('/?error=session')
      return res.redirect('/')
    })
  } catch (error) {
    console.error('Google OAuth callback failed:', getApiError(error))
    return res.redirect(`/?error=${encodeURIComponent('ورود با گوگل ناموفق بود. تنظیمات OAuth را بررسی کنید.')}`)
  }
})

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('searchlight.sid')
    res.json({ ok: true })
  })
})

app.get('/api/auth/me', (req, res) => {
  res.json({
    authenticated: Boolean(req.session.user && req.session.tokens),
    configured: isConfigured,
    demoMode,
    user: req.session.user || null,
  })
})

// --- Search Console data --------------------------------------------------

app.get('/api/sites', requireAuth, async (req, res) => {
  try {
    const auth = getAuthorizedClient(req)
    const sites = await listAccessibleSites(auth)
    res.json({ sites })
  } catch (error) {
    console.error('Could not list Search Console sites:', getApiError(error))
    res.status(error?.response?.status || 502).json({
      error: 'SEARCH_CONSOLE_ERROR',
      message: getApiError(error),
    })
  }
})

app.get('/api/dashboard', requireAuth, async (req, res) => {
  const siteUrl = String(req.query.siteUrl || '')
  const range = readRange(req.query)
  if (range.invalid) {
    return res.status(400).json({
      error: 'INVALID_RANGE',
      message: 'بازه‌ی زمانی باید بین ۱ تا ۹۰ روز و با ترتیب درست باشد.',
    })
  }

  try {
    const auth = getAuthorizedClient(req)
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
      range: {
        ...range,
        previousStartDate,
        previousEndDate,
      },
      metrics: {
        ...summary,
        changes: metricChanges(summary, previousSummary),
      },
      trend,
      topQueries,
      topPages,
      devices,
      insights: buildInsights(summary, topQueries, topPages, devices, previousSummary),
      fetchedAt: new Date().toISOString(),
    })
  } catch (error) {
    const status = error.statusCode || error?.response?.status || 502
    console.error('Search Console dashboard request failed:', getApiError(error))
    return res.status(status).json({
      error: status === 403 ? 'PROPERTY_NOT_ACCESSIBLE' : 'SEARCH_CONSOLE_ERROR',
      message: getApiError(error),
    })
  }
})

app.get('/health', (_req, res) => res.json({ ok: true }))

async function start() {
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
    if (!isConfigured) console.log('Google OAuth is not configured. Add values from .env.example to enable real data.')
  })
}

start().catch((error) => {
  console.error(error)
  process.exit(1)
})
