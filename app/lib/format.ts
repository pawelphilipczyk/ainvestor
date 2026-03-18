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
