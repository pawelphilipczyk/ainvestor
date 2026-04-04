/** Browser-only: scoped localStorage snapshots for advice and catalog ETF analysis. */

import { validateAdviceDocumentForClientStorage } from './advice-document-storage-validation.js'

export const CLIENT_ANALYSIS_STORAGE_VERSION = 1

/** 24 hours — refuse stale restores (PR review). */
export const CLIENT_ANALYSIS_TTL_MS = 24 * 60 * 60 * 1000

const KEY_PREFIX = 'etf-portfolio:v1'

/**
 * @returns {{ login?: string; guest?: boolean } | null}
 */
export function readClientScope() {
	if (typeof document === 'undefined') return null
	const el = document.getElementById('ui-client-scope')
	if (!el?.textContent) return null
	try {
		const parsed = JSON.parse(el.textContent)
		if (parsed == null || typeof parsed !== 'object') return null
		return parsed
	} catch {
		return null
	}
}

/**
 * @returns {string}
 */
export function getClientAnalysisScopePrefix() {
	const scope = readClientScope()
	if (
		scope?.login &&
		typeof scope.login === 'string' &&
		scope.login.length > 0
	) {
		return `${KEY_PREFIX}:u:${encodeURIComponent(scope.login)}`
	}
	return `${KEY_PREFIX}:guest`
}

/**
 * @returns {string}
 */
export function getAdviceAnalysisStorageKey() {
	return `${getClientAnalysisScopePrefix()}:lastAdviceAnalysis`
}

/**
 * @returns {string}
 */
export function getCatalogEtfAnalysisStorageKey() {
	return `${getClientAnalysisScopePrefix()}:lastCatalogEtfAnalysis`
}

/**
 * @param {unknown} record
 * @returns {boolean}
 */
function isFreshRecord(record) {
	if (record == null || typeof record !== 'object') return false
	const savedAt = /** @type {{ savedAt?: unknown }} */ (record).savedAt
	return (
		typeof savedAt === 'number' &&
		Date.now() - savedAt <= CLIENT_ANALYSIS_TTL_MS
	)
}

/**
 * @returns {Record<string, unknown> | null}
 */
export function readAdviceAnalysisRecord() {
	if (typeof localStorage === 'undefined') return null
	try {
		const raw = localStorage.getItem(getAdviceAnalysisStorageKey())
		if (raw == null || raw === '') return null
		const parsed = JSON.parse(raw)
		if (parsed == null || typeof parsed !== 'object') return null
		if (parsed.version !== CLIENT_ANALYSIS_STORAGE_VERSION) return null
		if (!isFreshRecord(parsed)) return null
		return parsed
	} catch {
		return null
	}
}

/**
 * @returns {Record<string, unknown> | null}
 */
export function readCatalogEtfAnalysisRecord() {
	if (typeof localStorage === 'undefined') return null
	try {
		const raw = localStorage.getItem(getCatalogEtfAnalysisStorageKey())
		if (raw == null || raw === '') return null
		const parsed = JSON.parse(raw)
		if (parsed == null || typeof parsed !== 'object') return null
		if (parsed.version !== CLIENT_ANALYSIS_STORAGE_VERSION) return null
		if (!isFreshRecord(parsed)) return null
		return parsed
	} catch {
		return null
	}
}

/**
 * @param {{
 *   pathname: string
 *   search: string
 *   lastAnalysisMode: string
 *   cashAmount?: string
 *   cashCurrency?: string
 *   selectedModel?: string
 *   adviceDocument: unknown
 * }} payload
 */
export function writeAdviceAnalysisSnapshot(payload) {
	if (typeof localStorage === 'undefined') return
	const doc = validateAdviceDocumentForClientStorage(payload.adviceDocument)
	if (doc == null) return
	try {
		const record = {
			version: CLIENT_ANALYSIS_STORAGE_VERSION,
			savedAt: Date.now(),
			pathname: payload.pathname,
			search: payload.search,
			lastAnalysisMode: payload.lastAnalysisMode,
			cashAmount:
				typeof payload.cashAmount === 'string' && payload.cashAmount.length > 0
					? payload.cashAmount
					: undefined,
			cashCurrency:
				typeof payload.cashCurrency === 'string' &&
				payload.cashCurrency.length > 0
					? payload.cashCurrency
					: 'PLN',
			selectedModel:
				typeof payload.selectedModel === 'string' &&
				payload.selectedModel.length > 0
					? payload.selectedModel
					: undefined,
			adviceDocument: doc,
		}
		localStorage.setItem(getAdviceAnalysisStorageKey(), JSON.stringify(record))
	} catch (err) {
		console.warn(
			'[client-analysis-storage] failed to save advice snapshot',
			err,
		)
	}
}

/**
 * @param {{ scopePath: string; analysisText: string }} payload
 */
export function writeCatalogEtfAnalysisSnapshot(payload) {
	if (typeof localStorage === 'undefined') return
	try {
		const record = {
			version: CLIENT_ANALYSIS_STORAGE_VERSION,
			savedAt: Date.now(),
			scopePath: payload.scopePath,
			analysisText: payload.analysisText,
		}
		localStorage.setItem(
			getCatalogEtfAnalysisStorageKey(),
			JSON.stringify(record),
		)
	} catch (err) {
		console.warn(
			'[client-analysis-storage] failed to save catalog ETF snapshot',
			err,
		)
	}
}
