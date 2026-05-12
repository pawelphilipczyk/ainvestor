import type { Handle, Props } from 'remix/ui'
import {
	textNumberControlCompactClasses,
	textNumberControlDefaultClasses,
} from './form-control-classes.ts'

/** When `inputmode` is set without an explicit `pattern`, keep a minimal numeric constraint (browser + `checkValidity`). */
const DEFAULT_PATTERN_FOR_INPUTMODE_NUMERIC = '[0-9]*'
const DEFAULT_PATTERN_FOR_INPUTMODE_DECIMAL_LIKE = String.raw`(?=.*\d)[\d\s.,]+`

function defaultPatternForInputMode(mode: string): string {
	return mode === 'numeric'
		? DEFAULT_PATTERN_FOR_INPUTMODE_NUMERIC
		: DEFAULT_PATTERN_FOR_INPUTMODE_DECIMAL_LIKE
}

export type NumberInputProps = Omit<Props<'input'>, 'class'> & {
	class?: string
	/** Layout density; matches {@link TextInput} `compact`. */
	compact?: boolean
}

/**
 * Server-rendered number field (label is composed separately).
 * Forwards native `<input>` props; defaults `type="number"` with `min={0}` and `step="any"`.
 * With `inputMode` / `inputmode`, renders `type="text"` and a numeric keypad on mobile while keeping locale-style punctuation.
 *
 * Spreads use a cast: Remix `Props<'input'>` is a discriminated union (e.g. `list` with combobox), so a generic rest bag does not narrow for TS.
 */
export function NumberInput(handle: Handle<NumberInputProps>) {
	return () => {
		const {
			type: typeProp,
			min = 0,
			max,
			step = 'any',
			autocomplete = 'off',
			class: classProp,
			compact: compactProp,
			inputMode,
			inputmode,
			pattern: patternProp,
			...rest
		} = handle.props
		const sizeClasses = compactProp
			? textNumberControlCompactClasses
			: textNumberControlDefaultClasses
		const inputClasses = `${sizeClasses} ${classProp ?? ''}`.trim()
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
					...(patternProp !== undefined ? { pattern: patternProp } : {}),
				} as Props<'input'>)}
			/>
		)
	}
}
