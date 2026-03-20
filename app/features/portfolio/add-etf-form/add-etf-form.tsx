import type { Handle } from 'remix/component'
import {
	FieldLabel,
	NumberInput,
	SelectInput,
	SubmitButton,
	TextInput,
} from '../../../components/index.ts'
import { routes } from '../../../routes.ts'

const CURRENCIES = [
	'PLN',
	'USD',
	'EUR',
	'GBP',
	'CHF',
	'JPY',
	'CAD',
	'AUD',
	'SEK',
	'NOK',
]

/**
 * Add ETF form feature: form UI and progressive enhancement.
 * Self-contained; used by PortfolioPage. List is rendered separately.
 */
export function AddEtfForm(_handle: Handle, _setup?: unknown) {
	return () => (
		<>
			<div
				id="portfolio-form-error"
				role="alert"
				class="hidden rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
			/>
			<form
				method="post"
				action={routes.portfolio.create.href()}
				class="mt-6 grid gap-4"
				data-fetch-submit
				data-fragment-id="portfolio-list"
				data-fragment-url="/fragments/portfolio-list"
				data-reset-form
				data-error-id="portfolio-form-error"
			>
				<div class="grid gap-2">
					<FieldLabel fieldId="etfName">ETF Name</FieldLabel>
					<TextInput
						id="etfName"
						name="etfName"
						placeholder="e.g. VTI"
						required={true}
					/>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div class="grid gap-2">
						<FieldLabel fieldId="value">Value</FieldLabel>
						<NumberInput
							id="value"
							name="value"
							placeholder="e.g. 1200.50"
							required={true}
						/>
					</div>
					<div class="grid gap-2">
						<FieldLabel fieldId="currency">Currency</FieldLabel>
						<SelectInput
							id="currency"
							name="currency"
							options={CURRENCIES.map((c) => ({ value: c, label: c }))}
						/>
					</div>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div class="grid gap-2">
						<FieldLabel fieldId="exchange">Exchange (optional)</FieldLabel>
						<TextInput
							id="exchange"
							name="exchange"
							placeholder="e.g. GBR-LSE, DEU-XETRA"
						/>
					</div>
					<div class="grid gap-2">
						<FieldLabel fieldId="quantity">Quantity (optional)</FieldLabel>
						<NumberInput id="quantity" name="quantity" placeholder="e.g. 186" />
					</div>
				</div>
				<SubmitButton>Add ETF</SubmitButton>
			</form>
		</>
	)
}
