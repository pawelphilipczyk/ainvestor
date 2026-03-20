import type { Handle } from 'remix/component'

const controlClass =
	'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

type NumberInputProps = {
	id: string
	fieldName: string
	placeholder: string
	required?: boolean
	min?: number
	max?: number
	step?: string
	/** Extra Tailwind classes merged onto the control. */
	class?: string
}

/**
 * Server-rendered number input (label is composed separately).
 */
export function NumberInput(_handle: Handle, _setup?: unknown) {
	return (props: NumberInputProps) => {
		const controlClassMerged = `${controlClass} ${props.class ?? ''}`.trim()
		return (
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
				class={controlClassMerged}
			/>
		)
	}
}
