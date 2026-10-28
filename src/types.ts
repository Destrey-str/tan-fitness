export const DATA_VERSION = 2 as const

export type BurnSource = 'band' | 'tdee'

export type TabId = 'today' | 'log' | 'train' | 'charts' | 'settings'

export type TemplateId = 'push' | 'pull' | 'legs'

export interface ExerciseTemplate {
  id: string
  name: string
  sets: number
  repsMin: number
  repsMax?: number
  note?: string
  isWarmup?: boolean
  /** Seconds of rest after a working set. Missing → the session default. */
  restSec?: number
}

/** Weights typed before a session starts, so the next workout can prefill them. */
export interface WeightMemoryEntry {
  exerciseId: string
  name: string
  /** Set 1 is index 0. Null means that set was left blank. */
  weights: (number | null)[]
  updatedAt: string
}

export interface WorkoutTemplate {
  id: string
  name: string
  subtitle: string
  tip?: string
  exercises: ExerciseTemplate[]
}

/** A named program. Days are the old push/pull/legs templates. */
export interface TrainingPlan {
  id: string
  name: string
  days: WorkoutTemplate[]
  updatedAt?: string
}

export interface SetLog {
  weightKg?: number
}

export interface ExerciseSession {
  exerciseId: string
  name: string
  targetSets: number
  repsMin: number
  repsMax?: number
  note?: string
  /** Copied from the plan when the session starts. */
  restSec?: number
  setsDone: number
  /** Optional free-text for the whole exercise (e.g. 握距、感觉). */
  weightNote?: string
  /** One entry per completed set; index 0 is set 1. */
  setLogs?: SetLog[]
  /** Draft weight for the current / next set. */
  nextWeightKg?: number
  /** Per-set weights to offer, index 0 = set 1. Null keeps the box empty. */
  plannedWeights?: (number | null)[]
  /** Shown during the session, e.g. 上次: 40kg × 10 (10/17). */
  lastWeightHint?: string
  isWarmup?: boolean
}

export interface WorkoutSession {
  id: string
  date: string
  templateId: string
  templateName: string
  restSec: number
  startedAt: string
  completedAt?: string
  currentExerciseIndex: number
  restEndsAt?: number
  restLockUntil?: number
  /**
   * Set when the current exercise just finished and rest should advance
   * to the next unfinished exercise. Cleared if the user picks an exercise.
   */
  restAdvanceFrom?: number
  /** Exercise indexes in the order sets were completed, for undo. */
  setHistory?: number[]
  exercises: ExerciseSession[]
  markedStrength?: boolean
  updatedAt?: string
}

export interface WorkoutStore {
  restSecDefault: number
  restSecUpdatedAt?: string
  templates: WorkoutTemplate[]
  templatesUpdatedAt?: string
  /** Programs. `templates` always mirrors the active plan's days. */
  plans: TrainingPlan[]
  activePlanId?: string
  activePlanUpdatedAt?: string
  sessions: WorkoutSession[]
  activeSessionId?: string
  weightMemory?: WeightMemoryEntry[]
}

export type ChartRange = 7 | 14 | 28 | 90

export type DayKind = 'train' | 'rest'

export const DEFAULT_TRAINING_TARGET_KCAL = 2000
export const DEFAULT_REST_TARGET_KCAL = 1800
export const DEFAULT_SCOOP_KCAL = 130
export const DEFAULT_SCOOP_PROTEIN_G = 24
export const DEFAULT_SCOOP_CARBS_G = 4

export interface Settings {
  displayName: string
  /** Legacy single target. Fallback for training days when trainingTargetKcal is missing. */
  targetKcal: number
  /** Intake target on 训练日. Defaults to targetKcal. */
  trainingTargetKcal: number
  /** Intake target on 休息日. Defaults to 1800. */
  restTargetKcal: number
  tdee: number
  proteinTarget: number
  burnSource: BurnSource
  /** Carried onto new days; participates in deficit. */
  bmrDefaultKcal: number
  /** Overlap deducted from BMR + band. Default 150. */
  overlapDefaultKcal: number
  /** Last protein scoops, carried onto new days. */
  lastProteinScoops?: number
  /** Protein powder, per scoop. New days copy these; saved days keep their own. */
  scoopKcal: number
  scoopProteinG: number
  scoopCarbsG: number
}

export interface DailyLog {
  date: string
  weightKg?: number
  waistCm?: number
  yesterdaySteps?: number
  strengthTraining?: boolean
  cardioMinutes?: number
  proteinScoops?: number
  breakfastKcal?: number
  breakfastCarbsG?: number
  breakfastProteinG?: number
  lunchKcal?: number
  lunchCarbsG?: number
  lunchProteinG?: number
  dinnerKcal?: number
  dinnerCarbsG?: number
  dinnerProteinG?: number
  extraKcal?: number
  extraCarbsG?: number
  extraProteinG?: number
  extraNote?: string
  /**
   * Per-scoop powder rates captured for this day.
   * Missing macros on a meal count as 0. These rates are not rewritten when settings change.
   */
  powderKcalPerScoop?: number
  powderProteinPerScoop?: number
  powderCarbsPerScoop?: number
  /** That day's BMR. Missing → settings.bmrDefaultKcal. */
  bmrKcal?: number
  /** Overlap deducted that day. Missing → settings.overlapDefaultKcal. */
  overlapKcal?: number
  /** Legacy (v1 extra burn, added not subtracted). Migrated to overlap 150. */
  extraBurnKcal?: number
  bandBurnKcal?: number
  notes?: string
  /**
   * 训练日 or 休息日 for this date.
   * Without dayKindManual, a workout session that day still wins.
   */
  dayKind?: DayKind
  /** True after the user taps 训练日 / 休息日. Keeps the choice when settings change. */
  dayKindManual?: boolean
  /** Intake target captured for this day. Settings edits do not rewrite it. */
  intakeTargetKcal?: number
  updatedAt?: string
}

export interface Tombstones {
  logs: Record<string, string>
  sessions: Record<string, string>
  plans?: Record<string, string>
}

export interface AppData {
  version: typeof DATA_VERSION
  settings: Settings
  settingsUpdatedAt?: string
  logs: DailyLog[]
  workout: WorkoutStore
  tombstones?: Tombstones
}

export const DEFAULT_BMR_KCAL = 1630
export const DEFAULT_OVERLAP_KCAL = 150
/** @deprecated use DEFAULT_OVERLAP_KCAL */
export const DEFAULT_EXTRA_BURN_KCAL = DEFAULT_OVERLAP_KCAL

export const DEFAULT_SETTINGS: Settings = {
  displayName: '',
  targetKcal: DEFAULT_TRAINING_TARGET_KCAL,
  trainingTargetKcal: DEFAULT_TRAINING_TARGET_KCAL,
  restTargetKcal: DEFAULT_REST_TARGET_KCAL,
  tdee: 2300,
  proteinTarget: 130,
  burnSource: 'band',
  bmrDefaultKcal: DEFAULT_BMR_KCAL,
  overlapDefaultKcal: DEFAULT_OVERLAP_KCAL,
  scoopKcal: DEFAULT_SCOOP_KCAL,
  scoopProteinG: DEFAULT_SCOOP_PROTEIN_G,
  scoopCarbsG: DEFAULT_SCOOP_CARBS_G,
}

export function emptyData(): AppData {
  return {
    version: DATA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    logs: [],
    settingsUpdatedAt: undefined,
    workout: {
      restSecDefault: 90,
      templates: [],
      plans: [],
      sessions: [],
    },
    tombstones: { logs: {}, sessions: {} },
  }
}
