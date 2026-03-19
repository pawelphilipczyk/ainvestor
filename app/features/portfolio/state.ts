import type { EtfEntry } from '../../lib/gist.ts'

/** Guest ETF entries when not authenticated. Shared by portfolio and add-etf-form. */
export let guestEntries: EtfEntry[] = []

export function resetEtfEntries() {
	guestEntries = []
}

export function getGuestEntries(): EtfEntry[] {
	return guestEntries
}
