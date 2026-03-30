import type { Handle, RemixNode } from 'remix/component'

/** Provided to descendants via `handle.context` (see `TabsNav`). */
export type TabsNavContext = {
	activeId: string
	/** When set, tab links get `data-tab-scroll-key` for {@link TabsNavScrollRestoration}. */
	scrollGroupId?: string
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
		/** Enables window scroll restore across full navigations between these tabs (sessionStorage). */
		scrollGroupId?: string
		children?: RemixNode
		class?: string
		[key: string]: unknown
	}) => {
		const {
			activeId,
			scrollGroupId,
			children,
			class: className,
			...rest
		} = props
		handle.context.set({ activeId, scrollGroupId })
		const navClass =
			`flex flex-wrap gap-2 border-b border-border pb-px ${className ?? ''}`.trim()
		return (
			<nav
				{...rest}
				class={navClass}
				{...(scrollGroupId !== undefined
					? { 'data-tab-scroll-group': scrollGroupId }
					: {})}
			>
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
		const tabsContext = handle.context.get(TabsNav) as
			| TabsNavContext
			| undefined
		if (tabsContext === undefined) {
			throw new Error('TabLink must be used inside TabsNav')
		}
		const isActive = props.id === tabsContext.activeId
		const scrollKeyAttr =
			tabsContext.scrollGroupId !== undefined
				? { 'data-tab-scroll-key': props.id }
				: {}
		return (
			<a
				href={props.href}
				rmx-document
				class={isActive ? tabActiveClass : tabInactiveClass}
				aria-current={isActive ? 'page' : undefined}
				{...scrollKeyAttr}
			>
				{props.children}
			</a>
		)
	}
}
