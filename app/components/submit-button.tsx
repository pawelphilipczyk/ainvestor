import type { Handle } from 'remix/component'
import {
	submitButtonCompactClasses,
	submitButtonDefaultClasses,
} from './form-control-classes.ts'

type SubmitButtonProps = {
	children: string
	disabled?: boolean
	/** When true, use the same height as {@link TextInput} / {@link SelectInput} with `compact`. */
	compact?: boolean
	class?: string
}

/**
 * Server-rendered submit button.
 */
export function SubmitButton(_handle: Handle, _setup?: unknown) {
	return (props: SubmitButtonProps) => {
		const { children, disabled, compact: compactProp, class: classProp } = props
		const baseClasses = compactProp
			? submitButtonCompactClasses
			: submitButtonDefaultClasses
		const className = `${baseClasses} ${classProp ?? ''}`.trim()
		return (
			<button type="submit" disabled={disabled} class={className}>
				{children}
			</button>
		)
	}
}
