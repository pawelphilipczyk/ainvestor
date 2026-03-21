import type { CatalogEntry } from './lib.ts'

let guestCatalog: CatalogEntry[] = []

export function resetGuestCatalog() {
	guestCatalog = []
}

export function getGuestCatalog(): CatalogEntry[] {
	return guestCatalog
}

export function setGuestCatalog(entries: CatalogEntry[]) {
	guestCatalog = entries
}
