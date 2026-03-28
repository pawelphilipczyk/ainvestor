import type { Handle } from 'remix/component'
import { Card, FieldLabel, NumberInput } from '../../components/index.ts'
import type { EtfGuideline } from '../../lib/guidelines.ts'
import {
	formatEtfTypeLabel,
	formatGuidelineTargetPctForInput,
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
							const targetPctDisplay = formatGuidelineTargetPctForInput(
								g.targetPct,
							)
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
										<div class="flex min-w-0 flex-1 basis-full items-center gap-3 sm:basis-auto">
											<span class="font-medium">{rowLabel}</span>
											<span class="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
												{g.kind === 'asset_class'
													? t('guidelines.list.kind.assetClass')
													: formatEtfTypeLabel(g.etfType)}
											</span>
										</div>
										<div class="flex w-full min-w-0 shrink-0 items-center justify-end gap-3 sm:w-auto sm:justify-start">
											<form
												method="post"
												action={routes.guidelines.updateTarget.href({
													id: g.id,
												})}
												class="inline-flex max-w-full items-center gap-2"
												data-fetch-submit
												data-fragment-id="guidelines-list"
												data-fragment-url={routes.guidelines.fragmentList.href()}
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
												<span class="inline-flex max-w-full items-center gap-1">
													<NumberInput
														id={targetFieldId}
														name="targetPct"
														class="!w-16 shrink-0"
														value={targetPctDisplay}
														required={true}
														inputMode="decimal"
														pattern={LOCALE_DECIMAL_HTML_PATTERN}
													/>
													<span
														class="shrink-0 text-sm tabular-nums text-muted-foreground"
														aria-hidden="true"
													>
														{t('guidelines.list.targetPctSuffix')}
													</span>
												</span>
												<button type="submit" class={ghostActionClass}>
													{t('guidelines.list.saveTarget')}
												</button>
											</form>
											<button
												type="button"
												class={`guideline-delete-trigger ${ghostActionClass}`}
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
												data-dialog-id={`guideline-delete-dialog-${g.id}`}
											>
												{t('guidelines.list.remove')}
											</button>
											<dialog
												id={`guideline-delete-dialog-${g.id}`}
												class="rounded-lg border border-border bg-card p-4 shadow-lg backdrop:bg-black/50"
											>
												<p class="mb-4 text-sm text-card-foreground">
													{format(t('guidelines.list.deleteConfirm'), {
														label: rowLabel,
													})}
												</p>
												<div class="flex justify-end gap-2">
													<form method="dialog">
														<button
															type="submit"
															class="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-card-foreground transition-colors hover:bg-accent"
														>
															{t('guidelines.list.deleteCancel')}
														</button>
													</form>
													<form
														method="post"
														action={routes.guidelines.delete.href({ id: g.id })}
														data-fetch-submit
														data-fragment-id="guidelines-list"
														data-fragment-url={routes.guidelines.fragmentList.href()}
													>
														<input
															type="hidden"
															name="_method"
															value="DELETE"
														/>
														<button
															type="submit"
															class="rounded-md bg-destructive px-3 py-1.5 text-sm text-white hover:opacity-90"
														>
															{t('guidelines.list.remove')}
														</button>
													</form>
												</div>
											</dialog>
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
