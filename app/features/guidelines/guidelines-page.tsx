import type { Handle } from 'remix/component'
import {
	NumberInput,
	SelectInput,
	SubmitButton,
	TextInput,
} from '../../components/index.ts'
import { SessionProvider } from '../../components/session-provider.tsx'
import type { EtfGuideline } from '../../lib/guidelines.ts'
import { ETF_TYPES } from '../../lib/guidelines.ts'
import { routes } from '../../routes.ts'
import { GuidelinesListFragment } from './guidelines-list-fragment.tsx'

type GuidelinesPageProps = {
	guidelines: EtfGuideline[]
}

export function GuidelinesPage(handle: Handle, _setup?: unknown) {
	return (props: GuidelinesPageProps) => {
		const session = handle.context.get(SessionProvider)?.session ?? null

		return (
			<main class="mx-auto max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm">
				<header>
					<h1 class="text-2xl font-bold tracking-tight text-card-foreground">
						Investment Guidelines
					</h1>
					<p class="mt-1 text-sm text-muted-foreground">
						Set your target allocation.{' '}
						{session
							? 'Saved to your private GitHub Gist.'
							: 'Sign in to persist across sessions.'}
					</p>
				</header>

				<form
					method="post"
					action={routes.guidelines.action.href()}
					class="mt-6 grid gap-4"
					data-fetch-submit
					data-fragment-id="guidelines-list"
					data-fragment-url="/fragments/guidelines-list"
				>
					<TextInput
						id="etfName"
						label="ETF / Asset Name"
						fieldName="etfName"
						placeholder="e.g. VTI"
						required={true}
					/>
					<div class="grid grid-cols-2 gap-3">
						<NumberInput
							id="targetPct"
							label="Target %"
							fieldName="targetPct"
							placeholder="e.g. 60"
							required={true}
							min={1}
							max={100}
							step="0.1"
						/>
						<SelectInput
							id="etfType"
							label="Type"
							fieldName="etfType"
							options={ETF_TYPES.map((t) => ({
								value: t,
								label: t.replace('_', ' '),
							}))}
						/>
					</div>
					<SubmitButton>Add Guideline</SubmitButton>
				</form>

				<div id="guidelines-list">
					<GuidelinesListFragment guidelines={props.guidelines} />
				</div>
			</main>
		)
	}
}
