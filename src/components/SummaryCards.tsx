import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  calorieDeficit,
  dayKindLabel,
  formatInt,
  resolveBurn,
  resolveDayKind,
  resolveIntakeTarget,
  totalIntake,
  vsTarget,
} from '@/lib/stats'
import type { DailyLog, Settings } from '@/types'
import { cn } from '@/lib/utils'

function sourceLabel(burn: ReturnType<typeof resolveBurn>): string {
  if (burn.source === 'tdee') return '固定 TDEE'
  return 'BMR + 手环 − 重叠扣减'
}

export function SummaryCards({
  log,
  settings,
  date,
  sessions,
}: {
  log: DailyLog | undefined
  settings: Settings
  date?: string
  sessions?: { date: string }[]
}) {
  const intake = totalIntake(log)
  const burn = resolveBurn(log, settings)
  const deficit = calorieDeficit(log, settings)
  const kind = resolveDayKind(log, sessions, date ?? log?.date)
  const target = resolveIntakeTarget(log, settings, kind)
  const targetDiff = vsTarget(log, settings, target)
  const intakePct =
    intake == null || target <= 0 ? 0 : Math.min(100, Math.round((intake / target) * 100))

  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Card className="col-span-2 p-3">
        <div className="mb-2 flex items-end justify-between gap-2">
          <div>
            <p className="text-xs text-[var(--muted)]">总摄入 / {dayKindLabel(kind)}目标</p>
            <p className="text-2xl font-semibold tabular-nums">
              {intake == null ? '—' : formatInt(intake)}
              <span className="ml-1 text-sm font-normal text-[var(--muted)]">
                / {formatInt(target)} 大卡
              </span>
            </p>
          </div>
          {targetDiff != null ? (
            <Badge tone={targetDiff <= 0 ? 'good' : 'bad'}>
              {targetDiff <= 0
                ? `低于目标 ${formatInt(Math.abs(targetDiff))}`
                : `超出目标 ${formatInt(targetDiff)}`}
            </Badge>
          ) : null}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--line)]">
          <div
            className={cn(
              'h-full rounded-full',
              intake != null && intake > target ? 'bg-surplus' : 'bg-navy',
            )}
            style={{ width: `${intake == null ? 0 : intakePct}%` }}
          />
        </div>
      </Card>

      <Card className="p-3">
        <p className="text-xs text-[var(--muted)]">消耗</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">
          {formatInt(burn.kcal)}
          <span className="ml-1 text-xs font-normal text-[var(--muted)]">千卡</span>
        </p>
        <p className="mt-1 text-[11px] text-[var(--muted)]">{sourceLabel(burn)}</p>
      </Card>

      <Card className="p-3">
        <p className="text-xs text-[var(--muted)]">热缺</p>
        <p
          className={cn(
            'mt-1 text-xl font-semibold tabular-nums',
            deficit == null
              ? ''
              : deficit >= 0
                ? 'text-deficit'
                : 'text-surplus',
          )}
        >
          {deficit == null ? '—' : formatInt(deficit)}
          {deficit != null ? (
            <span className="ml-1 text-xs font-normal text-[var(--muted)]">千卡</span>
          ) : null}
        </p>
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          {deficit == null
            ? '先填写早/中/晚/额外'
            : deficit >= 0
              ? '热量缺口（减脂）'
              : '热量盈余'}
        </p>
      </Card>
    </div>
  )
}
