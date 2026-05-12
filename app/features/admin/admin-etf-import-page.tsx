import type { Handle } from 'remix/ui'
import { SectionIntroCard } from '../../components/data-display/section-intro-card.tsx'
import { t } from '../../lib/i18n.ts'
import { getSectionIntro } from '../../lib/section-intros.ts'
import { CatalogImportCard } from '../catalog/catalog-import-card.tsx'

type AdminEtfImportPageProps = {
	sharedCatalogOwnerLogin: string | null
}

export function AdminETFImportPage(_handle: Handle, _setup?: unknown) {
	return (props: AdminEtfImportPageProps) => {
		const adminIntro = getSectionIntro('admin')
		return (
			<main class="mx-auto grid w-full min-w-0 max-w-lg gap-6">
				<SectionIntroCard
					page="admin"
					variant="page"
					title={adminIntro.title}
					description={adminIntro.description}
				/>
				<div class="rounded-lg border border-border bg-muted/40 p-4">
					<p class="text-sm text-muted-foreground">
						{t('admin.etfImport.frequencyNote')}
					</p>
				</div>
				<CatalogImportCard
					sharedCatalogOwnerLogin={props.sharedCatalogOwnerLogin}
				/>
			</main>
		)
	}
}
