const MAX_CATALOG_LINE_FOR_ETF_PROMPT = 8_000

function stripAsciiControls(value: string): string {
	let result = ''
	for (const character of value) {
		const code = character.charCodeAt(0)
		if (code <= 8) continue
		if (code === 11 || code === 12) continue
		if (code >= 14 && code <= 31) continue
		if (code === 127) continue
		result += character
	}
	return result
}

function weakenPromptBoundaryMarkers(value: string): string {
	return value.replace(/-{3,}|={3,}/g, '—')
}

/**
 * Catalog text is pasted/imported and echoed into the ETF-detail user message. Trim control
 * characters, collapse newlines, and soften long `---` / `===` runs so they cannot mimic
 * instruction boundaries in the prompt.
 */
export function sanitizeCatalogLineFragmentForEtfDetailPrompt(
	raw: string,
): string {
	let line = stripAsciiControls(raw)
	line = line.replace(/\r\n|\r|\n/g, ' ')
	line = weakenPromptBoundaryMarkers(line)
	line = line.replace(/\s+/g, ' ').trim()
	if (line.length > MAX_CATALOG_LINE_FOR_ETF_PROMPT) {
		line = line.slice(0, MAX_CATALOG_LINE_FOR_ETF_PROMPT).trimEnd()
	}
	return line
}
