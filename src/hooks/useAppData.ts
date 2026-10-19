import { useMemo, useSyncExternalStore } from 'react'
import { getSnapshot, subscribe } from '@/lib/storage'
import type { DailyLog } from '@/types'

export function useAppData() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useLog(date: string): DailyLog | undefined {
  const data = useAppData()
  return useMemo(
    () => data.logs.find((l) => l.date === date),
    [data.logs, date],
  )
}

export function useLogMap(): Map<string, DailyLog> {
  const data = useAppData()
  return useMemo(() => {
    const map = new Map<string, DailyLog>()
    for (const log of data.logs) map.set(log.date, log)
    return map
  }, [data.logs])
}
