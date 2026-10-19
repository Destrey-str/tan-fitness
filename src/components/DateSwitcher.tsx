import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { addDays, formatLong, isToday, todayIso } from '@/lib/dates'

export function DateSwitcher({
  date,
  onChange,
}: {
  date: string
  onChange: (next: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="前一天"
          onClick={() => onChange(addDays(date, -1))}
        >
          <ChevronLeft />
        </Button>
        <label className="relative min-w-0 flex-1">
          <div className="flex h-11 items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 text-center text-sm font-medium">
            {formatLong(date)}
          </div>
          <input
            type="date"
            value={date}
            aria-label="选择日期"
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(e) => {
              if (e.target.value) onChange(e.target.value)
            }}
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="后一天"
          onClick={() => onChange(addDays(date, 1))}
        >
          <ChevronRight />
        </Button>
      </div>
      {!isToday(date) ? (
        <Button type="button" variant="outline" size="sm" className="self-end" onClick={() => onChange(todayIso())}>
          回到今天
        </Button>
      ) : null}
    </div>
  )
}
