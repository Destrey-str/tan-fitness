import { CalendarDays, Dumbbell, LineChart, Settings, Table2 } from 'lucide-react'
import type { TabId } from '@/types'
import { cn } from '@/lib/utils'

const ITEMS: { id: TabId; label: string; icon: typeof CalendarDays }[] = [
  { id: 'today', label: '今日', icon: CalendarDays },
  { id: 'log', label: '日志', icon: Table2 },
  { id: 'train', label: '训练', icon: Dumbbell },
  { id: 'charts', label: '趋势', icon: LineChart },
  { id: 'settings', label: '设置', icon: Settings },
]

export function BottomNav({
  tab,
  onChange,
}: {
  tab: TabId
  onChange: (tab: TabId) => void
}) {
  return (
    <nav
      className="fixed bottom-0 left-1/2 z-30 w-full max-w-[520px] -translate-x-1/2 border-t border-[var(--line)] bg-[var(--card)]/95 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-5">
        {ITEMS.map((item) => {
          const Icon = item.icon
          const active = tab === item.id
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onChange(item.id)}
                className={cn(
                  'flex w-full flex-col items-center gap-0.5 py-2 text-[11px]',
                  active ? 'text-navy font-semibold' : 'text-[var(--muted)]',
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.4 : 1.8} />
                {item.label}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
