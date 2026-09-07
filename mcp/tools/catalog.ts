import type {
	CatalogEntry,
	CatalogEntryValidationIssue,
} from '../../app/features/catalog/lib.ts'
import {
	catalogEntryMatchesQuery,
	deriveCatalogEntryId,
	fetchCatalog,
	fetchSharedCatalogSnapshot,
	findCatalogEntryByTicker,
	isSharedCatalogAdmin,
	saveCatalog,
	validateCatalogEntry,
} from '../../app/features/catalog/lib.ts'
import type { EtfType } from '../../app/lib/guidelines.ts'
import { ETF_TYPES, isEtfType } from '../../app/lib/guidelines.ts'
import { resolveCallerLogin } from '../approved-caller.ts'
import type { GistCredentials } from '../data-gist.ts'
import type { McpToolDefinition, McpToolResult } from '../protocol.ts'
import { readStringArgument } from './tool-arguments.ts'
import { jsonResult } from './tool-result.ts'

/** Enough rows to choose from without flooding the context. */
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

/**
 * The catalog is a broker snapshot in Polish, and several of its numeric-looking
 * fields are formatted strings. Say so in every description that hands them
 * over, or a model will happily compare "0,35%" with "0,1%" as text.
 */
const FIELD_CAVEAT =
	'The catalog is a snapshot imported from a bank, not live quotes, and its text is Polish. Only `risk_kid` (1-7) and `rate_of_return` are numbers; `expense_ratio`, `volatility`, `return_risk` and `fund_size` are display strings such as "0,35%" or "166 mln USD", so they cannot be compared or sorted numerically without parsing them first.'

const LIST_DESCRIPTION = `Search the shared ETF catalog — the funds this app knows about — by ticker, name or description, returning a compact row per match.

This is the only source of valid tickers: a fund that is not here cannot be referenced by set_guideline as an instrument, and proposing one the catalog does not list means proposing something the user may not be able to buy. Use get_catalog_entry for the full record of a single fund.

${FIELD_CAVEAT}`

const ENTRY_DESCRIPTION = `Read one catalog entry in full, by ticker or by id. Every field is returned, including ISIN, cost, risk and ESG when the import supplied them.

${FIELD_CAVEAT}`

const WRITE_CAVEAT =
	'The catalog is one public gist shared by every user of the app, and only its owner may write to it — a write from anyone else is refused. Saving replaces the whole file with what this call read a moment earlier, so an import running in the web app in between is overwritten rather than merged; the gist keeps every write as a revision, so tell the user to restore it there if that happens.'

const UPSERT_DESCRIPTION = `Add a fund to the shared catalog, or update the fields of one already in it.

The row is found by ticker. An existing row keeps its id and every field this call does not mention — including isin, so it never needs repeating on a later update that only touches something else. A new row needs at least a ticker, a name and a type.

The resulting row is checked the same way a bank import checks one: isin, if set, must be a valid 12-character ISIN, and risk_kid, if set, must be a whole number from 1 to 7. A row that fails either check is refused rather than saved.

${WRITE_CAVEAT}`

const DELETE_DESCRIPTION = `Remove one fund from the shared catalog, by ticker or by id.

Removing a fund does not touch anyone's holdings or guidelines, but a guideline naming that ticker will no longer resolve against the catalog.

${WRITE_CAVEAT}`

/** What a search returns per row: enough to choose, not the whole record. */
function compactRow(entry: CatalogEntry) {
	return {
		id: entry.id,
		ticker: entry.ticker,
		name: entry.name,
		type: entry.type,
		...(entry.expense_ratio === undefined
			? {}
			: { expense_ratio: entry.expense_ratio }),
		...(entry.risk_kid === undefined ? {} : { risk_kid: entry.risk_kid }),
	}
}

/**
 * A truncated list must never read as the whole catalog: `matched` and
 * `truncated` are what stop a model concluding the catalog holds no bond funds
 * when it simply stopped reading at the limit.
 */
export function summarizeCatalogSearch(params: {
	catalog: CatalogEntry[]
	query: string
	limit: number
}) {
	const { catalog, query, limit } = params
	const matches = catalog.filter((entry) =>
		catalogEntryMatchesQuery(entry, query),
	)
	const returned = matches.slice(0, limit)
	return {
		catalogSize: catalog.length,
		matched: matches.length,
		returned: returned.length,
		truncated: matches.length > returned.length,
		...(query.trim().length === 0 ? {} : { query: query.trim() }),
		entries: returned.map(compactRow),
		...(matches.length > returned.length
			? {
					note: `Showing ${returned.length} of ${matches.length} matches; narrow the query or raise "limit" (max ${MAX_LIMIT}) to see the rest.`,
				}
			: {}),
	}
}

function readLimit(toolArguments: Record<string, unknown>): number {
	const raw = toolArguments.limit
	if (raw === undefined || raw === null) return DEFAULT_LIMIT
	const value = typeof raw === 'string' ? Number(raw.trim()) : raw
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
		throw new Error(`"limit" must be a positive number, up to ${MAX_LIMIT}.`)
	}
	return Math.min(Math.floor(value), MAX_LIMIT)
}

/** Locates one entry the way a caller names it: by ticker, or by exact id. */
function findEntry(params: {
	catalog: CatalogEntry[]
	ticker: string | null
	id: string | null
}): CatalogEntry | undefined {
	const { catalog, ticker, id } = params
	if (id !== null) {
		const byId = catalog.find((entry) => entry.id === id)
		if (byId !== undefined) return byId
	}
	if (ticker !== null) return findCatalogEntryByTicker(catalog, ticker)
	return undefined
}

function requireTickerOrId(toolArguments: Record<string, unknown>): {
	ticker: string | null
	id: string | null
} {
	const ticker = readStringArgument(toolArguments, 'ticker')
	const id = readStringArgument(toolArguments, 'id')
	if (ticker === null && id === null) {
		throw new Error('Pass either "ticker" or "id".')
	}
	return { ticker, id }
}

/**
 * Loads the catalog together with its owner, and refuses a caller who is not
 * that owner.
 *
 * GitHub would refuse the write anyway — a PATCH to someone else's gist is a
 * 404 — but that surfaces as a bare status code. Checking first lets the tool
 * name both logins, which is the only way the caller can tell a wrong token
 * from a wrong deployment.
 */
export async function loadCatalogForWrite(
	credentials: GistCredentials,
): Promise<CatalogEntry[]> {
	const [{ entries, ownerLogin }, callerLogin] = await Promise.all([
		fetchSharedCatalogSnapshot(),
		resolveCallerLogin(credentials.githubToken),
	])
	if (callerLogin === null) {
		throw new Error(
			'GitHub would not resolve this token to an account (401), so catalog ownership cannot be checked.',
		)
	}
	if (!isSharedCatalogAdmin({ sessionLogin: callerLogin, ownerLogin })) {
		throw new Error(
			`The shared catalog belongs to ${ownerLogin ?? 'an unknown account'}, and this token belongs to ${callerLogin}. Only the catalog's owner can change it.`,
		)
	}
	return entries
}

export function createListCatalogTool(): McpToolDefinition {
	async function handler(
		toolArguments: Record<string, unknown>,
	): Promise<McpToolResult> {
		const query = readStringArgument(toolArguments, 'query') ?? ''
		const limit = readLimit(toolArguments)
		const catalog = await fetchCatalog()
		return jsonResult(summarizeCatalogSearch({ catalog, query, limit }))
	}

	return {
		name: 'list_catalog',
		title: 'Search catalog',
		description: LIST_DESCRIPTION,
		inputSchema: {
			type: 'object',
			properties: {
				query: {
					type: 'string',
					description:
						'Free text matched against ticker, name and description. Omit to list from the top.',
				},
				limit: {
					type: 'number',
					description: `How many rows to return (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`,
				},
			},
		},
		handler,
	}
}

export function createGetCatalogEntryTool(): McpToolDefinition {
	async function handler(
		toolArguments: Record<string, unknown>,
	): Promise<McpToolResult> {
		const { ticker, id } = requireTickerOrId(toolArguments)
		const catalog = await fetchCatalog()
		const entry = findEntry({ catalog, ticker, id })
		if (entry === undefined) {
			throw new Error(
				`No catalog entry matches ${id === null ? `ticker "${ticker}"` : `id "${id}"`}. Use list_catalog to find the right one.`,
			)
		}
		return jsonResult(entry)
	}

	return {
		name: 'get_catalog_entry',
		title: 'Get catalog entry',
		description: ENTRY_DESCRIPTION,
		inputSchema: {
			type: 'object',
			properties: {
				ticker: {
					type: 'string',
					description: 'Fund ticker; case and spacing are normalised.',
				},
				id: {
					type: 'string',
					description: 'Catalog id, as reported by list_catalog.',
				},
			},
		},
		handler,
	}
}

/** Optional catalog fields, in the shape `CatalogEntry` stores them. */
function readOptionalEntryFields(toolArguments: Record<string, unknown>) {
	const numberField = (name: 'risk_kid' | 'rate_of_return') => {
		const raw = toolArguments[name]
		if (raw === undefined || raw === null) return {}
		const value = typeof raw === 'string' ? Number(raw.trim()) : raw
		if (typeof value !== 'number' || !Number.isFinite(value)) {
			throw new Error(`"${name}" must be a number.`)
		}
		return { [name]: value }
	}
	const stringField = (
		name: 'isin' | 'expense_ratio' | 'region' | 'sector' | 'volatility',
	) => {
		const value = readStringArgument(toolArguments, name)
		return value === null ? {} : { [name]: value }
	}
	const esg = toolArguments.esg
	return {
		...stringField('isin'),
		...stringField('expense_ratio'),
		...stringField('region'),
		...stringField('sector'),
		...stringField('volatility'),
		...numberField('risk_kid'),
		...numberField('rate_of_return'),
		...(typeof toolArguments.return_risk === 'string'
			? { return_risk: toolArguments.return_risk.trim() }
			: {}),
		...(typeof toolArguments.fund_size === 'string'
			? { fund_size: toolArguments.fund_size.trim() }
			: {}),
		...(typeof esg === 'boolean' ? { esg } : {}),
	}
}

function readEtfTypeArgument(
	toolArguments: Record<string, unknown>,
): EtfType | null {
	const raw = readStringArgument(toolArguments, 'type')
	if (raw === null) return null
	if (!isEtfType(raw)) {
		throw new Error(`"type" must be one of: ${ETF_TYPES.join(', ')}.`)
	}
	return raw
}

/** English wording for MCP tool errors — validateCatalogEntry's issues are generic strings. */
function describeCatalogEntryValidationIssue(
	issue: CatalogEntryValidationIssue,
): string {
	switch (issue) {
		case 'missingTicker':
			return '"ticker" is required'
		case 'missingName':
			return '"name" is required'
		case 'isinInvalid':
			return '"isin" is not a valid ISIN (expected 12-character format)'
		case 'riskKidOutOfRange':
			return '"risk_kid" must be a whole number from 1 to 7'
	}
}

export function createUpsertCatalogEntryTool(
	credentials: GistCredentials,
): McpToolDefinition {
	async function handler(
		toolArguments: Record<string, unknown>,
	): Promise<McpToolResult> {
		const ticker = readStringArgument(toolArguments, 'ticker')
		if (ticker === null) throw new Error('"ticker" is required.')
		const name = readStringArgument(toolArguments, 'name')
		const type = readEtfTypeArgument(toolArguments)
		const optionalFields = readOptionalEntryFields(toolArguments)

		const entries = await loadCatalogForWrite(credentials)
		const existing = findCatalogEntryByTicker(entries, ticker)

		if (existing === undefined && (name === null || type === null)) {
			throw new Error(
				`${ticker} is not in the catalog yet, so "name" and "type" are required to add it.`,
			)
		}

		// Only the fields this call names are sent, so spreading them onto
		// `existing` last keeps every field the call did not mention — including
		// `isin`, which must NOT be dropped here. `mergeBankIntoCatalog` matches
		// rows by an ISIN-qualified key, so an update that omits `isin` (the
		// normal case) would not match its own existing row and would append a
		// second one under the same id instead of updating it. Merging directly
		// by id, as done below, sidesteps that key entirely.
		const changes: CatalogEntry = {
			id:
				existing?.id ??
				deriveCatalogEntryId({
					ticker,
					isin: readStringArgument(toolArguments, 'isin') ?? undefined,
				}),
			ticker: existing?.ticker ?? ticker.toUpperCase(),
			name: name ?? existing?.name ?? '',
			type: type ?? existing?.type ?? 'equity',
			description:
				readStringArgument(toolArguments, 'description') ??
				existing?.description ??
				'',
			...optionalFields,
		}
		const merged: CatalogEntry =
			existing === undefined ? changes : { ...existing, ...changes }

		// Same gate a bank import row has to pass — see validateCatalogEntry.
		// A caller-supplied value goes in exactly like a bank one would: neither
		// gets to write something the other could not.
		const issues = validateCatalogEntry(merged)
		if (issues.length > 0) {
			throw new Error(
				`Invalid catalog entry: ${issues.map(describeCatalogEntryValidationIssue).join('; ')}.`,
			)
		}

		const next =
			existing === undefined
				? [merged, ...entries]
				: entries.map((entry) => (entry.id === existing.id ? merged : entry))
		await saveCatalog({ token: credentials.githubToken, entries: next })

		return jsonResult({
			action: existing === undefined ? 'created' : 'updated',
			entry: merged,
			catalogSize: next.length,
		})
	}

	return {
		name: 'upsert_catalog_entry',
		title: 'Add or update catalog entry',
		description: UPSERT_DESCRIPTION,
		inputSchema: {
			type: 'object',
			properties: {
				ticker: { type: 'string', description: 'Fund ticker. Required.' },
				name: {
					type: 'string',
					description: 'Fund name. Required when adding a new fund.',
				},
				type: {
					type: 'string',
					enum: [...ETF_TYPES],
					description: 'Asset class. Required when adding a new fund.',
				},
				description: { type: 'string', description: 'Free-text description.' },
				isin: {
					type: 'string',
					description:
						'ISIN, stored on the row. Used together with the ticker when a brand-new row needs an id; has no effect on an existing row, which keeps its own id.',
				},
				expense_ratio: {
					type: 'string',
					description: 'Ongoing charge as displayed, e.g. "0,35%".',
				},
				risk_kid: { type: 'number', description: 'PRIIPs KID risk, 1-7.' },
				region: { type: 'string', description: 'Region, e.g. "Świat".' },
				sector: { type: 'string', description: 'Sector, e.g. "technologia".' },
				rate_of_return: {
					type: 'number',
					description: 'Annual rate of return in percent.',
				},
				volatility: { type: 'string', description: 'Volatility as displayed.' },
				return_risk: {
					type: 'string',
					description: 'Return/risk ratio as displayed.',
				},
				fund_size: {
					type: 'string',
					description: 'Fund size as displayed, e.g. "166 mln USD".',
				},
				esg: { type: 'boolean', description: 'Whether the fund is ESG.' },
			},
			required: ['ticker'],
		},
		handler,
	}
}

export function createDeleteCatalogEntryTool(
	credentials: GistCredentials,
): McpToolDefinition {
	async function handler(
		toolArguments: Record<string, unknown>,
	): Promise<McpToolResult> {
		const { ticker, id } = requireTickerOrId(toolArguments)
		const entries = await loadCatalogForWrite(credentials)
		const existing = findEntry({ catalog: entries, ticker, id })
		if (existing === undefined) {
			throw new Error(
				`No catalog entry matches ${id === null ? `ticker "${ticker}"` : `id "${id}"`}; nothing was removed.`,
			)
		}

		const next = entries.filter((entry) => entry.id !== existing.id)
		await saveCatalog({ token: credentials.githubToken, entries: next })

		return jsonResult({
			action: 'deleted',
			deleted: compactRow(existing),
			catalogSize: next.length,
		})
	}

	return {
		name: 'delete_catalog_entry',
		title: 'Delete catalog entry',
		description: DELETE_DESCRIPTION,
		inputSchema: {
			type: 'object',
			properties: {
				ticker: { type: 'string', description: 'Fund ticker.' },
				id: {
					type: 'string',
					description: 'Catalog id, as reported by list_catalog.',
				},
			},
		},
		handler,
	}
}
