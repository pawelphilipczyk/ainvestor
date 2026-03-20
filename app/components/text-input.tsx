import type { Handle } from 'remix/component'
import { FORM_CONTROL_CLASS, FORM_LABEL_CLASS } from './form-field-classes.ts'

type TextInputProps = {
	id: string
	label: string
	fieldName: string
	placeholder: string
	required?: boolean
}

/**
 * Server-rendered text input field.
 */
export function TextInput(_handle: Handle, _setup?: unknown) {
	return (props: TextInputProps) => (
		<div>
			<label for={props.id} class={FORM_LABEL_CLASS}>
				{props.label}
			</label>
			<input
				id={props.id}
				name={props.fieldName}
				type="text"
				required={props.required}
				placeholder={props.placeholder}
				autocomplete="off"
				class={FORM_CONTROL_CLASS}
			/>
		</div>
	)
}
