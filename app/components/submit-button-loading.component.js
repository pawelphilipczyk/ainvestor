/** Shared busy state for submit controls (fetch-submit, navigation GET, feature forms). */

const SPINNER_ICON_ID = 'form-spinner-icon'
const CLIENT_MESSAGES_ID = 'ui-client-messages'

function readClientMessages() {
	if (typeof document === 'undefined') return null
	const messagesElement = document.getElementById(CLIENT_MESSAGES_ID)
	if (!messagesElement?.textContent) return null
	try {
		return JSON.parse(messagesElement.textContent)
	} catch {
		return null
	}
}

/**
 * @param {HTMLElement | null | undefined} control
 * @param {boolean} loading
 */
export function setSubmitButtonLoading(control, loading) {
	if (!(control instanceof HTMLElement)) return

	if (control instanceof HTMLInputElement && control.type === 'submit') {
		if (loading) {
			control.dataset.originalValue = control.value
			const msgs = readClientMessages()
			const loadingLabel =
				typeof msgs?.submitLoadingLabel === 'string'
					? msgs.submitLoadingLabel
					: 'Loading…'
			control.value = loadingLabel
			control.setAttribute('disabled', '')
			control.setAttribute('aria-busy', 'true')
		} else {
			const originalValue = control.dataset.originalValue
			if (originalValue !== undefined) {
				control.value = originalValue
				delete control.dataset.originalValue
			}
			control.removeAttribute('disabled')
			control.removeAttribute('aria-busy')
		}
		return
	}

	if (!(control instanceof HTMLButtonElement)) return

	const usesBusyOverlay = control.querySelector('.submit-button-busy-overlay')

	if (usesBusyOverlay) {
		if (loading) {
			control.setAttribute('disabled', '')
			control.setAttribute('aria-busy', 'true')
			control.setAttribute('data-loading', '')
		} else {
			control.removeAttribute('data-loading')
			control.removeAttribute('disabled')
			control.removeAttribute('aria-busy')
		}
		return
	}

	const spinnerHost = document.getElementById(SPINNER_ICON_ID)

	if (loading) {
		control.setAttribute('disabled', '')
		control.setAttribute('aria-busy', 'true')
		if (spinnerHost) {
			control.dataset.originalContent = control.innerHTML
			const row = control.ownerDocument.createElement('span')
			row.className =
				'inline-flex w-full max-w-full items-center justify-center gap-2'
			const spinner = spinnerHost.firstElementChild?.cloneNode(true)
			const label = control.ownerDocument.createElement('span')
			label.className = 'submit-button-busy-label min-w-0 flex-1 text-center'
			label.innerHTML = control.innerHTML
			control.innerHTML = ''
			if (spinner) row.append(spinner)
			row.append(label)
			control.append(row)
		}
	} else {
		const original = control.dataset.originalContent
		if (original !== undefined) {
			control.innerHTML = original
			delete control.dataset.originalContent
		}
		control.removeAttribute('disabled')
		control.removeAttribute('aria-busy')
	}
}
