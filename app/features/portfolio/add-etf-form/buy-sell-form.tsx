import type { Handle } from 'remix/component'
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

type PortfolioBuySellFormProps = {
	instrumentOptions: { value: string; label: string }[]
}

/**
 * Single trade form: choose buy or sell, then submit once with the same fields as the former manual add form.
 */
export function PortfolioBuySellForm(_handle: Handle, _setup?: unknown) {
	return (props: PortfolioBuySellFormProps) => {
		const instrumentPlaceholder =
			props.instrumentOptions.length === 0
				? t('forms.catalog.emptyPlaceholder')
				: t('forms.catalog.selectFundPlaceholder')
		const instrumentSelectOptions = [
			{ value: '', label: instrumentPlaceholder },
			...props.instrumentOptions,
		]
		const actionOptions = [
			{ value: 'buy', label: t('portfolio.buySell.optionBuy') },
			{ value: 'sell', label: t('portfolio.buySell.optionSell') },
		]

		return (
			<>
				<p class="mt-2 text-xs text-muted-foreground">
					{t('portfolio.buySell.hint')}
				</p>
				<form
					method="post"
					action={routes.portfolio.create.href()}
					class="mt-4 grid gap-4"
					data-frame-submit="portfolio-list"
					data-frame-replace-from-response="1"
					data-reset-form
				>
					<div class="grid gap-2">
						<FieldLabel fieldId="portfolioAction">
							{t('portfolio.buySell.field.action')}
						</FieldLabel>
						<SelectInput
							id="portfolioAction"
							name="portfolioAction"
							options={actionOptions}
							required={true}
						/>
					</div>
					<div class="grid gap-2">
						<FieldLabel fieldId="instrumentTicker">
							{t('portfolio.buySell.field.fund')}
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
								{t('portfolio.buySell.field.value')}
							</FieldLabel>
							<NumberInput
								id="value"
								name="value"
								placeholder={t('portfolio.buySell.placeholder.value')}
								required={true}
								inputMode="decimal"
								pattern={LOCALE_DECIMAL_HTML_PATTERN}
							/>
						</div>
						<div class="grid gap-2">
							<FieldLabel fieldId="currency">
								{t('portfolio.buySell.field.currency')}
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
							{t('portfolio.buySell.field.quantityOptional')}
						</FieldLabel>
						<NumberInput
							id="quantity"
							name="quantity"
							placeholder={t('portfolio.buySell.placeholder.quantity')}
						/>
					</div>
					<SubmitButton>{t('portfolio.buySell.submit')}</SubmitButton>
				</form>
				<p class="mt-4 text-xs text-muted-foreground">
					{t('portfolio.buySell.footer.beforeLink')}{' '}
					<a
						href={routes.catalog.index.href()}
						rmx-document
						class="font-medium text-primary underline underline-offset-2"
					>
						{t('portfolio.buySell.footer.link')}
					</a>{' '}
					{t('portfolio.buySell.footer.after')}
				</p>
			</>
		)
	}
}
