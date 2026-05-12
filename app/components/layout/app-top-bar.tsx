import type { Handle } from 'remix/ui'
import { Button } from 'remix/ui/button'
import { t } from '../../lib/i18n.ts'
import { getShellReturnPath, getUiLocale } from '../../lib/ui-locale.ts'
import { routes } from '../../routes.ts'
import { shellRemixToolbarSquareMix } from '../chrome/shell-remix-toolbar-mix.ts'
import { Link } from '../navigation/link.tsx'
import { ThemeToggleInteractions } from '../navigation/theme-toggle.component.js'
import { ThemeToggleButton } from '../navigation/theme-toggle.tsx'
import { AppBranding } from './app-branding.tsx'
import { LocaleSelectSubmit } from './locale-select.component.js'
import type { SessionContext } from './session-provider.tsx'
import { SessionProvider } from './session-provider.tsx'

/**
 * Server-rendered top bar: branding on small screens; sign-in, username, theme toggle, then sidebar toggle on the right.
 */
export function AppTopBar(
	handle: Handle<Record<string, never>, SessionContext>,
) {
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
						<form
							method="post"
							action={routes.locale.set.href()}
							class="flex shrink-0 items-center"
						>
							<label class="sr-only" for="ui-locale-select">
								{t('chrome.aria.language')}
							</label>
							<input
								type="hidden"
								name="shellReturnPath"
								value={shellReturnPath}
							/>
							<select
								id="ui-locale-select"
								name="locale"
								data-ui-locale-select
								class="h-9 max-w-[11rem] cursor-pointer rounded-md border border-border bg-background px-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<option value="en" selected={activeUiLocale === 'en'}>
									{t('chrome.language.en')}
								</option>
								<option value="pl" selected={activeUiLocale === 'pl'}>
									{t('chrome.language.pl')}
								</option>
							</select>
						</form>
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
						<Button
							type="button"
							tone="ghost"
							mix={[shellRemixToolbarSquareMix]}
							data-sidebar-toggle
							aria-label={t('chrome.aria.openNav')}
							aria-expanded="false"
							aria-controls="app-sidebar"
							class="shrink-0 md:hidden"
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
						</Button>
					</div>
				</div>
				<ThemeToggleInteractions />
				<LocaleSelectSubmit />
			</>
		)
	}
}
