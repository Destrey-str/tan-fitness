import { NumberField } from '@/components/NumberField'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAppData } from '@/hooks/useAppData'
import { upsertLog } from '@/lib/storage'
import {
  calorieDeficit,
  formatInt,
  resolveBmr,
  resolveBurn,
  resolveOverlap,
  totalIntake,
} from '@/lib/stats'
import { cn } from '@/lib/utils'
import type { DailyLog } from '@/types'

export function DayForm({ date, log }: { date: string; log: DailyLog | undefined }) {
  const { settings } = useAppData()
  const patch = (next: Partial<DailyLog>) => upsertLog(date, next)
  const intake = totalIntake(log)
  const shownBmr = resolveBmr(log, settings)
  const overlap = resolveOverlap(log, settings)
  const burn = resolveBurn(log, settings)
  const deficit = calorieDeficit(log, settings)

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardTitle className="mb-3">身体</CardTitle>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="空腹体重"
            unit="kg"
            value={log?.weightKg}
            onChange={(weightKg) => patch({ weightKg })}
          />
          <NumberField
            label="肚脐腰围"
            unit="cm"
            hint="晨起空腹、肚脐水平"
            value={log?.waistCm}
            onChange={(waistCm) => patch({ waistCm })}
          />
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-3">活动</CardTitle>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="昨日步数"
            hint="记在当天这一行"
            integer
            value={log?.yesterdaySteps}
            onChange={(yesterdaySteps) => patch({ yesterdaySteps })}
          />
          <NumberField
            label="有氧"
            unit="分钟"
            integer
            value={log?.cardioMinutes}
            onChange={(cardioMinutes) => patch({ cardioMinutes })}
          />
          <NumberField
            label="蛋白粉"
            unit="勺"
            hint={
              !log && settings.lastProteinScoops != null
                ? `新记录将带出上次 ${settings.lastProteinScoops} 勺`
                : undefined
            }
            value={log ? log.proteinScoops : settings.lastProteinScoops}
            onChange={(proteinScoops) => patch({ proteinScoops })}
          />
          <div className="flex flex-col gap-1.5">
            <Label>力量训练</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant={log?.strengthTraining === true ? 'default' : 'secondary'}
                onClick={() =>
                  patch({
                    strengthTraining: log?.strengthTraining === true ? undefined : true,
                  })
                }
              >
                √ 有
              </Button>
              <Button
                type="button"
                size="sm"
                variant={log?.strengthTraining === false ? 'danger' : 'secondary'}
                onClick={() =>
                  patch({
                    strengthTraining: log?.strengthTraining === false ? undefined : false,
                  })
                }
              >
                ✗ 无
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-1">饮食</CardTitle>
        <p className="mb-3 text-[11px] text-[var(--muted)]">单位：大卡。总摄入自动相加。</p>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="早"
            unit="大卡"
            integer
            value={log?.breakfastKcal}
            onChange={(breakfastKcal) => patch({ breakfastKcal })}
          />
          <NumberField
            label="中"
            unit="大卡"
            integer
            value={log?.lunchKcal}
            onChange={(lunchKcal) => patch({ lunchKcal })}
          />
          <NumberField
            label="晚"
            unit="大卡"
            integer
            value={log?.dinnerKcal}
            onChange={(dinnerKcal) => patch({ dinnerKcal })}
          />
          <NumberField
            label="额外"
            unit="大卡"
            integer
            value={log?.extraKcal}
            onChange={(extraKcal) => patch({ extraKcal })}
          />
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          <Label htmlFor={`extra-note-${date}`}>额外说明（可选）</Label>
          <Textarea
            id={`extra-note-${date}`}
            className="min-h-16"
            placeholder="如 120+108"
            value={log?.extraNote ?? ''}
            onChange={(e) => patch({ extraNote: e.target.value || undefined })}
          />
        </div>
        <div
          className={cn(
            'mt-3 flex items-center justify-between rounded-xl px-3 py-2.5',
            'bg-navy text-white',
          )}
        >
          <span className="text-sm">总摄入</span>
          <span className="text-lg font-semibold tabular-nums">
            {intake == null ? '—' : `${formatInt(intake)} 大卡`}
          </span>
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-1">消耗与缺口</CardTitle>
        <p className="mb-3 text-[11px] leading-snug text-[var(--muted)]">
          热缺 = 基础代谢 + 手环消耗 − 重叠扣减 − 饮食总摄入。改 BMR / 重叠扣减一次，之后新记录沿用。
        </p>
        <div className="flex flex-col gap-3">
          <NumberField
            label="基础代谢 BMR"
            unit="大卡"
            integer
            hint={
              log?.bmrKcal == null
                ? `新记录带出默认 ${shownBmr}（改一次即成为之后的默认，不改历史）`
                : '改这里会更新之后新记录的默认值，当天单独保存'
            }
            value={shownBmr}
            onChange={(bmrKcal) => {
              if (bmrKcal == null) {
                patch({ bmrKcal: undefined })
                return
              }
              if (log?.bmrKcal == null && bmrKcal === settings.bmrDefaultKcal) return
              if (log?.bmrKcal === bmrKcal) return
              patch({ bmrKcal })
            }}
          />
          <NumberField
            label="手环消耗"
            unit="千卡"
            integer
            hint="手环当天记录的消耗"
            value={log?.bandBurnKcal}
            onChange={(bandBurnKcal) => patch({ bandBurnKcal })}
          />
          <NumberField
            label="重叠扣减"
            unit="大卡"
            integer
            hint={
              log?.overlapKcal == null
                ? `新记录带出默认 ${overlap}。手环若已含部分基础代谢，在这里扣掉（默认 150）`
                : '改这里会更新之后新记录的默认值，当天单独保存'
            }
            value={overlap}
            onChange={(overlapKcal) => {
              if (overlapKcal == null) {
                patch({ overlapKcal: undefined })
                return
              }
              if (log?.overlapKcal == null && overlapKcal === settings.overlapDefaultKcal) {
                return
              }
              if (log?.overlapKcal === overlapKcal) return
              patch({ overlapKcal })
            }}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-[var(--line)]/60 px-3 py-2.5">
            <p className="text-[11px] text-[var(--muted)]">总消耗</p>
            <p className="text-base font-semibold tabular-nums">
              {formatInt(burn.kcal)} 大卡
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">
              {burn.source === 'tdee' ? '固定 TDEE' : 'BMR + 手环 − 重叠扣减'}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--line)]/60 px-3 py-2.5">
            <p className="text-[11px] text-[var(--muted)]">热缺</p>
            <p
              className={cn(
                'text-base font-semibold tabular-nums',
                deficit == null ? '' : deficit >= 0 ? 'text-deficit' : 'text-surplus',
              )}
            >
              {deficit == null ? '—' : `${formatInt(deficit)} 大卡`}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">
              {deficit == null ? '填完摄入后自动算' : deficit >= 0 ? '缺口（减脂）' : '盈余'}
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-3">备注</CardTitle>
        <Textarea
          placeholder="训练感受、睡眠、饮食细节…"
          value={log?.notes ?? ''}
          onChange={(e) => patch({ notes: e.target.value || undefined })}
        />
      </Card>
    </div>
  )
}
