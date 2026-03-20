import type { Handle } from 'remix/component'
import {
	FORM_CONTROL_CLASS,
	FORM_LABEL_CLASS,
	FORM_SELECT_DECORATION_CLASS,
} from './form-field-classes.ts'

type SelectOption = {
	value: string
	label: string
	selected?: boolean
}

type SelectInputProps = {
	id: string
	label: string
	fieldName: string
	options: SelectOption[]
}

/**
 * Server-rendered select/dropdown field.
 */
export function SelectInput(_handle: Handle, _setup?: unknown) {
	return (props: SelectInputProps) => (
		<div>
			<label for={props.id} class={FORM_LABEL_CLASS}>
				{props.label}
			</label>
			<select
				id={props.id}
				name={props.fieldName}
				class={`${FORM_CONTROL_CLASS} ${FORM_SELECT_DECORATION_CLASS}`}
			>
				{props.options.map((opt) => (
					<option value={opt.value} selected={opt.selected}>
						{opt.label}
					</option>
				))}
			</select>
		</div>
	)
}
