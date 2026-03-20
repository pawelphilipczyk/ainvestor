import type { Handle } from 'remix/component'

const controlClasses =
	'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Mirrors `<input type="number">` attributes (see MDN). */
type NumberInputProps = {
	id: string
	name: string
	placeholder?: string
	required?: boolean
	disabled?: boolean
	min?: number
	max?: number
	step?: string | number
	value?: string | number
	defaultValue?: string | number
	form?: string
	readOnly?: boolean
	class?: string
	autocomplete?: string
}

/**
 * Server-rendered number input (label is composed separately).
 */
export function NumberInput(_handle: Handle, _setup?: unknown) {
	return (props: NumberInputProps) => {
		const {
			class: classProp,
			min = 0,
			max,
			step = 'any',
			autocomplete = 'off',
			id,
			name,
			placeholder,
			required,
			disabled,
			value,
			defaultValue,
			form,
			readOnly,
		} = props
		const inputClasses = `${controlClasses} ${classProp ?? ''}`.trim()
		const valueAttr = value !== undefined ? { value } : {}
		return (
			<input
				id={id}
				name={name}
				type="number"
				min={min}
				max={max}
				step={step}
				placeholder={placeholder}
				required={required}
				disabled={disabled}
				defaultValue={defaultValue}
				form={form}
				readOnly={readOnly}
				autocomplete={autocomplete}
				class={inputClasses}
				{...valueAttr}
			/>
		)
	}
}
