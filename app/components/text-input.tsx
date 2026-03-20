import type { Handle } from 'remix/component'

const controlClasses =
	'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const compactControlClasses =
	'h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Mirrors common `<input>` attributes (see MDN); `compact` is layout-only. */
type TextInputProps = {
	id: string
	name: string
	placeholder?: string
	required?: boolean
	disabled?: boolean
	value?: string
	defaultValue?: string
	form?: string
	readOnly?: boolean
	type?: 'text' | 'search'
	/** Layout density; not HTML `size` (character width). */
	compact?: boolean
	class?: string
	autocomplete?: string
}

/**
 * Server-rendered text or search input (label is composed separately).
 */
export function TextInput(_handle: Handle, _setup?: unknown) {
	return (props: TextInputProps) => {
		const {
			type: typeProp,
			compact: compactProp,
			class: classProp,
			value,
			autocomplete = 'off',
			id,
			name,
			placeholder,
			required,
			disabled,
			defaultValue,
			form,
			readOnly,
		} = props
		const inputType = typeProp ?? 'text'
		const sizeClasses = compactProp ? compactControlClasses : controlClasses
		const inputClasses = `${sizeClasses} ${classProp ?? ''}`.trim()
		const valueAttr = value !== undefined ? { value } : {}

		// Remix `AccessibleInputHTMLProps` discriminates on `type`; a single
		// `type={union}` does not narrow and can require `list` for combobox.
		if (inputType === 'search') {
			return (
				<input
					id={id}
					name={name}
					type="search"
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

		return (
			<input
				id={id}
				name={name}
				type="text"
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
