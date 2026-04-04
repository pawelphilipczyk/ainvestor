import { addEventListeners, clientEntry, createElement } from 'remix/component'
import {
	readClientAnalysisRecord,
	writeAdviceAnalysisSnapshot,
} from '../../lib/client-analysis-storage.js'

const RESULT_ID = 'advice-last-result'
const RESTORE_TARGET_ID = 'advice-client-restored'

function normalizeAdviceTabFromSearch(search) {
	const normalized =
		typeof search === 'string' && search.startsWith('?')
			? search.slice(1)
			: typeof search === 'string'
				? search
				: ''
	const tab = new URLSearchParams(normalized).get('tab')
	return tab === 'portfolio_review' ? 'portfolio_review' : 'buy_next'
}

function persistAdviceResultIfPresent() {
	const card = document.getElementById(RESULT_ID)
	if (!(card instanceof HTMLElement)) return
	if (card.innerHTML.trim() === '') return

	const pathname = window.location.pathname
	const search = window.location.search
	const rawMode = card.dataset.lastAnalysisMode
	const lastAnalysisMode =
		rawMode === 'portfolio_review' || rawMode === 'buy_next'
			? rawMode
			: 'buy_next'
	const cashAmount = card.dataset.cashAmount
	const cashCurrency = card.dataset.cashCurrency
	const selectedModel = card.dataset.selectedModel

	writeAdviceAnalysisSnapshot({
		pathname,
		search,
		lastAnalysisMode,
		cashAmount,
		cashCurrency,
		selectedModel,
		resultCardHtml: card.outerHTML,
	})
}

function restoreAdviceFromStorage() {
	const serverCard = document.getElementById(RESULT_ID)
	if (serverCard instanceof HTMLElement) {
		const target = document.getElementById(RESTORE_TARGET_ID)
		if (target instanceof HTMLElement) {
			target.innerHTML = ''
			target.classList.add('hidden')
		}
		return
	}

	const record = readClientAnalysisRecord()
	if (record == null || record.kind !== 'advice') return
	if (
		typeof record.pathname !== 'string' ||
		record.pathname !== window.location.pathname
	)
		return
	if (
		typeof record.resultCardHtml !== 'string' ||
		record.resultCardHtml.trim() === ''
	)
		return

	const storedTab = normalizeAdviceTabFromSearch(
		typeof record.search === 'string' ? record.search : '',
	)
	const currentTab = normalizeAdviceTabFromSearch(window.location.search)
	if (storedTab !== currentTab) return

	const target = document.getElementById(RESTORE_TARGET_ID)
	if (!(target instanceof HTMLElement)) return

	target.innerHTML = record.resultCardHtml
	target.classList.remove('hidden')
}

export const AdviceAnalysisPersistence = clientEntry(
	'/features/advice/advice-analysis-persistence.component.js#AdviceAnalysisPersistence',
	function AdviceAnalysisPersistence(handle) {
		if (typeof document !== 'undefined') {
			const run = () => {
				persistAdviceResultIfPresent()
				restoreAdviceFromStorage()
			}
			run()
			addEventListeners(document, handle.signal, {
				'rmx-page-content-updated': run,
			})
		}

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'advice-analysis-persistence',
			})
	},
)
