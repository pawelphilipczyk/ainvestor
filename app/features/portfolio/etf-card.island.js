export function mount(el) {
	const trigger = el.querySelector('.etf-remove-trigger')
	const dialog = el.querySelector('dialog')
	if (!trigger || !dialog) return

	trigger.addEventListener('click', () => {
		dialog.showModal()
	})
}
