import type { Handle } from 'remix/ui'
import {
	textNumberControlCompactClasses,
	textNumberControlDefaultClasses,
} from './form-control-classes.ts'

/** Mirrors common `<input>` attributes (see MDN); `compact` is layout-only. */
export type TextInputProps = {
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
export function TextInput(handle: Handle<TextInputProps>) {
	return () => {
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
		} = handle.props
		const inputType = typeProp ?? 'text'
		const sizeClasses = compactProp
			? textNumberControlCompactClasses
			: textNumberControlDefaultClasses
		const searchAppearanceReset =
			inputType === 'search' ? 'appearance-none' : ''
		const inputClasses =
			`${sizeClasses} ${searchAppearanceReset} ${classProp ?? ''}`.trim()
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
