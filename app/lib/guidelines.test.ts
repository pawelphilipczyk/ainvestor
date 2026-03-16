import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EtfGuideline } from "./guidelines.ts";
import {
	buildGuidelinesGistPatch,
	GUIDELINES_FILENAME,
	parseGuidelinesFromGist,
} from "./guidelines.ts";

describe("guidelines", () => {
	it("GUIDELINES_FILENAME is a non-empty string", () => {
		assert.equal(typeof GUIDELINES_FILENAME, "string");
		assert.ok(GUIDELINES_FILENAME.length > 0);
	});

	it("parseGuidelinesFromGist returns empty array when file is missing", () => {
		const result = parseGuidelinesFromGist({ files: {} });
		assert.deepEqual(result, []);
	});

	it("parseGuidelinesFromGist returns empty array when content is null", () => {
		const result = parseGuidelinesFromGist({
			files: { [GUIDELINES_FILENAME]: { content: null } },
		});
		assert.deepEqual(result, []);
	});

	it("parseGuidelinesFromGist parses valid guidelines JSON", () => {
		const guidelines: EtfGuideline[] = [
			{ id: "g1", etfName: "VTI", targetPct: 60, etfType: "equity" },
			{ id: "g2", etfName: "BND", targetPct: 30, etfType: "bond" },
		];
		const result = parseGuidelinesFromGist({
			files: { [GUIDELINES_FILENAME]: { content: JSON.stringify(guidelines) } },
		});
		assert.deepEqual(result, guidelines);
	});

	it("parseGuidelinesFromGist returns empty array for invalid JSON", () => {
		const result = parseGuidelinesFromGist({
			files: { [GUIDELINES_FILENAME]: { content: "not-json!!!" } },
		});
		assert.deepEqual(result, []);
	});

	it("buildGuidelinesGistPatch produces a PATCH-ready body", () => {
		const guidelines: EtfGuideline[] = [
			{ id: "g1", etfName: "VTI", targetPct: 60, etfType: "equity" },
		];
		const patch = buildGuidelinesGistPatch(guidelines);

		assert.ok(patch.files[GUIDELINES_FILENAME]);
		assert.equal(
			patch.files[GUIDELINES_FILENAME].content,
			JSON.stringify(guidelines, null, 2),
		);
	});
});
