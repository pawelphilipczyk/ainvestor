import type { Handle, RemixNode } from 'remix/ui'
import { PortfolioTradeFocus } from '../../features/portfolio/portfolio-trade-focus.component.js'
import type { AppPage } from '../../lib/app-page.ts'
import { baseCss } from '../../lib/document-styles.ts'
import { t } from '../../lib/i18n.ts'
import type { SessionData } from '../../lib/session.ts'
import type { FlashBannerTone } from '../../lib/session-flash.ts'
import { tailwindConfig } from '../../lib/tailwind-config.ts'
import { FrameSubmitEnhancement } from '../client/frame-submit.component.js'
import { NavigationLinkLoadingEnhancement } from '../navigation/navigation-link-loading.component.js'
import { TabsNavScrollRestoration } from '../navigation/tabs-nav-scroll.component.js'
import { AppTopBar } from './app-top-bar.tsx'
import { SessionProvider } from './session-provider.tsx'
import { Sidebar } from './sidebar.tsx'
import { getNavLinks } from './sidebar-nav.ts'

const IMPORT_MAP = JSON.stringify({
	imports: {
		'remix/ui': '/remix/dist/ui.js',
		'remix/ui/scroll-lock': '/remix/dist/ui/scroll-lock.js',
		'@remix-run/ui': '/@remix-run/ui/dist/index.js',
		'@remix-run/ui/scroll-lock': '/@remix-run/ui/dist/utils/scroll-lock.js',
	},
})

type DocumentShellProps = {
	title: string
	/** BCP 47 language tag for `<html lang>` (from active UI locale). */
	htmlLang: string
	session: SessionData | null
	currentPage: AppPage
	flashBanner?: { text: string; tone: FlashBannerTone }
	children: RemixNode
}

function flashToneLabel(tone: FlashBannerTone): string {
	switch (tone) {
		case 'error':
			return t('chrome.flash.error')
		case 'success':
			return t('chrome.flash.success')
		case 'info':
			return t('chrome.flash.info')
		default: {
			const exhaustive: never = tone
			return String(exhaustive)
		}
	}
}

function flashToneAccentClass(tone: FlashBannerTone): string {
	switch (tone) {
		case 'error':
			return 'border-l-destructive'
		case 'success':
			return 'border-l-emerald-500'
		case 'info':
			return 'border-l-amber-500'
		default: {
			const exhaustive: never = tone
			return exhaustive
		}
	}
}

function flashToneBadgeClass(tone: FlashBannerTone): string {
	switch (tone) {
		case 'error':
			return 'border-destructive/40 bg-destructive/10 text-destructive'
		case 'success':
			return 'border-emerald-600/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100'
		case 'info':
			return 'border-amber-600/35 bg-amber-500/12 text-amber-950 dark:text-amber-100'
		default: {
			const exhaustive: never = tone
			return exhaustive
		}
	}
}

export function DocumentShell(handle: Handle<DocumentShellProps>) {
	return () => (
		<html lang={handle.props.htmlLang} class="dark">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width,initial-scale=1" />
				<title>{handle.props.title}</title>
				<script innerHTML="if(localStorage.getItem('theme')==='light')document.documentElement.classList.remove('dark')" />
				<script src="https://cdn.tailwindcss.com" />
				<script
					innerHTML={`tailwind.config = ${JSON.stringify(tailwindConfig)}`}
				/>
				<style type="text/tailwindcss" innerHTML={baseCss} />
				<script type="importmap" innerHTML={IMPORT_MAP} />
				<script
					type="application/json"
					id="ui-client-messages"
					innerHTML={JSON.stringify({
						genericFormError: t('client.formSubmit.genericError'),
						submitLoadingLabel: t('chrome.loading'),
					})}
				/>
			</head>
			<body class="min-h-screen overflow-x-hidden bg-background font-sans text-foreground antialiased">
				<SessionProvider session={handle.props.session}>
					<div id="form-spinner" class="sr-only" aria-hidden="true">
						<span
							class="inline-flex items-center gap-2"
							role="status"
							aria-live="polite"
						>
							<span
								class="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
								aria-hidden="true"
							/>
							{t('chrome.loading')}
						</span>
					</div>
					<div id="form-spinner-icon" class="sr-only" aria-hidden="true">
						<span
							class="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
							aria-hidden="true"
						/>
					</div>
					<Sidebar
						navLinks={getNavLinks({ isAdmin: handle.props.session?.isAdmin })}
						currentPage={handle.props.currentPage}
					/>
					<AppTopBar />
					<div id="page-content" class="min-w-0 p-4 md:ml-64">
						{handle.props.flashBanner ? (
							<section
								class={`mx-auto mb-4 max-w-5xl min-w-0 rounded-md border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm border-l-4 ${flashToneAccentClass(handle.props.flashBanner.tone)}`}
								aria-label={flashToneLabel(handle.props.flashBanner.tone)}
							>
								<p class="sr-only">
									{flashToneLabel(handle.props.flashBanner.tone)}
								</p>
								<div class="mb-2 flex flex-wrap items-center gap-2">
									<span
										class={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${flashToneBadgeClass(handle.props.flashBanner.tone)}`}
									>
										{flashToneLabel(handle.props.flashBanner.tone)}
									</span>
								</div>
								<div class="whitespace-pre-wrap">
									{handle.props.flashBanner.text}
								</div>
							</section>
						) : null}
						{handle.props.children}
					</div>
				</SessionProvider>
				<FrameSubmitEnhancement />
				{handle.props.currentPage === 'portfolio' ? (
					<PortfolioTradeFocus />
				) : null}
				<NavigationLinkLoadingEnhancement />
				<TabsNavScrollRestoration />
				<script type="module" src="/entry.js" />
			</body>
		</html>
	)
}
