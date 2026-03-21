import type { Handle, RemixNode } from 'remix/component'
import type { AppPage } from '../lib/app-page.ts'
import { baseCss } from '../lib/document-styles.ts'
import type { SessionData } from '../lib/session.ts'
import { tailwindConfig } from '../lib/tailwind-config.ts'
import { AppTopBar } from './app-top-bar.tsx'
// @ts-expect-error Runtime-only JS client entry module
import { FetchSubmitEnhancement } from './fetch-submit.component.js'
import { SessionProvider } from './session-provider.tsx'
import { Sidebar } from './sidebar.tsx'
import { NAV_LINKS } from './sidebar-nav.ts'

const IMPORT_MAP = JSON.stringify({
	imports: {
		'remix/component': '/remix/dist/component.js',
		'remix/interaction': '/remix/dist/interaction.js',
		'@remix-run/component': '/@remix-run/component/dist/index.js',
		'@remix-run/interaction': '/@remix-run/interaction/dist/index.js',
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
								class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
								aria-hidden="true"
							/>
							Loading…
						</span>
					</div>
					<Sidebar navLinks={NAV_LINKS} currentPage={props.currentPage} />
					<AppTopBar />
					<div id="page-content" class="min-w-0 max-w-full p-4 md:ml-64">
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
				<script type="module" src="/entry.js" />
			</body>
		</html>
	)
}
