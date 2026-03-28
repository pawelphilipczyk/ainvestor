import type { Handle } from 'remix/component'
import { Card, FieldLabel, NumberInput } from '../../components/index.ts'
import type { EtfGuideline } from '../../lib/guidelines.ts'
import {
	formatEtfTypeLabel,
	sumGuidelineTargetPct,
} from '../../lib/guidelines.ts'
import { format, t } from '../../lib/i18n.ts'
import { LOCALE_DECIMAL_HTML_PATTERN } from '../../lib/locale-decimal-input.ts'
import { routes } from '../../routes.ts'

/**
 * Renders the guidelines list and summary as HTML fragment for fetch-based form updates.
 */
export function GuidelinesListFragment(_handle: Handle, _setup?: unknown) {
	return (props: { guidelines?: EtfGuideline[] }) => {
		const guidelines = props.guidelines ?? []
		const totalPct = sumGuidelineTargetPct(guidelines)
		const remaining = Math.max(0, 100 - totalPct)

		return (
			<Card class="p-4">
				<div class="flex items-center justify-between text-xs text-muted-foreground">
					<span>
						{t('guidelines.list.totalAllocated')}{' '}
						<strong class="text-foreground">{totalPct}%</strong>
					</span>
					<span>
						{t('guidelines.list.remaining')}{' '}
						<strong class="text-foreground">{remaining}%</strong>
					</span>
				</div>

				{guidelines.length === 0 ? (
					<p class="mt-4 text-sm text-muted-foreground">
						{t('guidelines.list.empty')}
					</p>
				) : (
					<ul class="mt-4 grid gap-2">
						{guidelines.map((g) => {
							const rowLabel =
								g.kind === 'asset_class'
									? `${formatEtfTypeLabel(g.etfType)} ${t('guidelines.list.bucketSuffix')}`
									: g.etfName
							const targetFieldId = `guideline-target-${g.id}`
							const targetErrorId = `guidelines-target-${g.id}-error`
							const targetPctDisplay = String(g.targetPct)
							const ghostActionClass =
								'rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive'
							return (
								<Card as="li" key={g.id} class="flex flex-col gap-2 px-4 py-3">
									<div
										id={targetErrorId}
										role="alert"
										class="hidden rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
									/>
									<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
										<div class="flex min-w-0 flex-1 items-center gap-3">
											<span class="font-medium">{rowLabel}</span>
											<span class="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
												{g.kind === 'asset_class'
													? t('guidelines.list.kind.assetClass')
													: formatEtfTypeLabel(g.etfType)}
											</span>
										</div>
										<div class="flex shrink-0 items-center gap-3">
											<form
												method="post"
												action={routes.guidelines.updateTarget.href({
													id: g.id,
												})}
												class="flex items-center gap-2"
												data-fetch-submit
												data-fragment-id="guidelines-list"
												data-fragment-url="/fragments/guidelines-list"
												data-error-id={targetErrorId}
											>
												<FieldLabel
													fieldId={targetFieldId}
													variant="screenReader"
												>
													{format(t('guidelines.list.targetPctLabel'), {
														label: rowLabel,
													})}
												</FieldLabel>
												<NumberInput
													id={targetFieldId}
													name="targetPct"
													class="w-[5.5rem]"
													defaultValue={targetPctDisplay}
													required={true}
													inputMode="decimal"
													pattern={LOCALE_DECIMAL_HTML_PATTERN}
												/>
												<button type="submit" class={ghostActionClass}>
													{t('guidelines.list.saveTarget')}
												</button>
											</form>
											<form
												method="post"
												action={routes.guidelines.delete.href({ id: g.id })}
												class="flex items-center"
												data-fetch-submit
												data-fragment-id="guidelines-list"
												data-fragment-url="/fragments/guidelines-list"
											>
												<input type="hidden" name="_method" value="DELETE" />
												<button
													type="submit"
													class={ghostActionClass}
													aria-label={
														g.kind === 'asset_class'
															? format(t('guidelines.list.deleteAria.bucket'), {
																	label: formatEtfTypeLabel(g.etfType),
																})
															: format(
																	t('guidelines.list.deleteAria.instrument'),
																	{
																		name: g.etfName,
																	},
																)
													}
												>
													{t('guidelines.list.remove')}
												</button>
											</form>
										</div>
									</div>
								</Card>
							)
						})}
					</ul>
				)}
			</Card>
		)
	}
}
