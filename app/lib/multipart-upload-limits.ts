/**
 * Multipart limits for `remix/form-data-middleware` (must match catalog upload checks).
 * Remix defaults to 2 MiB per file — too small for DevTools HAR exports.
 */
export const MULTIPART_MAX_FILE_BYTES = 5 * 1024 * 1024

/**
 * Aggregate multipart body cap (Remix default formula: `maxFiles * maxFileSize + 1 MiB`).
 * @see `@remix-run/form-data-parser` parseFormData defaults
 */
export const MULTIPART_MAX_TOTAL_BYTES =
	MULTIPART_MAX_FILE_BYTES * 20 + 1024 * 1024
