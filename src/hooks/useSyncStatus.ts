import { useSyncExternalStore } from 'react'
import { getSyncStatus, subscribeSyncStatus } from '@/lib/sync/engine'

export function useSyncStatus() {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus)
}
