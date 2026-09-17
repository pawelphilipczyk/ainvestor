/** Shared Tailwind classes for `tab()`-mixin tab bars. */
export const tabsListClass = 'flex flex-wrap gap-2 border-b border-border pb-px'

export const tabsTabClass =
	'rounded-t-md px-4 py-2 text-sm font-medium outline-none transition-colors text-muted-foreground hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&[data-state=active]]:-mb-px [&[data-state=active]]:border [&[data-state=active]]:border-b-0 [&[data-state=active]]:border-border [&[data-state=active]]:bg-muted/60 [&[data-state=active]]:text-card-foreground'
