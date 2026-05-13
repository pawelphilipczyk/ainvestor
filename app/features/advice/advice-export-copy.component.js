import { addEventListeners, clientEntry, createElement } from 'remix/ui'

const COPY_BUTTON_SELECTOR = 'button[data-advice-export-copy]'
const TEXT_SELECTOR = '[data-advice-export-text]'

export const AdviceExportCopyInteractions = clientEntry(
	'/features/advice/advice-export-copy.component.js#AdviceExportCopyInteractions',
	function AdviceExportCopyInteractions(handle) {
		if (typeof document !== 'undefined') {
			addEventListeners(document, handle.signal, {
				click(event) {
					const target = event.target
					if (!(target instanceof Element)) return
					const button = target.closest(COPY_BUTTON_SELECTOR)
					if (!(button instanceof HTMLButtonElement)) return

					const details = button.closest('details')
					const pre =
						details?.querySelector(TEXT_SELECTOR) ??
						button.parentElement?.querySelector(TEXT_SELECTOR)
					if (!(pre instanceof HTMLPreElement)) return

					const text = pre.textContent ?? ''
					if (text.length === 0) return

					const defaultLabel = button.dataset.labelDefault
					const doneLabel = button.dataset.labelDone
					const resetMs = 2000

					const tryCopy = async () => {
						if (typeof navigator.clipboard?.writeText === 'function') {
							try {
								await navigator.clipboard.writeText(text)
								return true
							} catch {
								// fall through to execCommand fallback
							}
						}
						try {
							window.getSelection()?.removeAllRanges()
							const range = document.createRange()
							range.selectNodeContents(pre)
							window.getSelection()?.addRange(range)
							const ok = document.execCommand('copy')
							window.getSelection()?.removeAllRanges()
							return ok
						} catch {
							return false
						}
					}

					void tryCopy().then((ok) => {
						if (
							ok !== true ||
							typeof doneLabel !== 'string' ||
							doneLabel.length === 0 ||
							typeof defaultLabel !== 'string' ||
							defaultLabel.length === 0
						) {
							return
						}
						button.textContent = doneLabel
						button.disabled = true
						window.setTimeout(() => {
							button.textContent = defaultLabel
							button.disabled = false
						}, resetMs)
					})
				},
			})
		}

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'advice-export-copy-interactions',
			})
	},
)
