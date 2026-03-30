import type { Handle } from 'remix/component'
import {
	busyControlLabelClass,
	busyControlOverlayClass,
	busyControlRootStateClasses,
	busyControlSpinnerClass,
} from './busy-control-overlay.ts'
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
 * Server-rendered submit button. Fetch-submit sets `data-loading` + `aria-busy`
 * and shows a centered spinner (label hidden), matching {@link Link} navigation loading.
 */
export function SubmitButton(_handle: Handle, _setup?: unknown) {
	return (props: SubmitButtonProps) => {
		const { children, disabled, compact: compactProp, class: classProp } = props
		const baseClasses = compactProp
			? submitButtonCompactClasses
			: submitButtonDefaultClasses
		const className =
			`${busyControlRootStateClasses} ${baseClasses} ${classProp ?? ''}`.trim()
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
