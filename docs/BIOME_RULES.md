# Biome Formatting & Lint Rules

This project uses [Biome](https://biomejs.dev/) v2.4.7 for formatting and linting. Run `npm run check` before committing. The config lives in `biome.json`.

## Quick Checklist

Before submitting any JS/TS code, verify:

- [ ] Indentation uses **tabs**, not spaces
- [ ] Strings use **single quotes**
- [ ] Statements have **no trailing semicolons** (only where ASI requires them)
- [ ] Every declared variable and import is **used**
- [ ] Comparisons use `===` / `!==`, never `==` / `!=`
- [ ] No `var` declarations — use `const` or `let`
- [ ] `const` is used unless the binding is reassigned
- [ ] No `any` types — use concrete TypeScript types
- [ ] No non-null assertions (`foo!`) — use type guards instead
- [ ] Template literals used instead of string concatenation
- [ ] No `debugger` statements
- [ ] Type-only imports use `import type`
- [ ] `<button>` elements have an explicit `type` attribute
- [ ] `<img>` elements have an `alt` attribute
- [ ] `<a>` elements have text content and a valid `href`

---

## Formatter Configuration

| Setting | Value |
|---|---|
| Indent style | `tab` |
| Quote style (JS/TS) | `single` |
| Semicolons | `asNeeded` — omit unless required |
| Import organisation | Auto (Biome assist) |

### Examples

```ts
// ✅ correct
import { foo } from './foo.ts'
import type { Bar } from './bar.ts'

const message = 'hello world'
const greeting = `Hello, ${name}!`

function greet(name: string) {
	return `Hi ${name}`
}
```

```ts
// ❌ wrong — spaces, double quotes, trailing semicolons
import { foo } from "./foo.ts";

const message = "hello world";
```

---

## Lint Rules

The full `recommended` ruleset is enabled. The rules below are the ones most likely to affect generated code.

### Correctness

| Rule | Severity | What it prevents |
|---|---|---|
| `correctness/noUnusedVariables` | warn | Variables that are declared but never read |
| `correctness/noUnusedImports` | warn | Imports that are never referenced |
| `correctness/noUnreachable` | error | Code after `return`, `throw`, etc. |
| `correctness/noUnsafeFinally` | error | `return`/`throw` inside `finally` that swallows errors |

**Practical rules:**
- Remove every import you don't use.
- Remove every variable you declare but don't read.
- Don't write code after an unconditional `return`.

### Suspicious

| Rule | Severity | What it prevents |
|---|---|---|
| `suspicious/noDoubleEquals` | error | `==` and `!=` — use `===` / `!==` |
| `suspicious/noDebugger` | error | `debugger` statements left in code |
| `suspicious/noExplicitAny` | warn | `any` type annotation |
| `suspicious/noFallthroughSwitchClause` | error | Unintentional fall-through in `switch` |
| `suspicious/noShadowRestrictedNames` | error | Redefining globals like `undefined`, `NaN`, `Infinity` |
| `suspicious/noGlobalIsFinite` | warn | Global `isFinite()` — use `Number.isFinite()` |

**Practical rules:**
- Always use `===` for equality checks. The only allowed exception is `== null` (checks both `null` and `undefined`).
- Never leave `debugger` in committed code.
- Avoid `any` — prefer `unknown` and narrow with type guards when the type is truly unknown.
- Use `Number.isFinite()` and `Number.isNaN()` instead of the global versions.

### Style

| Rule | Severity | What it prevents |
|---|---|---|
| `style/useConst` | warn | `let` for bindings that are never reassigned |
| `style/useTemplate` | info | String concatenation with `+` — use template literals |
| `style/noNonNullAssertion` | warn | The `!` non-null assertion operator |

**Practical rules:**
- Declare with `const` by default; only use `let` when the variable is reassigned later.
- Concatenate dynamic strings with template literals: `` `Hello ${name}` `` not `'Hello ' + name`.
- Instead of `foo!.bar`, use a type guard: `if (foo) foo.bar` or restructure so the type is non-nullable.

### TypeScript

| Pattern | Rule |
|---|---|
| Use `import type` for type-only imports | Helps tree-shaking and avoids circular-dep issues |
| Avoid `any` | `suspicious/noExplicitAny` |
| Avoid `!` non-null assertions | `style/noNonNullAssertion` |

```ts
// ✅ correct
import type { Session } from 'remix/session'

function getUser(session: Session | null): string {
	if (!session) return 'guest'
	return session.login
}
```

```ts
// ❌ wrong
import { Session } from 'remix/session'       // missing `type`

const login = (session as any).login           // uses any
const login2 = session!.login                  // non-null assertion
```

### Accessibility (a11y)

These rules fire on HTML strings generated via the `html` template tag and on any JSX/TSX files.

| Rule | Severity | What it requires |
|---|---|---|
| `a11y/useAltText` | error | `<img>` must have `alt` |
| `a11y/useAnchorContent` | error | `<a>` must have visible text content |
| `a11y/useButtonType` | error | `<button>` must have explicit `type="button"`, `type="submit"`, or `type="reset"` |
| `a11y/useHtmlLang` | error | `<html>` must have a `lang` attribute |
| `a11y/useValidAnchor` | error | `<a>` must have a valid `href` |
| `a11y/useAriaPropsForRole` | error | ARIA props must match the element's role |
| `a11y/useValidAriaRole` | error | `role` must be a valid ARIA role |
| `a11y/noPositiveTabindex` | error | `tabindex` must be `0` or `-1` |
| `a11y/noHeaderScope` | error | `scope` on `<th>` must be valid |
| `a11y/useKeyWithClickEvents` | error | Elements with `onClick` need keyboard equivalents |
| `a11y/useMediaCaption` | error | `<video>`/`<audio>` must have captions |

**Practical rules:**
- Every `<button>` needs `type="button"` (or `type="submit"` / `type="reset"`).
- Every `<img>` needs `alt="…"` (use `alt=""` for decorative images).
- Every `<a>` needs meaningful text content and a real `href` (not `href="#"`).
- The root `<html>` element needs `lang="en"` (or appropriate locale).

---

## CSS Override

`noUnknownAtRules` is **disabled** for `.css` files. This allows Tailwind directives (`@tailwind`, `@apply`, `@layer`, `@config`) without lint errors.

---

## Excluded Files

HTML files inside `app/components/` and `app/features/` are excluded from both formatting and linting (they are Biome-ignored via the `files.includes` config). All other files are checked.

---

## Running Checks

```bash
npm run check     # format + lint together (recommended before committing)
npm run lint      # lint only
npm run format    # format only
```

Biome respects `.gitignore`, so `node_modules` and other ignored paths are skipped automatically.
