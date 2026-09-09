import type { Handle } from 'remix/ui'
import {
	FieldLabel,
	NumberInput,
	SelectInput,
	SubmitButton,
} from '../../../components/index.ts'
import { CURRENCIES } from '../../../lib/currencies.ts'
import { t } from '../../../lib/i18n.ts'
import { LOCALE_DECIMAL_HTML_PATTERN } from '../../../lib/locale-decimal-input.ts'
import { routes } from '../../../routes.ts'

type PortfolioOperationFormProps = {
	instrumentOptions: { value: string; label: string }[]
}

/**
 * Portfolio buy/sell as a single form: operation, fund, value, currency, then Apply.
 */
export function PortfolioOperationForm(
	handle: Handle<PortfolioOperationFormProps>,
) {
	return () => {
		const props = handle.props
		const instrumentPlaceholder =
			props.instrumentOptions.length === 0
				? t('forms.catalog.emptyPlaceholder')
				: t('forms.catalog.selectFundPlaceholder')
		const instrumentSelectOptions = [
			{ value: '', label: instrumentPlaceholder },
			...props.instrumentOptions,
		]
		const operationOptions = [
			{ value: 'buy', label: t('portfolio.operation.optionBuy') },
			{ value: 'sell', label: t('portfolio.operation.optionSell') },
		]

		return (
			<>
				<p class="mt-2 text-xs text-muted-foreground">
					{t('portfolio.operation.hint')}
				</p>
				<form
					id="portfolio-trade-form"
					method="post"
					action={routes.portfolio.create.href()}
					class="mt-4 grid gap-4"
					data-frame-submit="portfolio-list"
					data-frame-replace-from-response="1"
					data-reset-form
				>
					<div class="grid gap-2">
						<FieldLabel fieldId="portfolioOperation">
							{t('portfolio.operation.field.operation')}
						</FieldLabel>
						<SelectInput
							id="portfolioOperation"
							name="portfolioOperation"
							options={operationOptions}
							required={true}
						/>
					</div>
					<div class="grid gap-2">
						<FieldLabel fieldId="instrumentTicker">
							{t('portfolio.operation.field.fund')}
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
							<FieldLabel fieldId="value">
								{t('portfolio.operation.field.value')}
							</FieldLabel>
							<NumberInput
								id="portfolio-trade-value"
								name="value"
								placeholder={t('portfolio.operation.placeholder.value')}
								required={true}
								inputMode="decimal"
								pattern={LOCALE_DECIMAL_HTML_PATTERN}
							/>
						</div>
						<div class="grid gap-2">
							<FieldLabel fieldId="currency">
								{t('portfolio.operation.field.currency')}
							</FieldLabel>
							<SelectInput
								id="currency"
								name="currency"
								options={CURRENCIES.map((c) => ({ value: c, label: c }))}
							/>
						</div>
					</div>
					<SubmitButton>{t('portfolio.operation.submit')}</SubmitButton>
				</form>
				<p class="mt-4 text-xs text-muted-foreground">
					{t('portfolio.operation.footer.beforeLink')}{' '}
					<a
						href={routes.catalog.index.href()}
						rmx-document
						class="font-medium text-primary underline underline-offset-2"
					>
						{t('portfolio.operation.footer.link')}
					</a>{' '}
					{t('portfolio.operation.footer.after')}
				</p>
			</>
		)
	}
}
