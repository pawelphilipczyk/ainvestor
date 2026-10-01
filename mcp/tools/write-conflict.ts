import { WriteConflictError } from '../../app/lib/store/read-modify-write.ts'

/**
 * Runs a tool's edit and, when the file kept changing underneath every attempt
 * (see {@link WriteConflictError}), answers in terms the model can act on:
 * nothing was saved, so read again and retry. `readTool` names the tool that
 * shows the current state.
 */
export async function withConflictAdvice<TResult>(
	readTool: string,
	run: () => Promise<TResult>,
): Promise<TResult> {
	try {
		return await run()
	} catch (error) {
		if (error instanceof WriteConflictError) {
			throw new Error(
				`${error.message}, so nothing was saved. Call ${readTool} for the current state and try again.`,
			)
		}
		throw error
	}
}
