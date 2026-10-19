export const GIST_DESCRIPTION = 'jianzhi-notes-sync'
export const GIST_FILE = 'data.json'
export const TOKEN_KEY = 'jianzhi-gist-token'
export const SYNC_META_KEY = 'jianzhi-sync-meta'

export type SyncMeta = {
  enabled: boolean
  gistId?: string
  lastSyncAt?: string
  lastError?: string
}

const emptyMeta: SyncMeta = { enabled: false }

export function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function writeToken(token: string) {
  try {
    const t = token.trim()
    if (!t) localStorage.removeItem(TOKEN_KEY)
    else localStorage.setItem(TOKEN_KEY, t)
  } catch {
    /* ignore */
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export function readSyncMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(SYNC_META_KEY)
    if (!raw) return { ...emptyMeta }
    const parsed = JSON.parse(raw) as Partial<SyncMeta>
    return {
      enabled: parsed.enabled === true,
      gistId: typeof parsed.gistId === 'string' ? parsed.gistId : undefined,
      lastSyncAt: typeof parsed.lastSyncAt === 'string' ? parsed.lastSyncAt : undefined,
      lastError: typeof parsed.lastError === 'string' ? parsed.lastError : undefined,
    }
  } catch {
    return { ...emptyMeta }
  }
}

export function writeSyncMeta(patch: Partial<SyncMeta>) {
  const next = { ...readSyncMeta(), ...patch }
  try {
    localStorage.setItem(SYNC_META_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
}

export function isSecretKey(key: string): boolean {
  return key === TOKEN_KEY || /token/i.test(key)
}
