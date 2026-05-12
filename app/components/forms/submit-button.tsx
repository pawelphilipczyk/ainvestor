import type { Handle } from 'remix/ui'
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
	/** Submitter name/value for multi-submit forms (e.g. buy vs sell). */
	name?: string
	value?: string
}

/**
 * Server-rendered submit button. Frame-submit and feature `clientEntry` handlers
 * set `data-loading` + `aria-busy` and show a centered spinner (label hidden),
 * matching {@link Link} navigation loading.
 */
export function SubmitButton(_handle: Handle, _setup?: unknown) {
	return (props: SubmitButtonProps) => {
		const {
			children,
			disabled,
			compact: compactProp,
			class: classProp,
			name,
			value,
		} = props
		const baseClasses = compactProp
			? submitButtonCompactClasses
			: submitButtonDefaultClasses
		const className =
			`${busyControlRootStateClasses} ${baseClasses} ${classProp ?? ''}`.trim()
		return (
			<button
				type="submit"
				disabled={disabled}
				class={className}
				{...(name !== undefined ? { name } : {})}
				{...(value !== undefined ? { value } : {})}
			>
				<span class={busyControlLabelClass}>{children}</span>
				<span class={busyControlOverlayClass} aria-hidden="true">
					<span class={busyControlSpinnerClass} />
				</span>
			</button>
		)
	}
}
