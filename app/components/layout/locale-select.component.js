import { addEventListeners, clientEntry, createElement } from 'remix/ui'

export const LocaleSelectSubmit = clientEntry(
	'/components/layout/locale-select.component.js#LocaleSelectSubmit',
	function LocaleSelectSubmit(handle) {
		if (typeof document !== 'undefined') {
			addEventListeners(document, handle.signal, {
				change(event) {
					const target = event.target
					if (!(target instanceof HTMLSelectElement)) return
					if (!target.hasAttribute('data-ui-locale-select')) return
					const form = target.form
					if (form === null) return
					form.requestSubmit()
				},
			})
		}

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'locale-select-submit',
			})
	},
)
