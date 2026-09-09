import { addEventListeners, clientEntry, createElement } from 'remix/ui'
import { openDialogForTrigger } from '../../lib/dialog-trigger.js'

function guidelineIdFromDataset(element, attributeName) {
	const raw = element.dataset?.[attributeName]
	return typeof raw === 'string' && raw.length > 0 ? raw : null
}

function guidelineEditFormIsVisible(form) {
	return form instanceof HTMLFormElement && !form.classList.contains('hidden')
}

function showGuidelineTargetEdit(document, guidelineId) {
	for (const openForm of document.querySelectorAll(
		'[data-guideline-edit-form]',
	)) {
		if (guidelineEditFormIsVisible(openForm)) {
			const otherId = openForm.getAttribute('data-guideline-edit-form')
			if (otherId && otherId !== guidelineId) {
				hideGuidelineTargetEdit(document, otherId)
			}
		}
	}

	const read = document.querySelector(`[data-guideline-read="${guidelineId}"]`)
	const form = document.querySelector(
		`[data-guideline-edit-form="${guidelineId}"]`,
	)
	if (!(read instanceof HTMLElement) || !(form instanceof HTMLFormElement)) {
		return
	}
	read.classList.add('hidden')
	form.classList.remove('hidden')
	const input = form.querySelector('input[name="targetPct"]')
	if (input instanceof HTMLInputElement) {
		const original = form.dataset.guidelineOriginalTarget?.trim() ?? ''
		if (original.length > 0) {
			input.value = original
		}
		input.focus()
	}
}

function hideGuidelineTargetEdit(document, guidelineId) {
	const read = document.querySelector(`[data-guideline-read="${guidelineId}"]`)
	const form = document.querySelector(
		`[data-guideline-edit-form="${guidelineId}"]`,
	)
	if (!(read instanceof HTMLElement) || !(form instanceof HTMLFormElement)) {
		return
	}
	const input = form.querySelector('input[name="targetPct"]')
	if (input instanceof HTMLInputElement) {
		const original = form.dataset.guidelineOriginalTarget?.trim() ?? ''
		if (original.length > 0) {
			input.value = original
		}
	}
	form.classList.add('hidden')
	read.classList.remove('hidden')
}

export const GuidelinesDeleteDialogInteractions = clientEntry(
	'/features/guidelines/guidelines-list.component.js#GuidelinesDeleteDialogInteractions',
	function GuidelinesDeleteDialogInteractions(handle) {
		if (typeof document !== 'undefined') {
			const doc = document
			addEventListeners(doc, handle.signal, {
				click(event) {
					const target = event.target
					if (!(target instanceof Element)) return

					const editTrigger = target.closest('[data-guideline-edit]')
					if (editTrigger instanceof HTMLElement) {
						const id = guidelineIdFromDataset(editTrigger, 'guidelineEdit')
						if (id) {
							event.preventDefault()
							showGuidelineTargetEdit(doc, id)
						}
						return
					}

					const cancelTrigger = target.closest('[data-guideline-cancel-edit]')
					if (cancelTrigger instanceof HTMLElement) {
						const id = guidelineIdFromDataset(
							cancelTrigger,
							'guidelineCancelEdit',
						)
						if (id) {
							event.preventDefault()
							hideGuidelineTargetEdit(doc, id)
						}
						return
					}

					const dialogTrigger = target.closest('[data-dialog-id]')
					if (dialogTrigger instanceof HTMLElement) {
						openDialogForTrigger(dialogTrigger, doc)
					}
				},
			})
		}

		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'guidelines-delete-dialog-interactions',
			})
	},
)
