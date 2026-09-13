import { clientEntry, createElement, ref } from 'remix/ui'
import { Context, list, root, tab } from 'remix/ui/tabs/primitives'
import { setSubmitButtonLoading } from '../../components/client/submit-button-loading.component.js'

const FRAME_NAME = 'advice-result'

const listClass = 'flex flex-wrap gap-2 border-b border-border pb-px'

const tabClass =
	'rounded-t-md px-4 py-2 text-sm font-medium outline-none transition-colors text-muted-foreground hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&[data-state=active]]:-mb-px [&[data-state=active]]:border [&[data-state=active]]:border-b-0 [&[data-state=active]]:border-border [&[data-state=active]]:bg-muted/60 [&[data-state=active]]:text-card-foreground'

/**
 * Real, same-page tab switching for advice's two analysis modes — same
 * pattern as `guidelines-tabs.component.js`, but with no `panel()`: each
 * mode's content (its input form *and* its result) lives in the shared
 * `advice-result` Frame instead of two co-resident panels, because that
 * content is gist-backed and mode-specific — see `AdviceModePanel` in
 * `advice-page.tsx` and `docs/REMIX_RC_MIGRATION_STATUS.md` for the design
 * trace. Switching tabs here means pointing the Frame at the other mode's
 * fragment URL and reloading it, not toggling a `hidden` attribute.
 *
 * `FrameHandle.src` is a plain, live-read property (`@remix-run/ui`'s
 * `frame.js`: `resolveAndRenderReload` reads `frame.src` at reload time, not
 * a value captured once at creation), so setting it before calling
 * `reload()` is enough to fetch the new mode's content — the same handle
 * `watchFrameFormSubmissions` already uses for busy-state UX
 * (`app/components/client/frame-form-ux.component.js`), and that file's own
 * "reloadStart/reloadComplete fire for any reload of the named frame" note
 * applies here too: its listeners are gated on a tracked form's own submit,
 * so this tab-triggered reload doesn't spuriously touch it.
 *
 * Busy state on the clicked tab reuses `setSubmitButtonLoading` (the same
 * helper submit buttons use) rather than inventing a second convention.
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
			void frame.reload()
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
