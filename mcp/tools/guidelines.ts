import { aggregateGuidelineTargetsByEtfType } from '../../app/features/advice/advice-openai.ts'
import {
	fetchCatalog,
	findCatalogEntryByTicker,
} from '../../app/features/catalog/lib.ts'
import type {
	EtfGuideline,
	EtfType,
	GuidelineKind,
} from '../../app/lib/guidelines.ts'
import {
	ETF_TYPES,
	fetchGuidelinesOrThrow,
	findGuidelineDuplicateOf,
	GUIDELINE_KINDS,
	GUIDELINE_TARGET_PERCENT_MAX,
	GUIDELINE_TARGET_PERCENT_MIN,
	isEtfType,
	saveGuidelinesOrThrow,
	sumGuidelineTargetPercent,
	wouldGuidelineTotalExceedCap,
} from '../../app/lib/guidelines.ts'
import { parseLocaleDecimalString } from '../../app/lib/locale-decimal-input.ts'
import type { GistCredentials } from '../data-gist.ts'
import { resolveDataGistId } from '../data-gist.ts'
import type { McpToolDefinition, McpToolResult } from '../protocol.ts'
import { roundToTwoDecimals } from './rounding.ts'
import { readStringArgument } from './tool-arguments.ts'
import { jsonResult } from './tool-result.ts'

const BUCKET_EXPLANATION =
	'Instrument rows count toward their own asset class: `byAssetClass` folds every row of a type — bucket rows and named funds alike — into one effective target for that class. Do not add a fund target on top of its class target.'

const READ_DESCRIPTION = `Read the user's target allocation: every guideline row, the sum of their targets, and the effective target per asset class.

A guideline is either an asset-class bucket (kind "asset_class", e.g. 40% bond) or a named fund (kind "instrument", identified by its catalog ticker). ${BUCKET_EXPLANATION}

Targets are percentages of the whole portfolio after any planned purchase, not of new cash alone, and they may sum to less than 100%.`

const SET_DESCRIPTION = `Create or update one guideline row: the target percentage for an asset class, or for a named fund by ticker.

Setting an asset class that already has a row, or a ticker that already has one, updates that row's target rather than adding a second — there is one row per asset class and one per ticker. The tool refuses a target that would push the sum of all rows above 100%; lower or delete another row first.

Read, change, and save happen inside this one call. The gist API offers no conditional write, so an edit made elsewhere in between is overwritten rather than merged — the gist keeps it in its revision history, so tell the user to restore it there if that happens. ${BUCKET_EXPLANATION}`

const DELETE_DESCRIPTION = `Delete one guideline row by its id, as reported by get_guidelines. Deleting frees its share of the 100% cap.

Read and save happen inside this one call. The gist API offers no conditional write, so an edit made elsewhere in between is overwritten rather than merged — the gist keeps it in its revision history, so tell the user to restore it there if that happens.`

function guidelineRow(guideline: EtfGuideline) {
	return {
		id: guideline.id,
		kind: guideline.kind,
		etfType: guideline.etfType,
		...(guideline.kind === 'instrument' ? { ticker: guideline.etfName } : {}),
		targetPct: guideline.targetPct,
	}
}

/**
 * The whole target picture in one payload: raw rows plus the aggregated buckets
 * the advice prompt reasons in, so a model never has to fold them itself and
 * double-count a fund against its own asset class.
 */
export function summarizeGuidelines(guidelines: EtfGuideline[]) {
	const totalTargetPct = roundToTwoDecimals(
		sumGuidelineTargetPercent(guidelines),
	)
	const { byType } = aggregateGuidelineTargetsByEtfType(guidelines)
	const byAssetClass = [...byType.entries()]
		.map(([etfType, targetPct]) => ({
			etfType,
			targetPct: roundToTwoDecimals(targetPct),
		}))
		.sort((left, right) => right.targetPct - left.targetPct)

	return {
		guidelineCount: guidelines.length,
		totalTargetPct,
		unallocatedPct: roundToTwoDecimals(100 - totalTargetPct),
		exceedsCap: totalTargetPct > 100,
		guidelines: guidelines.map(guidelineRow),
		byAssetClass,
		note:
			guidelines.length === 0
				? 'No guidelines are set, so the portfolio has no target allocation to compare against.'
				: BUCKET_EXPLANATION,
	}
}

function readGuidelineKind(
	toolArguments: Record<string, unknown>,
): GuidelineKind {
	const kind = readStringArgument(toolArguments, 'kind')
	if (kind === 'asset_class' || kind === 'instrument') return kind
	throw new Error(`"kind" must be one of: ${GUIDELINE_KINDS.join(', ')}.`)
}

/**
 * Models routinely send a number as a string; accept both, reject anything else.
 *
 * A string goes through the same parser the web form uses, so "12,5" and
 * "1 000,5" mean here exactly what they mean when typed into the app.
 */
function readTargetPercent(toolArguments: Record<string, unknown>): number {
	const raw = toolArguments.targetPct
	const value = typeof raw === 'string' ? parseLocaleDecimalString(raw) : raw
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new Error('"targetPct" must be a number of percent, for example 40.')
	}
	if (
		value < GUIDELINE_TARGET_PERCENT_MIN ||
		value > GUIDELINE_TARGET_PERCENT_MAX
	) {
		throw new Error(
			`"targetPct" must be between ${GUIDELINE_TARGET_PERCENT_MIN} and ${GUIDELINE_TARGET_PERCENT_MAX}; got ${value}.`,
		)
	}
	return value
}

function readEtfType(toolArguments: Record<string, unknown>): EtfType | null {
	const raw = readStringArgument(toolArguments, 'etfType')
	if (raw === null) return null
	if (!isEtfType(raw)) {
		throw new Error(
			`"etfType" must be one of: ${ETF_TYPES.join(', ')}; got "${raw}".`,
		)
	}
	return raw
}

type ResolvedInstrument = {
	ticker: string
	etfType: EtfType
	/** False when the shared catalog does not list this ticker (or is not configured). */
	catalogVerified: boolean
}

/**
 * Resolve a named-fund row the way the web app's form does — the catalog
 * supplies the canonical ticker spelling and the asset class.
 *
 * Unlike the form, an unlisted ticker is still accepted when the caller names
 * the asset class: over MCP the shared catalog may not be configured at all,
 * and refusing every ticker in that case would leave instrument guidelines
 * unreachable. The response says which of the two happened.
 */
async function resolveInstrument(params: {
	ticker: string
	requestedEtfType: EtfType | null
}): Promise<ResolvedInstrument> {
	const { ticker, requestedEtfType } = params
	const catalog = await fetchCatalog()
	const match = findCatalogEntryByTicker(catalog, ticker)

	if (match !== undefined) {
		if (requestedEtfType !== null && requestedEtfType !== match.type) {
			throw new Error(
				`The catalog classifies ${match.ticker} as "${match.type}", not "${requestedEtfType}". Omit "etfType" to use the catalog's, or fix it.`,
			)
		}
		return { ticker: match.ticker, etfType: match.type, catalogVerified: true }
	}

	if (requestedEtfType === null) {
		throw new Error(
			`Ticker "${ticker}" is not in the shared catalog, so its asset class is unknown. Pass "etfType" (one of: ${ETF_TYPES.join(', ')}) to set it anyway, or use list_catalog to find the right ticker.`,
		)
	}
	return { ticker, etfType: requestedEtfType, catalogVerified: false }
}

async function buildGuidelineEntry(
	toolArguments: Record<string, unknown>,
): Promise<{ entry: Omit<EtfGuideline, 'id'>; catalogVerified: boolean }> {
	const kind = readGuidelineKind(toolArguments)
	const targetPct = readTargetPercent(toolArguments)
	const requestedEtfType = readEtfType(toolArguments)

	if (kind === 'asset_class') {
		if (requestedEtfType === null) {
			throw new Error(
				`An asset-class guideline needs "etfType" (one of: ${ETF_TYPES.join(', ')}).`,
			)
		}
		return {
			entry: {
				kind,
				etfName: '',
				targetPct,
				etfType: requestedEtfType,
			},
			catalogVerified: true,
		}
	}

	const ticker = readStringArgument(toolArguments, 'ticker')
	if (ticker === null) {
		throw new Error('An instrument guideline needs "ticker".')
	}
	const resolved = await resolveInstrument({ ticker, requestedEtfType })
	return {
		entry: {
			kind,
			etfName: resolved.ticker,
			targetPct,
			etfType: resolved.etfType,
		},
		catalogVerified: resolved.catalogVerified,
	}
}

function describeTarget(guideline: EtfGuideline): string {
	return guideline.kind === 'instrument'
		? guideline.etfName
		: `the ${guideline.etfType} bucket`
}

/**
 * The cap is checked against the rows that will remain, so raising an existing
 * row's target does not count its old value twice.
 */
function assertWithinCap(params: {
	others: EtfGuideline[]
	targetPct: number
}): void {
	const { others, targetPct } = params
	if (
		!wouldGuidelineTotalExceedCap({
			existing: others,
			additionalPercent: targetPct,
		})
	) {
		return
	}
	const othersTotal = roundToTwoDecimals(sumGuidelineTargetPercent(others))
	throw new Error(
		`Target ${targetPct}% would take the total to ${roundToTwoDecimals(othersTotal + targetPct)}%, above the 100% cap. The other guidelines already claim ${othersTotal}%.`,
	)
}

export function createGetGuidelinesTool(
	credentials: GistCredentials,
): McpToolDefinition {
	async function handler(): Promise<McpToolResult> {
		const gistId = await resolveDataGistId(credentials)
		const guidelines = await fetchGuidelinesOrThrow(
			credentials.githubToken,
			gistId,
		)
		return jsonResult(summarizeGuidelines(guidelines))
	}

	return {
		name: 'get_guidelines',
		title: 'Get guidelines',
		description: READ_DESCRIPTION,
		inputSchema: { type: 'object', properties: {} },
		handler,
	}
}

export function createSetGuidelineTool(
	credentials: GistCredentials,
): McpToolDefinition {
	async function handler(
		toolArguments: Record<string, unknown>,
	): Promise<McpToolResult> {
		const { entry, catalogVerified } = await buildGuidelineEntry(toolArguments)
		const gistId = await resolveDataGistId(credentials)
		const current = await fetchGuidelinesOrThrow(
			credentials.githubToken,
			gistId,
		)

		const existing = findGuidelineDuplicateOf(current, {
			...entry,
			id: 'candidate',
		})
		const others =
			existing === null
				? current
				: current.filter((guideline) => guideline.id !== existing.id)
		assertWithinCap({ others, targetPct: entry.targetPct })

		const saved: EtfGuideline =
			existing === null
				? { ...entry, id: crypto.randomUUID() }
				: { ...entry, id: existing.id }
		const next =
			existing === null
				? [saved, ...current]
				: current.map((guideline) =>
						guideline.id === existing.id ? saved : guideline,
					)

		await saveGuidelinesOrThrow(credentials.githubToken, gistId, next)

		return jsonResult({
			action: existing === null ? 'created' : 'updated',
			guideline: guidelineRow(saved),
			...(catalogVerified
				? {}
				: {
						warning: `${saved.etfName} is not in the shared catalog; its asset class was taken from the request, not verified.`,
					}),
			...summarizeGuidelines(next),
		})
	}

	return {
		name: 'set_guideline',
		title: 'Set guideline',
		description: SET_DESCRIPTION,
		inputSchema: {
			type: 'object',
			properties: {
				kind: {
					type: 'string',
					enum: [...GUIDELINE_KINDS],
					description:
						'"asset_class" for a whole bucket, "instrument" for one fund by ticker.',
				},
				etfType: {
					type: 'string',
					enum: [...ETF_TYPES],
					description:
						'Asset class. Required for kind "asset_class"; for an instrument it is taken from the catalog unless the ticker is unlisted.',
				},
				ticker: {
					type: 'string',
					description:
						'Catalog ticker of the fund. Required for kind "instrument", ignored otherwise.',
				},
				targetPct: {
					type: 'number',
					description: `Target share of the whole portfolio, ${GUIDELINE_TARGET_PERCENT_MIN}–${GUIDELINE_TARGET_PERCENT_MAX}.`,
				},
			},
			required: ['kind', 'targetPct'],
		},
		handler,
	}
}

export function createDeleteGuidelineTool(
	credentials: GistCredentials,
): McpToolDefinition {
	async function handler(
		toolArguments: Record<string, unknown>,
	): Promise<McpToolResult> {
		const id = readStringArgument(toolArguments, 'id')
		if (id === null) {
			throw new Error('"id" is required; get_guidelines reports the ids.')
		}

		const gistId = await resolveDataGistId(credentials)
		const current = await fetchGuidelinesOrThrow(
			credentials.githubToken,
			gistId,
		)
		const existing = current.find((guideline) => guideline.id === id)
		if (existing === undefined) {
			throw new Error(
				`No guideline has id "${id}". Call get_guidelines for the current ids.`,
			)
		}

		const next = current.filter((guideline) => guideline.id !== id)
		await saveGuidelinesOrThrow(credentials.githubToken, gistId, next)

		return jsonResult({
			action: 'deleted',
			deleted: guidelineRow(existing),
			deletedDescription: describeTarget(existing),
			...summarizeGuidelines(next),
		})
	}

	return {
		name: 'delete_guideline',
		title: 'Delete guideline',
		description: DELETE_DESCRIPTION,
		inputSchema: {
			type: 'object',
			properties: {
				id: {
					type: 'string',
					description: 'Guideline id, as reported by get_guidelines.',
				},
			},
			required: ['id'],
		},
		handler,
	}
}
