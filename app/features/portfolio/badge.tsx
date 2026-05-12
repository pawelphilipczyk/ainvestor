import type { Handle } from 'remix/ui'

export type BadgeProps = {
	children: string
}

/**
 * Server-rendered badge for displaying values (e.g. portfolio entry value).
 */
export function Badge(handle: Handle<BadgeProps>) {
	return () => (
		<span class="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground whitespace-nowrap">
			{handle.props.children}
		</span>
	)
}
