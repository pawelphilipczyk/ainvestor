import type { Handle } from 'remix/component'
import {
	FieldLabel,
	NumberInput,
	SelectInput,
	SubmitButton,
} from '../../../components/index.ts'
import { CURRENCIES } from '../../../lib/currencies.ts'
import { t } from '../../../lib/i18n.ts'
import { MONEY_AMOUNT_HTML_PATTERN } from '../../../lib/money-input.ts'
import { routes } from '../../../routes.ts'

type AddEtfFormProps = {
	instrumentOptions: { value: string; label: string }[]
}

/**
 * Add ETF form feature: form UI and progressive enhancement.
 * Self-contained; used by PortfolioPage. List is rendered separately.
 */
export function AddEtfForm(_handle: Handle, _setup?: unknown) {
	return (props: AddEtfFormProps) => {
		const instrumentPlaceholder =
			props.instrumentOptions.length === 0
				? t('forms.catalog.emptyPlaceholder')
				: t('forms.catalog.selectFundPlaceholder')
		const instrumentSelectOptions = [
			{ value: '', label: instrumentPlaceholder },
			...props.instrumentOptions,
		]

		return (
			<>
				<div
					id="portfolio-form-error"
					role="alert"
					class="hidden rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
				/>
				<p class="mt-2 text-xs text-muted-foreground">{t('addEtf.hint')}</p>
				<form
					method="post"
					action={routes.portfolio.create.href()}
					class="mt-4 grid gap-4"
					data-fetch-submit
					data-fragment-id="portfolio-list"
					data-fragment-url={routes.portfolio.fragmentList.href()}
					data-reset-form
					data-error-id="portfolio-form-error"
				>
					<div class="grid gap-2">
						<FieldLabel fieldId="instrumentTicker">
							{t('addEtf.field.fund')}
						</FieldLabel>
						<SelectInput
							id="instrumentTicker"
							name="instrumentTicker"
							options={instrumentSelectOptions}
							required={true}
						/>
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div class="grid gap-2">
							<FieldLabel fieldId="value">{t('addEtf.field.value')}</FieldLabel>
							<NumberInput
								id="value"
								name="value"
								placeholder={t('addEtf.placeholder.value')}
								required={true}
								inputMode="decimal"
								pattern={MONEY_AMOUNT_HTML_PATTERN}
							/>
						</div>
						<div class="grid gap-2">
							<FieldLabel fieldId="currency">
								{t('addEtf.field.currency')}
							</FieldLabel>
							<SelectInput
								id="currency"
								name="currency"
								options={CURRENCIES.map((c) => ({ value: c, label: c }))}
							/>
						</div>
					</div>
					<div class="grid gap-2">
						<FieldLabel fieldId="quantity">
							{t('addEtf.field.quantityOptional')}
						</FieldLabel>
						<NumberInput
							id="quantity"
							name="quantity"
							placeholder={t('addEtf.placeholder.quantity')}
						/>
					</div>
					<SubmitButton>{t('addEtf.submit')}</SubmitButton>
				</form>
				<p class="mt-4 text-xs text-muted-foreground">
					{t('addEtf.footer.beforeLink')}{' '}
					<a
						href={routes.catalog.index.href()}
						class="font-medium text-primary underline underline-offset-2"
					>
						{t('addEtf.footer.link')}
					</a>{' '}
					{t('addEtf.footer.after')}
				</p>
			</>
		)
	}
}
