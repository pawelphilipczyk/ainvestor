/**
 * Shared vertical sizing for native form controls so inputs, selects, and
 * primary actions share the same height at each density tier.
 */
export const formControlHeightDefault = 'h-10 min-h-10'

export const formControlHeightCompact = 'h-9 min-h-9'

const borderedFieldShell =
	'rounded-md border border-input bg-background px-3 py-0 text-base text-foreground md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** {@link TextInput} / {@link NumberInput} default (not `compact`). */
export const textNumberControlDefaultClasses = `w-full ${formControlHeightDefault} ${borderedFieldShell} placeholder:text-muted-foreground`

/** {@link TextInput} when `compact` is true (e.g. filter toolbars). */
export const textNumberControlCompactClasses = `w-full ${formControlHeightCompact} ${borderedFieldShell} placeholder:text-muted-foreground`

/** {@link SelectInput} default; chevron spacing is composed in the component. */
export const selectControlDefaultClasses = `w-full ${formControlHeightDefault} ${borderedFieldShell}`

/** {@link SelectInput} when `compact` is true. */
export const selectControlCompactClasses = `w-full ${formControlHeightCompact} ${borderedFieldShell}`

/** {@link SubmitButton} default (full-width primary submit). */
export const submitButtonDefaultClasses = `inline-flex ${formControlHeightDefault} w-full items-center justify-center rounded-md bg-primary px-4 py-0 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none [&:disabled:not([aria-busy='true'])]:opacity-50`

/** {@link SubmitButton} when `compact` is true (inline with compact fields). */
export const submitButtonCompactClasses = `inline-flex ${formControlHeightCompact} w-full items-center justify-center rounded-md bg-primary px-3 py-0 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none [&:disabled:not([aria-busy='true'])]:opacity-50`
