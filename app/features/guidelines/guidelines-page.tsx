import type { Handle } from 'remix/component'
import {
	FieldLabel,
	NumberInput,
	SelectInput,
	SubmitButton,
	TextInput,
} from '../../components/index.ts'
import { SessionProvider } from '../../components/session-provider.tsx'
import type { EtfGuideline, EtfType } from '../../lib/guidelines.ts'
import { ETF_TYPES, formatEtfTypeLabel } from '../../lib/guidelines.ts'
import { routes } from '../../routes.ts'
import { GuidelinesListFragment } from './guidelines-list-fragment.tsx'

type GuidelinesPageProps = {
	guidelines: EtfGuideline[]
	assetClassOptions: { value: EtfType; label: string }[]
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
					data-reset-form
				>
					<div class="grid gap-2">
						<FieldLabel fieldId="kind">Target kind</FieldLabel>
						<SelectInput
							id="kind"
							name="kind"
							options={[
								{ value: 'instrument', label: 'Specific ETF' },
								{ value: 'asset_class', label: 'Asset class bucket' },
							]}
						/>
					</div>
					<div class="grid gap-2">
						<FieldLabel fieldId="etfName">
							Fund / ticker (for specific ETF only)
						</FieldLabel>
						<TextInput
							id="etfName"
							name="etfName"
							placeholder="e.g. VTI — leave blank for asset-class only"
							autocomplete="off"
						/>
						<p class="text-xs text-muted-foreground">
							Asset-class rows set a target share for the whole category;
							specific ETF rows name a fund you want at a given weight.
						</p>
					</div>
					<div class="grid gap-2">
						<FieldLabel fieldId="assetClassType">
							Asset class (from your catalog)
						</FieldLabel>
						<SelectInput
							id="assetClassType"
							name="assetClassType"
							options={props.assetClassOptions}
						/>
						<p class="text-xs text-muted-foreground">
							Options are the fund types present in your ETF catalog. Import or
							paste funds on the{' '}
							<a
								href={routes.catalog.index.href()}
								class="font-medium text-primary underline underline-offset-2"
							>
								ETF Catalog
							</a>{' '}
							page to populate this list.
						</p>
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div class="grid gap-2">
							<FieldLabel fieldId="targetPct">Target %</FieldLabel>
							<NumberInput
								id="targetPct"
								name="targetPct"
								placeholder="e.g. 60"
								required={true}
								min={1}
								max={100}
								step="0.1"
							/>
						</div>
						<div class="grid gap-2">
							<FieldLabel fieldId="etfType">
								ETF category (specific funds)
							</FieldLabel>
							<SelectInput
								id="etfType"
								name="etfType"
								options={ETF_TYPES.map((t) => ({
									value: t,
									label: formatEtfTypeLabel(t),
								}))}
							/>
						</div>
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
