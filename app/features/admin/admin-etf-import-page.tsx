import type { Handle } from 'remix/component'
import { SectionIntroCard } from '../../components/data-display/section-intro-card.tsx'
import { Card } from '../../components/index.ts'
import { t } from '../../lib/i18n.ts'
import { SECTION_INTROS } from '../../lib/section-intros.ts'
import { CatalogImportCard } from '../catalog/catalog-import-card.tsx'

type AdminEtfImportPageProps = {
	canImport: boolean
	sharedCatalogOwnerLogin: string | null
}

export function AdminETFImportPage(_handle: Handle, _setup?: unknown) {
	return (props: AdminEtfImportPageProps) => (
		<main class="mx-auto grid w-full min-w-0 max-w-lg gap-6">
			<SectionIntroCard
				page="admin"
				variant="page"
				title={SECTION_INTROS.admin.title}
				description={SECTION_INTROS.admin.description}
			/>
			<Card variant="muted" class="p-4">
				<p class="text-sm text-muted-foreground">
					{t('admin.etfImport.frequencyNote')}
				</p>
			</Card>
			{props.canImport ? (
				<CatalogImportCard
					sharedCatalogOwnerLogin={props.sharedCatalogOwnerLogin}
				/>
			) : (
				<Card variant="muted" class="p-4">
					<section aria-labelledby="admin-import-unavailable-heading">
						<h2
							id="admin-import-unavailable-heading"
							class="text-base font-semibold tracking-tight text-card-foreground"
						>
							{t('admin.etfImport.unavailableTitle')}
						</h2>
						<p class="mt-1 text-sm text-muted-foreground">
							{t('admin.etfImport.unavailableBody')}
						</p>
					</section>
				</Card>
			)}
		</main>
	)
}
