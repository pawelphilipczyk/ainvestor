/**
 * Turn `FormData` into a plain object for `remix/data-schema` (`parseSafe`, etc.).
 *
 * `remix/data-schema/form-data` does exist (its `object()`/`field()` parse a
 * `FormData` directly), but every call site here runs app-specific
 * normalization on a plain object before validation — locale-decimal
 * parsing, defaulting blank fields to `undefined`, mapping raw multi-field
 * combinations — and the schema-first API has no hook for that pre-validation
 * step. Tried against this codebase and it doesn't fit (Reason 3, see
 * `docs/REMIX_RC_MIGRATION_PLAN.md`); this helper's job — producing the plain
 * object the normalization functions mutate — stays. Remix documents the
 * conversion itself as `Object.fromEntries(formData)`; this only centralizes
 * the cast where TypeScript's `FormData` iterator typing is awkward.
 */
export function objectFromFormData(form: FormData): Record<string, unknown> {
	return Object.fromEntries(
		form as unknown as Iterable<[string, FormDataEntryValue]>,
	)
}
