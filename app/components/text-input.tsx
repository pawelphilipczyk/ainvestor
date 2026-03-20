import type { Handle } from 'remix/component'

const controlClass =
	'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const controlCompactClass =
	'h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

type TextInputProps = {
	id: string
	fieldName: string
	placeholder: string
	required?: boolean
	inputType?: 'text' | 'search'
	/** Server-rendered value for controlled inputs (e.g. GET search). */
	value?: string
	size?: 'default' | 'compact'
	/** Extra Tailwind classes merged onto the control. */
	class?: string
}

/**
 * Server-rendered text or search input (label is composed separately).
 */
export function TextInput(_handle: Handle, _setup?: unknown) {
	return (props: TextInputProps) => {
		const inputType = props.inputType ?? 'text'
		const size = props.size ?? 'default'
		const base = size === 'compact' ? controlCompactClass : controlClass
		const controlClassMerged = `${base} ${props.class ?? ''}`.trim()
		return (
			<input
				id={props.id}
				name={props.fieldName}
				type={inputType}
				required={props.required}
				placeholder={props.placeholder}
				autocomplete="off"
				class={controlClassMerged}
				{...(props.value !== undefined ? { value: props.value } : {})}
			/>
		)
	}
}
