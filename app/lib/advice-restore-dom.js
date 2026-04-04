/**
 * Build advice result markup from validated JSON using textContent only (no innerHTML).
 * Class names mirror `advice-page.tsx` for visual parity with server render.
 */

/**
 * @param {number} amount
 */
function formatAmountNumber(amount) {
	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(amount)
}

/**
 * @param {number} n
 */
function formatPctOneDecimal(n) {
	return `${new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 1,
	}).format(n)}%`
}

/**
 * @param {number} n
 */
function clampPct(n) {
	if (Number.isNaN(n)) return 0
	return Math.min(100, Math.max(0, n))
}

/**
 * @param {string} template
 * @param {Record<string, string>} vars
 */
function formatTemplate(template, vars) {
	let out = template
	for (const [key, value] of Object.entries(vars)) {
		out = out.split(`{${key}}`).join(value)
	}
	return out
}

/**
 * @param {Document} doc
 * @param {string} tag
 * @param {Record<string, string | undefined>} attrs
 * @param {(string | Node)[]} children
 */
function el(doc, tag, attrs, children = []) {
	const node = doc.createElement(tag)
	for (const [key, value] of Object.entries(attrs)) {
		if (value === undefined) continue
		node.setAttribute(key, value)
	}
	for (const child of children) {
		if (typeof child === 'string') {
			node.appendChild(doc.createTextNode(child))
		} else {
			node.appendChild(child)
		}
	}
	return node
}

/**
 * @param {{
 *   capitalTitle: string
 *   capitalSnapshotError: string
 *   capitalSrOnly: string
 *   capitalAriaBar: string
 *   capitalSegmentTitle: string
 * }} labels
 * @param {unknown} block
 * @param {string} headingId
 */
function buildCapitalSnapshot(doc, labels, block, headingId) {
	const b =
		/** @type {{ segments: { role: string; label: string; amount: number; currency: string }[]; postTotal?: { label: string; amount: number; currency: string } }} */ (
			block
		)
	const segs = b.segments
	if (segs.length !== 2) {
		return buildCapitalError(doc, labels, headingId)
	}
	const holdingsN = segs.filter((s) => s.role === 'holdings').length
	const cashN = segs.filter((s) => s.role === 'cash').length
	if (holdingsN !== 1 || cashN !== 1) {
		return buildCapitalError(doc, labels, headingId)
	}
	const currency = segs[0].currency
	if (!segs.every((s) => s.currency === currency)) {
		return buildCapitalError(doc, labels, headingId)
	}
	if (segs.some((s) => s.amount < 0 || Number.isNaN(s.amount))) {
		return buildCapitalError(doc, labels, headingId)
	}

	const total = segs.reduce((sum, s) => sum + s.amount, 0)
	const safeTotal = total > 0 ? total : 1

	const bar = el(doc, 'div', {
		class:
			'flex h-5 w-full min-w-0 max-w-full overflow-hidden rounded-md border border-border bg-muted/30',
		role: 'img',
		'aria-label': formatTemplate(labels.capitalAriaBar, {
			total: formatAmountNumber(total),
		}),
	})
	for (let i = 0; i < segs.length; i++) {
		const seg = segs[i]
		const segEl = el(doc, 'div', {
			class:
				seg.role === 'holdings' ? 'min-w-0 bg-primary' : 'min-w-0 bg-secondary',
			style: `width:${(seg.amount / safeTotal) * 100}%`,
			title: formatTemplate(labels.capitalSegmentTitle, {
				label: seg.label,
				amount: formatAmountNumber(seg.amount),
				currency: seg.currency,
			}),
		})
		bar.appendChild(segEl)
	}

	const list = el(doc, 'ul', {
		class: 'flex flex-wrap gap-x-5 gap-y-2 text-sm text-card-foreground',
	})
	for (const seg of segs) {
		const dot = el(doc, 'span', {
			class:
				seg.role === 'holdings'
					? 'inline-block size-2.5 shrink-0 rounded-sm bg-primary'
					: 'inline-block size-2.5 shrink-0 rounded-sm bg-secondary',
			'aria-hidden': 'true',
		})
		const li = el(doc, 'li', { class: 'flex items-center gap-2' }, [
			dot,
			el(doc, 'span', { class: 'font-medium' }, [seg.label]),
			el(doc, 'span', { class: 'tabular-nums text-muted-foreground' }, [
				`${formatAmountNumber(seg.amount)} ${seg.currency}`,
			]),
		])
		list.appendChild(li)
	}

	const children = [
		el(
			doc,
			'h3',
			{
				id: headingId,
				class: 'text-base font-semibold tracking-tight text-card-foreground',
			},
			[labels.capitalTitle],
		),
		el(doc, 'p', { class: 'sr-only' }, [labels.capitalSrOnly]),
		bar,
		list,
	]

	if (b.postTotal) {
		const pt = b.postTotal
		const postP = el(doc, 'p', { class: 'text-sm text-muted-foreground' })
		postP.appendChild(
			el(doc, 'span', { class: 'font-medium text-card-foreground' }, [
				`${pt.label}:`,
			]),
		)
		postP.appendChild(doc.createTextNode(' '))
		postP.appendChild(
			el(doc, 'span', { class: 'tabular-nums' }, [
				`${formatAmountNumber(pt.amount)} ${pt.currency}`,
			]),
		)
		children.push(postP)
	}

	return el(
		doc,
		'section',
		{
			class: 'min-w-0 max-w-full space-y-3',
			'aria-labelledby': headingId,
		},
		children,
	)
}

function buildCapitalError(doc, labels, headingId) {
	return el(
		doc,
		'section',
		{
			class: 'min-w-0 max-w-full space-y-3',
			'aria-labelledby': headingId,
		},
		[
			el(
				doc,
				'h3',
				{
					id: headingId,
					class: 'text-base font-semibold tracking-tight text-card-foreground',
				},
				[labels.capitalTitle],
			),
			el(doc, 'p', { role: 'alert', class: 'text-sm text-muted-foreground' }, [
				labels.capitalSnapshotError,
			]),
		],
	)
}

/**
 * @param {Record<string, string>} labels
 * @param {unknown} block
 * @param {string} headingId
 */
function buildGuidelineBars(doc, labels, block, headingId) {
	const b =
		/** @type {{ caption?: string; rows: { label: string; targetPct: number; currentPct: number; postBuyPct?: number }[] }} */ (
			block
		)
	const trimmed = b.caption?.trim()
	const titleText =
		trimmed !== undefined && trimmed.length > 0
			? trimmed
			: labels.guidelineDefaultCaption

	if (b.rows.length === 0) {
		return el(
			doc,
			'section',
			{
				class: 'min-w-0 max-w-full space-y-4',
				'aria-labelledby': headingId,
			},
			[
				el(
					doc,
					'h3',
					{
						id: headingId,
						class:
							'text-base font-semibold tracking-tight text-card-foreground',
					},
					[titleText],
				),
				el(doc, 'p', { class: 'text-sm text-muted-foreground' }, [
					labels.guidelineEmptyRows,
				]),
			],
		)
	}

	const ul = el(doc, 'ul', { class: 'space-y-4' })
	for (const row of b.rows) {
		const currentW = clampPct(row.currentPct)
		const postW = row.postBuyPct !== undefined ? clampPct(row.postBuyPct) : null
		const targetPos = clampPct(row.targetPct)
		const postBuyClause =
			row.postBuyPct !== undefined
				? formatTemplate(labels.guidelineAfterProposedBuys, {
						post: formatPctOneDecimal(row.postBuyPct),
					})
				: ''
		const summary = formatTemplate(labels.guidelineAriaSummary, {
			current: formatPctOneDecimal(row.currentPct),
			target: formatPctOneDecimal(row.targetPct),
			postBuyClause,
		})

		const barWrap = el(doc, 'div', {
			class:
				'relative h-3 w-full min-w-0 max-w-full overflow-hidden rounded-md bg-muted/80',
			role: 'img',
			'aria-label': summary,
		})

		if (postW !== null && postW < currentW) {
			barWrap.appendChild(
				el(doc, 'div', {
					class: 'absolute inset-y-0 left-0 bg-primary/75',
					style: `width:${currentW}%;z-index:1`,
					'aria-hidden': 'true',
				}),
			)
			barWrap.appendChild(
				el(doc, 'div', {
					class: 'absolute inset-y-0 left-0 bg-accent/40',
					style: `width:${postW}%;z-index:2`,
					'aria-hidden': 'true',
				}),
			)
		} else {
			if (postW !== null) {
				barWrap.appendChild(
					el(doc, 'div', {
						class: 'absolute inset-y-0 left-0 bg-accent/40',
						style: `width:${postW}%`,
						'aria-hidden': 'true',
					}),
				)
			}
			barWrap.appendChild(
				el(doc, 'div', {
					class: 'absolute inset-y-0 left-0 bg-primary/75',
					style: `width:${currentW}%`,
					'aria-hidden': 'true',
				}),
			)
		}
		barWrap.appendChild(
			el(doc, 'div', {
				class:
					'pointer-events-none absolute inset-y-0 w-px bg-card-foreground/90',
				style: `left:clamp(0px, calc(${targetPos}% - 0.5px), calc(100% - 1px))`,
				'aria-hidden': 'true',
			}),
		)

		const pctLine = `${formatPctOneDecimal(row.currentPct)} → ${formatPctOneDecimal(row.targetPct)}${row.postBuyPct !== undefined ? ` → ${formatPctOneDecimal(row.postBuyPct)}` : ''}`

		const li = el(doc, 'li', { class: 'space-y-1.5' }, [
			el(
				doc,
				'div',
				{
					class:
						'flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-sm',
				},
				[
					el(
						doc,
						'span',
						{
							class: 'min-w-0 break-words font-medium text-card-foreground',
						},
						[row.label],
					),
					el(doc, 'span', { class: 'tabular-nums text-muted-foreground' }, [
						pctLine,
					]),
				],
			),
			barWrap,
		])
		ul.appendChild(li)
	}

	return el(
		doc,
		'section',
		{
			class: 'min-w-0 max-w-full space-y-4',
			'aria-labelledby': headingId,
		},
		[
			el(
				doc,
				'h3',
				{
					id: headingId,
					class: 'text-base font-semibold tracking-tight text-card-foreground',
				},
				[titleText],
			),
			ul,
			el(doc, 'p', { class: 'text-xs text-muted-foreground' }, [
				labels.guidelineLegend,
			]),
		],
	)
}

/**
 * @param {Record<string, string>} labels
 * @param {unknown} block
 * @param {string} selectedModel
 */
function buildEtfProposals(
	doc,
	labels,
	block,
	selectedModel,
	defaultCashCurrency,
) {
	const b =
		/** @type {{ caption?: string; rows: { name: string; ticker?: string; catalogEntryId?: string; amount?: number; currency?: string; note?: string }[] }} */ (
			block
		)

	const sectionChildren = []
	if (b.caption) {
		sectionChildren.push(
			el(
				doc,
				'h3',
				{
					class: 'text-base font-semibold tracking-tight text-card-foreground',
				},
				[b.caption],
			),
		)
	}

	if (b.rows.length === 0) {
		sectionChildren.push(
			el(doc, 'p', { class: 'text-sm text-muted-foreground' }, [
				labels.tableEmpty,
			]),
		)
		return el(
			doc,
			'section',
			{ class: 'min-w-0 max-w-full space-y-2' },
			sectionChildren,
		)
	}

	const table = el(doc, 'table', {
		class: 'text-sm min-w-full border-collapse',
	})
	const caption = el(doc, 'caption', { class: 'sr-only' }, [
		labels.tableCaption,
	])
	table.appendChild(caption)

	const thead = el(doc, 'thead', { class: 'bg-muted/40' })
	const headRow = el(doc, 'tr', {}, [
		el(
			doc,
			'th',
			{
				scope: 'col',
				class: 'px-3 py-2 text-left font-medium text-card-foreground',
			},
			[labels.tableFund],
		),
		el(
			doc,
			'th',
			{
				scope: 'col',
				class: 'px-3 py-2 text-left font-medium text-card-foreground',
			},
			[labels.tableTicker],
		),
		el(
			doc,
			'th',
			{
				scope: 'col',
				class: 'px-3 py-2 text-right font-medium text-card-foreground',
			},
			[labels.tableAmount],
		),
		el(
			doc,
			'th',
			{
				scope: 'col',
				class: 'px-3 py-2 text-left font-medium text-card-foreground',
			},
			[labels.tableCurrency],
		),
		el(
			doc,
			'th',
			{
				scope: 'col',
				class: 'px-3 py-2 text-left font-medium text-card-foreground',
			},
			[labels.tableNote],
		),
		el(
			doc,
			'th',
			{
				scope: 'col',
				class: 'px-3 py-2 text-left font-medium text-card-foreground',
			},
			[el(doc, 'span', { class: 'sr-only' }, [labels.tableEtfDetails])],
		),
	])
	thead.appendChild(headRow)
	table.appendChild(thead)

	const tbody = el(doc, 'tbody', {})
	for (const row of b.rows) {
		const displayCurrency =
			row.amount !== undefined ? (row.currency ?? defaultCashCurrency) : null
		const tr = el(doc, 'tr', { class: 'border-t border-border' })
		tr.appendChild(
			el(doc, 'td', { class: 'px-3 py-2 text-card-foreground' }, [row.name]),
		)
		tr.appendChild(
			el(doc, 'td', { class: 'px-3 py-2 text-muted-foreground' }, [
				row.ticker ?? labels.emptyCell,
			]),
		)
		tr.appendChild(
			el(
				doc,
				'td',
				{
					class: 'px-3 py-2 text-right tabular-nums text-card-foreground',
				},
				[
					row.amount !== undefined
						? formatAmountNumber(row.amount)
						: labels.emptyCell,
				],
			),
		)
		tr.appendChild(
			el(doc, 'td', { class: 'px-3 py-2 text-muted-foreground' }, [
				displayCurrency ?? labels.emptyCell,
			]),
		)
		tr.appendChild(
			el(doc, 'td', { class: 'px-3 py-2 text-muted-foreground' }, [
				row.note ?? labels.emptyCell,
			]),
		)

		const detailsTd = el(doc, 'td', { class: 'px-3 py-2 align-top' })
		const catalogId = row.catalogEntryId?.trim()
		if (catalogId) {
			const a = el(doc, 'a', {
				href: `/catalog/etf/${encodeURIComponent(catalogId)}?model=${encodeURIComponent(selectedModel)}`,
				class:
					'inline-flex whitespace-nowrap rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-card-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
				'data-navigation-loading': 'true',
			})
			a.appendChild(doc.createTextNode(labels.tableEtfDetails))
			detailsTd.appendChild(a)
		} else {
			detailsTd.appendChild(
				el(doc, 'span', { class: 'text-xs text-muted-foreground' }, [
					labels.emptyCell,
				]),
			)
		}
		tr.appendChild(detailsTd)
		tbody.appendChild(tr)
	}
	table.appendChild(tbody)

	const scrollWrap = el(doc, 'div', { class: 'overflow-x-auto max-w-full' }, [
		table,
	])
	sectionChildren.push(scrollWrap)
	return el(
		doc,
		'section',
		{ class: 'min-w-0 max-w-full space-y-2' },
		sectionChildren,
	)
}

/**
 * @param {unknown} block
 * @param {string} defaultCashCurrency
 * @param {string} selectedModel
 * @param {Record<string, string>} labels
 * @param {number} blockIndex
 */
function buildAdviceBlock(
	doc,
	block,
	defaultCashCurrency,
	selectedModel,
	labels,
	blockIndex,
) {
	const b = /** @type {{ type: string }} */ (block)
	if (b.type === 'paragraph') {
		const text = /** @type {{ text: string }} */ (block).text
		return el(
			doc,
			'div',
			{
				class:
					'min-w-0 max-w-full whitespace-pre-wrap break-words text-sm leading-relaxed text-card-foreground',
			},
			[text],
		)
	}
	if (b.type === 'capital_snapshot') {
		return buildCapitalSnapshot(
			doc,
			labels,
			block,
			`advice-capital-snapshot-heading-${blockIndex}`,
		)
	}
	if (b.type === 'guideline_bars') {
		return buildGuidelineBars(
			doc,
			labels,
			block,
			`advice-guideline-bars-heading-${blockIndex}`,
		)
	}
	if (b.type === 'etf_proposals') {
		return buildEtfProposals(
			doc,
			labels,
			block,
			selectedModel,
			defaultCashCurrency,
		)
	}
	return null
}

/**
 * @param {Document} doc
 * @param {Record<string, string>} labels
 * @param {{
 *   adviceDocument: { blocks: unknown[] }
 *   lastAnalysisMode: string
 *   cashAmount?: string
 *   cashCurrency: string
 *   selectedModel: string
 *   savedAt: number
 * }} params
 */
export function buildAdviceRestoredCard(doc, labels, params) {
	const {
		adviceDocument,
		lastAnalysisMode,
		cashAmount,
		cashCurrency,
		selectedModel,
		savedAt,
	} = params
	const isReview = lastAnalysisMode === 'portfolio_review'
	const title = isReview ? labels.resultTitleReview : labels.resultTitleBuy
	const subtitle = isReview
		? labels.resultSubtitleReview
		: formatTemplate(labels.resultSubtitleBuy, {
				amount: cashAmount ?? '',
				currency: cashCurrency,
			})

	const savedLabel = new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(savedAt))
	const staleText = formatTemplate(labels.staleNoticeTemplate, {
		savedAt: savedLabel,
	})

	const blocksWrap = el(doc, 'div', { class: 'mt-4 min-w-0 space-y-6' })
	for (let i = 0; i < adviceDocument.blocks.length; i++) {
		const built = buildAdviceBlock(
			doc,
			adviceDocument.blocks[i],
			cashCurrency,
			selectedModel,
			labels,
			i,
		)
		if (built) {
			const wrap = el(doc, 'div', { class: 'min-w-0 max-w-full' }, [built])
			blocksWrap.appendChild(wrap)
		}
	}

	const card = el(
		doc,
		'article',
		{
			id: 'advice-last-result',
			class:
				'min-w-0 max-w-full p-6 rounded-xl border border-border shadow-sm bg-card',
			'aria-live': 'polite',
			'data-last-analysis-mode': lastAnalysisMode,
			'data-cash-currency': cashCurrency,
			'data-selected-model': selectedModel,
			...(isReview ? {} : { 'data-cash-amount': cashAmount ?? '' }),
		},
		[
			el(
				doc,
				'p',
				{
					class:
						'mb-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground',
					role: 'status',
				},
				[staleText],
			),
			el(
				doc,
				'h2',
				{
					class: 'text-lg font-semibold tracking-tight text-card-foreground',
				},
				[title],
			),
			el(doc, 'p', { class: 'mt-1 text-sm text-muted-foreground' }, [subtitle]),
			blocksWrap,
		],
	)

	return card
}
