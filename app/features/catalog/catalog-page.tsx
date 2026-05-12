import { Frame, type Handle } from 'remix/ui'
import { SectionIntroCard } from '../../components/data-display/section-intro-card.tsx'
import {
	Card,
	FieldLabel,
	SelectInput,
	SubmitButton,
	TextInput,
} from '../../components/index.ts'
import { frameLoadingPlaceholder } from '../../components/layout/frame-loading-placeholder.tsx'
import {
	type SessionContext,
	SessionProvider,
} from '../../components/layout/session-provider.tsx'
import { ETF_TYPES, formatEtfTypeLabel } from '../../lib/guidelines.ts'
import { t } from '../../lib/i18n.ts'
import { getSectionIntro } from '../../lib/section-intros.ts'
import { sessionUsesGithubGist } from '../../lib/session.ts'
import { routes } from '../../routes.ts'
import type { CatalogRiskBand } from './lib.ts'

type CatalogPageProps = {
	catalogCount: number
	typeFilter: string
	riskFilter: '' | CatalogRiskBand
	query: string
	catalogListFrameSrc: string
}

export function CatalogPage(handle: Handle<CatalogPageProps, SessionContext>) {
	return () => {
		const props = handle.props
		const session = handle.context.get(SessionProvider)?.session ?? null

		const catalogIntro = getSectionIntro('catalog')
		return (
			<main class="mx-auto grid min-w-0 max-w-5xl gap-6">
				<SectionIntroCard
					page="catalog"
					variant="page"
					title={catalogIntro.title}
					description={catalogIntro.description}
				>
					<p class="mt-0.5 text-xs text-muted-foreground">
						{t('catalog.sharedSource')}
					</p>
					{sessionUsesGithubGist(session) ? (
						<p class="mt-0.5 text-xs text-muted-foreground">
							{t('catalog.savedGist')}
						</p>
					) : null}
				</SectionIntroCard>

				{props.catalogCount > 0 ? (
					<Card variant="muted" class="p-4">
						<form
							method="get"
							action={routes.catalog.index.href()}
							class="flex flex-wrap items-end gap-3"
							data-frame-submit="catalog-list"
							data-frame-get-fragment-action={routes.catalog.fragmentList.href()}
						>
							<div class="grid gap-1.5">
								<FieldLabel fieldId="type" variant="filter">
									{t('catalog.filter.assetType')}
								</FieldLabel>
								<SelectInput
									id="type"
									name="type"
									compact={true}
									value={props.typeFilter}
									options={[
										{ value: '', label: t('catalog.filter.allTypes') },
										...ETF_TYPES.map((etfType) => ({
											value: etfType,
											label: formatEtfTypeLabel(etfType),
										})),
									]}
								/>
							</div>
							<div class="grid gap-1.5">
								<FieldLabel fieldId="risk" variant="filter">
									{t('catalog.filter.risk')}
								</FieldLabel>
								<SelectInput
									id="risk"
									name="risk"
									compact={true}
									value={props.riskFilter || ''}
									options={[
										{
											value: '',
											label: t('catalog.filter.allRisks'),
										},
										{
											value: 'low',
											label: t('catalog.riskBand.low'),
										},
										{
											value: 'medium',
											label: t('catalog.riskBand.medium'),
										},
										{
											value: 'high',
											label: t('catalog.riskBand.high'),
										},
									]}
								/>
							</div>
							<div class="grid gap-1.5">
								<FieldLabel fieldId="q" variant="filter">
									{t('catalog.filter.search')}
								</FieldLabel>
								<TextInput
									id="q"
									name="q"
									placeholder={t('catalog.filter.searchPlaceholder')}
									value={props.query}
									type="search"
									compact
									class="w-64"
								/>
							</div>
							<SubmitButton
								compact={true}
								class="!w-auto shrink-0 text-base md:text-sm font-medium"
							>
								{t('catalog.filter.submit')}
							</SubmitButton>
							{props.typeFilter || props.riskFilter || props.query ? (
								<a
									href={routes.catalog.index.href()}
									data-navigation-loading
									rmx-document
									class="hover:text-foreground inline-flex h-9 items-center rounded-md px-3 text-sm text-muted-foreground underline underline-offset-4"
								>
									{t('catalog.filter.clear')}
								</a>
							) : null}
						</form>
					</Card>
				) : null}

				<Frame
					name="catalog-list"
					src={props.catalogListFrameSrc}
					fallback={frameLoadingPlaceholder()}
				/>
			</main>
		)
	}
}
