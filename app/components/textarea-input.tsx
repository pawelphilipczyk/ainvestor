import type { Handle } from 'remix/component'

const controlClass =
	'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

type TextareaInputProps = {
	id: string
	placeholder: string
	rows: number
	/** Omit when the control is not part of a form submit (e.g. paste-only UI). */
	fieldName?: string
	required?: boolean
	/** Extra Tailwind classes merged onto the control. */
	class?: string
}

/**
 * Server-rendered textarea (label is composed separately).
 */
export function TextareaInput(_handle: Handle, _setup?: unknown) {
	return (props: TextareaInputProps) => {
		const controlClassMerged = `${controlClass} ${props.class ?? ''}`.trim()
		return (
			<textarea
				id={props.id}
				name={props.fieldName}
				rows={props.rows}
				required={props.required}
				placeholder={props.placeholder}
				class={controlClassMerged}
			/>
		)
	}
}
