import type { Handle } from 'remix/component'
import { FORM_CONTROL_CLASS, FORM_LABEL_CLASS } from './form-field-classes.ts'

type NumberInputProps = {
	id: string
	label: string
	fieldName: string
	placeholder: string
	required?: boolean
	min?: number
	max?: number
	step?: string
}

/**
 * Server-rendered number input field.
 */
export function NumberInput(_handle: Handle, _setup?: unknown) {
	return (props: NumberInputProps) => (
		<div>
			<label for={props.id} class={FORM_LABEL_CLASS}>
				{props.label}
			</label>
			<input
				id={props.id}
				name={props.fieldName}
				type="number"
				min={props.min ?? 0}
				max={props.max}
				step={props.step ?? 'any'}
				required={props.required}
				placeholder={props.placeholder}
				autocomplete="off"
				class={FORM_CONTROL_CLASS}
			/>
		</div>
	)
}
