import { enum_, object, optional, parseSafe, string } from 'remix/data-schema'
import { max, min, minLength } from 'remix/data-schema/checks'
import * as coerce from 'remix/data-schema/coerce'
import { html } from 'remix/html-template'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'
import type { Session } from 'remix/session'
import type { EtfGuideline, EtfType } from '../../lib/guidelines.ts'
import { fetchGuidelines, saveGuidelines } from '../../lib/guidelines.ts'
import type { SessionData } from '../../lib/session.ts'
import { routes } from '../../routes.ts'
import { ETF_TYPES, getSessionData, pageShell } from '../shared/index.ts'

const ETF_TYPE_VALUES = [
	'equity',
	'bond',
	'real_estate',
	'commodity',
	'mixed',
	'money_market',
] as const

const CreateGuidelineSchema = object({
	etfName: string().pipe(minLength(1)),
	targetPct: coerce.number().pipe(min(0.001), max(100)),
	etfType: optional(enum_(ETF_TYPE_VALUES)),
})

// ---------------------------------------------------------------------------
// Guest state
// ---------------------------------------------------------------------------
let guestGuidelines: EtfGuideline[] = []

export function resetGuestGuidelines() {
	guestGuidelines = []
}

export function getGuestGuidelines(): EtfGuideline[] {
	return guestGuidelines
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export const guidelinesController = {
	async index(context: { request: Request; session: Session }) {
		const session = getSessionData(context.session)
		const guidelines = session?.gistId
			? await fetchGuidelines(session.token, session.gistId)
			: guestGuidelines
		return renderGuidelinesPage(guidelines, session)
	},

	async action(context: {
		request: Request
		session: Session
		formData: FormData | null
	}) {
		const form = context.formData
		if (!form) return createRedirectResponse(routes.guidelines.index.href())

		const result = parseSafe(
			CreateGuidelineSchema,
			Object.fromEntries(
				form as unknown as Iterable<[string, FormDataEntryValue]>,
			),
		)
		if (!result.success) {
			return createRedirectResponse(routes.guidelines.index.href())
		}

		const { etfName, targetPct, etfType = 'equity' } = result.value
		const entry: EtfGuideline = {
			id: crypto.randomUUID(),
			etfName,
			targetPct,
			etfType: etfType as EtfType,
		}
		const session = getSessionData(context.session)

		if (session?.gistId) {
			const current = await fetchGuidelines(session.token, session.gistId)
			await saveGuidelines(session.token, session.gistId, [entry, ...current])
		} else {
			guestGuidelines = [entry, ...guestGuidelines]
		}

		return createRedirectResponse(routes.guidelines.index.href())
	},

	async delete(context: {
		request: Request
		session: Session
		params: unknown
	}) {
		const id = (context.params as Record<string, string>).id
		if (!id) return createRedirectResponse(routes.guidelines.index.href())

		const session = getSessionData(context.session)

		if (session?.gistId) {
			const current = await fetchGuidelines(session.token, session.gistId)
			await saveGuidelines(
				session.token,
				session.gistId,
				current.filter((g) => g.id !== id),
			)
		} else {
			guestGuidelines = guestGuidelines.filter((g) => g.id !== id)
		}

		return createRedirectResponse(routes.guidelines.index.href())
	},
}

// ---------------------------------------------------------------------------
// Page renderer
// ---------------------------------------------------------------------------
async function renderGuidelinesPage(
	guidelines: EtfGuideline[],
	session: SessionData | null,
) {
	const totalPct = guidelines.reduce((sum, g) => sum + g.targetPct, 0)
	const remaining = Math.max(0, 100 - totalPct)

	const listContent =
		guidelines.length === 0
			? html`<p class="mt-4 text-sm text-muted-foreground">No guidelines added yet.</p>`
			: html`<ul class="mt-4 grid gap-2">
          ${guidelines.map(
						(g) => html`
            <li class="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
              <div class="flex items-center gap-3">
                <span class="font-medium">${g.etfName}</span>
                <span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">${g.etfType}</span>
              </div>
              <div class="flex items-center gap-4">
                <span class="text-sm font-semibold">${g.targetPct}%</span>
                <form method="post" action="${routes.guidelines.delete.href({ id: g.id })}">
                  <input type="hidden" name="_method" value="DELETE" />
                  <button
                    type="submit"
                    class="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Delete ${g.etfName} guideline"
                  >
                    Remove
                  </button>
                </form>
              </div>
            </li>
          `,
					)}
        </ul>`

	const body = html`
    <main class="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm">
      <header>
        <h1 class="text-2xl font-bold tracking-tight text-card-foreground">Investment Guidelines</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          Set your target allocation. ${session ? 'Saved to your private GitHub Gist.' : 'Sign in to persist across sessions.'}
        </p>
      </header>

      <form method="post" action="${routes.guidelines.action.href()}" class="mt-6 grid gap-4">
        <div class="grid gap-2">
          <label for="etfName" class="text-sm font-medium">ETF / Asset Name</label>
          <input
            id="etfName"
            name="etfName"
            type="text"
            required
            placeholder="e.g. VTI"
            class="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="grid gap-2">
            <label for="targetPct" class="text-sm font-medium">Target %</label>
            <input
              id="targetPct"
              name="targetPct"
              type="number"
              min="1"
              max="100"
              step="0.1"
              required
              placeholder="e.g. 60"
              class="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div class="grid gap-2">
            <label for="etfType" class="text-sm font-medium">Type</label>
            <select
              id="etfType"
              name="etfType"
              class="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              ${ETF_TYPES.map((t) => `<option value="${t}">${t.replace('_', ' ')}</option>`).join('')}
            </select>
          </div>
        </div>
        <button
          type="submit"
          class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Add Guideline
        </button>
      </form>

      <div class="mt-6 flex items-center justify-between text-xs text-muted-foreground">
        <span>Total allocated: <strong class="text-foreground">${totalPct}%</strong></span>
        <span>Remaining: <strong class="text-foreground">${remaining}%</strong></span>
      </div>

      ${listContent}
    </main>
  `

	return createHtmlResponse(
		await pageShell('AI Investor – Guidelines', session, 'guidelines', body),
	)
}
