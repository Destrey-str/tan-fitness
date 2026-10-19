import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { InstallTip } from '@/components/InstallTip'
import { BottomNav } from '@/components/BottomNav'
import { LogPage } from '@/pages/LogPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { TodayPage } from '@/pages/TodayPage'
import { TrainPage } from '@/pages/TrainPage'
import { todayIso } from '@/lib/dates'
import { getLoadError } from '@/lib/storage'
import { startSyncEngine } from '@/lib/sync/engine'
import type { TabId } from '@/types'

const ChartsPage = lazy(async () => {
  const mod = await import('@/pages/ChartsPage')
  return { default: mod.ChartsPage }
})

const UI_KEY = 'jianzhi-ui-v1'

function readTab(): TabId {
  try {
    const raw = sessionStorage.getItem(UI_KEY)
    if (!raw) return 'today'
    const parsed = JSON.parse(raw) as { tab?: TabId }
    if (
      parsed.tab === 'today' ||
      parsed.tab === 'log' ||
      parsed.tab === 'train' ||
      parsed.tab === 'charts' ||
      parsed.tab === 'settings'
    ) {
      return parsed.tab
    }
  } catch {
    /* ignore */
  }
  return 'today'
}

function readDate(): string {
  try {
    const raw = sessionStorage.getItem(UI_KEY)
    if (!raw) return todayIso()
    const parsed = JSON.parse(raw) as { date?: string }
    if (parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) return parsed.date
  } catch {
    /* ignore */
  }
  return todayIso()
}

function persistUi(tab: TabId, date: string) {
  try {
    sessionStorage.setItem(UI_KEY, JSON.stringify({ tab, date }))
  } catch {
    /* ignore */
  }
}

export default function App() {
  const [tab, setTab] = useState<TabId>(readTab)
  const [date, setDate] = useState(readDate)

  useEffect(() => {
    startSyncEngine()
  }, [])

  const changeTab = useCallback((next: TabId) => {
    setTab(next)
    persistUi(next, date)
  }, [date])

  const changeDate = useCallback((next: string) => {
    setDate(next)
    persistUi(tab, next)
  }, [tab])

  const openDay = useCallback((nextTab: TabId, nextDate: string) => {
    setDate(nextDate)
    setTab(nextTab)
    persistUi(nextTab, nextDate)
  }, [])

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex-1 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-24">
        <InstallTip />
        {getLoadError() ? (
          <p className="mb-3 rounded-2xl border border-surplus/40 bg-surplus/10 px-3 py-2 text-sm text-surplus">
            本机备份文件读不出来，没有覆盖原数据。请到设置导出后联系修复。
          </p>
        ) : null}
        <ErrorBoundary key={tab}>
        {tab === 'today' ? <TodayPage date={date} onDateChange={changeDate} /> : null}
        {tab === 'log' ? (
          <LogPage date={date} onDateChange={changeDate} onOpenDay={openDay} />
        ) : null}
        {tab === 'train' ? <TrainPage date={date} /> : null}
        {tab === 'charts' ? (
          <Suspense
            fallback={
              <p className="py-16 text-center text-sm text-[var(--muted)]">正在加载图表…</p>
            }
          >
            <ChartsPage />
          </Suspense>
        ) : null}
        {tab === 'settings' ? <SettingsPage /> : null}
        </ErrorBoundary>
      </main>
      <BottomNav tab={tab} onChange={changeTab} />
    </div>
  )
}
