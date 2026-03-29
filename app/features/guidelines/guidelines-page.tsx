import type { Handle } from 'remix/component'
import {
	Card,
	FieldLabel,
	NumberInput,
	SelectInput,
	SubmitButton,
	TabLink,
	TabsNav,
} from '../../components/index.ts'
import { SectionIntroCard } from '../../components/section-intro-card.tsx'
import { SessionProvider } from '../../components/session-provider.tsx'
import type { EtfGuideline, EtfType } from '../../lib/guidelines.ts'
import { t } from '../../lib/i18n.ts'
import { LOCALE_DECIMAL_HTML_PATTERN } from '../../lib/locale-decimal-input.ts'
import { SECTION_INTROS } from '../../lib/section-intros.ts'
import { sessionUsesGithubGist } from '../../lib/session.ts'
import { routes } from '../../routes.ts'
// @ts-expect-error Runtime-only JS client entry module
import { GuidelinesDeleteDialogInteractions } from './guidelines-list.component.js'
import { GuidelinesListFragment } from './guidelines-list-fragment.tsx'

type GuidelinesAddTabId = 'instrument' | 'bucket'

type GuidelinesPageProps = {
	guidelines: EtfGuideline[]
	assetClassOptions: { value: EtfType; label: string }[]
	instrumentOptions: { value: string; label: string }[]
	activeAddTab: GuidelinesAddTabId
}

export function GuidelinesPage(handle: Handle, _setup?: unknown) {
	return (props: GuidelinesPageProps) => {
		const session = handle.context.get(SessionProvider)?.session ?? null

		const instrumentPlaceholder =
			props.instrumentOptions.length === 0
				? t('forms.catalog.emptyPlaceholder')
				: t('forms.catalog.selectFundPlaceholder')
		const instrumentSelectOptions = [
			{ value: '', label: instrumentPlaceholder },
			...props.instrumentOptions,
		]
		const instrumentTabHref = routes.guidelines.index.href()
		const bucketTabHref = routes.guidelines.index.href({}, { tab: 'bucket' })
		const activeAddTab = props.activeAddTab

		return (
			<>
				<main class="mx-auto grid max-w-lg gap-6">
					<SectionIntroCard
						page="guidelines"
						variant="page"
						title={SECTION_INTROS.guidelines.title}
						description={SECTION_INTROS.guidelines.description}
					>
						<p class="mt-1 text-sm text-muted-foreground">
							{sessionUsesGithubGist(session)
								? t('guidelines.subtitle.savedGist')
								: session?.approvalStatus === 'pending'
									? t('guidelines.subtitle.pending')
									: t('guidelines.subtitle.signIn')}
						</p>
					</SectionIntroCard>

					<div class="flex flex-col">
						<TabsNav
							activeId={activeAddTab}
							aria-label={t('guidelines.tabs.navAria')}
							scrollGroupId="guidelines-add"
						>
							<TabLink id="instrument" href={instrumentTabHref}>
								{t('guidelines.etfCard.title')}
							</TabLink>
							<TabLink id="bucket" href={bucketTabHref}>
								{t('guidelines.bucket.title')}
							</TabLink>
						</TabsNav>

						<Card variant="muted" class="rounded-t-none border-t-0 p-4">
							{activeAddTab === 'instrument' ? (
								<section
									aria-label={t('guidelines.etfCard.title')}
									class="grid gap-4"
								>
									<p class="text-xs text-muted-foreground">
										{t('guidelines.etfCard.hint')}
									</p>
									<div
										id="guidelines-instrument-form-error"
										role="alert"
										class="hidden rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
									/>
									<form
										method="post"
										action={routes.guidelines.instrument.href()}
										class="grid gap-4"
										data-fetch-submit
										data-fragment-id="guidelines-list"
										data-fragment-url={routes.guidelines.fragmentList.href()}
										data-reset-form
										data-error-id="guidelines-instrument-form-error"
									>
										<div class="grid gap-2">
											<FieldLabel fieldId="instrumentTicker">
												{t('guidelines.etfCard.field.fund')}
											</FieldLabel>
											<SelectInput
												id="instrumentTicker"
												name="instrumentTicker"
												options={instrumentSelectOptions}
											/>
										</div>
										<div class="grid gap-2">
											<FieldLabel fieldId="instrumentTargetPct">
												{t('guidelines.etfCard.field.targetPct')}
											</FieldLabel>
											<NumberInput
												id="instrumentTargetPct"
												name="targetPct"
												placeholder={t('forms.targetPct.placeholder')}
												required={true}
												inputMode="decimal"
												pattern={LOCALE_DECIMAL_HTML_PATTERN}
											/>
										</div>
										<SubmitButton>
											{t('guidelines.etfCard.submit')}
										</SubmitButton>
									</form>
								</section>
							) : (
								<section
									aria-label={t('guidelines.bucket.title')}
									class="grid gap-4"
								>
									<p class="text-xs text-muted-foreground">
										{t('guidelines.bucket.hint')}
									</p>
									<div
										id="guidelines-asset-class-form-error"
										role="alert"
										class="hidden rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
									/>
									<form
										method="post"
										action={routes.guidelines.assetClass.href()}
										class="grid gap-4"
										data-fetch-submit
										data-fragment-id="guidelines-list"
										data-fragment-url={routes.guidelines.fragmentList.href()}
										data-reset-form
										data-error-id="guidelines-asset-class-form-error"
									>
										<div class="grid gap-2">
											<FieldLabel fieldId="assetClassType">
												{t('guidelines.bucket.field.class')}
											</FieldLabel>
											<SelectInput
												id="assetClassType"
												name="assetClassType"
												options={props.assetClassOptions}
											/>
										</div>
										<div class="grid gap-2">
											<FieldLabel fieldId="assetTargetPct">
												{t('guidelines.bucket.field.targetPct')}
											</FieldLabel>
											<NumberInput
												id="assetTargetPct"
												name="targetPct"
												placeholder={t('forms.targetPct.placeholderAsset')}
												required={true}
												inputMode="decimal"
												pattern={LOCALE_DECIMAL_HTML_PATTERN}
											/>
										</div>
										<SubmitButton>{t('guidelines.bucket.submit')}</SubmitButton>
									</form>
								</section>
							)}
						</Card>
					</div>

					<p class="text-xs text-muted-foreground">
						{t('guidelines.footer.beforeLink')}{' '}
						<a
							href={routes.catalog.index.href()}
							class="font-medium text-primary underline underline-offset-2"
						>
							{t('guidelines.footer.link')}
						</a>{' '}
						{t('guidelines.footer.after')}
					</p>

					<div id="guidelines-list">
						<GuidelinesListFragment guidelines={props.guidelines} />
					</div>
				</main>
				<GuidelinesDeleteDialogInteractions />
			</>
		)
	}
}
