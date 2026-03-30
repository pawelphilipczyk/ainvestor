/**
 * Shared loading UI: label hidden and centered spinner when `data-loading` is set
 * (see `navigation-link-loading.component.js` and fetch-submit `setSubmitButtonLoading`).
 */
export const busyControlRootStateClasses =
	'relative group data-[loading]:pointer-events-none data-[loading]:opacity-90'

export const busyControlLabelClass =
	'relative z-10 group-data-[loading]:invisible'

/** Marker for fetch-submit: prefer `data-loading` overlay over legacy innerHTML swap. */
export const busyControlOverlayClass =
	'submit-button-busy-overlay absolute inset-0 hidden items-center justify-center group-data-[loading]:flex'

export const busyControlSpinnerClass =
	'h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent'
