import type { Handle } from 'remix/component'
import {
	FORM_LABEL_CLASS,
	FORM_LABEL_FILTER_CLASS,
} from './form-field-classes.ts'

export type FieldLabelVariant = 'field' | 'screenReader' | 'filter'

type FieldLabelProps = {
	fieldId: string
	variant?: FieldLabelVariant
	children: string
}

function labelClassForVariant(variant: FieldLabelVariant): string {
	if (variant === 'screenReader') return 'sr-only'
	if (variant === 'filter') return FORM_LABEL_FILTER_CLASS
	return FORM_LABEL_CLASS
}

/**
 * Server-rendered `<label>` for form fields; keeps typography aligned with inputs.
 */
export function FieldLabel(_handle: Handle, _setup?: unknown) {
	return (props: FieldLabelProps) => {
		const variant = props.variant ?? 'field'
		return (
			<label for={props.fieldId} class={labelClassForVariant(variant)}>
				{props.children}
			</label>
		)
	}
}
