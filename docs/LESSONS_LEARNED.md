# Lessons learned

A running log of debugging discoveries in this repo that took real
investigation to uncover — captured so the next person (or agent) doesn't
have to rediscover them from scratch.

This file is for **surprising framework/tooling behavior that cost real
debugging time**, not prescriptive "how to build X" guidance — that stays in
the topic-specific docs (`UI_ARCHITECTURE_GUIDELINES.md`,
`REMIX_V3_PACKAGES.md`, `BIOME_RULES.md`, …). Add a new entry whenever a bug
turns out to have a non-obvious root cause that could plausibly bite someone
else the same way.

## A stale branch's CI failure can be the base branch's fault, not the diff's

GitHub Actions' `pull_request` trigger tests a **merge of the PR branch into
the current base branch**, not the PR branch alone. A long-lived branch that
never rebased/merged `main` can pass every local check yet fail CI for
reasons that have nothing to do with its own diff — CI is actually running
the PR's source files against `main`'s *current* `package.json` /
`package-lock.json` and every other file the PR never touched.

**Symptom:** a `ERR_PACKAGE_PATH_NOT_EXPORTED` (or similarly "impossible"
resolution error) for a package specifier that works fine locally, that only
reproduces in CI, and that a fresh local `npm ci` under the exact CI Node
version still doesn't reproduce.

**Diagnostic:** `git log <pr-branch>..origin/main --oneline | wc -l`, and
compare `main`'s `package.json` against the branch's own
(`git show origin/main:package.json` vs. the branch's) for the dependency in
question. If `main` bumped it to a breaking version since the branch was
opened, that's the real failure — not the PR's code.

**Fix:** merge (or rebase) `main` into the branch, then re-validate against
the *merged* state, not just the original diff.

## `remix/ui`'s `navigate()` preserves "live" form-control state on purpose — don't use it for a full restore/redirect

`navigate()` patches the live DOM in place rather than doing a real browser
navigation. Its diffing (`shouldPreserveLiveAttribute` in
`@remix-run/ui`'s `diff-dom.ts`) deliberately skips overwriting `checked`,
`value`, and `selected` whenever the *live* DOM's current value differs from
the freshly rendered target — the framework's heuristic for not clobbering
an in-progress user edit during a background re-render (a Frame update
elsewhere on the page shouldn't blank out a form the user is filling in).

That heuristic backfires for a one-shot full-page "restore" redirect (e.g.
restoring saved filters from `localStorage` on load): the divergence between
the current DOM and the target DOM isn't a user edit, it's just the previous
page's default state — but `navigate()` can't tell the difference, so it
silently leaves form controls (dropdowns, checkboxes, text inputs) showing
stale values even though the URL and everything else on the page updates
correctly.

Reproduced directly against the real runtime: after
`navigate(url, {history:'replace'})` to a page with a different
`<option selected>`, the live `<select>`'s `.value` and the option's
`.selected` both stayed unchanged; `window.location.replace(url)` to the
same URL updated both correctly, since a full navigation parses a fresh
document instead of patching the old one.

**Rule of thumb:** use `navigate()` only for the app's ongoing Frame-driven
partial updates (where preserving unrelated in-progress edits elsewhere on
the page is the point). For a genuine one-shot full-page redirect, use
`window.location.replace()` / `.assign()` instead.

## `SelectInput`'s controlled `value` only works if you also mark the matching `<option selected>`

A server-rendered `<select>` has no `value` **content attribute** a browser
honors on initial HTML parse — `value` as a JSX/React-style prop is a
convention those frameworks translate into DOM state during client-side
rendering, but this app's server renderer (`@remix-run/ui`'s
`renderToString` / `renderToStream`) does not special-case it: it serializes
`value={...}` as a literal (and meaningless) HTML attribute on `<select>`,
and does nothing to the `<option>` elements. Only `<option selected>`
actually picks the initial selection when a browser parses fresh HTML.

`SelectInput` (`app/components/forms/select-input.tsx`) had exactly this
bug: the controlled path explicitly skipped setting `selected` on any
option, on the assumption that `value` alone would work. Result: any page
load with a pre-selected filter value showed the *first* option instead,
regardless of what `value` said.

This went unnoticed for a long time because the normal interaction (click
the dropdown, choose a value, submit) never re-renders the `<select>` from
scratch — the browser's own live DOM state from the user's click is what's
visible, and the filter's *results* update correctly via the URL/Frame
regardless of what the dropdown displays. The bug only shows up when a page
loads fresh with a filter value that's supposed to already be selected (a
bookmarked/shared filtered URL, or a restore-from-`localStorage` redirect) —
nothing in this codebase exercised that path until the catalog
filter-persistence feature.

**Rule of thumb:** any server-rendered `<select>` (or similar element where
"selected/checked" is real form state, not just a display attribute) needs
that state expressed as the literal attribute the HTML spec defines
(`<option selected>`, `<input checked>`), not just a prop with the
display-only name. Test the *SSR output string* directly for controlled form
elements (`renderToString(...)`), not just typecheck/behavior at the JSX
call site — the rendered string is what a browser actually receives.

## A green `npm run typecheck` says nothing about the client islands

`tsconfig.json`'s `include` is `["server.ts", "app/**/*.ts", "app/**/*.tsx",
"mcp/**/*.ts"]` — note the absence of `.js`. Every browser island in this repo
(`app/entry.js`, the `*.component.js` files) is therefore **invisible to
`tsc`**, even though those files import from `remix/ui` just like the server
code does. The `.component.d.ts` siblings only type the island for its
*importer*; they do not typecheck the island's own body.

The consequence bites hardest on framework upgrades. During the Remix
`beta.0` → `3.0.0-rc.2` trial, `npm run typecheck` reached **0 errors** while
two genuine breakages sat in the client layer: `addEventListeners` had been
removed from `@remix-run/ui` entirely, and `resolveFrame`'s signature had
changed from `(src, signal, target)` to `(src, options)` — so `app/entry.js`
was passing an `AbortSignal` positionally into what is now an options object.

The two fail very differently, which is the real trap:

- The **removed export** fails loudly, but only at module *link* time —
  `SyntaxError: The requested module 'remix/ui' does not provide an export
  named 'addEventListeners'`. The test suite catches it, because importing the
  router pulls the islands in transitively.
- The **changed signature** fails **silently and only in a browser**. It is
  still valid JavaScript, nothing throws at import, and no test exercises it,
  because frame resolution only runs against a live DOM.

**Rule of thumb:** treat a clean typecheck as covering the server half of this
app and nothing more. When a `remix/ui` API changes, grep the `.js` islands by
hand (`grep -rn "from 'remix/ui'" app --include=*.js`) and diff the upstream
type surface for the exact symbols they import — a signature change in an
untyped call site has no automated signal anywhere in this repo, so the manual
browser pass is the only thing standing between it and production.
