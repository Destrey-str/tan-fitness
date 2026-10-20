import { asFiniteNumber, asInt, asIsoTime, asString, asNonNeg, clampInt, timeMs } from '@/lib/coerce'
import { formatMd } from '@/lib/dates'
import type {
  ExerciseSession,
  ExerciseTemplate,
  SetLog,
  TemplateId,
  WeightMemoryEntry,
  WorkoutSession,
  WorkoutStore,
  WorkoutTemplate,
} from '@/types'

export const DEFAULT_REST_SEC = 90

function wu(
  id: string,
  name: string,
  note?: string,
): WorkoutTemplate['exercises'][number] {
  return { id, name, sets: 1, repsMin: 1, isWarmup: true, note }
}

export const DEFAULT_TEMPLATES: WorkoutTemplate[] = [
  {
    id: 'push',
    name: '推',
    subtitle: '胸、三角肌中束、三头',
    exercises: [
      wu('push-wu-pec-min', '胸小肌放松'),
      wu('push-wu-pec-maj', '胸大肌放松'),
      wu('push-wu-biceps', '二头肌放松'),
      wu('push-wu-shoulder', '肩部激活（弹力带扩胸、绕肩）'),
      wu('push-wu-low-trap', '下斜方激活（Y字）'),
      wu('push-wu-serratus', '拉锯式平板（折叠俯卧撑）'),
      {
        id: 'push-bench',
        name: '杠铃卧推',
        sets: 4,
        repsMin: 8,
        repsMax: 12,
        note: '热身后正式组',
      },
      {
        id: 'push-incline-db',
        name: '哑铃上斜卧推',
        sets: 4,
        repsMin: 12,
        note: '凳约45°',
      },
      {
        id: 'push-dip',
        name: '双杠臂屈伸或退阶',
        sets: 4,
        repsMin: 12,
        note: '可力竭/辅助',
      },
      {
        id: 'push-skullcrush',
        name: '仰卧臂屈伸',
        sets: 4,
        repsMin: 15,
      },
      {
        id: 'push-y-raise',
        name: 'Y字侧平举',
        sets: 3,
        repsMin: 10,
        note: '每组10+歇5秒+再10',
      },
    ],
  },
  {
    id: 'pull',
    name: '拉',
    subtitle: '背、后束、二头',
    exercises: [
      wu('pull-wu-world', '伟大者伸展'),
      wu('pull-wu-band', '弹力带绕肩'),
      wu(
        'pull-wu-tspine-proprio',
        '胸椎本体感受',
        '双手向上延伸，前锯肌发力，肩屈；菱形肌、中下斜方',
      ),
      wu('pull-wu-tspine-flex', '胸椎屈曲激活（四足）'),
      wu('pull-wu-antagonist', '拉伸对抗'),
      {
        id: 'pull-1arm-lat',
        name: '单手钢线下拉',
        sets: 4,
        repsMin: 12,
      },
      {
        id: 'pull-neutral-lat',
        name: '对握下拉',
        sets: 4,
        repsMin: 10,
        note: '可12→8递进',
      },
      {
        id: 'pull-1arm-row',
        name: '单手器械划船',
        sets: 4,
        repsMin: 10,
      },
      {
        id: 'pull-wide-row',
        name: '坐姿划船开肘',
        sets: 4,
        repsMin: 12,
        note: '可做到15',
      },
      {
        id: 'pull-curl',
        name: '钢线弯举',
        sets: 3,
        repsMin: 12,
      },
    ],
  },
  {
    id: 'legs',
    name: '腿',
    subtitle: '股四、腘绳',
    tip: '腰不适则减重/换高脚杯/停山羊后仰。',
    exercises: [
      wu('legs-wu-frog', '动态青蛙趴'),
      wu('legs-wu-9090', '髋90/90'),
      wu('legs-wu-ankle', '脚踝激活（单腿站）'),
      wu(
        'legs-wu-foam',
        '泡沫轴松解',
        '胫前、小腿、大腿后侧、前侧、内侧、臀、阔筋膜张肌',
      ),
      wu('legs-wu-world', '伟大者伸展'),
      wu('legs-wu-quad', '股四拉伸'),
      {
        id: 'legs-sl-rdl',
        name: '单腿硬拉',
        sets: 3,
        repsMin: 12,
        note: '不稳可扶',
      },
      {
        id: 'legs-split-squat',
        name: '保加利亚深蹲',
        sets: 3,
        repsMin: 10,
        note: '可到12',
      },
      {
        id: 'legs-goblet',
        name: '高脚杯深蹲',
        sets: 3,
        repsMin: 12,
        note: '腰不稳优先此动作；可到15',
      },
      {
        id: 'legs-rdl',
        name: '罗马尼亚硬拉',
        sets: 3,
        repsMin: 12,
        note: '轻重量护腰',
      },
      {
        id: 'legs-ghr',
        name: '山羊挺身',
        sets: 3,
        repsMin: 8,
        note: '到身体一条线，勿过度后仰',
      },
    ],
  },
]

export function defaultWorkout(): WorkoutStore {
  return {
    restSecDefault: DEFAULT_REST_SEC,
    templates: DEFAULT_TEMPLATES.map((t) => ({
      ...t,
      exercises: t.exercises.map((e) => ({ ...e })),
    })),
    sessions: [],
    activeSessionId: undefined,
  }
}

export function weekdayPlan(date: Date): {
  templateId: TemplateId | null
  label: string
} {
  switch (date.getDay()) {
    case 1:
      return { templateId: 'push', label: '推' }
    case 2:
      return { templateId: null, label: '有氧' }
    case 3:
      return { templateId: 'pull', label: '拉' }
    case 4:
      return { templateId: null, label: '有氧' }
    case 5:
      return { templateId: 'legs', label: '腿' }
    default:
      return { templateId: null, label: '休息' }
  }
}

export function repsLabel(repsMin: number, repsMax?: number): string {
  if (repsMax != null && repsMax !== repsMin) {
    const lo = Math.min(repsMin, repsMax)
    const hi = Math.max(repsMin, repsMax)
    return `${lo}–${hi}`
  }
  return String(repsMin)
}

export function formatRest(totalSec: number): string {
  const n = asFiniteNumber(totalSec) ?? 0
  const s = Math.max(0, Math.ceil(n))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

export function clampRest(sec: number): number {
  const n = asFiniteNumber(sec)
  if (n == null) return DEFAULT_REST_SEC
  return Math.min(180, Math.max(30, Math.round(n)))
}

export function sessionCompletedSets(session: WorkoutSession): number {
  return (session.exercises ?? []).reduce((sum, ex) => sum + (asInt(ex?.setsDone) ?? 0), 0)
}

export function sessionProgress(session: WorkoutSession): {
  warmupDone: number
  warmupTotal: number
  liftDone: number
  liftTotal: number
} {
  let warmupDone = 0
  let warmupTotal = 0
  let liftDone = 0
  let liftTotal = 0
  for (const ex of session.exercises ?? []) {
    if (!ex) continue
    if (ex.isWarmup) {
      warmupTotal += 1
      if ((asInt(ex.setsDone) ?? 0) >= (asInt(ex.targetSets) ?? 1)) warmupDone += 1
    } else {
      liftTotal += asInt(ex.targetSets) ?? 0
      liftDone += asInt(ex.setsDone) ?? 0
    }
  }
  return { warmupDone, warmupTotal, liftDone, liftTotal }
}

export function templateHasWarmup(
  exercises: { isWarmup?: boolean }[] | undefined | null,
): boolean {
  return Array.isArray(exercises) && exercises.some((e) => Boolean(e?.isWarmup))
}

export function formatKg(kg: number): string {
  const n = Math.round((asFiniteNumber(kg) ?? 0) * 100) / 100
  return `${n}kg`
}

export function formatKgCompact(kg: number): string {
  const n = Math.round((asFiniteNumber(kg) ?? 0) * 100) / 100
  return String(n)
}

export function parseWeightNote(note?: string): number | undefined {
  if (!note) return undefined
  const m = note.replace(/，/g, '.').match(/(\d+(?:\.\d+)?)/)
  if (!m) return undefined
  const n = Number(m[1])
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

export function lastRecordedWeight(ex: ExerciseSession): number | undefined {
  const weights = setWeightsOf(ex)
  for (let i = weights.length - 1; i >= 0; i--) {
    if (typeof weights[i] === 'number') return weights[i]
  }
  return parseWeightNote(ex.weightNote)
}

/** Logged weight for each set. Missing sets stay undefined. Also reads a legacy note. */
export function setWeightsOf(ex: ExerciseSession): (number | undefined)[] {
  const logs = ex.setLogs ?? []
  const limit = Math.max(logs.length, asInt(ex.setsDone) ?? 0)
  const out: (number | undefined)[] = []
  for (let i = 0; i < limit; i++) {
    out.push(weightFromUnknown(logs[i]?.weightKg))
  }
  if (!out.some((n) => typeof n === 'number')) {
    const note = parseWeightNote(ex.weightNote)
    if (note != null) return [note]
  }
  return out
}

export type LastPerformance = {
  exerciseId: string
  name: string
  kg: number
  setWeights: (number | undefined)[]
  repsMin: number
  repsMax?: number
  date: string
  completedAt: string
  hint: string
}

export function formatLastPerformanceHint(opts: {
  setWeights: (number | undefined)[]
  repsMin: number
  repsMax?: number
  date: string
}): string | undefined {
  const nums = opts.setWeights.filter((n): n is number => typeof n === 'number')
  if (nums.length === 0) return undefined
  const distinct = new Set(nums.map((n) => formatKgCompact(n)))
  const weightText =
    distinct.size <= 1 ? formatKg(nums[0]!) : `${nums.map((n) => formatKgCompact(n)).join('/')}kg`
  const reps = repsLabel(opts.repsMin, opts.repsMax)
  const day = /^\d{4}-\d{2}-\d{2}$/.test(opts.date) ? formatMd(opts.date) : ''
  return day ? `上次: ${weightText} × ${reps} (${day})` : `上次: ${weightText} × ${reps}`
}

function historyStamp(session: WorkoutSession): string {
  return session.completedAt || session.updatedAt || session.startedAt || `${session.date}T00:00:00.000Z`
}

function sessionHasWeight(session: WorkoutSession): boolean {
  return (session.exercises ?? []).some((ex) => ex && !ex.isWarmup && lastRecordedWeight(ex) != null)
}

export function indexLastPerformances(
  sessions: WorkoutSession[] | undefined,
  activeSessionId?: string,
): { byId: Map<string, LastPerformance>; byName: Map<string, LastPerformance> } {
  const byId = new Map<string, LastPerformance>()
  const byName = new Map<string, LastPerformance>()
  const list = [...(sessions ?? [])]
    .filter((s) => s && s.id !== activeSessionId && sessionHasWeight(s))
    .sort((a, b) => historyStamp(b).localeCompare(historyStamp(a)))
  for (const session of list) {
    for (const ex of session.exercises ?? []) {
      if (!ex || ex.isWarmup) continue
      const setWeights = setWeightsOf(ex)
      const hint = formatLastPerformanceHint({
        setWeights,
        repsMin: ex.repsMin,
        repsMax: ex.repsMax,
        date: session.date,
      })
      const kg = setWeights.find((n): n is number => typeof n === 'number')
      if (kg == null || !hint) continue
      const perf: LastPerformance = {
        exerciseId: ex.exerciseId,
        name: ex.name,
        kg,
        setWeights,
        repsMin: ex.repsMin,
        repsMax: ex.repsMax,
        date: session.date,
        completedAt: historyStamp(session),
        hint,
      }
      if (ex.exerciseId && !byId.has(ex.exerciseId)) byId.set(ex.exerciseId, perf)
      const name = ex.name.trim()
      if (name && !byName.has(name)) byName.set(name, perf)
    }
  }
  return { byId, byName }
}

export function lookupLastPerformance(
  index: { byId: Map<string, LastPerformance>; byName: Map<string, LastPerformance> },
  exerciseId: string,
  name: string,
): LastPerformance | undefined {
  return index.byId.get(exerciseId) ?? index.byName.get(name.trim())
}

export function lastWeightsFromHistory(
  sessions: WorkoutSession[],
): Map<string, { kg: number; hint: string }> {
  const { byId } = indexLastPerformances(sessions)
  const map = new Map<string, { kg: number; hint: string }>()
  for (const [id, perf] of byId) map.set(id, { kg: perf.kg, hint: perf.hint })
  return map
}

export function lookupWeightMemory(
  memory: WeightMemoryEntry[] | undefined,
  exerciseId: string,
  name: string,
): WeightMemoryEntry | undefined {
  const byId = memory?.find((entry) => entry.exerciseId === exerciseId)
  if (byId) return byId
  const trimmed = name.trim()
  return memory?.find((entry) => entry.name.trim() === trimmed)
}

/** History wins unless the user typed a weight more recently. Later sets inherit the previous number. */
export function resolvePlannedWeights(opts: {
  setCount: number
  history?: LastPerformance
  memory?: WeightMemoryEntry
}): { weights: (number | undefined)[]; hint?: string } {
  const setCount = Math.max(0, opts.setCount)
  const historyTime = opts.history?.completedAt ?? ''
  const memoryNewer = Boolean(
    opts.memory && (!opts.history || timeMs(opts.memory.updatedAt) > timeMs(historyTime)),
  )
  const source = memoryNewer ? opts.memory?.weights : opts.history?.setWeights
  let carry: number | undefined
  const weights: (number | undefined)[] = []
  for (let i = 0; i < setCount; i++) {
    const raw = source?.[i]
    const n = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : undefined
    if (n != null) carry = n
    weights.push(carry)
  }
  return { weights, hint: opts.history?.hint }
}

export function nextUnfinishedExerciseIndex(
  exercises: ExerciseSession[] | undefined,
  fromIndex: number,
): number | undefined {
  const list = exercises ?? []
  const n = list.length
  if (n === 0) return undefined
  for (let step = 1; step <= n; step += 1) {
    const i = (((fromIndex + step) % n) + n) % n
    const ex = list[i]
    if (ex && (asInt(ex.setsDone) ?? 0) < (asInt(ex.targetSets) ?? 1)) return i
  }
  return undefined
}

export function restDisplaySecond(restEndsAt: number, now: number): number {
  return Math.ceil(Math.max(0, restEndsAt - now) / 1000)
}

/** True only when the countdown second or the skip-lock changes, so the rest screen does not repaint every tick. */
export function restClockChanged(
  prevNow: number,
  nextNow: number,
  restEndsAt: number,
  lockUntil?: number,
): boolean {
  if (restDisplaySecond(restEndsAt, prevNow) !== restDisplaySecond(restEndsAt, nextNow)) return true
  const prevLocked = lockUntil != null && prevNow < lockUntil
  const nextLocked = lockUntil != null && nextNow < lockUntil
  return prevLocked !== nextLocked
}

export function formatSetWeights(ex: ExerciseSession): string | undefined {
  if (ex.isWarmup) return undefined
  const logs = (ex.setLogs ?? []).slice(0, ex.setsDone)
  const parts = logs.map((log) =>
    typeof log.weightKg === 'number' && Number.isFinite(log.weightKg)
      ? formatKgCompact(log.weightKg)
      : '—',
  )
  if (parts.some((p) => p !== '—')) return `${parts.join(' / ')} kg`
  const note = ex.weightNote?.trim()
  return note || undefined
}

export function hydrateWorkout(raw?: Partial<WorkoutStore> | null): WorkoutStore {
  const base = defaultWorkout()
  if (!raw || typeof raw !== 'object') return base
  const restRaw = asFiniteNumber(raw.restSecDefault)
  const templates = hydrateTemplates(raw.templates, base.templates)
  const sessions = Array.isArray(raw.sessions)
    ? raw.sessions.map(hydrateSession).filter((s): s is WorkoutSession => s != null)
    : []
  const activeSessionId =
    typeof raw.activeSessionId === 'string' && raw.activeSessionId
      ? raw.activeSessionId
      : undefined
  return {
    restSecDefault: restRaw == null ? base.restSecDefault : clampRest(restRaw),
    restSecUpdatedAt: asIsoTime((raw as Record<string, unknown>).restSecUpdatedAt),
    templates,
    templatesUpdatedAt: asIsoTime((raw as Record<string, unknown>).templatesUpdatedAt),
    sessions,
    activeSessionId: sessions.some((s) => s.id === activeSessionId)
      ? activeSessionId
      : undefined,
    weightMemory: hydrateWeightMemory((raw as Record<string, unknown>).weightMemory),
  }
}

function hydrateTemplates(
  raw: unknown,
  fallback: WorkoutTemplate[],
): WorkoutTemplate[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback
  const next = raw.map((item) => hydrateTemplate(item)).filter((t): t is WorkoutTemplate => t != null)
  return next.length > 0 ? next : fallback
}

function hydrateTemplate(raw: unknown): WorkoutTemplate | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = row.id
  if (id !== 'push' && id !== 'pull' && id !== 'legs') return null
  const exercises = Array.isArray(row.exercises)
    ? row.exercises
        .map((item) => hydrateExerciseTemplate(item))
        .filter((e): e is ExerciseTemplate => e != null)
    : []
  if (exercises.length === 0) return null
  return {
    id,
    name: asString(row.name, id === 'push' ? '推' : id === 'pull' ? '拉' : '腿'),
    subtitle: asString(row.subtitle),
    tip: asString(row.tip) || undefined,
    exercises,
  }
}

function hydrateExerciseTemplate(raw: unknown): ExerciseTemplate | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const id = asString(row.id)
  const name = asString(row.name)
  if (!id || !name) return null
  const repsMax = asInt(row.repsMax)
  return {
    id,
    name,
    sets: clampInt(row.sets, 1, 30, 1),
    repsMin: clampInt(row.repsMin, 1, 100, 1),
    repsMax: repsMax != null && repsMax > 0 ? Math.min(100, repsMax) : undefined,
    note: asString(row.note) || undefined,
    isWarmup: row.isWarmup === true,
  }
}

function weightFromUnknown(value: unknown): number | undefined {
  const direct = asNonNeg(value)
  if (direct != null) return direct
  if (typeof value !== 'string') return undefined
  const match = value.replace(/，/g, '.').match(/(\d+(?:\.\d+)?)/)
  return match ? asNonNeg(match[1]) : undefined
}

function hydrateSetLog(raw: unknown): SetLog {
  if (raw == null) return {}
  if (typeof raw !== 'object') {
    const kg = weightFromUnknown(raw)
    return kg == null ? {} : { weightKg: kg }
  }
  const kg = weightFromUnknown((raw as Record<string, unknown>).weightKg)
  return kg == null ? {} : { weightKg: kg }
}

function hydrateExerciseSession(raw: unknown): ExerciseSession | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const exerciseId = asString(row.exerciseId) || asString(row.id)
  const name = asString(row.name)
  if (!exerciseId || !name) return null
  const targetSets = clampInt(row.targetSets ?? row.sets, 1, 30, 1)
  const setsDone = clampInt(row.setsDone, 0, 30, 0)
  const repsMax = asInt(row.repsMax)
  const nextWeightKg = asNonNeg(row.nextWeightKg)
  let setLogs = Array.isArray(row.setLogs) ? row.setLogs.map(hydrateSetLog) : []
  if (setLogs.length === 0 && Array.isArray(row.weights)) {
    setLogs = row.weights.map((item) => {
      const kg = asNonNeg(item)
      return kg == null ? {} : { weightKg: kg }
    })
  }
  const legacyKg = asNonNeg(row.weightKg ?? row.weight)
  const done = Math.min(setsDone, targetSets)
  if (legacyKg != null && done > 0 && setLogs.every((log) => log.weightKg == null)) {
    setLogs = Array.from({ length: done }, () => ({ weightKg: legacyKg }))
  }
  const plannedWeights = Array.isArray(row.plannedWeights)
    ? row.plannedWeights.map((item) => {
        const kg = asNonNeg(item)
        return kg == null ? null : Math.round(kg * 100) / 100
      })
    : undefined
  return {
    exerciseId,
    name,
    targetSets,
    repsMin: clampInt(row.repsMin, 1, 100, 1),
    repsMax: repsMax != null && repsMax > 0 ? Math.min(100, repsMax) : undefined,
    note: asString(row.note) || undefined,
    setsDone: done,
    weightNote: asString(row.weightNote) || undefined,
    setLogs,
    nextWeightKg,
    plannedWeights,
    lastWeightHint: asString(row.lastWeightHint) || undefined,
    isWarmup: row.isWarmup === true,
  }
}

export function hydrateSession(value: unknown): WorkoutSession | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const id = asString(row.id)
  const date = asString(row.date)
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const exercises = Array.isArray(row.exercises)
    ? row.exercises
        .map((item) => hydrateExerciseSession(item))
        .filter((e): e is ExerciseSession => e != null)
    : []
  if (exercises.length === 0) return null
  const templateId = row.templateId
  const restRaw = asFiniteNumber(row.restSec) ?? 90
  const idx = clampInt(row.currentExerciseIndex, 0, Math.max(0, exercises.length - 1), 0)
  const advanceRaw = asInt(row.restAdvanceFrom)
  const setHistory = Array.isArray(row.setHistory)
    ? row.setHistory
        .map((item) => asInt(item))
        .filter((item): item is number => item != null && item >= 0 && item < exercises.length)
    : undefined
  return {
    id,
    date,
    templateId: templateId === 'pull' || templateId === 'legs' ? templateId : 'push',
    templateName: asString(row.templateName, '训练'),
    restSec: clampRest(restRaw),
    startedAt: asString(row.startedAt) || new Date(0).toISOString(),
    completedAt: asString(row.completedAt) || undefined,
    currentExerciseIndex: idx,
    restEndsAt: asFiniteNumber(row.restEndsAt),
    restLockUntil: asFiniteNumber(row.restLockUntil),
    restAdvanceFrom:
      advanceRaw != null && advanceRaw >= 0 && advanceRaw < exercises.length ? advanceRaw : undefined,
    setHistory: setHistory && setHistory.length > 0 ? setHistory : undefined,
    exercises,
    markedStrength: row.markedStrength === true,
    updatedAt: asIsoTime(row.updatedAt),
  }
}

function hydrateWeightMemory(raw: unknown): WeightMemoryEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: WeightMemoryEntry[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const exerciseId = asString(row.exerciseId)
    const name = asString(row.name)
    if (!exerciseId || !name) continue
    const weights = Array.isArray(row.weights)
      ? row.weights.map((entry) => {
          const kg = asNonNeg(entry)
          return kg == null ? null : Math.round(kg * 100) / 100
        })
      : []
    out.push({
      exerciseId,
      name,
      weights,
      updatedAt: asIsoTime(row.updatedAt) ?? new Date(0).toISOString(),
    })
  }
  return out.length > 0 ? out : undefined
}
