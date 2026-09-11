import {
	parseBankJsonToCatalog,
	setSharedCatalogForTests,
} from '../features/catalog/lib.ts'

/**
 * Seeds the shared ETF catalog for a browser run. The server runs in the same
 * process as the test (see `browser-test.ts`), so the in-process seeding the
 * server-side tests use works here too.
 *
 * Field names follow the bank JSON the catalog importer expects — see
 * `parseBankJsonForImport` in `app/features/catalog/lib.ts`.
 */
export function seedSharedCatalog() {
	setSharedCatalogForTests({
		entries: parseBankJsonToCatalog({
			data: [
				{
					id: 'browser-equity',
					fund_name: 'Browser Test Equity Fund',
					ticker: 'BTEQ',
					assets: 'akcje',
				},
				{
					id: 'browser-bond',
					fund_name: 'Browser Test Bond Fund',
					ticker: 'BTBD',
					assets: 'obligacje',
				},
			],
			count: 2,
		}),
		ownerLogin: 'catalog-admin',
	})
}
