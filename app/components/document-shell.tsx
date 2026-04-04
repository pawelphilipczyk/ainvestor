import type { Handle, RemixNode } from 'remix/component'
import type { AppPage } from '../lib/app-page.ts'
import { baseCss } from '../lib/document-styles.ts'
import { t } from '../lib/i18n.ts'
import type { SessionData } from '../lib/session.ts'
import { tailwindConfig } from '../lib/tailwind-config.ts'
import { AppTopBar } from './app-top-bar.tsx'
// @ts-expect-error Runtime-only JS client entry module
import { FetchSubmitEnhancement } from './fetch-submit.component.js'
import { FrameSubmitEnhancement } from './frame-submit.component.js'
// @ts-expect-error Runtime-only JS client entry module
import { NavigationLinkLoadingEnhancement } from './navigation-link-loading.component.js'
import { SessionProvider } from './session-provider.tsx'
import { Sidebar } from './sidebar.tsx'
import { getNavLinks } from './sidebar-nav.ts'
import { TabsNavScrollRestoration } from './tabs-nav-scroll.component.js'

const IMPORT_MAP = JSON.stringify({
	imports: {
		'remix/component': '/remix/dist/component.js',
		'@remix-run/component': '/@remix-run/component/dist/index.js',
	},
})

type DocumentShellProps = {
	title: string
	session: SessionData | null
	currentPage: AppPage
	flashError?: string
	children: RemixNode
}

export function DocumentShell(_handle: Handle, _setup?: unknown) {
	return (props: DocumentShellProps) => (
		<html lang="en" class="dark">
			<head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width,initial-scale=1" />
				<title>{props.title}</title>
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
						catalogEtfAnalysisNetworkError: t(
							'client.catalogEtfAnalysisNetworkError',
						),
					})}
				/>
			</head>
			<body class="min-h-screen overflow-x-hidden bg-background font-sans text-foreground antialiased">
				<SessionProvider session={props.session}>
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
					<Sidebar navLinks={getNavLinks()} currentPage={props.currentPage} />
					<AppTopBar />
					<div id="page-content" class="min-w-0 p-4 md:ml-64">
						{props.flashError ? (
							<div
								role="alert"
								class="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
							>
								{props.flashError}
							</div>
						) : null}
						{props.children}
					</div>
				</SessionProvider>
				<FetchSubmitEnhancement />
				<FrameSubmitEnhancement />
				<NavigationLinkLoadingEnhancement />
				<TabsNavScrollRestoration />
				<script type="module" src="/entry.js" />
			</body>
		</html>
	)
}
