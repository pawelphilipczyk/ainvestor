import type { Handle, RemixNode } from 'remix/component'

/** Provided to descendants via `handle.context` (see `LinkTabs`). */
export type LinkTabsContext = {
	activeId: string
}

const tabBaseClass =
	'rounded-t-md px-4 py-2 text-sm font-medium no-underline outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

const tabInactiveClass = `${tabBaseClass} text-muted-foreground hover:text-card-foreground`

const tabActiveClass = `${tabBaseClass} -mb-px border border-b-0 border-border bg-muted/60 text-card-foreground`

/**
 * Tab list wrapper: set `activeId` and place {@link LinkTab} children inside.
 * Uses link-based tabs (progressive enhancement).
 */
export function LinkTabs(handle: Handle<LinkTabsContext>, _setup?: unknown) {
	return (props: {
		/** Accessible name for the tab list, e.g. from `t('…')`. */
		navAriaLabel: string
		activeId: string
		class?: string
		children?: RemixNode
	}) => {
		handle.context.set({ activeId: props.activeId })
		const navClass =
			`flex flex-wrap gap-2 border-b border-border pb-px ${props.class ?? ''}`.trim()
		return (
			<nav class={navClass} aria-label={props.navAriaLabel}>
				{props.children}
			</nav>
		)
	}
}

/**
 * One tab link; must be rendered inside {@link LinkTabs}.
 */
export function LinkTab(handle: Handle, _setup?: unknown) {
	return (props: { id: string; href: string; children?: RemixNode }) => {
		const ctx = handle.context.get(LinkTabs) as LinkTabsContext | undefined
		if (ctx === undefined) {
			throw new Error('LinkTab must be used inside LinkTabs')
		}
		const isActive = props.id === ctx.activeId
		return (
			<a
				href={props.href}
				class={isActive ? tabActiveClass : tabInactiveClass}
				aria-current={isActive ? 'page' : undefined}
			>
				{props.children}
			</a>
		)
	}
}
