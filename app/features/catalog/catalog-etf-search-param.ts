/** Search param used to open ETF details in-place on catalog and advice pages. */
export const ETF_DETAIL_SEARCH_PARAM = 'etf'

export function parseEtfDetailSearchParam(url: string): string | null {
	const raw = new URL(url).searchParams.get(ETF_DETAIL_SEARCH_PARAM)
	return normalizeCatalogEntryIdFromSearchParam(raw)
}

const CATALOG_ENTRY_ID_PARAM_MAX = 128

function normalizeCatalogEntryIdFromSearchParam(
	raw: string | null,
): string | null {
	if (raw === null) return null
	const trimmed = raw.trim()
	if (trimmed.length === 0 || trimmed.length > CATALOG_ENTRY_ID_PARAM_MAX) {
		return null
	}
	return trimmed
}
