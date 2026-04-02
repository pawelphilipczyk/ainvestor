import type { Handle, RemixNode } from 'remix/component'
// @ts-expect-error Runtime-only JS client entry module
import { AdviceEtfInfoInteractions } from '../features/advice/advice-etf-info.component.js'
import { DEFAULT_ADVICE_MODEL } from '../features/advice/advice-openai.ts'
import type { AppPage } from '../lib/app-page.ts'
import { baseCss } from '../lib/document-styles.ts'
import { t } from '../lib/i18n.ts'
import type { SessionData } from '../lib/session.ts'
import { tailwindConfig } from '../lib/tailwind-config.ts'
import { routes } from '../routes.ts'
import { AppTopBar } from './app-top-bar.tsx'
// @ts-expect-error Runtime-only JS client entry module
import { FetchSubmitEnhancement } from './fetch-submit.component.js'
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
	return (props: DocumentShellProps) => {
		const pendingApproval = props.session?.approvalStatus === 'pending'
		const etfInfoDefaultsJson = JSON.stringify({
			postUrl: routes.advice.etfInfo.href(),
			defaultAdviceModel: DEFAULT_ADVICE_MODEL,
		})
		return (
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
							adviceEtfInfoLoading: t('client.adviceEtfInfo.loading'),
							adviceEtfInfoError: t('client.adviceEtfInfo.error'),
						})}
					/>
					{pendingApproval ? null : (
						<script
							type="application/json"
							id="advice-etf-info-defaults"
							innerHTML={etfInfoDefaultsJson}
						/>
					)}
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
					<NavigationLinkLoadingEnhancement />
					<TabsNavScrollRestoration />
					{pendingApproval ? null : (
						<div class="contents">
							<dialog
								id="advice-etf-info-dialog"
								class="fixed inset-0 z-50 m-0 box-border h-dvh max-h-dvh w-full min-w-0 max-w-[100vw] overflow-hidden border-0 bg-card p-0 shadow-none backdrop:bg-black/50"
								aria-labelledby="advice-etf-info-dialog-title"
							>
								{/* Flex lives on inner wrapper: `flex` on <dialog> overrides UA :not([open]){display:none} */}
								<div class="flex h-full min-h-0 min-w-0 w-full max-w-full flex-col overflow-x-hidden overflow-y-hidden">
									<div class="flex min-w-0 max-w-full shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
										<h2
											id="advice-etf-info-dialog-title"
											class="min-w-0 max-w-full break-words text-base font-semibold tracking-tight text-card-foreground"
										>
											<span
												id="advice-etf-info-dialog-heading"
												class="break-words"
											>
												{t('advice.table.learnMore')}
											</span>
										</h2>
										<form method="dialog">
											<button
												type="submit"
												class="shrink-0 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-card-foreground transition-colors hover:bg-accent"
											>
												{t('advice.etfInfo.dialogClose')}
											</button>
										</form>
									</div>
									<div
										id="advice-etf-info-dialog-status"
										class="hidden min-w-0 max-w-full break-words border-b border-border px-4 py-3 text-sm text-muted-foreground"
										role="status"
										aria-live="polite"
									/>
									<div
										id="advice-etf-info-dialog-body"
										class="min-h-0 min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto overscroll-contain break-words px-4 py-3 text-sm leading-relaxed text-card-foreground"
									/>
								</div>
							</dialog>
							<AdviceEtfInfoInteractions />
						</div>
					)}
					<script type="module" src="/entry.js" />
				</body>
			</html>
		)
	}
}
