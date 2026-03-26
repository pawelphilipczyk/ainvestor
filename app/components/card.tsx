import type { Handle } from 'remix/component'

const variantClasses = {
	default: 'bg-card',
	muted: 'bg-muted/20',
} as const

export type CardVariant = keyof typeof variantClasses
type CardElement = 'article' | 'details' | 'div' | 'li' | 'section'

export function getCardClassNames(props?: {
	variant?: CardVariant
	className?: string
}) {
	const variant = props?.variant ?? 'default'
	return `rounded-xl border border-border shadow-sm ${variantClasses[variant]} ${props?.className ?? ''}`.trim()
}

/**
 * Shared surface wrapper for page intro, form, and content sections.
 * Layout and semantics stay with the parent; only the surface styling is shared.
 */
export function Card(_handle: Handle, _setup?: unknown) {
	return (props: {
		as?: CardElement
		children?: unknown
		variant?: CardVariant
		class?: string
		id?: string
		role?: string
		'aria-labelledby'?: string
		'aria-live'?: 'polite' | 'assertive' | 'off'
	}) => {
		const Tag = props.as ?? 'section'
		return (
			<Tag
				id={props.id}
				role={props.role}
				aria-labelledby={props['aria-labelledby']}
				aria-live={props['aria-live']}
				class={getCardClassNames({
					variant: props.variant,
					className: props.class,
				})}
			>
				{props.children}
			</Tag>
		)
	}
}
