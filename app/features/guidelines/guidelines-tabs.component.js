import { clientEntry, createElement } from 'remix/ui'
import { Context, list, panel, root, tab } from 'remix/ui/tabs/primitives'

const listClass = 'flex flex-wrap gap-2 border-b border-border pb-px'

const tabClass =
	'rounded-t-md px-4 py-2 text-sm font-medium outline-none transition-colors text-muted-foreground hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&[data-state=active]]:-mb-px [&[data-state=active]]:border [&[data-state=active]]:border-b-0 [&[data-state=active]]:border-border [&[data-state=active]]:bg-muted/60 [&[data-state=active]]:text-card-foreground'

// `rounded-xl border border-border shadow-sm bg-muted/20`, Card's own
// "muted" variant classes (app/components/data-display/card.tsx), inlined —
// a `.component.js` client entry can't import a `.tsx` component, it's
// served to the browser as-is with no build step. `rounded-t-none
// border-t-0` seats it flush under the tab list, matching the old
// `<Card variant="muted" class="rounded-t-none border-t-0 p-4">`.
const panelClass =
	'rounded-xl rounded-t-none border border-t-0 border-border bg-muted/20 p-4 shadow-sm'

/**
 * Real, same-page tab switching — the Remix team's own documented usage
 * (`node_modules/remix/src/ui/tabs/README.md`: "Use it when related views
 * share the same page space"), unlike `tabs-nav.tsx`'s per-page navigation.
 * Both panels render into the DOM up front; `panel()` toggles which one is
 * visible entirely client-side — no fetch, no URL change.
 *
 * Deliberate exception to this app's "must function with little or no
 * JavaScript" rule (`docs/UI_ARCHITECTURE_GUIDELINES.md` §3): the *initial*
 * tab still renders correctly with no JS (`defaultActiveTab` comes from the
 * page's own `?tab=` query param, read server-side), but *switching* tabs
 * needs JavaScript — `tab()`'s whole activation model is a client-side
 * `hidden`/`inert` toggle with no native fallback. Accepted for this widget;
 * see `docs/REMIX_RC_MIGRATION_STATUS.md`.
 */
export const GuidelinesTabs = clientEntry(
	'/features/guidelines/guidelines-tabs.component.js#GuidelinesTabs',
	function GuidelinesTabs(handle) {
		return () =>
			createElement(
				Context,
				{ defaultActiveTab: handle.props.activeAddTab },
				createElement(
					'div',
					{ mix: [root()] },
					createElement(
						'div',
						{
							mix: [list()],
							class: listClass,
							'aria-label': handle.props.navAriaLabel,
						},
						createElement(
							'button',
							{
								type: 'button',
								mix: [tab({ name: 'bucket' })],
								class: tabClass,
							},
							handle.props.bucketLabel,
						),
						createElement(
							'button',
							{
								type: 'button',
								mix: [tab({ name: 'instrument' })],
								class: tabClass,
							},
							handle.props.instrumentLabel,
						),
					),
					createElement(
						'div',
						{ mix: [panel({ name: 'bucket' })], class: panelClass },
						handle.props.bucketPanel,
					),
					createElement(
						'div',
						{ mix: [panel({ name: 'instrument' })], class: panelClass },
						handle.props.instrumentPanel,
					),
				),
			)
	},
)
