import { clientEntry, createElement, ref } from 'remix/ui'
import { Context, list, root, tab } from 'remix/ui/tabs/primitives'
import { setSubmitButtonLoading } from '../../components/client/submit-button-loading.component.ts'
import {
	tabsListClass as listClass,
	tabsTabClass as tabClass,
} from '../../components/client/tabs-classes.component.ts'

const FRAME_NAME = 'advice-result'

/**
 * Same-page tab switching for advice's two analysis modes. No `panel()`
 * (unlike `guidelines-tabs.component.ts`): each mode's content is gist-backed
 * and mode-specific, so switching points the shared `advice-result` Frame at
 * the other mode's fragment URL and reloads it, instead of toggling a
 * `hidden` attribute. See `docs/UI_ARCHITECTURE_GUIDELINES.md` §11.
 */
/**
 * The two analysis modes. The deleted `.d.ts` sidecar typed `activeTab` as a
 * bare `string`; the call site has always passed this union, so the sidecar
 * was looser than the truth it claimed to describe.
 */
type AdviceMode = 'buy_next' | 'portfolio_review'

export const AdviceModeTabs = clientEntry<{
	activeTab: AdviceMode
	navAriaLabel: string
	buyNextLabel: string
	portfolioReviewLabel: string
	buyNextFrameSrc: string
	portfolioReviewFrameSrc: string
}>(`${import.meta.url}#AdviceModeTabs`, function AdviceModeTabs(handle) {
	let buyNextNode: HTMLElement | null = null
	let portfolioReviewNode: HTMLElement | null = null

	function nodeForMode(mode: AdviceMode) {
		return mode === 'portfolio_review' ? portfolioReviewNode : buyNextNode
	}

	function frameSrcForMode(mode: AdviceMode) {
		return mode === 'portfolio_review'
			? handle.props.portfolioReviewFrameSrc
			: handle.props.buyNextFrameSrc
	}

	function onActiveTabChange(nextMode: AdviceMode) {
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
									buyNextNode = node instanceof HTMLElement ? node : null
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
									portfolioReviewNode =
										node instanceof HTMLElement ? node : null
								}),
							],
							class: tabClass,
						},
						handle.props.portfolioReviewLabel,
					),
				),
			),
		)
})
