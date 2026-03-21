// Subset of `remix/data-schema/form-data` (Remix main) for text fields only. The published
// `remix@3.0.0-alpha.3` package does not export `remix/data-schema/form-data` yet; this module
// mirrors that API so callers can `import * as f from 'remix/data-schema/form-data'` via
// tsconfig paths until the umbrella package ships the export.
import type { Issue, ParseOptions, Schema } from 'remix/data-schema'
import { createIssue, createSchema, fail } from 'remix/data-schema'

export type FormDataSource = FormData | URLSearchParams

export interface FormDataEntrySchema<output> {
	kind: 'field'
	name?: string
	schema: Schema<unknown, output>
}

export interface FormDataFieldOptions {
	name?: string
}

export function field<output>(
	schema: Schema<unknown, output>,
	options?: FormDataFieldOptions,
): FormDataEntrySchema<output> {
	return {
		kind: 'field',
		name: options?.name,
		schema,
	}
}

type FormDataParseResult<output> =
	| { value: output }
	| { issues: ReadonlyArray<Issue> }

type FormDataValidationContext = {
	path: NonNullable<Issue['path']>
	options?: ParseOptions
}

export type ParsedFormData<
	schema extends Record<string, FormDataEntrySchema<unknown>>,
> = {
	[K in keyof schema]: schema[K] extends FormDataEntrySchema<infer out>
		? out
		: never
}

export function object<
	const schema extends Record<string, FormDataEntrySchema<unknown>>,
>(schema: schema): Schema<FormDataSource, ParsedFormData<schema>> {
	return createSchema(function validate(value, context) {
		if (!isFormDataSource(value)) {
			return fail('Expected FormData or URLSearchParams', context.path, {
				code: 'type.form_data_source',
				input: value,
				parseOptions: context.options,
			})
		}

		const abortEarly = shouldAbortEarly(context.options)
		const issues: Issue[] = []
		const output: Partial<ParsedFormData<schema>> = {}

		for (const key of Object.keys(schema) as Array<keyof schema & string>) {
			const entrySchema = schema[key]
			const result = parseField(value, key, entrySchema, context)

			if ('issues' in result) {
				if (abortEarly) {
					return { issues: result.issues }
				}
				issues.push(...result.issues)
				continue
			}

			output[key] = result.value as ParsedFormData<schema>[typeof key]
		}

		if (issues.length > 0) {
			return { issues }
		}

		return { value: output as ParsedFormData<schema> }
	})
}

function parseField(
	formData: FormDataSource,
	key: string,
	entrySchema: FormDataEntrySchema<unknown>,
	context: FormDataValidationContext,
): FormDataParseResult<unknown> {
	const fieldName = entrySchema.name ?? key
	const keyPath = context.path.length === 0 ? [key] : [...context.path, key]

	const value = formData.get(fieldName)

	if (value instanceof Blob) {
		return {
			issues: [createIssue(`Expected text field "${fieldName}"`, keyPath)],
		}
	}

	return validateParsedValue(
		keyPath,
		entrySchema.schema,
		value ?? undefined,
		context.options,
	)
}

function validateParsedValue(
	path: NonNullable<Issue['path']>,
	schema: Schema<unknown, unknown>,
	value: unknown,
	options?: ParseOptions,
): FormDataParseResult<unknown> {
	const result = schema['~run'](value, { path, options })

	if (result.issues) {
		return { issues: result.issues }
	}

	return {
		value: result.value,
	}
}

function shouldAbortEarly(options?: ParseOptions): boolean {
	const libraryAbortEarly = (
		options?.libraryOptions as { abortEarly?: unknown } | undefined
	)?.abortEarly

	return Boolean(options?.abortEarly ?? libraryAbortEarly)
}

function isFormDataSource(value: unknown): value is FormDataSource {
	return value instanceof FormData || value instanceof URLSearchParams
}
