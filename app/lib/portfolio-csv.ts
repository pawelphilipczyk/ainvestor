import type { EtfEntry } from './gist.ts'

/**
 * Decode CSV bytes, trying UTF-8 first and falling back to Windows-1250
 * when the file contains replacement characters (typical of Polish broker exports).
 */
export function decodeCsvBytes(bytes: ArrayBuffer): string {
	const utf8 = new TextDecoder('utf-8').decode(bytes)
	if (utf8.includes('\uFFFD')) {
		return new TextDecoder('windows-1250').decode(bytes)
	}
	return utf8
}

/** Split a CSV line by delimiter, respecting double-quoted fields. */
function parseDelimitedLine(line: string, delimiter: string): string[] {
	const result: string[] = []
	let current = ''
	let inQuotes = false

	for (let i = 0; i < line.length; i++) {
		const character = line[i]
		if (character === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"'
				i++
			} else {
				inQuotes = !inQuotes
			}
		} else if (character === delimiter && !inQuotes) {
			result.push(current.trim())
			current = ''
		} else {
			current += character
		}
	}
	result.push(current.trim())
	return result
}

/** Polish and English header aliases for portfolio CSV columns. */
const TICKER_ALIASES = ['papier', 'ticker', 'symbol', 'code', 'paper']
const VALUE_ALIASES = ['wartość', 'wartosc', 'value', 'warto']
const CURRENCY_ALIASES = ['waluta', 'currency']
const EXCHANGE_ALIASES = ['giełda', 'gielda', 'exchange', 'gie']
const QUANTITY_ALIASES = [
	'liczba dostępna',
	'liczba dostepna',
	'quantity',
	'shares',
	'liczba',
]

function normaliseHeader(h: string): string {
	return h
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '') // strip diacritics for matching
		.replace(/\s+/g, ' ')
		.trim()
}

function colIndex(headers: string[], aliases: string[]): number {
	const normalised = headers.map(normaliseHeader)
	for (const alias of aliases) {
		const columnIndex = normalised.findIndex(
			(header) => header.includes(alias) || alias.includes(header),
		)
		if (columnIndex !== -1) return columnIndex
	}
	return -1
}

/**
 * Parse portfolio holdings from CSV text.
 * Supports eMAKLER/mBank format: semicolon delimiter, Polish headers
 * (Papier, Wartość, Waluta), and files with meta lines before the data table.
 */
export function parsePortfolioCsv(csvText: string): EtfEntry[] {
	const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0)
	if (lines.length < 2) return []

	const delimiter = csvText.includes(';') ? ';' : ','

	// Find header row (may be after meta lines)
	let headerRowIndex = -1
	for (let i = 0; i < Math.min(lines.length, 20); i++) {
		const cols = parseDelimitedLine(lines[i], delimiter)
		const headers = cols.map(normaliseHeader)
		const hasTicker = TICKER_ALIASES.some((a) =>
			headers.some((h) => h.includes(a) || a.includes(h)),
		)
		const hasValue = VALUE_ALIASES.some((a) =>
			headers.some((h) => h.includes(a) || a.includes(h)),
		)
		if (hasTicker && hasValue && cols.length >= 2) {
			headerRowIndex = i
			break
		}
	}

	if (headerRowIndex === -1) return []

	const headers = parseDelimitedLine(lines[headerRowIndex], delimiter).map(
		(h) => h.toLowerCase().replace(/\s+/g, ' '),
	)

	const tickerCol = colIndex(headers, TICKER_ALIASES)
	const valueCol = colIndex(headers, VALUE_ALIASES)
	const exchangeCol = colIndex(headers, EXCHANGE_ALIASES)
	const quantityCol = colIndex(headers, QUANTITY_ALIASES)

	if (tickerCol === -1 || valueCol === -1) return []

	// Value currency is typically the column after Wartość (eMAKLER: Papier;...;Wartość;Waluta)
	const currencyCol =
		valueCol + 1 < headers.length
			? valueCol + 1
			: colIndex(headers, CURRENCY_ALIASES)

	const entries: EtfEntry[] = []

	for (const line of lines.slice(headerRowIndex + 1)) {
		const cols = parseDelimitedLine(line, delimiter)
		const ticker = (cols[tickerCol] ?? '').trim()
		const valueStr = (cols[valueCol] ?? '').replace(/\s/g, '').replace(',', '.')

		if (!ticker) continue

		const value = Number.parseFloat(valueStr)
		if (Number.isNaN(value) || value < 0) continue

		const currency =
			currencyCol >= 0
				? (cols[currencyCol] ?? 'PLN').trim().toUpperCase()
				: 'PLN'
		if (!currency) continue

		const exchange =
			exchangeCol >= 0
				? (cols[exchangeCol] ?? '').trim() || undefined
				: undefined
		const quantityRaw =
			quantityCol >= 0 ? (cols[quantityCol] ?? '').replace(/\s/g, '') : ''
		const quantity = quantityRaw ? Number.parseInt(quantityRaw, 10) : undefined

		entries.push({
			id: crypto.randomUUID(),
			name: ticker,
			value,
			currency: currency || 'PLN',
			...(exchange ? { exchange } : {}),
			...(quantity !== undefined && !Number.isNaN(quantity) && quantity >= 0
				? { quantity }
				: {}),
		})
	}

	return entries
}
