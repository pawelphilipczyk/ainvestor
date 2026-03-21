import type { Handle } from 'remix/component'

const controlClasses =
	'box-border block w-full min-w-0 max-w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Mirrors `<textarea>` attributes (see MDN). */
type TextareaInputProps = {
	id: string
	placeholder?: string
	rows: number
	name?: string
	required?: boolean
	disabled?: boolean
	form?: string
	readOnly?: boolean
	value?: string
	defaultValue?: string
	class?: string
}

/**
 * Server-rendered textarea (label is composed separately).
 */
export function TextareaInput(_handle: Handle, _setup?: unknown) {
	return (props: TextareaInputProps) => {
		const {
			class: classProp,
			id,
			name,
			placeholder,
			rows,
			required,
			disabled,
			form,
			readOnly,
			value,
			defaultValue,
		} = props
		const inputClasses = `${controlClasses} ${classProp ?? ''}`.trim()
		const valueAttr = value !== undefined ? { value } : {}
		return (
			<textarea
				cols={1}
				id={id}
				name={name}
				placeholder={placeholder}
				rows={rows}
				required={required}
				disabled={disabled}
				form={form}
				readOnly={readOnly}
				defaultValue={defaultValue}
				class={inputClasses}
				{...valueAttr}
			/>
		)
	}
}
