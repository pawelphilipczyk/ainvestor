/**
 * Turn `FormData` into a plain object for `remix/data-schema` (`parseSafe`, etc.).
 * Remix documents this as `Object.fromEntries(formData)` — there is no separate
 * parser in `remix/data-schema`; this helper only centralizes the cast used
 * where TypeScript’s `FormData` iterator typing is awkward.
 */
export function objectFromFormData(form: FormData): Record<string, unknown> {
	return Object.fromEntries(
		form as unknown as Iterable<[string, FormDataEntryValue]>,
	)
}
