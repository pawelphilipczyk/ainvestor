import type { Handle } from 'remix/ui'

type BadgeProps = {
	children: string
}

/**
 * Server-rendered badge for displaying values (e.g. portfolio entry value).
 */
export function Badge(_handle: Handle, _setup?: unknown) {
	return (props: BadgeProps) => (
		<span class="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground whitespace-nowrap">
			{props.children}
		</span>
	)
}
