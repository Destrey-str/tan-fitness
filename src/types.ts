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
}

export interface WorkoutTemplate {
  id: TemplateId
  name: string
  subtitle: string
  tip?: string
  exercises: ExerciseTemplate[]
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
  setsDone: number
  /** Optional free-text for the whole exercise (e.g. 握距、感觉). */
  weightNote?: string
  /** One entry per completed set; index 0 is set 1. */
  setLogs?: SetLog[]
  /** Draft weight for the current / next set. */
  nextWeightKg?: number
  /** Shown during the session, e.g. 上次 60kg. */
  lastWeightHint?: string
  isWarmup?: boolean
}

export interface WorkoutSession {
  id: string
  date: string
  templateId: TemplateId
  templateName: string
  restSec: number
  startedAt: string
  completedAt?: string
  currentExerciseIndex: number
  restEndsAt?: number
  restLockUntil?: number
  exercises: ExerciseSession[]
  markedStrength?: boolean
  updatedAt?: string
}

export interface WorkoutStore {
  restSecDefault: number
  restSecUpdatedAt?: string
  templates: WorkoutTemplate[]
  templatesUpdatedAt?: string
  sessions: WorkoutSession[]
  activeSessionId?: string
}

export type ChartRange = 7 | 14 | 28 | 90

export interface Settings {
  displayName: string
  targetKcal: number
  tdee: number
  proteinTarget: number
  burnSource: BurnSource
  /** Carried onto new days; participates in deficit. */
  bmrDefaultKcal: number
  /** Overlap deducted from BMR + band. Default 150. */
  overlapDefaultKcal: number
  /** Last protein scoops, carried onto new days. */
  lastProteinScoops?: number
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
  lunchKcal?: number
  dinnerKcal?: number
  extraKcal?: number
  extraNote?: string
  /** That day's BMR. Missing → settings.bmrDefaultKcal. */
  bmrKcal?: number
  /** Overlap deducted that day. Missing → settings.overlapDefaultKcal. */
  overlapKcal?: number
  /** Legacy (v1 extra burn, added not subtracted). Migrated to overlap 150. */
  extraBurnKcal?: number
  bandBurnKcal?: number
  notes?: string
  updatedAt?: string
}

export interface Tombstones {
  logs: Record<string, string>
  sessions: Record<string, string>
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
  targetKcal: 2000,
  tdee: 2300,
  proteinTarget: 130,
  burnSource: 'band',
  bmrDefaultKcal: DEFAULT_BMR_KCAL,
  overlapDefaultKcal: DEFAULT_OVERLAP_KCAL,
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
      sessions: [],
    },
    tombstones: { logs: {}, sessions: {} },
  }
}
