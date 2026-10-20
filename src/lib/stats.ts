import { asFiniteNumber } from '@/lib/coerce'
import { addDays } from '@/lib/dates'
import {
  DEFAULT_BMR_KCAL,
  DEFAULT_OVERLAP_KCAL,
  DEFAULT_REST_TARGET_KCAL,
  DEFAULT_TRAINING_TARGET_KCAL,
  type BurnSource,
  type DailyLog,
  type DayKind,
  type Settings,
} from '@/types'

export type BurnBreakdown = {
  kcal: number
  source: BurnSource | 'bmr+band-overlap'
  bmr: number
  band: number
  overlap: number
}

export function resolveBmr(
  log: DailyLog | undefined,
  settings: Settings | undefined,
): number {
  const fromLog = asFiniteNumber(log?.bmrKcal)
  if (fromLog != null && fromLog > 0) return fromLog
  const fromSettings = asFiniteNumber(settings?.bmrDefaultKcal)
  if (fromSettings != null && fromSettings > 0) return fromSettings
  return DEFAULT_BMR_KCAL
}

export function resolveOverlap(
  log: DailyLog | undefined,
  settings: Settings | undefined,
): number {
  const fromLog = asFiniteNumber(log?.overlapKcal)
  if (fromLog != null && fromLog >= 0) return fromLog
  const fromSettings = asFiniteNumber(settings?.overlapDefaultKcal)
  if (fromSettings != null && fromSettings >= 0) return fromSettings
  return DEFAULT_OVERLAP_KCAL
}

/** @deprecated use resolveOverlap */
export function resolveExtraBurn(
  log: DailyLog | undefined,
  settings: Settings | undefined,
): number {
  return resolveOverlap(log, settings)
}

export function totalIntake(log: DailyLog | undefined): number | undefined {
  if (!log) return undefined
  const parts = [
    asFiniteNumber(log.breakfastKcal),
    asFiniteNumber(log.lunchKcal),
    asFiniteNumber(log.dinnerKcal),
    asFiniteNumber(log.extraKcal),
  ]
  if (parts.every((p) => p === undefined)) return undefined
  return parts.reduce<number>((sum, n) => sum + (n ?? 0), 0)
}

export function resolveBurn(
  log: DailyLog | undefined,
  settings: Settings | undefined,
): BurnBreakdown {
  const bmr = resolveBmr(log, settings)
  const overlap = resolveOverlap(log, settings)
  const band = asFiniteNumber(log?.bandBurnKcal) ?? 0
  if (settings?.burnSource === 'tdee') {
    const tdee = asFiniteNumber(settings.tdee) ?? 2300
    return { kcal: tdee, source: 'tdee', bmr, band, overlap }
  }
  return { kcal: bmr + band - overlap, source: 'bmr+band-overlap', bmr, band, overlap }
}

export function calorieDeficit(
  log: DailyLog | undefined,
  settings: Settings | undefined,
): number | undefined {
  const intake = totalIntake(log)
  if (intake === undefined) return undefined
  return resolveBurn(log, settings).kcal - intake
}

export function eqNum(n: number): string {
  return String(Math.round(n))
}

/** e.g. 1630 + 800 − 150 − 1600 = 680 */
export function formatDeficitEquation(
  log: DailyLog | undefined,
  settings: Settings | undefined,
): string {
  const intake = totalIntake(log)
  if (settings?.burnSource === 'tdee') {
    const tdee = asFiniteNumber(settings.tdee) ?? 2300
    if (intake == null) return `${eqNum(tdee)} − —`
    return `${eqNum(tdee)} − ${eqNum(intake)} = ${eqNum(tdee - intake)}`
  }
  const burn = resolveBurn(log, settings)
  if (intake == null) {
    return `${eqNum(burn.bmr)} + ${eqNum(burn.band)} − ${eqNum(burn.overlap)} − —`
  }
  const deficit = burn.kcal - intake
  return `${eqNum(burn.bmr)} + ${eqNum(burn.band)} − ${eqNum(burn.overlap)} − ${eqNum(intake)} = ${eqNum(deficit)}`
}

export function trainingTargetKcal(settings: Settings | undefined): number {
  const training = asFiniteNumber(settings?.trainingTargetKcal)
  if (training != null && training > 0) return training
  const legacy = asFiniteNumber(settings?.targetKcal)
  if (legacy != null && legacy > 0) return legacy
  return DEFAULT_TRAINING_TARGET_KCAL
}

export function restTargetKcal(settings: Settings | undefined): number {
  const rest = asFiniteNumber(settings?.restTargetKcal)
  if (rest != null && rest > 0) return rest
  return DEFAULT_REST_TARGET_KCAL
}

export function targetForKind(settings: Settings | undefined, kind: DayKind): number {
  return kind === 'train' ? trainingTargetKcal(settings) : restTargetKcal(settings)
}

export function dayKindLabel(kind: DayKind): '训练日' | '休息日' {
  return kind === 'train' ? '训练日' : '休息日'
}

export function resolveDayKind(
  log: DailyLog | undefined,
  sessions: { date: string }[] | undefined,
  date: string | undefined,
): DayKind {
  if (log?.dayKind === 'train' || log?.dayKind === 'rest') return log.dayKind
  const day = date ?? log?.date
  if (day && sessions?.some((session) => session.date === day)) return 'train'
  return 'rest'
}

/** Stored intake target wins. Otherwise the live target for that kind. */
export function resolveIntakeTarget(
  log: DailyLog | undefined,
  settings: Settings | undefined,
  kind?: DayKind,
): number {
  const stored = asFiniteNumber(log?.intakeTargetKcal)
  if (stored != null && stored > 0) return stored
  return targetForKind(settings, kind ?? resolveDayKind(log, undefined, log?.date))
}

export function vsTarget(
  log: DailyLog | undefined,
  settings: Settings | undefined,
  intakeTarget?: number,
): number | undefined {
  const intake = totalIntake(log)
  if (intake === undefined) return undefined
  const target = intakeTarget ?? resolveIntakeTarget(log, settings)
  return intake - target
}

export function logHasData(log: DailyLog): boolean {
  const { date: _date, ...rest } = log
  void _date
  return Object.values(rest).some((v) => {
    if (v === undefined || v === null) return false
    if (typeof v === 'string') return v.trim() !== ''
    if (typeof v === 'number') return Number.isFinite(v)
    return true
  })
}

export function rollingAverage(
  dates: string[],
  valueByDate: Map<string, number>,
  window = 7,
): (number | null)[] {
  return dates.map((date) => {
    const vals: number[] = []
    for (let i = window - 1; i >= 0; i -= 1) {
      const v = valueByDate.get(addDays(date, -i))
      if (v != null) vals.push(v)
    }
    if (vals.length === 0) return null
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length
    return Math.round(avg * 100) / 100
  })
}

export function linearTrend(values: (number | null)[]): (number | null)[] {
  const pts: { i: number; y: number }[] = []
  values.forEach((y, i) => {
    if (y != null) pts.push({ i, y })
  })
  if (pts.length < 2) return values.map(() => null)
  const n = pts.length
  const sumX = pts.reduce((s, p) => s + p.i, 0)
  const sumY = pts.reduce((s, p) => s + p.y, 0)
  const sumXY = pts.reduce((s, p) => s + p.i * p.y, 0)
  const sumXX = pts.reduce((s, p) => s + p.i * p.i, 0)
  const denom = n * sumXX - sumX * sumX
  if (denom === 0) return values.map(() => null)
  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  return values.map((_, i) => Math.round((intercept + slope * i) * 1000) / 1000)
}

export function formatInt(n: number | undefined | null): string {
  const x = asFiniteNumber(n)
  if (x == null) return '—'
  return Math.round(x).toLocaleString('zh-CN')
}

export function formatOne(n: number | undefined | null): string {
  const x = asFiniteNumber(n)
  if (x == null) return '—'
  return (Math.round(x * 10) / 10).toLocaleString('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })
}

export function kcalLabel(n: number | undefined, unit = '大卡'): string {
  if (asFiniteNumber(n) == null) return '—'
  return `${formatInt(n)} ${unit}`
}

export type StrengthMark = 'yes' | 'no' | 'empty'

export function strengthMark(v: boolean | undefined): StrengthMark {
  if (v === true) return 'yes'
  if (v === false) return 'no'
  return 'empty'
}
