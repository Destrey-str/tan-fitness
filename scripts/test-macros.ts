import './polyfill-storage.ts'
import { hydrateAppData } from '../src/lib/hydrate.ts'
import { defaultWorkout } from '../src/lib/workout.ts'
import { mergeCloudData } from '../src/lib/sync/merge.ts'
import {
  calorieDeficit,
  formatDeficitEquation,
  powderContribution,
  totalCarbsG,
  totalIntake,
  totalProteinG,
} from '../src/lib/stats.ts'
import { getSnapshot, replaceAll, updateSettings, upsertLog } from '../src/lib/storage.ts'
import {
  DEFAULT_SETTINGS,
  emptyData,
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

const plain: DailyLog = {
  date: '2026-10-01',
  bmrKcal: 1630,
  overlapKcal: 150,
  bandBurnKcal: 800,
  breakfastKcal: 400,
  lunchKcal: 600,
  dinnerKcal: 600,
}
assert(calorieDeficit(plain, DEFAULT_SETTINGS) === 680, 'deficit without scoops stays 680')
assert(
  formatDeficitEquation(plain, DEFAULT_SETTINGS) === '1630 + 800 − 150 − 1600 = 680',
  'deficit equation without scoops is unchanged',
)
assert(totalIntake(plain) === 1600, 'meal calories still sum on their own')
assert(totalCarbsG(plain) === 0 && totalProteinG(plain) === 0, 'missing meal macros display as 0')

const migrated = hydrateAppData({
  version: 2,
  settings: { displayName: '', targetKcal: 2000, burnSource: 'band' },
  logs: [
    {
      date: '2026-10-02',
      breakfastKcal: 400,
      breakfastProteinG: 20,
      lunchKcal: 500,
      proteinScoops: 2,
      updatedAt: '2026-10-02T01:00:00.000Z',
    },
    {
      date: '2026-10-03',
      breakfastKcal: 300,
      proteinScoops: 0,
      updatedAt: '2026-10-03T01:00:00.000Z',
    },
  ],
})
const scooped = migrated.logs.find((log) => log.date === '2026-10-02')!
const zero = migrated.logs.find((log) => log.date === '2026-10-03')!
assert(scooped.updatedAt === '2026-10-02T01:00:00.000Z', 'powder migration does not touch updatedAt')
assert(scooped.breakfastCarbsG == null, 'missing meal carbs are not written back as 0')
assert(scooped.powderKcalPerScoop === 130, 'old scoops freeze 130 kcal per scoop')
assert(scooped.powderProteinPerScoop === 24 && scooped.powderCarbsPerScoop === 4, 'old scoops freeze 24 g protein and 4 g carbs')
assert(totalIntake(scooped, migrated.settings) === 400 + 500 + 260, 'powder calories are added once, beside the meals')
assert(totalProteinG(scooped) === 20 + 48, 'protein is meals plus scoops, missing meals count as 0')
assert(totalCarbsG(scooped) === 8, 'carbs are meals plus scoops')
assert(powderContribution(zero).kcal === 0, 'zero scoops add nothing')
assert(zero.powderKcalPerScoop == null, 'zero scoops do not stamp powder rates')
assert(migrated.settings.scoopKcal === 130 && migrated.settings.scoopProteinG === 24 && migrated.settings.scoopCarbsG === 4, 'old settings gain the scoop defaults')

replaceAll({
  ...emptyData(),
  settings: { ...DEFAULT_SETTINGS, scoopKcal: 140, scoopProteinG: 20, scoopCarbsG: 2 },
  workout: defaultWorkout(),
  logs: [scooped],
})
updateSettings({ scoopKcal: 200, scoopProteinG: 30, scoopCarbsG: 9 })
const kept = getSnapshot().logs.find((log) => log.date === '2026-10-02')!
assert(kept.powderKcalPerScoop === 130, 'changing scoop settings does not rewrite a saved day')
assert(totalIntake(kept, getSnapshot().settings) === 1160, 'saved powder calories stay on the frozen rate')

upsertLog('2026-10-04', { breakfastKcal: 100, proteinScoops: 1 })
const created = getSnapshot().logs.find((log) => log.date === '2026-10-04')!
assert(created.powderKcalPerScoop === 200 && created.powderProteinPerScoop === 30, 'a new day freezes the current scoop settings')
assert(totalIntake(created) === 300, 'new day intake is the meal plus one scoop')
assert(totalProteinG(created) === 30 && totalCarbsG(created) === 9, 'new day macros follow the frozen scoop')
updateSettings({ scoopKcal: 110 })
upsertLog('2026-10-04', { proteinScoops: 2 })
const more = getSnapshot().logs.find((log) => log.date === '2026-10-04')!
assert(more.powderKcalPerScoop === 200, 'editing scoops keeps the rate already saved that day')
assert(totalIntake(more) === 100 + 400, 'two scoops use the saved rate')

const older = {
  ...emptyData(),
  settings: { ...DEFAULT_SETTINGS },
  workout: defaultWorkout(),
  logs: [
    {
      date: '2026-10-05',
      breakfastKcal: 100,
      breakfastProteinG: 10,
      updatedAt: '2026-10-05T01:00:00.000Z',
    },
  ],
}
const newer = {
  ...older,
  logs: [
    {
      date: '2026-10-05',
      breakfastKcal: 180,
      breakfastCarbsG: 22,
      breakfastProteinG: 31,
      proteinScoops: 1,
      powderKcalPerScoop: 130,
      powderProteinPerScoop: 24,
      powderCarbsPerScoop: 4,
      updatedAt: '2026-10-05T08:00:00.000Z',
    },
  ],
  settings: { ...DEFAULT_SETTINGS, scoopKcal: 150 },
  settingsUpdatedAt: '2026-10-05T08:00:00.000Z',
}
const merged = mergeCloudData(older, newer)
const day = merged.logs.find((log) => log.date === '2026-10-05')!
assert(day.breakfastProteinG === 31 && day.breakfastCarbsG === 22, 'newer log keeps meal protein and carbs')
assert(day.powderKcalPerScoop === 130, 'newer log keeps its powder rate')
assert(merged.settings.scoopKcal === 150, 'newer settings keep the scoop default')
assert(totalIntake(day, merged.settings) === 180 + 130, 'merged intake adds powder from the day, not the new setting')

if (failed) {
  console.error(`\n${failed} macro test(s) failed`)
  process.exit(1)
}
console.log('\nall macro tests passed')
