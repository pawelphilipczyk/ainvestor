import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { html } from 'remix/html-template'

const componentsDir = join(dirname(fileURLToPath(import.meta.url)))

/**
 * Reads a component HTML file and replaces {{ placeholder }} tokens with
 * the provided slot values. Returns a SafeHtml value via html.raw so it
 * can be safely interpolated into other html`` templates without escaping.
 *
 * Pass an optional `dir` (import.meta.url of the calling module) to resolve
 * the component relative to a different folder (e.g. a feature folder).
 */
export function renderComponent(
	name: string,
	slots: Record<string, string> = {},
	dir?: string,
) {
	const base = dir ? dirname(fileURLToPath(dir)) : componentsDir
	const filePath = join(base, `${name}.html`)
	let template = readFileSync(filePath, 'utf-8')

	for (const [key, value] of Object.entries(slots)) {
		template = template.replaceAll(`{{ ${key} }}`, value)
	}

	return html.raw`${template}`
}
