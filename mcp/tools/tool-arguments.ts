/** A tool argument that is present, a non-empty string once trimmed, or absent. */
export function readStringArgument(
	toolArguments: Record<string, unknown>,
	name: string,
): string | null {
	const value = toolArguments[name]
	if (typeof value !== 'string') return null
	const trimmed = value.trim()
	return trimmed.length > 0 ? trimmed : null
}
