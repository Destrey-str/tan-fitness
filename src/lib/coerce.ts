/** Coerce messy localStorage / iOS values into finite numbers. Never throws. */
export function asFiniteNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined
  if (typeof value === 'boolean') return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') {
    const t = value.trim().replace(/,/g, '').replace(/，/g, '.')
    if (!t || t === '-' || t === '.' || t === '-.') return undefined
    const n = Number(t)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

export function asInt(value: unknown): number | undefined {
  const n = asFiniteNumber(value)
  if (n == null) return undefined
  const r = Math.round(n)
  return Number.isFinite(r) ? r : undefined
}

export function asNonNeg(value: unknown): number | undefined {
  const n = asFiniteNumber(value)
  if (n == null || n < 0) return undefined
  return n
}

export function asNonNegInt(value: unknown): number | undefined {
  const n = asInt(value)
  if (n == null || n < 0) return undefined
  return n
}

export function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (value == null) return fallback
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return fallback
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = asInt(value)
  if (n == null) return fallback
  return Math.min(max, Math.max(min, n))
}

export function asIsoTime(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const n = Date.parse(value)
  return Number.isFinite(n) ? value : undefined
}

export function timeMs(value: string | undefined): number {
  if (!value) return 0
  const n = Date.parse(value)
  return Number.isFinite(n) ? n : 0
}
