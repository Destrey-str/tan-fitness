import {
  assertNoSecrets,
  fromSyncDocument,
  mergeCloudData,
  toSyncDocument,
} from '@/lib/sync/merge'
import { ensureSyncGist, type GistClient } from '@/lib/sync/gist'
import type { AppData } from '@/types'

/** Pull → merge → push using an injected Gist client (real or mock). */
export async function reconcileWithGist(
  local: AppData,
  api: GistClient,
  preferredId: string | undefined,
): Promise<{ data: AppData; gistId: string; payload: string }> {
  const seed = JSON.stringify(toSyncDocument(local), null, 2)
  assertNoSecrets(seed)
  const gistId = await ensureSyncGist(api, preferredId, seed)
  const remoteFile = await api.readGist(gistId)
  let remote = fromSyncDocument({})
  if (remoteFile.content) {
    try {
      remote = fromSyncDocument(JSON.parse(remoteFile.content) as unknown)
    } catch {
      remote = fromSyncDocument({})
    }
  }
  const merged = mergeCloudData(local, remote)
  const payload = JSON.stringify(toSyncDocument(merged), null, 2)
  assertNoSecrets(payload)
  await api.writeGist(gistId, payload)
  return { data: merged, gistId, payload }
}
