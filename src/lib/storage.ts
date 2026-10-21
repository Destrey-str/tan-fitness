import { addDays, nowIso, todayIso } from '@/lib/dates'
import { isSecretKey } from '@/lib/sync/config'
import { mergeTombstones, normalizeTombstones } from '@/lib/sync/merge'
import {
  hydrateAppData,
  hydrateLog,
  hydrateSettings,
  parseStoredPayload,
} from '@/lib/hydrate'
import { logHasData, resolveDayKind, targetForKind, trainingTargetKcal } from '@/lib/stats'
import {
  clampRest,
  cloneTemplates,
  DEFAULT_PLAN_ID,
  defaultTanPlan,
  defaultWorkout,
  hydrateWorkout,
  indexLastPerformances,
  lookupLastPerformance,
  lookupWeightMemory,
  nextUnfinishedExerciseIndex,
  resolvePlannedWeights,
  sessionRestLength,
  withActivePlan,
} from '@/lib/workout'
import {
  DATA_VERSION,
  DEFAULT_BMR_KCAL,
  DEFAULT_OVERLAP_KCAL,
  emptyData,
  type AppData,
  type DailyLog,
  type DayKind,
  type Settings,
  type TrainingPlan,
  type WorkoutSession,
  type WorkoutStore,
  type WorkoutTemplate,
} from '@/types'

export const STORAGE_KEY = 'jianzhi-log-v1'

/** When true, persist() will not overwrite localStorage (corrupt JSON). */
let storageReadOnly = false
let lastRaw: string | null = null
let loadError: string | null = null

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function load(): AppData {
  try {
    const raw = readRaw()
    lastRaw = raw
    const parsed = parseStoredPayload(raw)
    if (!parsed.ok) {
      storageReadOnly = true
      loadError = parsed.error
      return parsed.data
    }
    storageReadOnly = false
    loadError = null
    return parsed.data
  } catch (err) {
    storageReadOnly = true
    loadError = err instanceof Error ? err.message : '读取失败'
    return { ...emptyData(), workout: defaultWorkout() }
  }
}

let data: AppData = load()
const listeners = new Set<() => void>()
const mutationListeners = new Set<() => void>()

function persist() {
  if (storageReadOnly) return
  try {
    const serialized = JSON.stringify(data)
    localStorage.setItem(STORAGE_KEY, serialized)
    lastRaw = serialized
  } catch {
    // quota / private mode — keep in-memory data, never wipe
  }
}

export function getLoadError(): string | null {
  return loadError
}

export function isStorageReadOnly(): boolean {
  return storageReadOnly
}

/** Raw localStorage dump for crash recovery. Never clears keys. */
export function exportRawStorage(): string {
  const bag: Record<string, string> = {}
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key || isSecretKey(key)) continue
      bag[key] = localStorage.getItem(key) ?? ''
    }
  } catch {
    if (lastRaw != null) bag[STORAGE_KEY] = lastRaw
  }
  let snapshot: AppData | undefined
  try {
    snapshot = data
  } catch {
    snapshot = undefined
  }
  return JSON.stringify(
    {
      kind: 'jianzhi-notes-backup',
      exportedAt: new Date().toISOString(),
      loadError,
      data: snapshot,
      localStorage: bag,
    },
    null,
    2,
  )
}

function emit(origin: 'local' | 'remote' = 'local') {
  persist()
  listeners.forEach((l) => l())
  if (origin === 'local') mutationListeners.forEach((l) => l())
}

function tombstones() {
  return {
    logs: { ...(data.tombstones?.logs ?? {}) },
    sessions: { ...(data.tombstones?.sessions ?? {}) },
    plans: { ...(data.tombstones?.plans ?? {}) },
  }
}

export function subscribeMutations(listener: () => void): () => void {
  mutationListeners.add(listener)
  return () => {
    mutationListeners.delete(listener)
  }
}

export function applySyncedData(next: AppData) {
  data = hydrateAppData(next)
  emit('remote')
}

export function getSnapshot(): AppData {
  if (!data || typeof data !== 'object') {
    data = { ...emptyData(), workout: defaultWorkout() }
  }
  if (!data.settings) data = { ...data, settings: hydrateSettings(null) }
  if (!Array.isArray(data.logs)) data = { ...data, logs: [] }
  if (!data.workout) data = { ...data, workout: defaultWorkout() }
  if (!data.tombstones) data = { ...data, tombstones: { logs: {}, sessions: {} } }
  return data
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return
    const parsed = parseStoredPayload(event.newValue)
    if (!parsed.ok) return
    lastRaw = event.newValue
    data = parsed.data
    listeners.forEach((l) => l())
  })
}

export function updateSettings(patch: Partial<Settings>) {
  data = {
    ...data,
    settings: hydrateSettings({ ...data.settings, ...patch }),
    settingsUpdatedAt: nowIso(),
  }
  emit()
}

export function upsertLog(date: string, patch: Partial<DailyLog>) {
  const existing = data.logs.find((l) => l.date === date)
  const isNew = !existing
  const hydratedPatch = hydrateLog({ date, ...existing, ...patch }) ?? {
    date,
    ...existing,
    ...patch,
  }
  const next: DailyLog = hydratedPatch
  if (isNew) {
    if (!('overlapKcal' in patch) && next.overlapKcal == null) {
      next.overlapKcal = data.settings.overlapDefaultKcal ?? DEFAULT_OVERLAP_KCAL
    }
    if (!('bmrKcal' in patch) && next.bmrKcal == null) {
      next.bmrKcal = data.settings.bmrDefaultKcal ?? DEFAULT_BMR_KCAL
    }
    if (!('proteinScoops' in patch) && next.proteinScoops == null) {
      next.proteinScoops = data.settings.lastProteinScoops
    }
  }
  let settings = data.settings
  if (
    typeof patch.overlapKcal === 'number' &&
    Number.isFinite(patch.overlapKcal) &&
    patch.overlapKcal >= 0
  ) {
    settings = { ...settings, overlapDefaultKcal: Math.round(patch.overlapKcal) }
    next.overlapKcal = settings.overlapDefaultKcal
  }
  if (
    typeof patch.bmrKcal === 'number' &&
    Number.isFinite(patch.bmrKcal) &&
    patch.bmrKcal > 0
  ) {
    settings = { ...settings, bmrDefaultKcal: Math.round(patch.bmrKcal) }
    next.bmrKcal = settings.bmrDefaultKcal
  }
  if (typeof patch.proteinScoops === 'number' && Number.isFinite(patch.proteinScoops)) {
    settings = { ...settings, lastProteinScoops: patch.proteinScoops }
  }
  const sessions = data.workout?.sessions ?? []
  if (next.dayKind !== 'train' && next.dayKind !== 'rest') {
    next.dayKind = resolveDayKind(undefined, sessions, date)
  }
  if (!(typeof next.intakeTargetKcal === 'number' && next.intakeTargetKcal > 0)) {
    next.intakeTargetKcal = targetForKind(settings, next.dayKind ?? 'rest')
  }
  next.updatedAt = nowIso()
  const stones = tombstones()
  delete stones.logs[date]
  const logs = data.logs.filter((l) => l.date !== date)
  if (logHasData(next)) {
    logs.push(next)
    logs.sort((a, b) => a.date.localeCompare(b.date))
  }
  const settingsChanged = settings !== data.settings
  data = {
    ...data,
    logs,
    settings,
    settingsUpdatedAt: settingsChanged ? nowIso() : data.settingsUpdatedAt,
    tombstones: stones,
  }
  emit()
}

export function setDayKind(date: string, kind: DayKind) {
  const existing = data.logs.find((l) => l.date === date)
  const target = targetForKind(data.settings, kind)
  if (
    existing?.dayKindManual === true &&
    existing.dayKind === kind &&
    existing.intakeTargetKcal === target
  ) {
    return
  }
  upsertLog(date, { dayKind: kind, dayKindManual: true, intakeTargetKcal: target })
}

export function deleteLog(date: string) {
  const stones = tombstones()
  stones.logs[date] = nowIso()
  data = {
    ...data,
    logs: data.logs.filter((l) => l.date !== date),
    tombstones: stones,
  }
  emit()
}

export function replaceAll(next: AppData) {
  storageReadOnly = false
  loadError = null
  data = hydrateAppData(next)
  emit()
}

export function mergeImported(incoming: AppData) {
  storageReadOnly = false
  loadError = null
  const incomingData = hydrateAppData(incoming)
  const logMap = new Map(data.logs.map((l) => [l.date, l]))
  for (const log of incomingData.logs) logMap.set(log.date, log)
  const current = data.workout ?? defaultWorkout()
  const incomingWorkout = incomingData.workout ?? defaultWorkout()
  const sessMap = new Map(current.sessions.map((s) => [s.id, s]))
  for (const session of incomingWorkout.sessions) sessMap.set(session.id, session)
  const stones = mergeTombstones(
    normalizeTombstones(data.tombstones),
    normalizeTombstones(incomingData.tombstones),
  )
  for (const log of incomingData.logs) delete stones.logs[log.date]
  for (const session of incomingWorkout.sessions) delete stones.sessions[session.id]
  const planMap = new Map((current.plans ?? []).map((plan) => [plan.id, plan]))
  for (const plan of incomingWorkout.plans ?? []) {
    planMap.set(plan.id, plan)
    delete stones.plans?.[plan.id]
  }
  data = {
    version: DATA_VERSION,
    settings: hydrateSettings({ ...data.settings, ...incomingData.settings }),
    settingsUpdatedAt: nowIso(),
    logs: [...logMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    workout: hydrateWorkout({
      restSecDefault: incomingWorkout.restSecDefault ?? current.restSecDefault,
      restSecUpdatedAt: incomingWorkout.restSecUpdatedAt ?? current.restSecUpdatedAt,
      templates:
        incomingWorkout.templates.length > 0 ? incomingWorkout.templates : current.templates,
      templatesUpdatedAt: incomingWorkout.templatesUpdatedAt ?? current.templatesUpdatedAt,
      plans: [...planMap.values()],
      activePlanId: incomingWorkout.activePlanId ?? current.activePlanId,
      activePlanUpdatedAt: incomingWorkout.activePlanUpdatedAt ?? current.activePlanUpdatedAt,
      sessions: [...sessMap.values()],
      activeSessionId: incomingWorkout.activeSessionId ?? current.activeSessionId,
    }),
    tombstones: stones,
  }
  emit()
}

export function clearAll() {
  storageReadOnly = false
  loadError = null
  const stamped = nowIso()
  const revived = new Date(Date.parse(stamped) + 1).toISOString()
  const stones = tombstones()
  for (const log of data.logs) stones.logs[log.date] = stamped
  for (const session of data.workout?.sessions ?? []) stones.sessions[session.id] = stamped
  for (const plan of data.workout?.plans ?? []) stones.plans[plan.id] = stamped
  const fresh = defaultWorkout()
  fresh.plans = fresh.plans.map((plan) => ({ ...plan, updatedAt: revived }))
  fresh.activePlanUpdatedAt = revived
  fresh.templatesUpdatedAt = revived
  data = {
    ...emptyData(),
    workout: fresh,
    settingsUpdatedAt: stamped,
    tombstones: stones,
  }
  emit()
}

export function exportJson(): string {
  return exportRawStorage()
}

export function parseImport(raw: string): AppData {
  const parsed = parseStoredPayload(raw)
  if (!parsed.ok) {
    throw new Error(parsed.error || '文件格式不正确')
  }
  if (parsed.data.logs.length === 0 && !raw.includes('"logs"')) {
    throw new Error('缺少 logs 数组')
  }
  return parsed.data
}

export function seedSampleLogs() {
  const logs: DailyLog[] = []
  for (let i = 13; i >= 0; i -= 1) {
    const date = addDays(todayIso(), -i)
    const wave = Math.sin(i / 2.4)
    const weightKg = Math.round((69.3 - i * 0.04 + wave * 0.15) * 10) / 10
    const waistCm = Math.round((85.4 - i * 0.05 + wave * 0.2) * 10) / 10
    const breakfastKcal = 430 + (i % 3) * 20
    const lunchKcal = 500 + (i % 4) * 30
    const dinnerKcal = 480 + (i % 2) * 20
    const extraKcal = i % 3 === 0 ? 230 : 120
    const bandBurnKcal = 820 + (i % 5) * 40 + (i % 2) * 80
    logs.push({
      date,
      weightKg,
      waistCm,
      yesterdaySteps: 1800 + i * 280 + (i % 2) * 900,
      strengthTraining: i % 3 !== 1,
      cardioMinutes: i % 3 === 1 ? 60 : 22 + (i % 4) * 5,
      proteinScoops: 1,
      breakfastKcal,
      lunchKcal,
      dinnerKcal,
      extraKcal,
      extraNote: extraKcal === 230 ? '120+110' : undefined,
      overlapKcal: DEFAULT_OVERLAP_KCAL,
      bmrKcal: DEFAULT_BMR_KCAL,
      bandBurnKcal,
      notes: i % 5 === 0 ? '力量训练后有点饿，晚饭蛋白够了' : undefined,
    })
  }
  const stamped = nowIso()
  data = {
    ...data,
    logs: logs.map((log) => ({ ...log, updatedAt: stamped })),
    settings: { ...data.settings, lastProteinScoops: 1 },
    settingsUpdatedAt: stamped,
    workout: data.workout ?? defaultWorkout(),
  }
  emit()
}

function currentWorkout() {
  return data.workout ?? defaultWorkout()
}

function setWorkout(next: ReturnType<typeof currentWorkout>) {
  data = { ...data, workout: next }
  emit()
}

function cloneSession(session: WorkoutSession): WorkoutSession {
  return {
    ...session,
    setHistory: session.setHistory?.slice(),
    exercises: session.exercises.map((e) => ({
      ...e,
      setLogs: e.setLogs?.map((log) => ({ ...log })),
      plannedWeights: e.plannedWeights?.slice(),
    })),
  }
}

function roundWeight(weightKg: number | undefined): number | undefined {
  if (typeof weightKg !== 'number' || !Number.isFinite(weightKg) || weightKg < 0) return undefined
  return Math.round(weightKg * 100) / 100
}

export function setRestDefault(sec: number) {
  const w = currentWorkout()
  setWorkout({ ...w, restSecDefault: clampRest(sec), restSecUpdatedAt: nowIso() })
}

export function startWorkoutSession(date: string, templateId: string, restSec?: number) {
  const w = currentWorkout()
  const template =
    w.templates.find((t) => t.id === templateId) ??
    defaultWorkout().templates.find((t) => t.id === templateId)
  if (!template || template.exercises.length === 0) return
  const history = indexLastPerformances(w.sessions, w.activeSessionId)
  const session: WorkoutSession = {
    id: crypto.randomUUID(),
    date,
    templateId,
    templateName: template.name,
    restSec: clampRest(restSec ?? w.restSecDefault),
    startedAt: new Date().toISOString(),
    currentExerciseIndex: 0,
    updatedAt: nowIso(),
    exercises: template.exercises.map((e) => {
      const past = e.isWarmup ? undefined : lookupLastPerformance(history, e.id, e.name)
      const memory = e.isWarmup ? undefined : lookupWeightMemory(w.weightMemory, e.id, e.name)
      const planned = e.isWarmup
        ? undefined
        : resolvePlannedWeights({ setCount: e.sets, history: past, memory })
      const first = planned?.weights[0]
      return {
        exerciseId: e.id,
        name: e.name,
        targetSets: e.sets,
        repsMin: e.repsMin,
        repsMax: e.repsMax,
        note: e.note,
        restSec: e.restSec,
        setsDone: 0,
        isWarmup: e.isWarmup,
        setLogs: [],
        plannedWeights: planned?.weights.map((n) => (typeof n === 'number' ? n : null)),
        nextWeightKg: typeof first === 'number' ? first : undefined,
        lastWeightHint: planned?.hint,
      }
    }),
  }
  setWorkout({
    ...w,
    sessions: [...w.sessions, session],
    activeSessionId: session.id,
  })
  promoteTrainingDay(date)
}

/** A new session makes a non-manual rest day a training day. Existing training targets stay. */
function promoteTrainingDay(date: string) {
  const existing = data.logs.find((l) => l.date === date)
  if (!existing || existing.dayKindManual === true) return
  if (existing.dayKind === 'train') return
  upsertLog(date, {
    dayKind: 'train',
    intakeTargetKcal: trainingTargetKcal(data.settings),
  })
}

const completeLockUntil = new Map<string, number>()

export function completeWorkoutSet(sessionId: string) {
  const now = Date.now()
  const lockUntil = completeLockUntil.get(sessionId) ?? 0
  if (now < lockUntil) return
  const w = currentWorkout()
  const session = w.sessions.find((s) => s.id === sessionId)
  if (!session || session.completedAt) return
  if (session.restEndsAt) return
  const next = cloneSession(session)
  const idx = next.currentExerciseIndex
  const ex = next.exercises[idx]
  if (!ex || ex.setsDone >= ex.targetSets) return
  completeLockUntil.set(sessionId, now + 500)
  const loggedKg = typeof ex.nextWeightKg === 'number' ? ex.nextWeightKg : undefined
  if (!ex.isWarmup) {
    const logs = [...(ex.setLogs ?? [])]
    logs.push({
      weightKg: loggedKg,
    })
    ex.setLogs = logs
  }
  ex.setsDone += 1
  next.setHistory = [...(next.setHistory ?? []), idx]
  const allDone = next.exercises.every((e) => e.setsDone >= e.targetSets)
  const exerciseDone = ex.setsDone >= ex.targetSets
  if (allDone) {
    next.restEndsAt = undefined
    next.restLockUntil = undefined
    next.restAdvanceFrom = undefined
  } else if (ex.isWarmup) {
    next.restEndsAt = undefined
    next.restLockUntil = undefined
    next.restAdvanceFrom = undefined
    if (exerciseDone) {
      const nxt = nextUnfinishedExerciseIndex(next.exercises, idx)
      if (nxt != null) next.currentExerciseIndex = nxt
    }
  } else {
    next.restEndsAt = now + sessionRestLength(next) * 1000
    next.restLockUntil = now + 500
    next.restAdvanceFrom = exerciseDone ? idx : undefined
    if (!exerciseDone) {
      const planned = ex.plannedWeights?.[ex.setsDone]
      if (typeof planned === 'number') ex.nextWeightKg = planned
      else if (typeof loggedKg === 'number') ex.nextWeightKg = loggedKg
    }
  }
  next.updatedAt = nowIso()
  setWorkout({
    ...w,
    sessions: w.sessions.map((s) => (s.id === sessionId ? next : s)),
  })
}

export function endWorkoutRest(sessionId: string) {
  const w = currentWorkout()
  const session = w.sessions.find((s) => s.id === sessionId)
  if (!session || session.restEndsAt == null) return
  if (session.restLockUntil && Date.now() < session.restLockUntil) return
  patchWorkoutSession(sessionId, (s) => {
    const advanceFrom = s.restAdvanceFrom
    s.restEndsAt = undefined
    s.restLockUntil = undefined
    s.restAdvanceFrom = undefined
    if (advanceFrom == null || s.currentExerciseIndex !== advanceFrom) return
    const ex = s.exercises[s.currentExerciseIndex]
    if (!ex || ex.setsDone < ex.targetSets) return
    const nxt = nextUnfinishedExerciseIndex(s.exercises, s.currentExerciseIndex)
    if (nxt != null) s.currentExerciseIndex = nxt
  })
}

export function undoLastWorkoutSet(sessionId: string) {
  const w = currentWorkout()
  const session = w.sessions.find((s) => s.id === sessionId)
  if (!session || session.completedAt) return
  const next = cloneSession(session)
  next.restEndsAt = undefined
  next.restLockUntil = undefined
  next.restAdvanceFrom = undefined
  const hist = next.setHistory ?? []
  let idx = next.currentExerciseIndex
  if (hist.length > 0) {
    idx = hist[hist.length - 1]!
    next.setHistory = hist.slice(0, -1)
  }
  let ex = next.exercises[idx]
  if (!ex) return
  if (ex.setsDone <= 0) {
    if (hist.length > 0) return
    if (idx <= 0) return
    idx -= 1
    ex = next.exercises[idx]
    if (!ex || ex.setsDone <= 0) return
  }
  next.currentExerciseIndex = idx
  ex.setsDone -= 1
  if (ex.setLogs && ex.setLogs.length > 0) {
    const undone = ex.setLogs[ex.setLogs.length - 1]
    ex.setLogs = ex.setLogs.slice(0, -1)
    ex.nextWeightKg = typeof undone?.weightKg === 'number' ? undone.weightKg : undefined
  }
  completeLockUntil.delete(sessionId)
  next.updatedAt = nowIso()
  setWorkout({
    ...w,
    sessions: w.sessions.map((s) => (s.id === sessionId ? next : s)),
  })
}

export function skipWorkoutRest(sessionId: string) {
  endWorkoutRest(sessionId)
}

export function addWorkoutRest(sessionId: string, extraSec: number) {
  patchWorkoutSession(sessionId, (s) => {
    const base = s.restEndsAt && s.restEndsAt > Date.now() ? s.restEndsAt : Date.now()
    s.restEndsAt = base + extraSec * 1000
  })
}

export function extendWorkoutRest(sessionId: string) {
  const w = currentWorkout()
  const session = w.sessions.find((s) => s.id === sessionId)
  if (!session) return
  addWorkoutRest(sessionId, sessionRestLength(session))
}

export function setSessionRestSec(sessionId: string, sec: number) {
  patchWorkoutSession(sessionId, (s) => {
    s.restSec = clampRest(sec)
  })
}

export function setExerciseWeightNote(sessionId: string, exerciseId: string, weightNote: string) {
  patchWorkoutSession(sessionId, (s) => {
    const ex = s.exercises.find((e) => e.exerciseId === exerciseId)
    if (ex) ex.weightNote = weightNote || undefined
  })
}

export function setExerciseNextWeight(
  sessionId: string,
  exerciseId: string,
  weightKg: number | undefined,
) {
  const w = currentWorkout()
  const session = w.sessions.find((s) => s.id === sessionId)
  const ex = session?.exercises.find((e) => e.exerciseId === exerciseId)
  if (!session || !ex || ex.isWarmup) return
  const nextKg = roundWeight(weightKg)
  if (ex.nextWeightKg === nextKg) return
  patchWorkoutSession(sessionId, (s) => {
    const target = s.exercises.find((e) => e.exerciseId === exerciseId)
    if (!target || target.isWarmup) return
    target.nextWeightKg = nextKg
  })
}

export function setExerciseSeedWeights(
  exerciseId: string,
  name: string,
  weights: (number | undefined | null)[],
) {
  const cleaned = weights.map((n) => roundWeight(typeof n === 'number' ? n : undefined) ?? null)
  const w = currentWorkout()
  const memory = [...(w.weightMemory ?? [])]
  const idx = memory.findIndex((entry) => entry.exerciseId === exerciseId)
  const prev = idx >= 0 ? memory[idx] : undefined
  if (
    prev &&
    prev.name === name &&
    prev.weights.length === cleaned.length &&
    prev.weights.every((n, i) => n === cleaned[i])
  ) {
    return
  }
  const entry = {
    exerciseId,
    name,
    weights: cleaned,
    updatedAt: nowIso(),
  }
  if (idx >= 0) memory[idx] = entry
  else memory.push(entry)
  setWorkout({ ...w, weightMemory: memory })
}

export function selectWorkoutExercise(sessionId: string, index: number) {
  const w = currentWorkout()
  const session = w.sessions.find((s) => s.id === sessionId)
  if (!session || session.completedAt) return
  if (
    index === session.currentExerciseIndex &&
    session.restEndsAt == null &&
    session.restAdvanceFrom == null
  ) {
    return
  }
  patchWorkoutSession(sessionId, (s) => {
    if (index < 0 || index >= s.exercises.length) return
    s.currentExerciseIndex = index
    s.restEndsAt = undefined
    s.restLockUntil = undefined
    s.restAdvanceFrom = undefined
  })
}

export function finishWorkoutSession(sessionId: string, markStrength: boolean) {
  const w = currentWorkout()
  const session = w.sessions.find((s) => s.id === sessionId)
  if (!session) return
  const next = cloneSession(session)
  next.completedAt = new Date().toISOString()
  next.updatedAt = nowIso()
  next.restEndsAt = undefined
  next.markedStrength = markStrength
  setWorkout({
    ...w,
    sessions: w.sessions.map((s) => (s.id === sessionId ? next : s)),
    activeSessionId: w.activeSessionId === sessionId ? undefined : w.activeSessionId,
  })
  if (markStrength) {
    upsertLog(next.date, { strengthTraining: true })
  }
}

export function abandonWorkoutSession(sessionId: string) {
  const w = currentWorkout()
  const stones = tombstones()
  stones.sessions[sessionId] = nowIso()
  data = { ...data, tombstones: stones }
  setWorkout({
    ...w,
    sessions: w.sessions.filter((s) => s.id !== sessionId),
    activeSessionId: w.activeSessionId === sessionId ? undefined : w.activeSessionId,
  })
}

export function resetWorkoutTemplates() {
  const w = currentWorkout()
  const now = nowIso()
  const restored = defaultTanPlan(now)
  const plans = (w.plans ?? []).some((plan) => plan.id === DEFAULT_PLAN_ID)
    ? w.plans.map((plan) => (plan.id === DEFAULT_PLAN_ID ? restored : plan))
    : [restored, ...(w.plans ?? [])]
  setWorkout(
    withActivePlan({
      ...w,
      plans,
      activePlanId: DEFAULT_PLAN_ID,
      activePlanUpdatedAt: now,
      restSecDefault: defaultWorkout().restSecDefault,
      restSecUpdatedAt: now,
      templatesUpdatedAt: now,
    }),
  )
}

function commitPlans(plans: TrainingPlan[], extra: Partial<WorkoutStore> = {}) {
  const w = currentWorkout()
  const activeId = extra.activePlanId ?? w.activePlanId
  const touchesActive = activeId === w.activePlanId || extra.activePlanId != null
  setWorkout(
    withActivePlan({
      ...w,
      ...extra,
      plans,
      activePlanId: activeId,
      templatesUpdatedAt: touchesActive ? nowIso() : w.templatesUpdatedAt,
    }),
  )
}

export function setActivePlan(planId: string) {
  const w = currentWorkout()
  if (!w.plans.some((plan) => plan.id === planId) || w.activePlanId === planId) return
  commitPlans(w.plans, { activePlanId: planId, activePlanUpdatedAt: nowIso() })
}

export function createPlan(name: string, copyFromId?: string): string {
  const w = currentWorkout()
  const id = `plan-${crypto.randomUUID()}`
  const source = copyFromId ? w.plans.find((plan) => plan.id === copyFromId) : undefined
  const trimmed = name.trim()
  const plan: TrainingPlan = source
    ? {
        id,
        name: trimmed || `${source.name} 副本`,
        days: cloneTemplates(source.days),
        updatedAt: nowIso(),
      }
    : {
        id,
        name: trimmed || '新计划',
        days: [{ id: `day-${crypto.randomUUID()}`, name: '训练日', subtitle: '', exercises: [] }],
        updatedAt: nowIso(),
      }
  commitPlans([...w.plans, plan])
  return id
}

export function renamePlan(planId: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) return
  editPlan(planId, (plan) => ({ ...plan, name: trimmed }))
}

export function deletePlan(planId: string) {
  const w = currentWorkout()
  if (w.plans.length <= 1 || !w.plans.some((plan) => plan.id === planId)) return
  const stones = tombstones()
  stones.plans[planId] = nowIso()
  const plans = w.plans.filter((plan) => plan.id !== planId)
  const switching = w.activePlanId === planId
  data = { ...data, tombstones: stones }
  commitPlans(plans, switching ? { activePlanId: plans[0]?.id, activePlanUpdatedAt: nowIso() } : {})
}

export function addPlanDay(planId: string, name: string) {
  const day: WorkoutTemplate = {
    id: `day-${crypto.randomUUID()}`,
    name: name.trim() || '训练日',
    subtitle: '',
    exercises: [],
  }
  editPlan(planId, (plan) => ({ ...plan, days: [...plan.days, day] }))
}

export function updatePlanDay(
  planId: string,
  dayId: string,
  patch: Partial<Pick<WorkoutTemplate, 'name' | 'subtitle' | 'tip'>>,
) {
  editPlan(planId, (plan) => ({
    ...plan,
    days: plan.days.map((day) => (day.id === dayId ? { ...day, ...patch, name: patch.name?.trim() || day.name } : day)),
  }))
}

export function removePlanDay(planId: string, dayId: string) {
  editPlan(planId, (plan) => ({ ...plan, days: plan.days.filter((day) => day.id !== dayId) }))
}

export function movePlanDay(planId: string, dayId: string, dir: -1 | 1) {
  editPlan(planId, (plan) => ({ ...plan, days: moveById(plan.days, dayId, dir) }))
}

export function addPlanExercise(planId: string, dayId: string, isWarmup: boolean) {
  const exercise = {
    id: `ex-${crypto.randomUUID()}`,
    name: isWarmup ? '新热身' : '新动作',
    sets: isWarmup ? 1 : 3,
    repsMin: isWarmup ? 1 : 8,
    isWarmup,
  }
  editPlan(planId, (plan) => ({
    ...plan,
    days: plan.days.map((day) => {
      if (day.id !== dayId) return day
      const warmups = day.exercises.filter((item) => item.isWarmup)
      const lifts = day.exercises.filter((item) => !item.isWarmup)
      return {
        ...day,
        exercises: isWarmup ? [...warmups, exercise, ...lifts] : [...warmups, ...lifts, exercise],
      }
    }),
  }))
}

export function updatePlanExercise(
  planId: string,
  dayId: string,
  exerciseId: string,
  patch: Partial<WorkoutTemplate['exercises'][number]>,
) {
  editPlan(planId, (plan) => ({
    ...plan,
    days: plan.days.map((day) => {
      if (day.id !== dayId) return day
      return {
        ...day,
        exercises: day.exercises.map((exercise) => {
          if (exercise.id !== exerciseId) return exercise
          const next = { ...exercise, ...patch, id: exercise.id }
          if (patch.name != null) next.name = patch.name.trim() || exercise.name
          if ('restSec' in patch) {
            next.restSec =
              patch.restSec == null || !Number.isFinite(patch.restSec)
                ? undefined
                : clampRest(patch.restSec)
          }
          return next
        }),
      }
    }),
  }))
}

export function removePlanExercise(planId: string, dayId: string, exerciseId: string) {
  editPlan(planId, (plan) => ({
    ...plan,
    days: plan.days.map((day) =>
      day.id === dayId
        ? { ...day, exercises: day.exercises.filter((exercise) => exercise.id !== exerciseId) }
        : day,
    ),
  }))
}

export function movePlanExercise(planId: string, dayId: string, exerciseId: string, dir: -1 | 1) {
  editPlan(planId, (plan) => ({
    ...plan,
    days: plan.days.map((day) => {
      if (day.id !== dayId) return day
      const warmups = day.exercises.filter((item) => item.isWarmup)
      const lifts = day.exercises.filter((item) => !item.isWarmup)
      const group = day.exercises.find((item) => item.id === exerciseId)?.isWarmup ? warmups : lifts
      const moved = moveById(group, exerciseId, dir)
      const exercises = day.exercises.find((item) => item.id === exerciseId)?.isWarmup
        ? [...moved, ...lifts]
        : [...warmups, ...moved]
      return { ...day, exercises }
    }),
  }))
}

function editPlan(planId: string, edit: (plan: TrainingPlan) => TrainingPlan) {
  const w = currentWorkout()
  if (!w.plans.some((plan) => plan.id === planId)) return
  const plans = w.plans.map((plan) =>
    plan.id === planId ? { ...edit(plan), id: planId, updatedAt: nowIso() } : plan,
  )
  const touchesActive = w.activePlanId === planId || (!w.activePlanId && w.plans[0]?.id === planId)
  commitPlans(plans, touchesActive ? { templatesUpdatedAt: nowIso() } : {})
}

function moveById<T extends { id: string }>(list: T[], id: string, dir: -1 | 1): T[] {
  const index = list.findIndex((item) => item.id === id)
  const next = index + dir
  if (index < 0 || next < 0 || next >= list.length) return list
  const copy = list.slice()
  const [item] = copy.splice(index, 1)
  if (!item) return list
  copy.splice(next, 0, item)
  return copy
}

function patchWorkoutSession(sessionId: string, fn: (session: WorkoutSession) => void) {
  const w = currentWorkout()
  const session = w.sessions.find((s) => s.id === sessionId)
  if (!session) return
  const next = cloneSession(session)
  fn(next)
  next.updatedAt = nowIso()
  setWorkout({
    ...w,
    sessions: w.sessions.map((s) => (s.id === sessionId ? next : s)),
  })
}
