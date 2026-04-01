import { addEventListeners, clientEntry, createElement } from 'remix/component'

const MESSAGES_ID = 'ui-client-messages'
const ETF_INFO_DEFAULTS_ID = 'advice-etf-info-defaults'

/** Matches server-rendered #advice-etf-info-dialog-body base classes */
const DIALOG_BODY_BASE_CLASSES = [
	'min-h-0',
	'flex-1',
	'overflow-y-auto',
	'px-4',
	'py-3',
	'text-sm',
	'leading-relaxed',
	'text-card-foreground',
]
const DIALOG_BODY_PRE_WRAP_CLASSES = ['whitespace-pre-wrap', 'break-words']

function ensureDialogBodyBaseClasses(body) {
	for (const className of DIALOG_BODY_BASE_CLASSES) {
		body.classList.add(className)
	}
}

function setDialogBodyPreWrap(body, enabled) {
	const method = enabled ? 'add' : 'remove'
	for (const className of DIALOG_BODY_PRE_WRAP_CLASSES) {
		body.classList[method](className)
	}
}

function readEtfInfoDefaults() {
	if (typeof document === 'undefined') return null
	const element = document.getElementById(ETF_INFO_DEFAULTS_ID)
	if (!element?.textContent) return null
	try {
		return JSON.parse(element.textContent)
	} catch {
		return null
	}
}

function readClientMessages() {
	if (typeof document === 'undefined') return null
	const messagesElement = document.getElementById(MESSAGES_ID)
	if (!messagesElement?.textContent) return null
	try {
		return JSON.parse(messagesElement.textContent)
	} catch {
		return null
	}
}

function setButtonLoading(button, loading) {
	if (!(button instanceof HTMLButtonElement)) return
	if (loading) {
		button.setAttribute('disabled', '')
		button.setAttribute('aria-busy', 'true')
		button.dataset.originalLabel = button.textContent ?? ''
		const msgs = readClientMessages()
		const label =
			typeof msgs?.adviceEtfInfoLoading === 'string'
				? msgs.adviceEtfInfoLoading
				: 'Loading…'
		button.textContent = label
	} else {
		button.removeAttribute('disabled')
		button.removeAttribute('aria-busy')
		const original = button.dataset.originalLabel
		if (original !== undefined) {
			button.textContent = original
			delete button.dataset.originalLabel
		}
	}
}

export const AdviceEtfInfoInteractions = clientEntry(
	'/features/advice/advice-etf-info.component.js#AdviceEtfInfoInteractions',
	function AdviceEtfInfoInteractions(handle) {
		if (typeof document !== 'undefined') {
			const doc = document
			addEventListeners(doc, handle.signal, {
				async click(event) {
					const target = event.target
					if (!(target instanceof Element)) return
					const trigger = target.closest('[data-advice-etf-learn]')
					if (!(trigger instanceof HTMLButtonElement)) return

					const defaults = readEtfInfoDefaults()
					const postUrl =
						trigger.dataset.postUrl?.trim() ||
						(typeof defaults?.postUrl === 'string' ? defaults.postUrl : '')
					const etfName = trigger.dataset.etfName?.trim()
					const model =
						trigger.dataset.adviceModel?.trim() ||
						(typeof defaults?.defaultAdviceModel === 'string'
							? defaults.defaultAdviceModel
							: '')
					if (!postUrl || !etfName || !model) return

					const dialog = doc.getElementById('advice-etf-info-dialog')
					if (!(dialog instanceof HTMLDialogElement)) return

					const heading = doc.getElementById('advice-etf-info-dialog-heading')
					const body = doc.getElementById('advice-etf-info-dialog-body')
					const status = doc.getElementById('advice-etf-info-dialog-status')
					if (!heading || !body || !status) return

					const msgs = readClientMessages()
					const loadingText =
						typeof msgs?.adviceEtfInfoLoading === 'string'
							? msgs.adviceEtfInfoLoading
							: 'Loading…'
					const errorFallback =
						typeof msgs?.adviceEtfInfoError === 'string'
							? msgs.adviceEtfInfoError
							: 'Something went wrong.'

					dialog.showModal()
					heading.textContent = etfName
					body.textContent = ''
					ensureDialogBodyBaseClasses(body)
					setDialogBodyPreWrap(body, false)
					status.textContent = loadingText
					status.classList.remove('hidden')

					const formData = new FormData()
					formData.set('etfName', etfName)
					const ticker = trigger.dataset.etfTicker?.trim()
					if (ticker) formData.set('etfTicker', ticker)
					formData.set('adviceModel', model)

					setButtonLoading(trigger, true)
					try {
						const response = await fetch(postUrl, {
							method: 'POST',
							body: formData,
							headers: { Accept: 'application/json' },
						})
						const payload = await response.json().catch(() => ({}))
						if (!response.ok) {
							const message =
								typeof payload.error === 'string'
									? payload.error
									: errorFallback
							status.textContent = message
							body.textContent = ''
							setDialogBodyPreWrap(body, false)
							return
						}
						const title =
							typeof payload.title === 'string' ? payload.title : etfName
						const text =
							typeof payload.text === 'string' ? payload.text : errorFallback
						heading.textContent = title
						status.classList.add('hidden')
						status.textContent = ''
						ensureDialogBodyBaseClasses(body)
						setDialogBodyPreWrap(body, true)
						body.textContent = text
					} catch {
						status.textContent = errorFallback
						body.textContent = ''
						setDialogBodyPreWrap(body, false)
					} finally {
						setButtonLoading(trigger, false)
					}
				},
			})
		}

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'advice-etf-info-interactions',
			})
	},
)
