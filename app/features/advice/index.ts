import { html } from 'remix/html-template'
import { createHtmlResponse } from 'remix/response/html'

import { fetchEtfs } from '../../lib/gist.ts'
import { fetchGuidelines } from '../../lib/guidelines.ts'
import { createDefaultClient, getInvestmentAdvice } from '../../openai.ts'
import type { AdviceClient } from '../../openai.ts'
import { routes } from '../../routes.ts'
import { getSession } from '../shared/index.ts'
import { getGuestEntries } from '../portfolio/index.ts'
import { getGuestGuidelines } from '../guidelines/index.ts'

// ---------------------------------------------------------------------------
// Advice client (injectable for tests)
// ---------------------------------------------------------------------------
let adviceClient: AdviceClient | null = null

export function setAdviceClient(client: AdviceClient | null) {
	adviceClient = client
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export async function adviceHandler(context: {
	request: Request
	formData: FormData | null
}) {
	const form = context.formData
	if (!form) {
		return new Response('Bad request', { status: 400 })
	}

	const rawCash = form.get('cashAmount')
	const cashAmount = typeof rawCash === 'string' ? rawCash.trim() : ''
	if (!cashAmount) {
		return new Response('cashAmount is required', { status: 400 })
	}

	const session = await getSession(context.request)
	const entries = session
		? await fetchEtfs(session.token, session.gistId!)
		: getGuestEntries()
	const guidelines = session
		? await fetchGuidelines(session.token, session.gistId!)
		: getGuestGuidelines()

	const client = adviceClient ?? createDefaultClient()
	const advice = await getInvestmentAdvice(
		entries,
		guidelines,
		cashAmount,
		client,
	)

	return createHtmlResponse(html`
    <!doctype html>
    <html lang="en" class="dark">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>AI Investor – Advice</title>
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
          <h1 class="text-2xl font-bold tracking-tight">Investment Advice</h1>
          <p class="mt-1 text-sm text-muted-foreground">Based on your portfolio and $${cashAmount} available.</p>
          <div class="mt-6 whitespace-pre-wrap text-sm leading-relaxed">${advice}</div>
          <a href="${routes.portfolio.index.href()}" class="mt-6 inline-block text-sm underline underline-offset-4">← Back to portfolio</a>
        </main>
      </body>
    </html>
  `)
}
