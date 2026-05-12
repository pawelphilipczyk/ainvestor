import type { Handle, RemixNode } from 'remix/ui'
import type { SectionIntroPage } from '../../lib/section-intros.ts'
import { Card } from './card.tsx'

const transitionName = (page: SectionIntroPage) => `section-${page}`

export type SectionIntroCardProps =
	| {
			page: SectionIntroPage
			title: string
			description: string
			children?: RemixNode
			variant: 'home-link'
			href: string
	  }
	| {
			page: SectionIntroPage
			title: string
			description: string
			children?: RemixNode
			variant: 'page'
	  }

/**
 * Shared intro surface for home grid links and each section's top card.
 * `view-transition-name` pairs with cross-document View Transitions (see baseCss).
 */
export function SectionIntroCard(handle: Handle<SectionIntroCardProps>) {
	return () => {
		const viewTransitionStyle = {
			viewTransitionName: transitionName(handle.props.page),
		}
		const header = (
			<header>
				{handle.props.variant === 'page' ? (
					<h1 class="text-2xl font-bold tracking-tight text-card-foreground">
						{handle.props.title}
					</h1>
				) : (
					<h2 class="text-lg font-semibold tracking-tight text-card-foreground">
						{handle.props.title}
					</h2>
				)}
				<p
					class={
						handle.props.variant === 'page'
							? 'mt-1 text-sm text-muted-foreground'
							: 'mt-2 text-sm leading-relaxed text-muted-foreground'
					}
				>
					{handle.props.description}
				</p>
				{handle.props.children}
			</header>
		)

		if (handle.props.variant === 'home-link') {
			return (
				<a
					href={handle.props.href}
					rmx-document
					class="group block rounded-xl no-underline outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
				>
					<Card
						style={viewTransitionStyle}
						class="flex h-full min-h-[7.5rem] flex-col justify-center p-6 transition-colors group-hover:border-ring/60 group-hover:bg-accent/5"
					>
						{header}
					</Card>
				</a>
			)
		}

		return (
			<Card style={viewTransitionStyle} class="p-6">
				{header}
			</Card>
		)
	}
}
