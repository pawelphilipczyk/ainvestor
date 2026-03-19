import type { Handle } from 'remix/component'
import {
	NumberInput,
	SelectInput,
	SubmitButton,
	TextInput,
} from '../../../components/index.ts'
import { routes } from '../../../routes.ts'
// @ts-expect-error Runtime-only JS client entry module
import { AddEtfFormEnhancement } from './form-enhancement.component.js'

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

			<div id="add-etf-spinner" class="sr-only" aria-hidden="true">
				<span
					class="inline-flex items-center gap-2"
					role="status"
					aria-live="polite"
				>
					<span
						class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
						aria-hidden="true"
					/>
					Adding…
				</span>
			</div>

			<AddEtfFormEnhancement />
		</>
	)
}
