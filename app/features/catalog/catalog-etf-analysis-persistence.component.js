import { addEventListeners, clientEntry, createElement } from 'remix/component'
import {
	readCatalogEtfAnalysisRecord,
	writeCatalogEtfAnalysisSnapshot,
} from '../../lib/client-analysis-storage.js'

const OUTPUT_SELECTOR = '#catalog-etf-analysis-output'
const FORM_ATTR = 'data-catalog-etf-analysis-form'

function readScopePathFromMain() {
	const main = document.querySelector('main[data-catalog-entry-scope]')
	if (!(main instanceof HTMLElement)) return null
	const path = main.getAttribute('data-catalog-entry-scope')
	return typeof path === 'string' && path.length > 0 ? path : null
}

function applyStoredCatalogAnalysis(scopePath) {
	const record = readCatalogEtfAnalysisRecord()
	if (record == null) return
	if (typeof record.scopePath !== 'string' || record.scopePath !== scopePath)
		return
	if (
		typeof record.analysisText !== 'string' ||
		record.analysisText.trim() === ''
	)
		return

	const output = document.querySelector(OUTPUT_SELECTOR)
	const form = document.querySelector(`form[${FORM_ATTR}]`)
	if (!(output instanceof HTMLElement) || !(form instanceof HTMLFormElement))
		return

	output.textContent = record.analysisText
	output.classList.remove('hidden')
	form.classList.add('hidden')
}

export const CatalogEtfAnalysisPersistence = clientEntry(
	'/features/catalog/catalog-etf-analysis-persistence.component.js#CatalogEtfAnalysisPersistence',
	function CatalogEtfAnalysisPersistence(handle) {
		if (typeof document !== 'undefined') {
			const sync = () => {
				const scopePath = readScopePathFromMain()
				if (scopePath !== null) {
					applyStoredCatalogAnalysis(scopePath)
				}
			}
			sync()
			addEventListeners(document, handle.signal, {
				'rmx-catalog-etf-analysis-saved': sync,
			})
		}

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'catalog-etf-analysis-persistence',
			})
	},
)

export function dispatchCatalogEtfAnalysisSaved(scopePath, analysisText) {
	writeCatalogEtfAnalysisSnapshot({ scopePath, analysisText })
	document.dispatchEvent(
		new CustomEvent('rmx-catalog-etf-analysis-saved', {
			detail: { scopePath, analysisText },
		}),
	)
}
