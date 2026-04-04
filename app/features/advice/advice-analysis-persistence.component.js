import { addEventListeners, clientEntry, createElement } from 'remix/component'
import { buildAdviceRestoredCard } from '../../lib/advice-restore-dom.js'
import {
	clearAdviceAnalysisStorage,
	readAdviceAnalysisRecord,
	writeAdviceAnalysisSnapshot,
} from '../../lib/client-analysis-storage.js'

const RESULT_ID = 'advice-last-result'
const RESTORE_TARGET_ID = 'advice-client-restored'
const RESTORE_LABELS_ID = 'ui-advice-restore-labels'

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

/**
 * @returns {Record<string, string> | null}
 */
function readRestoreLabels() {
	if (typeof document === 'undefined') return null
	const el = document.getElementById(RESTORE_LABELS_ID)
	if (!el?.textContent) return null
	try {
		const parsed = JSON.parse(el.textContent)
		if (parsed == null || typeof parsed !== 'object') return null
		return /** @type {Record<string, string>} */ (parsed)
	} catch {
		return null
	}
}

function persistAdviceResultIfPresent() {
	const card = document.getElementById(RESULT_ID)
	if (!(card instanceof HTMLElement)) return
	if (card.innerHTML.trim() === '') return

	const snapshotEl = card.querySelector('[data-advice-document-snapshot]')
	if (!(snapshotEl instanceof HTMLElement)) return
	const raw = snapshotEl.textContent?.trim() ?? ''
	if (raw === '') return
	let adviceDocument
	try {
		adviceDocument = JSON.parse(raw)
	} catch {
		return
	}
	if (adviceDocument == null || typeof adviceDocument !== 'object') return

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
		adviceDocument,
	})
}

function restoreAdviceFromStorage() {
	const serverCard = document.getElementById(RESULT_ID)
	if (serverCard instanceof HTMLElement) {
		const target = document.getElementById(RESTORE_TARGET_ID)
		if (target instanceof HTMLElement) {
			target.replaceChildren()
			target.classList.add('hidden')
		}
		return
	}

	const record = readAdviceAnalysisRecord()
	if (record == null) return
	if (
		typeof record.pathname !== 'string' ||
		record.pathname !== window.location.pathname
	)
		return

	const storedTab = normalizeAdviceTabFromSearch(
		typeof record.search === 'string' ? record.search : '',
	)
	const currentTab = normalizeAdviceTabFromSearch(window.location.search)
	if (storedTab !== currentTab) return

	const adviceDocument = record.adviceDocument
	if (adviceDocument == null || typeof adviceDocument !== 'object') {
		clearAdviceAnalysisStorage()
		return
	}

	const lastAnalysisMode =
		record.lastAnalysisMode === 'portfolio_review' ||
		record.lastAnalysisMode === 'buy_next'
			? record.lastAnalysisMode
			: 'buy_next'
	const cashCurrency =
		typeof record.cashCurrency === 'string' && record.cashCurrency.length > 0
			? record.cashCurrency
			: 'PLN'
	const selectedModel =
		typeof record.selectedModel === 'string' && record.selectedModel.length > 0
			? record.selectedModel
			: 'gpt-5.4-mini'
	const cashAmount =
		typeof record.cashAmount === 'string' ? record.cashAmount : undefined
	const savedAt =
		typeof record.savedAt === 'number' ? record.savedAt : Date.now()

	const labels = readRestoreLabels()
	const target = document.getElementById(RESTORE_TARGET_ID)
	if (!(target instanceof HTMLElement)) return

	target.replaceChildren()

	if (labels == null) {
		console.warn('[advice-persistence] missing #ui-advice-restore-labels')
		return
	}

	try {
		const card = buildAdviceRestoredCard(document, labels, {
			adviceDocument,
			lastAnalysisMode,
			cashAmount,
			cashCurrency,
			selectedModel,
			savedAt,
		})
		target.appendChild(card)
		target.classList.remove('hidden')
	} catch (err) {
		console.warn(
			'[advice-persistence] restore render failed; clearing storage',
			err,
		)
		clearAdviceAnalysisStorage()
		target.replaceChildren()
		target.classList.add('hidden')
	}
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
