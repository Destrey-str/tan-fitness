import { GIST_DESCRIPTION, GIST_FILE } from '@/lib/sync/config'

export type GistClient = {
  listGists: () => Promise<{ id: string; description: string | null }[]>
  createGist: (content: string) => Promise<{ id: string }>
  readGist: (id: string) => Promise<{ id: string; content: string | null }>
  writeGist: (id: string, content: string) => Promise<void>
}

const API = 'https://api.github.com'

async function github(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/vnd.github+json')
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('X-GitHub-Api-Version', '2022-11-28')
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const res = await fetch(`${API}${path}`, { ...init, headers })
  return res
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string }
    if (body.message) return body.message
  } catch {
    /* ignore */
  }
  return `GitHub ${res.status}`
}

export function createGithubGistClient(token: string): GistClient {
  return {
    async listGists() {
      const out: { id: string; description: string | null }[] = []
      for (let page = 1; page <= 5; page += 1) {
        const res = await github(token, `/gists?per_page=100&page=${page}`)
        if (!res.ok) throw new Error(await readError(res))
        const rows = (await res.json()) as { id: string; description: string | null }[]
        out.push(...rows)
        if (rows.length < 100) break
      }
      return out
    },
    async createGist(content: string) {
      const res = await github(token, '/gists', {
        method: 'POST',
        body: JSON.stringify({
          description: GIST_DESCRIPTION,
          public: false,
          files: { [GIST_FILE]: { content } },
        }),
      })
      if (!res.ok) throw new Error(await readError(res))
      const body = (await res.json()) as { id: string }
      return { id: body.id }
    },
    async readGist(id: string) {
      const res = await github(token, `/gists/${id}`)
      if (!res.ok) throw new Error(await readError(res))
      const body = (await res.json()) as {
        id: string
        files?: Record<string, { content?: string } | undefined>
      }
      const file = body.files?.[GIST_FILE] ?? Object.values(body.files ?? {})[0]
      return { id: body.id, content: file?.content ?? null }
    },
    async writeGist(id: string, content: string) {
      const res = await github(token, `/gists/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          files: { [GIST_FILE]: { content } },
        }),
      })
      if (!res.ok) throw new Error(await readError(res))
    },
  }
}

export async function ensureSyncGist(
  client: GistClient,
  preferredId: string | undefined,
  emptyContent: string,
): Promise<string> {
  const wanted = preferredId?.trim()
  if (wanted) {
    try {
      await client.readGist(wanted)
      return wanted
    } catch {
      /* fall through to search / create */
    }
  }
  const listed = await client.listGists()
  const found = listed.find((g) => g.description === GIST_DESCRIPTION)
  if (found) return found.id
  const created = await client.createGist(emptyContent)
  return created.id
}

export type MemoryGist = {
  id: string
  description: string
  content: string
}

export function createMemoryGistClient(store: Map<string, MemoryGist>): GistClient {
  let seq = 1
  return {
    async listGists() {
      return [...store.values()].map((g) => ({ id: g.id, description: g.description }))
    },
    async createGist(content: string) {
      const id = `gist-${seq}`
      seq += 1
      store.set(id, { id, description: GIST_DESCRIPTION, content })
      return { id }
    },
    async readGist(id: string) {
      const g = store.get(id)
      if (!g) throw new Error('Gist not found')
      return { id: g.id, content: g.content }
    },
    async writeGist(id: string, content: string) {
      const g = store.get(id)
      if (!g) throw new Error('Gist not found')
      g.content = content
    },
  }
}
