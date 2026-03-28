import type { Handle, RemixNode } from 'remix/component'

/** Provided to descendants via `handle.context` (see `TabsNav`). */
export type TabsNavContext = {
	activeId: string
}

const tabBaseClass =
	'rounded-t-md px-4 py-2 text-sm font-medium no-underline outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

const tabInactiveClass = `${tabBaseClass} text-muted-foreground hover:text-card-foreground`

const tabActiveClass = `${tabBaseClass} -mb-px border border-b-0 border-border bg-muted/60 text-card-foreground`

/**
 * Tab list wrapper: set `activeId` and nest {@link TabLink} children.
 * Remaining props are passed through to `<nav>` (e.g. `aria-label`, `class`).
 */
export function TabsNav(handle: Handle<TabsNavContext>, _setup?: unknown) {
	return (props: {
		activeId: string
		children?: RemixNode
		class?: string
		[key: string]: unknown
	}) => {
		const { activeId, children, class: className, ...rest } = props
		handle.context.set({ activeId })
		const navClass =
			`flex flex-wrap gap-2 border-b border-border pb-px ${className ?? ''}`.trim()
		return (
			<nav {...rest} class={navClass}>
				{children}
			</nav>
		)
	}
}

/**
 * One tab link; must be rendered inside {@link TabsNav}.
 */
export function TabLink(handle: Handle, _setup?: unknown) {
	return (props: { id: string; href: string; children?: RemixNode }) => {
		const ctx = handle.context.get(TabsNav) as TabsNavContext | undefined
		if (ctx === undefined) {
			throw new Error('TabLink must be used inside TabsNav')
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
