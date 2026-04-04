/** Browser-only: latest AI analysis snapshot (advice page or catalog ETF detail). */

export const CLIENT_ANALYSIS_STORAGE_VERSION = 1
export const CLIENT_ANALYSIS_STORAGE_KEY = 'etf-portfolio:v1:lastClientAnalysis'

/**
 * @param {unknown} value
 * @returns {string | undefined}
 */
function asNonEmptyString(value) {
	return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * @returns {Record<string, unknown> | null}
 */
export function readClientAnalysisRecord() {
	if (typeof localStorage === 'undefined') return null
	try {
		const raw = localStorage.getItem(CLIENT_ANALYSIS_STORAGE_KEY)
		if (raw == null || raw === '') return null
		const parsed = JSON.parse(raw)
		if (parsed == null || typeof parsed !== 'object') return null
		if (parsed.version !== CLIENT_ANALYSIS_STORAGE_VERSION) return null
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
 *   resultCardHtml: string
 * }} payload
 */
export function writeAdviceAnalysisSnapshot(payload) {
	if (typeof localStorage === 'undefined') return
	try {
		const record = {
			kind: 'advice',
			version: CLIENT_ANALYSIS_STORAGE_VERSION,
			savedAt: Date.now(),
			pathname: payload.pathname,
			search: payload.search,
			lastAnalysisMode: payload.lastAnalysisMode,
			cashAmount: asNonEmptyString(payload.cashAmount),
			cashCurrency: asNonEmptyString(payload.cashCurrency),
			selectedModel: asNonEmptyString(payload.selectedModel),
			resultCardHtml: payload.resultCardHtml,
		}
		localStorage.setItem(CLIENT_ANALYSIS_STORAGE_KEY, JSON.stringify(record))
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
			kind: 'catalog_etf',
			version: CLIENT_ANALYSIS_STORAGE_VERSION,
			savedAt: Date.now(),
			scopePath: payload.scopePath,
			analysisText: payload.analysisText,
		}
		localStorage.setItem(CLIENT_ANALYSIS_STORAGE_KEY, JSON.stringify(record))
	} catch (err) {
		console.warn(
			'[client-analysis-storage] failed to save catalog ETF snapshot',
			err,
		)
	}
}
