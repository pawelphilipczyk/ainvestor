import type { Handle } from 'remix/component'

export type FieldLabelVariant = 'field' | 'screenReader' | 'filter'

const fieldClass = 'mb-1 block text-sm font-semibold text-foreground'
const filterClass = 'mb-1 block text-xs font-medium text-muted-foreground'

type FieldLabelProps = {
	fieldId: string
	variant?: FieldLabelVariant
	children: string
}

function labelClassForVariant(variant: FieldLabelVariant): string {
	if (variant === 'screenReader') return 'sr-only'
	if (variant === 'filter') return filterClass
	return fieldClass
}

/**
 * Server-rendered `<label>` for use next to {@link TextInput}, {@link NumberInput}, etc.
 * Layout (grid, gap, columns) stays in the parent.
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
