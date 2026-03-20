import type { Handle } from 'remix/component'

const controlClasses =
	'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const selectDecorationClasses =
	"cursor-pointer appearance-none bg-no-repeat pr-8 [background-image:url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%226b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%2F%3E%3C%2Fsvg%3E')] [background-position:right_0.5rem_center] [background-size:1.25rem]"

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
			`${controlClasses} ${selectDecorationClasses} ${classProp ?? ''}`.trim()
		return (
			<select
				id={id}
				name={name}
				disabled={disabled}
				form={form}
				value={value}
				multiple={multiple}
				required={required}
				size={size}
				class={selectClasses}
			>
				{options.map((opt) => (
					<option value={opt.value} selected={opt.selected}>
						{opt.label}
					</option>
				))}
			</select>
		)
	}
}
