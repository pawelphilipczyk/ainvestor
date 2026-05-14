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
						'[data-copy-llm-markdown], [data-copy-llm-catalog-json], [data-copy-llm-both]',
					)
					if (!(button instanceof HTMLButtonElement)) return
					const root = button.closest('[data-llm-export-root]')
					if (!(root instanceof HTMLElement)) return
					const markdownArea = root.querySelector('[data-llm-export-markdown]')
					const jsonArea = root.querySelector('[data-llm-export-catalog-json]')
					const md =
						markdownArea instanceof HTMLTextAreaElement
							? markdownArea.value.trimEnd()
							: ''
					const json =
						jsonArea instanceof HTMLTextAreaElement
							? jsonArea.value.trimEnd()
							: ''
					const messages = readCopyMessages()
					const success =
						typeof messages?.copySuccess === 'string'
							? messages.copySuccess
							: 'Copied.'
					const failed =
						typeof messages?.copyFailed === 'string'
							? messages.copyFailed
							: 'Copy failed.'

					let text = ''
					/** @type {HTMLTextAreaElement | null} */
					let fallback = null

					if (button.hasAttribute('data-copy-llm-both')) {
						if (
							!(markdownArea instanceof HTMLTextAreaElement) ||
							!(jsonArea instanceof HTMLTextAreaElement)
						) {
							return
						}
						text = `${md}\n\n---\n\n## ETF catalog (JSON)\n\n${json}\n`
						fallback = markdownArea
					} else if (button.hasAttribute('data-copy-llm-markdown')) {
						if (!(markdownArea instanceof HTMLTextAreaElement)) return
						text = md
						fallback = markdownArea
					} else if (button.hasAttribute('data-copy-llm-catalog-json')) {
						if (!(jsonArea instanceof HTMLTextAreaElement)) return
						text = json
						fallback = jsonArea
					} else {
						return
					}

					try {
						await navigator.clipboard.writeText(text)
						button.setAttribute('aria-label', success)
					} catch {
						fallback.focus()
						fallback.select()
						button.setAttribute('aria-label', failed)
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
