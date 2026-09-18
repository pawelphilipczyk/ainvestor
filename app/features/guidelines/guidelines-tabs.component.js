import { clientEntry, createElement } from 'remix/ui'
import { Context, list, panel, root, tab } from 'remix/ui/tabs/primitives'
import {
	tabsListClass as listClass,
	tabsTabClass as tabClass,
} from '../../components/client/tabs-classes.component.ts'

// Card's "muted" variant classes, inlined — a `.component.js` can't import a `.tsx` component.
const panelClass =
	'rounded-xl rounded-t-none border border-t-0 border-border bg-muted/20 p-4 shadow-sm'

/** Real, same-page tab switching — see `docs/UI_ARCHITECTURE_GUIDELINES.md` §11. */
export const GuidelinesTabs = clientEntry(
	`${import.meta.url}#GuidelinesTabs`,
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
