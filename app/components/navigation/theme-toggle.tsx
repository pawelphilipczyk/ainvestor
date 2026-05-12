import type { Handle } from 'remix/ui'
import { Button } from 'remix/ui/button'
import { t } from '../../lib/i18n.ts'
import { shellRemixToolbarSquareMix } from '../chrome/shell-remix-toolbar-mix.ts'

/**
 * Server-rendered theme toggle button.
 * Interactivity is provided by ThemeToggleInteractions (clientEntry) in theme-toggle.component.js.
 * Remix components must return a render function; setup runs once, the returned function runs on each render.
 */
export function ThemeToggleButton(_handle: Handle<Record<string, never>>) {
	return () => (
		<Button
			type="button"
			tone="ghost"
			mix={[shellRemixToolbarSquareMix]}
			data-theme-toggle
			aria-label={t('chrome.aria.toggleTheme')}
		>
			<span class="relative inline-flex h-4 w-4 shrink-0">
				<svg
					class="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="4" />
					<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
				</svg>
				<svg
					class="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
				</svg>
			</span>
		</Button>
	)
}
