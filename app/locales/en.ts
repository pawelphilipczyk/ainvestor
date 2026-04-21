/**
 * English UI copy — single source of truth for user-visible strings (default locale).
 * Add other locales later as parallel modules; keep keys aligned across languages.
 */

import type { EtfType } from '../lib/guidelines.ts'
'section.portfolio.title': 'Portfolio',
'section.portfolio.description':
	'Paste or upload a broker CSV to add what you already hold or want to buy.',
'section.advice.title': 'Get Advice',
'section.advice.description':
	'Review portfolio balance and risk against your catalog and targets, or get buy ideas when you add cash.',
'section.catalog.title': 'ETF Catalog',
'section.catalog.description':
	'Import your broker's ETF list and browse what's available.',
'section.guidelines.title': 'Investment Guidelines',
'section.guidelines.description': 'Set your target allocation.',
'admin.etfImport.title': 'Import ETF Data',
'admin.etfImport.description': 'Import or update ETF data from your broker''s CSV export',

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

	'chrome.flash.error': 'Error',
	'chrome.flash.info': 'Info',
	'chrome.flash.success': 'Success',

	'meta.title.home': 'AI Investor',
	'meta.title.portfolio': 'AI Investor – Portfolio',
	'meta.title.advice': 'AI Investor – Get Advice',
	'meta.title.catalog': 'AI Investor – ETF Catalog',
	'meta.title.catalogEtf': 'AI Investor – {name}',
	'meta.title.guidelines': 'AI Investor – Guidelines',

	'nav.portfolio': 'Portfolio',
	'nav.advice': 'Get Advice',
	'nav.catalog': 'ETF Catalog',
	'nav.guidelines': 'Investment Guidelines',
	'nav.admin': 'Admin',

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
	'portfolio.operation.title': 'Buy or sell',
	'portfolio.operation.hint':
		'Pick a fund from your catalog. Buy adds or increases a holding; sell reduces or removes it.',
	'portfolio.operation.field.fund': 'Fund',
	'portfolio.operation.field.value': 'Value',
	'portfolio.operation.field.currency': 'Currency',
	'portfolio.operation.placeholder.value': 'e.g. 1200.50',
	'portfolio.operation.field.operation': 'Operation',
	'portfolio.operation.optionBuy': 'Buy (add or increase)',
	'portfolio.operation.optionSell': 'Sell (reduce or remove)',
	'portfolio.operation.submit': 'Apply',
	'portfolio.operation.footer.beforeLink': 'Import or paste funds on the',
	'portfolio.operation.footer.link': 'ETF Catalog',
	'portfolio.operation.footer.after': 'to populate the list.',
	'portfolio.holdings.title': 'Your Holdings',
	'portfolio.holdings.empty': 'No ETFs added yet.',
	'portfolio.etf.valueShareBarAria':
		'{percent}% of total holdings value for {name}',
	'portfolio.etf.buyMore': 'Buy more',
	'portfolio.etf.sell': 'Sell',

	'forms.catalog.emptyPlaceholder':
		'No funds in catalog — import on ETF Catalog',
	'forms.catalog.selectFundPlaceholder': 'Select a fund…',
	'forms.targetPct.placeholder': 'e.g. 60',
	'forms.targetPct.placeholderAsset': 'e.g. 40',

	'catalog.savedGist': 'Your portfolio is matched against the shared catalog.',
	'catalog.sharedSource':
		'This catalog is loaded from a shared public GitHub Gist.',
	'catalog.import.title': 'Import',
	'catalog.import.subtitle':
		'Paste bank API JSON below to update the shared catalog (merges with existing rows).',
	'catalog.import.submit': 'Import',
	'catalog.import.ownerOnly': 'Import updates from the shared catalog gist.',
	'catalog.import.ownerMissing':
		'Import is unavailable until the shared catalog gist owner is configured.',
	'catalog.import.signInRequired':
		'Sign in with the shared catalog gist owner account to import updates.',
	'catalog.import.ownerActive': 'Import updates from the shared catalog gist.',
	'catalog.import.pasteLabel.screenReader': 'Paste bank API JSON',
	'catalog.import.pastePlaceholder':
		'Paste fetch response JSON here, then click Import',
	'catalog.empty.title': 'No catalog imported yet.',
	'catalog.empty.hint':
		'The shared catalog gist is empty. If you are the gist owner, import ETFs here to populate it.',
	'catalog.filter.assetType': 'Asset type',
	'catalog.filter.allTypes': 'All types',
	'catalog.filter.search': 'Search',
	'catalog.filter.searchPlaceholder': 'Ticker, name, or description…',
	'catalog.filter.submit': 'Filter',
	'catalog.filter.clear': 'Clear',
	'catalog.filter.risk': 'Risk',
	'catalog.filter.allRisks': 'All risk levels',
	'catalog.riskBand.low': 'low',
	'catalog.riskBand.medium': 'medium',
	'catalog.riskBand.high': 'high',
	'catalog.count.showing': 'Showing {filtered} of {total} ETFs',
	'catalog.count.one': '{n} ETF in catalog',
	'catalog.count.many': '{n} ETFs in catalog',
	'catalog.holdings.title': 'Your Holdings',
	'catalog.holdings.subtitle': 'ETFs in this catalog that you already own.',
	'catalog.table.ticker': 'Ticker',
	'catalog.table.name': 'Name',
	'catalog.table.type': 'Type',
	'catalog.table.risk': 'Risk',
	'catalog.table.description': 'Description',
	'catalog.table.isin': 'ISIN',
	'catalog.table.value': 'Value',
	'catalog.etfDetail.back': 'Back',
	'catalog.etfDetail.pendingBody':
		'ETF details are available after your account is approved.',
	'catalog.etfDetail.catalogCardTitle': 'From your catalog',
	'catalog.etfDetail.analysisTitle': 'AI overview',
	'catalog.etfDetail.loadAnalysisButton': 'ETF analysis',
	'catalog.etfDetail.field.id': 'Record ID',
	'catalog.etfDetail.field.expenseRatio': 'Expense ratio',
	'catalog.etfDetail.field.riskKid': 'Risk',
	'catalog.etfDetail.field.region': 'Region',
	'catalog.etfDetail.field.sector': 'Sector',
	'catalog.etfDetail.field.rateOfReturn': 'Annual rate of return',
	'catalog.etfDetail.field.volatility': 'Volatility',
	'catalog.etfDetail.field.returnRisk': 'Return / risk',
	'catalog.etfDetail.field.fundSize': 'Fund size',
	'catalog.etfDetail.field.esg': 'ESG',
	'catalog.etfDetail.esgYes': 'Yes',
	'catalog.etfDetail.esgNo': 'No',
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
	'guidelines.list.editTarget': 'Edit target',
	'guidelines.list.cancelEditTarget': 'Cancel',
	'guidelines.list.targetPctSuffix': '%',
	'guidelines.list.targetPctLabel': 'Target percent for {label}',
	'guidelines.list.shareBarAria': 'Target {percent}% of portfolio for {label}',
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
	'advice.form.submitPortfolioRegenerate': 'Regenerate analysis',
	'advice.portfolioReview.clearStored': 'Clear saved review',
	'advice.analysisMode.buy_next': 'What to buy next',
	'advice.analysisMode.portfolio_review': 'Portfolio health review',
	'advice.result.title': 'Investment Advice',
	'advice.result.titleReview': 'Portfolio review',
	'advice.result.subtitle':
		'Based on your portfolio and {amount} {currency} available.',
	'advice.result.subtitleReviewGuidelinesOnly':
		'Based on your current ETF holdings, catalog, and guidelines.',
	'advice.restore.fromGistNotice':
		'Showing your last saved analysis from your data gist (saved {savedAt}). Run Ask AI again after you change holdings or cash.',
	'advice.persistFailed.notice':
		'Could not save this analysis to your data gist. The result below is shown for this visit only; reload may lose it until saving works again.',
	'advice.table.empty': 'No specific ETF proposals in this response.',
	'advice.table.caption': 'Proposed ETF investments',
	'advice.table.fund': 'Fund',
	'advice.table.ticker': 'Ticker',
	'advice.table.amount': 'Amount',
	'advice.table.currency': 'Currency',
	'advice.table.note': 'Note',
	'advice.table.etfDetailsLink': 'ETF details',
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
		'Please choose an operation (Buy or Sell), select a fund from your catalog, and enter a valid value (for sell, value must be greater than 0).',
	'errors.portfolio.catalogEntryMissing':
		'Selected catalog entry not found. Update your catalog or pick another fund.',
	'errors.portfolio.sellNoHolding':
		'You do not hold that fund in this currency yet — use Buy to add it.',
	'errors.portfolio.sellExceedsHoldings':
		'That amount is more than your current holding value.',
	'errors.portfolio.sellValueNotPositive':
		'Enter an amount greater than zero to sell.',
	'errors.portfolio.persistence':
		'Could not save your portfolio. Please try again in a moment.',
	'errors.catalog.importNotAllowed':
		'Only the shared catalog gist owner can import catalog updates.',
	'errors.catalog.import.fieldMissing':
		'The import did not include any pasted text. Paste the bank API JSON and try again.',
	'errors.catalog.import.emptyJson':
		'Paste is empty. Paste the full bank API JSON response (an object with a "data" array of funds), then click Import.',
	'errors.catalog.import.invalidJson':
		'That text is not valid JSON. Copy the full fetch response body from your browser’s network tab and try again.',
	'errors.catalog.import.noRowsParsed':
		'No ETF rows could be read from that JSON. Expected an object with a "data" array; each item needs a ticker and fund_name (and usually matches your broker’s API shape).',
	'errors.catalog.import.diagnostic.savedLead':
		'Catalog saved. Merged {appliedCount} row(s) from this paste.',
	'errors.catalog.import.diagnostic.nothingSavedLead':
		'Nothing was saved from this paste.',
	'errors.catalog.import.diagnostic.skippedHeading': 'Skipped rows:',
	'errors.catalog.import.diagnostic.notesHeading': 'Notes:',
	'errors.catalog.import.diagnostic.notesSummaryMany':
		'{count} row(s) refreshed existing catalog lines (same ISIN and ticker); incoming fields were merged.',
	'errors.catalog.import.diagnostic.flashTruncated':
		'(Message was shortened to fit your session cookie size limit.)',
	'errors.catalog.import.issue.expectedObject':
		'JSON must be an object with a "data" array of funds.',
	'errors.catalog.import.issue.dataNotArray':
		'Property "data" must be an array of fund objects.',
	'errors.catalog.import.issue.rowNotObject':
		'Item is not an object — skipped.',
	'errors.catalog.import.issue.missingTicker': 'Missing ticker.',
	'errors.catalog.import.issue.missingFundName': 'Missing fund_name.',
	'errors.catalog.import.issue.isinInvalid':
		'ISIN is present but not valid (expected 12-character format).',
	'errors.catalog.import.issue.duplicateIdInPaste':
		'Duplicate id "{id}" in this paste (clashes with row {otherIndex}).',
	'errors.catalog.import.issue.duplicateMergeKeyInPaste':
		'Same catalog key as row {otherIndex} (duplicate ISIN + ticker line in this paste).',
	'errors.catalog.import.issue.alreadyInCatalog':
		'This line matches an existing catalog row (same ISIN and ticker); the catalog row was updated from this paste.',
	'errors.catalog.import.issue.idAlreadyInCatalog':
		'Fund id "{id}" already exists in the catalog; incoming fields were merged into that row.',
	'errors.catalog.import.dataArrayEmpty':
		'The pasted JSON has an empty "data" array — no funds to import.',
	'errors.catalog.import.saveFailed':
		'Could not save the catalog to GitHub. Check your connection and permissions, then try again.',
	'errors.catalog.etfDetail.service':
		"We couldn't load this ETF description right now. Please try again in a moment.",
	'errors.catalog.etfDetail.notFound': 'That catalog entry was not found.',
	'errors.catalog.etfDetail.pendingAnalysis':
		'ETF analysis is available after your account is approved.',

	'errors.guidelines.totalExceeds100':
		'Guideline targets cannot add up to more than 100%. You currently have {current}% allocated; adding {added}% would exceed the limit.',
	'errors.guidelines.updateTotalExceeds100':
		'Guideline targets cannot add up to more than 100%. Setting this line to {newTargetPercent}% would make the total {total}%.',
	'errors.guidelines.targetPctInvalid':
		'Enter a target percentage between 0.01 and 100.',
	'errors.guidelines.duplicateInstrument':
		'You already have a guideline for {ticker}. To change it, edit or remove that line — you cannot add a second guideline for the same fund.',
	'errors.guidelines.duplicateAssetClass':
		'You already have a guideline for the {label} asset class. To change it, edit or remove that line — you cannot add a second bucket guideline for the same class.',
	'errors.guidelines.addFormInvalid':
		'Check the fund or bucket, target percentage, and try again.',
	'errors.guidelines.catalogEntryStale':
		'That fund is no longer in your catalog. Refresh the page and choose a fund from the list.',
	'errors.guidelines.assetClassStale':
		'That asset class is no longer available. Refresh the page and choose from the list.',

	'errors.advice.formRead': 'Could not read your form. Please try again.',
	'errors.advice.formReadDetail':
		'The server did not receive parseable form data for this request.',
	'errors.advice.validation': 'Check the form and try again.',
	'errors.advice.buyNextCashRequired':
		'Enter how much cash you plan to invest for What to buy next.',
	'errors.advice.notApproved':
		'Your account is not approved yet. You cannot request advice until your GitHub username is added to app/lib/approved-github-logins.ts and deployed.',
	'errors.advice.requiresGithubGist':
		'AI advice uses your portfolio and guidelines from your private GitHub gist. Sign in with GitHub and set up your data gist from the Portfolio page before running analysis.',
	'advice.requiresGist.title': 'Sign in to run AI advice',
	'advice.requiresGist.bodySignIn':
		'Advice is generated from your saved portfolio and guidelines. Use Sign in with GitHub in the header, then open Portfolio to create or connect your private gist.',
	'advice.requiresGist.bodyConnectGist':
		'Open the Portfolio page to create or connect your private data gist. After that, you can run portfolio review and buy-next analysis here.',
	'advice.requiresGist.linkSignIn': 'Sign in with GitHub',
	'advice.requiresGist.linkPortfolio': 'Open Portfolio',
	'errors.advice.service':
		"We couldn't get advice right now. Please try again in a moment.",
	'client.formSubmit.genericError': 'Please check your input.',
} as const

export type MessageKey = keyof typeof en
