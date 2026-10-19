import './polyfill-storage.ts'
import { defaultWorkout } from '../src/lib/workout.ts'
import { DEFAULT_SETTINGS, emptyData, type AppData, type DailyLog } from '../src/types.ts'
import { isSecretKey, TOKEN_KEY } from '../src/lib/sync/config.ts'
import {
  assertNoSecrets,
  fromSyncDocument,
  mergeCloudData,
  toSyncDocument,
} from '../src/lib/sync/merge.ts'
import { createMemoryGistClient, ensureSyncGist } from '../src/lib/sync/gist.ts'
import { reconcileWithGist } from '../src/lib/sync/roundtrip.ts'
import { exportRawStorage, replaceAll } from '../src/lib/storage.ts'

let failed = 0

function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1
    console.error(`FAIL ${msg}`)
  } else {
    console.log(`ok  ${msg}`)
  }
}

function log(partial: Partial<DailyLog> & { date: string }): DailyLog {
  return { date: partial.date, ...partial }
}

function base(partial: Partial<AppData> = {}): AppData {
  return {
    ...emptyData(),
    workout: defaultWorkout(),
    settings: { ...DEFAULT_SETTINGS },
    tombstones: { logs: {}, sessions: {} },
    ...partial,
  }
}

const a = base({
  logs: [log({ date: '2026-10-01', weightKg: 70.2, breakfastKcal: 400 })],
  settings: { ...DEFAULT_SETTINGS, displayName: '设备A', overlapDefaultKcal: 150 },
  settingsUpdatedAt: '2026-10-01T08:00:00.000Z',
})
const b = base({
  logs: [
    log({
      date: '2026-10-02',
      weightKg: 69.8,
      lunchKcal: 500,
      updatedAt: '2026-10-02T09:00:00.000Z',
    }),
  ],
  settings: { ...DEFAULT_SETTINGS, displayName: '设备B', bmrDefaultKcal: 1700 },
  settingsUpdatedAt: '2026-10-02T09:00:00.000Z',
})

const union = mergeCloudData(a, b)
assert(union.logs.length === 2, 'two devices different days union to 2 logs')
assert(union.logs.some((l) => l.date === '2026-10-01'), 'keeps device A day')
assert(union.logs.some((l) => l.date === '2026-10-02'), 'keeps device B day')
assert(union.settings.displayName === '设备B', 'newer settings win')
assert(union.settings.bmrDefaultKcal === 1700, 'BMR from newer settings')

const older = base({
  logs: [log({ date: '2026-10-03', weightKg: 70, updatedAt: '2026-10-03T10:00:00.000Z' })],
})
const newer = base({
  logs: [log({ date: '2026-10-03', weightKg: 68.5, updatedAt: '2026-10-03T12:00:00.000Z' })],
})
const picked = mergeCloudData(older, newer)
assert(picked.logs[0]?.weightKg === 68.5, 'same day: newer updatedAt wins')

const localDel = base({
  logs: [],
  tombstones: { logs: { '2026-10-04': '2026-10-04T15:00:00.000Z' }, sessions: {} },
})
const remoteKeep = base({
  logs: [log({ date: '2026-10-04', weightKg: 71, updatedAt: '2026-10-04T12:00:00.000Z' })],
})
const afterDel = mergeCloudData(localDel, remoteKeep)
assert(afterDel.logs.length === 0, 'tombstone newer than record deletes it')

const resurrect = mergeCloudData(
  base({
    logs: [],
    tombstones: { logs: { '2026-10-05': '2026-10-05T10:00:00.000Z' }, sessions: {} },
  }),
  base({
    logs: [log({ date: '2026-10-05', weightKg: 70, updatedAt: '2026-10-05T18:00:00.000Z' })],
  }),
)
assert(resurrect.logs[0]?.weightKg === 70, 'record newer than tombstone comes back')

const sessA = base({
  workout: {
    ...defaultWorkout(),
    sessions: [
      {
        id: 's1',
        date: '2026-10-06',
        templateId: 'push',
        templateName: '推',
        restSec: 90,
        startedAt: '2026-10-06T01:00:00.000Z',
        currentExerciseIndex: 0,
        exercises: [
          {
            exerciseId: 'push-bench',
            name: '杠铃卧推',
            targetSets: 4,
            repsMin: 8,
            setsDone: 1,
          },
        ],
        updatedAt: '2026-10-06T01:10:00.000Z',
      },
    ],
  },
})
const sessB = base({
  workout: {
    ...defaultWorkout(),
    sessions: [
      {
        id: 's1',
        date: '2026-10-06',
        templateId: 'push',
        templateName: '推',
        restSec: 90,
        startedAt: '2026-10-06T01:00:00.000Z',
        currentExerciseIndex: 0,
        exercises: [
          {
            exerciseId: 'push-bench',
            name: '杠铃卧推',
            targetSets: 4,
            repsMin: 8,
            setsDone: 3,
          },
        ],
        updatedAt: '2026-10-06T01:20:00.000Z',
      },
    ],
  },
})
const sessMerged = mergeCloudData(sessA, sessB)
assert(sessMerged.workout.sessions[0]?.exercises[0]?.setsDone === 3, 'newer session progress wins')

const abandoned = mergeCloudData(
  base({
    workout: { ...defaultWorkout(), sessions: [] },
    tombstones: { logs: {}, sessions: { s1: '2026-10-06T02:00:00.000Z' } },
  }),
  sessB,
)
assert(abandoned.workout.sessions.length === 0, 'session tombstone drops remote session')

// First enable: both sides have data → merge, not overwrite.
const first = mergeCloudData(a, b)
assert(
  first.logs.length === 2 && first.settings.displayName === '设备B',
  'first enable merges both sides instead of overwrite',
)

const doc = toSyncDocument(first)
const json = JSON.stringify(doc)
assert(!json.includes('ghp_') && !json.includes('github_pat_'), 'sync payload has no token prefix')
try {
  assertNoSecrets(json)
  console.log('ok  assertNoSecrets on sync document')
} catch (err) {
  failed += 1
  console.error('FAIL secrets in sync document', err)
}

assert(isSecretKey('jianzhi-gist-token'), 'token localStorage key is secret')
assert(!isSecretKey('jianzhi-log-v1'), 'app data key is not secret')

try {
  assertNoSecrets(JSON.stringify({ token: 'ghp_secretsecret' }))
  failed += 1
  console.error('FAIL should reject leaked token field')
} catch {
  console.log('ok  leaked token field rejected')
}

const store = new Map()
const api = createMemoryGistClient(store)
const id = await ensureSyncGist(api, undefined, JSON.stringify(toSyncDocument(a)))
await api.writeGist(id, JSON.stringify(toSyncDocument(a)))
const listed = await api.listGists()
assert(listed[0]?.description === 'jianzhi-notes-sync', 'creates secret gist description')
const pulled = fromSyncDocument(JSON.parse((await api.readGist(id)).content ?? '{}'))
const deviceBAfterPull = mergeCloudData(b, pulled)
assert(deviceBAfterPull.logs.length === 2, 'device B pull-merges device A data')
await api.writeGist(id, JSON.stringify(toSyncDocument(deviceBAfterPull)))
const deviceAAfterPull = mergeCloudData(a, fromSyncDocument(JSON.parse((await api.readGist(id)).content ?? '{}')))
assert(deviceAAfterPull.logs.length === 2, 'device A later pull sees both days')
assert(deviceAAfterPull.settings.displayName === '设备B', 'settings converged to newer device B')

// Two-device roundtrip through the same pull-merge-push path the app uses.
const cloud = new Map()
const gist = createMemoryGistClient(cloud)
const phone = await reconcileWithGist(a, gist, undefined)
assert(phone.gistId.startsWith('gist-'), 'first device creates gist')
const tablet = await reconcileWithGist(b, gist, phone.gistId)
assert(tablet.data.logs.length === 2, 'tablet first enable merges instead of overwrite')
assert(tablet.data.logs.some((l) => l.date === '2026-10-01'), 'tablet keeps phone day')
assert(tablet.data.logs.some((l) => l.date === '2026-10-02'), 'tablet keeps its own day')
const phoneAgain = await reconcileWithGist(phone.data, gist, phone.gistId)
assert(phoneAgain.data.logs.length === 2, 'phone later pull sees tablet day')
assert(phoneAgain.data.settings.displayName === '设备B', 'settings follow newer tablet')
assert(!phoneAgain.payload.includes('ghp_'), 'pushed gist body has no token')

const overlapLocal = base({
  settings: { ...DEFAULT_SETTINGS, overlapDefaultKcal: 180, bmrDefaultKcal: 1630 },
  settingsUpdatedAt: '2026-10-07T08:00:00.000Z',
  workout: {
    ...defaultWorkout(),
    restSecDefault: 120,
    restSecUpdatedAt: '2026-10-07T08:00:00.000Z',
  },
})
const overlapRemote = base({
  settings: { ...DEFAULT_SETTINGS, overlapDefaultKcal: 150, bmrDefaultKcal: 1630 },
  settingsUpdatedAt: '2026-10-07T07:00:00.000Z',
  workout: {
    ...defaultWorkout(),
    restSecDefault: 90,
    restSecUpdatedAt: '2026-10-07T07:00:00.000Z',
  },
})
const overlapMerged = mergeCloudData(overlapLocal, overlapRemote)
assert(overlapMerged.settings.overlapDefaultKcal === 180, 'newer overlap setting wins')
assert(overlapMerged.workout.restSecDefault === 120, 'newer rest default wins')

localStorage.setItem(TOKEN_KEY, 'ghp_thisMustNeverLeaveTheDevice1234')
replaceAll(a)
const exported = exportRawStorage()
const exportedBag = (JSON.parse(exported) as { localStorage?: Record<string, string> }).localStorage ?? {}
assert(!exported.includes('ghp_thisMustNeverLeaveTheDevice1234'), 'export JSON omits gist token')
assert(!(TOKEN_KEY in exportedBag), 'export bag skips token key')

if (failed) {
  console.error(`\n${failed} sync test(s) failed`)
  process.exit(1)
}
console.log('\nall sync tests passed')
