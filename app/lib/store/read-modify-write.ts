/**
 * The read-change-save loop behind every edit of a shared file, with
 * compare-and-swap.
 *
 * Every edit here is relative to what the file holds (buy adds to a holding,
 * remove drops a row by id), so when another client saved in between — which
 * the store reports as a version conflict — the right answer is to read again
 * and redo the change on the new content, not to fail. Only after
 * {@link MAX_WRITE_ATTEMPTS} conflicts in a row does the caller hear about it.
 *
 * A timeout or a 5xx is *not* retried: the write may have landed, and a second
 * attempt would apply a buy twice.
 */

/** How many times a change is tried against fresh content before giving up. */
export const MAX_WRITE_ATTEMPTS = 3

/**
 * Pause before attempt `n + 1`, `n` times this. A real race resolves on the
 * next read either way; the pause is for a read that briefly still shows the
 * file as it was before a save that just landed, which would otherwise look
 * like another conflict.
 */
const RETRY_PAUSE_MS = 100
let retryPauseMs = RETRY_PAUSE_MS

/** Test seam: shorten (or restore, with `null`) the pause between attempts. */
export function setRetryPauseForTests(milliseconds: number | null): void {
	retryPauseMs = milliseconds ?? RETRY_PAUSE_MS
}

/** The file kept changing underneath every attempt; nothing was saved. */
export class WriteConflictError extends Error {
	constructor(what: string) {
		super(`${what} was changed elsewhere while this was being saved`)
		this.name = 'WriteConflictError'
	}
}

/** What a change decides after seeing the file's current content. */
export type ChangeOutcome<TValue, TResult> =
	| { write: TValue; message: string; result: TResult }
	/** Nothing to save — a refusal, or a no-op. */
	| { result: TResult }

export async function readModifyWrite<TValue, TResult>(params: {
	/** What is being edited, for the conflict message: `the portfolio`. */
	what: string
	/** Reads the current content and its version (`null` for an absent file). */
	read: () => Promise<{ value: TValue; version: string | null }>
	/** Decides the edit from fresh content. Runs again on each attempt, so it must not have side effects. */
	change: (value: TValue) => ChangeOutcome<TValue, TResult>
	/** Saves only if the file still has `version`; throws {@link WriteConflictError} when it does not. */
	write: (params: {
		value: TValue
		version: string | null
		message: string
	}) => Promise<void>
}): Promise<TResult> {
	for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
		const { value, version } = await params.read()
		const outcome = params.change(value)
		if (!('write' in outcome)) return outcome.result
		try {
			await params.write({
				value: outcome.write,
				version,
				message: outcome.message,
			})
			return outcome.result
		} catch (error) {
			if (!(error instanceof WriteConflictError)) throw error
		}
		if (attempt < MAX_WRITE_ATTEMPTS) {
			await new Promise((resolve) =>
				setTimeout(resolve, retryPauseMs * attempt),
			)
		}
	}
	throw new WriteConflictError(params.what)
}
