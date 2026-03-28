import type { Handle } from 'remix/component'

type SubmitButtonProps = {
	children: string
	disabled?: boolean
	class?: string
}

/**
 * Server-rendered submit button.
 */
export function SubmitButton(_handle: Handle, _setup?: unknown) {
	return (props: SubmitButtonProps) => {
		const { children, disabled, class: classProp } = props
		const className =
			`w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none [&:disabled:not([aria-busy='true'])]:opacity-50 ${classProp ?? ''}`.trim()
		return (
			<button type="submit" disabled={disabled} class={className}>
				{children}
			</button>
		)
	}
}
