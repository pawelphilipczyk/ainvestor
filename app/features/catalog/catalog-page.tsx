import { Frame, type Handle } from 'remix/component'
import {
	Card,
	FieldLabel,
	SelectInput,
	SubmitButton,
	TextareaInput,
	TextInput,
} from '../../components/index.ts'
import { SectionIntroCard } from '../../components/section-intro-card.tsx'
import { SessionProvider } from '../../components/session-provider.tsx'
import { ETF_TYPES, formatEtfTypeLabel } from '../../lib/guidelines.ts'
import { t } from '../../lib/i18n.ts'
import { SECTION_INTROS } from '../../lib/section-intros.ts'
import { sessionUsesGithubGist } from '../../lib/session.ts'
import { routes } from '../../routes.ts'

type CatalogPageProps = {
	catalogCount: number
	canImport: boolean
	typeFilter: string
	query: string
	sharedCatalogOwnerLogin: string | null
	catalogListFrameSrc: string
}

export function CatalogPage(handle: Handle, _setup?: unknown) {
	return (props: CatalogPageProps) => {
		const session = handle.context.get(SessionProvider)?.session ?? null

		return (
			<main class="mx-auto grid min-w-0 max-w-5xl gap-6">
				<SectionIntroCard
					page="catalog"
					variant="page"
					title={SECTION_INTROS.catalog.title}
					description={SECTION_INTROS.catalog.description}
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

				{props.canImport ? (
					<Card variant="muted" class="p-4">
						<section>
							<h2 class="text-base font-semibold tracking-tight text-card-foreground">
								{t('catalog.import.title')}
							</h2>
							<p class="mt-0.5 text-xs text-muted-foreground">
								{t('catalog.import.subtitle')}
							</p>
							{props.sharedCatalogOwnerLogin ? (
								<p class="mt-2 text-xs text-muted-foreground">
									{t('catalog.import.ownerActive')}
								</p>
							) : null}
							<form
								method="post"
								action={routes.catalog.import.href()}
								class="mt-3 grid max-w-xl gap-3"
							>
								<FieldLabel fieldId="pasteZone" variant="screenReader">
									{t('catalog.import.pasteLabel.screenReader')}
								</FieldLabel>
								<TextareaInput
									id="pasteZone"
									name="bankApiJson"
									placeholder={t('catalog.import.pastePlaceholder')}
									rows={3}
									required={true}
									class="block w-full max-w-xl"
								/>
								<SubmitButton>{t('catalog.import.submit')}</SubmitButton>
							</form>
							{props.catalogCount === 0 ? (
								<div class="mt-4 rounded-lg border border-dashed border-border bg-card/60 p-4 text-sm text-muted-foreground">
									<p class="font-medium text-foreground">
										{t('catalog.empty.title')}
									</p>
									<p class="mt-1">{t('catalog.empty.hint')}</p>
								</div>
							) : null}
						</section>
					</Card>
				) : null}

				{props.catalogCount > 0 ? (
					<Card variant="muted" class="p-4">
						<form
							method="get"
							action={routes.catalog.index.href()}
							class="flex flex-wrap items-end gap-3"
							data-navigation-loading
						>
							<div class="grid gap-1.5">
								<FieldLabel fieldId="type" variant="filter">
									{t('catalog.filter.assetType')}
								</FieldLabel>
								<SelectInput
									id="type"
									name="type"
									compact={true}
									options={[
										{ value: '', label: t('catalog.filter.allTypes') },
										...ETF_TYPES.map((etfType) => ({
											value: etfType,
											label: formatEtfTypeLabel(etfType),
											selected: props.typeFilter === etfType,
										})),
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
							{props.typeFilter || props.query ? (
								<a
									href={routes.catalog.index.href()}
									rmx-document
									class="hover:text-foreground inline-flex h-9 items-center rounded-md px-3 text-sm text-muted-foreground underline underline-offset-4"
								>
									{t('catalog.filter.clear')}
								</a>
							) : null}
						</form>
					</Card>
				) : null}

				<Frame name="catalog-list" src={props.catalogListFrameSrc} />
			</main>
		)
	}
}
