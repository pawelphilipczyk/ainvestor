import type { Handle } from 'remix/component'
import { t } from '../../lib/i18n.ts'

export type CatalogEtfAnalysisFragmentProps = {
	descriptionText: string
	serviceError?: boolean
}

/**
 * HTML fragment loaded into a Remix {@link Frame} on the ETF detail page (AI analysis only).
 */
export function CatalogEtfAnalysisFragment(_handle: Handle, _setup?: unknown) {
	return (props: CatalogEtfAnalysisFragmentProps) => (
		<div class="min-w-0">
			{props.serviceError ? (
				<p role="alert" class="text-sm text-destructive">
					{t('errors.catalog.etfDetail.service')}
				</p>
			) : (
				<div class="whitespace-pre-wrap break-words text-sm leading-relaxed text-card-foreground">
					{props.descriptionText}
				</div>
			)}
		</div>
	)
}
