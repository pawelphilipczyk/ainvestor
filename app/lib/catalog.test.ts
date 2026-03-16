import * as assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	buildCatalogGistPatch,
	CATALOG_FILENAME,
	parseCatalogFromGist,
	parseCsvLine,
	parseCsvToCatalog,
} from "./catalog.ts";

describe("parseCsvLine", () => {
	it("splits a simple comma-separated line", () => {
		assert.deepEqual(parseCsvLine("a,b,c"), ["a", "b", "c"]);
	});

	it("handles quoted fields containing commas", () => {
		assert.deepEqual(parseCsvLine('VTI,"Vanguard, Total",equity'), [
			"VTI",
			"Vanguard, Total",
			"equity",
		]);
	});

	it("handles escaped double-quotes inside quoted fields", () => {
		assert.deepEqual(parseCsvLine('"He said ""hello""",equity'), [
			'He said "hello"',
			"equity",
		]);
	});

	it("trims surrounding whitespace from fields", () => {
		assert.deepEqual(parseCsvLine(" VTI , equity "), ["VTI", "equity"]);
	});
});

describe("parseCsvToCatalog", () => {
	it("returns empty array for empty string", () => {
		assert.deepEqual(parseCsvToCatalog(""), []);
	});

	it("returns empty array when only a header row is present", () => {
		assert.deepEqual(parseCsvToCatalog("ticker,name"), []);
	});

	it("returns empty array when ticker or name column is missing", () => {
		const csv = "symbol,description\nVTI,Broad market";
		assert.deepEqual(parseCsvToCatalog(csv), []);
	});

	it("parses a minimal CSV with ticker and name", () => {
		const csv = "ticker,name\nVTI,Vanguard Total Market";
		const result = parseCsvToCatalog(csv);

		assert.equal(result.length, 1);
		assert.equal(result[0].ticker, "VTI");
		assert.equal(result[0].name, "Vanguard Total Market");
		assert.equal(result[0].type, "equity");
		assert.equal(result[0].description, "");
	});

	it("upcases the ticker", () => {
		const csv = "ticker,name\nvti,Vanguard";
		const result = parseCsvToCatalog(csv);
		assert.equal(result[0].ticker, "VTI");
	});

	it("parses type column and maps it to EtfType", () => {
		const csv = "ticker,name,type\nBND,Vanguard Bond,bond";
		const result = parseCsvToCatalog(csv);
		assert.equal(result[0].type, "bond");
	});

	it("defaults type to equity for unknown values", () => {
		const csv = "ticker,name,type\nVTI,Vanguard,unknown_type";
		const result = parseCsvToCatalog(csv);
		assert.equal(result[0].type, "equity");
	});

	it('accepts "asset class" as an alias for the type column', () => {
		const csv = "ticker,name,asset class\nVNQ,Real Estate ETF,real_estate";
		const result = parseCsvToCatalog(csv);
		assert.equal(result[0].type, "real_estate");
	});

	it('accepts "symbol" as an alias for the ticker column', () => {
		const csv = "symbol,name\nVTI,Vanguard";
		const result = parseCsvToCatalog(csv);
		assert.equal(result[0].ticker, "VTI");
	});

	it("parses description and isin when present", () => {
		const csv =
			"ticker,name,type,description,isin\nVTI,Vanguard Total,equity,US broad market,US9229087690";
		const result = parseCsvToCatalog(csv);
		assert.equal(result[0].description, "US broad market");
		assert.equal(result[0].isin, "US9229087690");
	});

	it("skips rows missing ticker or name", () => {
		const csv = "ticker,name\n,Vanguard\nVTI,";
		const result = parseCsvToCatalog(csv);
		assert.equal(result.length, 0);
	});

	it("assigns a unique id to each entry", () => {
		const csv = "ticker,name\nVTI,Vanguard\nBND,Bond Fund";
		const result = parseCsvToCatalog(csv);
		assert.equal(result.length, 2);
		assert.notEqual(result[0].id, result[1].id);
	});

	it("handles Windows-style CRLF line endings", () => {
		const csv = "ticker,name\r\nVTI,Vanguard\r\nBND,Bond Fund";
		const result = parseCsvToCatalog(csv);
		assert.equal(result.length, 2);
	});

	it("handles a quoted name with a comma inside", () => {
		const csv = 'ticker,name\nVTI,"Vanguard, Total Stock Market"';
		const result = parseCsvToCatalog(csv);
		assert.equal(result[0].name, "Vanguard, Total Stock Market");
	});
});

describe("parseCatalogFromGist", () => {
	it("returns empty array when catalog file is absent", () => {
		const gist = { files: {} };
		assert.deepEqual(parseCatalogFromGist(gist), []);
	});

	it("returns empty array when file content is null", () => {
		const gist = { files: { [CATALOG_FILENAME]: { content: null } } };
		assert.deepEqual(parseCatalogFromGist(gist), []);
	});

	it("returns empty array when content is invalid JSON", () => {
		const gist = { files: { [CATALOG_FILENAME]: { content: "not json" } } };
		assert.deepEqual(parseCatalogFromGist(gist), []);
	});

	it("returns entries from valid JSON content", () => {
		const entry = {
			id: "1",
			ticker: "VTI",
			name: "Vanguard Total",
			type: "equity",
			description: "",
		};
		const gist = {
			files: {
				[CATALOG_FILENAME]: { content: JSON.stringify([entry]) },
			},
		};
		const result = parseCatalogFromGist(gist);
		assert.equal(result.length, 1);
		assert.equal(result[0].ticker, "VTI");
	});
});

describe("buildCatalogGistPatch", () => {
	it("wraps entries in the expected gist patch shape", () => {
		const entry = {
			id: "1",
			ticker: "VTI",
			name: "Vanguard",
			type: "equity" as const,
			description: "",
		};
		const patch = buildCatalogGistPatch([entry]);
		assert.ok(patch.files[CATALOG_FILENAME]);
		const parsed = JSON.parse(patch.files[CATALOG_FILENAME].content);
		assert.equal(parsed[0].ticker, "VTI");
	});
});
