import type { Handle } from 'remix/component'
import { SelectInput } from '../../components/index.ts'
import { SessionProvider } from '../../components/session-provider.tsx'
import type { EtfGuideline } from '../../lib/guidelines.ts'
import { ETF_TYPES } from '../../lib/guidelines.ts'
import { routes } from '../../routes.ts'
import { GuidelinesListFragment } from './guidelines-list-fragment.tsx'

type GuidelinesPageProps = {
	guidelines: EtfGuideline[]
}

export function GuidelinesPage(handle: Handle, _setup?: unknown) {
	return (props: GuidelinesPageProps) => {
		const session = handle.context.get(SessionProvider)?.session ?? null

		return (
			<main class="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm">
				<header>
					<h1 class="text-2xl font-bold tracking-tight text-card-foreground">
						Investment Guidelines
					</h1>
					<p class="mt-1 text-sm text-muted-foreground">
						Set your target allocation.{' '}
						{session
							? 'Saved to your private GitHub Gist.'
							: 'Sign in to persist across sessions.'}
					</p>
				</header>

				<form
					method="post"
					action={routes.guidelines.action.href()}
					class="mt-6 grid gap-4"
					data-fetch-submit
					data-fragment-id="guidelines-list"
					data-fragment-url="/fragments/guidelines-list"
				>
					<div class="grid gap-2">
						<label for="etfName" class="text-sm font-medium">
							ETF / Asset Name
						</label>
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
							<label for="targetPct" class="text-sm font-medium">
								Target %
							</label>
							<input
								id="targetPct"
								name="targetPct"
								type="number"
								min={1}
								max={100}
								step={0.1}
								required
								placeholder="e.g. 60"
								class="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							/>
						</div>
						<SelectInput
							id="etfType"
							label="Type"
							fieldName="etfType"
							options={ETF_TYPES.map((t) => ({
								value: t,
								label: t.replace('_', ' '),
							}))}
						/>
					</div>
					<button
						type="submit"
						class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						Add Guideline
					</button>
				</form>

				<div id="guidelines-list">
					<GuidelinesListFragment guidelines={props.guidelines} />
				</div>
			</main>
		)
	}
}
