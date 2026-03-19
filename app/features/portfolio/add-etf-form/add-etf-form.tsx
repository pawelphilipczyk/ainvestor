import type { Handle } from 'remix/component'
import {
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
				<TextInput
					id="etfName"
					label="ETF Name"
					fieldName="etfName"
					placeholder="e.g. VTI"
					required={true}
				/>
				<div class="grid grid-cols-2 gap-3">
					<NumberInput
						id="value"
						label="Value"
						fieldName="value"
						placeholder="e.g. 1200.50"
						required={true}
					/>
					<SelectInput
						id="currency"
						label="Currency"
						fieldName="currency"
						options={CURRENCIES.map((c) => ({ value: c, label: c }))}
					/>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<TextInput
						id="exchange"
						label="Exchange (optional)"
						fieldName="exchange"
						placeholder="e.g. GBR-LSE, DEU-XETRA"
					/>
					<NumberInput
						id="quantity"
						label="Quantity (optional)"
						fieldName="quantity"
						placeholder="e.g. 186"
					/>
				</div>
				<SubmitButton>Add ETF</SubmitButton>
			</form>
		</>
	)
}
