import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { html } from "remix/html-template";

const componentsDir = join(dirname(fileURLToPath(import.meta.url)));

/**
 * Reads a component HTML file and replaces {{ placeholder }} tokens with
 * the provided slot values. Returns a SafeHtml value via html.raw so it
 * can be safely interpolated into other html`` templates without escaping.
 */
export function renderComponent(
	name: string,
	slots: Record<string, string> = {},
) {
	const filePath = join(componentsDir, `${name}.html`);
	let template = readFileSync(filePath, "utf-8");

	for (const [key, value] of Object.entries(slots)) {
		template = template.replaceAll(`{{ ${key} }}`, value);
	}

	return html.raw`${template}`;
}
