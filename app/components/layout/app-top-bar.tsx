import type { Handle } from 'remix/component'
import { t } from '../../lib/i18n.ts'
import { routes } from '../../routes.ts'
import { getShellReturnPath, getUiLocale } from '../../lib/ui-locale.ts'
import { Link } from '../navigation/link.tsx'
import { ThemeToggleInteractions } from '../navigation/theme-toggle.component.js'
import { ThemeToggleButton } from '../navigation/theme-toggle.tsx'
import { AppBranding } from './app-branding.tsx'
import { SessionProvider } from './session-provider.tsx'

/**
 * Server-rendered top bar: branding on small screens; sign-in, username, theme toggle, then sidebar toggle on the right.
 */
export function AppTopBar(handle: Handle, _setup?: unknown) {
	return () => {
		const session = handle.context.get(SessionProvider)?.session ?? null
		const activeUiLocale = getUiLocale()
		const shellReturnPath = getShellReturnPath()
		return (
			<>
				<div class="sticky top-0 z-30 flex min-h-14 items-center border-b border-border bg-background px-4 py-2.5 md:ml-64">
					<div class="flex min-w-0 flex-1 items-center md:hidden">
						<AppBranding />
					</div>
					<div class="ml-auto flex items-center gap-3">
						<div
							class="flex items-center gap-1 rounded-md border border-border bg-background p-0.5"
							role="group"
							aria-label={t('chrome.aria.language')}
						>
							<form method="post" action={routes.locale.set.href()}>
								<input type="hidden" name="locale" value="en" />
								<input
									type="hidden"
									name="shellReturnPath"
									value={shellReturnPath}
								/>
								<button
									type="submit"
									aria-pressed={activeUiLocale === 'en'}
									class={`rounded px-2 py-1 text-xs font-medium transition-colors ${activeUiLocale === 'en' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
								>
									{t('chrome.language.en')}
								</button>
							</form>
							<form method="post" action={routes.locale.set.href()}>
								<input type="hidden" name="locale" value="pl" />
								<input
									type="hidden"
									name="shellReturnPath"
									value={shellReturnPath}
								/>
								<button
									type="submit"
									aria-pressed={activeUiLocale === 'pl'}
									class={`rounded px-2 py-1 text-xs font-medium transition-colors ${activeUiLocale === 'pl' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
								>
									{t('chrome.language.pl')}
								</button>
							</form>
						</div>
						{session ? (
							<span class="hidden text-xs font-medium text-muted-foreground sm:inline">
								@{session.login}
								{session.approvalStatus === 'pending' ? (
									<span class="ml-1 text-amber-500/90">
										{t('chrome.pendingShort')}
									</span>
								) : null}
							</span>
						) : (
							<Link
								href={routes.auth.login.href()}
								navigationLoading={true}
								class="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								{t('chrome.signIn')}
							</Link>
						)}
						<ThemeToggleButton />
						<button
							data-sidebar-toggle
							type="button"
							aria-label={t('chrome.aria.openNav')}
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
