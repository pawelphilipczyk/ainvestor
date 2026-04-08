import { addEventListeners, clientEntry, createElement } from 'remix/component'

const STORAGE_KEY = 'catalog/filters/v1'
/** Previous key; read once and migrate so existing users keep saved filters. */
const LEGACY_STORAGE_KEY = 'etfCatalogFiltersV1'
const QUERY_MAX_LENGTH = 200

const FORM_SELECTOR = 'form[data-catalog-filter-form]'
const CLEAR_SELECTOR = 'a[data-catalog-filter-clear]'

// Must stay aligned with `ETF_TYPES` in `app/lib/guidelines.ts` (client bundle cannot import it).
const ETF_TYPES = [
	'equity',
	'bond',
	'real_estate',
	'commodity',
	'mixed',
	'money_market',
]

const RISK_BANDS = new Set(['low', 'medium', 'high'])

function parseTypeFilter(value) {
	if (typeof value !== 'string') return ''
	const trimmed = value.trim()
	if (trimmed.length === 0) return ''
	return ETF_TYPES.includes(trimmed) ? trimmed : ''
}

function parseRiskFilter(value) {
	if (typeof value !== 'string') return ''
	const trimmed = value.trim().toLowerCase()
	if (trimmed.length === 0) return ''
	return RISK_BANDS.has(trimmed) ? trimmed : ''
}

function normalizeQuery(value) {
	if (typeof value !== 'string') return ''
	const trimmed = value.trim()
	if (trimmed.length <= QUERY_MAX_LENGTH) return trimmed
	return trimmed.slice(0, QUERY_MAX_LENGTH)
}

function normalizedPrefsFromFields(type, risk, query) {
	return {
		type: parseTypeFilter(type),
		risk: parseRiskFilter(risk),
		query: normalizeQuery(query),
	}
}

function prefsFromFormData(formData) {
	return normalizedPrefsFromFields(
		formData.get('type'),
		formData.get('risk'),
		formData.get('q'),
	)
}

function prefsHaveAnyFilter(prefs) {
	return (
		prefs.type.length > 0 || prefs.risk.length > 0 || prefs.query.length > 0
	)
}

function prefsToSearchParams(prefs) {
	const searchParams = new URLSearchParams()
	if (prefs.type.length > 0) searchParams.set('type', prefs.type)
	if (prefs.risk.length > 0) searchParams.set('risk', prefs.risk)
	if (prefs.query.length > 0) searchParams.set('q', prefs.query)
	return searchParams
}

function urlHasCatalogFilterParams(searchParams) {
	return (
		searchParams.has('type') ||
		searchParams.has('risk') ||
		searchParams.has('q')
	)
}

function readStoredPrefs() {
	if (typeof localStorage === 'undefined') return null
	let raw
	try {
		raw = localStorage.getItem(STORAGE_KEY)
		if (raw === null || raw.length === 0) {
			const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
			if (legacy !== null && legacy.length > 0) {
				localStorage.setItem(STORAGE_KEY, legacy)
				localStorage.removeItem(LEGACY_STORAGE_KEY)
				raw = legacy
			}
		}
	} catch {
		return null
	}
	if (raw === null || raw.length === 0) return null
	let parsed
	try {
		parsed = JSON.parse(raw)
	} catch {
		return null
	}
	if (parsed === null || typeof parsed !== 'object') return null
	const typeRaw = typeof parsed.type === 'string' ? parsed.type : ''
	const riskRaw = typeof parsed.risk === 'string' ? parsed.risk : ''
	const queryRaw =
		typeof parsed.q === 'string'
			? parsed.q
			: typeof parsed.query === 'string'
				? parsed.query
				: ''
	return normalizedPrefsFromFields(typeRaw, riskRaw, queryRaw)
}

function writeStoredPrefs(prefs) {
	if (typeof localStorage === 'undefined') return
	try {
		if (!prefsHaveAnyFilter(prefs)) {
			localStorage.removeItem(STORAGE_KEY)
			localStorage.removeItem(LEGACY_STORAGE_KEY)
			return
		}
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				type: prefs.type,
				risk: prefs.risk,
				q: prefs.query,
			}),
		)
		localStorage.removeItem(LEGACY_STORAGE_KEY)
	} catch {
		// Quota or private mode — ignore
	}
}

function clearStoredPrefs() {
	if (typeof localStorage === 'undefined') return
	try {
		localStorage.removeItem(STORAGE_KEY)
		localStorage.removeItem(LEGACY_STORAGE_KEY)
	} catch {
		// ignore
	}
}

function isModifiedClick(event) {
	return (
		event.defaultPrevented ||
		event.button !== 0 ||
		event.metaKey ||
		event.ctrlKey ||
		event.shiftKey ||
		event.altKey
	)
}

/**
 * Persists catalog list filters to localStorage, restores them via a one-shot
 * redirect when `/catalog` loads with no query params, and clears storage when
 * the user hits Clear.
 */
export const CatalogFilterPrefsEnhancement = clientEntry(
	'/features/catalog/catalog-filter-prefs.component.js#CatalogFilterPrefsEnhancement',
	function CatalogFilterPrefsEnhancement(handle) {
		if (typeof document !== 'undefined') {
			const root = handle.element
			const catalogIndexHref =
				root instanceof HTMLElement
					? root.dataset.catalogIndexHref?.trim()
					: undefined
			if (
				typeof catalogIndexHref === 'string' &&
				catalogIndexHref.length > 0 &&
				window.location.pathname === '/catalog' &&
				!urlHasCatalogFilterParams(new URLSearchParams(window.location.search))
			) {
				const stored = readStoredPrefs()
				if (
					stored !== null &&
					prefsHaveAnyFilter(stored) &&
					typeof window.location.replace === 'function'
				) {
					const nextSearch = prefsToSearchParams(stored).toString()
					const nextUrl =
						nextSearch.length > 0
							? `${catalogIndexHref}?${nextSearch}`
							: catalogIndexHref
					window.location.replace(nextUrl)
				}
			}

			addEventListeners(document, handle.signal, {
				submit(event) {
					const form = event.target
					if (!(form instanceof HTMLFormElement)) return
					if (!form.matches(FORM_SELECTOR)) return
					writeStoredPrefs(prefsFromFormData(new FormData(form)))
				},
				click(event) {
					const target = event.target
					if (!(target instanceof Element)) return
					const anchor = target.closest(CLEAR_SELECTOR)
					if (!(anchor instanceof HTMLAnchorElement)) return
					if (isModifiedClick(event)) return
					event.preventDefault()
					clearStoredPrefs()
					const href = anchor.getAttribute('href')
					if (href && !href.startsWith('#')) {
						window.location.assign(anchor.href)
					}
				},
			})
		}

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'catalog-filter-prefs-enhancement',
			})
	},
)
