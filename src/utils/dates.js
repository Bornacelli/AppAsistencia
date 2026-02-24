// Returns today as YYYY-MM-DD in local time
export function todayStr() {
  const d = new Date()
  return localDateStr(d)
}

// Formats a Date to YYYY-MM-DD in local time
export function localDateStr(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Parse YYYY-MM-DD as local date (avoids UTC offset issue)
export function parseLocalDate(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Format YYYY-MM-DD to localized display string
export function formatDate(str, options = {}) {
  if (!str) return ''
  const d = parseLocalDate(str)
  if (!d) return str
  return d.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...options,
  })
}

// Short format: "Vie 14 feb"
export function formatDateShort(str) {
  if (!str) return ''
  const d = parseLocalDate(str)
  if (!d) return str
  const s = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Returns MM-DD from YYYY-MM-DD (for birthday comparison)
export function monthDay(str) {
  if (!str) return ''
  return str.slice(5) // "MM-DD"
}

// Returns age from YYYY-MM-DD birthdate
export function ageFrom(str) {
  if (!str) return null
  const birth = parseLocalDate(str)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

// Returns true if birthday is today or within the next `days` days
export function isBirthdaySoon(birthDateStr, days = 7) {
  if (!birthDateStr) return false
  const today = new Date()
  const todayMD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const bd = birthDateStr.slice(5) // MM-DD
  // Build dates for this year
  const bdThisYear = new Date(today.getFullYear(), parseInt(bd.slice(0, 2)) - 1, parseInt(bd.slice(3)))
  const diff = (bdThisYear - today) / (1000 * 60 * 60 * 24)
  return diff >= 0 && diff <= days
}

// Returns true if birthday is today
export function isBirthdayToday(birthDateStr) {
  if (!birthDateStr) return false
  const today = new Date()
  const todayMD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return birthDateStr.slice(5) === todayMD
}

// Format only the month/day part of a birthdate (no year), e.g. "24 de febrero"
export function formatBirthday(birthDateStr) {
  if (!birthDateStr) return ''
  const mm = parseInt(birthDateStr.slice(5, 7), 10)
  const dd = parseInt(birthDateStr.slice(8, 10), 10)
  if (isNaN(mm) || isNaN(dd)) return ''
  const d = new Date(2000, mm - 1, dd)
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
}

// Days until next birthday (0 = today)
export function daysUntilBirthday(birthDateStr) {
  if (!birthDateStr) return null
  const mm = parseInt(birthDateStr.slice(5, 7), 10)
  const dd = parseInt(birthDateStr.slice(8, 10), 10)
  if (isNaN(mm) || isNaN(dd)) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let bd = new Date(today.getFullYear(), mm - 1, dd)
  if (bd < today) bd = new Date(today.getFullYear() + 1, mm - 1, dd)
  return Math.round((bd - today) / (1000 * 60 * 60 * 24))
}

// Difference in days between two YYYY-MM-DD strings
export function daysBetween(str1, str2) {
  const d1 = parseLocalDate(str1)
  const d2 = parseLocalDate(str2)
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24))
}

// Returns the last N week date strings (Sundays or configurable)
export function lastNWeeks(n, dayOfWeek = 0) {
  const dates = []
  const today = new Date()
  let d = new Date(today)
  while (dates.length < n) {
    if (d.getDay() === dayOfWeek) dates.push(localDateStr(d))
    d.setDate(d.getDate() - 1)
  }
  return dates
}
