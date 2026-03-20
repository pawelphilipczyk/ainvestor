import type { Handle } from 'remix/component'
import { isPreview } from '../lib/gist.ts'
import { SessionProvider } from './session-provider.tsx'
// @ts-expect-error Runtime-only JS client entry module
import { ThemeToggleInteractions } from './theme-toggle.component.js'
import { ThemeToggleButton } from './theme-toggle.tsx'

/**
 * Server-rendered top bar with sidebar toggle, title, auth indicator, and theme toggle.
 * Session from SessionProvider context. Interactivity from ThemeToggleInteractions.
 */
export function AppTopBar(handle: Handle, _setup?: unknown) {
	return () => {
		const session = handle.context.get(SessionProvider)?.session ?? null
		return (
			<>
				<div class="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background px-4 py-2.5 md:ml-64">
					<div class="flex items-center gap-3">
						<button
							data-sidebar-toggle
							type="button"
							aria-label="Open navigation"
							aria-expanded="false"
							aria-controls="app-sidebar"
							class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
						>
							<svg
								class="h-4 w-4"
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<line x1="4" y1="6" x2="20" y2="6" />
								<line x1="4" y1="12" x2="20" y2="12" />
								<line x1="4" y1="18" x2="20" y2="18" />
							</svg>
						</button>
						<div class="flex items-center gap-2">
							<span class="text-sm font-semibold text-foreground">
								AI Investor
							</span>
							{isPreview() ? (
								<span
									class="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/30 dark:text-amber-400"
									role="status"
								>
									Preview
								</span>
							) : null}
						</div>
					</div>
					<div class="flex items-center gap-3">
						{session ? (
							<span class="hidden text-xs font-medium text-muted-foreground sm:inline">
								@{session.login}
							</span>
						) : null}
						<ThemeToggleButton />
					</div>
				</div>
				<ThemeToggleInteractions />
			</>
		)
	}
}
