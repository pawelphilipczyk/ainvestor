import type { Handle, Props } from 'remix/component'

const controlClasses =
	'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Server-rendered number field (label is composed separately).
 * Forwards native `<input>` props; defaults `type="number"` with `min={0}` and `step="any"`.
 * With `inputMode` / `inputmode`, renders `type="text"` and a numeric keypad on mobile while keeping locale-style punctuation.
 *
 * Spreads use a cast: Remix `Props<'input'>` is a discriminated union (e.g. `list` with combobox), so a generic rest bag does not narrow for TS.
 */
export function NumberInput(_handle: Handle, _setup?: unknown) {
	return (props: Omit<Props<'input'>, 'class'> & { class?: string }) => {
		const {
			type: typeProp,
			min = 0,
			max,
			step = 'any',
			autocomplete = 'off',
			class: classProp,
			inputMode,
			inputmode,
			...rest
		} = props
		const inputClasses = `${controlClasses} ${classProp ?? ''}`.trim()
		const forwardInputMode = inputMode ?? inputmode

		if (forwardInputMode !== undefined) {
			return (
				<input
					{...({
						...rest,
						type: 'text',
						inputmode: forwardInputMode,
						autocomplete,
						class: `${inputClasses} tabular-nums`.trim(),
					} as Props<'input'>)}
				/>
			)
		}

		return (
			<input
				{...({
					...rest,
					type: typeProp ?? 'number',
					min,
					max,
					step,
					autocomplete,
					class: inputClasses,
				} as Props<'input'>)}
			/>
		)
	}
}
