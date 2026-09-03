import { google } from 'googleapis'

export const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/webmasters.readonly',
]

export const oauthConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI,
)

export function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  )
}

export function getAuthUrl() {
  return createOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: SCOPES,
  })
}

/**
 * Exchanges the authorization code for tokens and the Google profile.
 * Returns { tokens, profile }.
 */
export async function exchangeCodeForTokens(code) {
  const oauth2Client = createOAuthClient()
  const { tokens } = await oauth2Client.getToken(String(code))
  oauth2Client.setCredentials(tokens)
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
  const { data: profile } = await oauth2.userinfo.get()
  return { tokens, profile }
}

/**
 * Builds an authorized OAuth client from a plain token set. Registers a
 * refresh listener so a silently-refreshed access token is persisted back to
 * the caller-supplied `onRefresh` hook (e.g. write to Postgres).
 */
export function buildAuthorizedClient(tokens, onRefresh) {
  const oauth2Client = createOAuthClient()
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    scope: tokens.scope,
    token_type: tokens.token_type,
    expiry_date: tokens.expiry_date,
  })
  if (typeof onRefresh === 'function') {
    oauth2Client.on('tokens', (freshTokens) => {
      try {
        onRefresh(freshTokens)
      } catch (error) {
        console.error('Failed to persist refreshed tokens:', error?.message || error)
      }
    })
  }
  return oauth2Client
}

function searchConsole(auth) {
  return google.searchconsole({ version: 'v1', auth })
}

export function getGoogleApiError(error) {
  return (
    error?.response?.data?.error?.message ||
    error?.errors?.[0]?.message ||
    error?.message ||
    'ارتباط با Google Search Console ناموفق بود.'
  )
}

export async function listAccessibleSites(auth) {
  const { data } = await searchConsole(auth).sites.list()
  return (data.siteEntry || []).map((site) => ({
    siteUrl: site.siteUrl,
    permissionLevel: site.permissionLevel || 'Unknown',
  }))
}

export async function assertAccessibleSite(auth, siteUrl) {
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

export async function searchAnalyticsQuery(auth, siteUrl, startDate, endDate, dimensions = [], rowLimit = 1000) {
  const requestBody = { startDate, endDate, dataState: 'final', rowLimit }
  if (dimensions.length) requestBody.dimensions = dimensions
  const { data } = await searchConsole(auth).searchanalytics.query({ siteUrl, requestBody })
  return data.rows || []
}
