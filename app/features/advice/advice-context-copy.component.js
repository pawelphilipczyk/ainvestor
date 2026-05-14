import { addEventListeners, clientEntry, createElement } from 'remix/ui'

const MESSAGES_ID = 'advice-context-client-messages'

function readCopyMessages() {
	if (typeof document === 'undefined') return null
	const element = document.getElementById(MESSAGES_ID)
	if (!element?.textContent) return null
	try {
		return JSON.parse(element.textContent)
	} catch {
		return null
	}
}

export const AdviceContextCopyEnhancement = clientEntry(
	'/features/advice/advice-context-copy.component.js#AdviceContextCopyEnhancement',
	function AdviceContextCopyEnhancement(handle) {
		if (typeof document !== 'undefined') {
			addEventListeners(document, handle.signal, {
				async click(event) {
					const from = event.target
					if (!(from instanceof Element)) return
					const button = from.closest(
						'[data-copy-llm-markdown], [data-copy-catalog-json-url]',
					)
					if (!(button instanceof HTMLButtonElement)) return
					const root = button.closest('[data-llm-export-root]')
					if (!(root instanceof HTMLElement)) return
					const messages = readCopyMessages()
					const success =
						typeof messages?.copySuccess === 'string'
							? messages.copySuccess
							: 'Copied.'
					const failed =
						typeof messages?.copyFailed === 'string'
							? messages.copyFailed
							: 'Copy failed.'

					if (button.hasAttribute('data-copy-llm-markdown')) {
						const textarea = root.querySelector('[data-llm-export-markdown]')
						if (!(textarea instanceof HTMLTextAreaElement)) return
						const text = textarea.value
						try {
							await navigator.clipboard.writeText(text)
							button.setAttribute('aria-label', success)
						} catch {
							textarea.focus()
							textarea.select()
							button.setAttribute('aria-label', failed)
						}
						return
					}

					if (button.hasAttribute('data-copy-catalog-json-url')) {
						const url = root.getAttribute('data-catalog-json-href') ?? ''
						if (url.length === 0) return
						try {
							await navigator.clipboard.writeText(url)
							button.setAttribute('aria-label', success)
						} catch {
							button.setAttribute('aria-label', failed)
						}
					}
				},
			})
		}

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'advice-context-copy-enhancement',
			})
	},
)
