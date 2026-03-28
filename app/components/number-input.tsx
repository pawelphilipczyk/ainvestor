import type { Handle, Props } from 'remix/component'

const controlClasses =
	'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** When `inputmode` is set without an explicit `pattern`, keep a minimal numeric constraint (browser + `checkValidity`). */
const DEFAULT_PATTERN_FOR_INPUTMODE_NUMERIC = '[0-9]*'
const DEFAULT_PATTERN_FOR_INPUTMODE_DECIMAL_LIKE = String.raw`(?=.*\d)[\d\s.,]+`

function defaultPatternForInputMode(mode: string): string {
	return mode === 'numeric'
		? DEFAULT_PATTERN_FOR_INPUTMODE_NUMERIC
		: DEFAULT_PATTERN_FOR_INPUTMODE_DECIMAL_LIKE
}

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
			pattern: patternProp,
			...rest
		} = props
		const inputClasses = `${controlClasses} ${classProp ?? ''}`.trim()
		const forwardInputMode = inputMode ?? inputmode

		if (forwardInputMode !== undefined) {
			// `min` / `max` / `step` were peeled off above; they are not spread into `rest`.
			// For `type="text"` the browser ignores them anyway—use `pattern` / server parsing instead.
			const patternMissing =
				patternProp === undefined ||
				(typeof patternProp === 'string' && patternProp.trim() === '')
			const pattern = patternMissing
				? defaultPatternForInputMode(String(forwardInputMode))
				: patternProp
			return (
				<input
					{...({
						...rest,
						pattern,
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
