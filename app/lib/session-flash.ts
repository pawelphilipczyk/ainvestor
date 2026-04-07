import type { Session } from 'remix/session'

export type FlashBannerTone = 'error' | 'info' | 'success'

export type FlashedBanner = {
	text: string
	tone: FlashBannerTone
}

const MESSAGE_KEY = 'message'
const TONE_KEY = 'messageTone'

/** Flash a banner for the next request (cookie session — keep text short). */
export function flashBanner(
	session: Session,
	params: { text: string; tone: FlashBannerTone },
): void {
	session.flash(MESSAGE_KEY, params.text)
	session.flash(TONE_KEY, params.tone)
}

/** Read flashed banner after session middleware hydration; supports legacy `error` key. */
export function readFlashedBanner(session: Session): FlashedBanner | undefined {
	const legacy = session.get('error') as string | undefined
	if (legacy !== undefined && legacy.length > 0) {
		return { text: legacy, tone: 'error' }
	}
	const text = session.get(MESSAGE_KEY) as string | undefined
	if (text === undefined || text.length === 0) return undefined
	const rawTone = session.get(TONE_KEY) as FlashBannerTone | undefined
	const tone =
		rawTone === 'error' || rawTone === 'info' || rawTone === 'success'
			? rawTone
			: 'info'
	return { text, tone }
}
