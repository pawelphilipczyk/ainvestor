import { type Handle } from 'remix/component'
import { SectionIntroCard } from '../../components/data-display/section-intro-card.tsx'
import { t } from '../../lib/i18n.ts'
import { SECTION_INTROS } from '../../lib/section-intros.ts'
import { ImportEtfForm } from '../portfolio/import-etf-form/import-etf-form.tsx'

export function AdminETFImportPage(_handle: Handle, _setup?: unknown) {
	return () => (
		<main class="mx-auto grid w-full min-w-0 max-w-lg gap-6">
			<SectionIntroCard
				page="admin"
				variant="page"
				title={SECTION_INTROS.admin.title}
				description={SECTION_INTROS.admin.description}
			/>
			<ImportEtfForm />
		</main>
	)
}
