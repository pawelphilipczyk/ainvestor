import type { Handle } from 'remix/component'
import {
	Card,
	FieldLabel,
	SubmitButton,
	TextareaInput,
} from '../../components/index.ts'
import { t } from '../../lib/i18n.ts'
import { routes } from '../../routes.ts'

type CatalogImportCardProps = {
	sharedCatalogOwnerLogin: string | null
}

export function CatalogImportCard(_handle: Handle, _setup?: unknown) {
	return (props: CatalogImportCardProps) => (
		<Card variant="muted" class="p-4">
			<section aria-labelledby="catalog-import-heading">
				<h2
					id="catalog-import-heading"
					class="text-base font-semibold tracking-tight text-card-foreground"
				>
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
						rows={8}
						required={true}
						class="block w-full max-w-xl"
					/>
					<SubmitButton>{t('catalog.import.submit')}</SubmitButton>
				</form>
			</section>
		</Card>
	)
}
