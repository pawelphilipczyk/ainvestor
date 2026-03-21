import { clientEntry, createElement } from 'remix/component'
import { on } from 'remix/interaction'

/**
 * Shows either instrument (catalog fund) fields or asset-class bucket fields;
 * disables the hidden fieldset so values are not submitted.
 */
function syncGuidelinePanels(kindSelect) {
	const isInstrument = kindSelect.value === 'instrument'
	const instrumentFs = document.getElementById('guidelines-panel-instrument')
	const assetFs = document.getElementById('guidelines-panel-asset-class')
	if (!instrumentFs || !assetFs) return
	instrumentFs.disabled = !isInstrument
	assetFs.disabled = isInstrument
	instrumentFs.classList.toggle('hidden', !isInstrument)
	assetFs.classList.toggle('hidden', isInstrument)
}

export const GuidelinesFormToggle = clientEntry(
	'/features/guidelines/guidelines-form.component.js#GuidelinesFormToggle',
	function GuidelinesFormToggle() {
		return () =>
			createElement('span', {
				hidden: true,
				'aria-hidden': 'true',
				'data-component': 'guidelines-form-toggle',
				connect: (node, signal) => {
					const form = node.closest('form')
					if (!form) return
					const kindSelect = form.querySelector('#kind')
					if (!(kindSelect instanceof HTMLSelectElement)) return
					const run = () => syncGuidelinePanels(kindSelect)
					run()
					const disposeChange = on(kindSelect, { change: run })
					const onReset = () => {
						queueMicrotask(run)
					}
					form.addEventListener('reset', onReset)
					signal.addEventListener(
						'abort',
						() => {
							disposeChange()
							form.removeEventListener('reset', onReset)
						},
						{ once: true },
					)
				},
			})
	},
)
