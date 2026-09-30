/** Whether the app is running in the preview deployment (ainvestor-preview.fly.dev). */
export function isPreview(): boolean {
	return process.env.FLY_APP_NAME === 'ainvestor-preview'
}
