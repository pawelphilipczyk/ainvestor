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
				? 'No funds in catalog — import on ETF Catalog'
				: 'Select a fund…'
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
							? 'Saved to your private GitHub Gist.'
							: session?.approvalStatus === 'pending'
								? 'Account pending approval — guidelines are not saved to GitHub yet.'
								: 'Sign in to persist across sessions.'}
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
						Specific ETF target
					</h2>
					<p class="mt-1 text-xs text-muted-foreground">
						Pick a fund from your catalog. Its category is set from the catalog
						row.
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
							<FieldLabel fieldId="instrumentTicker">Fund</FieldLabel>
							<SelectInput
								id="instrumentTicker"
								name="instrumentTicker"
								options={instrumentSelectOptions}
							/>
						</div>
						<div class="grid gap-2">
							<FieldLabel fieldId="instrumentTargetPct">Target %</FieldLabel>
							<NumberInput
								id="instrumentTargetPct"
								name="targetPct"
								placeholder="e.g. 60"
								required={true}
								min={1}
								max={100}
								step="0.1"
							/>
						</div>
						<SubmitButton>Add ETF guideline</SubmitButton>
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
						Asset class bucket
					</h2>
					<p class="mt-1 text-xs text-muted-foreground">
						Target a share of your portfolio for a class that appears in your
						catalog.
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
							<FieldLabel fieldId="assetClassType">Asset class</FieldLabel>
							<SelectInput
								id="assetClassType"
								name="assetClassType"
								options={props.assetClassOptions}
							/>
						</div>
						<div class="grid gap-2">
							<FieldLabel fieldId="assetTargetPct">Target %</FieldLabel>
							<NumberInput
								id="assetTargetPct"
								name="targetPct"
								placeholder="e.g. 40"
								required={true}
								min={1}
								max={100}
								step="0.1"
							/>
						</div>
						<SubmitButton>Add asset-class guideline</SubmitButton>
					</form>
				</Card>

				<p class="text-xs text-muted-foreground">
					Import or paste funds on the{' '}
					<a
						href={routes.catalog.index.href()}
						class="font-medium text-primary underline underline-offset-2"
					>
						ETF Catalog
					</a>{' '}
					to populate both lists.
				</p>

				<div id="guidelines-list">
					<GuidelinesListFragment guidelines={props.guidelines} />
				</div>
			</main>
		)
	}
}
