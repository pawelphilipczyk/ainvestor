import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	buildGistBody,
	GIST_DESCRIPTION,
	GIST_FILENAME,
	parseEtfsFromGist,
} from "./gist.ts";

describe("gist", () => {
	it("exports the expected constants", () => {
		assert.equal(typeof GIST_FILENAME, "string");
		assert.equal(typeof GIST_DESCRIPTION, "string");
	});

	it("parseEtfsFromGist returns empty array for missing file", () => {
		const result = parseEtfsFromGist({ files: {} });
		assert.deepEqual(result, []);
	});

	it("parseEtfsFromGist returns empty array for null content", () => {
		const result = parseEtfsFromGist({
			files: { [GIST_FILENAME]: { content: null } },
		});
		assert.deepEqual(result, []);
	});

	it("parseEtfsFromGist parses valid ETF JSON with new fields", () => {
		const entries = [
			{ id: "abc-1", name: "VTI", value: 1200.5, currency: "USD" },
			{ id: "abc-2", name: "VWCE", value: 3400, currency: "EUR" },
		];
		const result = parseEtfsFromGist({
			files: { [GIST_FILENAME]: { content: JSON.stringify(entries) } },
		});
		assert.deepEqual(result, entries);
	});

	it("parseEtfsFromGist returns empty array for invalid JSON", () => {
		const result = parseEtfsFromGist({
			files: { [GIST_FILENAME]: { content: "not-json!!!" } },
		});
		assert.deepEqual(result, []);
	});

	it("buildGistBody creates a valid create-gist request body", () => {
		const entries = [{ id: "abc-1", name: "SPY", value: 500, currency: "USD" }];
		const body = buildGistBody(entries);

		assert.equal(body.description, GIST_DESCRIPTION);
		assert.equal(body.public, false);
		assert.ok(body.files[GIST_FILENAME]);
		assert.equal(
			body.files[GIST_FILENAME].content,
			JSON.stringify(entries, null, 2),
		);
	});
});
