export const GIST_FILENAME = 'etfs.json'
export const GIST_DESCRIPTION = 'ai-investor-data'

export type EtfEntry = {
  id: string
  name: string
  value: number
  currency: string
}

type GistFile = {
  content: string | null
}

type GistPayload = {
  files: Record<string, GistFile>
}

export type GistBody = {
  description: string
  public: boolean
  files: Record<string, { content: string }>
}

/** Parse ETF entries from a raw GitHub Gist API response object. */
export function parseEtfsFromGist(gist: GistPayload): EtfEntry[] {
  const file = gist.files[GIST_FILENAME]
  if (!file || !file.content) return []
  try {
    const parsed = JSON.parse(file.content)
    return Array.isArray(parsed) ? (parsed as EtfEntry[]) : []
  } catch {
    return []
  }
}

/** Build the request body for creating or updating a gist. */
export function buildGistBody(entries: EtfEntry[]): GistBody {
  return {
    description: GIST_DESCRIPTION,
    public: false,
    files: {
      [GIST_FILENAME]: {
        content: JSON.stringify(entries, null, 2),
      },
    },
  }
}

const GITHUB_API = 'https://api.github.com'

function githubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

/**
 * Find an existing ai-investor gist or create a new one.
 * Returns the gist ID.
 */
export async function findOrCreateGist(token: string): Promise<string> {
  const listRes = await fetch(`${GITHUB_API}/gists`, {
    headers: githubHeaders(token),
  })

  if (!listRes.ok) {
    throw new Error(`GitHub API error listing gists: ${listRes.status}`)
  }

  const gists = (await listRes.json()) as Array<{ id: string; description: string }>
  const existing = gists.find(g => g.description === GIST_DESCRIPTION)
  if (existing) return existing.id

  // Create a new private gist with an empty ETF list
  const createRes = await fetch(`${GITHUB_API}/gists`, {
    method: 'POST',
    headers: githubHeaders(token),
    body: JSON.stringify(buildGistBody([])),
  })

  if (!createRes.ok) {
    throw new Error(`GitHub API error creating gist: ${createRes.status}`)
  }

  const created = (await createRes.json()) as { id: string }
  return created.id
}

/** Fetch ETF entries from a gist by ID. */
export async function fetchEtfs(token: string, gistId: string): Promise<EtfEntry[]> {
  const res = await fetch(`${GITHUB_API}/gists/${gistId}`, {
    headers: githubHeaders(token),
  })
  if (!res.ok) return []
  const gist = (await res.json()) as GistPayload
  return parseEtfsFromGist(gist)
}

/** Save ETF entries to a gist by ID. */
export async function saveEtfs(
  token: string,
  gistId: string,
  entries: EtfEntry[],
): Promise<void> {
  await fetch(`${GITHUB_API}/gists/${gistId}`, {
    method: 'PATCH',
    headers: githubHeaders(token),
    body: JSON.stringify(buildGistBody(entries)),
  })
}
