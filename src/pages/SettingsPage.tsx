import { useRef, useState } from 'react'
import { useSyncStatus } from '@/hooks/useSyncStatus'
import { NumberField } from '@/components/NumberField'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAppData } from '@/hooks/useAppData'
import { todayIso } from '@/lib/dates'
import {
  clearAll,
  exportJson,
  getSnapshot,
  mergeImported,
  parseImport,
  replaceAll,
  resetWorkoutTemplates,
  seedSampleLogs,
  setActivePlan,
  updateSettings,
} from '@/lib/storage'
import { disableSync, enableSync, getSyncStatus, syncNow } from '@/lib/sync/engine'
import { readToken } from '@/lib/sync/config'
import type { AppData, BurnSource } from '@/types'
import { cn } from '@/lib/utils'

function backupFilename() {
  return `减脂笔记-${todayIso()}.json`
}

function makeBackupFile() {
  const text = exportJson()
  return {
    text,
    file: new File([text], backupFilename(), { type: 'application/json' }),
  }
}

function triggerDownload(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

const BURN_OPTIONS: { id: BurnSource; title: string; desc: string }[] = [
  {
    id: 'band',
    title: 'A · BMR + 手环 − 重叠扣减',
    desc: '热缺 = 基础代谢 + 手环消耗 − 重叠扣减（默认 150）− 饮食总摄入。没填手环则手环按 0。',
  },
  {
    id: 'tdee',
    title: 'B · 固定 TDEE',
    desc: '热缺 = 设置里的 TDEE − 饮食总摄入，忽略 BMR、手环和重叠扣减。',
  },
]

function formatSyncAt(iso?: string): string {
  if (!iso) return '尚未同步'
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return '尚未同步'
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function SettingsPage({ onOpenPlans }: { onOpenPlans?: () => void }) {
  const { settings, logs, workout } = useAppData()
  const sync = useSyncStatus()
  const fileRef = useRef<HTMLInputElement>(null)
  const [token, setToken] = useState(() => readToken())
  const [gistId, setGistId] = useState(() => sync.gistId ?? '')
  const [syncBusy, setSyncBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pending, setPending] = useState<AppData | null>(null)

  function flash(ok: string) {
    setError(null)
    setMessage(ok)
  }

  function fail(err: unknown) {
    setMessage(null)
    setError(err instanceof Error ? err.message : '操作失败')
  }

  async function exportFile() {
    setError(null)
    setMessage(null)
    try {
      const { file } = makeBackupFile()
      const shareData = { files: [file], title: '减脂笔记备份', text: file.name }
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share(shareData)
          flash('已打开分享面板，可选「存储到文件」')
          return
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return
        }
      }
      triggerDownload(file)
      flash('已导出 JSON，可保存到「文件」')
    } catch (err) {
      fail(err)
    }
  }

  async function copyJson() {
    setError(null)
    setMessage(null)
    try {
      const text = exportJson()
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const area = document.createElement('textarea')
        area.value = text
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.left = '-9999px'
        document.body.appendChild(area)
        area.select()
        document.execCommand('copy')
        area.remove()
      }
      flash('已复制 JSON 文本')
    } catch (err) {
      fail(err)
    }
  }

  function beginImport(raw: string) {
    const next = parseImport(raw)
    setPending(next)
    setError(null)
    setMessage(
      `已读取 ${next.logs.length} 天、${next.workout.sessions.length} 次训练。请选择覆盖或合并。`,
    )
  }

  function applyImport(mode: 'replace' | 'merge') {
    if (!pending) return
    if (mode === 'replace') replaceAll(pending)
    else mergeImported(pending)
    const snap = getSnapshot()
    setPending(null)
    setPasteOpen(false)
    setPasteText('')
    flash(
      mode === 'replace'
        ? `已覆盖导入 ${snap.logs.length} 天记录`
        : `已合并，现有 ${snap.logs.length} 天记录`,
    )
  }

  return (
    <div className="flex flex-col gap-3 pb-6">
      <header>
        <p className="text-xs text-[var(--muted)]">本机保存 · 可选 Gist 同步</p>
        <h1 className="text-xl font-semibold">设置</h1>
      </header>

      <Card>
        <CardTitle className="mb-3">训练计划</CardTitle>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="active-plan">当前计划</Label>
            <select
              id="active-plan"
              data-testid="active-plan"
              className="h-11 rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 text-base"
              value={workout?.activePlanId ?? ''}
              onChange={(e) => {
                if (e.target.value) setActivePlan(e.target.value)
              }}
            >
              {(workout?.plans ?? []).map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </div>
          <p className="text-[11px] text-[var(--muted)]">训练页只显示当前计划里的训练日。</p>
          {onOpenPlans ? (
            <Button type="button" variant="secondary" onClick={onOpenPlans}>
              管理训练计划
            </Button>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-3">个人</CardTitle>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="display-name">显示名（可选）</Label>
          <Input
            id="display-name"
            placeholder="怎么称呼你"
            value={settings.displayName}
            onChange={(e) => updateSettings({ displayName: e.target.value })}
          />
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-3">热量目标</CardTitle>
        <div className="grid grid-cols-1 gap-3">
          <NumberField
            label="训练日摄入目标"
            unit="大卡"
            integer
            hint="默认沿用原来的每日目标。已记下的日子不会跟着改。"
            value={settings.trainingTargetKcal}
            onChange={(n) => {
              if (n != null && n > 0) {
                const next = Math.round(n)
                updateSettings({ trainingTargetKcal: next, targetKcal: next })
              }
            }}
          />
          <NumberField
            label="休息日摄入目标"
            unit="大卡"
            integer
            hint="默认 1800。已记下的日子不会跟着改。"
            value={settings.restTargetKcal}
            onChange={(n) => {
              if (n != null && n > 0) updateSettings({ restTargetKcal: Math.round(n) })
            }}
          />
          <NumberField
            label="默认基础代谢 BMR"
            unit="大卡"
            integer
            hint="默认 1630。新记录带出此值；改一次即沿用。已写下的历史日不改。"
            value={settings.bmrDefaultKcal}
            onChange={(n) => {
              if (n != null && n > 0) updateSettings({ bmrDefaultKcal: Math.round(n) })
            }}
          />
          <NumberField
            label="默认重叠扣减"
            unit="大卡"
            integer
            hint="默认 150，在公式里减去。新记录带出此值；改一次即沿用。旧版「额外消耗」会迁成 150，不用来做加法。"
            value={settings.overlapDefaultKcal}
            onChange={(n) => {
              if (n != null && n >= 0) updateSettings({ overlapDefaultKcal: Math.round(n) })
            }}
          />
          <NumberField
            label="TDEE 估计"
            unit="千卡"
            integer
            hint="默认 2300，仅方案 B 使用"
            value={settings.tdee}
            onChange={(n) => {
              if (n != null) updateSettings({ tdee: n })
            }}
          />
          <NumberField
            label="蛋白质目标"
            unit="g"
            integer
            hint="建议 120–140，默认 130（备忘）"
            value={settings.proteinTarget}
            onChange={(n) => {
              if (n != null) updateSettings({ proteinTarget: n })
            }}
          />
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-1">热缺消耗来源</CardTitle>
        <p className="mb-3 text-[11px] text-[var(--muted)]">
          热缺 = 总消耗 − 总摄入。正数为缺口（减脂）。
        </p>
        <div className="flex flex-col gap-2">
          {BURN_OPTIONS.map((opt) => {
            const active = settings.burnSource === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateSettings({ burnSource: opt.id })}
                className={cn(
                  'rounded-xl border px-3 py-2.5 text-left',
                  active
                    ? 'border-navy bg-navy/10'
                    : 'border-[var(--line)] bg-[var(--card)]',
                )}
              >
                <p className="text-sm font-medium">{opt.title}</p>
                <p className="mt-0.5 text-[11px] text-[var(--muted)]">{opt.desc}</p>
              </button>
            )
          })}
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-3">云同步</CardTitle>
        <p className="mb-3 text-xs text-[var(--muted)]">
          用 GitHub 私密 Gist 在多台设备之间合并数据。Token 只存在本机，不会写入导出文件。需要
          gist 权限的 Fine-grained 或 classic PAT。
        </p>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gh-token">GitHub Token</Label>
            <Input
              id="gh-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="ghp_… 或 github_pat_…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gist-id">Gist ID（可选）</Label>
            <Input
              id="gist-id"
              autoComplete="off"
              spellCheck={false}
              placeholder="留空则自动查找 / 新建 jianzhi-notes-sync"
              value={gistId}
              onChange={(e) => setGistId(e.target.value)}
            />
          </div>
          <Button
            type="button"
            disabled={syncBusy}
            onClick={() => {
              setSyncBusy(true)
              void enableSync(token, gistId)
                .then(() => {
                  const next = getSyncStatus()
                  setGistId(next.gistId ?? gistId)
                  flash(
                    next.state === 'offline'
                      ? '已启用，网络不通，稍后自动重试'
                      : '云同步已开启，本地与云端已合并',
                  )
                })
                .catch((err) => fail(err))
                .finally(() => setSyncBusy(false))
            }}
          >
            {sync.enabled ? '重新连接' : '启用云同步'}
          </Button>
          {sync.enabled ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={syncBusy || sync.state === 'syncing'}
                onClick={() => {
                  setSyncBusy(true)
                  void syncNow()
                    .catch((err) => fail(err))
                    .finally(() => setSyncBusy(false))
                }}
              >
                立即同步
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  disableSync()
                  setToken('')
                  flash('已关闭云同步（Gist 仍保留在 GitHub）')
                }}
              >
                关闭同步
              </Button>
            </div>
          ) : null}
          <p className="text-xs text-[var(--muted)]">
            {sync.state === 'syncing' || syncBusy
              ? '同步中…'
              : sync.state === 'offline'
                ? `离线：${sync.lastError ?? '网络不通'}，稍后自动重试`
                : sync.state === 'error'
                  ? `失败：${sync.lastError ?? '未知错误'}，稍后自动重试`
                  : sync.enabled
                    ? `上次同步 ${formatSyncAt(sync.lastSyncAt)}${sync.gistId ? ` · ${sync.gistId.slice(0, 8)}…` : ''}`
                    : '未启用。离线时照常记在本机。'}
          </p>
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-3">数据</CardTitle>
        <p className="mb-3 text-xs text-[var(--muted)]">
          当前 {logs.length} 天记录
          {workout?.sessions?.length ? ` · ${workout.sessions.length} 次训练` : ''}
          ，全部存在浏览器 localStorage。iPhone 导出后可「存储到文件」或复制文本。
        </p>
        <div className="flex flex-col gap-2">
          <Button type="button" onClick={() => void exportFile()}>
            导出数据
          </Button>
          <Button type="button" variant="secondary" onClick={() => void copyJson()}>
            复制 JSON 文本
          </Button>
          <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
            导入数据
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json,text/plain"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              try {
                beginImport(await file.text())
              } catch (err) {
                fail(err)
              }
            }}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setPasteOpen((open) => !open)
              setError(null)
            }}
          >
            {pasteOpen ? '收起粘贴框' : '粘贴 JSON 文本'}
          </Button>
          {pasteOpen ? (
            <div className="flex flex-col gap-2 rounded-xl border border-[var(--line)] p-3">
              <Label htmlFor="paste-json">把备份 JSON 粘贴到这里</Label>
              <Textarea
                id="paste-json"
                value={pasteText}
                placeholder='{"kind":"jianzhi-notes-backup",...}'
                className="min-h-32 font-mono text-xs"
                onChange={(e) => setPasteText(e.target.value)}
              />
              <Button
                type="button"
                onClick={() => {
                  try {
                    beginImport(pasteText)
                  } catch (err) {
                    fail(err)
                  }
                }}
              >
                读取粘贴内容
              </Button>
            </div>
          ) : null}
          {pending ? (
            <div className="flex flex-col gap-2 rounded-xl border border-navy/40 bg-navy/5 p-3">
              <p className="text-sm">
                覆盖会替换本机全部记录；合并按日期 / 训练 id 补进，同一条以导入为准。
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="danger" onClick={() => applyImport('replace')}>
                  覆盖导入
                </Button>
                <Button type="button" onClick={() => applyImport('merge')}>
                  合并导入
                </Button>
              </div>
              <Button type="button" variant="secondary" onClick={() => setPending(null)}>
                取消
              </Button>
            </div>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (
                !window.confirm(
                  '恢复「谭式推拉腿」的默认动作？其他计划、饮食和训练记录都会保留。',
                )
              ) {
                return
              }
              resetWorkoutTemplates()
              flash('已恢复谭式默认模板')
            }}
          >
            恢复谭式默认模板
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (logs.length > 0 && !window.confirm('将覆盖现有日志为 14 天示例，确定？')) {
                return
              }
              seedSampleLogs()
              flash('已填入 14 天示例，可在趋势页查看图表')
            }}
          >
            填入示例数据
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              if (!window.confirm('清除全部记录和设置？此操作不可恢复。')) return
              if (!window.confirm('再确认一次：真的清空本机全部数据？')) return
              clearAll()
              flash('已清空')
            }}
          >
            清除全部数据
          </Button>
        </div>
        {message ? <p className="mt-2 text-sm text-deficit">{message}</p> : null}
        {error ? <p className="mt-2 text-sm text-surplus">{error}</p> : null}
      </Card>
    </div>
  )
}
