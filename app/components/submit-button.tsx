import type { Handle } from 'remix/component'
import {
	busyControlLabelClass,
	busyControlOverlayClass,
	busyControlRootStateClasses,
	busyControlSpinnerClass,
} from './busy-control-overlay.ts'

type SubmitButtonProps = {
	children: string
	disabled?: boolean
	class?: string
}

/**
 * Server-rendered submit button. Fetch-submit sets `data-loading` + `aria-busy`
 * and shows a centered spinner (label hidden), matching {@link Link} navigation loading.
 */
export function SubmitButton(_handle: Handle, _setup?: unknown) {
	return (props: SubmitButtonProps) => {
		const { children, disabled, class: classProp } = props
		const className =
			`${busyControlRootStateClasses} w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none [&:disabled:not([aria-busy='true'])]:opacity-50 ${classProp ?? ''}`.trim()
		return (
			<button type="submit" disabled={disabled} class={className}>
				<span class={busyControlLabelClass}>{children}</span>
				<span class={busyControlOverlayClass} aria-hidden="true">
					<span class={busyControlSpinnerClass} />
				</span>
			</button>
		)
	}
}
