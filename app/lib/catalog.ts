import type { EtfType } from './guidelines.ts'

export const CATALOG_FILENAME = 'catalog.json'

export type CatalogEntry = {
  id: string
  ticker: string
  name: string
  type: EtfType
  description: string
  isin?: string
}

const ETF_TYPES: EtfType[] = ['equity', 'bond', 'real_estate', 'commodity', 'mixed', 'money_market']

function normaliseType(raw: string): EtfType {
  const lower = raw.toLowerCase().replace(/[\s-]/g, '_')
  return ETF_TYPES.includes(lower as EtfType) ? (lower as EtfType) : 'equity'
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

/** Split a single CSV line respecting double-quoted fields. */
export function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

/**
 * Parse CSV text into CatalogEntry objects.
 *
 * Expected columns (case-insensitive, order flexible):
 *   ticker / symbol / code
 *   name / fund name / etf name
 *   type / asset class / category      (optional, defaults to "equity")
 *   description / desc / notes         (optional)
 *   isin / isin code                   (optional)
 */
export function parseCsvToCatalog(csvText: string): CatalogEntry[] {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) return []

  const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, ' '))

  const colIndex = (aliases: string[]): number => {
    for (const alias of aliases) {
      const idx = headers.indexOf(alias)
      if (idx !== -1) return idx
    }
    return -1
  }

  const tickerCol = colIndex(['ticker', 'symbol', 'code'])
  const nameCol = colIndex(['name', 'fund name', 'etf name'])
  const typeCol = colIndex(['type', 'asset class', 'category'])
  const descCol = colIndex(['description', 'desc', 'notes'])
  const isinCol = colIndex(['isin', 'isin code'])

  if (tickerCol === -1 || nameCol === -1) return []

  const entries: CatalogEntry[] = []

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line)
    const ticker = cols[tickerCol] ?? ''
    const name = cols[nameCol] ?? ''

    if (!ticker || !name) continue

    const rawType = typeCol !== -1 ? (cols[typeCol] ?? '') : ''
    const description = descCol !== -1 ? (cols[descCol] ?? '') : ''
    const isin = isinCol !== -1 ? (cols[isinCol] ?? '') : undefined

    entries.push({
      id: crypto.randomUUID(),
      ticker: ticker.toUpperCase(),
      name,
      type: normaliseType(rawType),
      description,
      ...(isin ? { isin } : {}),
    })
  }

  return entries
}

// ---------------------------------------------------------------------------
// Gist helpers
// ---------------------------------------------------------------------------

type GistFile = {
  content: string | null
}

type GistPayload = {
  files: Record<string, GistFile>
}

/** Parse catalog entries from a raw GitHub Gist API response object. */
export function parseCatalogFromGist(gist: GistPayload): CatalogEntry[] {
  const file = gist.files[CATALOG_FILENAME]
  if (!file || !file.content) return []
  try {
    const parsed = JSON.parse(file.content)
    return Array.isArray(parsed) ? (parsed as CatalogEntry[]) : []
  } catch {
    return []
  }
}

/** Build a PATCH-ready body to update the catalog file in a gist. */
export function buildCatalogGistPatch(entries: CatalogEntry[]): {
  files: Record<string, { content: string }>
} {
  return {
    files: {
      [CATALOG_FILENAME]: {
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

/** Fetch catalog entries from an existing gist by ID. */
export async function fetchCatalog(
  token: string,
  gistId: string,
): Promise<CatalogEntry[]> {
  const res = await fetch(`${GITHUB_API}/gists/${gistId}`, {
    headers: githubHeaders(token),
  })
  if (!res.ok) return []
  const gist = (await res.json()) as GistPayload
  return parseCatalogFromGist(gist)
}

/** Save catalog entries to an existing gist by ID. */
export async function saveCatalog(
  token: string,
  gistId: string,
  entries: CatalogEntry[],
): Promise<void> {
  await fetch(`${GITHUB_API}/gists/${gistId}`, {
    method: 'PATCH',
    headers: githubHeaders(token),
    body: JSON.stringify(buildCatalogGistPatch(entries)),
  })
}
