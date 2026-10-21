import './polyfill-storage.ts'
import { DEFAULT_SETTINGS, emptyData, type AppData, type WorkoutSession } from '../src/types.ts'
import { defaultWorkout, restClockChanged } from '../src/lib/workout.ts'
import { mergeCloudData } from '../src/lib/sync/merge.ts'
import { mergeSyncResult } from '../src/lib/sync/engine.ts'
import {
  completeWorkoutSet,
  endWorkoutRest,
  finishWorkoutSession,
  getSnapshot,
  replaceAll,
  selectWorkoutExercise,
  setExerciseNextWeight,
  setExerciseSeedWeights,
  startWorkoutSession,
  undoLastWorkoutSet,
} from '../src/lib/storage.ts'

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

function ex(
  id: string,
  name: string,
  sets: number,
  repsMin = 10,
): { id: string; name: string; sets: number; repsMin: number } {
  return { id, name, sets, repsMin }
}

function load(partial: Record<string, unknown> = {}) {
  replaceAll({
    ...emptyData(),
    settings: { ...DEFAULT_SETTINGS },
    workout: {
      ...defaultWorkout(),
      plans: [],
      activePlanId: undefined,
      templates: [
        {
          id: 'push',
          name: '推',
          subtitle: 'test',
          exercises: [
            ex('e1', '动作一', 1),
            ex('e2', '动作二', 2),
            ex('e3', '动作三', 1),
            ex('e4', '动作四', 2, 12),
          ],
        },
        ...defaultWorkout().templates.filter((t) => t.id !== 'push'),
      ],
      ...partial,
    },
    tombstones: { logs: {}, sessions: {} },
  })
}

function active() {
  const workout = getSnapshot().workout
  return workout.sessions.find((s) => s.id === workout.activeSessionId)
}

async function finishSet(sessionId: string) {
  completeWorkoutSet(sessionId)
  await sleep(560)
  endWorkoutRest(sessionId)
}

const ends = 1_000_000
assert(!restClockChanged(0, 200, ends), 'rest clock ignores ticks inside the same second')
assert(restClockChanged(0, 1000, ends), 'rest clock updates when the displayed second changes')
assert(
  restClockChanged(400, 600, ends, 500),
  'rest clock updates when the anti-double-tap lock expires',
)
assert(!restClockChanged(600, 800, ends, 500), 'rest clock stays steady after the lock expires')

load({})
startWorkoutSession('2026-10-17', 'push', 90)
const started = active()
assert(Boolean(started), 'session starts')
const sid = started!.id
completeWorkoutSet(sid)
completeWorkoutSet(sid)
const locked = active()!
assert(locked.exercises[0]?.setsDone === 1, 'double tap does not log a second set')
assert(locked.currentExerciseIndex === 0, 'rest keeps the finished exercise on screen')
assert(locked.restEndsAt != null, 'rest starts once')
assert(locked.restAdvanceFrom === 0, 'rest remembers which exercise to leave')
endWorkoutRest(sid)
assert(active()!.restEndsAt != null, 'skip is ignored during the anti-double-tap lock')
await sleep(560)

selectWorkoutExercise(sid, 3)
const picked = active()!
assert(picked.currentExerciseIndex === 3, 'tapping exercise 4 makes it current during rest')
assert(picked.restEndsAt == null, 'picking an exercise leaves rest')
assert(picked.restAdvanceFrom == null, 'picking an exercise cancels the pending advance')
endWorkoutRest(sid)
assert(active()!.currentExerciseIndex === 3, 'a late rest-end does not jump back to exercise 2')

setExerciseNextWeight(sid, 'e4', 50)
await finishSet(sid)
const mid = active()!
assert(mid.currentExerciseIndex === 3, 'rest between sets stays on the picked exercise')
assert(mid.exercises[3]?.setsDone === 1, 'picked exercise kept its completed set')
assert(mid.exercises[3]?.setLogs?.[0]?.weightKg === 50, 'logged the typed weight')
assert(mid.exercises[3]?.nextWeightKg === 50, 'next set keeps the weight when no per-set plan exists')

await finishSet(sid)
const afterFour = active()!
assert(afterFour.currentExerciseIndex === 1, 'after exercise 4, return to unfinished exercise 2')
assert(afterFour.exercises[3]?.setsDone === 2, 'exercise 4 is complete')
assert(afterFour.exercises[1]?.setsDone === 0, 'exercise 2 was not auto-completed')

undoLastWorkoutSet(sid)
const undone = active()!
assert(undone.currentExerciseIndex === 3, 'undo returns to exercise 4')
assert(undone.exercises[3]?.setsDone === 1, 'undo restores the previous set')
assert(undone.exercises[3]?.nextWeightKg === 50, 'undo restores that set weight')
assert(undone.restEndsAt == null, 'undo clears rest')

await finishSet(sid)
await finishSet(sid)
await finishSet(sid)
const skipped = active()!
assert(skipped.exercises[1]?.setsDone === 2, 'exercise 2 can be finished')
assert(skipped.currentExerciseIndex === 2, 'finished exercise 2 skips ahead to unfinished exercise 3')

const localSnap = getSnapshot()
const localSession = active()!
const remoteSession: WorkoutSession = {
  ...localSession,
  currentExerciseIndex: 1,
  restEndsAt: undefined,
  restLockUntil: undefined,
  restAdvanceFrom: undefined,
  updatedAt: '2099-01-01T00:00:00.000Z',
  exercises: localSession.exercises.map((item, index) =>
    index === 0 ? { ...item, setsDone: 1 } : { ...item },
  ),
}
const remote: AppData = {
  ...localSnap,
  workout: { ...localSnap.workout, sessions: [remoteSession], activeSessionId: undefined },
}
const merged = mergeCloudData(localSnap, remote)
const mergedSession = merged.workout.sessions.find((s) => s.id === sid)
assert(mergedSession?.currentExerciseIndex === 2, 'sync keeps the exercise picked on this device')
assert(mergedSession?.restEndsAt == null, 'sync does not invent a rest timer')
assert(mergedSession?.exercises[0]?.setsDone === 1, 'newer remote set progress still merges')

const stale = mergeSyncResult(localSnap, remote, localSnap)
assert(stale === remote, 'sync with no local edit applies the merged snapshot')
const edited: AppData = {
  ...localSnap,
  workout: {
    ...localSnap.workout,
    sessions: [{ ...localSession, currentExerciseIndex: 3, updatedAt: '2099-06-01T00:00:00.000Z' }],
  },
}
const kept = mergeSyncResult(localSnap, remote, edited)
assert(
  kept.workout.sessions.find((s) => s.id === sid)?.currentExerciseIndex === 3,
  'sync in flight does not reset a newer manual pick',
)

load({
  sessions: [
    {
      id: 'past',
      date: '2026-10-17',
      templateId: 'push',
      templateName: '推',
      restSec: 90,
      startedAt: '2026-10-17T01:00:00.000Z',
      completedAt: '2026-10-17T02:00:00.000Z',
      currentExerciseIndex: 0,
      exercises: [
        {
          exerciseId: 'legacy-bench',
          name: '杠铃卧推',
          targetSets: 4,
          repsMin: 10,
          setsDone: 3,
          setLogs: [{ weightKg: '40kg' }, { weightKg: 42.5 }, { weightKg: '45' }],
        },
      ],
    },
  ],
})
replaceAll({
  ...getSnapshot(),
  workout: {
    ...getSnapshot().workout,
    plans: [],
    activePlanId: undefined,
    templates: [
      {
        id: 'push',
        name: '推',
        subtitle: 'bench',
        exercises: [ex('push-bench', '杠铃卧推', 4, 10)],
      },
    ],
  },
})
startWorkoutSession('2026-10-18', 'push', 90)
const bench = active()!.exercises[0]!
assert(bench.nextWeightKg === 40, 'first set uses the last session weight')
assert(
  bench.plannedWeights?.join(',') === '40,42.5,45,45',
  'later sets follow history and carry the last logged weight',
)
assert(bench.lastWeightHint === '上次: 40/42.5/45kg × 10 (10/17)', 'hint shows weights, reps, and date')

load({})
setExerciseSeedWeights('e2', '动作二', [30])
startWorkoutSession('2026-10-17', 'push', 90)
const seeded = active()!.exercises[1]!
assert(seeded.nextWeightKg === 30, 'a weight typed before starting fills an empty history')
assert(seeded.plannedWeights?.[1] === 30, 'that typed weight is kept for the later set')
assert(seeded.lastWeightHint == null, 'typed weights are not labeled as a past session')
const seededId = active()!.id
setExerciseNextWeight(seededId, 'e1', 10)
await finishSet(seededId)
setExerciseNextWeight(seededId, 'e2', 30)
await finishSet(seededId)
setExerciseNextWeight(seededId, 'e2', 32.5)
await finishSet(seededId)
setExerciseNextWeight(seededId, 'e3', 20)
await finishSet(seededId)
setExerciseNextWeight(seededId, 'e4', 15)
await finishSet(seededId)
setExerciseNextWeight(seededId, 'e4', 15)
await finishSet(seededId)
finishWorkoutSession(seededId, false)
const saved = getSnapshot().workout.sessions.find((s) => s.id === seededId)
assert(Boolean(saved?.completedAt), 'finishing a workout keeps the session for next time')
startWorkoutSession('2026-10-18', 'push', 90)
const nextTime = active()!.exercises[1]!
assert(nextTime.nextWeightKg === 30, 'the next session reads set 1 from the finished workout')
assert(nextTime.plannedWeights?.[1] === 32.5, 'the next session reads set 2 separately')
assert(nextTime.lastWeightHint === '上次: 30/32.5kg × 10 (10/17)', 'next session shows the last-time hint')

const memLocal = getSnapshot()
const memRemote: AppData = {
  ...memLocal,
  workout: {
    ...memLocal.workout,
    weightMemory: [
      { exerciseId: 'e2', name: '动作二', weights: [99], updatedAt: '2020-01-01T00:00:00.000Z' },
      { exerciseId: 'e9', name: '新动作', weights: [12], updatedAt: '2026-10-19T00:00:00.000Z' },
    ],
  },
}
const memMerged = mergeCloudData(
  {
    ...memLocal,
    workout: {
      ...memLocal.workout,
      weightMemory: [
        { exerciseId: 'e2', name: '动作二', weights: [30, 32.5], updatedAt: '2026-10-18T00:00:00.000Z' },
      ],
    },
  },
  memRemote,
)
const e2mem = memMerged.workout.weightMemory?.find((entry) => entry.exerciseId === 'e2')
assert(e2mem?.weights[0] === 30, 'newer local weight memory wins')
assert(
  memMerged.workout.weightMemory?.some((entry) => entry.exerciseId === 'e9'),
  'remote weight memory for another exercise is kept',
)
assert(memMerged.workout.sessions.length >= 2, 'weight merge does not drop workout sessions')

if (failed) {
  console.error(`\n${failed} workout test(s) failed`)
  process.exit(1)
}
console.log('\nall workout tests passed')
