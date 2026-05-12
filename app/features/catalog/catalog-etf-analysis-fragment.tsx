import type { Handle } from 'remix/ui'

export type CatalogEtfAnalysisFragmentProps = {
	/** Rendered AI overview prose (plain text shown with pre-wrap). */
	text?: string
	/** Server error message (403 / 404 / 503 / validation). */
	error?: string
}

export function CatalogEtfAnalysisFragment(
	handle: Handle<CatalogEtfAnalysisFragmentProps>,
) {
	return () => {
		if (handle.props.error !== undefined && handle.props.error.length > 0) {
			return (
				<div
					role="alert"
					class="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
				>
					{handle.props.error}
				</div>
			)
		}
		if (handle.props.text !== undefined && handle.props.text.length > 0) {
			return (
				<div class="mt-4 min-w-0 max-w-full overflow-x-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-card-foreground">
					{handle.props.text}
				</div>
			)
		}
		return <span hidden aria-hidden="true" />
	}
}
