import { addEventListeners, clientEntry, createElement } from 'remix/ui'

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

function trimTextareaValue(element) {
	return typeof element.value === 'string' ? element.value.trimEnd() : ''
}

export const AdviceContextCopyEnhancement = clientEntry(
	'/features/advice/advice-context-copy.component.js#AdviceContextCopyEnhancement',
	function AdviceContextCopyEnhancement(handle) {
		if (typeof document !== 'undefined') {
			addEventListeners(document, handle.signal, {
				async click(event) {
					const target = event.target
					if (!(target instanceof Element)) return
					const trigger = target.closest(
						'[data-copy-llm-markdown], [data-copy-llm-catalog-json], [data-copy-llm-both]',
					)
					if (!(trigger instanceof HTMLButtonElement)) return
					const root = trigger.closest('[data-llm-export-root]')
					if (!(root instanceof HTMLElement)) return
					const markdownTextarea = root.querySelector(
						'[data-llm-export-markdown]',
					)
					const catalogJsonTextarea = root.querySelector(
						'[data-llm-export-catalog-json]',
					)
					const messages = readClientMessages()
					const successText =
						typeof messages?.adviceContextCopySuccess === 'string'
							? messages.adviceContextCopySuccess
							: 'Copied.'
					const failText =
						typeof messages?.adviceContextCopyFailed === 'string'
							? messages.adviceContextCopyFailed
							: 'Copy failed; text is selected.'

					let text = ''
					/** @type {HTMLTextAreaElement | null} */
					let fallbackSelect = null

					if (trigger.hasAttribute('data-copy-llm-both')) {
						if (
							markdownTextarea instanceof HTMLTextAreaElement &&
							catalogJsonTextarea instanceof HTMLTextAreaElement
						) {
							const md = trimTextareaValue(markdownTextarea)
							const json = trimTextareaValue(catalogJsonTextarea)
							text = `${md}\n\n---\n\n## ETF catalog (JSON)\n\n${json}\n`
							fallbackSelect = markdownTextarea
						}
					} else if (trigger.hasAttribute('data-copy-llm-markdown')) {
						if (markdownTextarea instanceof HTMLTextAreaElement) {
							text = trimTextareaValue(markdownTextarea)
							fallbackSelect = markdownTextarea
						}
					} else if (trigger.hasAttribute('data-copy-llm-catalog-json')) {
						if (catalogJsonTextarea instanceof HTMLTextAreaElement) {
							text = trimTextareaValue(catalogJsonTextarea)
							fallbackSelect = catalogJsonTextarea
						}
					}

					if (text.length === 0 || fallbackSelect === null) return

					try {
						await navigator.clipboard.writeText(text)
						trigger.setAttribute('aria-label', successText)
					} catch {
						fallbackSelect.focus()
						fallbackSelect.select()
						trigger.setAttribute('aria-label', failText)
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
