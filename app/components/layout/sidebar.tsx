import type { Handle } from 'remix/ui'
import type { AppPage } from '../../lib/app-page.ts'
import { format, t } from '../../lib/i18n.ts'
import { routes } from '../../routes.ts'
import { GitHubIcon } from '../navigation/github-icon.tsx'
import { Link } from '../navigation/link.tsx'
import { AppBranding } from './app-branding.tsx'
import type { SessionContext } from './session-provider.tsx'
import { SessionProvider } from './session-provider.tsx'
import { SidebarInteractions } from './sidebar.component.ts'
import type { NavLink } from './sidebar-nav.ts'

type SidebarProps = {
	navLinks: NavLink[]
	currentPage: AppPage
}

function renderSidebarNavLink(params: { link: NavLink; currentPage: AppPage }) {
	const { link, currentPage } = params
	const isCurrent = link.page === currentPage
	return (
		<a
			href={link.href}
			data-rmx-document
			class={`flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${isCurrent ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent hover:text-accent-foreground'}`}
			aria-current={isCurrent ? 'page' : undefined}
		>
			{link.label}
		</a>
	)
}

/**
 * Server-rendered sidebar navigation.
 * Session from DocumentShell context. Interactivity: SidebarInteractions (toggle/close).
 */
export function Sidebar(handle: Handle<SidebarProps, SessionContext>) {
	return () => {
		const props = handle.props
		const session = handle.context.get(SessionProvider)?.session ?? null
		const primaryNavLinks = props.navLinks.filter(
			(link) => link.placement === 'primary',
		)
		const secondaryNavLinks = props.navLinks.filter(
			(link) => link.placement === 'secondary',
		)
		return (
			<>
				<div
					id="sidebar-backdrop"
					aria-hidden="true"
					class="fixed inset-0 z-40 bg-black/50 opacity-0 pointer-events-none transition-opacity duration-200 md:hidden"
				/>
				<aside
					id="app-sidebar"
					aria-label={t('chrome.aria.mainNav')}
					class="fixed inset-y-0 left-0 z-50 flex w-64 -translate-x-full flex-col border-r border-border bg-card transition-transform duration-200 ease-in-out md:translate-x-0"
				>
					<div class="flex min-h-14 items-center justify-between gap-2 border-b border-border px-4 py-2.5">
						<div class="flex min-w-0 flex-1 items-center gap-2">
							<AppBranding />
						</div>
						<button
							data-sidebar-close
							type="button"
							aria-label={t('chrome.aria.closeNav')}
							class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
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
								<line x1="18" y1="6" x2="6" y2="18" />
								<line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</button>
					</div>
					<nav class="flex flex-1 flex-col overflow-y-auto p-4">
						<div class="grid gap-1">
							{primaryNavLinks.map((link) =>
								renderSidebarNavLink({
									link,
									currentPage: props.currentPage,
								}),
							)}
						</div>
						{secondaryNavLinks.length > 0 ? (
							<div
								data-sidebar-secondary-nav
								class="mt-auto grid gap-1 border-t border-border pt-4"
							>
								{secondaryNavLinks.map((link) =>
									renderSidebarNavLink({
										link,
										currentPage: props.currentPage,
									}),
								)}
							</div>
						) : null}
						<div class="mt-4">
							{session ? (
								<div class="border-t border-border pt-4">
									<p class="mb-2 px-3 text-xs text-muted-foreground">
										{format(t('chrome.signedInAs'), { login: session.login })}
										{session.approvalStatus === 'pending' ? (
											<span class="mt-0.5 block text-amber-500/90">
												{t('chrome.approvalPendingSidebar')}
											</span>
										) : null}
									</p>
									<form method="post" action={routes.auth.logout.href()}>
										<button
											type="submit"
											class="flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
										>
											{t('chrome.signOut')}
										</button>
									</form>
								</div>
							) : (
								<div class="border-t border-border pt-4">
									<Link
										href={routes.auth.login.href()}
										navigationLoading={true}
										class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent"
										labelClass="flex min-w-0 flex-1 items-center gap-2"
									>
										<GitHubIcon class="h-4 w-4 shrink-0" />
										{t('chrome.signInGithub')}
									</Link>
								</div>
							)}
						</div>
					</nav>
				</aside>
				<SidebarInteractions />
			</>
		)
	}
}
