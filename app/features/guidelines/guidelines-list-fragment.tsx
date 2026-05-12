import type { Handle } from 'remix/ui'
import {
	Card,
	FieldLabel,
	NumberInput,
	PercentageBar,
} from '../../components/index.ts'
import type { EtfGuideline } from '../../lib/guidelines.ts'
import {
	clampGuidelineBarWidthPercent,
	formatEtfTypeLabel,
	formatGuidelineTargetPercentForInput,
	sumGuidelineTargetPercent,
} from '../../lib/guidelines.ts'
import { format, t } from '../../lib/i18n.ts'
import { LOCALE_DECIMAL_HTML_PATTERN } from '../../lib/locale-decimal-input.ts'
import { routes } from '../../routes.ts'

const guidelineGhostBase =
	'inline-flex h-10 min-h-10 shrink-0 items-center justify-center rounded-md border border-transparent bg-transparent px-3 py-0 text-sm font-normal text-muted-foreground transition-colors'

const guidelineSaveGhostClass = `${guidelineGhostBase} hover:bg-accent hover:text-accent-foreground`

const guidelineRemoveGhostClass = `${guidelineGhostBase} hover:bg-destructive/10 hover:text-destructive`

/**
 * Renders the guidelines list and summary as HTML fragment for fetch-based form updates.
 */
export function GuidelinesListFragment(_handle: Handle) {
	return (props: { guidelines?: EtfGuideline[]; inlineError?: string }) => {
		const guidelines = props.guidelines ?? []
		const totalPercent = sumGuidelineTargetPercent(guidelines)
		const remaining = Math.max(0, 100 - totalPercent)
		const inlineError = props.inlineError?.trim() ?? ''

		return (
			<Card class="p-4">
				{inlineError.length > 0 ? (
					<div
						role="alert"
						class="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
					>
						{inlineError}
					</div>
				) : null}
				<h2 class="text-base font-semibold tracking-tight text-card-foreground">
					{t('guidelines.list.title')}
				</h2>
				<div class="mt-3 flex items-center justify-between text-xs text-muted-foreground">
					<span>
						{t('guidelines.list.totalAllocated')}{' '}
						<strong class="text-foreground">{totalPercent}%</strong>
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
							const targetPercentDisplay = formatGuidelineTargetPercentForInput(
								g.targetPct,
							)
							const barWidthPercent = clampGuidelineBarWidthPercent(g.targetPct)
							const shareBarLabel = format(t('guidelines.list.shareBarAria'), {
								percent: targetPercentDisplay,
								label: rowLabel,
							})
							return (
								<Card as="li" key={g.id} class="flex flex-col gap-2 px-4 py-3">
									<PercentageBar
										ariaLabel={shareBarLabel}
										widthPercent={barWidthPercent}
									/>
									<div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
										<span class="font-medium">{rowLabel}</span>
										<span class="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
											{g.kind === 'asset_class'
												? t('guidelines.list.kind.assetClass')
												: formatEtfTypeLabel(g.etfType)}
										</span>
									</div>
									<div class="flex min-w-0 flex-wrap items-center justify-between gap-3">
										<div
											class="flex min-w-0 flex-wrap items-center gap-2"
											data-guideline-read={g.id}
										>
											<p class="text-sm tabular-nums text-card-foreground">
												{targetPercentDisplay}
												{t('guidelines.list.targetPctSuffix')}
											</p>
											<button
												type="button"
												class={guidelineSaveGhostClass}
												data-guideline-edit={g.id}
											>
												{t('guidelines.list.editTarget')}
											</button>
										</div>
										<form
											method="post"
											action={routes.guidelines.updateTarget.href({
												id: g.id,
											})}
											class="hidden inline-flex min-w-0 flex-wrap items-center gap-2"
											data-frame-submit="guidelines-list"
											data-frame-replace-from-response="1"
											data-guideline-edit-form={g.id}
											data-guideline-original-target={targetPercentDisplay}
										>
											<FieldLabel
												fieldId={targetFieldId}
												variant="screenReader"
											>
												{format(t('guidelines.list.targetPctLabel'), {
													label: rowLabel,
												})}
											</FieldLabel>
											<span class="inline-flex min-w-0 items-center gap-1">
												<NumberInput
													id={targetFieldId}
													name="targetPct"
													class="!w-16 shrink-0"
													value={targetPercentDisplay}
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
											<button type="submit" class={guidelineSaveGhostClass}>
												{t('guidelines.list.saveTarget')}
											</button>
											<button
												type="button"
												class={guidelineSaveGhostClass}
												data-guideline-cancel-edit={g.id}
											>
												{t('guidelines.list.cancelEditTarget')}
											</button>
										</form>
										<button
											type="button"
											class={`shrink-0 ${guidelineRemoveGhostClass}`}
											aria-label={
												g.kind === 'asset_class'
													? format(t('guidelines.list.deleteAria.bucket'), {
															label: formatEtfTypeLabel(g.etfType),
														})
													: format(t('guidelines.list.deleteAria.instrument'), {
															name: g.etfName,
														})
											}
											data-dialog-id={`guideline-delete-dialog-${g.id}`}
										>
											{t('guidelines.list.remove')}
										</button>
									</div>
									<dialog
										id={`guideline-delete-dialog-${g.id}`}
										class="rounded-lg border border-border bg-card p-4 shadow-lg backdrop:bg-black/50"
										aria-labelledby={`guideline-delete-dialog-label-${g.id}`}
									>
										<p
											id={`guideline-delete-dialog-label-${g.id}`}
											class="mb-4 text-sm text-card-foreground"
										>
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
												data-frame-submit="guidelines-list"
												data-frame-replace-from-response="1"
											>
												<input type="hidden" name="_method" value="DELETE" />
												<button
													type="submit"
													class="rounded-md bg-destructive px-3 py-1.5 text-sm text-white hover:opacity-90"
												>
													{t('guidelines.list.remove')}
												</button>
											</form>
										</div>
									</dialog>
								</Card>
							)
						})}
					</ul>
				)}
			</Card>
		)
	}
}
