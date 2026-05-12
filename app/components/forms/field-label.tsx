import type { Handle } from 'remix/ui'

const variantClasses = {
	field: 'mb-1 block text-sm font-semibold text-foreground',
	screenReader: 'sr-only',
	filter: 'mb-1 block text-xs font-medium text-muted-foreground',
	/** Tight row labels (e.g. inline portfolio edits). */
	dense:
		'mb-0.5 block text-[11px] font-medium leading-tight text-muted-foreground',
} as const

export type FieldLabelVariant = keyof typeof variantClasses

export type FieldLabelProps = {
	fieldId: string
	variant?: FieldLabelVariant
	children: string
}

/**
 * Server-rendered `<label>` for use next to {@link TextInput}, {@link NumberInput}, etc.
 * Layout (grid, gap, columns) stays in the parent.
 */
export function FieldLabel(handle: Handle<FieldLabelProps>) {
	return () => {
		const key = handle.props.variant ?? 'field'
		return (
			<label for={handle.props.fieldId} class={variantClasses[key]}>
				{handle.props.children}
			</label>
		)
	}
}
