import type { Handle } from 'remix/component'
import {
	FieldLabel,
	NumberInput,
	SelectInput,
	SubmitButton,
} from '../../../components/index.ts'
import { routes } from '../../../routes.ts'

type AddEtfFormProps = {
	instrumentOptions: { value: string; label: string }[]
}

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
	return (props: AddEtfFormProps) => {
		const instrumentPlaceholder =
			props.instrumentOptions.length === 0
				? 'No funds in catalog — import on ETF Catalog'
				: 'Select a fund…'
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
				<p class="mt-2 text-xs text-muted-foreground">
					Pick a fund from your catalog. Its name comes from the catalog row.
				</p>
				<form
					method="post"
					action={routes.portfolio.create.href()}
					class="mt-4 grid gap-4"
					data-fetch-submit
					data-fragment-id="portfolio-list"
					data-fragment-url="/fragments/portfolio-list"
					data-reset-form
					data-error-id="portfolio-form-error"
				>
					<div class="grid gap-2">
						<FieldLabel fieldId="instrumentTicker">Fund</FieldLabel>
						<SelectInput
							id="instrumentTicker"
							name="instrumentTicker"
							options={instrumentSelectOptions}
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
					<div class="grid gap-2">
						<FieldLabel fieldId="quantity">Quantity (optional)</FieldLabel>
						<NumberInput id="quantity" name="quantity" placeholder="e.g. 186" />
					</div>
					<SubmitButton>Add ETF</SubmitButton>
				</form>
				<p class="mt-4 text-xs text-muted-foreground">
					Import or paste funds on the{' '}
					<a
						href={routes.catalog.index.href()}
						class="font-medium text-primary underline underline-offset-2"
					>
						ETF Catalog
					</a>{' '}
					to populate the list.
				</p>
			</>
		)
	}
}
