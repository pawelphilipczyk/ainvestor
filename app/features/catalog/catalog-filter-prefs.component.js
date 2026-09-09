import {
	addEventListeners,
	clientEntry,
	createElement,
	navigate,
} from 'remix/ui'

// Mirrors CATALOG_FILTER_PREFS_STORAGE_KEY in catalog-filter-prefs.ts (client bundle can't import that TS module).
const STORAGE_KEY = 'catalog/filters/v1'
/** Previous key; read once and migrate so existing users keep saved filters. */
const LEGACY_STORAGE_KEY = 'etfCatalogFiltersV1'

const FORM_SELECTOR = 'form[data-catalog-filter-form]'
const CLEAR_SELECTOR = 'a[data-catalog-filter-clear]'
const PREF_FIELDS = ['type', 'risk', 'q']

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
 * Reads saved filters as URL search params. Values are forwarded as-is —
 * the server already re-validates type/risk/q on every request, so the
 * client doesn't need its own copy of that logic.
 */
function readStoredSearchParams() {
	if (typeof localStorage === 'undefined') return null
	try {
		let raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) {
			const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
			if (!legacy) return null
			localStorage.setItem(STORAGE_KEY, legacy)
			localStorage.removeItem(LEGACY_STORAGE_KEY)
			raw = legacy
		}
		const parsed = JSON.parse(raw)
		if (parsed === null || typeof parsed !== 'object') return null
		const searchParams = new URLSearchParams()
		for (const field of PREF_FIELDS) {
			const value = parsed[field]
			if (typeof value === 'string' && value.length > 0) {
				searchParams.set(field, value)
			}
		}
		return searchParams.size > 0 ? searchParams : null
	} catch {
		return null
	}
}

function writeStoredSearchParams(formData) {
	if (typeof localStorage === 'undefined') return
	try {
		const prefs = {}
		let hasAnyFilter = false
		for (const field of PREF_FIELDS) {
			const value = formData.get(field)
			prefs[field] = typeof value === 'string' ? value.trim() : ''
			if (prefs[field].length > 0) hasAnyFilter = true
		}
		if (hasAnyFilter) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
		} else {
			localStorage.removeItem(STORAGE_KEY)
		}
		localStorage.removeItem(LEGACY_STORAGE_KEY)
	} catch {
		// Quota or private mode — ignore
	}
}

function clearStoredSearchParams() {
	if (typeof localStorage === 'undefined') return
	try {
		localStorage.removeItem(STORAGE_KEY)
		localStorage.removeItem(LEGACY_STORAGE_KEY)
	} catch {
		// ignore
	}
}

function restoreFiltersIfNeeded(catalogIndexHref) {
	if (typeof catalogIndexHref !== 'string' || catalogIndexHref.length === 0) {
		return
	}
	const catalogIndexPath = new URL(catalogIndexHref, window.location.origin)
		.pathname
	const currentParams = new URLSearchParams(window.location.search)
	const hasFilterParams = PREF_FIELDS.some((field) => currentParams.has(field))
	if (window.location.pathname !== catalogIndexPath || hasFilterParams) return

	const storedSearch = readStoredSearchParams()
	if (storedSearch === null) return

	const nextUrl = `${catalogIndexHref}?${storedSearch.toString()}`
	// entry.js stubs `globalThis.navigation` with an inert no-op on browsers
	// lacking the real Navigation API, so `navigate` alone can't tell real
	// support from the stub — check the `Navigation` global (the interface
	// constructor, left untouched by that stub) instead.
	if (typeof globalThis.Navigation === 'function') {
		navigate(nextUrl, { history: 'replace' })
	} else {
		window.location.replace(nextUrl)
	}
}

/**
 * Persists catalog list filters to localStorage, restores them via a one-shot
 * redirect when `/catalog` loads with no filter params, and clears storage when
 * the user hits Clear.
 */
export const CatalogFilterPrefsEnhancement = clientEntry(
	'/features/catalog/catalog-filter-prefs.component.js#CatalogFilterPrefsEnhancement',
	function CatalogFilterPrefsEnhancement(handle) {
		if (typeof document !== 'undefined') {
			restoreFiltersIfNeeded(handle.props['data-catalog-index-href'])

			addEventListeners(document, handle.signal, {
				submit(event) {
					const form = event.target
					if (!(form instanceof HTMLFormElement)) return
					if (!form.matches(FORM_SELECTOR)) return
					writeStoredSearchParams(new FormData(form))
				},
				click(event) {
					const target = event.target
					if (!(target instanceof Element)) return
					const anchor = target.closest(CLEAR_SELECTOR)
					if (!(anchor instanceof HTMLAnchorElement)) return
					if (isModifiedClick(event)) return
					event.preventDefault()
					clearStoredSearchParams()
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
