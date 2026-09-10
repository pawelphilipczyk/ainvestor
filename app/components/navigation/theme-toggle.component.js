import { clientEntry, createElement } from 'remix/ui'
import { control } from 'remix/ui/toggle/primitives'

const DARK_CLASS = 'dark'
const THEME_STORAGE_KEY = 'theme'

/**
 * Dark mode is the server-rendered default (`<html class="dark">` in
 * `DocumentShell`); the inline `<head>` script may drop that class before
 * hydration when `localStorage.theme === 'light'`. Setup therefore reads the
 * live class on the client and the server-side default on the server, so the
 * rendered switch state matches the document either way.
 */
function readIsDark() {
	if (typeof document === 'undefined') return true
	return document.documentElement.classList.contains(DARK_CLASS)
}

function applyIsDark(isDark) {
	if (typeof document === 'undefined') return
	document.documentElement.classList.toggle(DARK_CLASS, isDark)
	document.defaultView?.localStorage.setItem(
		THEME_STORAGE_KEY,
		isDark ? 'dark' : 'light',
	)
}

/** Sun: visible in light mode, rotated and scaled out by the `dark:` variants. */
function sunIcon() {
	return createElement(
		'svg',
		{
			class:
				'h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0',
			xmlns: 'http://www.w3.org/2000/svg',
			viewBox: '0 0 24 24',
			fill: 'none',
			stroke: 'currentColor',
			'stroke-width': '2',
			'stroke-linecap': 'round',
			'stroke-linejoin': 'round',
			'aria-hidden': 'true',
		},
		createElement('circle', { cx: '12', cy: '12', r: '4' }),
		createElement('path', {
			d: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
		}),
	)
}

/** Moon: mirrors {@link sunIcon}, visible in dark mode. */
function moonIcon() {
	return createElement(
		'svg',
		{
			class:
				'absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100',
			xmlns: 'http://www.w3.org/2000/svg',
			viewBox: '0 0 24 24',
			fill: 'none',
			stroke: 'currentColor',
			'stroke-width': '2',
			'stroke-linecap': 'round',
			'stroke-linejoin': 'round',
			'aria-hidden': 'true',
		},
		createElement('path', {
			d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
		}),
	)
}

/**
 * Dark-mode switch. Renders its own markup so `toggle.control` — an element
 * mixin — can own the interaction contract (`role="switch"`, `aria-checked`,
 * `data-state`, click and Space activation) instead of the hand-rolled
 * document-level click delegation this component used before.
 *
 * The label is a prop because the render function also runs in the browser,
 * where `t()` (request-scoped, server-only) is not available.
 *
 * Known wrinkle, verified in Chromium: `toggle.control` hands the renderer a
 * boolean `aria-checked`, and the server renderer emits a `true` boolean as a
 * bare attribute — so the streamed HTML carries `aria-checked=""`, which ARIA
 * treats as the `switch` default (`false`) until `entry.js` hydrates and
 * rewrites it to `"true"`. It self-corrects on hydration and the control is
 * inert without JavaScript either way, so it is accepted rather than patched
 * around; patching it would mean re-hand-rolling what the mixin owns.
 */
export const ThemeToggle = clientEntry(
	'/components/navigation/theme-toggle.component.js#ThemeToggle',
	function ThemeToggle(handle) {
		let isDark = readIsDark()

		return () =>
			createElement(
				'button',
				{
					'data-theme-toggle': true,
					type: 'button',
					'aria-label': handle.props.label,
					class:
						'relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
					mix: [
						control({
							checked: isDark,
							onCheckedChange(nextIsDark) {
								isDark = nextIsDark
								applyIsDark(nextIsDark)
								void handle.update()
							},
						}),
					],
				},
				sunIcon(),
				moonIcon(),
			)
	},
)
