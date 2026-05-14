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

export const AdviceContextCopyEnhancement = clientEntry(
	'/features/advice/advice-context-copy.component.js#AdviceContextCopyEnhancement',
	function AdviceContextCopyEnhancement(handle) {
		if (typeof document !== 'undefined') {
			addEventListeners(document, handle.signal, {
				async click(event) {
					const target = event.target
					if (!(target instanceof Element)) return
					const trigger = target.closest('[data-copy-llm-context]')
					if (!(trigger instanceof HTMLButtonElement)) return
					const root = trigger.closest('[data-llm-export-root]')
					const textarea = root?.querySelector('[data-llm-export-textarea]')
					if (!(textarea instanceof HTMLTextAreaElement)) return
					const text = textarea.value
					const messages = readClientMessages()
					const successText =
						typeof messages?.adviceContextCopySuccess === 'string'
							? messages.adviceContextCopySuccess
							: 'Copied.'
					const failText =
						typeof messages?.adviceContextCopyFailed === 'string'
							? messages.adviceContextCopyFailed
							: 'Copy failed; text is selected.'
					try {
						await navigator.clipboard.writeText(text)
						trigger.setAttribute('aria-label', successText)
					} catch {
						textarea.focus()
						textarea.select()
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
