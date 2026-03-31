import type { Handle } from 'remix/component'
import { isPreview } from '../lib/gist.ts'
import { t } from '../lib/i18n.ts'
import { routes } from '../routes.ts'

/**
 * App name (links home) and optional Preview chip for chrome (sidebar, top bar on small screens).
 */
export function AppBranding(_handle: Handle, _setup?: unknown) {
	return () => (
		<div class="flex min-w-0 items-center gap-2">
			<a
				href={routes.home.index.href()}
				class="truncate text-sm font-semibold text-foreground no-underline outline-none transition-colors hover:text-foreground/90 focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
			>
				{t('app.name')}
			</a>
			{isPreview() ? (
				<span
					class="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/30 dark:text-amber-400"
					role="status"
				>
					{t('app.previewChip')}
				</span>
			) : null}
		</div>
	)
}
