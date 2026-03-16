import * as assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { AdviceClient } from "./openai.ts";
import {
	resetEtfEntries,
	resetGuestCatalog,
	resetGuestGuidelines,
	router,
	setAdviceClient,
} from "./router.ts";

function makeMockClient(responseText: string): AdviceClient {
	return {
		chat: {
			completions: {
				create: async () => ({
					choices: [{ message: { content: responseText } }],
				}),
			},
		},
	};
}

afterEach(() => {
	resetEtfEntries();
	resetGuestGuidelines();
	resetGuestCatalog();
	setAdviceClient(null);
	delete process.env.GH_CLIENT_ID;
});

describe("ETF homepage", () => {
	it("returns ok from the health endpoint", async () => {
		const response = await router.fetch("http://localhost/health");
		const body = await response.text();

		assert.equal(response.status, 200);
		assert.equal(body, "ok");
	});

	it("renders the homepage and ETF form", async () => {
		const response = await router.fetch("http://localhost/");
		const body = await response.text();

		assert.equal(response.status, 200);
		assert.match(body, /AI Investor/);
		assert.match(body, /<form[^>]*method="post"[^>]*action="\/etfs"/);
	});

	it("GET / sets Cache-Control: no-store so browsers always fetch a fresh ETF list", async () => {
		const response = await router.fetch("http://localhost/");

		assert.equal(response.headers.get("cache-control"), "no-store");
	});

	it("form has name, value and currency fields", async () => {
		const response = await router.fetch("http://localhost/");
		const body = await response.text();

		assert.match(body, /name="etfName"/);
		assert.match(body, /name="value"/);
		assert.match(body, /name="currency"/);
	});

	it("returns 400 when cashAmount is missing from advice request", async () => {
		setAdviceClient(makeMockClient("irrelevant"));
		const form = new FormData();

		const response = await router.fetch(
			new Request("http://localhost/advice", { method: "POST", body: form }),
		);

		assert.equal(response.status, 400);
	});

	it("returns advice HTML from the LLM when cashAmount is provided", async () => {
		setAdviceClient(makeMockClient("Buy VTI for broad market exposure."));

		const form = new FormData();
		form.set("cashAmount", "1000");

		const response = await router.fetch(
			new Request("http://localhost/advice", { method: "POST", body: form }),
		);
		const body = await response.text();

		assert.equal(response.status, 200);
		assert.match(body, /Buy VTI for broad market exposure\./);
	});

	it("includes current ETF holdings in the advice context", async () => {
		let capturedUserMessage = "";
		const capturingClient: AdviceClient = {
			chat: {
				completions: {
					create: async (params) => {
						capturedUserMessage = params.messages[1].content;
						return { choices: [{ message: { content: "advice" } }] };
					},
				},
			},
		};
		setAdviceClient(capturingClient);

		// First add an ETF with the new schema
		const addForm = new FormData();
		addForm.set("etfName", "VXUS");
		addForm.set("value", "3000");
		addForm.set("currency", "USD");
		await router.fetch(
			new Request("http://localhost/etfs", { method: "POST", body: addForm }),
		);

		// Then ask for advice
		const adviceForm = new FormData();
		adviceForm.set("cashAmount", "500");
		await router.fetch(
			new Request("http://localhost/advice", {
				method: "POST",
				body: adviceForm,
			}),
		);

		assert.match(capturedUserMessage, /VXUS/);
		assert.match(capturedUserMessage, /3000 USD/);
		assert.match(capturedUserMessage, /\$500/);
	});

	it("passes guidelines into the advice prompt when they exist", async () => {
		let capturedUserMessage = "";
		const capturingClient: AdviceClient = {
			chat: {
				completions: {
					create: async (params) => {
						capturedUserMessage = params.messages[1].content;
						return { choices: [{ message: { content: "advice" } }] };
					},
				},
			},
		};
		setAdviceClient(capturingClient);

		// Add a guideline
		const guidelineForm = new FormData();
		guidelineForm.set("etfName", "VTI");
		guidelineForm.set("targetPct", "60");
		guidelineForm.set("etfType", "equity");
		await router.fetch(
			new Request("http://localhost/guidelines", {
				method: "POST",
				body: guidelineForm,
			}),
		);

		// Ask for advice
		const adviceForm = new FormData();
		adviceForm.set("cashAmount", "1000");
		await router.fetch(
			new Request("http://localhost/advice", {
				method: "POST",
				body: adviceForm,
			}),
		);

		assert.match(capturedUserMessage, /VTI.*60%/);
		assert.match(capturedUserMessage, /equity/);
	});

	it("adds an ETF on form submit and displays it on homepage", async () => {
		const form = new FormData();
		form.set("etfName", "VTI");
		form.set("value", "1200.50");
		form.set("currency", "USD");

		const postResponse = await router.fetch(
			new Request("http://localhost/etfs", {
				method: "POST",
				body: form,
			}),
		);

		assert.equal(postResponse.status, 302);
		assert.equal(postResponse.headers.get("location"), "/");

		const homeResponse = await router.fetch("http://localhost/");
		const homeBody = await homeResponse.text();

		assert.match(homeBody, /VTI/);
		assert.match(homeBody, /1[,.]?200/);
		assert.match(homeBody, /USD/);
	});

	it("shows sign-in link when not authenticated", async () => {
		const response = await router.fetch("http://localhost/");
		const body = await response.text();

		assert.equal(response.status, 200);
		assert.match(body, /Sign in with GitHub/);
		assert.match(body, /href="\/auth\/github"/);
	});

	it("renders advice form section on the homepage", async () => {
		const response = await router.fetch("http://localhost/");
		const body = await response.text();

		assert.match(body, /Get Advice/);
		assert.match(body, /name="cashAmount"/);
		assert.match(body, /action="\/advice"/);
	});

	it("homepage has a link to the guidelines page", async () => {
		const response = await router.fetch("http://localhost/");
		const body = await response.text();

		assert.match(body, /href="\/guidelines"/);
		assert.match(body, /Manage guidelines/);
	});
});

describe("Guidelines page", () => {
	it("GET /guidelines returns 200 with the guidelines form", async () => {
		const response = await router.fetch("http://localhost/guidelines");
		const body = await response.text();

		assert.equal(response.status, 200);
		assert.match(body, /Investment Guidelines/);
		assert.match(body, /name="etfName"/);
		assert.match(body, /name="targetPct"/);
		assert.match(body, /name="etfType"/);
	});

	it("POST /guidelines adds a guideline and redirects", async () => {
		const form = new FormData();
		form.set("etfName", "VTI");
		form.set("targetPct", "60");
		form.set("etfType", "equity");

		const response = await router.fetch(
			new Request("http://localhost/guidelines", {
				method: "POST",
				body: form,
			}),
		);

		assert.equal(response.status, 302);
		assert.equal(response.headers.get("location"), "/guidelines");
	});

	it("added guideline appears on the guidelines page", async () => {
		const form = new FormData();
		form.set("etfName", "BND");
		form.set("targetPct", "30");
		form.set("etfType", "bond");

		await router.fetch(
			new Request("http://localhost/guidelines", {
				method: "POST",
				body: form,
			}),
		);

		const response = await router.fetch("http://localhost/guidelines");
		const body = await response.text();

		assert.match(body, /BND/);
		assert.match(body, /30/);
		assert.match(body, /bond/);
	});

	it("POST /guidelines ignores submission with missing etfName", async () => {
		const form = new FormData();
		form.set("targetPct", "50");
		form.set("etfType", "equity");

		const response = await router.fetch(
			new Request("http://localhost/guidelines", {
				method: "POST",
				body: form,
			}),
		);

		assert.equal(response.status, 302);

		const page = await router.fetch("http://localhost/guidelines");
		const body = await page.text();
		assert.match(body, /No guidelines/);
	});

	it("POST /guidelines/:id/delete removes the guideline", async () => {
		// Add a guideline
		const addForm = new FormData();
		addForm.set("etfName", "VNQ");
		addForm.set("targetPct", "10");
		addForm.set("etfType", "real_estate");
		await router.fetch(
			new Request("http://localhost/guidelines", {
				method: "POST",
				body: addForm,
			}),
		);

		// Grab the id from the rendered page
		const listResponse = await router.fetch("http://localhost/guidelines");
		const listBody = await listResponse.text();
		const idMatch = listBody.match(/\/guidelines\/([^/]+)\/delete/);
		assert.ok(idMatch, "delete link should be present");
		const id = idMatch![1];

		// Delete it
		const deleteResponse = await router.fetch(
			new Request(`http://localhost/guidelines/${id}/delete`, {
				method: "POST",
			}),
		);

		assert.equal(deleteResponse.status, 302);

		// Confirm it's gone
		const afterBody = await (
			await router.fetch("http://localhost/guidelines")
		).text();
		assert.match(afterBody, /No guidelines/);
	});
});

describe("ETF Catalog page", () => {
	it("GET /catalog returns 200 with page title", async () => {
		const response = await router.fetch("http://localhost/catalog");
		const body = await response.text();

		assert.equal(response.status, 200);
		assert.match(body, /ETF Catalog/);
	});

	it("GET /catalog shows CSV import form", async () => {
		const response = await router.fetch("http://localhost/catalog");
		const body = await response.text();

		assert.match(body, /name="csvFile"/);
		assert.match(body, /action="\/catalog\/import"/);
		assert.match(body, /enctype="multipart\/form-data"/);
	});

	it("GET /catalog shows empty state hint when no catalog imported", async () => {
		const response = await router.fetch("http://localhost/catalog");
		const body = await response.text();

		assert.match(body, /No catalog imported yet/);
	});

	it("GET /catalog has a link back to the portfolio", async () => {
		const response = await router.fetch("http://localhost/catalog");
		const body = await response.text();

		assert.match(body, /href="\/"/);
		assert.match(body, /Portfolio/);
	});

	it("GET /catalog renders theme toggle as a real button element, not escaped HTML text", async () => {
		const response = await router.fetch("http://localhost/catalog");
		const body = await response.text();

		assert.match(body, /<button[^>]*data-island="theme-toggle"/);
		assert.doesNotMatch(body, /&lt;button/);
	});

	it("POST /catalog/import with a CSV file stores catalog and redirects", async () => {
		const csv =
			"ticker,name,type,description\nVTI,Vanguard Total,equity,US broad market\nBND,Vanguard Bond,bond,US bonds";
		const file = new File([csv], "etfs.csv", { type: "text/csv" });
		const form = new FormData();
		form.set("csvFile", file);

		const importResponse = await router.fetch(
			new Request("http://localhost/catalog/import", {
				method: "POST",
				body: form,
			}),
		);

		assert.equal(importResponse.status, 302);
		assert.equal(importResponse.headers.get("location"), "/catalog");

		const catalogResponse = await router.fetch("http://localhost/catalog");
		const body = await catalogResponse.text();

		assert.match(body, /VTI/);
		assert.match(body, /Vanguard Total/);
		assert.match(body, /BND/);
		assert.match(body, /Vanguard Bond/);
	});

	it("POST /catalog/import with empty CSV redirects without error", async () => {
		const file = new File([""], "empty.csv", { type: "text/csv" });
		const form = new FormData();
		form.set("csvFile", file);

		const response = await router.fetch(
			new Request("http://localhost/catalog/import", {
				method: "POST",
				body: form,
			}),
		);

		assert.equal(response.status, 302);
		assert.equal(response.headers.get("location"), "/catalog");
	});

	it("catalog shows Your Holdings section when a holding matches a catalog ticker", async () => {
		// Import a catalog with VTI
		const csv =
			"ticker,name,type,description\nVTI,Vanguard Total,equity,US broad market";
		const file = new File([csv], "etfs.csv", { type: "text/csv" });
		const importForm = new FormData();
		importForm.set("csvFile", file);
		await router.fetch(
			new Request("http://localhost/catalog/import", {
				method: "POST",
				body: importForm,
			}),
		);

		// Add VTI to portfolio holdings (note: holdings match on name field = ticker)
		const addForm = new FormData();
		addForm.set("etfName", "VTI");
		addForm.set("value", "5000");
		addForm.set("currency", "USD");
		await router.fetch(
			new Request("http://localhost/etfs", { method: "POST", body: addForm }),
		);

		const response = await router.fetch("http://localhost/catalog");
		const body = await response.text();

		assert.match(body, /Your Holdings/);
		assert.match(body, /5[,.]?000/);
	});

	it("catalog page shows type filter and search form after import", async () => {
		const csv = "ticker,name,type\nVTI,Vanguard Total,equity";
		const file = new File([csv], "etfs.csv", { type: "text/csv" });
		const form = new FormData();
		form.set("csvFile", file);
		await router.fetch(
			new Request("http://localhost/catalog/import", {
				method: "POST",
				body: form,
			}),
		);

		const response = await router.fetch("http://localhost/catalog");
		const body = await response.text();

		assert.match(body, /name="q"/);
		assert.match(body, /name="type"/);
	});

	it("catalog type filter narrows results", async () => {
		const csv =
			"ticker,name,type\nVTI,Vanguard Total,equity\nBND,Vanguard Bond,bond";
		const file = new File([csv], "etfs.csv", { type: "text/csv" });
		const form = new FormData();
		form.set("csvFile", file);
		await router.fetch(
			new Request("http://localhost/catalog/import", {
				method: "POST",
				body: form,
			}),
		);

		const response = await router.fetch("http://localhost/catalog?type=bond");
		const body = await response.text();

		assert.match(body, /BND/);
		assert.doesNotMatch(body, /VTI/);
	});

	it("catalog text search narrows results", async () => {
		const csv =
			"ticker,name,type,description\nVTI,Vanguard Total,equity,US market\nBND,Vanguard Bond,bond,US bonds";
		const file = new File([csv], "etfs.csv", { type: "text/csv" });
		const form = new FormData();
		form.set("csvFile", file);
		await router.fetch(
			new Request("http://localhost/catalog/import", {
				method: "POST",
				body: form,
			}),
		);

		const response = await router.fetch("http://localhost/catalog?q=bond");
		const body = await response.text();

		assert.match(body, /BND/);
		assert.doesNotMatch(body, /VTI/);
	});

	it("home page has a link to the ETF catalog", async () => {
		const response = await router.fetch("http://localhost/");
		const body = await response.text();

		assert.match(body, /href="\/catalog"/);
		assert.match(body, /ETF catalog/);
	});
});

describe("GitHub OAuth routes", () => {
	it("GET /auth/github returns 500 when GH_CLIENT_ID is not set", async () => {
		const response = await router.fetch("http://localhost/auth/github");
		assert.equal(response.status, 500);
	});

	it("GET /auth/github redirects to GitHub when GH_CLIENT_ID is set", async () => {
		process.env.GH_CLIENT_ID = "test-client-id";
		const response = await router.fetch("http://localhost/auth/github");

		assert.equal(response.status, 302);
		const location = response.headers.get("location") ?? "";
		assert.ok(location.startsWith("https://github.com/login/oauth/authorize"));
		assert.ok(location.includes("client_id=test-client-id"));
		assert.ok(location.includes("scope=gist"));
	});

	it("POST /auth/logout clears the session cookie and redirects home", async () => {
		const response = await router.fetch(
			new Request("http://localhost/auth/logout", { method: "POST" }),
		);

		assert.equal(response.status, 302);
		assert.equal(response.headers.get("location"), "/");
		const cookie = response.headers.get("set-cookie") ?? "";
		assert.ok(cookie.includes("session=;") || cookie.includes("Max-Age=0"));
	});
});
