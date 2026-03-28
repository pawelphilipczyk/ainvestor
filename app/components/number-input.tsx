import type { Handle, Props } from 'remix/component'

const controlClasses =
	'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

type NumberInputProps = Props<'input'> & {
	class?: string
}

/**
 * Server-rendered number field (label is composed separately).
 * Forwards native `<input>` props; defaults `type="number"` with `min={0}` and `step="any"`.
 * With `inputMode` / `inputmode`, renders `type="text"` and a numeric keypad on mobile while keeping locale-style punctuation.
 */
export function NumberInput(_handle: Handle, _setup?: unknown) {
	return (props: NumberInputProps) => {
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
					type="text"
					inputmode={forwardInputMode}
					autocomplete={autocomplete}
					class={`${inputClasses} tabular-nums`.trim()}
					{...rest}
				/>
			)
		}

		return (
			<input
				type={typeProp ?? 'number'}
				min={min}
				max={max}
				step={step}
				autocomplete={autocomplete}
				class={inputClasses}
				{...rest}
			/>
		)
	}
}
