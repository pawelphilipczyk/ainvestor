import { clientEntry, createElement } from 'remix/component'
import { on } from 'remix/interaction'

function syncAdviceSubmit(form) {
	const input = form.querySelector('[name="cashAmount"]')
	const submit = form.querySelector('button[type="submit"]')
	if (
		!(input instanceof HTMLInputElement) ||
		!(submit instanceof HTMLButtonElement)
	) {
		return
	}
	const pending = input.disabled
	const empty = input.value.trim() === ''
	submit.disabled = pending || empty
}

export const AdviceFormEnhancement = clientEntry(
	'/features/advice/advice-form.component.js#AdviceFormEnhancement',
	function AdviceFormEnhancement() {
		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'advice-form-enhancement',
				connect: (node, signal) => {
					const doc = node.ownerDocument
					const runAll = () => {
						for (const form of doc.querySelectorAll(
							'form[data-advice-cash-form]',
						)) {
							if (form instanceof HTMLFormElement) {
								syncAdviceSubmit(form)
							}
						}
					}
					runAll()
					const dispose = on(doc, {
						input(event) {
							const t = event.target
							if (
								t instanceof HTMLInputElement &&
								t.name === 'cashAmount' &&
								t.closest('form[data-advice-cash-form]')
							) {
								syncAdviceSubmit(t.closest('form'))
							}
						},
						change(event) {
							const t = event.target
							if (
								t instanceof HTMLInputElement &&
								t.name === 'cashAmount' &&
								t.closest('form[data-advice-cash-form]')
							) {
								syncAdviceSubmit(t.closest('form'))
							}
						},
					})
					const mo = new MutationObserver(runAll)
					mo.observe(doc.getElementById('page-content') ?? doc.body, {
						childList: true,
						subtree: true,
					})
					signal.addEventListener('abort', () => {
						dispose()
						mo.disconnect()
					})
				},
			})
	},
)
