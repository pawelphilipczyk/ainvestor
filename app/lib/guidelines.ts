export const GUIDELINES_FILENAME = 'guidelines.json'

export type EtfType =
  | 'equity'
  | 'bond'
  | 'real_estate'
  | 'commodity'
  | 'mixed'
  | 'money_market'

export type EtfGuideline = {
  id: string
  etfName: string
  targetPct: number
  etfType: EtfType
}

type GistFile = {
  content: string | null
}

type GistPayload = {
  files: Record<string, GistFile>
}

/** Parse guidelines from a raw GitHub Gist API response object. */
export function parseGuidelinesFromGist(gist: GistPayload): EtfGuideline[] {
  const file = gist.files[GUIDELINES_FILENAME]
  if (!file || !file.content) return []
  try {
    const parsed = JSON.parse(file.content)
    return Array.isArray(parsed) ? (parsed as EtfGuideline[]) : []
  } catch {
    return []
  }
}

/** Build a PATCH-ready body to update the guidelines file in a gist. */
export function buildGuidelinesGistPatch(guidelines: EtfGuideline[]): {
  files: Record<string, { content: string }>
} {
  return {
    files: {
      [GUIDELINES_FILENAME]: {
        content: JSON.stringify(guidelines, null, 2),
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

/** Fetch guidelines from an existing gist by ID. */
export async function fetchGuidelines(
  token: string,
  gistId: string,
): Promise<EtfGuideline[]> {
  const res = await fetch(`${GITHUB_API}/gists/${gistId}`, {
    headers: githubHeaders(token),
  })
  if (!res.ok) return []
  const gist = (await res.json()) as GistPayload
  return parseGuidelinesFromGist(gist)
}

/** Save guidelines to an existing gist by ID. */
export async function saveGuidelines(
  token: string,
  gistId: string,
  guidelines: EtfGuideline[],
): Promise<void> {
  await fetch(`${GITHUB_API}/gists/${gistId}`, {
    method: 'PATCH',
    headers: githubHeaders(token),
    body: JSON.stringify(buildGuidelinesGistPatch(guidelines)),
  })
}
