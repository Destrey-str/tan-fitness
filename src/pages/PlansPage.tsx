import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { NumberField } from '@/components/NumberField'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppData } from '@/hooks/useAppData'
import {
  addPlanDay,
  addPlanExercise,
  createPlan,
  deletePlan,
  movePlanDay,
  movePlanExercise,
  removePlanDay,
  removePlanExercise,
  renamePlan,
  setActivePlan,
  updatePlanDay,
  updatePlanExercise,
} from '@/lib/storage'
import type { ExerciseTemplate, TrainingPlan } from '@/types'

type View =
  | { kind: 'list' }
  | { kind: 'plan'; planId: string }
  | { kind: 'day'; planId: string; dayId: string }

export function PlansPage({ onClose }: { onClose: () => void }) {
  const { workout } = useAppData()
  const plans = workout?.plans ?? []
  const [view, setView] = useState<View>({ kind: 'list' })
  const [draftName, setDraftName] = useState('')
  const [copyFrom, setCopyFrom] = useState('')

  const plan = view.kind === 'list' ? undefined : plans.find((item) => item.id === view.planId)
  const day =
    view.kind === 'day' ? plan?.days.find((item) => item.id === view.dayId) : undefined

  return (
    <div className="flex flex-col gap-3 pb-6">
      <header className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-[var(--muted)]">训练计划</p>
          <h1 className="text-xl font-semibold">
            {view.kind === 'list' ? '全部计划' : view.kind === 'plan' ? plan?.name || '计划' : day?.name || '训练日'}
          </h1>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            if (view.kind === 'day') setView({ kind: 'plan', planId: view.planId })
            else if (view.kind === 'plan') setView({ kind: 'list' })
            else onClose()
          }}
        >
          返回
        </Button>
      </header>

      {view.kind === 'list' ? (
        <PlanList
          plans={plans}
          activePlanId={workout?.activePlanId}
          draftName={draftName}
          copyFrom={copyFrom}
          onDraftName={setDraftName}
          onCopyFrom={setCopyFrom}
          onCreated={(id) => {
            setDraftName('')
            setCopyFrom('')
            setView({ kind: 'plan', planId: id })
          }}
          onEdit={(planId) => setView({ kind: 'plan', planId })}
        />
      ) : null}

      {view.kind === 'plan' && plan ? (
        <PlanEditor plan={plan} onOpenDay={(dayId) => setView({ kind: 'day', planId: plan.id, dayId })} />
      ) : null}

      {view.kind === 'day' && plan && day ? <DayEditor planId={plan.id} day={day} /> : null}

      {view.kind !== 'list' && !plan ? (
        <p className="text-sm text-[var(--muted)]">这个计划已经不在了。</p>
      ) : null}
    </div>
  )
}

function PlanList({
  plans,
  activePlanId,
  draftName,
  copyFrom,
  onDraftName,
  onCopyFrom,
  onCreated,
  onEdit,
}: {
  plans: TrainingPlan[]
  activePlanId?: string
  draftName: string
  copyFrom: string
  onDraftName: (value: string) => void
  onCopyFrom: (value: string) => void
  onCreated: (id: string) => void
  onEdit: (id: string) => void
}) {
  return (
    <>
      <ul className="flex flex-col gap-2">
        {plans.map((plan) => {
          const active = plan.id === activePlanId
          return (
            <li key={plan.id}>
              <Card className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{plan.name}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {plan.days.length} 个训练日
                      {active ? ' · 使用中' : ''}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant={active ? 'secondary' : 'default'} onClick={() => setActivePlan(plan.id)}>
                    {active ? '当前计划' : '设为当前'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => onEdit(plan.id)}>
                    编辑
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onCreated(createPlan(`${plan.name} 副本`, plan.id))}
                  >
                    复制
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={plans.length <= 1}
                    onClick={() => {
                      if (plans.length <= 1) return
                      if (window.confirm(`删除计划「${plan.name}」？已完成的训练记录会保留。`)) {
                        deletePlan(plan.id)
                      }
                    }}
                  >
                    删除
                  </Button>
                </div>
              </Card>
            </li>
          )
        })}
      </ul>

      <Card>
        <CardTitle className="mb-3">新建计划</CardTitle>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-plan-name">名称</Label>
            <Input
              id="new-plan-name"
              value={draftName}
              placeholder="例如 出差徒手"
              onChange={(e) => onDraftName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-plan-copy">从现有计划复制</Label>
            <select
              id="new-plan-copy"
              className="h-11 rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 text-base"
              value={copyFrom}
              onChange={(e) => onCopyFrom(e.target.value)}
            >
              <option value="">空白计划</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            type="button"
            data-testid="create-plan"
            onClick={() => onCreated(createPlan(draftName, copyFrom || undefined))}
          >
            新建
          </Button>
        </div>
      </Card>
    </>
  )
}

function PlanEditor({ plan, onOpenDay }: { plan: TrainingPlan; onOpenDay: (dayId: string) => void }) {
  return (
    <>
      <Card>
        <Label htmlFor="plan-name">计划名称</Label>
        <Input
          id="plan-name"
          className="mt-1.5"
          value={plan.name}
          onChange={(e) => renamePlan(plan.id, e.target.value)}
        />
      </Card>
      <ul className="flex flex-col gap-2">
        {plan.days.map((day, index) => (
          <li key={day.id}>
            <Card className="flex flex-col gap-2">
              <button type="button" className="text-left" onClick={() => onOpenDay(day.id)}>
                <p className="font-semibold">{day.name || '训练日'}</p>
                <p className="text-xs text-[var(--muted)]">
                  {day.subtitle || '无副标题'} · 热身 {day.exercises.filter((item) => item.isWarmup).length} · 动作{' '}
                  {day.exercises.filter((item) => !item.isWarmup).length}
                </p>
              </button>
              <div className="grid grid-cols-4 gap-2">
                <IconMove
                  label="上移训练日"
                  disabled={index === 0}
                  onClick={() => movePlanDay(plan.id, day.id, -1)}
                >
                  <ChevronUp />
                </IconMove>
                <IconMove
                  label="下移训练日"
                  disabled={index === plan.days.length - 1}
                  onClick={() => movePlanDay(plan.id, day.id, 1)}
                >
                  <ChevronDown />
                </IconMove>
                <Button type="button" variant="secondary" onClick={() => onOpenDay(day.id)}>
                  编辑
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    if (window.confirm(`删除训练日「${day.name}」？`)) removePlanDay(plan.id, day.id)
                  }}
                >
                  删除
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {plan.days.length === 0 ? (
        <p className="text-center text-sm text-[var(--muted)]">还没有训练日。</p>
      ) : null}
      <Button type="button" data-testid="add-day" onClick={() => addPlanDay(plan.id, '训练日')}>
        添加训练日
      </Button>
    </>
  )
}

function DayEditor({ planId, day }: { planId: string; day: TrainingPlan['days'][number] }) {
  const warmups = day.exercises.filter((item) => item.isWarmup)
  const lifts = day.exercises.filter((item) => !item.isWarmup)
  return (
    <>
      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="day-name">训练日名称</Label>
          <Input
            id="day-name"
            value={day.name}
            onChange={(e) => updatePlanDay(planId, day.id, { name: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="day-sub">副标题</Label>
          <Input
            id="day-sub"
            value={day.subtitle}
            onChange={(e) => updatePlanDay(planId, day.id, { subtitle: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="day-tip">提示</Label>
          <Input
            id="day-tip"
            value={day.tip ?? ''}
            onChange={(e) => updatePlanDay(planId, day.id, { tip: e.target.value || undefined })}
          />
        </div>
      </Card>

      <ExerciseGroup
        title="热身"
        planId={planId}
        dayId={day.id}
        exercises={warmups}
        isWarmup
      />
      <ExerciseGroup title="正式动作" planId={planId} dayId={day.id} exercises={lifts} isWarmup={false} />
    </>
  )
}

function ExerciseGroup({
  title,
  planId,
  dayId,
  exercises,
  isWarmup,
}: {
  title: string
  planId: string
  dayId: string
  exercises: ExerciseTemplate[]
  isWarmup: boolean
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {exercises.length === 0 ? <p className="text-xs text-[var(--muted)]">还没有{title}。</p> : null}
      <ul className="flex flex-col gap-2">
        {exercises.map((exercise, index) => (
          <li key={exercise.id}>
            <ExerciseCard
              planId={planId}
              dayId={dayId}
              exercise={exercise}
              index={index}
              total={exercises.length}
            />
          </li>
        ))}
      </ul>
      <Button type="button" variant="secondary" onClick={() => addPlanExercise(planId, dayId, isWarmup)}>
        添加{title}
      </Button>
    </section>
  )
}

function ExerciseCard({
  planId,
  dayId,
  exercise,
  index,
  total,
}: {
  planId: string
  dayId: string
  exercise: ExerciseTemplate
  index: number
  total: number
}) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="flex flex-col gap-2">
      <button type="button" className="text-left" onClick={() => setOpen((value) => !value)}>
        <p className="font-medium">{exercise.name}</p>
        <p className="text-xs text-[var(--muted)]">
          {exercise.sets} 组 × {exercise.repsMin}
          {exercise.repsMax ? `–${exercise.repsMax}` : ''} 次
          {exercise.restSec ? ` · 休息 ${exercise.restSec} 秒` : ''}
          {exercise.note ? ` · ${exercise.note}` : ''}
        </p>
      </button>
      <div className="grid grid-cols-3 gap-2">
        <IconMove
          label="上移"
          disabled={index === 0}
          onClick={() => movePlanExercise(planId, dayId, exercise.id, -1)}
        >
          <ChevronUp />
        </IconMove>
        <IconMove
          label="下移"
          disabled={index === total - 1}
          onClick={() => movePlanExercise(planId, dayId, exercise.id, 1)}
        >
          <ChevronDown />
        </IconMove>
        <Button
          type="button"
          variant="danger"
          onClick={() => {
            if (window.confirm(`删除「${exercise.name}」？`)) {
              removePlanExercise(planId, dayId, exercise.id)
            }
          }}
        >
          删除
        </Button>
      </div>
      {open ? (
        <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${exercise.id}-name`}>名称</Label>
            <Input
              id={`${exercise.id}-name`}
              value={exercise.name}
              onChange={(e) => updatePlanExercise(planId, dayId, exercise.id, { name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="组数"
              integer
              value={exercise.sets}
              onChange={(n) => {
                if (n != null && n > 0) updatePlanExercise(planId, dayId, exercise.id, { sets: Math.round(n) })
              }}
            />
            <NumberField
              label="次数"
              integer
              value={exercise.repsMin}
              onChange={(n) => {
                if (n != null && n > 0) {
                  updatePlanExercise(planId, dayId, exercise.id, { repsMin: Math.round(n) })
                }
              }}
            />
          </div>
          <NumberField
            label="次数上限"
            integer
            hint="留空表示固定次数"
            value={exercise.repsMax}
            onChange={(n) =>
              updatePlanExercise(planId, dayId, exercise.id, {
                repsMax: n != null && n > 0 ? Math.round(n) : undefined,
              })
            }
          />
          <NumberField
            label="休息"
            unit="秒"
            integer
            hint="留空则用训练页的默认休息"
            value={exercise.restSec}
            onChange={(n) =>
              updatePlanExercise(planId, dayId, exercise.id, {
                restSec: n != null && n > 0 ? Math.round(n) : undefined,
              })
            }
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${exercise.id}-note`}>备注</Label>
            <Input
              id={`${exercise.id}-note`}
              value={exercise.note ?? ''}
              onChange={(e) =>
                updatePlanExercise(planId, dayId, exercise.id, { note: e.target.value || undefined })
              }
            />
          </div>
        </div>
      ) : null}
    </Card>
  )
}

function IconMove({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button type="button" variant="secondary" aria-label={label} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  )
}
