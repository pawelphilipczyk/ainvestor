/**
 * Shared Tailwind class strings for form controls so feature pages and
 * `app/components/*Input` stay aligned.
 */

/** Visible label stacked above TextInput / NumberInput / SelectInput. */
export const FORM_LABEL_CLASS =
	'mb-1 block text-sm font-semibold text-foreground'

/**
 * Default text-like controls: text, number, search, textarea — full width,
 * comfortable vertical padding.
 */
export const FORM_CONTROL_CLASS =
	'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Single-line controls in compact toolbars (e.g. catalog filter row next to h-9 buttons).
 */
export const FORM_CONTROL_COMPACT_CLASS =
	'h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Appended to {@link FORM_CONTROL_CLASS} for native `<select>` styling. */
export const FORM_SELECT_DECORATION_CLASS =
	"cursor-pointer appearance-none bg-no-repeat pr-8 [background-image:url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%226b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%2F%3E%3C%2Fsvg%3E')] [background-position:right_0.5rem_center] [background-size:1.25rem]"
