import { DateSwitcher } from '@/components/DateSwitcher'
import { DayForm } from '@/components/DayForm'
import { SummaryCards } from '@/components/SummaryCards'
import { Button } from '@/components/ui/button'
import { useAppData, useLog } from '@/hooks/useAppData'
import { deleteLog } from '@/lib/storage'
import { logHasData } from '@/lib/stats'

export function TodayPage({
  date,
  onDateChange,
}: {
  date: string
  onDateChange: (next: string) => void
}) {
  const { settings } = useAppData()
  const log = useLog(date)
  const name = String(settings?.displayName ?? '').trim()

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
      <SummaryCards log={log} settings={settings} />
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
