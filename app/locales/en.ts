/**
 * English UI copy — single source of truth for user-visible strings (default locale).
 * Add other locales later as parallel modules; keep keys aligned across languages.
 */

import type { EtfType } from '../lib/guidelines.ts'

/** Display labels for persisted `EtfType` values (catalog badges, guidelines). */
export const ETF_TYPE_LABELS: Record<EtfType, string> = {
	equity: 'equity',
	bond: 'bond',
	real_estate: 'real estate',
	commodity: 'commodity',
	mixed: 'mixed',
	money_market: 'money market',
}

export const en = {
	'app.name': 'AI Investor',
	'app.previewChip': 'Preview',

	'meta.title.home': 'AI Investor',
	'meta.title.portfolio': 'AI Investor – Portfolio',
	'meta.title.advice': 'AI Investor – Get Advice',
	'meta.title.catalog': 'AI Investor – ETF Catalog',
	'meta.title.guidelines': 'AI Investor – Guidelines',

	'nav.portfolio': 'Portfolio',
	'nav.advice': 'Get Advice',
	'nav.catalog': 'ETF Catalog',
	'nav.guidelines': 'Investment Guidelines',

	'intro.tagline':
		'Choose where to go next. Everything works in the browser; sign in with GitHub when you want your portfolio and catalog saved across sessions.',

	'section.portfolio.title': 'Portfolio',
	'section.portfolio.description':
		'Paste or upload a broker CSV to add what you already hold or want to buy.',
	'section.advice.title': 'Get Advice',
	'section.advice.description':
		'Review portfolio balance and risk against your catalog and targets, or get buy ideas when you add cash.',
	'section.catalog.title': 'ETF Catalog',
	'section.catalog.description':
		'Import your broker’s ETF list and browse what’s available.',
	'section.guidelines.title': 'Investment Guidelines',
	'section.guidelines.description': 'Set your target allocation.',

	'chrome.loading': 'Loading…',
	'chrome.aria.mainNav': 'Main navigation',
	'chrome.aria.closeNav': 'Close navigation',
	'chrome.aria.openNav': 'Open navigation',
	'chrome.aria.toggleTheme': 'Toggle theme',
	'chrome.signedInAs': 'Signed in as @{login}',
	'chrome.approvalPendingSidebar':
		'Approval pending — ask an admin to add you to the allow list.',
	'chrome.signOut': 'Sign out',
	'chrome.signInGithub': 'Sign in with GitHub',
	'chrome.signIn': 'Sign in',
	'chrome.pendingShort': '(pending)',

	'portfolio.savedGist': 'Saved to your private GitHub Gist',
	'portfolio.pendingNotSaved':
		'Account pending approval — portfolio is not saved to GitHub yet',
	'portfolio.signInPersist': 'Sign in to persist your data across sessions',
	'portfolio.import.title': 'Import from CSV',
	'portfolio.import.formatsHint':
		'eMAKLER/mBank exports and similar. Example columns:',
	'portfolio.import.encodingNote':
		'Semicolon or comma. Polish headers (Papier, Giełda, Liczba dostępna, Wartość, Waluta). Windows-1250 encoding supported for file uploads.',
	'portfolio.import.pasteLabel': 'Paste CSV here',
	'portfolio.import.pastePlaceholder':
		'Paste rows from your export (include the header row)…',
	'portfolio.import.uploadLabel': 'Or upload a file',
	'portfolio.import.submit': 'Import',
	'portfolio.addManual.summary': 'Add one ETF manually',
	'portfolio.holdings.title': 'Your Holdings',
	'portfolio.holdings.empty': 'No ETFs added yet.',
	'portfolio.holdings.shares': '{count} shares',
	'portfolio.etf.sell': 'Sell',
	'portfolio.etf.removeConfirm': 'Remove {name} from your portfolio?',
	'portfolio.etf.removeAria': 'Remove {name} from portfolio',
	'portfolio.etf.cancel': 'Cancel',
	'portfolio.etf.remove': 'Remove',
	'portfolio.etf.updateValueLabel': 'Value ({currency})',
	'portfolio.etf.updateValueSr': 'Market value for {name}',
	'portfolio.etf.updateQuantityLabel': 'Quantity',
	'portfolio.etf.updateQuantitySr': 'Share quantity for {name}',
	'portfolio.etf.save': 'Save',
	'portfolio.etf.valueShareBarAria':
		'{pct}% of total holdings value for {name}',

	'forms.catalog.emptyPlaceholder':
		'No funds in catalog — import on ETF Catalog',
	'forms.catalog.selectFundPlaceholder': 'Select a fund…',
	'forms.targetPct.placeholder': 'e.g. 60',
	'forms.targetPct.placeholderAsset': 'e.g. 40',

	'addEtf.hint':
		'Pick a fund from your catalog. Its name comes from the catalog row.',
	'addEtf.field.fund': 'Fund',
	'addEtf.field.value': 'Value',
	'addEtf.field.currency': 'Currency',
	'addEtf.field.quantityOptional': 'Quantity (optional)',
	'addEtf.placeholder.value': 'e.g. 1200.50',
	'addEtf.placeholder.quantity': 'e.g. 186',
	'addEtf.submit': 'Add ETF',
	'addEtf.footer.beforeLink': 'Import or paste funds on the',
	'addEtf.footer.link': 'ETF Catalog',
	'addEtf.footer.after': 'to populate the list.',

	'catalog.savedGist': 'Catalog saved to your private GitHub Gist.',
	'catalog.pendingNotSaved':
		'Account pending approval — catalog is not saved to GitHub yet.',
	'catalog.signInPersist': 'Sign in to persist catalog across sessions.',
	'catalog.import.title': 'Import',
	'catalog.import.subtitle':
		'Paste bank API JSON below, then submit to add ETFs (merges with existing).',
	'catalog.import.submit': 'Import',
	'catalog.import.pasteLabel.sr': 'Paste bank API JSON',
	'catalog.import.pastePlaceholder':
		'Paste fetch response JSON here, then click Import',
	'catalog.empty.title': 'No catalog imported yet.',
	'catalog.empty.hint':
		'Paste bank API JSON above and click Import to add ETFs to your catalog.',
	'catalog.filter.assetType': 'Asset type',
	'catalog.filter.allTypes': 'All types',
	'catalog.filter.search': 'Search',
	'catalog.filter.searchPlaceholder': 'Ticker, name, or description…',
	'catalog.filter.submit': 'Filter',
	'catalog.filter.clear': 'Clear',
	'catalog.count.showing': 'Showing {filtered} of {total} ETFs',
	'catalog.count.one': '{n} ETF in catalog',
	'catalog.count.many': '{n} ETFs in catalog',
	'catalog.holdings.title': 'Your Holdings',
	'catalog.holdings.subtitle': 'ETFs in this catalog that you already own.',
	'catalog.table.ticker': 'Ticker',
	'catalog.table.name': 'Name',
	'catalog.table.type': 'Type',
	'catalog.table.description': 'Description',
	'catalog.table.isin': 'ISIN',
	'catalog.table.value': 'Value',
	'catalog.emptyCell': '—',
	'catalog.etfTypeUnknown': 'Unknown',
	'catalog.noMatch': 'No ETFs match your search.',
	'catalog.section.otherAvailable': 'Other Available ETFs',
	'catalog.section.available': 'Available ETFs',

	'guidelines.subtitle.savedGist': 'Saved to your private GitHub Gist.',
	'guidelines.subtitle.pending':
		'Account pending approval — guidelines are not saved to GitHub yet.',
	'guidelines.subtitle.signIn': 'Sign in to persist across sessions.',
	'guidelines.tabs.navAria': 'Add guideline forms',
	'guidelines.etfCard.title': 'Specific ETF target',
	'guidelines.etfCard.hint':
		'Pick a fund from your catalog. Its category is set from the catalog row.',
	'guidelines.etfCard.field.fund': 'Fund',
	'guidelines.etfCard.field.targetPct': 'Target %',
	'guidelines.etfCard.submit': 'Add ETF guideline',
	'guidelines.bucket.title': 'Asset class bucket',
	'guidelines.bucket.hint':
		'Target a share of your portfolio for a class that appears in your catalog.',
	'guidelines.bucket.field.class': 'Asset class',
	'guidelines.bucket.field.targetPct': 'Target %',
	'guidelines.bucket.submit': 'Add asset-class guideline',
	'guidelines.footer.beforeLink': 'Import or paste funds on the',
	'guidelines.footer.link': 'ETF Catalog',
	'guidelines.footer.after': 'to populate both lists.',
	'guidelines.list.title': 'Your Guidelines',
	'guidelines.list.totalAllocated': 'Total allocated:',
	'guidelines.list.remaining': 'Remaining:',
	'guidelines.list.empty': 'No guidelines added yet.',
	'guidelines.list.kind.assetClass': 'asset class',
	'guidelines.list.bucketSuffix': '(bucket)',
	'guidelines.list.remove': 'Remove',
	'guidelines.list.saveTarget': 'Save',
	'guidelines.list.targetPctSuffix': '%',
	'guidelines.list.targetPctLabel': 'Target percent for {label}',
	'guidelines.list.shareBarAria': 'Target {pct}% of portfolio for {label}',
	'guidelines.list.deleteAria.instrument': 'Delete {name} guideline',
	'guidelines.list.deleteAria.bucket': 'Delete {label} bucket guideline',
	'guidelines.list.deleteConfirm': 'Remove the {label} guideline?',
	'guidelines.list.deleteCancel': 'Cancel',

	'advice.pending.title': 'Account pending approval',
	'advice.pending.body':
		'You signed in with GitHub, but this app only allows listed users. Add your GitHub username to',
	'advice.pending.afterPath':
		'in a pull request. After it is merged and deployed, sign out and sign in again.',
	'advice.tabs.navAria': 'Advice sections',
	'advice.tab.hint.buyNext':
		'Enter deployable cash (same currency as your holdings when possible). Suggestions are buy-only — no sells.',
	'advice.tab.hint.portfolioReview':
		'Qualitative balance and risk vs your catalog and guidelines.',
	'advice.form.field.cash': 'Available cash',
	'advice.form.field.currency': 'Currency',
	'advice.form.field.model': 'Model',
	'advice.form.placeholder.cash': 'e.g. 1000',
	'advice.form.submit': 'Ask AI',
	'advice.analysisMode.buy_next': 'What to buy next',
	'advice.analysisMode.portfolio_review': 'Portfolio health review',
	'advice.result.title': 'Investment Advice',
	'advice.result.titleReview': 'Portfolio review',
	'advice.result.subtitle':
		'Based on your portfolio and {amount} {currency} available.',
	'advice.result.subtitleReviewGuidelinesOnly':
		'Based on your current ETF holdings, catalog, and guidelines.',
	'advice.table.empty': 'No specific ETF proposals in this response.',
	'advice.table.caption': 'Proposed ETF investments',
	'advice.table.fund': 'Fund',
	'advice.table.ticker': 'Ticker',
	'advice.table.amount': 'Amount',
	'advice.table.currency': 'Currency',
	'advice.table.note': 'Note',
	'advice.capital.title': 'Portfolio mix',
	'advice.capital.snapshotError':
		'Portfolio snapshot could not be shown because the data from the model was inconsistent (for example mixed currencies or invalid amounts).',
	'advice.capital.srOnly':
		'Stacked bar: share of current ETF holdings versus deployable cash before new purchases.',
	'advice.capital.ariaBar':
		'Holdings and cash share of {total} combined (same currency).',
	'advice.capital.segmentTitle': '{label}: {amount} {currency}',
	'advice.guideline.defaultCaption': 'Guideline alignment',
	'advice.guideline.emptyRows':
		'No guideline comparison rows in this response.',
	'advice.guideline.legend':
		'Solid bar: current portfolio weight. Lighter bar behind: after proposed buys (when shown). Vertical line: target.',
	'advice.guideline.ariaSummary':
		'Current {current}, target {target}{postBuyClause}.',
	'advice.guideline.afterProposedBuys': ', after proposed buys {post}',
	'advice.model.gpt-5.4-mini': 'GPT-5.4 Mini',
	'advice.model.gpt-5.4-nano': 'GPT-5.4 Nano',
	'advice.model.gpt-5.4': 'GPT-5.4',

	'errors.portfolio.addInvalid':
		'Please select a fund from your catalog and enter a valid value (number >= 0).',
	'errors.portfolio.catalogEntryMissing':
		'Selected catalog entry not found. Update your catalog or pick another fund.',
	'errors.portfolio.updateInvalid':
		'Enter a valid value (number >= 0) and optional quantity (whole number >= 0).',
	'errors.portfolio.entryNotFound':
		'That holding is no longer in your portfolio.',
	'errors.portfolio.persistence':
		'Could not save your portfolio. Please try again in a moment.',

	'errors.guidelines.totalExceeds100':
		'Guideline targets cannot add up to more than 100%. You currently have {current}% allocated; adding {added}% would exceed the limit.',
	'errors.guidelines.updateTotalExceeds100':
		'Guideline targets cannot add up to more than 100%. Setting this line to {newPct}% would make the total {total}%.',
	'errors.guidelines.targetPctInvalid':
		'Enter a target percentage between 0.01 and 100.',
	'errors.guidelines.duplicateInstrument':
		'You already have a guideline for {ticker}. To change it, edit or remove that line — you cannot add a second guideline for the same fund.',
	'errors.guidelines.duplicateAssetClass':
		'You already have a guideline for the {label} asset class. To change it, edit or remove that line — you cannot add a second bucket guideline for the same class.',

	'errors.advice.formRead': 'Could not read your form. Please try again.',
	'errors.advice.formReadDetail':
		'The server did not receive parseable form data for this request.',
	'errors.advice.validation': 'Check the form and try again.',
	'errors.advice.buyNextCashRequired':
		'Enter how much cash you plan to invest for What to buy next.',
	'errors.advice.notApproved':
		'Your account is not approved yet. You cannot request advice until your GitHub username is added to app/lib/approved-github-logins.ts and deployed.',
	'errors.advice.service':
		"We couldn't get advice right now. Please try again in a moment.",

	'client.formSubmit.genericError': 'Please check your input.',
} as const

export type MessageKey = keyof typeof en
