import type { Handle } from 'remix/ui'
import {
	Card,
	FieldLabel,
	SubmitButton,
	TextareaInput,
} from '../../../components/index.ts'
import { t } from '../../../lib/i18n.ts'
import { routes } from '../../../routes.ts'

/**
 * CSV import form: paste and/or file upload, progressive enhancement for list fragment.
 */
export function ImportEtfForm(_handle: Handle, _setup?: unknown) {
	return () => (
		<Card
			variant="muted"
			class="min-w-0 p-4"
			aria-labelledby="portfolio-import-heading"
		>
			<h2
				id="portfolio-import-heading"
				class="text-lg font-semibold tracking-tight text-card-foreground"
			>
				{t('portfolio.import.title')}
			</h2>
			<p class="mt-1 text-xs text-muted-foreground">
				{t('portfolio.import.formatsHint')}
			</p>
			<pre class="mt-2 min-w-0 overflow-x-auto rounded border border-border/80 bg-card px-3 py-2 text-xs text-muted-foreground">
				{`Papier;Giełda;Wartość;Waluta
IBTA LN ETF;GBR-LSE;4087.48;PLN`}
			</pre>
			<p class="mt-2 text-xs text-muted-foreground">
				{t('portfolio.import.encodingNote')}
			</p>
			<form
				method="post"
				action={routes.portfolio.import.href()}
				enctype="multipart/form-data"
				class="mt-4 grid min-w-0 gap-4"
				data-frame-submit="portfolio-list"
			>
				<div class="grid min-w-0 gap-2">
					<FieldLabel fieldId="portfolioCsvPaste">
						{t('portfolio.import.pasteLabel')}
					</FieldLabel>
					<TextareaInput
						id="portfolioCsvPaste"
						name="portfolioCsvPaste"
						placeholder={t('portfolio.import.pastePlaceholder')}
						rows={6}
						class="block max-w-full"
					/>
				</div>
				<div class="grid min-w-0 gap-2">
					<FieldLabel fieldId="portfolioCsv">
						{t('portfolio.import.uploadLabel')}
					</FieldLabel>
					<input
						id="portfolioCsv"
						name="portfolioCsv"
						type="file"
						accept=".csv,text/csv"
						class="min-w-0 max-w-full cursor-pointer text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground hover:file:opacity-90"
					/>
				</div>
				<SubmitButton>{t('portfolio.import.submit')}</SubmitButton>
			</form>
		</Card>
	)
}
