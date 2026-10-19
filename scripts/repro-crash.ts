/**
 * Repro: old / messy localStorage payloads must hydrate and render stats
 * without throwing (the iPhone white-screen class of bugs).
 */
import { hydrateAppData, parseStoredPayload } from '../src/lib/hydrate.ts'
import {
  calorieDeficit,
  formatDeficitEquation,
  formatInt,
  formatOne,
  logHasData,
  resolveBurn,
  resolveOverlap,
  totalIntake,
} from '../src/lib/stats.ts'
import {
  formatSetWeights,
  lastWeightsFromHistory,
  sessionProgress,
} from '../src/lib/workout.ts'

const today = new Date().toISOString().slice(0, 10)

const fixtures: Record<string, unknown> = {
  empty: {},
  preBmr: {
    version: 1,
    settings: { displayName: '', targetKcal: 2000, tdee: 2300, proteinTarget: 130, burnSource: 'band' },
    logs: [
      {
        date: '2026-09-01',
        weightKg: 70.2,
        waistCm: 85,
        breakfastKcal: 430,
        lunchKcal: 520,
        dinnerKcal: 480,
        extraKcal: 120,
        bandBurnKcal: 800,
      },
    ],
  },
  bmrEra: {
    version: 1,
    settings: {
      displayName: null,
      targetKcal: '2000',
      tdee: 2300,
      proteinTarget: 130,
      burnSource: 'band',
      bmrDefaultKcal: '1630',
      bandIncludesBmr: true,
    },
    logs: [
      {
        date: today,
        weightKg: '70.4',
        waistCm: '84.5',
        bmrKcal: '1630',
        bandBurnKcal: '820',
        breakfastKcal: '430',
        lunchKcal: '500',
        dinnerKcal: '480',
        extraKcal: '',
        extraNote: '120+108',
      },
    ],
  },
  extraBurnToday: {
    version: 1,
    settings: {
      displayName: '谭',
      targetKcal: 2000,
      extraBurnDefaultKcal: 150,
      bmrDefaultKcal: 1630,
      burnSource: 'band',
      tdee: 2300,
      proteinTarget: 130,
    },
    logs: [
      {
        date: today,
        weightKg: 69.8,
        extraBurnKcal: 150,
        bandBurnKcal: 900,
        breakfastKcal: 440,
        lunchKcal: 510,
        dinnerKcal: 490,
        extraKcal: 230,
      },
    ],
    workout: {
      restSecDefault: '90',
      templates: [],
      sessions: [
        {
          id: 's1',
          date: today,
          templateId: 'push',
          templateName: '推',
          restSec: 90,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          currentExerciseIndex: 0,
          exercises: [
            {
              exerciseId: 'push-bench',
              name: '杠铃卧推',
              targetSets: 4,
              repsMin: 8,
              setsDone: 4,
              setLogs: [{ weightKg: '60' }, { weightKg: 62.5 }, {}, { weightKg: '65' }],
            },
            null,
            { name: 'broken' },
          ],
        },
      ],
    },
  },
  stringyAndNulls: {
    settings: { displayName: null, extraBurnDefaultKcal: null, bmrDefaultKcal: undefined },
    logs: [
      { date: today, weightKg: null, bandBurnKcal: 'not-a-number', extraBurnKcal: '150' },
      { date: 'bad' },
      null,
      { date: '2026-10-01', breakfastKcal: '400', lunchKcal: 500, dinnerKcal: '450' },
    ],
    workout: { sessions: [{ id: 1, exercises: 'nope' }] },
  },
  backupWrapper: {
    kind: 'jianzhi-notes-backup',
    exportedAt: '2026-10-16T00:00:00.000Z',
    data: {
      version: 1,
      settings: { displayName: 0, targetKcal: 2000, burnSource: 'band' },
      logs: [{ date: today, weightKg: 70, breakfastKcal: 400, lunchKcal: 400, dinnerKcal: 400 }],
    },
  },
  nestedLocalStorage: {
    localStorage: {
      'jianzhi-log-v1': JSON.stringify({
        version: 1,
        settings: { displayName: '', targetKcal: 2000, burnSource: 'band' },
        logs: [{ date: today, weightKg: 71 }],
      }),
    },
  },
  brokenWorkout: {
    version: 1,
    settings: { displayName: '' },
    logs: [{ date: today, weightKg: 70 }],
    workout: {
      templates: [{ id: 'push', name: '推', exercises: null }],
      sessions: [
        {
          id: 'active',
          date: today,
          templateId: 'push',
          templateName: '推',
          restSec: 90,
          startedAt: 'x',
          currentExerciseIndex: 99,
          exercises: [
            { exerciseId: 'a', name: '卧推', targetSets: 1e9, setsDone: -3, repsMin: 8 },
          ],
        },
      ],
      activeSessionId: 'active',
    },
  },
}

let failed = 0
for (const [name, payload] of Object.entries(fixtures)) {
  try {
    const data = hydrateAppData(payload)
    const nameTrim = String(data.settings.displayName ?? '').trim()
    void nameTrim
    if (typeof data.settings.displayName !== 'string') {
      throw new Error(`${name}: displayName is not a string`)
    }
    if (!Array.isArray(data.logs)) throw new Error(`${name}: logs missing`)
    if (!data.workout || !Array.isArray(data.workout.sessions)) {
      throw new Error(`${name}: workout missing`)
    }
    for (const log of data.logs) {
      totalIntake(log)
      resolveOverlap(log, data.settings)
      const burn = resolveBurn(log, data.settings)
      formatInt(burn.kcal)
      formatInt(burn.band)
      formatInt(burn.overlap)
      formatInt(burn.bmr)
      calorieDeficit(log, data.settings)
      logHasData(log)
      formatOne(log.weightKg)
      if (typeof burn.kcal !== 'number' || !Number.isFinite(burn.kcal)) {
        throw new Error(`${name}: burn.kcal not finite`)
      }
    }
    lastWeightsFromHistory(data.workout.sessions)
    for (const session of data.workout.sessions) {
      sessionProgress(session)
      for (const ex of session.exercises) formatSetWeights(ex)
      if (session.exercises.some((ex) => ex.targetSets > 30)) {
        throw new Error(`${name}: targetSets not clamped`)
      }
    }
    const roundTrip = parseStoredPayload(JSON.stringify(payload))
    if (!roundTrip.ok) throw new Error(`${name}: JSON round-trip parse failed`)
    console.log(`ok  ${name}  logs=${data.logs.length} sessions=${data.workout.sessions.length}`)
  } catch (err) {
    failed += 1
    console.error(`FAIL ${name}`, err)
  }
}

const corrupt = parseStoredPayload('{not json')
if (corrupt.ok) {
  failed += 1
  console.error('FAIL corrupt JSON was marked ok')
} else {
  console.log('ok  corrupt JSON kept as read-error, data not thrown')
}

try {
  const v1 = hydrateAppData({
    version: 1,
    settings: {
      displayName: '',
      targetKcal: 2000,
      tdee: 2300,
      proteinTarget: 130,
      burnSource: 'band',
      bmrDefaultKcal: 1630,
      extraBurnDefaultKcal: 200,
    },
    logs: [
      {
        date: today,
        bmrKcal: 1630,
        extraBurnKcal: 200,
        bandBurnKcal: 800,
        breakfastKcal: 400,
        lunchKcal: 400,
        dinnerKcal: 800,
      },
    ],
  })
  const log = v1.logs[0]
  const overlap = resolveOverlap(log, v1.settings)
  const deficit = calorieDeficit(log, v1.settings)
  const eq = formatDeficitEquation(log, v1.settings)
  if (v1.settings.overlapDefaultKcal !== 150) {
    throw new Error(`v1 settings overlap should migrate to 150, got ${v1.settings.overlapDefaultKcal}`)
  }
  if (overlap !== 150) throw new Error(`v1 extraBurn 200 must become overlap 150, got ${overlap}`)
  if (deficit !== 680) throw new Error(`expected 1630+800-150-1600=680, got ${deficit}`)
  if (eq !== '1630 + 800 − 150 − 1600 = 680') throw new Error(`equation mismatch: ${eq}`)
  if (v1.logs.length !== 1 || v1.logs[0].bandBurnKcal !== 800) {
    throw new Error('v1 log fields were dropped')
  }
  console.log('ok  v1 extraBurn migrates to overlap 150 (subtract), formula 680')
} catch (err) {
  failed += 1
  console.error('FAIL overlap migration', err)
}

try {
  const v2 = hydrateAppData({
    version: 2,
    settings: {
      displayName: '',
      targetKcal: 2000,
      burnSource: 'band',
      bmrDefaultKcal: 1630,
      overlapDefaultKcal: 180,
    },
    logs: [
      {
        date: today,
        bmrKcal: 1630,
        overlapKcal: 180,
        bandBurnKcal: 800,
        breakfastKcal: 400,
        lunchKcal: 400,
        dinnerKcal: 800,
      },
    ],
  })
  const deficit = calorieDeficit(v2.logs[0], v2.settings)
  if (resolveOverlap(v2.logs[0], v2.settings) !== 180) {
    throw new Error('v2 overlap should be kept')
  }
  if (deficit !== 650) throw new Error(`expected 1630+800-180-1600=650, got ${deficit}`)
  console.log('ok  v2 overlap 180 kept (not reset)')
} catch (err) {
  failed += 1
  console.error('FAIL v2 overlap keep', err)
}

try {
  const { renderToString } = await import('react-dom/server')
  const { createElement } = await import('react')
  const { SummaryCards } = await import('../src/components/SummaryCards.tsx')
  const dirty = hydrateAppData(fixtures.bmrEra)
  const html = renderToString(
    createElement(SummaryCards, { log: dirty.logs[0], settings: dirty.settings }),
  )
  if (!html.includes('总摄入') && !html.includes('消耗')) {
    throw new Error('SummaryCards rendered empty')
  }
  String(dirty.settings.displayName).trim()
  console.log('ok  SummaryCards SSR with BMR-era string/null fields')
} catch (err) {
  failed += 1
  console.error('FAIL SummaryCards SSR', err)
}

if (failed > 0) {
  console.error(`\n${failed} fixture(s) failed`)
  process.exit(1)
}
console.log('\nall fixtures hydrated without throw; old data is readable')
