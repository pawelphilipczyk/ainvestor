import type { Handle } from 'remix/ui'

const trackClass =
	'relative h-3 w-full min-w-0 max-w-full overflow-hidden rounded-md bg-muted/80'
const fillClass = 'absolute inset-y-0 left-0 bg-primary/75'

/**
 * Decorative horizontal bar for 0–100% values (guideline targets, holdings share).
 * Callers supply the accessible name and an already-clamped width percent.
 */
export function PercentageBar(_handle: Handle, _setup?: unknown) {
	return (props: { ariaLabel: string; widthPercent: number }) => {
		return (
			<div class={trackClass} role="img" aria-label={props.ariaLabel}>
				<div
					class={fillClass}
					style={{ width: `${props.widthPercent}%` }}
					aria-hidden
				/>
			</div>
		)
	}
}
