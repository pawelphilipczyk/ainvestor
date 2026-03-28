import type { Handle } from 'remix/component'
import {
	Card,
	FieldLabel,
	NumberInput,
	SelectInput,
	SubmitButton,
} from '../../components/index.ts'
import { SectionIntroCard } from '../../components/section-intro-card.tsx'
import { SessionProvider } from '../../components/session-provider.tsx'
import type { EtfGuideline, EtfType } from '../../lib/guidelines.ts'
import { t } from '../../lib/i18n.ts'
import { MONEY_AMOUNT_HTML_PATTERN } from '../../lib/money-input.ts'
import { SECTION_INTROS } from '../../lib/section-intros.ts'
import { sessionUsesGithubGist } from '../../lib/session.ts'
import { routes } from '../../routes.ts'
import { GuidelinesListFragment } from './guidelines-list-fragment.tsx'

type GuidelinesPageProps = {
	guidelines: EtfGuideline[]
	assetClassOptions: { value: EtfType; label: string }[]
	instrumentOptions: { value: string; label: string }[]
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

		return (
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

				<Card
					variant="muted"
					class="p-4"
					aria-labelledby="guidelines-etf-heading"
				>
					<h2
						id="guidelines-etf-heading"
						class="text-sm font-semibold text-card-foreground"
					>
						{t('guidelines.etfCard.title')}
					</h2>
					<p class="mt-1 text-xs text-muted-foreground">
						{t('guidelines.etfCard.hint')}
					</p>
					<form
						method="post"
						action={routes.guidelines.instrument.href()}
						class="mt-4 grid gap-4"
						data-fetch-submit
						data-fragment-id="guidelines-list"
						data-fragment-url="/fragments/guidelines-list"
						data-reset-form
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
								pattern={MONEY_AMOUNT_HTML_PATTERN}
							/>
						</div>
						<SubmitButton>{t('guidelines.etfCard.submit')}</SubmitButton>
					</form>
				</Card>

				<Card
					variant="muted"
					class="p-4"
					aria-labelledby="guidelines-bucket-heading"
				>
					<h2
						id="guidelines-bucket-heading"
						class="text-sm font-semibold text-card-foreground"
					>
						{t('guidelines.bucket.title')}
					</h2>
					<p class="mt-1 text-xs text-muted-foreground">
						{t('guidelines.bucket.hint')}
					</p>
					<form
						method="post"
						action={routes.guidelines.assetClass.href()}
						class="mt-4 grid gap-4"
						data-fetch-submit
						data-fragment-id="guidelines-list"
						data-fragment-url="/fragments/guidelines-list"
						data-reset-form
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
								pattern={MONEY_AMOUNT_HTML_PATTERN}
							/>
						</div>
						<SubmitButton>{t('guidelines.bucket.submit')}</SubmitButton>
					</form>
				</Card>

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
		)
	}
}
