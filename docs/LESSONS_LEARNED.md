# Lessons learned

A short log of things this repo learned the hard way — empirical discoveries
about how our dependencies actually behave, captured so nobody pays the same
debugging cost twice.

**The bar is deliberately high.** This file is only worth reading if every
entry earns its place, so a new entry must be something you *could not have
learned by reading* — not the repo's own config, not the library's docs. It
has to have been discovered by running the thing. Before adding one, check it
clears all four:

1. **Empirical.** You found it by reproducing against the real runtime or
   reading a dependency's source — not by reading `tsconfig.json`, our own
   docs, or the library's README.
2. **Misleading symptom.** The broken thing *looked* fine: checks passed, no
   error was thrown, or it failed only on a path nobody exercises. A loud,
   accurate error message is not a lesson.
3. **Non-obvious after the fact.** Someone who knows the symptom still would
   not guess the cause. If one sentence of explanation makes it obvious, it
   belongs in a code comment, not here.
4. **Changes future code.** It yields a rule you would apply again, not a
   fact you would look up once.

**Does not belong here,** however much time it cost:

- Documented behavior of a general tool (GitHub Actions, npm, git). Link the
  upstream docs from the relevant topic doc instead.
- Facts recoverable by reading this repo's own configuration.
- Prescriptive "how to build X" guidance — that stays in the topic-specific
  docs (`UI_ARCHITECTURE_GUIDELINES.md`, `REMIX_V3_PACKAGES.md`,
  `BIOME_RULES.md`, …).
- Version-migration breakage, which belongs in the relevant migration plan.

Prefer deleting a stale or weak entry over keeping it for completeness. Two
entries people trust beat ten they skim.

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

