import type { Handle } from 'remix/ui'
import {
	AdviceResultCard,
	type AdviceResultCardProps,
	type FormError,
	FormErrorAlert,
} from './advice-page.tsx'

export type AdviceResultFragmentProps = {
	/** Set when the last submission failed — rendered instead of `card`. */
	error?: FormError
	/** Set when there is a result to show for the current tab. */
	card?: AdviceResultCardProps
}

/**
 * Content of the `advice-result` Frame — either the error from the run/clear
 * that just happened (validation, pending-approval, gist-required, upstream
 * service failure) or the analysis result. Shared by the frame's initial SSR
 * content, its GET fragment route (`advice.fragmentResult`), and native
 * `data-rmx-target` POST responses (`advice.action`) so all three render the
 * same markup — see `docs/UI_ARCHITECTURE_GUIDELINES.md` §10. Neither prop
 * set (nothing to show yet, or after a successful `clear`) is handled by the
 * caller returning a plain 204 rather than rendering this component at all,
 * matching `advice.fragmentResult`'s existing contract.
 */
export function AdviceResultFragment(
	handle: Handle<AdviceResultFragmentProps>,
) {
	return () => {
		const { error, card } = handle.props
		if (error !== undefined) return <FormErrorAlert error={error} />
		if (card !== undefined) return <AdviceResultCard {...card} />
		return <span hidden aria-hidden="true" />
	}
}
