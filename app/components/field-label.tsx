import type { Handle } from 'remix/component'

const variantClass = {
	field: 'mb-1 block text-sm font-semibold text-foreground',
	screenReader: 'sr-only',
	filter: 'mb-1 block text-xs font-medium text-muted-foreground',
} as const

export type FieldLabelVariant = keyof typeof variantClass

/**
 * Server-rendered `<label>` for use next to {@link TextInput}, {@link NumberInput}, etc.
 * Layout (grid, gap, columns) stays in the parent.
 */
export function FieldLabel(_handle: Handle, _setup?: unknown) {
	return (props: {
		fieldId: string
		variant?: FieldLabelVariant
		children: string
	}) => {
		const key = props.variant ?? 'field'
		return (
			<label for={props.fieldId} class={variantClass[key]}>
				{props.children}
			</label>
		)
	}
}
