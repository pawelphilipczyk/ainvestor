import type { Handle } from 'remix/component'
import { isPreview } from '../lib/gist.ts'

/**
 * App name and optional Preview chip for chrome (sidebar, top bar on small screens).
 */
export function AppBranding(_handle: Handle, _setup?: unknown) {
	return () => (
		<div class="flex min-w-0 items-center gap-2">
			<span class="truncate text-sm font-semibold text-foreground">
				AI Investor
			</span>
			{isPreview() ? (
				<span
					class="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/30 dark:text-amber-400"
					role="status"
				>
					Preview
				</span>
			) : null}
		</div>
	)
}
