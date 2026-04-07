import * as assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { LOCALE_DECIMAL_HTML_PATTERN } from '../../lib/locale-decimal-input.ts'
import { setPrivateGistFetchTestOverlay } from '../../lib/private-gist-fetch-test-overlay.ts'
import { sessionCookie, sessionStorage } from '../../lib/session.ts'
import {
	resetTestSessionCookieJar,
	testSessionFetch,
} from '../../lib/test-session-fetch.ts'
import { routes } from '../../routes.ts'
import {
	parseBankJsonToCatalog,
	resetSharedCatalogForTests,
	setSharedCatalogForTests,
} from '../catalog/lib.ts'
import type { AdviceClient } from './advice-client.ts'
import {
	getAdviceGistLastSavedInTest,
	resetAdviceGistTestOverlay,
	type StoredAdviceAnalysis,
	setAdviceGistTestOverlay,
	setAdviceGistTestSaveShouldFail,
} from './advice-gist.ts'
import { adviceTabHref, setAdviceClient } from './index.ts'

type AdviceCompletionCreateParams = Parameters<
	AdviceClient['chat']['completions']['create']
>[0]

const originalApprovedGithubLogins = process.env.APPROVED_GITHUB_LOGINS

const adviceUrl = (mode: Parameters<typeof adviceTabHref>[0]) =>
	`http://localhost${adviceTabHref(mode)}`

function seedSharedCatalog(bankJson: string): void {
	setSharedCatalogForTests({
		entries: parseBankJsonToCatalog(JSON.parse(bankJson)),
		ownerLogin: 'catalog-admin',
	})
}

async function signInWithGist(login = 'advice-test-user') {
	process.env.APPROVED_GITHUB_LOGINS = login
	const session = await sessionStorage.read(null)
	session.set('login', login)
	session.set('token', 'test-token')
	session.set('gistId', 'gist-advice-test')
	const value = await sessionStorage.save(session)
	if (value == null) throw new Error('expected session save value')
	const cookieHeader = await sessionCookie.serialize(value)
	// Avoid real GitHub fetches: fetchEtfs throws on non-2xx unless overlay supplies data.
	setPrivateGistFetchTestOverlay({ etfs: [], guidelines: [] })
	return cookieHeader.split(';')[0]
}

function makeMockClient(responseText: string): AdviceClient {
	const content = (() => {
		try {
			const parsed = JSON.parse(responseText) as unknown
			if (parsed !== null && typeof parsed === 'object' && 'blocks' in parsed) {
				return responseText
			}
		} catch {
			// plain text from tests → wrap as paragraph block JSON
		}
		return JSON.stringify({
			blocks: [{ type: 'paragraph', text: responseText }],
		})
	})()
	return {
		chat: {
			completions: {
				create: async () => ({
					choices: [{ message: { content: content } }],
				}),
			},
		},
	}
}

afterEach(() => {
	resetTestSessionCookieJar()
	resetSharedCatalogForTests()
	resetAdviceGistTestOverlay()
	setPrivateGistFetchTestOverlay(null)
	setAdviceClient(null)
	if (originalApprovedGithubLogins === undefined) {
		delete process.env.APPROVED_GITHUB_LOGINS
	} else {
		process.env.APPROVED_GITHUB_LOGINS = originalApprovedGithubLogins
	}
})

describe('Advice', () => {
	it('GET /advice renders the Get Advice form page', async () => {
		const response = await testSessionFetch('http://localhost/advice')
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Get Advice/)
		assert.match(body, /Sign in to run AI advice/)
		const cashInput = body.match(
			/<input\b[^>]*\bid="cashAmount-buy-next"[^>]*>/,
		)
		assert.ok(cashInput, 'expected #cashAmount-buy-next input')
		assert.match(cashInput[0], /type="text"/)
		assert.match(cashInput[0], /name="cashAmount"/)
		assert.match(cashInput[0], /inputmode="decimal"/)
		assert.match(cashInput[0], /\brequired\b/)
		assert.ok(
			cashInput[0].includes(`pattern="${LOCALE_DECIMAL_HTML_PATTERN}"`),
			'expected pattern to match deployable cash HTML constraint',
		)
		assert.match(body, /name="cashCurrency"/)
		assert.match(body, /name="adviceModel"/)
		assert.match(body, /name="analysisMode"/)
		assert.match(body, /tab=buy_next/)
		assert.match(body, /tab=portfolio_review/)
		assert.match(body, /What to buy next/)
		assert.match(body, /Portfolio health review/)
	})

	it('GET /advice shows pending approval when session login is not on allowlist', async () => {
		process.env.APPROVED_GITHUB_LOGINS = 'someone-else'
		const session = await sessionStorage.read(null)
		session.set('login', 'pending-user')
		session.set('approvalStatus', 'pending')
		const value = await sessionStorage.save(session)
		if (value == null) throw new Error('expected session save value')
		const cookieHeader = await sessionCookie.serialize(value)
		const cookie = cookieHeader.split(';')[0]

		const response = await testSessionFetch('http://localhost/advice', {
			headers: { Cookie: cookie },
		})
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Account pending approval/)
		assert.match(body, /approved-github-logins\.ts/)
		assert.match(body, /disabled/)
	})

	it('POST /advice returns 403 for pending-approval session', async () => {
		process.env.APPROVED_GITHUB_LOGINS = 'admin'
		const session = await sessionStorage.read(null)
		session.set('login', 'stranger')
		session.set('approvalStatus', 'pending')
		const value = await sessionStorage.save(session)
		if (value == null) throw new Error('expected session save value')
		const cookieHeader = await sessionCookie.serialize(value)
		const cookie = cookieHeader.split(';')[0]

		const form = new FormData()
		form.set('cashAmount', '100')
		setAdviceClient({
			chat: {
				completions: {
					create: async () => {
						throw new Error(
							'advice client must not be called for pending users',
						)
					},
				},
			},
		})

		form.set('analysisMode', 'buy_next')
		const response = await testSessionFetch(
			new Request(adviceUrl('buy_next'), {
				method: 'POST',
				body: form,
				headers: { Cookie: cookie },
			}),
		)
		const body = await response.text()

		assert.equal(response.status, 403)
		assert.match(body, /not approved yet/)
		assert.doesNotMatch(body, /id="advice-last-result"/)
	})

	it('returns 400 with AdvicePage HTML when buy_next has empty cashAmount', async () => {
		setAdviceClient(makeMockClient('irrelevant'))

		const form = new FormData()
		form.set('analysisMode', 'buy_next')

		const response = await testSessionFetch(
			new Request(adviceUrl('buy_next'), {
				method: 'POST',
				body: form,
			}),
		)
		const body = await response.text()

		assert.equal(response.status, 400)
		assert.match(body, /Get Advice/)
		assert.match(body, /role="alert"/)
		assert.match(body, /Enter how much cash you plan to invest/)
	})

	it('returns 200 for portfolio_review without cashAmount', async () => {
		const cookie = await signInWithGist()
		setAdviceClient(makeMockClient('Concentrated in equities; consider bonds.'))

		const form = new FormData()
		form.set('analysisMode', 'portfolio_review')
		form.set('adviceIntent', 'run')

		const response = await testSessionFetch(
			new Request(adviceUrl('portfolio_review'), {
				method: 'POST',
				body: form,
				headers: { Cookie: cookie },
			}),
		)
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Portfolio review/)
		assert.match(body, /Concentrated in equities/)
	})

	it('includes current ETF holdings in the advice prompt for gist-backed sessions', async () => {
		const cookie = await signInWithGist()
		let capturedUserMessage = ''
		setPrivateGistFetchTestOverlay({
			etfs: [
				{
					id: 'h1',
					name: 'VXUS',
					ticker: 'VXUS',
					value: 3000,
					currency: 'USD',
				},
			],
			guidelines: [],
		})
		setAdviceClient({
			chat: {
				completions: {
					create: async (params: AdviceCompletionCreateParams) => {
						capturedUserMessage = params.messages[1].content
						return { choices: [{ message: { content: 'advice' } }] }
					},
				},
			},
		})

		const bankJson = JSON.stringify({
			data: [{ fund_name: 'VXUS', ticker: 'VXUS', assets: 'akcje' }],
			count: 1,
		})
		seedSharedCatalog(bankJson)

		const form = new FormData()
		form.set('cashAmount', '500')
		form.set('analysisMode', 'buy_next')
		form.set('adviceIntent', 'run')
		await testSessionFetch(
			new Request(adviceUrl('buy_next'), {
				method: 'POST',
				body: form,
				headers: { Cookie: cookie },
			}),
		)

		assert.match(capturedUserMessage, /VXUS/)
		assert.match(capturedUserMessage, /3000 USD/)
		assert.match(capturedUserMessage, /500 PLN/)
		assert.match(capturedUserMessage, /ETF catalog/)
		assert.match(capturedUserMessage, /Allocation context/)
	})

	it('passes guidelines into the advice prompt when they exist (gist-backed)', async () => {
		const cookie = await signInWithGist()
		let capturedUserMessage = ''
		setPrivateGistFetchTestOverlay({
			etfs: [],
			guidelines: [
				{
					id: 'g1',
					kind: 'instrument',
					etfName: 'VTI',
					targetPct: 60,
					etfType: 'equity',
				},
			],
		})
		setAdviceClient({
			chat: {
				completions: {
					create: async (params: AdviceCompletionCreateParams) => {
						capturedUserMessage = params.messages[1].content
						return { choices: [{ message: { content: 'advice' } }] }
					},
				},
			},
		})

		const bankJson = JSON.stringify({
			data: [{ fund_name: 'Vanguard Total', ticker: 'VTI', assets: 'akcje' }],
			count: 1,
		})
		seedSharedCatalog(bankJson)

		const form = new FormData()
		form.set('cashAmount', '1000')
		form.set('analysisMode', 'buy_next')
		form.set('adviceIntent', 'run')
		await testSessionFetch(
			new Request(adviceUrl('buy_next'), {
				method: 'POST',
				body: form,
				headers: { Cookie: cookie },
			}),
		)

		assert.match(capturedUserMessage, /VTI.*60%/)
		assert.match(capturedUserMessage, /equity/)
	})

	it('POST /advice returns 403 for guest without GitHub gist when running analysis', async () => {
		setAdviceClient({
			chat: {
				completions: {
					create: async () => {
						throw new Error('advice client must not run for guests')
					},
				},
			},
		})

		const form = new FormData()
		form.set('cashAmount', '500')
		form.set('analysisMode', 'buy_next')
		form.set('adviceIntent', 'run')

		const response = await testSessionFetch(
			new Request(adviceUrl('buy_next'), { method: 'POST', body: form }),
		)
		const body = await response.text()

		assert.equal(response.status, 403)
		assert.match(body, /private GitHub gist/)
	})

	it('returns 503 with AdvicePage HTML when the advice client throws', async () => {
		const cookie = await signInWithGist()
		setAdviceClient({
			chat: {
				completions: {
					create: async () => {
						throw new Error('simulated API failure')
					},
				},
			},
		})

		const form = new FormData()
		form.set('cashAmount', '100')

		form.set('analysisMode', 'buy_next')
		const response = await testSessionFetch(
			new Request(adviceUrl('buy_next'), {
				method: 'POST',
				body: form,
				headers: { Cookie: cookie },
			}),
		)
		const body = await response.text()

		assert.equal(response.status, 503)
		assert.match(body, /Get Advice/)
		assert.match(body, /role="alert"/)
		assert.match(
			body,
			/We couldn't get advice right now\. Please try again in a moment\./,
		)
		assert.match(body, /<summary[^>]*>/)
		assert.match(body, /simulated API failure/)
	})

	it('returns 503 with AdvicePage HTML when the advice OpenAI client cannot be created', async () => {
		const prevKey = process.env.OPENAI_API_KEY
		delete process.env.OPENAI_API_KEY

		try {
			const cookie = await signInWithGist()
			const form = new FormData()
			form.set('cashAmount', '100')
			form.set('analysisMode', 'buy_next')

			const response = await testSessionFetch(
				new Request(adviceUrl('buy_next'), {
					method: 'POST',
					body: form,
					headers: { Cookie: cookie },
				}),
			)
			const body = await response.text()

			assert.equal(response.status, 503)
			assert.match(body, /Get Advice/)
			assert.match(body, /role="alert"/)
			assert.match(
				body,
				/We couldn't get advice right now\. Please try again in a moment\./,
			)
			assert.match(body, /<details>/)
			assert.match(body, /<summary[^>]*>/)
		} finally {
			if (prevKey === undefined) {
				delete process.env.OPENAI_API_KEY
			} else {
				process.env.OPENAI_API_KEY = prevKey
			}
		}
	})

	it('returns advice HTML from the LLM when cashAmount is provided', async () => {
		const cookie = await signInWithGist()
		setAdviceGistTestOverlay(null)
		setAdviceClient(makeMockClient('Buy VTI for broad market exposure.'))

		const form = new FormData()
		form.set('cashAmount', '1000')
		form.set('analysisMode', 'buy_next')

		const response = await testSessionFetch(
			new Request(adviceUrl('buy_next'), {
				method: 'POST',
				body: form,
				headers: { Cookie: cookie },
			}),
		)
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Investment Advice/)
		assert.match(body, /Buy VTI for broad market exposure\./)
		const saved = getAdviceGistLastSavedInTest()
		assert.ok(saved)
		assert.equal(saved?.lastAnalysisMode, 'buy_next')
		assert.equal(saved?.cashAmount, '1000')
		assert.equal(saved?.document.blocks[0]?.type, 'paragraph')
	})

	it('POST /advice sets X-Advice-Gist-Stale and still returns analysis HTML when gist save fails', async () => {
		const cookie = await signInWithGist()
		setAdviceGistTestOverlay(null)
		setAdviceGistTestSaveShouldFail(true)
		setAdviceClient(makeMockClient('Shown despite gist save failure.'))

		const form = new FormData()
		form.set('cashAmount', '1000')
		form.set('analysisMode', 'buy_next')

		const response = await testSessionFetch(
			new Request(adviceUrl('buy_next'), {
				method: 'POST',
				body: form,
				headers: { Cookie: cookie, Accept: 'application/json' },
			}),
		)
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.equal(response.headers.get('X-Advice-Gist-Stale'), '1')
		assert.match(body, /Shown despite gist save failure\./)
		assert.match(body, /Could not save this analysis to your data gist/)
	})

	it('GET /advice shows last analysis from gist when tab matches snapshot', async () => {
		const cookie = await signInWithGist()
		seedSharedCatalog(
			JSON.stringify({
				data: [
					{
						id: 'c1',
						fund_name: 'Test',
						ticker: 'TST',
						assets: 'akcje',
					},
				],
				count: 1,
			}),
		)
		const stored: StoredAdviceAnalysis = {
			version: 1,
			savedAt: 1_700_000_000_000,
			lastAnalysisMode: 'buy_next',
			cashCurrency: 'PLN',
			cashAmount: '500',
			selectedModel: 'gpt-5.4-mini',
			activeTab: 'buy_next',
			document: {
				blocks: [{ type: 'paragraph', text: 'Cached gist paragraph.' }],
			},
		}
		setAdviceGistTestOverlay(stored)

		const response = await testSessionFetch(
			`http://localhost${adviceTabHref('buy_next')}`,
			{ headers: { Cookie: cookie } },
		)
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Cached gist paragraph\./)
		assert.match(body, /Showing your last saved analysis from your data gist/)
		assert.match(body, /"name":"advice-result"/)
		assert.match(body, /\/fragments\/advice-result\?tab=buy_next/)
	})

	it('GET /advice/fragments/advice-result returns HTML for stored gist advice when tab matches', async () => {
		const cookie = await signInWithGist()
		seedSharedCatalog(
			JSON.stringify({
				data: [
					{
						id: 'c1',
						fund_name: 'Test',
						ticker: 'TST',
						assets: 'akcje',
					},
				],
				count: 1,
			}),
		)
		const stored: StoredAdviceAnalysis = {
			version: 1,
			savedAt: 1_700_000_000_000,
			lastAnalysisMode: 'buy_next',
			cashCurrency: 'PLN',
			cashAmount: '500',
			selectedModel: 'gpt-5.4-mini',
			activeTab: 'buy_next',
			document: {
				blocks: [{ type: 'paragraph', text: 'Fragment-only paragraph.' }],
			},
		}
		setAdviceGistTestOverlay(stored)

		const url = `${routes.advice.fragmentResult.href()}?tab=buy_next`
		const response = await testSessionFetch(`http://localhost${url}`, {
			headers: { Cookie: cookie },
		})
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Fragment-only paragraph\./)
		assert.match(body, /Investment Advice/)
		assert.doesNotMatch(body, /<html\b/i)
	})

	it('GET /advice/fragments/advice-result returns 204 when there is no result for the tab', async () => {
		const cookie = await signInWithGist()
		setAdviceGistTestOverlay(null)

		const url = `${routes.advice.fragmentResult.href()}?tab=buy_next`
		const response = await testSessionFetch(`http://localhost${url}`, {
			headers: { Cookie: cookie },
		})
		const body = await response.text()

		assert.equal(response.status, 204)
		assert.equal(body, '')
	})

	it('GET /advice does not show gist snapshot when URL tab differs from snapshot tab', async () => {
		const cookie = await signInWithGist()
		setAdviceGistTestOverlay({
			version: 1,
			savedAt: Date.now(),
			lastAnalysisMode: 'buy_next',
			cashCurrency: 'PLN',
			cashAmount: '100',
			selectedModel: 'gpt-5.4-mini',
			activeTab: 'buy_next',
			document: {
				blocks: [{ type: 'paragraph', text: 'Wrong tab should not show.' }],
			},
		})

		const response = await testSessionFetch(
			`http://localhost${adviceTabHref('portfolio_review')}`,
			{ headers: { Cookie: cookie } },
		)
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.doesNotMatch(body, /Wrong tab should not show/)
	})

	it('renders capital_snapshot and guideline_bars when the model returns them', async () => {
		const cookie = await signInWithGist()
		setAdviceClient(
			makeMockClient(
				JSON.stringify({
					blocks: [
						{
							type: 'capital_snapshot',
							segments: [
								{
									role: 'holdings',
									label: 'Current ETF holdings',
									amount: 8000,
									currency: 'PLN',
								},
								{
									role: 'cash',
									label: 'Deployable cash',
									amount: 2000,
									currency: 'PLN',
								},
							],
							postTotal: {
								label: 'Total portfolio (holdings + cash)',
								amount: 10000,
								currency: 'PLN',
							},
						},
						{
							type: 'guideline_bars',
							caption: 'Target mix',
							rows: [
								{
									label: 'Equities',
									targetPct: 60,
									currentPct: 50,
									postBuyPct: 58,
								},
							],
						},
						{ type: 'paragraph', text: '- Narrative only.\n\n1. VTI — pick.' },
					],
				}),
			),
		)

		const form = new FormData()
		form.set('cashAmount', '2000')
		form.set('analysisMode', 'buy_next')

		const response = await testSessionFetch(
			new Request(adviceUrl('buy_next'), {
				method: 'POST',
				body: form,
				headers: { Cookie: cookie },
			}),
		)
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Portfolio mix/)
		assert.match(body, /8,?000\.00/)
		assert.match(body, /2,?000\.00/)
		assert.match(body, /Target mix/)
		assert.match(body, /Equities/)
		assert.match(body, /Narrative only/)
	})

	it('renders guideline_bars with default heading when caption is omitted', async () => {
		const cookie = await signInWithGist()
		setAdviceClient(
			makeMockClient(
				JSON.stringify({
					blocks: [
						{
							type: 'capital_snapshot',
							segments: [
								{
									role: 'holdings',
									label: 'Current ETF holdings',
									amount: 1000,
									currency: 'USD',
								},
								{
									role: 'cash',
									label: 'Deployable cash',
									amount: 500,
									currency: 'USD',
								},
							],
						},
						{
							type: 'guideline_bars',
							rows: [
								{
									label: 'Bonds',
									targetPct: 40,
									currentPct: 30,
									postBuyPct: 35,
								},
							],
						},
						{ type: 'paragraph', text: '- Note.\n\n1. BND — pick.' },
					],
				}),
			),
		)

		const form = new FormData()
		form.set('cashAmount', '500')
		form.set('analysisMode', 'buy_next')

		const response = await testSessionFetch(
			new Request(adviceUrl('buy_next'), {
				method: 'POST',
				body: form,
				headers: { Cookie: cookie },
			}),
		)
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Portfolio mix/)
		assert.match(body, /Guideline alignment/)
		assert.match(body, /Bonds/)
		assert.match(body, /Note/)
	})

	it('renders guideline_bars default heading when caption is only whitespace', async () => {
		const cookie = await signInWithGist()
		setAdviceClient(
			makeMockClient(
				JSON.stringify({
					blocks: [
						{
							type: 'capital_snapshot',
							segments: [
								{
									role: 'holdings',
									label: 'H',
									amount: 100,
									currency: 'EUR',
								},
								{
									role: 'cash',
									label: 'C',
									amount: 100,
									currency: 'EUR',
								},
							],
						},
						{
							type: 'guideline_bars',
							caption: '   ',
							rows: [
								{
									label: 'X',
									targetPct: 50,
									currentPct: 40,
								},
							],
						},
						{ type: 'paragraph', text: '- Ok.' },
					],
				}),
			),
		)

		const form = new FormData()
		form.set('cashAmount', '100')
		form.set('analysisMode', 'buy_next')

		const response = await testSessionFetch(
			new Request(adviceUrl('buy_next'), {
				method: 'POST',
				body: form,
				headers: { Cookie: cookie },
			}),
		)
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Guideline alignment/)
		assert.match(body, /X/)
	})

	it('shows a fallback when capital_snapshot segments fail UI validation', async () => {
		const cookie = await signInWithGist()
		setAdviceClient(
			makeMockClient(
				JSON.stringify({
					blocks: [
						{
							type: 'capital_snapshot',
							segments: [
								{
									role: 'holdings',
									label: 'Only holdings row',
									amount: 1000,
									currency: 'PLN',
								},
							],
						},
						{ type: 'paragraph', text: '- After invalid snapshot.' },
					],
				}),
			),
		)

		const form = new FormData()
		form.set('cashAmount', '500')
		form.set('analysisMode', 'buy_next')

		const response = await testSessionFetch(
			new Request(adviceUrl('buy_next'), {
				method: 'POST',
				body: form,
				headers: { Cookie: cookie },
			}),
		)
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(
			body,
			/Portfolio snapshot could not be shown because the data from the model/,
		)
		assert.match(body, /After invalid snapshot/)
	})

	it('renders an ETF proposals table when the model returns etf_proposals blocks', async () => {
		const cookie = await signInWithGist()
		setAdviceClient(
			makeMockClient(
				JSON.stringify({
					blocks: [
						{
							type: 'paragraph',
							text: 'Consider adding to international exposure.',
						},
						{
							type: 'etf_proposals',
							caption: 'Suggested purchases',
							rows: [
								{
									name: 'Vanguard Total International Stock',
									ticker: 'VXUS',
									amount: 400,
									currency: 'PLN',
									note: 'Broad ex-US equities',
								},
							],
						},
					],
				}),
			),
		)

		const form = new FormData()
		form.set('cashAmount', '500')
		form.set('analysisMode', 'buy_next')

		const response = await testSessionFetch(
			new Request(adviceUrl('buy_next'), {
				method: 'POST',
				body: form,
				headers: { Cookie: cookie },
			}),
		)
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /Suggested purchases/)
		assert.match(body, /VXUS/)
		assert.match(body, /400\.00/)
		assert.match(body, /PLN/)
		assert.match(body, /Broad ex-US equities/)
		assert.match(
			body,
			/<table\b[^>]*\bclass="(?=[^"]*\bmin-w-full\b)(?=[^"]*\bw-max\b)(?=[^"]*\btable-auto\b)[^"]*"/,
			'advice ETF table matches catalog ScrollableTable (min-w-full w-max table-auto)',
		)
	})

	it('passes the selected advice model to the OpenAI client', async () => {
		const cookie = await signInWithGist()
		let capturedModel = ''
		setAdviceClient({
			chat: {
				completions: {
					create: async (params: AdviceCompletionCreateParams) => {
						capturedModel = params.model
						return { choices: [{ message: { content: 'advice' } }] }
					},
				},
			},
		})

		const form = new FormData()
		form.set('cashAmount', '100')
		form.set('adviceModel', 'gpt-5.4-nano')
		form.set('analysisMode', 'buy_next')

		const response = await testSessionFetch(
			new Request(adviceUrl('buy_next'), {
				method: 'POST',
				body: form,
				headers: { Cookie: cookie },
			}),
		)
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.equal(capturedModel, 'gpt-5.4-nano')
		assert.match(body, /value="gpt-5.4-nano"/)
	})

	it('renders ETF details link with catalogEntryId when etf_proposals include it', async () => {
		const cookie = await signInWithGist()
		seedSharedCatalog(
			JSON.stringify({
				data: [
					{
						id: 'advice-learn-row',
						fund_name: 'Sample ETF',
						ticker: 'SAM',
						assets: 'akcje',
					},
				],
				count: 1,
			}),
		)
		setAdviceClient(
			makeMockClient(
				JSON.stringify({
					blocks: [
						{
							type: 'etf_proposals',
							rows: [
								{
									name: 'Sample ETF',
									ticker: 'SAM',
									catalogEntryId: 'advice-learn-row',
									amount: 100,
									currency: 'PLN',
								},
							],
						},
					],
				}),
			),
		)

		const form = new FormData()
		form.set('cashAmount', '100')
		form.set('analysisMode', 'buy_next')

		const response = await testSessionFetch(
			new Request(adviceUrl('buy_next'), {
				method: 'POST',
				body: form,
				headers: { Cookie: cookie },
			}),
		)
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /\/catalog\/etf\/advice-learn-row/)
		assert.match(body, /ETF details/)
	})

	it('renders ETF details link from ticker match when catalogEntryId is absent', async () => {
		const cookie = await signInWithGist()
		seedSharedCatalog(
			JSON.stringify({
				data: [
					{
						id: 'ticker-only-row',
						fund_name: 'Sample ETF',
						ticker: 'SAM',
						assets: 'akcje',
					},
				],
				count: 1,
			}),
		)
		setAdviceClient(
			makeMockClient(
				JSON.stringify({
					blocks: [
						{
							type: 'etf_proposals',
							rows: [
								{
									name: 'Sample ETF',
									ticker: 'SAM',
									amount: 100,
									currency: 'PLN',
								},
							],
						},
					],
				}),
			),
		)

		const form = new FormData()
		form.set('cashAmount', '100')
		form.set('analysisMode', 'buy_next')

		const response = await testSessionFetch(
			new Request(adviceUrl('buy_next'), {
				method: 'POST',
				body: form,
				headers: { Cookie: cookie },
			}),
		)
		const body = await response.text()

		assert.equal(response.status, 200)
		assert.match(body, /\/catalog\/etf\/ticker-only-row/)
		assert.match(body, /ETF details/)
	})
})
