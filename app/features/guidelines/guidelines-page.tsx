import type { Handle } from 'remix/component'
import { SelectInput } from '../../components/index.ts'
import { SessionProvider } from '../../components/session-provider.tsx'
import type { EtfGuideline } from '../../lib/guidelines.ts'
import { ETF_TYPES } from '../../lib/guidelines.ts'
import { routes } from '../../routes.ts'

type GuidelinesPageProps = {
	guidelines: EtfGuideline[]
}

export function GuidelinesPage(handle: Handle, _setup?: unknown) {
	return (props: GuidelinesPageProps) => {
		const session = handle.context.get(SessionProvider)?.session ?? null
		const totalPct = props.guidelines.reduce((sum, g) => sum + g.targetPct, 0)
		const remaining = Math.max(0, 100 - totalPct)

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

				<div class="mt-6 flex items-center justify-between text-xs text-muted-foreground">
					<span>
						Total allocated:{' '}
						<strong class="text-foreground">{totalPct}%</strong>
					</span>
					<span>
						Remaining: <strong class="text-foreground">{remaining}%</strong>
					</span>
				</div>

				{props.guidelines.length === 0 ? (
					<p class="mt-4 text-sm text-muted-foreground">
						No guidelines added yet.
					</p>
				) : (
					<ul class="mt-4 grid gap-2">
						{props.guidelines.map((g) => (
							<li
								key={g.id}
								class="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
							>
								<div class="flex items-center gap-3">
									<span class="font-medium">{g.etfName}</span>
									<span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
										{g.etfType}
									</span>
								</div>
								<div class="flex items-center gap-4">
									<span class="text-sm font-semibold">{g.targetPct}%</span>
									<form
										method="post"
										action={routes.guidelines.delete.href({ id: g.id })}
									>
										<input type="hidden" name="_method" value="DELETE" />
										<button
											type="submit"
											class="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
											aria-label={`Delete ${g.etfName} guideline`}
										>
											Remove
										</button>
									</form>
								</div>
							</li>
						))}
					</ul>
				)}
			</main>
		)
	}
}
