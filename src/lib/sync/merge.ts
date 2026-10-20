import { timeMs } from '@/lib/coerce'
import { hydrateAppData } from '@/lib/hydrate'
import { defaultWorkout } from '@/lib/workout'
import type {
  AppData,
  DailyLog,
  Settings,
  Tombstones,
  WeightMemoryEntry,
  WorkoutSession,
  WorkoutStore,
} from '@/types'

export const SYNC_KIND = 'jianzhi-notes-sync'

export type SyncDocument = {
  kind: typeof SYNC_KIND
  version: number
  settings: Settings
  settingsUpdatedAt?: string
  logs: DailyLog[]
  workout: WorkoutStore
  tombstones: Tombstones
}

export function normalizeTombstones(raw?: Tombstones | null): Tombstones {
  const logs =
    raw?.logs && typeof raw.logs === 'object' && !Array.isArray(raw.logs) ? { ...raw.logs } : {}
  const sessions =
    raw?.sessions && typeof raw.sessions === 'object' && !Array.isArray(raw.sessions)
      ? { ...raw.sessions }
      : {}
  return { logs, sessions }
}

export function mergeTombstones(a: Tombstones, b: Tombstones): Tombstones {
  const logs: Record<string, string> = { ...a.logs }
  for (const [key, iso] of Object.entries(b.logs)) {
    if (timeMs(iso) >= timeMs(logs[key])) logs[key] = iso
  }
  const sessions: Record<string, string> = { ...a.sessions }
  for (const [key, iso] of Object.entries(b.sessions)) {
    if (timeMs(iso) >= timeMs(sessions[key])) sessions[key] = iso
  }
  return { logs, sessions }
}

function pickNewer<T>(
  local: T | undefined,
  remote: T | undefined,
  localTs?: string,
  remoteTs?: string,
): T | undefined {
  if (!local) return remote
  if (!remote) return local
  return timeMs(remoteTs) > timeMs(localTs) ? remote : local
}

function isDeleted(updatedAt: string | undefined, deletedAt: string | undefined): boolean {
  if (!deletedAt) return false
  return timeMs(deletedAt) >= timeMs(updatedAt)
}

function stripTimer(session: WorkoutSession): WorkoutSession {
  return { ...session, restEndsAt: undefined, restLockUntil: undefined }
}

export function mergeLogs(
  local: DailyLog[],
  remote: DailyLog[],
  tombstones: Tombstones,
): DailyLog[] {
  const map = new Map<string, DailyLog>()
  for (const log of local) map.set(log.date, log)
  for (const log of remote) {
    const cur = map.get(log.date)
    const winner = pickNewer(cur, log, cur?.updatedAt, log.updatedAt)
    if (winner) map.set(log.date, winner)
  }
  const out: DailyLog[] = []
  for (const log of map.values()) {
    if (isDeleted(log.updatedAt, tombstones.logs[log.date])) continue
    out.push(log)
  }
  out.sort((a, b) => a.date.localeCompare(b.date))
  return out
}

export function mergeSessions(
  local: WorkoutSession[],
  remote: WorkoutSession[],
  tombstones: Tombstones,
  localActiveId?: string,
): WorkoutSession[] {
  const map = new Map<string, WorkoutSession>()
  for (const session of local) map.set(session.id, session)
  for (const session of remote) {
    const cur = map.get(session.id)
    const winner = pickNewer(cur, session, cur?.updatedAt, session.updatedAt)
    if (winner) map.set(session.id, winner)
  }
  const out: WorkoutSession[] = []
  for (const session of map.values()) {
    if (isDeleted(session.updatedAt, tombstones.sessions[session.id])) continue
    const stripped = stripTimer(session)
    if (session.id === localActiveId) {
      const localSess = local.find((s) => s.id === session.id)
      const newer =
        localSess && timeMs(localSess.updatedAt) >= timeMs(stripped.updatedAt) ? localSess : stripped
      if (localSess) {
        out.push({
          ...newer,
          currentExerciseIndex: localSess.currentExerciseIndex,
          restAdvanceFrom: localSess.restAdvanceFrom,
          restEndsAt: localSess.restEndsAt,
          restLockUntil: localSess.restLockUntil,
        })
        continue
      }
      out.push(stripped)
      continue
    }
    out.push(stripped)
  }
  return out
}

export function mergeWeightMemory(
  local?: WeightMemoryEntry[],
  remote?: WeightMemoryEntry[],
): WeightMemoryEntry[] | undefined {
  const map = new Map<string, WeightMemoryEntry>()
  for (const entry of local ?? []) map.set(entry.exerciseId, entry)
  for (const entry of remote ?? []) {
    const cur = map.get(entry.exerciseId)
    if (!cur || timeMs(entry.updatedAt) > timeMs(cur.updatedAt)) map.set(entry.exerciseId, entry)
  }
  const out = [...map.values()]
  return out.length > 0 ? out : undefined
}

export function mergeCloudData(local: AppData, remote: AppData): AppData {
  const left = hydrateAppData(local)
  const right = hydrateAppData(remote)
  const tombstones = mergeTombstones(
    normalizeTombstones(left.tombstones),
    normalizeTombstones(right.tombstones),
  )
  const settingsUpdatedAt =
    timeMs(right.settingsUpdatedAt) > timeMs(left.settingsUpdatedAt)
      ? right.settingsUpdatedAt
      : left.settingsUpdatedAt
  const settings =
    timeMs(right.settingsUpdatedAt) > timeMs(left.settingsUpdatedAt)
      ? right.settings
      : left.settings

  const localW = left.workout ?? defaultWorkout()
  const remoteW = right.workout ?? defaultWorkout()
  const restSecDefault =
    timeMs(remoteW.restSecUpdatedAt) > timeMs(localW.restSecUpdatedAt)
      ? remoteW.restSecDefault
      : localW.restSecDefault
  const restSecUpdatedAt =
    timeMs(remoteW.restSecUpdatedAt) > timeMs(localW.restSecUpdatedAt)
      ? remoteW.restSecUpdatedAt
      : localW.restSecUpdatedAt
  const templates =
    timeMs(remoteW.templatesUpdatedAt) > timeMs(localW.templatesUpdatedAt)
      ? remoteW.templates
      : localW.templates
  const templatesUpdatedAt =
    timeMs(remoteW.templatesUpdatedAt) > timeMs(localW.templatesUpdatedAt)
      ? remoteW.templatesUpdatedAt
      : localW.templatesUpdatedAt

  const logs = mergeLogs(left.logs, right.logs, tombstones)
  const sessions = mergeSessions(
    localW.sessions,
    remoteW.sessions,
    tombstones,
    localW.activeSessionId,
  )

  return hydrateAppData({
    version: left.version,
    settings,
    settingsUpdatedAt,
    logs,
    workout: {
      restSecDefault,
      restSecUpdatedAt,
      templates,
      templatesUpdatedAt,
      sessions,
      activeSessionId: localW.activeSessionId,
      weightMemory: mergeWeightMemory(localW.weightMemory, remoteW.weightMemory),
    },
    tombstones,
  })
}

export function toSyncDocument(data: AppData): SyncDocument {
  const hydrated = hydrateAppData(data)
  return {
    kind: SYNC_KIND,
    version: hydrated.version,
    settings: hydrated.settings,
    settingsUpdatedAt: hydrated.settingsUpdatedAt,
    logs: hydrated.logs,
    workout: {
      ...hydrated.workout,
      sessions: hydrated.workout.sessions.map(stripTimer),
      activeSessionId: undefined,
    },
    tombstones: normalizeTombstones(hydrated.tombstones),
  }
}

export function fromSyncDocument(raw: unknown): AppData {
  if (!raw || typeof raw !== 'object') {
    return hydrateAppData({})
  }
  const doc = raw as Partial<SyncDocument> & Record<string, unknown>
  return hydrateAppData({
    version: doc.version,
    settings: doc.settings,
    settingsUpdatedAt: doc.settingsUpdatedAt,
    logs: doc.logs,
    workout: doc.workout,
    tombstones: doc.tombstones,
  })
}

export function syncDocumentHasData(doc: AppData): boolean {
  return (
    doc.logs.length > 0 ||
    doc.workout.sessions.length > 0 ||
    Boolean(doc.settingsUpdatedAt) ||
    Boolean(doc.settings.displayName)
  )
}

const TOKEN_KEYS = /token|pat|github_pat|ghp_/i

export function assertNoSecrets(payload: string) {
  const parsed = JSON.parse(payload) as unknown
  walkNoSecrets(parsed)
}

function walkNoSecrets(value: unknown, key = ''): void {
  if (TOKEN_KEYS.test(key) && typeof value === 'string' && value.length > 8) {
    throw new Error(`secret field leaked: ${key}`)
  }
  if (typeof value === 'string' && (value.startsWith('ghp_') || value.startsWith('github_pat_'))) {
    throw new Error('token leaked in payload')
  }
  if (value && typeof value === 'object') {
    if (Array.isArray(value)) {
      value.forEach((item) => walkNoSecrets(item))
      return
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      walkNoSecrets(v, k)
    }
  }
}
