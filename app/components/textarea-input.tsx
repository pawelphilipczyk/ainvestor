import type { Handle } from 'remix/component'
import { FieldLabel, type FieldLabelVariant } from './field-label.tsx'
import { FORM_CONTROL_CLASS } from './form-field-classes.ts'

type TextareaInputProps = {
	id: string
	label: string
	placeholder: string
	rows: number
	/** Omit when the control is not part of a form submit (e.g. paste-only UI). */
	fieldName?: string
	required?: boolean
	labelVariant?: Extract<FieldLabelVariant, 'field' | 'screenReader'>
	controlClassName?: string
	wrapClassName?: string
}

/**
 * Server-rendered textarea with the same label/control styling as TextInput.
 */
export function TextareaInput(_handle: Handle, _setup?: unknown) {
	return (props: TextareaInputProps) => {
		const labelVariant = props.labelVariant ?? 'field'
		const controlClass =
			`${FORM_CONTROL_CLASS} ${props.controlClassName ?? ''}`.trim()
		return (
			<div class={props.wrapClassName}>
				<FieldLabel fieldId={props.id} variant={labelVariant}>
					{props.label}
				</FieldLabel>
				<textarea
					id={props.id}
					name={props.fieldName}
					rows={props.rows}
					required={props.required}
					placeholder={props.placeholder}
					class={controlClass}
				/>
			</div>
		)
	}
}
