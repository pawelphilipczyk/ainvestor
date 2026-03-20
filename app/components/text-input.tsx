import type { Handle } from 'remix/component'

const controlClass =
	'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const controlCompactClass =
	'h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Server-rendered text or search input (label is composed separately).
 */
export function TextInput(_handle: Handle, _setup?: unknown) {
	return (props: {
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
	}) => {
		const inputType = props.inputType ?? 'text'
		const size = props.size ?? 'default'
		const base = size === 'compact' ? controlCompactClass : controlClass
		const controlClassMerged = `${base} ${props.class ?? ''}`.trim()
		const valueProps = props.value !== undefined ? { value: props.value } : {}

		// Remix `AccessibleInputHTMLProps` discriminates on `type`; a single
		// `type={union}` does not narrow and can require `list` for combobox.
		if (inputType === 'search') {
			return (
				<input
					id={props.id}
					name={props.fieldName}
					type="search"
					required={props.required}
					placeholder={props.placeholder}
					autocomplete="off"
					class={controlClassMerged}
					{...valueProps}
				/>
			)
		}

		return (
			<input
				id={props.id}
				name={props.fieldName}
				type="text"
				required={props.required}
				placeholder={props.placeholder}
				autocomplete="off"
				class={controlClassMerged}
				{...valueProps}
			/>
		)
	}
}
