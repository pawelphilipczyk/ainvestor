import { t } from '../../lib/i18n.ts'

/**
 * Shown as `<Frame fallback={…}>` while SSR streams the real frame HTML after the document shell.
 * Remix treats frames with `fallback` as non-blocking during the initial byte stream.
 */
export function frameLoadingPlaceholder() {
	return (
		<div
			role="status"
			aria-live="polite"
			class="rounded-md border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground"
		>
			{t('chrome.loading')}
		</div>
	)
}
