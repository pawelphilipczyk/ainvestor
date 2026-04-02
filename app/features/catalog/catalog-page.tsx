import type { Handle } from 'remix/component'
import {
	Card,
	FieldLabel,
	Link,
	ScrollableTable,
	SelectInput,
	SubmitButton,
	TextareaInput,
	TextInput,
} from '../../components/index.ts'
import { SectionIntroCard } from '../../components/section-intro-card.tsx'
import { SessionProvider } from '../../components/session-provider.tsx'
import { formatValue } from '../../lib/format.ts'
import type { EtfEntry } from '../../lib/gist.ts'
import { ETF_TYPES, formatEtfTypeLabel } from '../../lib/guidelines.ts'
import { format, t } from '../../lib/i18n.ts'
import { SECTION_INTROS } from '../../lib/section-intros.ts'
import { sessionUsesGithubGist } from '../../lib/session.ts'
import { routes } from '../../routes.ts'
import { DEFAULT_ADVICE_MODEL } from '../advice/advice-openai.ts'
import type { CatalogEntry } from './lib.ts'

type CatalogPageProps = {
	catalog: CatalogEntry[]
	holdings: EtfEntry[]
	/** When true, ETF info dialog controls are omitted (same gate as advice). */
	pendingApproval?: boolean
	canImport: boolean
	typeFilter: string
	query: string
	sharedCatalogOwnerLogin: string | null
}

/** Keeps long fund names and descriptions readable (wrap) without forcing huge table width. */
const catalogTextColMax = 'max-w-48 sm:max-w-56 md:max-w-xs lg:max-w-sm'

function CatalogTableHeader(_handle: Handle, _setup?: unknown) {
	return (props: { showLearnMoreLink: boolean }) => (
		<tr class="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
			<th class="pb-2 pl-4 pr-4 align-top">{t('catalog.table.ticker')}</th>
			<th class={`pb-2 pr-4 align-top ${catalogTextColMax}`}>
				{t('catalog.table.name')}
			</th>
			<th class="pb-2 pr-4 align-top">{t('catalog.table.type')}</th>
			<th class={`pb-2 pr-4 align-top ${catalogTextColMax}`}>
				{t('catalog.table.description')}
			</th>
			<th class="pb-2 align-top">{t('catalog.table.isin')}</th>
			<th class="pb-2 pl-4 pr-4 align-top">{t('catalog.table.value')}</th>
			{props.showLearnMoreLink ? (
				<th class="pb-2 pr-4 align-top">
					<span class="sr-only">{t('catalog.table.learnMore')}</span>
				</th>
			) : null}
		</tr>
	)
}

function renderCatalogRow(
	entry: CatalogEntry,
	holding: EtfEntry | undefined,
	options: { showLearnMoreLink: boolean },
) {
	const { showLearnMoreLink } = options
	const learnMoreHref = routes.catalog.etfDetail.href(
		{ ticker: entry.ticker },
		{ model: DEFAULT_ADVICE_MODEL },
	)
	const valueCell = holding ? (
		<td class="py-2 pl-4 pr-4 align-top text-sm font-medium text-foreground">
			{formatValue(holding.value, holding.currency)}
		</td>
	) : (
		<td class="py-2 pl-4 pr-4 align-top text-sm text-muted-foreground">
			{t('catalog.emptyCell')}
		</td>
	)

	return (
		<tr
			key={entry.id}
			class="border-b border-border last:border-0 transition-colors hover:bg-muted/40"
		>
			<td class="py-2 pl-4 pr-4 align-top font-mono text-sm font-semibold">
				{entry.ticker}
			</td>
			<td
				class={`py-2 pr-4 align-top text-sm break-words ${catalogTextColMax}`}
			>
				{entry.name}
			</td>
			<td class="py-2 pr-4 align-top">
				<span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
					{formatEtfTypeLabel(entry.type) || t('catalog.etfTypeUnknown')}
				</span>
			</td>
			<td
				class={`py-2 pr-4 align-top text-sm break-words text-muted-foreground ${catalogTextColMax}`}
			>
				{entry.description || t('catalog.emptyCell')}
			</td>
			<td class="py-2 align-top font-mono text-xs text-muted-foreground">
				{entry.isin ?? t('catalog.emptyCell')}
			</td>
			{valueCell}
			{showLearnMoreLink ? (
				<td class="py-2 pr-4 align-top">
					<Link
						href={learnMoreHref}
						navigationLoading={true}
						class="inline-flex whitespace-nowrap rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-card-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{t('catalog.table.learnMore')}
					</Link>
				</td>
			) : null}
		</tr>
	)
}

export function CatalogPage(handle: Handle, _setup?: unknown) {
	return (props: CatalogPageProps) => {
		const session = handle.context.get(SessionProvider)?.session ?? null
		const pendingApproval = props.pendingApproval === true
		const showLearnMoreLink = !pendingApproval
		const tableColSpan = showLearnMoreLink ? 7 : 6
		const holdingKey = (s: string) => s.toUpperCase()
		const holdingsByTicker = new Map(
			props.holdings.flatMap((e) => {
				const pairs: [string, EtfEntry][] = [[holdingKey(e.name), e]]
				if (e.ticker) pairs.push([holdingKey(e.ticker), e])
				return pairs
			}),
		)

		const filtered = props.catalog.filter((entry) => {
			const matchesType = !props.typeFilter || entry.type === props.typeFilter
			const queryLower = props.query.toLowerCase()
			const matchesQuery =
				!props.query ||
				entry.ticker.toLowerCase().includes(queryLower) ||
				entry.name.toLowerCase().includes(queryLower) ||
				entry.description.toLowerCase().includes(queryLower)
			return matchesType && matchesQuery
		})

		const ownedInCatalog = filtered.filter((catalogEntry) =>
			holdingsByTicker.has(holdingKey(catalogEntry.ticker)),
		)
		const restOfCatalog = filtered.filter(
			(catalogEntry) => !holdingsByTicker.has(holdingKey(catalogEntry.ticker)),
		)

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
								data-fetch-submit
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
							{props.catalog.length === 0 ? (
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

				{props.catalog.length > 0 ? (
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
						<p class="mt-3 text-sm text-muted-foreground">
							{props.typeFilter || props.query
								? format(t('catalog.count.showing'), {
										filtered: filtered.length,
										total: props.catalog.length,
									})
								: props.catalog.length === 1
									? format(t('catalog.count.one'), {
											n: props.catalog.length,
										})
									: format(t('catalog.count.many'), {
											n: props.catalog.length,
										})}
						</p>
					</Card>
				) : null}

				{ownedInCatalog.length > 0 ? (
					<Card class="min-w-0 p-4">
						<section>
							<h2 class="text-base font-semibold tracking-tight text-card-foreground">
								{t('catalog.holdings.title')}
							</h2>
							<p class="mt-0.5 text-xs text-muted-foreground">
								{t('catalog.holdings.subtitle')}
							</p>
							<ScrollableTable wrapperClass="mt-3">
								<thead class="bg-muted/40 px-4">
									<tr>
										<td colspan={tableColSpan} class="h-1" />
									</tr>
									<CatalogTableHeader showLearnMoreLink={showLearnMoreLink} />
								</thead>
								<tbody>
									{ownedInCatalog.map((e) =>
										renderCatalogRow(
											e,
											holdingsByTicker.get(holdingKey(e.ticker)),
											{ showLearnMoreLink },
										),
									)}
								</tbody>
							</ScrollableTable>
						</section>
					</Card>
				) : null}

				{restOfCatalog.length === 0 && ownedInCatalog.length === 0 ? (
					<Card class="p-4">
						<p class="text-sm text-muted-foreground">{t('catalog.noMatch')}</p>
					</Card>
				) : restOfCatalog.length > 0 ? (
					<Card class="min-w-0 p-4">
						<section>
							<h2 class="text-base font-semibold tracking-tight text-card-foreground">
								{ownedInCatalog.length > 0
									? t('catalog.section.otherAvailable')
									: t('catalog.section.available')}
							</h2>
							<ScrollableTable wrapperClass="mt-3">
								<thead class="bg-muted/40">
									<tr>
										<td colspan={tableColSpan} class="h-1" />
									</tr>
									<CatalogTableHeader showLearnMoreLink={showLearnMoreLink} />
								</thead>
								<tbody>
									{restOfCatalog.map((e) =>
										renderCatalogRow(e, undefined, { showLearnMoreLink }),
									)}
								</tbody>
							</ScrollableTable>
						</section>
					</Card>
				) : null}
			</main>
		)
	}
}
