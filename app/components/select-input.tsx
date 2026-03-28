import type { Handle } from 'remix/component'

const controlClasses =
	'w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm'

const selectWithChevronClasses = 'cursor-pointer appearance-none pr-10'

/** Mirrors `<select>` attributes; `options` replaces `<option>` children. */
type SelectInputProps = {
	id: string
	name: string
	options: { value: string; label: string; selected?: boolean }[]
	disabled?: boolean
	form?: string
	value?: string | number
	multiple?: boolean
	required?: boolean
	size?: number
	class?: string
}

/**
 * Server-rendered select (label is composed separately).
 */
export function SelectInput(_handle: Handle, _setup?: unknown) {
	return (props: SelectInputProps) => {
		const {
			class: classProp,
			options,
			id,
			name,
			disabled,
			form,
			value,
			multiple,
			required,
			size,
		} = props
		const selectClasses =
			`${controlClasses} ${selectWithChevronClasses} ${classProp ?? ''}`.trim()
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
						<option value={opt.value} selected={opt.selected}>
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
