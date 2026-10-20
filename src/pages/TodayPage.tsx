import { DateSwitcher } from '@/components/DateSwitcher'
import { DayForm } from '@/components/DayForm'
import { SummaryCards } from '@/components/SummaryCards'
import { Button } from '@/components/ui/button'
import { useAppData, useLog } from '@/hooks/useAppData'
import { deleteLog, setDayKind } from '@/lib/storage'
import { logHasData, resolveDayKind } from '@/lib/stats'
import type { DayKind } from '@/types'

export function TodayPage({
  date,
  onDateChange,
}: {
  date: string
  onDateChange: (next: string) => void
}) {
  const { settings, workout } = useAppData()
  const log = useLog(date)
  const name = String(settings?.displayName ?? '').trim()
  const sessions = workout?.sessions ?? []
  const kind = resolveDayKind(log, sessions, date)

  return (
    <div className="flex flex-col gap-3 pb-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-[var(--muted)]">减脂笔记</p>
          <h1 className="text-xl font-semibold">
            {name ? `${name}，记录这一天` : '记录这一天'}
          </h1>
        </div>
      </header>

      <DateSwitcher date={date} onChange={onDateChange} />
      <div className="flex gap-2" role="group" aria-label="训练日或休息日">
        {(
          [
            ['train', '训练日'],
            ['rest', '休息日'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="chip"
            variant={kind === value ? 'default' : 'secondary'}
            aria-pressed={kind === value}
            data-testid={`day-kind-${value}`}
            onClick={() => setDayKind(date, value as DayKind)}
          >
            {label}
          </Button>
        ))}
      </div>
      <SummaryCards log={log} settings={settings} date={date} sessions={sessions} />
      <DayForm date={date} log={log} />

      {log && logHasData(log) ? (
        <Button
          type="button"
          variant="outline"
          className="text-surplus"
          onClick={() => {
            if (window.confirm('删除这一天的全部记录？')) deleteLog(date)
          }}
        >
          删除这一天
        </Button>
      ) : (
        <p className="text-center text-xs text-[var(--muted)]">改动会自动保存在本机</p>
      )}
    </div>
  )
}
