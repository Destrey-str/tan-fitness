import { asFiniteNumber, asInt, asIsoTime, asNonNeg, asNonNegInt, asString } from '@/lib/coerce'
import { defaultWorkout, hydrateWorkout } from '@/lib/workout'
import {
  DATA_VERSION,
  DEFAULT_BMR_KCAL,
  DEFAULT_OVERLAP_KCAL,
  DEFAULT_SETTINGS,
  emptyData,
  type AppData,
  type DailyLog,
  type Settings,
  type Tombstones,
} from '@/types'

const STORAGE_KEY = 'jianzhi-log-v1'

export function unwrapStoredPayload(parsed: unknown): Record<string, unknown> {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const obj = parsed as Record<string, unknown>
  if (
    (obj.kind === 'jianzhi-notes-backup' || obj.data != null) &&
    obj.data &&
    typeof obj.data === 'object' &&
    !Array.isArray(obj.data)
  ) {
    return unwrapStoredPayload(obj.data)
  }
  if (!Array.isArray(obj.logs) && obj.localStorage && typeof obj.localStorage === 'object') {
    const bag = obj.localStorage as Record<string, unknown>
    const inner = bag[STORAGE_KEY]
    if (typeof inner === 'string' && inner.trim()) {
      try {
        return unwrapStoredPayload(JSON.parse(inner) as unknown)
      } catch {
        /* keep going */
      }
    }
  }
  return obj
}

export function hydrateSettings(
  raw?: Partial<Settings> | null | unknown,
  opts?: { migrateOverlap?: boolean },
): Settings {
  const base = { ...DEFAULT_SETTINGS }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const row = raw as Record<string, unknown>
  const target = asInt(row.targetKcal)
  const tdee = asInt(row.tdee)
  const protein = asInt(row.proteinTarget)
  const bmr = asInt(row.bmrDefaultKcal)
  const overlapNew = asNonNegInt(row.overlapDefaultKcal)
  const overlapOld = asNonNegInt(row.extraBurnDefaultKcal)
  const scoops = asNonNeg(row.lastProteinScoops)
  const overlapDefaultKcal = opts?.migrateOverlap
    ? DEFAULT_OVERLAP_KCAL
    : (overlapNew ?? overlapOld ?? DEFAULT_OVERLAP_KCAL)
  return {
    displayName: asString(row.displayName),
    targetKcal: target != null && target > 0 ? target : base.targetKcal,
    tdee: tdee != null && tdee > 0 ? tdee : base.tdee,
    proteinTarget: protein != null && protein > 0 ? protein : base.proteinTarget,
    burnSource: row.burnSource === 'tdee' ? 'tdee' : 'band',
    bmrDefaultKcal: bmr != null && bmr > 0 ? bmr : DEFAULT_BMR_KCAL,
    overlapDefaultKcal,
    lastProteinScoops: scoops,
  }
}

export function hydrateLog(raw: unknown, opts?: { migrateOverlap?: boolean }): DailyLog | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const date = asString(row.date).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const log: DailyLog = { date }
  const weightKg = asFiniteNumber(row.weightKg)
  if (weightKg != null) log.weightKg = weightKg
  const waistCm = asFiniteNumber(row.waistCm)
  if (waistCm != null) log.waistCm = waistCm
  const yesterdaySteps = asNonNegInt(row.yesterdaySteps)
  if (yesterdaySteps != null) log.yesterdaySteps = yesterdaySteps
  if (row.strengthTraining === true || row.strengthTraining === 'true' || row.strengthTraining === 1) {
    log.strengthTraining = true
  } else if (
    row.strengthTraining === false ||
    row.strengthTraining === 'false' ||
    row.strengthTraining === 0
  ) {
    log.strengthTraining = false
  }
  const cardioMinutes = asNonNegInt(row.cardioMinutes)
  if (cardioMinutes != null) log.cardioMinutes = cardioMinutes
  const proteinScoops = asNonNeg(row.proteinScoops)
  if (proteinScoops != null) log.proteinScoops = proteinScoops
  const breakfastKcal = asNonNegInt(row.breakfastKcal)
  if (breakfastKcal != null) log.breakfastKcal = breakfastKcal
  const lunchKcal = asNonNegInt(row.lunchKcal)
  if (lunchKcal != null) log.lunchKcal = lunchKcal
  const dinnerKcal = asNonNegInt(row.dinnerKcal)
  if (dinnerKcal != null) log.dinnerKcal = dinnerKcal
  const extraKcal = asNonNegInt(row.extraKcal)
  if (extraKcal != null) log.extraKcal = extraKcal
  const extraNote = asString(row.extraNote)
  if (extraNote) log.extraNote = extraNote
  const bmrKcal = asInt(row.bmrKcal)
  if (bmrKcal != null && bmrKcal > 0) log.bmrKcal = bmrKcal
  const overlapDirect = asNonNegInt(row.overlapKcal)
  const extraBurnLegacy = asNonNegInt(row.extraBurnKcal)
  if (opts?.migrateOverlap) {
    // v1 extraBurn was added to burn; do not reuse that number as overlap.
    log.overlapKcal = overlapDirect ?? DEFAULT_OVERLAP_KCAL
  } else if (overlapDirect != null) {
    log.overlapKcal = overlapDirect
  } else if (extraBurnLegacy != null) {
    log.overlapKcal = extraBurnLegacy
  }
  const bandBurnKcal = asNonNegInt(row.bandBurnKcal)
  if (bandBurnKcal != null) log.bandBurnKcal = bandBurnKcal
  const notes = asString(row.notes)
  if (notes) log.notes = notes
  const updatedAt = asIsoTime(row.updatedAt)
  if (updatedAt) log.updatedAt = updatedAt
  return log
}

export function hydrateTombstones(raw: unknown): Tombstones {
  const logs: Record<string, string> = {}
  const sessions: Record<string, string> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { logs, sessions }
  const row = raw as Record<string, unknown>
  if (row.logs && typeof row.logs === 'object' && !Array.isArray(row.logs)) {
    for (const [key, value] of Object.entries(row.logs as Record<string, unknown>)) {
      const iso = asIsoTime(value)
      if (iso) logs[key] = iso
    }
  }
  if (row.sessions && typeof row.sessions === 'object' && !Array.isArray(row.sessions)) {
    for (const [key, value] of Object.entries(row.sessions as Record<string, unknown>)) {
      const iso = asIsoTime(value)
      if (iso) sessions[key] = iso
    }
  }
  return { logs, sessions }
}

export function hydrateAppData(parsed: unknown): AppData {
  try {
    const root = unwrapStoredPayload(parsed)
    const storedVersion = asInt(root.version) ?? 1
    const migrateOverlap = storedVersion < 2
    const logs = Array.isArray(root.logs)
      ? root.logs
          .map((row) => hydrateLog(row, { migrateOverlap }))
          .filter((row): row is DailyLog => row != null)
      : []
    logs.sort((a, b) => a.date.localeCompare(b.date))
    return {
      version: DATA_VERSION,
      settings: hydrateSettings(root.settings, { migrateOverlap }),
      settingsUpdatedAt: asIsoTime(root.settingsUpdatedAt),
      logs,
      workout: hydrateWorkout(root.workout as AppData['workout']),
      tombstones: hydrateTombstones(root.tombstones),
    }
  } catch {
    return { ...emptyData(), workout: defaultWorkout() }
  }
}

export type ParseStoredResult =
  | { ok: true; data: AppData }
  | { ok: false; error: string; data: AppData; raw: string }

export function parseStoredPayload(raw: string | null): ParseStoredResult {
  if (!raw) {
    return { ok: true, data: { ...emptyData(), workout: defaultWorkout() } }
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    return { ok: true, data: hydrateAppData(parsed) }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'JSON 无法解析',
      data: { ...emptyData(), workout: defaultWorkout() },
      raw,
    }
  }
}
