import { t } from '../../lib/i18n.ts'
import { busyControlSpinnerClass } from '../forms/busy-control-overlay.ts'

/**
 * Shown as `<Frame fallback={…}>` while SSR streams the real frame HTML after the document shell.
 * Remix treats frames with `fallback` as non-blocking during the initial byte stream.
 */
export function frameLoadingPlaceholder() {
	return (
		<div
			role="status"
			aria-busy="true"
			class="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground"
		>
			<span class={busyControlSpinnerClass} aria-hidden="true" />
			<span>{t('chrome.loading')}</span>
		</div>
	)
}
