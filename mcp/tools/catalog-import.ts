/**
 * Bulk catalog import from a bank export on the caller's own disk.
 *
 * Deliberately **stdio only**, breaking the rule that both transports expose
 * the same tools: the deployed server cannot see the caller's filesystem, and a
 * DevTools HAR runs to megabytes while the HTTP transport caps a JSON-RPC body
 * at 256 KB. Registered by `mcp/server.ts` alone — see `createAinvestorMcpServer`.
 */
import { readFile, stat } from 'node:fs/promises'

import { extractBankApiJsonFromHar } from '../../app/features/catalog/har-bank-json-adapter.ts'
import type {
	BankJsonImportRowDiagnostics,
	CatalogEntry,
} from '../../app/features/catalog/lib.ts'
import {
	mergeBankIntoCatalog,
	parseBankJsonForImport,
	saveCatalog,
} from '../../app/features/catalog/lib.ts'
import { MULTIPART_MAX_FILE_BYTES } from '../../app/lib/multipart-upload-limits.ts'
import type { GistCredentials } from '../data-gist.ts'
import type { McpToolDefinition, McpToolResult } from '../protocol.ts'
import { loadCatalogForWrite } from './catalog.ts'
import { jsonResult } from './tool-result.ts'

/** A long import must not push its own rows out of the model's context. */
const MAX_REPORTED_DIAGNOSTICS = 20

const DESCRIPTION = `Refresh the shared ETF catalog from a bank export saved on this machine: either the API's JSON response, or a DevTools HAR recorded while browsing the broker's fund screener.

Reads a local file, so it exists only when the server runs locally over stdio. Rows are matched by ISIN plus ticker: a fund already in the catalog is refreshed, a new one is added, and nothing is removed. Pass dryRun: true first to see what would change without writing.

The catalog is one public gist shared by every user of the app, and only its owner may write to it. Saving replaces the whole file, so an import running in the web app at the same time is overwritten rather than merged; the gist keeps every write as a revision.`

/** Trims diagnostics to something a model can read, keeping the count honest. */
function reportDiagnostics(rows: BankJsonImportRowDiagnostics[]) {
	return {
		count: rows.length,
		rows: rows.slice(0, MAX_REPORTED_DIAGNOSTICS).map((row) => ({
			index: row.index,
			label: row.label,
			issues: row.issues.map((issue) => issue.kind),
		})),
		...(rows.length > MAX_REPORTED_DIAGNOSTICS
			? {
					note: `Showing the first ${MAX_REPORTED_DIAGNOSTICS} of ${rows.length}.`,
				}
			: {}),
	}
}

/** A HAR wraps the payload in `log.entries`; a raw API response is already it. */
function bankPayloadFrom(parsed: unknown): unknown {
	const extracted = extractBankApiJsonFromHar(parsed)
	return extracted.ok ? extracted.payload : parsed
}

async function readBankExportFile(filePath: string): Promise<unknown> {
	const stats = await stat(filePath).catch(() => null)
	if (stats === null || !stats.isFile()) {
		throw new Error(`No file at "${filePath}".`)
	}
	if (stats.size > MULTIPART_MAX_FILE_BYTES) {
		throw new Error(
			`"${filePath}" is ${Math.round(stats.size / 1024 / 1024)} MB; the importer accepts up to ${MULTIPART_MAX_FILE_BYTES / 1024 / 1024} MB, the same ceiling the web app applies. Record a narrower HAR, or export the API response on its own.`,
		)
	}

	const text = await readFile(filePath, 'utf8')
	try {
		return JSON.parse(text)
	} catch {
		throw new Error(
			`"${filePath}" is not valid JSON. Expected the bank API's JSON response or a DevTools HAR export.`,
		)
	}
}

/** Maps the parser's structural verdict to something actionable. */
function structuralIssueMessage(issue: 'notObject' | 'dataNotArray'): string {
	return issue === 'notObject'
		? 'The file does not contain a bank API response object. A HAR must include the fund screener request; a raw export must be the JSON object the API returned.'
		: 'The bank payload has no `data` array, so there are no rows to import.'
}

export function createImportCatalogFromBankFileTool(
	credentials: GistCredentials,
): McpToolDefinition {
	async function handler(
		toolArguments: Record<string, unknown>,
	): Promise<McpToolResult> {
		const filePath =
			typeof toolArguments.filePath === 'string'
				? toolArguments.filePath.trim()
				: ''
		if (filePath.length === 0) {
			throw new Error('"filePath" is required.')
		}
		const dryRun = toolArguments.dryRun === true

		// Ownership is checked before the file is read: a caller who cannot write
		// should not learn whether a path exists on the machine either.
		const entries = await loadCatalogForWrite(credentials)
		const parsed = await readBankExportFile(filePath)
		const parseResult = parseBankJsonForImport(bankPayloadFrom(parsed), entries)

		if (parseResult.structuralIssue !== null) {
			throw new Error(structuralIssueMessage(parseResult.structuralIssue))
		}
		if (parseResult.entries.length === 0) {
			throw new Error(
				`None of the ${parseResult.expectedDataRows} row(s) in the file could be imported. ${JSON.stringify(reportDiagnostics(parseResult.skippedRowDiagnostics))}`,
			)
		}

		const next: CatalogEntry[] = mergeBankIntoCatalog(
			entries,
			parseResult.entries,
		)
		if (!dryRun) {
			await saveCatalog({ token: credentials.githubToken, entries: next })
		}

		return jsonResult({
			action: dryRun ? 'previewed' : 'imported',
			appliedRows: parseResult.entries.length,
			rowsInFile: parseResult.expectedDataRows,
			catalogSizeBefore: entries.length,
			catalogSizeAfter: next.length,
			added: next.length - entries.length,
			refreshed: parseResult.entries.length - (next.length - entries.length),
			skipped: reportDiagnostics(parseResult.skippedRowDiagnostics),
			notes: reportDiagnostics(parseResult.noteRowDiagnostics),
			...(dryRun
				? { note: 'Nothing was saved; call again without dryRun to apply.' }
				: {}),
		})
	}

	return {
		name: 'import_catalog_from_bank_file',
		title: 'Import catalog from bank export',
		description: DESCRIPTION,
		inputSchema: {
			type: 'object',
			properties: {
				filePath: {
					type: 'string',
					description:
						'Absolute path to the bank API JSON response or a DevTools HAR export on this machine.',
				},
				dryRun: {
					type: 'boolean',
					description:
						'When true, report what the import would change without saving. Default false.',
				},
			},
			required: ['filePath'],
		},
		handler,
	}
}
