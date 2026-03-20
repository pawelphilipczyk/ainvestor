import type { Handle } from 'remix/component'
import { FieldLabel, type FieldLabelVariant } from './field-label.tsx'
import {
	FORM_CONTROL_CLASS,
	FORM_CONTROL_COMPACT_CLASS,
} from './form-field-classes.ts'

type TextInputProps = {
	id: string
	label: string
	fieldName: string
	placeholder: string
	required?: boolean
	labelVariant?: FieldLabelVariant
	inputType?: 'text' | 'search'
	/** Server-rendered value for controlled inputs (e.g. GET search). */
	value?: string
	size?: 'default' | 'compact'
	inputClassName?: string
	wrapClassName?: string
}

/**
 * Server-rendered text or search input field.
 */
export function TextInput(_handle: Handle, _setup?: unknown) {
	return (props: TextInputProps) => {
		const labelVariant = props.labelVariant ?? 'field'
		const inputType = props.inputType ?? 'text'
		const size = props.size ?? 'default'
		const baseControl =
			size === 'compact' ? FORM_CONTROL_COMPACT_CLASS : FORM_CONTROL_CLASS
		const controlClass = `${baseControl} ${props.inputClassName ?? ''}`.trim()
		return (
			<div class={props.wrapClassName}>
				<FieldLabel fieldId={props.id} variant={labelVariant}>
					{props.label}
				</FieldLabel>
				<input
					id={props.id}
					name={props.fieldName}
					type={inputType}
					required={props.required}
					placeholder={props.placeholder}
					autocomplete="off"
					class={controlClass}
					{...(props.value !== undefined ? { value: props.value } : {})}
				/>
			</div>
		)
	}
}
