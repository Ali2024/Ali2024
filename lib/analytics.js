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

export function defaultRange(days = 28) {
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

export function readRange(query) {
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

export function aggregateRows(rows) {
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

export function rowItem(row, keyName) {
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

export { shiftDate, metricChanges }

const compact = new Intl.NumberFormat('fa-IR', { notation: 'compact', maximumFractionDigits: 1 })
const percent = new Intl.NumberFormat('fa-IR', { style: 'percent', maximumFractionDigits: 1 })
const position = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 })
const change = (v) =>
  new Intl.NumberFormat('fa-IR', { style: 'percent', maximumFractionDigits: 1 }).format(v / 100)

function shortenUrl(value = '') {
  try {
    const url = new URL(value)
    return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    return value.replace(/^https?:\/\//, '').replace(/\/$/, '')
  }
}

export function buildInsights(summary, queryRows, pageRows, deviceRows, previousSummary) {
  if (!summary.impressions) {
    return [{
      id: 'no-data',
      tone: 'info',
      label: 'داده کافی نیست',
      title: 'برای این بازه داده‌ای ثبت نشده است',
      description: 'بازه‌ی زمانی را بزرگ‌تر کنید یا مطمئن شوید property انتخاب‌شده در Search Console فعال است.',
    }]
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
      description: `عبارت «${lowCtrQuery.query}» با ${compact.format(lowCtrQuery.impressions)} نمایش، جایگاه ${position.format(lowCtrQuery.position)} دارد اما CTR آن ${percent.format(lowCtrQuery.ctr)} است. عنوان و توضیحات نتیجه را بازنویسی کنید.`,
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
      description: `«${nearPageOne.query}» در جایگاه ${position.format(nearPageOne.position)} دیده می‌شود. با تقویت لینک‌سازی داخلی و کامل‌تر کردن محتوای همین صفحه، شانس رشد آن را بالا ببرید.`,
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
      description: `${shortenUrl(lowCtrPage.page)} با ${compact.format(lowCtrPage.impressions)} نمایش، CTR ${percent.format(lowCtrPage.ctr)} دارد. عنوان، متا دیسکریپشن و تطابق آن با نیت جست‌وجو را بررسی کنید.`,
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
      description: `موبایل ${percent.format(mobile.ctr)} CTR دارد، در حالی که دسکتاپ ${percent.format(desktop.ctr)} است. سرعت، خوانایی و جایگاه CTA را در موبایل بررسی کنید.`,
    })
  }
  if (previousSummary.impressions && previousSummary.clicks < summary.clicks) {
    insights.push({
      id: 'positive-trend',
      tone: 'success',
      label: 'روند مثبت',
      title: 'کلیک‌ها نسبت به دوره قبل رشد کرده‌اند',
      description: `کلیک‌های ارگانیک این دوره ${change(percentChange(summary.clicks, previousSummary.clicks))} بیشتر شده است. صفحاتی را که بیشترین سهم را در این رشد داشته‌اند، به‌روزرسانی کنید.`,
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
