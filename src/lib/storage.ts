import { addDays, nowIso, todayIso } from '@/lib/dates'
import { isSecretKey } from '@/lib/sync/config'
import { mergeTombstones, normalizeTombstones } from '@/lib/sync/merge'
import {
  hydrateAppData,
  hydrateLog,
  hydrateSettings,
  parseStoredPayload,
} from '@/lib/hydrate'
import { logHasData } from '@/lib/stats'
import { clampRest, defaultWorkout, hydrateWorkout, lastWeightsFromHistory } from '@/lib/workout'
import {
  DATA_VERSION,
  DEFAULT_BMR_KCAL,
  DEFAULT_OVERLAP_KCAL,
  emptyData,
  type AppData,
  type DailyLog,
  type Settings,
  type TemplateId,
  type WorkoutSession,
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
  const stones = tombstones()
  for (const log of data.logs) stones.logs[log.date] = stamped
  for (const session of data.workout?.sessions ?? []) stones.sessions[session.id] = stamped
  data = {
    ...emptyData(),
    workout: defaultWorkout(),
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
    exercises: session.exercises.map((e) => ({
      ...e,
      setLogs: e.setLogs?.map((log) => ({ ...log })),
    })),
  }
}

export function setRestDefault(sec: number) {
  const w = currentWorkout()
  setWorkout({ ...w, restSecDefault: clampRest(sec), restSecUpdatedAt: nowIso() })
}

export function startWorkoutSession(date: string, templateId: TemplateId, restSec?: number) {
  const w = currentWorkout()
  const template = w.templates.find((t) => t.id === templateId) ?? defaultWorkout().templates.find((t) => t.id === templateId)
  if (!template) return
  const lastWeights = lastWeightsFromHistory(w.sessions)
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
      const prev = e.isWarmup ? undefined : lastWeights.get(e.id)
      return {
        exerciseId: e.id,
        name: e.name,
        targetSets: e.sets,
        repsMin: e.repsMin,
        repsMax: e.repsMax,
        note: e.note,
        setsDone: 0,
        isWarmup: e.isWarmup,
        setLogs: [],
        nextWeightKg: prev?.kg,
        lastWeightHint: prev?.hint,
      }
    }),
  }
  setWorkout({
    ...w,
    sessions: [...w.sessions, session],
    activeSessionId: session.id,
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
  if (!ex.isWarmup) {
    const logs = [...(ex.setLogs ?? [])]
    logs.push({
      weightKg: typeof ex.nextWeightKg === 'number' ? ex.nextWeightKg : undefined,
    })
    ex.setLogs = logs
  }
  ex.setsDone += 1
  const allDone = next.exercises.every((e) => e.setsDone >= e.targetSets)
  if (allDone) {
    next.restEndsAt = undefined
    next.restLockUntil = undefined
  } else if (ex.isWarmup) {
    next.restEndsAt = undefined
    next.restLockUntil = undefined
    if (
      ex.setsDone >= ex.targetSets &&
      next.currentExerciseIndex < next.exercises.length - 1
    ) {
      next.currentExerciseIndex += 1
    }
  } else {
    next.restEndsAt = now + next.restSec * 1000
    next.restLockUntil = now + 500
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
  if (!session) return
  if (session.restLockUntil && Date.now() < session.restLockUntil) return
  patchWorkoutSession(sessionId, (s) => {
    s.restEndsAt = undefined
    s.restLockUntil = undefined
    const ex = s.exercises[s.currentExerciseIndex]
    if (
      ex &&
      ex.setsDone >= ex.targetSets &&
      s.currentExerciseIndex < s.exercises.length - 1
    ) {
      s.currentExerciseIndex += 1
    }
  })
}

export function undoLastWorkoutSet(sessionId: string) {
  const w = currentWorkout()
  const session = w.sessions.find((s) => s.id === sessionId)
  if (!session || session.completedAt) return
  const next = cloneSession(session)
  next.restEndsAt = undefined
  next.restLockUntil = undefined
  let idx = next.currentExerciseIndex
  let ex = next.exercises[idx]
  if (!ex) return
  if (ex.setsDone <= 0) {
    if (idx <= 0) return
    idx -= 1
    next.currentExerciseIndex = idx
    ex = next.exercises[idx]
    if (!ex || ex.setsDone <= 0) return
  }
  ex.setsDone -= 1
  if (ex.setLogs && ex.setLogs.length > 0) {
    const undone = ex.setLogs[ex.setLogs.length - 1]
    ex.setLogs = ex.setLogs.slice(0, -1)
    if (typeof undone?.weightKg === 'number') {
      ex.nextWeightKg = undone.weightKg
    }
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
  addWorkoutRest(sessionId, session.restSec)
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
  patchWorkoutSession(sessionId, (s) => {
    const ex = s.exercises.find((e) => e.exerciseId === exerciseId)
    if (!ex || ex.isWarmup) return
    ex.nextWeightKg =
      typeof weightKg === 'number' && Number.isFinite(weightKg) && weightKg >= 0
        ? Math.round(weightKg * 100) / 100
        : undefined
  })
}

export function selectWorkoutExercise(sessionId: string, index: number) {
  patchWorkoutSession(sessionId, (s) => {
    if (index >= 0 && index < s.exercises.length) {
      s.currentExerciseIndex = index
      s.restEndsAt = undefined
    }
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
  const fresh = defaultWorkout()
  setWorkout({
    ...w,
    restSecDefault: fresh.restSecDefault,
    restSecUpdatedAt: nowIso(),
    templates: fresh.templates,
    templatesUpdatedAt: nowIso(),
  })
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
