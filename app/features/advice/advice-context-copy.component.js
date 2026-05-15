import { addEventListeners, clientEntry, createElement } from 'remix/ui'

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

					const success = root.dataset.copySuccess ?? 'Copied.'
					const failed = root.dataset.copyFailed ?? 'Copy failed.'

					let text = ''
					let markdownTextarea
					if (button.hasAttribute('data-copy-llm-markdown')) {
						const textarea = root.querySelector('[data-llm-export-markdown]')
						if (!(textarea instanceof HTMLTextAreaElement)) return
						markdownTextarea = textarea
						text = textarea.value
					} else {
						text = root.getAttribute('data-catalog-json-href') ?? ''
					}

					if (text.length === 0) return

					try {
						await navigator.clipboard.writeText(text)
						button.setAttribute('aria-label', success)
					} catch {
						if (markdownTextarea !== undefined) {
							markdownTextarea.focus()
							markdownTextarea.select()
						}
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
