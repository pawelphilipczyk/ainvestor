import { css } from 'remix/ui'

/**
 * Square toolbar control (~36px) for `remix/ui/button` ghost chrome.
 * Zeros inherited `--rmx-button-label-padding-inline` so icon-only children sit centered.
 */
export const shellRemixToolbarSquareMix = css({
	'--rmx-button-label-padding-inline': '0px',
	minWidth: '2.25rem',
	minHeight: '2.25rem',
	paddingInline: '0',
})

/** Full-width sidebar row action (sign out) aligned with nav link padding. */
export const shellRemixSidebarNavRowMix = css({
	width: '100%',
	minHeight: 'auto',
	justifyContent: 'flex-start',
	borderRadius: 'var(--radius)',
	paddingInline: 'var(--rmx-space-md)',
	paddingBlock: '0.375rem',
})
