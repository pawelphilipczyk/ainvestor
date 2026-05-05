import type { Handle } from 'remix/component'
import type { AdviceModelId } from '../advice/advice-openai.ts'
import { CatalogEtfPage } from './catalog-etf-page.tsx'
import type { CatalogEntry } from './lib.ts'

/** HTML fragment for the scrollable ETF modal body (loaded via Remix `<Frame>`). */
export type CatalogEtfModalBodyFragmentProps = {
	entry: CatalogEntry
	catalogFallbackHref: string
	descriptionText?: string
	analysisPostHref?: string | null
	analysisFrameSrc?: string
	selectedModel?: AdviceModelId
}

export function CatalogEtfModalBodyFragment(_handle: Handle, _setup?: unknown) {
	return (props: CatalogEtfModalBodyFragmentProps) => (
		<CatalogEtfPage
			entry={props.entry}
			catalogFallbackHref={props.catalogFallbackHref}
			descriptionText={props.descriptionText}
			analysisPostHref={props.analysisPostHref}
			analysisFrameSrc={props.analysisFrameSrc}
			selectedModel={props.selectedModel}
			fullPage={false}
		/>
	)
}
