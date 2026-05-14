/**
 * Polish UI copy — keys must stay aligned with `en` in `en.ts`.
 * Catalog fund names, tickers, and broker API field values are not translated here.
 */

import type { EtfType } from '../lib/etf-type.ts'
import type { MessageKey } from './en.ts'

/** Polish display labels for persisted `EtfType` keys (catalog badges, guidelines). */
export const ETF_TYPE_LABELS_PL: Record<EtfType, string> = {
	equity: 'Akcje',
	bond: 'Obligacje',
	real_estate: 'Nieruchomości',
	commodity: 'Towary',
	mixed: 'Mieszany',
	money_market: 'Rynek pieniężny',
}

export const pl = {
	'app.name': 'AI Investor',
	'app.previewChip': 'Podgląd',
	'app.previewDeployTitle': 'Wersja {commit}',
	'chrome.flash.error': 'Błąd',
	'chrome.flash.info': 'Informacja',
	'chrome.flash.success': 'Sukces',
	'meta.title.home': 'AI Investor',
	'meta.title.portfolio': 'AI Investor – Portfel',
	'meta.title.advice': 'AI Investor – Porady',
	'meta.title.adviceContext': 'AI Investor – Eksport kontekstu',
	'meta.title.catalog': 'AI Investor – Katalog ETF',
	'meta.title.catalogEtf': 'AI Investor – {name}',
	'meta.title.guidelines': 'AI Investor – Wytyczne',
	'meta.title.adminEtfImport': 'AI Investor – Import ETF (admin)',
	'nav.portfolio': 'Portfel',
	'nav.advice': 'Porady',
	'nav.catalog': 'Katalog ETF',
	'nav.guidelines': 'Wytyczne inwestycyjne',
	'nav.admin': 'Admin',
	'intro.tagline':
		'Wybierz, dokąd chcesz przejść. Wszystko działa w przeglądarce; zaloguj się przez GitHuba, gdy chcesz zapisywać portfel i katalog między sesjami.',
	'section.portfolio.title': 'Portfel',
	'section.portfolio.description':
		'Wklej lub prześlij plik CSV z brokera, aby dodać to, co już posiadasz lub chcesz kupić.',
	'section.advice.title': 'Porady',
	'section.advice.description':
		'Sprawdź balans portfela i ryzyko względem katalogu i celów albo uzyskaj propozycje zakupów po dodaniu gotówki.',
	'section.catalog.title': 'Katalog ETF',
	'section.catalog.description':
		'Zaimportuj listę ETF od brokera i przeglądaj dostępne fundusze.',
	'section.guidelines.title': 'Wytyczne inwestycyjne',
	'section.guidelines.description': 'Ustal docelowy podział alokacji.',
	'admin.etfImport.title': 'Import danych ETF',
	'admin.etfImport.description':
		'Aktualizuj wspólny katalog ETF z eksportu brokera tylko wtedy, gdy zmieni się źródłowy katalog.',
	'admin.etfImport.frequencyNote':
		'Korzystaj z tego tylko po zmianie eksportu katalogu ETF brokera. Aktualizuje wspólne dane używane na stronach portfela, wytycznych i porad.',
	'chrome.loading': 'Ładowanie…',
	'chrome.aria.mainNav': 'Nawigacja główna',
	'chrome.aria.closeNav': 'Zamknij nawigację',
	'chrome.aria.openNav': 'Otwórz nawigację',
	'chrome.aria.toggleTheme': 'Przełącz motyw',
	'chrome.aria.language': 'Język interfejsu',
	'chrome.language.en': 'Angielski',
	'chrome.language.pl': 'Polski',
	'chrome.signedInAs': 'Zalogowany jako @{login}',
	'chrome.approvalPendingSidebar':
		'Oczekiwanie na akceptację — poproś administratora o dodanie Cię do listy.',
	'chrome.signOut': 'Wyloguj',
	'chrome.signInGithub': 'Zaloguj przez GitHuba',
	'chrome.signIn': 'Zaloguj',
	'chrome.pendingShort': '(oczekuje)',
	'portfolio.savedGist': 'Zapisano w prywatnym gicie GitHub Gist',
	'portfolio.pendingNotSaved':
		'Konto oczekuje na akceptację — portfel nie jest jeszcze zapisany w GitHubie',
	'portfolio.signInPersist': 'Zaloguj się, aby zachować dane między sesjami',
	'portfolio.import.title': 'Import z pliku CSV',
	'portfolio.import.formatsHint':
		'Eksporty eMAKLER/mBank i podobne. Przykładowe kolumny:',
	'portfolio.import.encodingNote':
		'Średnik lub przecinek. Polskie nagłówki (Papier, Giełda, Liczba dostępna, Wartość, Waluta). Obsługiwane kodowanie Windows-1250 przy wgrywaniu pliku.',
	'portfolio.import.pasteLabel': 'Wklej CSV tutaj',
	'portfolio.import.pastePlaceholder':
		'Wklej wiersze z eksportu (razem z wierszem nagłówka)…',
	'portfolio.import.uploadLabel': 'Lub prześlij plik',
	'portfolio.import.submit': 'Importuj',
	'portfolio.operation.title': 'Kup lub sprzedaj',
	'portfolio.operation.hint':
		'Wybierz fundusz z katalogu. Zakup dodaje lub zwiększa pozycję; sprzedaż zmniejsza lub usuwa ją.',
	'portfolio.operation.field.fund': 'Fundusz',
	'portfolio.operation.field.value': 'Wartość',
	'portfolio.operation.field.currency': 'Waluta',
	'portfolio.operation.placeholder.value': 'np. 1200,50',
	'portfolio.operation.field.operation': 'Operacja',
	'portfolio.operation.optionBuy': 'Kupno (dodaj lub zwiększ)',
	'portfolio.operation.optionSell': 'Sprzedaż (zmniejsz lub usuń)',
	'portfolio.operation.submit': 'Zastosuj',
	'portfolio.operation.footer.beforeLink':
		'Zaimportuj lub wklej fundusze na stronie',
	'portfolio.operation.footer.link': 'Katalog ETF',
	'portfolio.operation.footer.after': ', aby wypełnić listę.',
	'portfolio.holdings.title': 'Twoje pozycje',
	'portfolio.holdings.empty': 'Nie dodano jeszcze żadnych ETF.',
	'portfolio.etf.valueShareBarAria':
		'{percent}% łącznej wartości pozycji dla {name}',
	'portfolio.etf.buyMore': 'Dokup',
	'portfolio.etf.sell': 'Sprzedaj',
	'forms.catalog.emptyPlaceholder':
		'Brak funduszy w katalogu — zaimportuj na stronie Katalog ETF',
	'forms.catalog.selectFundPlaceholder': 'Wybierz fundusz…',
	'forms.targetPct.placeholder': 'np. 60',
	'forms.targetPct.placeholderAsset': 'np. 40',
	'catalog.savedGist': 'Twój portfel jest dopasowywany do wspólnego katalogu.',
	'catalog.sharedSource':
		'Ten katalog jest wczytywany ze wspólnego publicznego gistu GitHub.',
	'catalog.import.title': 'Import',
	'catalog.import.subtitle':
		'Wklej JSON API banku lub prześlij plik HAR z narzędzi deweloperskich (.har), aby zaktualizować wspólny katalog (scala z istniejącymi wierszami).',
	'catalog.import.submit': 'Importuj',
	'catalog.import.ownerOnly':
		'Import aktualizacji ze wspólnego gistu katalogu.',
	'catalog.import.ownerMissing':
		'Import jest niedostępny, dopóki nie skonfiguruje się właściciela wspólnego gistu katalogu.',
	'catalog.import.signInRequired':
		'Zaloguj się kontem właściciela wspólnego gistu katalogu, aby importować aktualizacje.',
	'catalog.import.ownerActive':
		'Import aktualizacji ze wspólnego gistu katalogu.',
	'catalog.import.pasteLabel.screenReader': 'Wklej JSON API banku',
	'catalog.import.pastePlaceholder':
		'Wklej tutaj JSON odpowiedzi fetch (albo użyj wgrywania HAR poniżej)',
	'catalog.import.harLabel': 'Plik HAR',
	'catalog.empty.title': 'Nie zaimportowano jeszcze katalogu.',
	'catalog.empty.hint':
		'Wspólny gist katalogu jest pusty. Jeśli jesteś właścicielem gistu, otwórz Admin i zaimportuj dane ETF brokera, aby go wypełnić.',
	'catalog.empty.adminImportLink': 'Otwórz import ETF w panelu Admin',
	'catalog.filter.assetType': 'Typ aktywów',
	'catalog.filter.allTypes': 'Wszystkie typy',
	'catalog.filter.search': 'Szukaj',
	'catalog.filter.searchPlaceholder': 'Ticker, nazwa lub opis…',
	'catalog.filter.submit': 'Filtruj',
	'catalog.filter.clear': 'Wyczyść',
	'catalog.filter.risk': 'Ryzyko',
	'catalog.filter.allRisks': 'Wszystkie poziomy ryzyka',
	'catalog.riskBand.low': 'niskie',
	'catalog.riskBand.medium': 'średnie',
	'catalog.riskBand.high': 'wysokie',
	'catalog.count.showing': 'Wyświetlanie {filtered} z {total} ETF',
	'catalog.count.one': '{n} ETF w katalogu',
	'catalog.count.many': '{n} ETF w katalogu',
	'catalog.holdings.title': 'Twoje pozycje',
	'catalog.holdings.subtitle': 'ETF z tego katalogu, które już posiadasz.',
	'catalog.table.ticker': 'Ticker',
	'catalog.table.name': 'Nazwa',
	'catalog.table.type': 'Typ',
	'catalog.table.risk': 'Ryzyko',
	'catalog.table.description': 'Opis',
	'catalog.table.isin': 'ISIN',
	'catalog.table.value': 'Wartość',
	'catalog.etfDetail.back': 'Wstecz',
	'catalog.etfDetail.pendingBody':
		'Szczegóły ETF są dostępne po akceptacji konta.',
	'catalog.etfDetail.catalogCardTitle': 'Z Twojego katalogu',
	'catalog.etfDetail.analysisTitle': 'Przegląd AI',
	'catalog.etfDetail.loadAnalysisButton': 'Analiza ETF',
	'catalog.etfDetail.field.id': 'ID rekordu',
	'catalog.etfDetail.field.expenseRatio': 'Poziom kosztów',
	'catalog.etfDetail.field.riskKid': 'Ryzyko',
	'catalog.etfDetail.field.region': 'Region',
	'catalog.etfDetail.field.sector': 'Sektor',
	'catalog.etfDetail.field.rateOfReturn': 'Roczna stopa zwrotu',
	'catalog.etfDetail.field.volatility': 'Zmienność',
	'catalog.etfDetail.field.returnRisk': 'Zwrot / ryzyko',
	'catalog.etfDetail.field.fundSize': 'Wielkość funduszu',
	'catalog.etfDetail.field.esg': 'ESG',
	'catalog.etfDetail.esgYes': 'Tak',
	'catalog.etfDetail.esgNo': 'Nie',
	'catalog.emptyCell': '—',
	'catalog.etfTypeUnknown': 'Nieznany',
	'catalog.noMatch': 'Żaden ETF nie pasuje do wyszukiwania.',
	'catalog.section.otherAvailable': 'Inne dostępne ETF',
	'catalog.section.available': 'Dostępne ETF',
	'guidelines.subtitle.savedGist': 'Zapisano w prywatnym gicie GitHub Gist.',
	'guidelines.subtitle.pending':
		'Konto oczekuje na akceptację — wytyczne nie są jeszcze zapisane w GitHubie.',
	'guidelines.subtitle.signIn':
		'Zaloguj się, aby zachować dane między sesjami.',
	'guidelines.tabs.navAria': 'Formularze dodawania wytycznych',
	'guidelines.etfCard.title': 'Cel dla konkretnego ETF',
	'guidelines.etfCard.hint':
		'Wybierz fundusz z katalogu. Kategoria jest ustawiana z wiersza katalogu.',
	'guidelines.etfCard.field.fund': 'Fundusz',
	'guidelines.etfCard.field.targetPct': 'Cel %',
	'guidelines.etfCard.submit': 'Dodaj wytyczną dla ETF',
	'guidelines.bucket.title': 'Wiadro klasy aktywów',
	'guidelines.bucket.hint':
		'Ustal udział portfela dla klasy obecnej w katalogu.',
	'guidelines.bucket.field.class': 'Klasa aktywów',
	'guidelines.bucket.field.targetPct': 'Cel %',
	'guidelines.bucket.submit': 'Dodaj wytyczną dla klasy aktywów',
	'guidelines.footer.beforeLink': 'Zaimportuj lub wklej fundusze na stronie',
	'guidelines.footer.link': 'Katalog ETF',
	'guidelines.footer.after': ', aby wypełnić obie listy.',
	'guidelines.list.title': 'Twoje wytyczne',
	'guidelines.list.totalAllocated': 'Łącznie przydzielono:',
	'guidelines.list.remaining': 'Pozostało:',
	'guidelines.list.empty': 'Nie dodano jeszcze wytycznych.',
	'guidelines.list.kind.assetClass': 'klasa aktywów',
	'guidelines.list.bucketSuffix': '(wiadro)',
	'guidelines.list.remove': 'Usuń',
	'guidelines.list.saveTarget': 'Zapisz',
	'guidelines.list.editTarget': 'Edytuj cel',
	'guidelines.list.cancelEditTarget': 'Anuluj',
	'guidelines.list.targetPctSuffix': '%',
	'guidelines.list.targetPctLabel': 'Cel procentowy dla {label}',
	'guidelines.list.shareBarAria': 'Cel {percent}% portfela dla {label}',
	'guidelines.list.deleteAria.instrument': 'Usuń wytyczną dla {name}',
	'guidelines.list.deleteAria.bucket': 'Usuń wytyczną wiadra dla {label}',
	'guidelines.list.deleteConfirm': 'Usunąć wytyczną dla {label}?',
	'guidelines.list.deleteCancel': 'Anuluj',
	'advice.pending.title': 'Konto oczekuje na akceptację',
	'advice.pending.body':
		'Zalogowałeś(-łaś) się przez GitHuba, ale ta aplikacja dopuszcza tylko użytkowników z listy. Dodaj swoją nazwę użytkownika GitHuba do pliku',
	'advice.pending.afterPath':
		'w pull requeście. Po scaleniu i wdrożeniu wyloguj się i zaloguj ponownie.',
	'advice.tabs.navAria': 'Sekcje porad',
	'advice.tab.hint.buyNext':
		'Podaj gotówkę do zainwestowania (najlepiej w tej samej walucie co pozycje). Propozycje dotyczą tylko kupna — bez sprzedaży.',
	'advice.tab.hint.portfolioReview':
		'Jakościowa ocena balansu i ryzyka względem katalogu i wytycznych.',
	'advice.form.field.cash': 'Dostępna gotówka',
	'advice.form.field.currency': 'Waluta',
	'advice.form.field.model': 'Model',
	'advice.form.placeholder.cash': 'np. 1000',
	'advice.form.submit': 'Zapytaj AI',
	'advice.form.submitPortfolioRegenerate': 'Wygeneruj analizę ponownie',
	'advice.portfolioReview.clearStored': 'Wyczyść zapisaną analizę',
	'advice.analysisMode.buy_next': 'Co kupić następnym razem',
	'advice.analysisMode.portfolio_review': 'Przegląd kondycji portfela',
	'advice.result.title': 'Porada inwestycyjna',
	'advice.result.titleReview': 'Przegląd portfela',
	'advice.result.subtitle':
		'Na podstawie portfela i dostępnych {amount} {currency}.',
	'advice.result.subtitleReviewGuidelinesOnly':
		'Na podstawie bieżących pozycji ETF, katalogu i wytycznych.',
	'advice.restore.fromGistNotice':
		'Pokazuję ostatnio zapisaną analizę z gistu danych (zapis {savedAt}). Uruchom „Zapytaj AI” ponownie po zmianie pozycji lub gotówki.',
	'advice.persistFailed.notice':
		'Nie udało się zapisać tej analizy w gicie danych. Wynik poniżej dotyczy tylko tej wizyty; odświeżenie może go utracić, dopóki zapis nie zadziała ponownie.',
	'advice.table.empty': 'Brak konkretnych propozycji ETF w tej odpowiedzi.',
	'advice.table.caption': 'Proponowane inwestycje w ETF',
	'advice.table.fund': 'Fundusz',
	'advice.table.ticker': 'Ticker',
	'advice.table.amount': 'Kwota',
	'advice.table.currency': 'Waluta',
	'advice.table.note': 'Uwaga',
	'advice.table.fundLinkAria': 'Otwórz szczegóły ETF: {name}',
	'advice.capital.title': 'Miks portfela',
	'advice.capital.snapshotError':
		'Nie można pokazać migawki portfela, bo dane z modelu były niespójne (np. pomieszane waluty lub nieprawidłowe kwoty).',
	'advice.capital.srOnly':
		'Wykres warstwowy: udział bieżących pozycji ETF względem gotówki przed nowymi zakupami.',
	'advice.capital.ariaBar':
		'Udział pozycji i gotówki w łącznych {total} (ta sama waluta).',
	'advice.capital.segmentTitle': '{label}: {amount} {currency}',
	'advice.guideline.defaultCaption': 'Zgodność z wytycznymi',
	'advice.guideline.emptyRows':
		'Brak wierszy porównania z wytycznymi w tej odpowiedzi.',
	'advice.guideline.legend':
		'Pełny pasek: bieżąca waga portfela. Jaśniejszy pasek z tyłu: po proponowanych zakupach (gdy pokazane). Pionowa linia: cel.',
	'advice.guideline.ariaSummary':
		'Teraz {current}, cel {target}{postBuyClause}.',
	'advice.guideline.afterProposedBuys': ', po proponowanych zakupach {post}',
	'advice.model.gpt-5.5': 'GPT-5.5',
	'advice.model.gpt-5.4-mini': 'GPT-5.4 Mini',
	'advice.model.gpt-5.4-nano': 'GPT-5.4 Nano',
	'advice.model.gpt-5.4': 'GPT-5.4',
	'errors.portfolio.addInvalid':
		'Wybierz operację (kupno lub sprzedaż), fundusz z katalogu i podaj prawidłową wartość (przy sprzedaży musi być większa od 0).',
	'errors.portfolio.catalogEntryMissing':
		'Nie znaleziono wybranego wpisu katalogu. Zaktualizuj katalog lub wybierz inny fundusz.',
	'errors.portfolio.sellNoHolding':
		'Nie masz jeszcze tego funduszu w tej walucie — użyj kupna, aby go dodać.',
	'errors.portfolio.sellExceedsHoldings':
		'Ta kwota przekracza wartość bieżącej pozycji.',
	'errors.portfolio.sellValueNotPositive':
		'Podaj kwotę większą od zera przy sprzedaży.',
	'errors.portfolio.persistence':
		'Nie udało się zapisać portfela. Spróbuj ponownie za chwilę.',
	'errors.upload.fileTooLarge':
		'Przesłany plik jest za duży. Maksymalny rozmiar to 5 MB.',
	'errors.catalog.importNotAllowed':
		'Tylko właściciel wspólnego gistu katalogu może importować aktualizacje.',
	'errors.catalog.import.fieldMissing':
		'Wklej JSON API banku lub wybierz plik HAR, a następnie spróbuj ponownie.',
	'errors.catalog.import.emptyJson':
		'Wklejka jest pusta. Wklej pełną odpowiedź JSON API (obiekt z tablicą „data” funduszy), a potem kliknij Importuj.',
	'errors.catalog.import.invalidJson':
		'Ten tekst nie jest poprawnym JSON-em. Skopiuj pełne ciało odpowiedzi z zakładki sieciowej przeglądarki i spróbuj ponownie.',
	'errors.catalog.import.invalidHar':
		'Ten plik nie jest poprawnym eksportem HAR albo nie zawiera użytecznych odpowiedzi API skanera ETF.',
	'errors.catalog.import.noRowsParsed':
		'Nie odczytano żadnych wierszy ETF z tego JSON. Oczekiwany jest obiekt z tablicą „data”; każdy element potrzebuje ticker i fund_name (zwykle zgodnie z API brokera).',
	'errors.catalog.import.diagnostic.savedLead':
		'Katalog zapisano. Scalono {appliedCount} wiersz(y) z tej wklejki.',
	'errors.catalog.import.diagnostic.nothingSavedLead':
		'Nic nie zapisano z tej wklejki.',
	'errors.catalog.import.diagnostic.skippedHeading': 'Pominięte wiersze:',
	'errors.catalog.import.diagnostic.notesHeading': 'Uwagi:',
	'errors.catalog.import.diagnostic.notesSummaryMany':
		'{count} wiersz(y) odświeżyło istniejące linie katalogu (ten sam ISIN i ticker); pola z importu zostały scalone.',
	'errors.catalog.import.diagnostic.flashTruncated':
		'(Wiadomość została skrócona z powodu limitu rozmiaru ciasteczka sesji.)',
	'errors.catalog.import.issue.expectedObject':
		'JSON musi być obiektem z tablicą „data” funduszy.',
	'errors.catalog.import.issue.dataNotArray':
		'Właściwość „data” musi być tablicą obiektów funduszy.',
	'errors.catalog.import.issue.rowNotObject':
		'Element nie jest obiektem — pominięto.',
	'errors.catalog.import.issue.missingTicker': 'Brak tickera.',
	'errors.catalog.import.issue.missingFundName': 'Brak fund_name.',
	'errors.catalog.import.issue.isinInvalid':
		'ISIN jest obecny, ale nieprawidłowy (oczekiwany format 12 znaków).',
	'errors.catalog.import.issue.duplicateIdInPaste':
		'Zduplikowane id „{id}” w tej wklejce (konflikt z wierszem {otherIndex}).',
	'errors.catalog.import.issue.duplicateMergeKeyInPaste':
		'Ten sam klucz katalogu co wiersz {otherIndex} (zduplikowany ISIN + ticker w tej wklejce).',
	'errors.catalog.import.issue.alreadyInCatalog':
		'Ten wiersz pasuje do istniejącego wiersza katalogu (ten sam ISIN i ticker); wiersz został zaktualizowany z tej wklejki.',
	'errors.catalog.import.issue.idAlreadyInCatalog':
		'Fundusz o id „{id}” już istnieje w katalogu; pola z importu zostały scalone do tego wiersza.',
	'errors.catalog.import.dataArrayEmpty':
		'Wklejony JSON ma pustą tablicę „data” — brak funduszy do importu.',
	'errors.catalog.import.saveFailed':
		'Nie udało się zapisać katalogu w GitHubie. Sprawdź połączenie i uprawnienia, a następnie spróbuj ponownie.',
	'errors.catalog.etfDetail.service':
		'Nie udało się teraz wczytać opisu tego ETF. Spróbuj ponownie za chwilę.',
	'errors.catalog.etfDetail.notFound': 'Nie znaleziono tego wpisu katalogu.',
	'errors.catalog.etfDetail.pendingAnalysis':
		'Analiza ETF jest dostępna po akceptacji konta.',
	'errors.guidelines.totalExceeds100':
		'Suma celów wytycznych nie może przekraczać 100%. Masz już przydzielone {current}%; dodanie {added}% przekroczyłoby limit.',
	'errors.guidelines.updateTotalExceeds100':
		'Suma celów wytycznych nie może przekraczać 100%. Ustawienie tej linii na {newTargetPercent}% dałoby sumę {total}%.',
	'errors.guidelines.targetPctInvalid':
		'Podaj cel procentowy między 0,01 a 100.',
	'errors.guidelines.duplicateInstrument':
		'Masz już wytyczną dla {ticker}. Aby ją zmienić, edytuj lub usuń ten wiersz — nie można dodać drugiej wytycznej dla tego samego funduszu.',
	'errors.guidelines.duplicateAssetClass':
		'Masz już wytyczną dla klasy aktywów {label}. Aby ją zmienić, edytuj lub usuń ten wiersz — nie można dodać drugiej wytycznej wiadra dla tej samej klasy.',
	'errors.guidelines.addFormInvalid':
		'Sprawdź fundusz lub wiadro, cel procentowy i spróbuj ponownie.',
	'errors.guidelines.catalogEntryStale':
		'Ten fundusz nie jest już w katalogu. Odśwież stronę i wybierz fundusz z listy.',
	'errors.guidelines.assetClassStale':
		'Ta klasa aktywów nie jest już dostępna. Odśwież stronę i wybierz z listy.',
	'errors.advice.formRead':
		'Nie udało się odczytać formularza. Spróbuj ponownie.',
	'errors.advice.formReadDetail':
		'Serwer nie otrzymał danych formularza, które da się sparsować dla tego żądania.',
	'errors.advice.validation': 'Sprawdź formularz i spróbuj ponownie.',
	'errors.advice.buyNextCashRequired':
		'Podaj kwotę gotówki planowaną do inwestycji w sekcji „Co kupić następnym razem”.',
	'errors.advice.notApproved':
		'Twoje konto nie jest jeszcze zaakceptowane. Nie możesz prosić o porady, dopóki nazwa użytkownika GitHuba nie zostanie dodana do app/lib/approved-github-logins.ts i wdrożona.',
	'errors.advice.requiresGithubGist':
		'Porady AI korzystają z portfela i wytycznych z prywatnego gistu GitHub. Zaloguj się przez GitHuba i skonfiguruj gist danych na stronie Portfel przed uruchomieniem analizy.',
	'advice.requiresGist.title': 'Zaloguj się, aby uruchomić porady AI',
	'advice.requiresGist.bodySignIn':
		'Porady są generowane z zapisanego portfela i wytycznych. Użyj „Zaloguj przez GitHuba” w nagłówku, potem otwórz Portfel, aby utworzyć lub połączyć prywatny gist.',
	'advice.requiresGist.bodyConnectGist':
		'Otwórz stronę Portfel, aby utworzyć lub połączyć prywatny gist danych. Potem możesz uruchomić przegląd portfela i analizę „co kupić” tutaj.',
	'advice.requiresGist.linkSignIn': 'Zaloguj przez GitHuba',
	'advice.requiresGist.linkPortfolio': 'Otwórz Portfel',

	'advice.context.pageHeading': 'Eksport kontekstu (Markdown + JSON katalogu)',
	'advice.context.lead':
		'Angielski Markdown portfela i wytycznych oraz osobna tablica JSON z pełnym katalogiem ETF aplikacji (posortowana po tickerze). W Markdownie odwołuj się do obiektów JSON po polach `catalog_id` / `catalog_ticker`. W innym narzędziu dopisz własne instrukcje.',
	'advice.context.privacyNote':
		'Ta strona zawiera dane finansowe. Wklejaj je tylko do usług, którym ufasz.',
	'advice.context.backToAdvice': 'Wróć do Porad',
	'advice.context.markdownLabel': 'Markdown (portfel i wytyczne)',
	'advice.context.catalogJsonLabel': 'Katalog ETF (tablica JSON)',
	'advice.context.copyMarkdown': 'Kopiuj Markdown',
	'advice.context.copyCatalogJson': 'Kopiuj JSON katalogu',
	'advice.context.copyBoth': 'Kopiuj Markdown i JSON',
	'advice.context.snapshotError':
		'Nie udało się wczytać zapisanego portfela lub wytycznych z GitHuba. Do czasu naprawy persystencji eksport jest pusty.',
	'advice.context.linkFromAdvice':
		'Eksport kontekstu Markdown dla innych narzędzi AI',

	'errors.advice.service':
		'Nie udało się teraz uzyskać porady. Spróbuj ponownie za chwilę.',
	'client.formSubmit.genericError': 'Sprawdź wprowadzone dane.',
	'client.adviceContext.copySuccess': 'Skopiowano do schowka.',
	'client.adviceContext.copyFailed':
		'Automatyczne kopiowanie nie powiodło się. Tekst jest zaznaczony — naciśnij Ctrl+C (⌘C na Macu).',
} as const satisfies Record<MessageKey, string>
