import type { Handle } from 'remix/component'
import { routes } from '../routes.ts'
import { AppBranding } from './app-branding.tsx'
import { SessionProvider } from './session-provider.tsx'
// @ts-expect-error TS7016 — runtime-only remix `clientEntry` (theme-toggle.component.js); `ThemeToggleButton` below is the SSR half of the same feature.
import { ThemeToggleInteractions } from './theme-toggle.component.js'
import { ThemeToggleButton } from './theme-toggle.tsx'

/**
 * Server-rendered top bar: branding on small screens; sign-in, username, theme toggle, then sidebar toggle on the right.
 */
export function AppTopBar(handle: Handle, _setup?: unknown) {
	return () => {
		const session = handle.context.get(SessionProvider)?.session ?? null
		return (
			<>
				<div class="sticky top-0 z-30 flex min-h-14 items-center border-b border-border bg-background px-4 py-2.5 md:ml-64">
					<div class="flex min-w-0 flex-1 items-center md:hidden">
						<AppBranding />
					</div>
					<div class="ml-auto flex items-center gap-3">
						{session ? (
							<span class="hidden text-xs font-medium text-muted-foreground sm:inline">
								@{session.login}
								{session.approvalStatus === 'pending' ? (
									<span class="ml-1 text-amber-500/90">(pending)</span>
								) : null}
							</span>
						) : (
							<a
								href={routes.auth.login.href()}
								class="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								Sign in
							</a>
						)}
						<ThemeToggleButton />
						<button
							data-sidebar-toggle
							type="button"
							aria-label="Open navigation"
							aria-expanded="false"
							aria-controls="app-sidebar"
							class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
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
					</div>
				</div>
				<ThemeToggleInteractions />
			</>
		)
	}
}
