import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowUpLeft,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Database,
  ExternalLink,
  FileSearch,
  Gauge,
  Globe2,
  Info,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Menu,
  MousePointerClick,
  RefreshCw,
  Search,
  Settings2,
  Smartphone,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X,
} from 'lucide-react'

const numberFormatter = new Intl.NumberFormat('fa-IR')
const compactFormatter = new Intl.NumberFormat('fa-IR', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const percentFormatter = new Intl.NumberFormat('fa-IR', {
  style: 'percent',
  maximumFractionDigits: 1,
})
const dateFormatter = new Intl.DateTimeFormat('fa-IR', {
  month: 'short',
  day: 'numeric',
})

const periodOptions = [
  { value: 7, label: '۷ روز گذشته' },
  { value: 28, label: '۲۸ روز گذشته' },
  { value: 90, label: '۹۰ روز گذشته' },
]

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.message || 'دریافت اطلاعات ناموفق بود.')
    error.status = response.status
    error.code = payload.error
    throw error
  }
  return payload
}

function formatNumber(value) {
  return numberFormatter.format(Math.round(Number(value || 0)))
}

function formatCompact(value) {
  return compactFormatter.format(Number(value || 0))
}

function formatPercent(value) {
  return percentFormatter.format(Number(value || 0))
}

function formatPosition(value) {
  return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(Number(value || 0))
}

function formatDateLabel(value) {
  if (!value) return ''
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date)
}

function formatFullDate(value) {
  if (!value) return ''
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }).format(date)
}

function formatChange(value) {
  if (value === null || value === undefined) return 'داده کافی نیست'
  if (Math.abs(value) < 0.05) return 'بدون تغییر'
  const sign = value > 0 ? '+' : ''
  return `${sign}${new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 }).format(value)}٪`
}

function siteName(siteUrl = '') {
  return siteUrl
    .replace(/^sc-domain:/, '')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
}

function siteKind(siteUrl = '') {
  return siteUrl.startsWith('sc-domain:') ? 'Domain property' : 'URL-prefix property'
}

function shortenUrl(value = '') {
  try {
    const url = new URL(value)
    return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    return value.replace(/^https?:\/\//, '').replace(/\/$/, '')
  }
}

function getInitialError() {
  const error = new URLSearchParams(window.location.search).get('error')
  if (!error) return ''
  if (error === 'oauth_not_configured') return 'اتصال گوگل هنوز روی سرور تنظیم نشده است.'
  if (error === 'oauth_state') return 'درخواست ورود منقضی شد؛ لطفاً دوباره تلاش کنید.'
  if (error === 'session') return 'ساخت نشست ورود ناموفق بود؛ دوباره تلاش کنید.'
  if (error === 'server_not_configured') return 'ورود در دسترس نیست؛ اتصال Google، PostgreSQL و کلید رمزنگاری را روی سرور تنظیم کنید.'
  return error
}

function Logo({ compact = false }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`}>
      <span className="brand-mark"><Sparkles size={17} strokeWidth={2.6} /></span>
      {!compact && (
        <span className="brand-name">
          Search<span>light</span>
        </span>
      )}
    </div>
  )
}

function GoogleMark() {
  return <span className="google-mark" aria-hidden="true">G</span>
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <Logo />
      <div className="loading-orbit"><span /></div>
      <p>در حال آماده‌سازی اتاق فرمان...</p>
    </div>
  )
}

function LoginScreen({ configured, error }) {
  return (
    <div className="auth-shell">
      <section className="auth-visual">
        <div className="visual-glow visual-glow-one" />
        <div className="visual-glow visual-glow-two" />
        <div className="auth-visual-inner">
          <Logo />
          <div className="visual-copy">
            <div className="eyebrow eyebrow-light"><span /> وضوح بیشتر، تصمیم بهتر</div>
            <h1>نبض واقعی<br /><em>سئوی شما</em> را ببینید.</h1>
            <p>داده‌های Search Console را به بینش‌های ساده و اقدام‌های مشخص تبدیل کنید؛ بدون حدس و گمان.</p>
          </div>
          <div className="visual-metrics" aria-label="نمونه قابلیت‌ها">
            <div><strong>۴</strong><span>شاخص کلیدی</span></div>
            <div><strong>۳</strong><span>منبع تحلیل</span></div>
            <div><strong>۱۰۰٪</strong><span>داده واقعی</span></div>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="mobile-auth-brand"><Logo /></div>
          <div className="auth-heading">
            <div className="welcome-icon"><Gauge size={22} /></div>
            <div>
              <div className="eyebrow">ورود به workspace</div>
              <h2>به اتاق فرمان خوش آمدید</h2>
            </div>
          </div>
          <p className="auth-description">با حساب Google خود وارد شوید تا propertyهای Search Console و داده‌های عملکردتان را ببینید.</p>

          {error && (
            <div className="notice notice-error auth-notice"><AlertCircle size={17} /><span>{error}</span></div>
          )}

          <a className={`google-login ${!configured ? 'is-disabled' : ''}`} href={configured ? '/auth/google' : undefined} onClick={(event) => !configured && event.preventDefault()}>
            <GoogleMark />
            <span>{configured ? 'ورود امن با حساب Google' : 'اتصال Google تنظیم نشده است'}</span>
            {configured ? <ArrowLeft size={18} /> : <Settings2 size={17} />}
          </a>

          {!configured ? (
            <div className="setup-card">
              <div className="setup-card-icon"><Settings2 size={17} /></div>
              <div>
                <strong>یک قدم تا اتصال واقعی</strong>
                <p>مقادیر OAuth گوگل، <code>DATABASE_URL</code> و <code>ENCRYPTION_KEY</code> را در فایل <code>.env</code> قرار دهید. راهنمای کامل داخل README پروژه است.</p>
              </div>
            </div>
          ) : (
            <div className="trust-note"><Check size={16} /><span>فقط دسترسی خواندن Search Console درخواست می‌شود.</span></div>
          )}

          <div className="auth-footer">
            <span>حریم خصوصی شما مهم است</span>
            <span className="footer-dot" />
            <span>OAuth 2.0 گوگل</span>
          </div>
        </div>
        <div className="auth-panel-decoration"><span /><span /><span /></div>
      </section>
    </div>
  )
}

function Sidebar({ activeSection, onNavigate }) {
  const navItems = [
    { id: 'overview', label: 'نمای کلی', icon: LayoutDashboard },
    { id: 'opportunities', label: 'فرصت‌های سئو', icon: Lightbulb },
    { id: 'queries', label: 'عبارت‌های جست‌وجو', icon: Search },
    { id: 'pages', label: 'صفحات برتر', icon: FileSearch },
  ]

  return (
    <aside className="sidebar">
      <Logo />
      <div className="sidebar-rule" />
      <div className="sidebar-label">workspace</div>
      <nav className="sidebar-nav">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button key={id} className={activeSection === id ? 'active' : ''} onClick={() => onNavigate(id)}>
            <Icon size={18} strokeWidth={activeSection === id ? 2.3 : 1.8} />
            <span>{label}</span>
            {activeSection === id && <span className="nav-active-dot" />}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="connected-source">
          <div className="source-icon"><Database size={17} /></div>
          <div><strong>Google Search Console</strong><span><i /> متصل و همگام</span></div>
        </div>
        <div className="sidebar-help"><CircleHelp size={16} /><span>راهنمای Searchlight</span><ArrowLeft size={14} /></div>
      </div>
    </aside>
  )
}

function UserAvatar({ user, small = false }) {
  if (user?.picture) return <img className={`user-avatar ${small ? 'small' : ''}`} src={user.picture} alt="" />
  return <span className={`user-avatar avatar-fallback ${small ? 'small' : ''}`}>{(user?.name || 'ک').slice(0, 1)}</span>
}

function MobileHeader({ user, onLogout, onMenu }) {
  return (
    <header className="mobile-header">
      <button className="icon-button" onClick={onMenu} aria-label="باز کردن منو"><Menu size={21} /></button>
      <Logo compact />
      <button className="user-button" onClick={onLogout} title="خروج"><UserAvatar user={user} small /></button>
    </header>
  )
}

function Topbar({ user, onRefresh, refreshing, onLogout }) {
  return (
    <header className="topbar">
      <div className="breadcrumb"><span>workspace</span><ArrowLeft size={14} /><strong>اتاق فرمان سئو</strong></div>
      <div className="topbar-actions">
        <button className="refresh-button" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
          <span>{refreshing ? 'در حال به‌روزرسانی' : 'به‌روزرسانی داده'}</span>
        </button>
        <div className="topbar-separator" />
        <button className="profile-button" onClick={onLogout} title="خروج از حساب">
          <UserAvatar user={user} />
          <span><strong>{user?.name || 'کاربر گوگل'}</strong><small>{user?.email}</small></span>
          <ChevronDown size={16} />
        </button>
      </div>
    </header>
  )
}

function MetricCard({ icon: Icon, label, value, change, helper, accent, metric }) {
  const improving = metric === 'position' ? change < 0 : change > 0
  const worsening = metric === 'position' ? change > 0 : change < 0
  return (
    <article className={`metric-card accent-${accent}`}>
      <div className="metric-topline">
        <div className="metric-icon"><Icon size={18} /></div>
        <span className="metric-label">{label}</span>
        <button className="metric-more" aria-label={`درباره ${label}`}><Info size={15} /></button>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-foot">
        <span className={`change-pill ${improving ? 'positive' : worsening ? 'negative' : ''}`}>
          {change > 0 ? <ArrowUpLeft size={13} /> : change < 0 ? <ArrowDownLeft size={13} /> : null}
          {formatChange(change)}
        </span>
        <span>{helper}</span>
      </div>
    </article>
  )
}

function DateToolbar({ sites, selectedSite, onSiteChange, days, onDaysChange, onRefresh, loading }) {
  return (
    <div className="filter-toolbar">
      <div className="property-select-wrap">
        <Globe2 size={17} />
        <div className="select-label"><span>Property فعال</span><select value={selectedSite} onChange={(event) => onSiteChange(event.target.value)} aria-label="انتخاب property">
          {sites.map((site) => <option key={site.siteUrl} value={site.siteUrl}>{siteName(site.siteUrl)}</option>)}
        </select></div>
        <ChevronDown size={15} className="select-chevron" />
      </div>
      <div className="toolbar-divider" />
      <div className="date-select-wrap">
        <CalendarDays size={17} />
        <select value={days} onChange={(event) => onDaysChange(Number(event.target.value))} aria-label="انتخاب بازه زمانی">
          {periodOptions.map((period) => <option key={period.value} value={period.value}>{period.label}</option>)}
        </select>
        <ChevronDown size={15} className="select-chevron" />
      </div>
      <button className="toolbar-refresh" onClick={onRefresh} disabled={loading} aria-label="بارگذاری مجدد"><RefreshCw size={16} className={loading ? 'spin' : ''} /></button>
    </div>
  )
}

function TrendChart({ rows }) {
  const chart = useMemo(() => {
    if (!rows?.length) return null
    const width = 760
    const height = 230
    const pad = { top: 16, right: 18, bottom: 33, left: 42 }
    const innerWidth = width - pad.left - pad.right
    const innerHeight = height - pad.top - pad.bottom
    const maxClicks = Math.max(...rows.map((row) => row.clicks), 1)
    const maxImpressions = Math.max(...rows.map((row) => row.impressions), 1)
    const x = (index) => pad.left + (rows.length === 1 ? innerWidth / 2 : (index / (rows.length - 1)) * innerWidth)
    const yClicks = (value) => pad.top + innerHeight - (value / maxClicks) * innerHeight
    const yImpressions = (value) => pad.top + innerHeight - (value / maxImpressions) * innerHeight
    const clickPoints = rows.map((row, index) => `${x(index)},${yClicks(row.clicks)}`).join(' ')
    const impressionPoints = rows.map((row, index) => `${x(index)},${yImpressions(row.impressions)}`).join(' ')
    const labels = rows.map((row, index) => ({ ...row, x: x(index) })).filter((_row, index) => rows.length <= 10 || index % Math.ceil(rows.length / 7) === 0 || index === rows.length - 1)
    return { width, height, pad, innerWidth, innerHeight, maxClicks, maxImpressions, x, yClicks, yImpressions, clickPoints, impressionPoints, labels }
  }, [rows])

  if (!chart) return <EmptyChart />
  const gridLines = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="chart-wrap">
      <div className="chart-legend"><span><i className="legend-line clicks-line" /> کلیک</span><span><i className="legend-line impressions-line" /> ایمپرشن</span></div>
      <svg className="trend-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label="روند کلیک و ایمپرشن">
        <defs>
          <linearGradient id="clickArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#9d7bff" stopOpacity=".2" /><stop offset="1" stopColor="#9d7bff" stopOpacity="0" /></linearGradient>
        </defs>
        {gridLines.map((fraction) => {
          const y = chart.pad.top + chart.innerHeight * fraction
          return <g key={fraction}><line x1={chart.pad.left} x2={chart.width - chart.pad.right} y1={y} y2={y} className="chart-grid" /><text x={chart.pad.left - 10} y={y + 4} textAnchor="end" className="chart-y-label">{formatCompact(chart.maxClicks * (1 - fraction))}</text></g>
        })}
        <polygon points={`${chart.pad.left},${chart.pad.top + chart.innerHeight} ${chart.clickPoints} ${chart.width - chart.pad.right},${chart.pad.top + chart.innerHeight}`} fill="url(#clickArea)" />
        {rows.map((row, index) => {
          const barWidth = Math.max(2, Math.min(14, chart.innerWidth / rows.length * 0.46))
          return <rect key={`bar-${row.date}`} x={chart.x(index) - barWidth / 2} y={chart.yImpressions(row.impressions)} width={barWidth} height={chart.pad.top + chart.innerHeight - chart.yImpressions(row.impressions)} rx="3" className="impression-bar"><title>{`${formatFullDate(row.date)}: ${formatNumber(row.impressions)} ایمپرشن`}</title></rect>
        })}
        <polyline points={chart.clickPoints} fill="none" className="click-line" />
        {rows.map((row, index) => <circle key={`point-${row.date}`} cx={chart.x(index)} cy={chart.yClicks(row.clicks)} r={rows.length > 45 ? 2 : 3.5} className="click-point"><title>{`${formatFullDate(row.date)}: ${formatNumber(row.clicks)} کلیک`}</title></circle>)}
        {chart.labels.map((row) => <text key={row.date} x={row.x} y={chart.height - 8} textAnchor="middle" className="chart-x-label">{formatDateLabel(row.date)}</text>)}
      </svg>
    </div>
  )
}

function EmptyChart() {
  return <div className="empty-chart"><Activity size={24} /><span>برای این بازه هنوز روندی ثبت نشده است.</span></div>
}

function PanelHeader({ eyebrow, title, action, onAction, icon: Icon = Activity }) {
  return (
    <div className="panel-header">
      <div className="panel-heading"><div className="panel-icon"><Icon size={17} /></div><div><span className="panel-eyebrow">{eyebrow}</span><h3>{title}</h3></div></div>
      {action && <button className="text-action" onClick={onAction}>{action}<ArrowLeft size={15} /></button>}
    </div>
  )
}

function TrendPanel({ data }) {
  return (
    <section className="panel trend-panel">
      <PanelHeader eyebrow="performance pulse" title="روند عملکرد" icon={TrendingUp} action="جزئیات گزارش" />
      <div className="trend-meta"><span>عملکرد روزانه در بازه انتخاب‌شده</span><strong>{formatFullDate(data.range.startDate)} تا {formatFullDate(data.range.endDate)}</strong></div>
      <TrendChart rows={data.trend} />
    </section>
  )
}

function InsightCard({ insight }) {
  const Icon = insight.tone === 'warning' ? AlertCircle : insight.tone === 'success' ? TrendingUp : insight.tone === 'neutral' ? Target : Lightbulb
  return (
    <article className={`insight-card tone-${insight.tone}`}>
      <div className="insight-icon"><Icon size={17} /></div>
      <div className="insight-copy"><div className="insight-label">{insight.label}</div><h4>{insight.title}</h4><p>{insight.description}</p></div>
      <ArrowLeft className="insight-arrow" size={16} />
    </article>
  )
}

function InsightsPanel({ insights }) {
  return (
    <section id="opportunities" className="panel insights-panel">
      <PanelHeader eyebrow="smart signals" title="فرصت‌های این هفته" icon={Lightbulb} action="مشاهده همه" />
      <div className="insights-list">{insights?.length ? insights.map((insight) => <InsightCard key={insight.id} insight={insight} />) : <div className="empty-inline">پس از دریافت داده، پیشنهادهای اختصاصی اینجا نمایش داده می‌شوند.</div>}</div>
    </section>
  )
}

function PositionBadge({ position }) {
  const tone = position <= 3 ? 'great' : position <= 10 ? 'good' : position <= 20 ? 'mid' : 'low'
  return <span className={`position-badge ${tone}`}>{formatPosition(position)}</span>
}

function QueriesPanel({ rows }) {
  return (
    <section id="queries" className="panel table-panel">
      <PanelHeader eyebrow="search demand" title="عبارت‌های جست‌وجوی برتر" icon={Search} action="خروجی CSV" />
      <div className="table-scroll"><table><thead><tr><th className="index-col">#</th><th>عبارت</th><th>کلیک</th><th>ایمپرشن</th><th>CTR</th><th>جایگاه</th></tr></thead><tbody>
        {rows?.length ? rows.map((row, index) => <tr key={`${row.query}-${index}`}><td className="index-col muted-cell">{String(index + 1).padStart(2, '0')}</td><td className="primary-cell"><span className="query-dot" />{row.query}</td><td>{formatNumber(row.clicks)}</td><td>{formatCompact(row.impressions)}</td><td>{formatPercent(row.ctr)}</td><td><PositionBadge position={row.position} /></td></tr>) : <EmptyTable colSpan={6} />}
      </tbody></table></div>
    </section>
  )
}

function PagesPanel({ rows }) {
  return (
    <section id="pages" className="panel table-panel">
      <PanelHeader eyebrow="content leaders" title="صفحات پربازدید" icon={FileSearch} action="مشاهده گزارش" />
      <div className="table-scroll"><table><thead><tr><th className="index-col">#</th><th>صفحه</th><th>کلیک</th><th>ایمپرشن</th><th>CTR</th><th>جایگاه</th></tr></thead><tbody>
        {rows?.length ? rows.map((row, index) => <tr key={`${row.page}-${index}`}><td className="index-col muted-cell">{String(index + 1).padStart(2, '0')}</td><td className="primary-cell page-cell" title={row.page}><span className="page-icon"><ExternalLink size={12} /></span>{shortenUrl(row.page)}</td><td>{formatNumber(row.clicks)}</td><td>{formatCompact(row.impressions)}</td><td>{formatPercent(row.ctr)}</td><td><PositionBadge position={row.position} /></td></tr>) : <EmptyTable colSpan={6} />}
      </tbody></table></div>
    </section>
  )
}

function EmptyTable({ colSpan }) {
  return <tr><td colSpan={colSpan}><div className="empty-table"><Database size={19} /><span>داده‌ای برای نمایش وجود ندارد.</span></div></td></tr>
}

const deviceLabels = { MOBILE: 'موبایل', DESKTOP: 'دسکتاپ', TABLET: 'تبلت' }

function DevicesPanel({ rows }) {
  const total = (rows || []).reduce((sum, row) => sum + row.impressions, 0)
  return (
    <section className="panel devices-panel">
      <PanelHeader eyebrow="audience split" title="تفکیک دستگاه‌ها" icon={Smartphone} />
      {rows?.length ? <div className="devices-list">{rows.map((row) => {
        const share = total ? row.impressions / total : 0
        return <div className="device-row" key={row.device}><div className="device-row-top"><span className="device-name"><span className={`device-dot ${row.device.toLowerCase()}`} />{deviceLabels[row.device] || row.device}</span><strong>{formatPercent(share)}</strong></div><div className="device-track"><span style={{ width: `${share * 100}%` }} /></div><div className="device-row-meta"><span>{formatCompact(row.impressions)} ایمپرشن</span><span>CTR {formatPercent(row.ctr)}</span></div></div>
      })}</div> : <div className="empty-device"><Smartphone size={21} /><span>تفکیک دستگاهی موجود نیست.</span></div>}
    </section>
  )
}

function SkeletonDashboard() {
  return <div className="skeleton-dashboard"><div className="skeleton-row metric-skeleton-row">{[1, 2, 3, 4].map((item) => <div className="skeleton-block" key={item} />)}</div><div className="skeleton-row main-skeleton-row"><div className="skeleton-block" /><div className="skeleton-block" /></div><div className="skeleton-block table-skeleton" /></div>
}

function EmptySites({ onRetry }) {
  return <div className="empty-state large-empty"><div className="empty-state-icon"><Globe2 size={27} /></div><h3>هنوز property قابل دسترسی پیدا نشد</h3><p>این حساب Google در Search Console property تأییدشده‌ای ندارد یا دسترسی شما هنوز فعال نشده است.</p><div className="empty-actions"><button className="primary-button" onClick={onRetry}><RefreshCw size={16} /> دوباره بررسی کن</button><a href="https://search.google.com/search-console" target="_blank" rel="noreferrer" className="secondary-button">باز کردن Search Console <ExternalLink size={15} /></a></div></div>
}

function ErrorBanner({ error, onRetry }) {
  if (!error) return null
  return <div className="notice notice-error dashboard-error"><AlertCircle size={18} /><div><strong>دریافت داده انجام نشد</strong><span>{error.message}</span></div><button onClick={onRetry}><RefreshCw size={15} /> تلاش دوباره</button></div>
}

function Dashboard({ user }) {
  const [sites, setSites] = useState([])
  const [sitesLoading, setSitesLoading] = useState(true)
  const [selectedSite, setSelectedSite] = useState('')
  const [days, setDays] = useState(28)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [activeSection, setActiveSection] = useState('overview')

  const loadSites = useCallback(async () => {
    setSitesLoading(true)
    setError(null)
    try {
      const payload = await requestJson('/api/sites')
      setSites(payload.sites || [])
      setSelectedSite((current) => current && payload.sites?.some((site) => site.siteUrl === current) ? current : payload.sites?.[0]?.siteUrl || '')
    } catch (requestError) {
      setError(requestError)
    } finally {
      setSitesLoading(false)
    }
  }, [])

  const loadDashboard = useCallback(async (showRefresh = false) => {
    if (!selectedSite) return
    if (showRefresh) setRefreshing(true)
    setLoading(true)
    setError(null)
    try {
      const payload = await requestJson(`/api/dashboard?siteUrl=${encodeURIComponent(selectedSite)}&days=${days}`)
      setData(payload)
    } catch (requestError) {
      setError(requestError)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [days, selectedSite])

  useEffect(() => { loadSites() }, [loadSites])
  useEffect(() => { loadDashboard() }, [loadDashboard])

  const navigateTo = (id) => {
    setActiveSection(id)
    setMobileMenu(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const logout = async () => {
    await requestJson('/auth/logout', { method: 'POST' }).catch(() => {})
    window.location.reload()
  }
  const retry = () => sites.length ? loadDashboard(true) : loadSites()

  return (
    <div className="app-shell">
      <div className={`mobile-menu-backdrop ${mobileMenu ? 'visible' : ''}`} onClick={() => setMobileMenu(false)} />
      <div className={`mobile-sidebar ${mobileMenu ? 'visible' : ''}`}><button className="mobile-close" onClick={() => setMobileMenu(false)}><X size={19} /></button><Sidebar activeSection={activeSection} onNavigate={navigateTo} /></div>
      <Sidebar activeSection={activeSection} onNavigate={navigateTo} />
      <div className="main-column">
        <MobileHeader user={user} onLogout={logout} onMenu={() => setMobileMenu(true)} />
        <Topbar user={user} onRefresh={() => loadDashboard(true)} refreshing={refreshing} onLogout={logout} />
        <main className="dashboard-main">
          <div className="dashboard-intro"><div><div className="eyebrow eyebrow-purple"><span /> morning brief</div><h1>سلام، {user?.name?.split(' ')[0] || 'دوست'} <span className="wave">✦</span></h1><p>تصویر واضحی از عملکرد ارگانیک شما در یک نگاه.</p></div><div className="live-status"><span className="live-dot" /><span>داده زنده</span><small>{data?.fetchedAt ? `آخرین همگام‌سازی ${new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(new Date(data.fetchedAt))}` : 'در انتظار اتصال'}</small></div></div>
          {!sitesLoading && sites.length > 0 && <DateToolbar sites={sites} selectedSite={selectedSite} onSiteChange={setSelectedSite} days={days} onDaysChange={setDays} onRefresh={() => loadDashboard(true)} loading={loading} />}
          <ErrorBanner error={error} onRetry={retry} />
          {sitesLoading ? <SkeletonDashboard /> : sites.length === 0 ? <EmptySites onRetry={retry} /> : loading && !data ? <SkeletonDashboard /> : data ? <>
            <section id="overview" className="metrics-section"><div className="section-caption"><span>شاخص‌های اصلی</span><i /> <small>در مقایسه با دوره قبل</small></div><div className="metric-grid">
              <MetricCard icon={MousePointerClick} label="کلیک ارگانیک" value={formatNumber(data.metrics.clicks)} change={data.metrics.changes.clicks} helper="در بازه انتخاب‌شده" accent="purple" metric="clicks" />
              <MetricCard icon={BarChart3} label="ایمپرشن" value={formatCompact(data.metrics.impressions)} change={data.metrics.changes.impressions} helper="دفعات دیده‌شدن" accent="orange" metric="impressions" />
              <MetricCard icon={Target} label="نرخ کلیک CTR" value={formatPercent(data.metrics.ctr)} change={data.metrics.changes.ctr} helper="از کل ایمپرشن‌ها" accent="teal" metric="ctr" />
              <MetricCard icon={Gauge} label="میانگین جایگاه" value={formatPosition(data.metrics.position)} change={data.metrics.changes.position} helper="هرچه کمتر، بهتر" accent="blue" metric="position" />
            </div></section>
            <div className="main-panels"><TrendPanel data={data} /><InsightsPanel insights={data.insights} /></div>
            <div className="data-panels"><QueriesPanel rows={data.topQueries} /><PagesPanel rows={data.topPages} /></div>
            <div className="bottom-panels"><DevicesPanel rows={data.devices} /><section className="panel next-step-panel"><div className="next-step-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><Sparkles size={23} /></div><div><span className="panel-eyebrow">next best action</span><h3>از داده تا اقدام</h3><p>یک فرصت را انتخاب کنید و قبل از تغییر بعدی، اثر آن را در همین داشبورد بسنجید.</p><button className="text-action"><span>شروع بهینه‌سازی</span><ArrowLeft size={15} /></button></div></section></div>
          </> : null}
        </main>
        <footer className="app-footer"><span>Searchlight workspace</span><span>داده‌ها مستقیماً از Google Search Console خوانده می‌شوند.</span><span>ساخته‌شده برای تصمیم‌های بهتر <Sparkles size={13} /></span></footer>
      </div>
    </div>
  )
}

export default function App() {
  const [auth, setAuth] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    requestJson('/api/auth/me')
      .then(setAuth)
      .catch(() => setAuth({ authenticated: false, configured: false }))
      .finally(() => setAuthLoading(false))
  }, [])

  if (authLoading) return <LoadingScreen />
  if (!auth?.authenticated) return <LoginScreen configured={auth?.configured} error={getInitialError()} />
  return <Dashboard user={auth.user} />
}
