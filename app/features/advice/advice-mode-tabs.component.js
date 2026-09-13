import { clientEntry, createElement, ref } from 'remix/ui'
import { Context, list, root, tab } from 'remix/ui/tabs/primitives'
import { setSubmitButtonLoading } from '../../components/client/submit-button-loading.component.js'
import {
	tabsListClass as listClass,
	tabsTabClass as tabClass,
} from '../../components/client/tabs-classes.component.js'

const FRAME_NAME = 'advice-result'

/**
 * Same-page tab switching for advice's two analysis modes. No `panel()`
 * (unlike `guidelines-tabs.component.js`): each mode's content is gist-backed
 * and mode-specific, so switching points the shared `advice-result` Frame at
 * the other mode's fragment URL and reloads it, instead of toggling a
 * `hidden` attribute. See `docs/UI_ARCHITECTURE_GUIDELINES.md` §11.
 */
export const AdviceModeTabs = clientEntry(
	'/features/advice/advice-mode-tabs.component.js#AdviceModeTabs',
	function AdviceModeTabs(handle) {
		let buyNextNode = null
		let portfolioReviewNode = null

		function nodeForMode(mode) {
			return mode === 'portfolio_review' ? portfolioReviewNode : buyNextNode
		}

		function frameSrcForMode(mode) {
			return mode === 'portfolio_review'
				? handle.props.portfolioReviewFrameSrc
				: handle.props.buyNextFrameSrc
		}

		function onActiveTabChange(nextMode) {
			const frame = handle.frames.get(FRAME_NAME)
			if (!frame) return
			const control = nodeForMode(nextMode)
			frame.src = frameSrcForMode(nextMode)
			setSubmitButtonLoading(control, true)
			frame.addEventListener(
				'reloadComplete',
				() => setSubmitButtonLoading(control, false),
				{ once: true },
			)
			frame.reload().catch(() => {})
		}

		return () =>
			createElement(
				Context,
				{ defaultActiveTab: handle.props.activeTab, onActiveTabChange },
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
								mix: [
									tab({ name: 'buy_next' }),
									ref((node) => {
										buyNextNode = node
									}),
								],
								class: tabClass,
							},
							handle.props.buyNextLabel,
						),
						createElement(
							'button',
							{
								type: 'button',
								mix: [
									tab({ name: 'portfolio_review' }),
									ref((node) => {
										portfolioReviewNode = node
									}),
								],
								class: tabClass,
							},
							handle.props.portfolioReviewLabel,
						),
					),
				),
			)
	},
)
