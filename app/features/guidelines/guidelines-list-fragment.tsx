import type { Handle } from 'remix/component'
import { Card } from '../../components/index.ts'
import type { EtfGuideline } from '../../lib/guidelines.ts'
import { formatEtfTypeLabel } from '../../lib/guidelines.ts'
import { routes } from '../../routes.ts'

/**
 * Renders the guidelines list and summary as HTML fragment for fetch-based form updates.
 */
export function GuidelinesListFragment(_handle: Handle, _setup?: unknown) {
	return (props: { guidelines?: EtfGuideline[] }) => {
		const guidelines = props.guidelines ?? []
		const totalPct = guidelines.reduce((sum, g) => sum + g.targetPct, 0)
		const remaining = Math.max(0, 100 - totalPct)

		return (
			<Card class="p-4">
				<div class="flex items-center justify-between text-xs text-muted-foreground">
					<span>
						Total allocated:{' '}
						<strong class="text-foreground">{totalPct}%</strong>
					</span>
					<span>
						Remaining: <strong class="text-foreground">{remaining}%</strong>
					</span>
				</div>

				{guidelines.length === 0 ? (
					<p class="mt-4 text-sm text-muted-foreground">
						No guidelines added yet.
					</p>
				) : (
					<ul class="mt-4 grid gap-2">
						{guidelines.map((g) => (
							<Card
								as="li"
								key={g.id}
								class="flex items-center justify-between px-4 py-3"
							>
								<div class="flex items-center gap-3">
									<span class="font-medium">
										{g.kind === 'asset_class'
											? `${formatEtfTypeLabel(g.etfType)} (bucket)`
											: g.etfName}
									</span>
									<span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
										{g.kind === 'asset_class'
											? 'asset class'
											: formatEtfTypeLabel(g.etfType)}
									</span>
								</div>
								<div class="flex items-center gap-4">
									<span class="text-sm font-semibold">{g.targetPct}%</span>
									<form
										method="post"
										action={routes.guidelines.delete.href({ id: g.id })}
										data-fetch-submit
										data-fragment-id="guidelines-list"
										data-fragment-url="/fragments/guidelines-list"
									>
										<input type="hidden" name="_method" value="DELETE" />
										<button
											type="submit"
											class="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
											aria-label={`Delete ${g.kind === 'asset_class' ? `${formatEtfTypeLabel(g.etfType)} bucket` : g.etfName} guideline`}
										>
											Remove
										</button>
									</form>
								</div>
							</Card>
						))}
					</ul>
				)}
			</Card>
		)
	}
}
