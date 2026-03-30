export function formatValue(value: number, currency: string): string {
	try {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency,
			maximumFractionDigits: 2,
		}).format(value)
	} catch {
		return `${value} ${currency}`
	}
}

/** Plain number string for portfolio value inputs (matches locale decimal parsing output). */
export function formatPortfolioValueForInput(value: number): string {
	return new Intl.NumberFormat('en-US', {
		maximumFractionDigits: 2,
		useGrouping: false,
	}).format(value)
}
