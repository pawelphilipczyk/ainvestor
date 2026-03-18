import type { Handle } from 'remix/component'

type SubmitButtonProps = {
	children: string
}

/**
 * Server-rendered submit button.
 */
export function SubmitButton(_handle: Handle, _setup?: unknown) {
	return (props: SubmitButtonProps) => (
		<button
			type="submit"
			class="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
		>
			{props.children}
		</button>
	)
}
