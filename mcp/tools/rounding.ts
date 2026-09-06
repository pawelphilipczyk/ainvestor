/** Two decimals is the app's own precision for money and percentages alike. */
export function roundToTwoDecimals(value: number): number {
	return Math.round(value * 100) / 100
}
