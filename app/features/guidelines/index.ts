import { html } from 'remix/html-template'
import { createHtmlResponse } from 'remix/response/html'
import { createRedirectResponse } from 'remix/response/redirect'

import { fetchGuidelines, saveGuidelines } from '../../lib/guidelines.ts'
import type { EtfGuideline, EtfType } from '../../lib/guidelines.ts'
import type { SessionData } from '../../lib/session.ts'
import { routes } from '../../routes.ts'
import { ETF_TYPES, getSession } from '../shared/index.ts'

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
	async index(context: { request: Request }) {
		const session = await getSession(context.request)
		const guidelines = session
			? await fetchGuidelines(session.token, session.gistId!)
			: guestGuidelines
		return renderGuidelinesPage(guidelines, session)
	},

	async create(context: { request: Request; formData: FormData | null }) {
		const form = context.formData
		if (!form) return createRedirectResponse(routes.guidelines.index.href())

		const etfName =
			typeof form.get('etfName') === 'string'
				? (form.get('etfName') as string).trim()
				: ''
		const rawPct = form.get('targetPct')
		const targetPct = typeof rawPct === 'string' ? parseFloat(rawPct) : NaN
		const etfType = (form.get('etfType') as EtfType | null) ?? 'equity'

		if (!etfName || isNaN(targetPct) || targetPct <= 0 || targetPct > 100) {
			return createRedirectResponse(routes.guidelines.index.href())
		}

		const entry: EtfGuideline = {
			id: crypto.randomUUID(),
			etfName,
			targetPct,
			etfType,
		}
		const session = await getSession(context.request)

		if (session) {
			const current = await fetchGuidelines(session.token, session.gistId!)
			await saveGuidelines(session.token, session.gistId!, [entry, ...current])
		} else {
			guestGuidelines = [entry, ...guestGuidelines]
		}

		return createRedirectResponse(routes.guidelines.index.href())
	},

	async delete(context: { request: Request; params: unknown }) {
		const id = (context.params as Record<string, string>).id
		if (!id) return createRedirectResponse(routes.guidelines.index.href())

		const session = await getSession(context.request)

		if (session) {
			const current = await fetchGuidelines(session.token, session.gistId!)
			await saveGuidelines(
				session.token,
				session.gistId!,
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
function renderGuidelinesPage(
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

	return createHtmlResponse(html`
    <!doctype html>
    <html lang="en" class="dark">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>AI Investor – Guidelines</title>
        <script>if(localStorage.getItem('theme')==='light')document.documentElement.classList.remove('dark')</script>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
          tailwind.config = {
            darkMode: 'class',
            theme: {
              extend: {
                colors: {
                  background: 'hsl(var(--background))',
                  foreground: 'hsl(var(--foreground))',
                  card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
                  primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
                  secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
                  muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
                  accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
                  destructive: { DEFAULT: 'hsl(0 84.2% 60.2%)' },
                  border: 'hsl(var(--border))',
                  input: 'hsl(var(--input))',
                  ring: 'hsl(var(--ring))',
                },
                borderRadius: {
                  lg: 'var(--radius)',
                  md: 'calc(var(--radius) - 2px)',
                  sm: 'calc(var(--radius) - 4px)',
                },
              },
            },
          }
        </script>
        <style type="text/tailwindcss">
          @layer base {
            :root {
              --background: 0 0% 100%;
              --foreground: 240 10% 3.9%;
              --card: 0 0% 100%;
              --card-foreground: 240 10% 3.9%;
              --primary: 240 5.9% 10%;
              --primary-foreground: 0 0% 98%;
              --secondary: 240 4.8% 95.9%;
              --secondary-foreground: 240 5.9% 10%;
              --muted: 240 4.8% 95.9%;
              --muted-foreground: 240 3.8% 46.1%;
              --accent: 240 4.8% 95.9%;
              --accent-foreground: 240 5.9% 10%;
              --border: 240 5.9% 90%;
              --input: 240 5.9% 90%;
              --ring: 240 5.9% 10%;
              --radius: 0.5rem;
            }
            .dark {
              --background: 240 10% 3.9%;
              --foreground: 0 0% 98%;
              --card: 240 10% 3.9%;
              --card-foreground: 0 0% 98%;
              --primary: 0 0% 98%;
              --primary-foreground: 240 5.9% 10%;
              --secondary: 240 3.7% 15.9%;
              --secondary-foreground: 0 0% 98%;
              --muted: 240 3.7% 15.9%;
              --muted-foreground: 240 5% 64.9%;
              --accent: 240 3.7% 15.9%;
              --accent-foreground: 0 0% 98%;
              --border: 240 3.7% 15.9%;
              --input: 240 3.7% 15.9%;
              --ring: 240 4.9% 83.9%;
            }
          }
        </style>
      </head>
      <body class="min-h-screen bg-background p-4 font-sans text-foreground antialiased">
        <main class="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm">
          <header class="flex items-center justify-between gap-4">
            <div>
              <h1 class="text-2xl font-bold tracking-tight text-card-foreground">Investment Guidelines</h1>
              <p class="mt-1 text-sm text-muted-foreground">
                Set your target allocation. ${session ? 'Saved to your private GitHub Gist.' : 'Sign in to persist across sessions.'}
              </p>
            </div>
            <a href="${routes.portfolio.index.href()}" class="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground shrink-0">
              ← Portfolio
            </a>
          </header>

          <form method="post" action="${routes.guidelines.create.href()}" class="mt-6 grid gap-4">
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
        <script type="module">
          const el = document.querySelector('[data-island="theme-toggle"]')
          if (el) {
            el.addEventListener('click', () => {
              const isDark = document.documentElement.classList.toggle('dark')
              localStorage.setItem('theme', isDark ? 'dark' : 'light')
            })
          }
        </script>
      </body>
    </html>
  `)
}
