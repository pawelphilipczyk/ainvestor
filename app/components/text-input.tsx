import type { Handle } from 'remix/component'

type TextInputProps = {
	id: string
	label: string
	fieldName: string
	placeholder: string
	required?: boolean
}

/**
 * Server-rendered text input field.
 */
export function TextInput(_handle: Handle, _setup?: unknown) {
	return (props: TextInputProps) => (
		<div>
			<label
				for={props.id}
				class="mb-1 block text-sm font-semibold text-foreground"
			>
				{props.label}
			</label>
			<input
				id={props.id}
				name={props.fieldName}
				type="text"
				required={props.required}
				placeholder={props.placeholder}
				autocomplete="off"
				class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
			/>
		</div>
	)
}
