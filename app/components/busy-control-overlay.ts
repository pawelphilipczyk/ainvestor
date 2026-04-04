/**
 * Shared loading UI: label hidden and centered spinner when `data-loading` is set
 * (see `submit-button-loading.component.js`, used by fetch-submit and feature forms).
 *
 * `busy-control-root` / `busy-control-label` / `busy-control-overlay` pair with rules in
 * `document-styles.ts` so the CDN Tailwind build always shows the overlay (JIT often skips
 * `group-data-[loading]:*` when classes are composed from this module alone).
 */
export const busyControlRootStateClasses = 'relative group busy-control-root'

export const busyControlLabelClass = 'relative z-10 busy-control-label'

/** Marker for submit busy overlay: prefer `data-loading` over legacy innerHTML swap. */
export const busyControlOverlayClass =
	'submit-button-busy-overlay busy-control-overlay absolute inset-0'

export const busyControlSpinnerClass =
	'h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent'
