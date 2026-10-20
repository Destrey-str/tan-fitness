import './polyfill-storage.ts'
import { hydrateAppData, hydrateSettings } from '../src/lib/hydrate.ts'
import { defaultWorkout } from '../src/lib/workout.ts'
import {
  calorieDeficit,
  formatDeficitEquation,
  resolveDayKind,
  resolveIntakeTarget,
  vsTarget,
} from '../src/lib/stats.ts'
import { mergeCloudData, toSyncDocument, fromSyncDocument } from '../src/lib/sync/merge.ts'
import {
  getSnapshot,
  replaceAll,
  setDayKind,
  startWorkoutSession,
  updateSettings,
  upsertLog,
} from '../src/lib/storage.ts'
import {
  DEFAULT_SETTINGS,
  emptyData,
  type AppData,
  type DailyLog,
} from '../src/types.ts'

let failed = 0

function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1
    console.error(`FAIL ${msg}`)
  } else {
    console.log(`ok  ${msg}`)
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function fresh(settings = DEFAULT_SETTINGS) {
  replaceAll({
    ...emptyData(),
    settings: { ...settings },
    workout: defaultWorkout(),
    tombstones: { logs: {}, sessions: {} },
  })
}

function logOf(date: string): DailyLog | undefined {
  return getSnapshot().logs.find((log) => log.date === date)
}

const legacySettings = hydrateSettings({
  displayName: '旧',
  targetKcal: 2100,
  tdee: 2300,
  proteinTarget: 130,
  burnSource: 'band',
})
assert(legacySettings.targetKcal === 2100, 'legacy targetKcal is kept')
assert(legacySettings.trainingTargetKcal === 2100, 'training target falls back to targetKcal')
assert(legacySettings.restTargetKcal === 1800, 'rest target defaults to 1800')

const explicit = hydrateSettings({
  ...DEFAULT_SETTINGS,
  targetKcal: 2000,
  trainingTargetKcal: 2200,
  restTargetKcal: 1700,
})
assert(explicit.trainingTargetKcal === 2200 && explicit.restTargetKcal === 1700, 'explicit targets are kept')
assert(explicit.targetKcal === 2000, 'targetKcal stays as the fallback field')

const migrated = hydrateAppData({
  version: 2,
  settings: { displayName: '', targetKcal: 2100, burnSource: 'band' },
  logs: [
    {
      date: '2026-10-01',
      breakfastKcal: 400,
      strengthTraining: true,
      updatedAt: '2026-10-01T01:00:00.000Z',
    },
    {
      date: '2026-10-02',
      breakfastKcal: 500,
      updatedAt: '2026-10-02T01:00:00.000Z',
    },
    {
      date: '2026-10-03',
      breakfastKcal: 450,
      dayKind: 'rest',
      dayKindManual: true,
      intakeTargetKcal: 1750,
      updatedAt: '2026-10-03T01:00:00.000Z',
    },
  ],
  workout: {
    sessions: [
      {
        id: 'sess-1',
        date: '2026-10-02',
        templateId: 'push',
        templateName: '推',
        restSec: 90,
        startedAt: '2026-10-02T02:00:00.000Z',
        currentExerciseIndex: 0,
        exercises: [{ exerciseId: 'bench', name: '卧推', targetSets: 3, repsMin: 8, setsDone: 1 }],
      },
    ],
  },
})
const strengthDay = migrated.logs.find((log) => log.date === '2026-10-01')
const sessionDay = migrated.logs.find((log) => log.date === '2026-10-02')
const manualDay = migrated.logs.find((log) => log.date === '2026-10-03')
assert(strengthDay?.dayKind === 'train', 'old strength day is labeled 训练日')
assert(strengthDay?.intakeTargetKcal === 2100, 'old days freeze the single target, not 1800')
assert(strengthDay?.updatedAt === '2026-10-01T01:00:00.000Z', 'migration does not touch updatedAt')
assert(sessionDay?.dayKind === 'train' && sessionDay.intakeTargetKcal === 2100, 'old session day freezes training label and legacy target')
assert(
  manualDay?.dayKind === 'rest' && manualDay.dayKindManual === true && manualDay.intakeTargetKcal === 1750,
  'already stored day type and target are not rewritten',
)
assert(
  resolveDayKind(undefined, migrated.workout.sessions, '2026-10-02') === 'train',
  'a day with a session and no record defaults to 训练日',
)
assert(
  resolveDayKind(undefined, migrated.workout.sessions, '2026-10-04') === 'rest',
  'a day with no session defaults to 休息日',
)
assert(
  resolveDayKind(sessionDay, [], '2026-10-02') === 'train',
  'stored day type is kept even if the session list is absent',
)

const plain = migrated.logs.find((log) => log.date === '2026-10-02')!
assert(vsTarget({ ...plain, breakfastKcal: 500, lunchKcal: undefined, dinnerKcal: undefined, extraKcal: undefined }, migrated.settings) === 500 - 2100, 'vsTarget uses the stored day target')
assert(
  resolveIntakeTarget(plain, { ...migrated.settings, restTargetKcal: 1400, trainingTargetKcal: 2600 }) === 2100,
  'changing settings does not change a stored intake target',
)

const formulaLog: DailyLog = {
  date: '2026-10-01',
  bmrKcal: 1630,
  overlapKcal: 150,
  bandBurnKcal: 800,
  breakfastKcal: 400,
  lunchKcal: 600,
  dinnerKcal: 600,
  dayKind: 'rest',
  intakeTargetKcal: 1800,
}
assert(calorieDeficit(formulaLog, DEFAULT_SETTINGS) === 680, 'deficit formula is unchanged')
assert(
  formatDeficitEquation(formulaLog, DEFAULT_SETTINGS) === '1630 + 800 − 150 − 1600 = 680',
  'deficit equation string is unchanged',
)

fresh()
upsertLog('2026-10-18', { lunchKcal: 400 })
assert(logOf('2026-10-18')?.dayKind === 'rest', 'new day without a session is 休息日')
assert(logOf('2026-10-18')?.intakeTargetKcal === 1800, 'new rest day freezes the rest target')
assert(logOf('2026-10-18')?.dayKindManual !== true, 'auto rest day is not a manual override')

fresh()
startWorkoutSession('2026-10-19', 'push')
assert(logOf('2026-10-19') == null, 'starting a workout does not create a diet log')
upsertLog('2026-10-19', { lunchKcal: 700 })
assert(logOf('2026-10-19')?.dayKind === 'train', 'saving food on a session day freezes 训练日')
assert(logOf('2026-10-19')?.intakeTargetKcal === 2000, 'session day freezes the training target')

fresh()
upsertLog('2026-10-12', { lunchKcal: 100 })
startWorkoutSession('2026-10-12', 'push')
assert(logOf('2026-10-12')?.dayKind === 'train', 'starting a workout upgrades a non-manual rest day')
assert(logOf('2026-10-12')?.intakeTargetKcal === 2000, 'upgrade captures the current training target')
assert(logOf('2026-10-12')?.dayKindManual !== true, 'upgrade is not marked manual')

fresh()
setDayKind('2026-10-11', 'rest')
startWorkoutSession('2026-10-11', 'push')
assert(logOf('2026-10-11')?.dayKind === 'rest', 'manual 休息日 stays when a workout starts')
assert(logOf('2026-10-11')?.dayKindManual === true, 'manual flag stays set')
assert(logOf('2026-10-11')?.intakeTargetKcal === 1800, 'manual rest target stays')

fresh()
startWorkoutSession('2026-10-15', 'push')
upsertLog('2026-10-15', { breakfastKcal: 300 })
updateSettings({ trainingTargetKcal: 2300, targetKcal: 2300, restTargetKcal: 1500 })
startWorkoutSession('2026-10-15', 'pull')
assert(logOf('2026-10-15')?.intakeTargetKcal === 2000, 'another session does not rewrite a stored training target')
assert(logOf('2026-10-15')?.dayKind === 'train', 'stored 训练日 stays')
assert(getSnapshot().settings.restTargetKcal === 1500, 'rest setting itself is saved')
assert(getSnapshot().settings.targetKcal === 2300, 'editing the training target also updates targetKcal')

fresh()
updateSettings({ restTargetKcal: 1600 })
assert(getSnapshot().settings.targetKcal === 2000, 'editing the rest target leaves targetKcal')
assert(getSnapshot().settings.trainingTargetKcal === 2000, 'editing the rest target leaves the training target')
replaceAll({
  ...getSnapshot(),
  logs: [
    {
      date: '2026-10-16',
      breakfastKcal: 200,
      dayKind: 'rest',
      intakeTargetKcal: 1800,
      updatedAt: '2026-10-16T03:00:00.000Z',
    },
  ],
})
updateSettings({ restTargetKcal: 1500, trainingTargetKcal: 2400, targetKcal: 2400 })
assert(logOf('2026-10-16')?.intakeTargetKcal === 1800, 'settings edits do not rewrite a past day target')
assert(logOf('2026-10-16')?.dayKind === 'rest', 'settings edits do not rewrite a past day type')
assert(logOf('2026-10-16')?.updatedAt === '2026-10-16T03:00:00.000Z', 'settings edits do not bump the day timestamp')

await sleep(30)
setDayKind('2026-10-16', 'rest')
assert(logOf('2026-10-16')?.intakeTargetKcal === 1500, 'tapping 休息日 again captures the new rest target')
const stampedAt = logOf('2026-10-16')?.updatedAt
await sleep(30)
setDayKind('2026-10-16', 'rest')
assert(logOf('2026-10-16')?.updatedAt === stampedAt, 'tapping the same manual day again is a no-op')

const older = {
  ...emptyData(),
  settings: { ...DEFAULT_SETTINGS, trainingTargetKcal: 2000, restTargetKcal: 1800, targetKcal: 2000 },
  settingsUpdatedAt: '2026-10-01T00:00:00.000Z',
  workout: defaultWorkout(),
  logs: [
    {
      date: '2026-10-01',
      breakfastKcal: 100,
      dayKind: 'rest' as const,
      dayKindManual: true,
      intakeTargetKcal: 1800,
      updatedAt: '2026-10-01T00:00:00.000Z',
    },
  ],
}
const newer = {
  ...emptyData(),
  settings: {
    ...DEFAULT_SETTINGS,
    displayName: '新',
    targetKcal: 2200,
    trainingTargetKcal: 2200,
    restTargetKcal: 1600,
  },
  settingsUpdatedAt: '2026-10-02T00:00:00.000Z',
  workout: defaultWorkout(),
  logs: [
    {
      date: '2026-10-01',
      breakfastKcal: 120,
      dayKind: 'train' as const,
      dayKindManual: true,
      intakeTargetKcal: 2200,
      updatedAt: '2026-10-02T00:00:00.000Z',
    },
  ],
}
const merged = mergeCloudData(older, newer)
assert(merged.settings.trainingTargetKcal === 2200, 'newer settings keep trainingTargetKcal')
assert(merged.settings.restTargetKcal === 1600, 'newer settings keep restTargetKcal')
assert(merged.settings.targetKcal === 2200, 'newer settings keep targetKcal')
assert(merged.logs[0]?.dayKind === 'train', 'newer log keeps dayKind')
assert(merged.logs[0]?.dayKindManual === true, 'newer log keeps dayKindManual')
assert(merged.logs[0]?.intakeTargetKcal === 2200, 'newer log keeps intakeTargetKcal')

const doc = fromSyncDocument(JSON.parse(JSON.stringify(toSyncDocument(merged))))
assert(doc.settings.trainingTargetKcal === 2200 && doc.settings.restTargetKcal === 1600, 'sync document round-trips both targets')
assert(doc.logs[0]?.dayKind === 'train' && doc.logs[0]?.intakeTargetKcal === 2200, 'sync document round-trips the day target')

const localCustom = {
  ...emptyData(),
  settings: { ...DEFAULT_SETTINGS, targetKcal: 2100, trainingTargetKcal: 2100, restTargetKcal: 1700 },
  settingsUpdatedAt: '2026-10-09T00:00:00.000Z',
  workout: defaultWorkout(),
  logs: [] as DailyLog[],
}
const remoteLegacy = {
  version: 2,
  settings: {
    displayName: '旧设备',
    targetKcal: 1900,
    tdee: 2300,
    proteinTarget: 130,
    burnSource: 'band',
    bmrDefaultKcal: 1630,
    overlapDefaultKcal: 150,
  },
  settingsUpdatedAt: '2026-10-08T00:00:00.000Z',
  logs: [],
  workout: defaultWorkout(),
} as unknown as AppData
const kept = mergeCloudData(localCustom, remoteLegacy)
assert(kept.settings.trainingTargetKcal === 2100, 'older legacy settings do not wipe trainingTargetKcal')
assert(kept.settings.restTargetKcal === 1700, 'older legacy settings do not wipe restTargetKcal')

const legacyWins = mergeCloudData(remoteLegacy, {
  ...localCustom,
  settingsUpdatedAt: '2026-10-07T00:00:00.000Z',
})
assert(legacyWins.settings.targetKcal === 1900, 'newer legacy settings still supply targetKcal')
assert(legacyWins.settings.trainingTargetKcal === 1900, 'missing training target is filled from targetKcal on sync')
assert(legacyWins.settings.restTargetKcal === 1800, 'missing rest target defaults to 1800 on sync')

if (failed) {
  console.error(`\n${failed} target test(s) failed`)
  process.exit(1)
}
console.log('\nall target tests passed')
