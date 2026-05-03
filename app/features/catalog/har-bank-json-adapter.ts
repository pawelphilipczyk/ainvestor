/**
 * Builds the bank API-shaped JSON expected by `parseBankJsonForImport` from a HAR export.
 *
 * Targets mbank emakler ETF screener paginated XHRs:
 * `…/api/equities/widgets/etf-screener-v3?offset=…&limit=…` — each response body is
 * `{ data: FundRow[], count, total_count }`. Paginated pages are merged by `offset`
 * into a single `{ data: FundRow[] }`.
 */

const ETF_SCREENER_PATH = '/api/equities/widgets/etf-screener-v3'

export type ExtractBankApiJsonFromHarResult =
	| { ok: true; payload: unknown }
	| { ok: false }

function isHarRoot(value: unknown): value is {
	log: { entries: unknown[] }
} {
	if (!value || typeof value !== 'object') return false
	const log = (value as Record<string, unknown>).log
	if (!log || typeof log !== 'object') return false
	const entries = (log as Record<string, unknown>).entries
	return Array.isArray(entries)
}

function decodeResponseText(content: Record<string, unknown>): string | null {
	const rawText = content.text
	if (typeof rawText !== 'string' || rawText.length === 0) return null
	const encoding = content.encoding
	if (encoding === 'base64') {
		try {
			return Buffer.from(rawText, 'base64').toString('utf8')
		} catch {
			return null
		}
	}
	return rawText
}

function offsetFromRequestUrl(urlString: string): number | null {
	try {
		const offsetParam = new URL(urlString).searchParams.get('offset')
		if (offsetParam === null || offsetParam === '') return 0
		if (!/^\d+$/.test(offsetParam)) return null
		const parsed = Number(offsetParam)
		if (!Number.isSafeInteger(parsed) || parsed < 0) return null
		return parsed
	} catch {
		return null
	}
}

/**
 * Walks HAR entries, collects ETF screener JSON responses, merges `data` arrays in offset order.
 * Returns `{ ok: false }` if the file is not HAR-shaped, has no usable screener pages, or any screener response is invalid JSON or missing a `data` array.
 */
export function extractBankApiJsonFromHar(
	harRoot: unknown,
): ExtractBankApiJsonFromHarResult {
	if (!isHarRoot(harRoot)) {
		return { ok: false }
	}

	const pagesByOffset = new Map<number, unknown[]>()

	for (const entry of harRoot.log.entries) {
		if (!entry || typeof entry !== 'object') continue
		const record = entry as Record<string, unknown>
		const request = record.request
		const response = record.response
		if (!request || typeof request !== 'object') continue
		if (!response || typeof response !== 'object') continue

		const url = (request as Record<string, unknown>).url
		if (typeof url !== 'string' || !url.includes(ETF_SCREENER_PATH)) continue

		const status = (response as Record<string, unknown>).status
		if (status !== 200) continue

		const content = (response as Record<string, unknown>).content
		if (!content || typeof content !== 'object') continue

		const text = decodeResponseText(content as Record<string, unknown>)
		if (text === null) continue

		let body: unknown
		try {
			body = JSON.parse(text)
		} catch {
			return { ok: false }
		}

		if (!body || typeof body !== 'object' || Array.isArray(body)) {
			return { ok: false }
		}

		const data = (body as Record<string, unknown>).data
		if (!Array.isArray(data)) {
			return { ok: false }
		}

		const offset = offsetFromRequestUrl(url)
		if (offset === null || pagesByOffset.has(offset)) {
			return { ok: false }
		}
		pagesByOffset.set(offset, data)
	}

	if (pagesByOffset.size === 0) {
		return { ok: false }
	}

	const offsets = [...pagesByOffset.keys()].sort((a, b) => a - b)
	const merged: unknown[] = []
	for (const offset of offsets) {
		const rows = pagesByOffset.get(offset)
		if (rows) merged.push(...rows)
	}

	return { ok: true, payload: { data: merged } }
}
