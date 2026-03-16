function openDialog(dialog) {
	dialog.showModal()
}

export async function mount(el) {
	const trigger = el.querySelector('.etf-remove-trigger')
	const dialog = el.querySelector('dialog')
	if (!trigger || !dialog) return

	try {
		const { on } = await import('remix/interaction')
		on(trigger, { click: () => openDialog(dialog) })
	} catch {
		trigger.addEventListener('click', () => openDialog(dialog))
	}
}
