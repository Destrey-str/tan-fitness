import { useMemo, useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { useAppData, useLogMap } from '@/hooks/useAppData'
import { dateRangeInclusive, formatMd, todayIso } from '@/lib/dates'
import {
  calorieDeficit,
  linearTrend,
  rollingAverage,
  totalIntake,
} from '@/lib/stats'
import type { ChartRange } from '@/types'

const RANGES: ChartRange[] = [7, 14, 28, 90]

type ChartRow = {
  date: string
  label: string
  weight: number | null
  waist: number | null
  deficit: number | null
  intake: number | null
  weightMa7: number | null
  waistMa7: number | null
  weightTrend: number | null
}

function paddedDomain(values: number[]): [number, number] | ['auto', 'auto'] {
  const finite = values.filter((n) => typeof n === 'number' && Number.isFinite(n))
  if (finite.length === 0) return ['auto', 'auto']
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const pad = Math.max(1.5, (max - min) * 0.18 || 2)
  return [Math.floor((min - pad) * 10) / 10, Math.ceil((max + pad) * 10) / 10]
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((item) =>
        item.value == null ? null : (
          <p key={item.name} style={{ color: item.color }}>
            {item.name}：{item.value}
          </p>
        ),
      )}
    </div>
  )
}

export function ChartsPage() {
  const { logs, settings } = useAppData()
  const map = useLogMap()
  const [range, setRange] = useState<ChartRange>(28)
  const [showMa7, setShowMa7] = useState(true)
  const [showTrend, setShowTrend] = useState(true)

  const data = useMemo<ChartRow[]>(() => {
    const dates = dateRangeInclusive(todayIso(), range)
    const weightMap = new Map<string, number>()
    const waistMap = new Map<string, number>()
    for (const log of logs) {
      if (typeof log.weightKg === 'number' && Number.isFinite(log.weightKg)) {
        weightMap.set(log.date, log.weightKg)
      }
      if (typeof log.waistCm === 'number' && Number.isFinite(log.waistCm)) {
        waistMap.set(log.date, log.waistCm)
      }
    }
    const rows: ChartRow[] = dates.map((date) => {
      const log = map.get(date)
      return {
        date,
        label: formatMd(date),
        weight: log?.weightKg ?? null,
        waist: log?.waistCm ?? null,
        deficit: calorieDeficit(log, settings) ?? null,
        intake: totalIntake(log) ?? null,
        weightMa7: null,
        waistMa7: null,
        weightTrend: null,
      }
    })
    const weightMa = rollingAverage(dates, weightMap, 7)
    const waistMa = rollingAverage(dates, waistMap, 7)
    const trend = linearTrend(rows.map((r) => r.weight))
    return rows.map((row, i) => ({
      ...row,
      weightMa7: weightMa[i],
      waistMa7: waistMa[i],
      weightTrend: trend[i],
    }))
  }, [logs, map, range, settings])

  const hasBody = data.some((d) => d.weight != null || d.waist != null)
  const hasDeficit = data.some((d) => d.deficit != null)
  const hasWeight = data.some((d) => d.weight != null)
  const leftDomain = paddedDomain(
    data.flatMap((d) => [d.weight, d.waist, d.weightMa7, d.waistMa7]).filter((n): n is number => n != null),
  )

  const empty = !hasBody && !hasDeficit

  return (
    <div className="flex flex-col gap-3 pb-6">
      <header>
        <p className="text-xs text-[var(--muted)]">
          左轴体重/腰围，右轴热缺（BMR + 手环 − 重叠扣减 − 总摄入）
        </p>
        <h1 className="text-xl font-semibold">趋势</h1>
      </header>

      <div className="flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Button
            key={r}
            type="button"
            size="chip"
            variant={range === r ? 'default' : 'secondary'}
            onClick={() => setRange(r)}
          >
            {r} 天
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="chip"
          variant={showMa7 ? 'default' : 'secondary'}
          onClick={() => setShowMa7((v) => !v)}
        >
          7 日滚动平均
        </Button>
        <Button
          type="button"
          size="chip"
          variant={showTrend ? 'default' : 'secondary'}
          onClick={() => setShowTrend((v) => !v)}
        >
          体重趋势线
        </Button>
      </div>

      {empty ? (
        <p className="rounded-2xl border border-dashed border-[var(--line)] px-4 py-10 text-center text-sm text-[var(--muted)]">
          先记下几天的空腹体重、肚脐腰围和饮食，这里就会出现和表格对应的曲线。
        </p>
      ) : (
        <>
          <Card className="px-1 pb-2 pt-3">
            <CardTitle className="mb-2 px-3">体重 · 腰围 · 热缺</CardTitle>
            <div className="h-64 w-full">
              <ResponsiveContainer>
                <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis
                    yAxisId="left"
                    domain={leftDomain}
                    tick={{ fontSize: 11 }}
                    width={40}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11 }}
                    width={36}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {hasBody ? (
                    <Bar
                      yAxisId="left"
                      dataKey="weight"
                      name="空腹体重"
                      fill="#5B9BD5"
                      maxBarSize={18}
                    />
                  ) : null}
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="waist"
                    name="肚脐腰围"
                    stroke="#ED7D31"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls={false}
                  />
                  {showMa7 ? (
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="weightMa7"
                      name="体重 7日均"
                      stroke="#2E86C1"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ) : null}
                  {showMa7 ? (
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="waistMa7"
                      name="腰围 7日均"
                      stroke="#DC7633"
                      strokeDasharray="4 3"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ) : null}
                  {hasDeficit ? (
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="deficit"
                      name="热缺"
                      stroke="#7F8C8D"
                      strokeDasharray="6 4"
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                    />
                  ) : null}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="px-1 pb-2 pt-3">
            <CardTitle className="mb-2 px-3">体重变化</CardTitle>
            <div className="h-56 w-full">
              {hasWeight ? (
                <ResponsiveContainer>
                  <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis
                      domain={paddedDomain(
                        data
                          .flatMap((d) => [d.weight, d.weightMa7, d.weightTrend])
                          .filter((n): n is number => n != null),
                      )}
                      tick={{ fontSize: 11 }}
                      width={40}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="weight"
                      name="空腹体重"
                      stroke="#5B9BD5"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls={false}
                    />
                    {showMa7 ? (
                      <Line
                        type="monotone"
                        dataKey="weightMa7"
                        name="7日均"
                        stroke="#1B4F72"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    ) : null}
                    {showTrend ? (
                      <Line
                        type="linear"
                        dataKey="weightTrend"
                        name="趋势线"
                        stroke="#C0392B"
                        strokeDasharray="5 4"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    ) : null}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="px-3 py-8 text-center text-sm text-[var(--muted)]">还没有体重数据</p>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
