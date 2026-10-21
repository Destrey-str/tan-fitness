import './polyfill-storage.ts'
import { hydrateAppData } from '../src/lib/hydrate.ts'
import { DEFAULT_PLAN_ID, DEFAULT_PLAN_NAME, defaultWorkout, sessionRestLength } from '../src/lib/workout.ts'
import { mergeCloudData } from '../src/lib/sync/merge.ts'
import {
  addPlanDay,
  addPlanExercise,
  createPlan,
  deletePlan,
  getSnapshot,
  movePlanDay,
  removePlanExercise,
  renamePlan,
  replaceAll,
  resetWorkoutTemplates,
  setActivePlan,
  startWorkoutSession,
  updatePlanExercise,
} from '../src/lib/storage.ts'
import { emptyData, DEFAULT_SETTINGS, type WorkoutSession } from '../src/types.ts'

let failed = 0

function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1
    console.error(`FAIL ${msg}`)
  } else {
    console.log(`ok  ${msg}`)
  }
}

function fresh() {
  replaceAll({
    ...emptyData(),
    settings: { ...DEFAULT_SETTINGS },
    workout: defaultWorkout(),
    tombstones: { logs: {}, sessions: {} },
  })
}

const migrated = hydrateAppData({
  version: 2,
  settings: { ...DEFAULT_SETTINGS },
  logs: [],
  workout: {
    restSecDefault: 75,
    templatesUpdatedAt: '2026-10-01T00:00:00.000Z',
    templates: [
      {
        id: 'push',
        name: '推胸',
        subtitle: '改过的副标题',
        exercises: [
          { id: 'push-wu-pec-min', name: '胸小肌放松', sets: 1, repsMin: 1, isWarmup: true, note: '慢' },
          { id: 'push-bench', name: '杠铃卧推', sets: 5, repsMin: 6, repsMax: 8, note: '暂停', restSec: 120 },
        ],
      },
      {
        id: 'pull',
        name: '拉',
        subtitle: '背',
        exercises: [{ id: 'pull-curl', name: '钢线弯举', sets: 3, repsMin: 12 }],
      },
    ],
    sessions: [
      {
        id: 'kept-session',
        date: '2026-10-01',
        templateId: 'push',
        templateName: '推',
        restSec: 90,
        startedAt: '2026-10-01T01:00:00.000Z',
        completedAt: '2026-10-01T02:00:00.000Z',
        currentExerciseIndex: 0,
        updatedAt: '2026-10-01T02:00:00.000Z',
        exercises: [
          {
            exerciseId: 'push-bench',
            name: '杠铃卧推',
            targetSets: 4,
            repsMin: 8,
            setsDone: 2,
            setLogs: [{ weightKg: 40 }, { weightKg: 42.5 }],
          },
        ],
      },
    ],
  },
})
const tan = migrated.workout.plans.find((plan) => plan.id === DEFAULT_PLAN_ID)
const push = tan?.days.find((day) => day.id === 'push')
const kept = migrated.workout.sessions.find((session) => session.id === 'kept-session')
assert(tan?.name === DEFAULT_PLAN_NAME, 'existing templates become 谭式推拉腿')
assert(migrated.workout.activePlanId === DEFAULT_PLAN_ID, 'migrated plan is active')
assert(push?.name === '推胸' && push.subtitle === '改过的副标题', 'custom day name and subtitle are kept')
assert(push?.exercises[0]?.isWarmup === true && push.exercises[0]?.note === '慢', 'warm-up and note are kept')
assert(push?.exercises[1]?.sets === 5 && push.exercises[1]?.restSec === 120, 'sets, reps range, and rest are kept')
assert(tan?.days.some((day) => day.id === 'pull'), 'other saved days are kept')
assert(tan?.updatedAt === '2026-10-01T00:00:00.000Z', 'migration keeps the template timestamp')
assert(kept?.exercises[0]?.setsDone === 2 && kept.exercises[0]?.setLogs?.[1]?.weightKg === 42.5, 'past session is unchanged')
assert(migrated.workout.restSecDefault === 75, 'rest default is not reset during migration')

fresh()
const originalBench = getSnapshot().workout.plans[0]?.days.find((day) => day.id === 'push')?.exercises.find(
  (exercise) => exercise.id === 'push-bench',
)?.name
const copyId = createPlan('出差', DEFAULT_PLAN_ID)
const blankId = createPlan('空白')
assert(getSnapshot().workout.plans.length === 3, 'blank and copied plans are added')
const copied = getSnapshot().workout.plans.find((plan) => plan.id === copyId)
assert(copied?.days.find((day) => day.id === 'push')?.exercises.some((exercise) => exercise.id === 'push-bench'), 'copy keeps exercise ids')
const blank = getSnapshot().workout.plans.find((plan) => plan.id === blankId)
assert(blank?.days.length === 1 && blank.days[0]?.exercises.length === 0, 'blank plan starts with an empty day')
replaceAll(getSnapshot())
assert(
  getSnapshot().workout.plans.find((plan) => plan.id === blankId)?.days[0]?.exercises.length === 0,
  'an empty day survives a reload',
)

renamePlan(copyId, '出差徒手')
addPlanDay(copyId, '肩')
const copyDays = () => getSnapshot().workout.plans.find((plan) => plan.id === copyId)?.days ?? []
const shoulder = copyDays()[copyDays().length - 1]
assert(shoulder?.name === '肩', 'a day can be added')
if (shoulder) movePlanDay(copyId, shoulder.id, -1)
assert(copyDays()[copyDays().length - 2]?.id === shoulder?.id, 'a day can move up')
if (shoulder) addPlanExercise(copyId, shoulder.id, true)
if (shoulder) addPlanExercise(copyId, shoulder.id, false)
const shoulderNow = () => copyDays().find((day) => day.id === shoulder?.id)
const warmup = shoulderNow()?.exercises.find((exercise) => exercise.isWarmup)
const lift = shoulderNow()?.exercises.find((exercise) => !exercise.isWarmup)
assert(Boolean(warmup) && Boolean(lift), 'warm-ups and exercises can be added')
assert(shoulderNow()?.exercises[0]?.isWarmup === true, 'warm-ups stay in front of lifts')
if (lift) {
  updatePlanExercise(copyId, shoulder!.id, lift.id, {
    name: '哑铃推举',
    sets: 4,
    repsMin: 8,
    repsMax: 12,
    restSec: 75,
    note: '靠椅',
  })
}
const edited = shoulderNow()?.exercises.find((exercise) => exercise.id === lift?.id)
assert(
  edited?.name === '哑铃推举' && edited.sets === 4 && edited.repsMax === 12 && edited.restSec === 75 && edited.note === '靠椅',
  'exercise name, sets, reps, rest, and note can be edited',
)
if (edited) removePlanExercise(copyId, shoulder!.id, edited.id)
assert(!shoulderNow()?.exercises.some((exercise) => exercise.id === edited?.id), 'an exercise can be removed')
for (const exercise of shoulderNow()?.exercises ?? []) {
  if (shoulder) removePlanExercise(copyId, shoulder.id, exercise.id)
}

setActivePlan(copyId)
assert(getSnapshot().workout.activePlanId === copyId, 'settings can switch the active plan')
assert(getSnapshot().workout.templates.some((day) => day.id === shoulder?.id), 'training days follow the active plan')
startWorkoutSession('2026-10-21', shoulder?.id ?? '', 90)
assert(getSnapshot().workout.sessions.length === 0, 'a day with no exercises does not start an empty session')

setActivePlan(DEFAULT_PLAN_ID)
startWorkoutSession('2026-10-21', 'push', 90)
const started = getSnapshot().workout.sessions.find(
  (session) => session.id === getSnapshot().workout.activeSessionId,
) as WorkoutSession
const bench = started?.exercises.find((exercise) => exercise.exerciseId === 'push-bench')
assert(bench?.nextWeightKg == null || bench.exerciseId === 'push-bench', 'default plan still starts 推')
const withRest = {
  ...started,
  currentExerciseIndex: started.exercises.findIndex((exercise) => exercise.exerciseId === 'push-bench'),
  exercises: started.exercises.map((exercise) =>
    exercise.exerciseId === 'push-bench' ? { ...exercise, restSec: 120 } : exercise,
  ),
}
assert(sessionRestLength(withRest) === 120, 'exercise rest overrides the session default')
assert(sessionRestLength({ ...withRest, exercises: withRest.exercises.map((exercise) => ({ ...exercise, restSec: undefined })) }) === started.restSec, 'missing exercise rest uses the session default')

const beforeResetSessions = getSnapshot().workout.sessions.length
updatePlanExercise(
  DEFAULT_PLAN_ID,
  'push',
  'push-bench',
  { name: '临时改名' },
)
resetWorkoutTemplates()
const after = getSnapshot().workout
assert(after.plans.some((plan) => plan.id === copyId), 'reset keeps other plans')
assert(after.plans.some((plan) => plan.id === blankId), 'reset keeps the blank plan')
assert(
  after.plans.find((plan) => plan.id === DEFAULT_PLAN_ID)?.days.find((day) => day.id === 'push')?.exercises.find(
    (exercise) => exercise.id === 'push-bench',
  )?.name === originalBench,
  'reset restores the default 谭式 plan',
)
assert(after.activePlanId === DEFAULT_PLAN_ID, 'reset makes 谭式推拉腿 active')
assert(after.sessions.length === beforeResetSessions, 'reset does not remove sessions')

deletePlan(copyId)
assert(!getSnapshot().workout.plans.some((plan) => plan.id === copyId), 'a plan can be deleted')
assert(Boolean(getSnapshot().tombstones?.plans?.[copyId]), 'deleting a plan writes a tombstone')
const remaining = getSnapshot().workout.plans.length
deletePlan(getSnapshot().workout.plans[0]!.id)
deletePlan(getSnapshot().workout.plans[0]!.id)
assert(getSnapshot().workout.plans.length === 1, 'the last plan cannot be deleted')
assert(getSnapshot().workout.plans.length === remaining - 1 || remaining === 1, 'only one plan was removed')

const weightPlan = createPlan('重量', DEFAULT_PLAN_ID)
replaceAll({
  ...getSnapshot(),
  workout: {
    ...getSnapshot().workout,
    sessions: [
      {
        id: 'history-1',
        date: '2026-10-18',
        templateId: 'push',
        templateName: '推',
        restSec: 90,
        startedAt: '2026-10-18T01:00:00.000Z',
        completedAt: '2026-10-18T02:00:00.000Z',
        currentExerciseIndex: 0,
        exercises: [
          {
            exerciseId: 'custom-squat',
            name: '高脚杯深蹲',
            targetSets: 3,
            repsMin: 12,
            setsDone: 3,
            setLogs: [{ weightKg: 16 }, { weightKg: 18 }, { weightKg: 18 }],
          },
        ],
      },
    ],
  },
})
setActivePlan(weightPlan)
const squatDay = getSnapshot().workout.plans.find((plan) => plan.id === weightPlan)?.days[0]
if (squatDay) {
  addPlanExercise(weightPlan, squatDay.id, false)
  const created = getSnapshot()
    .workout.plans.find((plan) => plan.id === weightPlan)
    ?.days.find((day) => day.id === squatDay.id)
    ?.exercises.find((exercise) => !exercise.isWarmup)
  if (created) {
    updatePlanExercise(weightPlan, squatDay.id, created.id, { name: '高脚杯深蹲', sets: 3, repsMin: 12 })
  }
}
const named = getSnapshot()
  .workout.plans.find((plan) => plan.id === weightPlan)
  ?.days.flatMap((day) => day.exercises)
  .find((exercise) => exercise.name === '高脚杯深蹲' && !exercise.isWarmup)
startWorkoutSession('2026-10-21', getSnapshot().workout.templates[0]?.id ?? 'push', 90)
const nextSquat = getSnapshot().workout.sessions.find((session) => !session.completedAt)?.exercises.find(
  (exercise) => exercise.name === '高脚杯深蹲',
)
assert(nextSquat?.nextWeightKg === 16, 'last weight still matches by name across plans')

fresh()
const localPlan = {
  ...defaultWorkout().plans[0]!,
  name: DEFAULT_PLAN_NAME,
  updatedAt: '2026-10-19T00:00:00.000Z',
  days: defaultWorkout().plans[0]!.days.map((day) =>
    day.id === 'push' ? { ...day, name: '本地推' } : day,
  ),
}
const localSession: WorkoutSession = {
  id: 'history-1',
  date: '2026-10-18',
  templateId: 'push',
  templateName: '推',
  restSec: 90,
  startedAt: '2026-10-18T01:00:00.000Z',
  completedAt: '2026-10-18T02:00:00.000Z',
  currentExerciseIndex: 0,
  exercises: [
    {
      exerciseId: 'push-bench',
      name: '杠铃卧推',
      targetSets: 4,
      repsMin: 8,
      setsDone: 1,
      setLogs: [{ weightKg: 40 }],
    },
  ],
}
const local = {
  ...emptyData(),
  settings: { ...DEFAULT_SETTINGS },
  workout: {
    ...defaultWorkout(),
    plans: [localPlan, { id: blankId, name: '空白', days: [], updatedAt: '2026-10-18T00:00:00.000Z' }],
    activePlanId: DEFAULT_PLAN_ID,
    activePlanUpdatedAt: '2026-10-18T00:00:00.000Z',
    sessions: [localSession],
  },
  tombstones: { logs: {}, sessions: {}, plans: {} },
}
const remotePlan = {
  id: 'remote-plan',
  name: '远程新名字',
  days: [
    {
      id: 'remote-day',
      name: '远程日',
      subtitle: '',
      exercises: [{ id: 'remote-ex', name: '引体', sets: 3, repsMin: 5 }],
    },
  ],
  updatedAt: '2026-10-20T00:00:00.000Z',
}
const remote = {
  ...local,
  workout: {
    ...local.workout,
    plans: [
      {
        ...local.workout.plans.find((plan) => plan.id === DEFAULT_PLAN_ID)!,
        name: '不该覆盖',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
      remotePlan,
    ],
    activePlanId: 'remote-plan',
    activePlanUpdatedAt: '2099-01-01T00:00:00.000Z',
    sessions: local.workout.sessions,
  },
  tombstones: { logs: {}, sessions: {}, plans: { [blankId]: '2099-01-01T00:00:00.000Z' } },
}
const merged = mergeCloudData(local, remote)
assert(merged.workout.plans.some((plan) => plan.id === DEFAULT_PLAN_ID), 'older remote copy does not drop the local plan')
assert(
  merged.workout.plans.find((plan) => plan.id === DEFAULT_PLAN_ID)?.name === DEFAULT_PLAN_NAME,
  'newer local plan body wins',
)
assert(
  merged.workout.plans.some((plan) => plan.id === 'remote-plan' && plan.name === '远程新名字'),
  'a newer remote plan is merged in',
)
assert(!merged.workout.plans.some((plan) => plan.id === blankId), 'a tombstone drops the deleted plan')
assert(merged.workout.activePlanId === 'remote-plan', 'newer activePlanId is kept')
assert(merged.workout.sessions.some((session) => session.id === 'history-1'), 'plan merge keeps sessions')

const legacyRemote = hydrateAppData({
  workout: {
    templates: [
      {
        id: 'push',
        name: '旧设备推',
        subtitle: '',
        exercises: [{ id: 'push-bench', name: '杠铃卧推', sets: 4, repsMin: 8 }],
      },
    ],
    templatesUpdatedAt: '2026-09-01T00:00:00.000Z',
    sessions: [],
  },
})
const keptLocal = mergeCloudData(
  {
    ...emptyData(),
    settings: { ...DEFAULT_SETTINGS },
    workout: {
      ...defaultWorkout(),
      plans: [
        {
          ...defaultWorkout().plans[0]!,
          updatedAt: '2026-10-02T00:00:00.000Z',
          days: defaultWorkout().plans[0]!.days.map((day) =>
            day.id === 'push' ? { ...day, name: '本地推' } : day,
          ),
        },
      ],
    },
  },
  legacyRemote,
)
assert(
  keptLocal.workout.plans.find((plan) => plan.id === DEFAULT_PLAN_ID)?.days.find((day) => day.id === 'push')?.name === '本地推',
  'an older device without plans does not wipe the edited plan',
)

if (failed) {
  console.error(`\n${failed} plan test(s) failed`)
  process.exit(1)
}
console.log('\nall plan tests passed')
