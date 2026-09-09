import type { Handle, RemixNode } from 'remix/ui'

const variantClasses = {
	default: 'bg-card',
	muted: 'bg-muted/20',
} as const

export type CardVariant = keyof typeof variantClasses
type CardElement = 'article' | 'details' | 'div' | 'li' | 'section'

export type CardProps = {
	as?: CardElement
	children?: RemixNode
	variant?: CardVariant
	class?: string
	[key: string]: unknown
}

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
export function Card(handle: Handle<CardProps>) {
	return () => {
		const { as, children, variant, class: className, ...rest } = handle.props
		const Tag = as ?? 'section'
		return (
			<Tag
				{...rest}
				class={getCardClassNames({
					variant: variant,
					className: className,
				})}
			>
				{children}
			</Tag>
		)
	}
}
