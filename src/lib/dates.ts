const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayIso(): string {
  return toIsoDate(new Date())
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso: string, n: number): string {
  const dt = parseIso(iso)
  dt.setDate(dt.getDate() + n)
  return toIsoDate(dt)
}

export function dateRangeInclusive(endIso: string, days: number): string[] {
  const out: string[] = []
  for (let i = days - 1; i >= 0; i -= 1) {
    out.push(addDays(endIso, -i))
  }
  return out
}

export function formatMd(iso: string): string {
  const d = parseIso(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function formatLong(iso: string): string {
  const d = parseIso(iso)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAYS[d.getDay()]}`
}

export function formatShort(iso: string): string {
  const d = parseIso(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function isToday(iso: string): boolean {
  return iso === todayIso()
}

export function compareIso(a: string, b: string): number {
  return a.localeCompare(b)
}
