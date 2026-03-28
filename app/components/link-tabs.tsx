import type { Handle, RemixNode } from 'remix/component'

export type LinkTabItem = {
	/** Stable id used with `activeId` to mark the current tab. */
	id: string
	href: string
	label: RemixNode
}

const tabBaseClass =
	'rounded-t-md px-4 py-2 text-sm font-medium no-underline outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

const tabInactiveClass = `${tabBaseClass} text-muted-foreground hover:text-card-foreground`

const tabActiveClass = `${tabBaseClass} -mb-px border border-b-0 border-border bg-muted/60 text-card-foreground`

/**
 * Underline-style tab strip: each tab is a plain link (progressive enhancement).
 * Pass translated labels from the caller; this component stays string-agnostic.
 */
export function LinkTabs(_handle: Handle, _setup?: unknown) {
	return (props: {
		/** Accessible name for the tab list, e.g. from `t('…')`. */
		navAriaLabel: string
		activeId: string
		tabs: LinkTabItem[]
		class?: string
	}) => {
		const navClass =
			`flex flex-wrap gap-2 border-b border-border pb-px ${props.class ?? ''}`.trim()
		return (
			<nav class={navClass} aria-label={props.navAriaLabel}>
				{props.tabs.map((tab) => {
					const isActive = tab.id === props.activeId
					return (
						<a
							key={tab.id}
							href={tab.href}
							class={isActive ? tabActiveClass : tabInactiveClass}
							aria-current={isActive ? 'page' : undefined}
						>
							{tab.label}
						</a>
					)
				})}
			</nav>
		)
	}
}
