import { useMemo, useState } from 'react'
import { DateSwitcher } from '@/components/DateSwitcher'
import { Button } from '@/components/ui/button'
import { useAppData, useLogMap } from '@/hooks/useAppData'
import { formatMd } from '@/lib/dates'
import {
  calorieDeficit,
  dayKindLabel,
  formatInt,
  formatOne,
  resolveBmr,
  resolveDayKind,
  resolveOverlap,
  strengthMark,
  totalCarbsG,
  totalIntake,
  totalProteinG,
} from '@/lib/stats'
import type { DailyLog, TabId } from '@/types'
import { cn } from '@/lib/utils'

const COLUMNS = [
  '日期',
  '日型',
  '空腹体重',
  '肚脐腰围',
  '昨日步数',
  '力量训练',
  '有氧(分钟)',
  '蛋白粉(勺)',
  '早',
  '中',
  '晚',
  '额外',
  '总摄入',
  '碳水(g)',
  '蛋白(g)',
  '基础代谢',
  '手环消耗',
  '重叠扣减',
  '热缺',
] as const

function cell(n: number | undefined, kind: 'int' | 'one' = 'int') {
  if (n == null) return '—'
  return kind === 'one' ? formatOne(n) : formatInt(n)
}

function extraCell(log: DailyLog) {
  if (log.extraKcal == null && !log.extraNote) return '—'
  if (log.extraNote && log.extraKcal != null) {
    return `${log.extraNote}=${formatInt(log.extraKcal)}`
  }
  if (log.extraNote) return log.extraNote
  return formatInt(log.extraKcal!)
}

export function LogPage({
  date,
  onDateChange,
  onOpenDay,
}: {
  date: string
  onDateChange: (next: string) => void
  onOpenDay: (tab: TabId, nextDate: string) => void
}) {
  const { logs, settings, workout } = useAppData()
  const map = useLogMap()
  const sessions = workout?.sessions ?? []
  const [view, setView] = useState<'table' | 'cards'>('table')

  const rows = useMemo(() => {
    return [...logs].sort((a, b) => b.date.localeCompare(a.date))
  }, [logs])

  return (
    <div className="flex flex-col gap-3 pb-6">
      <header>
        <p className="text-xs text-[var(--muted)]">和表格同一套列</p>
        <h1 className="text-xl font-semibold">每日日志</h1>
      </header>

      <DateSwitcher date={date} onChange={onDateChange} />

      <div className="flex gap-2">
        <Button
          type="button"
          size="chip"
          variant={view === 'table' ? 'default' : 'secondary'}
          onClick={() => setView('table')}
        >
          表格
        </Button>
        <Button
          type="button"
          size="chip"
          variant={view === 'cards' ? 'default' : 'secondary'}
          onClick={() => setView('cards')}
        >
          卡片
        </Button>
        <Button type="button" size="chip" variant="outline" onClick={() => onOpenDay('today', date)}>
          编辑当天
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-10 text-center text-sm text-[var(--muted)]">
          还没有记录。去「今日」填体重、腰围和早/中/晚/额外即可。
        </p>
      ) : view === 'table' ? (
        <div>
          <p className="mb-2 text-[11px] text-[var(--muted)]">左右滑动查看全部列，点一行可编辑</p>
          <div className="overflow-x-auto rounded-xl border border-[var(--line)]">
            <table className="sheet-table">
              <thead>
                <tr>
                  {COLUMNS.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((log) => {
                  const intake = totalIntake(log, settings)
                  const deficit = calorieDeficit(log, settings)
                  const mark = strengthMark(log.strengthTraining)
                  const selected = log.date === date
                  const kind = dayKindLabel(resolveDayKind(log, sessions, log.date))
                  return (
                    <tr
                      key={log.date}
                      className={cn('cursor-pointer', selected && 'active')}
                      onClick={() => onOpenDay('today', log.date)}
                    >
                      <td>{formatMd(log.date)}</td>
                      <td>{kind}</td>
                      <td>{cell(log.weightKg, 'one')}</td>
                      <td>{cell(log.waistCm, 'one')}</td>
                      <td>{cell(log.yesterdaySteps)}</td>
                      <td className={cn(mark === 'yes' && 'mark-yes', mark === 'no' && 'mark-no')}>
                        {mark === 'yes' ? '√' : mark === 'no' ? '✗' : '—'}
                      </td>
                      <td>{cell(log.cardioMinutes)}</td>
                      <td>{cell(log.proteinScoops, 'one')}</td>
                      <td>{cell(log.breakfastKcal)}</td>
                      <td>{cell(log.lunchKcal)}</td>
                      <td>{cell(log.dinnerKcal)}</td>
                      <td>{extraCell(log)}</td>
                      <td>{cell(intake)}</td>
                      <td>{formatOne(totalCarbsG(log, settings))}</td>
                      <td>{formatOne(totalProteinG(log, settings))}</td>
                      <td>{cell(resolveBmr(log, settings))}</td>
                      <td>{cell(log.bandBurnKcal)}</td>
                      <td>{cell(resolveOverlap(log, settings))}</td>
                      <td
                        className={cn(
                          deficit != null && deficit >= 0 ? 'mark-yes' : '',
                          deficit != null && deficit < 0 ? 'mark-no' : '',
                        )}
                      >
                        {cell(deficit)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((log) => {
            const intake = totalIntake(log, settings)
            const deficit = calorieDeficit(log, settings)
            const selected = log.date === date
            const kind = dayKindLabel(resolveDayKind(log, sessions, log.date))
            return (
              <li key={log.date}>
                <button
                  type="button"
                  className={cn(
                    'w-full rounded-2xl border border-[var(--line)] bg-[var(--card)] p-3 text-left',
                    selected && 'ring-2 ring-navy/40',
                  )}
                  onClick={() => onOpenDay('today', log.date)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {formatMd(log.date)} · {kind}
                    </span>
                    <span
                      className={cn(
                        'text-sm tabular-nums',
                        deficit == null
                          ? 'text-[var(--muted)]'
                          : deficit >= 0
                            ? 'text-deficit'
                            : 'text-surplus',
                      )}
                    >
                      热缺 {deficit == null ? '—' : formatInt(deficit)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    体重 {cell(log.weightKg, 'one')} kg · 腰围 {cell(log.waistCm, 'one')} cm ·
                    摄入 {cell(intake)} 大卡 · 碳水 {formatOne(totalCarbsG(log, settings))} g · 蛋白{' '}
                    {formatOne(totalProteinG(log, settings))} g
                    {log.notes ? ` · ${log.notes}` : ''}
                  </p>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {map.get(date)?.notes ? (
        <p className="text-xs text-[var(--muted)]">当天备注：{map.get(date)?.notes}</p>
      ) : null}
    </div>
  )
}
