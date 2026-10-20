import { nowIso } from '@/lib/dates'
import {
  applySyncedData,
  getSnapshot,
  subscribeMutations,
} from '@/lib/storage'
import {
  clearToken,
  readSyncMeta,
  readToken,
  writeSyncMeta,
  writeToken,
} from '@/lib/sync/config'
import { createGithubGistClient, type GistClient } from '@/lib/sync/gist'
import { mergeCloudData } from '@/lib/sync/merge'
import { reconcileWithGist } from '@/lib/sync/roundtrip'
import type { AppData } from '@/types'

export type SyncState = 'idle' | 'syncing' | 'ok' | 'error' | 'offline' | 'disabled'

export type SyncStatus = {
  enabled: boolean
  gistId?: string
  state: SyncState
  lastSyncAt?: string
  lastError?: string
}

type ClientFactory = (token: string) => GistClient

let clientFactory: ClientFactory = createGithubGistClient
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let inFlight: Promise<void> | null = null
let started = false
const statusListeners = new Set<() => void>()
let status: SyncStatus = snapshotStatus()

export function setGistClientFactory(factory: ClientFactory | null) {
  clientFactory = factory ?? createGithubGistClient
}

function snapshotStatus(): SyncStatus {
  const meta = readSyncMeta()
  const token = readToken()
  return {
    enabled: meta.enabled && Boolean(token),
    gistId: meta.gistId,
    state: meta.enabled && token ? (meta.lastError ? 'error' : meta.lastSyncAt ? 'ok' : 'idle') : 'disabled',
    lastSyncAt: meta.lastSyncAt,
    lastError: meta.lastError,
  }
}

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  statusListeners.forEach((l) => l())
}

export function getSyncStatus(): SyncStatus {
  return status
}

export function subscribeSyncStatus(listener: () => void): () => void {
  statusListeners.add(listener)
  return () => {
    statusListeners.delete(listener)
  }
}

function client(): GistClient {
  const token = readToken()
  if (!token) throw new Error('未填写 GitHub Token')
  return clientFactory(token)
}

/** Keep edits made while a pull was in flight, including the exercise the user just picked. */
export function mergeSyncResult(snapshotAtStart: AppData, merged: AppData, current: AppData): AppData {
  if (current === snapshotAtStart) return merged
  return mergeCloudData(current, merged)
}

async function pullMergePush() {
  const token = readToken()
  const meta = readSyncMeta()
  if (!token || !meta.enabled) return
  setStatus({ state: 'syncing', lastError: undefined })
  try {
    const api = client()
    const snapshotAtStart = getSnapshot()
    const result = await reconcileWithGist(snapshotAtStart, api, meta.gistId)
    if (result.payload.includes(token)) {
      throw new Error('token leaked')
    }
    applySyncedData(mergeSyncResult(snapshotAtStart, result.data, getSnapshot()))
    const at = nowIso()
    writeSyncMeta({
      gistId: result.gistId,
      lastSyncAt: at,
      lastError: undefined,
      enabled: true,
    })
    setStatus({
      enabled: true,
      gistId: result.gistId,
      state: 'ok',
      lastSyncAt: at,
      lastError: undefined,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '同步失败'
    const offline =
      message === 'Failed to fetch' ||
      message.toLowerCase().includes('network') ||
      message.toLowerCase().includes('load failed')
    writeSyncMeta({ lastError: message })
    setStatus({
      state: offline ? 'offline' : 'error',
      lastError: offline ? '网络不通，稍后自动重试' : message,
    })
    scheduleRetry()
  }
}

function runSync() {
  if (inFlight) return inFlight
  inFlight = pullMergePush().finally(() => {
    inFlight = null
  })
  return inFlight
}

function scheduleRetry() {
  if (retryTimer) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    if (readSyncMeta().enabled && readToken()) void runSync()
  }, 20_000)
}

function schedulePush() {
  if (!readSyncMeta().enabled || !readToken()) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    void runSync()
  }, 4000)
}

export async function enableSync(token: string, gistId?: string) {
  const trimmed = token.trim()
  if (!trimmed) throw new Error('请填写 GitHub Token（gist 权限）')
  writeToken(trimmed)
  writeSyncMeta({
    enabled: true,
    gistId: gistId?.trim() || readSyncMeta().gistId,
    lastError: undefined,
  })
  setStatus({ enabled: true, gistId: gistId?.trim() || readSyncMeta().gistId, state: 'syncing' })
  await runSync()
  const next = getSyncStatus()
  if (next.state === 'error') {
    throw new Error(next.lastError || '同步失败')
  }
}

export function disableSync() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = null
  writeSyncMeta({ enabled: false, lastError: undefined })
  clearToken()
  setStatus({ enabled: false, state: 'disabled', lastError: undefined, gistId: undefined })
}

export function syncNow() {
  return runSync()
}

export function startSyncEngine() {
  if (started || typeof window === 'undefined') return
  started = true
  status = snapshotStatus()
  subscribeMutations(() => schedulePush())
  const onWake = () => {
    if (readSyncMeta().enabled && readToken()) void runSync()
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onWake()
  })
  window.addEventListener('online', onWake)
  window.addEventListener('pageshow', onWake)
  if (readSyncMeta().enabled && readToken()) void runSync()
}
