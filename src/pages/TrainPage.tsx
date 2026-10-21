import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Dumbbell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NumberField } from '@/components/NumberField'
import { Badge } from '@/components/ui/badge'
import { useAppData } from '@/hooks/useAppData'
import { parseIso } from '@/lib/dates'
import {
  addWorkoutRest,
  abandonWorkoutSession,
  completeWorkoutSet,
  endWorkoutRest,
  extendWorkoutRest,
  finishWorkoutSession,
  resetWorkoutTemplates,
  selectWorkoutExercise,
  setExerciseNextWeight,
  setExerciseSeedWeights,
  setExerciseWeightNote,
  setRestDefault,
  setSessionRestSec,
  startWorkoutSession,
  undoLastWorkoutSet,
} from '@/lib/storage'
import { restFinishedCue, unlockAudio } from '@/lib/cue'
import {
  clampRest,
  formatKgCompact,
  formatRest,
  formatSetWeights,
  indexLastPerformances,
  lookupLastPerformance,
  lookupWeightMemory,
  repsLabel,
  resolvePlannedWeights,
  restClockChanged,
  sessionCompletedSets,
  sessionProgress,
  activePlanOf,
  sessionRestLength,
  templateHasWarmup,
  weekdayPlan,
} from '@/lib/workout'
import type { ExerciseSession, ExerciseTemplate, WorkoutSession } from '@/types'
import { cn } from '@/lib/utils'

function listSectionLabel(
  exercises: { isWarmup?: boolean }[],
  index: number,
): 'warmup' | 'lifts' | null {
  const ex = exercises[index]
  if (!ex) return null
  if (ex.isWarmup && (index === 0 || !exercises[index - 1]?.isWarmup)) return 'warmup'
  if (!ex.isWarmup && (index === 0 || exercises[index - 1]?.isWarmup)) return 'lifts'
  return null
}

function isSessionDone(session: WorkoutSession): boolean {
  const exercises = session.exercises ?? []
  if (exercises.length === 0) return false
  return exercises.every((e) => (e?.setsDone ?? 0) >= (e?.targetSets ?? 1))
}

export function TrainPage({
  date,
  onOpenPlans,
}: {
  date: string
  onOpenPlans?: () => void
}) {
  const { workout } = useAppData()
  const program = activePlanOf(workout)
  const templates = program?.days ?? workout?.templates ?? []
  const plan = weekdayPlan(parseIso(date))
  const [picked, setPicked] = useState(plan.templateId ?? templates[0]?.id ?? 'push')
  const [markStrength, setMarkStrength] = useState(true)

  const sessions = workout?.sessions ?? []

  const active = useMemo(
    () =>
      sessions.find(
        (s) => s.id === workout?.activeSessionId && !s.completedAt,
      ),
    [workout?.activeSessionId, sessions],
  )

  const history = useMemo(
    () =>
      [...sessions]
        .filter((s) => s.completedAt)
        .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
        .slice(0, 8),
    [sessions],
  )

  const performances = useMemo(
    () => indexLastPerformances(sessions, workout?.activeSessionId),
    [sessions, workout?.activeSessionId],
  )

  const dayKey = templates.map((day) => day.id).join('|')
  useEffect(() => {
    setPicked((prev) => {
      const ids = dayKey ? dayKey.split('|') : []
      if (plan.templateId && ids.includes(plan.templateId)) return plan.templateId
      if (ids.includes(prev)) return prev
      return ids[0] ?? 'push'
    })
  }, [date, dayKey, plan.templateId])

  if (active) {
    return (
      <SessionView
        session={active}
        markStrength={markStrength}
        onMarkStrength={setMarkStrength}
      />
    )
  }

  const selected = templates.find((t) => t.id === picked)

  return (
    <div className="flex flex-col gap-3 pb-6">
      <header>
        <p className="text-xs text-[var(--muted)]">
          {program?.name ?? '训练计划'} · 组间计时
        </p>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-semibold">训练</h1>
          {onOpenPlans ? (
            <Button type="button" size="sm" variant="secondary" onClick={onOpenPlans}>
              训练计划
            </Button>
          ) : null}
        </div>
      </header>

      <Card>
        <p className="text-sm">
          今天计划：
          <span className="font-semibold text-navy">{plan.label}</span>
          {plan.templateId == null ? (
            <span className="text-[var(--muted)]">（仍可自选力量模板）</span>
          ) : null}
        </p>
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          周一推 · 周二有氧 · 周三拉 · 周四有氧 · 周五腿
        </p>
      </Card>

      <div className="flex flex-wrap gap-2">
        {templates.map((t) => (
          <Button
            key={t.id}
            type="button"
            className="h-auto min-h-11 whitespace-normal px-3 py-2"
            variant={picked === t.id ? 'default' : 'secondary'}
            onClick={() => setPicked(t.id)}
          >
            {t.name}
          </Button>
        ))}
      </div>

      {selected ? (
        <Card>
          <CardTitle className="mb-1">
            {selected.name}日 · {selected.subtitle}
          </CardTitle>
          {selected.tip ? (
            <p className="mb-3 text-[11px] leading-snug text-[var(--muted)]">{selected.tip}</p>
          ) : (
            <div className="mb-3" />
          )}
          <ol className="flex flex-col gap-2">
            {selected.exercises.map((ex, i) => {
              const past = ex.isWarmup
                ? undefined
                : lookupLastPerformance(performances, ex.id, ex.name)
              const memory = ex.isWarmup
                ? undefined
                : lookupWeightMemory(workout?.weightMemory, ex.id, ex.name)
              const planned = ex.isWarmup
                ? undefined
                : resolvePlannedWeights({ setCount: ex.sets, history: past, memory })
              return (
                <TemplateExerciseRow
                  key={ex.id}
                  ex={ex}
                  index={i}
                  section={listSectionLabel(selected.exercises, i)}
                  lastHint={planned?.hint}
                  weights={planned?.weights ?? []}
                />
              )
            })}
          </ol>
        </Card>
      ) : null}

      <Card>
        <Label htmlFor="rest-default">组间休息（秒）</Label>
        <div className="mt-1.5 flex items-center gap-2">
          <Input
            id="rest-default"
            inputMode="numeric"
            className="max-w-24"
            defaultValue={workout?.restSecDefault ?? 90}
            key={workout?.restSecDefault ?? 90}
            onBlur={(e) => {
              const n = Number.parseInt(e.target.value, 10)
              if (Number.isFinite(n)) setRestDefault(n)
            }}
          />
          <span className="text-xs text-[var(--muted)]">30–180，默认 90</span>
        </div>
      </Card>

      {selected && !templateHasWarmup(selected.exercises) ? (
        <p className="text-center text-[11px] text-[var(--muted)]">
          当前模板没有热身。点下方「恢复谭式默认模板」可把热身插回每个训练日最前面。
        </p>
      ) : null}

      <Button
        type="button"
        size="lg"
        className="h-12"
        onClick={() => startWorkoutSession(date, picked, workout?.restSecDefault)}
      >
        <Dumbbell className="size-4" />
        开始{selected?.name ?? ''}日训练
      </Button>

      {history.length > 0 ? (
        <Card>
          <CardTitle className="mb-2">近期训练</CardTitle>
          <ul className="flex flex-col gap-1.5 text-sm">
            {history.map((s) => {
              const progress = sessionProgress(s)
              const lifts = s.exercises.filter((e) => !e.isWarmup)
              return (
                <li key={s.id} className="border-b border-[var(--line)] pb-2 last:border-b-0 last:pb-0">
                  <div className="flex justify-between gap-2 text-[var(--muted)]">
                    <span>
                      {s.date.slice(5)} · {s.templateName}日
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {progress.liftDone}/{progress.liftTotal} 组
                      {progress.warmupTotal > 0
                        ? ` · 热身 ${progress.warmupDone}/${progress.warmupTotal}`
                        : ''}
                    </span>
                  </div>
                  {lifts.length > 0 ? (
                    <ul className="mt-1 flex flex-col gap-0.5 text-[11px] text-[var(--muted)]">
                      {lifts.map((ex) => {
                        const weights = formatSetWeights(ex)
                        return (
                          <li key={ex.exerciseId} className="flex justify-between gap-2">
                            <span className="min-w-0 truncate">{ex.name}</span>
                            <span className="shrink-0 tabular-nums">
                              {weights ?? `${ex.setsDone}/${ex.targetSets}`}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </Card>
      ) : null}

      <button
        type="button"
        className="text-center text-[11px] text-[var(--muted)] underline-offset-2 hover:underline"
        onClick={() => {
          if (window.confirm('恢复「谭式推拉腿」的默认动作？其他计划、饮食和训练记录都会保留。')) {
            resetWorkoutTemplates()
          }
        }}
      >
        恢复谭式默认模板
      </button>
    </div>
  )
}

function TemplateExerciseRow({
  ex,
  index,
  section,
  lastHint,
  weights,
}: {
  ex: ExerciseTemplate
  index: number
  section: 'warmup' | 'lifts' | null
  lastHint?: string
  weights: (number | undefined)[]
}) {
  return (
    <li>
      {section === 'warmup' ? (
        <p className="mb-1.5 text-[11px] font-medium text-navy">热身（勾选即可，无组间休息）</p>
      ) : null}
      {section === 'lifts' ? (
        <p className="mb-1.5 mt-1 text-[11px] font-medium text-navy">正式动作</p>
      ) : null}
      <div className="flex items-start justify-between gap-2 text-sm">
        <span>
          <span className="mr-1 text-[var(--muted)]">{index + 1}.</span>
          {ex.name}
          {ex.isWarmup ? (
            <Badge tone="info" className="ml-1 align-middle">
              热身
            </Badge>
          ) : null}
          {ex.note ? (
            <span className="mt-0.5 block text-[11px] text-[var(--muted)]">{ex.note}</span>
          ) : null}
          {lastHint ? (
            <span className="mt-0.5 block text-[13px] font-medium text-navy">{lastHint}</span>
          ) : null}
        </span>
        <span className="shrink-0 tabular-nums text-[var(--muted)]">
          {ex.isWarmup
            ? '勾选'
            : `${ex.sets}×${repsLabel(ex.repsMin, ex.repsMax)}${ex.restSec ? ` · ${ex.restSec}s` : ''}`}
        </span>
      </div>
      {!ex.isWarmup ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {Array.from({ length: ex.sets }, (_, setIndex) => (
            <SeedWeightInput
              key={setIndex}
              caption={String(setIndex + 1)}
              label={`${ex.name} 第${setIndex + 1}组`}
              value={weights[setIndex]}
              onCommit={(next) => {
                const filled = Array.from({ length: ex.sets }, (_, i) => weights[i])
                filled[setIndex] = next
                setExerciseSeedWeights(ex.id, ex.name, filled)
              }}
            />
          ))}
        </div>
      ) : null}
    </li>
  )
}

function SeedWeightInput({
  caption,
  label,
  value,
  onCommit,
}: {
  caption: string
  label: string
  value: number | undefined
  onCommit: (next: number | undefined) => void
}) {
  const focused = useRef(false)
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => {
    if (!focused.current) setText(value == null ? '' : String(value))
  }, [value])
  return (
    <label className="flex items-center gap-0.5 text-[11px] text-[var(--muted)]">
      <span className="w-3 text-center tabular-nums">{caption}</span>
      <input
        aria-label={label}
        inputMode="decimal"
        enterKeyHint="done"
        className="h-8 w-14 rounded-lg border border-[var(--line)] bg-[var(--card)] px-1 text-center text-sm tabular-nums text-[var(--fg)]"
        value={text}
        placeholder="kg"
        onFocus={() => {
          focused.current = true
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          focused.current = false
          const raw = text.trim().replace(/，/g, '.')
          const parsed = raw === '' ? undefined : Number(raw)
          const next = parsed != null && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
          setText(next == null ? '' : String(next))
          if (next !== value) onCommit(next)
        }}
      />
    </label>
  )
}

function restNextHint(session: WorkoutSession): string {
  const ex = session.exercises[session.currentExerciseIndex]
  if (!ex) return ''
  if (ex.setsDone >= ex.targetSets) {
    const nxt = session.exercises[session.currentExerciseIndex + 1]
    return nxt ? `下一动作：${nxt.name}` : '训练即将完成'
  }
  return `下一组：${ex.name} 第 ${ex.setsDone + 1}/${ex.targetSets} 组${
    typeof ex.nextWeightKg === 'number' ? ` · ${formatKgCompact(ex.nextWeightKg)}kg` : ''
  }`
}

function RestOverlay({ session }: { session: WorkoutSession }) {
  const [now, setNow] = useState(() => Date.now())
  const alerted = useRef(false)
  const endsAt = session.restEndsAt ?? 0
  const remainingMs = endsAt - now
  const finished = remainingMs <= 0
  const skipLocked = Boolean(session.restLockUntil && now < session.restLockUntil)
  const canUndo = sessionCompletedSets(session) > 0

  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const scrollY = window.scrollY
    const prevHtmlOverflow = html.style.overflow
    const prev = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    }
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    const active = document.activeElement
    if (active instanceof HTMLElement) active.blur()
    return () => {
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prev.overflow
      body.style.position = prev.position
      body.style.top = prev.top
      body.style.left = prev.left
      body.style.right = prev.right
      body.style.width = prev.width
      window.scrollTo(0, scrollY)
    }
  }, [])

  useEffect(() => {
    const ends = session.restEndsAt ?? 0
    const lock = session.restLockUntil
    let prev = Date.now()
    const id = window.setInterval(() => {
      const next = Date.now()
      if (!restClockChanged(prev, next, ends, lock)) return
      prev = next
      setNow(next)
    }, 200)
    return () => window.clearInterval(id)
  }, [session.restEndsAt, session.restLockUntil])

  useEffect(() => {
    if (!session.restEndsAt) {
      alerted.current = false
      return
    }
    if (finished && !alerted.current) {
      alerted.current = true
      restFinishedCue()
    }
  }, [finished, session.restEndsAt])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="rest-screen bg-navy text-white"
      data-testid="rest-overlay"
      role="timer"
      aria-live="off"
    >
      <div
        className="mx-auto flex h-full w-full max-w-[520px] flex-col justify-between px-5"
        style={{
          paddingTop: 'max(1.5rem, env(safe-area-inset-top))',
          paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))',
        }}
      >
      <div>
        <p className="text-sm font-medium text-white/80">
          {finished ? '休息结束' : '组间休息 · 已自动开始'}
        </p>
        <p className="mt-2 text-base text-white/85">{restNextHint(session)}</p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          disabled={!canUndo}
          onClick={() => undoLastWorkoutSet(session.id)}
        >
          撤销上一组
        </Button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center py-6">
        <p
          className="font-semibold tabular-nums tracking-wide"
          data-testid="rest-clock"
          style={{ fontSize: finished ? '3.2rem' : '5.2rem', lineHeight: 1 }}
        >
          {finished ? '00:00' : formatRest(remainingMs / 1000)}
        </p>
        <p className="mt-3 text-sm text-white/75">
          {finished ? '可以开始下一组了' : `休息 ${sessionRestLength(session)} 秒`}
        </p>
      </div>

      <div className="flex flex-col gap-2 pb-2">
        {finished ? (
          <Button
            type="button"
            size="lg"
            className="h-14 w-full bg-white text-base text-navy hover:bg-white/90"
            disabled={skipLocked}
            onClick={() => endWorkoutRest(session.id)}
          >
            开始下一组
          </Button>
        ) : (
          <Button
            type="button"
            size="lg"
            className="h-12 w-full bg-white text-navy hover:bg-white/90"
            disabled={skipLocked}
            onClick={() => endWorkoutRest(session.id)}
          >
            跳过休息
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => addWorkoutRest(session.id, 15)}
          >
            +15 秒
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => extendWorkoutRest(session.id)}
          >
            再休 {sessionRestLength(session)} 秒
          </Button>
        </div>
      </div>
      </div>
    </div>,
    document.body,
  )
}

function SessionView({
  session,
  markStrength,
  onMarkStrength,
}: {
  session: WorkoutSession
  markStrength: boolean
  onMarkStrength: (v: boolean) => void
}) {
  const resting = session.restEndsAt != null
  const done = isSessionDone(session)
  const current = session.exercises[session.currentExerciseIndex]
  const progress = sessionProgress(session)
  const [restText, setRestText] = useState(String(session.restSec))
  const completeBusy = useRef(false)
  const canUndo = sessionCompletedSets(session) > 0

  useEffect(() => {
    setRestText(String(session.restSec))
  }, [session.restSec])

  useEffect(() => {
    if (!resting) completeBusy.current = false
  }, [resting])

  return (
    <div className="flex flex-col gap-3 pb-6">
      <div
        className={cn('flex flex-col gap-3', resting && 'invisible')}
        inert={resting ? true : undefined}
      >
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-[var(--muted)]">
            {session.templateName}日
            {progress.warmupTotal > 0
              ? ` · 热身 ${progress.warmupDone}/${progress.warmupTotal}`
              : ''}
            {' · '}
            {progress.liftDone}/{progress.liftTotal} 组
          </p>
          <h1 className="text-xl font-semibold">训练中</h1>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-surplus"
          onClick={() => {
            if (window.confirm('放弃本次训练？进度不会记入历史。')) {
              abandonWorkoutSession(session.id)
            }
          }}
        >
          放弃
        </Button>
      </header>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={!canUndo}
        onClick={() => undoLastWorkoutSet(session.id)}
      >
        撤销上一组
      </Button>

      {done ? (
        <Card className="border-deficit/40">
          <p className="text-lg font-semibold text-deficit">全部组数已完成</p>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={markStrength}
              onChange={(e) => onMarkStrength(e.target.checked)}
              className="size-4 accent-[#1b4f72]"
            />
            记入今日日志：力量训练 √
          </label>
          <Button
            type="button"
            className="mt-4 w-full"
            onClick={() => finishWorkoutSession(session.id, markStrength)}
          >
            完成训练
          </Button>
          <Button
            type="button"
            variant="outline"
            className="mt-2 w-full"
            disabled={!canUndo}
            onClick={() => undoLastWorkoutSet(session.id)}
          >
            撤销上一组
          </Button>
        </Card>
      ) : current ? (
        <Card>
          <p className="text-xs text-[var(--muted)]">
            {current.isWarmup ? '热身' : '正式动作'} {session.currentExerciseIndex + 1}/
            {session.exercises.length}
          </p>
          <h2 className="mt-0.5 text-lg font-semibold" data-testid="current-exercise">
            {current.name}
            {current.isWarmup ? (
              <Badge tone="info" className="ml-2 align-middle">
                热身
              </Badge>
            ) : null}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            {current.isWarmup
              ? '做完勾选即可，不进入组间休息'
              : `目标 ${current.targetSets}×${repsLabel(current.repsMin, current.repsMax)}`}
            {current.note ? ` · ${current.note}` : ''}
          </p>
          {current.isWarmup ? (
            <p className="mt-3 text-sm tabular-nums text-[var(--muted)]">
              {current.setsDone >= current.targetSets ? '已勾选' : '待勾选'}
            </p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                {Array.from({ length: Math.min(30, Math.max(1, current.targetSets || 1)) }, (_, i) => {
                  const logged = current.setLogs?.[i]?.weightKg
                  const isCurrent = i === current.setsDone
                  const doneSet = i < current.setsDone
                  return (
                    <span key={i} className="flex min-w-10 flex-col items-center gap-0.5">
                      <span
                        className={cn(
                          'inline-flex size-8 items-center justify-center rounded-full text-xs font-semibold',
                          doneSet
                            ? 'bg-navy text-white'
                            : isCurrent
                              ? 'border-2 border-navy text-navy'
                              : 'border border-[var(--line)] text-[var(--muted)]',
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="h-4 text-[10px] tabular-nums text-[var(--muted)]">
                        {doneSet && logged != null
                          ? formatKgCompact(logged)
                          : isCurrent && current.nextWeightKg != null
                            ? formatKgCompact(current.nextWeightKg)
                            : ''}
                      </span>
                    </span>
                  )
                })}
              </div>
              <p className="mt-1 text-sm tabular-nums">
                已完成 {current.setsDone}/{current.targetSets} 组
              </p>
              {current.lastWeightHint ? (
                <p className="mt-1 text-sm font-medium text-navy">{current.lastWeightHint}</p>
              ) : null}
              {current.setsDone < current.targetSets ? (
                <NumberField
                  key={`${current.exerciseId}-${current.setsDone}`}
                  className="mt-3"
                  label={`第 ${current.setsDone + 1} 组重量`}
                  unit="kg"
                  hint="可每组不同，如 60 再改成 62.5；留空也可完成本组"
                  value={current.nextWeightKg}
                  onChange={(n) => setExerciseNextWeight(session.id, current.exerciseId, n)}
                  min={0}
                />
              ) : null}
              <div className="mt-3 flex flex-col gap-1.5">
                <Label htmlFor="weight-note">备注（可选）</Label>
                <Input
                  id="weight-note"
                  placeholder="握距、力竭等"
                  value={current.weightNote ?? ''}
                  onChange={(e) =>
                    setExerciseWeightNote(session.id, current.exerciseId, e.target.value)
                  }
                />
              </div>
            </>
          )}
        </Card>
      ) : null}

      {!resting && !done ? (
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="lg"
            className="h-14 text-base"
            onClick={() => {
              if (completeBusy.current || session.restEndsAt) return
              completeBusy.current = true
              if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
              unlockAudio()
              completeWorkoutSet(session.id)
              window.setTimeout(() => {
                completeBusy.current = false
              }, 500)
            }}
          >
            {current?.isWarmup ? '完成此项热身' : '完成本组，开始休息'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!canUndo}
            onClick={() => undoLastWorkoutSet(session.id)}
          >
            撤销上一组
          </Button>
        </div>
      ) : null}

      <Card>
        <CardTitle className="mb-2">动作列表</CardTitle>
        <ul className="flex flex-col gap-1">
          {session.exercises.map((ex, i) => (
            <SessionExerciseRow
              key={ex.exerciseId}
              ex={ex}
              currentRow={i === session.currentExerciseIndex && !done}
              section={listSectionLabel(session.exercises, i)}
              onSelect={() => selectWorkoutExercise(session.id, i)}
            />
          ))}
        </ul>
        <div className="mt-3 flex items-center gap-2">
          <Label htmlFor="session-rest">休息秒数</Label>
          <Input
            id="session-rest"
            inputMode="numeric"
            className="h-9 max-w-20"
            value={restText}
            onChange={(e) => setRestText(e.target.value)}
            onBlur={() => {
              const n = Number.parseInt(restText, 10)
              if (Number.isFinite(n)) setSessionRestSec(session.id, clampRest(n))
              else setRestText(String(session.restSec))
            }}
          />
        </div>
      </Card>
      </div>
      {resting ? <RestOverlay session={session} /> : null}
    </div>
  )
}

function SessionExerciseRow({
  ex,
  currentRow,
  section,
  onSelect,
}: {
  ex: ExerciseSession
  currentRow: boolean
  section: 'warmup' | 'lifts' | null
  onSelect: () => void
}) {
  const checked = ex.setsDone >= ex.targetSets
  const point = useRef<{ x: number; y: number } | null>(null)
  return (
    <li>
      {section === 'warmup' ? (
        <p className="mb-0.5 px-2 text-[11px] font-medium text-navy">热身</p>
      ) : null}
      {section === 'lifts' ? (
        <p className="mb-0.5 mt-1 px-2 text-[11px] font-medium text-navy">正式动作</p>
      ) : null}
      <button
        type="button"
        className={cn(
          'flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-sm',
          currentRow ? 'bg-navy/10' : '',
        )}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          point.current = { x: e.clientX, y: e.clientY }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerUp={(e) => {
          const start = point.current
          point.current = null
          if (!start) return
          if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) return
          onSelect()
        }}
        onClick={(e) => {
          if (e.detail === 0) onSelect()
        }}
      >
        <span className={cn(checked && 'text-[var(--muted)]')}>
          {checked ? '✓ ' : ''}
          {ex.name}
          {ex.isWarmup ? (
            <Badge tone="info" className="ml-1 align-middle">
              热身
            </Badge>
          ) : null}
        </span>
        <span className="max-w-[55%] shrink-0 text-right tabular-nums text-[var(--muted)]">
          {ex.isWarmup
            ? checked
              ? '已勾选'
              : '待勾选'
            : `${ex.setsDone}/${ex.targetSets}${
                formatSetWeights(ex) ? ` · ${formatSetWeights(ex)}` : ''
              }`}
        </span>
      </button>
    </li>
  )
}
