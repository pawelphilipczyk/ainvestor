import type { Handle } from 'remix/ui'
import {
	selectControlCompactClasses,
	selectControlDefaultClasses,
} from './form-control-classes.ts'

const selectWithChevronClasses = 'cursor-pointer appearance-none pr-10'

/** Mirrors `<select>` attributes; `options` replaces `<option>` children. */
export type SelectInputProps = {
	id: string
	name: string
	options: { value: string; label: string; selected?: boolean }[]
	disabled?: boolean
	form?: string
	value?: string | number
	multiple?: boolean
	required?: boolean
	size?: number
	/** Layout density; matches {@link TextInput} `compact`. */
	compact?: boolean
	class?: string
}

/**
 * Server-rendered select (label is composed separately).
 */
export function SelectInput(handle: Handle<SelectInputProps>) {
	return () => {
		const {
			class: classProp,
			compact: compactProp,
			options,
			id,
			name,
			disabled,
			form,
			value,
			multiple,
			required,
			size,
		} = handle.props
		const shellClasses = compactProp
			? selectControlCompactClasses
			: selectControlDefaultClasses
		const selectClasses =
			`${shellClasses} ${selectWithChevronClasses} ${classProp ?? ''}`.trim()
		const isControlledSelect = value !== undefined
		return (
			<div class="relative w-full">
				<select
					id={id}
					name={name}
					disabled={disabled}
					form={form}
					value={value}
					multiple={multiple}
					required={required}
					size={size}
					class={`peer ${selectClasses}`.trim()}
				>
					{options.map((opt) => (
						<option
							value={opt.value}
							{...(isControlledSelect
								? {}
								: opt.selected
									? { selected: true }
									: {})}
						>
							{opt.label}
						</option>
					))}
				</select>
				<svg
					class="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground peer-disabled:opacity-50"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M6 9l6 6 6-6" />
				</svg>
			</div>
		)
	}
}
