import { asFiniteNumber, asInt, asIsoTime, asNonNeg, asNonNegInt, asString } from '@/lib/coerce'
import { defaultWorkout, hydrateWorkout } from '@/lib/workout'
import {
  DATA_VERSION,
  DEFAULT_BMR_KCAL,
  DEFAULT_OVERLAP_KCAL,
  DEFAULT_SETTINGS,
  DEFAULT_TRAINING_TARGET_KCAL,
  emptyData,
  type AppData,
  type DailyLog,
  type DayKind,
  type Settings,
  type Tombstones,
  type WorkoutSession,
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
  const training = asInt(row.trainingTargetKcal)
  const rest = asInt(row.restTargetKcal)
  const tdee = asInt(row.tdee)
  const protein = asInt(row.proteinTarget)
  const bmr = asInt(row.bmrDefaultKcal)
  const overlapNew = asNonNegInt(row.overlapDefaultKcal)
  const overlapOld = asNonNegInt(row.extraBurnDefaultKcal)
  const scoops = asNonNeg(row.lastProteinScoops)
  const overlapDefaultKcal = opts?.migrateOverlap
    ? DEFAULT_OVERLAP_KCAL
    : (overlapNew ?? overlapOld ?? DEFAULT_OVERLAP_KCAL)
  const targetKcal = target != null && target > 0 ? target : base.targetKcal
  return {
    displayName: asString(row.displayName),
    targetKcal,
    trainingTargetKcal: training != null && training > 0 ? training : targetKcal,
    restTargetKcal: rest != null && rest > 0 ? rest : base.restTargetKcal,
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
  if (row.dayKind === 'train' || row.dayKind === 'rest') log.dayKind = row.dayKind
  if (row.dayKindManual === true) log.dayKindManual = true
  const intakeTargetKcal = asInt(row.intakeTargetKcal)
  if (intakeTargetKcal != null && intakeTargetKcal > 0) log.intakeTargetKcal = intakeTargetKcal
  const updatedAt = asIsoTime(row.updatedAt)
  if (updatedAt) log.updatedAt = updatedAt
  return log
}

/**
 * Old logs had one shared target. Freeze that number onto the day so a later
 * split into training/rest targets does not rewrite history. updatedAt stays.
 */
export function stampLegacyDayTargets(
  logs: DailyLog[],
  sessions: Pick<WorkoutSession, 'date'>[],
  legacyTargetKcal: number,
): DailyLog[] {
  const trained = new Set(sessions.map((session) => session.date))
  const legacy =
    legacyTargetKcal > 0 ? Math.round(legacyTargetKcal) : DEFAULT_TRAINING_TARGET_KCAL
  return logs.map((log) => {
    const hasKind = log.dayKind === 'train' || log.dayKind === 'rest'
    const hasTarget = typeof log.intakeTargetKcal === 'number' && log.intakeTargetKcal > 0
    if (hasKind && hasTarget) return log
    const next: DailyLog = { ...log }
    if (!hasKind) {
      const kind: DayKind = trained.has(log.date) || log.strengthTraining === true ? 'train' : 'rest'
      next.dayKind = kind
    }
    if (!hasTarget) next.intakeTargetKcal = legacy
    return next
  })
}

export function hydrateTombstones(raw: unknown): Tombstones {
  const logs: Record<string, string> = {}
  const sessions: Record<string, string> = {}
  const plans: Record<string, string> = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { logs, sessions, plans }
  const row = raw as Record<string, unknown>
  const readMap = (value: unknown, into: Record<string, string>) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    for (const [key, stamp] of Object.entries(value as Record<string, unknown>)) {
      const iso = asIsoTime(stamp)
      if (iso) into[key] = iso
    }
  }
  readMap(row.logs, logs)
  readMap(row.sessions, sessions)
  readMap(row.plans, plans)
  return { logs, sessions, plans }
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
    const settings = hydrateSettings(root.settings, { migrateOverlap })
    const workout = hydrateWorkout(root.workout as AppData['workout'])
    return {
      version: DATA_VERSION,
      settings,
      settingsUpdatedAt: asIsoTime(root.settingsUpdatedAt),
      logs: stampLegacyDayTargets(logs, workout.sessions, settings.targetKcal),
      workout,
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
